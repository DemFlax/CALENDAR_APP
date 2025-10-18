// =========================================
// VENDOR COSTS MODULE - COMPLETO
// =========================================
// INSTALACIÓN REQUERIDA:
// cd functions
// npm install pdfkit@0.17.2
// npm install node-fetch@2.7.0 (ya instalado)
// =========================================

const functions = require('firebase-functions');
const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {onSchedule} = require('firebase-functions/v2/scheduler');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');
const {logger} = require('firebase-functions');
const {defineSecret} = require('firebase-functions/params');
const sgMail = require('@sendgrid/mail');
const PDFDocument = require('pdfkit');
const fetch = require('node-fetch');

// Secrets
const sendgridKey = defineSecret('SENDGRID_API_KEY');

// Config
const MANAGER_EMAIL = process.env.MANAGER_EMAIL || 'madrid@spainfoodsherpas.com';
const ACCOUNTING_EMAIL = 'contabilidad@spainfoodsherpas.com';
const FROM_EMAIL = 'madrid@spainfoodsherpas.com';
const FROM_NAME = 'Spain Food Sherpas';
const DRIVE_FOLDER_ID = '1NKpwoOvBPlXKI8dQCI9GlN9hYUrTMRP3';

// =========================================
// HELPER: Calculate Salary
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
    
    return range.pagoBruto;
  } catch (error) {
    logger.error('Error calculating salary', { numPax, error: error.message });
    throw error;
  }
}

// =========================================
// HELPER: Generate Invoice PDF
// =========================================
async function generateInvoicePDF(invoiceData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(24).font('Helvetica-Bold').text('SPAIN FOOD SHERPAS', { align: 'center' });
      doc.fontSize(10).font('Helvetica').text('Est. 2013', { align: 'center' });
      doc.moveDown(0.5);

      doc.fontSize(18).font('Helvetica-Bold').text(`FACTURA N.º ${invoiceData.invoiceNumber}`, { align: 'right' });
      doc.moveDown(2);

      doc.fontSize(12).font('Helvetica-Bold').text('EMISOR:');
      doc.fontSize(10).font('Helvetica');
      doc.text(invoiceData.guide.nombre);
      doc.text(`DNI: ${invoiceData.guide.dni}`);
      if (invoiceData.guide.direccion) {
        doc.text(invoiceData.guide.direccion);
      }
      doc.moveDown();

      doc.fontSize(12).font('Helvetica-Bold').text('RECEPTOR:');
      doc.fontSize(10).font('Helvetica');
      doc.text(invoiceData.company.razonSocial);
      doc.text(`CIF: ${invoiceData.company.cif}`);
      doc.text(invoiceData.company.direccion);
      doc.moveDown();

      const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                         'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      const [year, month] = invoiceData.month.split('-');
      const monthName = monthNames[parseInt(month) - 1];

      doc.fontSize(10).text(`Fecha: ${new Date().toLocaleDateString('es-ES')}`);
      doc.fontSize(12).font('Helvetica-Bold').text(`CONCEPTO: Servicios guía turístico - ${monthName} ${year}`);
      doc.moveDown();

      doc.fontSize(11).font('Helvetica-Bold').text('DETALLE TOURS:');
      doc.moveDown(0.3);

      const tableTop = doc.y;
      const colWidths = { fecha: 80, tour: 200, pax: 50, salario: 80 };
      let y = tableTop;

      doc.fontSize(9).font('Helvetica-Bold');
      doc.text('Fecha', 50, y, { width: colWidths.fecha });
      doc.text('Tour', 130, y, { width: colWidths.tour });
      doc.text('Pax', 330, y, { width: colWidths.pax });
      doc.text('Salario', 380, y, { width: colWidths.salario, align: 'right' });

      y += 15;
      doc.moveTo(50, y).lineTo(550, y).stroke();
      y += 5;

      doc.font('Helvetica');
      invoiceData.tours.forEach(tour => {
        const dateStr = new Date(tour.fecha).toLocaleDateString('es-ES', {
          day: '2-digit',
          month: 'short'
        }).toUpperCase();

        doc.text(dateStr, 50, y, { width: colWidths.fecha });
        doc.text(tour.tourDescription.substring(0, 35), 130, y, { width: colWidths.tour });
        doc.text(tour.numPax.toString(), 330, y, { width: colWidths.pax });
        const salary = tour.salarioCalculado || 0;
        doc.text(`${salary.toFixed(2)}€`, 380, y, { width: colWidths.salario, align: 'right' });
        y += 20;
      });

      y += 10;
      doc.moveTo(50, y).lineTo(550, y).stroke();
      y += 15;

      doc.font('Helvetica-Bold').fontSize(10);
      const rightX = 460;

      const totalSalary = invoiceData.totalSalary || 0;
      const baseImponible = invoiceData.baseImponible || 0;
      const iva = invoiceData.iva || 0;
      const irpfAmount = invoiceData.irpfAmount || 0;
      const totalNeto = invoiceData.totalNeto || 0;

      doc.text('TOTAL BRUTO:', rightX - 100, y);
      doc.text(`${totalSalary.toFixed(2)}€`, rightX, y, { align: 'right' });
      y += 20;

      doc.text('BASE IMPONIBLE:', rightX - 100, y);
      doc.text(`${baseImponible.toFixed(2)}€`, rightX, y, { align: 'right' });
      y += 20;

      doc.text('IVA (21%):', rightX - 100, y);
      doc.text(`${iva.toFixed(2)}€`, rightX, y, { align: 'right' });
      y += 20;

      doc.text(`IRPF (${invoiceData.irpfPercent}%):`, rightX - 100, y);
      doc.text(`-${irpfAmount.toFixed(2)}€`, rightX, y, { align: 'right' });
      y += 25;

      doc.moveTo(rightX - 100, y).lineTo(550, y).stroke();
      y += 10;

      doc.fontSize(12);
      doc.text('TOTAL NETO:', rightX - 100, y);
      doc.text(`${totalNeto.toFixed(2)}€`, rightX, y, { align: 'right' });

      doc.fontSize(8).font('Helvetica');
      doc.text(`Madrid, ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}`,
               50, 750, { align: 'center' });

      doc.end();

    } catch (error) {
      reject(error);
    }
  });
}

