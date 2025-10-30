// =========================================
// Script: Generar turnos para Mateo
// Uso: node fix-mateo-shifts.js
// =========================================

const admin = require('firebase-admin');
// Línea 2, cambiar:
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Función auxiliar (copiada de index.js)
async function generateMonthShifts(guideId, year, month) {
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
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      created++;
    }
  }
  
  await batch.commit();
  return created;
}

// Ejecutar
async function fixMateoShifts() {
  const guideId = 'yoPCWsXeULb1Bzhy0twH'; // Mateo José
  
  console.log('🔄 Generando turnos para Mateo...');
  
  const today = new Date();
  let totalCreated = 0;
  
  for (let monthOffset = 0; monthOffset < 3; monthOffset++) {
    const targetDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth();
    
    console.log(`📅 Generando mes ${monthOffset + 1}/3: ${year}-${String(month + 1).padStart(2, '0')}`);
    
    const created = await generateMonthShifts(guideId, year, month);
    totalCreated += created;
    
    console.log(`   ✅ Creados ${created} turnos`);
  }
  
  console.log(`\n✅ COMPLETADO: ${totalCreated} turnos generados para Mateo`);
  process.exit(0);
}

fixMateoShifts().catch(error => {
  console.error('❌ ERROR:', error);
  process.exit(1);
});