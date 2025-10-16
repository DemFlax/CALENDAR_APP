# User Stories - Vendor Costs Module
## Madrid Tours

**Versión:** 1.0  
**Fecha:** 2025-10-15  
**Proyecto:** calendar-app-tours

---

## Épica 1: Gestión de Vendors (Manager)

### US-VC-001: Crear Vendor

**Como** Manager  
**Quiero** crear un nuevo vendor (restaurante/bar)  
**Para** tenerlo disponible en el dropdown del formulario de vendor costs

#### Criterios de Aceptación

1. ✅ El formulario solicita: nombre (requerido), CIF, dirección, email
2. ✅ Valida nombre único (sin duplicados)
3. ✅ CIF valida formato español (opcional): letra + 8 dígitos
4. ✅ Email valida formato RFC 5322 (opcional)
5. ✅ Vendor se crea con estado "activo" por defecto
6. ✅ Se asigna orden al final de la lista actual
7. ✅ Confirmación visual "Vendor creado correctamente"

#### Gherkin

```gherkin
Scenario: Crear vendor con datos válidos
  Given estoy autenticado como Manager
  And accedo a la sección "Vendors"
  When hago clic en "Nuevo Vendor"
  And relleno el formulario:
    | Campo      | Valor               |
    | Nombre     | La Revolcona        |
    | CIF        | B12345678           |
    | Dirección  | C/ Mayor 10, Madrid |
    | Email      | info@revolcona.com  |
  And hago clic en "Guardar"
  Then veo el mensaje "Vendor creado correctamente"
  And el vendor aparece en la lista con estado "activo"
  And el vendor está disponible en el dropdown de vendor costs

Scenario: Error al crear vendor con nombre duplicado
  Given existe un vendor con nombre "La Revolcona"
  When intento crear un nuevo vendor con nombre "La Revolcona"
  Then veo el error "El nombre del vendor ya existe"
  And el vendor no se crea
```

**Prioridad:** Alta  
**Estimación:** 2 puntos  
**Dependencias:** Ninguna

---

### US-VC-002: Editar Vendor

**Como** Manager  
**Quiero** editar los datos de un vendor existente  
**Para** mantener actualizada la información de contacto

#### Criterios de Aceptación

1. ✅ Puedo editar todos los campos: nombre, CIF, dirección, email
2. ✅ Valida nombre único (excluyendo el vendor actual)
3. ✅ Actualiza campo `updatedAt` timestamp
4. ✅ Vendor costs históricos mantienen nombre original
5. ✅ Confirmación visual "Vendor actualizado correctamente"

#### Gherkin

```gherkin
Scenario: Editar email de vendor
  Given existe vendor "La Revolcona" con email "old@revolcona.com"
  When edito el vendor y cambio email a "new@revolcona.com"
  And guardo cambios
  Then el vendor tiene email "new@revolcona.com"
  And veo confirmación "Vendor actualizado correctamente"

Scenario: No puedo cambiar nombre a uno duplicado
  Given existen vendors "La Revolcona" y "El Escarpín"
  When edito "La Revolcona" y cambio nombre a "El Escarpín"
  Then veo error "El nombre del vendor ya existe"
  And el cambio no se guarda
```

**Prioridad:** Media  
**Estimación:** 1 punto

---

### US-VC-003: Desactivar Vendor (Soft Delete)

**Como** Manager  
**Quiero** desactivar un vendor que ya no usamos  
**Para** que no aparezca en el dropdown pero mantenga el historial

#### Criterios de Aceptación

1. ✅ Botón "Desactivar" en fila del vendor
2. ✅ Modal confirmación: "¿Desactivar [Nombre Vendor]?"
3. ✅ Cambia estado a "inactivo" (no elimina físicamente)
4. ✅ Vendor costs históricos se mantienen visibles
5. ✅ Vendor no aparece en dropdown formulario vendor costs
6. ✅ Puedo reactivar el vendor si cambio de decisión

#### Gherkin

