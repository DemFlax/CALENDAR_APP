# Work Breakdown Structure (WBS) - Calendario Tours Madrid

## Resumen Ejecutivo

**Duración Total:** 6-7 semanas  
**Esfuerzo Total:** ~160 horas (1 dev full-time)  
**Sprints:** 4 sprints de 2 semanas  
**Entrega MVP:** Semana 8

---

## WBS - Estructura de Desglose

### 1. SETUP & INFRAESTRUCTURA (8h)

**1.1 Firebase Projects Setup (3h)**
- 1.1.1 Crear 3 proyectos Firebase (dev/staging/prod) - 1h
- 1.1.2 Configurar Firebase Authentication - 0.5h
- 1.1.3 Crear colecciones Firestore + índices - 1h
- 1.1.4 Configurar Firestore Security Rules base - 0.5h

**1.2 Apps Script Setup (2h)**
- 1.2.1 Crear proyecto Apps Script - 0.5h
- 1.2.2 Configurar clasp + manifest - 0.5h
- 1.2.3 Habilitar Calendar API + Gmail API - 0.5h
- 1.2.4 Configurar API keys y Properties Service - 0.5h

**1.3 CI/CD Pipeline (3h)**
- 1.3.1 Configurar GitHub Actions workflows - 1.5h
- 1.3.2 Service accounts + secrets - 1h
- 1.3.3 Configurar environments (staging/prod gates) - 0.5h

---

### 2. AUTENTICACIÓN & ROLES (12h)

**2.1 Firebase Auth Setup (4h)**
- 2.1.1 Implementar email/password auth - 1h
- 2.1.2 Cloud Function: onCreate user → custom claims - 1.5h
- 2.1.3 Action links setup (invitación) - 1h
- 2.1.4 Testing auth flow - 0.5h

**2.2 Frontend Auth (5h)**
- 2.2.1 Login page (email/password) - 2h
- 2.2.2 Establecer contraseña post-invitación - 2h
- 2.2.3 Validación password fuerte - 0.5h
- 2.2.4 Route guards por rol - 0.5h

**2.3 Security (3h)**
- 2.3.1 Firestore Rules con validación roles - 2h
- 2.3.2 Testing Rules (Emulator) - 1h

---

### 3. GESTIÓN GUÍAS (Manager) (16h)

**3.1 CRUD Guías - Backend (6h)**
- 3.1.1 Cloud Function: onCreate guide → invitación - 2h
- 3.1.2 Validación email único - 1h
- 3.1.3 Soft delete (estado inactivo) - 1h
- 3.1.4 Update guide (campos permitidos) - 1h
- 3.1.5 Testing Functions - 1h

**3.2 CRUD Guías - Frontend (8h)**
- 3.2.1 Formulario crear guía - 2h
- 3.2.2 Validaciones client-side - 1h
- 3.2.3 Listado guías con filtros - 2h
- 3.2.4 Editar guía (modal) - 1.5h
- 3.2.5 Eliminar guía con confirmación - 1h
- 3.2.6 Testing E2E - 0.5h

**3.3 Email Invitación (2h)**
- 3.3.1 Plantilla HTML invitación - 1h
- 3.3.2 Integración Apps Script sendEmail - 1h

---

### 4. GESTIÓN TURNOS (24h)

**4.1 Modelo Turnos - Backend (8h)**
- 4.1.1 Seed inicial automático (colección vacía) - 2h
- 4.1.2 Generación mensual (Cloud Function scheduled) - 3h
- 4.1.3 Validación estado transitions (Firestore Rules) - 2h
- 4.1.4 Testing generación + Rules - 1h

**4.2 Validación Calendar API (6h)**
- 4.2.1 Apps Script: endpoint validateTour - 2h
- 4.2.2 Cloud Function: integración Calendar validation - 2h
- 4.2.3 Manejo timeouts y errores - 1h
- 4.2.4 Testing validación - 1h

**4.3 Asignar/Liberar Turnos (10h)**
- 4.3.1 Cloud Function: onUpdate shift (LIBRE→ASIGNADO) - 3h
- 4.3.2 Cloud Function: onUpdate shift (ASIGNADO→LIBRE) - 2h
- 4.3.3 Envío emails asignación/liberación - 2h
- 4.3.4 Registro notificaciones Firestore - 1h
- 4.3.5 Testing flujo completo - 2h

---

### 5. DASHBOARD MANAGER (18h)

