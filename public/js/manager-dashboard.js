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
let shiftsUnsubscribes = [];
let allGuides = [];
let collapsedDates = new Set();

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
  const guidesQuery = query(collection(db, 'guides'), where('estado', '==', 'activo'));
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
      guidesList.appendChild(createGuideCard(docSnap.id, guide));
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
        <button onclick="window.editGuide('${id}')" class="bg-sky-500 hover:bg-sky-600 dark:bg-sky-600 dark:hover:bg-sky-700 text-white px-2 sm:px-3 py-1 rounded-lg text-xs sm:text-sm whitespace-nowrap font-semibold shadow-sm transition">Editar</button>
        <button onclick="window.deleteGuide('${id}')" class="bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white px-2 sm:px-3 py-1 rounded-lg text-xs sm:text-sm whitespace-nowrap font-semibold shadow-sm transition">Eliminar</button>
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
  monthFilter.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  monthFilter.addEventListener('change', loadCalendar);
  estadoFilter.addEventListener('change', loadCalendar);
  if (guideFilter) guideFilter.addEventListener('change', loadCalendar);
  loadCalendar();
}

async function loadCalendar() {
  const monthInput = document.getElementById('month-filter');
  const estadoFilter = document.getElementById('estado-filter').value;
  if (!monthInput.value) {
    const today = new Date();
    monthInput.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  }
  const [year, month] = monthInput.value.split('-');
  const startDate = `${year}-${month}-01`;
  const endDate = `${year}-${month}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
  
  shiftsUnsubscribes.forEach(unsub => unsub());
  shiftsUnsubscribes = [];
  
  const guidesSnapshot = await getDocs(query(collection(db, 'guides'), where('estado', '==', 'activo')));
  const guides = [];
  guidesSnapshot.forEach(doc => guides.push({ id: doc.id, ...doc.data() }));
  
  const allShifts = new Map();
  
  for (const guide of guides) {
    const shiftsQuery = query(
      collection(db, 'guides', guide.id, 'shifts'),
      where('fecha', '>=', startDate),
      where('fecha', '<=', endDate)
    );
    
    const unsub = onSnapshot(shiftsQuery, (snapshot) => {
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const key = `${guide.id}_${data.fecha}_${data.slot}`;
        allShifts.set(key, { 
          id: docSnap.id, 
          guideId: guide.id,
          docPath: `guides/${guide.id}/shifts/${docSnap.id}`,
          ...data 
        });
      });
      renderCalendar(allShifts, guides, estadoFilter);
    });
    
    shiftsUnsubscribes.push(unsub);
  }
}

function renderCalendar(shiftsMap, guides, estadoFilter) {
  const shiftsByDate = {};
  Array.from(shiftsMap.values()).forEach(shift => {
    if (estadoFilter && shift.estado !== estadoFilter) return;
    if (!shiftsByDate[shift.fecha]) shiftsByDate[shift.fecha] = [];
    shiftsByDate[shift.fecha].push(shift);
  });
  
  if (isMobile()) {
    renderMobileAccordion(shiftsByDate, guides);
  } else {
    renderDesktopCalendar(shiftsByDate, guides);
  }
}

function renderMobileAccordion(shiftsByDate, guides) {
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
  
  const accordion = document.createElement('div');
  accordion.className = 'space-y-2';
  
  dates.forEach(fecha => {
    const shifts = shiftsByDate[fecha];
    const dateObj = new Date(fecha + 'T12:00:00');
    const dayName = dateObj.toLocaleDateString('es-ES', { weekday: 'short' });
    const day = dateObj.getDate();
    const month = dateObj.getMonth() + 1;
    const isCollapsed = collapsedDates.has(fecha);
    
    const dateCard = document.createElement('div');
    dateCard.className = 'bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden';
    
    const header = document.createElement('div');
    header.className = 'flex items-center justify-between p-3 cursor-pointer bg-gradient-to-r from-sky-500 to-cyan-600 dark:from-sky-700 dark:to-cyan-800 text-white';
    header.onclick = () => toggleDate(fecha);
    header.innerHTML = `
      <span class="font-semibold">${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${day}/${month}</span>
      <span class="text-xl transition-transform duration-200 ${isCollapsed ? '' : 'rotate-180'}">▼</span>
    `;
    
    const content = document.createElement('div');
    content.className = `overflow-hidden transition-all duration-300 ${isCollapsed ? 'max-h-0' : 'max-h-[2000px]'}`;
    content.id = `date-${fecha}`;
    
    const guidesList = document.createElement('div');
    guidesList.className = 'divide-y divide-gray-200 dark:divide-gray-700';
    
    guides.forEach(guide => {
      const morningShift = shifts.find(s => s.slot === 'MAÑANA' && s.guideId === guide.id);
      const afternoonShifts = shifts.filter(s => ['T1', 'T2', 'T3'].includes(s.slot) && s.guideId === guide.id);
      
      const guideRow = document.createElement('div');
      guideRow.className = 'p-3 hover:bg-gray-50 dark:hover:bg-gray-750 transition';
      guideRow.innerHTML = `
        <div class="font-medium text-sm mb-2 text-gray-800 dark:text-gray-200 flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-sky-500"></span>
          ${guide.nombre}
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">🌅 Mañana</div>
            ${createMobileShiftBadge(morningShift, guide.id)}
          </div>
          <div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">🌆 Tarde</div>
            ${createMobileAfternoonBadge(afternoonShifts, guide.id)}
          </div>
        </div>
      `;
      
      guidesList.appendChild(guideRow);
    });
    
    content.appendChild(guidesList);
    dateCard.appendChild(header);
    dateCard.appendChild(content);
    accordion.appendChild(dateCard);
  });
  
  calendarGrid.appendChild(accordion);
}

function toggleDate(fecha) {
  if (collapsedDates.has(fecha)) {
    collapsedDates.delete(fecha);
  } else {
    collapsedDates.add(fecha);
  }
  loadCalendar();
}

function createMobileShiftBadge(shift, guideId) {
  if (!shift) return '<div class="text-center text-gray-400 dark:text-gray-600 text-xs">-</div>';
  
  if (shift.estado === 'ASIGNADO') {
    return `
      <select onchange="handleShiftActionGlobal(event, '${shift.docPath}', '${guideId}')" class="w-full text-xs font-bold rounded-lg px-2 py-1.5 bg-sky-500 dark:bg-sky-600 text-white border-2 border-sky-400 dark:border-sky-500">
        <option>🔵 ASIG</option>
        <option value="LIBERAR">← Liberar</option>
      </select>
    `;
  } else if (shift.estado === 'NO_DISPONIBLE') {
    return '<div class="bg-red-500 dark:bg-red-600 text-white rounded-lg px-2 py-1.5 text-center text-xs font-bold">🔴 NO DISP</div>';
  } else if (shift.estado === 'LIBRE') {
    return `
      <select onchange="handleShiftActionGlobal(event, '${shift.docPath}', '${guideId}')" class="w-full text-xs rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600">
        <option>🟢 LIBRE</option>
        <option value="ASIGNAR">→ Asignar</option>
      </select>
    `;
  }
  return '<div class="text-center text-gray-500 text-xs">-</div>';
}

function createMobileAfternoonBadge(afternoonShifts, guideId) {
  const assignedShifts = afternoonShifts.filter(s => s.estado === 'ASIGNADO');
  const blockedShifts = afternoonShifts.filter(s => s.estado === 'NO_DISPONIBLE');
  const freeShifts = afternoonShifts.filter(s => s.estado === 'LIBRE');
  
  if (assignedShifts.length > 0) {
    const slotNames = assignedShifts.map(s => s.slot).join('+');
    return `
      <select onchange="handleShiftActionGlobal(event, '${assignedShifts[0].docPath}', '${guideId}')" class="w-full text-xs font-bold rounded-lg px-2 py-1.5 bg-sky-500 dark:bg-sky-600 text-white border-2 border-sky-400 dark:border-sky-500">
        <option>🔵 ${slotNames}</option>
        <option value="LIBERAR">← Liberar</option>
      </select>
    `;
  } else if (blockedShifts.length === 3) {
    return '<div class="bg-red-500 dark:bg-red-600 text-white rounded-lg px-2 py-1.5 text-center text-xs font-bold">🔴 NO DISP</div>';
  } else if (freeShifts.length > 0) {
    const options = freeShifts.map(shift => 
      `<option value="ASIGNAR_${shift.docPath}">→ Asig ${shift.slot}</option>`
    ).join('');
    return `
      <select onchange="handleShiftActionGlobal(event, null, '${guideId}', event.target.value)" class="w-full text-xs rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600">
        <option>🟢 LIBRE</option>
        ${options}
      </select>
    `;
  } else if (blockedShifts.length > 0) {
    return '<div class="bg-gray-400 dark:bg-gray-600 text-white rounded-lg px-2 py-1.5 text-center text-xs font-bold">PARC</div>';
  }
  return '<div class="text-center text-gray-400 dark:text-gray-600 text-xs">-</div>';
}

window.handleShiftActionGlobal = (event, docPath, guideId, actionValue = null) => {
  handleShiftAction(event, docPath, guideId, actionValue);
};

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
      const morningShift = shifts.find(s => s.slot === 'MAÑANA' && s.guideId === guide.id);
      const morningCell = document.createElement('td');
      morningCell.className = 'border px-2 py-1';
      if (morningShift?.estado === 'ASIGNADO') {
        const select = document.createElement('select');
        select.className = 'w-full text-xs border rounded px-1 py-1 bg-sky-600 dark:bg-sky-700 text-white font-semibold';
        select.innerHTML = '<option value="">ASIGNADO</option><option value="LIBERAR">LIBERAR</option>';
        select.addEventListener('change', (e) => handleShiftAction(e, morningShift.docPath, guide.id));
        morningCell.appendChild(select);
      } else if (morningShift?.estado === 'NO_DISPONIBLE') {
        morningCell.innerHTML = '<div class="bg-red-500 dark:bg-red-600 text-white px-2 py-1 rounded text-xs text-center font-semibold">NO DISP</div>';
      } else if (morningShift?.estado === 'LIBRE') {
        const select = document.createElement('select');
        select.className = 'w-full text-xs border border-gray-300 dark:border-gray-600 rounded px-1 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100';
        select.innerHTML = '<option value="">LIBRE</option><option value="ASIGNAR">ASIGNAR</option>';
        select.addEventListener('change', (e) => handleShiftAction(e, morningShift.docPath, guide.id));
        morningCell.appendChild(select);
      } else {
        morningCell.innerHTML = '-';
      }
      row.appendChild(morningCell);
      const tardeCell = document.createElement('td');
      tardeCell.className = 'border px-2 py-1';
      const afternoonShifts = shifts.filter(s => ['T1', 'T2', 'T3'].includes(s.slot) && s.guideId === guide.id);
      const assignedToGuide = afternoonShifts.filter(s => s.estado === 'ASIGNADO');
      const blockedByGuide = afternoonShifts.filter(s => s.estado === 'NO_DISPONIBLE');
      const freeShifts = afternoonShifts.filter(s => s.estado === 'LIBRE');
      if (assignedToGuide.length > 0) {
        const select = document.createElement('select');
        select.className = 'w-full text-xs border rounded px-1 py-1 bg-sky-600 dark:bg-sky-700 text-white font-semibold';
        const slotNames = assignedToGuide.map(s => s.slot).join('+');
        select.innerHTML = `<option value="">ASIG ${slotNames}</option><option value="LIBERAR">LIBERAR</option>`;
        select.addEventListener('change', (e) => handleShiftAction(e, assignedToGuide[0].docPath, guide.id));
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
            select.innerHTML += `<option value="ASIGNAR_${shift.docPath}">ASIG ${shift.slot}</option>`;
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

async function handleShiftAction(event, docPath, guideId, actionValue = null) {
  const action = actionValue || event.target.value;
  if (!action) return;
  event.target.disabled = true;
  try {
    if (action === 'LIBERAR') {
      const shiftRef = doc(db, docPath);
      const shiftDoc = await getDoc(shiftRef);
      const shiftData = shiftDoc.data();
      try {
        const tourExists = await validateTour(shiftData.fecha, shiftData.slot);
        if (tourExists.exists) {
          const guideDoc = await getDoc(doc(db, 'guides', guideId));
          const guideEmail = guideDoc.data().email;
          await removeGuideFromCalendarEvent(tourExists.eventId, guideEmail);
        }
      } catch (calendarError) {
        console.error('Error removing from calendar:', calendarError);
      }
      await updateDoc(shiftRef, { estado: 'LIBRE', updatedAt: serverTimestamp() });
      showToast('Turno liberado correctamente', 'success');
    } else if (action.startsWith('ASIGNAR')) {
      const targetDocPath = action === 'ASIGNAR' ? docPath : action.replace('ASIGNAR_', '');
      const shiftRef = doc(db, targetDocPath);
      const shiftDoc = await getDoc(shiftRef);
      const shiftData = shiftDoc.data();
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
      
      const guidesSnapshot = await getDocs(query(collection(db, 'guides'), where('estado', '==', 'activo')));
      for (const guideDoc of guidesSnapshot.docs) {
        const conflictQuery = query(
          collection(db, 'guides', guideDoc.id, 'shifts'),
          where('fecha', '==', shiftData.fecha),
          where('slot', '==', shiftData.slot),
          where('estado', '==', 'ASIGNADO')
        );
        const conflictDocs = await getDocs(conflictQuery);
        if (!conflictDocs.empty) {
          const conflictGuide = guideDoc.data();
          showToast(`ERROR: Turno ya asignado a ${conflictGuide.nombre}`, 'error');
          event.target.value = '';
          event.target.disabled = false;
          return;
        }
      }
      
      await updateDoc(shiftRef, { estado: 'ASIGNADO', updatedAt: serverTimestamp() });
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
  setTimeout(() => toast.classList.add('hidden'), 3000);
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
  resizeTimer = setTimeout(() => loadCalendar(), 250);
});