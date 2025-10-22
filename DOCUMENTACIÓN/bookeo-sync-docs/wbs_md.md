# WBS + Plan QA: Sincronización Bookeo

**Proyecto:** Calendar App Tours Madrid  
**Feature:** Sincronización automática Bookeo  
**Versión:** 2.0 (actualizada CHAT_50)  
**Estimación Total:** 18h (Fase 1)  
**Fecha:** 21 Octubre 2025

---

## Work Breakdown Structure (WBS)

### **FASE 0: COORDINACIÓN** (2h - BLOQUEANTE)

#### WBS-00.1: Reunión kickoff Pablo
- **Responsable:** Manager + Pablo
- **Duración:** 1h
- **Entregables:**
  - [ ] URL webhook Zapier (staging + prod)
  - [ ] Secret key webhook
  - [ ] Confirmación acceso Bookeo API
  - [ ] Validación slots: MAÑANA (12:00), T1 (17:15), T2 (18:15)
  - [ ] Confirmación turnos solapados 17:15 ↔ 18:15

#### WBS-00.2: Validar Firebase Functions proyecto
- **Responsable:** Tech Lead
- **Duración:** 0.5h
- **Entregables:**
  - [ ] Firebase Functions habilitado en `calendar-app-tours`
  - [ ] Node.js configurado (v16+)
  - [ ] Permisos Cloud Functions deployer

#### WBS-00.3: Crear branch feature
- **Responsable:** Tech Lead
- **Duración:** 0.5h
- **Entregables:**
  - [ ] Branch `feature/bookeo-sync` creado
  - [ ] Branch protegida en repo

---

### **FASE 1: MODELO DATOS** (1h)

#### WBS-01.1: Actualizar esquema Firestore
- **Responsable:** Backend Dev
- **Duración:** 0.5h
- **Entregables:**
  - [ ] Campos Bookeo añadidos a `/shifts`
  - [ ] Documentación esquema actualizada

#### WBS-01.2: Actualizar índices Firestore
- **Responsable:** Backend Dev
- **Duración:** 0.25h
- **Entregables:**
  - [ ] `firestore.indexes.json` actualizado
  - [ ] Índices deployed

#### WBS-01.3: Actualizar Firestore Rules
- **Responsable:** Backend Dev
- **Duración:** 0.25h
- **Entregables:**
  - [ ] Rules permiten updates campos Bookeo
  - [ ] Rules deployed y validadas

---

### **FASE 2: CLOUD FUNCTION** (5h)

#### WBS-02.1: Setup inicial
- **Responsable:** Backend Dev
- **Duración:** 0.5h
- **Código:**
```javascript
// functions/index.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.syncBookeoAvailability = functions.firestore
  .document('shifts/{shiftId}')
  .onUpdate(async (change, context) => {
    // Implementación
  });
```
- **Entregables:**
  - [ ] Estructura básica Cloud Function
  - [ ] Imports configurados

#### WBS-02.2: Helper detectFullBlockage()
- **Responsable:** Backend Dev
- **Duración:** 1h
- **Código:**
```javascript
function detectFullBlockage(before, after) {
  // Cambió a todos NO_DISPONIBLE
  if (before.allUnavailable === false && after.allUnavailable === true) {
    return true;
  }
  // forceBlock activado
  if (before.forceBlock === false && after.forceBlock === true) {
    return true;
  }
  return false;
}
```
- **Entregables:**
  - [ ] Función implementada
  - [ ] Tests unitarios

#### WBS-02.3: Helper detectUnblock()
- **Responsable:** Backend Dev
- **Duración:** 0.5h
- **Código:**
```javascript
function detectUnblock(before, after) {
  // Guías volvieron disponibles
  if (before.allUnavailable === true && after.allUnavailable === false) {
    // Verificar que esté bloqueado
    if (after.bookeoStatus === 'blocked' && after.bookeoId) {
      // forceBlock no debe estar activo
      return after.forceBlock !== true;
    }
  }
  // forceBlock desactivado
  if (before.forceBlock === true && after.forceBlock === false) {
    if (after.allUnavailable === false) {
      return true;
    }
  }
  return false;
}
```
- **Entregables:**
  - [ ] Función implementada
  - [ ] Tests unitarios

