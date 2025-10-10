# Variables de Entorno - Sincronización Bookeo

**Versión:** 1.0  
**Fecha:** 2025-10-10  
**Proyecto:** calendar-app-tours

---

## Variables Requeridas

### Cloud Functions

#### `ZAPIER_WEBHOOK_URL`
**Descripción:** URL del webhook Zapier que recibe notificaciones de bloqueo/desbloqueo  
**Tipo:** String (URL)  
**Obligatorio:** ✅ Sí  
**Ejemplo:** `https://hooks.zapier.com/hooks/catch/12345/67890/`  
**Uso:** Cloud Function `syncBookeoAvailability`

**Obtención:**
1. Acceder a Zapier dashboard (cuenta Pablo)
2. Crear/editar Zap "Calendar App - Bookeo Sync"
3. Trigger: "Webhooks by Zapier" → "Catch Hook"
4. Copiar "Custom Webhook URL"

---

#### `ZAPIER_WEBHOOK_SECRET`
**Descripción:** Clave secreta para validar origen webhook en Zapier  
**Tipo:** String  
**Obligatorio:** ❌ Opcional (recomendado)  
**Ejemplo:** `sk_live_abc123xyz789`  
**Uso:** Header `X-Webhook-Secret` en requests

**Generación:**
```bash
openssl rand -base64 32
# Output ejemplo: hK8mP3nQ7rT4vW5xY6zA9bC1dE2fG3hJ4kL5mN6oP7qR8sT9u
```

---

#### `MANAGER_EMAIL`
**Descripción:** Email del Manager para notificaciones  
**Tipo:** String (email)  
**Obligatorio:** ✅ Sí  
**Ejemplo:** `madrid@spainfoodsherpas.com`  
**Uso:** Envío emails bloqueo/desbloqueo y errores

---

#### `BOOKEO_SYNC_ENABLED`
**Descripción:** Flag para habilitar/deshabilitar sincronización Bookeo  
**Tipo:** Boolean (string)  
**Obligatorio:** ❌ Opcional (default: `true`)  
**Valores:** `"true"` | `"false"`  
**Uso:** Permite deshabilitar sincronización sin redesplegar código

**Ejemplo uso:**
```javascript
const syncEnabled = process.env.BOOKEO_SYNC_ENABLED !== 'false';
if (!syncEnabled) {
  console.log('Bookeo sync disabled - skipping webhook');
  return;
}
```

---

#### `WEBHOOK_TIMEOUT_MS`
**Descripción:** Timeout máximo para webhook Zapier (milisegundos)  
**Tipo:** Number (string)  
**Obligatorio:** ❌ Opcional (default: `30000`)  
**Ejemplo:** `30000` (30 segundos)  
**Uso:** Configuración timeout axios/fetch

---

#### `WEBHOOK_MAX_RETRIES`
**Descripción:** Número máximo de reintentos webhook  
**Tipo:** Number (string)  
**Obligatorio:** ❌ Opcional (default: `3`)  
**Ejemplo:** `3`  
**Uso:** Lógica reintentos en Cloud Function

---

## Configuración Firebase Functions

### Método 1: Firebase CLI

```bash
# Configurar todas las variables
firebase functions:config:set \
  zapier.webhook_url="https://hooks.zapier.com/hooks/catch/12345/67890/" \
  zapier.webhook_secret="hK8mP3nQ7rT4vW5xY6zA9bC1dE2fG3hJ4kL5mN6oP7qR8sT9u" \
  notifications.manager_email="madrid@spainfoodsherpas.com" \
  bookeo.sync_enabled="true" \
  bookeo.webhook_timeout_ms="30000" \
  bookeo.webhook_max_retries="3"

# Verificar configuración
firebase functions:config:get
```

### Método 2: .env Local (Desarrollo)

**Archivo:** `functions/.env` (NO commitear a Git)

