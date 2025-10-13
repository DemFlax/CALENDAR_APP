# WBS - Tour Details Page Implementation
**Proyecto:** Spain Food Sherpas - Calendar App  
**Feature:** Tour Details Page  
**Fecha:** 14 Octubre 2025  
**Estimación Total:** 16 puntos (~2 sprints)

---

## 1. SETUP Y PREPARACIÓN (2h)

### 1.1 Configuración Branch
- **ID:** WBS-01.1
- **Responsable:** Dev Lead
- **Estimación:** 0.5h
- **Dependencias:** Ninguna

**Tareas:**
```bash
git checkout main
git pull origin main
git checkout -b feature/tour-details-page
```

**Criterios de aceptación:**
- [ ] Branch creada desde main actualizado
- [ ] Branch protegida en GitHub (requiere PR)

---

### 1.2 Estructura de Archivos
- **ID:** WBS-01.2
- **Responsable:** Dev
- **Estimación:** 0.5h
- **Dependencias:** WBS-01.1

**Tareas:**
- Crear `public/tour-details.html` (vacío con boilerplate)
- Crear `public/js/tour-details.js` (vacío con estructura básica)
- Validar estructura en navegador

**Estructura inicial:**
```
public/
├── tour-details.html          (NUEVO)
└── js/
    ├── tour-details.js        (NUEVO)
    ├── calendar-api.js        (MODIFICAR)
    └── guide-dashboard.js     (MODIFICAR)
```

**Criterios de aceptación:**
- [ ] Archivos creados en estructura correcta
- [ ] HTML carga sin errores 404
- [ ] JS se importa correctamente

---

### 1.3 Documentación Técnica
- **ID:** WBS-01.3
- **Responsable:** Dev
- **Estimación:** 1h
- **Dependencias:** WBS-01.2

**Tareas:**
- Documentar función `parseDescription()` con JSDoc
- Crear README.md en `/docs` explicando arquitectura
- Documentar Interface `Guest` en comentarios

**Entregable:**
```javascript
/**
 * Parsea el campo description de Google Calendar
 * @param {string} description - Texto raw del evento
 * @returns {Guest[]} Array de guests parseados
 * @example
 * const guests = parseDescription(event.description);
 */
```

**Criterios de aceptación:**
- [ ] JSDoc completo en funciones principales
- [ ] README con diagrama de flujo
- [ ] Interfaces TypeScript documentadas

---

## 2. BACKEND: APPS SCRIPT ENDPOINT (3h)

### 2.1 Implementar Endpoint getEventDetails
- **ID:** WBS-02.1
- **Responsable:** Backend Dev
- **Estimación:** 2h
- **Dependencias:** Ninguna (paralelo a 1.x)

**Código a añadir en Apps Script:**
```javascript
function getEventDetails(e) {
  try {
    Logger.log('=== getEventDetails Request ===');
    Logger.log('Parameters: ' + JSON.stringify(e.parameter));
    
    // Validar API Key
    const apiKey = e.parameter.apiKey;
    const storedKey = PropertiesService.getScriptProperties().getProperty('API_KEY');
    
    if (!apiKey || apiKey !== storedKey) {
      Logger.log('ERROR: Invalid API Key');
      return buildResponse({
        error: true, 
        message: 'Unauthorized',
        code: 'UNAUTHORIZED'
      });
    }
    
    const eventId = e.parameter.eventId;
    
    if (!eventId) {
      Logger.log('ERROR: Missing eventId');
      return buildResponse({
        error: true,
        message: 'Missing eventId parameter',
        code: 'INVALID_REQUEST'
      });
    }
    
    Logger.log('Fetching event: ' + eventId);
    
    // Obtener evento de Calendar API
    const event = Calendar.Events.get(CALENDAR_ID, eventId);
    
    Logger.log('✅ Event retrieved successfully');
    
    return buildResponse({
      success: true,
      event: {
        id: event.id,
        summary: event.summary || 'Sin título',
        description: event.description || '',
        start: event.start,
        htmlLink: event.htmlLink
      }
    });
    
  } catch (error) {
    Logger.log('ERROR: ' + error.toString());
    Logger.log('Stack: ' + error.stack);
    
    // Detectar evento no encontrado
    if (error.toString().includes('Not Found') || error.toString().includes('404')) {
      return buildResponse({
        error: true,
        message: 'Event not found',
        code: 'NOT_FOUND'
      });
    }
    
    return buildResponse({
      error: true,
      message: error.toString(),
      code: 'INTERNAL_ERROR'
    });
  }
}
```