#### WBS-02.4: Helper sendZapierWebhook()
- **Responsable:** Backend Dev
- **Duración:** 1.5h
- **Código:**
```javascript
const axios = require('axios');

async function sendZapierWebhook(payload) {
  const config = functions.config();
  const maxRetries = 3;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.post(
        config.zapier.webhook_url,
        JSON.stringify(payload),
        {
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
            'X-Webhook-Secret': config.zapier.webhook_secret,
            'X-Firebase-Source': 'calendar-app-tours'
          },
          timeout: 30000
        }
      );
      
      if (response.data.status === 'success') {
        return { success: true, data: response.data, attempts: attempt };
      }
      
      if (response.data.retryable === false) {
        return { success: false, error: response.data, attempts: attempt };
      }
      
      if (attempt < maxRetries) {
        await sleep(Math.pow(2, attempt - 1) * 1000);
      }
    } catch (error) {
      functions.logger.error(`Intento ${attempt}`, error);
      if (attempt < maxRetries) {
        await sleep(Math.pow(2, attempt - 1) * 1000);
      }
    }
  }
  
  return {
    success: false,
    error: { code: 'MAX_RETRIES_EXCEEDED' },
    attempts: maxRetries
  };
}
```
- **Entregables:**
  - [ ] Función implementada
  - [ ] Content-Type correcto
  - [ ] Reintentos backoff
  - [ ] Tests unitarios

#### WBS-02.5: Helper buildWebhookPayload()
- **Responsable:** Backend Dev
- **Duración:** 0.5h
- **Código:**
```javascript
function buildWebhookPayload(action, shiftId, shiftData) {
  const [fecha, slot] = shiftId.split('_');
  const timeMap = {
    'MAÑANA': '12:00',
    'T1': '17:15',
    'T2': '18:15'
  };
  
  const payload = {
    action,
    startDate: fecha,
    startTime: timeMap[slot],
    slot,
    reason: shiftData.forceBlock ? 'manual' : 'automatic',
    timestamp: new Date().toISOString()
  };
  
  if (action === 'DESBLOQUEAR') {
    payload.bookeoId = shiftData.bookeoId;
  }
  
  return payload;
}
```
- **Entregables:**
  - [ ] Función implementada
  - [ ] Tests unitarios

#### WBS-02.6: Helper updateFirestore()
- **Responsable:** Backend Dev
- **Duración:** 1h
- **Entregables:**
  - [ ] Actualiza Firestore tras webhook
  - [ ] Guarda bookeoId
  - [ ] Actualiza bookeoStatus
  - [ ] Tests unitarios

---

### **FASE 3: EMAILS MANAGER** (2h)

#### WBS-03.1: Templates email
- **Responsable:** Backend Dev
- **Duración:** 1h
- **Entregables:**
  - [ ] Template bloqueo (HTML)
  - [ ] Template desbloqueo
  - [ ] Template error

#### WBS-03.2: Helper sendManagerEmail()
- **Responsable:** Backend Dev
- **Duración:** 1h
- **Entregables:**
  - [ ] Gmail API integración
  - [ ] Tests envío

---

### **FASE 4: INTEGRACIÓN ZAPIER** (2h - Pablo)

#### WBS-04.1: Configurar Zap staging
- **Responsable:** Pablo
- **Duración:** 1h
- **Entregables:**
  - [ ] Webhook trigger configurado
  - [ ] Validación payload
  - [ ] Transformación fechas
  - [ ] POST/DELETE /seatblocks

#### WBS-04.2: Testing webhook dev → Zapier
- **Responsable:** Pablo + Tech Lead
- **Duración:** 1h
- **Entregables:**
  - [ ] Payload BLOQUEAR → response bookeoId
  - [ ] Payload DESBLOQUEAR → response success
  - [ ] Manejo errores validado

---

### **FASE 5: TESTING E2E** (3h)

Ver sección Plan QA completo abajo.