**5.1 Vista Calendario (10h)**
- 5.1.1 Componente calendario mensual - 4h
- 5.1.2 Slots con código color por estado - 2h
- 5.1.3 Navegación 3 meses (actual + 2) - 1h
- 5.1.4 Real-time listeners Firestore - 2h
- 5.1.5 Testing actualización real-time - 1h

**5.2 Asignación UI (5h)**
- 5.2.1 Modal asignar turno (select guía) - 2h
- 5.2.2 Spinner durante validación Calendar - 1h
- 5.2.3 Manejo errores (tour no existe, etc) - 1h
- 5.2.4 Confirmación visual post-asignación - 1h

**5.3 Filtros y Estadísticas (3h)**
- 5.3.1 Filtros: por guía, estado, fecha - 2h
- 5.3.2 Widget estadísticas (turnos libres/asignados) - 1h

---

### 6. DASHBOARD GUÍA (14h)

**6.1 Vista Calendario Personal (8h)**
- 6.1.1 Calendario filtrado por guiaId - 3h
- 6.1.2 Solo mostrar turnos relevantes (ASIGNADO/LIBRE/mis NO_DISPONIBLE) - 2h
- 6.1.3 Real-time listeners con filtro - 2h
- 6.1.4 Testing listeners - 1h

**6.2 Bloquear/Desbloquear Turnos (4h)**
- 6.2.1 UI bloquear turno (LIBRE→NO_DISPONIBLE) - 2h
- 6.2.2 UI desbloquear turno (NO_DISPONIBLE→LIBRE) - 1h
- 6.2.3 Validación client-side + Rules - 1h

**6.3 Próximas Asignaciones (2h)**
- 6.3.1 Widget lista próximas asignaciones - 1.5h
- 6.3.2 Ordenar por fecha ascendente - 0.5h

---

### 7. INTEGRACIONES APPS SCRIPT (10h)

**7.1 Endpoint validateTour (4h)**
- 7.1.1 Función doPost + routing - 1h
- 7.1.2 Calendar API query + filter por hora - 2h
- 7.1.3 Manejo errores + rate limits - 1h

**7.2 Endpoint sendEmail (4h)**
- 7.2.1 Función doPost sendEmail - 1h
- 7.2.2 GmailApp integration - 1h
- 7.2.3 Plantillas HTML (asignación/liberación) - 1.5h
- 7.2.4 Testing envío emails - 0.5h

**7.3 Security Apps Script (2h)**
- 7.3.1 API key validation - 1h
- 7.3.2 Logging structured - 0.5h
- 7.3.3 Deploy + permissions - 0.5h

---

### 8. FRONTEND CORE (12h)

**8.1 Layout & Navigation (4h)**
- 8.1.1 Header con logout - 1h
- 8.1.2 Sidebar navigation (Manager/Guía) - 1.5h
- 8.1.3 Responsive design (mobile-first) - 1.5h

**8.2 Componentes Reutilizables (5h)**
- 8.2.1 DatePicker component - 1.5h
- 8.2.2 Modal component - 1h
- 8.2.3 Toast notifications - 1h
- 8.2.4 Loading spinner - 0.5h
- 8.2.5 Error boundary - 1h

**8.3 Estado Global (3h)**
- 8.3.1 Context API setup (user, shifts, guides) - 2h
- 8.3.2 Firestore listeners management - 1h

---

### 9. TESTING & QA (20h)

**9.1 Unit Tests (8h)**
- 9.1.1 Cloud Functions tests (Jest) - 3h
- 9.1.2 Apps Script tests - 2h
- 9.1.3 Frontend utils tests - 2h
- 9.1.4 Firestore Rules tests (Emulator) - 1h

**9.2 Integration Tests (6h)**
- 9.2.1 Calendar API integration - 2h
- 9.2.2 Email sending integration - 2h
- 9.2.3 Auth flow E2E - 2h

**9.3 E2E Tests (6h)**
- 9.3.1 Flujo Manager: crear guía → asignar turno - 2h
- 9.3.2 Flujo Guía: bloquear → desbloquear - 2h
- 9.3.3 Real-time sync validación - 1h
- 9.3.4 Error scenarios - 1h

---

### 10. DEPLOYMENT & DOCS (16h)

**10.1 Deployment Staging (4h)**
- 10.1.1 Deploy Firebase staging - 1h
- 10.1.2 Deploy Apps Script staging - 1h
- 10.1.3 Smoke tests staging - 1h
- 10.1.4 UAT con stakeholders - 1h

