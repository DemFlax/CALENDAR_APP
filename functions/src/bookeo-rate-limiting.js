// =========================================
// BOOKEO RATE LIMITING (INTEGRACIÓN MAKE - PROD)
// =========================================
// Lógica: Sincronización automática de disponibilidad con Make (anteriormente Zapier)
// - MAÑANA: Se bloquea si 100% guías NO_DISPONIBLE en turno MAÑANA.
// - TARDE: Se bloquea si 100% guías tienen la tarde bloqueada (T1 o T2).
// - Formato Fecha: YYYY/MM/DD
// - Payload: { date, startTime, accion: "bloquear" } / { accion: "desbloquear", blockId }
// =========================================

const { onTaskDispatched } = require("firebase-functions/v2/tasks");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onRequest } = require('firebase-functions/v2/https');
const { logger } = require("firebase-functions/v2");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getFunctions } = require("firebase-admin/functions");
const { defineSecret } = require('firebase-functions/params');
const sgMail = require('@sendgrid/mail');
const axios = require('axios');
const crypto = require('crypto');

// =========================================
// CONFIGURACIÓN
// =========================================
const sendgridKey = defineSecret('SENDGRID_API_KEY');

// URL del Webhook de Make (PRODUCCIÓN)
const MAKE_WEBHOOK_URL = "https://hook.eu1.make.com/hg4qtw71d15v53ox1jln67yzui6d32jd";

const MANAGER_EMAIL = process.env.MANAGER_EMAIL || 'madrid@spainfoodsherpas.com';
const FROM_EMAIL = 'madrid@spainfoodsherpas.com';
const FROM_NAME = 'Spain Food Sherpas';
const APP_URL = process.env.APP_URL || 'https://calendar-app-tours.web.app';

// Horarios fijos para el bloqueo (formato solicitado por Make)
const SLOT_TIMES = {
  'MAÑANA': '12:00',
  'T1': '18:15', // Representa el bloqueo de la tarde completa
  'T2': '18:15',
  'T3': '19:15'
};

const DEBOUNCE_SECONDS = 30;
const MAX_CONCURRENT_REQUESTS = 6;
const MAX_REQUESTS_PER_SECOND = 1.5;

const TARDE_SLOTS = ['T1', 'T2']; 

// =========================================
// WORKER FUNCTION - Procesa webhooks Make
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
 
  logger.info("Procesando webhook Make", {
    action,
    shiftId,
    attempt: attemptNumber,
    payload
  });

  const db = getFirestore();
 
  try {
    // Llamada a Make
    const response = await axios.post(MAKE_WEBHOOK_URL, payload, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
   
    logger.info(`Webhook ${action} exitoso`, { 
      shiftId, 
      status: response.status, 
      responseData: response.data 
    });
   
    // Enviar email de notificación (si aplica)
    if (emailData) {
      sgMail.setApiKey(sendgridKey.value());
      await sgMail.send({
        to: MANAGER_EMAIL,
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject: emailData.subject,
        html: emailData.html
      });
    }
   
    // LÓGICA POST-WEBHOOK (Gestión de IDs)
    if (action === 'BLOQUEAR') {
      // Intentar recuperar el blockId de varias formas posibles en la respuesta
      let blockId = null;
      if (response.data && typeof response.data === 'object') {
        blockId = response.data.blockId || response.data.id;
      } else if (typeof response.data === 'string') {
        // Si devuelve texto plano con el ID
        blockId = response.data.trim();
      }

      // Extracción segura de fecha y slot para guardar
      const [fecha, slot] = shiftId.split('_');
     
      if (blockId) {
        // Guardar el blockId para poder desbloquearlo después
        await db.collection('bookeo_blocks').doc(shiftId).set({
          fecha,
          slot,
          bookeoId: blockId,
          status: 'BLOCKED',
          createdAt: FieldValue.serverTimestamp(),
          webhookResponse: response.data
        });
       
        logger.info('✅ Bloqueo confirmado y ID guardado', { shiftId, blockId });
      } else {
        logger.warn('⚠️ No se recibió blockId de Make', { shiftId, response: response.data });
        
        // Guardamos estado de error/aviso pero bloqueamos para evitar reintentos infinitos
        await db.collection('bookeo_blocks').doc(shiftId).set({
          fecha,
          slot,
          status: 'BLOCKED_NO_ID',
          warning: 'No blockId received from Make',
          createdAt: FieldValue.serverTimestamp(),
          webhookResponse: response.data
        }, { merge: true });
      }

    } else if (action === 'DESBLOQUEAR') {
      // Actualizar estado a desbloqueado
      await db.collection('bookeo_blocks').doc(shiftId).update({
        status: 'UNBLOCKED',
        unlockedAt: FieldValue.serverTimestamp(),
        webhookResponse: response.data
      });
      logger.info('✅ Desbloqueo confirmado', { shiftId });
    }
   
    // Log de auditoría
    await db.collection('webhookLogs').add({
      shiftId,
      action,
      payload,
      responseStatus: response.status,
      responseData: response.data,
      platform: 'MAKE',
      timestamp: FieldValue.serverTimestamp()
    });

    return { success: true };
   
  } catch (error) {
    logger.error(`Webhook ${action} falló`, {
      shiftId,
      error: error.message,
      response: error.response?.data
    });
    throw error; // Reintentar
  }
});

