# Contrato API: Webhook Zapier - Sincronización Bookeo

**Versión:** 2.0 (actualizada CHAT_50)  
**Fecha:** 21 Octubre 2025  
**Responsable:** Pablo Vázquez (Zapier) + Tech Lead (Cloud Function)  
**Endpoint:** `https://hooks.zapier.com/hooks/catch/{XXXXX}/{YYYYY}/`

---

## 1. Resumen

Cloud Function envía webhooks POST a Zapier para sincronizar disponibilidad turnos con Bookeo. Zapier transforma payload y llama Bookeo API.

---

## 2. Especificación Técnica

### Endpoint
```
POST https://hooks.zapier.com/hooks/catch/{XXXXX}/{YYYYY}/
```

**Nota:** URL exacta proporcionada por Pablo (variable según ambiente).

### Headers
```
Content-Type: text/plain;charset=utf-8
X-Webhook-Secret: {ZAPIER_WEBHOOK_SECRET}
X-Firebase-Source: calendar-app-tours
User-Agent: Cloud-Function-Bookeo-v1.0
```

⚠️ **CRÍTICO:** `Content-Type` DEBE ser `text/plain`, NO `application/json`. Razón: CORS preflight OPTIONS no soportado por Cloud Functions con Zapier.

### Timeout
- **Cloud Function:** 30 segundos
- **Zapier:** Configurar timeout interno según necesidad Bookeo API

### Autenticación
- Header `X-Webhook-Secret`: Validar en Zapier (filter step)
- Si secret inválido → Zapier retorna 401 Unauthorized

---

## 3. Request: Acción BLOQUEAR

### Payload
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

### Campos

| Campo | Tipo | Obligatorio | Descripción | Ejemplo |
|-------|------|-------------|-------------|---------|
| `action` | string | ✅ | Acción a realizar | `"BLOQUEAR"` |
| `startDate` | string | ✅ | Fecha turno formato YYYY-MM-DD | `"2025-11-15"` |
| `startTime` | string | ✅ | Hora turno (12:00, 17:15, 18:15) | `"12:00"` |
| `slot` | string | ✅ | Slot: MAÑANA, T1, T2 | `"MAÑANA"` |
| `reason` | string | ✅ | automatic, manual | `"automatic"` |
| `timestamp` | string | ✅ | ISO 8601 timestamp request | `"2025-10-21T14:23:45Z"` |

### Mapeo Slots → Horas

| Slot | startTime | Duración |
|------|-----------|----------|
| MAÑANA | 12:00 | 3h (12:00-15:00) |
| T1 | 17:15 | 2h 45min |
| T2 | 18:15 | 2h 45min |

### Validaciones Zapier

```javascript
// Step 1: Validar payload
if (!payload.action || payload.action !== 'BLOQUEAR') {
  return { status: 'error', code: 'INVALID_PAYLOAD' };
}
if (!payload.startDate || !isValidDate(payload.startDate)) {
  return { status: 'error', code: 'INVALID_DATE' };
}
if (!['12:00', '17:15', '18:15'].includes(payload.startTime)) {
  return { status: 'error', code: 'INVALID_TIME' };
}

// Step 2: Transformar fecha → ISO 8601
const isoDateTime = `${payload.startDate}T${payload.startTime}:00+01:00`;

// Step 3: Obtener eventId
const eventId = await getBookeoEventId(isoDateTime, productId);

// Step 4: POST /seatblocks
const response = await fetch('https://api.bookeo.com/v2/seatblocks', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Bookeo-secretKey': BOOKEO_SECRET_KEY,
    'X-Bookeo-apiKey': BOOKEO_API_KEY
  },
  body: JSON.stringify({
    eventId: eventId,
    numSeats: 10, // Bloquear todas las plazas
    reason: 'Calendar App - No guides available'
  })
});

// Step 5: Retornar bookeoId
return { status: 'success', bookeoId: response.id };
```

