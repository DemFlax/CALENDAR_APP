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

      // En create guide, cambiar:
      const existingGuide = await getDocs(
        query(collection(db, 'guides'), 
          where('email', '==', email),
          where('estado', '==', 'activo')  // AGREGAR ESTE FILTRO
        )
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
  
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  monthFilter.value = `${year}-${month}`;
  
  monthFilter.addEventListener('change', loadCalendar);
  estadoFilter.addEventListener('change', loadCalendar);
  
  loadCalendar();
}

function loadCalendar() {
  const monthInput = document.getElementById('month-filter');
  const estadoFilter = document.getElementById('estado-filter').value;
  
  if (!monthInput.value) {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    monthInput.value = `${year}-${month}`;
  }
  
  const monthFilter = monthInput.value;
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
  const calendarGrid = document.getElementById('calendar-grid');
  calendarGrid.innerHTML = '';
  
  const dates = Object.keys(shiftsByDate).sort();
  
  if (dates.length === 0) {
    calendarGrid.innerHTML = '<p class="text-center text-gray-500 py-4">No hay turnos en este periodo</p>';
    return;
  }
  
  if (guides.length === 0) {
    calendarGrid.innerHTML = '<p class="text-center text-gray-500 py-4">No hay guías registrados. Crea un guía primero.</p>';
    return;
  }
  
  const table = document.createElement('table');
  table.className = 'w-full border-collapse text-sm';
  
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headerRow.className = 'bg-gray-100';
  headerRow.innerHTML = '<th class="border px-2 py-2 font-semibold">Fecha</th>';
  guides.forEach(guide => {
    headerRow.innerHTML += `<th class="border px-2 py-1 font-semibold" colspan="2">${guide.nombre}</th>`;
  });
  thead.appendChild(headerRow);
  
  const subHeaderRow = document.createElement('tr');
  subHeaderRow.className = 'bg-gray-50';
  subHeaderRow.innerHTML = '<th class="border px-2 py-1"></th>';
  guides.forEach(() => {
    subHeaderRow.innerHTML += '<th class="border px-2 py-1 text-xs font-semibold">MAÑANA</th><th class="border px-2 py-1 text-xs font-semibold">TARDE</th>';
  });
  thead.appendChild(subHeaderRow);
  table.appendChild(thead);
  
  const tbody = document.createElement('tbody');
  dates.forEach(fecha => {
    const shifts = shiftsByDate[fecha];
    const dateObj = new Date(fecha + 'T12:00:00');
    const dayName = dateObj.toLocaleDateString('es-ES', { weekday: 'short' });
    const day = dateObj.getDate();
    const monthName = dateObj.toLocaleDateString('es-ES', { month: 'short' });
    
    const row = document.createElement('tr');
    row.innerHTML = `<td class="border px-2 py-2 font-semibold">${dayName}, ${day} ${monthName}</td>`;
    
    guides.forEach(guide => {
      // MAÑANA
      const morningShift = shifts.find(s => s.slot === 'MAÑANA');
      const morningCell = document.createElement('td');
      morningCell.className = 'border px-2 py-1';
      
      if (morningShift?.estado === 'ASIGNADO' && morningShift.guiaId === guide.id) {
        const select = document.createElement('select');
        select.className = 'w-full text-xs border rounded px-1 py-1 bg-green-600 text-white font-semibold';
        select.innerHTML = '<option value="ASIGNADO">ASIGNADO M</option><option value="LIBERAR">LIBERAR</option>';
        morningCell.appendChild(select);
      } else if (morningShift?.estado === 'NO_DISPONIBLE' && morningShift.guiaId === guide.id) {
        morningCell.innerHTML = '<div class="bg-red-500 text-white px-2 py-1 rounded text-xs text-center font-semibold">NO DISPONIBLE</div>';
      } else if (morningShift?.estado === 'LIBRE') {
        const select = document.createElement('select');
        select.className = 'w-full text-xs border rounded px-1 py-1 bg-green-100 text-green-800';
        select.innerHTML = '<option value="">LIBRE</option><option value="ASIGNAR_M">ASIGNAR M</option>';
        morningCell.appendChild(select);
      } else {
        morningCell.innerHTML = '-';
      }
      row.appendChild(morningCell);
      
      // TARDE
      const tardeCell = document.createElement('td');
      tardeCell.className = 'border px-2 py-1';
      
      const afternoonShifts = shifts.filter(s => ['T1', 'T2', 'T3'].includes(s.slot));
      const myAfternoon = afternoonShifts.find(s => 
        (s.estado === 'ASIGNADO' || s.estado === 'NO_DISPONIBLE') && s.guiaId === guide.id
      );
      
      if (myAfternoon?.estado === 'ASIGNADO') {
        const select = document.createElement('select');
        select.className = 'w-full text-xs border rounded px-1 py-1 bg-green-600 text-white font-semibold';
        select.innerHTML = `<option value="${myAfternoon.slot}">${myAfternoon.slot}</option><option value="LIBERAR">LIBERAR</option>`;
        tardeCell.appendChild(select);
      } else if (myAfternoon?.estado === 'NO_DISPONIBLE') {
        tardeCell.innerHTML = '<div class="bg-red-500 text-white px-2 py-1 rounded text-xs text-center font-semibold">NO DISPONIBLE</div>';
      } else {
        const freeShifts = afternoonShifts.filter(s => s.estado === 'LIBRE');
        if (freeShifts.length > 0) {
          const select = document.createElement('select');
          select.className = 'w-full text-xs border rounded px-1 py-1 bg-green-100 text-green-800';
          select.innerHTML = '<option value="">LIBRE</option>';
          freeShifts.forEach(s => {
            select.innerHTML += `<option value="${s.id}_${s.slot}">${s.slot}</option>`;
          });
          tardeCell.appendChild(select);
        } else {
          tardeCell.innerHTML = '-';
        }
      }
      row.appendChild(tardeCell);
    });
    
    tbody.appendChild(row);
  });
  
  table.appendChild(tbody);
  calendarGrid.appendChild(table);
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