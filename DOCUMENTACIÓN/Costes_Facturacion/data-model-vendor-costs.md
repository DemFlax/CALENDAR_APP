# Data Model - Vendor Costs Module

**Versión:** 1.0  
**Fecha:** 2025-10-15  
**Proyecto:** calendar-app-tours

---

## 1. Diagrama Entidad-Relación

```
┌─────────────────┐
│     guides      │
├─────────────────┤
│ guideId (PK)    │──┐
│ nombre          │  │
│ email           │  │
│ invoiceMode     │  │ 1:N
│ lastInvoiceNum  │  │
└─────────────────┘  │
                     │
                     │
┌─────────────────┐  │    ┌──────────────────┐
│    vendors      │  │    │  vendor_costs    │
├─────────────────┤  │    ├──────────────────┤
│ vendorId (PK)   │──┼───→│ vendorCostId(PK) │
│ nombre          │  │ N:1│ shiftId (FK)     │
│ orden           │  └───→│ guideId (FK)     │
│ estado          │       │ fecha            │
└─────────────────┘       │ numPax           │
                          │ vendors[]        │
                          │ salarioCalculado │
                          │ editHistory[]    │
                          └──────────────────┘
                                   │
                                   │ 1:N
                                   │
                          ┌────────▼─────────┐
                          │ guide_invoices   │
                          ├──────────────────┤
                          │ invoiceId (PK)   │
                          │ guideId (FK)     │
                          │ month            │
                          │ tours[]          │
                          │ totalSalary      │
                          │ invoiceNumber    │
                          └──────────────────┘

┌─────────────────┐
│ vendor_reports  │
├─────────────────┤
│ reportId (PK)   │
│ vendorId (FK)   │──┐
│ month           │  │ N:1
│ totalImporte    │  │
│ pdfDriveId      │  │
└─────────────────┘  │
                     │
                ┌────▼─────┐
                │ vendors  │
                └──────────┘
```

---

## 2. Colecciones Firestore

### 2.1 `vendors`

**Path:** `/vendors/{vendorId}`

**Propósito:** Catálogo vendors (restaurantes/bares) para dropdown formulario.

**Estructura:**
```typescript
interface Vendor {
  vendorId: string;         // Auto-generated doc ID
  nombre: string;           // UNIQUE, max 100 chars
  cif?: string;             // Formato: X12345678, opcional
  direccion?: string;       // max 200 chars
  email?: string;           // RFC 5322 format
  orden: number;            // Para drag & drop, 0-based
  estado: 'activo' | 'inactivo';
  createdAt: FirebaseTimestamp;
  updatedAt: FirebaseTimestamp;
}
```

**Ejemplo:**
```json
{
  "vendorId": "vendor_abc123",
  "nombre": "El Escarpín",
  "cif": "B12345678",
  "direccion": "C/ Mayor 10, Madrid",
  "email": "info@elescarpin.com",
  "orden": 0,
  "estado": "activo",
  "createdAt": "2025-10-15T10:00:00Z",
  "updatedAt": "2025-10-15T10:00:00Z"
}
```

**Índices:**
```javascript
// Composite index
- estado (ASC) + orden (ASC)

// Single field
- nombre (ASC) // Para búsqueda y validación unicidad
```

**Reglas Validación:**
- `nombre` único en colección (case-insensitive)
- `cif` regex: `/^[A-Z]\d{8}$/` si presente
- `email` regex RFC 5322 si presente
- `orden` >= 0

---

### 2.2 `vendor_costs`

**Path:** `/vendor_costs/{vendorCostId}`

**Propósito:** Registro gastos vendors por tour. Vinculado a shift asignado.

**Estructura:**
```typescript
interface VendorCost {
  vendorCostId: string;     // Auto-generated
  shiftId: string;          // FK shifts, formato: YYYY-MM-DD_SLOT
  guideId: string;          // FK guides
  guideName: string;        // Denormalizado para reportes
  fecha: string;            // YYYY-MM-DD
  slot: 'MAÑANA' | 'T1' | 'T2' | 'T3';
  tourDescription: string;  // Fetch desde Calendar API
  numPax: number;           // 1-20
  vendors: VendorItem[];    // Array vendors con importes
  totalVendors: number;     // Sum vendors[].importe
  salarioCalculado: number; // Desde tabla salarial
  editedByManager: boolean; // Default false
  editHistory: EditRecord[];
  createdAt: FirebaseTimestamp;
  updatedAt: FirebaseTimestamp;
}

interface VendorItem {
  vendorId: string;         // FK vendors
  vendorName: string;       // Denormalizado
  importe: number;          // 0.01-999.99, 2 decimales
  driveFileId: string;      // Google Drive file ID ticket
}

interface EditRecord {
  editedAt: FirebaseTimestamp;
  editedBy: string;         // Email manager
  changes: {
    [fieldPath: string]: {
      old: any;
      new: any;
    };
  };
}
```

