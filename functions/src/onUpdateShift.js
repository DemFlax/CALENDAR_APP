const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { validateTourExists, addGuideToEvent, removeGuideFromEvent } = require('./validateCalendar');

exports.onUpdateShift = onDocumentUpdated('shifts/{shiftId}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const shiftId = event.params.shiftId;
  
  logger.info('Shift updated', {
    shiftId,
    estadoBefore: before.estado,
    estadoAfter: after.estado
  });
  
  if (before.estado === 'LIBRE' && after.estado === 'ASIGNADO') {
    return handleAssignment(event.data.after, after, shiftId);
  }
  
  if (before.estado === 'ASIGNADO' && after.estado === 'LIBRE') {
    return handleRelease(before, shiftId);
  }
  
  logger.info('No action needed for this transition');
  return null;
});

async function handleAssignment(shiftRef, shiftData, shiftId) {
  const db = getFirestore();
  
  try {
    logger.info('Validating tour in Calendar', {
      fecha: shiftData.fecha,
      slot: shiftData.slot
    });
    
    const validation = await validateTourExists(shiftData.fecha, shiftData.slot);
    
    if (!validation.exists) {
      logger.warn('Tour does not exist in Calendar - reverting assignment', {
        shiftId,
        fecha: shiftData.fecha,
        slot: shiftData.slot
      });
      
      await shiftRef.ref.update({
        estado: 'LIBRE',
        guiaId: null,
        updatedAt: FieldValue.serverTimestamp()
      });
      
      return null;
    }
    
    logger.info('Tour validated successfully', {
      eventId: validation.eventId,
      summary: validation.summary
    });
    
    const guideDoc = await db.collection('guides').doc(shiftData.guiaId).get();
    
    if (!guideDoc.exists) {
      logger.error('Guide not found', { guideId: shiftData.guiaId });
      return null;
    }
    
    const guideEmail = guideDoc.data().email;
    
    const invited = await addGuideToEvent(validation.eventId, guideEmail);
    
    if (!invited) {
      logger.warn('Failed to add guide to Calendar event', {
        eventId: validation.eventId,
        guideEmail
      });
    }
    
    await db.collection('notifications').add({
      guiaId: shiftData.guiaId,
      tipo: 'ASIGNACION',
      shiftId: shiftId,
      emailTo: guideEmail,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp()
    });
    
    logger.info('Assignment completed successfully', { shiftId });
    
  } catch (error) {
    logger.error('Error handling assignment', {
      error: error.message,
      stack: error.stack,
      shiftId
    });
    
    try {
      await shiftRef.ref.update({
        estado: 'LIBRE',
        guiaId: null,
        updatedAt: FieldValue.serverTimestamp()
      });
      logger.info('Assignment reverted due to error', { shiftId });
    } catch (revertError) {
      logger.error('Failed to revert assignment', {
        error: revertError.message,
        shiftId
      });
    }
  }
  
  return null;
}

async function handleRelease(beforeData, shiftId) {
  const db = getFirestore();
  
  try {
    logger.info('Handling shift release', {
      shiftId,
      guiaId: beforeData.guiaId
    });
    
    if (!beforeData.guiaId) {
      logger.warn('No guide assigned to released shift', { shiftId });
      return null;
    }
    
    const guideDoc = await db.collection('guides').doc(beforeData.guiaId).get();
    
    if (!guideDoc.exists) {
      logger.warn('Guide not found for release notification', {
        guideId: beforeData.guiaId
      });
      return null;
    }
    
    const guideEmail = guideDoc.data().email;
    
    await db.collection('notifications').add({
      guiaId: beforeData.guiaId,
      tipo: 'LIBERACION',
      shiftId: shiftId,
      emailTo: guideEmail,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp()
    });
    
    logger.info('Release handled successfully', { shiftId });
    
  } catch (error) {
    logger.error('Error handling release', {
      error: error.message,
      stack: error.stack,
      shiftId
    });
  }
  
  return null;
}