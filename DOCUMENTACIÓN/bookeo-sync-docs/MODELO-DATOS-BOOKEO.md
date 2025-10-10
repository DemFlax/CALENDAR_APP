# Modelo de Datos - Sincronización Bookeo

**Versión:** 1.0  
**Fecha:** 2025-10-10  
**Base de datos:** Firestore

---

## Colección: `bookeo_blocks`

Almacena información de bloqueos/desbloqueos en Bookeo para auditoría y gestión de desbloqueos posteriores.

### Estructura Documento

```javascript
{
  // ID documento: {fecha}_{slot}
  // Ejemplo: "2025-11-15_MAÑANA" o "2025-11-20_T2"
  
  "fecha": "2025-11-15",           // string YYYY-MM-DD
  "slot": "MAÑANA",                // "MAÑANA" | "T2"
  "bookeoId": "seat_block_xyz789", // ID bloqueo retornado por Zapier/Bookeo
  "status": "active",              // "active" | "deleted" | "failed"
  "createdAt": Timestamp,          // Timestamp Firebase
  "deletedAt": Timestamp | null,   // Timestamp cuando se desbloquea
  "createdBy": "system",           // "system" (siempre automático)
  "webhookUrl": "https://hooks.zapier.com/...", // URL webhook usado
  "webhookAttempts": 1,            // Contador reintentos (1-3)
  "lastWebhookResponse": {         // Última respuesta Zapier
    "status": "success",           // "success" | "error"
    "timestamp": Timestamp,
    "message": "Turno bloqueado en Bookeo",
    "code": null                   // código error si aplica
  },
  "emailSent": true,               // Si se envió email Manager
  "emailTimestamp": Timestamp | null
}
```

### Campos Detallados

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `fecha` | string | ✅ | Fecha turno formato YYYY-MM-DD |
| `slot` | string | ✅ | Slot: `"MAÑANA"` o `"T2"` |
| `bookeoId` | string | ❌ | ID bloqueo Bookeo. Null si webhook falló |
| `status` | string | ✅ | Estado bloqueo |
| `createdAt` | Timestamp | ✅ | Cuándo se creó bloqueo |
| `deletedAt` | Timestamp | ❌ | Cuándo se desbloqueó (null si activo) |
| `createdBy` | string | ✅ | Siempre `"system"` (automático) |
| `webhookUrl` | string | ✅ | URL Zapier usada (trazabilidad) |
| `webhookAttempts` | number | ✅ | Número intentos webhook (1-3) |
| `lastWebhookResponse` | object | ✅ | Última respuesta Zapier |
| `emailSent` | boolean | ✅ | Si se notificó Manager |
| `emailTimestamp` | Timestamp | ❌ | Cuándo se envió email |

### Estados Posibles

| Status | Descripción | Flujo |
|--------|-------------|-------|
| `active` | Bloqueo activo en Bookeo | Creado exitosamente, esperando desbloqueo |
| `deleted` | Bloqueo eliminado en Bookeo | Turno desbloqueado, ya no existe en Bookeo |
| `failed` | Error al crear/eliminar bloqueo | Webhook falló 3 veces, requiere intervención manual |

---

## Índices Firestore

### Índice Compuesto 1
```javascript
Collection: bookeo_blocks
Fields:
  - fecha (Ascending)
  - status (Ascending)
```

**Uso:** Consultar bloqueos por fecha y estado (ej: todos los activos de una fecha)

```javascript
// Query ejemplo
db.collection('bookeo_blocks')
  .where('fecha', '==', '2025-11-15')
  .where('status', '==', 'active')
  .get();
```

### Índice Simple 1
```javascript
Collection: bookeo_blocks
Field: status (Ascending)
```

**Uso:** Listar todos los bloqueos activos/fallidos globalmente

```javascript
// Query ejemplo
db.collection('bookeo_blocks')
  .where('status', '==', 'failed')
  .get();
```

### Índice Simple 2
```javascript
Collection: bookeo_blocks
Field: createdAt (Descending)
```

**Uso:** Auditoría - últimos bloqueos creados

```javascript
// Query ejemplo
db.collection('bookeo_blocks')
  .orderBy('createdAt', 'desc')
  .limit(50)
  .get();
```

---

## Reglas de Seguridad Firestore

```javascript
match /bookeo_blocks/{blockId} {
  // Solo Cloud Functions pueden escribir
  allow read: if isManager();
  allow write: if false; // Solo Cloud Functions (vía Admin SDK)
}

function isManager() {
  return request.auth != null && request.auth.token.role == "manager";
}
```

**Importante:** Cloud Functions usa Admin SDK → bypasea reglas de seguridad.

---

## Ejemplos de Documentos

### Ejemplo 1: Bloqueo Activo MAÑANA

**ID:** `2025-11-15_MAÑANA`

