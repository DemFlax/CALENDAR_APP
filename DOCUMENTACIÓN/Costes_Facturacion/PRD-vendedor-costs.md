# Product Requirements Document
## Vendor Costs Module - Madrid Tours

**Versión:** 1.0  
**Fecha:** 2025-10-15  
**Estado:** Aprobado  
**Owner:** PMO Director Técnico

---

## 1. Resumen Ejecutivo

### 1.1 Objetivo
Módulo para registro, auditoría y facturación de costes por vendedor (restaurantes/bares) en tours de Madrid. Sustituye flujo manual Google Forms por integración nativa en la aplicación.

### 1.2 Problema a Resolver
- Registro manual desconectado del sistema principal
- Sin validación automática contra tours asignados
- Cálculo salario guías manual
- Facturación mensual manual
- Reportes vendors por hoja de cálculo

### 1.3 KPIs de Éxito
1. **Eficiencia:** 100% vendor costs vinculados a tours reales
2. **Auditoría:** Tickets almacenados estructurados en Drive
3. **Automatización:** Facturas pro-forma generadas automáticamente fin de mes
4. **Precisión:** 0 errores cálculo salario guías

---

## 2. Alcance del Módulo

### 2.1 En Alcance
- ✅ CRUD Vendors (manager)
- ✅ Formulario vendor costs vinculado a tour (guías)
- ✅ Upload tickets a Drive (una foto por vendor)
- ✅ Registro automático en Google Sheet Madrid
- ✅ Cálculo automático salario según tabla pax
- ✅ Reportes vendors (auto mensual + manual on-demand)
- ✅ Generación facturas pro-forma guías (auto fin de mes)
- ✅ Aprobación facturas guías con número personalizado/autogenerado
- ✅ Edición vendor costs por manager (auditoría)

### 2.2 Fuera de Alcance MVP
- ❌ OCR validación importes tickets
- ❌ Integración contabilidad externa
- ❌ Notificaciones push facturas pendientes
- ❌ Exportación masiva datos
- ❌ Multi-ciudad (solo Madrid)

---

## 3. Usuarios y Roles

### 3.1 Guía
**Permisos vendor costs:**
- Registrar vendor costs de tours asignados propios
- Subir tickets (uno por vendor)
- Ver historial vendor costs propios
- Ver facturas pro-forma propias
- Aprobar facturas con número personalizado/autogenerado

**Restricciones:**
- Solo puede registrar vendor costs de shifts en estado ASIGNADO con guiaId = propio
- No puede ver vendor costs de otros guías
- No puede editar vendor costs después de 24h
- No puede eliminar vendor costs

### 3.2 Manager
**Permisos vendor costs:**
- CRUD Vendors con drag & drop orden
- Ver todos los vendor costs (todos los guías)
- Editar cualquier vendor cost (sin límite temporal)
- Generar reportes vendors on-demand
- Ver facturas pro-forma todos los guías
- Gestionar configuración tabla salarial

**Restricciones:**
- No puede aprobar facturas pro-forma en nombre del guía

---

## 4. Requisitos Funcionales

### RF-VC-01: CRUD Vendors (Manager)

#### RF-VC-01.1: Crear Vendor
**Input:**
- Nombre (requerido, único)
- CIF (opcional)
- Dirección (opcional)
- Email (opcional)
- Estado: activo/inactivo (default: activo)

**Proceso:**
1. Validar nombre único en colección `vendors`
2. Crear documento Firestore
3. Asignar orden al final de la lista

**Validaciones:**
- Nombre máximo 100 caracteres
- CIF formato español opcional (letra + 8 dígitos)
- Email formato RFC 5322

#### RF-VC-01.2: Editar Vendor
**Campos editables:** Todos

**Validación:** Nombre debe seguir siendo único

#### RF-VC-01.3: Eliminar Vendor (Soft Delete)
**Proceso:**
1. Marcar estado "inactivo"
2. Mantener historial vendor costs existentes
3. Excluir de dropdown formulario vendor costs

**Restricción:** No elimina físicamente el documento