**Modificar doGet:**
```javascript
function doGet(e) {
  const endpoint = e.parameter.endpoint;
  
  if (endpoint === 'addGuideToEvent') {
    return addGuideToEvent(e);
  }
  
  if (endpoint === 'removeGuideFromEvent') {
    return removeGuideFromEvent(e);
  }
  
  if (endpoint === 'getEventDetails') {
    return getEventDetails(e);
  }
  
  return validateTour(e);
}
```

**Criterios de aceptación:**
- [ ] Endpoint responde correctamente con eventId válido
- [ ] Retorna error 'NOT_FOUND' si eventId no existe
- [ ] Retorna error 'UNAUTHORIZED' si API key inválida
- [ ] Logs en Apps Script muestran flujo completo

---

### 2.2 Testing Endpoint
- **ID:** WBS-02.2
- **Responsable:** Backend Dev
- **Estimación:** 1h
- **Dependencias:** WBS-02.1

**Función de test:**
```javascript
function testGetEventDetails() {
  // Test caso exitoso
  const result1 = doGet({
    parameter: {
      endpoint: 'getEventDetails',
      apiKey: PropertiesService.getScriptProperties().getProperty('API_KEY'),
      eventId: 'orrkc6dnto0vkklmfmftg2o1v8' // ID real de test
    }
  });
  
  Logger.log('Test exitoso: ' + result1.getContent());
  
  // Test evento no encontrado
  const result2 = doGet({
    parameter: {
      endpoint: 'getEventDetails',
      apiKey: PropertiesService.getScriptProperties().getProperty('API_KEY'),
      eventId: 'invalid_event_id_12345'
    }
  });
  
  Logger.log('Test NOT_FOUND: ' + result2.getContent());
  
  // Test sin API key
  const result3 = doGet({
    parameter: {
      endpoint: 'getEventDetails',
      eventId: 'orrkc6dnto0vkklmfmftg2o1v8'
    }
  });
  
  Logger.log('Test UNAUTHORIZED: ' + result3.getContent());
}
```

**Casos de test:**
1. ✅ Evento válido → Retorna data completa
2. ❌ EventId inválido → Retorna NOT_FOUND
3. ❌ Sin API Key → Retorna UNAUTHORIZED
4. ✅ Description vacía → Retorna description: ""
5. ✅ Description con múltiples guests → Retorna texto completo

**Criterios de aceptación:**
- [ ] 5 casos de test ejecutados
- [ ] Logs muestran respuestas esperadas
- [ ] Deploy a Apps Script staging

---

## 3. FRONTEND: FUNCIÓN DE API (2h)

### 3.1 Crear getTourGuestDetails en calendar-api.js
- **ID:** WBS-03.1
- **Responsable:** Frontend Dev
- **Estimación:** 1.5h
- **Dependencias:** WBS-02.2

**Código a añadir en `public/js/calendar-api.js`:**
```javascript
/**
 * Obtiene detalles completos de un tour desde Google Calendar
 * @param {string} eventId - ID del evento de Calendar
 * @param {Object} options - Opciones de configuración
 * @param {number} options.timeout - Timeout en ms (default: 10000)
 * @returns {Promise<Object>} Datos del evento
 * @throws {Error} Si falla la petición o timeout
 */
export async function getTourGuestDetails(eventId, options = {}) {
  const timeout = options.timeout || 10000; // 10 segundos
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const url = `${APPS_SCRIPT_URL}?endpoint=getEventDetails&eventId=${eventId}&apiKey=${API_KEY}`;
    
    const response = await fetch(url, {
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      const error = new Error(data.message);
      error.code = data.code;
      throw error;
    }
    
    return data.event;
    
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      const timeoutError = new Error('Request timeout');
      timeoutError.code = 'TIMEOUT';
      throw timeoutError;
    }
    
    console.error('Error fetching tour details:', error);
    throw error;
  }
}
```

**Criterios de aceptación:**
- [ ] Función exportada correctamente
- [ ] Timeout funciona (probado con delay artificial)
- [ ] Maneja errores con códigos (UNAUTHORIZED, NOT_FOUND, TIMEOUT)
- [ ] JSDoc completo

---

### 3.2 Testing Integración API
- **ID:** WBS-03.2
- **Responsable:** Frontend Dev
- **Estimación:** 0.5h
- **Dependencias:** WBS-03.1

