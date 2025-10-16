# Historias de Usuario - Calendario Tours Madrid MVP

**Versión:** 2.0  
**Fecha:** 2025-10-03  
**Estado:** Aprobado

---

## Índice de Historias

### Manager (M)
- M1: Crear guía
- M2: Editar guía
- M3: Eliminar guía (soft delete)
- M4: Asignar turno con validación Calendar
- M5: Liberar turno
- M6: Visualizar dashboard global
- M7: Seed inicial automático

### Guía (G)
- G1: Bloquear disponibilidad
- G2: Desbloquear turno
- G3: Ver calendario personal
- G4: Establecer contraseña post-invitación

### Sistema (S)
- S1: Generación automática mensual de turnos

---

## ROL: MANAGER

### M1 – Crear guía

**Como** Manager  
**Quiero** crear un nuevo guía con datos básicos  
**Para** registrarlo en el sistema y que pueda gestionar su disponibilidad

**Prioridad:** Alta  
**Estimación:** 5 puntos

#### Criterios de Aceptación

```gherkin
Feature: Alta de guías
  
  Scenario: Crear guía válido con todos los campos
    Given soy Manager autenticado
    And ingreso nombre "María García"
    And ingreso email "maria@gmail.com"
    And ingreso teléfono "+34666555444"
    And ingreso dirección "Calle Mayor 10"
    And ingreso DNI "12345678Z"
    And ingreso cuenta bancaria "ES9121000418450200051332"
    When confirmo la creación del guía
    Then el guía queda registrado con estado "activo"
    And se crea documento en colección "guides" con esos datos
    And se envía email de invitación a "maria@gmail.com"
    And el email contiene link único para establecer contraseña
    And el link expira en 7 días
    And el guía aparece en el listado de guías del dashboard

  Scenario: Crear guía solo con campos obligatorios
    Given soy Manager autenticado
    And ingreso nombre "Juan Pérez"
    And ingreso email "juan@gmail.com"
    And ingreso DNI "87654321A"
    And NO ingreso teléfono, dirección ni cuenta bancaria
    When confirmo la creación del guía
    Then el guía queda registrado con estado "activo"
    And los campos opcionales son null
    And se envía email de invitación correctamente

  Scenario: Email duplicado
    Given existe un guía con email "maria@gmail.com"
    When intento crear otro guía con email "maria@gmail.com"
    Then veo un error "Email ya registrado"
    And no se crea ningún registro nuevo
    And no se envía email de invitación

  Scenario: Datos obligatorios faltantes
    Given soy Manager autenticado
    And omito el campo nombre
    When intento crear el guía
    Then veo error de validación "Nombre es obligatorio"
    And no se crea el guía

  Scenario: Formato de email inválido
    Given soy Manager autenticado
    And ingreso email "email-invalido"
    When confirmo la creación
    Then veo un error "Formato de email inválido"
    And no se crea el guía

  Scenario: Formato DNI español inválido
    Given soy Manager autenticado
    And ingreso DNI "1234567" (sin letra)
    When confirmo la creación
    Then veo un error "Formato DNI inválido (8 dígitos + letra)"
    And no se crea el guía

  Scenario: Fallo en envío de email de invitación
    Given soy Manager autenticado
    And ingreso datos válidos de guía
    And el servicio de email está caído
    When confirmo la creación del guía
    Then el guía queda registrado en Firestore
    But veo warning "Guía creado pero email de invitación falló"
    And se registra notificación con status "failed"
    And puedo reenviar invitación manualmente
```

---

### M2 – Editar guía

**Como** Manager  
**Quiero** modificar datos de un guía registrado  
**Para** mantener información actualizada

**Prioridad:** Media  
**Estimación:** 3 puntos

#### Criterios de Aceptación

