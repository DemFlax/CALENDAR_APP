import { auth, db } from './firebase-config.js';
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

let currentUser = null;
let guidesUnsubscribe = null;

// AUTH CHECK
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    loadGuides();
  } else {
    window.location.href = '/login.html';
  }
});

// LOAD GUIDES
function loadGuides() {
  const guidesQuery = query(collection(db, 'guides'), where('estado', '==', 'activo'));
  if (guidesUnsubscribe) guidesUnsubscribe();
  
  guidesUnsubscribe = onSnapshot(guidesQuery, (snapshot) => {
    const guidesList = document.getElementById('guides-list');
    guidesList.innerHTML = '';
    
    if (snapshot.empty) {
      guidesList.innerHTML = `
        <div class="col-span-full text-center py-12">
          <svg class="w-16 h-16 text-gray-400 dark:text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
          </svg>
          <p class="text-gray-500 dark:text-gray-400 text-sm">No hay guías registrados</p>
          <button onclick="showCreateGuideModal()" class="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
            Crear primer guía
          </button>
        </div>
      `;
      return;
    }
    
    snapshot.forEach((docSnap) => {
      const guide = docSnap.data();
      guidesList.appendChild(createGuideCard(docSnap.id, guide));
    });
  });
}

// CREATE GUIDE CARD
function createGuideCard(id, guide) {
  const card = document.createElement('div');
  card.className = 'guide-card bg-white dark:bg-gray-800 p-4 sm:p-5 rounded-2xl shadow-lg hover:shadow-xl transition border border-gray-200 dark:border-gray-700';
  card.innerHTML = `
    <div class="flex justify-between items-start gap-3">
      <div class="flex-1 min-w-0">
        <h3 class="font-bold text-lg sm:text-xl truncate text-gray-900 dark:text-white mb-2">${guide.nombre}</h3>
        <div class="space-y-1 text-sm text-gray-600 dark:text-gray-400">
          <p class="truncate">📧 ${guide.email}</p>
          <p>🆔 ${guide.dni}</p>
          <p>📱 ${guide.telefono || 'Sin teléfono'}</p>
          ${guide.cuenta_bancaria ? `<p class="truncate">🏦 ${guide.cuenta_bancaria}</p>` : ''}
        </div>
      </div>
      <div class="flex flex-col gap-2">
        <button onclick="window.editGuide('${id}')" class="bg-sky-500 hover:bg-sky-600 dark:bg-sky-600 dark:hover:bg-sky-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition whitespace-nowrap">
          Editar
        </button>
        <button onclick="window.deleteGuide('${id}')" class="bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition whitespace-nowrap">
          Eliminar
        </button>
      </div>
    </div>
  `;
  return card;
}

// SHOW CREATE MODAL
window.showCreateGuideModal = () => {
  document.getElementById('guide-modal').classList.remove('hidden');
  document.getElementById('modal-title').textContent = 'Crear Guía';
  document.getElementById('guide-form').reset();
  document.getElementById('guide-form').dataset.mode = 'create';
  delete document.getElementById('guide-form').dataset.guideId;
  document.getElementById('email').disabled = false;
  document.getElementById('dni').disabled = false;
  document.querySelector('#guide-form button[type="submit"]').textContent = 'Crear Guía';
};

// EDIT GUIDE
window.editGuide = async (guideId) => {
  try {
    const guideDoc = await getDoc(doc(db, 'guides', guideId));
    if (!guideDoc.exists()) {
      showToast('Guía no encontrado', 'error');
      return;
    }
    const guide = guideDoc.data();
    document.getElementById('guide-modal').classList.remove('hidden');
    document.getElementById('modal-title').textContent = 'Editar Guía';
    document.getElementById('nombre').value = guide.nombre || '';
    document.getElementById('email').value = guide.email || '';
    document.getElementById('telefono').value = guide.telefono || '';
    document.getElementById('direccion').value = guide.direccion || '';
    document.getElementById('dni').value = guide.dni || '';
    document.getElementById('cuenta_bancaria').value = guide.cuenta_bancaria || '';
    document.getElementById('email').disabled = true;
    document.getElementById('dni').disabled = true;
    document.getElementById('guide-form').dataset.mode = 'edit';
    document.getElementById('guide-form').dataset.guideId = guideId;
    document.querySelector('#guide-form button[type="submit"]').textContent = 'Guardar Cambios';
  } catch (error) {
    console.error('Error loading guide:', error);
    showToast('Error al cargar guía', 'error');
  }
};