// =========================================
// TRIGGER PRINCIPAL - Detecta cambios en turnos
// =========================================
exports.enqueueBookeoWebhook = onDocumentUpdated({
  document: "guides/{guideId}/shifts/{shiftId}",
  region: "us-central1",
  secrets: [sendgridKey]
}, async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const shiftId = event.params.shiftId;
 
  const [fechaRaw] = shiftId.split('_'); // YYYY-MM-DD
  const slot = after.slot;

  if (before.estado === after.estado) return;
 
  const db = getFirestore();
  
  try {
    const guidesSnapshot = await db.collection('guides').where('estado', '==', 'activo').get();
    const totalGuides = guidesSnapshot.size;
    if (totalGuides === 0) return;

    // Formatear fecha para Make (YYYY/MM/DD)
    const dateForMake = fechaRaw.replace(/-/g, '/');

    // =========================================
    // LÓGICA MAÑANA
    // =========================================
    if (slot === 'MAÑANA') {
      const resultado = await calcularDisponibilidadSlot(db, fechaRaw, 'MAÑANA');
      
      const stateHash = calculateStateHash({ totalGuides, unavailableCount: resultado.unavailableCount });
      const stateDocId = `${fechaRaw}_MAÑANA_STATE`;
      
      const shouldProcess = await checkAndSetState(db, stateDocId, stateHash, {
        totalGuides, unavailableCount: resultado.unavailableCount
      });

      if (shouldProcess) {
        const blockDoc = await db.collection('bookeo_blocks').doc(`${fechaRaw}_MAÑANA`).get();
        const existingBlockId = blockDoc.exists ? blockDoc.data().bookeoId : null;
        const isBlocked = blockDoc.exists && blockDoc.data().status === 'BLOCKED';

        // 1. BLOQUEAR MAÑANA
        if (resultado.debeBloquear && !isBlocked) {
            logger.info('🚫 Bloqueando MAÑANA en Make', { fecha: dateForMake });
            
            const payload = {
                date: dateForMake,
                startTime: SLOT_TIMES['MAÑANA'],
                accion: "bloquear"
            };

            const shouldSendEmail = await checkAndSetEmailState(db, `${fechaRaw}_MAÑANA_EMAIL_STATE`, resultado.unavailableCount);
            
            await enqueueWebhook({
                action: 'BLOQUEAR',
                shiftId: `${fechaRaw}_MAÑANA`,
                payload,
                emailData: shouldSendEmail ? {
                    subject: `🚫 Sin guías disponibles: ${fechaRaw} MAÑANA`,
                    html: generarEmailSinCobertura(fechaRaw, 'MAÑANA', totalGuides)
                } : null
            });
        }
        // 2. DESBLOQUEAR MAÑANA
        else if (resultado.debeDesbloquear && isBlocked) {
            if (existingBlockId) {
                logger.info('✅ Desbloqueando MAÑANA en Make', { fecha: dateForMake });
                
                const payload = {
                    accion: "desbloquear",
                    blockId: existingBlockId
                };

                await enqueueWebhook({
                    action: 'DESBLOQUEAR',
                    shiftId: `${fechaRaw}_MAÑANA`,
                    payload,
                    emailData: null
                });
                
                await db.collection('bookeo_blocks').doc(`${fechaRaw}_MAÑANA_EMAIL_STATE`).delete();
            } else {
                logger.error('⚠️ No se puede desbloquear MAÑANA: Falta blockId', { fecha: fechaRaw });
            }
        }
      }
    }
   
    // =========================================
    // LÓGICA TARDE (T1 y T2 unificados)
    // =========================================
    else if (TARDE_SLOTS.includes(slot)) {
      const resultado = await calcularDisponibilidadTarde(db, fechaRaw);
     
      const stateHash = calculateStateHash({
        totalGuides,
        guidesDisponiblesTarde: resultado.guidesDisponiblesTarde
      });
      const stateDocId = `${fechaRaw}_TARDE_STATE`;
     
      const shouldProcess = await checkAndSetState(db, stateDocId, stateHash, {
        totalGuides, guidesDisponiblesTarde: resultado.guidesDisponiblesTarde
      });
     
      if (shouldProcess) {
        const blockDocId = `${fechaRaw}_T2`; // ID unificado tarde
        const blockDoc = await db.collection('bookeo_blocks').doc(blockDocId).get();
        const existingBlockId = blockDoc.exists ? blockDoc.data().bookeoId : null;
        const isBlocked = blockDoc.exists && blockDoc.data().status === 'BLOCKED';

        // 1. BLOQUEAR TARDE
        if (resultado.debeBloquear && !isBlocked) {
            logger.info('🚫 Bloqueando TARDE en Make', { fecha: dateForMake });
            
            const payload = {
                date: dateForMake,
                startTime: SLOT_TIMES['T2'], // "18:15"
                accion: "bloquear"
            };

            const shouldSendEmail = await checkAndSetEmailState(db, `${fechaRaw}_TARDE_EMAIL_STATE`, 0);

            await enqueueWebhook({
                action: 'BLOQUEAR',
                shiftId: blockDocId,
                payload,
                emailData: shouldSendEmail ? {
                    subject: `🚫 Sin guías disponibles: ${fechaRaw} TARDE`,
                    html: generarEmailSinCoberturaTarde(fechaRaw, totalGuides)
                } : null
            });
        }
        // 2. DESBLOQUEAR TARDE
        else if (resultado.debeDesbloquear && isBlocked) {
            if (existingBlockId) {
                logger.info('✅ Desbloqueando TARDE en Make', { fecha: dateForMake });
                
                const payload = {
                    accion: "desbloquear",
                    blockId: existingBlockId
                };

                await enqueueWebhook({
                    action: 'DESBLOQUEAR',
                    shiftId: blockDocId,
                    payload,
                    emailData: null
                });

                await db.collection('bookeo_blocks').doc(`${fechaRaw}_TARDE_EMAIL_STATE`).delete();
            } else {
                logger.error('⚠️ No se puede desbloquear TARDE: Falta blockId', { fecha: fechaRaw });
            }
        }
      }
    }
   
  } catch (error) {
    logger.error('Error en enqueueBookeoWebhook', { shiftId, error: error.message });
  }
});

