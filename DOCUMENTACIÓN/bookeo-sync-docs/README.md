# Documentación Feature: Sincronización Bookeo

**Versión:** 1.0  
**Fecha:** 2025-10-10  
**Branch:** `feature/bookeo-sync`  
**Estado:** Documentación completa - Pendiente implementación

---

## Descripción General

Feature que sincroniza automáticamente la disponibilidad de guías con el sistema de reservas Bookeo. Cuando todos los guías marcan NO_DISPONIBLE en un turno, el sistema bloquea automáticamente ese turno en Bookeo vía webhook Zapier. Cuando al menos 1 guía vuelve disponible, el turno se desbloquea.

**Objetivo:** Evitar reservas en turnos sin cobertura de guías.

---

## Índice de Documentación

### 📋 [HU-BOOKEO-01.md](./HU-BOOKEO-01.md)
**Historia de Usuario con Criterios de Aceptación**

Contiene:
- 12 escenarios Gherkin detallados
- Criterios de aceptación QA
- Lógica de negocio (bloqueo/desbloqueo)
- Casos edge y manejo de errores
- Slots sincronizados (MAÑANA, T2)

**Lectura obligatoria:** ✅ Manager, Desarrolladores, QA

---

### 🏗️ [ADR-005-sincronizacion-bookeo.md](./ADR-005-sincronizacion-bookeo.md)
**Decisión Arquitectónica**

Contiene:
- Contexto y problema
- Decisión: Cloud Function → Zapier → Bookeo API
- Alternativas descartadas (con pros/contras)
- Consecuencias positivas y negativas
- Diagrama de flujo arquitectura
- Compliance (GDPR, auditoría)

**Lectura obligatoria:** ✅ Arquitectos, Tech Leads

---

### 🔌 [CONTRATO-WEBHOOK-ZAPIER.md](./CONTRATO-WEBHOOK-ZAPIER.md)
**Especificación Técnica API Webhook**

Contiene:
- Endpoint Zapier
- Payload request BLOQUEAR/DESBLOQUEAR
- Response esperada (éxito/error)
- Códigos de error detallados
- Flujo de reintentos
- Ejemplos cURL
- Validaciones Zapier (responsabilidad Pablo)

**Lectura obligatoria:** ✅ Desarrolladores Backend, Pablo (Zapier)

---

### 💾 [MODELO-DATOS-BOOKEO.md](./MODELO-DATOS-BOOKEO.md)
**Modelo de Datos Firestore**

Contiene:
- Estructura colección `bookeo_blocks`
- Campos detallados (tipos, obligatorios)
- Estados posibles (active, deleted, failed)
- Índices Firestore requeridos
- Reglas de seguridad
- Queries útiles
- Ejemplos de documentos
- Política de limpieza datos históricos

**Lectura obligatoria:** ✅ Desarrolladores Backend, DBA

---

### ⚙️ [VARIABLES-ENTORNO.md](./VARIABLES-ENTORNO.md)
**Configuración Variables de Entorno**

Contiene:
- Variables requeridas y opcionales
- Configuración Firebase Functions
- Uso en código (JavaScript/TypeScript)
- Script validación pre-deploy
- Buenas prácticas seguridad
- Configuración por ambiente (dev/staging/prod)
- Troubleshooting común

**Lectura obligatoria:** ✅ DevOps, Desarrolladores

---

## Flujo de Implementación

### Fase 1: Preparación (2h)
1. ✅ Documentación completa (este paquete)
2. ⏳ Revisar documentación con Manager
3. ⏳ Coordinar con Pablo configuración Zapier
4. ⏳ Crear branch `feature/bookeo-sync`

### Fase 2: Backend (6h)
1. ⏳ Configurar variables entorno Firebase
2. ⏳ Crear Cloud Function `syncBookeoAvailability`
3. ⏳ Implementar helper `detectFullBlockage()`
4. ⏳ Implementar helper `sendZapierWebhook()`
5. ⏳ Implementar helper `sendManagerEmail()`
6. ⏳ Actualizar Firestore Rules (colección `bookeo_blocks`)
7. ⏳ Testing unitario + integración

### Fase 3: Integración Zapier (2h)
1. ⏳ Pablo configura Zap "Calendar App - Bookeo Sync"
2. ⏳ Webhook trigger configurado
3. ⏳ Testing webhook dev → Zapier
4. ⏳ Validar respuesta Zapier formato correcto

### Fase 4: Testing E2E (3h)
1. ⏳ Escenario bloqueo MAÑANA completo
2. ⏳ Escenario desbloqueo T2 completo
3. ⏳ Testing manejo errores (timeout, 500, etc)
4. ⏳ Validar emails Manager recibidos
5. ⏳ Verificar logs Firestore