```gherkin
Scenario: Desactivar vendor con historial
  Given existe vendor "La Revolcona" con 10 vendor costs registrados
  When hago clic en "Desactivar" en la fila del vendor
  And confirmo en el modal
  Then el vendor cambia estado a "inactivo"
  And no aparece en el dropdown del formulario vendor costs
  But los 10 vendor costs históricos siguen visibles
  And puedo ver el vendor en filtro "Inactivos"

Scenario: Reactivar vendor
  Given existe vendor "La Revolcona" con estado "inactivo"
  When hago clic en "Reactivar"
  Then el vendor cambia estado a "activo"
  And aparece nuevamente en el dropdown vendor costs
```

**Prioridad:** Media  
**Estimación:** 2 puntos

---

### US-VC-004: Reordenar Vendors con Drag & Drop

**Como** Manager  
**Quiero** reordenar vendors arrastrándolos  
**Para** que los más usados aparezcan primero en el dropdown

#### Criterios de Aceptación

1. ✅ Lista vendors con icono "≡" para arrastrar
2. ✅ Puedo arrastrar y soltar en nueva posición
3. ✅ Actualización visual inmediata
4. ✅ Guarda nuevo orden en Firestore (batch update campo `orden`)
5. ✅ Dropdown formulario vendor costs refleja nuevo orden
6. ✅ Solo vendors activos son reordenables

#### Gherkin

```gherkin
Scenario: Reordenar vendors
  Given tengo vendors en orden:
    | Posición | Nombre         |
    | 1        | El Escarpín    |
    | 2        | La Revolcona   |
    | 3        | Casa Ciriaco   |
  When arrastro "Casa Ciriaco" a posición 1
  Then el orden es:
    | Posición | Nombre         |
    | 1        | Casa Ciriaco   |
    | 2        | El Escarpín    |
    | 3        | La Revolcona   |
  And el dropdown vendor costs muestra el nuevo orden
```

**Prioridad:** Media  
**Estimación:** 3 puntos

---

## Épica 2: Registro Vendor Costs (Guía)

### US-VC-005: Ver Formulario Vendor Costs en Tour Details

**Como** Guía  
**Quiero** ver un formulario de vendor costs en la página del tour asignado  
**Para** registrar los gastos inmediatamente después del tour

#### Criterios de Aceptación

1. ✅ Sección "Vendor Costs" aparece debajo de cards guests
2. ✅ Sección colapsable (collapsed por defecto)
3. ✅ Solo visible si shift.estado === "ASIGNADO" y shift.guideId === mi ID
4. ✅ Campos prellenados automáticamente: fecha, slot, descripción tour
5. ✅ Descripción tour se obtiene de Calendar API
6. ✅ Si ya existe vendor cost para este shift → muestra resumen (no formulario)

#### Gherkin

```gherkin
Scenario: Ver formulario en tour asignado
  Given soy guía autenticado
  And tengo shift "2025-10-15_T1" ASIGNADO a mí
  And accedo a /tour-details?shiftId=2025-10-15_T1
  When expando la sección "Vendor Costs"
  Then veo el formulario con:
    | Campo              | Valor               |
    | Fecha              | 15/10/2025 (readonly) |
    | Slot               | T1 (readonly)        |
    | Descripción Tour   | Tapas Tour Centro    |
    | Número Pax         | (vacío, editable)    |
    | Vendors            | (vacío, dinámico)    |

Scenario: No ver formulario en tour no asignado
  Given existe shift "2025-10-15_T1" ASIGNADO a otro guía
  When accedo a /tour-details?shiftId=2025-10-15_T1
  Then la sección "Vendor Costs" no aparece

Scenario: Ver resumen si ya registré vendor costs
  Given ya registré vendor costs para shift "2025-10-15_T1"
  When accedo a /tour-details?shiftId=2025-10-15_T1
  Then veo resumen:
    - "Vendor costs registrados: 8 pax, 3 vendors, Total: 155.50€"
    - No veo formulario
```

**Prioridad:** Alta  
**Estimación:** 3 puntos

---

### US-VC-006: Añadir Vendors y Subir Tickets

