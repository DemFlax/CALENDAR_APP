const {onDocumentCreated} = require('firebase-functions/v2/firestore');
const {onRequest} = require('firebase-functions/v2/https');
const {initializeApp} = require('firebase-admin/app');
const {getAuth} = require('firebase-admin/auth');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');
const {logger} = require('firebase-functions');
const nodemailer = require('nodemailer');

initializeApp();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

exports.onCreateGuide = onDocumentCreated('guides/{guideId}', async (event) => {
  const guide = event.data.data();
  const guideId = event.params.guideId;
 
  try {
    let userRecord;
   
    try {
      userRecord = await getAuth().createUser({
        email: guide.email,
        emailVerified: false
      });
      logger.info('User created', { email: guide.email, uid: userRecord.uid });
    } catch (error) {
      if (error.code === 'auth/email-already-exists') {
        logger.warn('Email already exists, recreating user', { email: guide.email });
        const existingUser = await getAuth().getUserByEmail(guide.email);
        await getAuth().deleteUser(existingUser.uid);
        userRecord = await getAuth().createUser({
          email: guide.email,
          emailVerified: false
        });
      } else {
        throw error;
      }
    }
   
    await getAuth().setCustomUserClaims(userRecord.uid, {
      role: 'guide',
      guideId: guideId
    });
    logger.info('Custom claims set', { guideId });
   
    const actionCodeSettings = {
      url: `${process.env.APP_URL}/set-password.html`,
      handleCodeInApp: false
    };
   
    const link = await getAuth().generatePasswordResetLink(
      guide.email,
      actionCodeSettings
    );
    
    logger.info('Password reset link generated', { email: guide.email });
   
    const mailOptions = {
      from: `Spain Food Sherpas <${process.env.GMAIL_USER}>`,
      to: guide.email,
      subject: 'Invitación - Calendario Tours Spain Food Sherpas',
      html: `
        <p>Hola:</p>
        <p>Bienvenido al equipo de Spain Food Sherpas. Haz clic en este enlace para establecer tu contraseña y acceder al sistema de gestión de turnos:</p>
        <p><a href='${link}'>${link}</a></p>
        <p>El enlace expira en 7 días. Si no has solicitado esta invitación, ignora este correo electrónico.</p>
        <p>Gracias,</p>
        <p>Spain Food Sherpas</p>
      `
    };
   
    await transporter.sendMail(mailOptions);
    logger.info('Email sent successfully', { email: guide.email });
   
    await getFirestore().collection('notifications').add({
      guiaId: guideId,
      tipo: 'INVITACION',
      emailTo: guide.email,
      invitationLink: link,
      status: 'sent',
      createdAt: FieldValue.serverTimestamp()
    });
    
    logger.info('Invitation notification created', { guideId, email: guide.email });
   
  } catch (error) {
    logger.error('Error in onCreateGuide', { 
      error: error.message, 
      stack: error.stack,
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