**Script de test en DevTools:**
```javascript
// Test en consola del navegador
import { getTourGuestDetails } from './calendar-api.js';

// Test exitoso
getTourGuestDetails('orrkc6dnto0vkklmfmftg2o1v8')
  .then(event => console.log('✅ Success:', event))
  .catch(err => console.error('❌ Error:', err));

// Test timeout (modificar timeout a 100ms con URL lenta)
getTourGuestDetails('orrkc6dnto0vkklmfmftg2o1v8', { timeout: 100 })
  .catch(err => console.log('✅ Timeout caught:', err.code));

// Test NOT_FOUND
getTourGuestDetails('invalid_id_12345')
  .catch(err => console.log('✅ NOT_FOUND caught:', err.code));
```

**Criterios de aceptación:**
- [ ] 3 casos de test pasados
- [ ] Network tab muestra petición correcta
- [ ] Errors manejados apropiadamente

---

## 4. FRONTEND: PARSING LOGIC (4h)

### 4.1 Implementar parseDescription
- **ID:** WBS-04.1
- **Responsable:** Frontend Dev
- **Estimación:** 2.5h
- **Dependencias:** WBS-01.3

**Código en `public/js/tour-details.js`:**
```javascript
/**
 * Interface Guest (documentación TypeScript)
 * @typedef {Object} Guest
 * @property {string} nombre - Nombre completo del guest
 * @property {number|null} pax - Número de personas
 * @property {string|null} telefono - Teléfono internacional
 * @property {string|null} notas - Requisitos especiales
 * @property {boolean} valido - Si tiene datos mínimos para mostrar
 * @property {number} errores - Contador de campos faltantes
 */

/**
 * Parsea el campo description de Google Calendar
 * @param {string} description - Texto raw del evento
 * @returns {Guest[]} Array de guests válidos
 */
function parseDescription(description) {
  if (!description || description.trim().length === 0) {
    return [];
  }
  
  // Separar por bloques (líneas con 4+ guiones)
  const bloques = description.split(/[-]{4,}/);
  const guests = [];
  
  for (const bloque of bloques) {
    const lineas = bloque.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);
    
    // Ignorar bloques muy cortos (headers)
    if (lineas.length < 3) continue;
    
    const guest = {
      nombre: null,
      pax: null,
      telefono: null,
      notas: null,
      valido: false,
      errores: 0
    };
    
    // Extraer PAX
    for (const linea of lineas) {
      const matchPax = linea.match(/(\d+)\s+adults?/i);
      if (matchPax) {
        guest.pax = parseInt(matchPax[1], 10);
        break;
      }
    }
    
    // Extraer NOMBRE (primera línea después de fecha)
    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i];
      // Detectar línea de fecha: "Thursday, 30 October 2025 17:30"
      if (linea.match(/\w+,\s+\d{1,2}\s+\w+\s+\d{4}\s+\d{2}:\d{2}/)) {
        if (i + 1 < lineas.length) {
          guest.nombre = lineas[i + 1];
        }
        break;
      }
    }
    
    // Extraer TELÉFONO (formato internacional)
    for (const linea of lineas) {
      const matchTel = linea.match(/([A-Z]{2}\+\d+[\s\d\(\)]+)/);
      if (matchTel) {
        guest.telefono = matchTel[1].trim();
        break;
      }
    }
    
    // Extraer NOTAS
    for (const linea of lineas) {
      if (linea.includes('Special Requirements/Notes:')) {
        guest.notas = linea.replace('Special Requirements/Notes:', '').trim();
        if (guest.notas.toLowerCase() === 'na' || guest.notas === '') {
          guest.notas = null;
        }
        break;
      }
    }
    
    // Calcular errores
    const camposRequeridos = [guest.nombre, guest.pax, guest.telefono];
    guest.errores = camposRequeridos.filter(campo => campo === null).length;
    
    // Validar: necesita nombre + (pax O telefono)
    guest.valido = guest.nombre && (guest.pax !== null || guest.telefono !== null);
    
    // Solo incluir si es válido o tiene máximo 1 error
    if (guest.valido || guest.errores <= 1) {
      guests.push(guest);
    }
  }
  
  return guests;
}
```

**Criterios de aceptación:**
- [ ] Parsea correctamente ejemplo del PDF (2 guests)
- [ ] Maneja guests con 1 campo faltante (muestra N/A)
- [ ] Ignora guests con >2 campos faltantes
- [ ] Extrae notas cuando presentes
- [ ] Código comentado y legible

---

### 4.2 Tests Unitarios Parsing
- **ID:** WBS-04.2
- **Responsable:** Frontend Dev
- **Estimación:** 1.5h
- **Dependencias:** WBS-04.1

