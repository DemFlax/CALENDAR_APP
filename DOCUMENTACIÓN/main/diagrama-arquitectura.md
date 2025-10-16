# Arquitectura del Sistema - Calendario Tours Madrid

## Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND LAYER                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────┐         ┌─────────────────────────┐  │
│  │  Manager Dashboard   │         │   Guía Dashboard        │  │
│  │  (Vanilla JS/HTML)   │         │   (Vanilla JS/HTML)     │  │
│  ├──────────────────────┤         ├─────────────────────────┤  │
│  │ - CRUD Guías         │         │ - Ver mis turnos        │  │
│  │ - Asignar turnos     │         │ - Bloquear/desbloquear  │  │
│  │ - Liberar turnos     │         │ - Ver asignaciones      │  │
│  │ - Dashboard global   │         │ - Calendario personal   │  │
│  └──────────┬───────────┘         └───────────┬─────────────┘  │
│             │                                 │                │
│             └────────────┬────────────────────┘                │
│                          │                                     │
│                   Firebase JS SDK                              │
│                          │                                     │
└──────────────────────────┼─────────────────────────────────────┘
                           │
                           │ HTTPS
                           │
┌──────────────────────────┼─────────────────────────────────────┐
│                    FIREBASE SERVICES                            │
├──────────────────────────┼─────────────────────────────────────┤
│                          │                                     │
│  ┌───────────────────────▼──────────────────────┐              │
│  │       Firebase Authentication                │              │
│  ├──────────────────────────────────────────────┤              │
│  │ - Email + Password                           │              │
│  │ - Custom Claims: {role, guideId}             │              │
│  │ - Action Links (invitación)                  │              │
│  └──────────────────────┬───────────────────────┘              │
│                         │                                      │
│  ┌──────────────────────▼───────────────────────┐              │
│  │       Cloud Firestore                        │              │
│  ├──────────────────────────────────────────────┤              │
│  │ Collections:                                 │              │
│  │ - /guides/{guideId}                          │              │
│  │ - /shifts/{YYYY-MM-DD_SLOT}                  │              │
│  │ - /notifications/{notificationId}            │              │
│  ├──────────────────────────────────────────────┤              │
│  │ Security Rules: Role-based access            │              │
│  │ Real-time Listeners: onSnapshot              │              │
│  └──────┬──────────────────┬────────────────────┘              │
│         │                  │                                   │
│         │                  │ Triggers                          │
│         │                  │                                   │
│  ┌──────▼──────────────────▼────────────────────┐              │
│  │       Cloud Functions for Firebase           │              │
│  ├──────────────────────────────────────────────┤              │
│  │ onCreate Guide:                              │              │
│  │  → Enviar invitación                         │──────┐       │
│  │  → Set custom claims                         │      │       │
│  │                                              │      │       │
│  │ onUpdate Shift (LIBRE→ASIGNADO):             │      │       │
│  │  → Validar Calendar API                      │──────┼───┐   │
│  │  → Enviar email asignación                   │      │   │   │
│  │                                              │      │   │   │
│  │ onUpdate Shift (ASIGNADO→LIBRE):             │      │   │   │
│  │  → Enviar email liberación                   │──────┤   │   │
│  │                                              │      │   │   │
│  │ HTTP generateMonthlyShifts:                  │      │   │   │
│  │  → Crear mes +2 (batch write)                │      │   │   │
│  │  → Seed inicial si vacío                     │      │   │   │
│  └──────────────────────────────────────────────┘      │   │   │
│                                                        │   │   │
│  ┌─────────────────────────────────────────────┐      │   │   │
│  │       Firebase Hosting                      │      │   │   │
│  ├─────────────────────────────────────────────┤      │   │   │
│  │ - Static files (HTML/CSS/JS)                │      │   │   │
│  │ - CDN global                                │      │   │   │
│  │ - HTTPS automático                          │      │   │   │
│  └─────────────────────────────────────────────┘      │   │   │
│                                                        │   │   │
└────────────────────────────────────────────────────────┼───┼───┘
                                                         │   │
                                         HTTPS POST      │   │
                                                         │   │
