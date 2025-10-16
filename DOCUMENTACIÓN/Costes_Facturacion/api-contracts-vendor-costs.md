# API Contracts - Vendor Costs Module

**Versión:** 1.0  
**Fecha:** 2025-10-15  
**Proyecto:** calendar-app-tours

---

## 1. Apps Script Endpoints

**Base URL:** `https://script.google.com/macros/s/{DEPLOYMENT_ID}/exec`  
**Patrón:** Query params `?endpoint=X&param1=Y&apiKey=Z`  
**Autenticación:** `apiKey` en query string  
**Ejecutado como:** madrid@spainfoodsherpas (Workspace)

---

### 1.1 Upload Vendor Tickets

**Endpoint:** `GET /exec?endpoint=uploadVendorTickets`

**Propósito:** Subir múltiples tickets a Drive y escribir en Sheet Madrid.

**Request:**
```http
GET /exec?endpoint=uploadVendorTickets
  &shiftId=2025-10-15_T1
  &guideId=guide_abc123
  &guideName=Juan%20Pérez
  &fecha=2025-10-15
  &slot=T1
  &numPax=8
  &vendorsData=BASE64_ENCODED_JSON
  &apiKey=SECRET_KEY
```

**vendorsData (antes de encodear):**
```json
[
  {
    "vendorId": "vendor_abc123",
    "vendorName": "El Escarpín",
    "importe": 45.50,
    "ticketBase64": "data:image/jpeg;base64,..."
  },
  {
    "vendorId": "vendor_def456",
    "vendorName": "Casa Ciriaco",
    "importe": 60.00,
    "ticketBase64": "data:image/jpeg;base64,..."
  }
]
```

**Nota:** `vendorsData` se pasa como string base64-encoded debido a límites URL.

**Response Success (200):**
```json
{
  "success": true,
  "folderId": "1aB2cD3eF4gH5iJ",
  "vendors": [
    {
      "vendorId": "vendor_abc123",
      "driveFileId": "6kL7mN8oP9qR0sT",
      "driveUrl": "https://drive.google.com/file/d/6kL7mN8oP9qR0sT"
    },
    {
      "vendorId": "vendor_def456",
      "driveFileId": "1uV2wX3yZ4aB5cD",
      "driveUrl": "https://drive.google.com/file/d/1uV2wX3yZ4aB5cD"
    }
  ],
  "sheetAppended": true,
  "timestamp": "2025-10-15T19:30:00Z"
}
```

**Response Error (400):**
```json
{
  "error": true,
  "code": "INVALID_BASE64",
  "message": "Vendor 'El Escarpín' ticket is not valid base64",
  "vendorId": "vendor_abc123"
}
```

**Response Error (500):**
```json
{
  "error": true,
  "code": "DRIVE_UPLOAD_FAILED",
  "message": "Failed to upload ticket to Drive",
  "details": "Quota exceeded"
}
```

**Errores Comunes:**

| Code | HTTP | Descripción | Acción |
|------|------|-------------|--------|
| `UNAUTHORIZED` | 401 | API Key inválida | Verificar env variable |
| `INVALID_BASE64` | 400 | Base64 malformado | Recodificar imagen |
| `DRIVE_UPLOAD_FAILED` | 500 | Error Drive API | Retry con backoff |
| `SHEET_WRITE_FAILED` | 500 | Error Sheet API | Log warning, continuar |
| `TIMEOUT` | 504 | Timeout 6min Apps Script | Reducir batch size |

