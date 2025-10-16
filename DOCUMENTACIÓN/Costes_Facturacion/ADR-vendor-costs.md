# Architecture Decision Records - Vendor Costs Module

**Versión:** 1.0  
**Fecha:** 2025-10-15  
**Proyecto:** calendar-app-tours

---

## ADR-VC-001: Storage Tickets - Firebase Storage vs Google Drive

**Estado:** Aprobado  
**Fecha:** 2025-10-15  
**Decisores:** Director Técnico, PMO

### Contexto
Necesitamos almacenar ~1800 fotos/mes de tickets de vendors con estructura organizada y acceso controlado.

### Opciones Consideradas

#### Opción 1: Firebase Storage
**Pros:**
- Integración nativa Firebase SDK
- Security Rules declarativas (guía solo ve sus tickets)
- URLs estructuradas: `gs://bucket/{tourId}/{vendorId}/ticket.jpg`
- Cloud Functions trigger `onFinalize` para compresión automática
- Stack homogéneo (menos deuda técnica)

**Contras:**
- Coste: ~$7/año (12GB × $0.026/GB × 12 meses)
- Cuenta contra límites Firebase Blaze plan
- Requiere gestión cuotas

#### Opción 2: Google Drive (Workspace)
**Pros:**
- **$0 coste adicional** (Workspace incluido)
- Interfaz familiar para manager
- Ilimitado storage (Workspace Business)
- Integración nativa Apps Script (GmailApp/DriveApp)
- Compartir folders específicos sin configuración

**Contras:**
- OAuth token refresh en Cloud Functions
- Permisos Drive más complejos que Security Rules
- Apps Script timeout 6min (mitigable con batching)
- No integración directa Firestore

### Decisión
**Google Drive**

### Justificación
- **Coste:** $0 vs $7/año (marginal pero en línea con optimización presupuesto)
- **Complejidad OAuth:** Asumible vía Apps Script ejecutado como madrid@spainfoodsherpas
- **Familiaridad:** Manager ya usa Drive para otras operaciones
- **Escalabilidad:** Storage ilimitado vs gestión cuotas Firebase
- **Consistencia:** Flujo actual usa Drive → menor cambio operativo

### Consecuencias
- Apps Script maneja uploads (endpoint `uploadVendorTickets`)
- Cloud Functions llaman Apps Script vía HTTPS
- Estructura folders: `Tickets - Madrid Tours/{shiftId}/{vendorName}_ticket.jpg`
- Permisos: Folder raíz solo manager, subfolders compartidos por tour

### Mitigación Riesgos
- **Timeout 6min:** Batch uploads máx 10 tickets/request
- **OAuth:** Service Account domain-wide delegation
- **Rate limits:** Max 1000 uploads/día (suficiente 60 tours/día)

---

## ADR-VC-002: Registro Sheet - Apps Script Write vs Sheets API

**Estado:** Aprobado  
**Fecha:** 2025-10-15

### Contexto
Necesitamos escribir en Google Sheet "Tickets - Madrid Food Tours (respuestas)" cada vendor cost registrado.

### Opciones Consideradas

#### Opción 1: Apps Script (SpreadsheetApp)
**Pros:**
- Sin autenticación OAuth (ejecuta como service account)
- API sencilla: `sheet.appendRow([...])`
- Timeout 6min suficiente para operaciones batch
- Integrado con Drive upload en mismo endpoint

**Contras:**
- Acoplamiento Apps Script
- No type-safety
- Debugging limitado (Logger)

#### Opción 2: Google Sheets API v4 (desde Cloud Functions)
**Pros:**
- Type-safety (TypeScript)
- Testing unitario más fácil
- Debugging Cloud Functions robusto
- Batch operations nativas

**Contras:**
- Requiere OAuth service account
- Configuración adicional scopes
- Mayor latencia (HTTPS Cloud Functions → Sheets API)

### Decisión
**Apps Script (SpreadsheetApp)**

### Justificación
- Ya usamos Apps Script para Drive uploads → reusar mismo endpoint
- Reducir latencia: 1 llamada HTTPS (CF → Apps Script) vs 2 (CF → Apps Script + CF → Sheets API)
- Simplicidad: `appendRow` vs `batchUpdate` Sheets API
- OAuth ya configurado para Apps Script

### Consecuencias
- Endpoint Apps Script único: `doPost` maneja Drive + Sheet
- Sheet ID en `PropertiesService.getScriptProperties()`
- Error Sheet no bloquea upload Drive (try-catch separado)

---

## ADR-VC-003: Cálculo Salario - Frontend vs Backend

**Estado:** Aprobado  
**Fecha:** 2025-10-15

### Contexto
Salario guía se calcula según tabla pax. ¿Dónde ejecutar lógica?

