# Product Requirements Document
## Calendario Tours Madrid - MVP v1.0

**Versión:** 1.0  
**Fecha:** 2025-10-03  
**Estado:** Aprobado  
**Owner:** PMO Director Técnico

---

## 1. Resumen Ejecutivo

### 1.1 Objetivo
Aplicación web para gestión centralizada del calendario de tours en Madrid. Permite al Manager asignar turnos a guías con validación contra Google Calendar, y a los guías indicar su no disponibilidad.

### 1.2 Problema a Resolver
- Comunicación manual ineficiente entre Manager y guías
- Sin validación automática de disponibilidad de tours
- Falta de trazabilidad en asignaciones
- Proceso propenso a errores humanos

### 1.3 KPIs de Éxito
1. **Eficiencia operativa:** 100% turnos validados contra Calendar antes de asignación
2. **Fiabilidad:** ≥99% disponibilidad en horario laboral (9:00-22:00 CET)
3. **Escalabilidad:** Soporte para 10 guías sin degradación
4. **UX:** Tiempo respuesta <2s en operaciones CRUD

---

## 2. Usuarios y Roles

### 2.1 Manager (madrid@spainfoodsherpas)
**Permisos:**
- Crear/editar/eliminar guías
- Asignar turnos LIBRE → ASIGNADO (con validación Calendar)
- Liberar turnos ASIGNADO → LIBRE
- Visualizar calendario completo (todos los guías)
- NO puede revertir bloqueos de guía (NO_DISPONIBLE)

**Flujos principales:**
1. Alta de guía + envío invitación email
2. Búsqueda de turno libre → validación Calendar → asignación a guía
3. Liberación de turno asignado

### 2.2 Guía (cuentas Gmail personales)
**Permisos:**
- Bloquear turnos LIBRE → NO_DISPONIBLE
- Desbloquear turnos NO_DISPONIBLE → LIBRE
- Visualizar calendario personal (solo sus turnos)
- Ver asignaciones (modo solo lectura)
- NO puede rechazar asignaciones del Manager

**Flujos principales:**
1. Acceso mediante invitación email
2. Bloqueo de fechas no disponibles
3. Consulta de próximas asignaciones

---

## 3. Requisitos Funcionales

### 3.1 Gestión de Guías (Manager)

#### RF-01: Crear Guía
**Input:**
- Nombre (requerido)
- Email (requerido, único, formato válido)
- Teléfono (opcional)
- Dirección (opcional)
- DNI (requerido, no editable post-creación)
- Cuenta bancaria (opcional)

**Proceso:**
1. Validar email no duplicado en colección `guides`
2. Crear documento Firestore con estado "activo"
3. Invocar Cloud Function para envío email invitación
4. Email contiene link único para establecer contraseña (Firebase Auth)

**Output:**
- Guía registrado en Firestore
- Email enviado
- Confirmación visual en dashboard Manager

**Validaciones:**
- Email formato RFC 5322
- DNI formato español (8 dígitos + letra)

#### RF-02: Editar Guía
**Campos editables:**
- Nombre, teléfono, dirección, cuenta bancaria

**Campos NO editables:**
- Email, DNI

**Validación:**
- Si intenta editar email/DNI → error "Campo no editable"

#### RF-03: Eliminar Guía
**Proceso:**
1. Marcar estado "inactivo" (soft delete)
2. Mantener historial asignaciones pasadas
3. Eliminar de vista dashboard Manager

**Restricción:**
- No elimina turnos asignados históricos (auditoría)

### 3.2 Gestión de Turnos

#### RF-04: Estructura de Turnos
**Slots diarios fijos:**
- MAÑANA: 12:00h
- T1: 17:15h
- T2: 18:15h
- T3: 19:15h

**Estados:**
- `LIBRE`: Disponible para asignación
- `ASIGNADO`: Asignado a un guía por Manager
- `NO_DISPONIBLE`: Bloqueado por guía

**Ventana temporal:**
- Mes actual + 2 meses siguientes (3 meses totales)
- Generación automática al cambiar mes

#### RF-05: Generación Automática de Turnos
**Trigger:**
- Cloud Function scheduled (1x/día a las 00:00 UTC)

**Lógica:**
1. Detectar si cambió el mes
2. Si cambió: crear nuevo mes +2 con todos los slots
3. Si es primera ejecución (colección `shifts` vacía): crear 3 meses completos