#### RF-VC-01.4: Reordenar Vendors (Drag & Drop)
**Proceso:**
1. Manager arrastra vendor a nueva posición
2. Actualizar campo `orden` en Firestore batch
3. Reflejar cambio en dropdown formulario guías

**Lógica orden:**
- Vendors activos ordenados por campo `orden` (ascending)
- Vendors inactivos no aparecen en dropdown

---

### RF-VC-02: Registro Vendor Costs (Guía)

#### RF-VC-02.1: Visualizar Formulario
**Ubicación:** `/tour-details` debajo de cards guests

**Trigger:** Guía accede a tour-details de shift ASIGNADO propio

**Componente:** Sección colapsable "Vendor Costs"

**Campos:**
- Fecha tour (readonly, prellenado desde shift)
- Slot (readonly, prellenado: MAÑANA/T1/T2/T3)
- Descripción tour (readonly, fetch desde Calendar API)
- Número pax (requerido, numérico 1-20)
- Vendors (dinámico, múltiple):
  - Dropdown vendor (solo activos, ordenados por `orden`)
  - Importe € (requerido, decimal 0.01-999.99)
  - Botón upload foto ticket (obligatorio, 1 por vendor)

**Validaciones pre-submit:**
- ✅ Al menos 1 vendor con importe > 0
- ✅ Cada vendor seleccionado tiene foto ticket
- ✅ Número pax entre 1-20
- ✅ No duplicar vendors en mismo registro

#### RF-VC-02.2: Validaciones Backend

**Validación crítica:**
```javascript
// Cloud Function: validateVendorCostSubmission
- shiftId existe en Firestore shifts
- shift.estado === "ASIGNADO"
- shift.guiaId === auth.uid (custom claim guideId)
- shift.fecha >= hoy - 7 días (máximo 7 días retroactivo)
- No existe vendor_cost previo para mismo shiftId
```

**Si falla validación:**
- Error 403 "No autorizado para este turno"
- No se crea documento Firestore
- No se suben archivos Drive

#### RF-VC-02.3: Proceso Upload Tickets

**Flow:**
1. Guía selecciona imágenes (jpg/png/heic, max 5MB cada una)
2. Frontend comprime si >2MB (quality 0.8)
3. POST a Cloud Function con:
   ```json
   {
     "shiftId": "2025-10-15_T1",
     "guideId": "abc123",
     "numPax": 8,
     "vendors": [
       {
         "vendorId": "vendor1",
         "importe": 45.50,
         "ticketBase64": "data:image/jpeg;base64,..."
       }
     ]
   }
   ```

4. Cloud Function llama Apps Script:
   ```javascript
   // Apps Script: uploadVendorTickets
   function doPost(e) {
     const payload = JSON.parse(e.postData.contents);
     const folderId = getOrCreateTourFolder(payload.shiftId);
     
     payload.vendors.forEach(v => {
       const blob = Utilities.newBlob(
         Utilities.base64Decode(v.ticketBase64.split(',')[1]),
         'image/jpeg',
         `${v.vendorName}_ticket.jpg`
       );
       
       const file = DriveApp.getFolderById(folderId).createFile(blob);
       v.driveFileId = file.getId();
     });
     
     return ContentService.createTextOutput(JSON.stringify({
       success: true,
       driveUrls: payload.vendors.map(v => v.driveFileId)
     }));
   }
   ```

5. Cloud Function crea documento Firestore:
   ```javascript
   // Colección: vendor_costs/{vendorCostId}
   {
     vendorCostId: "auto-generated",
     shiftId: "2025-10-15_T1",
     guideId: "abc123",
     guideName: "Juan Pérez",
     fecha: "2025-10-15",
     slot: "T1",
     tourDescription: "Tapas Tour Centro",
     numPax: 8,
     vendors: [
       {
         vendorId: "vendor1",
         vendorName: "El Escarpín",
         importe: 45.50,
         driveFileId: "1aB2cD3eF"
       }
     ],
     totalVendors: 45.50,
     salarioCalculado: 90.00, // según tabla pax
     createdAt: Timestamp,
     updatedAt: Timestamp,
     editedByManager: false
   }
   ```

