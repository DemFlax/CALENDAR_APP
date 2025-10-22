# Modelo de Datos Firestore - Sincronización Bookeo

**Versión:** 2.0 (actualizada CHAT_50)  
**Fecha:** 21 Octubre 2025  
**Base de datos:** Firestore  
**Colección afectada:** `/shifts`

---

## Actualización Colección: `shifts`

### Path
```
/shifts/{YYYY-MM-DD_SLOT}
```

**Ejemplos IDs:**
- `2025-11-15_MAÑANA`
- `2025-11-20_T1`
- `2025-11-22_T2`

---

## Estructura Documento Actualizada

### Campos Existentes
```javascript
{
  "fecha": "2025-11-15",           // string YYYY-MM-DD
  "slot": "MAÑANA" | "T1" | "T2",  // string
  "guidesAvailable": 3,            // number guías disponibles
  "allUnavailable": false,         // boolean: 100% NO_DISPONIBLE
  "createdAt": Timestamp,          // Timestamp Firebase
  "updatedAt": Timestamp           // Timestamp última modificación
}
```

### Campos NUEVOS (Bookeo Sync)
```javascript
{
  // ... campos existentes ...
  
  // ↓ CAMPOS SINCRONIZACIÓN BOOKEO
  "bookeoId": string | null,              // ID bloqueo Bookeo
  "bookeoStatus": "blocked" | "unblocked" | null, // Estado sync
  "bookeoBlockedAt": Timestamp | null,    // Cuándo se bloqueó
  "bookeoUnblockedAt": Timestamp | null,  // Cuándo se desbloqueó
  "bookeoLastSync": Timestamp | null,     // Última sincronización
  "bookeoSyncAttempts": number,           // Contador reintentos (0-3)
  "bookeoLastError": string | null,       // Último error webhook
  "forceBlock": boolean                   // Checkbox bloqueo manual
}
```

---

## Campos Detallados

### `bookeoId`
- **Tipo:** `string | null`
- **Obligatorio:** ❌ (null si turno nunca bloqueado)
- **Descripción:** ID del bloqueo retornado por Zapier/Bookeo tras crear seatblock
- **Ejemplo:** `"seat_block_xyz789abc"`
- **Uso:** Requerido para desbloquear turno (DELETE /seatblocks/{id})

### `bookeoStatus`
- **Tipo:** `"blocked" | "unblocked" | null`
- **Obligatorio:** ❌
- **Descripción:** Estado actual sincronización Bookeo
- **Valores:**
  - `"blocked"`: Turno bloqueado en Bookeo
  - `"unblocked"`: Turno desbloqueado (o nunca bloqueado)
  - `null`: Sin sincronización previa
- **Uso:** Evitar webhooks duplicados

### `bookeoBlockedAt`
- **Tipo:** `Timestamp | null`
- **Obligatorio:** ❌
- **Descripción:** Timestamp cuando se bloqueó turno
- **Ejemplo:** `Timestamp(2025, 10, 21, 14, 23, 45)`
- **Uso:** Auditoría, métricas tiempo bloqueado

### `bookeoUnblockedAt`
- **Tipo:** `Timestamp | null`
- **Obligatorio:** ❌
- **Descripción:** Timestamp cuando se desbloqueó turno
- **Ejemplo:** `Timestamp(2025, 10, 21, 14, 25, 10)`
- **Uso:** Auditoría, métricas disponibilidad

### `bookeoLastSync`
- **Tipo:** `Timestamp | null`
- **Obligatorio:** ❌
- **Descripción:** Timestamp última sincronización exitosa
- **Uso:** Debugging, latencia monitoring

### `bookeoSyncAttempts`
- **Tipo:** `number`
- **Obligatorio:** ✅ (default: 0)
- **Rango:** 0-3
- **Descripción:** Contador intentos webhook actual
- **Uso:** Debugging, rate de reintentos

### `bookeoLastError`
- **Tipo:** `string | null`
- **Obligatorio:** ❌
- **Descripción:** Último error webhook (código o mensaje)
- **Ejemplo:** `"BOOKEO_API_TIMEOUT"`, `"Timeout after 3 attempts"`
- **Uso:** Debugging, alerting

### `forceBlock`
- **Tipo:** `boolean`
- **Obligatorio:** ✅ (default: false)
- **Descripción:** Bloqueo manual forzado (independiente de guías)
- **Uso:** Manager puede bloquear turno manualmente