**Ejemplo:**
- Hoy: 2025-10-03
- Genera: 2025-10 (actual), 2025-11, 2025-12
- El 2025-11-01: genera 2026-01

#### RF-06: Asignar Turno (Manager)
**Precondiciones:**
- Turno en estado `LIBRE`
- Guía en estado "activo"

**Proceso:**
1. Manager selecciona turno + guía
2. **Validación Calendar API:** verificar evento existe en `c_61981c641dc3c970e63f1713ccc2daa49d8fe8962b6ed9f2669c4554496c7bdd@group.calendar.google.com` con hora inicio correspondiente
3. Si no existe evento: error "NO EXISTE TOUR EN ESE HORARIO"
4. Si existe: actualizar Firestore `estado: ASIGNADO`, `guiaId: <id>`
5. Trigger Cloud Function envío email a guía

**Validaciones bloqueantes:**
- Turno ya ASIGNADO → error "Turno ya asignado"
- Turno en NO_DISPONIBLE → error "Turno bloqueado por guía"
- Sin evento en Calendar → error "NO EXISTE TOUR EN ESE HORARIO"

**Email notificación:**
- Desde: madrid@spainfoodsherpas
- Para: email guía
- Asunto: "Nueva asignación - [Fecha] [Slot]"
- Cuerpo: Fecha, hora inicio, duración, detalles turno

#### RF-07: Liberar Turno (Manager)
**Precondiciones:**
- Turno en estado `ASIGNADO`

**Proceso:**
1. Actualizar Firestore `estado: LIBRE`, `guiaId: null`
2. Trigger Cloud Function envío email a guía

**Validaciones:**
- Turno ya LIBRE → mensaje "Turno ya está libre"
- Turno NO_DISPONIBLE → error "Acción no permitida"

**Email notificación:**
- Asunto: "Turno liberado - [Fecha] [Slot]"

#### RF-08: Bloquear Turno (Guía)
**Precondiciones:**
- Turno en estado `LIBRE`

**Proceso:**
1. Guía marca turno como NO_DISPONIBLE
2. Actualizar Firestore `estado: NO_DISPONIBLE`, `guiaId: <id_guia>`
3. Cambio visible inmediatamente en dashboard Manager (real-time listener)

**Validaciones:**
- Turno ASIGNADO → error "Acción no permitida"
- Turno ya NO_DISPONIBLE → mensaje "Ya está bloqueado"

**Sin email:** Manager ve cambios en tiempo real

#### RF-09: Desbloquear Turno (Guía)
**Precondiciones:**
- Turno en estado `NO_DISPONIBLE` creado por ese guía

**Proceso:**
1. Actualizar Firestore `estado: LIBRE`, `guiaId: null`

**Validaciones:**
- Turno ASIGNADO → error "Acción no permitida"
- Turno ya LIBRE → mensaje "Ya está libre"

### 3.3 Visualización

#### RF-10: Dashboard Manager
**Contenido:**
- Vista calendario mensual (3 meses)
- Filtros: por guía, por estado, por fecha
- Tabla/lista guías activos
- Indicadores: turnos libres, asignados, bloqueados

**Actualización:**
- Real-time listeners Firestore

#### RF-11: Dashboard Guía
**Contenido:**
- Vista calendario personal (3 meses)
- Solo sus turnos (ASIGNADO, NO_DISPONIBLE, LIBRE sin guiaId)
- Próximas asignaciones (lista ordenada por fecha)

**Actualización:**
- Real-time listeners Firestore con filtro `guiaId`

### 3.4 Autenticación

#### RF-12: Login Manager
- Firebase Auth con email `madrid@spainfoodsherpas` + contraseña
- Custom claim: `{role: "manager"}`

#### RF-13: Login Guía
- Firebase Auth con email personal + contraseña
- Custom claim: `{role: "guide", guideId: "<doc_id>"}`

#### RF-14: Invitación Guía
- Email con link único (Firebase Auth action link)
- Guía establece contraseña en primer acceso
- Expiración link: 7 días

---

## 4. Requisitos No Funcionales

### 4.1 Performance
- Tiempo respuesta operaciones CRUD: <2s (p95)
- Carga inicial dashboard: <3s
- Validación Calendar API: <1.5s

### 4.2 Disponibilidad
- SLA: ≥99% en horario 09:00-22:00 CET
- Downtime planificado: ventanas madrugada

