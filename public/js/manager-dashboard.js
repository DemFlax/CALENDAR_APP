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
let shiftsUnsubscribe = null;

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    loadGuides();
    initCalendar();
  } else {
    window.location.href = '/login.html';
  }
});

// ========== GUIDES FUNCTIONALITY ==========
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

window.editGuide = async (guideId) => {
  try {
    const guideDoc = await getDoc(doc(db, 'guides', guideId));
    if (!guideDoc.exists()) {
      showToast('Guía no encontrado', 'error');
      return;
    }

    const guide = guideDoc.data();
    
    document.getElementById('nombre').value = guide.nombre;
    document.getElementById('email').value = guide.email;
    document.getElementById('telefono').value = guide.telefono || '';
    document.getElementById('direccion').value = guide.direccion || '';
    document.getElementById('dni').value = guide.dni;
    document.getElementById('cuenta_bancaria').value = guide.cuenta_bancaria || '';

    document.getElementById('email').disabled = true;
    document.getElementById('dni').disabled = true;
    document.getElementById('email').classList.add('bg-gray-100');
    document.getElementById('dni').classList.add('bg-gray-100');

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

window.closeGuideModal = () => {
  document.getElementById('guide-modal').classList.add('hidden');
  document.getElementById('guide-form').reset();
  document.getElementById('email').disabled = false;
  document.getElementById('dni').disabled = false;
  document.getElementById('email').classList.remove('bg-gray-100');
  document.getElementById('dni').classList.remove('bg-gray-100');
};

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
      
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new Error('Formato de email inválido');
      }

      const dniRegex = /^\d{8}[A-Z]$/;
      if (!dniRegex.test(dni)) {
        throw new Error('Formato DNI inválido (8 dígitos + letra)');
      }

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

// ========== CALENDAR FUNCTIONALITY ==========
function initCalendar() {
  const monthFilter = document.getElementById('month-filter');
  const estadoFilter = document.getElementById('estado-filter');
  
  monthFilter.addEventListener('change', loadCalendar);
  estadoFilter.addEventListener('change', loadCalendar);
  
  loadCalendar();
}

function loadCalendar() {
  const monthFilter = document.getElementById('month-filter').value;
  const estadoFilter = document.getElementById('estado-filter').value;
  
  if (!monthFilter) return;
  
  const [year, month] = monthFilter.split('-');
  const startDate = `${year}-${month}-01`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const endDate = `${year}-${month}-${String(daysInMonth).padStart(2, '0')}`;
  
  let shiftsQuery = query(
    collection(db, 'shifts'),
    where('fecha', '>=', startDate),
    where('fecha', '<=', endDate)
  );
  
  if (shiftsUnsubscribe) shiftsUnsubscribe();
  
  shiftsUnsubscribe = onSnapshot(shiftsQuery, async (snapshot) => {
    const guidesSnapshot = await getDocs(
      query(collection(db, 'guides'), where('estado', '==', 'activo'))
    );
    
    const guides = [];
    guidesSnapshot.forEach(doc => guides.push({ id: doc.id, ...doc.data() }));
    
    const shiftsByDate = {};
    
    snapshot.forEach(doc => {
      const data = doc.data();
      if (!shiftsByDate[data.fecha]) {
        shiftsByDate[data.fecha] = [];
      }
      shiftsByDate[data.fecha].push({ id: doc.id, ...data });
    });
    
    renderCalendar(shiftsByDate, guides, estadoFilter);
  });
}

function renderCalendar(shiftsByDate, guides, estadoFilter) {
  const calendarBody = document.getElementById('calendar-body');
  calendarBody.innerHTML = '';
  
  const dates = Object.keys(shiftsByDate).sort();
  
  if (dates.length === 0) {
    calendarBody.innerHTML = '<tr><td colspan="100%" class="text-center text-gray-500 py-4">No hay turnos en este periodo</td></tr>';
    return;
  }
  
  dates.forEach(fecha => {
    const shifts = shiftsByDate[fecha];
    
    const dateObj = new Date(fecha + 'T12:00:00');
    const dayName = dateObj.toLocaleDateString('es-ES', { weekday: 'short' });
    const day = dateObj.getDate();
    const monthName = dateObj.toLocaleDateString('es-ES', { month: 'short' });
    
    const row = document.createElement('tr');
    row.innerHTML = `<td class="border px-4 py-2 font-semibold">${dayName}, ${day} ${monthName}</td>`;
    
    shifts.forEach(shift => {
      const cell = document.createElement('td');
      cell.className = 'border px-2 py-2';
      
      let bgColor = 'bg-green-100';
      let textColor = 'text-green-800';
      let label = 'LIBRE';
      
      if (shift.estado === 'ASIGNADO') {
        bgColor = 'bg-blue-100';
        textColor = 'text-blue-800';
        const guide = guides.find(g => g.id === shift.guiaId);
        label = guide ? guide.nombre : 'Asignado';
      } else if (shift.estado === 'NO_DISPONIBLE') {
        bgColor = 'bg-gray-100';
        textColor = 'text-gray-800';
        label = 'Bloqueado';
      }
      
      if (estadoFilter !== 'todos' && shift.estado !== estadoFilter) {
        cell.innerHTML = '-';
      } else {
        cell.innerHTML = `
          <div class="${bgColor} ${textColor} px-2 py-1 rounded text-sm">
            <div class="font-semibold">${shift.slot}</div>
            <div class="text-xs">${label}</div>
          </div>
        `;
      }
      
      row.appendChild(cell);
    });
    
    calendarBody.appendChild(row);
  });
}

// ========== UTILITY FUNCTIONS ==========
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

document.getElementById('logout-btn').addEventListener('click', async () => {
  try {
    await signOut(auth);
    window.location.href = '/login.html';
  } catch (error) {
    console.error('Error signing out:', error);
  }
});

window.addEventListener('beforeunload', () => {
  if (guidesUnsubscribe) guidesUnsubscribe();
  if (shiftsUnsubscribe) shiftsUnsubscribe();
});