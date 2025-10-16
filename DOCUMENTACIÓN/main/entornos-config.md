# Configuración de Entornos - Calendario Tours Madrid

## Estrategia Multi-Entorno

### Entornos

| Entorno | Propósito | Acceso | Datos |
|---------|-----------|--------|-------|
| **Development** | Desarrollo local + testing | Developers | Datos fake |
| **Staging** | Pre-producción, UAT | Manager + QA | Datos staging |
| **Production** | Usuarios reales | Manager + Guías | Datos reales |

---

## 1. Firebase Projects

### 1.1 Crear Proyectos

```bash
# Development
firebase projects:create tours-calendario-dev
firebase use tours-calendario-dev --alias dev

# Staging
firebase projects:create tours-calendario-staging
firebase use tours-calendario-staging --alias staging

# Production
firebase projects:create tours-calendario-prod
firebase use tours-calendario-prod --alias prod
```

### 1.2 Configuración por Proyecto

**`.firebaserc`**
```json
{
  "projects": {
    "dev": "tours-calendario-dev",
    "staging": "tours-calendario-staging",
    "prod": "tours-calendario-prod"
  },
  "targets": {},
  "etags": {}
}
```

### 1.3 Firebase Config Files

**`firebase.json`** (compartido)
```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "functions": {
    "source": "functions",
    "runtime": "nodejs20",
    "predeploy": [
      "npm --prefix \"$RESOURCE_DIR\" run lint",
      "npm --prefix \"$RESOURCE_DIR\" run build"
    ]
  },
  "hosting": {
    "public": "public",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  },
  "emulators": {
    "auth": {
      "port": 9099
    },
    "functions": {
      "port": 5001
    },
    "firestore": {
      "port": 8080
    },
    "hosting": {
      "port": 5000
    },
    "ui": {
      "enabled": true,
      "port": 4000
    }
  }
}
```

---

## 2. Variables de Entorno

### 2.1 Structure

```
.
├── .env.development
├── .env.staging
├── .env.production
└── .env.example
```

### 2.2 Environment Files

**`.env.example`** (template, commiteado)
```bash
# Firebase Config
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

# Apps Script
VITE_APPS_SCRIPT_URL=
VITE_APPS_SCRIPT_API_KEY=

# Calendar
VITE_CALENDAR_ID=c_61981c641dc3c970e63f1713ccc2daa49d8fe8962b6ed9f2669c4554496c7bdd@group.calendar.google.com

# Feature Flags
VITE_ENABLE_ANALYTICS=false
```

**`.env.development`** (local, NO commiteado)
```bash
# Firebase Dev
VITE_FIREBASE_API_KEY=AIza...dev
VITE_FIREBASE_AUTH_DOMAIN=tours-calendario-dev.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=tours-calendario-dev
VITE_FIREBASE_STORAGE_BUCKET=tours-calendario-dev.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef

# Apps Script Dev
VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/DEV_DEPLOYMENT_ID/exec
VITE_APPS_SCRIPT_API_KEY=dev-secret-key-123

# Calendar
VITE_CALENDAR_ID=c_61981c641dc3c970e63f1713ccc2daa49d8fe8962b6ed9f2669c4554496c7bdd@group.calendar.google.com

# Dev Features
VITE_ENABLE_ANALYTICS=false
VITE_ENABLE_DEBUG_LOGS=true
```

**`.env.staging`**
```bash
# Firebase Staging
VITE_FIREBASE_API_KEY=AIza...staging
VITE_FIREBASE_AUTH_DOMAIN=tours-calendario-staging.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=tours-calendario-staging
VITE_FIREBASE_STORAGE_BUCKET=tours-calendario-staging.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=987654321
VITE_FIREBASE_APP_ID=1:987654321:web:ghijkl

# Apps Script Staging
VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/STAGING_DEPLOYMENT_ID/exec
VITE_APPS_SCRIPT_API_KEY=staging-secret-key-456

# Calendar (mismo que prod)
VITE_CALENDAR_ID=c_61981c641dc3c970e63f1713ccc2daa49d8fe8962b6ed9f2669c4554496c7bdd@group.calendar.google.com

# Staging Features
VITE_ENABLE_ANALYTICS=true
VITE_ENABLE_DEBUG_LOGS=true
```

