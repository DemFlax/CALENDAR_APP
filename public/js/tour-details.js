import { auth, db, appsScriptConfig } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { collection, addDoc, serverTimestamp, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// ============================================
// I18N TRANSLATIONS
// ============================================

const i18n = {
  es: {
    backBtn: 'Volver',
    logoutBtn: 'Salir',
    tourLabel: 'Tour',
    loadingDetails: 'Cargando detalles...',
    errorTitle: 'Error',
    retryBtn: 'Reintentar',
    guestListTitle: 'Lista de Invitados',
    persons: 'personas',
    person: 'persona',
    notes: 'Notas',
    copyPhone: 'Copiar teléfono',
    phoneCopied: 'Teléfono copiado',
    viewEvent: 'Ver evento',
    vendorCostsTitle: 'Registro de Costes',
    vendorCostsSubtitle: 'Click para registrar tickets',
    numPaxLabel: 'Número de PAX',
    numPaxPlaceholder: 'Ej:',
    vendorsLabel: 'Vendors',
    feedbackLabel: 'Post-Tour Feedback (opcional)',
    feedbackPlaceholder: 'Comentarios sobre el tour, incidencias...',
    saveCostsBtn: 'Guardar Costes',
    processingBtn: 'Procesando...',
    compressingBtn: 'Comprimiendo',
    uploadingBtn: 'Subiendo a Drive...',
    savingBtn: 'Guardando...',
    amountLabel: 'Importe (€)',
    amountPlaceholder: '0.00',
    photoLabel: 'Foto Ticket',
    complete: '✓ Completo',
    incomplete: '⚠ Incompleto',
    costsSaved: '✅ Costes guardados correctamente',
    errorSavingCosts: 'Error al guardar costes',
    errorLogout: 'Error al cerrar sesión',
    slotUnknown: '⚠️ Horario no estándar detectado. Verifica con el manager.',
    emptyStateTitle: 'Sin información de guests',
    emptyStateMessage: 'No hay detalles de reservas para este tour.',
    errorSessionExpired: 'Sesión expirada',
    errorSessionExpiredMsg: 'Tu sesión ha expirado. Redirigiendo...',
    errorNotFound: 'Tour no encontrado',
    errorNotFoundMsg: 'El evento no existe o fue eliminado.',
    errorTimeout: 'Conexión lenta',
    errorTimeoutMsg: 'La conexión está tardando más de lo normal.',
    errorLoadingDetails: 'Error al cargar detalles',
    errorLoadingDetailsMsg: 'No pudimos conectar. Intenta de nuevo.',
    errorNoAssignments: 'Sin asignaciones',
    errorNoAssignmentsMsg: 'No tienes tours asignados en los últimos/próximos 30 días',
    errorConnection: 'Error de conexión',
    errorConnectionMsg: 'No se pudo cargar la lista de tours',
    errorPaxRequired: 'El número de PAX es obligatorio (1-99)',
    errorPhotoRequired: 'falta foto del ticket',
    errorMinVendors: 'Debes registrar al menos un vendor con importe y foto',
    errorDuplicateFile: 'Ya existe un ticket con ese nombre. Renombra el archivo.',
    errorTimeRestriction: 'Solo puedes registrar costes 2.5 horas después del tour. Quedan',
    hoursLabel: 'h.',
    errorCompressing: 'Error comprimiendo imagen',
    errorLoadingImage: 'Error cargando imagen',
    errorReadingFile: 'Error leyendo archivo',
    copiedAlert: 'Copiado:'
  },
  en: {
    backBtn: 'Back',
    logoutBtn: 'Logout',
    tourLabel: 'Tour',
    loadingDetails: 'Loading details...',
    errorTitle: 'Error',
    retryBtn: 'Retry',
    guestListTitle: 'Guest List',
    persons: 'persons',
    person: 'person',
    notes: 'Notes',
    copyPhone: 'Copy phone',
    phoneCopied: 'Phone copied',
    viewEvent: 'View event',
    vendorCostsTitle: 'Cost Registration',
    vendorCostsSubtitle: 'Click to register tickets',
    numPaxLabel: 'Number of PAX',
    numPaxPlaceholder: 'Ex:',
    vendorsLabel: 'Vendors',
    feedbackLabel: 'Post-Tour Feedback (optional)',
    feedbackPlaceholder: 'Comments about the tour, incidents...',
    saveCostsBtn: 'Save Costs',
    processingBtn: 'Processing...',
    compressingBtn: 'Compressing',
    uploadingBtn: 'Uploading to Drive...',
    savingBtn: 'Saving...',
    amountLabel: 'Amount (€)',
    amountPlaceholder: '0.00',
    photoLabel: 'Ticket Photo',
    complete: '✓ Complete',
    incomplete: '⚠ Incomplete',
    costsSaved: '✅ Costs saved successfully',
    errorSavingCosts: 'Error saving costs',
    errorLogout: 'Error logging out',
    slotUnknown: '⚠️ Non-standard schedule detected. Verify with manager.',
    emptyStateTitle: 'No guest information',
    emptyStateMessage: 'No booking details available for this tour.',
    errorSessionExpired: 'Session expired',
    errorSessionExpiredMsg: 'Your session has expired. Redirecting...',
    errorNotFound: 'Tour not found',
    errorNotFoundMsg: 'The event does not exist or was deleted.',
    errorTimeout: 'Slow connection',
    errorTimeoutMsg: 'Connection is taking longer than normal.',
    errorLoadingDetails: 'Error loading details',
    errorLoadingDetailsMsg: 'Could not connect. Try again.',
    errorNoAssignments: 'No assignments',
    errorNoAssignmentsMsg: 'You have no tours assigned in the last/next 30 days',
    errorConnection: 'Connection error',
    errorConnectionMsg: 'Could not load tour list',
    errorPaxRequired: 'Number of PAX is required (1-99)',
    errorPhotoRequired: 'ticket photo missing',
    errorMinVendors: 'You must register at least one vendor with amount and photo',
    errorDuplicateFile: 'A ticket with that name already exists. Rename the file.',
    errorTimeRestriction: 'You can only register costs 2.5 hours after the tour.',
    hoursLabel: 'h left.',
    errorCompressing: 'Error compressing image',
    errorLoadingImage: 'Error loading image',
    errorReadingFile: 'Error reading file',
    copiedAlert: 'Copied:'
  }
};

let lang = localStorage.getItem('lang') || 'es';
function t(key) { return i18n[lang][key] || key; }

// Auto dark mode
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

let eventData = null;
let currentUser = null;
let userRole = null;
let guideId = null;
let vendorsList = [];
let allTours = [];
let currentTourIndex = 0;

// VENDOR COSTS STATE
let vendorCards = {};
let uploadedFileNames = new Set();
let currentOpenCard = null;

async function init() {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = '/login.html';
      return;
    }
    currentUser = user;
    
    const token = await user.getIdTokenResult();
    userRole = token.claims.role;
    guideId = token.claims.guideId;
    
    updateUILanguage();
    
    await loadAllTours();
    
    document.getElementById('prevTourBtn').addEventListener('click', () => navigateTour(-1));
    document.getElementById('nextTourBtn').addEventListener('click', () => navigateTour(1));
    document.getElementById('backButton').addEventListener('click', goBack);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
  });
}

