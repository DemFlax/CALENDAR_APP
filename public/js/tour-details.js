import { auth, db, appsScriptConfig } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { collection, addDoc, serverTimestamp, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

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

let eventData = null;
let currentUser = null;
let userRole = null;
let guideId = null;
let vendorsList = [];

// TOUR NAVIGATION STATE
let allTours = [];
let currentTourIndex = 0;

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
    
    await loadAllTours();
    
    // Setup navigation buttons
    document.getElementById('prevTourBtn').addEventListener('click', () => navigateTour(-1));
    document.getElementById('nextTourBtn').addEventListener('click', () => navigateTour(1));
    document.getElementById('backButton').addEventListener('click', goBack);
  });
}

async function loadAllTours() {
  showLoading();
  
  try {
    // Get guide's email
    const guideEmail = currentUser.email;
    
    // Date range: 30 days ago to 30 days ahead
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 30);
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 30);
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    // Call Apps Script to get all assigned tours
    const url = `${appsScriptConfig.url}?endpoint=getAssignedTours&startDate=${startDateStr}&endDate=${endDateStr}&guideEmail=${encodeURIComponent(guideEmail)}&apiKey=${appsScriptConfig.apiKey}`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    if (data.error) throw new Error(data.message || 'Error cargando tours');
    
    allTours = data.assignments || [];
    
    // Sort by date ASC (oldest first)
    allTours.sort((a, b) => {
      const dateCompare = a.fecha.localeCompare(b.fecha);
      if (dateCompare !== 0) return dateCompare;
      return (a.startTime || '').localeCompare(b.startTime || '');
    });
    
    if (allTours.length === 0) {
      showError('Sin asignaciones', 'No tienes tours asignados en los últimos/próximos 30 días', false);
      return;
    }
    
    // Find initial tour from URL params
    const params = new URLSearchParams(window.location.search);
    const urlEventId = params.get('eventId');
    
    if (urlEventId) {
      const index = allTours.findIndex(t => t.eventId === urlEventId);
      currentTourIndex = index >= 0 ? index : 0;
    } else {
      currentTourIndex = 0;
    }
    
    // Load first tour
    await loadCurrentTour();
    
  } catch (error) {
    console.error('Error loading tours:', error);
    showError('Error de conexión', 'No se pudo cargar la lista de tours', true);
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
  
  // Update UI indicators
  document.getElementById('currentTourIndex').textContent = currentTourIndex + 1;
  document.getElementById('totalTours').textContent = allTours.length;
  
  // Update navigation buttons
  document.getElementById('prevTourBtn').disabled = currentTourIndex === 0;
  document.getElementById('nextTourBtn').disabled = currentTourIndex === allTours.length - 1;
  
  // Update header
  document.getElementById('tourTitle').textContent = tour.tourName;
  document.getElementById('tourDate').textContent = formatDate(tour.fecha);
  document.getElementById('tourTime').textContent = tour.startTime;
  
  // Load tour details
  showLoading();
  
  try {
    console.log('Loading tour details for eventId:', tour.eventId);
    eventData = await getTourGuestDetails(tour.eventId);
    console.log('Event data received:', eventData);
    
    if (!eventData) {
      throw new Error('No data received from API');
    }
    
    const guests = eventData.guests || [];
    
    if (guests.length === 0) {
      showEmptyState();
    } else {
      renderGuests(guests);
      hideLoading();
      
      // Render vendor costs form ONLY if user is guide
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

// ============================================
// VENDOR COSTS FUNCTIONALITY
// ============================================

async function renderVendorCostsForm(fecha, slot, guests) {
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
  
  header.onclick = () => {
    const isHidden = body.classList.contains('hidden');
    body.classList.toggle('hidden');
    chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
  };
  
  // Reset form
  const form = document.getElementById('vendorCostsForm');
  form.reset();
  const container = document.getElementById('vendorsContainer');
  container.innerHTML = '';
  
  // Add 4 fixed vendors
  const fixedVendors = ['El Escarpín', 'Casa Ciriaco', 'La Revolcona', 'El Abuelo'];
  fixedVendors.forEach(vendorName => {
    addVendorRow(vendorName, true);
  });
  
  // Add vendor button (5 additional vendors available)
  document.getElementById('addVendorBtn').onclick = () => {
    const additionalVendors = ['La Campana', 'Los Ferreros', 'El Anciano Rey de los Vinos', 'Cervecería Santa Ana', 'Chocolat Madrid'];
    
    // Count non-fixed vendors
    const nonFixedCount = Array.from(container.children).filter(child => child.dataset.isFixed === 'false').length;
    
    if (nonFixedCount < additionalVendors.length) {
      addVendorRowAdditional(additionalVendors);
    } else {
      showVendorToast('Todos los vendors adicionales ya están añadidos', 'warning');
    }
  };
  
  // Form submit with fecha and slot
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
    
    // Sort by orden
    vendorsList.sort((a, b) => (a.orden || 0) - (b.orden || 0));
    
  } catch (error) {
    console.error('Error loading vendors:', error);
    vendorsList = [];
  }
}

function addVendorRow(preselectedName = null, isFixed = false) {
  const container = document.getElementById('vendorsContainer');
  const index = container.children.length;
  
  // Find vendor by name if preselected
  let selectedVendorId = '';
  if (preselectedName) {
    const vendor = vendorsList.find(v => v.nombre === preselectedName);
    selectedVendorId = vendor ? vendor.id : '';
  }
  
  const row = document.createElement('div');
  row.className = 'border border-gray-300 dark:border-gray-600 rounded-lg p-4 space-y-3 bg-gray-50 dark:bg-gray-800';
  row.dataset.vendorIndex = index;
  row.dataset.isFixed = isFixed;
  
  row.innerHTML = `
    <div class="flex items-center justify-between mb-2">
      <span class="text-base font-bold text-gray-900 dark:text-gray-100">${preselectedName || `Vendor Adicional`}</span>
      ${!isFixed ? `
        <button type="button" onclick="removeVendorRow(${index})" class="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-sm font-semibold">
          Eliminar
        </button>
      ` : ''}
    </div>
    
    <input type="hidden" data-vendor-select="${index}" value="${selectedVendorId}">
    
    <div>
      <label class="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Importe (€)</label>
      <input 
        type="number" 
        step="0.01" 
        min="0" 
        max="999.99"
        placeholder="0.00"
        class="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm font-medium"
        data-vendor-amount="${index}"
      />
    </div>
    
    <div>
      <label class="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Foto Ticket</label>
      <input 
        type="file" 
        accept="image/*"
        class="w-full text-sm text-gray-800 dark:text-gray-200 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-emerald-600 file:text-white hover:file:bg-emerald-700 dark:file:bg-emerald-700 dark:hover:file:bg-emerald-600"
        data-vendor-photo="${index}"
        onchange="handlePhotoChange(${index})"
      />
      <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">Opcional. Sin foto, justifica abajo.</p>
    </div>
    
    <div id="justificationArea${index}" class="hidden">
      <label class="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Justificación (sin foto)</label>
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

function addVendorRowAdditional(availableVendors) {
  const container = document.getElementById('vendorsContainer');
  const index = container.children.length;
  
  const row = document.createElement('div');
  row.className = 'border border-gray-300 dark:border-gray-600 rounded-lg p-4 space-y-3 bg-gray-50 dark:bg-gray-800';
  row.dataset.vendorIndex = index;
  row.dataset.isFixed = 'false';
  
  row.innerHTML = `
    <div class="flex items-center justify-between mb-2">
      <span class="text-base font-bold text-gray-900 dark:text-gray-100">Vendor Adicional</span>
      <button type="button" onclick="removeVendorRow(${index})" class="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-sm font-semibold">
        Eliminar
      </button>
    </div>
    
    <div>
      <label class="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Seleccionar Vendor</label>
      <select 
        required
        class="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm font-medium"
        data-vendor-select="${index}"
      >
        <option value="">Elegir...</option>
        ${availableVendors.map(name => {
          const vendor = vendorsList.find(v => v.nombre === name);
          return vendor ? `<option value="${vendor.id}">${vendor.nombre}</option>` : '';
        }).join('')}
      </select>
    </div>
    
    <div>
      <label class="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Importe (€)</label>
      <input 
        type="number" 
        step="0.01" 
        min="0" 
        max="999.99"
        placeholder="0.00"
        class="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm font-medium"
        data-vendor-amount="${index}"
      />
    </div>
    
    <div>
      <label class="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Foto Ticket</label>
      <input 
        type="file" 
        accept="image/*"
        class="w-full text-sm text-gray-800 dark:text-gray-200 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-emerald-600 file:text-white hover:file:bg-emerald-700 dark:file:bg-emerald-700 dark:hover:file:bg-emerald-600"
        data-vendor-photo="${index}"
        onchange="handlePhotoChange(${index})"
      />
      <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">Opcional. Sin foto, justifica abajo.</p>
    </div>
    
    <div id="justificationArea${index}" class="hidden">
      <label class="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Justificación (sin foto)</label>
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

// ============================================
// IMAGE COMPRESSION FUNCTION
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
        
        // Redimensionar si excede maxWidth
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convertir a blob
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Error comprimiendo imagen'));
              return;
            }
            
            // Convertir blob a base64
            const blobReader = new FileReader();
            blobReader.onload = () => resolve(blobReader.result);
            blobReader.onerror = reject;
            blobReader.readAsDataURL(blob);
          },
          'image/jpeg',
          quality
        );
      };
      
      img.onerror = () => reject(new Error('Error cargando imagen'));
      img.src = e.target.result;
    };
    
    reader.onerror = () => reject(new Error('Error leyendo archivo'));
    reader.readAsDataURL(file);
  });
}

