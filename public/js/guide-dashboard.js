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

// i18n
const i18n = {
  es: {
    morning: 'Mañana',
    afternoon: 'Tarde',
    assigned: 'ASIGNADO',
    blocked: 'BLOQUEADO',
    block: 'BLOQUEAR',
    blockAfternoon: 'BLOQUEAR TARDE',
    mixed: 'MIXTO',
    noAssignments: 'No tienes asignaciones próximas',
    noShifts: 'No hay turnos en este periodo',
    dateHeader: 'Fecha',
    morningHeader: 'MAÑANA',
    afternoonHeader: 'TARDE',
    toastBlocked: 'Turno bloqueado',
    toastUnblocked: 'Turno desbloqueado',
    toastAfternoonBlocked: 'Tarde bloqueada',
    toastAfternoonUnblocked: 'Tarde desbloqueada',
    toastError: 'Error'
  },
  en: {
    morning: 'Morning',
    afternoon: 'Afternoon',
    assigned: 'ASSIGNED',
    blocked: 'BLOCKED',
    block: 'BLOCK',
    blockAfternoon: 'BLOCK AFTERNOON',
    mixed: 'MIXED',
    noAssignments: 'No upcoming assignments',
    noShifts: 'No shifts in this period',
    dateHeader: 'Date',
    morningHeader: 'MORNING',
    afternoonHeader: 'AFTERNOON',
    toastBlocked: 'Shift blocked',
    toastUnblocked: 'Shift unblocked',
    toastAfternoonBlocked: 'Afternoon blocked',
    toastAfternoonUnblocked: 'Afternoon unblocked',
    toastError: 'Error'
  }
};
let lang = localStorage.getItem('lang') || 'es';
function t(key) { return i18n[lang][key] || key; }

let currentUser = null;
let currentGuideId = null;
let shiftsUnsubscribe = null;

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
    document.getElementById('page-title').textContent = `Calendario Tours - ${guideDoc.data().nombre}`;
    initLanguageToggle();
    loadUpcomingAssignments();
    initCalendar();
  } else {
    window.location.href = '/login.html';
  }
});

function initLanguageToggle() {
  const langToggle = document.getElementById('lang-toggle');
  langToggle.textContent = lang === 'es' ? 'EN' : 'ES';
  langToggle.addEventListener('click', () => {
    lang = lang === 'es' ? 'en' : 'es';
    localStorage.setItem('lang', lang);
    langToggle.textContent = lang === 'es' ? 'EN' : 'ES';
    loadUpcomingAssignments();
    loadCalendar();
  });
}

async function loadUpcomingAssignments() {
  const today = new Date().toISOString().split('T')[0];
  const assignmentsQuery = query(
    collection(db, 'guides', currentGuideId, 'shifts'),
    where('estado', '==', 'ASIGNADO'),
    where('fecha', '>=', today)
  );
  
  const snapshot = await getDocs(assignmentsQuery);
  const assignmentsList = document.getElementById('next-assignments');
  
  if (snapshot.empty) {
    assignmentsList.innerHTML = `<p class="text-gray-500 dark:text-gray-400 text-sm sm:text-base">${t('noAssignments')}</p>`;
    return;
  }
  
  const assignments = [];
  snapshot.forEach(doc => assignments.push({ id: doc.id, ...doc.data() }));
  assignments.sort((a, b) => a.fecha.localeCompare(b.fecha));
  
  const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const locale = lang === 'es' ? 'es-ES' : 'en-US';
  
  assignmentsList.innerHTML = assignments.map(a => `
    <div class="bg-blue-50 dark:bg-blue-900 p-2 sm:p-3 rounded mb-2">
      <p class="font-semibold text-sm sm:text-base dark:text-white">${new Date(a.fecha + 'T12:00:00').toLocaleDateString(locale, dateOptions)}</p>
      <p class="text-xs sm:text-sm text-gray-600 dark:text-gray-300">${a.slot === 'MAÑANA' ? t('morning') : `${t('afternoon')} ${a.slot}`}</p>
    </div>
  `).join('');
}

function initCalendar() {
  const monthFilter = document.getElementById('month-filter');
  const estadoFilter = document.getElementById('estado-filter');
  const today = new Date();
  monthFilter.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  monthFilter.addEventListener('change', loadCalendar);
  estadoFilter.addEventListener('change', loadCalendar);
  loadCalendar();
}