**Lógica Interna Apps Script:**
```javascript
// Apps Script doGet handler (ya existe patrón en proyecto)
function doGet(e) {
  const endpoint = e.parameter.endpoint;
  const apiKey = e.parameter.apiKey;
  
  // Validar API key
  if (apiKey !== PropertiesService.getScriptProperties().getProperty('API_KEY')) {
    return error('UNAUTHORIZED', 'Invalid API key');
  }
  
  // Router
  switch(endpoint) {
    case 'uploadVendorTickets':
      return handleUploadVendorTickets(e.parameter);
    case 'uploadReportPDF':
      return handleUploadReportPDF(e.parameter);
    case 'uploadInvoicePDF':
      return handleUploadInvoicePDF(e.parameter);
    default:
      return error('UNKNOWN_ENDPOINT', 'Endpoint not found');
  }
}

function handleUploadVendorTickets(params) {
  try {
    // Decode vendorsData
    const vendorsData = JSON.parse(
      Utilities.newBlob(
        Utilities.base64Decode(params.vendorsData)
      ).getDataAsString()
    );
    
    // Crear/obtener folder shift
    const folderId = getOrCreateShiftFolder(params.shiftId);
    
    // Upload tickets
    const uploadedVendors = [];
    vendorsData.forEach(vendor => {
      const base64Data = vendor.ticketBase64.split(',')[1];
      const blob = Utilities.newBlob(
        Utilities.base64Decode(base64Data),
        'image/jpeg',
        `${vendor.vendorName}_ticket.jpg`
      );
      
      const file = DriveApp.getFolderById(folderId).createFile(blob);
      
      uploadedVendors.push({
        vendorId: vendor.vendorId,
        driveFileId: file.getId(),
        driveUrl: file.getUrl()
      });
    });
    
    // Escribir Sheet
    appendToSheet({
      fecha: params.fecha,
      slot: params.slot,
      guideName: params.guideName,
      numPax: params.numPax,
      vendors: vendorsData
    }, uploadedVendors);
    
    return success({
      folderId,
      vendors: uploadedVendors
    });
    
  } catch (err) {
    Logger.log('Error uploadVendorTickets: ' + err);
    return error('UPLOAD_FAILED', err.toString());
  }
}

function getOrCreateShiftFolder(shiftId) {
  const rootFolder = DriveApp.getFolderById(ROOT_FOLDER_ID);
  const searchFolders = rootFolder.getFoldersByName(shiftId);
  
  if (searchFolders.hasNext()) {
    return searchFolders.next().getId();
  }
  
  const newFolder = rootFolder.createFolder(shiftId);
  return newFolder.getId();
}

function appendToSheet(payload, uploadedVendors) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();
  
  payload.vendors.forEach((vendor, idx) => {
    const driveUrl = uploadedVendors[idx].driveUrl;
    
    sheet.appendRow([
      new Date(),              // Timestamp
      payload.fecha,
      payload.slot,
      payload.guideName,
      payload.numPax,
      vendor.vendorName,
      vendor.importe,
      driveUrl,
      ''                       // Editado (vacío inicialmente)
    ]);
  });
}

function success(data) {
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    ...data,
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

function error(code, message) {
  return ContentService.createTextOutput(JSON.stringify({
    error: true,
    code,
    message
  })).setMimeType(ContentService.MimeType.JSON);
}
```

**Rate Limits:**
- Drive API: 1000 uploads/día
- Sheet API: 100 writes/min
- Apps Script: 6min timeout

---

### 1.2 Upload Report PDF

**Endpoint:** `POST /uploadReportPDF`

**Propósito:** Subir PDF reporte vendor a Drive.

**Request Body:**
```typescript
interface UploadReportRequest {
  vendorId: string;
  vendorName: string;
  month?: string;           // YYYY-MM (si auto)
  dateRange?: {             // Si manual
    start: string;
    end: string;
  };
  pdfBase64: string;        // data:application/pdf;base64,...
  generatedBy: 'AUTO' | 'MANUAL';
}
```

**Response Success (200):**
```json
{
  "success": true,
  "driveFileId": "7uV8wX9yZ0aB1cD",
  "driveUrl": "https://drive.google.com/file/d/7uV8wX9yZ0aB1cD",
  "folderPath": "Reportes Vendors/2025-10/El_Escarpin.pdf"
}
```

---

### 1.3 Upload Invoice PDF

**Endpoint:** `POST /uploadInvoicePDF`

**Propósito:** Subir PDF factura guía aprobada a Drive.

**Request Body:**
```typescript
interface UploadInvoiceRequest {
  guideId: string;
  guideName: string;
  invoiceNumber: string;    // SFS-001/25
  month: string;            // YYYY-MM
  pdfBase64: string;
}
```

**Response Success (200):**
```json
{
  "success": true,
  "driveFileId": "2eF3gH4iJ5kL6mN",
  "driveUrl": "https://drive.google.com/file/d/2eF3gH4iJ5kL6mN",
  "folderPath": "Facturas Guias/2025-10/Juan_Perez_SFS-001-25.pdf"
}
```

---

## 2. Cloud Functions (functions/index.js)

