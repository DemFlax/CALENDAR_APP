# Guía de Integración - Vendor Costs Module

**Versión:** 1.0  
**Fecha:** 2025-10-15  
**Proyecto:** calendar-app-tours

---

## 1. Archivos Existentes a Modificar

### 1.1 `public/tour-details.html`

**Ubicación inserción:** Después de `<section id="guestsList">`, antes de `</main>`

```html
<!-- VENDOR COSTS SECTION (NUEVA) -->
<section id="vendorCostsSection" class="mt-6 hidden">
  <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6 border border-gray-200 dark:border-gray-700">
    <h3 class="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-4">
      Vendor Costs
    </h3>
    
    <div id="vendorCostsForm"></div>
  </div>
</section>
```

**Añadir al final antes de `</body>`:**
```html
<script type="module" src="./js/vendor-costs-form.js"></script>
```

---

### 1.2 `public/js/tour-details.js`

**Añadir import:**
```javascript
import { initVendorCostsForm, canRegisterVendorCosts } from './vendor-costs-form.js';
```

**Modificar `loadTourDetails` (después de renderGuests):**
```javascript
async function loadTourDetails(eventId) {
  showLoading();
  
  try {
    eventData = await getTourGuestDetails(eventId);
    
    // ... código existente ...
    
    if (guests.length === 0) {
      showEmptyState();
    } else {
      renderGuests();
      hideLoading();
    }
    
    // NUEVO: Inicializar vendor costs si es guía
    await initVendorCostsIfGuide();
    
  } catch (error) {
    handleError(error);
  }
}

async function initVendorCostsIfGuide() {
  const token = await currentUser.getIdTokenResult();
  
  if (token.claims.role === 'guide') {
    const params = new URLSearchParams(window.location.search);
    const shiftId = `${params.get('date')}_${params.get('slot') || 'MAÑANA'}`;
    
    const canRegister = await canRegisterVendorCosts(
      token.claims.guideId,
      shiftId
    );
    
    if (canRegister) {
      document.getElementById('vendorCostsSection').classList.remove('hidden');
      initVendorCostsForm(shiftId, params.get('date'));
    }
  }
}
```

---

### 1.3 `public/js/calendar-api.js`

**Añadir al final:**
```javascript
export async function uploadVendorTickets(payload) {
  const { appsScriptConfig } = await import('./firebase-config.js');
  
  const vendorsJson = JSON.stringify(payload.vendors);
  const vendorsBase64 = btoa(vendorsJson);
  
  const url = `${appsScriptConfig.url}?endpoint=uploadVendorTickets` +
    `&shiftId=${payload.shiftId}` +
    `&guideId=${payload.guideId}` +
    `&guideName=${encodeURIComponent(payload.guideName)}` +
    `&fecha=${payload.fecha}` +
    `&slot=${payload.slot}` +
    `&numPax=${payload.numPax}` +
    `&vendorsData=${vendorsBase64}` +
    `&apiKey=${appsScriptConfig.apiKey}`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  const data = await response.json();
  
  if (data.error) {
    throw new Error(data.message);
  }
  
  return data;
}
```

---

### 1.4 `functions/index.js`

**Añadir después de exports.devSetPassword:**