---

## Ejemplos de Documentos

### Turno Libre (sin sincronización Bookeo)
```json
{
  "fecha": "2025-11-15",
  "slot": "MAÑANA",
  "guidesAvailable": 3,
  "allUnavailable": false,
  "createdAt": {"_seconds": 1696348800, "_nanoseconds": 0},
  "updatedAt": {"_seconds": 1696348800, "_nanoseconds": 0},
  "bookeoId": null,
  "bookeoStatus": null,
  "bookeoBlockedAt": null,
  "bookeoUnblockedAt": null,
  "bookeoLastSync": null,
  "bookeoSyncAttempts": 0,
  "bookeoLastError": null,
  "forceBlock": false
}
```

### Turno Bloqueado Automático (100% guías NO_DISPONIBLE)
```json
{
  "fecha": "2025-11-15",
  "slot": "MAÑANA",
  "guidesAvailable": 0,
  "allUnavailable": true,
  "createdAt": {"_seconds": 1696348800, "_nanoseconds": 0},
  "updatedAt": {"_seconds": 1729520625, "_nanoseconds": 0},
  "bookeoId": "seat_block_xyz789abc",
  "bookeoStatus": "blocked",
  "bookeoBlockedAt": {"_seconds": 1729520625, "_nanoseconds": 0},
  "bookeoUnblockedAt": null,
  "bookeoLastSync": {"_seconds": 1729520627, "_nanoseconds": 0},
  "bookeoSyncAttempts": 1,
  "bookeoLastError": null,
  "forceBlock": false
}
```

### Turno Bloqueado Manual (forceBlock)
```json
{
  "fecha": "2025-11-18",
  "slot": "MAÑANA",
  "guidesAvailable": 3,
  "allUnavailable": false,
  "createdAt": {"_seconds": 1696348800, "_nanoseconds": 0},
  "updatedAt": {"_seconds": 1729600000, "_nanoseconds": 0},
  "bookeoId": "seat_block_manual_xyz",
  "bookeoStatus": "blocked",
  "bookeoBlockedAt": {"_seconds": 1729600000, "_nanoseconds": 0},
  "bookeoUnblockedAt": null,
  "bookeoLastSync": {"_seconds": 1729600002, "_nanoseconds": 0},
  "bookeoSyncAttempts": 1,
  "bookeoLastError": null,
  "forceBlock": true
}
```

### Turno Desbloqueado (guía volvió LIBRE)
```json
{
  "fecha": "2025-11-15",
  "slot": "MAÑANA",
  "guidesAvailable": 1,
  "allUnavailable": false,
  "createdAt": {"_seconds": 1696348800, "_nanoseconds": 0},
  "updatedAt": {"_seconds": 1729520710, "_nanoseconds": 0},
  "bookeoId": "seat_block_xyz789abc",
  "bookeoStatus": "unblocked",
  "bookeoBlockedAt": {"_seconds": 1729520625, "_nanoseconds": 0},
  "bookeoUnblockedAt": {"_seconds": 1729520710, "_nanoseconds": 0},
  "bookeoLastSync": {"_seconds": 1729520712, "_nanoseconds": 0},
  "bookeoSyncAttempts": 1,
  "bookeoLastError": null,
  "forceBlock": false
}
```

### Turno con Error Sincronización
```json
{
  "fecha": "2025-11-15",
  "slot": "T1",
  "guidesAvailable": 0,
  "allUnavailable": true,
  "createdAt": {"_seconds": 1696348800, "_nanoseconds": 0},
  "updatedAt": {"_seconds": 1729520625, "_nanoseconds": 0},
  "bookeoId": null,
  "bookeoStatus": null,
  "bookeoBlockedAt": null,
  "bookeoUnblockedAt": null,
  "bookeoLastSync": null,
  "bookeoSyncAttempts": 3,
  "bookeoLastError": "BOOKEO_API_TIMEOUT - Timeout after 3 attempts",
  "forceBlock": false
}
```

---

## Índices Compuestos Firestore

### Índices Requeridos

