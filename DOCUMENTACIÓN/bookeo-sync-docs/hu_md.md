# HISTORIAS DE USUARIO: Sincronización Bookeo

**Proyecto:** Calendar App Tours Madrid  
**Versión:** 2.0 (actualizada CHAT_50)  
**Fecha:** 21 Octubre 2025

---

## HU-BOOKEO-01: Bloqueo automático turno sin guías

**Como** Manager  
**Quiero** que Bookeo bloquee turnos cuando todos marcan NO_DISPONIBLE  
**Para** evitar reservas sin cobertura

**Prioridad:** Alta  
**Estimación:** 5 puntos  

---

```gherkin
Feature: Bloqueo automático cuando 100% guías NO_DISPONIBLE

  Background:
    Given Firestore colección "/shifts" existe
    And Cloud Function "syncBookeoAvailability" deployed
    And Zapier webhook configurado
    And Manager email "madrid@spainfoodsherpas.com"
    And fecha "2025-11-15" slot "MAÑANA" libre en Bookeo
    And 5 guías activos en sistema

  Scenario: Bloquear MAÑANA cuando todos NO_DISPONIBLE
    Given documento Firestore "/shifts/2025-11-15_MAÑANA"
    And campo "guidesAvailable" = 5
    When Firestore actualiza documento con:
      | Campo            | Valor |
      | guidesAvailable  | 0     |
      | allUnavailable   | true  |
    Then Cloud Function onUpdate detecta cambio en <3s
    And función shouldBlock() retorna true
    And webhook POST enviado a Zapier:
      | Campo      | Valor      |
      | action     | BLOQUEAR   |
      | startDate  | 2025-11-15 |
      | startTime  | 12:00      |
      | slot       | MAÑANA     |
      | reason     | automatic  |
    And Zapier responde bookeoId "seat_block_xyz789"
    And Firestore actualiza:
      | Campo           | Valor               |
      | bookeoId        | seat_block_xyz789   |
      | bookeoStatus    | blocked             |
      | bookeoBlockedAt | [serverTimestamp]   |
    And email enviado a Manager:
      | Asunto | 🚫 Turno bloqueado: 15 Nov MAÑANA |
      | Cuerpo | Razón: 100% guías NO_DISPONIBLE   |
    And Bookeo turno 15 Nov 12:00 bloqueado

  Scenario: Bloquear T1 cuando todos NO_DISPONIBLE TARDE
    Given documento "/shifts/2025-11-15_T1"
    When Firestore actualiza "allUnavailable" = true
    Then webhook startTime "17:15"
    And email "🚫 Turno bloqueado: 15 Nov TARDE (T1)"
    And Bookeo elimina T2 (18:15) automáticamente

  Scenario: NO bloquear si solo 4 de 5 NO_DISPONIBLE
    Given documento "/shifts/2025-11-15_MAÑANA"
    And guidesAvailable = 1
    When Firestore actualiza "allUnavailable" = false
    Then Cloud Function detecta cambio
    But shouldBlock() retorna false
    And NO se envía webhook
    And NO se actualiza Firestore bookeoId
    And NO se envía email Manager
    And Bookeo permanece abierto

  Scenario: Bloquear considerando solo guías activos
    Given 4 guías activos, 1 inactivo
    And 4 activos NO_DISPONIBLE
    And 1 inactivo LIBRE
    When Firestore actualiza "allUnavailable" = true
    Then webhook enviado
    And Bookeo bloqueado
```

---

## HU-BOOKEO-02: Desbloqueo automático

**Como** Manager  
**Quiero** que Bookeo desbloquee cuando ≥1 guía vuelve LIBRE  
**Para** maximizar ventas

**Prioridad:** Alta  
**Estimación:** 3 puntos  

---

