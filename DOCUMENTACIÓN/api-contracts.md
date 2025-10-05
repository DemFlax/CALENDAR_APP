# API Contracts - Calendar & Email Services

## Overview

Este documento especifica los contratos de integración entre Cloud Functions y Apps Script para validación de tours (Calendar API) y envío de emails (GmailApp).

---

## Apps Script Web App - Deployment

### URL Base
```
https://script.google.com/macros/s/{DEPLOYMENT_ID}/exec
```

### Autenticación
- Ejecutado como: `madrid@spainfoodsherpas`
- Access: `Anyone` (sin login, validación por API key en headers)

### Security Headers (Cloud Functions → Apps Script)
```javascript
{
  "X-API-Key": "SECRET_KEY_FROM_ENV",
  "Content-Type": "application/json"
}
```

---

## API 1: Validate Tour Event

### Endpoint
`POST /validateTour`

### Propósito
Verificar si existe un evento en Google Calendar para una fecha/slot específicos.

### Request

**Headers:**
```json
{
  "Content-Type": "application/json",
  "X-API-Key": "SECRET_VALIDATION_KEY"
}
```

**Body:**
```json
{
  "fecha": "YYYY-MM-DD",
  "slot": "MAÑANA" | "T1" | "T2" | "T3"
}
```

**Ejemplo:**
```json
{
  "fecha": "2025-10-15",
  "slot": "T1"
}
```

### Response

**Success (200):**
```json
{
  "exists": true,
  "eventId": "abc123xyz789",
  "summary": "Tour Tapas Madrid Centro",
  "startTime": "2025-10-15T17:15:00+02:00",
  "endTime": "2025-10-15T20:15:00+02:00"
}
```

**Not Found (200):**
```json
{
  "exists": false,
  "eventId": null,
  "summary": null,
  "startTime": null,
  "endTime": null
}
```

**Error (500):**
```json
{
  "error": true,
  "message": "Calendar API error: Rate limit exceeded",
  "code": "RATE_LIMIT"
}
```

### Lógica Interna (Apps Script)

```javascript
function doPost(e) {
  try {
    // Validar API key
    const apiKey = e.parameter.apiKey || 
                   e.postData?.headers?.['X-API-Key'];
    if (apiKey !== PropertiesService.getScriptProperties()
                      .getProperty('API_KEY')) {
      return ContentService.createTextOutput(
        JSON.stringify({error: true, message: "Unauthorized"})
      ).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Parse request
    const payload = JSON.parse(e.postData.contents);
    const { fecha, slot } = payload;
    
    // Map slot → hora inicio
    const slotTimes = {
      'MAÑANA': '12:00',
      'T1': '17:15',
      'T2': '18:15',
      'T3': '19:15'
    };
    const targetTime = slotTimes[slot];
    
    if (!targetTime) {
      return error('Invalid slot');
    }
    
    // Calendar API query
    const calendarId = 'c_61981c641dc3c970e63f1713ccc2daa49d8fe8962b6ed9f2669c4554496c7bdd@group.calendar.google.com';
    const timeMin = new Date(fecha + 'T00:00:00Z');
    const timeMax = new Date(fecha + 'T23:59:59Z');
    
    const events = Calendar.Events.list(calendarId, {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    });
    
    // Buscar evento con hora exacta
    if (events.items && events.items.length > 0) {
      for (const event of events.items) {
        if (!event.start || !event.start.dateTime) continue;
        
        const eventTime = new Date(event.start.dateTime);
        const hours = String(eventTime.getHours()).padStart(2, '0');
        const minutes = String(eventTime.getMinutes()).padStart(2, '0');
        const eventTimeStr = `${hours}:${minutes}`;
        
        if (eventTimeStr === targetTime) {
          return success({
            exists: true,
            eventId: event.id,
            summary: event.summary || 'Sin título',
            startTime: event.start.dateTime,
            endTime: event.end?.dateTime || null
          });
        }
      }
    }
    
    // No encontrado
    return success({
      exists: false,
      eventId: null,
      summary: null,
      startTime: null,
      endTime: null
    });
    
  } catch (err) {
    Logger.log('Error in validateTour: ' + err.toString());
    return error(err.toString(), 'INTERNAL_ERROR');
  }
}

function success(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function error(message, code = 'ERROR') {
  return ContentService.createTextOutput(
    JSON.stringify({error: true, message, code})
  ).setMimeType(ContentService.MimeType.JSON);
}
```