### Opciones Consideradas

#### Opción 1: Solo Backend (Cloud Function)
**Pros:**
- Source of truth único
- Cambios tabla salarial no requieren redeploy frontend
- No manipulación frontend

**Contras:**
- No feedback inmediato al guía mientras rellena formulario
- Latencia hasta submit

#### Opción 2: Frontend + Backend (dual)
**Pros:**
- **Preview inmediato** mientras guía escribe pax
- Backend recalcula para validación
- UX superior

**Contras:**
- Lógica duplicada
- Riesgo inconsistencia si tabla cambia

#### Opción 3: Solo Frontend
**Pros:**
- Latencia cero
- Menos carga backend

**Contras:**
- Manipulación cliente (guía podría editar DevTools)
- Tabla salarial hardcoded frontend

### Decisión
**Frontend (preview) + Backend (validación)**

### Justificación
- UX crítico: guía debe ver salario antes de enviar
- Backend autoridad: recalcula y guarda valor oficial
- Tabla en Firestore `config/salary_table` → frontend fetch al load
- Inconsistencia imposible: backend siempre recalcula

### Implementación
```javascript
// Frontend
const salaryTable = await db.collection('config').doc('salary_table').get();
function previewSalary(numPax) {
  const range = salaryTable.ranges.find(r => numPax >= r.minPax && numPax <= r.maxPax);
  return range.pagoBruto; // Solo preview, no se envía al backend
}

// Backend (Cloud Function)
async function calculateOfficialSalary(numPax) {
  const table = await admin.firestore().collection('config').doc('salary_table').get();
  const range = table.data().ranges.find(r => numPax >= r.minPax && numPax <= r.maxPax);
  return range.pagoBruto; // Valor guardado en Firestore
}
```

---

## ADR-VC-004: Generación PDF Facturas - Cloud Functions vs Apps Script

**Estado:** Aprobado  
**Fecha:** 2025-10-15

### Contexto
Facturas pro-forma y reportes vendors requieren generación PDF con plantilla HTML.

### Opciones Consideradas

#### Opción 1: Cloud Functions + Puppeteer
**Pros:**
- Plantillas HTML/CSS modernas
- Control total rendering
- Testing unitario fácil

**Contras:**
- Puppeteer pesado: Cold start +3s
- Bundle 50MB+ (Chrome headless)
- Consume RAM (min 512MB función)

#### Opción 2: Apps Script (Documentos Google + exportToPDF)
**Pros:**
- Sin cold start
- Plantillas Google Docs reutilizables manager
- API nativa: `DriveApp.createFile(...).getAs('application/pdf')`
- Ya tenemos Apps Script configurado

**Contras:**
- Limitaciones styling (no full CSS)
- Plantillas menos flexibles que HTML

#### Opción 3: Cloud Functions + pdfmake/jsPDF
**Pros:**
- Bundle ligero (~5MB)
- Definición programática layout
- Rápido (~500ms generación)

**Contras:**
- Sintaxis verbosa (no HTML)
- Curva aprendizaje

### Decisión
**Cloud Functions + pdfmake**

### Justificación
- **Performance:** 500ms vs 3s+ Puppeteer cold start
- **Coste:** Menos RAM/CPU → menor factura Functions
- **Mantenibilidad:** Plantillas en código (version control) vs Docs externos
- **Escalabilidad:** pdfmake ligero permite múltiples instancias paralelas

### Consecuencias
- Template factura en TypeScript:
  ```typescript
  const docDefinition = {
    content: [
      { text: `FACTURA N.º ${invoiceNumber}`, style: 'header' },
      { table: { body: tours.map(t => [t.fecha, t.slot, t.pax, t.salario]) } }
    ],
    styles: { header: { fontSize: 18, bold: true } }
  };
  const pdf = pdfMake.createPdf(docDefinition);
  ```
- Output buffer → upload Drive via Apps Script endpoint

---

## ADR-VC-005: Validación Shift Asignado - Firestore Rules vs Cloud Function

**Estado:** Aprobado  
**Fecha:** 2025-10-15

### Contexto
Al registrar vendor cost, validar que shift esté ASIGNADO al guía autenticado.

### Opciones Consideradas

#### Opción 1: Solo Firestore Security Rules
```javascript
allow create: if isGuide() &&
  get(/databases/$(database)/documents/shifts/$(request.resource.data.shiftId)).data.guideId == request.auth.token.guideId &&
  get(/databases/$(database)/documents/shifts/$(request.resource.data.shiftId)).data.estado == "ASIGNADO";
```

**Pros:**
- Sin Cloud Function (reducir complejidad)
- Validación atómica Firestore
- Gratuito (no carga Functions)

