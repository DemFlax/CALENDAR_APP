const admin = require('firebase-admin');
const serviceAccount = require('C:/SHERPAS_CALENDAR/Kyes/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'calendar-app-tours'
});

const db = admin.firestore();

const INITIAL_VENDORS = [
  { nombre: 'El Escarpín', orden: 0 },
  { nombre: 'Casa Ciriaco', orden: 1 },
  { nombre: 'La Revolcona', orden: 2 },
  { nombre: 'Casa Labra', orden: 3 },
  { nombre: 'Mercado de San Miguel', orden: 4 }
];

const SALARY_TABLE = {
  ranges: [
    { minPax: 1, maxPax: 4, pagoNeto: 70, pagoBruto: 84.70 },
    { minPax: 5, maxPax: 5, pagoNeto: 75, pagoBruto: 90.75 },
    { minPax: 6, maxPax: 6, pagoNeto: 80, pagoBruto: 96.80 },
    { minPax: 7, maxPax: 7, pagoNeto: 85, pagoBruto: 102.85 },
    { minPax: 8, maxPax: 8, pagoNeto: 90, pagoBruto: 108.90 },
    { minPax: 9, maxPax: 9, pagoNeto: 95, pagoBruto: 114.95 },
    { minPax: 10, maxPax: 10, pagoNeto: 100, pagoBruto: 121.00 },
    { minPax: 11, maxPax: 11, pagoNeto: 105, pagoBruto: 127.05 },
    { minPax: 12, maxPax: 20, pagoNeto: 110, pagoBruto: 133.10 }
  ],
  ivaPercent: 21,
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  updatedBy: 'madrid@spainfoodsherpas.com'
};

async function seedVendors() {
  try {
    console.log('🏪 Seeding vendors...');
    const existingVendors = await db.collection('vendors').get();
    
    if (!existingVendors.empty) {
      console.log(`⏭️  ${existingVendors.size} vendors ya existen`);
      return;
    }
    
    const batch = db.batch();
    
    for (const vendor of INITIAL_VENDORS) {
      const docRef = db.collection('vendors').doc();
      batch.set(docRef, {
        ...vendor,
        cif: null,
        direccion: null,
        email: null,
        estado: 'activo',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    
    await batch.commit();
    console.log(`✅ ${INITIAL_VENDORS.length} vendors creados`);
  } catch (error) {
    console.error('❌ Error seeding vendors:', error);
    throw error;
  }
}

async function seedSalaryTable() {
  try {
    console.log('💰 Seeding salary table...');
    const configRef = db.collection('config').doc('salary_table');
    const existingDoc = await configRef.get();
    
    if (existingDoc.exists) {
      console.log('⏭️  Salary table ya existe');
      return;
    }
    
    await configRef.set(SALARY_TABLE);
    console.log('✅ Salary table creada');
  } catch (error) {
    console.error('❌ Error seeding salary table:', error);
    throw error;
  }
}

async function main() {
  try {
    console.log('🚀 Starting Vendor Costs seed...\n');
    await seedVendors();
    await seedSalaryTable();
    console.log('\n✨ Seed completado exitosamente');
  } catch (error) {
    console.error('\n💥 Seed falló:', error);
    process.exit(1);
  }
  process.exit(0);
}

main();