function loadCalendar() {
  const monthInput = document.getElementById('month-filter');
  const estadoFilter = document.getElementById('estado-filter').value;
  const [year, month] = monthInput.value.split('-');
  const startDate = `${year}-${month}-01`;
  const endDate = `${year}-${month}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
  
  if (shiftsUnsubscribe) {
    shiftsUnsubscribe();
  }
  
  const shiftsQuery = query(
    collection(db, 'guides', currentGuideId, 'shifts'),
    where('fecha', '>=', startDate),
    where('fecha', '<=', endDate)
  );
  
  shiftsUnsubscribe = onSnapshot(shiftsQuery, (snapshot) => {
    const allShifts = new Map();
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (estadoFilter === 'todos' || data.estado === estadoFilter) {
        allShifts.set(docSnap.id, { id: docSnap.id, ...data });
      }
    });
    renderCalendar(allShifts);
  }, (error) => {
    console.error('Error listener shifts:', error);
    showToast(t('toastError'), 'error');
  });
}

function renderCalendar(shiftsMap) {
  const calendarGrid = document.getElementById('calendar-grid');
  calendarGrid.innerHTML = '';
  
  const shiftsByDate = {};
  Array.from(shiftsMap.values()).forEach(shift => {
    if (!shiftsByDate[shift.fecha]) shiftsByDate[shift.fecha] = [];
    shiftsByDate[shift.fecha].push(shift);
  });
  
  const dates = Object.keys(shiftsByDate).sort();
  if (dates.length === 0) {
    calendarGrid.innerHTML = `<p class="text-center text-gray-500 dark:text-gray-400 py-4 text-sm sm:text-base">${t('noShifts')}</p>`;
    return;
  }
  
  const table = document.createElement('table');
  table.className = 'guide-calendar-table w-full border-collapse';
  table.innerHTML = `
    <thead>
      <tr class="bg-gray-100 dark:bg-gray-700">
        <th class="border dark:border-gray-600 px-2 sm:px-4 py-2 sm:py-3 font-semibold text-left text-xs sm:text-base dark:text-white">${t('dateHeader')}</th>
        <th class="border dark:border-gray-600 px-2 sm:px-4 py-2 sm:py-3 font-semibold text-xs sm:text-base dark:text-white">${t('morningHeader')}</th>
        <th class="border dark:border-gray-600 px-2 sm:px-4 py-2 sm:py-3 font-semibold text-xs sm:text-base dark:text-white">${t('afternoonHeader')}</th>
      </tr>
    </thead>
  `;
  
  const tbody = document.createElement('tbody');
  const locale = lang === 'es' ? 'es-ES' : 'en-US';
  
  dates.forEach(fecha => {
    const shifts = shiftsByDate[fecha];
    const dateObj = new Date(fecha + 'T12:00:00');
    const dayName = dateObj.toLocaleDateString(locale, { weekday: 'long' });
    const day = dateObj.getDate();
    const monthName = dateObj.toLocaleDateString(locale, { month: 'short' });
    
    const row = document.createElement('tr');
    row.className = 'hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors cursor-pointer';
    // Añadir zebra striping para mobile
  const rowIndex = dates.indexOf(fecha);
  if (rowIndex % 2 === 0) {
    row.className += ' bg-gray-50 dark:bg-gray-800/50';
  } else {
    row.className += ' bg-white dark:bg-gray-800';
  }
    const dateCell = document.createElement('td');
    dateCell.className = 'border dark:border-gray-600 px-2 sm:px-4 py-2 sm:py-3 font-semibold text-xs sm:text-base dark:text-white';
    dateCell.textContent = `${dayName}, ${day} ${monthName}`;
    row.appendChild(dateCell);
    
    const morningShift = shifts.find(s => s.slot === 'MAÑANA');
    const morningCell = document.createElement('td');
    morningCell.className = 'border dark:border-gray-600 px-1 sm:px-3 py-2 sm:py-3 text-center';
    if (morningShift) {
      morningCell.appendChild(createShiftButton(morningShift));
    } else {
      morningCell.innerHTML = '<span class="text-gray-400 dark:text-gray-500 text-xs sm:text-base">-</span>';
    }
    row.appendChild(morningCell);
    
    const afternoonShifts = shifts.filter(s => ['T1', 'T2', 'T3'].includes(s.slot));
    const afternoonCell = document.createElement('td');
    afternoonCell.className = 'border dark:border-gray-600 px-1 sm:px-3 py-2 sm:py-3 text-center';
    if (afternoonShifts.length > 0) {
      afternoonCell.appendChild(createAfternoonButton(afternoonShifts, fecha));
    } else {
      afternoonCell.innerHTML = '<span class="text-gray-400 dark:text-gray-500 text-xs sm:text-base">-</span>';
    }
    row.appendChild(afternoonCell);
    tbody.appendChild(row);
  });
  
  table.appendChild(tbody);
  calendarGrid.appendChild(table);
}

function createShiftButton(shift) {
  const button = document.createElement('button');
  button.className = 'w-full px-2 sm:px-3 py-2 rounded text-xs sm:text-sm font-semibold transition-colors duration-150';
  
  if (shift.estado === 'ASIGNADO') {
    button.className += ' bg-blue-600 dark:bg-blue-700 text-white cursor-not-allowed';
    button.textContent = t('assigned');
    button.disabled = true;
  } else if (shift.estado === 'NO_DISPONIBLE') {
    button.className += ' bg-gray-500 dark:bg-gray-600 text-white hover:bg-gray-600 dark:hover:bg-gray-700';
    button.textContent = t('blocked');
    button.onclick = () => unlockShift(shift.id);
  } else {
    button.className += ' bg-green-500 dark:bg-green-600 text-white hover:bg-green-600 dark:hover:bg-green-700';
    button.textContent = t('block');
    button.onclick = () => lockShift(shift.id);
  }
  return button;
}

function createAfternoonButton(afternoonShifts, fecha) {
  const button = document.createElement('button');
  button.className = 'w-full px-2 sm:px-3 py-2 rounded text-xs sm:text-sm font-semibold transition-colors duration-150';
  
  const hasAssigned = afternoonShifts.some(s => s.estado === 'ASIGNADO');
  const allBlocked = afternoonShifts.every(s => s.estado === 'NO_DISPONIBLE');
  const allFree = afternoonShifts.every(s => s.estado === 'LIBRE');
  
  if (hasAssigned) {
    button.className += ' bg-blue-600 dark:bg-blue-700 text-white cursor-not-allowed';
    button.textContent = t('assigned');
    button.disabled = true;
  } else if (allBlocked) {
    button.className += ' bg-gray-500 dark:bg-gray-600 text-white hover:bg-gray-600 dark:hover:bg-gray-700';
    button.textContent = t('blocked');
    button.onclick = () => unlockAfternoon(fecha);
  } else if (allFree) {
    button.className += ' bg-green-500 dark:bg-green-600 text-white hover:bg-green-600 dark:hover:bg-green-700';
    button.textContent = t('blockAfternoon');
    button.onclick = () => lockAfternoon(fecha);
  } else {
    button.className += ' bg-gray-300 dark:bg-gray-700 text-gray-600 dark:text-gray-300 cursor-not-allowed';
    button.textContent = t('mixed');
    button.disabled = true;
  }
  return button;
}

async function lockShift(shiftId) {
  try {
    await updateDoc(doc(db, 'guides', currentGuideId, 'shifts', shiftId), {
      estado: 'NO_DISPONIBLE',
      updatedAt: serverTimestamp()
    });
    showToast(t('toastBlocked'), 'success');
  } catch (error) {
    console.error('Error locking shift:', error);
    showToast(t('toastError'), 'error');
  }
}

async function unlockShift(shiftId) {
  try {
    await updateDoc(doc(db, 'guides', currentGuideId, 'shifts', shiftId), {
      estado: 'LIBRE',
      updatedAt: serverTimestamp()
    });
    showToast(t('toastUnblocked'), 'success');
  } catch (error) {
    console.error('Error unlocking shift:', error);
    showToast(t('toastError'), 'error');
  }
}

async function lockAfternoon(fecha) {
  try {
    const shiftsQuery = query(
      collection(db, 'guides', currentGuideId, 'shifts'),
      where('fecha', '==', fecha),
      where('slot', 'in', ['T1', 'T2', 'T3'])
    );
    const snapshot = await getDocs(shiftsQuery);
    const updates = snapshot.docs.map(docSnap =>
      updateDoc(docSnap.ref, { estado: 'NO_DISPONIBLE', updatedAt: serverTimestamp() })
    );
    await Promise.all(updates);
    showToast(t('toastAfternoonBlocked'), 'success');
  } catch (error) {
    console.error('Error locking afternoon:', error);
    showToast(t('toastError'), 'error');
  }
}

async function unlockAfternoon(fecha) {
  try {
    const shiftsQuery = query(
      collection(db, 'guides', currentGuideId, 'shifts'),
      where('fecha', '==', fecha),
      where('slot', 'in', ['T1', 'T2', 'T3'])
    );
    const snapshot = await getDocs(shiftsQuery);
    const updates = snapshot.docs.map(docSnap =>
      updateDoc(docSnap.ref, { estado: 'LIBRE', updatedAt: serverTimestamp() })
    );
    await Promise.all(updates);
    showToast(t('toastAfternoonUnblocked'), 'success');
  } catch (error) {
    console.error('Error unlocking afternoon:', error);
    showToast(t('toastError'), 'error');
  }
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toast-message');
  toastMessage.textContent = message;
  toast.className = `fixed bottom-4 right-4 px-4 py-2 sm:px-6 sm:py-3 rounded-lg shadow-lg ${
    type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500'
  } text-white text-sm sm:text-base`;
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

window.addEventListener('beforeunload', () => {
  if (shiftsUnsubscribe) shiftsUnsubscribe();
});