### Tiempos Esperados
- Latencia p50: 800ms
- Latencia p95: 1500ms
- Timeout: 5000ms

### Rate Limits
- Calendar API: 100 queries/min/user
- Estrategia: Cache en Cloud Function memory (5min TTL)

### Errores Comunes

| Código | Causa | Acción |
|--------|-------|--------|
| `RATE_LIMIT` | >100 req/min | Retry exponential backoff |
| `CALENDAR_NOT_FOUND` | Calendar ID inválido | Verificar config |
| `UNAUTHORIZED` | API key inválido | Regenerar key |
| `INVALID_DATE` | Formato fecha incorrecto | Validar YYYY-MM-DD |

---

## API 2: Send Email

### Endpoint
`POST /sendEmail`

### Propósito
Enviar email desde madrid@spainfoodsherpas usando GmailApp.

### Request

**Headers:**
```json
{
  "Content-Type": "application/json",
  "X-API-Key": "SECRET_EMAIL_KEY"
}
```

**Body:**
```json
{
  "to": "email@ejemplo.com",
  "subject": "Asunto del email",
  "body": "Cuerpo HTML del email",
  "type": "ASIGNACION" | "LIBERACION" | "INVITACION"
}
```

**Ejemplo Asignación:**
```json
{
  "to": "maria@gmail.com",
  "subject": "Nueva asignación - 15/10/2025 T1",
  "body": "<h2>Nueva asignación</h2><p>Hola María,</p><p>Se te ha asignado el siguiente turno:</p><ul><li>Fecha: 15 de octubre de 2025</li><li>Hora: 17:15</li><li>Tipo: T1</li></ul><p>Saludos,<br>Spain Food Sherpas</p>",
  "type": "ASIGNACION"
}
```

**Ejemplo Liberación:**
```json
{
  "to": "juan@gmail.com",
  "subject": "Turno liberado - 20/10/2025 MAÑANA",
  "body": "<h2>Turno liberado</h2><p>Hola Juan,</p><p>Tu turno del 20 de octubre de 2025 (MAÑANA) ha sido liberado por el Manager.</p><p>Saludos,<br>Spain Food Sherpas</p>",
  "type": "LIBERACION"
}
```

**Ejemplo Invitación:**
```json
{
  "to": "nuevo@gmail.com",
  "subject": "Invitación - Spain Food Sherpas",
  "body": "<h2>¡Bienvenido!</h2><p>Hola,</p><p>Has sido invitado como guía de Spain Food Sherpas.</p><p>Establece tu contraseña haciendo clic en el siguiente enlace:</p><p><a href='https://calendario.spainfoodsherpas.com/__/auth/action?mode=resetPassword&oobCode=ABC123'>Establecer contraseña</a></p><p>Este enlace expira en 7 días.</p><p>Saludos,<br>Spain Food Sherpas</p>",
  "type": "INVITACION"
}
```

### Response

**Success (200):**
```json
{
  "sent": true,
  "messageId": "thread-id-xyz789",
  "timestamp": "2025-10-15T10:30:00Z"
}
```

**Error (500):**
```json
{
  "error": true,
  "sent": false,
  "message": "Daily email quota exceeded",
  "code": "QUOTA_EXCEEDED"
}
```

### Lógica Interna (Apps Script)