**Casos de test:**
```javascript
// Test 1: Caso exitoso con 2 guests completos
const description1 = `
4 booked, 8 available
GUIDE MADRID: DANI
----------------------------------------------------
24507267180834
Madrid's Iconic Tapas - DANI
2 adults
Thursday, 30 October 2025 17:30
Andres Diaz
S-ebb94913@expmessaging.tripadvisor.com
US+1 (813) 541-1433 (home)
Total price: 150 EUR
----------------------------------------------------
24506176451852
Madrid's Iconic Tapas - DANI
2 adults
Thursday, 30 October 2025 17:30
Rene Escobio
S-ebb94913@expmessaging.tripadvisor.com
JP+81 8135075290 (home)
Special Requirements/Notes: Vegetarian
----------------------------------------------------
`;

const guests1 = parseDescription(description1);
console.assert(guests1.length === 2, 'Debe parsear 2 guests');
console.assert(guests1[0].nombre === 'Andres Diaz', 'Nombre 1 correcto');
console.assert(guests1[0].pax === 2, 'Pax 1 correcto');
console.assert(guests1[0].telefono.includes('US+1'), 'Teléfono 1 correcto');
console.assert(guests1[1].notas === 'Vegetarian', 'Notas correctas');

// Test 2: Guest con teléfono faltante (debe mostrar N/A)
const description2 = `
----------------------------------------------------
2 adults
Thursday, 30 October 2025 17:30
John Doe
john@example.com
----------------------------------------------------
`;

const guests2 = parseDescription(description2);
console.assert(guests2.length === 1, 'Debe incluir guest con 1 campo faltante');
console.assert(guests2[0].telefono === null, 'Teléfono debe ser null');
console.assert(guests2[0].errores === 1, 'Debe tener 1 error');

// Test 3: Guest inválido (solo nombre, falta pax y teléfono)
const description3 = `
----------------------------------------------------
Thursday, 30 October 2025 17:30
Jane Smith
----------------------------------------------------
`;

const guests3 = parseDescription(description3);
console.assert(guests3.length === 0, 'No debe incluir guest con >1 error');

// Test 4: Description vacía
const guests4 = parseDescription('');
console.assert(guests4.length === 0, 'Description vacía retorna array vacío');

// Test 5: Formato telefono variado
const description5 = `
----------------------------------------------------
3 adults
Thursday, 30 October 2025 17:30
Maria Garcia
ES+34 612345678 (mobile)
----------------------------------------------------
`;

const guests5 = parseDescription(description5);
console.assert(guests5[0].telefono.includes('ES+34'), 'Teléfono ES correcto');

console.log('✅ Todos los tests de parsing pasaron');
```

**Criterios de aceptación:**
- [ ] 5 tests unitarios pasados
- [ ] Probado con data real del PDF
- [ ] Edge cases cubiertos (vacío, malformado, etc)

---

## 5. FRONTEND: UI TOUR DETAILS PAGE (5h)

### 5.1 HTML Estructura y Estilos
- **ID:** WBS-05.1
- **Responsable:** Frontend Dev
- **Estimación:** 2h
- **Dependencias:** WBS-04.1

