// =========================================
// BOOKEO RATE LIMITING CON CLOUD TASKS
// =========================================
const { onTaskDispatched } = require("firebase-functions/v2/tasks");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { logger } = require("firebase-functions/v2");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getFunctions } = require("firebase-admin/functions");

// =========================================
// CONFIGURACIÓN
// =========================================
const BOOKEO_WEBHOOK_URL = process.env.ZAPIER_WEBHOOK_URL;
const DEBOUNCE_SECONDS = 30;
const MAX_CONCURRENT_REQUESTS = 6;
const MAX_REQUESTS_PER_SECOND = 1.5;

// =========================================
// WORKER FUNCTION - Procesa webhooks con rate limiting
// =========================================
exports.bookeoWebhookWorker = onTaskDispatched({
  retryConfig: {
    maxAttempts: 5,
    minBackoffSeconds: 60,      // 1 minuto entre reintentos
    maxBackoffSeconds: 3600,    // Máximo 1 hora
    maxDoublings: 3
  },
  rateLimits: {
    maxConcurrentDispatches: MAX_CONCURRENT_REQUESTS,
    maxDispatchesPerSecond: MAX_REQUESTS_PER_SECOND
  },
  memory: "512MB",
  timeoutSeconds: 180,
  region: "us-central1"
}, async (req) => {
  const { guideId, shiftId, payload, attemptNumber } = req.data;
  
  logger.info("Procesando webhook Bookeo", { 
    guideId,
    shiftId,
    attempt: attemptNumber 
  });

  const db = getFirestore();
  
  try {
    // Re-leer documento para obtener estado más reciente
    const shiftRef = db.collection('guides').doc(guideId).collection('shifts').doc(shiftId);
    const shiftDoc = await shiftRef.get();
    
    if (!shiftDoc.exists) {
      logger.warn("Shift eliminado, cancelando webhook", { guideId, shiftId });
      return { success: false, reason: 'shift_deleted' };
    }
    
    const currentData = shiftDoc.data();
    const now = Date.now();
    const lastModifiedMs = currentData.updatedAt?.toMillis() || 0;
    
    // Verificar debounce: si el documento cambió en los últimos 30 segundos, cancelar
    if (now - lastModifiedMs < (DEBOUNCE_SECONDS * 1000)) {
      logger.info("Shift modificado recientemente, saltando procesamiento", { 
        guideId,
        shiftId,
        timeSinceModification: now - lastModifiedMs
      });
      return { success: false, reason: 'debounce_active' };
    }

    // Llamar a Bookeo vía Zapier
    const response = await fetch(BOOKEO_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000) // 30 segundos timeout
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Bookeo HTTP ${response.status}: ${errorText}`);
    }

    const responseData = await response.json();
    
    // Actualizar Firestore con éxito
    await shiftRef.update({
      webhookStatus: 'completed',
      webhookCompletedAt: FieldValue.serverTimestamp(),
      webhookResponseStatus: response.status,
      webhookAttempts: attemptNumber,
      bookeoResponseId: responseData.id || null
    });
    
    // Log en collection separada para auditoría
    await db.collection('webhookLogs').add({
      guideId,
      shiftId,
      status: 'success',
      payload,
      responseStatus: response.status,
      responseData,
      attempts: attemptNumber,
      completedAt: FieldValue.serverTimestamp()
    });
    
    logger.info("Webhook Bookeo exitoso", { 
      guideId, 
      shiftId,
      responseStatus: response.status 
    });
    
    return { success: true, responseStatus: response.status };
    
  } catch (error) {
    logger.error("Webhook Bookeo falló", {
      guideId,
      shiftId,
      error: error.message,
      attempt: attemptNumber
    });
    
    // Actualizar Firestore con error
    const shiftRef = db.collection('guides').doc(guideId).collection('shifts').doc(shiftId);
    await shiftRef.update({
      webhookStatus: 'failed',
      webhookLastError: error.message,
      webhookLastAttemptAt: FieldValue.serverTimestamp(),
      webhookAttempts: attemptNumber
    });
    
    // Log de error
    await db.collection('webhookLogs').add({
      guideId,
      shiftId,
      status: 'error',
      payload,
      error: error.message,
      attempts: attemptNumber,
      failedAt: FieldValue.serverTimestamp()
    });
    
    // Re-lanzar error para que Cloud Tasks reintente
    throw error;
  }
});

// =========================================
// TRIGGER - Encola webhooks con debounce
// =========================================
exports.enqueueBookeoWebhook = onDocumentUpdated({
  document: "guides/{guideId}/shifts/{shiftId}",
  region: "us-central1"
}, async (event) => {
  const guideId = event.params.guideId;
  const shiftId = event.params.shiftId;
  const newData = event.data.after.data();
  const previousData = event.data.before.data();
  
  // Solo procesar si el estado cambió
  if (newData.estado === previousData.estado) {
    logger.debug("Estado no cambió, ignorando", { guideId, shiftId });
    return null;
  }

  // Solo procesar transiciones relevantes para Bookeo
  const relevantStates = ['ASIGNADO', 'LIBRE', 'NO_DISPONIBLE'];
  if (!relevantStates.includes(newData.estado)) {
    logger.debug("Estado no relevante para Bookeo", { 
      guideId, 
      shiftId, 
      estado: newData.estado 
    });
    return null;
  }

  const db = getFirestore();
  
  // Preparar payload para Bookeo
  const payload = {
    guideId: guideId,
    guideName: newData.guideName || guideId,
    shiftId: shiftId,
    fecha: newData.fecha,
    slot: newData.slot,
    estado: newData.estado,
    timestamp: Date.now(),
    previousEstado: previousData.estado
  };

  try {
    const queue = getFunctions().taskQueue("bookeoWebhookWorker");
    
    await queue.enqueue(
      {
        guideId: guideId,
        shiftId: shiftId,
        payload: payload,
        attemptNumber: 1
      },
      {
        scheduleDelaySeconds: DEBOUNCE_SECONDS,     // Debounce de 30 segundos
        dispatchDeadlineSeconds: 300                // Timeout total de 5 minutos
      }
    );
    
    // Actualizar estado del webhook en Firestore
    await event.data.after.ref.update({
      webhookStatus: 'queued',
      webhookQueuedAt: FieldValue.serverTimestamp(),
      webhookAttempts: 0
    });
    
    logger.info("Webhook encolado con debounce", { 
      guideId, 
      shiftId,
      delay: DEBOUNCE_SECONDS 
    });
    
  } catch (error) {
    logger.error("Error encolando webhook", {
      guideId: guideId,
      shiftId: shiftId,
      error: error.message
    });
    
    // Marcar error en Firestore
    await event.data.after.ref.update({
      webhookStatus: 'queue_error',
      webhookError: error.message,
      webhookErrorAt: FieldValue.serverTimestamp()
    });
  }
});