┌────────────────────────────────────────────────────────┼───┼───┐
│                  GOOGLE WORKSPACE APIs                 │   │   │
├────────────────────────────────────────────────────────┼───┼───┤
│                                                        │   │   │
│  ┌─────────────────────────────────────────────┐      │   │   │
│  │       Apps Script Web App                   │◄─────┘   │   │
│  ├─────────────────────────────────────────────┤          │   │
│  │ Deployed as: madrid@spainfoodsherpas        │          │   │
│  │                                             │          │   │
│  │ Endpoints:                                  │          │   │
│  │ - POST /validateTour                        │          │   │
│  │ - POST /sendEmail                           │          │   │
│  └─────────┬─────────────────┬─────────────────┘          │   │
│            │                 │                            │   │
│            │                 │                            │   │
│  ┌─────────▼─────────┐  ┌────▼──────────────┐            │   │
│  │  Calendar API     │  │   GmailApp        │◄───────────┘   │
│  ├───────────────────┤  ├───────────────────┤                │
│  │ Calendar ID:      │  │ From:             │                │
│  │ c_61981c6...      │  │ madrid@spain...   │                │
│  │                   │  │                   │                │
│  │ Validar eventos:  │  │ Send HTML emails  │                │
│  │ - 12:00 MAÑANA    │  │ - Asignación      │                │
│  │ - 17:15 T1        │  │ - Liberación      │                │
│  │ - 18:15 T2        │  │ - Invitación      │                │
│  │ - 19:15 T3        │  └───────────────────┘                │
│  └───────────────────┘                                       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                           │
                           │ Cron-like trigger
                           │
┌──────────────────────────▼───────────────────────────────────┐
│                  EXTERNAL SCHEDULER                          │
├──────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────┐              │
│  │  Cloud Scheduler (GCP)                     │              │
│  │  OR cron-job.org (free alternative)        │              │
│  ├────────────────────────────────────────────┤              │
│  │  Schedule: Daily 00:00 UTC                 │              │
│  │  Target: generateMonthlyShifts Function    │              │
│  │  Payload: {"action": "generateMonth"}      │              │
│  └────────────────────────────────────────────┘              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Flujo de Datos - Asignar Turno