function updateUILanguage() {
  const backSpan = document.querySelector('#backButton span');
  const logoutSpan = document.querySelector('#logoutBtn span');
  
  if (backSpan) backSpan.textContent = t('backBtn');
  if (logoutSpan) logoutSpan.textContent = t('logoutBtn');
}

async function handleLogout() {
  try {
    await auth.signOut();
    window.location.href = '/login.html';
  } catch (error) {
    console.error('Error al cerrar sesión:', error);
    showVendorToast(t('errorLogout'), 'error');
  }
}

async function loadAllTours() {
  showLoading();
  
  try {
    const guideEmail = currentUser.email;
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 30);
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 30);
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    const url = `${appsScriptConfig.url}?endpoint=getAssignedTours&startDate=${startDateStr}&endDate=${endDateStr}&guideEmail=${encodeURIComponent(guideEmail)}&apiKey=${appsScriptConfig.apiKey}`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    if (data.error) throw new Error(data.message || 'Error cargando tours');
    
    allTours = data.assignments || [];
    allTours.sort((a, b) => {
      const dateCompare = a.fecha.localeCompare(b.fecha);
      if (dateCompare !== 0) return dateCompare;
      return (a.startTime || '').localeCompare(b.startTime || '');
    });
    
    if (allTours.length === 0) {
      showError(t('errorNoAssignments'), t('errorNoAssignmentsMsg'), false);
      return;
    }
    
    const params = new URLSearchParams(window.location.search);
    const urlEventId = params.get('eventId');
    
    if (urlEventId) {
      const index = allTours.findIndex(t => t.eventId === urlEventId);
      currentTourIndex = index >= 0 ? index : 0;
    } else {
      currentTourIndex = 0;
    }
    
    await loadCurrentTour();
    
  } catch (error) {
    console.error('Error loading tours:', error);
    showError(t('errorConnection'), t('errorConnectionMsg'), true);
  }
}

