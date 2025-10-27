// =========================================
// BOOKEO RATE LIMITING CON CLOUD TASKS
// Lógica progresiva TARDE: 1 guía=T2, 2=T2+T1, 3+=T2+T1+T3
// Transacciones atómicas para prevenir webhooks duplicados
// UTF-8 fix: usa after.slot de Firestore (event.params corrompe)
// Emails solo para "sin cobertura" (no para restauración)
// Trigger adicional: detecta cambios estado activo/inactivo de guías
// =========================================
const { onTaskDispatched } = require("firebase-functions/v2/tasks");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { logger } = require("firebase-functions/v2");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getFunctions } = require("firebase-admin/functions");
const { defineSecret } = require('firebase-functions/params');
const sgMail = require('@sendgrid/mail');
const axios = require('axios');
const crypto = require('crypto');

// =========================================
// SECRETS Y CONFIGURACIÓN
// =========================================
const sendgridKey = defineSecret('SENDGRID_API_KEY');
const ZAPIER_WEBHOOK_URL = process.env.ZAPIER_WEBHOOK_URL;
const MANAGER_EMAIL = process.env.MANAGER_EMAIL || 'madrid@spainfoodsherpas.com';
const FROM_EMAIL = 'madrid@spainfoodsherpas.com';
const FROM_NAME = 'Spain Food Sherpas';
const APP_URL = process.env.APP_URL || 'https://calendar-app-tours.web.app';

const SLOT_TIMES = {
  'MAÑANA': '12:00',
  'T1': '17:15',
  'T2': '18:15',
  'T3': '19:15'
};

const DEBOUNCE_SECONDS = 30;
const MAX_CONCURRENT_REQUESTS = 6;
const MAX_REQUESTS_PER_SECOND = 1.5;

