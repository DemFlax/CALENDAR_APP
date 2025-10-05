# Architecture Decision Records (ADR)
## Calendario Tours Madrid MVP

---

## ADR-001: Stack Frontend - Vanilla JS vs Framework

**Fecha:** 2025-10-03  
**Estado:** Aprobado  
**Decisores:** Director Técnico, PMO

### Contexto
Necesitamos UI web responsive para 2 dashboards (Manager + Guía) con actualización real-time.

### Opciones Consideradas
1. **React** - Popular, componentes reutilizables, ecosystem robusto
2. **Vue** - Menor curva aprendizaje, good performance
3. **Vanilla JS + Firebase SDK** - Sin dependencias, control total

### Decisión
**Vanilla JS + Firebase SDK**

### Justificación

**Pros:**
- Bundle size mínimo (~50KB Firebase SDK vs ~150KB React)
- 0 build tools para MVP (deploy directo a Firebase Hosting)
- Firestore real-time listeners nativos sin wrapper
- Mantenibilidad: cualquier dev JS puede trabajar
- Firebase SDK optimizado para web

**Contras:**
- No componentes reutilizables out-of-box (mitigado con módulos ES6)
- State management manual (suficiente para 2 vistas simples)
- Sin TypeScript compile-time checks (mitigado con JSDoc)

**Trade-offs aceptados:**
- Escalabilidad futura: si crece complejidad UI, migrar a React fase 2
- DX menor vs frameworks pero adecuado para MVP

### Consecuencias
- Time-to-market reducido (no setup Webpack/Vite)
- Performance óptima (no virtual DOM overhead)
- Hosting CDN simple (solo HTML/CSS/JS estático)

---

## ADR-002: Backend - Cloud Functions vs Apps Script

**Fecha:** 2025-10-03  
**Estado:** Aprobado

### Contexto
Necesitamos lógica backend para:
- Validación Calendar API pre-asignación
- Envío emails notificación
- Generación automática turnos
- Custom claims Firebase Auth

### Opciones Consideradas
1. **Solo Cloud Functions** - Node.js, integración nativa Firebase
2. **Solo Apps Script** - Acceso directo GmailApp/CalendarApp, 0 autenticación OAuth
3. **Híbrido** - Functions para core logic, Apps Script para Google APIs

### Decisión
**Híbrido: Cloud Functions + Apps Script**

### Justificación

**Cloud Functions para:**
- CRUD guías (onCreate trigger para invitación)
- Asignación/liberación turnos (validación estado)
- Generación mensual (Cloud Scheduler)
- Custom claims Auth

**Apps Script para:**
- Validación Calendar API (acceso directo sin service account setup)
- Envío emails via GmailApp (desde madrid@spainfoodsherpas)

**Pros híbrido:**
- Apps Script elimina OAuth complexity para Calendar/Gmail
- Functions proveen real-time triggers Firestore
- Separación concerns: business logic (Functions) vs integraciones Google (Apps Script)

**Contras:**
- 2 entornos deployment (mitigado con CI/CD)
- Latencia extra HTTP call Functions → Apps Script (~200ms)

### Arquitectura Comunicación
```
Cloud Function (assignShift)
    ↓ HTTPS POST
Apps Script Web App (validateTour)
    ↓ Calendar API
Response {exists: true/false}
```

### Consecuencias
- Mantener 2 repositorios código (functions/ y appsscript/)
- Documentar bien contract API entre ambos
- Monitoreo dual (Cloud Logging + Apps Script executions)

---

## ADR-003: Autenticación - Email/Password vs Google Sign-In

**Fecha:** 2025-10-03  
**Estado:** Aprobado

### Contexto
Manager usa cuenta Workspace (madrid@spainfoodsherpas). Guías usan Gmail personales. Necesitamos roles distintos.

### Opciones Consideradas
1. **Google Sign-In** - OAuth, 1-click login
2. **Email + Password** - Control total, invitación custom
3. **Híbrido** - Manager Google, Guías Email/Password

### Decisión
**Email + Password con invitación**

### Justificación

**Pros:**
- Control onboarding: solo guías invitados acceden
- Separación clara Manager (único email) vs Guías (N emails)
- Custom claims fácil asignar en onCreate trigger
- Reseteo password integrado Firebase Auth

**Contras:**
- UX: usuarios deben recordar contraseña (vs 1-click Google)
- Gestión invitaciones manual

