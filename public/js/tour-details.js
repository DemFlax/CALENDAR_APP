import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { collection, addDoc, serverTimestamp, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { getTourGuestDetails } from './calendar-api.js';

let eventData = null;
let guests = [];
let currentUser = null;
let userRole = null;
let guideId = null;
let vendorsList = [];
let shiftId = null;

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
    
    await loadTourData();
  });
}

async function loadTourData() {
  const params = new URLSearchParams(window.location.search);
  const eventId = params.get('eventId');
  const title = params.get('title');
  const date = params.get('date');
  const time = params.get('time');
  const slot = params.get('slot');
  
  console.log('EventID from URL:', eventId);
  console.log('Full URL:', window.location.href);
  
  if (!eventId) {
    showError('URL inválida', 'Falta el ID del evento', false);
    return;
  }
  
  if (date && slot) {
    shiftId = `${date}_${slot}`;
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
    console.log('Calling getTourGuestDetails with eventId:', eventId);
    eventData = await getTourGuestDetails(eventId);
    console.log('Received eventData:', eventData);
    
    if (!eventData) {
      throw new Error('No data received from API');
    }
    
    document.getElementById('tourTitle').textContent = eventData.summary;
    document.getElementById('tourTime').textContent = eventData.startTime;
    
    guests = eventData.guests || [];
    
    if (guests.length === 0) {
      showEmptyState();
    } else {
      renderGuests();
      hideLoading();
      
      // Render vendor costs form ONLY if user is guide
      if (userRole === 'guide') {
        await renderVendorCostsForm();
      }
    }
    
  } catch (error) {
    console.error('Error loading tour details:', error);
    handleError(error);
  }
}