**Patrón:** `onCall` para operaciones autenticadas  
**SDK:** firebase-functions/v2  
**Auth:** Firebase Auth context automático

---

### 2.1 Register Vendor Cost

**Function:** `registerVendorCost` (onCall)

**Request:**
```javascript
// Frontend call
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();
const registerVendorCost = httpsCallable(functions, 'registerVendorCost');

const result = await registerVendorCost({
  shiftId: '2025-10-15_T1',
  numPax: 8,
  vendors: [
    {
      vendorId: 'vendor_abc123',
      importe: 45.50,
      ticketBase64: 'data:image/jpeg;base64,...'
    }
  ]
});
```

**Backend (functions/index.js):**
```javascript
const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');

exports.registerVendorCost = onCall(async (request) => {
  const { data, auth } = request;
  
  if (!auth || auth.token.role !== 'guide') {
    throw new HttpsError('unauthenticated', 'Must be authenticated guide');
  }
  
  const guideId = auth.token.guideId;
  
  // Validar shift (subcollection guides/{guideId}/shifts/{shiftId})
  const shiftSnap = await getFirestore()
    .doc(`guides/${guideId}/shifts/${data.shiftId}`)
    .get();
    
  if (!shiftSnap.exists || shiftSnap.data().estado !== 'ASIGNADO') {
    throw new HttpsError('failed-precondition', 'Shift not assigned');
  }
  
  // Validar no duplicado
  const existingSnap = await getFirestore()
    .collection('vendor_costs')
    .where('shiftId', '==', data.shiftId)
    .where('guideId', '==', guideId)
    .limit(1)
    .get();
    
  if (!existingSnap.empty) {
    throw new HttpsError('already-exists', 'Already registered');
  }
  
  // Upload tickets via Apps Script
  const driveResult = await uploadTicketsViaAppsScript({
    shiftId: data.shiftId,
    guideId,
    guideName: auth.token.name,
    fecha: shiftSnap.data().fecha,
    slot: shiftSnap.data().slot,
    numPax: data.numPax,
    vendors: data.vendors
  });
  
  // Calcular salario
  const salarioCalculado = await calculateSalary(data.numPax);
  
  // Crear documento
  await getFirestore().collection('vendor_costs').add({
    shiftId: data.shiftId,
    guideId,
    guideName: auth.token.name,
    fecha: shiftSnap.data().fecha,
    slot: shiftSnap.data().slot,
    numPax: data.numPax,
    vendors: data.vendors.map((v, idx) => ({
      ...v,
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

async function uploadTicketsViaAppsScript(payload) {
  const { appsScriptConfig } = require('./firebase-config.js');
  
  // Encode vendors data
  const vendorsJson = JSON.stringify(payload.vendors);
  const vendorsBase64 = Buffer.from(vendorsJson).toString('base64');
  
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
  const data = await response.json();
  
  if (data.error) throw new Error(data.message);
  
  return data;
}

async function calculateSalary(numPax) {
  const tableSnap = await getFirestore()
    .doc('config/salary_table')
    .get();
    
  const range = tableSnap.data().ranges.find(r =>
    numPax >= r.minPax && numPax <= r.maxPax
  );
  
  return range ? range.pagoBruto : 0;
}
```

**Validaciones:**
1. `context.auth.token.role === 'guide'`
2. Shift existe y estado === "ASIGNADO"
3. `shift.guideId === context.auth.token.guideId`
4. `shift.fecha >= hoy - 7 días`
5. No existe vendor_cost previo para `shiftId`
6. Todos `vendorIds` existen y estado "activo"
7. `numPax` entre 1-20
8. Cada vendor tiene `ticketBase64` válido

