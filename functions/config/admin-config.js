const admin = require('firebase-admin');
const fs = require('fs');

const KEYS_PATH = 'C:\\SHERPAS_CALENDAR\\Kyes\\serviceAccountKey.json';
let initialized = false;

function initAdmin() {
  if (initialized) return admin.app();
  
  try {
    const serviceAccount = JSON.parse(fs.readFileSync(KEYS_PATH, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    initialized = true;
    console.log('✅ Firebase Admin inicializado');
  } catch (error) {
    if (error.code === 'app/duplicate-app') {
      initialized = true;
      return admin.app();
    }
    console.error('❌ Error inicializando Firebase Admin:', error.message);
    throw error;
  }
  
  return admin.app();
}

function getDb() {
  if (!initialized) initAdmin();
  return admin.firestore();
}

function getAuthService() {
  if (!initialized) initAdmin();
  return admin.auth();
}

module.exports = {
  initAdmin,
  admin,
  get db() { return getDb(); },
  get auth() { return getAuthService(); },
  FieldValue: admin.firestore.FieldValue
};