6. Apps Script escribe en Sheet:
   ```javascript
   // Sheet: "Tickets - Madrid Food Tours"
   // Columnas: Fecha | Slot | Guía | Pax | Vendor | Importe | Ticket URL
   function appendToSheet(data) {
     const sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();
     data.vendors.forEach(v => {
       sheet.appendRow([
         data.fecha,
         data.slot,
         data.guideName,
         data.numPax,
         v.vendorName,
         v.importe,
         `https://drive.google.com/file/d/${v.driveFileId}`
       ]);
     });
   }
   ```

**Estructura Drive:**
```
Drive/
├── Tickets - Madrid Tours/
    ├── 2025-10-15_T1_eventId123/
    │   ├── El_Escarpin_ticket.jpg
    │   ├── Casa_Ciriaco_ticket.jpg
    │   └── metadata.json
    └── 2025-10-16_MAÑANA_eventId456/
```

---

### RF-VC-03: Cálculo Automático Salario

**Tabla Salarial (Firestore: config/salary_table):**
```json
{
  "ranges": [
    { "minPax": 1, "maxPax": 4, "pagoNeto": 70, "pagoBruto": 84.70 },
    { "minPax": 5, "maxPax": 5, "pagoNeto": 75, "pagoBruto": 90.75 },
    { "minPax": 6, "maxPax": 6, "pagoNeto": 80, "pagoBruto": 96.80 },
    { "minPax": 7, "maxPax": 7, "pagoNeto": 85, "pagoBruto": 102.85 },
    { "minPax": 8, "maxPax": 8, "pagoNeto": 90, "pagoBruto": 108.90 },
    { "minPax": 9, "maxPax": 9, "pagoNeto": 95, "pagoBruto": 114.95 },
    { "minPax": 10, "maxPax": 10, "pagoNeto": 100, "pagoBruto": 121.00 },
    { "minPax": 11, "maxPax": 11, "pagoNeto": 105, "pagoBruto": 127.05 },
    { "minPax": 12, "maxPax": 20, "pagoNeto": 110, "pagoBruto": 133.10 }
  ],
  "ivaPercent": 21
}
```

**Lógica:**
```javascript
function calculateSalary(numPax) {
  const table = await db.collection('config').doc('salary_table').get();
  const range = table.data().ranges.find(r => 
    numPax >= r.minPax && numPax <= r.maxPax
  );
  return range ? range.pagoBruto : 0;
}
```

**Actualización tabla:**
- Manager puede editar desde dashboard config
- Cambios NO retroactivos (solo aplican a nuevos vendor costs)

---

### RF-VC-04: Edición Vendor Costs (Manager)

**Acceso:** Dashboard manager, sección "Vendor Costs" con tabla todos los registros

**Campos editables:**
- numPax → recalcula salario automáticamente
- Vendors (añadir/eliminar/editar importes)
- Tickets (reemplazar archivos Drive)

**Proceso edición:**
1. Manager hace clic "Editar" en fila vendor cost
2. Modal con formulario prellenado
3. Cambios → `editedByManager: true`, `updatedAt: Timestamp`
4. Si cambia numPax → recalcula `salarioCalculado`
5. Si cambia vendors → actualiza Sheet (append fila con nota "EDITADO")

**Auditoría:**
- Campo `editHistory` (array):
  ```json
  {
    "editHistory": [
      {
        "editedAt": Timestamp,
        "editedBy": "manager@spainfoodsherpas.com",
        "changes": {
          "numPax": { "old": 8, "new": 10 },
          "vendors[0].importe": { "old": 45.50, "new": 50.00 }
        }
      }
    ]
  }
  ```

---

### RF-VC-05: Reportes Vendors

#### RF-VC-05.1: Generación Automática Mensual

**Trigger:** Cloud Function scheduled 1º día mes 02:00 UTC

**Proceso:**
```javascript
// Cloud Function: generateMonthlyVendorReports
exports.generateMonthlyVendorReports = functions.pubsub
  .schedule('0 2 1 * *') // 1º día mes 02:00 UTC
  .onRun(async (context) => {
    const lastMonth = getLastMonth(); // YYYY-MM
    const vendors = await getActiveVendors();
    
    for (const vendor of vendors) {
      const costs = await getVendorCosts(vendor.id, lastMonth);
      const report = generateReport(vendor, costs, lastMonth);
      
      // Guardar PDF en Drive
      const pdfId = await uploadReportToDrive(report);
      
      // Enviar email si tiene email
      if (vendor.email) {
        await sendVendorReportEmail(vendor, pdfId);
      }
      
      // Log en Firestore
      await db.collection('vendor_reports').add({
        vendorId: vendor.id,
        month: lastMonth,
        totalImporte: costs.reduce((sum, c) => sum + c.importe, 0),
        pdfDriveId: pdfId,
        sentAt: Timestamp
      });
    }
  });
