// =========================================
// MANAGER ASSIGNMENTS - SECURITY FIX C1
// =========================================
// Version: 2.0 (Apps Script calls via Cloud Functions)
// Date: 2025-11-05
// =========================================

import { auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js';

const functions = getFunctions();

// Auto dark mode detection
if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
  document.documentElement.classList.add('dark');
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  if (e.matches) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
});

let currentUser = null;
let cachedAssignments = [];
let openAssignmentId = null;

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    initFilters();
    loadAssignments();
  } else {
    window.location.href = '/login.html';
  }
});

function initFilters() {
  const monthSelect = document.getElementById('month-select');
  const yearSelect = document.getElementById('year-select');
  const guideFilter = document.getElementById('guide-filter');
 
  const currentYear = new Date().getFullYear();
  for (let y = currentYear - 1; y <= currentYear + 1; y++) {
    yearSelect.innerHTML += `<option value="${y}">${y}</option>`;
  }
 
  const today = new Date();
  monthSelect.value = String(today.getMonth() + 1).padStart(2, '0');
  yearSelect.value = currentYear;
 
  monthSelect.addEventListener('change', () => {
    openAssignmentId = null;
    loadAssignments();
  });
 
  yearSelect.addEventListener('change', () => {
    openAssignmentId = null;
    loadAssignments();
  });
 
  guideFilter.addEventListener('change', () => {
    openAssignmentId = null;
    renderFilteredAssignments();
  });
}