```bash
# Zapier Configuration
ZAPIER_WEBHOOK_URL=https://hooks.zapier.com/hooks/catch/12345/67890/
ZAPIER_WEBHOOK_SECRET=hK8mP3nQ7rT4vW5xY6zA9bC1dE2fG3hJ4kL5mN6oP7qR8sT9u

# Email Notifications
MANAGER_EMAIL=madrid@spainfoodsherpas.com

# Feature Flags
BOOKEO_SYNC_ENABLED=true

# Advanced Configuration
WEBHOOK_TIMEOUT_MS=30000
WEBHOOK_MAX_RETRIES=3
```

**Importante:** Añadir `functions/.env` a `.gitignore`

```bash
# .gitignore
functions/.env
functions/.env.*
```

---

## Uso en Cloud Functions

### JavaScript/TypeScript

```javascript
// functions/index.js
import * as functions from 'firebase-functions';

// Método 1: Firebase Functions Config (producción)
const config = functions.config();
const zapierUrl = config.zapier?.webhook_url;
const managerEmail = config.notifications?.manager_email;

// Método 2: process.env (desarrollo con dotenv)
import dotenv from 'dotenv';
dotenv.config();

const zapierUrl = process.env.ZAPIER_WEBHOOK_URL;
const managerEmail = process.env.MANAGER_EMAIL;

// Helper para obtener config con fallback
function getConfig(key, defaultValue = null) {
  // Intenta functions.config() primero (producción)
  const parts = key.split('.');
  let value = functions.config();
  
  for (const part of parts) {
    value = value?.[part];
  }
  
  // Fallback a process.env (desarrollo)
  if (!value) {
    const envKey = key.toUpperCase().replace('.', '_');
    value = process.env[envKey];
  }
  
  return value || defaultValue;
}

// Uso
const zapierUrl = getConfig('zapier.webhook_url');
const managerEmail = getConfig('notifications.manager_email');
const syncEnabled = getConfig('bookeo.sync_enabled', 'true') === 'true';
```

---

## Validación Variables

### Script de Validación

**Archivo:** `functions/scripts/validate-env.js`

```javascript
#!/usr/bin/env node

const requiredVars = [
  'ZAPIER_WEBHOOK_URL',
  'MANAGER_EMAIL'
];

const optionalVars = [
  'ZAPIER_WEBHOOK_SECRET',
  'BOOKEO_SYNC_ENABLED',
  'WEBHOOK_TIMEOUT_MS',
  'WEBHOOK_MAX_RETRIES'
];

function validateEnv() {
  const missing = [];
  const warnings = [];
  
  // Validar requeridas
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }
  
  // Validar opcionales
  for (const varName of optionalVars) {
    if (!process.env[varName]) {
      warnings.push(varName);
    }
  }
  
  // Validar formato email
  const email = process.env.MANAGER_EMAIL;
  if (email && !email.includes('@')) {
    missing.push('MANAGER_EMAIL (formato inválido)');
  }
  
  // Validar formato URL
  const url = process.env.ZAPIER_WEBHOOK_URL;
  if (url && !url.startsWith('https://')) {
    missing.push('ZAPIER_WEBHOOK_URL (debe usar HTTPS)');
  }
  
  // Resultados
  if (missing.length > 0) {
    console.error('❌ Variables requeridas faltantes:');
    missing.forEach(v => console.error(`   - ${v}`));
    process.exit(1);
  }
  
  if (warnings.length > 0) {
    console.warn('⚠️  Variables opcionales no configuradas (usarán defaults):');
    warnings.forEach(v => console.warn(`   - ${v}`));
  }
  
  console.log('✅ Todas las variables requeridas están configuradas');
}

validateEnv();
```

**Ejecutar antes de deploy:**
```bash
node functions/scripts/validate-env.js
```

---

## Seguridad

### ✅ Buenas Prácticas

1. **Nunca commitear secrets**
   - `.env` en `.gitignore`
   - Usar `firebase functions:config:set` para producción

