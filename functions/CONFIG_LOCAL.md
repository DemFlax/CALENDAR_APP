# 🔧 Configuración Local para Firebase Admin

Este documento explica cómo configurar las credenciales de Firebase Admin para desarrollo local.

---

## 📋 Prerequisitos

Tu archivo `serviceAccountKey.json` debe estar en:
```
C:\SHERPAS_CALENDAR\Kyes\serviceAccountKey.json
```

> ⚠️ **IMPORTANTE:** Este archivo **NO** debe estar dentro del repositorio por seguridad.

---

## 🚀 Configuración (Windows)

### Opción 1: Variable de Entorno Permanente (RECOMENDADO)

#### PowerShell:
```powershell
# Establecer variable permanente
[System.Environment]::SetEnvironmentVariable('GOOGLE_APPLICATION_CREDENTIALS', 'C:\SHERPAS_CALENDAR\Kyes\serviceAccountKey.json', 'User')

# Verificar
$env:GOOGLE_APPLICATION_CREDENTIALS
```

#### CMD:
```cmd
# Establecer variable permanente
setx GOOGLE_APPLICATION_CREDENTIALS "C:\SHERPAS_CALENDAR\Kyes\serviceAccountKey.json"

# Cerrar y reabrir CMD, luego verificar:
echo %GOOGLE_APPLICATION_CREDENTIALS%
```

**Después de configurar, cierra y reabre tu terminal.**

---

### Opción 2: Variable de Sesión (Temporal)

Si prefieres configurar la variable solo para la sesión actual:

#### PowerShell:
```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\SHERPAS_CALENDAR\Kyes\serviceAccountKey.json"
```

#### CMD:
```cmd
set GOOGLE_APPLICATION_CREDENTIALS=C:\SHERPAS_CALENDAR\Kyes\serviceAccountKey.json
```

> 🔄 Deberás ejecutar este comando cada vez que abras una nueva terminal.

---

## ✅ Verificar Configuración

Ejecuta tu aplicación localmente y deberías ver:

```
✅ Firebase Admin inicializado (Local - serviceAccountKey.json)
```

---

## 🌐 Producción (Cloud Functions)

En producción, **no necesitas configurar nada**. Cloud Functions usa automáticamente las credenciales del proyecto.

---

## 🐛 Troubleshooting

### Error: "No se encontraron credenciales"

**Solución:**
1. Verifica que el archivo existe en `C:\SHERPAS_CALENDAR\Kyes\serviceAccountKey.json`
2. Asegúrate de haber configurado la variable de entorno
3. Cierra y reabre tu terminal/IDE después de configurar la variable

### Error: "GOOGLE_APPLICATION_CREDENTIALS apunta a archivo inexistente"

**Solución:**
- Verifica la ruta exacta del archivo
- Usa barras invertidas dobles en Windows: `C:\\SHERPAS_CALENDAR\\...`
- O usa barras normales: `C:/SHERPAS_CALENDAR/...`

---

## 🔒 Seguridad

✅ El archivo `.gitignore` ya está configurado para **NO** subir:
- `serviceAccountKey.json`
- `*service-account*.json`
- `functions/serviceAccountKey.json`

**Nunca subas este archivo a Git.**
