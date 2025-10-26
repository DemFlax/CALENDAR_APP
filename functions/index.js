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
      let userRecord;
      try {
        userRecord = await getAuth().getUserByEmail(after.email);
        logger.info('Usuario Auth existe - generando reset link', { uid: userRecord.uid });
      } catch (authError) {
        if (authError.code === 'auth/user-not-found') {
          userRecord = await getAuth().createUser({
            email: after.email,
            emailVerified: false,
            disabled: false
          });
          logger.info('Usuario Auth creado', { uid: userRecord.uid });
        } else {
          throw authError;
        }
      }

      await getAuth().setCustomUserClaims(userRecord.uid, {
        role: 'guide',
        guideId: guideId
      });

      await getFirestore().collection('guides').doc(guideId).update({
        uid: userRecord.uid,
        updatedAt: FieldValue.serverTimestamp()
      });
      
      sgMail.setApiKey(sendgridKey.value());
      const firebaseLink = await getAuth().generatePasswordResetLink(after.email);
      const urlObj = new URL(firebaseLink);
      const oobCode = urlObj.searchParams.get('oobCode');
      const directLink = `${APP_URL}/set-password.html?mode=resetPassword&oobCode=${oobCode}`;
      
      logger.info('Link generado para reactivación', { email: after.email });
     
      const msg = {
        to: after.email,
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject: 'Reactivación - Calendario Tours Spain Food Sherpas',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Cuenta Reactivada</h2>
            <p>Hola ${after.nombre || ''},</p>
            <p>Tu cuenta ha sido reactivada en Spain Food Sherpas.</p>
            <p>Para establecer tu nueva contraseña, haz clic aquí:</p>
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
// FUNCIÓN: assignShiftsToGuide
// =========================================
exports.assignShiftsToGuide = onCall(async (request) => {
  const { guideId, fecha, turno, eventId, tourName, startTime } = request.data;
  
  if (!guideId || !fecha || !turno) {
    throw new HttpsError('invalid-argument', 'guideId, fecha y turno son obligatorios');
  }

  const db = getFirestore();
  const slots = turno === 'MAÑANA' ? ['MAÑANA'] : ['T1', 'T2', 'T3'];
  
  try {
    const batch = db.batch();
    
    for (const slot of slots) {
      const shiftId = `${fecha}_${slot}`;
      const shiftRef = db.collection('guides').doc(guideId).collection('shifts').doc(shiftId);
      
      batch.update(shiftRef, {
        estado: 'ASIGNADO',
        eventId: eventId || null,
        tourName: tourName || null,
        startTime: startTime || null,
        updatedAt: FieldValue.serverTimestamp()
      });
    }
    
    await batch.commit();
    
    logger.info('Shifts asignados', { guideId, fecha, turno, slots });
    
    return { 
      success: true, 
      message: `${slots.length} shift(s) asignado(s) correctamente`,
      slots: slots
    };
    
  } catch (error) {
    logger.error('Error assignShiftsToGuide', { error: error.message, guideId, fecha, turno });
    throw new HttpsError('internal', `Error: ${error.message}`);
  }
});

// =========================================
// FUNCIÓN: deleteShiftAssignment
// =========================================
exports.deleteShiftAssignment = onCall(async (request) => {
  const { guideId, fecha, turno } = request.data;
  
  if (!guideId || !fecha || !turno) {
    throw new HttpsError('invalid-argument', 'guideId, fecha y turno son obligatorios');
  }

  const db = getFirestore();
  const slots = turno === 'MAÑANA' ? ['MAÑANA'] : ['T1', 'T2', 'T3'];
  
  try {
    const batch = db.batch();
    
    for (const slot of slots) {
      const shiftId = `${fecha}_${slot}`;
      const shiftRef = db.collection('guides').doc(guideId).collection('shifts').doc(shiftId);
      
      batch.update(shiftRef, {
        estado: 'LIBRE',
        eventId: FieldValue.delete(),
        tourName: FieldValue.delete(),
        startTime: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp()
      });
    }
    
    await batch.commit();
    
    logger.info('Asignación eliminada', { guideId, fecha, turno, slots });
    
    return { 
      success: true, 
      message: `${slots.length} shift(s) liberado(s) correctamente`,
      slots: slots
    };
    
  } catch (error) {
    logger.error('Error deleteShiftAssignment', { error: error.message, guideId, fecha, turno });
    throw new HttpsError('internal', `Error: ${error.message}`);
  }
});

// =========================================
// FUNCIÓN: generateShifts
// =========================================
exports.generateShifts = onCall(async (request) => {
  const { guideId, year, month } = request.data;
  
  if (!guideId || year === undefined || month === undefined) {
    throw new HttpsError('invalid-argument', 'guideId, year y month son obligatorios');
  }

  try {
    const created = await generateMonthShifts(guideId, year, month);
    logger.info('Shifts generados', { guideId, year, month, created });
    
    return { 
      success: true, 
      message: `${created} shifts creados para ${year}-${String(month + 1).padStart(2, '0')}`,
      created 
    };
    
  } catch (error) {
    logger.error('Error generateShifts', { error: error.message, guideId, year, month });
    throw new HttpsError('internal', `Error: ${error.message}`);
  }
});

// =========================================
// FUNCIÓN: deleteShifts
// =========================================
exports.deleteShifts = onCall(async (request) => {
  const { guideId, year, month } = request.data;
  
  if (!guideId || year === undefined || month === undefined) {
    throw new HttpsError('invalid-argument', 'guideId, year y month son obligatorios');
  }

  try {
    await deleteMonthShifts(guideId, year, month);
    logger.info('Shifts eliminados', { guideId, year, month });
    
    return { 
      success: true, 
      message: `Shifts eliminados para ${year}-${String(month + 1).padStart(2, '0')}`
    };
    
  } catch (error) {
    logger.error('Error deleteShifts', { error: error.message, guideId, year, month });
    throw new HttpsError('internal', `Error: ${error.message}`);
  }
});

// =========================================
// FUNCIÓN: saveBookeoId
// =========================================
exports.saveBookeoId = onRequest({ cors: true }, async (req, res) => {
  try {
    const { fecha, slot, bookeoId } = req.body;
    
    if (!fecha || !slot || !bookeoId) {
      res.status(400).json({ error: 'fecha, slot y bookeoId son requeridos' });
      return;
    }

    const db = getFirestore();
    const shiftId = `${fecha}_${slot}`;
    
    await db.collection('bookeo_blocks').doc(shiftId).set({
      fecha,
      slot,
      bookeoId,
      status: 'BLOCKED',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    
    logger.info('BookeoId guardado', { shiftId, bookeoId });
    
    res.json({ success: true, shiftId, bookeoId });
    
  } catch (error) {
    logger.error('Error saveBookeoId', { error: error.message });
    res.status(500).json({ error: error.message });
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
// FUNCIÓN: assignGuideClaims
// =========================================
exports.assignGuideClaims = onRequest({ cors: true }, async (req, res) => {
  try {
    const { uid, guideId } = req.body;
    if (!uid || !guideId) {
      res.status(400).json({ error: 'uid y guideId requeridos' });
      return;
    }
    await getAuth().setCustomUserClaims(uid, { role: 'guide', guideId: guideId });
    await getFirestore().collection('guides').doc(guideId).update({
      uid: uid,
      updatedAt: FieldValue.serverTimestamp()
    });
    logger.info('Claims assigned', { uid, guideId });
    res.json({ success: true });
  } catch (error) {
    logger.error('Error assigning claims', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// =========================================
// FUNCIÓN: setManagerClaims
// =========================================
exports.setManagerClaims = onRequest(async (req, res) => {
  try {
    const email = req.body.email || MANAGER_EMAIL;
    const user = await getAuth().getUserByEmail(email);
    await getAuth().setCustomUserClaims(user.uid, { role: 'manager' });
    res.json({ success: true, uid: user.uid });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =========================================
// FUNCIÓN: devSetPassword
// =========================================
exports.devSetPassword = onRequest(async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await getAuth().getUserByEmail(email);
    await getAuth().updateUser(user.uid, { password });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =========================================
// BOOKEO RATE LIMITING MODULE
// =========================================
const bookeoRL = require('./bookeo-rate-limiting');
exports.bookeoWebhookWorker = bookeoRL.bookeoWebhookWorker;
exports.enqueueBookeoWebhook = bookeoRL.enqueueBookeoWebhook;

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