```
┌──────────┐                                                           
│ Manager  │                                                           
│ Dashboard│                                                           
└────┬─────┘                                                           
     │                                                                 
     │ 1. Click "Asignar turno X a guía Y"                            
     ▼                                                                 
┌─────────────────┐                                                    
│ Frontend        │                                                    
│ Validation      │                                                    
└────┬────────────┘                                                    
     │ 2. Check: turno.estado === "LIBRE"?                            
     │    Check: guia.estado === "activo"?                            
     ▼                                                                 
┌─────────────────┐                                                    
│ Show spinner    │                                                    
│ "Validando..."  │                                                    
└────┬────────────┘                                                    
     │                                                                 
     │ 3. Firestore SDK: runTransaction                               
     ▼                                                                 
┌─────────────────────────────────────────────┐                       
│ Cloud Function: onUpdate shifts/{shiftId}   │                       
├─────────────────────────────────────────────┤                       
│ 4. Detectar cambio LIBRE → ASIGNADO         │                       
│ 5. Leer shift data: {fecha, slot, guiaId}   │                       
│ 6. HTTP POST → Apps Script:                 │                       
│    {date: "2025-10-15", slot: "T1"}         │                       
└────┬────────────────────────────────────────┘                       
     │                                                                 
     │ 7. HTTPS Request                                               
     ▼                                                                 
┌─────────────────────────────────────────────┐                       
│ Apps Script Web App: /validateTour          │                       
├─────────────────────────────────────────────┤                       
│ 8. Parse request: fecha, slot                │                       
│ 9. Map slot → hora inicio:                   │                       
│    T1 → "17:15"                              │                       
│ 10. Calendar.Events.list({                   │                       
│      calendarId: "c_61981c6...",             │                       
│      timeMin: "2025-10-15T00:00:00Z",        │                       
│      timeMax: "2025-10-15T23:59:59Z"         │                       
│    })                                        │                       
│ 11. Filter: event.start.time === "17:15"     │                       
│ 12. Return: {exists: true/false}             │                       
└────┬────────────────────────────────────────┘                       
     │                                                                 
     │ 13. Response JSON                                              
     ▼                                                                 
┌─────────────────────────────────────────────┐                       
│ Cloud Function (continuación)               │                       
├─────────────────────────────────────────────┤                       
│ 14. if (!exists) {                           │                       
│       throw Error("NO EXISTE TOUR...")       │                       
│     }                                        │                       
│ 15. Commit transaction (ya aplicada)         │                       
│ 16. Leer guía data: {nombre, email}          │                       
│ 17. HTTP POST → Apps Script:                 │                       
│     /sendEmail {                             │                       
│       to: "guia@gmail.com",                  │                       
│       subject: "Nueva asignación...",        │                       
│       body: "Hola [nombre]..."               │                       
│     }                                        │                       
│ 18. Escribir notification doc:               │                       
│     {guiaId, tipo: ASIGNACION, status}       │                       
└────┬────────────────────────────────────────┘                       
     │                                                                 
     │ 19. HTTPS Request                                              
     ▼                                                                 
┌─────────────────────────────────────────────┐                       
│ Apps Script: /sendEmail                     │                       
├─────────────────────────────────────────────┤                       
│ 20. GmailApp.sendEmail({                     │                       
│       to: params.to,                         │                       
│       subject: params.subject,               │                       
│       htmlBody: params.body                  │                       
│     })                                       │                       
│ 21. Return: {status: "sent"}                 │                       
└────┬────────────────────────────────────────┘                       
     │                                                                 
     │ 22. Response OK                                                
     ▼                                                                 
┌─────────────────────────────────────────────┐                       
│ Firestore onSnapshot (Manager + Guía)       │                       
├─────────────────────────────────────────────┤                       
│ 23. Detectar cambio en shift doc             │                       
│ 24. Update UI:                               │                       
│     - Manager: turno → azul "Asignado a Y"   │                       
│     - Guía: turno → azul "Asignado"          │                       
└─────────────────────────────────────────────┘                       
                                                                       
TOTAL LATENCIA: ~2-3 segundos                                         
- Frontend validation: 50ms                                           
- Firestore transaction: 200ms                                        
- Calendar API validation: 800-1500ms                                 
- Email sending: 500ms                                                
- Real-time sync: <1000ms                                             
```

---

## Flujo de Datos - Generación Mensual

```
┌────────────────┐
│ Cloud Scheduler│
│ 00:00 UTC      │
└────┬───────────┘
     │
     │ Daily trigger
     ▼
┌─────────────────────────────────────────────┐
│ Cloud Function: generateMonthlyShifts       │
├─────────────────────────────────────────────┤
│ 1. Get current date                          │
│ 2. Calculate month +2                        │
│ 3. Query Firestore:                          │
│    shifts.where('fecha', '>=', month+2-start)│
│           .where('fecha', '<=', month+2-end) │
│           .limit(1)                          │
│                                              │
│ 4. IF empty:                                 │
│      → Generate all shifts for month +2      │
│      → Batch write (30-31 days × 4 slots)    │
│      → Log: "Generated X shifts"             │
│    ELSE:                                     │
│      → Log: "Month already exists"           │
│      → Exit                                  │
└─────────────────────────────────────────────┘
     │
     │ Batch commit
     ▼
┌─────────────────────────────────────────────┐
│ Firestore: /shifts                           │
├─────────────────────────────────────────────┤
│ New documents created:                       │
│ - 2025-12-01_MAÑANA                          │
│ - 2025-12-01_T1                              │
│ - 2025-12-01_T2                              │
│ - 2025-12-01_T3                              │
│ - ...                                        │
│ - 2025-12-31_T3                              │
│                                              │
│ Total: 124 docs (December)                   │
└─────────────────────────────────────────────┘
     │
     │ Real-time listener
     ▼
┌─────────────────────────────────────────────┐
│ Manager Dashboard (si está activo)           │
├─────────────────────────────────────────────┤
│ - Calendario se actualiza con nuevo mes      │
│ - Toast: "Diciembre 2025 disponible"        │
└─────────────────────────────────────────────┘
```

---

## Componentes y Tecnologías

