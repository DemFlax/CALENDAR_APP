# Firestore Data Model - Calendario Tours Madrid

## Arquitectura de Colecciones

```
/guides
  /{guideId}
    - nombre: string
    - email: string
    - telefono: string | null
    - direccion: string | null
    - dni: string
    - cuenta_bancaria: string | null
    - estado: "activo" | "inactivo"
    - createdAt: timestamp
    - updatedAt: timestamp

/shifts
  /{YYYY-MM-DD_SLOT}  // ej: 2025-10-15_T1
    - fecha: string (YYYY-MM-DD)
    - slot: "MAÑANA" | "T1" | "T2" | "T3"
    - estado: "LIBRE" | "ASIGNADO" | "NO_DISPONIBLE"
    - guiaId: string | null
    - createdAt: timestamp
    - updatedAt: timestamp

/notifications
  /{notificationId}
    - guiaId: string
    - tipo: "ASIGNACION" | "LIBERACION" | "INVITACION"
    - shiftId: string | null
    - emailTo: string
    - status: "sent" | "failed"
    - errorMessage: string | null
    - sentAt: timestamp
```

---

## Índices Compuestos Requeridos

### Collection: `guides`
```javascript
// Índice único para email
{
  fields: [
    { field: "email", order: "ASCENDING" }
  ],
  queryScope: "COLLECTION",
  unique: true
}

// Índice para filtro por estado
{
  fields: [
    { field: "estado", order: "ASCENDING" },
    { field: "nombre", order: "ASCENDING" }
  ],
  queryScope: "COLLECTION"
}
```

### Collection: `shifts`
```javascript
// Query: Manager dashboard - turnos por fecha y estado
{
  fields: [
    { field: "fecha", order: "ASCENDING" },
    { field: "estado", order: "ASCENDING" }
  ],
  queryScope: "COLLECTION"
}

// Query: Guía dashboard - mis turnos ordenados por fecha
{
  fields: [
    { field: "guiaId", order: "ASCENDING" },
    { field: "fecha", order: "ASCENDING" }
  ],
  queryScope: "COLLECTION"
}

// Query: Turnos libres para asignación
{
  fields: [
    { field: "estado", order: "ASCENDING" },
    { field: "fecha", order: "ASCENDING" },
    { field: "slot", order: "ASCENDING" }
  ],
  queryScope: "COLLECTION"
}
```

### Collection: `notifications`
```javascript
// Query: Historial notificaciones por guía
{
  fields: [
    { field: "guiaId", order: "ASCENDING" },
    { field: "sentAt", order: "DESCENDING" }
  ],
  queryScope: "COLLECTION"
}

// Query: Notificaciones fallidas
{
  fields: [
    { field: "status", order: "ASCENDING" },
    { field: "sentAt", order: "DESCENDING" }
  ],
  queryScope: "COLLECTION"
}
```

---

## Ejemplos de Documentos

### Guide Document
```json
{
  "nombre": "María García López",
  "email": "maria.garcia@gmail.com",
  "telefono": "+34666555444",
  "direccion": "Calle Mayor 10, Madrid",
  "dni": "12345678Z",
  "cuenta_bancaria": "ES9121000418450200051332",
  "estado": "activo",
  "createdAt": {
    "_seconds": 1696348800,
    "_nanoseconds": 0
  },
  "updatedAt": {
    "_seconds": 1696348800,
    "_nanoseconds": 0
  }
}
```

### Shift Document (LIBRE)
```json
{
  "fecha": "2025-10-15",
  "slot": "T1",
  "estado": "LIBRE",
  "guiaId": null,
  "createdAt": {
    "_seconds": 1696348800,
    "_nanoseconds": 0
  },
  "updatedAt": {
    "_seconds": 1696348800,
    "_nanoseconds": 0
  }
}
```

### Shift Document (ASIGNADO)
```json
{
  "fecha": "2025-10-15",
  "slot": "MAÑANA",
  "estado": "ASIGNADO",
  "guiaId": "abc123xyz789",
  "createdAt": {
    "_seconds": 1696348800,
    "_nanoseconds": 0
  },
  "updatedAt": {
    "_seconds": 1696435200,
    "_nanoseconds": 0
  }
}
```

### Shift Document (NO_DISPONIBLE)
```json
{
  "fecha": "2025-10-20",
  "slot": "T3",
  "estado": "NO_DISPONIBLE",
  "guiaId": "abc123xyz789",
  "createdAt": {
    "_seconds": 1696348800,
    "_nanoseconds": 0
  },
  "updatedAt": {
    "_seconds": 1696521600,
    "_nanoseconds": 0
  }
}
```

### Notification Document
```json
{
  "guiaId": "abc123xyz789",
  "tipo": "ASIGNACION",
  "shiftId": "2025-10-15_MAÑANA",
  "emailTo": "maria.garcia@gmail.com",
  "status": "sent",
  "errorMessage": null,
  "sentAt": {
    "_seconds": 1696435200,
    "_nanoseconds": 0
  }
}
```

---

## Queries Frecuentes

### Manager Dashboard - Turnos del mes actual
```javascript
db.collection('shifts')
  .where('fecha', '>=', '2025-10-01')
  .where('fecha', '<=', '2025-10-31')
  .orderBy('fecha', 'asc')
  .orderBy('slot', 'asc')
  .get()
```