function renderGuests() {
  const container = document.getElementById('guestsContainer');
  container.innerHTML = '';
  
  guests.forEach(guest => {
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
  
  document.getElementById('guestCount').textContent = guests.length;
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
      setTimeout(() => window.location.href = '/login.html', 3000);
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
  window.history.back();
}

function copyPhoneNumber(phone) {
  const cleanPhone = phone.replace(/[^\d+]/g, '');
  const button = event.target.closest('button');
  const icon = button.querySelector('svg');
  
  const originalIcon = icon.innerHTML;
  
  icon.innerHTML = `
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
      d="M5 13l4 4L19 7"/>
  `;
  icon.classList.add('text-green-600', 'dark:text-green-400');
  button.classList.add('scale-110', 'bg-green-100', 'dark:bg-green-900/30');
  
  navigator.clipboard.writeText(cleanPhone).then(() => {
    showCopyFeedback();
    
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

// ============================================
// VENDOR COSTS FUNCTIONALITY (NEW CODE)
// ============================================

async function renderVendorCostsForm() {
  const section = document.getElementById('vendorCostsSection');
  section.classList.remove('hidden');
  
  // Load vendors list
  await loadVendorsList();
  
  // Calculate total PAX
  const totalPax = guests.reduce((sum, guest) => sum + (guest.pax || 0), 0);
  document.getElementById('numPaxInput').value = totalPax;
  
  // Toggle expand/collapse
  const header = document.getElementById('vendorCostsHeader');
  const body = document.getElementById('vendorCostsBody');
  const chevron = document.getElementById('vendorCostsChevron');
  
  header.addEventListener('click', () => {
    const isHidden = body.classList.contains('hidden');
    body.classList.toggle('hidden');
    chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
  });
  
  // Add first vendor by default
  addVendorRow();
  
  // Add vendor button
  document.getElementById('addVendorBtn').addEventListener('click', () => {
    const container = document.getElementById('vendorsContainer');
    if (container.children.length < 5) {
      addVendorRow();
    } else {
      showVendorToast('Máximo 5 vendors por tour', 'warning');
    }
  });
  
  // Form submit
  document.getElementById('vendorCostsForm').addEventListener('submit', handleVendorCostsSubmit);
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
    
    // Sort by orden
    vendorsList.sort((a, b) => (a.orden || 0) - (b.orden || 0));
    
  } catch (error) {
    console.error('Error loading vendors:', error);
    vendorsList = [];
  }
}

function addVendorRow() {
  const container = document.getElementById('vendorsContainer');
  const index = container.children.length;
  
  const row = document.createElement('div');
  row.className = 'border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-3';
  row.dataset.vendorIndex = index;
  
  row.innerHTML = `
    <div class="flex items-center justify-between">
      <span class="text-sm font-semibold text-gray-700 dark:text-gray-300">Vendor ${index + 1}</span>
      ${index > 0 ? `
        <button type="button" onclick="removeVendorRow(${index})" class="text-red-500 hover:text-red-700 text-sm font-medium">
          Eliminar
        </button>
      ` : ''}
    </div>
    
    <div>
      <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Vendor</label>
      <select 
        required
        class="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm"
        data-vendor-select="${index}"
      >
        <option value="">Seleccionar...</option>
        ${vendorsList.map(v => `<option value="${v.id}">${v.nombre}</option>`).join('')}
      </select>
    </div>
    
    <div>
      <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Importe (€)</label>
      <input 
        type="number" 
        step="0.01" 
        min="0.01" 
        max="999.99" 
        required
        placeholder="0.00"
        class="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm"
        data-vendor-amount="${index}"
      />
    </div>
    
    <div>
      <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Foto Ticket</label>
      <input 
        type="file" 
        accept="image/*"
        class="w-full text-sm text-gray-600 dark:text-gray-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 dark:file:bg-emerald-900 dark:file:text-emerald-300"
        data-vendor-photo="${index}"
        onchange="handlePhotoChange(${index})"
      />
      <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Opcional. Si no aportas foto, justifica abajo.</p>
    </div>
    
    <div id="justificationArea${index}" class="hidden">
      <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Justificación (sin foto)</label>
      <textarea 
        rows="2"
        placeholder="Explica por qué no hay foto del ticket..."
        class="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm"
        data-vendor-justification="${index}"
      ></textarea>
    </div>
  `;
  
  container.appendChild(row);
}

function removeVendorRow(index) {
  const row = document.querySelector(`[data-vendor-index="${index}"]`);
  if (row) {
    row.remove();
    // Renumber remaining rows
    const container = document.getElementById('vendorsContainer');
    Array.from(container.children).forEach((child, newIndex) => {
      child.querySelector('span').textContent = `Vendor ${newIndex + 1}`;
    });
  }
}

function handlePhotoChange(index) {
  const photoInput = document.querySelector(`[data-vendor-photo="${index}"]`);
  const justificationArea = document.getElementById(`justificationArea${index}`);
  
  if (photoInput.files.length > 0) {
    justificationArea.classList.add('hidden');
    const textarea = justificationArea.querySelector('textarea');
    textarea.removeAttribute('required');
  } else {
    justificationArea.classList.remove('hidden');
    const textarea = justificationArea.querySelector('textarea');
    textarea.setAttribute('required', 'required');
  }
}

async function handleVendorCostsSubmit(e) {
  e.preventDefault();
  
  if (!shiftId) {
    showVendorToast('No se pudo identificar el shift. Falta información en URL.', 'error');
    return;
  }
  
  const submitBtn = e.target.querySelector('[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Guardando...';
  
  try {
    const container = document.getElementById('vendorsContainer');
    const vendorRows = Array.from(container.children);
    
    const vendorsData = [];
    
    for (let i = 0; i < vendorRows.length; i++) {
      const vendorSelect = document.querySelector(`[data-vendor-select="${i}"]`);
      const amountInput = document.querySelector(`[data-vendor-amount="${i}"]`);
      const photoInput = document.querySelector(`[data-vendor-photo="${i}"]`);
      const justificationInput = document.querySelector(`[data-vendor-justification="${i}"]`);
      
      if (!vendorSelect || !vendorSelect.value) continue;
      
      const vendor = vendorsList.find(v => v.id === vendorSelect.value);
      if (!vendor) continue;
      
      const vendorItem = {
        vendorId: vendor.id,
        vendorName: vendor.nombre,
        importe: parseFloat(amountInput.value),
        ticketPhoto: null,
        justification: null
      };
      
      // Handle photo upload (convert to base64)
      if (photoInput.files.length > 0) {
        const file = photoInput.files[0];
        const base64 = await fileToBase64(file);
        vendorItem.ticketPhoto = base64;
      } else if (justificationInput && justificationInput.value.trim()) {
        vendorItem.justification = justificationInput.value.trim();
      }
      
      vendorsData.push(vendorItem);
    }
    
    if (vendorsData.length === 0) {
      throw new Error('Debes añadir al menos un vendor');
    }
    
    // Get guide name
    const guideName = currentUser.displayName || currentUser.email;
    
    // Get fecha and slot from shiftId
    const [fecha, slot] = shiftId.split('_');
    
    // Calculate total
    const totalVendors = vendorsData.reduce((sum, v) => sum + v.importe, 0);
    
    // Prepare document
    const vendorCostDoc = {
      shiftId: shiftId,
      guideId: guideId,
      guideName: guideName,
      fecha: fecha,
      slot: slot,
      tourDescription: eventData.summary,
      numPax: parseInt(document.getElementById('numPaxInput').value),
      vendors: vendorsData,
      totalVendors: parseFloat(totalVendors.toFixed(2)),
      salarioCalculado: 0, // TODO: Calculate from salary table
      editedByManager: false,
      editHistory: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    // Save to Firestore
    await addDoc(collection(db, 'vendor_costs'), vendorCostDoc);
    
    showVendorToast('✓ Costes guardados correctamente', 'success');
    
    // Reset form
    e.target.reset();
    const vendorsContainer = document.getElementById('vendorsContainer');
    vendorsContainer.innerHTML = '';
    addVendorRow();
    
    // Collapse form
    document.getElementById('vendorCostsBody').classList.add('hidden');
    document.getElementById('vendorCostsChevron').style.transform = 'rotate(0deg)';
    
  } catch (error) {
    console.error('Error saving vendor costs:', error);
    showVendorToast('Error al guardar: ' + error.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Guardar Costes';
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function showVendorToast(message, type = 'info') {
  const toast = document.createElement('div');
  const bgColor = type === 'success' ? 'bg-green-500' : 
                  type === 'error' ? 'bg-red-500' : 
                  type === 'warning' ? 'bg-yellow-500' : 'bg-blue-500';
  
  toast.className = `fixed bottom-4 right-4 ${bgColor} text-white px-4 py-3 rounded-lg shadow-lg z-50 max-w-sm`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// Make functions global for onclick handlers
window.removeVendorRow = removeVendorRow;
window.handlePhotoChange = handlePhotoChange;

document.addEventListener('DOMContentLoaded', init);