// CLOSE MODAL
window.closeGuideModal = () => {
  document.getElementById('guide-modal').classList.add('hidden');
  document.getElementById('guide-form').reset();
};

// FORM SUBMIT
document.getElementById('guide-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Guardando...';

  try {
    const formData = {
      nombre: document.getElementById('nombre').value.trim(),
      email: document.getElementById('email').value.trim().toLowerCase(),
      telefono: document.getElementById('telefono').value.trim(),
      direccion: document.getElementById('direccion').value.trim(),
      dni: document.getElementById('dni').value.trim().toUpperCase(),
      cuenta_bancaria: document.getElementById('cuenta_bancaria').value.trim(),
      estado: 'activo',
      updatedAt: serverTimestamp()
    };

    const mode = e.target.dataset.mode;

    if (mode === 'create') {
      const existingQuery = query(collection(db, 'guides'), where('email', '==', formData.email));
      const existingDocs = await getDocs(existingQuery);

      if (!existingDocs.empty) {
        const existingDoc = existingDocs.docs[0];
        const existingGuide = existingDoc.data();

        if (existingGuide.estado === 'activo') {
          showToast('Error: Ya existe un guía con ese email (activo)', 'error');
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
          return;
        } else {
          formData.reactivatedAt = serverTimestamp();
          await updateDoc(doc(db, 'guides', existingDoc.id), formData);
          showToast('Guía reactivado correctamente', 'success');
          closeGuideModal();
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
          return;
        }
      }

      formData.createdAt = serverTimestamp();
      await addDoc(collection(db, 'guides'), formData);
      showToast('Guía creado correctamente', 'success');

    } else if (mode === 'edit') {
      const guideId = e.target.dataset.guideId;
      await updateDoc(doc(db, 'guides', guideId), formData);
      showToast('Guía actualizado correctamente', 'success');
    }

    closeGuideModal();

  } catch (error) {
    console.error('Error saving guide:', error);
    showToast(error.message || 'Error al guardar guía', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
});

// DELETE GUIDE
window.deleteGuide = async (guideId) => {
  if (!confirm('¿Eliminar este guía? Se marcará como inactivo.')) return;
  try {
    await updateDoc(doc(db, 'guides', guideId), {
      estado: 'inactivo',
      updatedAt: serverTimestamp()
    });
    showToast('Guía eliminado correctamente', 'success');
  } catch (error) {
    console.error('Error deleting guide:', error);
    showToast('Error al eliminar guía', 'error');
  }
};

// SHOW TOAST
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toast-message');
  toastMessage.textContent = message;
  toast.className = `fixed bottom-4 right-4 px-4 py-2 sm:px-6 sm:py-3 rounded-xl shadow-lg ${
    type === 'success' ? 'bg-emerald-500 dark:bg-emerald-600' :
    type === 'error' ? 'bg-red-500 dark:bg-red-600' :
    type === 'warning' ? 'bg-yellow-500 dark:bg-yellow-600' : 'bg-sky-500 dark:bg-sky-600'
  } text-white max-w-xs sm:max-w-md z-50`;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

// LOGOUT
document.getElementById('logout-btn').addEventListener('click', async () => {
  try {
    await signOut(auth);
    window.location.href = '/login.html';
  } catch (error) {
    console.error('Error signing out:', error);
  }
});