**Por qué NO Google Sign-In:**
- Manager y guías tendrían mismo flow, dificulta asignar roles
- Cualquiera con @gmail podría intentar login
- Invitación email + setup password da mejor control

### Flujo Implementado
```
Manager crea guía
  → Cloud Function onCreate
    → Genera link Firebase Auth action
      → Email invitación
        → Guía establece password
          → Custom claim {role: "guide", guideId: "X"}
```

### Consecuencias
- Implementar validación password fuerte (min 8 chars, uppercase, number, special)
- UI reset password obligatoria
- Expiración links 7 días (configurable Firebase)

---

## ADR-004: Database - Firestore vs Realtime Database

**Fecha:** 2025-10-03  
**Estado:** Aprobado

### Contexto
Necesitamos almacenar guías, turnos, notificaciones con queries complejos y real-time sync.

### Opciones Consideradas
1. **Firestore** - Queries complejos, mejor escala, offline support
2. **Realtime Database** - Menor latencia, estructura JSON plana

### Decisión
**Cloud Firestore**

### Justificación

**Pros:**
- Queries compuestos: `where('guiaId','==',X).where('fecha','>=',Y)`
- Índices automáticos + custom indices
- Security Rules granulares por documento
- Transacciones ACID
- SDK más moderno

**Contras vs RTDB:**
- Latency ~50ms mayor (mitigado: aceptable para use case)
- Costo: $0.18/GB stored + $0.06/100K reads (dentro Spark free tier MVP)

**Modelo colecciones planas:**
- `/guides/{guideId}` - simple queries por estado
- `/shifts/{YYYY-MM-DD_SLOT}` - ID semántico previene duplicados
- `/notifications/{notifId}` - auditoría separada

**Por qué NO subcollections:**
- MVP no requiere agregaciones jerárquicas
- Queries cross-collection innecesarias
- Simplicidad > flexibilidad futura

### Consecuencias
- Crear 3 índices compuestos (ver Firestore Schema doc)
- Monitorear reads/writes para optimizar listeners
- Plan migración si supera Spark limits (50K docs, 1GB storage)

---

## ADR-005: Generación Turnos - Cloud Scheduler vs Client-Side

**Fecha:** 2025-10-03  
**Estado:** Aprobado

### Contexto
Ventana 3 meses rodante requiere generar mes +2 automáticamente.

### Opciones Consideradas
1. **Cloud Scheduler + Function** - Cron job serverless
2. **Trigger client-side** - Manager dashboard verifica en load
3. **Firestore trigger** - onCreate shift detecta mes faltante

### Decisión
**Cloud Scheduler + Cloud Function**

### Justificación

**Pros:**
- Ejecución garantizada independiente de acceso usuarios
- Idempotencia: 1 ejecución/día a 00:00 UTC
- Logs centralizados Cloud Logging
- Retry automático si falla
- Cost-effective: 3 jobs/mes (free tier: 3 jobs/mes)

**Contras:**
- Requiere Blaze plan (Spark no soporta Scheduler)
  - **Solución:** HTTP trigger invocado por Cloud Scheduler externo o cron-job.org free

**Configuración:**
```yaml
schedule: "0 0 * * *"  # Daily 00:00 UTC
timeZone: "Europe/Madrid"
httpTarget:
  uri: https://REGION-PROJECT.cloudfunctions.net/generateMonthlyShifts
  httpMethod: POST
```

**Lógica:**
1. Verificar mes actual
2. Calcular mes +2
3. Query Firestore: ¿existe al menos 1 shift del mes +2?
4. Si NO → crear 30-31 días × 4 slots batch write
5. Si SÍ → log "already exists", exit

### Consecuencias
- Implementar idempotencia robusta (verificar antes de crear)
- Alerting si función falla 2 días consecutivos
- Fallback: Manager puede ejecutar manualmente desde dashboard

---

## ADR-006: Validación Calendar - Síncrona vs Asíncrona

**Fecha:** 2025-10-03  
**Estado:** Aprobado

### Contexto
Manager asigna turno → debe validar evento existe en Google Calendar.

### Opciones Consideradas
1. **Síncrona** - Validar en tiempo real al hacer clic "Asignar"
2. **Asíncrona** - Validar batch 1x/día, marcar turnos inválidos
3. **Híbrida** - Cache validaciones 5min, revalidar si expiró