**`.env.production`**
```bash
# Firebase Production
VITE_FIREBASE_API_KEY=AIza...prod
VITE_FIREBASE_AUTH_DOMAIN=tours-calendario-prod.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=tours-calendario-prod
VITE_FIREBASE_STORAGE_BUCKET=tours-calendario-prod.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=111222333
VITE_FIREBASE_APP_ID=1:111222333:web:mnopqr

# Apps Script Production
VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/PROD_DEPLOYMENT_ID/exec
VITE_APPS_SCRIPT_API_KEY=prod-secret-key-789

# Calendar
VITE_CALENDAR_ID=c_61981c641dc3c970e63f1713ccc2daa49d8fe8962b6ed9f2669c4554496c7bdd@group.calendar.google.com

# Production Features
VITE_ENABLE_ANALYTICS=true
VITE_ENABLE_DEBUG_LOGS=false
```

### 2.3 Frontend Config

**`src/config/firebase.js`**
```javascript
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const appsScriptConfig = {
  url: import.meta.env.VITE_APPS_SCRIPT_URL,
  apiKey: import.meta.env.VITE_APPS_SCRIPT_API_KEY
};

export const calendarConfig = {
  calendarId: import.meta.env.VITE_CALENDAR_ID
};

export default firebaseConfig;
```

---

## 3. Cloud Functions Environment

### 3.1 Functions Config

**`functions/.env.development`**
```bash
APPS_SCRIPT_URL=https://script.google.com/macros/s/DEV_DEPLOYMENT_ID/exec
APPS_SCRIPT_API_KEY=dev-secret-key-123
CALENDAR_ID=c_61981c641dc3c970e63f1713ccc2daa49d8fe8962b6ed9f2669c4554496c7bdd@group.calendar.google.com
ENVIRONMENT=development
```

**`functions/.env.staging`**
```bash
APPS_SCRIPT_URL=https://script.google.com/macros/s/STAGING_DEPLOYMENT_ID/exec
APPS_SCRIPT_API_KEY=staging-secret-key-456
CALENDAR_ID=c_61981c641dc3c970e63f1713ccc2daa49d8fe8962b6ed9f2669c4554496c7bdd@group.calendar.google.com
ENVIRONMENT=staging
```

**`functions/.env.production`**
```bash
APPS_SCRIPT_URL=https://script.google.com/macros/s/PROD_DEPLOYMENT_ID/exec
APPS_SCRIPT_API_KEY=prod-secret-key-789
CALENDAR_ID=c_61981c641dc3c970e63f1713ccc2daa49d8fe8962b6ed9f2669c4554496c7bdd@group.calendar.google.com
ENVIRONMENT=production
```

### 3.2 Deploy con Variables

```bash
# Development
firebase use dev
firebase functions:config:set \
  appsscript.url="https://script.google.com/.../exec" \
  appsscript.apikey="dev-key" \
  environment="development"

# Staging
firebase use staging
firebase functions:config:set \
  appsscript.url="https://script.google.com/.../exec" \
  appsscript.apikey="staging-key" \
  environment="staging"

# Production
firebase use prod
firebase functions:config:set \
  appsscript.url="https://script.google.com/.../exec" \
  appsscript.apikey="prod-key" \
  environment="production"
```

### 3.3 Uso en Functions

**`functions/src/config.js`**
```javascript
const functions = require('firebase-functions');

const config = {
  appsScript: {
    url: functions.config().appsscript?.url || process.env.APPS_SCRIPT_URL,
    apiKey: functions.config().appsscript?.apikey || process.env.APPS_SCRIPT_API_KEY
  },
  calendar: {
    id: process.env.CALENDAR_ID
  },
  environment: functions.config().environment || process.env.ENVIRONMENT || 'development'
};

module.exports = config;
```