**Como** Guía  
**Quiero** añadir múltiples vendors con sus importes y tickets  
**Para** registrar todos los gastos del tour en un solo envío

#### Criterios de Aceptación

1. ✅ Botón "+ Añadir Vendor" para agregar filas dinámicamente
2. ✅ Cada fila tiene: dropdown vendor, input importe €, botón upload foto
3. ✅ Dropdown muestra solo vendors activos ordenados por campo `orden`
4. ✅ Input importe valida: decimal 2 decimales, rango 0.01-999.99
5. ✅ Upload foto: acepta jpg/png/heic, máx 5MB, preview thumbnail
6. ✅ Comprime imagen si >2MB (quality 0.8) antes de enviar
7. ✅ No permite duplicar vendors en mismo registro
8. ✅ Botón "Eliminar" para quitar fila vendor

#### Gherkin

```gherkin
Scenario: Añadir múltiples vendors
  Given estoy en formulario vendor costs
  When hago clic en "+ Añadir Vendor"
  And selecciono vendor "El Escarpín"
  And ingreso importe "45.50"
  And subo foto ticket "ticket1.jpg"
  And hago clic en "+ Añadir Vendor" nuevamente
  And selecciono vendor "Casa Ciriaco"
  And ingreso importe "60.00"
  And subo foto ticket "ticket2.jpg"
  Then veo 2 filas de vendors con preview fotos
  And el total muestra "105.50€"

Scenario: Error al duplicar vendor
  Given tengo fila con vendor "El Escarpín"
  When añado nueva fila e intento seleccionar "El Escarpín" nuevamente
  Then el vendor está disabled en el segundo dropdown
  Or veo tooltip "Vendor ya seleccionado"

Scenario: Comprimir imagen grande
  Given subo foto "ticket.jpg" de 4MB
  When el sistema procesa la imagen
  Then la imagen se comprime a ~1.6MB (quality 0.8)
  And veo preview comprimido
  And puedo enviar sin error de tamaño
```

**Prioridad:** Alta  
**Estimación:** 5 puntos

---

### US-VC-007: Enviar Vendor Costs con Validaciones

**Como** Guía  
**Quiero** enviar el formulario con validaciones claras  
**Para** asegurarme de que registro los datos correctamente

#### Criterios de Aceptación

1. ✅ Validación: número pax requerido (1-20)
2. ✅ Validación: al menos 1 vendor con importe > 0
3. ✅ Validación: cada vendor tiene foto ticket
4. ✅ Validación: fecha tour <= hoy (no futuro)
5. ✅ Loader durante upload con mensaje "Subiendo tickets..."
6. ✅ Backend valida: shift asignado, no duplicado, guía autorizado
7. ✅ Éxito: mensaje "Vendor costs registrados correctamente"
8. ✅ Error: mensaje específico según tipo error

#### Gherkin

```gherkin
Scenario: Envío exitoso con validaciones OK
  Given completo formulario:
    | Campo    | Valor                         |
    | Num Pax  | 8                             |
    | Vendor 1 | El Escarpín - 45.50€ + ticket |
    | Vendor 2 | Casa Ciriaco - 60.00€ + ticket|
  When hago clic en "Enviar"
  Then veo loader "Subiendo tickets..."
  And el sistema valida shift asignado a mí
  And sube 2 tickets a Drive
  And calcula salario: 8 pax = 90.00€
  And crea documento Firestore
  And escribe en Sheet Madrid
  And veo confirmación "Vendor costs registrados correctamente"
  And el formulario se cierra

Scenario: Error sin número pax
  Given no ingreso número pax
  When intento enviar
  Then veo error "Número de pax es requerido"
  And el formulario no se envía

Scenario: Error vendor sin ticket
  Given añado vendor "El Escarpín" con importe "45.50€"
  But no subo ticket
  When intento enviar
  Then veo error "Todos los vendors deben tener ticket"

Scenario: Error backend - shift no asignado
  Given mi shift cambió a estado "LIBRE" mientras rellenaba formulario
  When envío el formulario
  Then veo error "Este turno ya no está asignado a ti"
  And el formulario no se envía
```