### Manager - Turnos libres para asignar
```javascript
db.collection('shifts')
  .where('estado', '==', 'LIBRE')
  .where('fecha', '>=', TODAY)
  .orderBy('fecha', 'asc')
  .limit(50)
  .get()
```

### Guía Dashboard - Mis próximos turnos asignados
```javascript
db.collection('shifts')
  .where('guiaId', '==', currentGuideId)
  .where('fecha', '>=', TODAY)
  .orderBy('fecha', 'asc')
  .limit(20)
  .get()
```

### Guía - Turnos libres que puedo bloquear (próximos 3 meses)
```javascript
db.collection('shifts')
  .where('estado', '==', 'LIBRE')
  .where('fecha', '>=', TODAY)
  .where('fecha', '<=', THREE_MONTHS_FROM_NOW)
  .orderBy('fecha', 'asc')
  .get()
```

### Cloud Function - Seed inicial (colección vacía)
```javascript
// Detectar si shifts está vacío
const snapshot = await db.collection('shifts').limit(1).get();
if (snapshot.empty) {
  // Crear 3 meses completos
  const batch = db.batch();
  for (let month = 0; month < 3; month++) {
    // ... generar turnos
  }
  await batch.commit();
}
```

### Cloud Function - Generar nuevo mes
```javascript
// Ejecutado 1x/día a las 00:00 UTC
const today = new Date();
const currentMonth = today.getMonth();
const twoMonthsAhead = new Date(today);
twoMonthsAhead.setMonth(currentMonth + 2);

// Verificar si ya existe mes +2
const monthKey = `${twoMonthsAhead.getFullYear()}-${String(twoMonthsAhead.getMonth() + 1).padStart(2, '0')}`;
const exists = await db.collection('shifts')
  .where('fecha', '>=', `${monthKey}-01`)
  .where('fecha', '<=', `${monthKey}-31`)
  .limit(1)
  .get();

if (exists.empty) {
  // Crear mes completo
  // ...
}
```

---

## Máquina de Estados: Turnos

```
      ┌─────────┐
      │  LIBRE  │
      └────┬────┘
           │
      ┌────┴────────────┐
      │                 │
      │ Manager         │ Guía
      │ asigna          │ bloquea
      │                 │
      ▼                 ▼
┌──────────┐    ┌────────────────┐
│ ASIGNADO │    │ NO_DISPONIBLE  │
└────┬─────┘    └────┬───────────┘
     │               │
     │ Manager       │ Guía
     │ libera        │ desbloquea
     │               │
     └────┬──────────┘
          │
          ▼
      ┌─────────┐
      │  LIBRE  │
      └─────────┘
```

**Transiciones permitidas:**
- Manager: `LIBRE ⟷ ASIGNADO`
- Guía: `LIBRE ⟷ NO_DISPONIBLE`

**Transiciones bloqueadas:**
- Manager NO puede: `NO_DISPONIBLE → ASIGNADO`
- Guía NO puede: `ASIGNADO → NO_DISPONIBLE`
- Guía NO puede: `ASIGNADO → LIBRE`

---

## Consideraciones de Diseño

### Por qué shiftId compuesto (`YYYY-MM-DD_SLOT`)
1. **Garantiza unicidad natural:** Un slot solo puede existir una vez por fecha
2. **Query eficiente:** No necesita índice adicional para buscar turno específico
3. **Legible en consola:** Fácil debugging
4. **Previene duplicados:** Firestore `set()` es idempotente

### Por qué denormalizar guiaId en shifts
1. **Query performance:** Obtener turnos de guía sin JOIN
2. **Real-time eficiente:** Listener solo en shifts con `where('guiaId', '==', x)`
3. **Trade-off:** Requiere actualización en 2 lugares si guía se elimina (aceptable, raro)

### Por qué collection notifications separada
1. **Auditoría:** Historial completo de comunicaciones
2. **Debug:** Tracking de fallos email
3. **Compliance:** Registro envíos para posibles reclamaciones
4. **No afecta performance:** No está en critical path de queries

### Limitaciones voluntarias
- **Sin subcollections:** Evitar complejidad innecesaria en MVP
- **Sin agregaciones:** Cálculos en cliente (pocos datos)
- **Sin search full-text:** Filtros simples suficientes para 10 guías

---

## Tamaño Estimado

### Guides
- 10 guías × ~300 bytes = **3 KB**

### Shifts (1 año con histórico)
- 365 días × 4 slots × ~200 bytes = **292 KB**

### Notifications (1 año)
- ~5,000 notificaciones × ~250 bytes = **1.25 MB**

**Total proyectado 1 año: ~1.5 MB** (dentro de límites Spark generoso)

---

## Comandos Setup Firestore

### Crear índices (Firebase CLI)
```bash
# firestore.indexes.json
{
  "indexes": [
    {
      "collectionGroup": "shifts",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "fecha", "order": "ASCENDING" },
        { "fieldPath": "estado", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "shifts",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "guiaId", "order": "ASCENDING" },
        { "fieldPath": "fecha", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "shifts",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "estado", "order": "ASCENDING" },
        { "fieldPath": "fecha", "order": "ASCENDING" },
        { "fieldPath": "slot", "order": "ASCENDING" }
      ]
    }
  ]
}
```

### Deploy
```bash
firebase deploy --only firestore:indexes
firebase deploy --only firestore:rules
```

---

**Versión:** 1.0  
**Última actualización:** 2025-10-03