```javascript
// =========================================
// VENDOR COSTS FUNCTIONS
// =========================================

exports.registerVendorCost = onCall(async (request) => {
  const { data, auth } = request;
  
  if (!auth || auth.token.role !== 'guide') {
    throw new HttpsError('unauthenticated', 'Must be guide');
  }
  
  const guideId = auth.token.guideId;
  
  const shiftSnap = await getFirestore()
    .doc(`guides/${guideId}/shifts/${data.shiftId}`)
    .get();
    
  if (!shiftSnap.exists || shiftSnap.data().estado !== 'ASIGNADO') {
    throw new HttpsError('failed-precondition', 'Shift not assigned');
  }
  
  const existingSnap = await getFirestore()
    .collection('vendor_costs')
    .where('shiftId', '==', data.shiftId)
    .where('guideId', '==', guideId)
    .limit(1)
    .get();
    
  if (!existingSnap.empty) {
    throw new HttpsError('already-exists', 'Already registered');
  }
  
  // Upload tickets
  const driveResult = await uploadVendorTicketsViaAppsScript({
    shiftId: data.shiftId,
    guideId,
    guideName: auth.token.name || 'Guía',
    fecha: shiftSnap.data().fecha,
    slot: shiftSnap.data().slot,
    numPax: data.numPax,
    vendors: data.vendors
  });
  
  const salarioCalculado = await calculateVendorCostSalary(data.numPax);
  
  await getFirestore().collection('vendor_costs').add({
    shiftId: data.shiftId,
    guideId,
    guideName: auth.token.name || 'Guía',
    fecha: shiftSnap.data().fecha,
    slot: shiftSnap.data().slot,
    numPax: data.numPax,
    vendors: data.vendors.map((v, idx) => ({
      vendorId: v.vendorId,
      vendorName: v.vendorName,
      importe: v.importe,
      driveFileId: driveResult.vendors[idx].driveFileId
    })),
    totalVendors: data.vendors.reduce((sum, v) => sum + v.importe, 0),
    salarioCalculado,
    editedByManager: false,
    editHistory: [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });
  
  return { success: true, salarioCalculado };
});

async function uploadVendorTicketsViaAppsScript(payload) {
  const vendorsJson = JSON.stringify(payload.vendors);
  const vendorsBase64 = Buffer.from(vendorsJson).toString('base64');
  
  const appsScriptUrl = process.env.APPS_SCRIPT_URL;
  const apiKey = process.env.APPS_SCRIPT_API_KEY;
  
  const url = `${appsScriptUrl}?endpoint=uploadVendorTickets` +
    `&shiftId=${payload.shiftId}` +
    `&guideId=${payload.guideId}` +
    `&guideName=${encodeURIComponent(payload.guideName)}` +
    `&fecha=${payload.fecha}` +
    `&slot=${payload.slot}` +
    `&numPax=${payload.numPax}` +
    `&vendorsData=${vendorsBase64}` +
    `&apiKey=${apiKey}`;
  
  const response = await fetch(url);
  const data = await response.json();
  
  if (data.error) throw new Error(data.message);
  
  return data;
}

async function calculateVendorCostSalary(numPax) {
  const tableSnap = await getFirestore()
    .doc('config/salary_table')
    .get();
    
  if (!tableSnap.exists) return 0;
  
  const range = tableSnap.data().ranges.find(r =>
    numPax >= r.minPax && numPax <= r.maxPax
  );
  
  return range ? range.pagoBruto : 0;
}

exports.generateMonthlyVendorReports = onSchedule({
  schedule: '0 2 1 * *',
  timeZone: 'Europe/Madrid'
}, async (context) => {
  logger.info('Generating monthly vendor reports');
  // Implementar lógica generación reportes
});

exports.generateMonthlyGuideInvoices = onSchedule({
  schedule: '0 23 L * *',
  timeZone: 'Europe/Madrid'
}, async (context) => {
  logger.info('Generating monthly guide invoices');
  // Implementar lógica generación facturas
});

exports.approveGuideInvoice = onCall(async (request) => {
  const { data, auth } = request;
  
  if (!auth || auth.token.role !== 'guide') {
    throw new HttpsError('unauthenticated', 'Must be guide');
  }
  
  // Implementar lógica aprobación factura
  return { success: true };
});
```

---

### 1.5 `firestore.rules`

**Añadir después de reglas shifts:**

```javascript
// Colección vendors
match /vendors/{vendorId} {
  allow read: if isAuthenticated();
  allow create, update, delete: if isManager();
}

// Colección vendor_costs
match /vendor_costs/{vendorCostId} {
  allow read: if isManager() || 
                 (isGuide() && resource.data.guideId == request.auth.token.guideId);
  
  allow create: if isGuide() && 
                   request.resource.data.guideId == request.auth.token.guideId;
  
  allow update: if isManager() ||
                   (isGuide() && 
                    resource.data.guideId == request.auth.token.guideId &&
                    request.time < resource.data.createdAt + duration.value(1, 'd'));
  
  allow delete: if false;
}

// Colección guide_invoices
match /guide_invoices/{invoiceId} {
  allow read: if isManager() || 
                 (isGuide() && resource.data.guideId == request.auth.token.guideId);
  
  allow update: if isGuide() && 
                   resource.data.guideId == request.auth.token.guideId &&
                   resource.data.status == 'PENDING_APPROVAL';
  
  allow create, delete: if false; // Solo Cloud Functions
}

// Config
match /config/{docId} {
  allow read: if isAuthenticated();
  allow write: if isManager();
}
```

---

### 1.6 `firestore.indexes.json`

**Añadir:**