```javascript
function doPost(e) {
  try {
    // Validar API key
    const apiKey = e.parameter.apiKey || 
                   e.postData?.headers?.['X-API-Key'];
    if (apiKey !== PropertiesService.getScriptProperties()
                      .getProperty('EMAIL_API_KEY')) {
      return error("Unauthorized");
    }
    
    // Parse request
    const payload = JSON.parse(e.postData.contents);
    const { to, subject, body, type } = payload;
    
    // Validaciones
    if (!to || !subject || !body) {
      return error("Missing required fields");
    }
    
    // Validar email formato
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return error("Invalid email format");
    }
    
    // Enviar email
    GmailApp.sendEmail(to, subject, "", {
      htmlBody: body,
      name: "Spain Food Sherpas",
      noReply: false
    });
    
    // Obtener thread ID (para referencia)
    const threads = GmailApp.search(`to:${to} subject:"${subject}"`, 0, 1);
    const messageId = threads.length > 0 ? threads[0].getId() : null;
    
    return success({
      sent: true,
      messageId: messageId,
      timestamp: new Date().toISOString()
    });
    
  } catch (err) {
    Logger.log('Error in sendEmail: ' + err.toString());
    
    // Detectar quota exceeded
    if (err.toString().includes('quota')) {
      return error('Daily email quota exceeded', 'QUOTA_EXCEEDED');
    }
    
    return error(err.toString(), 'INTERNAL_ERROR');
  }
}
```

### Tiempos Esperados
- Latencia p50: 500ms
- Latencia p95: 1000ms
- Timeout: 3000ms

### Rate Limits
- GmailApp: 2,000 emails/día (Workspace)
- Uso estimado: ~20/día

### Plantillas Email

#### Template: Asignación
```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; }
    .container { max-width: 600px; margin: 0 auto; }
    .header { background: #2563eb; color: white; padding: 20px; }
    .content { padding: 20px; }
    .details { background: #f3f4f6; padding: 15px; border-radius: 8px; }
    .footer { color: #6b7280; font-size: 12px; padding: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Nueva asignación de turno</h2>
    </div>
    <div class="content">
      <p>Hola <strong>{{nombreGuia}}</strong>,</p>
      <p>Se te ha asignado el siguiente turno:</p>
      <div class="details">
        <p><strong>Fecha:</strong> {{fechaLegible}}</p>
        <p><strong>Hora de inicio:</strong> {{horaInicio}}</p>
        <p><strong>Turno:</strong> {{slot}}</p>
      </div>
      <p>Puedes ver todos tus turnos en el <a href="https://calendario.spainfoodsherpas.com">dashboard</a>.</p>
    </div>
    <div class="footer">
      <p>Spain Food Sherpas<br>Madrid, España</p>
    </div>
  </div>
</body>
</html>
```

#### Template: Liberación
```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; }
    .container { max-width: 600px; margin: 0 auto; }
    .header { background: #dc2626; color: white; padding: 20px; }
    .content { padding: 20px; }
    .details { background: #fee2e2; padding: 15px; border-radius: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Turno liberado</h2>
    </div>
    <div class="content">
      <p>Hola <strong>{{nombreGuia}}</strong>,</p>
      <p>Tu turno ha sido liberado por el Manager:</p>
      <div class="details">
        <p><strong>Fecha:</strong> {{fechaLegible}}</p>
        <p><strong>Turno:</strong> {{slot}}</p>
      </div>
      <p>Este turno ya no aparecerá como asignado en tu calendario.</p>
    </div>
  </div>
</body>
</html>
```

#### Template: Invitación
```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; }
    .container { max-width: 600px; margin: 0 auto; }
    .header { background: #059669; color: white; padding: 20px; }
    .content { padding: 20px; }
    .button { 
      display: inline-block; 
      background: #059669; 
      color: white; 
      padding: 12px 24px; 
      text-decoration: none; 
      border-radius: 6px; 
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>¡Bienvenido a Spain Food Sherpas!</h2>
    </div>
    <div class="content">
      <p>Hola,</p>
      <p>Has sido invitado como guía de nuestro equipo.</p>
      <p>Para acceder al sistema, establece tu contraseña:</p>
      <a href="{{actionLink}}" class="button">Establecer contraseña</a>
      <p><small>Este enlace expira en 7 días.</small></p>
      <p>Una vez establecida tu contraseña, podrás acceder al calendario y gestionar tu disponibilidad.</p>
    </div>
  </div>
</body>
</html>
```

