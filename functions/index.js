const {onDocumentCreated} = require('firebase-functions/v2/firestore');
const {onRequest} = require('firebase-functions/v2/https');
const {initializeApp} = require('firebase-admin/app');
const {getAuth} = require('firebase-admin/auth');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');

initializeApp();

exports.onCreateGuide = onDocumentCreated('guides/{guideId}', async (event) => {
  const guide = event.data.data();
  const guideId = event.params.guideId;
  
  try {
    const userRecord = await getAuth().createUser({
      email: guide.email,
      emailVerified: false
    });
    
    await getAuth().setCustomUserClaims(userRecord.uid, {
      role: 'guide',
      guideId: guideId
    });
    
    const link = await getAuth().generatePasswordResetLink(guide.email);
    
    await getFirestore().collection('notifications').add({
      guiaId: guideId,
      tipo: 'INVITACION',
      emailTo: guide.email,
      invitationLink: link,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp()
    });
    
    console.log(`Usuario Auth creado: ${guide.email}`);
  } catch (error) {
    console.error('Error onCreate guide:', error);
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
    
    // Crear 3 meses
    for (let monthOffset = 0; monthOffset < 3; monthOffset++) {
      const date = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
      const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      
      for (let day = 1; day <= daysInMonth; day++) {
        const fecha = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        slots.forEach(slot => {
          const docRef = getFirestore().collection('shifts').doc(`${fecha}_${slot}`);
          batch.set(docRef, {
            fecha,
            slot,
            estado: 'LIBRE',
            guiaId: null,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
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