**Flujo:**
```typescript
export const registerVendorCost = functions.https.onCall(async (data, context) => {
  // 1. Auth check
  if (!context.auth || context.auth.token.role !== 'guide') {
    throw new functions.https.HttpsError('unauthenticated', 'Must be guide');
  }
  
  const guideId = context.auth.token.guideId;
  
  // 2. Validar shift
  const shiftSnap = await admin.firestore().doc(`shifts/${data.shiftId}`).get();
  if (!shiftSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Shift not found');
  }
  
  const shift = shiftSnap.data();
  if (shift.estado !== 'ASIGNADO') {
    throw new functions.https.HttpsError('failed-precondition', 'Shift not assigned');
  }
  
  if (shift.guideId !== guideId) {
    throw new functions.https.HttpsError('permission-denied', 'Shift is not assigned to you');
  }
  
  // 3. Validar fecha (máx 7 días retroactivo)
  const shiftDate = new Date(shift.fecha);
  const today = new Date();
  const diffDays = Math.floor((today - shiftDate) / (1000 * 60 * 60 * 24));
  if (diffDays > 7) {
    throw new functions.https.HttpsError('failed-precondition', 'Cannot register vendor costs older than 7 days');
  }
  
  // 4. Validar no duplicado
  const existingSnap = await admin.firestore()
    .collection('vendor_costs')
    .where('shiftId', '==', data.shiftId)
    .limit(1)
    .get();
  
  if (!existingSnap.empty) {
    throw new functions.https.HttpsError('already-exists', 'Vendor cost already registered for this shift');
  }
  
  // 5. Validar vendors activos
  const vendorIds = data.vendors.map(v => v.vendorId);
  const vendorsSnap = await admin.firestore()
    .collection('vendors')
    .where(admin.firestore.FieldPath.documentId(), 'in', vendorIds)
    .get();
  
  if (vendorsSnap.size !== vendorIds.length) {
    throw new functions.https.HttpsError('not-found', 'One or more vendors not found');
  }
  
  const inactiveVendor = vendorsSnap.docs.find(doc => doc.data().estado !== 'activo');
  if (inactiveVendor) {
    throw new functions.https.HttpsError('failed-precondition', `Vendor ${inactiveVendor.data().nombre} is inactive`);
  }
  
  // 6. Fetch guide data
  const guideSnap = await admin.firestore().doc(`guides/${guideId}`).get();
  const guide = guideSnap.data();
  
  // 7. Fetch tour description from Calendar
  const tourDescription = await fetchTourDescription(shift.fecha, shift.slot);
  
  // 8. Upload tickets via Apps Script
  const appsScriptPayload = {
    shiftId: data.shiftId,
    guideId,
    guideName: guide.nombre,
    fecha: shift.fecha,
    slot: shift.slot,
    numPax: data.numPax,
    vendors: data.vendors.map((v, idx) => ({
      vendorId: v.vendorId,
      vendorName: vendorsSnap.docs[idx].data().nombre,
      importe: v.importe,
      ticketBase64: v.ticketBase64
    }))
  };
  
  const appsScriptResponse = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': APPS_SCRIPT_API_KEY
    },
    body: JSON.stringify(appsScriptPayload)
  });
  
  if (!appsScriptResponse.ok) {
    throw new functions.https.HttpsError('internal', 'Failed to upload tickets');
  }
  
  const uploadResult = await appsScriptResponse.json();
  
  // 9. Calcular salario
  const salarioCalculado = await calculateSalary(data.numPax);
  
  // 10. Crear doc Firestore
  const vendorCostRef = await admin.firestore().collection('vendor_costs').add({
    shiftId: data.shiftId,
    guideId,
    guideName: guide.nombre,
    fecha: shift.fecha,
    slot: shift.slot,
    tourDescription,
    numPax: data.numPax,
    vendors: data.vendors.map((v, idx) => ({
      vendorId: v.vendorId,
      vendorName: vendorsSnap.docs[idx].data().nombre,
      importe: v.importe,
      driveFileId: uploadResult.vendors[idx].driveFileId
    })),
    totalVendors: data.vendors.reduce((sum, v) => sum + v.importe, 0),
    salarioCalculado,
    editedByManager: false,
    editHistory: [],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  
  return {
    success: true,
    vendorCostId: vendorCostRef.id,
    salarioCalculado,
    driveUrls: uploadResult.vendors.map(v => v.driveUrl)
  };
});
```

---

### 2.2 Calculate Salary Preview

**Endpoint:** `calculateSalaryPreview` (callable)

**Propósito:** Calcular salario guía según pax (para preview frontend).

**Request:**
```typescript
interface CalculateSalaryRequest {
  numPax: number;
}
```

**Response:**
```json
{
  "salario": 108.90,
  "range": {
    "minPax": 8,
    "maxPax": 8,
    "pagoNeto": 90,
    "pagoBruto": 108.90
  }
}
```

**Response Error:**
```json
{
  "code": "not-found",
  "message": "No salary range found for 25 pax"
}
```

---

### 2.3 Generate Monthly Vendor Reports