function navigateTour(direction) {
  const newIndex = currentTourIndex + direction;
  if (newIndex < 0 || newIndex >= allTours.length) return;
  currentTourIndex = newIndex;
  loadCurrentTour();
}

async function loadCurrentTour() {
  if (allTours.length === 0) return;
  
  const tour = allTours[currentTourIndex];
  
  document.getElementById('currentTourIndex').textContent = currentTourIndex + 1;
  document.getElementById('totalTours').textContent = allTours.length;
  document.getElementById('prevTourBtn').disabled = currentTourIndex === 0;
  document.getElementById('nextTourBtn').disabled = currentTourIndex === allTours.length - 1;
  document.getElementById('tourTitle').textContent = tour.tourName;
  document.getElementById('tourDate').textContent = formatDate(tour.fecha);
  document.getElementById('tourTime').textContent = tour.startTime;
  
  showLoading();
  
  try {
    console.log('Loading tour details for eventId:', tour.eventId);
    eventData = await getTourGuestDetails(tour.eventId);
    console.log('Event data received:', eventData);
    
    if (!eventData) throw new Error('No data received from API');
    
    const guests = eventData.guests || [];
    
    if (guests.length === 0) {
      showEmptyState();
    } else {
      renderGuests(guests);
      hideLoading();
      
      if (userRole === 'guide') {
        await renderVendorCostsForm(tour.fecha, tour.slot, guests);
      }
    }
    
  } catch (error) {
    console.error('Error loading tour details:', error);
    handleError(error);
  }
}

async function getTourGuestDetails(eventId) {
  const url = `${appsScriptConfig.url}?endpoint=getEventDetails&eventId=${eventId}&apiKey=${appsScriptConfig.apiKey}`;
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    if (data.error) {
      const error = new Error(data.message || 'Error');
      error.code = data.code;
      throw error;
    }
    
    return data;
    
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      const timeoutError = new Error('Timeout');
      timeoutError.code = 'TIMEOUT';
      throw timeoutError;
    }
    throw error;
  }
}