```

**Formato reporte PDF:**
```
REPORTE VENDOR - [Nombre Vendor]
Mes: Octubre 2025

Fecha      | Guía          | Tour      | Pax | Importe
-----------|---------------|-----------|-----|--------
2025-10-15 | Juan Pérez    | T1        | 8   | 45.50€
2025-10-18 | María García  | MAÑANA    | 12  | 60.00€
...

TOTAL MES: 345.50€

Link tickets: [URL Drive folder]
```

#### RF-VC-05.2: Generación Manual On-Demand

**Acceso:** Dashboard manager, sección "Vendors" → botón "Generar Reporte"

**Input:**
- Vendor (dropdown)
- Fecha inicio (date)
- Fecha fin (date)

**Proceso:**
1. Validar fecha inicio < fecha fin
2. Query Firestore vendor_costs filtrado por vendor + rango fechas
3. Generar PDF idéntico formato auto
4. Descargar directo navegador (no enviar email)

**Límite:** Máximo 1 año rango fechas

---

### RF-VC-06: Facturas Pro-Forma Guías

#### RF-VC-06.1: Generación Automática Fin de Mes

**Trigger:** Cloud Function scheduled último día mes 23:00 UTC

**Proceso:**
```javascript
// Cloud Function: generateGuideInvoices
exports.generateGuideInvoices = functions.pubsub
  .schedule('0 23 L * *') // Último día mes 23:00 UTC
  .onRun(async (context) => {
    const currentMonth = getCurrentMonth(); // YYYY-MM
    const guides = await getActiveGuides();
    
    for (const guide of guides) {
      const costs = await getVendorCosts(guide.id, currentMonth);
      
      if (costs.length === 0) continue; // No tours este mes
      
      const totalSalary = costs.reduce((sum, c) => sum + c.salarioCalculado, 0);
      const invoice = {
        invoiceId: `PROFORMA_${guide.id}_${currentMonth}`,
        guideId: guide.id,
        guideName: guide.nombre,
        guideEmail: guide.email,
        month: currentMonth,
        tours: costs.map(c => ({
          fecha: c.fecha,
          slot: c.slot,
          tourDescription: c.tourDescription,
          numPax: c.numPax,
          salario: c.salarioCalculado
        })),
        totalSalary,
        status: "PENDING_APPROVAL",
        invoiceNumber: null, // Guía lo asigna
        createdAt: Timestamp
      };
      
      await db.collection('guide_invoices').add(invoice);
      
      // Enviar email notificación
      await sendInvoiceNotificationEmail(guide, invoice.invoiceId);
    }
  });
```

**Email notificación:**
```
Asunto: Factura Octubre 2025 lista para revisión

Hola Juan,

Tu factura pro-forma del mes de Octubre 2025 está lista.

Total a facturar: 360.00€ (12 tours)

Accede a tu dashboard para revisarla y asignar número de factura:
https://calendar-app-tours.web.app/my-invoices

