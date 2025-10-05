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

// Initialize
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    loadGuides();
  } else {
    window.location.href = '/login.html';
  }
});

// Load guides
function loadGuides() {
  const guidesQuery = query(
    collection(db, 'guides'),
    where('estado', '==', 'activo')
  );

  if (guidesUnsubscribe) guidesUnsubscribe();

  guidesUnsubscribe = onSnapshot(guidesQuery, (snapshot) => {
    const guidesList = document.getElementById('guides-list');
    guidesList.innerHTML = '';

    if (snapshot.empty) {
      guidesList.innerHTML = '<p class="text-gray-500">No hay guías registrados</p>';
      return;
    }

    snapshot.forEach((docSnap) => {
      const guide = docSnap.data();
      const guideCard = createGuideCard(docSnap.id, guide);
      guidesList.appendChild(guideCard);
    });
  });
}

// Create guide card
// Create guide card
function createGuideCard(id, guide) {
  const card = document.createElement('div');
  card.className = 'bg-white p-4 rounded-lg shadow';
  card.innerHTML = `
    <div class="flex justify-between items-start">
      <div class="flex-1">
        <h3 class="font-semibold text-lg">${guide.nombre}</h3>
        <p class="text-gray-600 text-sm">Email: ${guide.email}</p>
        <p class="text-gray-500 text-sm">DNI: ${guide.dni}</p>
        <p class="text-gray-500 text-sm">Tel: ${guide.telefono || 'Sin teléfono'}</p>
      </div>
      <div class="flex flex-col gap-2">
        <button 
          onclick="window.editGuide('${id}')" 
          class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm">
          Editar
        </button>
        <button 
          onclick="window.deleteGuide('${id}')" 
          class="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm">
          Eliminar
        </button>
      </div>
    </div>
  `;
  return card;
}

// Show create guide modal
window.showCreateGuideModal = () => {
  document.getElementById('guide-modal').classList.remove('hidden');
  document.getElementById('modal-title').textContent = 'Crear Guía';
  document.getElementById('guide-form').reset();
  document.getElementById('guide-form').dataset.mode = 'create';
  delete document.getElementById('guide-form').dataset.guideId;
  
  // Enable email and dni for creation
  document.getElementById('email').disabled = false;
  document.getElementById('dni').disabled = false;
  
  // Update button text
  document.querySelector('#guide-form button[type="submit"]').textContent = 'Crear Guía';
};

// Edit guide
window.editGuide = async (guideId) => {
  try {
    const guideDoc = await getDoc(doc(db, 'guides', guideId));
    if (!guideDoc.exists()) {
      showToast('Guía no encontrado', 'error');
      return;
    }

    const guide = guideDoc.data();
    
    // Fill form
    document.getElementById('nombre').value = guide.nombre;
    document.getElementById('email').value = guide.email;
    document.getElementById('telefono').value = guide.telefono || '';
    document.getElementById('direccion').value = guide.direccion || '';
    document.getElementById('dni').value = guide.dni;
    document.getElementById('cuenta_bancaria').value = guide.cuenta_bancaria || '';

    // Disable non-editable fields
    document.getElementById('email').disabled = true;
    document.getElementById('dni').disabled = true;
    document.getElementById('email').classList.add('bg-gray-100');
    document.getElementById('dni').classList.add('bg-gray-100');

    // Show modal
    document.getElementById('modal-title').textContent = 'Editar Guía';
    document.getElementById('guide-form').dataset.mode = 'edit';
    document.getElementById('guide-form').dataset.guideId = guideId;
    document.querySelector('#guide-form button[type="submit"]').textContent = 'Guardar Cambios';
    document.getElementById('guide-modal').classList.remove('hidden');
  } catch (error) {
    console.error('Error loading guide:', error);
    showToast('Error al cargar guía', 'error');
  }
};

// Close modal
window.closeGuideModal = () => {
  document.getElementById('guide-modal').classList.add('hidden');
  document.getElementById('guide-form').reset();
  document.getElementById('email').disabled = false;
  document.getElementById('dni').disabled = false;
  document.getElementById('email').classList.remove('bg-gray-100');
  document.getElementById('dni').classList.remove('bg-gray-100');
};

// Submit form
document.getElementById('guide-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Guardando...';

  const formData = {
    nombre: document.getElementById('nombre').value.trim(),
    telefono: document.getElementById('telefono').value.trim() || null,
    direccion: document.getElementById('direccion').value.trim() || null,
    cuenta_bancaria: document.getElementById('cuenta_bancaria').value.trim() || null,
    updatedAt: serverTimestamp()
  };

  try {
    const mode = e.target.dataset.mode;

    if (mode === 'create') {
      const email = document.getElementById('email').value.trim().toLowerCase();
      const dni = document.getElementById('dni').value.trim().toUpperCase();
      
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new Error('Formato de email inválido');
      }

      // Validate DNI format (8 digits + letter)
      const dniRegex = /^\d{8}[A-Z]$/;
      if (!dniRegex.test(dni)) {
        throw new Error('Formato DNI inválido (8 dígitos + letra)');
      }

      // Check email uniqueness
      const existingGuide = await getDocs(
        query(collection(db, 'guides'), where('email', '==', email))
      );
      
      if (!existingGuide.empty) {
        throw new Error('Email ya registrado');
      }

      formData.email = email;
      formData.dni = dni;
      formData.estado = 'activo';
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

// Delete guide (soft delete)
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

// Toast notification
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toast-message');
  
  toastMessage.textContent = message;
  toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg ${
    type === 'success' ? 'bg-green-500' : 
    type === 'error' ? 'bg-red-500' : 'bg-blue-500'
  } text-white`;
  
  toast.classList.remove('hidden');
  
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}

// Logout
document.getElementById('logout-btn').addEventListener('click', async () => {
  try {
    await signOut(auth);
    window.location.href = '/login.html';
  } catch (error) {
    console.error('Error signing out:', error);
  }
});

// Cleanup on unmount
window.addEventListener('beforeunload', () => {
  if (guidesUnsubscribe) guidesUnsubscribe();
});