const admin = require('firebase-admin');
const serviceAccount = require('C:/SHERPAS_CALENDAR/Kyes/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function fixClaims() {
  const email = 'leadtoshopsl@gmail.com';
  const uid = 'XBvlKx8aRUWkVVD9ibgBSvIOaSi1';
  
  // 1. Get guide doc
  const guidesSnapshot = await admin.firestore()
    .collection('guides')
    .where('email', '==', email)
    .get();
    
  if (guidesSnapshot.empty) {
    console.error('❌ Guía no encontrado');
    process.exit(1);
  }
  
  const guideId = guidesSnapshot.docs[0].id;
  console.log('📋 Guide ID:', guideId);
  
  // 2. Set claims
  await admin.auth().setCustomUserClaims(uid, {
    role: 'guide',
    guideId: guideId
  });
  
  // 3. Update guide doc
  await admin.firestore().collection('guides').doc(guideId).update({
    uid: uid,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  
  console.log('✅ Claims asignados correctamente');
  console.log('   UID:', uid);
  console.log('   guideId:', guideId);
  console.log('   role: guide');
  
  process.exit(0);
}

fixClaims().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});