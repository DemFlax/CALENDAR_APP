# Contrato Webhook Zapier - Sincronización Bookeo

**Versión:** 1.0  
**Fecha:** 2025-10-10  
**Owner:** Equipo técnico  
**Consumidor:** Zapier (gestionado por Pablo)

---

## Endpoint Zapier

```
POST https://hooks.zapier.com/hooks/catch/{ZAPIER_ID}/{ZAPIER_SECRET}/
```

**Configuración:**
- Método: `POST`
- Content-Type: `application/json`
- Timeout: 30 segundos
- Reintentos: 3 con backoff exponencial (1s, 2s, 4s)

---

## Request - Bloquear Turno

### Payload

```json
{
  "action": "BLOQUEAR",
  "startDate": "2025-11-15",
  "startTime": "12:00",
  "slot": "MAÑANA",
  "timestamp": "2025-10-10T14:23:45Z"
}
```

### Campos

| Campo | Tipo | Obligatorio | Descripción | Valores posibles |
|-------|------|-------------|-------------|------------------|
| `action` | string | ✅ | Acción a realizar | `"BLOQUEAR"` |
| `startDate` | string | ✅ | Fecha turno formato ISO 8601 | `"YYYY-MM-DD"` |
| `startTime` | string | ✅ | Hora turno formato 24h | `"12:00"` \| `"18:15"` |
| `slot` | string | ✅ | Identificador slot | `"MAÑANA"` \| `"T2"` |
| `timestamp` | string | ✅ | Timestamp acción formato ISO 8601 | `"YYYY-MM-DDTHH:mm:ssZ"` |

### Valores startTime según slot

| Slot | startTime | Descripción |
|------|-----------|-------------|
| `MAÑANA` | `"12:00"` | Tour mañana |
| `T2` | `"18:15"` | Tour tarde (único sincronizado) |

**Importante:** T1 (17:15) y T3 (19:15) NO se sincronizan.

### Headers

```http
Content-Type: application/json
X-Firebase-Source: calendar-app-tours
X-Request-ID: {uuid-v4}
```

### Ejemplo cURL

```bash
curl -X POST https://hooks.zapier.com/hooks/catch/XXXXX/YYYYY/ \
  -H "Content-Type: application/json" \
  -H "X-Firebase-Source: calendar-app-tours" \
  -d '{
    "action": "BLOQUEAR",
    "startDate": "2025-11-15",
    "startTime": "12:00",
    "slot": "MAÑANA",
    "timestamp": "2025-10-10T14:23:45Z"
  }'
```

---

## Request - Desbloquear Turno

### Payload

```json
{
  "action": "DESBLOQUEAR",
  "bookeoId": "abc123xyz",
  "startDate": "2025-11-15",
  "startTime": "12:00",
  "slot": "MAÑANA",
  "timestamp": "2025-10-10T14:25:10Z"
}
```

### Campos

| Campo | Tipo | Obligatorio | Descripción | Valores posibles |
|-------|------|-------------|-------------|------------------|
| `action` | string | ✅ | Acción a realizar | `"DESBLOQUEAR"` |
| `bookeoId` | string | ✅ | ID bloqueo Bookeo retornado en bloqueo previo | alfanumérico |
| `startDate` | string | ✅ | Fecha turno formato ISO 8601 | `"YYYY-MM-DD"` |
| `startTime` | string | ✅ | Hora turno formato 24h | `"12:00"` \| `"18:15"` |
| `slot` | string | ✅ | Identificador slot | `"MAÑANA"` \| `"T2"` |
| `timestamp` | string | ✅ | Timestamp acción formato ISO 8601 | `"YYYY-MM-DDTHH:mm:ssZ"` |

### Ejemplo cURL

```bash
curl -X POST https://hooks.zapier.com/hooks/catch/XXXXX/YYYYY/ \
  -H "Content-Type: application/json" \
  -H "X-Firebase-Source: calendar-app-tours" \
  -d '{
    "action": "DESBLOQUEAR",
    "bookeoId": "abc123xyz",
    "startDate": "2025-11-15",
    "startTime": "12:00",
    "slot": "MAÑANA",
    "timestamp": "2025-10-10T14:25:10Z"
  }'
```

---

## Response - Éxito Bloqueo

### Status Code
```
200 OK
```

### Payload

```json
{
  "status": "success",
  "bookeoId": "xyz789abc",
  "message": "Turno bloqueado en Bookeo",
  "timestamp": "2025-10-10T14:23:47Z"
}
```

### Campos

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `status` | string | Estado operación: `"success"` |
| `bookeoId` | string | ID bloqueo asignado por Bookeo (almacenar en Firestore) |
| `message` | string | Mensaje descriptivo |
| `timestamp` | string | Timestamp respuesta Zapier |

---

## Response - Éxito Desbloqueo

### Status Code
```
200 OK
```

### Payload

```json
{
  "status": "success",
  "message": "Turno desbloqueado en Bookeo",
  "timestamp": "2025-10-10T14:25:12Z"
}
```

---

## Response - Error

### Status Codes

| Código | Descripción |
|--------|-------------|
| `400` | Bad Request - payload inválido |
| `401` | Unauthorized - header X-Firebase-Source incorrecto |
| `500` | Internal Server Error - error Zapier/Bookeo API |
| `503` | Service Unavailable - Bookeo API down |
| `504` | Gateway Timeout - timeout Bookeo API |

### Payload Error

