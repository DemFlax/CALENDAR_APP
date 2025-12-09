const CALENDAR_ID = 'c_61981c641dc3c970e63f1713ccc2daa49d8fe8962b6ed9f2669c4554496c7bdd@group.calendar.google.com';
// Last updated: 2025-12-09T10:58:00

const SLOT_TIMES = {
  'MAÑANA': '12:00',
  'T1': '17:15',
  'T2': '18:15',
  'T3': '19:15'
};

const VENDORS_SHEET_ID = '1Qre_IpEMsvjfzxLpOXsAPbHppEOxTIpi5MhofoUzFks';
const ROOT_DRIVE_FOLDER_ID = '1CnDf9MdCqr9bzeyIfjOvfq3bAWckVZ6Y';
const INVOICES_FOLDER_ID = '1NKpwoOvBPlXKI8dQCI9GlN9hYUrTMRP3';

function doGet(e) {
  Logger.log('=== doGet triggered ===');
  Logger.log('Parameters: ' + JSON.stringify(e.parameter));

  const endpoint = e.parameter.endpoint;

  if (endpoint === 'addGuideToEvent') {
    return addGuideToEvent(e);
  }

  if (endpoint === 'removeGuideFromEvent') {
    return removeGuideFromEvent(e);
  }

  if (endpoint === 'getEventDetails') {
    return getEventDetails(e);
  }

  if (endpoint === 'getAssignedTours') {
    return getAssignedTours(e);
  }

  if (endpoint === 'getVendorCosts') {
    return getVendorCosts(e);
  }

  if (endpoint === 'uploadInvoice') {
    return handleUploadInvoice(e.parameter);
  }

  return validateTour(e);
}

function doPost(e) {
  try {
    Logger.log('=== doPost triggered ===');
    const data = JSON.parse(e.postData.contents);
    Logger.log(
      'Parsed data - action: ' +
      (data.action || 'none') +
      ', endpoint: ' +
      (data.endpoint || 'none')
    );

    // ============================================
    // VENDOR COSTS ENDPOINTS (OPTIMIZED)
    // ============================================
    if (data.endpoint === 'uploadSingleVendorTicket') {
      return handleUploadSingleVendorTicket(data);
    }

    if (data.endpoint === 'writeVendorCostsToSheet') {
      return handleWriteVendorCostsToSheet(data);
    }

    // Legacy endpoint (mantener por compatibilidad)
    if (data.endpoint === 'uploadVendorTickets') {
      return handleUploadVendorTickets(data);
    }

    // ============================================
    // INVOICES ENDPOINTS
    // ============================================
    if (data.action === 'uploadGuideInvoice') {
      return handleUploadGuideInvoice(data);
    }

    if (data.action === 'deleteGuideInvoice') {
      return handleDeleteGuideInvoice(data);
    }

    if (data.action === 'uploadInvoice') {
      return handleUploadInvoice(data);
    }

    return buildResponse({
      error: true,
      message:
        'Unknown endpoint/action: ' + (data.endpoint || data.action)
    });
  } catch (error) {
    Logger.log('doPost ERROR: ' + error.toString());
    Logger.log('Stack: ' + error.stack);
    return buildResponse({
      error: true,
      message: error.toString()
    });
  }
}

// ============================================
// NUEVO: UPLOAD SINGLE VENDOR TICKET (PARALELO)
// ============================================
function handleUploadSingleVendorTicket(params) {
  try {
    Logger.log('=== uploadSingleVendorTicket Request ===');

    const apiKey = params.apiKey;
    const storedKey =
      PropertiesService.getScriptProperties().getProperty('API_KEY');

    if (!apiKey || apiKey !== storedKey) {
      Logger.log('ERROR: Invalid API Key');
      return buildResponse({
        error: true,
        code: 'UNAUTHORIZED',
        message: 'Invalid API key'
      });
    }

    Logger.log('Parsing vendorData...');
    const vendorData = JSON.parse(params.vendorData);

    Logger.log('Vendor: ' + vendorData.vendorName);
    Logger.log('Month folder: ' + params.monthFolder);

    if (!vendorData.ticketBase64) {
      Logger.log('ERROR: No ticket provided');
      return buildResponse({
        error: true,
        code: 'MISSING_TICKET',
        message: 'No ticket image provided'
      });
    }

    const folderId = getOrCreateShiftFolder(
      params.shiftId,
      params.monthFolder
    );
    Logger.log('Folder ID: ' + folderId);

    const base64Data = vendorData.ticketBase64.split(',')[1];
    const mimeType = vendorData.ticketBase64.includes('png')
      ? 'image/png'
      : 'image/jpeg';
    const blob = Utilities.newBlob(
      Utilities.base64Decode(base64Data),
      mimeType,
      vendorData.vendorName + '_ticket.jpg'
    );

    const file = DriveApp.getFolderById(folderId).createFile(blob);
    Logger.log('✅ Uploaded: ' + file.getId());

    return buildResponse({
      success: true,
      vendorId: vendorData.vendorId,
      vendorName: vendorData.vendorName,
      importe: vendorData.importe,
      driveFileId: file.getId(),
      driveUrl: file.getUrl()
    });
  } catch (err) {
    Logger.log('ERROR uploadSingleVendorTicket: ' + err.toString());
    Logger.log('Stack: ' + err.stack);
    return buildResponse({
      error: true,
      code: 'UPLOAD_FAILED',
      message: err.toString()
    });
  }
}

