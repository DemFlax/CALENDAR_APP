import { auth, db } from './firebase-config.js';
import { 
  collection, 
  query, 
  where, 
  onSnapshot,
  updateDoc,
  doc,
  serverTimestamp,
  getDoc
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

let currentUser = null;
let currentGuideId = null;
let shiftsUnsubscribe = null;

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    const token = await user.getIdTokenResult();
    currentGuideId = token.claims.guideId;
    
    if (!currentGuideId) {
      showToast('Error: No tienes permisos de guía', 'error');
      await signOut(auth);
      window.location.href = '/login.html';
      return;
    }
    
    await loadGuideName();
    loadNextAssignments();
    initCalendar();
  } else {
    window.location.href = '/login.html';
  }
});

async function loadGuideName() {
  try {
    const guideDoc = await getDoc(doc(db, 'guides', currentGuideId));
    if (guideDoc.exists()) {
      document.getElementById('guide-name').textContent = guideDoc.data().nombre;
    }
  } catch (error) {
    console.error('Error loading guide name:', error);
  }
}

function loadNextAssignments() {
  const today = new Date().toISOString().split('T')[0];
  
  const assignmentsQuery = query(
    collection(db, 'shifts'),
    where('guiaId', '==', currentGuideId),
    where('estado', '==', 'ASIGNADO'),
    where('fecha', '>=', today)
  );
  
  onSnapshot(assignmentsQuery, (snapshot) => {
    const container = document.getElementById('next-assignments');
    
    if (snapshot.empty) {
      container.innerHTML = '<p class="text-gray-500">No tienes asignaciones próximas</p>';
      return;
    }
    
    const assignments = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      assignments.push({ id: doc.id, ...data });
    });
    
    assignments.sort((a, b) => a.fecha.localeCompare(b.fecha));
    
    const list = document.createElement('div');
    list.className = 'space-y-2';
    
    assignments.slice(0, 5).forEach(shift => {
      const item = document.createElement('div');
      item.className = 'flex justify-between items-center p-3 bg-blue-50 rounded border border-blue-200';
      
      const dateObj = new Date(shift.fecha + 'T12:00:00');
      const dateStr = dateObj.toLocaleDateString('es-ES', { 
        weekday: 'short', 
        day: 'numeric', 
        month: 'short' 
      });
      
      const slotTime = {
        'MAÑANA': '12:00h',
        'T1': '17:15h',
        'T2': '18:15h',
        'T3': '19:15h'
      }[shift.slot];
      
      item.innerHTML = `
        <div>
          <p class="font-semibold text-blue-900">${dateStr} - ${shift.slot}</p>
          <p class="text-sm text-blue-700">Hora: ${slotTime}</p>
        </div>
        <span class="bg-blue-600 text-white px-3 py-1 rounded text-sm font-semibold">Asignado</span>
      `;
      
      list.appendChild(item);
    });
    
    container.innerHTML = '';
    container.appendChild(list);
  });
}

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
  
  shiftsUnsubscribe = onSnapshot(shiftsQuery, (snapshot) => {
    const shiftsByDate = {};
    
    snapshot.forEach(doc => {
      const data = doc.data();
      
      // Filtrar: ASIGNADO a mí, NO_DISPONIBLE mío, o LIBRE sin dueño
      const isRelevant = 
        (data.estado === 'ASIGNADO' && data.guiaId === currentGuideId) ||
        (data.estado === 'NO_DISPONIBLE' && data.guiaId === currentGuideId) ||
        (data.estado === 'LIBRE' && !data.guiaId);
      
      if (isRelevant) {
        if (!shiftsByDate[data.fecha]) {
          shiftsByDate[data.fecha] = [];
        }
        shiftsByDate[data.fecha].push({ id: doc.id, ...data });
      }
    });
    
    renderCalendar(shiftsByDate, estadoFilter);
  });
}

function renderCalendar(shiftsByDate, estadoFilter) {
  const calendarGrid = document.getElementById('calendar-grid');
  calendarGrid.innerHTML = '';
  
  let dates = Object.keys(shiftsByDate).sort();
  
  // Aplicar filtro estado
  if (estadoFilter !== 'todos') {
    const filtered = {};
    dates.forEach(fecha => {
      const shifts = shiftsByDate[fecha].filter(s => s.estado === estadoFilter);
      if (shifts.length > 0) {
        filtered[fecha] = shifts;
      }
    });
    dates = Object.keys(filtered).sort();
    shiftsByDate = filtered;
  }
  
  if (dates.length === 0) {
    calendarGrid.innerHTML = '<p class="text-center text-gray-500 py-4">No hay turnos en este periodo</p>';
    return;
  }
  
  const table = document.createElement('table');
  table.className = 'w-full border-collapse text-sm';
  
  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr class="bg-gray-100">
      <th class="border px-4 py-3 font-semibold text-left">Fecha</th>
      <th class="border px-4 py-3 font-semibold">MAÑANA</th>
      <th class="border px-4 py-3 font-semibold">TARDE</th>
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
    row.innerHTML = `<td class="border px-4 py-3 font-semibold">${dayName}, ${day} ${monthName}</td>`;
    
    // MAÑANA
    const morningShift = shifts.find(s => s.slot === 'MAÑANA');
    const morningCell = document.createElement('td');
    morningCell.className = 'border px-3 py-3 text-center';
    
    if (morningShift) {
      morningCell.appendChild(createShiftButton(morningShift, 'morning'));
    } else {
      morningCell.innerHTML = '<span class="text-gray-400">-</span>';
    }
    row.appendChild(morningCell);
    
    // TARDE (T1, T2, T3 como bloque)
    const afternoonShifts = shifts.filter(s => ['T1', 'T2', 'T3'].includes(s.slot));
    const afternoonCell = document.createElement('td');
    afternoonCell.className = 'border px-3 py-3 text-center';
    
    if (afternoonShifts.length > 0) {
      afternoonCell.appendChild(createAfternoonButton(afternoonShifts, fecha));
    } else {
      afternoonCell.innerHTML = '<span class="text-gray-400">-</span>';
    }
    row.appendChild(afternoonCell);
    
    tbody.appendChild(row);
  });
  
  table.appendChild(tbody);
  calendarGrid.appendChild(table);
}