**Ejemplo:**
```json
{
  "vendorCostId": "vc_xyz789",
  "shiftId": "2025-10-15_T1",
  "guideId": "guide_abc123",
  "guideName": "Juan Pérez",
  "fecha": "2025-10-15",
  "slot": "T1",
  "tourDescription": "Tapas Tour Madrid Centro",
  "numPax": 8,
  "vendors": [
    {
      "vendorId": "vendor_abc123",
      "vendorName": "El Escarpín",
      "importe": 45.50,
      "driveFileId": "1aB2cD3eF4gH5iJ"
    },
    {
      "vendorId": "vendor_def456",
      "vendorName": "Casa Ciriaco",
      "importe": 60.00,
      "driveFileId": "6kL7mN8oP9qR0sT"
    }
  ],
  "totalVendors": 105.50,
  "salarioCalculado": 108.90,
  "editedByManager": false,
  "editHistory": [],
  "createdAt": "2025-10-15T19:30:00Z",
  "updatedAt": "2025-10-15T19:30:00Z"
}
```

**Índices:**
```javascript
// Composite indexes
- guideId (ASC) + fecha (DESC)       // Dashboard guía
- fecha (ASC) + createdAt (DESC)     // Dashboard manager timeline
- shiftId (ASC)                      // Validar no duplicados

// Single field
- editedByManager (ASC)              // Filtro manager
```

**Reglas Validación:**
- `shiftId` único (constraint: 1 vendor_cost por shift)
- `numPax` entre 1-20
- `vendors` array min 1 elemento, max 10
- `vendors[].importe` decimal 2 decimales, rango 0.01-999.99
- `totalVendors` = sum vendors[].importe
- `salarioCalculado` match tabla salarial para `numPax`
- No duplicar `vendorId` dentro de `vendors` array

---

### 2.3 `guide_invoices`

**Path:** `/guide_invoices/{invoiceId}`

**Propósito:** Facturas pro-forma mensuales guías. Generadas automáticamente fin de mes.

**Estructura:**
```typescript
interface GuideInvoice {
  invoiceId: string;        // Formato: PROFORMA_{guideId}_{YYYY-MM}
  guideId: string;          // FK guides
  guideName: string;
  guideEmail: string;
  guideDni: string;
  month: string;            // YYYY-MM
  tours: InvoiceTour[];
  totalSalary: number;      // Sum tours[].salario
  baseImponible: number;    // totalSalary / 1.21
  iva: number;              // baseImponible * 0.21
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'ERROR_REPORTED';
  invoiceNumber?: string;   // Asignado al aprobar (manual o auto)
  pdfDriveId?: string;      // Drive file ID factura final
  createdAt: FirebaseTimestamp;
  approvedAt?: FirebaseTimestamp;
  approvedBy?: string;      // guideId
}

interface InvoiceTour {
  fecha: string;            // YYYY-MM-DD
  slot: string;
  tourDescription: string;
  numPax: number;
  salario: number;
}
```

**Ejemplo:**
```json
{
  "invoiceId": "PROFORMA_guide_abc123_2025-10",
  "guideId": "guide_abc123",
  "guideName": "Juan Pérez",
  "guideEmail": "juan@example.com",
  "guideDni": "12345678A",
  "month": "2025-10",
  "tours": [
    {
      "fecha": "2025-10-15",
      "slot": "T1",
      "tourDescription": "Tapas Tour Centro",
      "numPax": 8,
      "salario": 108.90
    }
  ],
  "totalSalary": 1320.00,
  "baseImponible": 1090.91,
  "iva": 229.09,
  "status": "PENDING_APPROVAL",
  "createdAt": "2025-10-31T23:00:00Z"
}
```

**Post-aprobación:**
```json
{
  "status": "APPROVED",
  "invoiceNumber": "SFS-001/25",
  "pdfDriveId": "7uV8wX9yZ0aB1cD",
  "approvedAt": "2025-11-01T10:30:00Z",
  "approvedBy": "guide_abc123"
}
```