// ============================================
// NUEVO: WRITE VENDOR COSTS TO SHEET (BATCH)
// ============================================
function handleWriteVendorCostsToSheet(params) {
  try {
    Logger.log('=== writeVendorCostsToSheet Request ===');

    const apiKey = params.apiKey;
    const storedKey =
      PropertiesService.getScriptProperties().getProperty('API_KEY');

    if (!apiKey || apiKey !== storedKey) {
      Logger.log('ERROR: Invalid API Key');
      return buildResponse({
        error: true,
        code: 'UNAUTHORIZED',
        message: 'Invalid API key'
      });
    }

    Logger.log('Parsing vendorsData...');
    const vendorsData = JSON.parse(params.vendorsData);

    Logger.log('Vendors to write: ' + vendorsData.length);

    const ss = SpreadsheetApp.openById(VENDORS_SHEET_ID);

    // Calcular nombre de pestaña (YYYY-MM)
    const dateObj = new Date(params.fecha); // params.fecha es "YYYY-MM-DD"
    // Asegurar que parsea bien (a veces Date() puede fallar con strings simples)
    // Mejor split manual para seguridad
    const parts = params.fecha.split('-');
    const sheetName = parts[0] + '-' + parts[1]; // "2025-12"

    let sheet = ss.getSheetByName(sheetName);

    // Si no existe, crear y poner cabeceras
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      // Cabeceras (mismo orden que abajo)
      const headers = [
        'Timestamp',
        'Fecha',
        'Slot',
        'Guía',
        'Pax',
        'Vendor',
        'Importe',
        'Ticket URL',
        'Feedback'
      ];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    const rows = vendorsData.map(function (vendor, idx) {
      return [
        new Date(),
        params.fecha,
        params.slot,
        params.guideName,
        params.numPax,
        vendor.vendorName,
        vendor.importe,
        vendor.driveUrl || '',
        idx === 0 ? params.postTourFeedback || '' : ''
      ];
    });

    sheet
      .getRange(sheet.getLastRow() + 1, 1, rows.length, 9)
      .setValues(rows);

    Logger.log('✅ Batch wrote ' + rows.length + ' rows to sheet ' + sheetName);

    return buildResponse({
      success: true,
      rowsWritten: rows.length
    });
  } catch (err) {
    Logger.log('ERROR writeVendorCostsToSheet: ' + err.toString());
    Logger.log('Stack: ' + err.stack);
    return buildResponse({
      error: true,
      code: 'SHEET_WRITE_FAILED',
      message: err.toString()
    });
  }
}

// ============================================
// LEGACY: UPLOAD VENDOR TICKETS (MANTENER)
// ============================================
function handleUploadVendorTickets(params) {
  try {
    Logger.log('=== uploadVendorTickets Request (LEGACY) ===');

    const apiKey = params.apiKey;
    const storedKey =
      PropertiesService.getScriptProperties().getProperty('API_KEY');

    if (!apiKey || apiKey !== storedKey) {
      Logger.log('ERROR: Invalid API Key');
      return buildResponse({
        error: true,
        code: 'UNAUTHORIZED',
        message: 'Invalid API key'
      });
    }

    Logger.log('Parsing vendorsData...');
    const vendorsData = JSON.parse(params.vendorsData);

    Logger.log('Vendors to process: ' + vendorsData.length);
    Logger.log('Month folder: ' + params.monthFolder);

    const folderId = getOrCreateShiftFolder(
      params.shiftId,
      params.monthFolder
    );
    Logger.log('Folder ID: ' + folderId);

    const uploadedVendors = [];

    vendorsData.forEach(function (vendor) {
      Logger.log('Processing vendor: ' + vendor.vendorName);

      if (!vendor.ticketBase64) {
        Logger.log('No ticket for ' + vendor.vendorName);
        uploadedVendors.push({
          vendorId: vendor.vendorId,
          driveFileId: null,
          driveUrl: null
        });
        return;
      }

      const base64Data = vendor.ticketBase64.split(',')[1];
      const mimeType = vendor.ticketBase64.includes('png')
        ? 'image/png'
        : 'image/jpeg';
      const blob = Utilities.newBlob(
        Utilities.base64Decode(base64Data),
        mimeType,
        vendor.vendorName + '_ticket.jpg'
      );

      const file = DriveApp.getFolderById(folderId).createFile(blob);
      Logger.log('Uploaded: ' + file.getId());

      uploadedVendors.push({
        vendorId: vendor.vendorId,
        driveFileId: file.getId(),
        driveUrl: file.getUrl()
      });
    });

    appendToVendorsSheet(params, vendorsData, uploadedVendors);
    Logger.log('✅ Sheet updated');

    return buildResponse({
      success: true,
      folderId: folderId,
      vendors: uploadedVendors,
      sheetAppended: true
    });
  } catch (err) {
    Logger.log('ERROR uploadVendorTickets: ' + err.toString());
    Logger.log('Stack: ' + err.stack);
    return buildResponse({
      error: true,
      code: 'UPLOAD_FAILED',
      message: err.toString()
    });
  }
}