### Fase 5: Deploy Staging (1h)
1. ⏳ Deploy Cloud Functions staging
2. ⏳ Configurar Zapier staging
3. ⏳ UAT con Manager
4. ⏳ Corrección bugs encontrados

### Fase 6: Deploy Producción (1h)
1. ⏳ Deploy Cloud Functions producción
2. ⏳ Activar Zapier producción
3. ⏳ Monitoreo 48h
4. ⏳ Merge a `main`

**Total estimado:** 15 horas

---

## Dependencias Críticas

### Internas
- ✅ Firebase Functions desplegadas
- ✅ Firestore con colección `shifts` activa
- ✅ Gmail API habilitada (emails Manager)
- ✅ 5 guías activos en sistema

### Externas
- ⏳ Zapier webhook configurado (Pablo)
- ⏳ Bookeo API accesible desde Zapier
- ⏳ Credenciales Bookeo API válidas (Pablo)

---

## Slots Sincronizados

| Slot | Horario | Sincroniza Bookeo | Notas |
|------|---------|-------------------|-------|
| MAÑANA | 12:00 | ✅ Sí | |
| T1 | 17:15 | ❌ No | Bloqueado por defecto en Bookeo |
| T2 | 18:15 | ✅ Sí | Único slot TARDE sincronizado |
| T3 | 19:15 | ❌ No | Futuro - no existe aún en Bookeo |

---

## Lógica de Negocio

### Trigger Bloqueo
```
Condición: 100% guías activos en NO_DISPONIBLE
Acción: Webhook BLOQUEAR → Bookeo
Notificación: Email Manager
```

### Trigger Desbloqueo
```
Condición: ≥1 guía vuelve LIBRE
Acción: Webhook DESBLOQUEAR → Bookeo
Notificación: Email Manager
```

### Tiempo de Respuesta
```
Target: <5 segundos desde cambio estado
Máximo aceptable: <10 segundos
```

---

## Roles y Responsabilidades

| Rol | Responsabilidad |
|-----|----------------|
| **Manager** | Aprobar feature, UAT, recibir notificaciones |
| **Desarrollador Backend** | Implementar Cloud Functions, testing |
| **Pablo (Zapier)** | Configurar/mantener Zap, gestionar Bookeo API |
| **QA** | Testing E2E, validar criterios aceptación |
| **DevOps** | Configurar variables entorno, deploy |

---

## Contactos

- **Manager:** madrid@spainfoodsherpas.com
- **Pablo (Zapier/Bookeo):** [pendiente email]
- **Equipo desarrollo:** [pendiente]

---

## Checklist Pre-Implementación

### Documentación
- [x] Historia de usuario completa
- [x] Decisión arquitectónica registrada
- [x] Contrato webhook especificado
- [x] Modelo datos definido
- [x] Variables entorno documentadas

### Coordinación
- [ ] Manager revisó y aprobó documentación
- [ ] Pablo confirmó disponibilidad para configurar Zapier
- [ ] Equipo desarrollo asignado
- [ ] Fechas deploy staging/prod acordadas

### Técnico
- [ ] Branch `feature/bookeo-sync` creado
- [ ] Variables entorno dev configuradas
- [ ] Zapier dev/staging webhook creado (Pablo)
- [ ] Acceso Gmail API verificado

---

## Riesgos Identificados

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Zapier down | Baja | Alto | Email Manager como respaldo |
| Bookeo API timeout | Media | Medio | Reintentos automáticos (3x) |
| Rate limit Bookeo | Baja | Medio | Zapier gestiona queue |
| Emails no recibidos | Baja | Alto | Logs Firestore + monitoreo |
| Bloqueo sin guías disponibles | Media | Alto | Testing exhaustivo escenarios |

---

## Métricas de Éxito

Post-implementación (primeros 30 días):

- [ ] 0 reservas en turnos sin guías
- [ ] Tiempo respuesta promedio <5s
- [ ] Tasa éxito webhooks >99%
- [ ] 0 incidentes seguridad
- [ ] Manager satisfecho con notificaciones

---

## Próximos Pasos

1. **Manager:** Revisar toda la documentación
2. **Manager:** Aprobar feature para implementación
3. **Equipo:** Crear branch `feature/bookeo-sync`
4. **Pablo:** Configurar Zapier webhook dev
5. **Desarrollador:** Comenzar Fase 2 (Backend)

---

## Versionado Documentación

| Versión | Fecha | Cambios |
|---------|-------|---------|
| 1.0 | 2025-10-10 | Documentación inicial completa |

---

## Licencia

© 2025 Spain Food Sherpas - Documentación interna