```javascript
// firestore.indexes.json

{
  "indexes": [
    // ... índices existentes shifts ...
    
    // NUEVO: Query turnos bloqueados en Bookeo
    {
      "collectionGroup": "shifts",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "bookeoStatus", "order": "ASCENDING" },
        { "fieldPath": "fecha", "order": "ASCENDING" }
      ]
    },
    
    // NUEVO: Query turnos con errores sincronización
    {
      "collectionGroup": "shifts",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "bookeoLastError", "order": "ASCENDING" },
        { "fieldPath": "fecha", "order": "DESCENDING" }
      ]
    },
    
    // NUEVO: Query turnos con bloqueo manual
    {
      "collectionGroup": "shifts",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "forceBlock", "order": "ASCENDING" },
        { "fieldPath": "fecha", "order": "ASCENDING" }
      ]
    }
  ]
}
```

### Deploy Índices
```bash
firebase deploy --only firestore:indexes
```

---

## Reglas de Seguridad Firestore

### Actualizadas

```javascript
// firestore.rules

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    match /shifts/{shiftId} {
      // ... reglas existentes read/write ...
      
      // Cloud Functions pueden actualizar campos Bookeo
      allow update: if request.auth != null &&
        request.auth.token.role == 'cloudfunction' &&
        request.resource.data.diff(resource.data).affectedKeys()
          .hasOnly(['bookeoId', 'bookeoStatus', 'bookeoBlockedAt', 
                    'bookeoUnblockedAt', 'bookeoLastSync', 
                    'bookeoSyncAttempts', 'bookeoLastError', 'updatedAt']);
      
      // Manager puede actualizar forceBlock
      allow update: if request.auth != null &&
        request.auth.token.role == 'manager' &&
        request.resource.data.diff(resource.data).affectedKeys()
          .hasOnly(['forceBlock', 'updatedAt']);
    }
  }
}
```

---

## Queries Útiles

### Listar turnos bloqueados en Bookeo
```javascript
const blockedShifts = await db.collection('shifts')
  .where('bookeoStatus', '==', 'blocked')
  .where('fecha', '>=', TODAY)
  .orderBy('fecha', 'asc')
  .get();
```

### Turnos con errores sincronización
```javascript
const errorShifts = await db.collection('shifts')
  .where('bookeoLastError', '!=', null)
  .orderBy('bookeoLastError')
  .orderBy('fecha', 'desc')
  .limit(20)
  .get();
```

### Turnos con bloqueo manual activo
```javascript
const manualBlocks = await db.collection('shifts')
  .where('forceBlock', '==', true)
  .where('fecha', '>=', TODAY)
  .orderBy('fecha', 'asc')
  .get();
```

### Buscar bookeoId específico
```javascript
const shift = await db.collection('shifts')
  .doc('2025-11-15_MAÑANA')
  .get();

if (shift.exists && shift.data().bookeoStatus === 'blocked') {
  const bookeoId = shift.data().bookeoId;
  // Usar para desbloquear
}
```

### Auditoría: Últimas sincronizaciones
```javascript
const recentSyncs = await db.collection('shifts')
  .where('bookeoLastSync', '!=', null)
  .orderBy('bookeoLastSync', 'desc')
  .limit(50)
  .get();
```

---

## Cloud Function: Actualización Firestore

### Helper updateBookeoSync()

```javascript
const admin = require('firebase-admin');

async function updateBookeoSync(shiftId, action, result) {
  const db = admin.firestore();
  const shiftRef = db.collection('shifts').doc(shiftId);
  
  const updateData = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    bookeoLastSync: admin.firestore.FieldValue.serverTimestamp(),
    bookeoSyncAttempts: result.attempts || 1
  };
  
  if (action === 'BLOQUEAR' && result.success) {
    updateData.bookeoId = result.data.bookeoId;
    updateData.bookeoStatus = 'blocked';
    updateData.bookeoBlockedAt = admin.firestore.FieldValue.serverTimestamp();
    updateData.bookeoLastError = null;
  }
  
  if (action === 'DESBLOQUEAR' && result.success) {
    updateData.bookeoStatus = 'unblocked';
    updateData.bookeoUnblockedAt = admin.firestore.FieldValue.serverTimestamp();
    updateData.bookeoLastError = null;
  }
  
  if (!result.success) {
    updateData.bookeoLastError = result.error.code || result.error.message;
  }
  
  await shiftRef.update(updateData);
}

module.exports = { updateBookeoSync };
```

