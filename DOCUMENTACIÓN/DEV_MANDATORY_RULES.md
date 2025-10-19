# REGLAS OBLIGATORIAS DE DESARROLLO

**NO NEGOCIABLES - APLICAR SIEMPRE**

---

## 🚨 REGLA 1: INVESTIGAR ANTES DE PROPONER

**ANTES de sugerir cualquier solución técnica:**

1. ✅ Buscar en Google con términos: `[tecnología] [problema] 2025 site:stackoverflow.com OR site:github.com OR docs oficiales`
2. ✅ Leer MÍNIMO 3 fuentes diferentes (2024-2025)
3. ✅ Verificar documentación oficial (Google, Firebase, MDN)
4. ✅ Confirmar que la solución NO es obsoleta

**❌ PROHIBIDO:**
- Proponer soluciones sin buscar primero
- Dar vueltas en círculos con teorías no verificadas
- Asumir que algo funciona sin evidencia

---

## 🚨 REGLA 2: CÓDIGO SIEMPRE COMPLETO

**AL ENTREGAR CÓDIGO:**

✅ **SIEMPRE versión 100% completa del archivo**
- Desde la primera línea hasta la última
- Con todos los imports
- Con todas las funciones
- Listo para copiar y reemplazar TODO el archivo

❌ **NUNCA:**
- Código parcial con "..."
- "Solo cambia esta línea"
- Snippets incompletos

---

## 🚨 REGLA 3: CORS EN APPS SCRIPT

**Apps Script Web Apps NO acepta `application/json` en POST**
```javascript
// ✅ CORRECTO
headers: { 'Content-Type': 'text/plain;charset=utf-8' }

// ❌ INCORRECTO
headers: { 'Content-Type': 'application/json' }
```

**Razón:** `application/json` causa preflight OPTIONS → Apps Script responde 405

---

## 🚨 REGLA 4: NO DAR VUELTAS

**Si un enfoque falla 2 veces seguidas:**

1. PARAR
2. Buscar en internet
3. Cambiar de enfoque completamente

**❌ PROHIBIDO intentar:**
- Misma solución con variaciones mínimas
- "Quizás si cambio esto..."
- "Puede ser que..."

---

**INCUMPLIR ESTAS REGLAS = PÉRDIDA DE CONFIANZA DEL CLIENTE**
```

---

## 2️⃣ TEXTO PARA TUS CUSTOM INSTRUCTIONS

**Pega esto en la configuración de tu cuenta de Claude:**
```
MANDATORY WORKFLOW FOR TECHNICAL PROBLEMS:

1. BEFORE proposing ANY solution:
   - Search Google: "[technology] [problem] 2025 site:stackoverflow.com OR official docs"
   - Read minimum 3 different sources (2024-2025)
   - Verify solution is NOT obsolete
   - NEVER propose solutions without researching first

2. CODE DELIVERY:
   - ALWAYS provide 100% complete file versions
   - From first line to last line
   - Ready to copy/paste and replace entire file
   - NEVER partial code with "..."
   - NEVER "just change this line"

3. WHEN STUCK:
   - If same approach fails 2 times → STOP
   - Search internet IMMEDIATELY
   - Change approach completely
   - NEVER loop with minimal variations

4. GOOGLE APPS SCRIPT CRITICAL RULE:
   - POST requests MUST use 'Content-Type': 'text/plain;charset=utf-8'
   - NEVER use 'application/json' (causes 405 CORS error)

VIOLATION = LOSS OF CLIENT TRUST