// ============================================
// NUEVO: UPLOAD GUIDE INVOICE (VERIFACTU) 
// Carpeta por mes (YYYY-MM) dentro de INVOICES_FOLDER_ID
// Nombre: GUIDE_NORMALIZADO_YYYY-MM_FACTURA[_NUMERO].pdf
// ============================================
function handleUploadGuideInvoice(params) {
  try {
    Logger.log('=== uploadGuideInvoice Request (VERIFACTU) ===');
    Logger.log('Guide: ' + params.guideName);
    Logger.log(
      'Invoice: ' + (params.invoiceNumber || '(sin número de factura)')
    );
    Logger.log('Month: ' + params.month);

    if (!params.guideId || !params.month || !params.pdfBase64) {
      Logger.log('ERROR: Missing required parameters');
      return buildResponse({
        success: false,
        error: 'Missing required parameters'
      });
    }

    // Carpeta del mes dentro de INVOICES_FOLDER_ID (ej: "2025-11")
    const monthFolderId = getOrCreateInvoicesMonthFolder(params.month);
    Logger.log('Invoices month folder ID: ' + monthFolderId);

    // Normalizar nombre de guía según opción B
    const normalizedGuideName = normalizeGuideNameForInvoice(
      params.guideName || params.guideId
    );

    var invoicePart = '_FACTURA';
    if (params.invoiceNumber) {
      invoicePart += '_' + sanitizeFilename(params.invoiceNumber);
    }

    const fileName =
      normalizedGuideName + '_' + params.month + invoicePart + '.pdf';

    const pdfBlob = Utilities.newBlob(
      Utilities.base64Decode(params.pdfBase64),
      'application/pdf',
      fileName
    );

    const file = DriveApp.getFolderById(monthFolderId).createFile(pdfBlob);
    Logger.log('PDF uploaded: ' + file.getId());

    // Opcional: acceso con enlace (si te interesa abrir desde correo)
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return buildResponse({
      success: true,
      fileId: file.getId(),
      fileName: file.getName(),
      fileUrl: file.getUrl()
    });
  } catch (err) {
    Logger.log('ERROR uploadGuideInvoice: ' + err.toString());
    Logger.log('Stack: ' + err.stack);
    return buildResponse({
      success: false,
      error: err.toString()
    });
  }
}

// NUEVO: borrar factura guía en Drive (resubida)
function handleDeleteGuideInvoice(params) {
  try {
    Logger.log('=== deleteGuideInvoice Request ===');
    Logger.log('fileId: ' + params.fileId);

    if (!params.fileId) {
      Logger.log('ERROR: Missing fileId');
      return buildResponse({
        success: false,
        error: 'Missing fileId'
      });
    }

    try {
      const file = DriveApp.getFileById(params.fileId);
      file.setTrashed(true);
      Logger.log('File trashed: ' + params.fileId);
    } catch (e) {
      Logger.log(
        'WARN: File not found or cannot be deleted: ' + e.toString()
      );
      // No reventamos: es normal si el archivo ya no existe
    }

    return buildResponse({
      success: true,
      message: 'Archivo eliminado correctamente'
    });
  } catch (err) {
    Logger.log('ERROR deleteGuideInvoice: ' + err.toString());
    Logger.log('Stack: ' + err.stack);
    return buildResponse({
      success: false,
      error: err.toString()
    });
  }
}

// Helper: carpeta de mes para FACTURAS (YYYY-MM como nombre)
function getOrCreateInvoicesMonthFolder(monthStr) {
  Logger.log('Looking for invoices month folder: ' + monthStr);

  const parentFolder = DriveApp.getFolderById(INVOICES_FOLDER_ID);
  const searchFolders = parentFolder.getFoldersByName(monthStr);

  if (searchFolders.hasNext()) {
    const existingFolder = searchFolders.next();
    Logger.log('Invoices month folder exists: ' + existingFolder.getId());
    return existingFolder.getId();
  }

  const newFolder = parentFolder.createFolder(monthStr);
  Logger.log('Created invoices month folder: ' + newFolder.getId());
  return newFolder.getId();
}