### Decisión
**Síncrona con timeout 5s**

### Justificación

**Pros:**
- Feedback inmediato: Manager sabe si puede asignar antes de commit
- Datos siempre actualizados: Manager puede haber creado evento hace 1min
- Simplicidad: no state "pending validation"

**Contras:**
- UX espera ~1-2s por Calendar API call
- Riesgo timeout si Calendar API lento

**Mitigaciones timeout:**
```javascript
try {
  const exists = await validateWithTimeout(date, slot, 5000);
  if (exists) assign();
} catch (TimeoutError) {
  showError("Calendar no responde. Intente nuevamente.");
}
```

**Por qué NO asíncrona:**
- Complejidad estado: turnos "validando", "válido", "inválido"
- Posible race: Manager asigna antes de validación completa
- Batch diario insuficiente: eventos creados ad-hoc

### Consecuencias
- Implementar spinner UI durante validación
- Logging timeout para monitoreo
- Cache opcional fase 2 si Calendar API se vuelve bottleneck

---

## ADR-007: Email Sending - Cloud Functions vs Apps Script

**Fecha:** 2025-10-03  
**Estado:** Aprobado

### Contexto
Enviar emails desde madrid@spainfoodsherpas para asignación/liberación/invitación.

### Opciones Consideradas
1. **Nodemailer + Gmail SMTP** - Require app password, config compleja
2. **SendGrid API** - Servicio 3rd party, 100 emails/día free
3. **Apps Script GmailApp** - Acceso nativo cuenta Workspace

### Decisión
**Apps Script GmailApp**

### Justificación

**Pros:**
- 0 autenticación: script ejecutado como madrid@spainfoodsherpas
- Emails aparecen en "Enviados" de la cuenta
- Quota: 2,000 emails/día (Workspace) vs 100/día (SendGrid free)
- Sin secrets externos (SMTP password, SendGrid API key)

**Contras:**
- Deployment separado (clasp push)
- Latency: Cloud Function → Apps Script HTTP ~200ms

**Flujo:**
```
Cloud Function onUpdate shift
  → HTTP POST to Apps Script Web App
    → GmailApp.sendEmail({to, subject, body})
      → Response {status: "sent"}
```

**Plantillas HTML:**
```javascript
function sendAssignmentEmail(guide, shift) {
  const html = `
    <h2>Nueva asignación</h2>
    <p>Hola ${guide.nombre},</p>
    <p>Fecha: ${shift.fecha}</p>
    <p>Hora: ${getSlotTime(shift.slot)}</p>
  `;
  GmailApp.sendEmail(guide.email, subject, "", {htmlBody: html});
}
```

### Consecuencias
- Documentar API contract Cloud Functions ↔ Apps Script
- Retry logic si Apps Script falla (exponential backoff)
- Monitoreo: registrar notificaciones en Firestore con status sent/failed

---

## ADR-008: State Management Frontend - Listeners vs Polling

**Fecha:** 2025-10-03  
**Estado:** Aprobado

### Contexto
Dashboards requieren actualización real-time cuando cambian turnos.

### Opciones Consideradas
1. **Firestore real-time listeners** - onSnapshot, push updates
2. **Polling** - setInterval fetch cada Ns
3. **WebSockets custom** - Control total, complejidad alta

### Decisión
**Firestore real-time listeners**

### Justificación

**Pros:**
- Latencia <1s actualización
- SDK maneja reconexión automática
- Filtros eficientes: solo docs relevantes
- Cost: 1 read inicial + 1 read por cambio (vs polling: N reads/min)

**Ejemplo Manager dashboard:**
```javascript
// Solo turnos próximos 3 meses
db.collection('shifts')
  .where('fecha', '>=', TODAY)
  .where('fecha', '<=', THREE_MONTHS_AHEAD)
  .onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === 'modified') updateUI(change.doc);
    });
  });
```

**Ejemplo Guía dashboard:**
```javascript
// Solo MIS turnos
db.collection('shifts')
  .where('guiaId', '==', currentGuideId)
  .onSnapshot(snapshot => { /* update */ });
```

**Contras:**
- Listener activo consume 1 conexión persistente (limite: 1M concurrent Firestore)
- Detach necesario al desmontar componente (memory leak)

