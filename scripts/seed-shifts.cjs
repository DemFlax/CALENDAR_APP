const admin = require('firebase-admin');

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';

admin.initializeApp({ projectId: 'calendar-app-tours' });
const db = admin.firestore();

const SLOTS = ['MAÑANA', 'T1', 'T2', 'T3'];

function generateShifts(year, month) {
  const shifts = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    SLOTS.forEach(slot => {
      shifts.push({
        id: `${dateStr}_${slot}`,
        fecha: dateStr,
        slot: slot,
        estado: 'LIBRE',
        guiaId: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });
  }
  
  return shifts;
}

async function seedShifts() {
  try {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    
    const batch = db.batch();
    let count = 0;
    
    // Generar 3 meses: actual + 2 siguientes
    for (let i = 0; i < 3; i++) {
      const targetDate = new Date(currentYear, currentMonth + i);
      const year = targetDate.getFullYear();
      const month = targetDate.getMonth();
      
      const shifts = generateShifts(year, month);
      
      shifts.forEach(shift => {
        const docRef = db.collection('shifts').doc(shift.id);
        const { id, ...data } = shift;
        batch.set(docRef, data);
        count++;
      });
    }
    
    await batch.commit();
    console.log(`✅ ${count} turnos creados`);
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  process.exit(0);
}

seedShifts();