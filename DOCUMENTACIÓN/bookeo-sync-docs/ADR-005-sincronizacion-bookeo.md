# ADR-005: Sincronización Bookeo vía Zapier Webhook

**Estado:** Aceptado  
**Fecha:** 2025-10-10  
**Decisores:** Manager, Equipo técnico  
**Relacionado:** HU-BOOKEO-01

---

## Contexto y Problema

Bookeo (sistema de reservas externo) debe reflejar la disponibilidad real de guías en tiempo real. Cuando todos los guías marcan NO_DISPONIBLE en un turno específico, Bookeo debe bloquearse automáticamente para evitar que los clientes reserven turnos sin cobertura de guías.

### Requisitos
1. Sincronización tiempo real (<5 segundos)
2. Bloqueo automático cuando 100% guías NO_DISPONIBLE
3. Desbloqueo automático cuando ≥1 guía vuelve LIBRE
4. Notificación Manager por email
5. No exponer credenciales Bookeo API
6. Mínimo impacto en infraestructura actual de Zapier

---

## Decisión

**Arquitectura elegida:** Cloud Function → Zapier Webhook → Bookeo API

```
Firebase Firestore (shifts)
        ↓
Cloud Function onUpdate
        ↓
   ├─→ Gmail API (email Manager)
   └─→ Zapier Webhook
            ↓
       Bookeo API
            ↓
       Respuesta (bookeoId)
            ↓
   Firestore (bookeo_blocks)
```

### Componentes

**1. Cloud Function `syncBookeoAvailability`**
- Trigger: `onUpdate` colección `shifts`
- Detecta cuando todos guías NO_DISPONIBLE o 1 vuelve LIBRE
- Envía webhook POST a Zapier
- Envía email notificación Manager
- Registra log en Firestore

**2. Zapier Workflow (gestionado por Pablo)**
- Recibe webhook desde Firebase
- Transforma payload (formato fechas, obtiene eventId)
- Llama Bookeo API (`/seatblocks` o `/seatblocks/{id}`)
- Retorna bookeoId a Firebase

**3. Colección Firestore `bookeo_blocks`**
- Almacena bookeoId para desbloqueos futuros
- Auditoría completa de sincronizaciones

---

## Alternativas Consideradas

### Opción A: Cloud Function → Bookeo API Directo
**Pros:**
- Sin dependencia Zapier
- Menor latencia (~1-2s)
- Control total en código Firebase

**Contras:**
- ❌ Requiere credenciales Bookeo API en Firebase (riesgo seguridad)
- ❌ Lógica compleja (obtener eventId, formato fechas específico)
- ❌ Mayor acoplamiento - cambios API Bookeo requieren redeploy
- ❌ Pablo pierde control sobre flujo Bookeo
- ❌ Info sensible expuesta en múltiples sistemas

**Razón descarte:** Zapier ya gestiona múltiples workflows productivos con info sensible. Mantener separación de responsabilidades.

---

### Opción B: Apps Script → Zapier
**Pros:**
- Ecosistema Google unificado
- Ya tienes Apps Script funcionando

**Contras:**
- ❌ Limitaciones rate limit Apps Script (6 min/ejecución)
- ❌ Menor control sobre reintentos y manejo errores
- ❌ Apps Script no es adecuado para webhooks de alta frecuencia
- ❌ Debugging más complejo

**Razón descarte:** Cloud Functions ofrece mejor control, escalabilidad y manejo de errores.

---

### Opción C: Manual - Manager bloquea Bookeo desde dashboard
**Pros:**
- Sin desarrollo adicional
- Control total Manager

**Contras:**
- ❌ Error humano (olvido bloquear/desbloquear)
- ❌ No escalable
- ❌ Requiere monitoreo constante Manager

**Razón descarte:** Automatización es requisito crítico para evitar reservas sin guías.

---

## Consecuencias

### Positivas
✅ **Bajo acoplamiento:** Sistemas independientes - cambios Bookeo no afectan Firebase  
✅ **Seguridad:** Credenciales Bookeo solo en Zapier (control Pablo)  
✅ **Flexibilidad:** Cambios API Bookeo se manejan en Zapier sin redeploys  
✅ **Mantenibilidad:** Zapier UI para debugging workflows  
✅ **Respaldo manual:** Email Manager como fallback  
✅ **Auditoría:** Logs Firestore registran todas sincronizaciones  

### Negativas
⚠️ **Dependencia adicional:** Zapier (pero ya es productivo)  
⚠️ **Debugging distribuido:** Revisar logs en Firebase + Zapier  
⚠️ **Latencia adicional:** ~2-3s webhook (aceptable vs requisito <5s)  
⚠️ **Costo Zapier:** Consumo adicional tasks/mes (mínimo)  

### Riesgos Mitigados
- **Zapier down:** Email Manager como notificación de respaldo
- **Webhook timeout:** Reintentos con backoff exponencial (3 intentos)
- **Bookeo API error:** Log detallado + notificación Manager
- **Rate limits:** Zapier gestiona queue automáticamente

---

## Implementación

### Variables de Entorno
```bash
ZAPIER_WEBHOOK_URL=https://hooks.zapier.com/hooks/catch/XXXXX/YYYYY/
ZAPIER_WEBHOOK_SECRET=secret-key-123
MANAGER_EMAIL=madrid@spainfoodsherpas.com
```

### Payload Webhook

**BLOQUEAR:**
```json
{
  "action": "BLOQUEAR",
  "startDate": "2025-11-15",
  "startTime": "12:00",
  "slot": "MAÑANA",
  "timestamp": "2025-10-10T14:23:45Z"
}
```

**DESBLOQUEAR:**
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

---

## Compliance y Seguridad

### GDPR
- ✅ No se envían datos PII en webhook (solo fechas y slots)
- ✅ Email Manager cifrado en tránsito (Gmail API TLS)

### Auditoría
- ✅ Logs Firestore con timestamp + usuario + acción
- ✅ Trazabilidad completa: Firestore → Cloud Function → Zapier → Bookeo

### Autenticación
- ✅ Webhook incluye header `X-Firebase-Source` para validación
- ✅ Zapier secret key valida origen webhook

---

## Revisión y Aprobación

**Aprobado por:** Manager  
**Fecha aprobación:** 2025-10-10  
**Revisión prevista:** 2026-01-10 (3 meses post-producción)

### Métricas de Éxito
- Tiempo respuesta promedio <5s
- Tasa éxito webhooks >99%
- 0 reservas en turnos sin guías (post-implementación)
- 0 incidentes seguridad relacionados con Bookeo API

---

## Referencias

- [Bookeo API Documentation](https://www.bookeo.com/apiref/)
- [Zapier Webhook Documentation](https://zapier.com/help/create/code-webhooks/trigger-zaps-from-webhooks)
- HU-BOOKEO-01: Historia de usuario
- Email Pablo (2025-09-24): Requisitos técnicos Bookeo/Zapier
