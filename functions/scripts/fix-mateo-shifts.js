// =========================================
// FIX MATEO SHIFTS - VERSIÓN MIGRADA
// =========================================
const { initAdmin, db, FieldValue } = require('../config/admin-config');

initAdmin();

async function generateMonthShifts(guideId, year, month) {
  const slots = ['MAÑANA', 'T1', 'T2', 'T3'];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const batch = db.batch();
  let count = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    for (const slot of slots) {
      const shiftId = `${guideId}_${date}_${slot}`;
      const shiftRef = db.collection('guides').doc(guideId).collection('shifts').doc(shiftId);
      
      batch.set(shiftRef, {
        fecha: date,
        slot: slot,
        estado: 'disponible',
        guideId: guideId,
        createdAt: FieldValue.serverTimestamp()
      }, { merge: true });
      
      count++;
    }
  }

  await batch.commit();
  return count;
}

async function fixMateoShifts() {
  const guideId = 'YU9sn150H5RZfy7IpwVe';
  const months = [
    { year: 2025, month: 9 },
    { year: 2025, month: 10 },
    { year: 2025, month: 11 }
  ];

  console.log('🔄 Generando turnos para Mateo...');

  let totalCount = 0;
  for (let i = 0; i < months.length; i++) {
    const { year, month } = months[i];
    console.log(`📅 Generando mes ${i + 1}/${months.length}: ${year}-${String(month + 1).padStart(2, '0')}`);
    
    const count = await generateMonthShifts(guideId, year, month);
    totalCount += count;
    console.log(`   ✅ Creados ${count} turnos`);
  }

  console.log(`✅ COMPLETADO: ${totalCount} turnos generados para Mateo`);
}

fixMateoShifts()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });