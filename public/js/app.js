console.log('app.js loaded');
const app = document.getElementById('app');
console.log('app element:', app);
let auth;

// Funciones UI
function showLogin() {
  console.log('showLogin called');
  app.innerHTML = `
    <div class="login-container">
      <h1>Calendario Tours Madrid</h1>
      <form id="loginForm">
        <input type="email" id="email" placeholder="Email" required>
        <input type="password" id="password" placeholder="Contraseña" required>
        <button type="submit">Entrar</button>
      </form>
      <div id="error" class="error"></div>
    </div>
  `;
  
  document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    login(document.getElementById('email').value, document.getElementById('password').value);
  });
}

function showManagerDashboard() {
  console.log('showManagerDashboard called');
  app.innerHTML = `
    <div class="dashboard">
      <header>
        <h1>Dashboard Manager</h1>
        <button onclick="logout()">Salir</button>
      </header>
      <main>
        <section class="create-guide">
          <h2>Crear Guía</h2>
          <form id="createGuideForm">
            <input type="text" id="nombre" placeholder="Nombre completo *" required>
            <input type="email" id="email" placeholder="Email *" required>
            <input type="tel" id="telefono" placeholder="Teléfono">
            <input type="text" id="direccion" placeholder="Dirección">
            <input type="text" id="dni" placeholder="DNI *" required pattern="[0-9]{8}[A-Z]">
            <input type="text" id="cuenta_bancaria" placeholder="Cuenta bancaria (IBAN)">
            <button type="submit">Crear Guía</button>
          </form>
          <div id="guide-error" class="error"></div>
        </section>
        
        <section class="guides-list">
          <h2>Guías Registrados</h2>
          <div id="guidesList">Cargando...</div>
        </section>
      </main>
    </div>
  `;
  
  document.getElementById('createGuideForm').addEventListener('submit', createGuide);
  loadGuides();
}

function showGuideDashboard() {
  console.log('showGuideDashboard called');
  app.innerHTML = `
    <div class="dashboard">
      <header>
        <h1>Dashboard Guía</h1>
        <button onclick="logout()">Salir</button>
      </header>
      <main>
        <p>Bienvenido, Guía</p>
      </main>
    </div>
  `;
}

function showError(msg) {
  console.log('showError called:', msg);
  const errorDiv = document.getElementById('error');
  if (errorDiv) {
    errorDiv.textContent = msg;
  } else {
    alert(msg);
  }
}

// Auth functions
async function login(email, password) {
  console.log('login attempt:', email);
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (error) {
    showError(error.message);
  }
}

function logout() {
  console.log('logout called');
  auth.signOut();
}

// CRUD Guías
async function createGuide(e) {
  e.preventDefault();
  const errorDiv = document.getElementById('guide-error');
  errorDiv.textContent = '';
  
  const guideData = {
    nombre: document.getElementById('nombre').value,
    email: document.getElementById('email').value,
    telefono: document.getElementById('telefono').value || null,
    direccion: document.getElementById('direccion').value || null,
    dni: document.getElementById('dni').value,
    cuenta_bancaria: document.getElementById('cuenta_bancaria').value || null,
    estado: 'activo',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  
  try {
    await firebase.firestore().collection('guides').add(guideData);
    document.getElementById('createGuideForm').reset();
    errorDiv.style.color = 'green';
    errorDiv.textContent = '✓ Guía creado correctamente';
    setTimeout(() => errorDiv.textContent = '', 3000);
  } catch (error) {
    errorDiv.textContent = error.message;
  }
}

function loadGuides() {
  const listDiv = document.getElementById('guidesList');
  
  firebase.firestore().collection('guides')
    .where('estado', '==', 'activo')
    .onSnapshot(snapshot => {
      if (snapshot.empty) {
        listDiv.innerHTML = '<p>No hay guías registrados</p>';
        return;
      }
      
      listDiv.innerHTML = snapshot.docs.map(doc => {
        const guide = doc.data();
        return `
          <div class="guide-card">
            <h3>${guide.nombre}</h3>
            <p>Email: ${guide.email}</p>
            <p>DNI: ${guide.dni}</p>
            ${guide.telefono ? `<p>Tel: ${guide.telefono}</p>` : ''}
          </div>
        `;
      }).join('');
    });
}

// Inicialización
const checkFirebase = setInterval(() => {
  console.log('checking firebase...');
  if (typeof firebase !== 'undefined' && firebase.auth) {
    console.log('Firebase ready!');
    clearInterval(checkFirebase);
    auth = firebase.auth();
    
    auth.onAuthStateChanged(async (user) => {
      console.log('auth state changed, user:', user);
      if (user) {
        // Temporal: rol por email
        if (user.email === 'madrid@spainfoodsherpas.com') {
          showManagerDashboard();
        } else {
          showGuideDashboard();
        }
      } else {
        showLogin();
      }
    });
  }
}, 100);