---

## 4. Apps Script Environments

### 4.1 Script Properties (por deployment)

**Development:**
```javascript
// Script Properties (manual setup)
API_KEY = "dev-secret-key-123"
ENVIRONMENT = "development"
CALENDAR_ID = "c_61981c641dc3c970e63f1713ccc2daa49d8fe8962b6ed9f2669c4554496c7bdd@group.calendar.google.com"
```

**Staging:**
```javascript
API_KEY = "staging-secret-key-456"
ENVIRONMENT = "staging"
CALENDAR_ID = "c_61981c641dc3c970e63f1713ccc2daa49d8fe8962b6ed9f2669c4554496c7bdd@group.calendar.google.com"
```

**Production:**
```javascript
API_KEY = "prod-secret-key-789"
ENVIRONMENT = "production"
CALENDAR_ID = "c_61981c641dc3c970e63f1713ccc2daa49d8fe8962b6ed9f2669c4554496c7bdd@group.calendar.google.com"
```

### 4.2 Setup Script

**`appsscript/setup-properties.js`**
```javascript
function setupDevelopment() {
  const props = PropertiesService.getScriptProperties();
  props.setProperties({
    'API_KEY': 'dev-secret-key-123',
    'ENVIRONMENT': 'development',
    'CALENDAR_ID': 'c_61981c641dc3c970e63f1713ccc2daa49d8fe8962b6ed9f2669c4554496c7bdd@group.calendar.google.com'
  });
  Logger.log('Development properties set');
}

function setupStaging() {
  const props = PropertiesService.getScriptProperties();
  props.setProperties({
    'API_KEY': 'staging-secret-key-456',
    'ENVIRONMENT': 'staging',
    'CALENDAR_ID': 'c_61981c641dc3c970e63f1713ccc2daa49d8fe8962b6ed9f2669c4554496c7bdd@group.calendar.google.com'
  });
  Logger.log('Staging properties set');
}

function setupProduction() {
  const props = PropertiesService.getScriptProperties();
  props.setProperties({
    'API_KEY': 'prod-secret-key-789',
    'ENVIRONMENT': 'production',
    'CALENDAR_ID': 'c_61981c641dc3c970e63f1713ccc2daa49d8fe8962b6ed9f2669c4554496c7bdd@group.calendar.google.com'
  });
  Logger.log('Production properties set');
}
```

### 4.3 Multiple Deployments

**`.clasp.json`** (Development)
```json
{
  "scriptId": "DEVELOPMENT_SCRIPT_ID",
  "rootDir": "./appsscript"
}
```

**`.clasp-staging.json`**
```json
{
  "scriptId": "STAGING_SCRIPT_ID",
  "rootDir": "./appsscript"
}
```

**`.clasp-prod.json`**
```json
{
  "scriptId": "PRODUCTION_SCRIPT_ID",
  "rootDir": "./appsscript"
}
```

**Deploy commands:**
```bash
# Development
clasp push

# Staging
clasp push --config .clasp-staging.json

# Production
clasp push --config .clasp-prod.json
```

---

## 5. Secrets Management

### 5.1 GitHub Secrets (CI/CD)

**Repository Secrets:**
```
# Firebase Service Accounts
FIREBASE_SERVICE_ACCOUNT_DEV
FIREBASE_SERVICE_ACCOUNT_STAGING
FIREBASE_SERVICE_ACCOUNT_PROD

# Apps Script
CLASP_TOKEN_DEV
CLASP_TOKEN_STAGING
CLASP_TOKEN_PROD

# API Keys
APPS_SCRIPT_API_KEY_DEV
APPS_SCRIPT_API_KEY_STAGING
APPS_SCRIPT_API_KEY_PROD
```

### 5.2 Local Secrets

**`.secrets/` (gitignored)**
```
.secrets/
├── firebase-service-account-dev.json
├── firebase-service-account-staging.json
├── firebase-service-account-prod.json
├── clasp-dev.json
├── clasp-staging.json
└── clasp-prod.json
```