### Ejemplo Uso
```javascript
// Tras enviar webhook BLOQUEAR exitoso
const shiftId = '2025-11-15_MAÑANA';
const result = {
  success: true,
  data: { bookeoId: 'seat_block_xyz789' },
  attempts: 1
};

await updateBookeoSync(shiftId, 'BLOQUEAR', result);
```

---

## Mantenimiento

### Limpieza de datos históricos

**Política:** Mantener histórico 6 meses para auditoría.

```javascript
// Cloud Scheduler mensual
const functions = require('firebase-functions');
const admin = require('firebase-admin');

exports.cleanupOldBookeoData = functions.pubsub
  .schedule('0 0 1 * *') // 1ro cada mes 00:00
  .timeZone('Europe/Madrid')
  .onRun(async (context) => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const cutoffDate = sixMonthsAgo.toISOString().split('T')[0];
    
    const db = admin.firestore();
    const snapshot = await db.collection('shifts')
      .where('fecha', '<', cutoffDate)
      .where('bookeoStatus', '==', 'unblocked')
      .get();
    
    const batch = db.batch();
    snapshot.forEach(doc => {
      batch.update(doc.ref, {
        bookeoId: null,
        bookeoStatus: null,
        bookeoBlockedAt: null,
        bookeoUnblockedAt: null,
        bookeoLastSync: null,
        bookeoSyncAttempts: 0,
        bookeoLastError: null
      });
    });
    
    await batch.commit();
    
    functions.logger.info('Cleanup completed', {
      documentsUpdated: snapshot.size,
      cutoffDate
    });
  });
```

### Monitoreo Errores

**Alerta:** Si `bookeoLastError != null` en >3 documentos → notificar Manager.

```javascript
exports.monitorBookeoErrors = functions.pubsub
  .schedule('0 */6 * * *') // Cada 6 horas
  .timeZone('Europe/Madrid')
  .onRun(async (context) => {
    const db = admin.firestore();
    const TODAY = new Date().toISOString().split('T')[0];
    
    const snapshot = await db.collection('shifts')
      .where('bookeoLastError', '!=', null)
      .where('fecha', '>=', TODAY)
      .get();
    
    if (snapshot.size > 3) {
      await sendManagerEmail('ALERT', {
        subject: '⚠️ ALERTA: Múltiples errores sincronización Bookeo',
        body: `${snapshot.size} turnos con errores. Revisar manualmente.`
      });
    }
  });
```

---

## Migración Datos Existentes

### Script Migración

```javascript
// Ejecutar una vez tras deploy
exports.migrateExistingShifts = functions.https
  .onRequest(async (req, res) => {
    const db = admin.firestore();
    const snapshot = await db.collection('shifts').get();
    
    const batch = db.batch();
    let count = 0;
    
    snapshot.forEach(doc => {
      const data = doc.data();
      
      // Solo migrar si no tiene campos Bookeo
      if (data.bookeoId === undefined) {
        batch.update(doc.ref, {
          bookeoId: null,
          bookeoStatus: null,
          bookeoBlockedAt: null,
          bookeoUnblockedAt: null,
          bookeoLastSync: null,
          bookeoSyncAttempts: 0,
          bookeoLastError: null,
          forceBlock: false
        });
        count++;
      }
    });
    
    await batch.commit();
    
    res.json({
      success: true,
      message: `Migrated ${count} shifts`
    });
  });
```

---

## Costos Estimados

### Firestore
- **Escrituras:** ~10/día (sincronizaciones)
- **Lecturas:** ~100/día (queries dashboard, Cloud Function)
- **Almacenamiento:** +0.5 KB/documento por campos Bookeo
- **Total anual:** ~365 KB adicionales

**Costo adicional estimado:** <$0.10 USD/año

---

## Changelog

### v2.0 (21 Oct 2025)
- Añadidos campos sincronización Bookeo
- Índices compuestos para queries Bookeo
- Reglas seguridad actualizadas
- Helpers Cloud Function

### v1.0 (03 Oct 2025)
- Modelo inicial colección `shifts`

---

## Referencias

- ADR-006: Decisión arquitectónica sincronización Bookeo
- HU-BOOKEO-01 a HU-BOOKEO-06: Historias de usuario
- [Firestore Data Modeling Best Practices](https://firebase.google.com/docs/firestore/data-model)

---

**Versión:** 2.0  
**Última actualización:** 21 Octubre 2025  
**Próxima revisión:** Post-producción (30 días)