```gherkin
Feature: Desbloqueo automático cuando ≥1 guía LIBRE

  Background:
    Given documento "/shifts/2025-11-15_MAÑANA" tiene:
      | Campo        | Valor             |
      | bookeoId     | seat_block_xyz789 |
      | bookeoStatus | blocked           |
    And 5 guías NO_DISPONIBLE

  Scenario: Desbloquear cuando 1 guía marca LIBRE
    When Firestore actualiza:
      | Campo            | Valor |
      | guidesAvailable  | 1     |
      | allUnavailable   | false |
    Then Cloud Function detecta cambio en <3s
    And shouldUnblock() retorna true
    And webhook DESBLOQUEAR enviado:
      | Campo    | Valor             |
      | action   | DESBLOQUEAR       |
      | bookeoId | seat_block_xyz789 |
      | reason   | automatic         |
    And Zapier responde "success"
    And Firestore actualiza:
      | Campo              | Valor             |
      | bookeoStatus       | unblocked         |
      | bookeoUnblockedAt  | [serverTimestamp] |
    And email Manager:
      | Asunto | ✅ Turno desbloqueado: 15 Nov MAÑANA |
      | Cuerpo | Guía disponible                      |
    And Bookeo turno acepta reservas

  Scenario: Desbloquear T1 cuando 1 guía marca LIBRE TARDE
    Given fecha "2025-11-15" slot "T1" bloqueado
    And bookeoId "seat_block_t1_abc"
    When guía marca LIBRE en TARDE
    Then webhook incluye startTime "17:15"
    And email indica "✅ Turno desbloqueado: 15 Nov TARDE (T1)"
    And Bookeo turno 15 Nov 17:15 acepta reservas
    And Bookeo turno 15 Nov 18:15 (T2) se restaura automáticamente

  Scenario: NO desbloquear si turno no bloqueado
    Given fecha "2025-11-20" slot "MAÑANA" NO bloqueado
    And Firestore bookeoStatus NULL o "unblocked"
    When guía marca LIBRE
    Then NO se envía webhook
    And NO se actualiza Firestore
    And NO se envía email Manager

  Scenario: NO desbloquear sin bookeoId
    Given bookeoStatus "blocked"
    But bookeoId NULL
    When Firestore actualiza "guidesAvailable" = 1
    Then Cloud Function detecta bookeoId faltante
    And registra error en logs
    And envía email Manager con asunto "⚠️ ERROR Sincronización"
    And NO se envía webhook Zapier
```

---

## HU-BOOKEO-03: Bloqueo manual forzado

**Como** Manager  
**Quiero** forzar bloqueo vía Firestore field  
**Para** manejar excepciones (clima, emergencias)

**Prioridad:** Alta  
**Estimación:** 3 puntos  

---

```gherkin
Feature: Bloqueo manual vía campo forceBlock

  Background:
    Given documento "/shifts/2025-11-18_MAÑANA"
    And 3 guías LIBRES
    And turno NO bloqueado

  Scenario: Activar forceBlock bloquea inmediato
    When Firestore actualiza "forceBlock" = true
    Then Cloud Function onUpdate trigger en <2s
    And webhook BLOQUEAR enviado:
      | Campo      | Valor           |
      | action     | BLOQUEAR        |
      | startDate  | 2025-11-18      |
      | startTime  | 12:00           |
      | slot       | MAÑANA          |
      | reason     | manual          |
    And Zapier responde bookeoId "seat_block_manual_xyz"
    And Firestore actualiza bookeoId + bookeoStatus "blocked"
    And email Manager:
      | Asunto | 🚫 Turno bloqueado: 18 Nov MAÑANA |
      | Cuerpo | Razón: Bloqueo manual forzado     |
    And Bookeo turno 18 Nov 12:00 bloqueado

  Scenario: Desactivar forceBlock desbloquea
    Given forceBlock = true
    And turno bloqueado con bookeoId "seat_block_manual_xyz"
    And 3 guías LIBRES
    When Firestore actualiza "forceBlock" = false
    Then webhook DESBLOQUEAR reason "manual"
    And Firestore bookeoStatus "unblocked"
    And email "✅ Turno desbloqueado: Bloqueo manual removido"
    And Bookeo turno acepta reservas

  Scenario: forceBlock prioridad sobre disponibilidad
    Given forceBlock = true
    And turno bloqueado
    When 5 guías marcan NO_DISPONIBLE (trigger automático)
    Then NO se envía webhook adicional
    And turno permanece bloqueado
    And NO se envía email duplicado

  Scenario: Desactivar forceBlock con guías NO_DISPONIBLE
    Given forceBlock = true bloqueado manualmente
    And 5 guías NO_DISPONIBLE
    When Firestore actualiza "forceBlock" = false
    Then Cloud Function evalúa disponibilidad
    And detecta allUnavailable = true
    And turno permanece bloqueado (reason cambia a automatic)
    And email "Turno permanece bloqueado: 0 guías disponibles"
    And NO se actualiza bookeoStatus (sigue "blocked")

  Scenario: forceBlock protege contra desbloqueo accidental
    Given forceBlock = true
    And turno bloqueado manualmente
    When 1 guía marca LIBRE (trigger desbloqueo automático)
    Then NO se envía webhook DESBLOQUEAR
    And turno permanece bloqueado
    And forceBlock tiene prioridad
```

---

## HU-BOOKEO-04: Manejo errores webhook

**Como** Sistema  
**Quiero** reintentar webhooks fallidos  
**Para** garantizar sincronización confiable

**Prioridad:** Alta  
**Estimación:** 2 puntos  

---