### Errores Comunes

| Código | Causa | Acción |
|--------|-------|--------|
| `QUOTA_EXCEEDED` | >2,000 emails/día | Implementar batch daily |
| `INVALID_EMAIL` | Email malformado | Validar en frontend |
| `UNAUTHORIZED` | API key incorrecto | Regenerar key |
| `BOUNCE` | Email no entregado | Verificar con guía |

---

## Cloud Function → Apps Script Integration

### Cloud Function Code Example

```javascript
// functions/src/integrations/appsScript.js

const fetch = require('node-fetch');

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const APPS_SCRIPT_API_KEY = process.env.APPS_SCRIPT_API_KEY;

/**
 * Validar si existe tour en Calendar
 */
async function validateTour(fecha, slot) {
  try {
    const response = await fetch(`${APPS_SCRIPT_URL}?endpoint=validateTour`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': APPS_SCRIPT_API_KEY
      },
      body: JSON.stringify({ fecha, slot }),
      timeout: 5000
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.message);
    }
    
    return data.exists;
    
  } catch (error) {
    console.error('Error validating tour:', error);
    throw new Error('Calendar validation failed');
  }
}

/**
 * Enviar email via GmailApp
 */
async function sendEmail(to, subject, body, type) {
  try {
    const response = await fetch(`${APPS_SCRIPT_URL}?endpoint=sendEmail`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': APPS_SCRIPT_API_KEY
      },
      body: JSON.stringify({ to, subject, body, type }),
      timeout: 3000
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.message);
    }
    
    return data.sent;
    
  } catch (error) {
    console.error('Error sending email:', error);
    // No throw - email failure should not block operation
    return false;
  }
}

module.exports = {
  validateTour,
  sendEmail
};
```

### Uso en Cloud Function

```javascript
// functions/src/triggers/onUpdateShift.js

const { validateTour, sendEmail } = require('../integrations/appsScript');
const { db } = require('../firebase');

exports.onUpdateShift = functions.firestore
  .document('shifts/{shiftId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    
    // Detectar asignación: LIBRE → ASIGNADO
    if (before.estado === 'LIBRE' && after.estado === 'ASIGNADO') {
      try {
        // 1. Validar Calendar
        const exists = await validateTour(after.fecha, after.slot);
        
        if (!exists) {
          // Revertir cambio
          await change.after.ref.update({
            estado: 'LIBRE',
            guiaId: null
          });
          throw new Error('NO EXISTE TOUR EN ESE HORARIO');
        }
        
        // 2. Obtener datos guía
        const guideDoc = await db.collection('guides')
          .doc(after.guiaId)
          .get();
        
        if (!guideDoc.exists) {
          throw new Error('Guía no encontrado');
        }
        
        const guide = guideDoc.data();
        
        // 3. Enviar email
        const subject = `Nueva asignación - ${after.fecha} ${after.slot}`;
        const body = buildAssignmentEmail(guide.nombre, after);
        
        const sent = await sendEmail(
          guide.email,
          subject,
          body,
          'ASIGNACION'
        );
        
        // 4. Registrar notificación
        await db.collection('notifications').add({
          guiaId: after.guiaId,
          tipo: 'ASIGNACION',
          shiftId: context.params.shiftId,
          emailTo: guide.email,
          status: sent ? 'sent' : 'failed',
          errorMessage: sent ? null : 'Email sending failed',
          sentAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
      } catch (error) {
        console.error('Error processing shift assignment:', error);
        throw error;
      }
    }
    
    // Detectar liberación: ASIGNADO → LIBRE
    if (before.estado === 'ASIGNADO' && after.estado === 'LIBRE') {
      // Similar logic para email liberación
    }
  });

function buildAssignmentEmail(nombreGuia, shift) {
  const slotTimes = {
    'MAÑANA': '12:00',
    'T1': '17:15',
    'T2': '18:15',
    'T3': '19:15'
  };
  
  return `
    <h2>Nueva asignación de turno</h2>
    <p>Hola <strong>${nombreGuia}</strong>,</p>
    <p>Se te ha asignado el siguiente turno:</p>
    <ul>
      <li><strong>Fecha:</strong> ${formatDate(shift.fecha)}</li>
      <li><strong>Hora:</strong> ${slotTimes[shift.slot]}</li>
      <li><strong>Turno:</strong> ${shift.slot}</li>
    </ul>
    <p>Saludos,<br>Spain Food Sherpas</p>
  `;
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}
```

