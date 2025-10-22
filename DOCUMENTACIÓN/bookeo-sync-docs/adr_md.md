# ADR-006: Arquitectura Sincronización Bookeo

**Estado:** Aceptado  
**Versión:** 2.0 (actualizada CHAT_50)  
**Fecha:** 21 Octubre 2025  
**Decisores:** Manager (Daniel), Gerente (Pablo), Tech Lead  

---

## Contexto y Problema

Bookeo debe reflejar disponibilidad real de guías en tiempo real. Cuando todos marcan NO_DISPONIBLE, Bookeo debe bloquearse automáticamente.

**Sistema actual:** Firebase app (calendar-app-tours.web.app) con Firestore como BD principal.

### Requisitos
1. Sincronización <5s
2. Bloqueo automático 100% guías NO_DISPONIBLE
3. Desbloqueo automático ≥1 guía LIBRE
4. No exponer credenciales Bookeo API
5. Notificación Manager email

---

## Decisión

**Arquitectura:** Cloud Function (Firestore trigger) → Zapier → Bookeo API

```
Firestore /shifts/{docId}
        ↓
Cloud Function onUpdate trigger
        ↓
   detectFullBlockage()
   detectUnblock()
        ↓
   ├→ Gmail API (email Manager)
   └→ Zapier Webhook (POST)
            ↓
       Transformación payload
            ↓
       Bookeo API (/seatblocks)
            ↓
       Response (bookeoId)
            ↓
   Cloud Function actualiza
            ↓
   Firestore /shifts/{docId}
```

### Componentes

**1. Cloud Function `syncBookeoAvailability`**
- Trigger: `onUpdate` colección `/shifts`
- Helper: `detectFullBlockage(shiftData)` → boolean
- Helper: `sendZapierWebhook(payload)` → response (3 reintentos)
- Helper: `sendManagerEmail(tipo, data)` → Gmail API
- Helper: `updateFirestore(shiftId, data)` → Firestore SDK

**2. Zapier Workflow**
- Webhook trigger (catch POST)
- Validar payload (action, startDate, startTime)
- Transformar ISO 8601
- Obtener eventId via /availability/slots
- POST /seatblocks o DELETE /seatblocks/{id}
- Response → Cloud Function

**3. Firestore `/shifts`**
- Almacenamiento bookeoId
- Campos: bookeoStatus, bookeoBlockedAt, bookeoUnblockedAt

---

## Alternativas Descartadas

### Apps Script → Zapier
**Contras:**
- ❌ Apps Script NO detecta cambios Firestore
- ❌ Requiere polling manual o triggers externos
- ❌ No hay onEdit en Firestore, solo en Sheets

**Razón descarte:** Arquitectura técnicamente imposible.

### Cloud Functions → Bookeo Directo
**Contras:**
- ❌ Expone credenciales Bookeo en Firebase
- ❌ Lógica compleja (eventId, formatos)
- ❌ Pablo pierde control Bookeo
- ❌ Cambios API requieren redeploy

**Razón descarte:** Separación responsabilidades. Zapier centraliza lógica Bookeo.

---

## Consecuencias

### Positivas
✅ Cloud Function detecta cambios Firestore nativamente  
✅ Seguridad: Credenciales Bookeo solo Zapier  
✅ Bajo acoplamiento  
✅ Zapier UI debugging  
✅ Stack coherente (Firebase ecosystem)  

### Negativas
⚠️ Dependencia Zapier  
⚠️ Debugging distribuido  
⚠️ Latencia +2-3s webhook (aceptable <5s)  

### Riesgos Mitigados
- Zapier down: Email Manager + reintentos 3x
- Timeout: Backoff exponencial 1s, 2s, 4s
- Bookeo error: Log + notificación Manager

---

## Implementación

### Variables Entorno Firebase Functions

```javascript
// firebase functions:config:set
ZAPIER_WEBHOOK_URL = "https://hooks.zapier.com/hooks/catch/XXXXX/YYYYY/"
ZAPIER_WEBHOOK_SECRET = "sk_live_abc123xyz789"
MANAGER_EMAIL = "madrid@spainfoodsherpas.com"
BOOKEO_SYNC_ENABLED = "true"
WEBHOOK_TIMEOUT_MS = "30000"
WEBHOOK_MAX_RETRIES = "3"
```

### Cloud Function Trigger

```javascript
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios');

exports.syncBookeoAvailability = functions.firestore
  .document('shifts/{shiftId}')
  .onUpdate(async (change, context) => {
    const config = functions.config();
    if (config.bookeo?.sync_enabled === 'false') return;
    
    const before = change.before.data();
    const after = change.after.data();
    const shiftId = context.params.shiftId;
    
    // Detectar bloqueo necesario
    if (shouldBlock(before, after)) {
      return handleBlock(shiftId, after);
    }
    
    // Detectar desbloqueo necesario
    if (shouldUnblock(before, after)) {
      return handleUnblock(shiftId, after);
    }
  });

function shouldBlock(before, after) {
  // Lógica: 100% guías NO_DISPONIBLE
  // O forceBlock activado
  return after.allGuidesUnavailable === true || 
         after.forceBlock === true;
}

async function handleBlock(shiftId, shiftData) {
  const payload = {
    action: 'BLOQUEAR',
    startDate: shiftData.fecha,
    startTime: getTimeForSlot(shiftData.slot),
    slot: shiftData.slot,
    reason: shiftData.forceBlock ? 'manual' : 'automatic',
    timestamp: new Date().toISOString()
  };
  
  const result = await sendZapierWebhook(payload);
  
  if (result.success) {
    await updateFirestore(shiftId, {
      bookeoId: result.data.bookeoId,
      bookeoStatus: 'blocked',
      bookeoBlockedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    await sendManagerEmail('BLOCKED', shiftData);
  }
}
```

### Payload Webhook

```json
{
  "action": "BLOQUEAR",
  "startDate": "2025-11-15",
  "startTime": "12:00",
  "slot": "MAÑANA",
  "reason": "automatic",
  "timestamp": "2025-10-21T14:23:45Z"
}
```

---

## Reglas Negocio

### Bloqueo Automático
```
IF (100% guías activos NO_DISPONIBLE)
AND (turno NO bloqueado)
AND (fecha futura)
THEN webhook BLOQUEAR
```

### Desbloqueo Automático
```
IF (≥1 guía LIBRE)
AND (turno bloqueado)
AND (bookeoId existe)
AND (forceBlock = false)
THEN webhook DESBLOQUEAR
```

---

## Monitoreo

```javascript
// Cloud Functions logs
functions.logger.info('Bookeo sync', {
  event: 'webhook_sent',
  shiftId,
  action: payload.action,
  attempts: result.attempts,
  bookeoId: result.data?.bookeoId
});
```

---

## Rollout

### Staging
1. Deploy Cloud Functions staging
2. Pablo configura Zapier staging
3. Testing E2E
4. UAT Manager

### Producción
1. Deploy viernes 17:00
2. Activar Zapier prod
3. Monitoreo 48h
4. Revisión lunes

### Rollback
```javascript
// Desactivar sin redeploy
firebase functions:config:set bookeo.sync_enabled="false"
firebase deploy --only functions
```

---

**Aprobado:** Pendiente  
**Revisión:** 2026-01-21 (3 meses post-prod)