**Índices:**
```javascript
// Composite indexes
- guideId (ASC) + month (DESC)       // Historial guía
- status (ASC) + createdAt (DESC)    // Dashboard manager pending
- month (ASC) + status (ASC)         // Reportes manager por mes

// Single field
- invoiceNumber (ASC)                // Validar unicidad por guía
```

**Reglas Validación:**
- `invoiceId` único
- `month` formato YYYY-MM
- `tours` array min 1 elemento
- `totalSalary` = sum tours[].salario
- `baseImponible` = totalSalary / 1.21 (2 decimales)
- `iva` = baseImponible * 0.21 (2 decimales)
- Si `status === APPROVED` → requiere `invoiceNumber` y `pdfDriveId`

---

### 2.4 `vendor_reports`

**Path:** `/vendor_reports/{reportId}`

**Propósito:** Registro reportes PDF generados por vendor (auto mensual o manual).

**Estructura:**
```typescript
interface VendorReport {
  reportId: string;         // Auto-generated
  vendorId: string;         // FK vendors
  vendorName: string;
  month?: string;           // YYYY-MM (si auto mensual)
  dateRange: {              // Si manual on-demand
    start: string;          // YYYY-MM-DD
    end: string;            // YYYY-MM-DD
  };
  totalImporte: number;     // Sum vendor_costs.vendors[].importe
  totalTours: number;       // Count distinct vendor_costs
  pdfDriveId: string;       // Drive file ID PDF
  generatedBy: 'AUTO' | 'MANUAL';
  generatedByUser?: string; // Email manager (si MANUAL)
  sentAt: FirebaseTimestamp;
  emailSent: boolean;       // true si vendor.email existe y se envió
}
```

**Ejemplo Auto:**
```json
{
  "reportId": "vr_abc123",
  "vendorId": "vendor_abc123",
  "vendorName": "El Escarpín",
  "month": "2025-10",
  "totalImporte": 1250.50,
  "totalTours": 28,
  "pdfDriveId": "8fG9hI0jK1lM2nO",
  "generatedBy": "AUTO",
  "sentAt": "2025-11-01T02:00:00Z",
  "emailSent": true
}
```

**Ejemplo Manual:**
```json
{
  "reportId": "vr_def456",
  "vendorId": "vendor_abc123",
  "vendorName": "El Escarpín",
  "dateRange": {
    "start": "2025-10-01",
    "end": "2025-10-15"
  },
  "totalImporte": 650.00,
  "totalTours": 15,
  "pdfDriveId": "3pQ4rS5tU6vW7xY",
  "generatedBy": "MANUAL",
  "generatedByUser": "madrid@spainfoodsherpas.com",
  "sentAt": "2025-10-16T14:30:00Z",
  "emailSent": false
}
```

**Índices:**
```javascript
// Composite indexes
- vendorId (ASC) + sentAt (DESC)     // Historial vendor
- month (ASC) + generatedBy (ASC)    // Reportes auto por mes
```

---

### 2.5 `config/salary_table`

**Path:** `/config/salary_table`

**Propósito:** Tabla salarial para cálculo automático salario según pax. Documento único.

**Estructura:**
```typescript
interface SalaryTable {
  ranges: SalaryRange[];
  ivaPercent: number;       // 21
  updatedAt: FirebaseTimestamp;
  updatedBy: string;        // Email manager
}

interface SalaryRange {
  minPax: number;
  maxPax: number;
  pagoNeto: number;         // Sin IVA
  pagoBruto: number;        // Con IVA (pagoNeto × 1.21)
}
```