**Archivo `public/tour-details.html`:**
```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Detalles del Tour - Spain Food Sherpas</title>
  
  <!-- PWA Meta Tags -->
  <meta name="theme-color" content="#F97316">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  
  <!-- Tailwind CSS -->
  <script src="https://cdn.tailwindcss.com"></script>
  
  <style>
    /* Custom styles para skeleton loaders */
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    
    .skeleton {
      animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
      background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%);
      background-size: 200% 100%;
    }
    
    /* Asegurar mínimo 44px para touch targets (iOS) */
    button, a {
      min-height: 44px;
    }
  </style>
</head>
<body class="bg-gray-50 min-h-screen">
  
  <!-- Header Fijo -->
  <header class="bg-white shadow-sm fixed top-0 left-0 right-0 z-50">
    <div class="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
      <button 
        id="backButton" 
        class="text-orange-600 hover:text-orange-700 flex items-center gap-2"
        aria-label="Volver al dashboard"
      >
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
        <span class="font-medium">Volver</span>
      </button>
    </div>
  </header>
  
  <!-- Main Content -->
  <main class="pt-20 pb-6 px-4 max-w-4xl mx-auto">
    
    <!-- Tour Info Header -->
    <section id="tourHeader" class="bg-white rounded-lg shadow-md p-6 mb-6">
      <h1 id="tourTitle" class="text-2xl font-bold text-gray-900 mb-2">
        <!-- Cargado desde URL params o API -->
      </h1>
      <div class="flex items-center gap-4 text-gray-600">
        <div class="flex items-center gap-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
          <span id="tourDate" class="font-medium">
            <!-- Fecha -->
          </span>
        </div>
        <div class="flex items-center gap-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <span id="tourTime" class="font-medium">
            <!-- Hora -->
          </span>
        </div>
      </div>
    </section>
    
    <!-- Loading State -->
    <div id="loadingState" class="hidden">
      <div class="flex items-center justify-center py-12">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
        <span class="ml-3 text-gray-600">Cargando detalles...</span>
      </div>
    </div>
    
    <!-- Error State -->
    <div id="errorState" class="hidden bg-red-50 border border-red-200 rounded-lg p-6 text-center">
      <svg class="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
      </svg>
      <h2 class="text-xl font-bold text-gray-900 mb-2" id="errorTitle">Error</h2>
      <p class="text-gray-600 mb-6" id="errorMessage">Mensaje de error</p>
      <div class="flex gap-3 justify-center">
        <button id="retryButton" class="hidden bg-orange-600 text-white px-6 py-2 rounded-lg hover:bg-orange-700">
          Reintentar
        </button>
        <button id="viewInCalendarButton" class="hidden bg-gray-200 text-gray-800 px-6 py-2 rounded-lg hover:bg-gray-300">
          Ver en Calendar
        </button>
      </div>
    </div>
    
    <!-- Guests List -->
    <section id="guestsList" class="space-y-4">
      <h2 class="text-lg font-semibold text-gray-900 mb-4">
        Lista de Invitados (<span id="guestCount">0</span>)
      </h2>
      
      <!-- Guest cards se insertan aquí dinámicamente -->
      <div id="guestsContainer"></div>
      
      <!-- Warning si hay guests con errores -->
      <div id="incompleteGuestsWarning" class="hidden bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div class="flex items-start gap-3">
          <svg class="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          <div>
            <p class="font-medium text-yellow-800">
              <span id="incompleteCount">0</span> reservas con información incompleta
            </p>
            <button id="viewInCalendarFromWarning" class="text-yellow-700 underline text-sm mt-1">
              Ver evento completo en Calendar
            </button>
          </div>
        </div>
      </div>
    </section>
    
  </main>
  
  <!-- Scripts -->
  <script type="module" src="./js/tour-details.js"></script>
  
</body>
</html>
```

**Criterios de aceptación:**
- [ ] HTML semántico y accesible
- [ ] Responsive mobile-first
- [ ] Estados de loading/error visibles
- [ ] Touch targets mínimo 44px

---

### 5.2 JavaScript Rendering Logic
- **ID:** WBS-05.2
- **Responsable:** Frontend Dev
- **Estimación:** 2.5h
- **Dependencias:** WBS-05.1, WBS-04.1