// =========================================
// WORKER FUNCTION - Procesa webhooks Bookeo
// =========================================
exports.bookeoWebhookWorker = onTaskDispatched({
  retryConfig: {
    maxAttempts: 5,
    minBackoffSeconds: 60,
    maxBackoffSeconds: 3600,
    maxDoublings: 3
  },
  rateLimits: {
    maxConcurrentDispatches: MAX_CONCURRENT_REQUESTS,
    maxDispatchesPerSecond: MAX_REQUESTS_PER_SECOND
  },
  memory: "512MB",
  timeoutSeconds: 180,
  region: "us-central1",
  secrets: [sendgridKey]
}, async (req) => {
  const { action, payload, shiftId, attemptNumber, emailData } = req.data;
 
  logger.info("Procesando webhook Bookeo", {
    action,
    shiftId,
    attempt: attemptNumber
  });

  const db = getFirestore();
 
  try {
    const [fecha, slot] = shiftId.split('_');

    const response = await axios.post(ZAPIER_WEBHOOK_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Firebase-Source': 'calendar-app-tours'
      },
      timeout: 30000
    });
   
    logger.info(`Webhook ${action} exitoso`, { fecha, slot, status: response.status });
   
    if (emailData) {
      sgMail.setApiKey(sendgridKey.value());
      await sgMail.send({
        to: MANAGER_EMAIL,
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject: emailData.subject,
        html: emailData.html
      });
     
      logger.info('Email enviado al manager', { subject: emailData.subject });
    }
   
    if (action === 'BLOQUEAR') {
      const bookeoId = response.data?.id;
     
      if (bookeoId) {
        await db.collection('bookeo_blocks').doc(shiftId).set({
          fecha,
          slot,
          bookeoId,
          status: 'BLOCKED',
          createdAt: FieldValue.serverTimestamp(),
          webhookResponse: response.data
        });
       
        logger.info('BookeoId guardado', { shiftId, bookeoId });
      } else {
        logger.warn('Zapier no retornó bookeoId', {
          shiftId,
          responseData: response.data
        });
       
        await db.collection('bookeo_blocks').doc(shiftId).set({
          fecha,
          slot,
          bookeoId: null,
          status: 'BLOCKED',
          warning: 'bookeoId no retornado por Zapier',
          createdAt: FieldValue.serverTimestamp(),
          webhookResponse: response.data
        });
      }
    } else if (action === 'DESBLOQUEAR') {
      await db.collection('bookeo_blocks').doc(shiftId).update({
        status: 'UNBLOCKED',
        unlockedAt: FieldValue.serverTimestamp(),
        webhookResponse: response.data
      });
    }
   
    await db.collection('webhookLogs').add({
      shiftId,
      action,
      payload,
      responseStatus: response.status,
      responseData: response.data,
      attempts: attemptNumber,
      completedAt: FieldValue.serverTimestamp()
    });
   
    return { success: true, action, responseStatus: response.status };
   
  } catch (error) {
    logger.error(`Webhook ${action} falló`, {
      shiftId,
      error: error.message,
      attempt: attemptNumber
    });
   
    await db.collection('webhookLogs').add({
      shiftId,
      action,
      payload,
      error: error.message,
      attempts: attemptNumber,
      failedAt: FieldValue.serverTimestamp()
    });
   
    if (attemptNumber >= 5 && emailData) {
      try {
        sgMail.setApiKey(sendgridKey.value());
        await sgMail.send({
          to: MANAGER_EMAIL,
          from: { email: FROM_EMAIL, name: FROM_NAME },
          subject: `⚠️ ERROR ${action} Bookeo: ${shiftId}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #dc2626;">⚠️ Error Sincronización Bookeo</h2>
              <p><strong>Acción:</strong> ${action}</p>
              <p><strong>Shift:</strong> ${shiftId}</p>
              <p><strong>Error:</strong> ${error.message}</p>
              <p><strong>Intentos:</strong> ${attemptNumber}</p>
              <p style="color: #dc2626; font-weight: bold;">ACCIÓN REQUERIDA: Revisar manualmente en Bookeo</p>
            </div>
          `
        });
      } catch (emailError) {
        logger.error('Error enviando email de fallo crítico', { error: emailError.message });
      }
    }
   
    throw error;
  }
});

// =========================================
// TRIGGER - Detecta cambios en estado de guías
// =========================================
exports.onGuideStatusChange = onDocumentUpdated({
  document: "guides/{guideId}",
  region: "us-central1"
}, async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  
  if (before.estado !== after.estado) {
    const db = getFirestore();
    const guideId = event.params.guideId;
    const guideName = after.nombre || guideId;
    
    logger.info('🔄 Cambio estado guía', {
      guideId,
      guideName,
      estadoAntes: before.estado,
      estadoDespues: after.estado
    });
    
    try {
      const shiftsSnapshot = await db.collection('guides')
        .doc(guideId)
        .collection('shifts')
        .get();
      
      const fechasAfectadas = new Set();
      shiftsSnapshot.docs.forEach(doc => {
        const [fecha] = doc.id.split('_');
        if (fecha) fechasAfectadas.add(fecha);
      });
      
      logger.info('Invalidando cache estado', {
        guideId,
        fechasAfectadas: Array.from(fechasAfectadas).length
      });
      
      for (const fecha of fechasAfectadas) {
        await db.collection('bookeo_blocks').doc(`${fecha}_MAÑANA_STATE`).delete();
        await db.collection('bookeo_blocks').doc(`${fecha}_TARDE_STATE`).delete();
      }
      
      for (const fecha of fechasAfectadas) {
        const shiftRef = db.collection('guides')
          .doc(guideId)
          .collection('shifts')
          .doc(`${fecha}_MAÑANA`);
        
        const shiftDoc = await shiftRef.get();
        if (shiftDoc.exists) {
          await shiftRef.update({
            lastRecalculated: FieldValue.serverTimestamp()
          });
        }
      }
      
      logger.info('Recálculo forzado completado', {
        guideId,
        fechasAfectadas: Array.from(fechasAfectadas).length
      });
      
    } catch (error) {
      logger.error('Error en onGuideStatusChange', {
        guideId,
        error: error.message,
        stack: error.stack
      });
    }
  }
});