async function handleVendorCostsSubmit(e, fecha, slot) {
  e.preventDefault();
  
  const shiftId = `${fecha}_${slot}`;
  
  // Validar que han pasado 2.5 horas desde el tour
  const tour = allTours[currentTourIndex];
  if (tour && tour.fecha && tour.startTime) {
    const [hours, minutes] = tour.startTime.split(':');
    const eventDateTime = new Date(`${tour.fecha}T${hours}:${minutes}:00`);
    const now = new Date();
    const minTime = new Date(eventDateTime.getTime() + (2.5 * 60 * 60 * 1000));
    
    if (now < minTime) {
      const hoursLeft = Math.ceil((minTime - now) / (1000 * 60 * 60));
      showVendorToast(`Solo puedes registrar costes 2.5 horas después del tour. Quedan ${hoursLeft}h aproximadamente.`, 'error');
      return;
    }
  }
  
  const submitBtn = e.target.querySelector('[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Procesando imágenes...';
  
  try {
    const container = document.getElementById('vendorsContainer');
    const vendorRows = Array.from(container.children);
    
    const vendorsData = [];
    
    for (let i = 0; i < vendorRows.length; i++) {
      const vendorInput = document.querySelector(`[data-vendor-select="${i}"]`);
      const amountInput = document.querySelector(`[data-vendor-amount="${i}"]`);
      const photoInput = document.querySelector(`[data-vendor-photo="${i}"]`);
      const justificationInput = document.querySelector(`[data-vendor-justification="${i}"]`);
      
      let vendorId = '';
      
      // Hidden input (fixed vendors) or select (additional vendors)
      if (vendorInput.tagName === 'INPUT') {
        vendorId = vendorInput.value;
      } else if (vendorInput.tagName === 'SELECT') {
        vendorId = vendorInput.value;
      }
      
      if (!vendorId) continue;
      
      // Skip if no amount (optional vendor)
      const amount = parseFloat(amountInput.value);
      if (!amount || amount === 0) continue;
      
      const vendor = vendorsList.find(v => v.id === vendorId);
      if (!vendor) continue;
      
      const vendorItem = {
        vendorId: vendor.id,
        vendorName: vendor.nombre,
        importe: amount,
        ticketPhoto: null,
        justification: null
      };
      
      // Handle photo upload (compress and convert to base64)
      if (photoInput.files.length > 0) {
        submitBtn.textContent = `Comprimiendo imagen ${i + 1}/${vendorRows.length}...`;
        
        const file = photoInput.files[0];
        const compressedBase64 = await compressImage(file);
        vendorItem.ticketPhoto = compressedBase64;
        
        console.log(`Imagen ${i + 1} comprimida:`, {
          original: Math.round(file.size / 1024) + 'KB',
          compressed: Math.round(compressedBase64.length * 0.75 / 1024) + 'KB'
        });
        
      } else if (justificationInput && justificationInput.value.trim()) {
        vendorItem.justification = justificationInput.value.trim();
      }
      
      vendorsData.push(vendorItem);
    }
    
    if (vendorsData.length === 0) {
      throw new Error('Debes registrar al menos un vendor con importe');
    }
    
    submitBtn.textContent = 'Guardando...';
    
    // Get guide name
    const guideName = currentUser.displayName || currentUser.email;
    
    // Calculate total
    const totalVendors = vendorsData.reduce((sum, v) => sum + v.importe, 0);
    
    // Get feedback
    const feedback = document.getElementById('postTourFeedback').value.trim() || null;
    
    // Prepare document
    const vendorCostDoc = {
      shiftId: shiftId,
      guideId: guideId,
      guideName: guideName,
      fecha: fecha,
      slot: slot,
      tourDescription: allTours[currentTourIndex].tourName,
      numPax: parseInt(document.getElementById('numPaxInput').value),
      vendors: vendorsData,
      totalVendors: parseFloat(totalVendors.toFixed(2)),
      postTourFeedback: feedback,
      salarioCalculado: 0,
      editedByManager: false,
      editHistory: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    // Save to Firestore
    await addDoc(collection(db, 'vendor_costs'), vendorCostDoc);
    
    showVendorToast('Costes guardados correctamente', 'success');
    
    // Reset form
    e.target.reset();
    const vendorsContainer = document.getElementById('vendorsContainer');
    vendorsContainer.innerHTML = '';
    
    // Re-add fixed vendors
    const fixedVendors = ['El Escarpín', 'Casa Ciriaco', 'La Revolcona', 'El Abuelo'];
    fixedVendors.forEach(vendorName => {
      addVendorRow(vendorName, true);
    });
    
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

function handleError(error) {
  hideLoading();
  
  const errorTitle = document.getElementById('errorTitle');
  const errorMessage = document.getElementById('errorMessage');
  const retryBtn = document.getElementById('retryButton');
  
  switch(error.code) {
    case 'UNAUTHORIZED':
      errorTitle.textContent = 'Sesión expirada';
      errorMessage.textContent = 'Tu sesión ha expirado. Redirigiendo al login...';
      retryBtn.classList.add('hidden');
      setTimeout(() => window.location.href = '/login.html', 3000);
      break;
      
    case 'NOT_FOUND':
      errorTitle.textContent = 'Tour no encontrado';
      errorMessage.textContent = 'El evento no existe o fue eliminado.';
      retryBtn.classList.add('hidden');
      break;
      
    case 'TIMEOUT':
      errorTitle.textContent = 'Conexión lenta';
      errorMessage.textContent = 'La conexión está tardando más de lo normal.';
      retryBtn.classList.remove('hidden');
      break;
      
    default:
      errorTitle.textContent = 'Error al cargar detalles';
      errorMessage.textContent = 'No pudimos conectar con el servidor. Intenta de nuevo.';
      retryBtn.classList.remove('hidden');
  }
  
  retryBtn.onclick = () => loadCurrentTour();
  
  showError();
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

function showError() {
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
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">Sin información de guests</h3>
      <p class="text-gray-600 dark:text-gray-300 mb-4">No hay detalles de reservas disponibles para este tour.</p>
    </div>
  `;
  
  document.getElementById('guestCount').textContent = '0';
}

function formatDate(dateStr) {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('es-ES', { 
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
    bgColor = 'bg-emerald-600 dark:bg-emerald-700';
    icon = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
    </svg>`;
  } else if (type === 'error') {
    bgColor = 'bg-red-600 dark:bg-red-700';
    icon = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
    </svg>`;
  } else if (type === 'warning') {
    bgColor = 'bg-yellow-600 dark:bg-yellow-700';
    icon = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
    </svg>`;
  } else {
    bgColor = 'bg-blue-600 dark:bg-blue-700';
    icon = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
    </svg>`;
  }
  
  toast.className = `fixed bottom-6 right-6 ${bgColor} text-white px-5 py-4 rounded-xl shadow-2xl z-50 max-w-md flex items-center gap-3 transform transition-all duration-300 ease-out`;
  toast.style.animation = 'slideIn 0.3s ease-out';
  
  toast.innerHTML = `
    <div class="flex-shrink-0">
      ${icon}
    </div>
    <p class="font-semibold text-sm sm:text-base">${message}</p>
  `;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Add CSS animation
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateX(100%);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
`;
document.head.appendChild(styleSheet);

// Make functions global for onclick handlers
window.copyPhoneNumber = (phone) => {
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
    showVendorToast('Teléfono copiado', 'success');
    
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

window.removeVendorRow = (index) => {
  const row = document.querySelector(`[data-vendor-index="${index}"]`);
  if (row && row.dataset.isFixed === 'false') {
    row.remove();
  }
};

window.handlePhotoChange = (index) => {
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
};

document.addEventListener('DOMContentLoaded', init);