```json
{
  "indexes": [
    {
      "collectionGroup": "vendor_costs",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "guideId", "order": "ASCENDING" },
        { "fieldPath": "fecha", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "vendor_costs",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "fecha", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "guide_invoices",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "guideId", "order": "ASCENDING" },
        { "fieldPath": "month", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "guide_invoices",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

---

## 2. Archivos Nuevos a Crear

### 2.1 Frontend

```
public/js/
├── vendor-costs-form.js        # Formulario tour-details
├── manager-vendors.js          # CRUD vendors
├── guide-invoices.js           # Facturas guías

public/
├── manager-vendors.html        # Página manager vendors
├── my-invoices.html           # Página facturas guías
```

### 2.2 Apps Script

**Nuevo endpoint en Apps Script existente:**

```javascript
// Añadir al switch en doGet()
case 'uploadVendorTickets':
  return handleUploadVendorTickets(e.parameter);
```

---

## 3. Navegación a Añadir

### 3.1 Manager Dashboard

**En `public/manager.html` sidebar:**

```html
<a href="/manager-vendors.html" class="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
  </svg>
  <span>Vendors</span>
</a>
```

### 3.2 Guide Dashboard

**En `public/guide.html` sidebar:**

```html
<a href="/my-invoices.html" class="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
  </svg>
  <span>Mis Facturas</span>
</a>
```

---

## 4. Variables de Entorno

### 4.1 `.env` (Cloud Functions)

**Añadir:**
```bash
# Vendor Costs
VENDORS_SHEET_ID=1aB2cD3eF4gH5iJ...
DRIVE_ROOT_FOLDER_ID=6kL7mN8oP9qR0sT...
```

### 4.2 Apps Script Properties

**En PropertiesService.getScriptProperties():**
```javascript
VENDORS_SHEET_ID: "1aB2cD3eF4gH5iJ..."
DRIVE_ROOT_FOLDER_ID: "6kL7mN8oP9qR0sT..."
```

---

## 5. Inicialización Firestore

**Script one-time setup:**

```javascript
// scripts/init-vendor-costs.js
const admin = require('firebase-admin');
admin.initializeApp();

async function initVendorCosts() {
  const db = admin.firestore();
  
  // Crear tabla salarial
  await db.doc('config/salary_table').set({
    ranges: [
      { minPax: 1, maxPax: 4, pagoNeto: 70, pagoBruto: 84.70 },
      { minPax: 5, maxPax: 5, pagoNeto: 75, pagoBruto: 90.75 },
      { minPax: 6, maxPax: 6, pagoNeto: 80, pagoBruto: 96.80 },
      { minPax: 7, maxPax: 7, pagoNeto: 85, pagoBruto: 102.85 },
      { minPax: 8, maxPax: 8, pagoNeto: 90, pagoBruto: 108.90 },
      { minPax: 9, maxPax: 9, pagoNeto: 95, pagoBruto: 114.95 },
      { minPax: 10, maxPax: 10, pagoNeto: 100, pagoBruto: 121.00 },
      { minPax: 11, maxPax: 11, pagoNeto: 105, pagoBruto: 127.05 },
      { minPax: 12, maxPax: 20, pagoNeto: 110, pagoBruto: 133.10 }
    ],
    ivaPercent: 21,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: 'setup-script'
  });
  
  console.log('✅ Salary table created');
  
  // Crear vendors ejemplo
  await db.collection('vendors').doc('vendor001').set({
    nombre: 'El Escarpín',
    cif: 'B12345678',
    orden: 0,
    estado: 'activo',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  
  console.log('✅ Example vendor created');
  
  process.exit();
}

initVendorCosts();
```

**Ejecutar:**
```bash
node scripts/init-vendor-costs.js
```

---

## 6. Testing Integración

### 6.1 Verificar Shifts Subcollection

```javascript
// DevTools console en guide dashboard
const db = firebase.firestore();
const auth = firebase.auth();

const user = auth.currentUser;
const token = await user.getIdTokenResult();

const shiftsSnap = await db
  .collection(`guides/${token.claims.guideId}/shifts`)
  .where('estado', '==', 'ASIGNADO')
  .limit(5)
  .get();

console.log('Shifts asignados:', shiftsSnap.size);
shiftsSnap.forEach(doc => console.log(doc.id, doc.data()));
```

### 6.2 Test Upload Vendor Costs

```javascript
const functions = firebase.functions();
const registerVendorCost = functions.httpsCallable('registerVendorCost');

const result = await registerVendorCost({
  shiftId: '2025-10-15_T1',
  numPax: 8,
  vendors: [
    {
      vendorId: 'vendor001',
      vendorName: 'El Escarpín',
      importe: 45.50,
      ticketBase64: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...'
    }
  ]
});

console.log('Result:', result.data);
```

---

**Fin del documento**