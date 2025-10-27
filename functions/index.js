// =========================================
// CARGAR VARIABLES DE ENTORNO (.env)
// =========================================
require('dotenv').config();

// =========================================
// IMPORTS
// =========================================
const {onDocumentCreated, onDocumentUpdated} = require('firebase-functions/v2/firestore');
const {onRequest, onCall, HttpsError} = require('firebase-functions/v2/https');
const {onSchedule} = require('firebase-functions/v2/scheduler');
const {defineSecret} = require('firebase-functions/params');
const {initializeApp} = require('firebase-admin/app');
const {getAuth} = require('firebase-admin/auth');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');
const {logger} = require('firebase-functions');
const sgMail = require('@sendgrid/mail');
const axios = require('axios');

initializeApp();

// =========================================
// SECRETS (Secret Manager)
// =========================================
const sendgridKey = defineSecret('SENDGRID_API_KEY');

// =========================================
// VARIABLES DE ENTORNO (.env)
// =========================================
const APP_URL = process.env.APP_URL || 'https://calendar-app-tours.web.app';
const MANAGER_EMAIL = process.env.MANAGER_EMAIL || 'madrid@spainfoodsherpas.com';
const FROM_EMAIL = 'madrid@spainfoodsherpas.com';
const FROM_NAME = 'Spain Food Sherpas';
const ZAPIER_WEBHOOK_URL = process.env.ZAPIER_WEBHOOK_URL;

const SLOT_TIMES = {
  'MAÑANA': '12:00',
  'T1': '17:15',
  'T2': '18:15',
  'T3': '19:15'
};

// =========================================
// FUNCIÓN AUXILIAR: generateMonthShifts
// =========================================
async function generateMonthShifts(guideId, year, month) {
  const db = getFirestore();
  const slots = ['MAÑANA', 'T1', 'T2', 'T3'];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  const batch = db.batch();
  let created = 0;
  
  for (let day = 1; day <= daysInMonth; day++) {
    const fecha = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    for (const slot of slots) {
      const docId = `${fecha}_${slot}`;
      const docRef = db.collection('guides').doc(guideId).collection('shifts').doc(docId);
      
      batch.set(docRef, {
        fecha,
        slot,
        estado: 'LIBRE',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
      created++;
    }
  }
  
  await batch.commit();
  return created;
}

// =========================================
// FUNCIÓN AUXILIAR: deleteMonthShifts
// =========================================
async function deleteMonthShifts(guideId, year, month) {
  const db = getFirestore();
  const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`;
  
  const shiftsRef = db.collection('guides').doc(guideId).collection('shifts');
  const query = shiftsRef
    .where('fecha', '>=', startDate)
    .where('fecha', '<=', endDate)
    .limit(500);
  
  return new Promise((resolve, reject) => {
    deleteQueryBatch(db, query, resolve, reject);
  });
}

async function deleteQueryBatch(db, query, resolve, reject) {
  try {
    const snapshot = await query.get();
    
    if (snapshot.size === 0) {
      resolve();
      return;
    }
    
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    
    process.nextTick(() => {
      deleteQueryBatch(db, query, resolve, reject);
    });
  } catch (error) {
    reject(error);
  }
}

// =========================================
// FUNCIÓN: onCreateGuide
// =========================================
exports.onCreateGuide = onDocumentCreated({
  document: 'guides/{guideId}',
  secrets: [sendgridKey]
}, async (event) => {
  const guide = event.data.data();
  const guideId = event.params.guideId;
 
  try {
    const userRecord = await getAuth().createUser({
      email: guide.email,
      emailVerified: false,
      disabled: false
    });
    
    logger.info('Usuario Auth creado', { uid: userRecord.uid, email: guide.email });

    await getAuth().setCustomUserClaims(userRecord.uid, {
      role: 'guide',
      guideId: guideId
    });

    await getFirestore().collection('guides').doc(guideId).update({
      uid: userRecord.uid,
      updatedAt: FieldValue.serverTimestamp()
    });
    
    sgMail.setApiKey(sendgridKey.value());
    const firebaseLink = await getAuth().generatePasswordResetLink(guide.email);
    const urlObj = new URL(firebaseLink);
    const oobCode = urlObj.searchParams.get('oobCode');
    const directLink = `${APP_URL}/set-password.html?mode=resetPassword&oobCode=${oobCode}`;
    
    logger.info('Link generado', { email: guide.email, oobCode: oobCode.substring(0, 10) + '...' });
   
    const msg = {
      to: guide.email,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject: 'Invitación - Calendario Tours Spain Food Sherpas',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Bienvenido a Spain Food Sherpas</h2>
          <p>Hola ${guide.nombre || ''},</p>
          <p>Has sido invitado a unirte al equipo de guías turísticos.</p>
          <p>Para completar tu registro, establece tu contraseña:</p>
          <div style="margin: 20px 0;">
            <a href="${directLink}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
              Establecer Contraseña
            </a>
          </div>
          <p>O copia y pega este enlace:</p>
          <p style="word-break: break-all; color: #666; background: #f5f5f5; padding: 10px; border-radius: 4px;">${directLink}</p>
          <p><small>Este enlace expira en 1 hora.</small></p>
          <hr style="border: 1px solid #eee; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">Spain Food Sherpas - Madrid</p>
        </div>
      `
    };
   
    await sgMail.send(msg);
    logger.info('Email enviado vía SendGrid', { email: guide.email });
   
    await getFirestore().collection('notifications').add({
      guiaId: guideId,
      tipo: 'INVITACION',
      emailTo: guide.email,
      invitationLink: directLink,
      status: 'sent',
      createdAt: FieldValue.serverTimestamp()
    });
    
  } catch (error) {
    logger.error('Error onCreateGuide', { error: error.message, guideId });
    await getFirestore().collection('notifications').add({
      guiaId: guideId,
      tipo: 'INVITACION',
      emailTo: guide.email,
      status: 'failed',
      errorMessage: error.message,
      createdAt: FieldValue.serverTimestamp()
    });
  }
});