**Contras:**
- Rules sin lógica compleja (no validar duplicados shiftId)
- `get()` en Rules cuenta como read (coste adicional)
- No permite validar tickets Drive uploaded antes

#### Opción 2: Cloud Function + Rules básicas
**Pros:**
- Lógica compleja: validar shift, no duplicados, Drive upload OK
- Rules simples: solo `isGuide()`
- Transacción: rollback si falla Drive upload

**Contras:**
- Requiere endpoint Cloud Function
- Latencia +200ms vs write directo Firestore

### Decisión
**Cloud Function con Rules básicas**

### Justificación
- Validaciones complejas (duplicados, Drive, Calendar API)
- Transaccionalidad: si falla upload Drive → no crear doc Firestore
- Atomicidad: batch write Firestore + Apps Script call
- Rules solo autenticación: `allow create: if isGuide()`

### Flow Validación
```javascript
// functions/index.js
const {onCall, HttpsError} = require('firebase-functions/v2/https');

exports.registerVendorCost = onCall(async (request) => {
  const { data, auth } = request;
  
  // 1. Auth check
  if (!auth || auth.token.role !== 'guide') {
    throw new HttpsError('unauthenticated', 'Must be guide');
  }
  
  // 2. Validar shift (subcollection)
  const shiftSnap = await getFirestore()
    .doc(`guides/${auth.token.guideId}/shifts/${data.shiftId}`)
    .get();
  
  if (!shiftSnap.exists || shiftSnap.data().estado !== 'ASIGNADO') {
    throw new HttpsError('failed-precondition', 'Shift not assigned to you');
  }
  
  // 3. Validar no duplicado
  const existing = await getFirestore()
    .collection('vendor_costs')
    .where('shiftId', '==', data.shiftId)
    .limit(1)
    .get();
    
  if (!existing.empty) {
    throw new HttpsError('already-exists', 'Vendor cost already registered');
  }
  
  // 4. Upload tickets via Apps Script (query params)
  const driveUrls = await uploadTicketsViaAppsScript(data);
  
  // 5. Crear doc Firestore
  const salarioCalculado = await calculateSalary(data.numPax);
  
  await getFirestore().collection('vendor_costs').add({
    ...data,
    guideId: auth.token.guideId,
    driveUrls,
    salarioCalculado,
    createdAt: FieldValue.serverTimestamp()
  });
  
  return { success: true, salarioCalculado };
});
```

---

## ADR-VC-006: Numeración Facturas - Secuencia Global vs Por Guía

**Estado:** Aprobado  
**Fecha:** 2025-10-15

### Contexto
Guías pueden usar numeración AUTO (SFS-XXX/YY) o MANUAL (propia). ¿Secuencia única global o por guía?

### Opciones Consideradas

#### Opción 1: Secuencia global (todos los guías)
```
SFS-001/25 → Juan
SFS-002/25 → María
SFS-003/25 → Juan
```

**Pros:**
- Único contador en Firestore `config/invoice_counter`
- Auditoría sencilla: orden cronológico claro
- No colisiones

**Contras:**
- Race condition: 2 guías aprueban simultáneamente
- Incremento atómico complejo (transaction)
- Guías ven números no consecutivos en sus facturas

#### Opción 2: Secuencia por guía
```
Juan:  SFS-001/25, SFS-002/25, SFS-003/25
María: SFS-001/25, SFS-002/25
```

**Pros:**
- Cada guía ve secuencia consecutiva
- Sin race conditions (lastInvoiceNumber en doc guía)
- Aislamiento: cambios de un guía no afectan otros

**Contras:**
- Números duplicados entre guías (SFS-001/25 × 10 guías)
- Auditoría requiere filtrar por guía

### Decisión
**Secuencia por guía**

### Justificación
- **UX:** Guías esperan secuencia consecutiva personal
- **Concurrencia:** Sin race conditions (cada doc guía independiente)
- **Legal:** Factura identificable por emisor (guía) + número → OK duplicados inter-guías
- **Auditoría:** Filtro manager `invoiceNumber` + `guideId` suficiente

### Implementación
```javascript
// Firestore: guides/{guideId}
{
  invoiceMode: "AUTO" | "MANUAL",
  lastInvoiceNumber: 5
}

// Cloud Function: approveInvoice
if (guide.invoiceMode === "AUTO") {
  const nextNumber = guide.lastInvoiceNumber + 1;
  const year = new Date().getFullYear().toString().slice(-2);
  const invoiceNumber = `SFS-${String(nextNumber).padStart(3, '0')}/${year}`;
  
  await admin.firestore().doc(`guides/${guideId}`).update({
    lastInvoiceNumber: admin.firestore.FieldValue.increment(1)
  });
}
```

---

## ADR-VC-007: Edición Vendor Costs - Inmutable vs Mutable + Audit