**Ejemplo:**
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
  "ivaPercent": 21,
  "updatedAt": "2025-10-15T10:00:00Z",
  "updatedBy": "madrid@spainfoodsherpas.com"
}
```

**Reglas Validación:**
- `ranges` no vacío
- Rangos no se solapan (maxPax[n] < minPax[n+1])
- `pagoBruto` = `pagoNeto × (1 + ivaPercent/100)` con 2 decimales
- `minPax` <= `maxPax`

---

### 2.6 `guides` (extensión existente)

**Path:** `/guides/{guideId}`

**Campos adicionales para Vendor Costs:**
```typescript
interface Guide {
  // ... campos existentes
  invoiceMode?: 'AUTO' | 'MANUAL';  // null = primera factura
  lastInvoiceNumber?: number;       // Solo si invoiceMode === 'AUTO'
}
```

**Ejemplo:**
```json
{
  "guideId": "guide_abc123",
  "nombre": "Juan Pérez",
  "email": "juan@example.com",
  "dni": "12345678A",
  "invoiceMode": "AUTO",
  "lastInvoiceNumber": 5
}
```

**Lógica numeración:**
- `invoiceMode === null`: Primera factura, elige AUTO o MANUAL
- `invoiceMode === 'AUTO'`: Genera `SFS-{lastInvoiceNumber+1}/{YY}`
- `invoiceMode === 'MANUAL'`: Input libre, valida unicidad

---

## 3. Estructura Google Drive

```
Drive Root/
└── Tickets - Madrid Tours/
    ├── 2025-10-15_T1_eventId123/
    │   ├── El_Escarpin_ticket.jpg
    │   ├── Casa_Ciriaco_ticket.jpg
    │   └── metadata.json
    │
    ├── 2025-10-16_MAÑANA_eventId456/
    │   └── La_Revolcona_ticket.jpg
    │
    └── Reportes Vendors/
        ├── 2025-10/
        │   ├── El_Escarpin.pdf
        │   ├── Casa_Ciriaco.pdf
        │   └── La_Revolcona.pdf
        │
        └── Manual/
            └── El_Escarpin_2025-10-01_2025-10-15.pdf
```

**Permisos:**
- Folder raíz "Tickets - Madrid Tours": Solo manager (owner)
- Subfolders `{shiftId}`: Compartidos con guía específico (viewer)
- Folder "Reportes Vendors": Solo manager
- PDFs individuales: Compartidos con vendor.email si existe

---

## 4. Google Sheet "Tickets - Madrid Food Tours"

**Sheet ID:** Variable entorno `VENDORS_SHEET_ID`

**Estructura:**

| Columna | Tipo | Descripción |
|---------|------|-------------|
| A: Timestamp | DateTime | Auto generado Sheet |
| B: Fecha | Date | vendor_cost.fecha |
| C: Slot | String | vendor_cost.slot |
| D: Guía | String | vendor_cost.guideName |
| E: Pax | Number | vendor_cost.numPax |
| F: Vendor | String | vendors[].vendorName |
| G: Importe | Currency | vendors[].importe |
| H: Ticket URL | URL | `https://drive.google.com/file/d/{driveFileId}` |
| I: Editado | String | "(EDITADO)" si editedByManager |

**Ejemplo filas:**

| Timestamp | Fecha | Slot | Guía | Pax | Vendor | Importe | Ticket URL | Editado |
|-----------|-------|------|------|-----|--------|---------|------------|---------|
| 2025-10-15 19:30 | 15/10/2025 | T1 | Juan Pérez | 8 | El Escarpín | 45.50€ | [Link] | |
| 2025-10-15 19:30 | 15/10/2025 | T1 | Juan Pérez | 8 | Casa Ciriaco | 60.00€ | [Link] | |
| 2025-10-16 14:20 | 16/10/2025 | MAÑANA | María García | 10 | La Revolcona | 50.00€ | [Link] | (EDITADO) |

**Nota:** Apps Script escribe 1 fila por vendor en `vendors` array.

---

## 5. Relaciones y Cardinalidad

```
guides (1) ──< vendor_costs (N)
  - guides.guideId = vendor_costs.guideId

vendors (1) ──< vendor_costs.vendors[] (N)
  - vendors.vendorId = vendor_costs.vendors[].vendorId

guides (1) ──< guide_invoices (N)
  - guides.guideId = guide_invoices.guideId

vendors (1) ──< vendor_reports (N)
  - vendors.vendorId = vendor_reports.vendorId

shifts (1) ──< vendor_costs (0..1)
  - shifts.shiftId = vendor_costs.shiftId
  - Constraint: máx 1 vendor_cost por shift

vendor_costs (N) ──> guide_invoices.tours[] (agregación)
  - Agrupación por guideId + month
```

---

## 6. Constraints y Unicidad

### Constraints PK/Unique
1. `vendors.nombre` → UNIQUE (case-insensitive)
2. `vendor_costs.shiftId` → UNIQUE (1 vendor cost por shift)
3. `guide_invoices.invoiceId` → PK único
4. `guide_invoices.invoiceNumber + guideId` → UNIQUE combinado

### Foreign Keys (soft, validación Cloud Functions)
1. `vendor_costs.guideId` → `guides.guideId` (must exist, estado activo)
2. `vendor_costs.shiftId` → `shifts.shiftId` (must exist, estado ASIGNADO)
3. `vendor_costs.vendors[].vendorId` → `vendors.vendorId` (must exist, estado activo)

