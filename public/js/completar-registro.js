import { auth, db } from './firebase-config.js';
import { 
  isSignInWithEmailLink, 
  signInWithEmailLink,
  getAdditionalUserInfo 
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { 
  doc, 
  getDoc, 
  updateDoc, 
  serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const loadingDiv = document.getElementById('loading');
const successDiv = document.getElementById('success');
const errorDiv = document.getElementById('error');

const urlParams = new URLSearchParams(window.location.search);
const guideId = urlParams.get('guideId');

async function completarRegistro() {
  // Verificar que es un link válido
  if (!isSignInWithEmailLink(auth, window.location.href)) {
    showError('Link de invitación inválido');
    return;
  }

  if (!guideId) {
    showError('ID de guía no encontrado en el link');
    return;
  }

  try {
    // Obtener email del guide desde Firestore
    const guideDoc = await getDoc(doc(db, 'guides', guideId));
    
    if (!guideDoc.exists()) {
      showError('Guía no encontrado');
      return;
    }

    const guideData = guideDoc.data();
    const email = guideData.email;

    // Guardar email en localStorage para evitar que el usuario lo tenga que ingresar
    window.localStorage.setItem('emailForSignIn', email);

    // Autenticar con el email link
    const result = await signInWithEmailLink(auth, email, window.location.href);
    const user = result.user;
    const additionalInfo = getAdditionalUserInfo(result);

    console.log('Usuario autenticado:', user.uid);
    console.log('¿Usuario nuevo?:', additionalInfo?.isNewUser);

    // Limpiar localStorage
    window.localStorage.removeItem('emailForSignIn');

    // Asignar custom claims (se hace en cliente porque usuario ya existe)
    await fetch('https://us-central1-calendar-app-tours.cloudfunctions.net/assignGuideClaims', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        uid: user.uid, 
        guideId: guideId 
      })
    });

    // Forzar refresh del token para obtener claims
    await user.getIdToken(true);

    // Actualizar documento del guide con uid
    await updateDoc(doc(db, 'guides', guideId), {
      uid: user.uid,
      emailVerified: true,
      registradoEn: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    // Mostrar éxito
    loadingDiv.classList.add('hidden');
    successDiv.classList.remove('hidden');

    // Redirigir al dashboard del guía
    setTimeout(() => {
      window.location.href = '/guide.html';
    }, 2000);

  } catch (error) {
    console.error('Error completando registro:', error);
    
    let errorMessage = 'Error al completar el registro';
    
    switch (error.code) {
      case 'auth/invalid-action-code':
        errorMessage = 'El link de invitación ha expirado o ya fue usado. Por favor solicita uno nuevo al manager.';
        break;
      case 'auth/invalid-email':
        errorMessage = 'Email inválido.';
        break;
      case 'auth/expired-action-code':
        errorMessage = 'El link ha expirado. Los links son válidos por 6 horas.';
        break;
      default:
        errorMessage = error.message;
    }
    
    showError(errorMessage);
  }
}

function showError(message) {
  loadingDiv.classList.add('hidden');
  successDiv.classList.add('hidden');
  errorDiv.textContent = message;
  errorDiv.classList.remove('hidden');
}

// Ejecutar al cargar la página
completarRegistro();