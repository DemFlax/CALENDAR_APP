# ADR-001: Arquitectura Tour Details Page

**Fecha:** 14 Octubre 2025  
**Estado:** Propuesto  
**Decisor:** Director Técnico  
**Contexto:** Implementación de página de detalles de tour para checkin de guías

---

## Contexto y Problema

Los guías necesitan acceder a información detallada de guests (nombre, pax, teléfono, notas) desde tours asignados en Google Calendar. Los datos están almacenados en campo `description` como texto plano sin estructura JSON.

**Restricciones:**
- PWA debe funcionar offline-first cuando sea posible
- Latencia variable en mobile (3G/4G)
- Datos sensibles (PII) en description field
- Parsing debe ser robusto (95%+ success rate)

---

## Decisión 1: Parsing Client-Side vs Server-Side

### Opción A: Parsing en Apps Script (Server-Side)
**Pros:**
- Lógica centralizada, un solo punto de cambio
- Validación previa reduce datos inválidos al frontend
- Posibilidad de cachear resultados parseados

**Contras:**
- Mayor latencia (round-trip adicional)
- Mayor carga en Apps Script (cuotas)
- Debugging más complejo (logs en Apps Script)

### Opción B: Parsing en Frontend (Client-Side) ✅ **SELECCIONADA**
**Pros:**
- Menor latencia percibida (render inmediato con datos URL)
- Flexibilidad para ajustar regex sin redeploy backend
- Logs/debugging accesibles en DevTools
- Apps Script solo devuelve description raw

**Contras:**
- Código de parsing duplicado si otros clientes lo necesitan
- Mayor bundle size en frontend

**Justificación:** Prioridad en UX rápida. Description es pequeña (<5KB típicamente), parsing es O(n) simple. Posibilidad de mover a server-side si crece complejidad.

---

## Decisión 2: Estrategia de Datos en Navegación

### Opción A: Solo EventId en URL
```
/tour-details.html?eventId=abc123
```
**Pros:** URL limpia  
**Contras:** Header espera API (1s+ delay), mala UX

### Opción B: Datos Básicos en URL ✅ **SELECCIONADA**
```
/tour-details.html?eventId=abc123&title=Madrid+Tapas&date=2025-10-30&time=17:30
```
**Pros:**
- Header renderiza instantáneamente
- Solo 1 llamada API para description (crítico)
- Fallback a "Ver Calendar" tiene datos disponibles

**Contras:** URL más larga (aceptable en PWA)

**Justificación:** UX > URL estética. Reduce perceived load time ~800ms.

---

## Decisión 3: Estructura de Datos Guest

### Interface TypeScript (Documentación)
```typescript
interface Guest {
  nombre: string;           // Extraído de línea post-fecha
  pax: number | null;       // Extraído de "[X] adults"
  telefono: string | null;  // Pattern: [PAÍS]+[CÓDIGO] [NÚMERO]
  notas: string | null;     // Línea "Special Requirements/Notes:"
  valido: boolean;          // true si tiene nombre + (pax O telefono)
  errores: number;          // Contador campos faltantes (0-3)
}
```

**Regla validación:**
- `errores <= 1`: Mostrar card con N/A en campos faltantes
- `errores > 1`: No mostrar card, incrementar contador fallidos

---

## Decisión 4: Endpoint Apps Script

### Nuevo Endpoint: `getEventDetails`

**Request:**
```
GET ${APPS_SCRIPT_URL}?endpoint=getEventDetails&eventId=abc123&apiKey=XXX
```

**Response exitosa:**
```json
{
  "success": true,
  "event": {
    "id": "abc123",
    "summary": "Madrid's Iconic Tapas...",
    "description": "4 booked, 8 available\nGUIDE MADRID: DANI\n----\n...",
    "start": { "dateTime": "2025-10-30T17:30:00+02:00" },
    "htmlLink": "https://calendar.google.com/calendar/event?eid=..."
  }
}
```

**Response error:**
```json
{
  "error": true,
  "code": "NOT_FOUND" | "UNAUTHORIZED" | "INTERNAL_ERROR",
  "message": "Event not found"
}
```

