// =========================================
// VENDOR COSTS MODULE - VERIFACTU REDESIGN
// =========================================
// Version: 2.3 (Cron día 1 + manual backfill + dedupe por shiftId)
// Date: 2025-12-01
// Changes:
// - Nueva arquitectura de generación de reportes:
//   * generateGuideInvoicesForMonth(targetMonthDate, options)
//   * Cron generateGuideInvoices: día 1 a las 00:05 UTC, mes anterior
//   * manualGenerateGuideInvoices: onCall, solo managers
// - Evita duplicados usando invoiceId fijo: REPORT_<guideId>_<YYYY-MM>
// - Email-resumen al manager con resultados y errores
// - NUEVO: deduplicación de vendor_costs por shiftId al generar reportes
// =========================================

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');
const { defineSecret } = require('firebase-functions/params');
const sgMail = require('@sendgrid/mail');
const fetch = require('node-fetch');

// Secrets
const sendgridKey = defineSecret('SENDGRID_API_KEY');

// Config
const MANAGER_EMAIL = process.env.MANAGER_EMAIL || 'madrid@spainfoodsherpas.com';
const ACCOUNTING_EMAIL = process.env.ACCOUNTING_EMAIL || 'contabilidad@spainfoodsherpas.com';
const FROM_EMAIL = 'madrid@spainfoodsherpas.com';
const FROM_NAME = 'Spain Food Sherpas';
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const APP_URL = process.env.APP_URL || 'https://calendar-app-tours.web.app';

// =========================================
// HELPER: Calculate Salary (SIN IVA)
// =========================================
async function calculateSalary(numPax) {
  const db = getFirestore();

  try {
    const tableSnap = await db.collection('config').doc('salary_table').get();

    if (!tableSnap.exists) {
      throw new Error('Salary table not configured');
    }

    const table = tableSnap.data();
    const range = table.ranges.find(r =>
      numPax >= r.minPax && numPax <= r.maxPax
    );

    if (!range) {
      throw new Error(`No salary range found for ${numPax} pax`);
    }

    // AHORA SIEMPRE NETO (sin IVA)
    return range.pagoNeto;
  } catch (error) {
    logger.error('Error calculating salary', { numPax, error: error.message });
    throw error;
  }
}


// =========================================
// HELPER: Upload PDF to Drive via Apps Script
// =========================================
async function uploadToGoogleDrive(params) {
  if (!APPS_SCRIPT_URL) {
    throw new Error('APPS_SCRIPT_URL not configured');
  }

  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'uploadGuideInvoice',
        guideId: params.guideId,
        guideName: params.guideName,
        month: params.month,
        invoiceNumber: params.invoiceNumber,
        pdfBase64: params.pdfBase64
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Apps Script error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Upload failed');
    }

    return {
      fileId: result.fileId,
      fileName: result.fileName,
      fileUrl: result.fileUrl
    };

  } catch (error) {
    logger.error('Error uploading to Drive', { error: error.message });
    throw error;
  }
}

