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
    
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    const endDate = new Date(today.getFullYear(), today.getMonth() + 3, 0);
    
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    
    console.log(`Verificando turnos entre ${startStr} y ${endStr}...`);
    
    const existingShifts = await db.collection('shifts')
      .where('fecha', '>=', startStr)
      .where('fecha', '<=', endStr)
      .get();
    
    const existingIds = new Set();
    existingShifts.forEach(doc => existingIds.add(doc.id));
    
    console.log(`${existingIds.size} turnos ya existen`);
    
    const batch = db.batch();
    let created = 0;
    
    for (let monthOffset = 0; monthOffset < 3; monthOffset++) {
      const targetDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
      const year = targetDate.getFullYear();
      const month = targetDate.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      
      for (let day = 1; day <= daysInMonth; day++) {
        const fecha = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        for (const guide of guides) {
          for (const slot of SLOTS) {
            const docId = `${fecha}_${slot}_${guide.id}`;
            
            if (!existingIds.has(docId)) {
              const docRef = db.collection('shifts').doc(docId);
              batch.set(docRef, {
                fecha,
                slot,
                guiaId: guide.id,
                estado: 'LIBRE',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
              });
              created++;
            }
          }
        }
      }
    }
    
    if (created > 0) {
      await batch.commit();
      console.log(`✅ ${created} turnos creados`);
    } else {
      console.log('⏭️  Todos los turnos ya existían');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  process.exit(0);
}

seedShifts();