```json
{
  "fecha": "2025-11-15",
  "slot": "MAÑANA",
  "bookeoId": "seat_block_abc123",
  "status": "active",
  "createdAt": "2025-10-10T10:30:00Z",
  "deletedAt": null,
  "createdBy": "system",
  "webhookUrl": "https://hooks.zapier.com/hooks/catch/12345/67890/",
  "webhookAttempts": 1,
  "lastWebhookResponse": {
    "status": "success",
    "timestamp": "2025-10-10T10:30:02Z",
    "message": "Turno bloqueado en Bookeo",
    "code": null
  },
  "emailSent": true,
  "emailTimestamp": "2025-10-10T10:30:03Z"
}
```

---

### Ejemplo 2: Bloqueo Desbloqueado T2

**ID:** `2025-11-20_T2`

```json
{
  "fecha": "2025-11-20",
  "slot": "T2",
  "bookeoId": "seat_block_xyz789",
  "status": "deleted",
  "createdAt": "2025-10-12T14:00:00Z",
  "deletedAt": "2025-10-15T16:45:00Z",
  "createdBy": "system",
  "webhookUrl": "https://hooks.zapier.com/hooks/catch/12345/67890/",
  "webhookAttempts": 1,
  "lastWebhookResponse": {
    "status": "success",
    "timestamp": "2025-10-15T16:45:02Z",
    "message": "Turno desbloqueado en Bookeo",
    "code": null
  },
  "emailSent": true,
  "emailTimestamp": "2025-10-15T16:45:03Z"
}
```

---

### Ejemplo 3: Bloqueo Fallido (Error Zapier)

**ID:** `2025-11-22_MAÑANA`

```json
{
  "fecha": "2025-11-22",
  "slot": "MAÑANA",
  "bookeoId": null,
  "status": "failed",
  "createdAt": "2025-10-13T09:00:00Z",
  "deletedAt": null,
  "createdBy": "system",
  "webhookUrl": "https://hooks.zapier.com/hooks/catch/12345/67890/",
  "webhookAttempts": 3,
  "lastWebhookResponse": {
    "status": "error",
    "timestamp": "2025-10-13T09:00:08Z",
    "message": "Bookeo API timeout after 30s",
    "code": "BOOKEO_API_TIMEOUT"
  },
  "emailSent": true,
  "emailTimestamp": "2025-10-13T09:00:10Z"
}
```

**Nota:** Manager recibió email de error para intervención manual.

---

## Queries Útiles

### Listar bloqueos activos

```javascript
const activeBlocks = await db.collection('bookeo_blocks')
  .where('status', '==', 'active')
  .orderBy('fecha', 'asc')
  .get();
```

### Bloqueos fallidos (requieren intervención)

```javascript
const failedBlocks = await db.collection('bookeo_blocks')
  .where('status', '==', 'failed')
  .orderBy('createdAt', 'desc')
  .get();
```

### Auditoría: últimos 100 bloqueos

```javascript
const recentBlocks = await db.collection('bookeo_blocks')
  .orderBy('createdAt', 'desc')
  .limit(100)
  .get();
```

### Bloqueos de una fecha específica

```javascript
const dateBlocks = await db.collection('bookeo_blocks')
  .where('fecha', '==', '2025-11-15')
  .get();
```

### Buscar bookeoId para desbloqueo

```javascript
const blockDoc = await db.collection('bookeo_blocks')
  .doc('2025-11-15_MAÑANA')
  .get();

if (blockDoc.exists && blockDoc.data().status === 'active') {
  const bookeoId = blockDoc.data().bookeoId;
  // Usar bookeoId para desbloquear
}
```

---

## Mantenimiento

### Limpieza de datos históricos

**Política sugerida:** Mantener bloqueos `deleted` por 6 meses para auditoría.

```javascript
// Cloud Scheduler mensual
const sixMonthsAgo = new Date();
sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

const oldBlocks = await db.collection('bookeo_blocks')
  .where('status', '==', 'deleted')
  .where('deletedAt', '<', Timestamp.fromDate(sixMonthsAgo))
  .get();

// Eliminar en batch
const batch = db.batch();
oldBlocks.forEach(doc => batch.delete(doc.ref));
await batch.commit();
```

### Monitoreo bloqueos fallidos

**Alerta recomendada:** Si `status: "failed"` > 3 documentos, notificar Manager.

```javascript
const failedCount = await db.collection('bookeo_blocks')
  .where('status', '==', 'failed')
  .count()
  .get();

if (failedCount.data().count > 3) {
  // Enviar alerta Manager
}
```

---

## Migración Datos (Si aplica)

No aplica para nueva feature. Colección creada desde cero.

---

## Costos Estimados

### Firestore
- **Escrituras:** ~10/día (5 guías × 2 turnos promedio)
- **Lecturas:** ~50/día (queries dashboard, auditoría)
- **Almacenamiento:** ~1 KB/documento × 365 docs/año = 365 KB/año

**Costo anual estimado:** <$0.50 USD

---

## Changelog

### v1.0 (2025-10-10)
- Modelo inicial colección `bookeo_blocks`
- Índices definidos
- Reglas seguridad
- Documentación queries

---

## Referencias

- ADR-005: Decisión arquitectónica sincronización Bookeo
- HU-BOOKEO-01: Historia de usuario
- [Firestore Data Modeling Best Practices](https://firebase.google.com/docs/firestore/data-model)