// =========================================
// TRIGGER - Detecta cambios estado guías
// =========================================
exports.onGuideStatusChange = onDocumentUpdated("guides/{guideId}", async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    
    if (before.estado !== after.estado) {
        const db = getFirestore();
        const guideId = event.params.guideId;
        logger.info(`Cambio estado guía ${guideId}: ${before.estado} -> ${after.estado}.`);
    }
});

// =========================================
// HELPERS
// =========================================

function calculateStateHash(obj) {
  return crypto.createHash('md5').update(JSON.stringify(obj)).digest('hex');
}

async function checkAndSetState(db, docId, hash, data) {
    return db.runTransaction(async (transaction) => {
        const ref = db.collection('bookeo_blocks').doc(docId);
        const doc = await transaction.get(ref);
        if (doc.exists && doc.data().lastHash === hash) return false;
        transaction.set(ref, { lastHash: hash, lastProcessed: FieldValue.serverTimestamp(), ...data });
        return true;
    });
}

async function checkAndSetEmailState(db, docId, valueToCheck) {
    return db.runTransaction(async (transaction) => {
        const ref = db.collection('bookeo_blocks').doc(docId);
        const doc = await transaction.get(ref);
        if (doc.exists) return false; 
        transaction.set(ref, { sentAt: FieldValue.serverTimestamp(), value: valueToCheck });
        return true;
    });
}