function renderGuests(guests) {
  const container = document.getElementById('guestsContainer');
  container.innerHTML = '';
  
  guests.forEach(guest => {
    const card = document.createElement('div');
    card.className = 'bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl shadow-lg p-4 sm:p-5 border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-shadow';
    
    const personsText = guest.pax === 1 ? t('person') : t('persons');
    
    card.innerHTML = `
      <h3 class="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-2 sm:mb-3">${guest.nombre || 'N/A'}</h3>
      
      <div class="space-y-1.5 sm:space-y-2 text-gray-700 dark:text-gray-200 text-sm sm:text-base">
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
          </svg>
          <span class="font-medium">${guest.pax !== null ? guest.pax + ' ' + personsText : 'N/A'}</span>
        </div>
        
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
              d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
          </svg>
          ${guest.telefono && guest.telefono !== 'N/A' ? `
            <span class="break-all font-medium">${guest.telefono}</span>
            <button onclick="copyPhoneNumber('${guest.telefono}')" class="p-1 sm:p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-all duration-300 flex-shrink-0" title="${t('copyPhone')}">
              <svg class="w-4 h-4 text-gray-600 dark:text-gray-400 transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
              </svg>
            </button>
          ` : `
            <span class="text-gray-400 font-medium">N/A</span>
            <a href="${eventData.htmlLink || '#'}" target="_blank" rel="noopener" class="ml-2 inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-xs font-semibold hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
              </svg>
              ${t('viewEvent')}
            </a>
          `}
        </div>
        
        ${guest.notas ? `
          <div class="flex items-start gap-2 mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-gray-200 dark:border-gray-700">
            <svg class="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-gray-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            <div>
              <span class="text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-200">${t('notes')}:</span>
              <p class="text-xs sm:text-sm text-gray-600 dark:text-gray-300 mt-1">${guest.notas}</p>
            </div>
          </div>
        ` : ''}
      </div>
    `;
    
    container.appendChild(card);
  });
  
  const guestListTitle = document.querySelector('#guestsList h3');
  if (guestListTitle) {
    guestListTitle.innerHTML = `${t('guestListTitle')} (<span id="guestCount">${guests.length}</span>)`;
  } else {
    document.getElementById('guestCount').textContent = guests.length;
  }
}

// ============================================
// VENDOR COSTS - ACCORDION
// ============================================