---

## Testing

### Apps Script - Unit Tests

```javascript
// test/appsscript/validateTour.test.js

function testValidateTour_Exists() {
  const result = validateTour({
    postData: {
      contents: JSON.stringify({
        fecha: '2025-10-15',
        slot: 'T1'
      })
    },
    parameter: {
      apiKey: 'test-key'
    }
  });
  
  const data = JSON.parse(result.getContent());
  
  if (!data.exists) {
    throw new Error('Expected event to exist');
  }
  
  Logger.log('✓ testValidateTour_Exists passed');
}

function testValidateTour_NotFound() {
  const result = validateTour({
    postData: {
      contents: JSON.stringify({
        fecha: '2099-12-31',
        slot: 'T3'
      })
    },
    parameter: {
      apiKey: 'test-key'
    }
  });
  
  const data = JSON.parse(result.getContent());
  
  if (data.exists) {
    throw new Error('Expected event to not exist');
  }
  
  Logger.log('✓ testValidateTour_NotFound passed');
}
```

### Cloud Functions - Integration Tests

```javascript
// functions/test/integration/appsScript.test.js

const { validateTour, sendEmail } = require('../../src/integrations/appsScript');

describe('Apps Script Integration', () => {
  
  it('should validate existing tour', async () => {
    const exists = await validateTour('2025-10-15', 'T1');
    expect(exists).toBe(true);
  });
  
  it('should return false for non-existing tour', async () => {
    const exists = await validateTour('2099-12-31', 'T3');
    expect(exists).toBe(false);
  });
  
  it('should send email successfully', async () => {
    const sent = await sendEmail(
      'test@example.com',
      'Test Subject',
      '<p>Test body</p>',
      'ASIGNACION'
    );
    expect(sent).toBe(true);
  });
  
  it('should handle timeout gracefully', async () => {
    // Mock timeout
    jest.setTimeout(6000);
    await expect(validateTour('2025-10-15', 'T1'))
      .rejects.toThrow('Calendar validation failed');
  });
  
});
```

---

## Monitoring & Observability

### Apps Script Logs

```javascript
// Structured logging en Apps Script
function logInfo(message, context = {}) {
  Logger.log(JSON.stringify({
    level: 'INFO',
    timestamp: new Date().toISOString(),
    message,
    ...context
  }));
}

function logError(message, error, context = {}) {
  Logger.log(JSON.stringify({
    level: 'ERROR',
    timestamp: new Date().toISOString(),
    message,
    error: error.toString(),
    stack: error.stack,
    ...context
  }));
}
```

### Metrics

| Métrica | Descripción | Alerta |
|---------|-------------|--------|
| `appsscript_validate_tour_latency` | Latencia validación | >2000ms |
| `appsscript_send_email_success_rate` | % emails enviados | <95% |
| `appsscript_api_errors` | Errores totales | >10/hora |
| `calendar_api_rate_limit_hits` | Rate limit hits | >0 |

---

## Versionado

**Apps Script API Version:** 1.0  
**Compatibilidad:** Cloud Functions v1.0+  
**Breaking changes:** Notificar con 30 días anticipación

---

**Última actualización:** 2025-10-03
