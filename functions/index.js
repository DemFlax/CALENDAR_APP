const {onDocumentCreated} = require('firebase-functions/v2/firestore');
const {onRequest} = require('firebase-functions/v2/https');
const {defineSecret, defineString} = require('firebase-functions/params');
const {initializeApp} = require('firebase-admin/app');
const {getAuth} = require('firebase-admin/auth');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');
const {logger} = require('firebase-functions');
const nodemailer = require('nodemailer');

initializeApp();

const gmailEmail = defineSecret('GMAIL_EMAIL');
const gmailPassword = defineSecret('GMAIL_APP_PASSWORD');
const appUrl = defineString('APP_URL', {default: 'https://calendar-app-tours.web.app'});

exports.onCreateGuide = onDocumentCreated({
  document: 'guides/{guideId}',
  secrets: [gmailEmail, gmailPassword]
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
    
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailEmail.value(),
        pass: gmailPassword.value()
      }
    });
    
    // Generar link Firebase
    const firebaseLink = await getAuth().generatePasswordResetLink(guide.email);
    
    // Extraer oobCode
    const urlObj = new URL(firebaseLink);
    const oobCode = urlObj.searchParams.get('oobCode');
    
    // Crear link directo a tu página
    const directLink = `${appUrl.value()}/set-password.html?mode=resetPassword&oobCode=${oobCode}`;
    
    logger.info('Link generado', { email: guide.email, oobCode: oobCode.substring(0, 10) + '...' });
   
    const mailOptions = {
      from: `Spain Food Sherpas <${gmailEmail.value()}>`,
      to: guide.email,
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
   
    await transporter.sendMail(mailOptions);
    logger.info('Email enviado', { email: guide.email });
   
    await getFirestore().collection('notifications').add({
      guiaId: guideId,
      tipo: 'INVITACION',
      emailTo: guide.email,
      invitationLink: directLink,
      status: 'sent',
      createdAt: FieldValue.serverTimestamp()
    });
    
  } catch (error) {
    logger.error('Error onCreateGuide', { 
      error: error.message,
      guideId
    });
    
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

exports.assignGuideClaims = onRequest({
  cors: true
}, async (req, res) => {
  try {
    const { uid, guideId } = req.body;

    if (!uid || !guideId) {
      res.status(400).json({ error: 'uid y guideId requeridos' });
      return;
    }

    await getAuth().setCustomUserClaims(uid, {
      role: 'guide',
      guideId: guideId
    });

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

exports.setManagerClaims = onRequest(async (req, res) => {
  try {
    const email = req.body.email || 'madrid@spainfoodsherpas.com';
    const user = await getAuth().getUserByEmail(email);
   
    await getAuth().setCustomUserClaims(user.uid, {
      role: 'manager'
    });
   
    res.json({ success: true, uid: user.uid });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

exports.seedInitialShifts = onRequest(async (req, res) => {
  try {
    const shiftsSnapshot = await getFirestore().collection('shifts').limit(1).get();
   
    if (!shiftsSnapshot.empty) {
      return res.json({ message: 'Shifts already exist', count: 0 });
    }
   
    const batch = getFirestore().batch();
    const slots = ['MAÑANA', 'T1', 'T2', 'T3'];
    const today = new Date();
    let count = 0;
   
    for (let monthOffset = 0; monthOffset < 3; monthOffset++) {
      const targetDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
      const year = targetDate.getFullYear();
      const month = targetDate.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
     
      for (let day = 1; day <= daysInMonth; day++) {
        const fecha = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
       
        slots.forEach(slot => {
          const docId = `${fecha}_${slot}`;
          const shiftRef = getFirestore().collection('shifts').doc(docId);
          batch.set(shiftRef, {
            fecha: fecha,
            slot: slot,
            estado: 'LIBRE',
            guiaId: null,
            createdAt: FieldValue.serverTimestamp()
          });
          count++;
        });
      }
    }
   
    await batch.commit();
    res.json({ success: true, shiftsCreated: count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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

const { generateMonthlyShifts } = require('./src/generateMonthlyShifts');
exports.generateMonthlyShifts = generateMonthlyShifts;

const { onUpdateShift } = require('./src/onUpdateShift');
exports.onUpdateShift = onUpdateShift;