**`.gitignore`**
```
# Environment
.env*
!.env.example

# Secrets
.secrets/
*.key
*.pem
*service-account*.json

# Apps Script
.clasp*.json
!.clasp.json.example
```

---

## 6. Firestore Rules por Entorno

### 6.1 Development Rules (permisivas)

**`firestore.rules.dev`**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Development: logging habilitado
    function isAuthenticated() {
      return request.auth != null;
    }
    
    match /{document=**} {
      allow read, write: if isAuthenticated();
    }
  }
}
```

### 6.2 Staging/Production Rules (estrictas)

**`firestore.rules`** (usado en staging/prod)
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
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
    
    // [Resto de rules de producción...]
  }
}
```

### 6.3 Deploy Rules

```bash
# Development
firebase use dev
firebase deploy --only firestore:rules --config firestore.rules.dev

# Staging/Production
firebase use staging
firebase deploy --only firestore:rules

firebase use prod
firebase deploy --only firestore:rules
```

---

## 7. Deploy Scripts

### 7.1 Package Scripts

**`package.json`**
```json
{
  "scripts": {
    "dev": "vite --mode development",
    "build:dev": "vite build --mode development",
    "build:staging": "vite build --mode staging",
    "build:prod": "vite build --mode production",
    
    "deploy:dev": "npm run build:dev && firebase use dev && firebase deploy",
    "deploy:staging": "npm run build:staging && firebase use staging && firebase deploy",
    "deploy:prod": "npm run build:prod && firebase use prod && firebase deploy",
    
    "emulators": "firebase emulators:start --import=./emulator-data --export-on-exit",
    
    "functions:dev": "cd functions && npm run build && firebase use dev && firebase deploy --only functions",
    "functions:staging": "cd functions && npm run build && firebase use staging && firebase deploy --only functions",
    "functions:prod": "cd functions && npm run build && firebase use prod && firebase deploy --only functions"
  }
}
```

### 7.2 Apps Script Deploy

**`deploy-apps-script.sh`**
```bash
#!/bin/bash

ENV=$1

if [ "$ENV" = "dev" ]; then
  echo "Deploying to Development..."
  clasp push --force
  clasp deploy --description "Dev - $(date)"
elif [ "$ENV" = "staging" ]; then
  echo "Deploying to Staging..."
  clasp push --force --config .clasp-staging.json
  clasp deploy --description "Staging - $(date)" --config .clasp-staging.json
elif [ "$ENV" = "prod" ]; then
  echo "Deploying to Production..."
  read -p "Are you sure? (yes/no): " confirm
  if [ "$confirm" = "yes" ]; then
    clasp push --force --config .clasp-prod.json
    clasp deploy --description "Prod - $(date)" --config .clasp-prod.json
  fi
else
  echo "Usage: ./deploy-apps-script.sh [dev|staging|prod]"
  exit 1
fi
```

---

## 8. CI/CD Environments

### 8.1 GitHub Actions Workflow