**Endpoint:** `generateMonthlyVendorReports` (scheduled)

**Schedule:** `0 2 1 * *` (1º día mes 02:00 UTC)

**Propósito:** Generar reportes PDF vendors automáticamente cada mes.

**Trigger:** Cloud Scheduler

**Flujo:**
```typescript
export const generateMonthlyVendorReports = functions.pubsub
  .schedule('0 2 1 * *')
  .timeZone('Europe/Madrid')
  .onRun(async (context) => {
    const lastMonth = moment().subtract(1, 'month').format('YYYY-MM');
    const vendors = await getActiveVendors();
    
    for (const vendor of vendors) {
      // Query vendor_costs del mes
      const costsSnap = await admin.firestore()
        .collection('vendor_costs')
        .where('fecha', '>=', `${lastMonth}-01`)
        .where('fecha', '<=', `${lastMonth}-31`)
        .get();
      
      const vendorCosts = costsSnap.docs.filter(doc =>
        doc.data().vendors.some(v => v.vendorId === vendor.id)
      );
      
      if (vendorCosts.length === 0) continue; // Skip sin actividad
      
      // Calcular totales
      const totalImporte = vendorCosts.reduce((sum, doc) => {
        const vendorItem = doc.data().vendors.find(v => v.vendorId === vendor.id);
        return sum + (vendorItem?.importe || 0);
      }, 0);
      
      // Generar PDF
      const pdfBuffer = await generateVendorReportPDF({
        vendorName: vendor.nombre,
        month: lastMonth,
        tours: vendorCosts.map(doc => ({
          fecha: doc.data().fecha,
          guideName: doc.data().guideName,
          slot: doc.data().slot,
          numPax: doc.data().numPax,
          importe: doc.data().vendors.find(v => v.vendorId === vendor.id).importe
        })),
        totalImporte
      });
      
      // Upload PDF Drive
      const uploadResponse = await uploadReportPDFViaAppsScript({
        vendorId: vendor.id,
        vendorName: vendor.nombre,
        month: lastMonth,
        pdfBase64: pdfBuffer.toString('base64'),
        generatedBy: 'AUTO'
      });
      
      // Guardar registro
      await admin.firestore().collection('vendor_reports').add({
        vendorId: vendor.id,
        vendorName: vendor.nombre,
        month: lastMonth,
        totalImporte,
        totalTours: vendorCosts.length,
        pdfDriveId: uploadResponse.driveFileId,
        generatedBy: 'AUTO',
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        emailSent: false
      });
      
      // Enviar email si tiene
      if (vendor.email) {
        await sendVendorReportEmail(vendor.email, uploadResponse.driveUrl);
        await admin.firestore()
          .collection('vendor_reports')
          .doc(reportRef.id)
          .update({ emailSent: true });
      }
    }
    
    functions.logger.info(`Generated ${vendors.length} vendor reports for ${lastMonth}`);
  });
```

---

### 2.4 Generate Monthly Guide Invoices

**Endpoint:** `generateMonthlyGuideInvoices` (scheduled)

**Schedule:** `0 23 L * *` (Último día mes 23:00 UTC)

**Propósito:** Generar facturas pro-forma guías automáticamente fin de mes.

**Flujo:**
```typescript
export const generateMonthlyGuideInvoices = functions.pubsub
  .schedule('0 23 L * *') // L = último día mes
  .timeZone('Europe/Madrid')
  .onRun(async (context) => {
    const currentMonth = moment().format('YYYY-MM');
    const guides = await getActiveGuides();
    
    for (const guide of guides) {
      // Query vendor_costs del mes
      const costsSnap = await admin.firestore()
        .collection('vendor_costs')
        .where('guideId', '==', guide.id)
        .where('fecha', '>=', `${currentMonth}-01`)
        .where('fecha', '<=', `${currentMonth}-31`)
        .get();
      
      if (costsSnap.empty) continue; // Sin tours este mes
      
      const tours = costsSnap.docs.map(doc => ({
        fecha: doc.data().fecha,
        slot: doc.data().slot,
        tourDescription: doc.data().tourDescription,
        numPax: doc.data().numPax,
        salario: doc.data().salarioCalculado
      }));
      
      const totalSalary = tours.reduce((sum, t) => sum + t.salario, 0);
      const baseImponible = Math.round((totalSalary / 1.21) * 100) / 100;
      const iva = Math.round((baseImponible * 0.21) * 100) / 100;
      
      // Crear factura pro-forma
      const invoiceRef = await admin.firestore().collection('guide_invoices').add({
        invoiceId: `PROFORMA_${guide.id}_${currentMonth}`,
        guideId: guide.id,
        guideName: guide.nombre,
        guideEmail: guide.email,
        guideDni: guide.dni,
        month: currentMonth,
        tours,
        totalSalary,
        baseImponible,
        iva,
        status: 'PENDING_APPROVAL',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Enviar email notificación
      await sendInvoiceNotificationEmail(guide.email, {
        guideName: guide.nombre,
        month: currentMonth,
        totalSalary,
        totalTours: tours.length,
        invoiceUrl: `https://calendar-app-tours.web.app/my-invoices?id=${invoiceRef.id}`
      });
    }
    
    functions.logger.info(`Generated ${guides.length} invoices for ${currentMonth}`);
  });