// =========================================
// HELPER: Send email with template
// =========================================
function getEmailTemplate(content) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #3b82f6; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9fafb; }
        .button { 
          display: inline-block; 
          padding: 12px 24px; 
          background: #3b82f6; 
          color: white; 
          text-decoration: none; 
          border-radius: 4px; 
          margin: 10px 0;
        }
        .footer { text-align: center; color: #999; font-size: 12px; padding: 20px; }
        .alert { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 10px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Spain Food Sherpas</h1>
        </div>
        <div class="content">
          ${content}
        </div>
        <div class="footer">
          <p>Spain Food Sherpas | madrid@spainfoodsherpas.com</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// =========================================
// HELPERS NUEVOS: generación de facturas
// =========================================

/**
 * Resuelve el mes objetivo a procesar.
 * - Si se pasa monthParam (YYYY-MM) → lo valida y devuelve Date UTC día 1.
 * - Si no se pasa → devuelve el primer día del MES ANTERIOR en UTC.
 */
function resolveTargetMonth(monthParam) {
  if (monthParam) {
    const match = /^([0-9]{4})-([0-9]{2})$/.exec(monthParam);
    if (!match) {
      throw new HttpsError('invalid-argument', 'Formato de mes inválido, use YYYY-MM');
    }

    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    if (monthIndex < 0 || monthIndex > 11) {
      throw new HttpsError('invalid-argument', 'Mes fuera de rango');
    }

    return new Date(Date.UTC(year, monthIndex, 1));
  }

  const today = new Date();
  const currentMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const targetMonth = new Date(currentMonth);
  targetMonth.setUTCMonth(targetMonth.getUTCMonth() - 1);
  return targetMonth;
}

/**
 * Genera reportes de servicios (guide_invoices) para un mes concreto.
 * targetMonthDate: Date UTC día 1 del mes a procesar.
 * options.notifyManager: si true, envía email-resumen al manager.
 */
async function generateGuideInvoicesForMonth(targetMonthDate, { notifyManager = true } = {}) {
  const db = getFirestore();

  const year = targetMonthDate.getUTCFullYear();
  const month = String(targetMonthDate.getUTCMonth() + 1).padStart(2, '0');
  const invoiceMonth = `${year}-${month}`;

  const startDate = `${year}-${month}-01`;
  const lastDay = new Date(Date.UTC(year, targetMonthDate.getUTCMonth() + 1, 0)).getUTCDate();
  const endDate = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;

  logger.info('Procesando mes', { invoiceMonth, startDate, endDate });

  const guidesSnap = await db.collection('guides')
    .where('estado', '==', 'activo')
    .get();

  if (guidesSnap.empty) {
    logger.info('No hay guías activos');
    return { invoiceMonth, generated: 0, errors: [], generatedGuides: [] };
  }

  let generated = 0;
  const generatedGuides = [];
  const errors = [];

  for (const guideDoc of guidesSnap.docs) {
    const guideId = guideDoc.id;
    const guide = guideDoc.data();

    try {
      const costsSnap = await db.collection('vendor_costs')
        .where('guideId', '==', guideId)
        .where('fecha', '>=', startDate)
        .where('fecha', '<=', endDate)
        .get();

      if (costsSnap.empty) {
        logger.info('Sin vendor costs para guía', { guideId, guideName: guide.nombre });
        continue;
      }

      let totalSalary = 0;
      const tours = [];
      const seenShiftIds = new Set(); // dedupe por shiftId

      costsSnap.forEach(docSnap => {
        const cost = docSnap.data();

        if (cost.shiftId) {
          if (seenShiftIds.has(cost.shiftId)) {
            logger.warn('Vendor cost duplicado detectado, se omite en reporte', {
              guideId,
              guideName: guide.nombre,
              shiftId: cost.shiftId,
              fecha: cost.fecha,
              slot: cost.slot
            });
            return;
          }
          seenShiftIds.add(cost.shiftId);
        }

        // salarioCalculado ya es NETO (sin IVA)
        totalSalary += cost.salarioCalculado;

        tours.push({
          shiftId: cost.shiftId || null,
          fecha: cost.fecha,
          slot: cost.slot,
          tourDescription: cost.tourDescription,
          numPax: cost.numPax,
          salario: cost.salarioCalculado
        });
      });

      if (tours.length === 0) {
        logger.info('Todos los vendor_costs eran duplicados, nada que reportar', {
          guideId,
          guideName: guide.nombre
        });
        continue;
      }

      const invoiceId = `REPORT_${guideId}_${invoiceMonth}`;
      const invoiceRef = db.collection('guide_invoices').doc(invoiceId);
      const invoiceExists = await invoiceRef.get();

      if (invoiceExists.exists) {
        logger.info('Reporte ya existe, omitiendo', { invoiceId, guideId });
        continue;
      }

      await invoiceRef.set({
        invoiceId,
        guideId,
        guideName: guide.nombre,
        guideEmail: guide.email,
        guideDni: guide.dni || '',
        month: invoiceMonth,
        tours,
        // TOTAL SIEMPRE NETO (sin IVA)
        totalSalary: parseFloat(totalSalary.toFixed(2)),
        status: 'MANAGER_REVIEW',
        editedByManager: false,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });

      logger.info('Reporte generado', {
        invoiceId,
        guideId,
        guideName: guide.nombre,
        totalSalary,
        toursCount: tours.length
      });

      generated++;
      generatedGuides.push({ name: guide.nombre, email: guide.email });

    } catch (error) {
      logger.error('Error procesando guía', { guideId, error: error.message });
      errors.push({ guideId, guideName: guide.nombre, error: error.message });
    }
  }

  logger.info('Generación completada', {
    total: guidesSnap.size,
    generated,
    errors: errors.length
  });

  const hasErrors = errors.length > 0;
  const summaryList = generatedGuides
    .map(guide => `<li>${guide.name} (${guide.email || 'sin email'})</li>`)
    .join('');

  const errorList = errors
    .map(err => `<li>${err.guideName || err.guideId}: ${err.error}</li>`)
    .join('');

  if (notifyManager && (generated > 0 || hasErrors)) {
    sgMail.setApiKey(sendgridKey.value());
    await sgMail.send({
      to: MANAGER_EMAIL,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject: `Resumen generación reportes ${invoiceMonth}: ${generated} creados${hasErrors ? ' con incidencias' : ''}`,
      html: getEmailTemplate(`
        <h2>Resultados de la generación automática</h2>
        <p>Mes procesado: <strong>${invoiceMonth}</strong>.</p>
        ${
          generated > 0
            ? `
          <p>Se crearon <strong>${generated}</strong> reporte(s):</p>
          <ul>${summaryList}</ul>
          <a href="${APP_URL}/manager-invoices.html" class="button">Abrir panel de manager</a>
        `
            : '<p>No se generaron reportes nuevos.</p>'
        }
        ${
          hasErrors
            ? `
          <div class="alert">
            <strong>Incidencias:</strong>
            <ul>${errorList}</ul>
          </div>
        `
            : ''
        }
      `)
    });
  }

  if (hasErrors) {
    logger.warn('Errores durante generación', { errors });
  }

  return { invoiceMonth, generated, errors, generatedGuides };
}


// =========================================
// FUNCTION: generateGuideInvoices (CRON día 1)
// =========================================
exports.generateGuideInvoices = onSchedule({
  schedule: '5 0 1 * *',
  timeZone: 'UTC',
  secrets: [sendgridKey]
}, async () => {
  logger.info('Iniciando generación reportes de servicios (ejecución programada)');

  try {
    const result = await generateGuideInvoicesForMonth(resolveTargetMonth());
    logger.info('Ejecución programada terminada', result);
  } catch (error) {
    logger.error('Error crítico generando reportes', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
});

// =========================================
// FUNCTION: manualGenerateGuideInvoices
// =========================================
exports.manualGenerateGuideInvoices = onCall({
  cors: true,
  secrets: [sendgridKey]
}, async (request) => {
  const { data, auth } = request;

  if (!auth || auth.token.role !== 'manager') {
    throw new HttpsError('permission-denied', 'Solo managers');
  }

  const targetMonthDate = resolveTargetMonth(data?.month);
  const notifyManager = data?.notifyManager !== false;

  try {
    const result = await generateGuideInvoicesForMonth(targetMonthDate, { notifyManager });
    return { success: true, ...result };
  } catch (error) {
    logger.error('Error manual generando reportes', {
      month: data?.month,
      error: error.message
    });

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError('internal', 'Error generando reportes');
  }
});

// =========================================
// FUNCTION: managerSendToGuide
// =========================================
exports.managerSendToGuide = onCall({
  cors: true,
  secrets: [sendgridKey]
}, async (request) => {
  const { data, auth } = request;

  if (!auth || auth.token.role !== 'manager') {
    throw new HttpsError('permission-denied', 'Solo managers');
  }

  if (!data.invoiceId) {
    throw new HttpsError('invalid-argument', 'invoiceId requerido');
  }

  try {
    const db = getFirestore();
    const invoiceSnap = await db.collection('guide_invoices').doc(data.invoiceId).get();

    if (!invoiceSnap.exists) {
      throw new HttpsError('not-found', 'Reporte no encontrado');
    }

    const invoice = invoiceSnap.data();

    if (invoice.status !== 'MANAGER_REVIEW' && invoice.status !== 'REJECTED') {
      throw new HttpsError('failed-precondition', 'Reporte ya enviado o en otro estado');
    }

    const updateData = {
      status: 'PENDING_GUIDE_APPROVAL',
      sentToGuideAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    if (data.tours && data.totalSalary !== undefined) {
      // Los importes ya vienen NETOS (sin IVA). Solo guardamos lo que pasa el manager.
      updateData.tours = data.tours;
      updateData.totalSalary = parseFloat(data.totalSalary.toFixed(2));
      updateData.editedByManager = true;
      updateData.managerEditedAt = FieldValue.serverTimestamp();
    }


    await db.collection('guide_invoices').doc(data.invoiceId).update(updateData);

    sgMail.setApiKey(sendgridKey.value());
    await sgMail.send({
      to: invoice.guideEmail,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject: `Reporte de Servicios ${invoice.month} - Revisión requerida`,
      html: getEmailTemplate(`
        <h2>Tu reporte está listo para revisión</h2>
        <p>Hola ${invoice.guideName},</p>
        <p>El manager ha revisado tu reporte de <strong>${invoice.month}</strong>.</p>
        <p><strong>Total servicios:</strong> ${(updateData.totalSalary || invoice.totalSalary).toFixed(2)}€</p>
        <p>Por favor, accede a tu dashboard para revisar y aprobar o rechazar.</p>
        <a href="${APP_URL}/my-invoices.html" class="button">
          Ver Reporte
        </a>
      `)
    });

    logger.info('Reporte enviado a guía', {
      invoiceId: data.invoiceId,
      guideId: invoice.guideId,
      guideName: invoice.guideName
    });

    return { success: true };

  } catch (error) {
    logger.error('Error enviando reporte a guía', {
      invoiceId: data.invoiceId,
      error: error.message
    });

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError('internal', 'Error al enviar reporte');
  }
});

// =========================================
// FUNCTION: guideApproveReport
// =========================================
exports.guideApproveReport = onCall({
  cors: true,
  secrets: [sendgridKey]
}, async (request) => {
  const { data, auth } = request;

  if (!auth || auth.token.role !== 'guide') {
    throw new HttpsError('unauthenticated', 'Debe estar autenticado como guía');
  }

  const guideId = auth.token.guideId;
  const db = getFirestore();

  if (!data.invoiceId) {
    throw new HttpsError('invalid-argument', 'invoiceId requerido');
  }

  try {
    const invoiceSnap = await db.collection('guide_invoices').doc(data.invoiceId).get();

    if (!invoiceSnap.exists) {
      throw new HttpsError('not-found', 'Reporte no encontrado');
    }

    const invoice = invoiceSnap.data();

    if (invoice.guideId !== guideId) {
      throw new HttpsError('permission-denied', 'No autorizado');
    }

    if (invoice.status !== 'PENDING_GUIDE_APPROVAL') {
      throw new HttpsError('failed-precondition', 'Estado inválido');
    }

    const now = new Date();
    const deadline = new Date(now.getTime() + (48 * 60 * 60 * 1000));

    await db.collection('guide_invoices').doc(data.invoiceId).update({
      status: 'WAITING_INVOICE_UPLOAD',
      guideApprovedReportAt: FieldValue.serverTimestamp(),
      uploadDeadline: deadline,
      updatedAt: FieldValue.serverTimestamp()
    });

    sgMail.setApiKey(sendgridKey.value());
    await sgMail.send({
      to: invoice.guideEmail,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject: `Reporte aprobado - Sube tu factura VERIFACTU`,
      html: getEmailTemplate(`
        <h2>Reporte aprobado ✓</h2>
        <p>Has aprobado el reporte de <strong>${invoice.month}</strong>.</p>
        <div class="alert">
          <strong>Importante:</strong> Debes subir tu factura oficial VERIFACTU 
          en las próximas <strong>48 horas</strong> (antes del ${deadline.toLocaleString('es-ES')}).
        </div>
        <p>Total a facturar: <strong>${invoice.totalSalary.toFixed(2)}€</strong></p>
        <ol>
          <li>Genera tu factura en tu software certificado (Quipu/Holded/Billin)</li>
          <li>Asegúrate que incluya código QR VERIFACTU</li>
          <li>Sube el PDF en tu área de facturas</li>
        </ol>
        <a href="${APP_URL}/my-invoices.html" class="button">
          Subir Factura
        </a>
      `)
    });

    logger.info('Reporte aprobado por guía', {
      invoiceId: data.invoiceId,
      guideId,
      uploadDeadline: deadline.toISOString()
    });

    return {
      success: true,
      uploadDeadline: deadline.toISOString()
    };

  } catch (error) {
    logger.error('Error aprobando reporte', {
      invoiceId: data.invoiceId,
      guideId,
      error: error.message
    });

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError('internal', 'Error al aprobar reporte');
  }
});

// =========================================
// FUNCTION: guideRejectReport
// =========================================
exports.guideRejectReport = onCall({
  cors: true,
  secrets: [sendgridKey]
}, async (request) => {
  const { data, auth } = request;

  if (!auth || auth.token.role !== 'guide') {
    throw new HttpsError('unauthenticated', 'Debe estar autenticado como guía');
  }

  const guideId = auth.token.guideId;
  const db = getFirestore();

  if (!data.invoiceId || !data.comments) {
    throw new HttpsError('invalid-argument', 'invoiceId y comments requeridos');
  }

  if (data.comments.trim().length < 10) {
    throw new HttpsError('invalid-argument',
      'Comentarios obligatorios (mínimo 10 caracteres)');
  }

  try {
    const invoiceSnap = await db.collection('guide_invoices').doc(data.invoiceId).get();

    if (!invoiceSnap.exists) {
      throw new HttpsError('not-found', 'Reporte no encontrado');
    }

    const invoice = invoiceSnap.data();

    if (invoice.guideId !== guideId) {
      throw new HttpsError('permission-denied', 'No autorizado');
    }

    if (invoice.status !== 'PENDING_GUIDE_APPROVAL') {
      throw new HttpsError('failed-precondition', 'Estado inválido');
    }

    await db.collection('guide_invoices').doc(data.invoiceId).update({
      status: 'REJECTED',
      rejectedAt: FieldValue.serverTimestamp(),
      rejectionComments: data.comments.trim(),
      updatedAt: FieldValue.serverTimestamp()
    });

    sgMail.setApiKey(sendgridKey.value());
    await sgMail.send({
      to: MANAGER_EMAIL,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject: `Reporte rechazado por guía: ${invoice.guideName}`,
      html: getEmailTemplate(`
        <h2>Reporte rechazado</h2>
        <p><strong>Guía:</strong> ${invoice.guideName}</p>
        <p><strong>Mes:</strong> ${invoice.month}</p>
        <p><strong>Motivo:</strong></p>
        <blockquote style="background: #f5f5f5; padding: 15px; border-left: 4px solid #ef4444;">
          ${data.comments}
        </blockquote>
        <p>Por favor, revisa y corrige el reporte.</p>
        <a href="${APP_URL}/manager-invoices.html" class="button">
          Ver Dashboard
        </a>
      `)
    });

    logger.info('Reporte rechazado por guía', {
      invoiceId: data.invoiceId,
      guideId,
      comments: data.comments
    });

    return { success: true };

  } catch (error) {
    logger.error('Error rechazando reporte', {
      invoiceId: data.invoiceId,
      guideId,
      error: error.message
    });

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError('internal', 'Error al rechazar reporte');
  }
});

// =========================================
// FUNCTION: uploadOfficialInvoice
// =========================================
exports.uploadOfficialInvoice = onCall({
  cors: true,
  secrets: [sendgridKey]
}, async (request) => {
  const { data, auth } = request;

  if (!auth || auth.token.role !== 'guide') {
    throw new HttpsError('unauthenticated', 'Debe estar autenticado como guía');
  }

  const guideId = auth.token.guideId;
  const db = getFirestore();

  if (!data.invoiceId || !data.invoiceNumber || !data.pdfBase64) {
    throw new HttpsError('invalid-argument', 'Datos incompletos');
  }

  try {
    const invoiceSnap = await db.collection('guide_invoices').doc(data.invoiceId).get();

    if (!invoiceSnap.exists) {
      throw new HttpsError('not-found', 'Reporte no encontrado');
    }

    const invoice = invoiceSnap.data();

    if (invoice.guideId !== guideId) {
      throw new HttpsError('permission-denied', 'No autorizado');
    }

    const validStatuses = ['WAITING_INVOICE_UPLOAD', 'UPLOAD_OVERDUE'];
    if (!validStatuses.includes(invoice.status)) {
      throw new HttpsError('failed-precondition',
        'No puedes subir factura en este estado');
    }

    const pdfSize = Buffer.from(data.pdfBase64, 'base64').length;
    if (pdfSize > 5 * 1024 * 1024) {
      throw new HttpsError('invalid-argument', 'PDF mayor a 5MB');
    }

    logger.info('Subiendo factura a Drive', {
      invoiceId: data.invoiceId,
      invoiceNumber: data.invoiceNumber,
      pdfSize
    });

    const uploadResult = await uploadToGoogleDrive({
      guideId: invoice.guideId,
      guideName: invoice.guideName,
      month: invoice.month,
      invoiceNumber: data.invoiceNumber.replace('/', '-'),
      pdfBase64: data.pdfBase64
    });

    logger.info('Factura subida a Drive', uploadResult);

    await db.collection('guide_invoices').doc(data.invoiceId).update({
      status: 'APPROVED',
      officialInvoicePdfUrl: uploadResult.fileId,
      officialInvoiceNumber: data.invoiceNumber,
      officialInvoiceUploadedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    sgMail.setApiKey(sendgridKey.value());

    await Promise.all([
      sgMail.send({
        to: MANAGER_EMAIL,
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject: `Factura subida: ${invoice.guideName} - ${data.invoiceNumber}`,
        html: getEmailTemplate(`
          <h2>Nueva factura oficial</h2>
          <p><strong>Guía:</strong> ${invoice.guideName}</p>
          <p><strong>Factura:</strong> ${data.invoiceNumber}</p>
          <p><strong>Mes:</strong> ${invoice.month}</p>
          <p>Factura disponible en Drive y adjunta en este email.</p>
        `),
        attachments: [{
          content: data.pdfBase64,
          filename: `${invoice.guideName}_${invoice.month}_${data.invoiceNumber.replace('/', '-')}.pdf`,
          type: 'application/pdf',
          disposition: 'attachment'
        }]
      }),

      sgMail.send({
        to: ACCOUNTING_EMAIL,
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject: `Factura guía ${data.invoiceNumber} - ${invoice.guideName}`,
        html: getEmailTemplate(`
          <h2>Nueva factura guía</h2>
          <p><strong>Guía:</strong> ${invoice.guideName}</p>
          <p><strong>DNI:</strong> ${invoice.guideDni}</p>
          <p><strong>Factura:</strong> ${data.invoiceNumber}</p>
          <p><strong>Mes:</strong> ${invoice.month}</p>
          <p><strong>Total servicios:</strong> ${invoice.totalSalary.toFixed(2)}€</p>
          <p>Revisa el PDF adjunto con la factura oficial VERIFACTU.</p>
        `),
        attachments: [{
          content: data.pdfBase64,
          filename: `${invoice.guideName}_${invoice.month}_${data.invoiceNumber.replace('/', '-')}.pdf`,
          type: 'application/pdf',
          disposition: 'attachment'
        }]
      }),

      sgMail.send({
        to: invoice.guideEmail,
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject: `Factura ${data.invoiceNumber} recibida correctamente`,
        html: getEmailTemplate(`
          <h2>Factura subida correctamente ✓</h2>
          <p>Tu factura <strong>${data.invoiceNumber}</strong> del mes <strong>${invoice.month}</strong> 
             ha sido recibida y procesada.</p>
          <p>El equipo de contabilidad la procesará en breve.</p>
        `)
      })
    ]);

    logger.info('Factura oficial procesada', {
      invoiceId: data.invoiceId,
      guideId,
      invoiceNumber: data.invoiceNumber,
      driveFileId: uploadResult.fileId
    });

    return {
      success: true,
      driveUrl: `https://drive.google.com/file/d/${uploadResult.fileId}`
    };

  } catch (error) {
    logger.error('Error subiendo factura oficial', {
      invoiceId: data.invoiceId,
      guideId,
      error: error.message
    });

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError('internal', 'Error al subir factura');
  }
});

// =========================================
// FUNCTION: checkUploadDeadlines
// =========================================
exports.checkUploadDeadlines = onSchedule({
  schedule: '0 9 * * *',
  timeZone: 'Europe/Madrid',
  secrets: [sendgridKey]
}, async () => {
  logger.info('Verificando deadlines de subida de facturas');

  try {
    const db = getFirestore();
    const now = new Date();

    const overdueSnap = await db.collection('guide_invoices')
      .where('status', '==', 'WAITING_INVOICE_UPLOAD')
      .where('uploadDeadline', '<', now)
      .get();

    if (overdueSnap.empty) {
      logger.info('No hay facturas con plazo vencido');
      return;
    }

    const batch = db.batch();
    const notifications = [];

    overdueSnap.docs.forEach(doc => {
      const invoice = doc.data();

      batch.update(doc.ref, {
        status: 'UPLOAD_OVERDUE',
        updatedAt: FieldValue.serverTimestamp()
      });

      notifications.push({
        guideEmail: invoice.guideEmail,
        guideName: invoice.guideName,
        month: invoice.month,
        deadline: invoice.uploadDeadline.toDate()
      });
    });

    await batch.commit();

    if (notifications.length > 0) {
      const listHtml = notifications.map(n =>
        `<li><strong>${n.guideName}</strong> - Mes: ${n.month} 
            (vencido: ${n.deadline.toLocaleString('es-ES')})</li>`
      ).join('');

      sgMail.setApiKey(sendgridKey.value());
      await sgMail.send({
        to: MANAGER_EMAIL,
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject: `${notifications.length} factura(s) no subidas - Plazo vencido`,
        html: getEmailTemplate(`
          <h2>Facturas con plazo vencido</h2>
          <p>Los siguientes guías no subieron su factura en 48h:</p>
          <ul>${listHtml}</ul>
          <p>Por favor, contacta con ellos.</p>
        `)
      });
    }

    logger.info('Deadlines verificados', {
      overdueCount: notifications.length
    });

  } catch (error) {
    logger.error('Error verificando deadlines', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
});

// =========================================
// FUNCTION: registerVendorCost (UNCHANGED lógica)
// =========================================
exports.registerVendorCost = onCall(async (request) => {
  const { data, auth } = request;

  if (!auth || auth.token.role !== 'guide') {
    throw new HttpsError('unauthenticated', 'Must be authenticated guide');
  }

  const guideId = auth.token.guideId;
  const db = getFirestore();

  if (!data.shiftId || !data.numPax || !Array.isArray(data.vendors) || data.vendors.length === 0) {
    throw new HttpsError('invalid-argument', 'Missing required fields');
  }

  if (data.numPax < 1 || data.numPax > 20) {
    throw new HttpsError('invalid-argument', 'numPax must be between 1 and 20');
  }

  try {
    const shiftSnap = await db
      .collection('guides')
      .doc(guideId)
      .collection('shifts')
      .doc(data.shiftId)
      .get();

    if (!shiftSnap.exists) {
      throw new HttpsError('not-found', 'Shift not found');
    }

    const shift = shiftSnap.data();

    if (shift.estado !== 'ASIGNADO') {
      throw new HttpsError('failed-precondition', 'Shift not assigned');
    }

    const shiftDate = new Date(shift.fecha);
    const today = new Date();
    const diffDays = Math.floor((today - shiftDate) / (1000 * 60 * 60 * 24));

    if (diffDays > 7) {
      throw new HttpsError('failed-precondition', 'Cannot register vendor costs older than 7 days');
    }

    const existingSnap = await db
      .collection('vendor_costs')
      .where('shiftId', '==', data.shiftId)
      .where('guideId', '==', guideId)
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      throw new HttpsError('already-exists', 'Vendor cost already registered for this shift');
    }

    const vendorIds = data.vendors.map(v => v.vendorId);
    const vendorsSnap = await db
      .collection('vendors')
      .where('__name__', 'in', vendorIds)
      .get();

    if (vendorsSnap.size !== vendorIds.length) {
      throw new HttpsError('not-found', 'One or more vendors not found');
    }

    const inactiveVendor = vendorsSnap.docs.find(doc => doc.data().estado !== 'activo');
    if (inactiveVendor) {
      throw new HttpsError('failed-precondition', `Vendor ${inactiveVendor.data().nombre} is inactive`);
    }

    const guideSnap = await db.collection('guides').doc(guideId).get();
    const guide = guideSnap.data();

    const salarioCalculado = await calculateSalary(data.numPax);
    const totalVendors = data.vendors.reduce((sum, v) => sum + v.importe, 0);

    const vendorCostRef = await db.collection('vendor_costs').add({
      shiftId: data.shiftId,
      guideId,
      guideName: guide.nombre,
      fecha: shift.fecha,
      slot: shift.slot,
      tourDescription: data.tourDescription || 'Tour sin descripción',
      numPax: data.numPax,
      vendors: data.vendors.map((v, idx) => ({
        vendorId: v.vendorId,
        vendorName: vendorsSnap.docs[idx].data().nombre,
        importe: v.importe,
        driveFileId: null
      })),
      totalVendors,
      salarioCalculado,
      editedByManager: false,
      editHistory: [],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    logger.info('Vendor cost registered', {
      vendorCostId: vendorCostRef.id,
      guideId,
      shiftId: data.shiftId,
      numPax: data.numPax,
      salarioCalculado
    });

    return {
      success: true,
      vendorCostId: vendorCostRef.id,
      salarioCalculado
    };

  } catch (error) {
    logger.error('Error registering vendor cost', {
      guideId,
      shiftId: data.shiftId,
      error: error.message
    });

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError('internal', 'Failed to register vendor cost');
  }
});

// =========================================
// FUNCTION: calculateSalaryPreview (UNCHANGED)
// =========================================
exports.calculateSalaryPreview = onCall(async (request) => {
  const { data, auth } = request;

  if (!auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }

  if (!data.numPax || data.numPax < 1 || data.numPax > 20) {
    throw new HttpsError('invalid-argument', 'numPax must be between 1 and 20');
  }

  try {
    const salario = await calculateSalary(data.numPax);

    return {
      salario,
      numPax: data.numPax
    };
  } catch (error) {
    logger.error('Error calculating salary preview', {
      numPax: data.numPax,
      error: error.message
    });
    throw new HttpsError('internal', 'Failed to calculate salary');
  }
});