**`.github/workflows/deploy.yml`**
```yaml
name: Deploy

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  deploy-dev:
    if: github.ref == 'refs/heads/develop'
    runs-on: ubuntu-latest
    environment: development
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build:dev
        env:
          VITE_FIREBASE_API_KEY: ${{ secrets.FIREBASE_API_KEY_DEV }}
          VITE_FIREBASE_PROJECT_ID: tours-calendario-dev
          VITE_APPS_SCRIPT_URL: ${{ secrets.APPS_SCRIPT_URL_DEV }}
          VITE_APPS_SCRIPT_API_KEY: ${{ secrets.APPS_SCRIPT_API_KEY_DEV }}
      
      - name: Deploy to Firebase
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: ${{ secrets.GITHUB_TOKEN }}
          firebaseServiceAccount: ${{ secrets.FIREBASE_SERVICE_ACCOUNT_DEV }}
          projectId: tours-calendario-dev
          channelId: live

  deploy-staging:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build:staging
        env:
          VITE_FIREBASE_API_KEY: ${{ secrets.FIREBASE_API_KEY_STAGING }}
          VITE_FIREBASE_PROJECT_ID: tours-calendario-staging
          VITE_APPS_SCRIPT_URL: ${{ secrets.APPS_SCRIPT_URL_STAGING }}
          VITE_APPS_SCRIPT_API_KEY: ${{ secrets.APPS_SCRIPT_API_KEY_STAGING }}
      
      - name: Deploy to Firebase
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: ${{ secrets.GITHUB_TOKEN }}
          firebaseServiceAccount: ${{ secrets.FIREBASE_SERVICE_ACCOUNT_STAGING }}
          projectId: tours-calendario-staging
          channelId: live

  deploy-prod:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm run test:all
      
      - name: Build
        run: npm run build:prod
        env:
          VITE_FIREBASE_API_KEY: ${{ secrets.FIREBASE_API_KEY_PROD }}
          VITE_FIREBASE_PROJECT_ID: tours-calendario-prod
          VITE_APPS_SCRIPT_URL: ${{ secrets.APPS_SCRIPT_URL_PROD }}
          VITE_APPS_SCRIPT_API_KEY: ${{ secrets.APPS_SCRIPT_API_KEY_PROD }}
      
      - name: Deploy to Firebase
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: ${{ secrets.GITHUB_TOKEN }}
          firebaseServiceAccount: ${{ secrets.FIREBASE_SERVICE_ACCOUNT_PROD }}
          projectId: tours-calendario-prod
          channelId: live
```

---

## 9. Environment Validation

### 9.1 Health Check Endpoint

**`functions/src/healthCheck.js`**
```javascript
exports.healthCheck = functions.https.onRequest((req, res) => {
  const config = require('./config');
  
  res.json({
    status: 'ok',
    environment: config.environment,
    timestamp: new Date().toISOString(),
    services: {
      appsScript: !!config.appsScript.url,
      calendar: !!config.calendar.id
    }
  });
});
```

### 9.2 Validation Script

**`scripts/validate-env.js`**
```javascript
#!/usr/bin/env node

const requiredVars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_APPS_SCRIPT_URL',
  'VITE_APPS_SCRIPT_API_KEY'
];

const missing = requiredVars.filter(v => !process.env[v]);

if (missing.length > 0) {
  console.error('❌ Missing environment variables:');
  missing.forEach(v => console.error(`  - ${v}`));
  process.exit(1);
}

console.log('✅ All required environment variables are set');
```

---

## 10. Checklist Setup

### Development
- [ ] Crear Firebase project `tours-calendario-dev`
- [ ] Habilitar Auth, Firestore, Functions, Hosting
- [ ] Crear Apps Script project dev
- [ ] Configurar Script Properties dev
- [ ] Deploy Apps Script dev
- [ ] Copiar deployment URL a `.env.development`
- [ ] Generar API key dev
- [ ] Deploy Firestore rules permisivas
- [ ] Test emulators locally

### Staging
- [ ] Crear Firebase project `tours-calendario-staging`
- [ ] Habilitar servicios
- [ ] Crear Apps Script project staging
- [ ] Configurar Script Properties staging
- [ ] Deploy Apps Script staging
- [ ] Copiar deployment URL a `.env.staging`
- [ ] Generar API key staging
- [ ] Deploy Firestore rules producción
- [ ] Configurar GitHub Environment "staging"
- [ ] Test deploy desde PR

### Production
- [ ] Crear Firebase project `tours-calendario-prod`
- [ ] Habilitar servicios
- [ ] Crear Apps Script project prod
- [ ] Configurar Script Properties prod
- [ ] Deploy Apps Script prod
- [ ] Copiar deployment URL a `.env.production`
- [ ] Generar API key prod (rotar cada 90 días)
- [ ] Deploy Firestore rules producción
- [ ] Configurar GitHub Environment "production" con approval
- [ ] Setup backups automáticos
- [ ] Configurar alerting

---

**Versión:** 1.0  
**Última actualización:** 2025-10-03
