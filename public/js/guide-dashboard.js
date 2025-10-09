import { auth, db } from './firebase-config.js';
import {
  collection,
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
let currentGuideId = null;
let shiftsUnsubscribe = [];

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    
    const token = await user.getIdTokenResult(true);
    currentGuideId = token.claims.guideId;
    
    if (!currentGuideId) {
      alert('No tienes permisos de guía');
      await signOut(auth);
      window.location.href = '/login.html';
      return;
    }
    
    const guideDoc = await getDoc(doc(db, 'guides', currentGuideId));
    
    if (!guideDoc.exists() || guideDoc.data().estado !== 'activo') {
      alert('Cuenta inactiva');
      await signOut(auth);
      window.location.href = '/login.html';
      return;
    }
    
    document.getElementById('guide-name').textContent = guideDoc.data().nombre;
    
    loadUpcomingAssignments();
    initCalendar();
  } else {
    window.location.href = '/login.html';
  }
});

async function loadUpcomingAssignments() {
  const today = new Date().toISOString().split('T')[0];
  
  const assignmentsQuery = query(
    collection(db, 'shifts'),
    where('guiaId', '==', currentGuideId),
    where('estado', '==', 'ASIGNADO'),
    where('fecha', '>=', today)
  );
  
  const snapshot = await getDocs(assignmentsQuery);
  const assignmentsList = document.getElementById('next-assignments');
  
  if (snapshot.empty) {
    assignmentsList.innerHTML = '<p class="text-gray-500 text-sm sm:text-base">No tienes asignaciones próximas</p>';
    return;
  }
  
  const assignments = [];
  snapshot.forEach(doc => {
    assignments.push({ id: doc.id, ...doc.data() });
  });
  
  assignments.sort((a, b) => a.fecha.localeCompare(b.fecha));
  
  assignmentsList.innerHTML = assignments.map(a => `
    <div class="bg-blue-50 p-2 sm:p-3 rounded mb-2">
      <p class="font-semibold text-sm sm:text-base">${new Date(a.fecha + 'T12:00:00').toLocaleDateString('es-ES', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })}</p>
      <p class="text-xs sm:text-sm text-gray-600">${a.slot === 'MAÑANA' ? 'Mañana' : `Tarde ${a.slot}`}</p>
    </div>
  `).join('');
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
  
  if (shiftsUnsubscribe.length > 0) {
    shiftsUnsubscribe.forEach(unsub => unsub());
    shiftsUnsubscribe = [];
  }
  
  const allShifts = new Map();
  
  const myShiftsQuery = query(
    collection(db, 'shifts'),
    where('guiaId', '==', currentGuideId),
    where('fecha', '>=', startDate),
    where('fecha', '<=', endDate)
  );
  
  const freeShiftsQuery = query(
    collection(db, 'shifts'),
    where('estado', '==', 'LIBRE'),
    where('fecha', '>=', startDate),
    where('fecha', '<=', endDate)
  );
  
  shiftsUnsubscribe.push(
    onSnapshot(myShiftsQuery, (snapshot) => {
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        allShifts.set(docSnap.id, { id: docSnap.id, ...data });
      });
      renderCalendar(allShifts, estadoFilter);
    }, (error) => {
      console.error('Error en listener mis turnos:', error);
      showToast('Error al cargar turnos', 'error');
    })
  );
  
  shiftsUnsubscribe.push(
    onSnapshot(freeShiftsQuery, (snapshot) => {
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        allShifts.set(docSnap.id, { id: docSnap.id, ...data });
      });
      renderCalendar(allShifts, estadoFilter);
    }, (error) => {
      console.error('Error en listener turnos libres:', error);
      showToast('Error al cargar turnos libres', 'error');
    })
  );
}