Saludos,
Spain Food Sherpas
```

#### RF-VC-06.2: Visualización Factura Guía

**Acceso:** Dashboard guía, nueva sección "Mis Facturas"

**Vista factura:**
```
FACTURA PRO-FORMA - Octubre 2025
Estado: Pendiente de aprobación

Guía: Juan Pérez
Email: juan@example.com
DNI: 12345678A

Detalle tours:
Fecha      | Slot    | Descripción      | Pax | Salario
-----------|---------|------------------|-----|--------
2025-10-15 | T1      | Tapas Centro     | 8   | 90.00€
2025-10-18 | MAÑANA  | Gastro Tour      | 12  | 110.00€
...

TOTAL: 360.00€ (IVA incluido 21%)
```

#### RF-VC-06.3: Aprobación y Numeración Factura

**Flow:**
1. Guía revisa datos (pax, salarios, total)
2. Si hay error → botón "Reportar error" (email manager)
3. Si OK → sección "Número de factura":
   - Opción A: Input manual (placeholder: "2025/001")
   - Opción B: Botón "Autogenerar" → formato `SFS-XXX/YY`

**Lógica autogeneración:**
```javascript
// Firestore: guides/{guideId}
{
  invoiceMode: "MANUAL" | "AUTO",
  lastInvoiceNumber: 5, // Solo si mode === "AUTO"
}

// Si mode === "MANUAL" → botón "Autogenerar" disabled
// Si mode === "AUTO" → incrementa lastInvoiceNumber + 1

function generateInvoiceNumber(guide) {
  if (guide.invoiceMode === "MANUAL") {
    throw new Error("No puede autogenerar, debe usar numeración manual");
  }
  
  const nextNumber = (guide.lastInvoiceNumber || 0) + 1;
  const year = new Date().getFullYear().toString().slice(-2);
  
  return `SFS-${String(nextNumber).padStart(3, '0')}/${year}`;
}
```

**Validaciones:**
- Si elige manual 1 vez → `invoiceMode = "MANUAL"` permanente
- No puede volver a AUTO después
- Número manual debe ser único para ese guía

4. Submit → actualiza Firestore:
   ```json
   {
     "status": "APPROVED",
     "invoiceNumber": "SFS-001/25",
     "approvedAt": Timestamp,
     "approvedBy": "guideId"
   }
   ```

5. Genera PDF final y envía email confirmación

**PDF final:**
```
FACTURA N.º SFS-001/25
Fecha: 01/11/2025

EMISOR:
Juan Pérez
DNI: 12345678A
Dirección: C/ Mayor 1, Madrid

RECEPTOR:
Spain Food Sherpas S.L.
CIF: B12345678
C/ Gran Vía 10, Madrid

CONCEPTO: Servicios guía tours gastronómicos Octubre 2025

Detalle:
[Tabla tours igual que pro-forma]