**Prioridad:** Alta  
**Estimación:** 5 puntos  
**Dependencias:** US-VC-006

---

### US-VC-008: Ver Cálculo Automático Salario

**Como** Guía  
**Quiero** ver mi salario calculado automáticamente según las pax  
**Para** conocer mi pago antes de enviar el formulario

#### Criterios de Aceptación

1. ✅ Campo "Salario calculado" en formulario (readonly)
2. ✅ Se actualiza en tiempo real al cambiar número pax
3. ✅ Usa tabla salarial de Firestore config/salary_table
4. ✅ Muestra formato: "90.00€ (8 pax)"
5. ✅ Si no hay pax ingresado, muestra "-"

#### Gherkin

```gherkin
Scenario: Cálculo automático salario
  Given estoy en formulario vendor costs
  When ingreso número pax "8"
  Then veo "Salario calculado: 90.00€ (8 pax)" inmediatamente
  When cambio pax a "12"
  Then veo "Salario calculado: 110.00€ (12 pax)"

Scenario: Tabla salarial correcta
  Given la tabla salarial define:
    | Pax | Salario |
    | 1-4 | 84.70€  |
    | 5   | 90.75€  |
    | 8   | 108.90€ |
    | 12+ | 133.10€ |
  When ingreso diferentes pax
  Then el cálculo coincide con la tabla
```

**Prioridad:** Alta  
**Estimación:** 2 puntos

---

## Épica 3: Edición y Auditoría (Manager)

### US-VC-009: Ver Todos los Vendor Costs

**Como** Manager  
**Quiero** ver una tabla con todos los vendor costs registrados  
**Para** auditar y supervisar los gastos de los guías

#### Criterios de Aceptación

1. ✅ Dashboard manager, nueva sección "Vendor Costs"
2. ✅ Tabla con columnas: Fecha, Slot, Guía, Pax, Total Vendors, Salario, Editado, Acciones
3. ✅ Filtros: por guía, por fecha (rango), por vendor
4. ✅ Ordenación por columna (fecha desc por defecto)
5. ✅ Paginación: 20 registros por página
6. ✅ Badge "Editado" si editedByManager === true
7. ✅ Click en fila → expande detalle vendors con links tickets Drive

#### Gherkin

```gherkin
Scenario: Ver todos vendor costs
  Given existen 50 vendor costs de 5 guías
  When accedo a "Vendor Costs" en dashboard manager
  Then veo tabla con 20 registros (página 1)
  And columnas: Fecha, Slot, Guía, Pax, Total, Salario, Editado
  And los registros están ordenados por fecha descendente

Scenario: Filtrar por guía
  Given hay vendor costs de Juan (10), María (8), Pedro (5)
  When selecciono filtro guía "Juan Pérez"
  Then veo solo 10 registros de Juan
  And los de María y Pedro no aparecen

Scenario: Ver detalle vendor cost
  Given hay vendor cost con 3 vendors
  When hago clic en la fila
  Then se expande mostrando:
    - El Escarpín: 45.50€ - [Ver ticket Drive]
    - Casa Ciriaco: 60.00€ - [Ver ticket Drive]
    - La Revolcona: 50.00€ - [Ver ticket Drive]
  And puedo hacer clic en links Drive para ver tickets
```

**Prioridad:** Alta  
**Estimación:** 5 puntos

---

### US-VC-010: Editar Vendor Cost como Manager

**Como** Manager  
**Quiero** editar cualquier vendor cost registrado  
**Para** corregir errores de los guías

#### Criterios de Aceptación

1. ✅ Botón "Editar" en fila vendor cost (sin límite temporal)
2. ✅ Modal con formulario prellenado
3. ✅ Puedo editar: número pax, vendors (añadir/eliminar/cambiar importes)
4. ✅ Si cambio pax → recalcula salario automáticamente
5. ✅ Puedo reemplazar fotos tickets en Drive
6. ✅ Al guardar: marca editedByManager = true, añade entrada editHistory
7. ✅ Sheet se actualiza con fila adicional "(EDITADO)"