### Check Constraints
1. `vendors.orden` >= 0
2. `vendor_costs.numPax` BETWEEN 1 AND 20
3. `vendor_costs.vendors[].importe` BETWEEN 0.01 AND 999.99
4. `vendor_costs.totalVendors` = SUM(vendors[].importe)
5. `guide_invoices.totalSalary` = SUM(tours[].salario)
6. `guide_invoices.baseImponible` = totalSalary / 1.21
7. `guide_invoices.iva` = baseImponible * 0.21

---

## 7. Desnormalización

**Campos desnormalizados para performance:**

| Campo | Origen | Razón |
|-------|--------|-------|
| `vendor_costs.guideName` | `guides.nombre` | Evitar JOIN en queries reportes |
| `vendor_costs.vendors[].vendorName` | `vendors.nombre` | UI lista sin JOIN |
| `guide_invoices.guideName` | `guides.nombre` | PDF factura sin fetch adicional |
| `guide_invoices.guideEmail` | `guides.email` | Email notificación sin fetch |
| `guide_invoices.guideDni` | `guides.dni` | PDF factura sin fetch |
| `vendor_reports.vendorName` | `vendors.nombre` | UI historial sin JOIN |

**Trade-off aceptado:**
- Inconsistencia si cambia `guides.nombre` → vendor_costs mantiene nombre antiguo
- **Decisión:** Histórico correcto (nombre en momento de registro)

---

## 8. Agregaciones

### 8.1 Generación `guide_invoices`

**Query mensual:**
```javascript
const vendorCosts = await db.collection('vendor_costs')
  .where('guideId', '==', guideId)
  .where('fecha', '>=', `${year}-${month}-01`)
  .where('fecha', '<=', `${year}-${month}-${lastDay}`)
  .get();

const totalSalary = vendorCosts.docs.reduce((sum, doc) => 
  sum + doc.data().salarioCalculado, 0
);

const tours = vendorCosts.docs.map(doc => ({
  fecha: doc.data().fecha,
  slot: doc.data().slot,
  tourDescription: doc.data().tourDescription,
  numPax: doc.data().numPax,
  salario: doc.data().salarioCalculado
}));
```

### 8.2 Generación `vendor_reports`

**Query por vendor + rango:**
```javascript
const vendorCosts = await db.collection('vendor_costs')
  .where('fecha', '>=', startDate)
  .where('fecha', '<=', endDate)
  .get();

const filtered = vendorCosts.docs
  .filter(doc => doc.data().vendors.some(v => v.vendorId === vendorId));

const totalImporte = filtered.reduce((sum, doc) => {
  const vendorItem = doc.data().vendors.find(v => v.vendorId === vendorId);
  return sum + (vendorItem?.importe || 0);
}, 0);
```

---

## 9. Migraciones y Versionado

**Schema version:** v1.0

**Estrategia migraciones futuras:**
1. Añadir campo `schemaVersion: 1` en docs nuevos
2. Cloud Function background migration para docs existentes
3. Código soporta múltiples versiones durante transición
4. Validaciones estrictas en escritura, flexibles en lectura

**Ejemplo migración futura (v2):**
```javascript
// Si añadimos campo "tipo" en vendors
if (!doc.data().schemaVersion || doc.data().schemaVersion < 2) {
  await doc.ref.update({
    tipo: 'restaurante', // default
    schemaVersion: 2
  });
}
```

---

## 10. Estimación Storage

**Proyección 1 año:**
- **vendor_costs:** 60 tours/mes × 12 meses = 720 docs
  - Tamaño promedio: 2KB (con arrays vendors, editHistory)
  - Total: 1.4MB
  
- **guide_invoices:** 10 guías × 12 meses = 120 docs
  - Tamaño promedio: 3KB (array tours)
  - Total: 360KB
  
- **vendor_reports:** 5 vendors × 12 meses auto + 50 manuales = 110 docs
  - Tamaño promedio: 1KB
  - Total: 110KB

- **Drive tickets:** 60 tours/mes × 3 vendors avg × 500KB/foto × 12 meses = 10.8GB
  - Comprimidos 80%: ~8.6GB

**Total Firestore:** ~2MB/año  
**Total Drive:** ~8.6GB/año  

**Dentro de límites Workspace Business (ilimitado)** ✅

---

**Fin del documento**