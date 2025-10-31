const { initAdmin, db, FieldValue } = require('./config/admin-config');

initAdmin();

db.collection('guide_invoices').add({
  guideId: "GYMsS3HicPbbSY1A1FSE",
  guideName: "DAN",
  guideEmail: "leadtoshopsl@gmail.com",
  month: "2025-10",
  status: "MANAGER_REVIEW",
  tours: [
    { fecha: "2025-10-15", slot: "T1", tourDescription: "Tapas Centro", numPax: 8, salarioCalculado: 90 },
    { fecha: "2025-10-18", slot: "MAÑANA", tourDescription: "Gastro Tour", numPax: 12, salarioCalculado: 110 }
  ],
  totalSalary: 200,
  baseImponible: 165.29,
  iva: 34.71,
  editedByManager: false,
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp()
}).then(() => {
  console.log('✓ Factura creada');
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});