### Ejemplo cURL
```bash
curl -X POST https://hooks.zapier.com/hooks/catch/XXXXX/YYYYY/ \
  -H "Content-Type: text/plain;charset=utf-8" \
  -H "X-Webhook-Secret: sk_live_abc123xyz789" \
  -d '{
    "action": "BLOQUEAR",
    "startDate": "2025-11-15",
    "startTime": "12:00",
    "slot": "MAÑANA",
    "reason": "automatic",
    "timestamp": "2025-10-21T14:23:45Z"
  }'
```

---

## 4. Request: Acción DESBLOQUEAR

### Payload
```json
{
  "action": "DESBLOQUEAR",
  "bookeoId": "seat_block_xyz789",
  "startDate": "2025-11-15",
  "startTime": "12:00",
  "slot": "MAÑANA",
  "reason": "automatic",
  "timestamp": "2025-10-21T14:25:10Z"
}
```

### Campos

| Campo | Tipo | Obligatorio | Descripción | Ejemplo |
|-------|------|-------------|-------------|---------|
| `action` | string | ✅ | Acción a realizar | `"DESBLOQUEAR"` |
| `bookeoId` | string | ✅ | ID bloqueo Bookeo (de response BLOQUEAR) | `"seat_block_xyz789"` |
| `startDate` | string | ✅ | Fecha turno (informativo) | `"2025-11-15"` |
| `startTime` | string | ✅ | Hora turno (informativo) | `"12:00"` |
| `slot` | string | ✅ | Slot (informativo) | `"MAÑANA"` |
| `reason` | string | ✅ | automatic, manual | `"automatic"` |
| `timestamp` | string | ✅ | ISO 8601 timestamp request | `"2025-10-21T14:25:10Z"` |

**Nota:** `startDate`, `startTime`, `slot` son informativos. Zapier usa solo `bookeoId` para desbloquear.

### Validaciones Zapier

```javascript
// Step 1: Validar payload
if (!payload.action || payload.action !== 'DESBLOQUEAR') {
  return { status: 'error', code: 'INVALID_PAYLOAD' };
}
if (!payload.bookeoId) {
  return { status: 'error', code: 'BOOKEO_ID_REQUIRED' };
}

// Step 2: DELETE /seatblocks/{bookeoId}
const response = await fetch(`https://api.bookeo.com/v2/seatblocks/${payload.bookeoId}`, {
  method: 'DELETE',
  headers: {
    'X-Bookeo-secretKey': BOOKEO_SECRET_KEY,
    'X-Bookeo-apiKey': BOOKEO_API_KEY
  }
});

// Step 3: Verificar response
if (response.status === 404) {
  return { 
    status: 'error', 
    code: 'BOOKEO_ID_NOT_FOUND',
    retryable: false 
  };
}

return { status: 'success', message: 'Turno desbloqueado' };
```

### Ejemplo cURL
```bash
curl -X POST https://hooks.zapier.com/hooks/catch/XXXXX/YYYYY/ \
  -H "Content-Type: text/plain;charset=utf-8" \
  -H "X-Webhook-Secret: sk_live_abc123xyz789" \
  -d '{
    "action": "DESBLOQUEAR",
    "bookeoId": "seat_block_xyz789",
    "startDate": "2025-11-15",
    "startTime": "12:00",
    "slot": "MAÑANA",
    "reason": "automatic",
    "timestamp": "2025-10-21T14:25:10Z"
  }'