async function renderVendorCostsForm(fecha, slot, guests) {
  const section = document.getElementById('vendorCostsSection');
  section.classList.remove('hidden');
  
  if (slot === 'DESCONOCIDO') {
    showVendorToast(t('slotUnknown'), 'warning');
  }
  
  await loadVendorsList();
  
  const totalPax = guests.reduce((sum, guest) => sum + (guest.pax || 0), 0);
  const paxInput = document.getElementById('numPaxInput');
  paxInput.value = totalPax;
  paxInput.placeholder = `${t('numPaxPlaceholder')} ${totalPax}`;
  
  // Update labels
  const paxLabel = document.querySelector('label[for="numPaxInput"]');
  if (paxLabel) {
    paxLabel.innerHTML = `${t('numPaxLabel')} <span class="text-red-600">*</span>`;
  }
  
  const vendorsLabel = document.querySelector('#vendorCostsBody label.block.text-sm.font-bold');
  if (vendorsLabel) vendorsLabel.textContent = t('vendorsLabel');
  
  const feedbackLabel = document.querySelector('label[for="postTourFeedback"]');
  if (feedbackLabel) feedbackLabel.textContent = t('feedbackLabel');
  
  const feedbackTextarea = document.getElementById('postTourFeedback');
  if (feedbackTextarea) feedbackTextarea.placeholder = t('feedbackPlaceholder');
  
  const submitBtn = document.querySelector('#vendorCostsForm button[type="submit"]');
  if (submitBtn) submitBtn.textContent = t('saveCostsBtn');
  
  const header = document.getElementById('vendorCostsHeader');
  const body = document.getElementById('vendorCostsBody');
  const chevron = document.getElementById('vendorCostsChevron');
  
  header.onclick = () => {
    const isHidden = body.classList.contains('hidden');
    body.classList.toggle('hidden');
    chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
    
    if (isHidden) {
      setTimeout(() => {
        section.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 200);
    }
  };
  
  renderVendorAccordion();
  
  const form = document.getElementById('vendorCostsForm');
  form.onsubmit = (e) => handleVendorCostsSubmit(e, fecha, slot);
}

async function loadVendorsList() {
  try {
    const vendorsQuery = query(
      collection(db, 'vendors'),
      where('estado', '==', 'activo')
    );
    const snapshot = await getDocs(vendorsQuery);
    
    vendorsList = [];
    snapshot.forEach(doc => {
      vendorsList.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    vendorsList.sort((a, b) => (a.orden || 0) - (b.orden || 0));
    
  } catch (error) {
    console.error('Error loading vendors:', error);
    vendorsList = [];
  }
}

function renderVendorAccordion() {
  const container = document.getElementById('vendorsAccordion');
  container.innerHTML = '';
  
  if (Object.keys(vendorCards).length === 0) {
    vendorsList.forEach(vendor => {
      vendorCards[vendor.id] = {
        amount: '',
        photo: null,
        photoPreview: '',
        photoName: ''
      };
    });
  }
  
  vendorsList.forEach(vendor => {
    const card = document.createElement('div');
    card.dataset.vendorId = vendor.id;
    card.className = 'border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden';
    
    const isOpen = currentOpenCard === vendor.id;
    const cardData = vendorCards[vendor.id];
    
    card.innerHTML = `
      <div 
        class="vendor-card-header flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition"
        onclick="toggleVendorCard('${vendor.id}')"
      >
        <div class="flex items-center gap-3">
          <span class="text-base font-bold text-gray-900 dark:text-white">${vendor.nombre}</span>
          ${cardData.amount && cardData.photo ? `
            <span class="text-xs bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 px-2 py-1 rounded font-semibold">
              ${t('complete')}
            </span>
          ` : cardData.amount || cardData.photo ? `
            <span class="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400 px-2 py-1 rounded font-semibold">
              ${t('incomplete')}
            </span>
          ` : ''}
        </div>
        <svg class="w-5 h-5 text-gray-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
        </svg>
      </div>
      
      <div class="vendor-card-body ${isOpen ? '' : 'hidden'} border-t border-gray-300 dark:border-gray-600 p-4 space-y-3 bg-gray-50 dark:bg-gray-800">
        <div>
          <label class="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">${t('amountLabel')}</label>
          <input 
            type="number" 
            step="0.01" 
            min="0" 
            max="999.99"
            value="${cardData.amount}"
            placeholder="${t('amountPlaceholder')}"
            class="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm font-medium"
            oninput="updateVendorAmount('${vendor.id}', this.value)"
          />
        </div>
        
        <div>
          <label class="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">${t('photoLabel')}</label>
          <input 
            type="file" 
            accept="image/*"
            class="w-full text-sm text-gray-800 dark:text-gray-200 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-emerald-600 file:text-white hover:file:bg-emerald-700"
            onchange="handleVendorPhotoChange('${vendor.id}', this)"
          />
          ${cardData.photoPreview ? `
            <div class="mt-2 relative inline-block">
              <img src="${cardData.photoPreview}" class="w-32 h-32 object-cover rounded border-2 border-emerald-500" />
              <button 
                type="button"
                onclick="removeVendorPhoto('${vendor.id}')"
                class="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-700 font-bold"
              >×</button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
    
    container.appendChild(card);
  });
}

window.toggleVendorCard = function(vendorId) {
  if (currentOpenCard === vendorId) {
    currentOpenCard = null;
    renderVendorAccordion();
    return;
  }
  
  if (currentOpenCard !== null) {
    const prevData = vendorCards[currentOpenCard];
    const hasAmount = prevData.amount && parseFloat(prevData.amount) > 0;
    const hasPhoto = prevData.photo !== null;
    
    if ((hasAmount && !hasPhoto) || (!hasAmount && hasPhoto)) {
      vendorCards[currentOpenCard] = {
        amount: '',
        photo: null,
        photoPreview: '',
        photoName: ''
      };
      if (prevData.photoName) {
        uploadedFileNames.delete(prevData.photoName);
      }
    }
  }
  
  currentOpenCard = vendorId;
  renderVendorAccordion();
  
  setTimeout(() => {
    const card = document.querySelector(`[data-vendor-id="${vendorId}"]`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 100);
};

window.updateVendorAmount = function(vendorId, value) {
  vendorCards[vendorId].amount = value;
};

window.handleVendorPhotoChange = function(vendorId, input) {
  if (input.files.length === 0) return;
  
  const file = input.files[0];
  const fileName = file.name;
  
  if (uploadedFileNames.has(fileName)) {
    showVendorToast(t('errorDuplicateFile'), 'error');
    input.value = '';
    return;
  }
  
  const prevName = vendorCards[vendorId].photoName;
  if (prevName) {
    uploadedFileNames.delete(prevName);
  }
  
  vendorCards[vendorId].photo = file;
  vendorCards[vendorId].photoName = fileName;
  uploadedFileNames.add(fileName);
  
  const reader = new FileReader();
  reader.onload = (e) => {
    vendorCards[vendorId].photoPreview = e.target.result;
    renderVendorAccordion();
  };
  reader.readAsDataURL(file);
};

window.removeVendorPhoto = function(vendorId) {
  const fileName = vendorCards[vendorId].photoName;
  if (fileName) {
    uploadedFileNames.delete(fileName);
  }
  
  vendorCards[vendorId].photo = null;
  vendorCards[vendorId].photoPreview = '';
  vendorCards[vendorId].photoName = '';
  
  renderVendorAccordion();
};

// ============================================
// SUBMIT VENDOR COSTS
// ============================================

async function handleVendorCostsSubmit(e, fecha, slot) {
  e.preventDefault();
  
  const shiftId = `${fecha}_${slot}`;
  
  // Validar 2.5 horas
  const tour = allTours[currentTourIndex];
  if (tour && tour.fecha && tour.startTime) {
    const [hours, minutes] = tour.startTime.split(':');
    const eventDateTime = new Date(`${tour.fecha}T${hours}:${minutes}:00`);
    const now = new Date();
    const minTime = new Date(eventDateTime.getTime() + (2.5 * 60 * 60 * 1000));
    
    if (now < minTime) {
      const hoursLeft = Math.ceil((minTime - now) / (1000 * 60 * 60));
      showVendorToast(`${t('errorTimeRestriction')} ${hoursLeft}${t('hoursLabel')}`, 'error');
      return;
    }
  }
  
  // Validar PAX
  const numPax = parseInt(document.getElementById('numPaxInput').value);
  if (!numPax || numPax < 1 || numPax > 99) {
    showVendorToast(t('errorPaxRequired'), 'error');
    return;
  }
  
  // Recolectar vendors válidos
  const validVendors = [];
  let hasError = false;
  let errorMsg = '';
  
  for (const vendorId in vendorCards) {
    const cardData = vendorCards[vendorId];
    const amount = parseFloat(cardData.amount);
    
    if (!amount || amount === 0) continue;
    
    if (!cardData.photo) {
      const vendor = vendorsList.find(v => v.id === vendorId);
      errorMsg = `${vendor.nombre}: ${t('errorPhotoRequired')}`;
      hasError = true;
      break;
    }
    
    validVendors.push({ vendorId, cardData });
  }
  
  if (hasError) {
    showVendorToast(errorMsg, 'error');
    return;
  }
  
  if (validVendors.length === 0) {
    showVendorToast(t('errorMinVendors'), 'error');
    return;
  }
  
  const submitBtn = e.target.querySelector('[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = t('processingBtn');
  
  try {
    // Comprimir imágenes
    const vendorsDataForUpload = [];
    
    for (let i = 0; i < validVendors.length; i++) {
      const { vendorId, cardData } = validVendors[i];
      const vendor = vendorsList.find(v => v.id === vendorId);
      
      submitBtn.textContent = `${t('compressingBtn')} ${i + 1}/${validVendors.length}...`;
      
      const compressedBase64 = await compressImage(cardData.photo);
      
      vendorsDataForUpload.push({
        vendorId: vendor.id,
        vendorName: vendor.nombre,
        importe: parseFloat(cardData.amount),
        ticketBase64: compressedBase64
      });
    }
    
    // Upload a Drive
    submitBtn.textContent = t('uploadingBtn');
    
    const guideName = currentUser.displayName || currentUser.email;
    const monthFolder = getMonthFolderName(fecha);
    
    const uploadPayload = {
      endpoint: 'uploadVendorTickets',
      apiKey: appsScriptConfig.apiKey,
      shiftId,
      guideId,
      guideName,
      fecha,
      slot,
      numPax,
      monthFolder,
      vendorsData: JSON.stringify(vendorsDataForUpload)
    };
    
    const uploadResponse = await fetch(appsScriptConfig.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(uploadPayload)
    });
    
    if (!uploadResponse.ok) throw new Error(`Error subiendo: HTTP ${uploadResponse.status}`);
    
    const uploadResult = await uploadResponse.json();
    if (uploadResult.error) throw new Error(uploadResult.message || 'Error en Apps Script');
    
    const driveUrls = uploadResult.vendors || [];
    
    // Preparar vendors para Firestore
    submitBtn.textContent = t('savingBtn');
    
    const finalVendors = driveUrls.map(uploaded => {
      const original = vendorsDataForUpload.find(v => v.vendorId === uploaded.vendorId);
      return {
        vendorId: original.vendorId,
        vendorName: original.vendorName,
        importe: original.importe,
        ticketUrl: uploaded.driveUrl,
        driveFileId: uploaded.driveFileId
      };
    });
    
    const totalVendors = finalVendors.reduce((sum, v) => sum + v.importe, 0);
    const feedback = document.getElementById('postTourFeedback').value.trim() || null;
    
    const vendorCostDoc = {
      shiftId,
      guideId,
      guideName: currentUser.displayName || currentUser.email,
      fecha,
      slot,
      tourDescription: tour.tourName,
      numPax,
      vendors: finalVendors,
      totalVendors: parseFloat(totalVendors.toFixed(2)),
      postTourFeedback: feedback,
      salarioCalculado: 0,
      editedByManager: false,
      editHistory: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    await addDoc(collection(db, 'vendor_costs'), vendorCostDoc);
    
    showVendorToast(t('costsSaved'), 'success');
    
    // Reset form
    vendorCards = {};
    uploadedFileNames.clear();
    currentOpenCard = null;
    document.getElementById('vendorCostsForm').reset();
    renderVendorAccordion();
    document.getElementById('vendorCostsBody').classList.add('hidden');
    document.getElementById('vendorCostsChevron').style.transform = 'rotate(0deg)';
    
  } catch (error) {
    console.error('Error saving vendor costs:', error);
    showVendorToast(`${t('errorSavingCosts')}: ${error.message}`, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = t('saveCostsBtn');
  }
}

// ============================================
// IMAGE COMPRESSION
// ============================================

async function compressImage(file, maxWidth = 1920, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error(t('errorCompressing')));
              return;
            }
            
            const blobReader = new FileReader();
            blobReader.onload = () => resolve(blobReader.result);
            blobReader.onerror = reject;
            blobReader.readAsDataURL(blob);
          },
          'image/jpeg',
          quality
        );
      };
      
      img.onerror = () => reject(new Error(t('errorLoadingImage')));
      img.src = e.target.result;
    };
    
    reader.onerror = () => reject(new Error(t('errorReadingFile')));
    reader.readAsDataURL(file);
  });
}