```

---

### 2.5 Approve Guide Invoice

**Endpoint:** `approveGuideInvoice` (callable)

**Propósito:** Aprobar factura pro-forma con número manual o autogenerado.

**Request:**
```typescript
interface ApproveInvoiceRequest {
  invoiceId: string;
  invoiceNumber?: string;   // Si MANUAL
  useAutoNumber?: boolean;  // Si AUTO
}
```

**Response Success:**
```json
{
  "success": true,
  "invoiceNumber": "SFS-001/25",
  "pdfDriveId": "2eF3gH4iJ5kL6mN",
  "pdfUrl": "https://drive.google.com/file/d/2eF3gH4iJ5kL6mN"
}
```

**Response Error:**
```json
{
  "code": "already-exists",
  "message": "Invoice number SFS-001/25 already used"
}
```

**Validaciones:**
1. Invoice existe y `status === 'PENDING_APPROVAL'`
2. `context.auth.token.guideId === invoice.guideId`
3. Si `useAutoNumber`: guide.invoiceMode !== 'MANUAL'
4. Si `invoiceNumber` manual: formato válido y único para guía

**Flujo:**
```typescript
export const approveGuideInvoice = functions.https.onCall(async (data, context) => {
  // 1. Auth
  if (!context.auth || context.auth.token.role !== 'guide') {
    throw new functions.https.HttpsError('unauthenticated', 'Must be guide');
  }
  
  const guideId = context.auth.token.guideId;
  
  // 2. Get invoice
  const invoiceSnap = await admin.firestore().doc(`guide_invoices/${data.invoiceId}`).get();
  if (!invoiceSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Invoice not found');
  }
  
  const invoice = invoiceSnap.data();
  
  if (invoice.status !== 'PENDING_APPROVAL') {
    throw new functions.https.HttpsError('failed-precondition', 'Invoice already processed');
  }
  
  if (invoice.guideId !== guideId) {
    throw new functions.https.HttpsError('permission-denied', 'Not your invoice');
  }
  
  // 3. Get guide
  const guideSnap = await admin.firestore().doc(`guides/${guideId}`).get();
  const guide = guideSnap.data();
  
  let invoiceNumber: string;
  let invoiceMode: 'AUTO' | 'MANUAL';
  
  // 4. Determinar número factura
  if (data.useAutoNumber) {
    // Validar puede usar auto
    if (guide.invoiceMode === 'MANUAL') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Cannot use auto numbering after manual numbering'
      );
    }
    
    // Generar número
    const nextNumber = (guide.lastInvoiceNumber || 0) + 1;
    const year = new Date().getFullYear().toString().slice(-2);
    invoiceNumber = `SFS-${String(nextNumber).padStart(3, '0')}/${year}`;
    invoiceMode = 'AUTO';
    
    // Actualizar guide
    await admin.firestore().doc(`guides/${guideId}`).update({
      invoiceMode: 'AUTO',
      lastInvoiceNumber: admin.firestore.FieldValue.increment(1)
    });
    
  } else if (data.invoiceNumber) {
    // Validar unicidad
    const existingSnap = await admin.firestore()
      .collection('guide_invoices')
      .where('guideId', '==', guideId)
      .where('invoiceNumber', '==', data.invoiceNumber)
      .limit(1)
      .get();
    
    if (!existingSnap.empty) {
      throw new functions.https.HttpsError(
        'already-exists',
        `Invoice number ${data.invoiceNumber} already used`
      );
    }
    
    invoiceNumber = data.invoiceNumber;
    invoiceMode = 'MANUAL';
    
    // Primera factura manual → bloquear auto
    if (!guide.invoiceMode) {
      await admin.firestore().doc(`guides/${guideId}`).update({
        invoiceMode: 'MANUAL'
      });
    }
    
  } else {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Must provide invoiceNumber or useAutoNumber'
    );
  }
  
  // 5. Generar PDF factura final
  const pdfBuffer = await generateInvoicePDF({
    invoiceNumber,
    guide: {
      nombre: guide.nombre,
      dni: guide.dni,
      direccion: guide.direccion,
      email: guide.email
    },
    month: invoice.month,
    tours: invoice.tours,
    totalSalary: invoice.totalSalary,
    baseImponible: invoice.baseImponible,
    iva: invoice.iva
  });
  
  // 6. Upload PDF Drive
  const uploadResponse = await uploadInvoicePDFViaAppsScript({
    guideId,
    guideName: guide.nombre,
    invoiceNumber,
    month: invoice.month,
    pdfBase64: pdfBuffer.toString('base64')
  });
  
  // 7. Actualizar invoice
  await admin.firestore().doc(`guide_invoices/${data.invoiceId}`).update({
    status: 'APPROVED',
    invoiceNumber,
    pdfDriveId: uploadResponse.driveFileId,
    approvedAt: admin.firestore.FieldValue.serverTimestamp(),
    approvedBy: guideId
  });
  
  // 8. Enviar email confirmación
  await sendInvoiceApprovedEmail(guide.email, {
    guideName: guide.nombre,
    invoiceNumber,
    pdfUrl: uploadResponse.driveUrl
  });
  
  return {
    success: true,
    invoiceNumber,
    pdfDriveId: uploadResponse.driveFileId,
    pdfUrl: uploadResponse.driveUrl
  };
});
```

---

## 3. Helper Functions

### 3.1 Calculate Salary

```typescript
async function calculateSalary(numPax: number): Promise<number> {
  const tableSnap = await admin.firestore()
    .collection('config')
    .doc('salary_table')
    .get();
  
  if (!tableSnap.exists) {
    throw new Error('Salary table not configured');
  }
  
  const table = tableSnap.data();
  const range = table.ranges.find(r =>
    numPax >= r.minPax && numPax <= r.maxPax
  );
  
  if (!range) {
    throw new Error(`No salary range found for ${numPax} pax`);
  }
  
  return range.pagoBruto;
}
```

### 3.2 Fetch Tour Description

```typescript
async function fetchTourDescription(fecha: string, slot: string): Promise<string> {
  const slotTimes = {
    'MAÑANA': '12:00',
    'T1': '17:15',
    'T2': '18:15',
    'T3': '19:15'
  };
  
  const targetTime = slotTimes[slot];
  
  // Llamar Apps Script validateTour (endpoint existente)
  const response = await fetch(`${APPS_SCRIPT_URL}?endpoint=validateTour`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': APPS_SCRIPT_API_KEY
    },
    body: JSON.stringify({ fecha, slot })
  });
  
  if (!response.ok) {
    return 'Tour sin descripción';
  }
  
  const data = await response.json();
  return data.summary || 'Tour sin título';
}
```

---

## 4. Rate Limits y Cuotas

| Servicio | Límite | Estrategia |
|----------|--------|------------|
| Apps Script execution | 6min timeout | Batch max 10 tickets |
| Drive API uploads | 1000/día | Suficiente (60 tours/día) |
| Sheet API writes | 100/min | Apps Script throttling |
| Cloud Functions invocations | 125K/mes free | Monitorear usage |
| Firestore reads | 50K/día free | Caché frontend tabla salarial |
| Firestore writes | 20K/día free | Batch ediciones manager |

---

## 5. Seguridad

**Apps Script:**
- API Key en header (rotación trimestral)
- Ejecutado como service account (no OAuth user)
- CORS: solo dominio `calendar-app-tours.web.app`

**Cloud Functions:**
- Auth context validado cada request
- Role-based: `context.auth.token.role`
- GuideId match en custom claims

**Firestore:**
- Security Rules complementarias
- Cloud Functions bypass Rules (admin SDK)

---

**Fin del documento**