### 4.3 Escalabilidad
- Soporte: 10 guías concurrentes
- 3 meses × 30 días × 4 slots = ~360 documentos `shifts`
- Proyección 1 año: ~1,500 documentos (con histórico)

### 4.4 Seguridad
- Firestore Security Rules validando roles
- No secretos hardcodeados (Cloud Secret Manager)
- HTTPS obligatorio
- Validación input server-side

### 4.5 Usabilidad
- Responsive design (mobile-first)
- Accesibilidad: WCAG 2.1 AA mínimo
- Idioma: Español

---

## 5. Integraciones Externas

### 5.1 Google Calendar API

**Calendar ID:** `c_61981c641dc3c970e63f1713ccc2daa49d8fe8962b6ed9f2669c4554496c7bdd@group.calendar.google.com`

**Autenticación:**
- Service Account con domain-wide delegation
- Scopes: `https://www.googleapis.com/auth/calendar.readonly`

**Operación RF-06 (Validación pre-asignación):**
```
GET https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events
Params:
  - timeMin: YYYY-MM-DDT00:00:00Z
  - timeMax: YYYY-MM-DDT23:59:59Z
  - singleEvents: true
  
Filter client-side por hora inicio:
  - MAÑANA: 12:00
  - T1: 17:15
  - T2: 18:15
  - T3: 19:15
```

**Límites:**
- 1,000,000 queries/día (proyecto)
- 100 queries/min/user
- Estrategia: cache validaciones 5 min (Cloud Function memory)

### 5.2 Gmail API (envío emails)

**Autenticación:**
- GmailApp en Apps Script con cuenta `madrid@spainfoodsherpas`

**Operaciones:**
- Envío email asignación (RF-06)
- Envío email liberación (RF-07)
- Envío email invitación (RF-01)

**Plantillas:**
```
Asunto: Nueva asignación - {fecha} {slot}
Cuerpo:
Hola {nombre_guia},

Se te ha asignado el siguiente turno:
- Fecha: {fecha_legible}
- Hora: {hora_inicio}
- Tipo: {slot}

Saludos,
Spain Food Sherpas
```

**Límites:**
- Workspace: 2,000 emails/día
- Uso estimado: <20 emails/día

---

## 6. Modelo de Datos Firestore

### 6.1 Colección `guides`

**Path:** `/guides/{guideId}`