function getMonthFolderName(fecha) {
  const date = new Date(fecha + 'T12:00:00');
  const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  const month = months[date.getMonth()];
  const year = date.getFullYear().toString().slice(-2);
  return `Tickets-${month}_${year}`;
}

// ============================================
// UI HELPERS
// ============================================

function handleError(error) {
  hideLoading();
  
  const errorTitle = document.getElementById('errorTitle');
  const errorMessage = document.getElementById('errorMessage');
  const retryBtn = document.getElementById('retryButton');
  
  switch(error.code) {
    case 'UNAUTHORIZED':
      errorTitle.textContent = t('errorSessionExpired');
      errorMessage.textContent = t('errorSessionExpiredMsg');
      retryBtn.classList.add('hidden');
      setTimeout(() => window.location.href = '/login.html', 3000);
      break;
    case 'NOT_FOUND':
      errorTitle.textContent = t('errorNotFound');
      errorMessage.textContent = t('errorNotFoundMsg');
      retryBtn.classList.add('hidden');
      break;
    case 'TIMEOUT':
      errorTitle.textContent = t('errorTimeout');
      errorMessage.textContent = t('errorTimeoutMsg');
      retryBtn.classList.remove('hidden');
      break;
    default:
      errorTitle.textContent = t('errorLoadingDetails');
      errorMessage.textContent = t('errorLoadingDetailsMsg');
      retryBtn.classList.remove('hidden');
  }
  
  retryBtn.textContent = t('retryBtn');
  retryBtn.onclick = () => loadCurrentTour();
  showErrorState();
}