---

### **FASE 6: STAGING** (1h)

#### WBS-06.1: Deploy Cloud Functions staging
- **Responsable:** Tech Lead
- **Duración:** 0.5h
- **Comandos:**
```bash
firebase use calendar-app-tours-staging
firebase deploy --only functions
```
- **Entregables:**
  - [ ] Functions deployed
  - [ ] Variables config staging

#### WBS-06.2: UAT Manager
- **Responsable:** Manager + Tech Lead
- **Duración:** 0.5h
- **Entregables:**
  - [ ] 3 casos reales probados
  - [ ] Feedback Manager recolectado

---

### **FASE 7: PRODUCCIÓN** (1h)

#### WBS-07.1: Deploy Cloud Functions prod
- **Responsable:** Tech Lead
- **Duración:** 0.25h
- **Comandos:**
```bash
firebase use calendar-app-tours
firebase deploy --only functions
```

#### WBS-07.2: Zapier prod activo
- **Responsable:** Pablo
- **Duración:** 0.25h
- **Entregables:**
  - [ ] Zap prod ON
  - [ ] Bookeo prod configurado

#### WBS-07.3: Monitoreo 48h
- **Responsable:** Tech Lead
- **Duración:** 0.5h (distribuido)
- **Entregables:**
  - [ ] Logs revisados cada 12h
  - [ ] Emails Manager verificados
  - [ ] Métricas latency <5s

---

## Plan QA Detallado

### Testing Unitario (Cloud Functions)

#### Test Suite 1: Detección Bloqueo
```javascript
const assert = require('assert');

describe('detectFullBlockage', () => {
  it('detecta cambio a allUnavailable', () => {
    const before = { allUnavailable: false, forceBlock: false };
    const after = { allUnavailable: true, forceBlock: false };
    assert.strictEqual(detectFullBlockage(before, after), true);
  });
  
  it('detecta forceBlock activado', () => {
    const before = { allUnavailable: false, forceBlock: false };
    const after = { allUnavailable: false, forceBlock: true };
    assert.strictEqual(detectFullBlockage(before, after), true);
  });
  
  it('NO detecta si no cambió', () => {
    const before = { allUnavailable: true, forceBlock: false };
    const after = { allUnavailable: true, forceBlock: false };
    assert.strictEqual(detectFullBlockage(before, after), false);
  });
});
```

#### Test Suite 2: Webhook
```javascript
describe('sendZapierWebhook', () => {
  it('envía exitoso intento 1', async () => {
    // Mock axios response
    const result = await sendZapierWebhook({ action: 'BLOQUEAR' });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.attempts, 1);
  });
  
  it('reintenta tras timeout', async () => {
    // Mock timeout intento 1, éxito intento 2
    const result = await sendZapierWebhook({ action: 'BLOQUEAR' });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.attempts, 2);
  });
});
```

---

### Testing E2E

#### E2E-01: Bloqueo Automático MAÑANA
**Objetivo:** Validar flujo completo bloqueo automático

**Precondiciones:**
- Documento Firestore `/shifts/2025-11-30_MAÑANA`
- guidesAvailable: 5, allUnavailable: false
- Zapier staging ON

**Pasos:**
1. Actualizar Firestore: allUnavailable = true
2. Esperar 5 segundos

**Resultado Esperado:**
- ✅ Cloud Function onUpdate trigger <3s
- ✅ Webhook enviado a Zapier
- ✅ Zapier responde bookeoId
- ✅ Firestore actualizado:
  - bookeoId: presente
  - bookeoStatus: "blocked"
  - bookeoBlockedAt: timestamp
- ✅ Email Manager recibido:
  - Asunto: 🚫 Turno bloqueado: 30 Nov MAÑANA
  - Lista 5 guías NO_DISPONIBLE
- ✅ Bookeo turno 30 Nov 12:00 bloqueado

**Validación Bookeo:**
```bash
# Verificar bloqueo en Bookeo
curl -X GET "https://api.bookeo.com/v2/seatblocks?startTime=2025-11-30T00:00:00Z&endTime=2025-11-30T23:59:59Z" \
  -H "X-Bookeo-secretKey: XXX" \
  -H "X-Bookeo-apiKey: YYY"
```

