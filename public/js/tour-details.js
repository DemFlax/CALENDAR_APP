import { getTourGuestDetails } from './calendar-api.js';

let eventData = null;
let guests = [];
let incompleteGuestsCount = 0;

async function init() {
  const params = new URLSearchParams(window.location.search);
  const eventId = params.get('eventId');
  const title = params.get('title');
  const date = params.get('date');
  const time = params.get('time');
  
  if (!eventId) {
    showError('URL inválida', 'Falta el ID del evento', false);
    return;
  }
  
  if (title) document.getElementById('tourTitle').textContent = decodeURIComponent(title);
  if (date) document.getElementById('tourDate').textContent = formatDate(date);
  if (time) document.getElementById('tourTime').textContent = time;
  
  document.getElementById('backButton').addEventListener('click', goBack);
  document.getElementById('retryButton').addEventListener('click', () => loadTourDetails(eventId));
  
  await loadTourDetails(eventId);
}

async function loadTourDetails(eventId) {
  showLoading();
  
  try {
    eventData = await getTourGuestDetails(eventId);
    
    document.getElementById('tourTitle').textContent = eventData.summary;
    
    const startDate = new Date(eventData.start.dateTime);
    document.getElementById('tourDate').textContent = formatDate(startDate.toISOString().split('T')[0]);
    document.getElementById('tourTime').textContent = startDate.toLocaleTimeString('es-ES', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    guests = parseDescription(eventData.description);
    
    if (guests.length === 0) {
      showEmptyState();
    } else {
      renderGuests();
      hideLoading();
    }
    
  } catch (error) {
    console.error('Error loading tour details:', error);
    handleError(error);
  }
}

function parseDescription(description) {
  if (!description || description.trim().length === 0) {
    return [];
  }
  
  const bloques = description.split(/[-]{4,}/);
  const guests = [];
  
  for (const bloque of bloques) {
    const lineas = bloque.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);
    
    if (lineas.length < 3) continue;
    
    const guest = {
      nombre: null,
      pax: null,
      telefono: null,
      notas: null,
      valido: false,
      errores: 0
    };
    
    for (const linea of lineas) {
      const matchPax = linea.match(/(\d+)\s+adults?/i);
      if (matchPax) {
        guest.pax = parseInt(matchPax[1], 10);
        break;
      }
    }
    
    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i];
      if (linea.match(/\w+,\s+\d{1,2}\s+\w+\s+\d{4}\s+\d{2}:\d{2}/)) {
        if (i + 1 < lineas.length) {
          guest.nombre = lineas[i + 1];
        }
        break;
      }
    }
    
    for (const linea of lineas) {
      const matchTel = linea.match(/([A-Z]{2}\+[\d\s\(\)\-]+\d)/);
      if (matchTel) {
        guest.telefono = matchTel[1].trim();
        break;
      }
    }
    
    for (const linea of lineas) {
      if (linea.includes('Special Requirements/Notes:')) {
        guest.notas = linea.replace('Special Requirements/Notes:', '').trim();
        if (guest.notas.toLowerCase() === 'na' || guest.notas === '') {
          guest.notas = null;
        }
        break;
      }
    }
    
    const camposRequeridos = [guest.nombre, guest.pax, guest.telefono];
    guest.errores = camposRequeridos.filter(campo => campo === null).length;
    
    guest.valido = guest.nombre && (guest.pax !== null || guest.telefono !== null);
    
    if (guest.valido || guest.errores <= 1) {
      guests.push(guest);
    }
  }
  
  return guests;
}

function renderGuests() {
  const container = document.getElementById('guestsContainer');
  container.innerHTML = '';
  
  let validGuests = 0;
  incompleteGuestsCount = 0;
  
  guests.forEach(guest => {
    if (guest.errores > 1) {
      incompleteGuestsCount++;
      return;
    }
    
    validGuests++;
    
    const card = document.createElement('div');
    card.className = 'bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl shadow-lg p-4 sm:p-5 border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-shadow';
    
    card.innerHTML = `
      <h3 class="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-2 sm:mb-3">${guest.nombre || 'N/A'}</h3>
      
      <div class="space-y-1.5 sm:space-y-2 text-gray-600 dark:text-gray-300 text-sm sm:text-base">
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 dark:text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
          </svg>
          <span>${guest.pax !== null ? guest.pax + ' personas' : 'N/A'}</span>
        </div>
        
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 dark:text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
              d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
          </svg>
          <span class="break-all">${guest.telefono || 'N/A'}</span>
          ${guest.telefono ? `
            <button onclick="copyPhoneNumber('${guest.telefono}')" class="p-1 sm:p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-all duration-300 flex-shrink-0" title="Copiar teléfono">
              <svg class="w-4 h-4 text-gray-500 dark:text-gray-400 transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
              </svg>
            </button>
          ` : ''}
        </div>
        
        ${guest.notas ? `
          <div class="flex items-start gap-2 mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-gray-200 dark:border-gray-700">
            <svg class="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 dark:text-gray-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            <div>
              <span class="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Notas:</span>
              <p class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">${guest.notas}</p>
            </div>
          </div>
        ` : ''}
      </div>
    `;
    
    container.appendChild(card);
  });
  
  document.getElementById('guestCount').textContent = validGuests;
  
  if (incompleteGuestsCount > 0) {
    document.getElementById('incompleteCount').textContent = incompleteGuestsCount;
    document.getElementById('incompleteGuestsWarning').classList.remove('hidden');
    document.getElementById('viewInCalendarFromWarning').addEventListener('click', openInCalendar);
  }
}

