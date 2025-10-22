# PRD: Sincronización Automática Bookeo

**Proyecto:** Calendar App Tours Madrid  
**Versión:** 2.0 (actualizada CHAT_50)  
**Fecha:** 21 Octubre 2025  
**Responsable:** Director Técnico + PMO  

---

## 1. Resumen Ejecutivo

### Problema
Bookeo acepta reservas en turnos sin guías, generando conflictos operativos.

### Solución
Cloud Function sincroniza disponibilidad Firestore → Bookeo vía Zapier en <5s.

### Beneficios
- 0 reservas sin guías post-implementación
- Ahorro tiempo Manager: ~2h/semana
- Reducción cancelaciones: -90%

---

## 2. Objetivos

### Objetivos Primarios
1. Bloquear turnos cuando 100% guías NO_DISPONIBLE
2. Desbloquear cuando ≥1 guía LIBRE
3. Notificar Manager email
4. Bloqueo manual vía Firestore field

### Métricas Éxito
- Tasa éxito webhooks: >99%
- Tiempo respuesta: <5s
- Reservas sin guías: 0

---

## 3. Alcance

### IN SCOPE
✅ Cloud Function trigger Firestore onUpdate  
✅ Webhook Zapier  
✅ Bloqueo/desbloqueo Bookeo  
✅ Emails Manager  
✅ Campo `forceBlock` en Firestore  
✅ Manejo turnos solapados  
✅ Reintentos 3x  

### OUT SCOPE
❌ Email pre-tour clientes (Fase 2)  
❌ Dashboard visualización  

---

## 4. Requisitos Funcionales

### RF-01: Detección Bloqueo
Cloud Function detecta cambios Firestore `/shifts/{docId}`.

**Criterios:**
- Trigger: `onUpdate` en Firestore
- MAÑANA: considerar solo MAÑANA
- TARDE: considerar TARDE (T1+T2)
- Solo guías activos

**Flujo:**
```
Firestore /shifts actualizado
  ↓
Cloud Function onUpdate
  ↓
¿100% guías NO_DISPONIBLE?
  ↓ Sí
Webhook BLOQUEAR
```

---

### RF-02: Detección Desbloqueo

**Criterios:**
- Verificar `bookeoStatus: "blocked"`
- Validar `bookeoId` existe
- ≥1 guía LIBRE trigger desbloqueo

---

### RF-03: Bloqueo Manual
Campo Firestore `forceBlock: true` fuerza bloqueo independiente de guías.

**Casos uso:**
- Clima adverso
- Feriado
- Emergencia operativa

---

### RF-04: Webhook Zapier

**Especificación:**
- **URL:** Proporcionada por Pablo
- **Content-Type:** `text/plain;charset=utf-8` (CORS)
- **Timeout:** 30s
- **Reintentos:** 3 con backoff (1s, 2s, 4s)

**Payload BLOQUEAR:**
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

**Payload DESBLOQUEAR:**
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

---

### RF-05: Almacenamiento

**Firestore `/shifts/{docId}`:**
```javascript
{
  bookeoId: "xyz789abc",
  bookeoStatus: "blocked",
  bookeoBlockedAt: Timestamp,
  bookeoLastSync: Timestamp
}
```

---

### RF-06: Emails Manager

**Bloqueo:**
```
Para: madrid@spainfoodsherpas.com
Asunto: 🚫 Turno bloqueado: 15 Nov MAÑANA

Razón: 100% guías NO_DISPONIBLE
bookeoId: xyz789abc

Estado guías:
- María: NO_DISPONIBLE
- Juan: NO_DISPONIBLE
...
```

**Error:**
```
Asunto: ⚠️ ERROR Sincronización: 15 Nov MAÑANA

Error: Timeout Zapier (30s)
Intento: 3/3

ACCIÓN REQUERIDA: Verificar Bookeo manualmente.
```

---

### RF-07: Turnos Solapados

Bookeo elimina turnos solapados automáticamente:
- Bloquear 17:15 (T1) → Elimina 18:15 (T2)
- Desbloquear → Restaura ambos

**Implicación Cloud Function:**
- Solo enviar webhook para turno detectado
- Solo actualizar Firestore para ese turno

---

## 5. Requisitos No Funcionales

### Performance
- Latencia: <5s (p95)
- Timeout: 30s

### Disponibilidad
- Uptime: >99.5%
- Reintentos: 3x backoff exponencial

### Seguridad
- Webhook URL en Firebase config
- Validación header `X-Webhook-Secret` Zapier
- Logs sin PII
- HTTPS end-to-end

---

## 6. Arquitectura

```
Firestore /shifts/{docId} (actualización)
        ↓
Cloud Function syncBookeoAvailability
        ↓
detectFullBlockage() / detectUnblock()
        ↓
   ┌────────────┴─────────────┐
   ↓                          ↓
Gmail API           Zapier Webhook
   ↓                          ↓
Manager Email       Bookeo API
                             ↓
                    Response (bookeoId)
                             ↓
                    Cloud Function
                             ↓
                    Firestore UPDATE
```

---

## 7. Variables Entorno

```bash
firebase functions:config:set \
  zapier.webhook_url="https://hooks.zapier.com/..." \
  zapier.webhook_secret="sk_live_..." \
  notifications.manager_email="madrid@spainfoodsherpas.com" \
  bookeo.sync_enabled="true" \
  bookeo.webhook_timeout_ms="30000" \
  bookeo.webhook_max_retries="3"
```

---

## 8. Plan Testing

### E2E-01: Bloqueo Automático
1. Actualizar Firestore: 5 guías → NO_DISPONIBLE
2. Cloud Function detecta cambio <3s
3. Webhook enviado
4. Bookeo bloqueado
5. Email Manager recibido

### E2E-02: Desbloqueo
1. Actualizar: 1 guía → LIBRE
2. Webhook DESBLOQUEAR
3. Bookeo desbloqueado

### E2E-03: Error Timeout
1. Zapier down
2. 3 reintentos con backoff
3. Email error Manager

---

## 9. Rollout

### Staging (1 semana)
1. Deploy Cloud Functions staging
2. Pablo configura Zapier staging
3. Testing E2E
4. UAT Manager

### Producción
1. Deploy viernes 17:00
2. Monitoreo 48h
3. Revisión lunes

### Rollback
```bash
firebase functions:config:set bookeo.sync_enabled="false"
firebase deploy --only functions
```

---

## 10. Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Zapier down | Media | Alto | Reintentos + Email Manager |
| Bookeo API cambio | Baja | Alto | Pablo monitorea changelog |
| Rate limit | Baja | Medio | Max 10/min suficiente |

---

**Aprobaciones:** Pendiente  
**Revisión:** Post-producción (30 días)