---

#### E2E-02: Desbloqueo Automático
**Objetivo:** Validar flujo completo desbloqueo automático

**Precondiciones:**
- Turno 2025-11-30 MAÑANA bloqueado (E2E-01)
- bookeoId en Firestore

**Pasos:**
1. Actualizar Firestore: guidesAvailable = 1, allUnavailable = false
2. Esperar 5 segundos

**Resultado:**
- ✅ Cloud Function detecta cambio
- ✅ Webhook DESBLOQUEAR enviado
- ✅ Firestore actualizado:
  - bookeoStatus: "unblocked"
  - bookeoUnblockedAt: timestamp
- ✅ Email Manager:
  - Asunto: ✅ Turno desbloqueado: 30 Nov MAÑANA
  - Guía disponible
- ✅ Bookeo turno acepta reservas

---

#### E2E-03: Bloqueo Manual forceBlock
**Objetivo:** Validar bloqueo manual

**Precondiciones:**
- Turno 2025-12-01 MAÑANA libre
- guidesAvailable: 3 (disponibilidad normal)

**Pasos:**
1. Actualizar Firestore: forceBlock = true
2. Esperar 3 segundos

**Resultado:**
- ✅ Webhook enviado inmediato (ignora guías LIBRES)
- ✅ Firestore:
  - forceBlock: true
  - bookeoStatus: "blocked"
- ✅ Email: "Razón: Bloqueo manual forzado"
- ✅ Bookeo bloqueado

---

#### E2E-04: Turnos Solapados 17:15 ↔ 18:15
**Objetivo:** Validar comportamiento turnos solapados

**Precondiciones:**
- Turno 2025-12-02 T1 (17:15) libre
- Turno 2025-12-02 T2 (18:15) libre
- 5 guías

**Pasos:**
1. Actualizar Firestore: /shifts/2025-12-02_T1 allUnavailable = true
2. Verificar Bookeo

**Resultado:**
- ✅ Solo webhook T1 enviado
- ✅ Bookeo bloquea T1 Y elimina T2 automático
- ✅ Firestore solo "_T1" actualizado

**Pasos Desbloqueo:**
3. Actualizar: guidesAvailable = 1, allUnavailable = false
4. Cloud Function desbloquea T1

**Resultado:**
- ✅ Bookeo restaura AMBOS turnos (T1 y T2)
- ✅ Firestore actualiza solo "_T1"

---

#### E2E-05: Error Timeout Zapier
**Objetivo:** Validar manejo errores y reintentos

**Precondiciones:**
- Zapier staging pausado (simular timeout)

**Pasos:**
1. Actualizar Firestore: allUnavailable = true
2. Observar reintentos Cloud Function

**Resultado:**
- ✅ Intento 1 → Timeout 30s
- ✅ Espera 1s, intento 2 → Timeout
- ✅ Espera 2s, intento 3 → Timeout
- ✅ Firestore:
  - bookeoSyncAttempts: 3
  - bookeoLastError: "Timeout after 3 attempts"
  - bookeoStatus: NULL
- ✅ Email Manager:
  - Asunto: ⚠️ ERROR SincronizaciónBookeo: 30 Nov MAÑANA
  - "Intento: 3/3"
  - "ACCIÓN REQUERIDA: Verificar manualmente"

---

#### E2E-06: bookeoId Inválido (Desbloqueo)
**Objetivo:** Validar error bookeoId no encontrado

**Precondiciones:**
- Firestore con bookeoId "invalid_test_id"
- bookeoStatus "blocked"

**Pasos:**
1. Actualizar: guidesAvailable = 1 (trigger desbloqueo)
2. Webhook DESBLOQUEAR enviado con bookeoId inválido

**Resultado:**
- ✅ Zapier DELETE /seatblocks/invalid_test_id → 404 Not Found
- ✅ Zapier response:
  ```json
  {
    "status": "error",
    "code": "BOOKEO_ID_NOT_FOUND",
    "retryable": false
  }
  ```