// =========================================
// TRIGGER - Lógica agregación + encolar webhooks
// =========================================
exports.enqueueBookeoWebhook = onDocumentUpdated({
  document: "guides/{guideId}/shifts/{shiftId}",
  region: "us-central1",
  secrets: [sendgridKey]
}, async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const shiftId = event.params.shiftId;
 
  const [fecha] = shiftId.split('_');
  const slot = after.slot;

  logger.info('🔔 TRIGGER ejecutado', { 
    shiftId, 
    fecha,
    slot,
    estadoAntes: before.estado, 
    estadoDespues: after.estado 
  });
 
  if (!fecha || !slot) {
    logger.warn('ShiftId inválido', { shiftId, slot });
    return;
  }
 
  if (before.estado === after.estado) {
    logger.info('Estado sin cambios - skip', { shiftId, estado: after.estado });
    return;
  }
 
  const db = getFirestore();
 
  try {
    const guidesSnapshot = await db.collection('guides')
      .where('estado', '==', 'activo')
      .get();
   
    const totalGuides = guidesSnapshot.size;
   
    if (totalGuides === 0) {
      logger.warn('No hay guías activos', { fecha, slot });
      return;
    }
   
    // =========================================
    // LÓGICA MAÑANA
    // =========================================
    if (slot === 'MAÑANA') {
      const mananaShiftId = `${fecha}_MAÑANA`;
      let unavailableCount = 0;
     
      for (const guideDoc of guidesSnapshot.docs) {
        const shiftDoc = await db.collection('guides')
          .doc(guideDoc.id)
          .collection('shifts')
          .doc(mananaShiftId)
          .get();
       
        if (shiftDoc.exists && shiftDoc.data().estado === 'NO_DISPONIBLE') {
          unavailableCount++;
        }
      }
     
      logger.info('Estado MAÑANA', {
        fecha,
        totalGuides,
        unavailableCount
      });
     
      const stateHash = calculateStateHash({
        totalGuides,
        unavailableCount
      });
      const stateDocId = `${fecha}_MAÑANA_STATE`;
     
      const shouldProcess = await db.runTransaction(async (transaction) => {
        const stateDocRef = db.collection('bookeo_blocks').doc(stateDocId);
        const stateDoc = await transaction.get(stateDocRef);
       
        if (stateDoc.exists && stateDoc.data().lastHash === stateHash) {
          logger.info('Estado MAÑANA sin cambios - skip webhook', { fecha, stateHash });
          return false;
        }
       
        transaction.set(stateDocRef, {
          lastHash: stateHash,
          lastProcessed: FieldValue.serverTimestamp(),
          totalGuides,
          unavailableCount
        });
       
        return true;
      });
     
      if (!shouldProcess) {
        return;
      }
     
      const blockDoc = await db.collection('bookeo_blocks').doc(mananaShiftId).get();
      const existingBookeoId = blockDoc.exists ? blockDoc.data().bookeoId : null;
      const isBlocked = blockDoc.exists && blockDoc.data().status === 'BLOCKED';
      const allUnavailable = unavailableCount === totalGuides;
     
      if (allUnavailable && !isBlocked) {
        logger.warn('🚫 MAÑANA debe bloquearse', { fecha, unavailableCount, totalGuides });
       
        await enqueueWebhook(db, {
          action: 'BLOQUEAR',
          shiftId: mananaShiftId,
          payload: {
            action: 'BLOQUEAR',
            startDate: fecha,
            startTime: SLOT_TIMES['MAÑANA'],
            slot: 'MAÑANA',
            timestamp: new Date().toISOString()
          },
          emailData: {
            subject: `🚫 Sin guías disponibles: ${fecha} MAÑANA`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #dc2626;">🚫 MAÑANA Sin Cobertura</h2>
                <p><strong>Fecha:</strong> ${fecha}</p>
                <p><strong>Estado:</strong> Todos los guías (${totalGuides}) tienen MAÑANA NO_DISPONIBLE</p>
              </div>
            `
          }
        });
       
        await db.collection('notifications').add({
          tipo: 'BOOKEO_BLOCK',
          fecha,
          slot: 'MAÑANA',
          totalGuides,
          unavailableCount,
          action: 'BLOQUEAR',
          createdAt: FieldValue.serverTimestamp()
        });
      }
      else if (!allUnavailable && isBlocked) {
        logger.warn('✅ MAÑANA debe desbloquearse', {
          fecha,
          unavailableCount,
          totalGuides,
          bookeoId: existingBookeoId
        });
       
        await enqueueWebhook(db, {
          action: 'DESBLOQUEAR',
          shiftId: mananaShiftId,
          payload: {
            action: 'DESBLOQUEAR',
            bookeoId: existingBookeoId,
            startDate: fecha,
            startTime: SLOT_TIMES['MAÑANA'],
            slot: 'MAÑANA',
            timestamp: new Date().toISOString()
          },
          emailData: null
        });
       
        await db.collection('notifications').add({
          tipo: 'BOOKEO_UNBLOCK',
          fecha,
          slot: 'MAÑANA',
          totalGuides,
          unavailableCount,
          availableCount: totalGuides - unavailableCount,
          action: 'DESBLOQUEAR',
          bookeoId: existingBookeoId,
          createdAt: FieldValue.serverTimestamp()
        });
      }
      else if (allUnavailable && isBlocked) {
        logger.info('MAÑANA ya bloqueado, skip webhook', { fecha, bookeoId: existingBookeoId });
      }
    }
   
    // =========================================
    // LÓGICA TARDE
    // =========================================
    else if (['T1', 'T2', 'T3'].includes(slot)) {
      const tardeSlotsCount = { T1: 0, T2: 0, T3: 0 };
     
      for (const guideDoc of guidesSnapshot.docs) {
        for (const tardeSlot of ['T1', 'T2', 'T3']) {
          const tardeShiftId = `${fecha}_${tardeSlot}`;
          const shiftDoc = await db.collection('guides')
            .doc(guideDoc.id)
            .collection('shifts')
            .doc(tardeShiftId)
            .get();
         
          if (shiftDoc.exists && shiftDoc.data().estado === 'NO_DISPONIBLE') {
            tardeSlotsCount[tardeSlot]++;
          }
        }
      }
     
      let guidesDisponiblesTarde = 0;
     
      for (const guideDoc of guidesSnapshot.docs) {
        let tieneTardeLibre = false;
       
        for (const tardeSlot of ['T1', 'T2', 'T3']) {
          const tardeShiftId = `${fecha}_${tardeSlot}`;
          const shiftDoc = await db.collection('guides')
            .doc(guideDoc.id)
            .collection('shifts')
            .doc(tardeShiftId)
            .get();
         
          if (shiftDoc.exists && shiftDoc.data().estado !== 'NO_DISPONIBLE') {
            tieneTardeLibre = true;
            break;
          }
        }
       
        if (tieneTardeLibre) {
          guidesDisponiblesTarde++;
        }
      }
     
      logger.info('Estado TARDE', {
        fecha,
        totalGuides,
        guidesDisponiblesTarde,
        t1Unavailable: tardeSlotsCount['T1'],
        t2Unavailable: tardeSlotsCount['T2'],
        t3Unavailable: tardeSlotsCount['T3']
      });
     
      const stateHash = calculateStateHash({
        totalGuides,
        guidesDisponiblesTarde,
        t1: tardeSlotsCount['T1'],
        t2: tardeSlotsCount['T2'],
        t3: tardeSlotsCount['T3']
      });
      const stateDocId = `${fecha}_TARDE_STATE`;
     
      const shouldProcess = await db.runTransaction(async (transaction) => {
        const stateDocRef = db.collection('bookeo_blocks').doc(stateDocId);
        const stateDoc = await transaction.get(stateDocRef);
       
        if (stateDoc.exists && stateDoc.data().lastHash === stateHash) {
          logger.info('Estado TARDE sin cambios - skip webhook', { fecha, stateHash });
          return false;
        }
       
        transaction.set(stateDocRef, {
          lastHash: stateHash,
          lastProcessed: FieldValue.serverTimestamp(),
          totalGuides,
          guidesDisponiblesTarde,
          tardeSlotsCount
        });
       
        return true;
      });
     
      if (!shouldProcess) {
        return;
      }
     
      const estadoDeseado = determinarEstadoTarde(guidesDisponiblesTarde);
      
      if (guidesDisponiblesTarde === 0) {
        const emailStateDoc = await db.collection('bookeo_blocks').doc(`${fecha}_TARDE_EMAIL_STATE`).get();
        const lastEmailGuides = emailStateDoc.exists ? emailStateDoc.data().guidesDisponiblesTarde : null;
        
        if (lastEmailGuides !== 0) {
          await enqueueWebhook(db, {
            action: 'EMAIL_TARDE_SIN_COBERTURA',
            shiftId: `${fecha}_TARDE`,
            payload: {
              action: 'NOTIFICATION_ONLY',
              fecha,
              timestamp: new Date().toISOString()
            },
            emailData: {
              subject: `🚫 Sin guías disponibles: ${fecha} TARDE`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #dc2626;">🚫 TARDE Sin Cobertura</h2>
                  <p><strong>Fecha:</strong> ${fecha}</p>
                  <p><strong>Turnos:</strong> T1, T2, T3 bloqueados</p>
                  <p><strong>Estado:</strong> Todos los guías (${totalGuides}) tienen TARDE NO_DISPONIBLE</p>
                </div>
              `
            }
          });
          
          await db.collection('bookeo_blocks').doc(`${fecha}_TARDE_EMAIL_STATE`).set({
            guidesDisponiblesTarde: 0,
            emailSentAt: FieldValue.serverTimestamp()
          });
        }
      } else {
        const emailStateDoc = await db.collection('bookeo_blocks').doc(`${fecha}_TARDE_EMAIL_STATE`).get();
        if (emailStateDoc.exists && emailStateDoc.data().guidesDisponiblesTarde === 0) {
          await db.collection('bookeo_blocks').doc(`${fecha}_TARDE_EMAIL_STATE`).delete();
        }
      }
     
      for (const tardeSlot of ['T1', 'T2', 'T3']) {
        const tardeShiftId = `${fecha}_${tardeSlot}`;
        const blockDoc = await db.collection('bookeo_blocks').doc(tardeShiftId).get();
        const existingBookeoId = blockDoc.exists ? blockDoc.data().bookeoId : null;
        const isBlocked = blockDoc.exists && blockDoc.data().status === 'BLOCKED';
        const deseaBloqueado = !estadoDeseado[tardeSlot];
       
        if (deseaBloqueado && !isBlocked) {
          logger.warn(`🚫 ${tardeSlot} debe bloquearse`, { fecha, guidesDisponiblesTarde });
         
          await enqueueWebhook(db, {
            action: 'BLOQUEAR',
            shiftId: tardeShiftId,
            payload: {
              action: 'BLOQUEAR',
              startDate: fecha,
              startTime: SLOT_TIMES[tardeSlot],
              slot: tardeSlot,
              timestamp: new Date().toISOString()
            },
            emailData: null
          });
         
          await db.collection('notifications').add({
            tipo: 'BOOKEO_BLOCK',
            fecha,
            slot: tardeSlot,
            totalGuides,
            guidesDisponiblesTarde,
            action: 'BLOQUEAR',
            createdAt: FieldValue.serverTimestamp()
          });
        }
        else if (!deseaBloqueado && isBlocked) {
          logger.warn(`✅ ${tardeSlot} debe desbloquearse`, {
            fecha,
            guidesDisponiblesTarde,
            bookeoId: existingBookeoId
          });
         
          await enqueueWebhook(db, {
            action: 'DESBLOQUEAR',
            shiftId: tardeShiftId,
            payload: {
              action: 'DESBLOQUEAR',
              bookeoId: existingBookeoId,
              startDate: fecha,
              startTime: SLOT_TIMES[tardeSlot],
              slot: tardeSlot,
              timestamp: new Date().toISOString()
            },
            emailData: null
          });
         
          await db.collection('notifications').add({
            tipo: 'BOOKEO_UNBLOCK',
            fecha,
            slot: tardeSlot,
            totalGuides,
            guidesDisponiblesTarde,
            action: 'DESBLOQUEAR',
            bookeoId: existingBookeoId,
            createdAt: FieldValue.serverTimestamp()
          });
        }
        else if (deseaBloqueado && isBlocked) {
          logger.info(`${tardeSlot} ya bloqueado, skip webhook`, { fecha, bookeoId: existingBookeoId });
        }
      }
    }
   
  } catch (error) {
    logger.error('Error en enqueueBookeoWebhook', {
      shiftId,
      error: error.message,
      stack: error.stack
    });
  }
});