**Archivo `public/js/tour-details.js`:**
```javascript
import { getTourGuestDetails } from './calendar-api.js';

// Estado de la página
let eventData = null;
let guests = [];
let incompleteGuestsCount = 0;

/**
 * Inicializa la página
 */
async function init() {
  // Obtener parámetros de URL
  const params = new URLSearchParams(window.location.search);
  const eventId = params.get('eventId');
  const title = params.get('title');
  const date = params.get('date');
  const time = params.get('time');
  
  if (!eventId) {
    showError('URL inválida', 'Falta el ID del evento', false);
    return;
  }
  
  // Renderizar datos de URL inmediatamente (UX rápida)
  if (title) document.getElementById('tourTitle').textContent = decodeURIComponent(title);
  if (date) document.getElementById('tourDate').textContent = formatDate(date);
  if (time) document.getElementById('tourTime').textContent = time;
  
  // Setup event listeners
  document.getElementById('backButton').addEventListener('click', goBack);
  document.getElementById('retryButton').addEventListener('click', () => loadTourDetails(eventId));
  
  // Cargar detalles del tour
  await loadTourDetails(eventId);
}

/**
 * Carga detalles del tour desde API
 */
async function loadTourDetails(eventId) {
  showLoading();
  
  try {
    eventData = await getTourGuestDetails(eventId);
    
    // Actualizar header con datos de API (por si faltaban en URL)
    document.getElementById('tourTitle').textContent = eventData.summary;
    
    const startDate = new Date(eventData.start.dateTime);
    document.getElementById('tourDate').textContent = formatDate(startDate.toISOString().split('T')[0]);
    document.getElementById('tourTime').textContent = startDate.toLocaleTimeString('es-ES', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    // Parsear guests
    guests = parseDescription(eventData.description);
    
    // Renderizar
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

/**
 * Renderiza lista de guests
 */
function renderGuests() {
  const container = document.getElementById('guestsContainer');
  container.innerHTML = '';
  
  let validGuests = 0;
  incompleteGuestsCount = 0;
  
  guests.forEach(guest => {
    if (guest.errores > 1) {
      incompleteGuestsCount++;
      return; // No renderizar guests con >2 errores
    }
    
    validGuests++;
    
    const card = document.createElement('div');
    card.className = 'bg-white rounded-lg shadow-md p-5 border border-gray-200';
    
    card.innerHTML = `
      <h3 class="text-lg font-semibold text-gray-900 mb-3">${guest.nombre || 'N/A'}</h3>
      
      <div class="space-y-2 text-gray-600">
        <!-- PAX -->
        <div class="flex items-center gap-2">
          <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
          </svg>
          <span>${guest.pax !== null ? guest.pax + ' personas' : 'N/A'}</span>
        </div>
        
        <!-- TELÉFONO -->
        <div class="flex items-center gap-2">
          <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
              d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
          </svg>
          <span>${guest.telefono || 'N/A'}</span>
        </div>
        
        <!-- NOTAS (si existen) -->
        ${guest.notas ? `
          <div class="flex items-start gap-2 mt-3 pt-3 border-t border-gray-200">
            <svg class="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            <div>
              <span class="text-sm font-medium text-gray-700">Notas:</span>
              <p class="text-sm text-gray-600 mt-1">${guest.notas}</p>
            </div>
          </div>
        ` : ''}
      </div>
    `;
    
    container.appendChild(card);
  });
  
  // Actualizar contador
  document.getElementById('guestCount').textContent = validGuests;
  
  // Mostrar warning si hay guests incompletos
  if (incompleteGuestsCount > 0) {
    document.getElementById('incompleteCount').textContent = incompleteGuestsCount;
    document.getElementById('incompleteGuestsWarning').classList.remove('hidden');
    
    // Event listener para botón de Calendar
    document.getElementById('viewInCalendarFromWarning').addEventListener('click', openInCalendar);
  }
}

/**
 * Maneja errores de API
 */
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
  
  // Setup event listener para Calendar button
  calendarBtn.addEventListener('click', openInCalendar);
  
  showError();
}

/**
 * Abre evento en Google Calendar
 */
function openInCalendar() {
  if (eventData && eventData.htmlLink) {
    window.open(eventData.htmlLink, '_blank');
  } else {
    const params = new URLSearchParams(window.location.search);
    const eventId = params.get('eventId');
    window.open(`https://calendar.google.com/calendar/event?eid=${eventId}`, '_blank');
  }
}

/**
 * Muestra estado de loading
 */
function showLoading() {
  document.getElementById('loadingState').classList.remove('hidden');
  document.getElementById('errorState').classList.add('hidden');
  document.getElementById('guestsList').classList.add('hidden');
}

/**
 * Oculta estado de loading
 */
function hideLoading() {
  document.getElementById('loadingState').classList.add('hidden');
  document.getElementById('guestsList').classList.remove('hidden');
}

/**
 * Muestra estado de error
 */
function showError(title, message, showRetry = true) {
  document.getElementById('loadingState').classList.add('hidden');
  document.getElementById('guestsList').classList.add('hidden');
  document.getElementById('errorState').classList.remove('hidden');
  
  if (title) document.getElementById('errorTitle').textContent = title;
  if (message) document.getElementById('errorMessage').textContent = message;
  
  document.getElementById('retryButton').classList.toggle('hidden', !showRetry);
}

/**
 * Muestra estado vacío (sin guests)
 */
function showEmptyState() {
  hideLoading();
  
  const container = document.getElementById('guestsContainer');
  container.innerHTML = `
    <div class="bg-blue-50 border border-blue-200 rounded-lg p-8 text-center">
      <svg class="w-16 h-16 text-blue-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
      </svg>
      <h3 class="text-lg font-semibold text-gray-900 mb-2">Sin información de guests</h3>
      <p class="text-gray-600 mb-4">No hay detalles de reservas disponibles para este tour.</p>
      <button onclick="openInCalendar()" class="bg-gray-200 text-gray-800 px-6 py-2 rounded-lg hover:bg-gray-300">
        Ver evento completo en Calendar
      </button>
    </div>
  `;
  
  document.getElementById('guestCount').textContent = '0';
}