- ✅ Cloud Function NO reintenta
- ✅ Firestore:
  - bookeoLastError: "BOOKEO_ID_NOT_FOUND"
- ✅ Email Manager con acción manual

---

### Testing Performance

#### Performance-01: Latencia E2E
**Métrica:** Tiempo desde cambio Firestore → Bookeo bloqueado

**Target:** <5 segundos (p95)

**Medición:**
```
T0: Firestore update
T1: Cloud Function trigger
T2: Webhook enviado
T3: Zapier responde
T4: Firestore actualizado

Latencia total = T4 - T0
```

**Validación:**
- ✅ p50 < 3s
- ✅ p95 < 5s
- ✅ p99 < 8s

---

#### Performance-02: Throughput Concurrente
**Escenario:** 3 turnos bloquean simultáneamente

**Pasos:**
1. MAÑANA, T1, T2 todos allUnavailable = true simultáneo
2. Medir éxito 3 webhooks

**Resultado:**
- ✅ 3 webhooks enviados
- ✅ 3 responses exitosas
- ✅ 3 Firestore updates
- ✅ 3 emails Manager
- ✅ Latencia individual <5s cada uno

---

### Testing Seguridad

#### Security-01: Webhook Secret Inválido
**Objetivo:** Validar autenticación webhook

**Pasos:**
1. Enviar webhook con X-Webhook-Secret incorrecto

**Resultado:**
- ✅ Zapier rechaza request
- ✅ Response 401 Unauthorized
- ✅ Cloud Function registra error
- ✅ NO reintenta (error no retryable)

---

#### Security-02: Firestore Rules
**Objetivo:** Validar permisos campos Bookeo

**Pasos:**
1. Intentar actualizar bookeoId desde rol "guia"

**Resultado:**
- ✅ Firestore rechaza write
- ✅ Solo rol "cloudfunction" puede actualizar

---

### Checklist Definitivo Testing

**Antes de Staging:**
- [ ] Todos tests unitarios PASS
- [ ] Cobertura código >80%
- [ ] JSDoc completo
- [ ] Logs estructurados implementados

**Staging (1 semana):**
- [ ] E2E-01: Bloqueo automático ✅
- [ ] E2E-02: Desbloqueo automático ✅
- [ ] E2E-03: Bloqueo manual forceBlock ✅
- [ ] E2E-04: Turnos solapados ✅
- [ ] E2E-05: Error timeout ✅
- [ ] E2E-06: bookeoId inválido ✅
- [ ] Performance-01: Latencia <5s ✅
- [ ] Performance-02: Concurrente ✅
- [ ] Security-01: Autenticación ✅
- [ ] Security-02: Firestore Rules ✅
- [ ] UAT Manager aprobado ✅

**Producción:**
- [ ] Deploy viernes 17:00
- [ ] Monitoreo logs 48h
- [ ] Métricas latency <5s
- [ ] 0 errores críticos
- [ ] Manager satisfacción ≥8/10

---

## Definición de DONE

### Código
- [ ] Cloud Function implementada segúnespecificaciones
- [ ] Tests unitarios >80% cobertura
- [ ] JSDoc en funciones públicas
- [ ] Variables en Firebase config (no hardcode)
- [ ] Logs estructurados (JSON)
- [ ] Code review aprobado

### QA
- [ ] Todos escenarios E2E PASS
- [ ] Performance validado (<5s p95)
- [ ] Seguridad validada
- [ ] Emails Manager recibidos correctamente
- [ ] Bookeo bloqueado/desbloqueado verificado manualmente

### Documentación
- [ ] PRD aprobado
- [ ] ADR-006 aprobado
- [ ] Runbook operaciones
- [ ] Training Manager
- [ ] Postmortem template preparado

### Producción
- [ ] Deploy exitoso
- [ ] 48h monitoreo sin errores críticos
- [ ] UAT Manager aprobado
- [ ] Rollback plan validado

---

**Versión:** 2.0  
**Última actualización:** 21 Octubre 2025  
**Aprobado por:** Pendiente