// =========================================
// HELPERS
// =========================================

function calculateStateHash(stateObj) {
  const stateStr = JSON.stringify(stateObj);
  return crypto.createHash('md5').update(stateStr).digest('hex');
}

function determinarEstadoTarde(guidesDisponibles) {
  if (guidesDisponibles === 0) {
    return { T1: false, T2: false, T3: false };
  } else if (guidesDisponibles === 1) {
    return { T1: false, T2: true, T3: false };
  } else if (guidesDisponibles === 2) {
    return { T1: true, T2: true, T3: false };
  } else {
    return { T1: true, T2: true, T3: true };
  }
}

async function enqueueWebhook(db, { action, shiftId, payload, emailData }) {
  if (!ZAPIER_WEBHOOK_URL) {
    logger.warn('ZAPIER_WEBHOOK_URL no configurado', { shiftId });
    return;
  }
 
  try {
    const queue = getFunctions().taskQueue("locations/us-central1/functions/bookeoWebhookWorker");
   
    await queue.enqueue(
      {
        action,
        payload,
        shiftId,
        emailData: emailData || null,
        attemptNumber: 1
      },
      {
        scheduleDelaySeconds: DEBOUNCE_SECONDS,
        dispatchDeadlineSeconds: 300
      }
    );
   
    logger.info(`Webhook ${action} encolado`, { shiftId, delay: DEBOUNCE_SECONDS });
   
  } catch (queueError) {
    logger.error(`Error encolando webhook ${action}`, {
      shiftId,
      error: queueError.message
    });
   
    if (emailData) {
      try {
        sgMail.setApiKey(sendgridKey.value());
        await sgMail.send({
          to: MANAGER_EMAIL,
          from: { email: FROM_EMAIL, name: FROM_NAME },
          subject: `⚠️ ERROR ${action} Bookeo: ${shiftId}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #dc2626;">⚠️ Error al Encolar Webhook</h2>
              <p><strong>Shift:</strong> ${shiftId}</p>
              <p><strong>Acción:</strong> ${action}</p>
              <p><strong>Error:</strong> ${queueError.message}</p>
              <p style="color: #dc2626; font-weight: bold;">ACCIÓN REQUERIDA: Revisar manualmente en Bookeo</p>
            </div>
          `
        });
      } catch (emailError) {
        logger.error('Error enviando email de fallo queue', { error: emailError.message });
      }
    }
  }
}