/**
 * Formatea fecha para display
 */
function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('es-ES', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric' 
  });
}

/**
 * Navega de vuelta al dashboard
 */
function goBack() {
  window.location.href = '/guide.html';
}

// [INCLUIR AQUÍ LA FUNCIÓN parseDescription() DE WBS-04.1]

// Inicializar al cargar
document.addEventListener('DOMContentLoaded', init);
```

**Criterios de aceptación:**
- [ ] Renderiza header instantáneamente con URL params
- [ ] Muestra loading state durante fetch API
- [ ] Renderiza cards de guests correctamente
- [ ] Maneja todos los estados de error
- [ ] Botones funcionales (back, retry, calendar)

---

### 5.3 Responsive Testing
- **ID:** WBS-05.3
- **Responsable:** QA
- **Estimación:** 0.5h
- **Dependencias:** WBS-05.2

**Dispositivos de test:**
- iPhone SE (320px)
- iPhone 12 Pro (390px)
- iPad (768px)
- Desktop (1280px)

**Criterios de aceptación:**
- [ ] Todas las breakpoints funcionan
- [ ] Touch targets mínimo 44px
- [ ] Texto legible (min 16px)
- [ ] Sin scroll horizontal

---

## 6. INTEGRACIÓN DASHBOARD (2h)

### 6.1 Modificar guide-dashboard.js
- **ID:** WBS-06.1
- **Responsable:** Frontend Dev
- **Estimación:** 1.5h
- **Dependencias:** WBS-05.2

**Modificación en `public/js/guide-dashboard.js`:**

Buscar función que renderiza asignaciones (ejemplo):
```javascript
function renderUpcomingShifts(shifts) {
  const container = document.getElementById('upcomingShifts');
  container.innerHTML = '';
  
  shifts.forEach(shift => {
    const card = document.createElement('div');
    card.className = 'bg-white p-4 rounded-lg shadow cursor-pointer hover:shadow-lg transition-shadow';
    
    // ✅ AÑADIR: Event listener para navegación
    card.addEventListener('click', () => navigateToTourDetails(shift));
    
    card.innerHTML = `
      <div class="flex justify-between items-start mb-2">
        <h3 class="font-semibold text-gray-900">${shift.tourName}</h3>
        <span class="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">
          ${shift.slot}
        </span>
      </div>
      <p class="text-sm text-gray-600">
        📅 ${formatDate(shift.date)} - ${shift.time}
      </p>
      <p class="text-xs text-gray-500 mt-2">
        ID: ${shift.eventId}
      </p>
    `;
    
    container.appendChild(card);
  });
}

// ✅ AÑADIR: Nueva función de navegación
function navigateToTourDetails(shift) {
  const params = new URLSearchParams({
    eventId: shift.eventId,
    title: shift.tourName,
    date: shift.date,
    time: shift.time
  });
  
  window.location.href = `/tour-details.html?${params.toString()}`;
}
```

**Criterios de aceptación:**
- [ ] Cards de asignaciones clicables
- [ ] Cursor pointer en hover
- [ ] Navegación con todos los parámetros
- [ ] No rompe funcionalidad existente

---

### 6.2 Testing Integración Completa
- **ID:** WBS-06.2
- **Responsable:** QA
- **Estimación:** 0.5h
- **Dependencias:** WBS-06.1

**Flujo de test end-to-end:**
1. Login como guía
2. Navegar a dashboard
3. Ver "Mis Próximas Asignaciones"
4. Clic en una asignación
5. Verificar navegación a tour-details.html
6. Verificar datos en header
7. Verificar lista de guests
8. Clic "Volver"
9. Verificar regreso a dashboard

**Criterios de aceptación:**
- [ ] Flujo completo funciona sin errores
- [ ] Navegación back preserva estado
- [ ] PWA funciona en iOS/Android

---

## 7. TESTING Y QA (2h)

### 7.1 Tests Funcionales
- **ID:** WBS-07.1
- **Responsable:** QA
- **Estimación:** 1h
- **Dependencias:** WBS-06.2

**Test cases:**
1. ✅ Carga exitosa con 1 guest
2. ✅ Carga exitosa con múltiples guests
3. ✅ Guest con campo faltante muestra N/A
4. ✅ Guest con >2 campos faltantes no se muestra
5. ✅ Description vacía muestra empty state
6. ✅ Error 404 muestra mensaje correcto
7. ✅ Error UNAUTHORIZED redirige a login
8. ✅ Timeout muestra botón reintentar
9. ✅ Botón "Ver en Calendar" abre nueva pestaña
10. ✅ Botón "Volver" navega a dashboard

**Criterios de aceptación:**
- [ ] 10/10 casos de test pasados
- [ ] Sin errores en consola
- [ ] Sin warnings de accesibilidad

---

### 7.2 Tests de Seguridad
- **ID:** WBS-07.2
- **Responsable:** Security Lead
- **Estimación:** 1h
- **Dependencias:** WBS-07.1

**Checklist de seguridad:**
- [ ] API_KEY no expuesta en código cliente
- [ ] No hay PII en console.log
- [ ] HTTPS obligatorio (Firebase Hosting)
- [ ] No hay XSS en renderizado de guest names
- [ ] URL params sanitizados antes de usar
- [ ] No hay localStorage de datos sensibles

**Criterios de aceptación:**
- [ ] Todos los checks pasados
- [ ] Audit de seguridad aprobado

---

## 8. DEPLOYMENT (1h)

### 8.1 Deploy a Staging
- **ID:** WBS-08.1
- **Responsable:** DevOps
- **Estimación:** 0.5h
- **Dependencias:** WBS-07.2

**Comandos:**
```bash
# Desde feature branch
git add .
git commit -m "feat: implement tour details page"
git push origin feature/tour-details-page