function handleError(error) {
  hideLoading();
  
  const errorTitle = document.getElementById('errorTitle');
  const errorMessage = document.getElementById('errorMessage');
  const retryBtn = document.getElementById('retryButton');
  const calendarBtn = document.getElementById('viewInCalendarButton');
  
  switch(error.code) {
    case 'UNAUTHORIZED':
      errorTitle.textContent = 'Sesión expirada';
      errorMessage.textContent = 'Tu sesión ha expirado. Redirigiendo al login...';
      retryBtn.classList.add('hidden');
      calendarBtn.classList.add('hidden');
      setTimeout(() => window.location.href = '/index.html', 3000);
      break;
      
    case 'NOT_FOUND':
      errorTitle.textContent = 'Tour no encontrado';
      errorMessage.textContent = 'El evento no existe o fue eliminado.';
      retryBtn.classList.add('hidden');
      calendarBtn.classList.add('hidden');
      break;
      
    case 'TIMEOUT':
      errorTitle.textContent = 'Conexión lenta';
      errorMessage.textContent = 'La conexión está tardando más de lo normal.';
      retryBtn.classList.remove('hidden');
      calendarBtn.classList.remove('hidden');
      break;
      
    default:
      errorTitle.textContent = 'Error al cargar detalles';
      errorMessage.textContent = 'No pudimos conectar con el servidor. Intenta de nuevo.';
      retryBtn.classList.remove('hidden');
      calendarBtn.classList.remove('hidden');
  }
  
  calendarBtn.addEventListener('click', openInCalendar);
  
  showError();
}

function openInCalendar() {
  if (eventData && eventData.htmlLink) {
    window.open(eventData.htmlLink, '_blank');
  } else {
    const params = new URLSearchParams(window.location.search);
    const eventId = params.get('eventId');
    window.open(`https://calendar.google.com/calendar/event?eid=${eventId}`, '_blank');
  }
}

function showLoading() {
  document.getElementById('loadingState').classList.remove('hidden');
  document.getElementById('errorState').classList.add('hidden');
  document.getElementById('guestsList').classList.add('hidden');
}

function hideLoading() {
  document.getElementById('loadingState').classList.add('hidden');
  document.getElementById('guestsList').classList.remove('hidden');
}

function showError(title, message, showRetry = true) {
  document.getElementById('loadingState').classList.add('hidden');
  document.getElementById('guestsList').classList.add('hidden');
  document.getElementById('errorState').classList.remove('hidden');
  
  if (title) document.getElementById('errorTitle').textContent = title;
  if (message) document.getElementById('errorMessage').textContent = message;
  
  document.getElementById('retryButton').classList.toggle('hidden', !showRetry);
}

function showEmptyState() {
  hideLoading();
  
  const container = document.getElementById('guestsContainer');
  container.innerHTML = `
    <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-8 text-center">
      <svg class="w-16 h-16 text-blue-400 dark:text-blue-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
      </svg>
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">Sin información de guests</h3>
      <p class="text-gray-600 dark:text-gray-300 mb-4">No hay detalles de reservas disponibles para este tour.</p>
      <button class="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-6 py-2 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 font-semibold shadow-sm transition-colors" onclick="window.openInCalendar()">
        Ver evento completo en Calendar
      </button>
    </div>
  `;
  
  document.getElementById('guestCount').textContent = '0';
  window.openInCalendar = openInCalendar;
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('es-ES', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric' 
  });
}

function goBack() {
  window.location.href = '/guide.html';
}

function copyPhoneNumber(phone) {
  const cleanPhone = phone.replace(/[^\d+]/g, '');
  const button = event.target.closest('button');
  const icon = button.querySelector('svg');
  
  // Guardar icono original
  const originalIcon = icon.innerHTML;
  
  // Cambiar a icono check
  icon.innerHTML = `
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
      d="M5 13l4 4L19 7"/>
  `;
  icon.classList.add('text-green-600', 'dark:text-green-400');
  button.classList.add('scale-110', 'bg-green-100', 'dark:bg-green-900/30');
  
  navigator.clipboard.writeText(cleanPhone).then(() => {
    showCopyFeedback();
    
    // Restaurar después de 1.5s
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
}

function showCopyFeedback() {
  const toast = document.createElement('div');
  toast.className = 'fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
  toast.textContent = '📋 Teléfono copiado';
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 2000);
}

window.copyPhoneNumber = copyPhoneNumber;

document.addEventListener('DOMContentLoaded', init);