// =========================================
// FUNCIÓN: onUpdateGuide (reactivación guías)
// =========================================
exports.onUpdateGuide = onDocumentUpdated({
  document: 'guides/{guideId}',
  secrets: [sendgridKey]
}, async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const guideId = event.params.guideId;
  
  if (before.estado === 'inactivo' && after.estado === 'activo') {
    logger.info('Guía reactivado - enviando email invitación', { guideId, email: after.email });
    
    try {
      const user = await getAuth().getUserByEmail(after.email);
      
      if (user.disabled) {
        await getAuth().updateUser(user.uid, { disabled: false });
        logger.info('Usuario reactivado en Auth', { uid: user.uid });
      }
      
      const firebaseLink = await getAuth().generatePasswordResetLink(after.email);
      const urlObj = new URL(firebaseLink);
      const oobCode = urlObj.searchParams.get('oobCode');
      const directLink = `${APP_URL}/set-password.html?mode=resetPassword&oobCode=${oobCode}`;
      
      sgMail.setApiKey(sendgridKey.value());
      const msg = {
        to: after.email,
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject: '¡Bienvenido de nuevo! - Spain Food Sherpas',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">¡Bienvenido de nuevo!</h2>
            <p>Hola ${after.nombre || ''},</p>
            <p>Tu cuenta ha sido reactivada.</p>
            <p>Establece una nueva contraseña para acceder:</p>
            <div style="margin: 20px 0;">
              <a href="${directLink}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
                Establecer Contraseña
              </a>
            </div>
            <p>O copia y pega este enlace:</p>
            <p style="word-break: break-all; color: #666; background: #f5f5f5; padding: 10px; border-radius: 4px;">${directLink}</p>
            <p><small>Este enlace expira en 1 hora.</small></p>
            <hr style="border: 1px solid #eee; margin: 20px 0;">
            <p style="color: #999; font-size: 12px;">Spain Food Sherpas - Madrid</p>
          </div>
        `
      };
      
      await sgMail.send(msg);
      logger.info('Email reactivación enviado', { email: after.email });
      
      await getFirestore().collection('notifications').add({
        guiaId: guideId,
        tipo: 'REACTIVACION',
        emailTo: after.email,
        invitationLink: directLink,
        status: 'sent',
        createdAt: FieldValue.serverTimestamp()
      });
      
    } catch (error) {
      logger.error('Error onUpdateGuide reactivación', { error: error.message, guideId });
      await getFirestore().collection('notifications').add({
        guiaId: guideId,
        tipo: 'REACTIVACION',
        emailTo: after.email,
        status: 'failed',
        errorMessage: error.message,
        createdAt: FieldValue.serverTimestamp()
      });
    }
  }
});

// =========================================
// FUNCIÓN: onMonthToggle
// =========================================
exports.onMonthToggle = onDocumentUpdated({
  document: 'guides/{guideId}'
}, async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const guideId = event.params.guideId;
  
  const beforeMonths = before.habilitado || [];
  const afterMonths = after.habilitado || [];
  
  const added = afterMonths.filter(m => !beforeMonths.includes(m));
  const removed = beforeMonths.filter(m => !afterMonths.includes(m));
  
  try {
    for (const month of added) {
      const [year, monthIndex] = month.split('-').map(Number);
      const count = await generateMonthShifts(guideId, year, monthIndex - 1);
      logger.info('Mes habilitado - shifts creados', { guideId, month, count });
    }
    
    for (const month of removed) {
      const [year, monthIndex] = month.split('-').map(Number);
      await deleteMonthShifts(guideId, year, monthIndex - 1);
      logger.info('Mes deshabilitado - shifts eliminados', { guideId, month });
    }
    
  } catch (error) {
    logger.error('Error onMonthToggle', { error: error.message, guideId });
  }
});

// =========================================
// FUNCIÓN: onManagerAssignShift
// =========================================
exports.onManagerAssignShift = onDocumentUpdated({
  document: 'guides/{guideId}/shifts/{shiftId}'
}, async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const guideId = event.params.guideId;
  const shiftId = event.params.shiftId;
  
  if (before.estado !== 'OCUPADO' && after.estado === 'OCUPADO') {
    logger.info('Manager asignó turno', { guideId, shiftId });
    
    try {
      const db = getFirestore();
      const guideDoc = await db.collection('guides').doc(guideId).get();
      const guide = guideDoc.data();
      
      if (!guide) {
        logger.error('Guía no encontrado', { guideId });
        return;
      }
      
      const { fecha, slot } = after;
      const allGuidesQuery = await db.collection('guides')
        .where('estado', '==', 'activo')
        .get();
      
      const totalGuides = allGuidesQuery.size;
      let unavailableCount = 0;
      
      for (const doc of allGuidesQuery.docs) {
        const shiftRef = db.collection('guides').doc(doc.id).collection('shifts').doc(shiftId);
        const shiftDoc = await shiftRef.get();
        
        if (shiftDoc.exists) {
          const shiftData = shiftDoc.data();
          if (shiftData.estado === 'NO_DISPONIBLE' || shiftData.estado === 'OCUPADO') {
            unavailableCount++;
          }
        }
      }
      
      logger.info('Estado disponibilidad', { 
        fecha, 
        slot, 
        totalGuides, 
        unavailableCount,
        availableCount: totalGuides - unavailableCount 
      });
      
      if (unavailableCount >= totalGuides && ZAPIER_WEBHOOK_URL) {
        logger.info('Todos los guías no disponibles - enviando webhook BLOQUEAR', { 
          fecha, 
          slot,
          totalGuides,
          unavailableCount
        });
        
        try {
          const response = await axios.post(ZAPIER_WEBHOOK_URL, {
            action: 'BLOQUEAR',
            fecha: fecha,
            slot: slot,
            startTime: SLOT_TIMES[slot] || 'unknown',
            totalGuides: totalGuides,
            unavailableCount: unavailableCount,
            availableCount: 0
          }, {
            headers: {
              'Content-Type': 'application/json'
            },
            timeout: 30000
          });
          
          logger.info('Webhook BLOQUEAR enviado exitosamente', { 
            fecha, 
            slot,
            bookeoId: response.data?.bookeoId 
          });
          
          if (response.data?.bookeoId) {
            await db.collection('bookeo_blocks').doc(shiftId).set({
              fecha,
              slot,
              bookeoId: response.data.bookeoId,
              status: 'BLOCKED',
              blockedAt: FieldValue.serverTimestamp(),
              totalGuides,
              unavailableCount,
              webhookResponse: response.data
            });
            
            logger.info('BookeoId guardado en bookeo_blocks', { 
              shiftId, 
              bookeoId: response.data.bookeoId 
            });
          }
          
        } catch (webhookError) {
          logger.error('Error enviando webhook BLOQUEAR', { 
            fecha, 
            slot,
            error: webhookError.message 
          });
        }
      }
      
      await db.collection('notifications').add({
        tipo: 'MANAGER_ASIGNACION',
        guideId,
        guideName: guide.nombre,
        fecha,
        slot,
        startTime: SLOT_TIMES[slot] || 'unknown',
        totalGuides,
        unavailableCount,
        availableCount: totalGuides - unavailableCount,
        webhookSent: unavailableCount >= totalGuides && !!ZAPIER_WEBHOOK_URL,
        createdAt: FieldValue.serverTimestamp()
      });
      
    } catch (error) {
      logger.error('Error onManagerAssignShift', { 
        error: error.message, 
        guideId, 
        shiftId 
      });
    }
  }
});

// =========================================
// FUNCIÓN: onShiftUpdate
// =========================================
exports.onShiftUpdate = onDocumentUpdated({
  document: 'guides/{guideId}/shifts/{shiftId}',
  secrets: [sendgridKey]
}, async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const guideId = event.params.guideId;
  const shiftId = event.params.shiftId;
  
  if (before.estado === 'NO_DISPONIBLE' && after.estado === 'LIBRE') {
    logger.info('Guía marcó disponibilidad LIBRE', { guideId, shiftId });
    
    try {
      const db = getFirestore();
      const { fecha, slot } = after;
      
      const allGuidesQuery = await db.collection('guides')
        .where('estado', '==', 'activo')
        .get();
      
      const totalGuides = allGuidesQuery.size;
      let unavailableCount = 0;
      
      for (const doc of allGuidesQuery.docs) {
        const shiftRef = db.collection('guides').doc(doc.id).collection('shifts').doc(shiftId);
        const shiftDoc = await shiftRef.get();
        
        if (shiftDoc.exists) {
          const shiftData = shiftDoc.data();
          if (shiftData.estado === 'NO_DISPONIBLE' || shiftData.estado === 'OCUPADO') {
            unavailableCount++;
          }
        }
      }
      
      const availableCount = totalGuides - unavailableCount;
      
      logger.info('Nueva disponibilidad calculada', {
        fecha,
        slot,
        totalGuides,
        unavailableCount,
        availableCount
      });
      
      const blockDoc = await db.collection('bookeo_blocks').doc(shiftId).get();
      
      if (blockDoc.exists && availableCount > 0) {
        const blockData = blockDoc.data();
        const bookeoId = blockData.bookeoId;
        
        if (bookeoId && ZAPIER_WEBHOOK_URL) {
          logger.info('Hay guías disponibles - enviando webhook DESBLOQUEAR', {
            fecha,
            slot,
            bookeoId,
            availableCount
          });
          
          try {
            const response = await axios.post(ZAPIER_WEBHOOK_URL, {
              action: 'DESBLOQUEAR',
              fecha: fecha,
              slot: slot,
              startTime: SLOT_TIMES[slot] || 'unknown',
              totalGuides: totalGuides,
              unavailableCount: unavailableCount,
              availableCount: availableCount,
              bookeoId: bookeoId
            }, {
              headers: {
                'Content-Type': 'application/json'
              },
              timeout: 30000
            });
            
            logger.info('Webhook DESBLOQUEAR exitoso', { fecha, slot, bookeoId });
            
            await db.collection('bookeo_blocks').doc(shiftId).update({
              status: 'UNBLOCKED',
              unlockedAt: FieldValue.serverTimestamp(),
              webhookResponse: response.data
            });
            
            sgMail.setApiKey(sendgridKey.value());
            await sgMail.send({
              to: MANAGER_EMAIL,
              from: { email: FROM_EMAIL, name: FROM_NAME },
              subject: `✅ Guías disponibles: ${fecha} ${slot}`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #059669;">✅ Disponibilidad Restaurada</h2>
                  <p><strong>Fecha:</strong> ${fecha}</p>
                  <p><strong>Turno:</strong> ${slot} (${SLOT_TIMES[slot]})</p>
                  <p><strong>Estado:</strong> ${totalGuides - unavailableCount} de ${totalGuides} guías disponibles</p>
                  <hr style="border: 1px solid #eee; margin: 20px 0;">
                  <p style="color: #666; font-size: 12px;">
                    <a href="${APP_URL}" style="color: #3b82f6;">Ver Dashboard</a>
                  </p>
                </div>
              `
            });
            
            logger.info('Email DESBLOQUEO enviado al manager', { to: MANAGER_EMAIL });
            
          } catch (webhookError) {
            logger.error('Error webhook DESBLOQUEAR', { 
              fecha, 
              slot, 
              bookeoId,
              error: webhookError.message 
            });
            
            await sgMail.send({
              to: MANAGER_EMAIL,
              from: { email: FROM_EMAIL, name: FROM_NAME },
              subject: `⚠️ ERROR Desbloqueo Bookeo: ${fecha} ${slot}`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #dc2626;">⚠️ Error Desbloqueo Bookeo</h2>
                  <p><strong>Fecha:</strong> ${fecha}</p>
                  <p><strong>Turno:</strong> ${slot} (${SLOT_TIMES[slot]})</p>
                  <p><strong>BookeoId:</strong> ${bookeoId}</p>
                  <p><strong>Error:</strong> ${webhookError.message}</p>
                  <p style="color: #dc2626; font-weight: bold;">ACCIÓN REQUERIDA: Desbloquear manualmente en Bookeo</p>
                  <hr style="border: 1px solid #eee; margin: 20px 0;">
                  <p style="color: #666; font-size: 12px;">
                    <a href="${APP_URL}" style="color: #3b82f6;">Ver Dashboard</a>
                  </p>
                </div>
              `
            });
          }
        }
        
        await db.collection('notifications').add({
          tipo: 'BOOKEO_UNBLOCK',
          fecha,
          slot,
          startTime: SLOT_TIMES[slot],
          totalGuides,
          unavailableCount,
          availableCount: totalGuides - unavailableCount,
          bookeoId,
          managerEmail: MANAGER_EMAIL,
          webhookSent: !!ZAPIER_WEBHOOK_URL,
          action: 'DESBLOQUEAR',
          createdAt: FieldValue.serverTimestamp()
        });
      }
    }
    
  } catch (error) {
    logger.error('Error onShiftUpdate', { 
      error: error.message, 
      shiftId,
      stack: error.stack 
    });
  }
});

// =========================================
// FUNCIÓN: resendInvitation
// =========================================
exports.resendInvitation = onCall({
  secrets: [sendgridKey]
}, async (request) => {
  const { email } = request.data;
  
  if (!email) {
    throw new HttpsError('invalid-argument', 'Email requerido');
  }
  
  try {
    logger.info('Reenviando invitación', { email });
    
    let userRecord;
    try {
      userRecord = await getAuth().getUserByEmail(email);
    } catch (error) {
      throw new HttpsError('not-found', 'Usuario no encontrado');
    }
    
    const firebaseLink = await getAuth().generatePasswordResetLink(email);
    const urlObj = new URL(firebaseLink);
    const oobCode = urlObj.searchParams.get('oobCode');
    const directLink = `${APP_URL}/set-password.html?mode=resetPassword&oobCode=${oobCode}`;
    
    logger.info('Nuevo link generado', { email, oobCode: oobCode.substring(0, 10) + '...' });
    
    sgMail.setApiKey(sendgridKey.value());
    const msg = {
      to: email,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject: 'Nueva invitación - Calendario Tours Spain Food Sherpas',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Nueva invitación</h2>
          <p>Has solicitado un nuevo enlace de invitación.</p>
          <p>Para establecer tu contraseña, haz clic en el siguiente enlace:</p>
          <div style="margin: 20px 0;">
            <a href="${directLink}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
              Establecer Contraseña
            </a>
          </div>
          <p>O copia y pega este enlace:</p>
          <p style="word-break: break-all; color: #666; background: #f5f5f5; padding: 10px; border-radius: 4px;">${directLink}</p>
          <p><small>Este enlace expira en 1 hora.</small></p>
          <hr style="border: 1px solid #eee; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">Spain Food Sherpas - Madrid</p>
        </div>
      `
    };
    
    await sgMail.send(msg);
    logger.info('Email reenviado exitosamente', { email });
    
    return { success: true, message: 'Invitación reenviada correctamente' };
    
  } catch (error) {
    logger.error('Error reenviando invitación', { email, error: error.message });
    throw new HttpsError('internal', `Error: ${error.message}`);
  }
});