```gherkin
Feature: Edición de guías existentes

  Scenario: Editar campos permitidos
    Given soy Manager autenticado
    And existe un guía con nombre "María García"
    When modifico nombre a "María García López"
    And modifico teléfono a "+34666777888"
    And modifico dirección a "Calle Nueva 20"
    And modifico cuenta bancaria a "ES1234567890"
    Then los cambios se guardan en Firestore
    And se actualiza el campo "updatedAt"
    And veo confirmación "Guía actualizado correctamente"
    And los cambios se reflejan inmediatamente en el dashboard

  Scenario: Intentar editar email (campo bloqueado)
    Given soy Manager autenticado
    And existe un guía con email "maria@gmail.com"
    When intento modificar email a "nuevo@gmail.com"
    Then veo un error "Email no es editable"
    And el campo email permanece deshabilitado en UI
    And los datos no cambian

  Scenario: Intentar editar DNI (campo bloqueado)
    Given soy Manager autenticado
    And existe un guía con DNI "12345678Z"
    When intento modificar DNI a "87654321A"
    Then veo un error "DNI no es editable"
    And el campo DNI permanece deshabilitado en UI
    And los datos no cambian

  Scenario: Editar guía inexistente
    Given soy Manager autenticado
    When intento editar un guía con ID "inexistente123"
    Then veo un error "Guía no encontrado"
    And no se realiza ninguna operación
```

---

### M3 – Eliminar guía

**Como** Manager  
**Quiero** desactivar un guía del sistema  
**Para** gestionar bajas sin perder historial

**Prioridad:** Media  
**Estimación:** 2 puntos

#### Criterios de Aceptación

```gherkin
Feature: Desactivación de guías (soft delete)

  Scenario: Eliminar guía activo
    Given soy Manager autenticado
    And existe un guía activo con ID "abc123"
    When solicito eliminar el guía
    And confirmo la acción
    Then el campo "estado" cambia a "inactivo"
    And el guía desaparece del listado principal
    And el historial de turnos asignados se mantiene
    And veo confirmación "Guía desactivado correctamente"

  Scenario: Eliminar guía con turnos asignados futuros
    Given soy Manager autenticado
    And existe un guía con turnos ASIGNADO para fechas futuras
    When solicito eliminar el guía
    Then veo advertencia "El guía tiene X turnos asignados futuros"
    And debo confirmar la eliminación explícitamente
    When confirmo
    Then el guía se desactiva
    And los turnos asignados pasan a estado "LIBRE"
    And se envía email al guía notificando liberación de turnos

  Scenario: Eliminar guía ya inactivo
    Given soy Manager autenticado
    And existe un guía con estado "inactivo"
    When intento eliminarlo nuevamente
    Then veo mensaje informativo "El guía ya está inactivo"
    And no ocurre ningún cambio

  Scenario: Eliminar guía inexistente
    Given soy Manager autenticado
    When intento eliminar un guía con ID inexistente
    Then veo un error "Guía no encontrado"
```

---

### M4 – Asignar turno con validación Calendar

**Como** Manager  
**Quiero** asignar un turno libre a un guía tras validar que existe en Calendar  
**Para** garantizar que solo asigno tours reales

**Prioridad:** Crítica  
**Estimación:** 8 puntos

#### Criterios de Aceptación

```gherkin
Feature: Asignación de turnos con validación Google Calendar

  Scenario: Asignar turno libre con evento confirmado en Calendar
    Given soy Manager autenticado
    And existe un turno "2025-10-15_T1" en estado "LIBRE"
    And existe un guía activo con ID "abc123"
    And existe un evento en Google Calendar el 2025-10-15 a las 17:15h
    When selecciono el turno "2025-10-15_T1"
    And selecciono el guía "abc123"
    And hago clic en "Asignar"
    Then el sistema consulta Calendar API con fecha 2025-10-15 y hora 17:15
    And encuentra evento válido
    And el turno pasa a estado "ASIGNADO"
    And el campo "guiaId" se actualiza a "abc123"
    And el campo "updatedAt" se actualiza
    And veo confirmación "Turno asignado correctamente"
    And se envía email al guía con detalles del turno
    And el cambio se refleja en tiempo real en ambos dashboards

  Scenario: Intentar asignar turno sin evento en Calendar
    Given soy Manager autenticado
    And existe un turno "2025-10-20_MAÑANA" en estado "LIBRE"
    And NO existe evento en Calendar el 2025-10-20 a las 12:00h
    When intento asignar el turno a un guía
    Then el sistema consulta Calendar API
    And no encuentra evento válido
    And veo error "NO EXISTE TOUR EN ESE HORARIO"
    And el turno permanece en estado "LIBRE"
    And NO se envía email
    And NO se actualiza Firestore

  Scenario: Asignar turno con timeout en Calendar API
    Given soy Manager autenticado
    And existe un turno "2025-10-18_T2" en estado "LIBRE"
    And Calendar API no responde en 5 segundos
    When intento asignar el turno
    Then veo error "Error al validar con Calendar. Intente nuevamente"
    And el turno permanece en estado "LIBRE"
    And se registra error en logs para debugging

  Scenario: Asignar turno ya asignado (condición de carrera)
    Given soy Manager autenticado
    And un turno está en estado "ASIGNADO"
    When intento asignarlo a otro guía
    Then las Firestore Rules rechazan la operación
    And veo error "Turno ya asignado"
    And no cambia la asignación

  Scenario: Asignar turno bloqueado por guía
    Given soy Manager autenticado
    And un turno está en estado "NO_DISPONIBLE"
    When intento asignarlo a un guía
    Then las Firestore Rules rechazan la operación
    And veo error "Turno bloqueado por guía"
    And no se genera ninguna asignación

  Scenario: Email de notificación contiene toda la información
    Given asigno turno "2025-10-15_T1" al guía "María García"
    Then el email enviado contiene:
      | Campo          | Valor                    |
      | Para           | maria@gmail.com          |
      | Asunto         | Nueva asignación - 2025-10-15 T1 |
      | Fecha legible  | 15 de octubre de 2025    |
      | Hora inicio    | 17:15                    |
      | Slot           | T1                       |
    And el email tiene formato HTML legible
    And se registra notificación con status "sent"

  Scenario: Asignar múltiples turnos en batch (fuera alcance MVP pero documentado)
    Given soy Manager autenticado
    When intento asignar más de 1 turno simultáneamente
    Then veo mensaje "Asignación individual solamente en MVP"
    And debo asignar de uno en uno
```

---

### M5 – Liberar turno

**Como** Manager  
**Quiero** liberar un turno previamente asignado  
**Para** que vuelva a estar disponible

**Prioridad:** Alta  
**Estimación:** 3 puntos

#### Criterios de Aceptación

```gherkin
Feature: Liberación de turnos

  Scenario: Liberar turno asignado
    Given soy Manager autenticado
    And un turno "2025-10-15_T1" está en estado "ASIGNADO" a guía "abc123"
    When hago clic en "Liberar turno"
    And confirmo la acción
    Then el turno pasa a estado "LIBRE"
    And el campo "guiaId" se establece a null
    And el campo "updatedAt" se actualiza
    And veo confirmación "Turno liberado correctamente"
    And se envía email al guía notificando la liberación
    And el cambio se refleja en tiempo real en ambos dashboards

  Scenario: Liberar turno ya libre
    Given soy Manager autenticado
    And un turno está en estado "LIBRE"
    When intento liberarlo
    Then veo mensaje informativo "Turno ya está libre"
    And no ocurre ningún cambio
    And no se envía email

  Scenario: Intentar liberar turno bloqueado por guía
    Given soy Manager autenticado
    And un turno está en estado "NO_DISPONIBLE"
    When intento liberarlo
    Then las Firestore Rules rechazan la operación
    And veo error "Acción no permitida - turno bloqueado por guía"
    And no ocurre ningún cambio

  Scenario: Email de liberación contiene información básica
    Given libero turno "2025-10-15_MAÑANA" del guía "María"
    Then el email enviado contiene:
      | Campo   | Valor                                |
      | Para    | maria@gmail.com                      |
      | Asunto  | Turno liberado - 2025-10-15 MAÑANA   |
      | Mensaje | Tu turno ha sido liberado por el Manager |
    And se registra notificación con status "sent"
```

---

### M6 – Visualizar dashboard global

**Como** Manager  
**Quiero** ver el calendario completo de todos los guías  
**Para** gestionar asignaciones eficientemente

**Prioridad:** Alta  
**Estimación:** 5 puntos

#### Criterios de Aceptación

```gherkin
Feature: Dashboard Manager

  Scenario: Visualizar calendario mensual con filtros
    Given soy Manager autenticado
    When accedo a mi dashboard
    Then veo vista calendario de 3 meses (actual + 2 siguientes)
    And cada día muestra 4 slots (MAÑANA, T1, T2, T3)
    And cada slot muestra su estado con código de color:
      | Estado         | Color   |
      | LIBRE          | Verde   |
      | ASIGNADO       | Azul    |
      | NO_DISPONIBLE  | Gris    |
    And los turnos ASIGNADO muestran nombre del guía
    And puedo filtrar por estado
    And puedo filtrar por guía específico
    And puedo filtrar por rango de fechas

  Scenario: Actualización en tiempo real cuando guía bloquea turno
    Given estoy viendo el dashboard como Manager
    And un turno "2025-10-15_T2" está en estado "LIBRE"
    When un guía lo marca como "NO_DISPONIBLE"
    Then en menos de 5 segundos veo el cambio en mi dashboard
    And el turno cambia a color gris
    And aparece indicador "Bloqueado por [Nombre Guía]"
    And no recibo email (cambio solo visual)

  Scenario: Ver lista de guías activos
    Given soy Manager autenticado
    When accedo a la sección "Guías"
    Then veo tabla con todos los guías activos
    And cada fila muestra: nombre, email, teléfono, turnos asignados próximos
    And puedo ordenar por cualquier columna
    And puedo buscar por nombre o email

  Scenario: Ver estadísticas del mes actual
    Given soy Manager autenticado
    When accedo al dashboard
    Then veo widget de estadísticas con:
      | Métrica               | Descripción                |
      | Turnos LIBRE          | Total disponibles          |
      | Turnos ASIGNADO       | Total asignados            |
      | Turnos NO_DISPONIBLE  | Total bloqueados por guías |
      | % Ocupación           | (ASIGNADO / TOTAL) * 100   |
```

---

### M7 – Seed inicial automático

**Como** Manager  
**Quiero** que el sistema genere turnos automáticamente en primer acceso  
**Para** no tener que crearlos manualmente

**Prioridad:** Media  
**Estimación:** 3 puntos

#### Criterios de Aceptación

```gherkin
Feature: Generación automática inicial de turnos

  Scenario: Primer acceso con colección shifts vacía
    Given soy Manager autenticado por primera vez
    And la colección "shifts" está vacía
    When accedo al dashboard
    Then el sistema detecta colección vacía
    And ejecuta función de seed
    And crea turnos para mes actual completo
    And crea turnos para mes +1 completo
    And crea turnos para mes +2 completo
    And todos los turnos se crean con estado "LIBRE"
    And veo mensaje "Calendario inicializado: [X] turnos creados"
    And el dashboard carga con todos los turnos visibles

  Scenario: Acceso normal con turnos ya existentes
    Given soy Manager autenticado
    And la colección "shifts" tiene documentos
    When accedo al dashboard
    Then NO se ejecuta seed
    And cargo directamente el calendario existente
    And no veo mensaje de inicialización

  Scenario: Seed crea exactamente 4 slots por día
    Given el sistema ejecuta seed para octubre 2025
    Then se crean 31 días × 4 slots = 124 documentos
    And cada día tiene exactamente:
      | Slot ID                | Hora  |
      | 2025-10-01_MAÑANA      | 12:00 |
      | 2025-10-01_T1          | 17:15 |
      | 2025-10-01_T2          | 18:15 |
      | 2025-10-01_T3          | 19:15 |
    And todos con estado "LIBRE" y guiaId null
```

---

## ROL: GUÍA

### G1 – Bloquear disponibilidad

**Como** Guía  
**Quiero** marcar un turno libre como NO_DISPONIBLE  
**Para** que el Manager sepa que no puedo trabajar ese día/hora

**Prioridad:** Alta  
**Estimación:** 3 puntos

#### Criterios de Aceptación

```gherkin
Feature: Bloqueo de disponibilidad por guía

  Scenario: Bloquear turno libre
    Given soy Guía autenticado con guideId "abc123"
    And un turno "2025-10-20_T1" está en estado "LIBRE"
    When hago clic en el turno en mi calendario
    And selecciono "Marcar como no disponible"
    And confirmo la acción
    Then el turno pasa a estado "NO_DISPONIBLE"
    And el campo "guiaId" se actualiza a "abc123"
    And veo confirmación "Turno bloqueado correctamente"
    And el cambio se refleja inmediatamente en dashboard Manager (<5s)
    And NO se envía email

  Scenario: Bloquear turno ya asignado
    Given soy Guía autenticado
    And un turno está en estado "ASIGNADO" a otro guía
    When intento marcarlo como "NO_DISPONIBLE"
    Then las Firestore Rules rechazan la operación
    And veo error "Acción no permitida - turno ya asignado"
    And no cambia el estado del turno

  Scenario: Bloquear mi propio turno asignado
    Given soy Guía autenticado con guideId "abc123"
    And un turno está en estado "ASIGNADO" a mí (guiaId "abc123")
    When intento marcarlo como "NO_DISPONIBLE"
    Then las Firestore Rules rechazan la operación
    And veo error "No puedes bloquear un turno asignado. Contacta al Manager."
    And no cambia el estado

  Scenario: Bloquear turno ya bloqueado por mí
    Given soy Guía autenticado con guideId "abc123"
    And un turno ya está en estado "NO_DISPONIBLE" con guiaId "abc123"
    When intento bloquearlo de nuevo
    Then veo mensaje informativo "Ya está bloqueado por ti"
    And no ocurre ningún cambio

  Scenario: Intentar bloquear turno bloqueado por otro guía
    Given soy Guía autenticado con guideId "abc123"
    And un turno está en estado "NO_DISPONIBLE" con guiaId "xyz789"
    When intento bloquearlo
    Then las Firestore Rules rechazan la operación
    And veo error "Turno bloqueado por otro guía"

  Scenario: Bloquear múltiples turnos de un día
    Given soy Guía autenticado
    And el día 2025-10-20 tiene 4 turnos LIBRE
    When bloqueo MAÑANA, T1 y T3
    Then los 3 turnos pasan a NO_DISPONIBLE
    And T2 permanece LIBRE
    And veo confirmación "3 turnos bloqueados"
```

---

### G2 – Desbloquear turno

**Como** Guía  
**Quiero** revertir un turno marcado como NO_DISPONIBLE  
**Para** volver a dejarlo disponible para el Manager

**Prioridad:** Media  
**Estimación:** 2 puntos

#### Criterios de Aceptación

```gherkin
Feature: Desbloqueo de turnos por guía

  Scenario: Desbloquear turno bloqueado por mí
    Given soy Guía autenticado con guideId "abc123"
    And un turno "2025-10-25_T2" está en estado "NO_DISPONIBLE" con guiaId "abc123"
    When hago clic en el turno
    And selecciono "Marcar como disponible"
    And confirmo la acción
    Then el turno pasa a estado "LIBRE"
    And el campo "guiaId" se establece a null
    And veo confirmación "Turno desbloqueado correctamente"
    And el cambio se refleja inmediatamente en dashboard Manager (<5s)

  Scenario: Intentar desbloquear turno asignado
    Given soy Guía autenticado
    And un turno está en estado "ASIGNADO"
    When intento marcarlo como "LIBRE"
    Then las Firestore Rules rechazan la operación
    And veo error "Acción no permitida - turno asignado"
    And no cambia el estado del turno

  Scenario: Desbloquear turno ya libre
    Given soy Guía autenticado
    And un turno está en estado "LIBRE"
    When intento desbloquearlo
    Then veo mensaje informativo "El turno ya está disponible"
    And no ocurre ningún cambio

  Scenario: Intentar desbloquear turno bloqueado por otro guía
    Given soy Guía autenticado con guideId "abc123"
    And un turno está en estado "NO_DISPONIBLE" con guiaId "xyz789"
    When intento desbloquearlo
    Then las Firestore Rules rechazan la operación
    And veo error "No puedes desbloquear turnos de otros guías"
```

---

### G3 – Ver calendario personal

**Como** Guía  
**Quiero** ver todos mis turnos de los próximos 3 meses  
**Para** conocer mi disponibilidad y compromisos

**Prioridad:** Alta  
**Estimación:** 5 puntos

#### Criterios de Aceptación

```gherkin
Feature: Visualización de calendario del guía

  Scenario: Ver calendario personal de 3 meses
    Given soy Guía autenticado con guideId "abc123"
    When accedo a mi dashboard
    Then veo vista calendario de 3 meses (actual + 2 siguientes)
    And solo veo turnos relacionados conmigo:
      | Estado         | Condición                     |
      | ASIGNADO       | guiaId == "abc123"            |
      | NO_DISPONIBLE  | guiaId == "abc123"            |
      | LIBRE          | guiaId == null                |
    And NO veo turnos asignados a otros guías
    And NO veo turnos bloqueados por otros guías

  Scenario: Ver turno asignado a mí
    Given soy Guía autenticado
    And tengo un turno en estado "ASIGNADO" para 2025-10-15 MAÑANA
    When accedo a mi dashboard
    Then ese turno aparece en color azul
    And muestra badge "Asignado"
    And NO tengo opción de modificarlo
    And puedo ver detalles: fecha, hora, tipo de tour (si disponible)

  Scenario: Ver turno bloqueado por mí
    Given soy Guía autenticado
    And tengo un turno en estado "NO_DISPONIBLE" para 2025-10-18 T2
    When accedo a mi dashboard
    Then ese turno aparece en color gris
    And muestra badge "Bloqueado por mí"
    And tengo opción "Desbloquear"

  Scenario: Ver turno libre disponible
    Given soy Guía autenticado
    And existe un turno "LIBRE" para 2025-10-20 T1
    When accedo a mi dashboard
    Then ese turno aparece en color verde
    And muestra badge "Disponible"
    And tengo opción "Bloquear"

  Scenario: Actualización en tiempo real cuando Manager asigna turno
    Given estoy viendo mi dashboard como Guía
    And un turno "2025-10-22_MAÑANA" está en estado "LIBRE"
    When el Manager me lo asigna
    Then en menos de 5 segundos veo el cambio
    And el turno cambia a color azul "Asignado"
    And recibo email de notificación

  Scenario: Lista de próximas asignaciones
    Given soy Guía autenticado
    And tengo 3 turnos ASIGNADO en fechas futuras
    When accedo a mi dashboard
    Then veo widget "Próximas asignaciones"
    And lista los 3 turnos ordenados por fecha ascendente
    And cada uno muestra: fecha legible, hora, slot
    And puedo hacer clic para ver en calendario
```

---

### G4 – Establecer contraseña post-invitación

**Como** Guía nuevo  
**Quiero** establecer mi contraseña tras recibir invitación  
**Para** acceder al sistema

**Prioridad:** Alta  
**Estimación:** 3 puntos

#### Criterios de Aceptación

```gherkin
Feature: Onboarding de guía - establecer contraseña

  Scenario: Acceder por primera vez con link válido
    Given el Manager creó mi cuenta de guía
    And recibí email de invitación con link único
    And el link NO ha expirado (< 7 días)
    When hago clic en el link
    Then se abre página "Establecer contraseña"
    And veo mi email pre-rellenado (no editable)
    And veo campos: "Contraseña" y "Confirmar contraseña"

  Scenario: Establecer contraseña válida
    Given estoy en página "Establecer contraseña"
    When ingreso contraseña "MiPass2025!"
    And confirmo contraseña "MiPass2025!"
    And la contraseña cumple requisitos:
      | Requisito          | Validación          |
      | Mínimo 8 caracteres | ✓                  |
      | Al menos 1 mayúscula| ✓                  |
      | Al menos 1 número   | ✓                  |
      | Al menos 1 especial | ✓                  |
    And hago clic en "Establecer contraseña"
    Then mi cuenta queda activada en Firebase Auth
    And se añade custom claim {role: "guide", guideId: "abc123"}
    And soy redirigido automáticamente a mi dashboard
    And veo mensaje de bienvenida "¡Bienvenido, [Nombre]!"

  Scenario: Contraseña no cumple requisitos
    Given estoy en página "Establecer contraseña"
    When ingreso contraseña "123"
    Then veo validación en tiempo real:
      | Error                            |
      | "Mínimo 8 caracteres"            |
      | "Debe contener al menos 1 mayúscula" |
      | "Debe contener al menos 1 número"    |
    And el botón "Establecer contraseña" está deshabilitado

  Scenario: Contraseñas no coinciden
    Given estoy en página "Establecer contraseña"
    When ingreso contraseña "MiPass2025!"
    And confirmo contraseña "OtraPass2025!"
    Then veo error "Las contraseñas no coinciden"
    And el botón está deshabilitado

  Scenario: Link de invitación expirado
    Given el Manager creó mi cuenta hace 8 días
    And recibí link de invitación
    When hago clic en el link
    Then veo mensaje "Link expirado"
    And veo botón "Solicitar nueva invitación"
    And puedo ingresar mi email
    When solicito nueva invitación
    Then se envía nuevo email al Manager
    And el Manager puede reenviar invitación desde su dashboard

  Scenario: Link ya utilizado
    Given ya establecí mi contraseña anteriormente
    When intento usar el mismo link de invitación
    Then veo mensaje "Link ya utilizado"
    And veo botón "Ir a login"
    And soy redirigido a página de login normal
```

---

## ROL: SISTEMA

### S1 – Generación automática mensual de turnos

**Como** Sistema  
**Quiero** generar turnos del mes +2 automáticamente al cambiar de mes  
**Para** mantener ventana de 3 meses sin intervención manual

**Prioridad:** Crítica  
**Estimación:** 5 puntos

#### Criterios de Aceptación

```gherkin
Feature: Generación automática de turnos al cambiar mes

  Scenario: Ejecutar Cloud Function scheduled diariamente
    Given es 2025-10-15 a las 00:00 UTC
    When se ejecuta Cloud Function "generateMonthlyShifts"
    Then la función verifica el mes actual
    And detecta que estamos en octubre 2025
    And calcula mes +2 = diciembre 2025
    And verifica si ya existen turnos de diciembre
    And como YA existen, no crea duplicados
    And registra en logs "No action needed - December 2025 already exists"
    And la función termina exitosamente

  Scenario: Generar nuevo mes al cambiar de mes
    Given es 2025-11-01 a las 00:00 UTC (primer día de noviembre)
    When se ejecuta Cloud Function "generateMonthlyShifts"
    Then detecta que cambió el mes (octubre → noviembre)
    And calcula mes +2 = enero 2026
    And verifica que NO existen turnos de enero 2026
    And crea todos los turnos de enero 2026:
      | Días | Slots | Total |
      | 31   | 4     | 124   |
    And todos los turnos se crean con:
      | Campo    | Valor |
      | estado   | LIBRE |
      | guiaId   | null  |
    And registra en logs "Generated 124 shifts for January 2026"
    And envía notificación al Manager (opcional)

  Scenario: Generar turnos con IDs correctos
    Given el sistema genera turnos para enero 2026
    Then cada turno tiene ID formato "YYYY-MM-DD_SLOT"
    And ejemplos de IDs creados:
      | ID                  | Válido |
      | 2026-01-01_MAÑANA   | ✓      |
      | 2026-01-01_T1       | ✓      |
      | 2026-01-15_T2       | ✓      |
      | 2026-01-31_T3       | ✓      |
    And todos los IDs son únicos
    And Firestore garantiza idempotencia

  Scenario: Manejo de error en generación
    Given es 2025-11-01 a las 00:00 UTC
    And Firestore está temporalmente caído
    When se ejecuta Cloud Function
    Then la función detecta el error
    And registra en logs con nivel ERROR
    And reintenta 3 veces con backoff exponencial
    Si todos los reintentos fallan:
      And envía alerta al Manager vía email
      And la función falla con estado "failed"
      And Cloud Scheduler reintentará en próxima ejecución (24h)

  Scenario: Idempotencia - evitar duplicados
    Given ya existen turnos de diciembre 2025 en Firestore
    When la función intenta crear nuevamente diciembre 2025
    Then detecta duplicados con query:
      """
      WHERE fecha >= '2025-12-01'
      AND fecha <= '2025-12-31'
      LIMIT 1
      """
    And si encuentra al menos 1 documento, OMITE creación
    And no genera errores
    And registra "Month already exists, skipping"

  Scenario: Límites de Firestore batch writes
    Given debo crear 124 turnos (31 días × 4 slots)
    And Firestore batch tiene límite de 500 operaciones
    When ejecuto generación
    Then uso 1 solo batch (124 < 500)
    And el batch commit es atómico
    And si falla 1 operación, fallan todas (rollback)

  Scenario: Monitoreo y métricas
    Given la función se ejecuta exitosamente
    Then registra métricas en Cloud Logging:
      | Métrica              | Valor          |
      | execution_time_ms    | < 3000         |
      | shifts_created       | 124            |
      | month_generated      | "2026-01"      |
      | firestore_writes     | 124            |
    And estas métricas son visibles en Firebase Console
    And puedo crear alertas si execution_time > 5000ms
```