// =========================================
// HELPER: Upload PDF to Drive via Apps Script
// =========================================
async function uploadInvoicePDF(pdfBuffer, invoiceData) {
  const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || functions.config().apps_script?.url;

  if (!APPS_SCRIPT_URL) {
    throw new Error('APPS_SCRIPT_URL not configured');
  }

  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'uploadInvoice',
        guideId: invoiceData.guideId,
        guideName: invoiceData.guideName,
        invoiceNumber: invoiceData.invoiceNumber,
        month: invoiceData.month,
        pdfBase64: pdfBuffer.toString('base64'),
        apiKey: 'sfs-calendar-2024-secure-key', 
        folderParentId: DRIVE_FOLDER_ID
      })
    });

    if (!response.ok) {
      throw new Error(`Apps Script error: ${response.statusText}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Upload failed');
    }

    return {
      driveFileId: result.driveFileId,
      driveUrl: result.driveUrl
    };

  } catch (error) {
    logger.error('Error uploading PDF to Drive', { error: error.message });
    throw error;
  }
}

// =========================================
// FUNCTION: generateGuideInvoices (SCHEDULED)
// =========================================
exports.generateGuideInvoices = onSchedule({
  schedule: '0 0 1 * *',
  timeZone: 'UTC',
  secrets: [sendgridKey]
}, async (event) => {
  logger.info('Iniciando generación facturas guías');

  try {
    const db = getFirestore();

    const today = new Date();
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const year = lastMonth.getFullYear();
    const month = String(lastMonth.getMonth() + 1).padStart(2, '0');
    const invoiceMonth = `${year}-${month}`;

    const startDate = `${year}-${month}-01`;
    const lastDay = new Date(year, lastMonth.getMonth() + 1, 0).getDate();
    const endDate = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;

    logger.info('Procesando mes', { invoiceMonth, startDate, endDate });

    const guidesSnap = await db.collection('guides')
      .where('estado', '==', 'activo')
      .get();

    if (guidesSnap.empty) {
      logger.info('No hay guías activos');
      return;
    }

    let generated = 0;
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

        costsSnap.forEach(doc => {
          const cost = doc.data();
          totalSalary += cost.salarioCalculado;
          tours.push({
            fecha: cost.fecha,
            slot: cost.slot,
            tourDescription: cost.tourDescription,
            numPax: cost.numPax,
            salarioCalculado: cost.salarioCalculado,
            vendorCostId: doc.id
          });
        });

        const baseImponible = totalSalary / 1.21;
        const iva = baseImponible * 0.21;

        const invoiceRef = await db.collection('guide_invoices').add({
          guideId,
          guideName: guide.nombre,
          guideEmail: guide.email,
          month: invoiceMonth,
          status: 'PENDING_APPROVAL',
          tours,
          totalSalary: parseFloat(totalSalary.toFixed(2)),
          baseImponible: parseFloat(baseImponible.toFixed(2)),
          iva: parseFloat(iva.toFixed(2)),
          irpfPercent: null,
          irpfAmount: null,
          totalNeto: null,
          invoiceNumber: null,
          pdfDriveId: null,
          pdfDriveUrl: null,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });

        logger.info('Factura generada', {
          invoiceId: invoiceRef.id,
          guideId,
          guideName: guide.nombre,
          totalSalary
        });

        sgMail.setApiKey(sendgridKey.value());
        await sgMail.send({
          to: guide.email,
          from: { email: FROM_EMAIL, name: FROM_NAME },
          subject: `Factura ${invoiceMonth} lista para revisión`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px;">
              <h2>Factura lista para aprobación</h2>
              <p>Hola ${guide.nombre},</p>
              <p>Tu factura del mes <strong>${invoiceMonth}</strong> está lista para revisión.</p>
              <p><strong>Total bruto:</strong> ${totalSalary.toFixed(2)}€</p>
              <p>Accede a tu dashboard para revisar y aprobar la factura.</p>
              <hr style="margin: 20px 0;">
              <p style="color: #999; font-size: 12px;">Spain Food Sherpas</p>
            </div>
          `
        });

        generated++;

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

    if (errors.length > 0) {
      logger.warn('Errores durante generación', { errors });
    }

  } catch (error) {
    logger.error('Error crítico generando facturas', { error: error.message, stack: error.stack });
    throw error;
  }
});