BASE IMPONIBLE: 297.52€
IVA (21%): 62.48€
TOTAL FACTURA: 360.00€
```

---

## 5. Modelo de Datos Firestore

### 5.1 Colección `vendors`

**Path:** `/vendors/{vendorId}`

```json
{
  "nombre": "string (único)",
  "cif": "string | null",
  "direccion": "string | null",
  "email": "string | null",
  "orden": "number (para drag & drop)",
  "estado": "activo | inactivo",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

**Índices:**
- `estado` (ascending), `orden` (ascending)

---

### 5.2 Colección `vendor_costs`

**Path:** `/vendor_costs/{vendorCostId}`

```json
{
  "vendorCostId": "string (auto-generated)",
  "shiftId": "string (FK shifts)",
  "guideId": "string (FK guides)",
  "guideName": "string",
  "fecha": "YYYY-MM-DD",
  "slot": "MAÑANA | T1 | T2 | T3",
  "tourDescription": "string (from Calendar API)",
  "numPax": "number (1-20)",
  "vendors": [
    {
      "vendorId": "string (FK vendors)",
      "vendorName": "string",
      "importe": "number (decimal)",
      "driveFileId": "string (Drive file ID)"
    }
  ],
  "totalVendors": "number (sum importes)",
  "salarioCalculado": "number (from tabla salarial)",
  "editedByManager": "boolean",
  "editHistory": [
    {
      "editedAt": "timestamp",
      "editedBy": "string (email)",
      "changes": "object"
    }
  ],
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

**Índices compuestos:**
- `guideId` (ascending), `fecha` (descending)
- `fecha` (ascending), `createdAt` (descending)
- `shiftId` (ascending) - para validar no duplicados

---

### 5.3 Colección `guide_invoices`

**Path:** `/guide_invoices/{invoiceId}`

```json
{
  "invoiceId": "string",
  "guideId": "string (FK guides)",
  "guideName": "string",
  "guideEmail": "string",
  "month": "YYYY-MM",
  "tours": [
    {
      "fecha": "YYYY-MM-DD",
      "slot": "string",
      "tourDescription": "string",
      "numPax": "number",
      "salario": "number"
    }
  ],
  "totalSalary": "number",
  "status": "PENDING_APPROVAL | APPROVED | ERROR_REPORTED",
  "invoiceNumber": "string | null",
  "pdfDriveId": "string | null",
  "createdAt": "timestamp",
  "approvedAt": "timestamp | null",
  "approvedBy": "string | null"
}
```

**Índices:**
- `guideId` (ascending), `month` (descending)
- `status` (ascending), `createdAt` (descending)

---

### 5.4 Colección `vendor_reports`

**Path:** `/vendor_reports/{reportId}`

```json
{
  "reportId": "string (auto-generated)",
  "vendorId": "string (FK vendors)",
  "vendorName": "string",
  "month": "YYYY-MM",
  "dateRange": {
    "start": "YYYY-MM-DD",
    "end": "YYYY-MM-DD"
  },
  "totalImporte": "number",
  "totalTours": "number",
  "pdfDriveId": "string",
  "generatedBy": "AUTO | MANUAL",
  "generatedByUser": "string (email) | null",
  "sentAt": "timestamp",
  "emailSent": "boolean"
}
```

---

### 5.5 Colección `config` (tabla salarial)

**Path:** `/config/salary_table`

```json
{
  "ranges": [
    {
      "minPax": 1,
      "maxPax": 4,
      "pagoNeto": 70,
      "pagoBruto": 84.70
    }
  ],
  "ivaPercent": 21,
  "updatedAt": "timestamp",
  "updatedBy": "string (email manager)"
}
```

---

## 6. Integraciones

### 6.1 Google Drive API (Apps Script)

**Operaciones:**
- `uploadVendorTickets`: Subir imágenes tickets
- `getOrCreateTourFolder`: Crear estructura folders
- `uploadReportPDF`: Guardar reportes vendors
- `uploadInvoicePDF`: Guardar facturas guías

**Autenticación:** Apps Script ejecutado como madrid@spainfoodsherpas (Workspace)

**Permisos:**
- Drive: read/write scope
- Folder raíz: "Tickets - Madrid Tours" (ID en env)

---

### 6.2 Google Sheets API (Apps Script)

**Operaciones:**
- `appendVendorCost`: Escribir fila en Sheet Madrid
- `appendEditNote`: Añadir nota edición manager

**Sheet ID:** Variable entorno `VENDORS_SHEET_ID`

**Estructura Sheet:**
| Fecha | Slot | Guía | Pax | Vendor | Importe | Ticket URL | Editado |
|-------|------|------|-----|--------|---------|------------|---------|

---

### 6.3 Google Calendar API

**Operación:**
- Fetch `summary` evento para `tourDescription`

**Uso:**
- Al registrar vendor cost, obtener descripción tour desde Calendar

---

## 7. Security Rules Firestore

```javascript
// vendors
match /vendors/{vendorId} {
  allow read: if isAuthenticated();
  allow create, update, delete: if isManager();
}

// vendor_costs
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

// guide_invoices
match /guide_invoices/{invoiceId} {
  allow read: if isManager() || 
                 (isGuide() && resource.data.guideId == request.auth.token.guideId);
  
  allow update: if isGuide() && 
                   resource.data.guideId == request.auth.token.guideId &&
                   resource.data.status == "PENDING_APPROVAL" &&
                   request.resource.data.status == "APPROVED";
  
  allow create, delete: if false; // Solo Cloud Functions
}

// vendor_reports
match /vendor_reports/{reportId} {
  allow read: if isManager();
  allow write: if false; // Solo Cloud Functions
}

// config
match /config/{docId} {
  allow read: if isAuthenticated();
  allow write: if isManager();
}
```

---

## 8. Validaciones y Restricciones

### 8.1 Validaciones Frontend

**Formulario vendor costs:**
- ✅ numPax: número entero 1-20
- ✅ Al menos 1 vendor con importe > 0
- ✅ Importes: decimal máx 2 decimales, rango 0.01-999.99
- ✅ Cada vendor tiene foto ticket (<5MB, jpg/png/heic)
- ✅ No duplicar vendors en mismo registro
- ✅ Fecha tour <= hoy (no registrar futuro)

**Aprobación factura:**
- ✅ Si mode MANUAL: input número requerido
- ✅ Si mode AUTO: botón autogenerar enabled
- ✅ Número factura único para ese guía

### 8.2 Validaciones Backend (Cloud Functions)

**registerVendorCost:**
```javascript
- shiftId existe y estado === "ASIGNADO"
- shift.guideId === request.auth.token.guideId
- fecha tour entre hoy-7 días y hoy
- No existe vendor_cost previo para shiftId
- Todos vendorIds existen y están activos
- Drive upload exitoso antes de crear Firestore doc
```

**approveInvoice:**
```javascript
- Invoice status === "PENDING_APPROVAL"
- request.auth.token.guideId === invoice.guideId
- Si mode AUTO: genera número SFS-XXX/YY
- Si mode MANUAL: valida formato y unicidad
```

---

## 9. Flujos de Usuario

### 9.1 Guía Registra Vendor Costs

```
1. Guía accede /tour-details de shift ASIGNADO propio
2. Expande sección "Vendor Costs"
3. Ve campos prellenados: fecha, slot, descripción tour
4. Ingresa número pax: 8
5. Añade vendors:
   - Dropdown: "El Escarpín" → Importe: 45.50€ → Upload foto
   - Dropdown: "Casa Ciriaco" → Importe: 60.00€ → Upload foto
6. Submit → Validación frontend OK
7. Cloud Function:
   - Valida shift asignado
   - Sube tickets a Drive
   - Calcula salario: 8 pax = 90.00€
   - Crea doc Firestore vendor_costs
   - Apps Script escribe Sheet
8. Guía ve confirmación "Vendor costs registrados correctamente"
9. Ya no puede editar (después de 24h)
```

### 9.2 Manager Genera Reporte Vendor On-Demand

```
1. Manager accede dashboard "Vendors"
2. Click botón "Generar Reporte" en fila vendor
3. Modal:
   - Fecha inicio: 2025-10-01
   - Fecha fin: 2025-10-15
4. Submit
5. Cloud Function:
   - Query vendor_costs filtrado vendor + rango
   - Genera PDF
   - Retorna blob PDF
6. Manager descarga PDF en navegador
```

### 9.3 Guía Aprueba Factura Pro-Forma

```
1. Guía recibe email "Factura Octubre 2025 lista"
2. Accede /my-invoices
3. Ve factura PENDING_APPROVAL
4. Click "Ver detalle"
5. Revisa tours y total: 360.00€ (correcto)
6. Elige numeración:
   - Opción A: Escribe "2025/003" → Submit
     → guide.invoiceMode = "MANUAL" permanente
   - Opción B: Click "Autogenerar"
     → Sistema genera "SFS-001/25"
     → guide.invoiceMode = "AUTO", lastInvoiceNumber++
7. Cloud Function:
   - Actualiza invoice status = "APPROVED"
   - Genera PDF final
   - Sube a Drive
   - Envía email confirmación con PDF adjunto
8. Guía ve "Factura aprobada correctamente"
```

---

## 10. Estimación de Esfuerzo

### 10.1 Breakdown Tareas

| Tarea | Horas |
|-------|-------|
| **Setup Drive/Sheet APIs** | 3h |
| - Configurar Apps Script permisos | 1h |
| - Crear Sheet template Madrid | 0.5h |
| - Testing upload Drive | 1h |
| - Testing escritura Sheet | 0.5h |
| **CRUD Vendors (Frontend + Backend)** | 6h |
| - Formulario crear/editar vendor | 2h |
| - Drag & drop reordenar | 2h |
| - Cloud Function validaciones | 1h |
| - Testing E2E | 1h |
| **Formulario Vendor Costs (Guía)** | 10h |
| - UI tour-details sección colapsable | 2h |
| - Formulario dinámico vendors | 3h |
| - Upload fotos + compresión | 2h |
| - Validaciones frontend | 1h |
| - Cloud Function registerVendorCost | 2h |
| **Cálculo Salario + Tabla Config** | 4h |
| - CRUD tabla salarial manager | 2h |
| - Lógica cálculo en Cloud Function | 1h |
| - Testing edge cases | 1h |
| **Edición Vendor Costs (Manager)** | 5h |
| - UI tabla vendor costs con filtros | 2h |
| - Modal edición | 2h |
| - Auditoría editHistory | 1h |
| **Reportes Vendors** | 8h |
| - Cloud Function auto mensual | 3h |
| - Generación PDF template | 2h |
| - UI generación manual manager | 2h |
| - Testing envío emails | 1h |
| **Facturas Pro-Forma Guías** | 12h |
| - Cloud Function auto fin mes | 3h |
| - UI /my-invoices guía | 3h |
| - Lógica numeración AUTO/MANUAL | 2h |
| - Generación PDF factura final | 2h |
| - Testing aprobación flow | 2h |
| **Security Rules + Testing** | 4h |
| **Documentación + Runbooks** | 2h |
| **Buffer 10%** | 5.4h |
| **TOTAL** | **59.4h ≈ 60h** |

### 10.2 Sprints Propuestos

**Sprint 1 (15h):** Setup + CRUD Vendors + Tabla Salarial  
**Sprint 2 (20h):** Formulario Vendor Costs + Edición Manager  
**Sprint 3 (15h):** Reportes Vendors  
**Sprint 4 (10h):** Facturas Pro-Forma + QA final

---

## 11. Criterios de Aceptación MVP

- ✅ Manager crea/edita/reordena vendors con drag & drop
- ✅ Guía registra vendor costs desde tour-details
- ✅ Tickets suben a Drive estructura organizada
- ✅ Sheet Madrid se actualiza automáticamente
- ✅ Salario calcula correctamente según tabla pax
- ✅ Manager puede editar cualquier vendor cost
- ✅ Reportes vendors se generan automáticamente cada mes
- ✅ Manager puede generar reporte manual on-demand
- ✅ Facturas pro-forma se generan automáticamente fin de mes
- ✅ Guías aprueban facturas con número personalizado/auto
- ✅ 0 errores en Security Rules

---

## 12. Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Drive quota limits (15GB Workspace) | Media | Alto | Comprimir imágenes 80% quality, archivar mensual |
| Apps Script timeout (6min) | Baja | Medio | Batch uploads, reintentos exponenciales |
| Guías olvidan registrar vendor costs | Media | Alto | Email reminder semanal tours sin vendor costs |
| Discrepancias salario calculado | Baja | Alto | Testing exhaustivo tabla salarial, auditoría manager |
| Duplicados vendor costs | Baja | Medio | Validación shiftId único en Firestore Rules |

---

## 13. Métricas Post-Launch

- **Cobertura:** % tours con vendor costs registrados
- **Latencia:** p95 tiempo upload tickets
- **Errores:** Tasa fallos Drive/Sheet API
- **Adopción:** % guías aprueban facturas <7 días
- **Auditoría:** % vendor costs editados por manager

---

**Fin del documento**