**10.2 Deployment Producción (4h)**
- 10.2.1 Backup Firestore pre-deploy - 0.5h
- 10.2.2 Deploy Firebase prod - 1h
- 10.2.3 Deploy Apps Script prod - 0.5h
- 10.2.4 Smoke tests prod - 1h
- 10.2.5 Rollback plan test - 1h

**10.3 Documentación (6h)**
- 10.3.1 README setup local - 1h
- 10.3.2 Runbook operaciones - 2h
- 10.3.3 Manual usuario Manager - 1.5h
- 10.3.4 Manual usuario Guía - 1.5h

**10.4 Monitoring Setup (2h)**
- 10.4.1 Cloud Logging filters + alerts - 1h
- 10.4.2 Firebase Performance monitoring - 0.5h
- 10.4.3 Dashboard Firestore metrics - 0.5h

---

## Estimaciones por Sprint

### Sprint 1: Fundación (2 semanas - 40h)
**Objetivo:** Setup + Auth + CRUD Guías

| Tarea | Horas |
|-------|-------|
| 1. Setup & Infraestructura | 8h |
| 2. Autenticación & Roles | 12h |
| 3. Gestión Guías | 16h |
| Buffer 10% | 4h |
| **Total Sprint 1** | **40h** |

**Entregables:**
- ✅ Proyectos Firebase configurados
- ✅ CI/CD pipeline funcional
- ✅ Login email/password
- ✅ Manager puede crear/editar/eliminar guías
- ✅ Email invitación funciona

---

### Sprint 2: Core Turnos (2 semanas - 40h)
**Objetivo:** Asignación con validación Calendar

| Tarea | Horas |
|-------|-------|
| 4. Gestión Turnos | 24h |
| 7. Integraciones Apps Script | 10h |
| Buffer 15% | 6h |
| **Total Sprint 2** | **40h** |

**Entregables:**
- ✅ Seed inicial automático
- ✅ Generación mensual funciona
- ✅ Validación Calendar API operativa
- ✅ Asignar/liberar turnos con emails
- ✅ Apps Script endpoints funcionando

---

### Sprint 3: Dashboards (2 semanas - 40h)
**Objetivo:** UI Manager + Guía completas

| Tarea | Horas |
|-------|-------|
| 5. Dashboard Manager | 18h |
| 6. Dashboard Guía | 14h |
| 8. Frontend Core | 6h (parcial) |
| Buffer 5% | 2h |
| **Total Sprint 3** | **40h** |

**Entregables:**
- ✅ Calendario Manager funcional
- ✅ Asignación UI completa
- ✅ Calendario Guía con bloqueos
- ✅ Real-time sync <5s

---

### Sprint 4: Testing + Deploy (2 semanas - 40h)
**Objetivo:** QA + Producción

| Tarea | Horas |
|-------|-------|
| 8. Frontend Core | 6h (resto) |
| 9. Testing & QA | 20h |
| 10. Deployment & Docs | 16h |
| Fixes bugs encontrados | 8h |
| **Total Sprint 4** | **50h** |

**Entregables:**
- ✅ Testing completo (unit + E2E)
- ✅ Deploy staging + UAT
- ✅ Deploy producción
- ✅ Documentación completa

---

## Timeline Gantt

```
Semana 1-2 (Sprint 1: Fundación)
├── Setup Firebase/Apps Script    ████░░░░░░
├── Auth & Roles                   ░░░░██████
└── CRUD Guías                     ░░░░░░████████

Semana 3-4 (Sprint 2: Core Turnos)
├── Modelo Turnos + Seed           ████░░░░░░
├── Validación Calendar            ░░░░████░░
├── Asignar/Liberar + Emails       ░░░░░░██████
└── Apps Script endpoints          ██████████

Semana 5-6 (Sprint 3: Dashboards)
├── Dashboard Manager              ██████████░░
├── Dashboard Guía                 ░░░░██████░░
└── Frontend Core                  ░░░░░░░░████

Semana 7-8 (Sprint 4: Testing + Deploy)
├── Testing E2E                    ████░░░░░░
├── Deploy Staging + UAT           ░░░░████░░
├── Deploy Prod                    ░░░░░░██░░
└── Documentación                  ░░░░░░░░████

█ = Work in progress
```

---

## Dependencias Críticas

### Path Crítico (blocking tasks)