```

---

## 5. Response: Éxito BLOQUEAR

### Status Code
```
200 OK
```

### Payload
```json
{
  "status": "success",
  "bookeoId": "seat_block_xyz789",
  "message": "Turno bloqueado en Bookeo",
  "timestamp": "2025-10-21T14:23:47Z"
}
```

### Campos

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `status` | string | `"success"` |
| `bookeoId` | string | ID bloqueo Bookeo (guardar en Firestore) |
| `message` | string | Mensaje descriptivo |
| `timestamp` | string | Timestamp response Zapier |

---

## 6. Response: Éxito DESBLOQUEAR

### Status Code
```
200 OK
```

### Payload
```json
{
  "status": "success",
  "message": "Turno desbloqueado en Bookeo",
  "timestamp": "2025-10-21T14:25:12Z"
}
```

### Campos

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `status` | string | `"success"` |
| `message` | string | Mensaje descriptivo |
| `timestamp` | string | Timestamp response Zapier |

---

## 7. Response: Errores

### Status Codes

| Código | Descripción | Retryable |
|--------|-------------|-----------|
| `400` | Bad Request - payload inválido | ❌ No |
| `401` | Unauthorized - secret incorrecto | ❌ No |
| `404` | Not Found - bookeoId no existe | ❌ No |
| `500` | Internal Server Error - error Zapier/Bookeo API | ✅ Sí |
| `503` | Service Unavailable - Bookeo API down | ✅ Sí |
| `504` | Gateway Timeout - timeout Bookeo API | ✅ Sí |

### Payload Error
```json
{
  "status": "error",
  "code": "BOOKEO_API_ERROR",
  "message": "Bookeo API timeout after 30s",
  "timestamp": "2025-10-21T14:23:50Z",
  "retryable": true
}
```

### Campos

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `status` | string | `"error"` |
| `code` | string | Código error específico |
| `message` | string | Descripción error |
| `timestamp` | string | Timestamp error |
| `retryable` | boolean | Si Cloud Function debe reintentar |

### Códigos de Error

| Código | Descripción | Retryable | Acción Cloud Function |
|--------|-------------|-----------|-------------------|
| `INVALID_PAYLOAD` | Payload JSON inválido o campos faltantes | ❌ No | Log error, email Manager |
| `INVALID_DATE` | Formato fecha incorrecto (no YYYY-MM-DD) | ❌ No | Log error, email Manager |
| `INVALID_TIME` | Hora no válida (no 12:00/17:15/18:15) | ❌ No | Log error, email Manager |
| `BOOKEO_ID_REQUIRED` | bookeoId faltante en DESBLOQUEAR | ❌ No | Log error, email Manager |
| `BOOKEO_ID_NOT_FOUND` | bookeoId no encontrado en Bookeo | ❌ No | Email Manager, limpiar Firestore |
| `BOOKEO_API_ERROR` | Error genérico API Bookeo | ✅ Sí | Reintentar 3x |
| `BOOKEO_API_TIMEOUT` | Timeout llamada Bookeo | ✅ Sí | Reintentar 3x |
| `BOOKEO_RATE_LIMIT` | Rate limit alcanzado | ✅ Sí | Esperar 60s, reintentar |
| `ZAPIER_INTERNAL_ERROR` | Error interno Zapier | ✅ Sí | Reintentar 3x |

---

## 8. Flujo de Reintentos Cloud Function

```
Cloud Function envía webhook
        ↓
    [Intento 1]
        ↓
   ¿Éxito? → Sí → Guardar bookeoId en Firestore
        ↓ NO
   ¿retryable? → NO → Email Manager error, fin
        ↓ SÍ
   Esperar 1s
        ↓
    [Intento 2]
        ↓
   ¿Éxito? → Sí → Guardar bookeoId
        ↓ NO
   Esperar 2s
        ↓
    [Intento 3]
        ↓
   ¿Éxito? → Sí → Guardar bookeoId
        ↓ NO
   Email Manager error "3 intentos fallidos"
   Registrar en Firestore bookeoLastError
```

### Implementación Cloud Function
```javascript
const axios = require('axios');
const functions = require('firebase-functions');