### Consecuencias
- Implementar cleanup listeners en SPA navigation
- Monitorear concurrent connections Dashboard Analytics
- Unsubscribe pattern:
```javascript
const unsubscribe = db.collection('shifts').onSnapshot(/*...*/);
window.addEventListener('beforeunload', unsubscribe);
```

---

## ADR-009: Deployment Strategy - Manual vs CI/CD

**Fecha:** 2025-10-03  
**Estado:** Aprobado

### Contexto
3 entornos (dev, staging, prod) + 2 codebases (Functions, Apps Script).

### Opciones Consideradas
1. **Manual Firebase CLI** - `firebase deploy` local
2. **GitHub Actions CI/CD** - Auto-deploy on push
3. **Cloud Build** - GCP native, costoso para MVP

### Decisión
**GitHub Actions con gates**

### Justificación

**Pipeline:**
```yaml
dev: push to main → auto-deploy dev
staging: PR approved → deploy staging + run E2E tests
prod: manual approval (GitHub Environments) → deploy prod
```

**Pros:**
- Previsibilidad: staging siempre refleja próximo prod
- Rollback simple: revert commit, redeploy
- Secrets management: GitHub Secrets
- Free: 2,000 min/mes Actions

**Contras:**
- Setup inicial ~4h (workflows + Firebase service accounts)

**Componentes:**
- `firebase deploy --only hosting,firestore,functions`
- `clasp push` para Apps Script (requiere .clasprc.json en secrets)
- Emulator tests pre-deploy

### Consecuencias
- Crear 3 Firebase projects (dev/staging/prod)
- Service accounts con roles mínimos (Viewer staging, Editor prod)
- Branch protection: main requiere PR + 1 approval

---

## ADR-010: Security - Firestore Rules vs Cloud Functions

**Fecha:** 2025-10-03  
**Estado:** Aprobado

### Contexto
Validar roles, estado transitions, ownership de turnos.

### Opciones Consideradas
1. **Solo Firestore Rules** - Declarativo, enforce client-side
2. **Solo Cloud Functions** - Lógica server-side, Rules permisivas
3. **Defensa en profundidad** - Rules + Functions validan

### Decisión
**Firestore Rules como primary, Functions validan lógica negocio compleja**

### Justificación

**Firestore Rules para:**
- Autenticación: `request.auth != null`
- Roles: `request.auth.token.role == "manager"`
- Ownership: `resource.data.guiaId == request.auth.token.guideId`
- Estado transitions: `resource.data.estado == "LIBRE" && request.resource.data.estado == "ASIGNADO"`

**Cloud Functions para:**
- Validación Calendar API (no disponible en Rules)
- Envío emails
- Generación masiva turnos

**Por qué NO solo Functions:**
- Rules son primera línea defensa (client SDK valida antes de request)
- Functions bypasseables si alguien accede Admin SDK
- Rules más eficientes (eval en servidor sin cold start)

### Matriz de Responsabilidades

| Validación                   | Rules | Functions |
|------------------------------|-------|-----------|
| Usuario autenticado          | ✓     |           |
| Rol correcto                 | ✓     |           |
| Turno en estado válido       | ✓     |           |
| Ownership turno              | ✓     |           |
| Email formato válido         | ✓     |           |
| Evento existe en Calendar    |       | ✓         |
| Envío email                  |       | ✓         |
| Custom claims setup          |       | ✓         |

### Consecuencias
- Testing exhaustivo Firestore Rules (Emulator)
- Logging denied requests para detectar ataques
- Auditoría trimestral Rules (compliance)

---

## Resumen Decisiones

| ADR | Decisión | Impacto |
|-----|----------|---------|
| 001 | Vanilla JS | Time-to-market ↑, Bundle size ↓ |
| 002 | Híbrido Functions + Apps Script | Complejidad deploy, Elimina OAuth |
| 003 | Email + Password | Control onboarding |
| 004 | Firestore | Queries complejos, Security Rules |
| 005 | Cloud Scheduler | Automatización confiable |
| 006 | Validación síncrona | UX feedback inmediato |
| 007 | Apps Script GmailApp | 0 autenticación email |
| 008 | Firestore listeners | Real-time <1s |
| 009 | GitHub Actions CI/CD | Deploy predecible |
| 010 | Rules + Functions | Defensa en profundidad |

---

**Versión:** 1.0  
**Próxima revisión:** Post-MVP (Q1 2026)