```
Setup Firebase (1.1)
    ↓
Auth Setup (2.1) ← BLOCKER para todo
    ↓
    ├→ CRUD Guías Backend (3.1)
    │       ↓
    │   CRUD Guías Frontend (3.2)
    │       ↓
    │   Email Invitación (3.3)
    │
    └→ Modelo Turnos (4.1)
            ↓
        Validación Calendar (4.2) ← BLOCKER asignación
            ↓
        Asignar/Liberar (4.3)
            ↓
            ├→ Dashboard Manager (5)
            └→ Dashboard Guía (6)
                    ↓
                Testing (9)
                    ↓
                Deploy (10)
```

### Tareas Paralelas (pueden ejecutarse simultáneamente)

- Apps Script endpoints (7) || Cloud Functions (3.1, 4.3)
- Dashboard Manager (5) || Dashboard Guía (6)
- Frontend Core (8) || Dashboards (5, 6)
- Unit tests (9.1) durante desarrollo

---

## Recursos y Asignaciones

### Team Composition (MVP)
- **1 Full-stack Developer** (40h/semana)
- **1 PMO/Director Técnico** (5h/semana - revisiones)
- **1 Manager** (2h/semana - UAT)

### Skills Requeridas (Dev)
- JavaScript/Node.js: ⭐⭐⭐⭐⭐
- Firebase (Auth, Firestore, Functions): ⭐⭐⭐⭐
- Google Apps Script: ⭐⭐⭐
- HTML/CSS: ⭐⭐⭐
- Testing (Jest, Emulator): ⭐⭐⭐

---

## Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Calendar API rate limits | Media | Alto | Cache 5min, manejo errores robusto |
| Apps Script deployment issues | Baja | Medio | clasp CI/CD, rollback plan |
| Firestore Rules bugs | Media | Alto | Testing exhaustivo Emulator |
| Real-time sync lento | Baja | Medio | Optimizar listeners, índices |
| Email quota exceeded | Baja | Bajo | Monitoreo, batch si necesario |
| Scope creep (features extra) | Alta | Alto | **Freezar scope post-Sprint 2** |

---

## Criterios de Aceptación MVP

### Funcionales
- ✅ Manager crea 10 guías, todos reciben invitación
- ✅ Generación automática 3 meses funciona
- ✅ 100% asignaciones validan contra Calendar
- ✅ Emails enviados <3s post-asignación
- ✅ Real-time sync Manager ↔ Guía <5s
- ✅ Guía bloquea/desbloquea sin errores

### No Funcionales
- ✅ Latencia p95 operaciones <2s
- ✅ 0 errores críticos Firestore Rules
- ✅ Deploy prod exitoso sin downtime
- ✅ Documentación completa y clara
- ✅ Coverage tests >80%

### Técnicos
- ✅ CI/CD pipeline verde
- ✅ Backups automáticos configurados
- ✅ Monitoring + alerting activo
- ✅ Firestore índices optimizados

---

## Costos Estimados

### Firebase (Spark Free Tier)
- Firestore: **$0** (dentro límites)
- Functions: **$0** (125K invocaciones/mes)
- Hosting: **$0** (10GB storage, 360MB/día)

### Potencial Blaze (si escala)
- Firestore: ~$5/mes (reads/writes extra)
- Functions: ~$10/mes
- **Total estimado:** $15-20/mes

### Tiempo = Dinero
- 160h × $50/h (dev rate) = **$8,000 MVP**

---

## Hitos Clave

| Fecha | Hito | Criterio |
|-------|------|----------|
| Semana 2 | ✅ Sprint 1 Complete | Auth + CRUD Guías working |
| Semana 4 | ✅ Sprint 2 Complete | Asignación con Calendar OK |
| Semana 6 | ✅ Sprint 3 Complete | Dashboards funcionales |
| Semana 7 | 🚀 Deploy Staging | UAT Manager aprueba |
| Semana 8 | 🎉 Deploy Producción | Go-live MVP |

---

## Métricas de Éxito Post-Launch

**Semana 1-2 post-deploy:**
- 0 errores críticos
- <5% tasa error Calendar API
- 100% emails entregados
- Feedback positivo Manager + Guías

**Mes 1:**
- Uptime >99%
- <2s latencia p95
- 0 incidentes seguridad
- Adoption: 10/10 guías usando sistema

---

## Próximos Pasos (Post-MVP)

**Fase 2 (opcional - Q1 2026):**
- Notificaciones push
- Reportes avanzados
- Exportación datos
- App móvil nativa
- Multi-idioma

**Estimación Fase 2:** +120h

---

**Versión:** 1.0  
**Aprobado por:** Director Técnico  
**Fecha inicio:** TBD  
**Fecha entrega estimada:** TBD + 8 semanas
