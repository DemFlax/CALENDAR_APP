import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { getFirestore, connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyA2K1hWVovDGcVart7XFEbTqJuQRErPRTI",
  authDomain: "calendar-app-tours.firebaseapp.com",
  projectId: "calendar-app-tours",
  storageBucket: "calendar-app-tours.firebasestorage.app",
  messagingSenderId: "498221526899",
  appId: "1:498221526899:web:1fa32c1d4b6cd6e37b5f06"
};

export const appsScriptConfig = {
  url: 'https://script.google.com/macros/s/AKfycbxD8yJJ3u_2WmX_D7Zf7QIgmnmsV1DqX1aUPUGVBx_i1sx0S2j1j5q_npYgrMVZ1_s1JQ/exec', // ← URL de Versión 35
  apiKey: 'sfs-calendar-2024-secure-key'
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

if (location.hostname === 'localhost') {
  connectAuthEmulator(auth, 'http://localhost:9099');
  connectFirestoreEmulator(db, 'localhost', 8082);
}
export default firebaseConfig;