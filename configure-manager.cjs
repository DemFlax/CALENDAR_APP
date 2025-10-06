const admin = require('firebase-admin');

admin.initializeApp({
  projectId: 'calendar-app-tours'
});

async function configureManager() {
  const email = 'madrid@spainfoodsherpas.com';
  
  try {
    // Verificar si existe
    const user = await admin.auth().getUserByEmail(email);
    console.log('Usuario encontrado:', user.uid);
    
    // Asignar custom claim
    await admin.auth().setCustomUserClaims(user.uid, {
      role: 'manager'
    });
    
    console.log('✅ Custom claim "manager" asignado');
    
    // Forzar refresh
    await admin.auth().revokeRefreshTokens(user.uid);
    console.log('✅ Tokens revocados (forzará refresh en próximo login)');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  process.exit();
}

configureManager();