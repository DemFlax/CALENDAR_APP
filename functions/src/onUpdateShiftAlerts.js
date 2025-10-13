const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const { getFirestore } = require('firebase-admin/firestore');
const { defineSecret } = require('firebase-functions/params');
const sgMail = require('@sendgrid/mail');

const sendgridKey = defineSecret('SENDGRID_API_KEY');
const MANAGER_EMAIL = process.env.MANAGER_EMAIL || 'madrid@spainfoodsherpas.com';
const FROM_EMAIL = 'madrid@spainfoodsherpas.com';
const FROM_NAME = 'Spain Food Sherpas';

exports.onUpdateShiftAlerts = onDocumentUpdated({
  document: 'guides/{guideId}/shifts/{shiftId}',
  secrets: [sendgridKey]
}, async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const shiftId = event.params.shiftId;
  
  // Solo procesar cambios de disponibilidad
  const relevantChange = 
    (before.estado === 'LIBRE' && after.estado === 'NO_DISPONIBLE') ||
    (before.estado === 'NO_DISPONIBLE' && after.estado === 'LIBRE');
  
  if (!relevantChange) {
    return null;
  }
  
  const fecha = after.fecha;
  const slot = after.slot;
  
  // Solo alertar MAÑANA o grupo TARDE (T1+T2+T3)
  if (!['MAÑANA', 'T1', 'T2', 'T3'].includes(slot)) {
    return null;
  }
  
  try {
    await checkAndAlertAvailability(fecha, slot);
  } catch (error) {
    logger.error('Error checking availability', { error: error.message, fecha, slot });
  }
  
  return null;
});

async function checkAndAlertAvailability(fecha, slot) {
  const db = getFirestore();
  
  // Obtener guías activos
  const guidesSnapshot = await db.collection('guides')
    .where('estado', '==', 'activo')
    .get();
  
  if (guidesSnapshot.empty) {
    logger.info('No active guides');
    return;
  }
  
  const totalGuides = guidesSnapshot.size;
  
  // Determinar slots a verificar
  let slotsToCheck = [];
  if (slot === 'MAÑANA') {
    slotsToCheck = ['MAÑANA'];
  } else {
    // Para tarde, verificar los 3 slots
    slotsToCheck = ['T1', 'T2', 'T3'];
  }
  
  // Contar cuántos guías tienen TODOS los slots bloqueados
  let guidesBlocked = 0;
  
  for (const guideDoc of guidesSnapshot.docs) {
    const guideId = guideDoc.id;
    let allSlotsBlocked = true;
    
    for (const slotToCheck of slotsToCheck) {
      const shiftId = `${fecha}_${slotToCheck}`;
      const shiftDoc = await db.collection('guides').doc(guideId)
        .collection('shifts').doc(shiftId).get();
      
      if (!shiftDoc.exists || shiftDoc.data().estado !== 'NO_DISPONIBLE') {
        allSlotsBlocked = false;
        break;
      }
    }
    
    if (allSlotsBlocked) {
      guidesBlocked++;
    }
  }
  
  logger.info('Availability check', { 
    fecha, 
    slot, 
    totalGuides, 
    guidesBlocked 
  });
  
  // ALERTA: Todos bloqueados
  if (guidesBlocked === totalGuides) {
    await sendManagerAlert(fecha, slot, 'BLOCKED');
  }
  // ALERTA: Recuperación disponibilidad
  else if (guidesBlocked < totalGuides) {
    // Verificar si antes estaba 100% bloqueado
    const wasFullyBlocked = await checkPreviousBlockedState(fecha, slot);
    if (wasFullyBlocked) {
      await sendManagerAlert(fecha, slot, 'AVAILABLE');
    }
  }
}

async function checkPreviousBlockedState(fecha, slot) {
  // Simplificación: verificar notificaciones previas
  const db = getFirestore();
  const recentAlert = await db.collection('availability_alerts')
    .where('fecha', '==', fecha)
    .where('slot', '==', slot)
    .where('tipo', '==', 'BLOCKED')
    .where('createdAt', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
    .limit(1)
    .get();
  
  return !recentAlert.empty;
}

async function sendManagerAlert(fecha, slot, tipo) {
  const db = getFirestore();
  
  sgMail.setApiKey(sendgridKey.value());
  
  const dateObj = new Date(fecha + 'T12:00:00');
  const fechaLegible = dateObj.toLocaleDateString('es-ES', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  const slotNombre = slot === 'MAÑANA' ? 'MAÑANA' : 'TARDE';
  
  let subject, body;
  
  if (tipo === 'BLOCKED') {
    subject = `⚠️ Sin guías disponibles - ${slotNombre} ${fecha}`;
    body = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">⚠️ Alerta: Sin Guías Disponibles</h2>
        </div>
        <div style="padding: 20px; background-color: #f9fafb; border-radius: 0 0 8px 8px;">
          <p>Todos los guías han bloqueado el siguiente turno:</p>
          <div style="background: white; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 5px 0;"><strong>Fecha:</strong> ${fechaLegible}</p>
            <p style="margin: 5px 0;"><strong>Turno:</strong> ${slotNombre}</p>
          </div>
          <p style="color: #dc2626; font-weight: bold;">Acción requerida: Verificar disponibilidad de guías</p>
        </div>
        <div style="padding: 10px; text-align: center; color: #999; font-size: 12px;">
          Spain Food Sherpas - Sistema de Gestión de Turnos
        </div>
      </div>
    `;
  } else {
    subject = `✅ Guía disponible - ${slotNombre} ${fecha}`;
    body = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #059669; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">✅ Disponibilidad Recuperada</h2>
        </div>
        <div style="padding: 20px; background-color: #f9fafb; border-radius: 0 0 8px 8px;">
          <p>Un guía ha liberado el siguiente turno:</p>
          <div style="background: white; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 5px 0;"><strong>Fecha:</strong> ${fechaLegible}</p>
            <p style="margin: 5px 0;"><strong>Turno:</strong> ${slotNombre}</p>
          </div>
          <p style="color: #059669; font-weight: bold;">El turno vuelve a tener guías disponibles</p>
        </div>
        <div style="padding: 10px; text-align: center; color: #999; font-size: 12px;">
          Spain Food Sherpas - Sistema de Gestión de Turnos
        </div>
      </div>
    `;
  }
  
  const msg = {
    to: MANAGER_EMAIL,
    from: { email: FROM_EMAIL, name: FROM_NAME },
    subject: subject,
    html: body
  };
  
  await sgMail.send(msg);
  
  // Registrar alerta
  await db.collection('availability_alerts').add({
    fecha: fecha,
    slot: slot,
    tipo: tipo,
    emailTo: MANAGER_EMAIL,
    createdAt: new Date()
  });
  
  logger.info('Manager alert sent', { fecha, slot, tipo });
}