```gherkin
Feature: Reintentos y notificación errores

  Background:
    Given documento "/shifts/2025-11-15_MAÑANA"
    And 5 guías NO_DISPONIBLE (trigger bloqueo)
    And WEBHOOK_MAX_RETRIES = 3

  Scenario: Reintento exitoso tras timeout
    Given Cloud Function envía webhook (intento 1)
    When Zapier no responde en 30s (timeout)
    Then espera 1s backoff exponencial
    And reintenta (intento 2)
    And Zapier responde exitoso con bookeoId
    Then Firestore actualiza bookeoSyncAttempts = 2
    And email "Turno bloqueado tras 2 intentos"

  Scenario: Fallo tras 3 reintentos
    Given intento 1 → Timeout
    When intento 2 → Timeout
    And intento 3 → Timeout
    Then Firestore actualiza:
      | Campo              | Valor                      |
      | bookeoSyncAttempts | 3                          |
      | bookeoLastError    | Timeout after 3 attempts   |
      | bookeoStatus       | NULL                       |
    And email Manager:
      | Asunto | ⚠️ ERROR Sincronización Bookeo: 15 Nov MAÑANA |
      | Cuerpo | Error: Timeout Zapier (30s)                   |
      |        | Intento: 3/3                                  |
      |        | ACCIÓN REQUERIDA: Verificar Bookeo manualmente|

  Scenario: Error 500 Bookeo API
    Given Cloud Function envía webhook correctamente
    When Zapier llama Bookeo API
    And Bookeo responde 500 Internal Server Error
    Then Zapier retorna error:
      ```json
      {
        "status": "error",
        "code": "BOOKEO_API_ERROR",
        "message": "Bookeo API returned 500",
        "retryable": true
      }
      ```
    And Cloud Function reintenta 2 veces más con backoff
    And tras 3 fallos envía email error Manager

  Scenario: bookeoId inválido en desbloqueo
    Given turno bloqueado con bookeoId "seat_block_invalid"
    When guía marca LIBRE (trigger desbloqueo)
    And Cloud Function envía webhook DESBLOQUEAR
    And Zapier intenta DELETE /seatblocks/seat_block_invalid
    And Bookeo responde 404 Not Found
    Then Zapier retorna:
      ```json
      {
        "status": "error",
        "code": "BOOKEO_ID_NOT_FOUND",
        "message": "Block not found in Bookeo",
        "retryable": false
      }
      ```
    And Cloud Function NO reintenta (retryable: false)
    And actualiza Firestore bookeoLastError "bookeoId inválido"
    And email Manager con acción manual requerida

  Scenario: Zapier webhook URL incorrecta
    Given ZAPIER_WEBHOOK_URL configurada incorrectamente
    When Cloud Function envía webhook
    Then recibe error 404 Not Found inmediatamente
    And NO reintenta (URL no válida)
    And email Manager indica "Configuración webhook incorrecta"
    And registra error crítico en logs
```

---

## HU-BOOKEO-05: Notificaciones email Manager

**Como** Manager  
**Quiero** recibir email en cada sincronización  
**Para** estar informado

**Prioridad:** Media  
**Estimación:** 2 puntos  

---

```gherkin
Feature: Emails notificación Manager en sincronizaciones

  Background:
    Given Manager email "madrid@spainfoodsherpas.com"
    And Gmail API configurada en Cloud Function

  Scenario: Email bloqueo automático con detalles guías
    Given fecha "2025-11-15" slot "MAÑANA"
    When 5 guías marcan NO_DISPONIBLE y turno se bloquea
    Then Manager recibe email en <5 segundos:
      """
      Para: madrid@spainfoodsherpas.com
      Asunto: 🚫 Turno bloqueado: 15 Nov MAÑANA
      
      Razón: 100% guías NO_DISPONIBLE
      Fecha: 15 Noviembre 2025
      Turno: MAÑANA (12:00)
      bookeoId: seat_block_xyz789
      
      Estado guías:
      - María: NO_DISPONIBLE
      - Juan: NO_DISPONIBLE
      - Pedro: NO_DISPONIBLE
      - Ana: NO_DISPONIBLE
      - Luis: NO_DISPONIBLE
      
      Este turno ya no acepta reservas en Bookeo.
      """

  Scenario: Email desbloqueo con guía disponible
    Given turno bloqueado
    When guía "María" marca LIBRE y turno se desbloquea
    Then Manager recibe email:
      """
      Asunto: ✅ Turno desbloqueado: 15 Nov MAÑANA
      
      Razón: Guía disponible
      Fecha: 15 Noviembre 2025
      Turno: MAÑANA (12:00)
      Guía disponible: María
      
      Este turno vuelve a aceptar reservas en Bookeo.
      """

  Scenario: Email bloqueo manual forzado
    When Manager activa forceBlock
    Then email indica:
      """
      Asunto: 🚫 Turno bloqueado: 18 Nov MAÑANA
      Razón: Bloqueo manual forzado
      Solicitado por: Manager
      """

  Scenario: Email error detallado
    Given webhook falla 3 veces por timeout
    Then Manager recibe email:
      """
      Asunto: ⚠️ ERROR Sincronización Bookeo: 15 Nov MAÑANA
      
      Error: Timeout Zapier (30s)
      Fecha: 15 Noviembre 2025
      Turno: MAÑANA (12:00)
      Intento: 3/3
      
      ACCIÓN REQUERIDA:
      1. Verificar estado turno en Bookeo
      2. Bloquear manualmente si es necesario
      3. Revisar estado Zapier con Pablo
      
      Logs: [Link Cloud Functions logs]
      """

  Scenario: NO enviar email duplicado si ya bloqueado
    Given turno ya bloqueado en Bookeo
    And bookeoStatus "blocked" en Firestore
    When otro guía marca NO_DISPONIBLE
    Then Cloud Function detecta turno ya bloqueado
    And NO envía webhook adicional
    And NO envía email Manager (no hay cambio)
```