function renderCalendar(shiftsMap, estadoFilter) {
  const calendarGrid = document.getElementById('calendar-grid');
  calendarGrid.innerHTML = '';
  
  const shiftsByDate = {};
  Array.from(shiftsMap.values()).forEach(shift => {
    if (!shiftsByDate[shift.fecha]) {
      shiftsByDate[shift.fecha] = [];
    }
    shiftsByDate[shift.fecha].push(shift);
  });
  
  const dates = Object.keys(shiftsByDate).sort();
  
  if (dates.length === 0) {
    calendarGrid.innerHTML = '<p class="text-center text-gray-500 py-4 text-sm sm:text-base">No hay turnos en este periodo</p>';
    return;
  }
  
  const table = document.createElement('table');
  table.className = 'calendar-table w-full border-collapse';
  
  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr class="bg-gray-100">
      <th class="border px-2 sm:px-4 py-2 sm:py-3 font-semibold text-left text-xs sm:text-base">Fecha</th>
      <th class="border px-2 sm:px-4 py-2 sm:py-3 font-semibold text-xs sm:text-base">MAÑANA</th>
      <th class="border px-2 sm:px-4 py-2 sm:py-3 font-semibold text-xs sm:text-base">TARDE</th>
    </tr>
  `;
  table.appendChild(thead);
  
  const tbody = document.createElement('tbody');
  dates.forEach(fecha => {
    const shifts = shiftsByDate[fecha];
    const dateObj = new Date(fecha + 'T12:00:00');
    const dayName = dateObj.toLocaleDateString('es-ES', { weekday: 'long' });
    const day = dateObj.getDate();
    const monthName = dateObj.toLocaleDateString('es-ES', { month: 'short' });
    
    const row = document.createElement('tr');
    row.innerHTML = `<td class="border px-2 sm:px-4 py-2 sm:py-3 font-semibold text-xs sm:text-base">${dayName}, ${day} ${monthName}</td>`;
    
    const morningShift = shifts.find(s => s.slot === 'MAÑANA');
    const morningCell = document.createElement('td');
    morningCell.className = 'border px-1 sm:px-3 py-2 sm:py-3 text-center';
    
    if (morningShift) {
      morningCell.appendChild(createShiftButton(morningShift, 'morning'));
    } else {
      morningCell.innerHTML = '<span class="text-gray-400 text-xs sm:text-base">-</span>';
    }
    row.appendChild(morningCell);
    
    const afternoonShifts = shifts.filter(s => ['T1', 'T2', 'T3'].includes(s.slot));
    const afternoonCell = document.createElement('td');
    afternoonCell.className = 'border px-1 sm:px-3 py-2 sm:py-3 text-center';
    
    if (afternoonShifts.length > 0) {
      afternoonCell.appendChild(createAfternoonButton(afternoonShifts, fecha));
    } else {
      afternoonCell.innerHTML = '<span class="text-gray-400 text-xs sm:text-base">-</span>';
    }
    row.appendChild(afternoonCell);
    
    tbody.appendChild(row);
  });
  
  table.appendChild(tbody);
  calendarGrid.appendChild(table);
}

function createShiftButton(shift, type) {
  const button = document.createElement('button');
  button.className = 'calendar-btn w-full px-2 sm:px-3 py-2 rounded text-xs sm:text-sm font-semibold transition-colors';
  
  if (shift.estado === 'ASIGNADO' && shift.guiaId === currentGuideId) {
    button.className += ' bg-blue-600 text-white cursor-not-allowed';
    button.textContent = 'ASIGNADO';
    button.disabled = true;
  } else if (shift.estado === 'NO_DISPONIBLE' && shift.guiaId === currentGuideId) {
    button.className += ' bg-gray-500 text-white hover:bg-gray-600';
    button.textContent = 'BLOQUEADO';
    button.onclick = () => unlockShift(shift.id);
  } else if (shift.estado === 'LIBRE') {
    button.className += ' bg-green-500 text-white hover:bg-green-600';
    button.textContent = 'BLOQUEAR';
    button.onclick = () => lockShift(shift.id);
  } else {
    button.className += ' bg-gray-300 text-gray-600 cursor-not-allowed';
    button.textContent = shift.estado;
    button.disabled = true;
  }
  
  return button;
}

function createAfternoonButton(afternoonShifts, fecha) {
  const button = document.createElement('button');
  button.className = 'calendar-btn w-full px-2 sm:px-3 py-2 rounded text-xs sm:text-sm font-semibold transition-colors';
  
  const myShifts = afternoonShifts.filter(s => s.guiaId === currentGuideId);
  const hasAssigned = myShifts.some(s => s.estado === 'ASIGNADO');
  const allBlocked = myShifts.length > 0 && myShifts.every(s => s.estado === 'NO_DISPONIBLE');
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
    button.className += ' bg-gray-300 text-gray-600 cursor-not-allowed';
    button.textContent = 'MIXTO';
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

async function unlockShift(shiftId) {
  try {
    await updateDoc(doc(db, 'shifts', shiftId), {
      estado: 'LIBRE',
      updatedAt: serverTimestamp()
    });
    showToast('Turno desbloqueado', 'success');
  } catch (error) {
    console.error('Error unlocking shift:', error);
    showToast('Error al desbloquear', 'error');
  }
}

async function lockAfternoon(fecha) {
  try {
    const myFreeShiftsQuery = query(
      collection(db, 'shifts'),
      where('fecha', '==', fecha),
      where('guiaId', '==', currentGuideId),
      where('estado', '==', 'LIBRE'),
      where('slot', 'in', ['T1', 'T2', 'T3'])
    );
    
    const snapshot = await getDocs(myFreeShiftsQuery);
    const updates = snapshot.docs.map(docSnap =>
      updateDoc(docSnap.ref, {
        estado: 'NO_DISPONIBLE',
        updatedAt: serverTimestamp()
      })
    );
    
    await Promise.all(updates);
    showToast('Tarde bloqueada', 'success');
  } catch (error) {
    console.error('Error locking afternoon:', error);
    showToast('Error al bloquear tarde', 'error');
  }
}

async function unlockAfternoon(fecha) {
  try {
    const myShiftsQuery = query(
      collection(db, 'shifts'),
      where('fecha', '==', fecha),
      where('guiaId', '==', currentGuideId),
      where('slot', 'in', ['T1', 'T2', 'T3'])
    );
    
    const snapshot = await getDocs(myShiftsQuery);
    const updates = snapshot.docs.map(docSnap =>
      updateDoc(docSnap.ref, {
        estado: 'LIBRE',
        updatedAt: serverTimestamp()
      })
    );
    
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
  toast.className = `fixed bottom-4 right-4 px-4 py-2 sm:px-6 sm:py-3 rounded-lg shadow-lg ${
    type === 'success' ? 'bg-green-500' :
    type === 'error' ? 'bg-red-500' : 'bg-blue-500'
  } text-white text-sm sm:text-base z-50`;
  
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
  if (shiftsUnsubscribe.length > 0) {
    shiftsUnsubscribe.forEach(unsub => unsub());
  }
});