function showLoading() {
  document.getElementById('loadingState').classList.remove('hidden');
  document.getElementById('errorState').classList.add('hidden');
  document.getElementById('guestsList').classList.add('hidden');
  
  const loadingSpan = document.querySelector('#loadingState span');
  if (loadingSpan) loadingSpan.textContent = t('loadingDetails');
}

function hideLoading() {
  document.getElementById('loadingState').classList.add('hidden');
  document.getElementById('guestsList').classList.remove('hidden');
}

function showErrorState() {
  document.getElementById('loadingState').classList.add('hidden');
  document.getElementById('guestsList').classList.add('hidden');
  document.getElementById('errorState').classList.remove('hidden');
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
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">${t('emptyStateTitle')}</h3>
      <p class="text-gray-600 dark:text-gray-300 mb-4">${t('emptyStateMessage')}</p>
    </div>
  `;
  
  const guestListTitle = document.querySelector('#guestsList h3');
  if (guestListTitle) {
    guestListTitle.innerHTML = `${t('guestListTitle')} (<span id="guestCount">0</span>)`;
  } else {
    document.getElementById('guestCount').textContent = '0';
  }
}

function formatDate(dateStr) {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric' 
  });
}

function goBack() {
  window.history.back();
}

function showVendorToast(message, type = 'info') {
  const toast = document.createElement('div');
  
  let bgColor, icon;
  if (type === 'success') {
    bgColor = 'bg-emerald-600';
    icon = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>`;
  } else if (type === 'error') {
    bgColor = 'bg-red-600';
    icon = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>`;
  } else if (type === 'warning') {
    bgColor = 'bg-yellow-600';
    icon = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`;
  } else {
    bgColor = 'bg-blue-600';
    icon = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
  }
  
  toast.className = `fixed bottom-6 right-6 ${bgColor} text-white px-5 py-4 rounded-xl shadow-2xl z-50 max-w-md flex items-center gap-3`;
  toast.style.animation = 'slideIn 0.3s ease-out';
  toast.innerHTML = `<div class="flex-shrink-0">${icon}</div><p class="font-semibold text-sm">${message}</p>`;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes slideIn {
    from { opacity: 0; transform: translateX(100%); }
    to { opacity: 1; transform: translateX(0); }
  }
`;
document.head.appendChild(styleSheet);

window.copyPhoneNumber = (phone) => {
  const cleanPhone = phone.replace(/[^\d+]/g, '');
  const button = event.target.closest('button');
  const icon = button.querySelector('svg');
  const originalIcon = icon.innerHTML;
  
  icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>`;
  icon.classList.add('text-green-600');
  button.classList.add('scale-110', 'bg-green-100');
  
  navigator.clipboard.writeText(cleanPhone).then(() => {
    showVendorToast(t('phoneCopied'), 'success');
    setTimeout(() => {
      icon.innerHTML = originalIcon;
      icon.classList.remove('text-green-600');
      button.classList.remove('scale-110', 'bg-green-100');
    }, 1500);
  }).catch(() => {
    icon.innerHTML = originalIcon;
    alert(`${t('copiedAlert')} ${cleanPhone}`);
  });
};

document.addEventListener('DOMContentLoaded', init);