**Estado:** Aprobado  
**Fecha:** 2025-10-15

### Contexto
Manager necesita editar vendor costs. ¿Crear nuevo documento o mutar existente con auditoría?

### Opciones Consideradas

#### Opción 1: Inmutable (event sourcing)
```javascript
vendor_costs/{id1} → original
vendor_costs/{id2} → edición1 (supersedes id1)
vendor_costs/{id3} → edición2 (supersedes id2)
```

**Pros:**
- Historial completo sin pérdida datos
- Rollback trivial (cambiar puntero)
- Auditoría nativa

**Contras:**
- Queries complejas (filtrar latest version)
- Storage crece linealmente con ediciones
- UI debe mostrar solo latest

#### Opción 2: Mutable con campo `editHistory[]`
```javascript
vendor_costs/{id} → {
  numPax: 10, // valor actual
  editHistory: [
    { editedAt, editedBy, changes: { numPax: { old: 8, new: 10 } } }
  ]
}
```

**Pros:**
- Queries simples (1 doc = 1 vendor cost)
- UI directa (doc.data())
- Storage constante

**Contras:**
- Historial completo requiere parsear `editHistory`
- Rollback manual (revertir cambios)

### Decisión
**Mutable con `editHistory` array**

### Justificación
- **Simplicidad queries:** UI no necesita join latest version
- **Performance:** Reads reducidos (no filtrar superseded)
- **Auditoría suficiente:** `editHistory` captura quién/cuándo/qué
- **Rollback raro:** Manager no revierte ediciones (solo corrige hacia adelante)

### Estructura Auditoría
```typescript
interface VendorCost {
  vendorCostId: string;
  numPax: number;
  vendors: Vendor[];
  editedByManager: boolean;
  editHistory: Array<{
    editedAt: Timestamp;
    editedBy: string; // email
    changes: {
      [field: string]: { old: any; new: any };
    };
  }>;
}
```

---

## ADR-VC-008: Reportes Vendors - Realtime vs Scheduled

**Estado:** Aprobado  
**Fecha:** 2025-10-15

### Contexto
Reportes vendors se generan automáticamente cada mes. ¿Cloud Scheduler o Firestore trigger?

### Opciones Consideradas

#### Opción 1: Cloud Scheduler (cron job)
```javascript
exports.generateMonthlyReports = functions.pubsub
  .schedule('0 2 1 * *') // 1º día mes 02:00 UTC
  .onRun(async () => { ... });
```

**Pros:**
- Ejecución garantizada fecha/hora exacta
- Independiente actividad usuarios
- Testing sencillo (trigger manual)

**Contras:**
- Cron sintaxis (learning curve)
- Requiere Cloud Scheduler habilitado

#### Opción 2: Firestore Trigger (onCreate vendor_cost)
```javascript
exports.onVendorCostCreated = functions.firestore
  .document('vendor_costs/{id}')
  .onCreate(async (snap) => {
    // Si es último día mes → generar reporte
  });
```

**Pros:**
- Sin Cloud Scheduler
- Realtime con última vendor cost

**Contras:**
- Lógica "último día mes" compleja
- Múltiples triggers si varios guías registran simultáneamente
- No ejecuta si mes sin vendor costs

### Decisión
**Cloud Scheduler**

### Justificación
- **Garantía:** Se ejecuta incluso si mes sin vendor costs
- **Simplicidad:** Lógica clara "1º día mes genera reportes mes anterior"
- **Performance:** Batch único vs múltiples triggers
- **Debugging:** Logs centralizados una ejecución/mes

### Configuración
```yaml
# firebase.json
{
  "functions": {
    "source": "functions"
  }
}

# functions/src/index.ts
exports.generateMonthlyVendorReports = functions.pubsub
  .schedule('0 2 1 * *')
  .timeZone('Europe/Madrid')
  .onRun(async (context) => {
    const lastMonth = moment().subtract(1, 'month').format('YYYY-MM');
    // Generar reportes...
  });
```

---

## Resumen Decisiones

| ADR | Decisión | Rationale Clave |
|-----|----------|-----------------|
| VC-001 | Google Drive | $0 coste, Workspace incluido |
| VC-002 | Apps Script Sheet | Reusar endpoint Drive, simplicidad |
| VC-003 | Frontend + Backend | UX preview, backend autoridad |
| VC-004 | pdfmake | Performance, bundle ligero |
| VC-005 | Cloud Function validación | Lógica compleja, transaccionalidad |
| VC-006 | Secuencia por guía | Sin race conditions, UX consecutiva |
| VC-007 | Mutable + editHistory | Queries simples, storage constante |
| VC-008 | Cloud Scheduler | Garantía ejecución, batch único |

---

**Fin del documento**