// Helper: normalización opción B
function normalizeGuideNameForInvoice(name) {
  if (!name) {
    return 'GUIDE';
  }

  // Quitar acentos
  var withoutAccents = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  // Mayúsculas
  var upper = withoutAccents.toUpperCase();
  // Espacios -> _
  var replaced = upper.replace(/\s+/g, '_');

  // Solo A-Z, 0-9 y _
  return replaced
    .replace(/[^A-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function validateTour(e) {
  try {
    Logger.log('=== validateTour Request ===');
    Logger.log('Parameters: ' + JSON.stringify(e.parameter));

    const apiKey = e.parameter.apiKey;
    const storedKey =
      PropertiesService.getScriptProperties().getProperty('API_KEY');

    if (!apiKey || apiKey !== storedKey) {
      Logger.log('ERROR: Invalid API Key');
      return buildResponse({
        error: true,
        message: 'Unauthorized',
        code: 'UNAUTHORIZED'
      });
    }

    const fecha = e.parameter.fecha;
    const slot = e.parameter.slot;

    Logger.log('Fecha: ' + fecha);
    Logger.log('Slot: ' + slot);

    if (!fecha || !slot) {
      Logger.log('ERROR: Missing parameters');
      return buildResponse({
        error: true,
        message: 'Missing fecha or slot parameter',
        code: 'INVALID_REQUEST'
      });
    }

    const targetTime = SLOT_TIMES[slot];
    if (!targetTime) {
      Logger.log('ERROR: Invalid slot: ' + slot);
      return buildResponse({
        error: true,
        message: 'Invalid slot: ' + slot,
        code: 'INVALID_SLOT'
      });
    }

    Logger.log('Target time: ' + targetTime);

    const timeMin = new Date(fecha + 'T00:00:00');
    const timeMax = new Date(fecha + 'T23:59:59');

    Logger.log('Search range:');
    Logger.log('  TimeMin: ' + timeMin.toISOString());
    Logger.log('  TimeMax: ' + timeMax.toISOString());

    const events = Calendar.Events.list(CALENDAR_ID, {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    });

    Logger.log(
      'Events found: ' + (events.items ? events.items.length : 0)
    );

    if (events.items && events.items.length > 0) {
      for (let i = 0; i < events.items.length; i++) {
        const event = events.items[i];

        if (!event.start || !event.start.dateTime) {
          Logger.log(
            'Event ' + i + ': No dateTime (all-day event?)'
          );
          continue;
        }

        const eventTime = new Date(event.start.dateTime);
        const hours = String(eventTime.getHours()).padStart(2, '0');
        const minutes = String(eventTime.getMinutes()).padStart(2, '0');
        const eventTimeStr = hours + ':' + minutes;

        Logger.log(
          'Event ' +
          i +
          ': ' +
          event.summary +
          ' at ' +
          eventTimeStr
        );

        if (eventTimeStr === targetTime) {
          Logger.log('✅ MATCH FOUND!');
          return buildResponse({
            exists: true,
            eventId: event.id,
            summary: event.summary || 'Sin título',
            startTime: eventTimeStr,
            endTime: event.end ? event.end.dateTime : null
          });
        }
      }
    }

    Logger.log(
      '❌ No event found for ' + fecha + ' at ' + targetTime
    );
    return buildResponse({
      exists: false,
      eventId: null,
      summary: null,
      startTime: null,
      endTime: null
    });
  } catch (error) {
    Logger.log('ERROR: ' + error.toString());
    Logger.log('Stack: ' + error.stack);
    return buildResponse({
      error: true,
      message: error.toString(),
      code: 'INTERNAL_ERROR'
    });
  }
}

function addGuideToEvent(e) {
  try {
    Logger.log('=== addGuideToEvent Request ===');
    Logger.log('Parameters: ' + JSON.stringify(e.parameter));

    const apiKey = e.parameter.apiKey;
    const storedKey =
      PropertiesService.getScriptProperties().getProperty('API_KEY');

    if (!apiKey || apiKey !== storedKey) {
      Logger.log('ERROR: Invalid API Key');
      return buildResponse({
        error: true,
        message: 'Unauthorized'
      });
    }

    const eventId = e.parameter.eventId;
    const guideEmail = e.parameter.guideEmail;

    if (!eventId || !guideEmail) {
      Logger.log('ERROR: Missing parameters');
      return buildResponse({
        error: true,
        message: 'Missing eventId or guideEmail'
      });
    }

    Logger.log('EventID: ' + eventId);
    Logger.log('Guide email: ' + guideEmail);

    const event = Calendar.Events.get(CALENDAR_ID, eventId);

    const attendees = event.attendees || [];
    const alreadyInvited = attendees.some(
      (a) => a.email === guideEmail
    );

    if (alreadyInvited) {
      Logger.log('Guide already invited');
      return buildResponse({
        success: true,
        alreadyInvited: true
      });
    }

    attendees.push({
      email: guideEmail,
      responseStatus: 'needsAction',
      optional: false
    });

    Calendar.Events.patch(
      {
        attendees: attendees,
        guestsCanSeeOtherGuests: true
      },
      CALENDAR_ID,
      eventId,
      {
        sendUpdates: 'all'
      }
    );

    Logger.log('✅ Guide added to event');
    return buildResponse({ success: true, invited: true });
  } catch (error) {
    Logger.log('ERROR: ' + error.toString());
    Logger.log('Stack: ' + error.stack);
    return buildResponse({
      error: true,
      message: error.toString()
    });
  }
}

function removeGuideFromEvent(e) {
  try {
    Logger.log('=== removeGuideFromEvent Request ===');
    Logger.log('Parameters: ' + JSON.stringify(e.parameter));

    const apiKey = e.parameter.apiKey;
    const storedKey =
      PropertiesService.getScriptProperties().getProperty('API_KEY');

    if (!apiKey || apiKey !== storedKey) {
      Logger.log('ERROR: Invalid API Key');
      return buildResponse({
        error: true,
        message: 'Unauthorized'
      });
    }

    const eventId = e.parameter.eventId;
    const guideEmail = e.parameter.guideEmail;

    if (!eventId || !guideEmail) {
      Logger.log('ERROR: Missing parameters');
      return buildResponse({
        error: true,
        message: 'Missing eventId or guideEmail'
      });
    }

    Logger.log('EventID: ' + eventId);
    Logger.log('Guide email: ' + guideEmail);

    const event = Calendar.Events.get(CALENDAR_ID, eventId);

    const attendees = event.attendees || [];
    const filteredAttendees = attendees.filter(
      (a) => a.email !== guideEmail
    );

    if (attendees.length === filteredAttendees.length) {
      Logger.log('Guide was not in attendees list');
      return buildResponse({
        success: true,
        notFound: true
      });
    }

    Calendar.Events.patch(
      {
        attendees: filteredAttendees
      },
      CALENDAR_ID,
      eventId,
      {
        sendUpdates: 'all'
      }
    );

    Logger.log('✅ Guide removed from event');
    return buildResponse({ success: true, removed: true });
  } catch (error) {
    Logger.log('ERROR: ' + error.toString());
    Logger.log('Stack: ' + error.stack);
    return buildResponse({
      error: true,
      message: error.toString()
    });
  }
}

function parseGuestsFromDescription(description) {
  if (!description) return [];

  const guests = [];
  const lines = description
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (/^\d{14,}$/.test(line)) {
      const guest = { nombre: null, pax: null, telefono: null, notas: null };
      i++;

      while (
        i < lines.length &&
        (lines[i].toLowerCase().includes('experience') ||
          lines[i].toLowerCase().includes('tavern') ||
          lines[i].toLowerCase().includes('dani'))
      ) {
        i++;
      }

      if (i < lines.length && /^\d+\s+adults?/i.test(lines[i])) {
        guest.pax = parseInt(lines[i].match(/^(\d+)/)[1], 10);
        i++;
      }

      while (
        i < lines.length &&
        (lines[i].toLowerCase().includes('special requirements') ||
          lines[i].toLowerCase().includes('notes:') ||
          lines[i].startsWith('Total price:') ||
          lines[i].startsWith('Deposit:') ||
          lines[i].startsWith('Paid:') ||
          lines[i].toLowerCase().includes('promotion'))
      ) {
        i++;
      }

      if (
        i < lines.length &&
        lines[i].match(/\d{4}\s+\d{1,2}:\d{2}/)
      ) {
        i++;
      }

      if (
        i < lines.length &&
        !lines[i].includes('@') &&
        !lines[i].match(/^[\d\s\(\)\+\-]+$/) &&
        !lines[i].toLowerCase().includes('total') &&
        !lines[i].toLowerCase().includes('voucher')
      ) {
        guest.nombre = lines[i];
        i++;
      }

      if (i < lines.length && lines[i].includes('@')) {
        i++;
      }

      if (i < lines.length) {
        const currentLine = lines[i];

        const countryCodePattern =
          /^(US|CH|UK|ES|FR|DE|IT|AU|CA|NZ)-?\+?[\d\s\(\)\-]+/i;
        const phonePattern = /(\+?\d[\d\s\(\)\-]{6,})/;

        if (countryCodePattern.test(currentLine)) {
          const match = currentLine.match(countryCodePattern);
          guest.telefono = match[0]
            .split('(home)')[0]
            .split('(mobile)')[0]
            .split('(work)')[0]
            .trim()
            .replace(/\($/, '');
          i++;
        } else if (phonePattern.test(currentLine)) {
          const match = currentLine.match(phonePattern);
          guest.telefono = match[1]
            .split('(home)')[0]
            .split('(mobile)')[0]
            .split('(work)')[0]
            .trim()
            .replace(/\($/, '');
          i++;
        } else {
          for (let j = i - 6; j < i; j++) {
            if (j >= 0 && lines[j]) {
              const noteLine = lines[j];
              const notePhoneMatch = noteLine.match(
                /(?:phone|tel|number|móvil|teléfono|contact)[:\s]+(\+?\d[\d\s\(\)\-]{7,})/i
              );
              if (notePhoneMatch) {
                guest.telefono = notePhoneMatch[1].trim();
                break;
              }
              const digitsMatch = noteLine.match(/(\+?\d{10,})/);
              if (
                digitsMatch &&
                !noteLine.toLowerCase().includes('total') &&
                !noteLine.toLowerCase().includes('price')
              ) {
                guest.telefono = digitsMatch[1].trim();
                break;
              }
            }
          }
        }
      }

      if (guest.nombre || guest.pax || guest.telefono) {
        guests.push(guest);
      }
    }
    i++;
  }

  return guests;
}

function getEventDetails(e) {
  try {
    Logger.log('=== getEventDetails Request ===');
    Logger.log('Parameters: ' + JSON.stringify(e.parameter));

    const apiKey = e.parameter.apiKey;
    const storedKey =
      PropertiesService.getScriptProperties().getProperty('API_KEY');

    if (!apiKey || apiKey !== storedKey) {
      Logger.log('ERROR: Invalid API Key');
      return buildResponse({
        error: true,
        message: 'Unauthorized',
        code: 'UNAUTHORIZED'
      });
    }

    const eventId = e.parameter.eventId;

    if (!eventId) {
      Logger.log('ERROR: Missing eventId');
      return buildResponse({
        error: true,
        message: 'Missing eventId parameter',
        code: 'INVALID_REQUEST'
      });
    }

    Logger.log('Fetching event: ' + eventId);

    const event = Calendar.Events.get(CALENDAR_ID, eventId);

    const guests = parseGuestsFromDescription(event.description);

    let totalPax = 0;
    guests.forEach(function (guest) {
      if (guest.pax) {
        totalPax += guest.pax;
      }
    });

    let startTime = 'N/A';
    if (event.start && event.start.dateTime) {
      const eventDate = new Date(event.start.dateTime);
      const hours = String(eventDate.getHours()).padStart(2, '0');
      const minutes = String(eventDate.getMinutes()).padStart(2, '0');
      startTime = hours + ':' + minutes;
    }

    Logger.log('✅ Event retrieved');
    Logger.log('Guests: ' + guests.length);
    Logger.log('Total PAX: ' + totalPax);

    return buildResponse({
      summary: event.summary || 'Sin título',
      startTime: startTime,
      guests: guests,
      totalPax: totalPax,
      htmlLink: event.htmlLink
    });
  } catch (error) {
    Logger.log('ERROR: ' + error.toString());
    Logger.log('Stack: ' + error.stack);

    if (
      error.toString().includes('Not Found') ||
      error.toString().includes('404')
    ) {
      return buildResponse({
        error: true,
        message: 'Event not found',
        code: 'NOT_FOUND'
      });
    }

    return buildResponse({
      error: true,
      message: error.toString(),
      code: 'INTERNAL_ERROR'
    });
  }
}

function getAssignedTours(e) {
  try {
    Logger.log('=== getAssignedTours Request ===');
    Logger.log('Parameters: ' + JSON.stringify(e.parameter));

    const apiKey = e.parameter.apiKey;
    const storedKey =
      PropertiesService.getScriptProperties().getProperty('API_KEY');

    if (!apiKey || apiKey !== storedKey) {
      Logger.log('ERROR: Invalid API Key');
      return buildResponse({
        error: true,
        message: 'Unauthorized',
        code: 'UNAUTHORIZED'
      });
    }

    const startDate = e.parameter.startDate;
    const endDate = e.parameter.endDate;
    const guideEmail = e.parameter.guideEmail;

    if (!startDate || !endDate) {
      Logger.log('ERROR: Missing date parameters');
      return buildResponse({
        error: true,
        message: 'Missing startDate or endDate',
        code: 'INVALID_REQUEST'
      });
    }

    Logger.log('Date range: ' + startDate + ' to ' + endDate);
    Logger.log('Guide filter: ' + (guideEmail || 'ALL'));

    const timeMin = new Date(startDate + 'T00:00:00');
    const timeMax = new Date(endDate + 'T23:59:59');

    const events = Calendar.Events.list(CALENDAR_ID, {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250
    });

    Logger.log(
      'Total events found: ' +
      (events.items ? events.items.length : 0)
    );

    const assignments = [];

    if (events.items && events.items.length > 0) {
      events.items.forEach(function (event) {
        if (!event.start || !event.start.dateTime) {
          return;
        }

        if (!event.attendees || event.attendees.length === 0) {
          return;
        }

        const guides = event.attendees.filter(function (att) {
          if (guideEmail) {
            return att.email === guideEmail;
          }
          return (
            att.email && !att.email.includes('tripadvisor.com')
          );
        });

        if (guides.length === 0) {
          return;
        }

        const eventDate = new Date(event.start.dateTime);
        const fecha = eventDate.toISOString().split('T')[0];
        const hours = String(eventDate.getHours()).padStart(2, '0');
        const minutes = String(eventDate.getMinutes()).padStart(2, '0');
        const startTime = hours + ':' + minutes;

        let slot = 'DESCONOCIDO';
        if (startTime === '12:00') slot = 'MAÑANA';
        else if (startTime === '17:15') slot = 'T1';
        else if (startTime === '18:15') slot = 'T2';
        else if (startTime === '19:15') slot = 'T3';

        const guests = parseGuestsFromDescription(event.description);

        let totalPax = 0;
        guests.forEach(function (guest) {
          if (guest.pax) {
            totalPax += guest.pax;
          }
        });

        guides.forEach(function (guide) {
          assignments.push({
            eventId: event.id,
            fecha: fecha,
            slot: slot,
            startTime: startTime,
            tourName: event.summary || 'Tour sin nombre',
            guideEmail: guide.email,
            guideName:
              guide.displayName || guide.email.split('@')[0],
            guests: guests,
            totalPax: totalPax,
            htmlLink: event.htmlLink
          });
        });
      });
    }

    Logger.log('✅ Assignments processed: ' + assignments.length);

    return buildResponse({
      assignments: assignments,
      count: assignments.length
    });
  } catch (error) {
    Logger.log('ERROR: ' + error.toString());
    Logger.log('Stack: ' + error.stack);
    return buildResponse({
      error: true,
      message: error.toString(),
      code: 'INTERNAL_ERROR'
    });
  }
}

function getOrCreateShiftFolder(shiftId, monthFolder) {
  Logger.log('Getting/creating folder structure...');
  Logger.log('Month: ' + monthFolder + ', Shift: ' + shiftId);

  const rootFolder = DriveApp.getFolderById(ROOT_DRIVE_FOLDER_ID);
  Logger.log('Root folder ID: ' + rootFolder.getId());

  let monthFolderObj;
  const searchMonthFolders =
    rootFolder.getFoldersByName(monthFolder);

  if (searchMonthFolders.hasNext()) {
    monthFolderObj = searchMonthFolders.next();
    Logger.log('Month folder exists: ' + monthFolderObj.getId());
  } else {
    monthFolderObj = rootFolder.createFolder(monthFolder);
    Logger.log('Created month folder: ' + monthFolderObj.getId());
  }

  const searchShiftFolders =
    monthFolderObj.getFoldersByName(shiftId);

  if (searchShiftFolders.hasNext()) {
    const shiftFolder = searchShiftFolders.next();
    Logger.log('Shift folder exists: ' + shiftFolder.getId());
    return shiftFolder.getId();
  }

  const newShiftFolder = monthFolderObj.createFolder(shiftId);
  Logger.log('Created shift folder: ' + newShiftFolder.getId());
  return newShiftFolder.getId();
}

// ============================================
// LEGACY: BATCH WRITE (MANTENER)
// ============================================
function appendToVendorsSheet(
  params,
  vendorsData,
  uploadedVendors
) {
  Logger.log('Appending to sheet (batch)...');

  const ss = SpreadsheetApp.openById(VENDORS_SHEET_ID);
  const sheet = ss.getSheets()[0];

  const feedback = params.postTourFeedback || '';

  const rows = vendorsData.map(function (vendor, idx) {
    return [
      new Date(),
      params.fecha,
      params.slot,
      params.guideName,
      params.numPax,
      vendor.vendorName,
      vendor.importe,
      uploadedVendors[idx].driveUrl || '',
      idx === 0 ? feedback : ''
    ];
  });

  sheet
    .getRange(sheet.getLastRow() + 1, 1, rows.length, 9)
    .setValues(rows);

  Logger.log('✅ Batch appended ' + rows.length + ' rows');
}

function getVendorCosts(e) {
  try {
    Logger.log('=== getVendorCosts Request ===');

    const apiKey = e.parameter.apiKey;
    const storedKey =
      PropertiesService.getScriptProperties().getProperty('API_KEY');

    if (!apiKey || apiKey !== storedKey) {
      Logger.log('ERROR: Invalid API Key');
      return buildResponse({
        error: true,
        code: 'UNAUTHORIZED',
        message: 'Invalid API key'
      });
    }

    const vendorName = e.parameter.vendorName || null;
    const startDate = e.parameter.startDate || null;
    const endDate = e.parameter.endDate || null;

    Logger.log(
      'Filters - Vendor: ' +
      vendorName +
      ', Start: ' +
      startDate +
      ', End: ' +
      endDate
    );

    const response = Sheets.Spreadsheets.Values.get(
      VENDORS_SHEET_ID,
      'A:I'
    );
    const data = response.values || [];

    Logger.log('Total rows from sheet: ' + data.length);

    const costs = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length < 6) continue;

      let fechaStr = row[1] || '';
      if (typeof fechaStr !== 'string') {
        fechaStr = String(fechaStr);
      }

      const cost = {
        timestamp: row[0] || '',
        fecha: fechaStr,
        slot: row[2] || '',
        guideName: row[3] || '',
        numPax: row[4] || 0,
        vendorName: row[5] || '',
        importe: row[6] || 0,
        ticketUrl: row[7] || '',
        feedback: row[8] || ''
      };

      if (vendorName && cost.vendorName !== vendorName) continue;
      if (startDate && cost.fecha < startDate) continue;
      if (endDate && cost.fecha > endDate) continue;

      costs.push(cost);
    }

    Logger.log('✅ Costs retrieved: ' + costs.length);

    return buildResponse({
      costs: costs,
      count: costs.length
    });
  } catch (err) {
    Logger.log('ERROR getVendorCosts: ' + err.toString());
    Logger.log('Stack: ' + err.stack);
    return buildResponse({
      error: true,
      code: 'FETCH_FAILED',
      message: err.toString()
    });
  }
}

function handleUploadInvoice(params) {
  try {
    Logger.log('=== uploadInvoice Request (LEGACY) ===');

    const apiKey = params.apiKey;
    const storedKey =
      PropertiesService.getScriptProperties().getProperty('API_KEY');

    if (!apiKey || apiKey !== storedKey) {
      Logger.log('ERROR: Invalid API Key');
      return buildResponse({
        error: true,
        code: 'UNAUTHORIZED',
        message: 'Invalid API key'
      });
    }

    if (
      !params.guideId ||
      !params.invoiceNumber ||
      !params.month ||
      !params.pdfBase64
    ) {
      Logger.log('ERROR: Missing required parameters');
      return buildResponse({
        error: true,
        code: 'MISSING_PARAMS',
        message: 'Missing required parameters'
      });
    }

    Logger.log('Guide: ' + params.guideName);
    Logger.log('Invoice: ' + params.invoiceNumber);
    Logger.log('Month: ' + params.month);

    const folderParentId = params.folderParentId || INVOICES_FOLDER_ID;
    const monthFolderId = getOrCreateMonthFolder(
      folderParentId,
      params.month
    );
    Logger.log('Month folder ID: ' + monthFolderId);

    const pdfBlob = Utilities.newBlob(
      Utilities.base64Decode(params.pdfBase64),
      'application/pdf',
      sanitizeFilename(params.guideName) +
      '_' +
      sanitizeFilename(params.invoiceNumber) +
      '.pdf'
    );

    const file = DriveApp.getFolderById(monthFolderId).createFile(pdfBlob);
    Logger.log('PDF uploaded: ' + file.getId());

    return buildResponse({
      success: true,
      driveFileId: file.getId(),
      driveUrl: file.getUrl(),
      fileName: file.getName()
    });
  } catch (err) {
    Logger.log('ERROR uploadInvoice: ' + err.toString());
    Logger.log('Stack: ' + err.stack);
    return buildResponse({
      error: true,
      code: 'UPLOAD_FAILED',
      message: err.toString()
    });
  }
}

function getOrCreateMonthFolder(parentFolderId, monthStr) {
  const [year, month] = monthStr.split('-');
  const monthNames = [
    'ENE',
    'FEB',
    'MAR',
    'ABR',
    'MAY',
    'JUN',
    'JUL',
    'AGO',
    'SEP',
    'OCT',
    'NOV',
    'DIC'
  ];
  const monthAbbr = monthNames[parseInt(month, 10) - 1];
  const yearShort = year.slice(-2);
  const folderName = monthAbbr + '_' + yearShort;

  Logger.log('Looking for folder: ' + folderName);

  const parentFolder = DriveApp.getFolderById(parentFolderId);
  const searchFolders = parentFolder.getFoldersByName(folderName);

  if (searchFolders.hasNext()) {
    const existingFolder = searchFolders.next();
    Logger.log('Month folder exists: ' + existingFolder.getId());
    return existingFolder.getId();
  }

  const newFolder = parentFolder.createFolder(folderName);
  Logger.log('Created month folder: ' + newFolder.getId());
  return newFolder.getId();
}

function sanitizeFilename(str) {
  if (!str) {
    return '';
  }
  return str
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function buildResponse(data) {
  Logger.log('=== RESPONSE ===');
  Logger.log(JSON.stringify(data));

  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function setupAPIKey() {
  PropertiesService.getScriptProperties().setProperty(
    'API_KEY',
    'sfs-calendar-2024-secure-key'
  );
}

function testUploadGuideInvoice() {
  const pdfContent =
    '%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n>>\nendobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000056 00000 n\n0000000115 00000 n\ntrailer\n<<\n/Size 4\n/Root 1 0 R\n>>\nstartxref\n190\n%%EOF';
  const pdfBase64 = Utilities.base64Encode(pdfContent);

  const result = handleUploadGuideInvoice({
    guideId: 'test-guide-123',
    guideName: 'Juan Pérez',
    invoiceNumber: '2025/042',
    month: '2025-10',
    pdfBase64: pdfBase64
  });

  Logger.log('=== TEST RESULT ===');
  Logger.log(result.getContent());
}