**Estructura:**
```json
{
  "nombre": "string",
  "email": "string (único)",
  "telefono": "string | null",
  "direccion": "string | null",
  "dni": "string (no editable)",
  "cuenta_bancaria": "string | null",
  "estado": "activo | inactivo",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

**Índices:**
- `email` (ascending) - único
- `estado` (ascending)

### 6.2 Colección `shifts`

**Path:** `/shifts/{shiftId}`

**shiftId:** `YYYY-MM-DD_SLOT` (ej: `2025-10-15_T1`)

**Estructura:**
```json
{
  "fecha": "YYYY-MM-DD",
  "slot": "MAÑANA | T1 | T2 | T3",
  "estado": "LIBRE | ASIGNADO | NO_DISPONIBLE",
  "guiaId": "string | null",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

**Índices compuestos:**
- `fecha` (ascending), `estado` (ascending)
- `guiaId` (ascending), `fecha` (ascending)
- `estado` (ascending), `fecha` (ascending)

### 6.3 Colección `notifications` (auditoría)

**Path:** `/notifications/{notificationId}`

**Estructura:**
```json
{
  "guiaId": "string",
  "tipo": "ASIGNACION | LIBERACION | INVITACION",
  "shiftId": "string | null",
  "emailTo": "string",
  "status": "sent | failed",
  "errorMessage": "string | null",
  "sentAt": "timestamp"
}
```

**Índice:**
- `guiaId` (ascending), `sentAt` (descending)

### 6.4 Reglas de Seguridad Firestore

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helpers
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function isManager() {
      return isAuthenticated() && 
             request.auth.token.role == "manager";
    }
    
    function isGuide() {
      return isAuthenticated() && 
             request.auth.token.role == "guide";
    }
    
    function isOwner(guideId) {
      return isAuthenticated() && 
             request.auth.token.guideId == guideId;
    }
    
    // Colección guides
    match /guides/{guideId} {
      allow read: if isManager() || isOwner(guideId);
      allow create: if isManager();
      allow update: if isManager() && 
                       request.resource.data.email == resource.data.email &&
                       request.resource.data.dni == resource.data.dni;
      allow delete: if false; // Solo soft delete
    }
    
    // Colección shifts
    match /shifts/{shiftId} {
      allow read: if isAuthenticated();
      
      allow create: if isManager(); // Solo generación automática
      
      allow update: if (isManager() && 
                         // Manager: LIBRE ↔ ASIGNADO
                         ((resource.data.estado == "LIBRE" && 
                           request.resource.data.estado == "ASIGNADO") ||
                          (resource.data.estado == "ASIGNADO" && 
                           request.resource.data.estado == "LIBRE")))
                       ||
                       (isGuide() && 
                         // Guía: LIBRE ↔ NO_DISPONIBLE (solo sus turnos)
                         ((resource.data.estado == "LIBRE" && 
                           request.resource.data.estado == "NO_DISPONIBLE" &&
                           request.resource.data.guiaId == request.auth.token.guideId) ||
                          (resource.data.estado == "NO_DISPONIBLE" && 
                           request.resource.data.estado == "LIBRE" &&
                           resource.data.guiaId == request.auth.token.guideId)));
      
      allow delete: if false;
    }
    
    // Colección notifications (solo lectura Manager)
    match /notifications/{notificationId} {
      allow read: if isManager();
      allow write: if false; // Solo Cloud Functions
    }
  }
}
```

---

## 7. Stack Tecnológico

### 7.1 Frontend
- **Framework:** Vanilla JS (HTML/CSS/JS)
- **UI Library:** Considera Tailwind CSS (CDN)
- **Hosting:** Firebase Hosting
- **Estado:** Firestore real-time listeners

### 7.2 Backend
- **Auth:** Firebase Authentication
- **DB:** Cloud Firestore
- **Functions:** Cloud Functions for Firebase (Node.js 20)
- **Scheduler:** Cloud Scheduler (generación turnos)

### 7.3 Integraciones
- **Calendar:** Google Calendar API v3
- **Email:** Google Apps Script (GmailApp)
- **Service Account:** Domain-wide delegation

### 7.4 DevOps
- **CI/CD:** GitHub Actions
- **Environments:** dev, staging, prod (3 Firebase projects)
- **Testing:** Firebase Emulator Suite + Jest
- **Monitoring:** Firebase Performance + Cloud Logging

---

## 8. Restricciones y Supuestos

### 8.1 Restricciones Técnicas
- Firebase Spark plan (límites gratuitos) para MVP
- Calendar API: 1M queries/día
- Gmail: 2,000 emails/día
- Cloud Functions: 125K invocaciones/mes, 2M GB-s/mes

### 8.2 Supuestos de Negocio
- Máximo 10 guías en sistema
- Máximo 50 operaciones/día (asignaciones + liberaciones)
- Sin bulk operations MVP
- Sin soporte multi-idioma MVP
- Sin integración con sistema de pagos MVP

### 8.3 Fuera de Alcance MVP
- Notificaciones push
- App móvil nativa
- Gestión de tours (solo turnos)
- Reportes avanzados
- Exportación datos
- API pública

---

## 9. Plan de Rollout

### 9.1 Criterios de Aceptación MVP
- ✅ Manager puede crear 10 guías
- ✅ Generación automática 3 meses
- ✅ Validación Calendar API funcionando
- ✅ 100% emails enviados correctamente
- ✅ Real-time sync <5s
- ✅ 0 errores críticos en Firestore rules

### 9.2 Métricas Post-Launch
- Latencia p95 operaciones
- Tasa error Calendar API
- Bounce rate emails
- Uptime dashboard
- Errores Firestore rules

---

## 10. Apéndices

### 10.1 Glosario
- **Slot:** Franja horaria específica de un turno (MAÑANA, T1, T2, T3)
- **Shift:** Documento Firestore representando un turno específico
- **Custom Claim:** Atributo JWT en Firebase Auth para roles
- **Soft Delete:** Marcado lógico como inactivo sin eliminar físicamente

### 10.2 Referencias
- Firebase Auth: https://firebase.google.com/docs/auth
- Firestore Security Rules: https://firebase.google.com/docs/firestore/security/get-started
- Calendar API: https://developers.google.com/calendar/api/v3/reference
- Gmail API: https://developers.google.com/gmail/api/reference/rest

---

**Fin del documento**