### Frontend
- **Framework:** Vanilla JavaScript ES6+
- **Estilo:** Tailwind CSS via CDN
- **Build:** Ninguno (deploy directo)
- **Hosting:** Firebase Hosting
- **Comunicación:** Firebase JS SDK v9

### Backend - Firebase
- **Auth:** Firebase Authentication
- **Database:** Cloud Firestore
- **Functions:** Cloud Functions for Firebase (Node.js 20)
- **Hosting:** Firebase Hosting
- **Scheduler:** Cloud Scheduler (GCP) o cron-job.org

### Backend - Google Workspace
- **Runtime:** Google Apps Script (V8)
- **APIs:** Calendar API v3, GmailApp (mail service)
- **Deployment:** clasp CLI
- **Execution:** madrid@spainfoodsherpas identity

### DevOps
- **VCS:** GitHub
- **CI/CD:** GitHub Actions
- **Testing:** Firebase Emulator Suite, Jest
- **Monitoring:** Cloud Logging, Firebase Performance

---

## Seguridad - Layers

```
┌─────────────────────────────────────────────────────────┐
│ Layer 1: Network                                        │
│ - HTTPS obligatorio                                     │
│ - CORS configurado                                      │
│ - Firebase Hosting CDN con DDoS protection             │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│ Layer 2: Authentication                                 │
│ - Firebase Auth tokens (JWT)                            │
│ - Custom claims validation                              │
│ - Session management                                    │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│ Layer 3: Authorization                                  │
│ - Firestore Security Rules                              │
│ - Role-based access (Manager, Guía)                     │
│ - Document-level permissions                            │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│ Layer 4: Business Logic                                 │
│ - Cloud Functions validaciones                          │
│ - State machine enforcement                             │
│ - External API validation (Calendar)                    │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│ Layer 5: Data                                           │
│ - Firestore encryption at rest                          │
│ - Backup automático diario                              │
│ - Auditoría en /notifications                           │
└─────────────────────────────────────────────────────────┘
```

---

## Escalabilidad y Límites

### Límites Firebase Spark (Free)
| Recurso | Límite | Uso Estimado MVP | Headroom |
|---------|--------|------------------|----------|
| Firestore storage | 1 GB | ~1.5 MB | 99.85% |
| Firestore reads | 50K/día | ~2K/día | 96% |
| Firestore writes | 20K/día | ~500/día | 97.5% |
| Functions invocations | 125K/mes | ~15K/mes | 88% |
| Hosting storage | 10 GB | ~10 MB | 99.9% |
| Hosting transfer | 360 MB/día | ~50 MB/día | 86% |

### Límites Google Calendar API
| Recurso | Límite | Uso Estimado | Mitigación |
|---------|--------|--------------|------------|
| Queries/día | 1M | ~100/día | Cache 5min |
| Queries/min/user | 100 | ~5/min | Rate limiting |

### Límites Gmail (Workspace)
| Recurso | Límite | Uso Estimado | Mitigación |
|---------|--------|--------------|------------|
| Emails/día | 2,000 | ~20/día | Batch daily digest |

### Plan Escalabilidad
**Si > 20 guías o > 100 operaciones/día:**
1. Migrar a Firebase Blaze (pay-as-you-go)
2. Cache Calendar API con Redis
3. Batch emails diarios en lugar de tiempo real
4. CDN adicional (Cloudflare) si >1M requests/mes

---

## Dependencias Externas

| Servicio | Criticidad | Fallback | SLA |
|----------|------------|----------|-----|
| Firebase Auth | Crítica | Ninguno | 99.95% |
| Cloud Firestore | Crítica | Ninguno | 99.95% |
| Calendar API | Alta | Manual validation | 99.9% |
| GmailApp | Media | Logs + manual resend | 99.9% |
| Firebase Hosting | Alta | Ninguno | 99.95% |

**Single Points of Failure:**
- Firebase project deletion (mitigado: backups diarios)
- madrid@spainfoodsherpas account suspension (mitigado: service account backup)
- Calendar ID cambio/eliminación (mitigado: config variable)

---

**Versión:** 1.0  
**Última actualización:** 2025-10-03