**Implementación Apps Script:**
```javascript
function getEventDetails(e) {
  const eventId = e.parameter.eventId;
  const event = Calendar.Events.get(CALENDAR_ID, eventId);
  
  return buildResponse({
    success: true,
    event: {
      id: event.id,
      summary: event.summary,
      description: event.description || "",
      start: event.start,
      htmlLink: event.htmlLink
    }
  });
}
```

---

## Decisión 5: Parsing Algorithm

### Pseudocódigo
```
function parseDescription(description: string): Guest[] {
  // 1. Split por separador de reservas
  bloques = description.split(/[-]{4,}/)  // 4+ guiones
  
  guests = []
  
  for each bloque in bloques:
    if bloque.trim().length < 20: continue  // Ignorar headers
    
    lineas = bloque.split('\n').filter(non-empty)
    
    guest = {
      nombre: null,
      pax: null,
      telefono: null,
      notas: null,
      errores: 0
    }
    
    // Extraer PAX
    for linea in lineas:
      match = linea.match(/(\d+)\s+adults?/i)
      if match:
        guest.pax = parseInt(match[1])
        break
    
    // Extraer NOMBRE (primera línea tras fecha/tour)
    for i, linea in lineas:
      if linea.match(/\d{4}\s+\d{2}:\d{2}/):  // Fecha formato
        if i+1 < lineas.length:
          guest.nombre = lineas[i+1].trim()
        break
    
    // Extraer TELÉFONO
    for linea in lineas:
      match = linea.match(/([A-Z]{2}\+\d+[\s\d\(\)]+)/)
      if match:
        guest.telefono = match[1].trim()
        break
    
    // Extraer NOTAS
    for linea in lineas:
      if linea.startsWith("Special Requirements/Notes:"):
        guest.notas = linea.replace("Special Requirements/Notes:", "").trim()
        break
    
    // Validar
    guest.errores = [guest.nombre, guest.pax, guest.telefono]
                    .filter(x => x === null).length
    
    guest.valido = guest.nombre && (guest.pax || guest.telefono)
    
    guests.push(guest)
  
  return guests.filter(g => g.valido || g.errores <= 1)
}
```

**Regex Críticos:**
- Separador: `/[-]{4,}/` (4+ guiones consecutivos)
- Pax: `/(\d+)\s+adults?/i` (case-insensitive, singular/plural)
- Teléfono: `/([A-Z]{2}\+\d+[\s\d\(\)]+)/` (código país + dígitos/paréntesis)
- Fecha: `/\d{4}\s+\d{2}:\d{2}/` (para ubicar línea de nombre)

---

## Decisión 6: Manejo de Errores y Timeouts

### Timeout Strategy
```javascript
async function getTourGuestDetails(eventId, options = {}) {
  const timeout = options.timeout || 10000; // 10s default
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('TIMEOUT');
    }
    throw error;
  }
}
```

### Error Hierarchy (prioridad descendente)
1. **UNAUTHORIZED** → Redirect a `/index.html`
2. **NOT_FOUND** → Mostrar error + botón "Volver Dashboard"
3. **TIMEOUT** → Auto-retry 1 vez + botón "Reintentar"
4. **NETWORK_ERROR** → Botón "Reintentar" + "Ver Calendar"
5. **PARSING_ERROR** → Botón "Ver Calendar"

---

## Decisión 7: Seguridad y PII

### Medidas Implementadas
- **No logging de PII:** Console.log solo muestra errores, no datos de guests
- **HTTPS obligatorio:** Firebase Hosting con TLS 1.3
- **API Key en headers:** No expuesto en URL (POST body cuando sea posible)
- **Validación server-side:** Apps Script valida API_KEY antes de consultar Calendar
- **Sin caché de datos sensibles:** No usar localStorage para description

### Decisión: No implementar caché offline por PII
**Alternativa considerada:** Service Worker cachea description  
**Rechazada porque:** Datos personales sensibles no deben persistir en client  
**Tradeoff aceptado:** Requiere conexión para ver detalles

---

## Decisión 8: Diseño Responsive Mobile-First