2. **Rotar secrets periódicamente**
   - Cambiar `ZAPIER_WEBHOOK_SECRET` cada 6 meses
   - Coordinar con Pablo para actualizar Zapier

3. **Principio de mínimos privilegios**
   - Solo Cloud Functions acceden a secrets
   - Frontend NO tiene acceso a estas variables

4. **Auditoría**
   - Registrar uso variables en logs Cloud Functions
   - Monitorear accesos anómalos

### ❌ Evitar

- ❌ Hardcodear URLs/secrets en código
- ❌ Exponer variables en logs públicos
- ❌ Compartir `.env` por email/Slack
- ❌ Reutilizar secrets entre entornos (dev/prod)

---

## Ambientes

### Desarrollo (Local)

**Archivo:** `functions/.env.development`

```bash
ZAPIER_WEBHOOK_URL=https://hooks.zapier.com/hooks/catch/DEV_ID/DEV_SECRET/
ZAPIER_WEBHOOK_SECRET=dev_secret_123
MANAGER_EMAIL=test@example.com
BOOKEO_SYNC_ENABLED=false
```

**Uso:**
```bash
# Emuladores Firebase
firebase emulators:start --import=./emulator-data
```

---

### Staging

```bash
firebase use staging
firebase functions:config:set \
  zapier.webhook_url="https://hooks.zapier.com/hooks/catch/STAGING_ID/" \
  notifications.manager_email="staging@example.com" \
  bookeo.sync_enabled="false"
```

---

### Producción

```bash
firebase use production
firebase functions:config:set \
  zapier.webhook_url="https://hooks.zapier.com/hooks/catch/PROD_ID/" \
  zapier.webhook_secret="PROD_SECRET_XYZ" \
  notifications.manager_email="madrid@spainfoodsherpas.com" \
  bookeo.sync_enabled="true"
```

---

## Troubleshooting

### Error: "Webhook URL no configurado"

```
Error: ZAPIER_WEBHOOK_URL is not defined
```

**Solución:**
```bash
firebase functions:config:set zapier.webhook_url="URL_AQUI"
firebase deploy --only functions
```

---

### Error: "Manager email inválido"

```
Error: Invalid MANAGER_EMAIL format
```

**Verificar:**
```bash
firebase functions:config:get notifications.manager_email
```

**Corregir:**
```bash
firebase functions:config:set notifications.manager_email="email@valido.com"
```

---

### Variables no se actualizan

**Causa:** Cache de Firebase Functions config

**Solución:**
```bash
# Eliminar config antigua
firebase functions:config:unset zapier.webhook_url

# Configurar nueva
firebase functions:config:set zapier.webhook_url="NEW_URL"

# Redesplegar
firebase deploy --only functions
```

---

## Migración entre Proyectos

### Exportar config proyecto actual

```bash
firebase functions:config:get > config-backup.json
```

### Importar en nuevo proyecto

```bash
# Cambiar a nuevo proyecto
firebase use nuevo-proyecto

# Importar config (requiere script custom)
node scripts/import-config.js config-backup.json
```

---

## Checklist Pre-Deploy

- [ ] Variables requeridas configuradas
- [ ] Email Manager válido
- [ ] Webhook URL Zapier verificado con Pablo
- [ ] Secret rotado si >6 meses antiguo
- [ ] `.env` NO commiteado a Git
- [ ] Script validación ejecutado sin errores
- [ ] Coordinado con Pablo activación Zapier

---

## Referencias

- [Firebase Functions Environment Configuration](https://firebase.google.com/docs/functions/config-env)
- [dotenv Documentation](https://github.com/motdotla/dotenv)
- ADR-005: Decisión arquitectónica sincronización Bookeo
- Contrato Webhook Zapier: Especificación técnica

---

## Contacto

**Configuración Cloud Functions:** Equipo desarrollo  
**Configuración Zapier:** Pablo Vázquez  
**Credenciales producción:** Manager