---

## HU-BOOKEO-06: Manejo turnos solapados

**Como** Sistema  
**Quiero** manejar correctamente turnos solapados Bookeo  
**Para** evitar sincronizaciones innecesarias

**Prioridad:** Media  
**Estimación:** 2 puntos  

---

```gherkin
Feature: Manejo turnos solapados 17:15 ↔ 18:15

  Background:
    Given Bookeo tiene funcionalidad turnos solapados activa
    And T1 (17:15) y T2 (18:15) comparten mismo recurso (guía)
    And MAÑANA (12:00) NO se solapa con T1/T2 (dura 3h: 12-15)

  Scenario: Bloquear T1 elimina T2 automáticamente en Bookeo
    Given fecha "2025-11-15"
    And T1 (17:15) y T2 (18:15) LIBRES en Bookeo
    When Cloud Function actualiza /shifts/2025-11-15_T1
    And envía webhook BLOQUEAR para T1
    And Zapier bloquea T1 en Bookeo
    Then Bookeo elimina T2 (18:15) automáticamente
    And Cloud Function solo actualiza Firestore shifts/2025-11-15_T1
    And NO actualiza shifts/2025-11-15_T2
    And email Manager solo menciona "Turno bloqueado: 15 Nov TARDE (T1)"
    And NO menciona T2 en email

  Scenario: Desbloquear T1 restaura ambos turnos en Bookeo
    Given T1 bloqueado (T2 eliminado por Bookeo)
    And Firestore shifts/2025-11-15_T1 bookeoStatus "blocked"
    When Cloud Function envía webhook DESBLOQUEAR para T1
    And Zapier desbloquea T1 en Bookeo
    Then Bookeo restaura T1 (17:15) Y T2 (18:15) automáticamente
    And Cloud Function actualiza solo shifts/2025-11-15_T1
    And email Manager indica "Turno desbloqueado: 15 Nov TARDE (T1)"

  Scenario: Bloquear T2 elimina T1 automáticamente
    Given T1 y T2 libres en Bookeo
    When Cloud Function bloquea T2 (18:15)
    Then Bookeo elimina T1 (17:15) automáticamente
    And solo se actualiza Firestore shifts/2025-11-15_T2

  Scenario: MAÑANA independiente de turnos tarde
    Given fecha "2025-11-15"
    And MAÑANA (12:00-15:00) LIBRE
    And T1 (17:15) bloqueado
    When Cloud Function bloquea MAÑANA
    Then Bookeo bloquea MAÑANA
    And T1 permanece bloqueado
    And NO hay interacción entre MAÑANA y TARDE

  Scenario: Consulta disponibilidad considera turnos independientes
    Given T1 bloqueado en Bookeo (T2 eliminado)
    When Manager consulta disponibilidad 15 Nov
    Then Firestore muestra:
      | Slot   | bookeoStatus |
      | MAÑANA | unblocked    |
      | T1     | blocked      |
      | T2     | NULL         |
```

---

## Definición DONE

### Desarrollo
- [ ] Cloud Function implementada
- [ ] Tests unitarios >80% cobertura
- [ ] JSDoc completo
- [ ] Variables Firebase config
- [ ] Logs estructurados (JSON)

### QA
- [ ] Todos escenarios Gherkin PASS
- [ ] Testing E2E en staging exitoso
- [ ] Manejo errores validado (timeout, 500, 404)
- [ ] Emails Manager recibidos correctamente
- [ ] Turnos solapados comportamiento verificado

### Documentación
- [ ] README actualizado
- [ ] ADR-006 aprobado
- [ ] Runbook operaciones creado

### Producción
- [ ] Deploy exitoso
- [ ] Monitoreo 48h sin errores críticos
- [ ] UAT Manager aprobado
- [ ] Rollback plan documentado

---

**Versión:** 2.0  
**Última actualización:** 21 Octubre 2025  
**Aprobado por:** Pendiente