### Breakpoints
```css
/* Mobile: 320px - 767px (default) */
.guest-card { padding: 16px; }

/* Tablet: 768px - 1023px */
@media (min-width: 768px) {
  .guest-card { max-width: 600px; margin: 0 auto; }
}

/* Desktop: 1024px+ */
@media (min-width: 1024px) {
  .guest-list { display: grid; grid-template-columns: repeat(2, 1fr); }
}
```

### Prioridad táctil
- Botones min-height: 44px (iOS touch target)
- Espaciado cards: 12px (fácil scroll pulgar)
- Font size mínimo: 16px (evita zoom iOS)

---

## Consecuencias

### Positivas
✅ Render inmediato de header (mejor UX)  
✅ Parsing flexible y debuggable en cliente  
✅ Un solo endpoint nuevo en Apps Script  
✅ Manejo robusto de errores con fallbacks  
✅ Seguridad PII respetada  

### Negativas
❌ URL larga (mitigado: solo en PWA interna)  
❌ Bundle size +5KB (parsing logic)  
❌ Sin modo offline para detalles (trade-off aceptado)  

### Riesgos Identificados
| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Cambio formato description | Media | Alto | Tests regex extensivos + monitoreo logs |
| Timeout en 3G lenta | Alta | Medio | Auto-retry + UI feedback claro |
| Parsing falla >5% casos | Baja | Alto | Fallback Calendar + logging errores |

---

## Alternativas Consideradas

### Alt 1: Usar Firebase Functions en vez de Apps Script
**Rechazada:** Apps Script ya integrado, menos latencia (mismo GCP), cuotas suficientes

### Alt 2: Almacenar guests parseados en Firestore
**Rechazada:** Duplicación datos, sincronización compleja, PII fuera de Calendar scope

### Alt 3: Server-Side Rendering (SSR)
**Rechazada:** Overhead innecesario para PWA, mata performance

---

## Diagrama de Secuencia

```
Usuario                  guide.html              tour-details.html        Apps Script         Calendar API
  |                          |                           |                      |                    |
  |--click asignación------->|                           |                      |                    |
  |                          |                           |                      |                    |
  |                          |--navigate---------------->|                      |                    |
  |                          |  ?eventId=X&title=Y       |                      |                    |
  |                          |                           |                      |                    |
  |                          |                           |--render header------>|                    |
  |                          |                           |  (usa params URL)    |                    |
  |                          |                           |                      |                    |
  |                          |                           |--getEventDetails---->|                    |
  |                          |                           |  (eventId)           |                    |
  |                          |                           |                      |                    |
  |                          |                           |                      |--Calendar.get----->|
  |                          |                           |                      |                    |
  |                          |                           |                      |<---event data------|
  |                          |                           |                      |                    |
  |                          |                           |<--{event}------------|                    |
  |                          |                           |                      |                    |
  |                          |                           |--parseDescription--->|                    |
  |                          |                           |  (client-side)       |                    |
  |                          |                           |                      |                    |
  |                          |                           |--render guests------>|                    |
  |<-----------------------------página completa---------|                      |                    |
  |                          |                           |                      |                    |
```

---

## Métricas de Éxito

| Métrica | Target | Medición |
|---------|--------|----------|
| Parsing success rate | >95% | Firebase Analytics eventos `parsing_error` |
| Time to Interactive | <2s en 4G | Lighthouse CI |
| Error rate API | <2% | Logs Apps Script |
| Uso fallback Calendar | <5% usuarios | Analytics evento `fallback_calendar_click` |

---

## Próximos Pasos

1. ✅ Aprobar ADR
2. ⏭️ Implementar endpoint `getEventDetails` en Apps Script
3. ⏭️ Crear `tour-details.html` + `tour-details.js`
4. ⏭️ Modificar `guide-dashboard.js` (navegación)
5. ⏭️ Modificar `calendar-api.js` (función wrapper)
6. ⏭️ Testing + QA
7. ⏭️ Deploy a staging
8. ⏭️ Validación con guías reales

---

**Aprobado por:** [Pendiente]  
**Fecha aprobación:** [Pendiente]  
**Revisión:** [Pendiente]