#### Gherkin

```gherkin
Scenario: Editar número pax y recalcular salario
  Given existe vendor cost:
    | Guía  | Pax | Salario  |
    | Juan  | 8   | 108.90€  |
  When hago clic en "Editar"
  And cambio pax de "8" a "10"
  Then veo salario recalculado automáticamente: "121.00€"
  When guardo cambios
  Then el vendor cost tiene:
    - numPax: 10
    - salarioCalculado: 121.00€
    - editedByManager: true
  And editHistory registra:
    - editedBy: "madrid@spainfoodsherpas.com"
    - changes: { numPax: { old: 8, new: 10 } }

Scenario: Añadir vendor adicional
  Given vendor cost tiene 2 vendors
  When edito y añado vendor "La Revolcona: 30.00€ + ticket"
  And guardo
  Then el vendor cost tiene 3 vendors
  And totalVendors = suma de 3 importes
  And Sheet tiene nueva fila con nota "(EDITADO)"

Scenario: Ver historial de ediciones
  Given vendor cost editado 2 veces
  When expando detalle
  Then veo sección "Historial ediciones":
    - 10/10/2025 12:30 - Manager - Cambió pax 8→10
    - 12/10/2025 09:15 - Manager - Añadió vendor La Revolcona
```

**Prioridad:** Alta  
**Estimación:** 5 puntos

---

### US-VC-011: Configurar Tabla Salarial

**Como** Manager  
**Quiero** editar la tabla salarial  
**Para** ajustar pagos según nuevas políticas

#### Criterios de Aceptación

1. ✅ Dashboard manager, sección "Configuración" → "Tabla Salarial"
2. ✅ Tabla editable con columnas: Min Pax, Max Pax, Pago Neto, Pago Bruto (IVA 21%)
3. ✅ Puedo añadir/eliminar/editar rangos
4. ✅ Validación: rangos no se solapan
5. ✅ Pago Bruto calcula automáticamente: Neto × 1.21
6. ✅ Modal confirmación: "¿Guardar cambios? No afecta vendor costs previos"
7. ✅ Cambios solo aplican a vendor costs nuevos

#### Gherkin

```gherkin
Scenario: Editar rango salarial
  Given rango actual: 8 pax = 90.00€ neto (108.90€ bruto)
  When edito rango a: 8 pax = 95.00€ neto
  Then veo Pago Bruto calculado: "114.95€"
  When guardo cambios
  And confirmo en modal
  Then nuevos vendor costs con 8 pax usan 114.95€
  But vendor costs previos mantienen 108.90€

Scenario: Añadir nuevo rango
  Given no hay rango para 13+ pax
  When añado rango:
    | Min Pax | Max Pax | Pago Neto |
    | 13      | 20      | 120       |
  Then el sistema calcula Pago Bruto: "145.20€"
  And el rango se añade a la tabla
```

**Prioridad:** Media  
**Estimación:** 3 puntos

---

## Épica 4: Reportes Vendors

### US-VC-012: Generar Reporte Vendor Automático Mensual

**Como** Manager  
**Quiero** que se generen reportes de vendors automáticamente cada mes  
**Para** tener listos los documentos para auditoría contable

#### Criterios de Aceptación

1. ✅ Cloud Function ejecuta 1º día mes 02:00 UTC
2. ✅ Genera PDF por cada vendor activo con vendor costs del mes anterior
3. ✅ Formato PDF: Vendor, Mes, Tabla (Fecha|Guía|Tour|Pax|Importe), Total, Link tickets
4. ✅ Sube PDF a Drive: "Reportes Vendors/2025-10/[Vendor Name].pdf"
5. ✅ Si vendor tiene email → envía PDF adjunto
6. ✅ Log en Firestore vendor_reports (vendorId, month, totalImporte, pdfDriveId)

#### Gherkin

```gherkin
Scenario: Generación automática exitosa
  Given es 1 de Noviembre 2025 a las 02:00 UTC
  And hay 5 vendors activos con vendor costs en Octubre
  When ejecuta Cloud Function generateMonthlyVendorReports
  Then genera 5 PDFs:
    - Reportes Vendors/2025-10/El_Escarpin.pdf
    - Reportes Vendors/2025-10/Casa_Ciriaco.pdf
    - ...
  And cada PDF contiene:
    - Nombre vendor
    - Mes: Octubre 2025
    - Tabla con tours del mes
    - Total importe
  And envía email a vendors con email configurado
  And crea 5 docs en vendor_reports con pdfDriveId

Scenario: Vendor sin vendor costs en mes
  Given vendor "La Revolcona" no tuvo vendor costs en Octubre
  When ejecuta generación automática
  Then no genera PDF para La Revolcona
  And no envía email
  And no crea doc vendor_reports para ese vendor
```

**Prioridad:** Alta  
**Estimación:** 5 puntos

---

### US-VC-013: Generar Reporte Vendor Manual On-Demand

**Como** Manager  
**Quiero** generar un reporte de vendor para un rango de fechas específico  
**Para** liquidar adeudos si rompemos relación a mitad de mes

#### Criterios de Aceptación

1. ✅ Dashboard manager, sección "Vendors" → botón "Generar Reporte" por vendor
2. ✅ Modal: seleccionar fecha inicio y fecha fin (date pickers)
3. ✅ Validación: fecha inicio < fecha fin, máx 1 año rango
4. ✅ Genera PDF mismo formato que reporte auto (pero rango custom)
5. ✅ Descarga PDF directo navegador (no envía email)
6. ✅ Log en vendor_reports con generatedBy: "MANUAL"

#### Gherkin

```gherkin
Scenario: Generar reporte manual exitoso
  Given soy manager en dashboard "Vendors"
  When hago clic en "Generar Reporte" para "El Escarpín"
  And selecciono:
    | Fecha inicio | 01/10/2025 |
    | Fecha fin    | 15/10/2025 |
  And hago clic en "Generar"
  Then se genera PDF con vendor costs del 1 al 15 Oct
  And el PDF se descarga en mi navegador
  And se crea doc vendor_reports:
    - generatedBy: "MANUAL"
    - generatedByUser: "madrid@spainfoodsherpas.com"
    - dateRange: { start: "2025-10-01", end: "2025-10-15" }

Scenario: Error rango fechas inválido
  When selecciono fecha inicio "15/10/2025"
  And fecha fin "10/10/2025" (anterior a inicio)
  And intento generar
  Then veo error "Fecha fin debe ser posterior a fecha inicio"
  And el reporte no se genera
```

**Prioridad:** Alta  
**Estimación:** 4 puntos

---

## Épica 5: Facturas Pro-Forma Guías

### US-VC-014: Recibir Notificación Factura Pro-Forma Generada

**Como** Guía  
**Quiero** recibir un email cuando mi factura mensual esté lista  
**Para** revisarla y aprobarla

#### Criterios de Aceptación

1. ✅ Cloud Function ejecuta último día mes 23:00 UTC
2. ✅ Genera factura pro-forma por guía con vendor costs en el mes
3. ✅ Envía email con: mes, total a facturar, número tours, link dashboard
4. ✅ Factura estado: PENDING_APPROVAL
5. ✅ Si guía no tiene vendor costs en mes → no genera factura

#### Gherkin

```gherkin
Scenario: Recibir notificación factura Octubre
  Given soy guía Juan Pérez
  And registré vendor costs en 12 tours durante Octubre
  When ejecuta Cloud Function el 31 Oct a las 23:00 UTC
  Then se crea factura pro-forma:
    - invoiceId: "PROFORMA_juan123_2025-10"
    - totalSalary: 1320.00€ (12 tours)
    - status: "PENDING_APPROVAL"
  And recibo email:
    Asunto: Factura Octubre 2025 lista para revisión
    Cuerpo:
      - Total: 1320.00€ (12 tours)
      - Link: https://calendar-app-tours.web.app/my-invoices
  And puedo hacer clic en link para revisar

Scenario: No generar factura si no hay tours
  Given soy guía Pedro López
  And no registré vendor costs en Octubre
  When ejecuta generación facturas
  Then no se crea factura para mí
  And no recibo email
```

**Prioridad:** Alta  
**Estimación:** 4 puntos

---

### US-VC-015: Ver y Revisar Factura Pro-Forma

**Como** Guía  
**Quiero** ver el detalle de mi factura pro-forma  
**Para** verificar que tours y salarios sean correctos

#### Criterios de Aceptación

1. ✅ Nueva sección "Mis Facturas" en dashboard guía
2. ✅ Lista facturas: Mes, Total, Estado, Acciones
3. ✅ Click "Ver detalle" → modal con:
   - Datos guía (nombre, email, DNI)
   - Tabla tours: Fecha, Slot, Descripción, Pax, Salario
   - Total mes (IVA incluido 21%)
4. ✅ Botón "Reportar error" → envía email manager con detalles
5. ✅ Botón "Aprobar factura" → pasa a US-VC-016

#### Gherkin

```gherkin
Scenario: Ver detalle factura pendiente
  Given tengo factura pro-forma Octubre en estado PENDING_APPROVAL
  When accedo a "Mis Facturas"
  And hago clic en "Ver detalle"
  Then veo modal con:
    - Título: "FACTURA PRO-FORMA - Octubre 2025"
    - Estado: "Pendiente de aprobación"
    - Mis datos: Juan Pérez, juan@example.com, 12345678A
    - Tabla con 12 tours
    - Total: 1320.00€
  And tengo botones "Reportar error" y "Aprobar factura"

Scenario: Reportar error en factura
  Given veo detalle factura con error (salario incorrecto)
  When hago clic en "Reportar error"
  And escribo: "Tour del 15/10 debería ser 10 pax, no 8"
  And envío
  Then se envía email a madrid@spainfoodsherpas.com
  And factura cambia estado a "ERROR_REPORTED"
  And veo mensaje "Error reportado, el manager lo revisará"
```

**Prioridad:** Alta  
**Estimación:** 4 puntos

---

### US-VC-016: Aprobar Factura con Número Personalizado

**Como** Guía  
**Quiero** asignar mi número de factura personalizado  
**Para** mantener mi serie de facturación propia

#### Criterios de Aceptación

1. ✅ Modal aprobación muestra opciones:
   - Opción A: Input manual "Escribe tu número de factura"
   - Opción B: Botón "Autogenerar número" (si no usó manual antes)
2. ✅ Si elige manual primera vez → guide.invoiceMode = "MANUAL" permanente
3. ✅ Si elige manual → valida formato y unicidad
4. ✅ Si usa autogenerar → genera "SFS-XXX/YY", incrementa lastInvoiceNumber
5. ✅ Guarda factura con invoiceNumber, status = "APPROVED"
6. ✅ Genera PDF final y envía email confirmación

#### Gherkin

```gherkin
Scenario: Aprobar con número manual (primera vez)
  Given veo modal aprobación factura
  And mi guide.invoiceMode === null (primera factura)
  When selecciono "Número manual"
  And escribo "2025/001"
  And hago clic en "Aprobar"
  Then se valida número único
  And se actualiza:
    - guide.invoiceMode = "MANUAL"
    - invoice.status = "APPROVED"
    - invoice.invoiceNumber = "2025/001"
  And se genera PDF con número "2025/001"
  And recibo email confirmación con PDF adjunto

Scenario: Usar autogeneración
  Given mi guide.invoiceMode === null
  When hago clic en "Autogenerar número"
  Then se genera "SFS-001/25" automáticamente
  And se actualiza:
    - guide.invoiceMode = "AUTO"
    - guide.lastInvoiceNumber = 1
    - invoice.invoiceNumber = "SFS-001/25"
  And próxima factura será "SFS-002/25"

Scenario: No poder autogenerar después de usar manual
  Given anteriormente usé número manual "2025/001"
  And mi guide.invoiceMode === "MANUAL"
  When accedo a aprobación nueva factura
  Then botón "Autogenerar" está disabled
  And veo tooltip: "Debes usar numeración manual"
  And solo puedo ingresar número manual

Scenario: Error número duplicado
  Given ya aprobé factura con número "2025/001"
  When intento aprobar nueva factura con "2025/001"
  Then veo error "Número de factura duplicado"
  And la factura no se aprueba
```

**Prioridad:** Alta  
**Estimación:** 5 puntos  
**Dependencias:** US-VC-015

---

### US-VC-017: Ver Facturas Aprobadas con PDF

**Como** Guía  
**Quiero** ver y descargar mis facturas aprobadas  
**Para** enviarlas a la empresa cuando me lo soliciten

#### Criterios de Aceptación

1. ✅ Lista "Mis Facturas" muestra facturas APPROVED con badge verde
2. ✅ Click "Descargar PDF" → descarga factura final
3. ✅ PDF contiene:
   - Número factura (header)
   - Fecha aprobación
   - Datos emisor (guía) y receptor (Spain Food Sherpas)
   - Tabla tours
   - Base imponible, IVA 21%, Total
4. ✅ Historial facturas descargables ilimitado

#### Gherkin

```gherkin
Scenario: Descargar factura aprobada
  Given tengo factura "SFS-001/25" en estado APPROVED
  When accedo a "Mis Facturas"
  And hago clic en "Descargar PDF"
  Then se descarga PDF con:
    - Header: "FACTURA N.º SFS-001/25"
    - Fecha: 01/11/2025
    - Emisor: Juan Pérez (mis datos)
    - Receptor: Spain Food Sherpas S.L.
    - Concepto: Servicios guía tours Octubre 2025
    - Tabla tours
    - Base: 1090.91€, IVA: 229.09€, Total: 1320.00€

Scenario: Ver historial facturas
  Given tengo 6 facturas aprobadas (últimos 6 meses)
  When accedo a "Mis Facturas"
  Then veo lista completa:
    | Mes    | Número      | Total     | Estado   | PDF       |
    | Oct-25 | SFS-006/25  | 1320.00€  | Aprobada | Descargar |
    | Sep-25 | SFS-005/25  | 1100.00€  | Aprobada | Descargar |
    | ...    | ...         | ...       | ...      | ...       |
  And puedo descargar cualquier PDF
```

**Prioridad:** Media  
**Estimación:** 2 puntos

---

## Resumen de Estimaciones

| Épica | User Stories | Puntos Totales |
|-------|--------------|----------------|
| Gestión Vendors | US-VC-001 a US-VC-004 | 8 |
| Registro Vendor Costs | US-VC-005 a US-VC-008 | 15 |
| Edición y Auditoría | US-VC-009 a US-VC-011 | 13 |
| Reportes Vendors | US-VC-012 a US-VC-013 | 9 |
| Facturas Pro-Forma | US-VC-014 a US-VC-017 | 15 |
| **TOTAL** | 17 historias | **60 puntos** |

**Conversión:** 1 punto ≈ 1 hora → **60 horas totales**

---

## Priorización MoSCoW

### Must Have (MVP)
- ✅ US-VC-001, 002, 003 (CRUD Vendors básico)
- ✅ US-VC-005, 006, 007, 008 (Registro vendor costs guías)
- ✅ US-VC-009, 010 (Auditoría manager)
- ✅ US-VC-014, 015, 016 (Facturas pro-forma core)

### Should Have
- ✅ US-VC-004 (Drag & drop vendors)
- ✅ US-VC-011 (Config tabla salarial)
- ✅ US-VC-012, 013 (Reportes vendors)
- ✅ US-VC-017 (Historial facturas)

### Could Have
- Notificaciones push facturas pendientes
- Exportación masiva Excel

### Won't Have (Fase 2)
- OCR validación tickets
- Multi-ciudad
- Integración contabilidad externa

---

**Fin del documento**