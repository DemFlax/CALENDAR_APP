import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyA2K1hWVovDGcVart7XFEbTqJuQRErPRTI",
  authDomain: "calendar-app-tours.firebaseapp.com",
  projectId: "calendar-app-tours",
  storageBucket: "calendar-app-tours.firebasestorage.app",
  messagingSenderId: "498221526899",
  appId: "1:498221526899:web:1fa32c1d4b6cd6e37b5f06"
};

export const appsScriptConfig = {
  url: 'https://script.google.com/macros/s/AKfycby-Uvlqb29MTmVW5gJDuxtFPqlZXms5ir5QHHj5oRX4tf4F99gnxufi4Qluv49uNQYBdg/exec',
  apiKey: 'sfs-calendar-2024-secure-key'  // ← Correcto
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);