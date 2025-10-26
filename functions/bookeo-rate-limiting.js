// =========================================
// BOOKEO RATE LIMITING CON CLOUD TASKS
// Lógica progresiva TARDE: 1 guía=T2, 2=T2+T1, 3+=T2+T1+T3
// =========================================
const { onTaskDispatched } = require("firebase-functions/v2/tasks");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { logger } = require("firebase-functions/v2");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getFunctions } = require("firebase-admin/functions");
const { defineSecret } = require('firebase-functions/params');
const sgMail = require('@sendgrid/mail');
const axios = require('axios');

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

    // Llamar a Bookeo vía Zapier
    const response = await axios.post(ZAPIER_WEBHOOK_URL, payload, {
      headers: { 
        'Content-Type': 'application/json',
        'X-Firebase-Source': 'calendar-app-tours'
      },
      timeout: 30000
    });
    
    logger.info(`Webhook ${action} exitoso`, { fecha, slot, status: response.status });
    
    // PRIORIDAD 1: Enviar email al manager
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
    
    // PRIORIDAD 2: Actualizar bookeo_blocks según acción
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
        logger.warn('Zapier no retornó bookeoId - bloqueo aplicado pero ID no guardado', { 
          shiftId, 
          responseData: response.data 
        });
        
        // Guardar sin bookeoId para auditoría
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
    
    // Log auditoría
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
    
    // Log error
    await db.collection('webhookLogs').add({
      shiftId,
      action,
      payload,
      error: error.message,
      attempts: attemptNumber,
      failedAt: FieldValue.serverTimestamp()
    });
    
    // Email error crítico solo en último intento
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
    
    throw error; // Reintento automático
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
  
  const [fecha, slot] = shiftId.split('_');
  
  if (!fecha || !slot) {
    logger.warn('ShiftId inválido', { shiftId });
    return;
  }
  
  // Solo si el estado cambió
  if (before.estado === after.estado) {
    return;
  }
  
  const db = getFirestore();
  
  try {
    // Contar guías activos
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
      
      logger.info('Estado MAÑANA', { fecha, totalGuides, unavailableCount });
      
      const blockDoc = await db.collection('bookeo_blocks').doc(mananaShiftId).get();
      const isBlocked = blockDoc.exists && blockDoc.data().status === 'BLOCKED';
      
      // 100% NO_DISPONIBLE → BLOQUEAR
      if (unavailableCount === totalGuides && !isBlocked) {
        logger.warn('🚫 MAÑANA 100% NO_DISPONIBLE - BLOQUEANDO', { fecha });
        
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
                <h2 style="color: #dc2626;">🚫 Turno MAÑANA Sin Cobertura</h2>
                <p><strong>Fecha:</strong> ${fecha}</p>
                <p><strong>Turno:</strong> MAÑANA (${SLOT_TIMES['MAÑANA']})</p>
                <p><strong>Estado:</strong> Todos los guías (${totalGuides}) están NO_DISPONIBLE</p>
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
      // <100% NO_DISPONIBLE Y había bloqueo → DESBLOQUEAR
      else if (unavailableCount < totalGuides && isBlocked) {
        const bookeoId = blockDoc.data().bookeoId;
        
        if (!bookeoId) {
          logger.error('BookeoId faltante para desbloqueo', { fecha, slot: 'MAÑANA' });
          return;
        }
        
        logger.warn('✅ MAÑANA guías disponibles - DESBLOQUEANDO', { fecha, unavailableCount, totalGuides, bookeoId });
        
        await enqueueWebhook(db, {
          action: 'DESBLOQUEAR',
          shiftId: mananaShiftId,
          payload: {
            action: 'DESBLOQUEAR',
            bookeoId: bookeoId,
            startDate: fecha,
            startTime: SLOT_TIMES['MAÑANA'],
            slot: 'MAÑANA',
            timestamp: new Date().toISOString()
          },
          emailData: {
            subject: `✅ Guías disponibles: ${fecha} MAÑANA`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #059669;">✅ Disponibilidad MAÑANA Restaurada</h2>
                <p><strong>Fecha:</strong> ${fecha}</p>
                <p><strong>Turno:</strong> MAÑANA (${SLOT_TIMES['MAÑANA']})</p>
                <p><strong>Estado:</strong> ${totalGuides - unavailableCount} de ${totalGuides} guías disponibles</p>
              </div>
            `
          }
        });
        
        await db.collection('notifications').add({
          tipo: 'BOOKEO_UNBLOCK',
          fecha,
          slot: 'MAÑANA',
          totalGuides,
          unavailableCount,
          availableCount: totalGuides - unavailableCount,
          bookeoId,
          action: 'DESBLOQUEAR',
          createdAt: FieldValue.serverTimestamp()
        });
      }
    }
    
    // =========================================
    // LÓGICA TARDE (T1, T2, T3)
    // =========================================
    else if (['T1', 'T2', 'T3'].includes(slot)) {
      // Contar NO_DISPONIBLE por cada slot de TARDE
      const tardeSlotsCount = {};
      let unavailableCountTarde = 0;
      
      for (const tardeSlot of ['T1', 'T2', 'T3']) {
        const tardeShiftId = `${fecha}_${tardeSlot}`;
        let unavailable = 0;
        
        for (const guideDoc of guidesSnapshot.docs) {
          const shiftDoc = await db.collection('guides')
            .doc(guideDoc.id)
            .collection('shifts')
            .doc(tardeShiftId)
            .get();
          
          if (shiftDoc.exists && shiftDoc.data().estado === 'NO_DISPONIBLE') {
            unavailable++;
          }
        }
        
        tardeSlotsCount[tardeSlot] = unavailable;
        
        // Si algún T tiene 100% NO_DISPONIBLE, contamos
        if (unavailable === totalGuides) {
          unavailableCountTarde++;
        }
      }
      
      // Calcular guías disponibles (que tienen TODA la TARDE libre)
      // Un guía está "disponible TARDE" si tiene al menos 1 T libre
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
      
      // Determinar estado deseado de cada T según disponibilidad
      const estadoDeseado = determinarEstadoTarde(guidesDisponiblesTarde);
      
      // Procesar cada T
      for (const tardeSlot of ['T1', 'T2', 'T3']) {
        const tardeShiftId = `${fecha}_${tardeSlot}`;
        const blockDoc = await db.collection('bookeo_blocks').doc(tardeShiftId).get();
        const isBlocked = blockDoc.exists && blockDoc.data().status === 'BLOCKED';
        const deseaBloqueado = !estadoDeseado[tardeSlot]; // true si debe estar bloqueado
        
        // BLOQUEAR si no está bloqueado pero debería estarlo
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
            emailData: (tardeSlot === 'T3' && guidesDisponiblesTarde === 0) ? {
              subject: `🚫 Sin guías disponibles: ${fecha} TARDE`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #dc2626;">🚫 TARDE Sin Cobertura</h2>
                  <p><strong>Fecha:</strong> ${fecha}</p>
                  <p><strong>Turnos:</strong> T1, T2, T3 bloqueados</p>
                  <p><strong>Estado:</strong> Todos los guías (${totalGuides}) tienen TARDE NO_DISPONIBLE</p>
                </div>
              `
            } : null
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
        // DESBLOQUEAR si está bloqueado pero debería estar libre
        else if (!deseaBloqueado && isBlocked) {
          const bookeoId = blockDoc.data().bookeoId;
          
          if (!bookeoId) {
            logger.error('BookeoId faltante para desbloqueo', { fecha, slot: tardeSlot });
            continue;
          }
          
          logger.warn(`✅ ${tardeSlot} debe desbloquearse`, { fecha, guidesDisponiblesTarde, bookeoId });
          
          await enqueueWebhook(db, {
            action: 'DESBLOQUEAR',
            shiftId: tardeShiftId,
            payload: {
              action: 'DESBLOQUEAR',
              bookeoId: bookeoId,
              startDate: fecha,
              startTime: SLOT_TIMES[tardeSlot],
              slot: tardeSlot,
              timestamp: new Date().toISOString()
            },
            emailData: (tardeSlot === 'T2' && guidesDisponiblesTarde === 1) ? {
              subject: `✅ Guías disponibles: ${fecha} TARDE`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #059669;">✅ Disponibilidad TARDE Restaurada</h2>
                  <p><strong>Fecha:</strong> ${fecha}</p>
                  <p><strong>Estado:</strong> ${guidesDisponiblesTarde} guía(s) con TARDE disponible</p>
                  <p><strong>Slots desbloqueados:</strong> ${Object.keys(estadoDeseado).filter(k => estadoDeseado[k]).join(', ')}</p>
                </div>
              `
            } : null
          });
          
          await db.collection('notifications').add({
            tipo: 'BOOKEO_UNBLOCK',
            fecha,
            slot: tardeSlot,
            totalGuides,
            guidesDisponiblesTarde,
            action: 'DESBLOQUEAR',
            bookeoId,
            createdAt: FieldValue.serverTimestamp()
          });
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

/**
 * Determina qué T deben estar desbloqueados según disponibilidad
 * @param {number} guidesDisponibles - Número de guías con TARDE disponible
 * @returns {Object} - {T1: bool, T2: bool, T3: bool} true=desbloqueado
 */
function determinarEstadoTarde(guidesDisponibles) {
  if (guidesDisponibles === 0) {
    // Todos bloqueados
    return { T1: false, T2: false, T3: false };
  } else if (guidesDisponibles === 1) {
    // Solo T2 desbloqueado
    return { T1: false, T2: true, T3: false };
  } else if (guidesDisponibles === 2) {
    // T2 + T1 desbloqueados
    return { T1: true, T2: true, T3: false };
  } else {
    // 3+ guías: todos desbloqueados
    return { T1: true, T2: true, T3: true };
  }
}

/**
 * Encola webhook en Cloud Tasks
 */
async function enqueueWebhook(db, { action, shiftId, payload, emailData }) {
  if (!ZAPIER_WEBHOOK_URL) {
    logger.warn('ZAPIER_WEBHOOK_URL no configurado', { shiftId });
    return;
  }
  
  try {
    const queue = getFunctions().taskQueue("bookeoWebhookWorker");
    
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
    
    // Email error inmediato
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