```json
{
  "status": "error",
  "code": "BOOKEO_API_ERROR",
  "message": "Bookeo API timeout after 30s",
  "timestamp": "2025-10-10T14:23:50Z",
  "retryable": true
}
```

### Campos

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `status` | string | Estado operación: `"error"` |
| `code` | string | Código error específico |
| `message` | string | Descripción error |
| `timestamp` | string | Timestamp error |
| `retryable` | boolean | Si Cloud Function debe reintentar |

### Códigos de Error

| Código | Descripción | Retryable |
|--------|-------------|-----------|
| `INVALID_PAYLOAD` | Payload JSON inválido o campos faltantes | ❌ No |
| `INVALID_DATE` | Formato fecha incorrecto | ❌ No |
| `INVALID_TIME` | Hora no existe en Bookeo | ❌ No |
| `BOOKEO_ID_NOT_FOUND` | bookeoId no encontrado en Bookeo | ❌ No |
| `BOOKEO_API_ERROR` | Error genérico API Bookeo | ✅ Sí |
| `BOOKEO_API_TIMEOUT` | Timeout llamada Bookeo | ✅ Sí |
| `BOOKEO_RATE_LIMIT` | Rate limit alcanzado | ✅ Sí |
| `ZAPIER_INTERNAL_ERROR` | Error interno Zapier | ✅ Sí |

---

## Flujo de Reintentos

```
Cloud Function envía webhook
        ↓
    [Intento 1]
        ↓
   ¿Éxito? → SÍ → Guardar bookeoId
        ↓ NO
   Esperar 1s
        ↓
    [Intento 2]
        ↓
   ¿Éxito? → SÍ → Guardar bookeoId
        ↓ NO
   Esperar 2s
        ↓
    [Intento 3]
        ↓
   ¿Éxito? → SÍ → Guardar bookeoId
        ↓ NO
   Log error + Email Manager
```

---

## Validaciones Zapier (Responsabilidad Pablo)

Zapier debe validar internamente:

1. **Fecha válida:** startDate no en el pasado
2. **EventId existe:** Obtener eventId de Bookeo para la fecha/hora
3. **Formato fecha Bookeo:** Transformar a `2019-08-24T14:15:22Z`
4. **ProductId:** Obtener productId correspondiente al tour
5. **Duplicados:** No bloquear si ya está bloqueado

---

## Ejemplos de Uso

### Caso 1: Bloquear MAÑANA exitoso

**Request:**
```json
{
  "action": "BLOQUEAR",
  "startDate": "2025-11-20",
  "startTime": "12:00",
  "slot": "MAÑANA",
  "timestamp": "2025-10-10T10:30:00Z"
}
```

**Response:**
```json
{
  "status": "success",
  "bookeoId": "seat_block_12345xyz",
  "message": "Turno bloqueado en Bookeo",
  "timestamp": "2025-10-10T10:30:02Z"
}
```

**Acción Cloud Function:**
- Guardar en Firestore `bookeo_blocks/2025-11-20_MAÑANA`:
  ```json
  {
    "bookeoId": "seat_block_12345xyz",
    "status": "active",
    "fecha": "2025-11-20",
    "slot": "MAÑANA",
    "createdAt": Timestamp
  }
  ```

---

### Caso 2: Desbloquear T2 exitoso

**Request:**
```json
{
  "action": "DESBLOQUEAR",
  "bookeoId": "seat_block_67890abc",
  "startDate": "2025-11-21",
  "startTime": "18:15",
  "slot": "T2",
  "timestamp": "2025-10-10T16:45:00Z"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Turno desbloqueado en Bookeo",
  "timestamp": "2025-10-10T16:45:03Z"
}
```

**Acción Cloud Function:**
- Actualizar Firestore `bookeo_blocks/2025-11-21_T2`:
  ```json
  {
    "status": "deleted",
    "deletedAt": Timestamp
  }
  ```

---

### Caso 3: Error timeout Bookeo

**Request:**
```json
{
  "action": "BLOQUEAR",
  "startDate": "2025-11-22",
  "startTime": "12:00",
  "slot": "MAÑANA",
  "timestamp": "2025-10-10T12:00:00Z"
}
```

**Response (después de 30s):**
```json
{
  "status": "error",
  "code": "BOOKEO_API_TIMEOUT",
  "message": "Bookeo API no respondió en 30 segundos",
  "timestamp": "2025-10-10T12:00:30Z",
  "retryable": true
}
```

**Acción Cloud Function:**
- Reintentar 3 veces
- Si falla 3 veces: enviar email error a Manager
- Log en Firestore con status `"failed"`

---

## Notas de Implementación

### Cloud Function
- Usar `axios` o `node-fetch` para HTTP requests
- Implementar timeout 30s
- Backoff exponencial: 1s, 2s, 4s
- Log detallado cada intento

### Zapier (Responsabilidad Pablo)
- Validar header `X-Firebase-Source`
- Retornar siempre JSON válido (incluso en errores)
- Timeout máximo 25s para dejar margen Cloud Function
- Log cada request en Zapier history

---

## SLA

- **Disponibilidad:** 99.5% (Zapier SLA)
- **Latencia p95:** <3 segundos
- **Tasa éxito:** >99%
- **Reintentos:** 3 máximo por request

---

## Contacto

**Dudas técnicas:** Equipo desarrollo  
**Configuración Zapier:** Pablo Vázquez  
**Incidencias producción:** Manager (madrid@spainfoodsherpas.com)
