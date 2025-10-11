import { auth, db } from './firebase-config.js';
import { validateTour, addGuideToCalendarEvent, removeGuideFromCalendarEvent } from './calendar-api.js';
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
let allGuides = [];

function isMobile() {
  return window.innerWidth < 768;
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    loadGuides();
    initCalendar();
  } else {
    window.location.href = '/login.html';
  }
});

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
      guidesList.innerHTML = '<p class="text-gray-500 dark:text-gray-400 text-sm">No hay guías registrados</p>';
      allGuides = [];
      return;
    }

    allGuides = [];
    snapshot.forEach((docSnap) => {
      const guide = docSnap.data();
      allGuides.push({ id: docSnap.id, ...guide });
      const guideCard = createGuideCard(docSnap.id, guide);
      guidesList.appendChild(guideCard);
    });
    
    updateGuideFilter();
  });
}

function updateGuideFilter() {
  const guideFilter = document.getElementById('guide-filter');
  if (!guideFilter) return;
  
  guideFilter.innerHTML = '<option value="">Todos los guías</option>';
  allGuides.forEach(guide => {
    guideFilter.innerHTML += `<option value="${guide.id}">${guide.nombre}</option>`;
  });
}

function createGuideCard(id, guide) {
  const card = document.createElement('div');
  card.className = 'guide-card bg-white dark:bg-gray-800 p-3 sm:p-4 rounded-2xl shadow-lg hover:shadow-xl transition';
  card.innerHTML = `
    <div class="flex justify-between items-start gap-2">
      <div class="flex-1 min-w-0">
        <h3 class="font-semibold text-base sm:text-lg truncate text-gray-800 dark:text-gray-200">${guide.nombre}</h3>
        <p class="text-gray-600 dark:text-gray-400 text-xs sm:text-sm truncate">Email: ${guide.email}</p>
        <p class="text-gray-500 dark:text-gray-500 text-xs sm:text-sm">DNI: ${guide.dni}</p>
        <p class="text-gray-500 dark:text-gray-500 text-xs sm:text-sm">Tel: ${guide.telefono || 'Sin teléfono'}</p>
      </div>
      <div class="flex flex-col gap-1.5 sm:gap-2">
        <button 
          onclick="window.editGuide('${id}')" 
          class="bg-sky-500 hover:bg-sky-600 dark:bg-sky-600 dark:hover:bg-sky-700 text-white px-2 sm:px-3 py-1 rounded-lg text-xs sm:text-sm whitespace-nowrap font-semibold shadow-sm transition">
          Editar
        </button>
        <button 
          onclick="window.deleteGuide('${id}')" 
          class="bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white px-2 sm:px-3 py-1 rounded-lg text-xs sm:text-sm whitespace-nowrap font-semibold shadow-sm transition">
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

window.closeGuideModal = () => {
  document.getElementById('guide-modal').classList.add('hidden');
  document.getElementById('guide-form').reset();
};

// =========================================
// FIX: Formulario guías con lógica reactivación
// =========================================
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
      // NUEVA LÓGICA: Verificar si ya existe guía con ese email
      const existingQuery = query(
        collection(db, 'guides'),
        where('email', '==', formData.email)
      );
      const existingDocs = await getDocs(existingQuery);
      
      if (!existingDocs.empty) {
        // Ya existe un guía con ese email
        const existingDoc = existingDocs.docs[0];
        const existingGuide = existingDoc.data();
        
        if (existingGuide.estado === 'activo') {
          // Ya existe y está activo → ERROR
          showToast('Error: Ya existe un guía con ese email (activo)', 'error');
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
          return;
        } else {
          // Existe pero está inactivo → REACTIVAR
          formData.reactivatedAt = serverTimestamp();
          await updateDoc(doc(db, 'guides', existingDoc.id), formData);
          showToast('Guía reactivado correctamente', 'success');
          closeGuideModal();
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
          return;
        }
      }
      
      // No existe → CREAR NUEVO
      formData.createdAt = serverTimestamp();
      await addDoc(collection(db, 'guides'), formData);
      showToast('Guía creado correctamente', 'success');
      
    } else if (mode === 'edit') {
      // Modo edición: sin cambios
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

function initCalendar() {
  const monthFilter = document.getElementById('month-filter');
  const estadoFilter = document.getElementById('estado-filter');
  const guideFilter = document.getElementById('guide-filter');
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  monthFilter.value = `${year}-${month}`;
  monthFilter.addEventListener('change', loadCalendar);
  estadoFilter.addEventListener('change', loadCalendar);
  if (guideFilter) {
    guideFilter.addEventListener('change', loadCalendar);
  }
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
      if (estadoFilter && data.estado !== estadoFilter) {
        return;
      }
      if (!shiftsByDate[data.fecha]) {
        shiftsByDate[data.fecha] = [];
      }
      shiftsByDate[data.fecha].push({ id: doc.id, ...data });
    });
    if (isMobile()) {
      const guideFilterEl = document.getElementById('guide-filter');
      const selectedGuideId = guideFilterEl ? guideFilterEl.value : '';
      renderMobileCalendar(shiftsByDate, guides, selectedGuideId);
    } else {
      renderDesktopCalendar(shiftsByDate, guides);
    }
  });
}

function renderMobileCalendar(shiftsByDate, guides, selectedGuideId) {
  const calendarGrid = document.getElementById('calendar-grid');
  calendarGrid.innerHTML = '';
  const dates = Object.keys(shiftsByDate).sort();
  if (dates.length === 0) {
    calendarGrid.innerHTML = '<p class="text-center text-gray-500 dark:text-gray-400 py-4 text-sm">No hay turnos en este periodo</p>';
    return;
  }
  if (guides.length === 0) {
    calendarGrid.innerHTML = '<p class="text-center text-gray-500 dark:text-gray-400 py-4 text-sm">No hay guías registrados.</p>';
    return;
  }
  if (!selectedGuideId) {
    renderDesktopCalendar(shiftsByDate, guides);
  } else {
    const selectedGuide = guides.find(g => g.id === selectedGuideId);
    if (!selectedGuide) return;
    const table = document.createElement('table');
    table.className = 'w-full text-sm';
    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr class="bg-gradient-to-r from-gray-100 to-gray-50 dark:from-gray-700 dark:to-gray-750">
        <th class="border-b-2 border-gray-200 dark:border-gray-600 px-3 py-3 text-left font-bold text-gray-700 dark:text-gray-200">Fecha</th>
        <th class="border-b-2 border-gray-200 dark:border-gray-600 px-3 py-3 font-bold text-gray-700 dark:text-gray-200">Mañana</th>
        <th class="border-b-2 border-gray-200 dark:border-gray-600 px-3 py-3 font-bold text-gray-700 dark:text-gray-200">Tarde</th>
      </tr>
    `;
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    dates.forEach(fecha => {
      const shifts = shiftsByDate[fecha];
      const dateObj = new Date(fecha + 'T12:00:00');
      const dayName = dateObj.toLocaleDateString('es-ES', { weekday: 'short' });
      const day = dateObj.getDate();
      const monthName = dateObj.toLocaleDateString('es-ES', { month: 'short' });
      const row = document.createElement('tr');
      row.id = `row-${fecha}`;
      row.className = 'hover:bg-sky-50 dark:hover:bg-sky-900/20 transition';
      const dateCell = document.createElement('td');
      dateCell.className = 'border-b border-gray-100 dark:border-gray-700 px-3 py-3 font-semibold text-gray-800 dark:text-gray-200 cursor-pointer';
      dateCell.textContent = `${dayName}, ${day} ${monthName}`;
      dateCell.onclick = () => selectRow(`row-${fecha}`);
      row.appendChild(dateCell);
      const morningShift = shifts.find(s => s.slot === 'MAÑANA' && s.guiaId === selectedGuide.id);
      const morningCell = document.createElement('td');
      morningCell.className = 'border-b border-gray-100 dark:border-gray-700 px-2 py-2';
      morningCell.appendChild(createMobileShiftElement(morningShift, selectedGuide.id));
      row.appendChild(morningCell);
      const afternoonShifts = shifts.filter(s => ['T1', 'T2', 'T3'].includes(s.slot) && s.guiaId === selectedGuide.id);
      const tardeCell = document.createElement('td');
      tardeCell.className = 'border-b border-gray-100 dark:border-gray-700 px-2 py-2';
      tardeCell.appendChild(createMobileAfternoonElement(afternoonShifts, selectedGuide.id));
      row.appendChild(tardeCell);
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    calendarGrid.appendChild(table);
  }
}

function createMobileShiftElement(shift, guideId) {
  if (!shift) {
    const div = document.createElement('div');
    div.textContent = '-';
    div.className = 'text-center text-gray-400 dark:text-gray-600';
    return div;
  }
  if (shift.estado === 'ASIGNADO') {
    const select = document.createElement('select');
    select.className = 'w-full border-2 border-sky-400 dark:border-sky-500 bg-sky-500 dark:bg-sky-600 text-white rounded-xl px-3 py-2.5 text-sm font-bold focus:ring-2 focus:ring-sky-400 dark:focus:ring-sky-300 transition shadow-sm';
    select.innerHTML = '<option>★ ASIGNADO</option><option value="LIBERAR">← LIBERAR</option>';
    select.addEventListener('change', (e) => handleShiftAction(e, shift.id, guideId));
    return select;
  } else if (shift.estado === 'NO_DISPONIBLE') {
    const div = document.createElement('div');
    div.className = 'bg-red-500 dark:bg-red-600 text-white rounded-xl px-3 py-2.5 text-center text-xs font-bold shadow-sm';
    div.textContent = '✕ NO DISPONIBLE';
    return div;
  } else if (shift.estado === 'LIBRE') {
    const select = document.createElement('select');
    select.className = 'w-full border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm font-semibold focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 transition';
    select.innerHTML = '<option>✓ LIBRE</option><option value="ASIGNAR">→ ASIGNAR</option>';
    select.addEventListener('change', (e) => handleShiftAction(e, shift.id, guideId));
    return select;
  }
  const div = document.createElement('div');
  div.textContent = shift.estado;
  div.className = 'text-center text-gray-500 dark:text-gray-400';
  return div;
}
function createMobileAfternoonElement(afternoonShifts, guideId) {
  const assignedShifts = afternoonShifts.filter(s => s.estado === 'ASIGNADO');
  const blockedShifts = afternoonShifts.filter(s => s.estado === 'NO_DISPONIBLE');
  const freeShifts = afternoonShifts.filter(s => s.estado === 'LIBRE');
  if (assignedShifts.length > 0) {
    const select = document.createElement('select');
    select.className = 'w-full border-2 border-sky-400 dark:border-sky-500 bg-sky-500 dark:bg-sky-600 text-white rounded-xl px-3 py-2.5 text-sm font-bold focus:ring-2 focus:ring-sky-400 dark:focus:ring-sky-300 transition shadow-sm';
    const slotNames = assignedShifts.map(s => s.slot).join('+');
    select.innerHTML = `<option>★ ASIGNADO ${slotNames}</option><option value="LIBERAR">← LIBERAR</option>`;
    select.addEventListener('change', (e) => handleShiftAction(e, assignedShifts[0].id, guideId));
    return select;
  } else if (blockedShifts.length === 3) {
    const div = document.createElement('div');
    div.className = 'bg-red-500 dark:bg-red-600 text-white rounded-xl px-3 py-2.5 text-center text-xs font-bold shadow-sm';
    div.textContent = '✕ NO DISPONIBLE';
    return div;
  } else if (freeShifts.length > 0) {
    const select = document.createElement('select');
    select.className = 'w-full border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm font-semibold focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 transition';
    select.innerHTML = '<option>✓ LIBRE</option>';
    freeShifts.forEach(shift => {
      select.innerHTML += `<option value="ASIGNAR_${shift.id}">→ ASIGNAR ${shift.slot}</option>`;
    });
    select.addEventListener('change', (e) => handleShiftAction(e, null, guideId, e.target.value));
    return select;
  } else if (blockedShifts.length > 0) {
    const div = document.createElement('div');
    div.className = 'bg-gray-400 dark:bg-gray-600 text-white rounded-xl px-3 py-2.5 text-center text-xs font-bold shadow-sm';
    div.textContent = 'PARCIAL';
    return div;
  }
  const div = document.createElement('div');
  div.textContent = '-';
  div.className = 'text-center text-gray-400 dark:text-gray-600';
  return div;
}

function selectRow(rowId) {
  document.querySelectorAll('tbody tr').forEach(r => r.classList.remove('row-selected'));
  const row = document.getElementById(rowId);
  if (row) row.classList.add('row-selected');
}

function renderDesktopCalendar(shiftsByDate, guides) {
  const calendarGrid = document.getElementById('calendar-grid');
  calendarGrid.innerHTML = '';
  const dates = Object.keys(shiftsByDate).sort();
  if (dates.length === 0) {
    calendarGrid.innerHTML = '<p class="text-center text-gray-500 dark:text-gray-400 py-4 text-sm">No hay turnos en este periodo</p>';
    return;
  }
  if (guides.length === 0) {
    calendarGrid.innerHTML = '<p class="text-center text-gray-500 dark:text-gray-400 py-4 text-sm">No hay guías registrados.</p>';
    return;
  }
  const table = document.createElement('table');
  table.className = 'calendar-table w-full border-collapse text-sm';
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headerRow.className = 'bg-gradient-to-r from-gray-100 to-gray-50 dark:from-gray-700 dark:to-gray-750';
  headerRow.innerHTML = '<th class="border px-2 py-2 font-semibold text-xs sm:text-base text-gray-700 dark:text-gray-200">Fecha</th>';
  guides.forEach(guide => {
    headerRow.innerHTML += `<th class="border px-2 py-1 font-semibold text-xs sm:text-sm text-gray-700 dark:text-gray-200" colspan="2">${guide.nombre}</th>`;
  });
  thead.appendChild(headerRow);
  const subHeaderRow = document.createElement('tr');
  subHeaderRow.className = 'bg-gray-50 dark:bg-gray-700';
  subHeaderRow.innerHTML = '<th class="border px-2 py-1"></th>';
  guides.forEach(() => {
    subHeaderRow.innerHTML += '<th class="border px-2 py-1 text-xs font-semibold text-gray-700 dark:text-gray-200">MAÑANA</th><th class="border px-2 py-1 text-xs font-semibold text-gray-700 dark:text-gray-200">TARDE</th>';
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
    row.className = 'hover:bg-gray-50 dark:hover:bg-gray-750 transition';
    row.innerHTML = `<td class="border px-2 py-2 font-semibold text-xs sm:text-sm text-gray-800 dark:text-gray-200">${dayName}, ${day} ${monthName}</td>`;
    guides.forEach(guide => {
      const morningShift = shifts.find(s => s.slot === 'MAÑANA' && s.guiaId === guide.id);
      const morningCell = document.createElement('td');
      morningCell.className = 'border px-2 py-1';
      if (morningShift?.estado === 'ASIGNADO') {
        const select = document.createElement('select');
        select.className = 'w-full text-xs border rounded px-1 py-1 bg-sky-600 dark:bg-sky-700 text-white font-semibold';
        select.innerHTML = '<option value="">ASIGNADO</option><option value="LIBERAR">LIBERAR</option>';
        select.addEventListener('change', (e) => handleShiftAction(e, morningShift.id, guide.id));
        morningCell.appendChild(select);
      } else if (morningShift?.estado === 'NO_DISPONIBLE') {
        morningCell.innerHTML = '<div class="bg-red-500 dark:bg-red-600 text-white px-2 py-1 rounded text-xs text-center font-semibold">NO DISP</div>';
      } else if (morningShift?.estado === 'LIBRE') {
        const select = document.createElement('select');
        select.className = 'w-full text-xs border border-gray-300 dark:border-gray-600 rounded px-1 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100';
        select.innerHTML = '<option value="">LIBRE</option><option value="ASIGNAR">ASIGNAR</option>';
        select.addEventListener('change', (e) => handleShiftAction(e, morningShift.id, guide.id));
        morningCell.appendChild(select);
      } else {
        morningCell.innerHTML = '-';
      }
      row.appendChild(morningCell);
      const tardeCell = document.createElement('td');
      tardeCell.className = 'border px-2 py-1';
      const afternoonShifts = shifts.filter(s => ['T1', 'T2', 'T3'].includes(s.slot) && s.guiaId === guide.id);
      const assignedToGuide = afternoonShifts.filter(s => s.estado === 'ASIGNADO');
      const blockedByGuide = afternoonShifts.filter(s => s.estado === 'NO_DISPONIBLE');
      const freeShifts = afternoonShifts.filter(s => s.estado === 'LIBRE');
      if (assignedToGuide.length > 0) {
        const select = document.createElement('select');
        select.className = 'w-full text-xs border rounded px-1 py-1 bg-sky-600 dark:bg-sky-700 text-white font-semibold';
        const slotNames = assignedToGuide.map(s => s.slot).join('+');
        select.innerHTML = `<option value="">ASIG ${slotNames}</option><option value="LIBERAR">LIBERAR</option>`;
        select.addEventListener('change', (e) => handleShiftAction(e, assignedToGuide[0].id, guide.id));
        tardeCell.appendChild(select);
      } else if (blockedByGuide.length === 3) {
        tardeCell.innerHTML = '<div class="bg-red-500 dark:bg-red-600 text-white px-2 py-1 rounded text-xs text-center font-semibold">NO DISP</div>';
      } else if (freeShifts.length > 0) {
        const select = document.createElement('select');
        select.className = 'w-full text-xs border border-gray-300 dark:border-gray-600 rounded px-1 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100';
        select.innerHTML = '<option value="">LIBRE</option>';
        const addedSlots = new Set();
        freeShifts.forEach(shift => {
          if (!addedSlots.has(shift.slot)) {
            select.innerHTML += `<option value="ASIGNAR_${shift.id}">ASIG ${shift.slot}</option>`;
            addedSlots.add(shift.slot);
          }
        });
        select.addEventListener('change', (e) => handleShiftAction(e, null, guide.id, e.target.value));
        tardeCell.appendChild(select);
      } else if (blockedByGuide.length > 0 && blockedByGuide.length < 3) {
        tardeCell.innerHTML = '<div class="bg-gray-400 dark:bg-gray-600 text-white px-2 py-1 rounded text-xs text-center font-semibold">PARC</div>';
      } else {
        tardeCell.innerHTML = '-';
      }
      row.appendChild(tardeCell);
    });
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  calendarGrid.appendChild(table);
}

async function handleShiftAction(event, shiftId, guideId, actionValue = null) {
  const action = actionValue || event.target.value;
  if (!action) return;
  event.target.disabled = true;
  try {
    if (action === 'LIBERAR') {
      const shiftDoc = await getDoc(doc(db, 'shifts', shiftId));
      const shiftData = shiftDoc.data();
      if (shiftData.guiaId) {
        try {
          const tourExists = await validateTour(shiftData.fecha, shiftData.slot);
          if (tourExists.exists) {
            const guideDoc = await getDoc(doc(db, 'guides', shiftData.guiaId));
            const guideEmail = guideDoc.data().email;
            await removeGuideFromCalendarEvent(tourExists.eventId, guideEmail);
          }
        } catch (calendarError) {
          console.error('Error removing from calendar:', calendarError);
        }
      }
      await updateDoc(doc(db, 'shifts', shiftId), {
        estado: 'LIBRE',
        updatedAt: serverTimestamp()
      });
      showToast('Turno liberado correctamente', 'success');
    } else if (action.startsWith('ASIGNAR')) {
      const targetShiftId = action === 'ASIGNAR' ? shiftId : action.replace('ASIGNAR_', '');
      const shiftDoc = await getDoc(doc(db, 'shifts', targetShiftId));
      const shiftData = shiftDoc.data();
      if (shiftData.guiaId !== guideId) {
        showToast('ERROR: Turno no pertenece a este guía', 'error');
        event.target.value = '';
        event.target.disabled = false;
        return;
      }
      if (shiftData.estado !== 'LIBRE') {
        showToast('ERROR: Turno no disponible', 'error');
        event.target.value = '';
        event.target.disabled = false;
        return;
      }
      showToast('Validando tour en calendario...', 'info');
      const tourExists = await validateTour(shiftData.fecha, shiftData.slot);
      if (!tourExists.exists) {
        showToast('ERROR: NO EXISTE TOUR EN ESE HORARIO', 'error');
        event.target.value = '';
        event.target.disabled = false;
        return;
      }
      await updateDoc(doc(db, 'shifts', targetShiftId), {
        estado: 'ASIGNADO',
        updatedAt: serverTimestamp()
      });
      try {
        const guideDoc = await getDoc(doc(db, 'guides', guideId));
        const guideEmail = guideDoc.data().email;
        showToast('Añadiendo guía al evento Calendar...', 'info');
        await addGuideToCalendarEvent(tourExists.eventId, guideEmail);
        showToast('Turno asignado e invitación enviada', 'success');
      } catch (calendarError) {
        console.error('Error calendar invitation:', calendarError);
        showToast('Turno asignado (error invitación Calendar)', 'warning');
      }
    }
    event.target.value = '';
    event.target.disabled = false;
  } catch (error) {
    console.error('Error updating shift:', error);
    showToast('Error: ' + error.message, 'error');
    event.target.value = '';
    event.target.disabled = false;
  }
}

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

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    loadCalendar();
  }, 250);
});