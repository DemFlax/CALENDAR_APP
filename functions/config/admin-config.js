const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

let initialized = false;

function initAdmin() {
  if (initialized) return admin.app();

  try {
    // PRODUCCIÓN: Cloud Functions usa credenciales automáticas del proyecto
    if (process.env.FUNCTION_NAME || process.env.FUNCTIONS_EMULATOR) {
      admin.initializeApp();
      initialized = true;
      console.log('✅ Firebase Admin inicializado (Cloud Functions)');
      return admin.app();
    }

    // DESARROLLO LOCAL: Usar variable de entorno GOOGLE_APPLICATION_CREDENTIALS
    // Configurar en Windows: set GOOGLE_APPLICATION_CREDENTIALS=C:\SHERPAS_CALENDAR\Kyes\serviceAccountKey.json
    // Configurar en PowerShell: $env:GOOGLE_APPLICATION_CREDENTIALS="C:\SHERPAS_CALENDAR\Kyes\serviceAccountKey.json"
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

      if (!fs.existsSync(keyPath)) {
        throw new Error(`GOOGLE_APPLICATION_CREDENTIALS apunta a archivo inexistente: ${keyPath}`);
      }

      const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      initialized = true;
      console.log(`✅ Firebase Admin inicializado (Local - ${path.basename(keyPath)})`);
      return admin.app();
    }

    // FALLBACK: Buscar serviceAccountKey.json en directorio functions/
    const localKeyPath = path.join(__dirname, '..', 'serviceAccountKey.json');
    if (fs.existsSync(localKeyPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(localKeyPath, 'utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      initialized = true;
      console.log('✅ Firebase Admin inicializado (Local - serviceAccountKey.json)');
      return admin.app();
    }

    // ERROR: No se encontraron credenciales
    throw new Error(
      'No se encontraron credenciales de Firebase Admin.\n' +
      'Configura la variable de entorno GOOGLE_APPLICATION_CREDENTIALS:\n' +
      '  Windows CMD: set GOOGLE_APPLICATION_CREDENTIALS=C:\\SHERPAS_CALENDAR\\Kyes\\serviceAccountKey.json\n' +
      '  PowerShell: $env:GOOGLE_APPLICATION_CREDENTIALS="C:\\SHERPAS_CALENDAR\\Kyes\\serviceAccountKey.json"\n' +
      '  Linux/Mac: export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"'
    );

  } catch (error) {
    if (error.code === 'app/duplicate-app') {
      initialized = true;
      return admin.app();
    }
    console.error('❌ Error inicializando Firebase Admin:', error.message);
    throw error;
  }
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