function createShiftButton(shift, type) {
  const button = document.createElement('button');
  button.className = 'w-full px-3 py-2 rounded text-sm font-semibold transition-colors';
  
  if (shift.estado === 'ASIGNADO') {
    button.className += ' bg-blue-600 text-white cursor-not-allowed';
    button.textContent = 'ASIGNADO';
    button.disabled = true;
  } else if (shift.estado === 'NO_DISPONIBLE') {
    button.className += ' bg-gray-500 text-white hover:bg-gray-600';
    button.textContent = 'BLOQUEADO';
    button.onclick = () => {
      if (type === 'morning') {
        unlockShift(shift.id);
      }
    };
  } else if (shift.estado === 'LIBRE') {
    button.className += ' bg-green-500 text-white hover:bg-green-600';
    button.textContent = 'BLOQUEAR';
    button.onclick = () => {
      if (type === 'morning') {
        lockShift(shift.id);
      }
    };
  }
  
  return button;
}

function createAfternoonButton(afternoonShifts, fecha) {
  const button = document.createElement('button');
  button.className = 'w-full px-3 py-2 rounded text-sm font-semibold transition-colors';
  
  // Verificar estado: si alguno ASIGNADO → mostrar ASIGNADO
  const hasAssigned = afternoonShifts.some(s => s.estado === 'ASIGNADO' && s.guiaId === currentGuideId);
  const allBlocked = afternoonShifts.every(s => s.estado === 'NO_DISPONIBLE' && s.guiaId === currentGuideId);
  const allFree = afternoonShifts.every(s => s.estado === 'LIBRE');
  
  if (hasAssigned) {
    button.className += ' bg-blue-600 text-white cursor-not-allowed';
    button.textContent = 'ASIGNADO';
    button.disabled = true;
  } else if (allBlocked) {
    button.className += ' bg-gray-500 text-white hover:bg-gray-600';
    button.textContent = 'BLOQUEADO';
    button.onclick = () => unlockAfternoon(fecha);
  } else if (allFree) {
    button.className += ' bg-green-500 text-white hover:bg-green-600';
    button.textContent = 'BLOQUEAR TARDE';
    button.onclick = () => lockAfternoon(fecha);
  } else {
    // Estado mixto (algunos libres, algunos bloqueados por otros)
    button.className += ' bg-yellow-500 text-white cursor-not-allowed';
    button.textContent = 'PARCIAL';
    button.disabled = true;
  }
  
  return button;
}

async function lockShift(shiftId) {
  try {
    await updateDoc(doc(db, 'shifts', shiftId), {
      estado: 'NO_DISPONIBLE',
      guiaId: currentGuideId,
      updatedAt: serverTimestamp()
    });
    showToast('Turno bloqueado', 'success');
  } catch (error) {
    console.error('Error locking shift:', error);
    showToast('Error al bloquear', 'error');
  }
}

async function lockAfternoon(fecha) {
  try {
    const updates = ['T1', 'T2', 'T3'].map(slot => {
      const shiftId = `${fecha}_${slot}`;
      return updateDoc(doc(db, 'shifts', shiftId), {
        estado: 'NO_DISPONIBLE',
        guiaId: currentGuideId,
        updatedAt: serverTimestamp()
      });
    });
    
    await Promise.all(updates);
    showToast('Tarde bloqueada', 'success');
  } catch (error) {
    console.error('Error locking afternoon:', error);
    showToast('Error al bloquear tarde', 'error');
  }
}

async function unlockShift(shiftId) {
  try {
    await updateDoc(doc(db, 'shifts', shiftId), {
      estado: 'LIBRE',
      guiaId: null,
      updatedAt: serverTimestamp()
    });
    showToast('Turno desbloqueado', 'success');
  } catch (error) {
    console.error('Error unlocking shift:', error);
    showToast('Error al desbloquear', 'error');
  }
}

async function unlockAfternoon(fecha) {
  try {
    const updates = ['T1', 'T2', 'T3'].map(slot => {
      const shiftId = `${fecha}_${slot}`;
      return updateDoc(doc(db, 'shifts', shiftId), {
        estado: 'LIBRE',
        guiaId: null,
        updatedAt: serverTimestamp()
      });
    });
    
    await Promise.all(updates);
    showToast('Tarde desbloqueada', 'success');
  } catch (error) {
    console.error('Error unlocking afternoon:', error);
    showToast('Error al desbloquear tarde', 'error');
  }
}

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
  if (shiftsUnsubscribe) shiftsUnsubscribe();
});