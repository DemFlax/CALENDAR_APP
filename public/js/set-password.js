import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { 
  getAuth, 
  confirmPasswordReset, 
  verifyPasswordResetCode,
  signInWithEmailAndPassword 
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

const firebaseConfig = {
  apiKey: "AIzaSyDlghbPGme-ZoneNXx8kK2aUrsEu22wDMo",
  authDomain: "calendar-app-tours.firebaseapp.com",
  projectId: "calendar-app-tours",
  storageBucket: "calendar-app-tours.firebasestorage.app",
  messagingSenderId: "692264221494",
  appId: "1:692264221494:web:a25d3e96f1fe49cd5e847c"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const urlParams = new URLSearchParams(window.location.search);
const oobCode = urlParams.get('oobCode');
const mode = urlParams.get('mode');

const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirmPassword');
const emailInput = document.getElementById('email');
const form = document.getElementById('setPasswordForm');
const errorDiv = document.getElementById('error');
const submitBtn = document.getElementById('submitBtn');
const loadingDiv = document.getElementById('loading');

const requirements = {
  length: { regex: /.{8,}/, element: document.getElementById('req-length') },
  uppercase: { regex: /[A-Z]/, element: document.getElementById('req-uppercase') },
  number: { regex: /[0-9]/, element: document.getElementById('req-number') },
  special: { regex: /[!@#$%^&*(),.?":{}|<>]/, element: document.getElementById('req-special') }
};

passwordInput.addEventListener('input', () => {
  const password = passwordInput.value;
  
  Object.values(requirements).forEach(req => {
    if (req.regex.test(password)) {
      req.element.classList.remove('text-red-500');
      req.element.classList.add('text-green-500');
      req.element.textContent = req.element.textContent.replace('✗', '✓');
    } else {
      req.element.classList.remove('text-green-500');
      req.element.classList.add('text-red-500');
      req.element.textContent = req.element.textContent.replace('✓', '✗');
    }
  });
});

confirmPasswordInput.addEventListener('input', () => {
  const matchError = document.getElementById('match-error');
  if (confirmPasswordInput.value && confirmPasswordInput.value !== passwordInput.value) {
    matchError.classList.remove('hidden');
  } else {
    matchError.classList.add('hidden');
  }
});

async function verifyCode() {
  const emailParam = urlParams.get('email');
  if (emailParam) {
    emailInput.value = emailParam;
    return;
  }
  
  if (!oobCode || mode !== 'resetPassword') {
    showError('Link inválido o expirado. Contacta con el manager.');
    return;
  }

  try {
    const email = await verifyPasswordResetCode(auth, oobCode);
    emailInput.value = email;
  } catch (error) {
    console.error('Error verificando código:', error);
    showError('Link expirado o inválido. Solicita una nueva invitación.');
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  const allValid = Object.values(requirements).every(req => req.regex.test(password));
  if (!allValid) {
    showError('La contraseña no cumple todos los requisitos');
    return;
  }

  if (password !== confirmPassword) {
    showError('Las contraseñas no coinciden');
    return;
  }

  submitBtn.disabled = true;
  loadingDiv.classList.remove('hidden');
  form.classList.add('hidden');
  errorDiv.classList.add('hidden');

  try {
    if (oobCode) {
      await confirmPasswordReset(auth, oobCode, password);
    } else {
      const response = await fetch(`http://localhost:5001/calendar-app-tours/us-central1/devSetPassword`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailInput.value,
          password: password
        })
      });
      if (!response.ok) throw new Error('Error al establecer contraseña');
    }

    await signInWithEmailAndPassword(auth, emailInput.value, password);
    await new Promise(resolve => setTimeout(resolve, 1000));

    const idTokenResult = await auth.currentUser.getIdTokenResult(true);
    const role = idTokenResult.claims.role;

    if (role === 'guide') {
      window.location.href = '/guide.html';
    } else if (role === 'manager') {
      window.location.href = '/manager.html';
    } else {
      window.location.href = '/login.html';
    }

  } catch (error) {
    console.error('Error estableciendo contraseña:', error);
    showError('Error al establecer contraseña: ' + error.message);
    submitBtn.disabled = false;
    loadingDiv.classList.add('hidden');
    form.classList.remove('hidden');
  }
});

function showError(message) {
  errorDiv.textContent = message;
  errorDiv.classList.remove('hidden');
}

verifyCode();