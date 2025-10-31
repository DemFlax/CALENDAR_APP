const { initAdmin, db } = require('./config/admin-config');

initAdmin();

db.collection('guides').limit(1).get()
  .then(snapshot => {
    console.log('✅ Admin config funciona:', snapshot.size, 'guía encontrado');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });