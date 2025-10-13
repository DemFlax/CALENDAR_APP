# Historias de Usuario - Tour Details Page
**Proyecto:** Spain Food Sherpas - Calendar App  
**Fecha:** 14 Octubre 2025  
**Versión:** 1.0  

---

## USER STORY #1: Navegación a detalles de tour

**ID:** US-TD-001  
**Como:** Guía  
**Quiero:** Clicar una asignación en mi dashboard  
**Para:** Ver detalles del tour y guests para hacer checkin  

**Prioridad:** Alta  
**Estimación:** 3 puntos  

### Criterios de Aceptación

```gherkin
Feature: Navegación a detalles de tour desde dashboard

Scenario: Clic en asignación existente
  Given estoy autenticado como guía
  And estoy en la sección "Mis Próximas Asignaciones"
  And veo una asignación con eventId "abc123"
  When hago clic en la card de asignación
  Then navego a "/tour-details.html?eventId=abc123&title=Madrid%20Tapas&date=2025-10-30&time=17:30"
  And los parámetros se codifican correctamente en URL

Scenario: URL con parámetros faltantes
  Given navego directamente a "/tour-details.html?eventId=abc123"
  And faltan parámetros title, date o time
  When la página carga
  Then muestro header con skeleton loader
  And espero respuesta de API para completar datos

Scenario: Navegación en PWA instalada
  Given tengo la app instalada en iOS/Android
  When hago clic en asignación
  Then navego sin abrir navegador externo
  And mantengo contexto de sesión
```

### Notas Técnicas
- `guide-dashboard.js`: Añadir event listener a cards de asignaciones
- URL encoding para caracteres especiales en title
- Validar que eventId existe antes de navegar

### Definición de Hecho
- [ ] Cards de asignaciones clicables con cursor pointer
- [ ] URL se construye con todos los parámetros
- [ ] Navegación funciona en desktop y mobile
- [ ] PWA mantiene contexto de sesión

---

## USER STORY #2: Visualización de detalles de tour

**ID:** US-TD-002  
**Como:** Guía  
**Quiero:** Ver información completa del tour y listado de guests  
**Para:** Realizar checkin efectivo en el punto de encuentro  

**Prioridad:** Alta  
**Estimación:** 8 puntos  

### Criterios de Aceptación

```gherkin
Feature: Visualización de detalles de tour y guests

Background:
  Given estoy en tour-details.html
  And tengo conexión a internet

Scenario: Carga exitosa con múltiples guests
  Given recibo evento con eventId "abc123"
  And description contiene 2 reservas separadas por "----"
  And primera reserva tiene: nombre="Andres Diaz", pax="2 adults", phone="US+1 (813) 541-1433"
  And segunda reserva tiene: nombre="Rene Escobio", pax="2 adults", phone="JP+81 8135075290"
  When parseo la description
  Then muestro header con título "Madrid's Iconic Tapas, Taverns & History Experience"
  And muestro fecha "30/10/2025" y hora "17:30"
  And muestro lista vertical de 2 cards de guests
  And primera card muestra:
    """
    Andres Diaz
    👥 2 personas
    📞 US+1 (813) 541-1433
    """
  And segunda card muestra:
    """
    Rene Escobio
    👥 2 personas
    📞 JP+81 8135075290
    """

Scenario: Guest con notas especiales
  Given description contiene reserva con "Special Requirements/Notes: Vegetarian diet"
  When parseo guest
  Then muestro card con:
    """
    [Nombre]
    👥 [Pax] personas
    📞 [Teléfono]
    📝 Notas: Vegetarian diet
    """
  And campo notas se muestra con badge/tag visual

Scenario: Falta 1 campo en guest (teléfono ausente)
  Given reserva tiene nombre "John Doe" y pax "3 adults"
  And no hay línea con formato "+X (XXX)" ni código de país
  When parseo guest
  Then muestro card con:
    """
    John Doe
    👥 3 personas
    📞 N/A
    """
  And resto de campos se muestran normalmente

Scenario: Falta campo de pax pero resto OK
  Given reserva tiene nombre y teléfono pero no línea "[X] adults"
  When parseo guest
  Then muestro "👥 N/A" en campo personas
  And resto de card renderiza normalmente

Scenario: Faltan más de 2 campos en guest
  Given reserva solo tiene línea con nombre
  And falta pax y teléfono
  When parseo guest
  Then NO renderizo card de este guest
  And incremento contador de guests_con_error
  And al final muestro botón "Ver evento en Calendar"

Scenario: Múltiples guests con errores de parsing
  Given description tiene 4 reservas
  And 2 reservas tienen datos completos
  And 2 reservas faltan >2 campos
  When parseo todas
  Then muestro solo 2 cards válidas
  And al final de lista muestro:
    """
    ⚠️ 2 reservas con información incompleta
    [Botón: Ver evento completo en Calendar]
    """

Scenario: Tour sin guests (description vacía)
  Given evento existe pero description=""
  When parseo
  Then muestro header normal
  And muestro mensaje centrado: "Sin información de guests disponible"
  And muestro botón "Ver evento en Calendar"

Scenario: Formato de teléfono internacional variado
  Given guest tiene "US+1 (813) 541-1433"
  When renderizo teléfono
  Then muestro "📞 US+1 (813) 541-1433"
  
  Given guest tiene "JP+81 8135075290"
  When renderizo teléfono
  Then muestro "📞 JP+81 8135075290"
  
  Given guest tiene "ES+34 612345678 (mobile)"
  When renderizo teléfono
  Then muestro "📞 ES+34 612345678"
```

### Reglas de Negocio

**Parsing de description:**
```
Estructura esperada por reserva:
----------------------------------------------------
[ID reserva numérico]
[Nombre tour] - [Guía]
[X adults]                          ← CAMPO PAX
[Day, DD Month YYYY HH:MM]
[Nombre completo]                   ← CAMPO NOMBRE
[Email largo]
[PAÍS+CÓDIGO NÚMERO (tipo)]         ← CAMPO TELÉFONO
[Datos financieros...]
Special Requirements/Notes: [texto] ← CAMPO NOTAS (opcional)
----------------------------------------------------
```

**Criterios de validación:**
- **Guest válido:** Tiene nombre + (pax O teléfono)
- **Guest incompleto (N/A):** Falta 1 campo → mostrar con N/A
- **Guest inválido:** Faltan >2 campos → no mostrar, fallback a Calendar

**Prioridad de extracción:**
1. Separar por líneas `----` (mínimo 4 guiones)
2. Por cada bloque buscar patrones:
   - Pax: línea contiene " adults"
   - Nombre: primera línea no-vacía tras línea de fecha
   - Teléfono: línea con patrón `[A-Z]{2}\+\d+`
   - Notas: línea empieza con "Special Requirements/Notes:"

### Notas Técnicas
- Función `parseDescription(text)` retorna `Guest[]`
- Interface Guest: `{ nombre, pax, telefono, notas?, valido: boolean }`
- Regex teléfono: `/([A-Z]{2}\+\d+[\s\d\(\)]+)/`
- Regex pax: `/(\d+)\s+adults?/i`

### Definición de Hecho
- [ ] Header muestra título, fecha y hora correctamente
- [ ] Cards de guests responsive (mobile-first)
- [ ] Parsing extrae correctamente 4 campos (nombre, pax, teléfono, notas)
- [ ] Manejo de N/A para campos individuales faltantes
- [ ] Fallback a Calendar si >2 campos faltan por guest
- [ ] Diseño visual limpio similar a evento de Calendar
- [ ] Tests unitarios de función parseDescription con 5+ casos

---

## USER STORY #3: Manejo de errores API

**ID:** US-TD-003  
**Como:** Guía  
**Quiero:** Recibir feedback claro cuando falla la carga de datos  
**Para:** Saber cómo proceder o qué acción tomar  

**Prioridad:** Alta  
**Estimación:** 3 puntos  

### Criterios de Aceptación

```gherkin
Feature: Manejo robusto de errores API

Scenario: Error de red (500/502/503)
  Given llamo a getEventDetails con eventId válido
  And Apps Script retorna status 500
  When capturo el error
  Then muestro mensaje centrado:
    """
    ⚠️ Error al cargar detalles
    No pudimos conectar con el servidor
    """
  And muestro botón primario "Reintentar"
  And muestro botón secundario "Ver en Calendar"

Scenario: Timeout de API (>10s)
  Given llamo a getEventDetails
  And la petición tarda >10 segundos
  When timeout se dispara
  Then muestro mensaje "La conexión está tardando más de lo normal"
  And muestro spinner con texto "Reintentando..."
  And reintento automáticamente 1 vez más
  And si falla segundo intento, muestro botones "Reintentar" y "Ver en Calendar"

Scenario: Evento no encontrado (404)
  Given eventId "xyz999" no existe en Calendar
  When API retorna {error: true, code: 'NOT_FOUND'}
  Then muestro mensaje:
    """
    ❌ Tour no encontrado
    El evento no existe o fue eliminado
    """
  And muestro solo botón "← Volver al Dashboard"

Scenario: No autorizado (401)
  Given API_KEY es inválida o expiró
  When API retorna {error: true, code: 'UNAUTHORIZED'}
  Then muestro mensaje "Sesión expirada"
  And redirijo a página de login después de 3 segundos

Scenario: Description vacía pero evento existe
  Given evento existe con eventId válido
  And description field es ""
  When renderizo página
  Then muestro header con título y fecha
  And muestro mensaje centrado:
    """
    📋 Sin información de guests
    No hay detalles de reservas disponibles
    """
  And muestro botón "Ver evento completo en Calendar"

Scenario: Parsing falla para todas las reservas
  Given description tiene texto pero no match con regex
  And ninguna reserva se parsea correctamente
  When intento renderizar guests
  Then muestro mensaje:
    """
    ⚠️ Formato de datos no reconocido
    No pudimos interpretar la información de guests
    """
  And muestro botón "Ver evento en Calendar"
  And registro error en console para debugging

Scenario: Reintentar tras error
  Given vi error de red
  And hago clic en "Reintentar"
  When se reintenta llamada API
  Then muestro spinner sobre botón
  And si tiene éxito, renderizo datos normalmente
  And si falla de nuevo, muestro mismo error

Scenario: Botón "Ver en Calendar" 
  Given hay error que requiere fallback a Calendar
  When hago clic en "Ver en Calendar"
  Then abro nueva pestaña con URL del evento usando htmlLink del evento
  And si no tengo htmlLink, construyo URL: `https://calendar.google.com/calendar/event?eid=[eventId]`
```

### Reglas de Negocio

**Jerarquía de errores (mostrar en orden de prioridad):**
1. Error de autenticación → Redirigir a login
2. Evento no encontrado → Volver a dashboard
3. Error de red/timeout → Reintentar disponible
4. Description vacía → Ver en Calendar
5. Parsing fallido → Ver en Calendar

**Estrategia de retry:**
- 1 reintento automático en timeout
- Botón manual "Reintentar" después de errores
- No reintentar en 404 o 401

### Notas Técnicas
- Timeout fetch: `AbortController` con 10s
- Guardar `htmlLink` del evento en primera carga exitosa
- Log errors a console para debugging (no mostrar stack al usuario)

### Definición de Hecho
- [ ] Manejo de 5 tipos de error diferentes
- [ ] Mensajes de error claros y accionables
- [ ] Botón "Reintentar" funcional
- [ ] Fallback a Calendar con URL correcta
- [ ] Tests de cada escenario de error
- [ ] Timeout implementado con AbortController

---

## USER STORY #4: Navegación de retorno

**ID:** US-TD-004  
**Como:** Guía  
**Quiero:** Volver fácilmente al dashboard  
**Para:** Continuar mi flujo de trabajo sin fricción  

**Prioridad:** Media  
**Estimación:** 2 puntos  

### Criterios de Aceptación

```gherkin
Feature: Navegación de retorno al dashboard

Scenario: Botón back en header
  Given estoy en tour-details.html
  And veo botón "← Volver" en header
  When hago clic en el botón
  Then navego a "/guide.html"
  And dashboard carga sección "Mis Próximas Asignaciones"

Scenario: Navegación con botón back del navegador
  Given navegué desde guide.html a tour-details.html
  When presiono botón back del navegador/PWA
  Then vuelvo a guide.html
  And estado del dashboard se preserva (no recarga)

Scenario: Navegación en PWA iOS
  Given app instalada en iOS
  When hago clic en "← Volver"
  Then navego sin animación de navegador externo
  And uso transición nativa de PWA

Scenario: Botón volver tras error 404
  Given evento no encontrado
  And veo mensaje "Tour no encontrado"
  When hago clic en "Volver al Dashboard"
  Then navego a "/guide.html"
```

### Notas Técnicas
- Usar `window.location.href = '/guide.html'` en lugar de `history.back()` para evitar loops
- Header fijo con z-index alto
- Icono back: `←` o SVG de flecha

### Definición de Hecho
- [ ] Botón "← Volver" visible en header
- [ ] Click navega a guide.html
- [ ] Funciona en PWA y navegador
- [ ] Botón responsive mobile/desktop

---

## Resumen de Implementación

### Prioridad de desarrollo
1. **US-TD-002** (Core): Visualización y parsing ← CRÍTICO
2. **US-TD-001**: Navegación desde dashboard
3. **US-TD-003**: Manejo de errores
4. **US-TD-004**: Navegación de retorno

### Archivos involucrados
- `public/tour-details.html` (nuevo)
- `public/js/tour-details.js` (nuevo)
- `public/js/calendar-api.js` (modificar: añadir `getTourGuestDetails()`)
- `public/js/guide-dashboard.js` (modificar: hacer cards clicables)
- Apps Script: añadir endpoint `getEventDetails`

### Métricas de éxito
- Tasa de parsing exitoso: >95%
- Tiempo de carga: <2s en 4G
- Error rate: <2% en producción
- Usuarios usando fallback "Ver en Calendar": <5%

---

**Aprobado por:** [Pendiente]  
**Fecha aprobación:** [Pendiente]