async function calcularDisponibilidadSlot(db, fecha, slot) {
  const guidesSnapshot = await db.collection('guides').where('estado', '==', 'activo').get();
  const totalGuides = guidesSnapshot.size;
  let unavailableCount = 0;
  
  const shiftId = `${fecha}_${slot}`;
  
  for (const guideDoc of guidesSnapshot.docs) {
    const shiftDoc = await db.collection('guides').doc(guideDoc.id).collection('shifts').doc(shiftId).get();
    if (shiftDoc.exists && shiftDoc.data().estado === 'NO_DISPONIBLE') {
      unavailableCount++;
    }
  }
  
  return {
    unavailableCount,
    debeBloquear: unavailableCount === totalGuides,
    debeDesbloquear: unavailableCount < totalGuides
  };
}

async function calcularDisponibilidadTarde(db, fecha) {
  const guidesSnapshot = await db.collection('guides').where('estado', '==', 'activo').get();
  const totalGuides = guidesSnapshot.size;
  let guidesConTardeBloqueada = 0;
  
  for (const guideDoc of guidesSnapshot.docs) {
    let disponible = true;
    for (const slot of TARDE_SLOTS) {
      const shiftDoc = await db.collection('guides').doc(guideDoc.id).collection('shifts').doc(`${fecha}_${slot}`).get();
      if (shiftDoc.exists && shiftDoc.data().estado === 'NO_DISPONIBLE') {
        disponible = false;
        break; 
      }
    }
    if (!disponible) guidesConTardeBloqueada++;
  }
  
  const guidesDisponibles = totalGuides - guidesConTardeBloqueada;
  
  return {
    guidesDisponiblesTarde: guidesDisponibles,
    debeBloquear: guidesDisponibles === 0,
    debeDesbloquear: guidesDisponibles > 0
  };
}

async function enqueueWebhook({ action, shiftId, payload, emailData }) {
  try {
    const queue = getFunctions().taskQueue("locations/us-central1/functions/bookeoWebhookWorker");
    await queue.enqueue({
      action,
      payload,
      shiftId,
      emailData,
      attemptNumber: 1
    }, {
      scheduleDelaySeconds: DEBOUNCE_SECONDS,
      dispatchDeadlineSeconds: 300
    });
  } catch (e) {
    logger.error("Error encolando tarea", e);
  }
}

function generarEmailSinCobertura(fecha, turno, total) {
  return `<p>Alerta: No hay guías disponibles para ${fecha} (${turno}). Se ha solicitado bloqueo automático.</p>`;
}

function generarEmailSinCoberturaTarde(fecha, total) {
  return `<p>Alerta: No hay guías disponibles para ${fecha} (TARDE). Se ha solicitado bloqueo automático.</p>`;
}

exports.freshStartBookeo = onRequest(async (req, res) => {
    // Endpoint para forzar revisión manual si es necesario
    res.json({msg: "Endpoint de mantenimiento"});
});