async function loadAssignments() {
  showLoading();
 
  const month = document.getElementById('month-select').value;
  const year = document.getElementById('year-select').value;
 
  if (!month || !year) return;
 
  const startDate = `${year}-${month}-01`;
  const endDate = `${year}-${month}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
 
  try {
    const proxyGetAssignedTours = httpsCallable(functions, 'proxyGetAssignedTours');
    const result = await proxyGetAssignedTours({ startDate, endDate });
    
    const data = result.data;
    if (data.error) throw new Error(data.message || 'Error desconocido');
   
    cachedAssignments = data.assignments || [];
    updateGuideFilter(cachedAssignments);
    renderFilteredAssignments();
   
  } catch (error) {
    console.error('Error loading assignments:', error);
    hideLoading();
    showToast('Error cargando asignaciones', 'error');
    document.getElementById('empty-state').classList.remove('hidden');
    document.getElementById('assignments-count').textContent = '0';
  }
}

function updateGuideFilter(assignments) {
  const guideFilter = document.getElementById('guide-filter');
  const currentValue = guideFilter.value;
 
  const guidesMap = new Map();
  assignments.forEach(a => {
    if (!guidesMap.has(a.guideEmail)) {
      guidesMap.set(a.guideEmail, a.guideName);
    }
  });
 
  guideFilter.innerHTML = '<option value="">Todos los guías</option>';
 
  Array.from(guidesMap.entries())
    .sort((a, b) => a[1].localeCompare(b[1]))
    .forEach(([email, name]) => {
      guideFilter.innerHTML += `<option value="${email}">${name}</option>`;
    });
 
  if (currentValue) guideFilter.value = currentValue;
}

function renderFilteredAssignments() {
  hideLoading();
 
  const selectedGuideEmail = document.getElementById('guide-filter').value;
  let filtered = cachedAssignments;
 
  if (selectedGuideEmail) {
    filtered = cachedAssignments.filter(a => a.guideEmail === selectedGuideEmail);
  }
 
  renderAssignments(filtered);
}

function renderAssignments(assignments) {
  const container = document.getElementById('assignments-container');
  const countSpan = document.getElementById('assignments-count');
 
  if (assignments.length === 0) {
    document.getElementById('empty-state').classList.remove('hidden');
    container.innerHTML = '';
    countSpan.textContent = '0';
    return;
  }
 
  document.getElementById('empty-state').classList.add('hidden');
  container.innerHTML = '';
  countSpan.textContent = assignments.length;
 
  assignments.sort((a, b) => {
    const dateCompare = a.fecha.localeCompare(b.fecha);
    if (dateCompare !== 0) return dateCompare;
    return (a.startTime || '').localeCompare(b.startTime || '');
  });
 
  assignments.forEach(assignment => {
    container.appendChild(createAssignmentCard(assignment));
  });
}

function createAssignmentCard(assignment) {
  const dateObj = new Date(assignment.fecha + 'T12:00:00');
  const dayName = dateObj.toLocaleDateString('es-ES', { weekday: 'short' });
  const day = dateObj.getDate();
  const monthName = dateObj.toLocaleDateString('es-ES', { month: 'short' });
  const year = dateObj.getFullYear();
 
  const assignmentId = `${assignment.guideEmail}_${assignment.fecha}_${assignment.slot}`;
  const isOpen = openAssignmentId === assignmentId;
 
  const card = document.createElement('div');
  card.className = 'bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700';
 
  const header = document.createElement('div');
  header.className = 'p-4 cursor-pointer hover:bg-sky-50 dark:hover:bg-sky-900/20 transition';
 
  header.innerHTML = `
    <div class="flex items-center justify-between gap-3">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap mb-2">
          <span class="text-sm font-semibold text-gray-600 dark:text-gray-400">
            ${dayName.charAt(0).toUpperCase() + dayName.slice(1)}, ${day} ${monthName} ${year}
          </span>
          <span class="text-sm font-medium text-sky-600 dark:text-sky-400">
            ${assignment.startTime || 'N/A'}
          </span>
        </div>
        <h3 class="font-bold text-base sm:text-lg text-gray-900 dark:text-white mb-2 truncate">
          ${assignment.tourName}
        </h3>
        <div class="flex items-center gap-3 flex-wrap text-sm text-gray-600 dark:text-gray-400">
          <span class="flex items-center gap-1">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
            </svg>
            ${assignment.guideName}
          </span>
          <span class="flex items-center gap-1">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
            </svg>
            ${assignment.totalPax} pax
          </span>
        </div>
      </div>
      <div class="flex-shrink-0">
        <svg class="w-6 h-6 text-gray-400 dark:text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
        </svg>
      </div>
    </div>
  `;
 
  header.addEventListener('click', () => toggleAssignment(assignmentId));
  card.appendChild(header);
 
  const body = document.createElement('div');
  body.className = `overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-[2000px]' : 'max-h-0'}`;
 
  if (!assignment.guests || assignment.guests.length === 0) {
    body.innerHTML = `
      <div class="p-4 border-t border-gray-200 dark:border-gray-700">
        <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-center">
          <p class="text-sm text-gray-600 dark:text-gray-300">No hay información de invitados</p>
          <button onclick="window.open('${assignment.htmlLink}', '_blank')" class="mt-2 text-xs text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-200">
            Ver en Google Calendar
          </button>
        </div>
      </div>
    `;
  } else {
    const guestsHtml = assignment.guests.map(guest => `
      <div class="bg-gray-50 dark:bg-gray-750 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
        <h4 class="font-bold text-base text-gray-900 dark:text-white mb-3">${guest.nombre || 'Sin nombre'}</h4>
        <div class="space-y-2 text-sm text-gray-700 dark:text-gray-300">
          <div class="flex items-center gap-2">
            <svg class="w-5 h-5 flex-shrink-0 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
            </svg>
            <span class="font-medium">${guest.pax !== null ? guest.pax + ' personas' : 'N/A'}</span>
          </div>
          <div class="flex items-center gap-2">
            <svg class="w-5 h-5 flex-shrink-0 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
            </svg>
            <span class="break-all font-medium">${guest.telefono || 'N/A'}</span>
            ${guest.telefono ? `
              <button onclick="window.copyPhoneNumber('${guest.telefono}', event)" class="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-all duration-300 flex-shrink-0" title="Copiar teléfono">
                <svg class="w-5 h-5 text-gray-600 dark:text-gray-400 transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                </svg>
              </button>
            ` : ''}
          </div>
          ${guest.notas ? `
            <div class="flex items-start gap-2 mt-3 pt-3 border-t border-gray-300 dark:border-gray-600">
              <svg class="w-5 h-5 flex-shrink-0 mt-0.5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
              <div>
                <span class="font-semibold text-gray-900 dark:text-white">Notas:</span>
                <p class="mt-1 text-gray-700 dark:text-gray-300">${guest.notas}</p>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `).join('');
   
    body.innerHTML = `
      <div class="p-4 border-t border-gray-200 dark:border-gray-700">
        <h4 class="text-base font-bold text-gray-900 dark:text-white mb-4">
          Invitados (${assignment.guests.length})
        </h4>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          ${guestsHtml}
        </div>
      </div>
    `;
  }
 
  card.appendChild(body);
  return card;
}

function toggleAssignment(assignmentId) {
  if (openAssignmentId === assignmentId) {
    openAssignmentId = null;
  } else {
    openAssignmentId = assignmentId;
  }
  renderFilteredAssignments();
}

window.copyPhoneNumber = (phone, event) => {
  const cleanPhone = phone.replace(/[^\d+]/g, '');
  const button = event.target.closest('button');
  const icon = button.querySelector('svg');
  const originalIcon = icon.innerHTML;
 
  icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>`;
  icon.classList.add('text-green-600', 'dark:text-green-400');
  button.classList.add('scale-110', 'bg-green-100', 'dark:bg-green-900/30');
 
  navigator.clipboard.writeText(cleanPhone).then(() => {
    showToast('Teléfono copiado', 'success');
    setTimeout(() => {
      icon.innerHTML = originalIcon;
      icon.classList.remove('text-green-600', 'dark:text-green-400');
      button.classList.remove('scale-110', 'bg-green-100', 'dark:bg-green-900/30');
    }, 1500);
  }).catch(err => {
    console.error('Error copying:', err);
    icon.innerHTML = originalIcon;
    icon.classList.remove('text-green-600', 'dark:text-green-400');
    button.classList.remove('scale-110', 'bg-green-100', 'dark:bg-green-900/30');
    alert('Copiado: ' + cleanPhone);
  });
};

function showLoading() {
  document.getElementById('loading-state').classList.remove('hidden');
  document.getElementById('empty-state').classList.add('hidden');
  document.getElementById('assignments-container').innerHTML = '';
}

function hideLoading() {
  document.getElementById('loading-state').classList.add('hidden');
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