async function sendZapierWebhookWithRetry(payload) {
  const config = functions.config();
  const maxRetries = parseInt(config.bookeo?.webhook_max_retries) || 3;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.post(
        config.zapier.webhook_url,
        JSON.stringify(payload),
        {
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
            'X-Webhook-Secret': config.zapier.webhook_secret,
            'X-Firebase-Source': 'calendar-app-tours',
            'User-Agent': 'Cloud-Function-Bookeo-v1.0'
          },
          timeout: 30000
        }
      );
      
      const result = response.data;
      
      if (result.status === 'success') {
        return { success: true, data: result, attempts: attempt };
      }
      
      // Error no retryable
      if (result.retryable === false) {
        return { success: false, error: result, attempts: attempt };
      }
      
      // Error retryable, esperar antes de reintentar
      if (attempt < maxRetries) {
        await sleep(Math.pow(2, attempt - 1) * 1000); // 1s, 2s, 4s
      }
      
    } catch (error) {
      functions.logger.error(`Intento ${attempt} falló`, error);
      if (attempt < maxRetries) {
        await sleep(Math.pow(2, attempt - 1) * 1000);
      }
    }
  }
  
  // Todos los intentos fallaron
  return { 
    success: false, 
    error: { code: 'MAX_RETRIES_EXCEEDED', message: 'Falló tras 3 intentos' },
    attempts: maxRetries 
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { sendZapierWebhookWithRetry };
```

---

## 9. Responsabilidades

### Cloud Function (Calendar App)
- ✅ Detectar cambios disponibilidad guías
- ✅ Construir payload válido
- ✅ Enviar webhook con Content-Type correcto
- ✅ Implementar reintentos con backoff
- ✅ Procesar response y actualizar Firestore
- ✅ Enviar emails Manager

### Zapier (Pablo)
- ✅ Validar webhook secret
- ✅ Validar estructura payload
- ✅ Transformar fechas a formato Bookeo (ISO 8601)
- ✅ Obtener eventId via /availability/slots
- ✅ Llamar Bookeo API (/seatblocks)
- ✅ Retornar response estructurada
- ✅ Manejar errores Bookeo API
- ✅ Configurar timeout interno

---

## 10. Testing

### Test Payload BLOQUEAR
```bash
# Staging
curl -X POST https://hooks.zapier.com/hooks/catch/{STAGING_URL}/ \
  -H "Content-Type: text/plain;charset=utf-8" \
  -H "X-Webhook-Secret: staging-secret" \
  -d '{
    "action": "BLOQUEAR",
    "startDate": "2025-11-30",
    "startTime": "12:00",
    "slot": "MAÑANA",
    "reason": "automatic",
    "timestamp": "2025-10-21T10:00:00Z"
  }'

# Expected response:
# { "status": "success", "bookeoId": "test_block_123", ... }
```

### Test Payload DESBLOQUEAR
```bash
curl -X POST https://hooks.zapier.com/hooks/catch/{STAGING_URL}/ \
  -H "Content-Type: text/plain;charset=utf-8" \
  -H "X-Webhook-Secret: staging-secret" \
  -d '{
    "action": "DESBLOQUEAR",
    "bookeoId": "test_block_123",
    "startDate": "2025-11-30",
    "startTime": "12:00",
    "slot": "MAÑANA",
    "reason": "automatic",
    "timestamp": "2025-10-21T10:05:00Z"
  }'

# Expected response:
# { "status": "success", "message": "Turno desbloqueado", ... }
```

### Test Error Handling
```bash
# Test bookeoId inválido
curl -X POST ... -d '{
  "action": "DESBLOQUEAR",
  "bookeoId": "invalid_id_999",
  ...
}'

# Expected response:
# { "status": "error", "code": "BOOKEO_ID_NOT_FOUND", "retryable": false }
```

---

## 11. Monitoreo

### Zapier Task History
- Revisar ejecuciones fallidas en dashboard Zapier
- Filtrar por código error específico
- Analizar latency promedio

### Cloud Functions Logs
```javascript
function logWebhook(action, result, attempts) {
  functions.logger.info('Bookeo webhook', {
    timestamp: new Date().toISOString(),
    action: action,
    success: result.success,
    attempts: attempts,
    bookeoId: result.data?.bookeoId || null,
    error: result.error?.code || null
  });
}
```

---

## 12. Changelog

### v2.0 (21 Oct 2025)
- Actualizado de Apps Script a Cloud Function
- Sintaxis axios
- Headers actualizados

### v1.0 (10 Oct 2025)
- Contrato inicial

---

## 13. Contacto y Soporte

**Zapier:** Pablo Vázquez - pvazquez@spainfoodsherpas.com  
**Cloud Function:** Tech Lead Calendar App  
**Escalación:** Manager Daniel Moreno - madrid@spainfoodsherpas.com

---

**Versión:** 2.0  
**Última actualización:** 21 Octubre 2025  
**Próxima revisión:** Post-despliegue producción