// =========================================
// FUNCIÓN: setManagerClaims (REFACTORIZADO)
// =========================================
exports.setManagerClaims = onCall(async (request) => {
  // Validar autenticación
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Usuario debe estar autenticado');
  }
  
  // Validar que solo managers existentes pueden crear nuevos managers
  if (!request.auth.token.role || request.auth.token.role !== 'manager') {
    throw new HttpsError('permission-denied', 'Solo managers existentes pueden asignar rol de manager');
  }
  
  const email = request.data.email || MANAGER_EMAIL;
  
  try {
    const user = await getAuth().getUserByEmail(email);
    await getAuth().setCustomUserClaims(user.uid, { role: 'manager' });
    
    logger.info('Manager claims asignados', { email, uid: user.uid, by: request.auth.uid });
    
    return { success: true, uid: user.uid };
  } catch (error) {
    logger.error('Error asignando manager claims', { error: error.message, email });
    throw new HttpsError('internal', error.message);
  }
});

// =========================================
// VENDOR COSTS MODULE
// =========================================
const vendorCosts = require('./src/vendor-costs');
exports.registerVendorCost = vendorCosts.registerVendorCost;
exports.calculateSalaryPreview = vendorCosts.calculateSalaryPreview;
exports.generateGuideInvoices = vendorCosts.generateGuideInvoices;
exports.approveInvoice = vendorCosts.approveInvoice;
exports.reportInvoiceError = vendorCosts.reportInvoiceError;
exports.managerApproveInvoice = vendorCosts.managerApproveInvoice;