# HU-BOOKEO-01: Sincronización automática disponibilidad → Bookeo

**Como** Manager  
**Quiero** que Bookeo se bloquee/desbloquee automáticamente cuando todos/algún guía cambia disponibilidad  
**Para** evitar reservas en turnos sin guías disponibles

**Prioridad:** Alta  
**Estimación:** 8 puntos  
**Sprint:** Feature Bookeo Sync  
**Fecha creación:** 2025-10-10

---

## Criterios de Aceptación

```gherkin
Feature: Sincronización Bookeo vía Zapier

  Background:
    Given existen 5 guías activos en el sistema
    And Zapier webhook está configurado en Cloud Function
    And Manager tiene email "madrid@spainfoodsherpas.com"

  Scenario: Bloquear turno MAÑANA cuando todos guías NO_DISPONIBLE
    Given fecha "2025-11-15" slot "MAÑANA"
    And 4 guías tienen estado "NO_DISPONIBLE"
    When el 5º guía marca "NO_DISPONIBLE"
    Then se dispara Cloud Function en <5 segundos
    And se envía email al Manager con asunto "🚫 Turno bloqueado: 15 Nov MAÑANA"
    And se envía webhook POST a Zapier con:
      | Campo      | Valor           |
      | action     | BLOQUEAR        |
      | startDate  | 2025-11-15      |
      | startTime  | 12:00           |
      | slot       | MAÑANA          |
    And Zapier procesa bloqueo en Bookeo API
    And se registra log en Firestore con timestamp

  Scenario: Bloquear turno T2 cuando todos guías NO_DISPONIBLE TARDE
    Given fecha "2025-11-15" slot "T2"
    And 4 guías tienen estado "NO_DISPONIBLE" en TARDE
    When el 5º guía marca "NO_DISPONIBLE" en TARDE
    Then se envía webhook con startTime "18:15"
    And email indica "🚫 Turno bloqueado: 15 Nov TARDE (T2)"

  Scenario: Desbloquear MAÑANA cuando 1 guía vuelve LIBRE
    Given fecha "2025-11-15" slot "MAÑANA" está bloqueado en Bookeo
    And bookeoId "abc123xyz" guardado en Firestore
    And 5 guías tienen estado "NO_DISPONIBLE"
    When 1 guía cambia a "LIBRE"
    Then se dispara Cloud Function en <5 segundos
    And se envía email con asunto "✅ Turno desbloqueado: 15 Nov MAÑANA"
    And se envía webhook POST a Zapier con:
      | Campo      | Valor           |
      | action     | DESBLOQUEAR     |
      | bookeoId   | abc123xyz       |
      | startDate  | 2025-11-15      |
      | startTime  | 12:00           |
    And Zapier elimina bloqueo en Bookeo API

  Scenario: Desbloquear T2 cuando 1 guía vuelve LIBRE en TARDE
    Given fecha "2025-11-15" slot "T2" está bloqueado
    And 5 guías NO_DISPONIBLE en TARDE
    When 1 guía libera TARDE
    Then webhook incluye startTime "18:15"
    And email indica "✅ Turno desbloqueado: 15 Nov TARDE (T2)"

  Scenario: No disparar webhook si no todos están bloqueados
    Given fecha "2025-11-15" slot "MAÑANA"
    And 3 guías tienen "NO_DISPONIBLE"
    And 2 guías tienen "LIBRE"
    When cualquier guía cambia estado
    Then NO se envía webhook
    And NO se envía email

  Scenario: Guardar bookeoId tras bloqueo exitoso
    Given se dispara bloqueo MAÑANA
    When Zapier responde con bookeoId "xyz789"
    Then se guarda en Firestore colección "bookeo_blocks":
      | Campo      | Valor           |
      | fecha      | 2025-11-15      |
      | slot       | MAÑANA          |
      | bookeoId   | xyz789          |
      | status     | active          |
      | createdAt  | timestamp       |

  Scenario: Actualizar bookeoId tras desbloqueo
    Given bookeoId "xyz789" en estado "active"
    When se desbloquea turno exitosamente
    Then se actualiza documento:
      | Campo        | Valor           |
      | status       | deleted         |
      | deletedAt    | timestamp       |

  Scenario: Email de bloqueo incluye información clara
    When se bloquea "2025-11-15 MAÑANA"
    Then email contiene:
      """
      Asunto: 🚫 Turno bloqueado en Bookeo: 15 Nov MAÑANA
      
      Todos los guías están NO DISPONIBLES en:
      - Fecha: Viernes, 15 Noviembre 2025
      - Turno: MAÑANA (12:00)
      
      El turno ha sido bloqueado automáticamente en Bookeo.
      """

  Scenario: Email de desbloqueo incluye información clara
    When se desbloquea "2025-11-15 T2"
    Then email contiene:
      """
      Asunto: ✅ Turno desbloqueado en Bookeo: 15 Nov TARDE
      
      Al menos 1 guía está disponible en:
      - Fecha: Viernes, 15 Noviembre 2025
      - Turno: TARDE (T2 - 18:15)
      
      El turno ha sido habilitado en Bookeo.
      """

  Scenario: Manejo de error Zapier
    Given se dispara bloqueo
    When Zapier responde con error 500
    Then se reintenta 3 veces con backoff exponencial
    And se envía email de error al Manager
    And se registra log con status "failed"

  Scenario: T1 y T3 NO se sincronizan
    Given guía bloquea TARDE (crea T1, T2, T3 en Firestore)
    When todos guías NO_DISPONIBLE en TARDE
    Then webhook SOLO incluye T2 (18:15)
    And T1 y T3 se ignoran en sincronización
```

---

## Notas Técnicas

### Slots sincronizados
- **MAÑANA:** 12:00 (sincroniza con Bookeo)
- **T2 (TARDE):** 18:15 (único slot tarde sincronizado)
- **T1:** 17:15 (NO sincroniza - bloqueado por defecto en Bookeo)
- **T3:** 19:15 (NO sincroniza - futuro, no existe aún en Bookeo)

### Lógica operativa
- **Bloqueo:** Requiere 100% guías activos en NO_DISPONIBLE
- **Desbloqueo:** Basta con 1 guía en LIBRE
- **Tiempo respuesta:** <5 segundos desde cambio estado

### Dependencias
- Cloud Functions desplegadas
- Zapier webhook configurado
- Gmail API habilitada
- Firestore Rules actualizadas

---

## Criterios de Aceptación QA

- [ ] Bloqueo MAÑANA funciona con 5 guías
- [ ] Bloqueo T2 funciona con 5 guías
- [ ] Desbloqueo restaura turno en Bookeo
- [ ] Email Manager recibido en <10 segundos
- [ ] Logs Firestore registran todas operaciones
- [ ] Reintentos funcionan ante error Zapier
- [ ] T1 y T3 NO disparan webhooks
- [ ] Funciona con 3, 4, 5+ guías activos