exports.approveInvoice = onCall({
  cors: true,
  secrets: [sendgridKey]
}, async (request) => {
  logger.info('=== approveInvoice STARTED ===', { 
    data: request.data,
    authUid: request.auth?.uid 
  });
  const { data, auth } = request;

  if (!auth || auth.token.role !== 'guide') {
    throw new HttpsError('unauthenticated', 'Must be authenticated guide');
  }

  const guideId = auth.token.guideId;
  const db = getFirestore();

  if (!data.invoiceId) {
    throw new HttpsError('invalid-argument', 'invoiceId required');
  }

  if (data.irpfPercent === undefined || data.irpfPercent < 0 || data.irpfPercent > 100) {
    throw new HttpsError('invalid-argument', 'irpfPercent must be between 0-100');
  }

  if (!data.useAutoNumber && !data.invoiceNumber) {
    throw new HttpsError('invalid-argument', 'Must provide invoiceNumber or useAutoNumber');
  }

  try {
    logger.info('Step 1: Getting invoice');
    const invoiceSnap = await db.collection('guide_invoices').doc(data.invoiceId).get();

    if (!invoiceSnap.exists) {
      throw new HttpsError('not-found', 'Invoice not found');
    }

    const invoice = invoiceSnap.data();

    if (invoice.guideId !== guideId) {
      throw new HttpsError('permission-denied', 'Not your invoice');
    }

    if (invoice.status !== 'PENDING_APPROVAL') {
      throw new HttpsError('failed-precondition', 'Invoice already processed');
    }

    logger.info('Step 2: Getting guide data');
    const guideSnap = await db.collection('guides').doc(guideId).get();
    const guide = guideSnap.data();

    let invoiceNumber;
    let invoiceMode;

    logger.info('Step 3: Determining invoice number');
    if (data.useAutoNumber) {
      if (guide.invoiceMode === 'MANUAL') {
        throw new HttpsError(
          'failed-precondition',
          'No puedes usar numeración automática después de usar manual'
        );
      }

      const nextNumber = (guide.lastInvoiceNumber || 0) + 1;
      const year = new Date().getFullYear().toString().slice(-2);
      invoiceNumber = `SFS-${String(nextNumber).padStart(3, '0')}/${year}`;
      invoiceMode = 'AUTO';

      await db.collection('guides').doc(guideId).update({
        invoiceMode: 'AUTO',
        lastInvoiceNumber: FieldValue.increment(1)
      });

    } else {
      const existingSnap = await db.collection('guide_invoices')
        .where('guideId', '==', guideId)
        .where('invoiceNumber', '==', data.invoiceNumber)
        .limit(1)
        .get();

      if (!existingSnap.empty) {
        throw new HttpsError('already-exists', `Número ${data.invoiceNumber} ya usado`);
      }

      invoiceNumber = data.invoiceNumber;
      invoiceMode = 'MANUAL';

      if (!guide.invoiceMode) {
        await db.collection('guides').doc(guideId).update({
          invoiceMode: 'MANUAL'
        });
      }
    }

    logger.info('Step 4: Calculating totals', { invoiceNumber });
    const irpfAmount = invoice.totalSalary * (data.irpfPercent / 100);
    const totalNeto = invoice.totalSalary - irpfAmount;

    if (data.saveIrpfDefault) {
      await db.collection('guides').doc(guideId).update({
        defaultIrpfPercent: data.irpfPercent
      });
    }

    logger.info('Step 5: Getting company data');
    const companySnap = await db.collection('config').doc('company_data').get();
    if (!companySnap.exists) {
      throw new HttpsError('failed-precondition', 'Company data not configured');
    }
    const company = companySnap.data();

    logger.info('Step 6: Generating PDF');
    const pdfBuffer = await generateInvoicePDF({
      invoiceNumber,
      guide: {
        nombre: guide.nombre,
        dni: guide.dni,
        direccion: guide.direccion,
        email: guide.email
      },
      company,
      month: invoice.month,
      tours: invoice.tours,
      totalSalary: invoice.totalSalary,
      baseImponible: invoice.baseImponible,
      iva: invoice.iva,
      irpfPercent: data.irpfPercent,
      irpfAmount: parseFloat(irpfAmount.toFixed(2)),
      totalNeto: parseFloat(totalNeto.toFixed(2))
    });

    logger.info('PDF generated', { size: pdfBuffer.length });

    logger.info('Step 7: Uploading to Drive');
    const uploadResult = await uploadInvoicePDF(pdfBuffer, {
      guideId,
      guideName: guide.nombre,
      invoiceNumber,
      month: invoice.month
    });

    logger.info('PDF uploaded to Drive', uploadResult);

    logger.info('Step 8: Updating invoice document');
    await db.collection('guide_invoices').doc(data.invoiceId).update({
      status: 'APPROVED',
      invoiceNumber,
      irpfPercent: data.irpfPercent,
      irpfAmount: parseFloat(irpfAmount.toFixed(2)),
      totalNeto: parseFloat(totalNeto.toFixed(2)),
      pdfDriveId: uploadResult.driveFileId,
      pdfDriveUrl: uploadResult.driveUrl,
      approvedAt: FieldValue.serverTimestamp(),
      approvedBy: guideId,
      updatedAt: FieldValue.serverTimestamp()
    });

    logger.info('Step 9: Sending emails');
    sgMail.setApiKey(sendgridKey.value());

    const emailPromises = [
      sgMail.send({
        to: guide.email,
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject: `Factura ${invoiceNumber} aprobada`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px;">
            <h2>Factura aprobada correctamente</h2>
            <p>Hola ${guide.nombre},</p>
            <p>Tu factura <strong>${invoiceNumber}</strong> ha sido aprobada.</p>
            <ul>
              <li>Mes: ${invoice.month}</li>
              <li>Total bruto: ${invoice.totalSalary.toFixed(2)}€</li>
              <li>IRPF (${data.irpfPercent}%): -${irpfAmount.toFixed(2)}€</li>
              <li><strong>Total neto: ${totalNeto.toFixed(2)}€</strong></li>
            </ul>
            <p>El PDF se adjunta en este email.</p>
            <hr style="margin: 20px 0;">
            <p style="color: #999; font-size: 12px;">Spain Food Sherpas</p>
          </div>
        `,
        attachments: [{
          content: pdfBuffer.toString('base64'),
          filename: `${invoiceNumber.replace('/', '-')}.pdf`,
          type: 'application/pdf',
          disposition: 'attachment'
        }]
      }),

      sgMail.send({
        to: MANAGER_EMAIL,
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject: `Nueva factura aprobada: ${guide.nombre} - ${invoiceNumber}`,
        html: `
          <div style="font-family: Arial, sans-serif;">
            <h3>Factura aprobada por guía</h3>
            <p><strong>Guía:</strong> ${guide.nombre}</p>
            <p><strong>Factura:</strong> ${invoiceNumber}</p>
            <p><strong>Mes:</strong> ${invoice.month}</p>
            <p><strong>Total neto:</strong> ${totalNeto.toFixed(2)}€</p>
            <p>PDF disponible en Drive.</p>
          </div>
        `
      }),

      sgMail.send({
        to: ACCOUNTING_EMAIL,
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject: `Factura guía ${invoiceNumber} - ${guide.nombre}`,
        html: `
          <div style="font-family: Arial, sans-serif;">
            <h3>Nueva factura guía</h3>
            <p><strong>Guía:</strong> ${guide.nombre}</p>
            <p><strong>Factura:</strong> ${invoiceNumber}</p>
            <p><strong>Mes:</strong> ${invoice.month}</p>
            <p><strong>Total neto a pagar:</strong> ${totalNeto.toFixed(2)}€</p>
          </div>
        `,
        attachments: [{
          content: pdfBuffer.toString('base64'),
          filename: `${invoiceNumber.replace('/', '-')}.pdf`,
          type: 'application/pdf',
          disposition: 'attachment'
        }]
      })
    ];

    await Promise.all(emailPromises);
    logger.info('Emails sent successfully');

    logger.info('=== approveInvoice COMPLETED ===', {
      invoiceId: data.invoiceId,
      invoiceNumber,
      guideId,
      totalNeto
    });

    return {
      success: true,
      invoiceNumber,
      totalNeto,
      pdfUrl: uploadResult.driveUrl
    };

  } catch (error) {
    logger.error('=== approveInvoice FAILED ===', {
      invoiceId: data.invoiceId,
      guideId,
      error: error.message,
      stack: error.stack
    });

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError('internal', 'Failed to approve invoice');
  }
});

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

exports.reportInvoiceError = onCall({
  cors: true,
  secrets: [sendgridKey]
}, async (request) => {
  const { data, auth } = request;

  if (!auth || auth.token.role !== 'guide') {
    throw new HttpsError('unauthenticated', 'Must be authenticated guide');
  }

  const guideId = auth.token.guideId;
  const db = getFirestore();

  if (!data.invoiceId) {
    throw new HttpsError('invalid-argument', 'invoiceId required');
  }

  try {
    const invoiceSnap = await db.collection('guide_invoices').doc(data.invoiceId).get();

    if (!invoiceSnap.exists) {
      throw new HttpsError('not-found', 'Invoice not found');
    }

    const invoice = invoiceSnap.data();

    if (invoice.guideId !== guideId) {
      throw new HttpsError('permission-denied', 'Not your invoice');
    }

    if (invoice.status !== 'PENDING_APPROVAL') {
      throw new HttpsError('failed-precondition', 'Invoice already processed');
    }

    await db.collection('guide_invoices').doc(data.invoiceId).update({
      status: 'ERROR_REPORTED',
      updatedAt: FieldValue.serverTimestamp()
    });

    const guideSnap = await db.collection('guides').doc(guideId).get();
    const guide = guideSnap.data();

    sgMail.setApiKey(sendgridKey.value());
    await sgMail.send({
      to: MANAGER_EMAIL,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject: `⚠️ Error reportado en factura: ${guide.nombre} - ${invoice.month}`,
      html: `
        <div style="font-family: Arial, sans-serif;">
          <h3>Error reportado en factura</h3>
          <p><strong>Guía:</strong> ${guide.nombre}</p>
          <p><strong>Email:</strong> ${guide.email}</p>
          <p><strong>Mes:</strong> ${invoice.month}</p>
          <p><strong>Total:</strong> ${invoice.totalSalary.toFixed(2)}€</p>
          <p><strong>Tours:</strong> ${invoice.tours.length}</p>
          <hr>
          <p>El guía ha reportado un error en su factura. Por favor, revisa los datos y contacta con el guía.</p>
        </div>
      `
    });

    logger.info('Invoice error reported', {
      invoiceId: data.invoiceId,
      guideId,
      guideName: guide.nombre
    });

    return { success: true };

  } catch (error) {
    logger.error('Error reporting invoice error', {
      invoiceId: data.invoiceId,
      guideId,
      error: error.message
    });

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError('internal', 'Failed to report error');
  }
});

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
    logger.error('Error calculating salary preview', { numPax: data.numPax, error: error.message });
    throw new HttpsError('internal', 'Failed to calculate salary');
  }
});