---

## Priorización para Implementación

### Sprint 1 (Fundación)
1. M1: Crear guía
2. G4: Establecer contraseña
3. M7: Seed inicial
4. Autenticación + Firestore Rules

### Sprint 2 (Core Turnos)
1. M4: Asignar turno con validación Calendar
2. M5: Liberar turno
3. G1: Bloquear disponibilidad
4. G2: Desbloquear turno

### Sprint 3 (UI + Automatización)
1. M6: Dashboard Manager
2. G3: Dashboard Guía
3. S1: Generación automática mensual

### Sprint 4 (Gestión Completa)
1. M2: Editar guía
2. M3: Eliminar guía
3. Refinamiento UX
4. Testing E2E

---

## Notas Técnicas de Implementación

### Validación Calendar API (M4)
```javascript
// Pseudocódigo
async function validateTourExists(date, slot) {
  const horaInicio = SLOT_HOURS[slot]; // ej: "17:15" para T1
  
  const events = await calendarAPI.events.list({
    calendarId: CALENDAR_ID,
    timeMin: `${date}T00:00:00Z`,
    timeMax: `${date}T23:59:59Z`,
    singleEvents: true
  });
  
  const tourExists = events.items.some(event => {
    const eventHour = parseStartTime(event.start);
    return eventHour === horaInicio;
  });
  
  return tourExists;
}
```

### Firestore Transaction para Asignación (M4)
```javascript
// Pseudocódigo
async function assignShift(shiftId, guideId) {
  return db.runTransaction(async (transaction) => {
    const shiftRef = db.collection('shifts').doc(shiftId);
    const shift = await transaction.get(shiftRef);
    
    // Validar estado actual
    if (shift.data().estado !== 'LIBRE') {
      throw new Error('Turno no disponible');
    }
    
    // Validar Calendar API
    const tourExists = await validateTourExists(
      shift.data().fecha,
      shift.data().slot
    );
    if (!tourExists) {
      throw new Error('NO EXISTE TOUR EN ESE HORARIO');
    }
    
    // Actualizar
    transaction.update(shiftRef, {
      estado: 'ASIGNADO',
      guiaId: guideId,
      updatedAt: FieldValue.serverTimestamp()
    });
    
    return true;
  });
}
```

---

**Fin del documento**

**Total Historias:** 12 (7 Manager + 4 Guía + 1 Sistema)  
**Total Escenarios Gherkin:** 68  
**Estimación Total:** 47 puntos
