const admin = require('firebase-admin');
const serviceAccount = require('C:/SHERPAS_CALENDAR/Kyes/serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'calendar-app-tours'
});

const db = admin.firestore();
const SLOTS = ['MAÑANA', 'T1', 'T2', 'T3'];

async function seedShifts() {
  try {
    // 1. Obtener guías activos
    const guidesSnapshot = await db.collection('guides')
      .where('estado', '==', 'activo')
      .get();
    
    if (guidesSnapshot.empty) {
      console.error('❌ No hay guías activos');
      process.exit(1);
    }
    
    const guides = [];
    guidesSnapshot.forEach(doc => guides.push({ id: doc.id, ...doc.data() }));
    console.log(`✅ ${guides.length} guías encontrados`);
    
    // 2. Generar turnos 3 meses
    const today = new Date();
    const batch = db.batch();
    let created = 0;
    let skipped = 0;
    
    for (let monthOffset = 0; monthOffset < 3; monthOffset++) {
      const targetDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
      const year = targetDate.getFullYear();
      const month = targetDate.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      
      for (let day = 1; day <= daysInMonth; day++) {
        const fecha = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        for (const guide of guides) {
          for (const slot of SLOTS) {
            // ID SIN guiaId - único por fecha+slot
            const docId = `${fecha}_${slot}_${guide.id}`;
            const docRef = db.collection('shifts').doc(docId);
            
            // VERIFICAR SI YA EXISTE
            const exists = await docRef.get();
            
            if (!exists.exists) {
              batch.set(docRef, {
                fecha,
                slot,
                guiaId: guide.id,
                estado: 'LIBRE',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
              });
              created++;
            } else {
              skipped++;
            }
          }
        }
      }
    }
    
    if (created > 0) {
      await batch.commit();
      console.log(`✅ ${created} turnos creados`);
    }
    
    if (skipped > 0) {
      console.log(`⏭️  ${skipped} turnos ya existían (saltados)`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  process.exit(0);
}

seedShifts();