# Deploy Apps Script a staging
# (manual desde Apps Script editor)

# Deploy Firebase Hosting
firebase deploy --only hosting:staging
```

**URL staging:**
`https://calendar-app-tours-staging.web.app/tour-details.html?eventId=...`

**Criterios de aceptación:**
- [ ] Deploy exitoso sin errores
- [ ] URL staging accesible
- [ ] Funcionalidad verificada en staging

---

### 8.2 Deploy a Producción
- **ID:** WBS-08.2
- **Responsable:** DevOps
- **Estimación:** 0.5h
- **Dependencias:** WBS-08.1, Aprobación QA

**Proceso:**
1. Merge PR a main
2. Deploy Apps Script a producción
3. Deploy Firebase Hosting a producción
4. Smoke test en producción

**Comandos:**
```bash
git checkout main
git pull origin main
git merge feature/tour-details-page
git push origin main

firebase deploy --only hosting
```

**Criterios de aceptación:**
- [ ] Merge aprobado por code review
- [ ] Deploy producción exitoso
- [ ] Smoke test OK
- [ ] Monitoreo activo (errores, performance)

---

## RESUMEN FINAL

### Estimación Total
| Fase | Puntos | Horas |
|------|--------|-------|
| Setup y Preparación | 1 | 2h |
| Backend Apps Script | 2 | 3h |
| Frontend API Integration | 1 | 2h |
| Parsing Logic | 2 | 4h |
| UI Implementation | 3 | 5h |
| Dashboard Integration | 1 | 2h |
| Testing y QA | 1 | 2h |
| Deployment | 0.5 | 1h |
| **TOTAL** | **11.5** | **21h** |

### Timeline Estimado
- **Sprint 1 (Semana 1):** WBS 1-4 (Backend + Parsing)
- **Sprint 2 (Semana 2):** WBS 5-8 (UI + Integración + Deploy)

### Critical Path
```
WBS-01.1 → WBS-01.2 → WBS-01.3
                   ↓
WBS-02.1 → WBS-02.2 → WBS-03.1 → WBS-03.2
                                      ↓
                   WBS-04.1 → WBS-04.2
                           ↓
WBS-05.1 → WBS-05.2 → WBS-05.3
                   ↓
WBS-06.1 → WBS-06.2
                   ↓
WBS-07.1 → WBS-07.2
                   ↓
WBS-08.1 → WBS-08.2
```

### Riesgos y Mitigación
| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Parsing falla con formatos inesperados | Media | Alto | Tests extensivos + fallback Calendar |
| Timeout en conexiones 3G | Alta | Medio | Auto-retry + UI feedback |
| Cambios en formato description | Baja | Alto | Monitoreo + alertas parsing errors |

### Métricas de Éxito Post-Deploy
- Parsing success rate: >95%
- Time to Interactive: <2s
- Error rate: <2%
- Adopción guías: >80% en 2 semanas

---

**Aprobado por:** [Pendiente]  
**Fecha inicio:** [Pendiente]  
**Fecha fin estimada:** [Pendiente]
