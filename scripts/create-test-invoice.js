const admin = require('firebase-admin');
const serviceAccount = require('../../Kyes/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function createTestInvoice() {
  const guideId = 'GYMsS3HicPbbSY1A1FSE'; // Línea 12 // Busca en guides collection
  
  await db.collection('guide_invoices').doc('TEST_OCT_2025').set({
    invoiceId: 'TEST_OCT_2025',
    guideId: guideId,
    guideName: 'DAN',
    guideEmail: 'tu-email@example.com',
    month: '2025-10',
    tours: [
      {
        fecha: '2025-10-15',
        slot: 'T1',
        tourDescription: 'Tapas Centro',
        numPax: 8,
        salario: 90.00
      },
      {
        fecha: '2025-10-18',
        slot: 'MAÑANA',
        tourDescription: 'Gastro Tour',
        numPax: 12,
        salario: 110.00
      },
      {
        fecha: '2025-10-22',
        slot: 'T2',
        tourDescription: 'Tapas Noche',
        numPax: 6,
        salario: 80.00
      }
    ],
    totalSalary: 280.00,
    status: 'PENDING_APPROVAL',
    invoiceNumber: null,
    pdfDriveId: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    approvedAt: null,
    approvedBy: null
  });
  
  console.log('✅ Factura de prueba creada');
  process.exit(0);
}

createTestInvoice().catch(console.error);