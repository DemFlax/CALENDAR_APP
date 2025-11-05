const { db } = require('./config/admin-config');

async function cleanRootShifts() {
  console.log('\n🧹 Limpiando colección root /shifts...\n');
  
  const snapshot = await db.collection('shifts').get();
  
  if (snapshot.empty) {
    console.log('✅ Colección /shifts ya está vacía\n');
    process.exit();
    return;
  }
  
  console.log(`📊 Encontrados ${snapshot.size} documentos a eliminar\n`);
  
  const batch = db.batch();
  let count = 0;
  
  snapshot.forEach(doc => {
    batch.delete(doc.ref);
    count++;
    if (count % 10 === 0) {
      console.log(`   Procesados ${count}/${snapshot.size}...`);
    }
  });
  
  await batch.commit();
  
  console.log(`\n✅ ${count} documentos eliminados de /shifts\n`);
  process.exit();
}

cleanRootShifts();