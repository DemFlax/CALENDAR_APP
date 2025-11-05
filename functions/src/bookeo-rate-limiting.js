// =========================================
// BOOKEO RATE LIMITING CON CLOUD TASKS
// Lógica: 100% guías TARDE NO_DISPONIBLE → BLOQUEAR
// Transacciones atómicas para prevenir webhooks duplicados
// UTF-8 fix: usa after.slot de Firestore (event.params corrompe)
// Emails solo para "sin cobertura" (no para restauración)
// Trigger adicional: detecta cambios estado activo/inactivo de guías
// Preparado para T3 futuro (actualmente solo T1+T2)
// ✅ FIX: Validación bookeoId antes de desbloquear + alertas críticas
// ✅ FIX: Transacciones atómicas para emails - evita duplicados
// =========================================
const {onRequest} = require('firebase-functions/v2/https');
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

// Configuración TARDE: actualmente T1+T2, preparado para T3
const TARDE_SLOTS = ['T1', 'T2']; // TODO: Agregar 'T3' cuando se active

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
      // ✅ FIX: Buscar 'id' o 'bookeoId'
      const bookeoId = response.data?.id || response.data?.bookeoId;
     
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
        // ✅ FIX: Email crítico al manager
        logger.error('🚨 CRÍTICO: Zapier no retornó bookeoId', {
          shiftId,
          responseData: response.data
        });
       
        await db.collection('bookeo_blocks').doc(shiftId).set({
          fecha,
          slot,
          bookeoId: null,
          status: 'BLOCKED',
          warning: 'bookeoId no retornado por Zapier - DESBLOQUEO IMPOSIBLE',
          createdAt: FieldValue.serverTimestamp(),
          webhookResponse: response.data
        });
        
        // ✅ Email crítico inmediato
        try {
          sgMail.setApiKey(sendgridKey.value());
          await sgMail.send({
            to: MANAGER_EMAIL,
            from: { email: FROM_EMAIL, name: FROM_NAME },
            subject: `🚨 CRÍTICO: Bloqueo sin bookeoId - ${shiftId}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #dc2626;">🚨 ERROR CRÍTICO: Bloqueo Sin BookeoId</h2>
                <p><strong>Shift:</strong> ${shiftId}</p>
                <p><strong>Fecha:</strong> ${fecha}</p>
                <p><strong>Slot:</strong> ${slot}</p>
                <hr style="border: 1px solid #eee; margin: 20px 0;">
                <div style="background: #fee2e2; border-left: 4px solid #dc2626; padding: 12px; margin: 20px 0; border-radius: 4px;">
                  <p style="margin: 0; color: #991b1b; font-weight: bold;">⚠️ Zapier NO retornó bookeoId</p>
                  <p style="margin: 8px 0 0 0; color: #991b1b; font-size: 14px;">
                    El turno fue bloqueado en Bookeo pero NO tenemos el bookeoId para desbloquearlo automáticamente después.
                  </p>
                </div>
                <h3 style="color: #dc2626;">ACCIÓN INMEDIATA REQUERIDA:</h3>
                <ol style="color: #991b1b;">
                  <li>Verificar en Bookeo si el turno se bloqueó correctamente</li>
                  <li>Si es necesario desbloquear, hacerlo MANUALMENTE en Bookeo</li>
                  <li>Revisar logs de Zapier para diagnosticar por qué no retornó bookeoId</li>
                  <li>Considerar corregir el Zap para retornar siempre 'id' o 'bookeoId'</li>
                </ol>
                <hr style="border: 1px solid #eee; margin: 20px 0;">
                <p><strong>Respuesta Zapier:</strong></p>
                <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto;">${JSON.stringify(response.data, null, 2)}</pre>
                <hr style="border: 1px solid #eee; margin: 20px 0;">
                <p style="color: #666; font-size: 12px;">
                  <a href="${APP_URL}" style="color: #3b82f6;">Ver Dashboard</a>
                </p>
              </div>
            `
          });
          
          logger.info('📧 Email crítico enviado por bookeoId faltante', { shiftId });
          
        } catch (emailError) {
          logger.error('Error enviando email crítico bookeoId faltante', { 
            error: emailError.message,
            shiftId 
          });
        }
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
      // Obtener fechas únicas de shifts del guía
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
      
      // Paso 1: Invalidar cache de estado
      for (const fecha of fechasAfectadas) {
        await db.collection('bookeo_blocks').doc(`${fecha}_MAÑANA_STATE`).delete();
        await db.collection('bookeo_blocks').doc(`${fecha}_TARDE_STATE`).delete();
      }
      
      // ✅ FIX: FORZAR RECÁLCULO - Encolar webhooks para cada fecha afectada
      for (const fecha of fechasAfectadas) {
        // Recalcular MAÑANA
        const mananaShifts = await calcularDisponibilidadSlot(db, fecha, 'MAÑANA');
        if (mananaShifts.debeBloquear) {
          await enqueueWebhook(db, {
            action: 'BLOQUEAR',
            shiftId: `${fecha}_MAÑANA`,
            payload: {
              action: 'BLOQUEAR',
              startDate: fecha,
              startTime: SLOT_TIMES['MAÑANA'],
              slot: 'MAÑANA',
              timestamp: new Date().toISOString()
            },
            emailData: {
              subject: `🚫 Sin guías disponibles: ${fecha} MAÑANA`,
              html: generarEmailSinCobertura(fecha, 'MAÑANA', mananaShifts.totalGuides)
            }
          });
        } else if (mananaShifts.debeDesbloquear) {
          const blockDoc = await db.collection('bookeo_blocks').doc(`${fecha}_MAÑANA`).get();
          const bookeoId = blockDoc.exists ? blockDoc.data().bookeoId : null;
          
          // ✅ Validación bookeoId
          if (bookeoId) {
            await enqueueWebhook(db, {
              action: 'DESBLOQUEAR',
              shiftId: `${fecha}_MAÑANA`,
              payload: {
                action: 'DESBLOQUEAR',
                bookeoId: bookeoId,
                startDate: fecha,
                startTime: SLOT_TIMES['MAÑANA'],
                slot: 'MAÑANA',
                timestamp: new Date().toISOString()
              },
              emailData: null
            });
          }
        }
        
        // Recalcular TARDE
        const tardeShifts = await calcularDisponibilidadTarde(db, fecha);
        if (tardeShifts.debeBloquear) {
          await enqueueWebhook(db, {
            action: 'BLOQUEAR',
            shiftId: `${fecha}_TARDE`,
            payload: {
              action: 'BLOQUEAR',
              startDate: fecha,
              startTime: SLOT_TIMES['T2'], // Representante TARDE
              slot: 'TARDE',
              timestamp: new Date().toISOString()
            },
            emailData: {
              subject: `🚫 Sin guías disponibles: ${fecha} TARDE`,
              html: generarEmailSinCoberturaTarde(fecha, tardeShifts.totalGuides)
            }
          });
        } else if (tardeShifts.debeDesbloquear) {
          const blockDoc = await db.collection('bookeo_blocks').doc(`${fecha}_T2`).get();
          const bookeoId = blockDoc.exists ? blockDoc.data().bookeoId : null;
          
          // ✅ Validación bookeoId
          if (bookeoId) {
            await enqueueWebhook(db, {
              action: 'DESBLOQUEAR',
              shiftId: `${fecha}_T2`,
              payload: {
                action: 'DESBLOQUEAR',
                bookeoId: bookeoId,
                startDate: fecha,
                startTime: SLOT_TIMES['T2'],
                slot: 'TARDE',
                timestamp: new Date().toISOString()
              },
              emailData: null
            });
          }
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
      const resultado = await calcularDisponibilidadSlot(db, fecha, 'MAÑANA');
      
      const stateHash = calculateStateHash({
        totalGuides,
        unavailableCount: resultado.unavailableCount
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
          unavailableCount: resultado.unavailableCount
        });
       
        return true;
      });
     
      if (!shouldProcess) {
        return;
      }
     
      const blockDoc = await db.collection('bookeo_blocks').doc(`${fecha}_MAÑANA`).get();
      const existingBookeoId = blockDoc.exists ? blockDoc.data().bookeoId : null;
      const isBlocked = blockDoc.exists && blockDoc.data().status === 'BLOCKED';
     
      if (resultado.debeBloquear && !isBlocked) {
        logger.warn('🚫 MAÑANA debe bloquearse', { fecha, unavailableCount: resultado.unavailableCount, totalGuides });
       
        // ✅ TRANSACCIÓN ATÓMICA: solo el primer trigger envía email
        const shouldSendEmail = await db.runTransaction(async (transaction) => {
          const emailStateRef = db.collection('bookeo_blocks').doc(`${fecha}_MAÑANA_EMAIL_STATE`);
          const emailStateDoc = await transaction.get(emailStateRef);
          
          if (!emailStateDoc.exists) {
            transaction.set(emailStateRef, {
              emailSentAt: FieldValue.serverTimestamp(),
              totalGuides,
              unavailableCount: resultado.unavailableCount
            });
            return true; // Solo el primer trigger retorna true
          }
          return false; // Otros triggers retornan false
        });
        
        if (shouldSendEmail) {
          await enqueueWebhook(db, {
            action: 'BLOQUEAR',
            shiftId: `${fecha}_MAÑANA`,
            payload: {
              action: 'BLOQUEAR',
              startDate: fecha,
              startTime: SLOT_TIMES['MAÑANA'],
              slot: 'MAÑANA',
              timestamp: new Date().toISOString()
            },
            emailData: {
              subject: `🚫 Sin guías disponibles: ${fecha} MAÑANA`,
              html: generarEmailSinCobertura(fecha, 'MAÑANA', totalGuides)
            }
          });
          
          logger.info('Email MAÑANA encolado', { fecha });
        } else {
          // Encolar webhook sin email
          await enqueueWebhook(db, {
            action: 'BLOQUEAR',
            shiftId: `${fecha}_MAÑANA`,
            payload: {
              action: 'BLOQUEAR',
              startDate: fecha,
              startTime: SLOT_TIMES['MAÑANA'],
              slot: 'MAÑANA',
              timestamp: new Date().toISOString()
            },
            emailData: null
          });
          
          logger.info('Webhook MAÑANA sin email (ya enviado)', { fecha });
        }
       
        await db.collection('notifications').add({
          tipo: 'BOOKEO_BLOCK',
          fecha,
          slot: 'MAÑANA',
          totalGuides,
          unavailableCount: resultado.unavailableCount,
          action: 'BLOQUEAR',
          createdAt: FieldValue.serverTimestamp()
        });
      }
      else if (!resultado.debeBloquear && isBlocked) {
        // ✅ FIX: Validar bookeoId antes de desbloquear
        if (!existingBookeoId) {
          logger.error('🚨 Imposible desbloquear MAÑANA: falta bookeoId', {
            fecha,
            unavailableCount: resultado.unavailableCount,
            totalGuides
          });
          
          // ✅ Alertar manager para intervención manual
          try {
            sgMail.setApiKey(sendgridKey.value());
            await sgMail.send({
              to: MANAGER_EMAIL,
              from: { email: FROM_EMAIL, name: FROM_NAME },
              subject: `🚨 CRÍTICO: Imposible desbloquear ${fecha} MAÑANA`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #dc2626;">🚨 ERROR CRÍTICO: Desbloqueo Imposible</h2>
                  <p><strong>Fecha:</strong> ${fecha}</p>
                  <p><strong>Turno:</strong> MAÑANA (${SLOT_TIMES['MAÑANA']})</p>
                  <hr style="border: 1px solid #eee; margin: 20px 0;">
                  <div style="background: #fee2e2; border-left: 4px solid #dc2626; padding: 12px; margin: 20px 0; border-radius: 4px;">
                    <p style="margin: 0; color: #991b1b; font-weight: bold;">⚠️ NO hay bookeoId guardado</p>
                    <p style="margin: 8px 0 0 0; color: #991b1b; font-size: 14px;">
                      El sistema detectó que hay guías disponibles, pero no puede desbloquear automáticamente porque falta el bookeoId.
                    </p>
                  </div>
                  <h3 style="color: #dc2626;">ACCIÓN INMEDIATA REQUERIDA:</h3>
                  <ol style="color: #991b1b;">
                    <li>Ir a Bookeo manualmente</li>
                    <li>Buscar el bloqueo para ${fecha} MAÑANA</li>
                    <li>Desbloquear manualmente</li>
                    <li>Revisar por qué faltó bookeoId en el bloqueo original</li>
                  </ol>
                  <p><strong>Estado actual:</strong></p>
                  <ul>
                    <li>Guías activos totales: ${totalGuides}</li>
                    <li>Guías NO_DISPONIBLE: ${resultado.unavailableCount}</li>
                    <li>Guías disponibles: ${totalGuides - resultado.unavailableCount}</li>
                  </ul>
                  <hr style="border: 1px solid #eee; margin: 20px 0;">
                  <p style="color: #666; font-size: 12px;">
                    <a href="${APP_URL}" style="color: #3b82f6;">Ver Dashboard</a>
                  </p>
                </div>
              `
            });
            
            logger.info('📧 Email crítico enviado: desbloqueo imposible MAÑANA', { fecha });
            
          } catch (emailError) {
            logger.error('Error enviando email desbloqueo imposible', { 
              error: emailError.message,
              fecha,
              slot: 'MAÑANA'
            });
          }
          
          // Registrar en notifications
          await db.collection('notifications').add({
            tipo: 'BOOKEO_UNBLOCK_FAILED',
            fecha,
            slot: 'MAÑANA',
            totalGuides,
            unavailableCount: resultado.unavailableCount,
            availableCount: totalGuides - resultado.unavailableCount,
            errorReason: 'bookeoId faltante - requiere intervención manual',
            createdAt: FieldValue.serverTimestamp()
          });
          
          return; // ← Skip webhook
        }
        
        // Si hay bookeoId, proceder normalmente
        logger.warn('✅ MAÑANA debe desbloquearse', {
          fecha,
          unavailableCount: resultado.unavailableCount,
          totalGuides,
          bookeoId: existingBookeoId
        });
       
        await enqueueWebhook(db, {
          action: 'DESBLOQUEAR',
          shiftId: `${fecha}_MAÑANA`,
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
        
        // ✅ Limpiar flag de email para permitir futuros bloqueos
        await db.collection('bookeo_blocks').doc(`${fecha}_MAÑANA_EMAIL_STATE`).delete();
       
        await db.collection('notifications').add({
          tipo: 'BOOKEO_UNBLOCK',
          fecha,
          slot: 'MAÑANA',
          totalGuides,
          unavailableCount: resultado.unavailableCount,
          availableCount: totalGuides - resultado.unavailableCount,
          action: 'DESBLOQUEAR',
          bookeoId: existingBookeoId,
          createdAt: FieldValue.serverTimestamp()
        });
      }
      else if (resultado.debeBloquear && isBlocked) {
        logger.info('MAÑANA ya bloqueado, skip webhook', { fecha, bookeoId: existingBookeoId });
      }
    }
   
    // =========================================
    // LÓGICA TARDE
    // =========================================
    else if (TARDE_SLOTS.includes(slot)) {
      const resultado = await calcularDisponibilidadTarde(db, fecha);
     
      const stateHash = calculateStateHash({
        totalGuides,
        guidesDisponiblesTarde: resultado.guidesDisponiblesTarde,
        tardeSlotsCount: resultado.tardeSlotsCount
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
          guidesDisponiblesTarde: resultado.guidesDisponiblesTarde,
          tardeSlotsCount: resultado.tardeSlotsCount
        });
       
        return true;
      });
     
      if (!shouldProcess) {
        return;
      }
     
      // ✅ TRANSACCIÓN ATÓMICA: Email consolidado si cambia de >0 a 0
      if (resultado.guidesDisponiblesTarde === 0) {
        const shouldSendEmail = await db.runTransaction(async (transaction) => {
          const emailStateRef = db.collection('bookeo_blocks').doc(`${fecha}_TARDE_EMAIL_STATE`);
          const emailStateDoc = await transaction.get(emailStateRef);
          
          const lastEmailGuides = emailStateDoc.exists ? emailStateDoc.data().guidesDisponiblesTarde : null;
          
          if (lastEmailGuides !== 0) {
            transaction.set(emailStateRef, {
              guidesDisponiblesTarde: 0,
              emailSentAt: FieldValue.serverTimestamp(),
              totalGuides
            });
            return true; // Solo el primer trigger retorna true
          }
          return false; // Otros triggers retornan false
        });
        
        if (shouldSendEmail) {
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
              html: generarEmailSinCoberturaTarde(fecha, totalGuides)
            }
          });
          
          logger.info('Email TARDE encolado', { fecha });
        } else {
          logger.info('Email TARDE skip (ya enviado)', { fecha });
        }
      } else {
        // Si hay guías disponibles, limpiar flag de email
        const emailStateDoc = await db.collection('bookeo_blocks').doc(`${fecha}_TARDE_EMAIL_STATE`).get();
        if (emailStateDoc.exists && emailStateDoc.data().guidesDisponiblesTarde === 0) {
          await db.collection('bookeo_blocks').doc(`${fecha}_TARDE_EMAIL_STATE`).delete();
          logger.info('Flag email TARDE limpiado (hay guías disponibles)', { fecha });
        }
      }
     
      // Bloquear/Desbloquear TARDE (1 webhook a Bookeo via T2)
      const blockDoc = await db.collection('bookeo_blocks').doc(`${fecha}_T2`).get();
      const existingBookeoId = blockDoc.exists ? blockDoc.data().bookeoId : null;
      const isBlocked = blockDoc.exists && blockDoc.data().status === 'BLOCKED';
     
      if (resultado.debeBloquear && !isBlocked) {
        logger.warn('🚫 TARDE debe bloquearse', { fecha, guidesDisponiblesTarde: resultado.guidesDisponiblesTarde });
       
        await enqueueWebhook(db, {
          action: 'BLOQUEAR',
          shiftId: `${fecha}_T2`,
          payload: {
            action: 'BLOQUEAR',
            startDate: fecha,
            startTime: SLOT_TIMES['T2'],
            slot: 'TARDE',
            timestamp: new Date().toISOString()
          },
          emailData: null // Email ya gestionado arriba con transacción
        });
       
        await db.collection('notifications').add({
          tipo: 'BOOKEO_BLOCK',
          fecha,
          slot: 'TARDE',
          totalGuides,
          guidesDisponiblesTarde: resultado.guidesDisponiblesTarde,
          action: 'BLOQUEAR',
          createdAt: FieldValue.serverTimestamp()
        });
      }
      else if (!resultado.debeBloquear && isBlocked) {
        // ✅ FIX: Validar bookeoId antes de desbloquear
        if (!existingBookeoId) {
          logger.error('🚨 Imposible desbloquear TARDE: falta bookeoId', {
            fecha,
            guidesDisponiblesTarde: resultado.guidesDisponiblesTarde,
            totalGuides
          });
          
          // ✅ Alertar manager para intervención manual
          try {
            sgMail.setApiKey(sendgridKey.value());
            await sgMail.send({
              to: MANAGER_EMAIL,
              from: { email: FROM_EMAIL, name: FROM_NAME },
              subject: `🚨 CRÍTICO: Imposible desbloquear ${fecha} TARDE`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #dc2626;">🚨 ERROR CRÍTICO: Desbloqueo Imposible</h2>
                  <p><strong>Fecha:</strong> ${fecha}</p>
                  <p><strong>Turno:</strong> TARDE (${TARDE_SLOTS.map(s => `${s} ${SLOT_TIMES[s]}`).join(', ')})</p>
                  <hr style="border: 1px solid #eee; margin: 20px 0;">
                  <div style="background: #fee2e2; border-left: 4px solid #dc2626; padding: 12px; margin: 20px 0; border-radius: 4px;">
                    <p style="margin: 0; color: #991b1b; font-weight: bold;">⚠️ NO hay bookeoId guardado</p>
                    <p style="margin: 8px 0 0 0; color: #991b1b; font-size: 14px;">
                      El sistema detectó que hay guías disponibles, pero no puede desbloquear automáticamente porque falta el bookeoId.
                    </p>
                  </div>
                  <h3 style="color: #dc2626;">ACCIÓN INMEDIATA REQUERIDA:</h3>
                  <ol style="color: #991b1b;">
                    <li>Ir a Bookeo manualmente</li>
                    <li>Buscar el bloqueo para ${fecha} TARDE</li>
                    <li>Desbloquear manualmente</li>
                    <li>Revisar por qué faltó bookeoId en el bloqueo original</li>
                  </ol>
                  <p><strong>Estado actual:</strong></p>
                  <ul>
                    <li>Guías activos totales: ${totalGuides}</li>
                    <li>Guías con TARDE bloqueada: ${totalGuides - resultado.guidesDisponiblesTarde}</li>
                    <li>Guías disponibles TARDE: ${resultado.guidesDisponiblesTarde}</li>
                  </ul>
                  <hr style="border: 1px solid #eee; margin: 20px 0;">
                  <p style="color: #666; font-size: 12px;">
                    <a href="${APP_URL}" style="color: #3b82f6;">Ver Dashboard</a>
                  </p>
                </div>
              `
            });
            
            logger.info('📧 Email crítico enviado: desbloqueo imposible TARDE', { fecha });
            
          } catch (emailError) {
            logger.error('Error enviando email desbloqueo imposible', { 
              error: emailError.message,
              fecha,
              slot: 'TARDE'
            });
          }
          
          // Registrar en notifications
          await db.collection('notifications').add({
            tipo: 'BOOKEO_UNBLOCK_FAILED',
            fecha,
            slot: 'TARDE',
            totalGuides,
            guidesDisponiblesTarde: resultado.guidesDisponiblesTarde,
            errorReason: 'bookeoId faltante - requiere intervención manual',
            createdAt: FieldValue.serverTimestamp()
          });
          
          return; // ← Skip webhook
        }
        
        // Si hay bookeoId, proceder normalmente
        logger.warn('✅ TARDE debe desbloquearse', {
          fecha,
          guidesDisponiblesTarde: resultado.guidesDisponiblesTarde,
          bookeoId: existingBookeoId
        });
       
        await enqueueWebhook(db, {
          action: 'DESBLOQUEAR',
          shiftId: `${fecha}_T2`,
          payload: {
            action: 'DESBLOQUEAR',
            bookeoId: existingBookeoId,
            startDate: fecha,
            startTime: SLOT_TIMES['T2'],
            slot: 'TARDE',
            timestamp: new Date().toISOString()
          },
          emailData: null
        });
       
        await db.collection('notifications').add({
          tipo: 'BOOKEO_UNBLOCK',
          fecha,
          slot: 'TARDE',
          totalGuides,
          guidesDisponiblesTarde: resultado.guidesDisponiblesTarde,
          action: 'DESBLOQUEAR',
          bookeoId: existingBookeoId,
          createdAt: FieldValue.serverTimestamp()
        });
      }
      else if (resultado.debeBloquear && isBlocked) {
        logger.info('TARDE ya bloqueada, skip webhook', { fecha, bookeoId: existingBookeoId });
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

// ✅ CORRECTO: Lógica 100% o nada
async function calcularDisponibilidadSlot(db, fecha, slot) {
  const guidesSnapshot = await db.collection('guides')
    .where('estado', '==', 'activo')
    .get();
  
  const totalGuides = guidesSnapshot.size;
  let unavailableCount = 0;
  
  const shiftId = `${fecha}_${slot}`;
  
  for (const guideDoc of guidesSnapshot.docs) {
    const shiftDoc = await db.collection('guides')
      .doc(guideDoc.id)
      .collection('shifts')
      .doc(shiftId)
      .get();
    
    if (shiftDoc.exists && shiftDoc.data().estado === 'NO_DISPONIBLE') {
      unavailableCount++;
    }
  }
  
  return {
    totalGuides,
    unavailableCount,
    debeBloquear: unavailableCount === totalGuides,
    debeDesbloquear: unavailableCount < totalGuides
  };
}

// ✅ CORRECTO: TARDE = 100% tienen T1 Y T2 (Y T3 cuando se active) bloqueados
async function calcularDisponibilidadTarde(db, fecha) {
  const guidesSnapshot = await db.collection('guides')
    .where('estado', '==', 'activo')
    .get();
  
  const totalGuides = guidesSnapshot.size;
  const tardeSlotsCount = {};
  
  for (const tardeSlot of TARDE_SLOTS) {
    tardeSlotsCount[tardeSlot] = 0;
  }
  
  // Contar cuántos guías tienen cada turno TARDE bloqueado
  for (const guideDoc of guidesSnapshot.docs) {
    for (const tardeSlot of TARDE_SLOTS) {
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
  
  // Contar cuántos guías tienen TODA LA TARDE bloqueada
  let guidesConTardeBloqueada = 0;
  
  for (const guideDoc of guidesSnapshot.docs) {
    let tieneTardeBloqueada = true;
    
    for (const tardeSlot of TARDE_SLOTS) {
      const tardeShiftId = `${fecha}_${tardeSlot}`;
      const shiftDoc = await db.collection('guides')
        .doc(guideDoc.id)
        .collection('shifts')
        .doc(tardeShiftId)
        .get();
      
      if (!shiftDoc.exists || shiftDoc.data().estado !== 'NO_DISPONIBLE') {
        tieneTardeBloqueada = false;
        break;
      }
    }
    
    if (tieneTardeBloqueada) {
      guidesConTardeBloqueada++;
    }
  }
  
  const guidesDisponiblesTarde = totalGuides - guidesConTardeBloqueada;
  
  return {
    totalGuides,
    guidesDisponiblesTarde,
    tardeSlotsCount,
    debeBloquear: guidesDisponiblesTarde === 0,
    debeDesbloquear: guidesDisponiblesTarde > 0
  };
}

function generarEmailSinCobertura(fecha, slot, totalGuides) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc2626;">🚫 Turno Sin Cobertura</h2>
      <p><strong>Fecha:</strong> ${fecha}</p>
      <p><strong>Turno:</strong> ${slot} (${SLOT_TIMES[slot]})</p>
      <p><strong>Estado:</strong> Todos los guías (${totalGuides}) están NO_DISPONIBLE</p>
      <hr style="border: 1px solid #eee; margin: 20px 0;">
      <p style="color: #666; font-size: 12px;">
        <a href="${APP_URL}" style="color: #3b82f6;">Ver Dashboard</a>
      </p>
    </div>
  `;
}

function generarEmailSinCoberturaTarde(fecha, totalGuides) {
  const tardeSlotsList = TARDE_SLOTS.map(s => `${s} (${SLOT_TIMES[s]})`).join(', ');
  
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc2626;">🚫 TARDE Sin Cobertura</h2>
      <p><strong>Fecha:</strong> ${fecha}</p>
      <p><strong>Turnos afectados:</strong> ${tardeSlotsList}</p>
      <p><strong>Estado:</strong> Todos los guías (${totalGuides}) tienen TARDE NO_DISPONIBLE</p>
      <hr style="border: 1px solid #eee; margin: 20px 0;">
      <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; color: #92400e; font-weight: bold;">ℹ️ Bookeo gestiona turnos solapados</p>
        <p style="margin: 8px 0 0 0; color: #92400e; font-size: 14px;">
          Al bloquear TARDE en Bookeo, el sistema maneja automáticamente todos los turnos de la tarde.
        </p>
      </div>
      <hr style="border: 1px solid #eee; margin: 20px 0;">
      <p style="color: #666; font-size: 12px;">
        <a href="${APP_URL}" style="color: #3b82f6;">Ver Dashboard</a>
      </p>
    </div>
  `;
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

// =========================================
// FRESH START: Limpia y recalcula todo
// =========================================
exports.freshStartBookeo = onRequest({ 
  timeoutSeconds: 540,
  secrets: [sendgridKey]
}, async (req, res) => {
  const db = getFirestore();
  const today = new Date().toISOString().split('T')[0];
  
  try {
    // PASO 1: Eliminar TODA la colección bookeo_blocks
    const snapshot = await db.collection('bookeo_blocks').get();
    const deleteBatch = db.batch();
    
    snapshot.docs.forEach(doc => deleteBatch.delete(doc.ref));
    await deleteBatch.commit();
    
    logger.info('bookeo_blocks limpiada completamente');
    
    // PASO 2: Obtener guías activos
    const guidesSnapshot = await db.collection('guides')
      .where('estado', '==', 'activo')
      .get();
    
    const totalGuides = guidesSnapshot.size;
    
    if (totalGuides === 0) {
      return res.json({ error: 'No hay guías activos' });
    }
    
    // PASO 3: Obtener todas las fechas únicas futuras
    const fechasSet = new Set();
    
    for (const guideDoc of guidesSnapshot.docs) {
      const shiftsSnapshot = await db.collection('guides')
        .doc(guideDoc.id)
        .collection('shifts')
        .where('fecha', '>=', today)
        .get();
      
      shiftsSnapshot.docs.forEach(doc => {
        const [fecha] = doc.id.split('_');
        if (fecha) fechasSet.add(fecha);
      });
    }
    
    const fechas = Array.from(fechasSet).sort();
    logger.info('Fechas a procesar', { total: fechas.length, desde: fechas[0], hasta: fechas[fechas.length-1] });
    
    let bloqueosEncolados = 0;
    
    // PASO 4: Verificar cada fecha
    for (const fecha of fechas) {
      // Verificar MAÑANA
      const mananaResult = await calcularDisponibilidadSlot(db, fecha, 'MAÑANA');
      
      if (mananaResult.debeBloquear) {
        await enqueueWebhook(db, {
          action: 'BLOQUEAR',
          shiftId: `${fecha}_MAÑANA`,
          payload: {
            action: 'BLOQUEAR',
            startDate: fecha,
            startTime: '12:00',
            slot: 'MAÑANA',
            timestamp: new Date().toISOString()
          },
          emailData: {
            subject: `🚫 Sin guías: ${fecha} MAÑANA`,
            html: generarEmailSinCobertura(fecha, 'MAÑANA', totalGuides)
          }
        });
        bloqueosEncolados++;
      }
      
      // ✅ CORRECTO: Verificar TARDE (T1 Y T2 bloqueados)
      const tardeResult = await calcularDisponibilidadTarde(db, fecha);
      
      if (tardeResult.debeBloquear) {
        await enqueueWebhook(db, {
          action: 'BLOQUEAR',
          shiftId: `${fecha}_T2`,
          payload: {
            action: 'BLOQUEAR',
            startDate: fecha,
            startTime: '18:15',
            slot: 'TARDE',
            timestamp: new Date().toISOString()
          },
          emailData: {
            subject: `🚫 Sin guías: ${fecha} TARDE`,
            html: generarEmailSinCoberturaTarde(fecha, totalGuides)
          }
        });
        bloqueosEncolados++;
      }
    }
    
    res.json({ 
      success: true,
      fechasProcesadas: fechas.length,
      bloqueosEncolados,
      totalGuides,
      message: 'Fresh start completado. Webhooks encolados con 30s delay.'
    });
    
  } catch (error) {
    logger.error('Error freshStartBookeo', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});