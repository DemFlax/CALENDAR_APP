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

      // MARCA DE AGUA (logo texto)
      doc.fontSize(120).font('Helvetica-Bold').fillColor('#f0f0f0').opacity(0.1)
         .text('SFS', 0, 300, { align: 'center', width: 595 });
      doc.opacity(1);

      // HEADER elegante gris oscuro
      doc.rect(0, 0, 595, 100).fill('#1e293b');
      
      doc.fontSize(26).font('Helvetica-Bold').fillColor('#ffffff')
         .text('SPAIN FOOD SHERPAS', 50, 30);
      doc.fontSize(9).font('Helvetica').fillColor('#cbd5e1')
         .text('Premium Food Tours · Madrid', 50, 62);

      // Número factura y fecha (derecha, sin solapar)
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#ffffff')
         .text(`FACTURA Nº ${invoiceData.invoiceNumber}`, 320, 32, { align: 'right', width: 225 });
      doc.fontSize(8).fillColor('#cbd5e1')
         .text(new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }), 
               320, 58, { align: 'right', width: 225 });

      // EMISOR Y RECEPTOR
      const startY = 130;
      
      doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold')
         .text('EMISOR', 50, startY);
      doc.fillColor('#334155').fontSize(10).font('Helvetica')
         .text(invoiceData.guide.nombre, 50, startY + 18)
         .text(`DNI: ${invoiceData.guide.dni}`, 50, startY + 32);
      if (invoiceData.guide.direccion) {
        doc.text(invoiceData.guide.direccion, 50, startY + 46);
      }

      doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold')
         .text('RECEPTOR', 320, startY);
      doc.fillColor('#334155').fontSize(10).font('Helvetica')
         .text(invoiceData.company.razonSocial, 320, startY + 18)
         .text(`CIF: ${invoiceData.company.cif}`, 320, startY + 32)
         .text(invoiceData.company.direccion, 320, startY + 46);

      // CONCEPTO
      const [year, month] = invoiceData.month.split('-');
      const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                         'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      const monthName = monthNames[parseInt(month) - 1];

      doc.fillColor('#475569').fontSize(11).font('Helvetica-Bold')
         .text(`CONCEPTO: Servicios guía turístico - ${monthName} ${year}`, 50, startY + 75);

      // TABLA
      const tableTop = startY + 105;
      
      doc.rect(50, tableTop, 495, 22).fill('#f1f5f9');
      doc.fillColor('#0f172a').fontSize(9).font('Helvetica-Bold');
      doc.text('FECHA', 55, tableTop + 6);
      doc.text('TOUR', 120, tableTop + 6);
      doc.text('PAX', 360, tableTop + 6, { width: 40, align: 'center' });
      doc.text('SALARIO', 420, tableTop + 6, { width: 120, align: 'right' });

      let y = tableTop + 26;
      
      invoiceData.tours.forEach((tour, idx) => {
        if (idx % 2 === 0) {
          doc.rect(50, y - 2, 495, 16).fill('#fafafa');
        }

        const dateObj = new Date(tour.fecha);
        const dateStr = dateObj.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }).toUpperCase();

        doc.fillColor('#475569').fontSize(8).font('Helvetica');
        doc.text(dateStr, 55, y);
        doc.text(tour.tourDescription.substring(0, 40), 120, y);
        doc.text(tour.numPax.toString(), 360, y, { width: 40, align: 'center' });
        
        const salary = tour.salarioCalculado || 0;
        doc.fillColor('#0f172a').font('Helvetica-Bold')
           .text(`${salary.toFixed(2)}€`, 420, y, { width: 120, align: 'right' });
        
        y += 16;
      });

      y += 8;
      doc.strokeColor('#cbd5e1').lineWidth(1)
         .moveTo(50, y).lineTo(545, y).stroke();
      y += 15;

      // TOTALES
      const rightX = 420;
      doc.fillColor('#334155').fontSize(9).font('Helvetica');

      doc.text('TOTAL BRUTO:', rightX - 100, y);
      doc.font('Helvetica-Bold').text(`${invoiceData.totalSalary.toFixed(2)}€`, rightX, y, { width: 120, align: 'right' });
      y += 16;

      doc.font('Helvetica').text('BASE IMPONIBLE:', rightX - 100, y);
      doc.text(`${invoiceData.baseImponible.toFixed(2)}€`, rightX, y, { width: 120, align: 'right' });
      y += 16;

      doc.text('IVA (21%):', rightX - 100, y);
      doc.text(`${invoiceData.iva.toFixed(2)}€`, rightX, y, { width: 120, align: 'right' });
      y += 16;

      doc.fillColor('#dc2626').text(`IRPF (${invoiceData.irpfPercent}%):`, rightX - 100, y);
      doc.text(`-${invoiceData.irpfAmount.toFixed(2)}€`, rightX, y, { width: 120, align: 'right' });
      y += 22;

      // Total neto
      doc.rect(rightX - 105, y - 4, 245, 26).fill('#1e293b');
      doc.fillColor('#ffffff').fontSize(11).font('Helvetica-Bold');
      doc.text('TOTAL NETO:', rightX - 95, y + 2);
      doc.fontSize(13).text(`${invoiceData.totalNeto.toFixed(2)}€`, rightX, y + 1, { width: 120, align: 'right' });

      // FOOTER
      doc.fillColor('#64748b').fontSize(8).font('Helvetica');
      doc.text('Madrid, ' + new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }),
               50, 750, { align: 'center', width: 495 });
      doc.fontSize(7).fillColor('#94a3b8')
         .text('madrid@spainfoodsherpas.com · www.spainfoodsherpas.com', 
               50, 770, { align: 'center', width: 495 });

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
          status: 'MANAGER_REVIEW',
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
          editedByManager: false,
          guideComments: null,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });

        logger.info('Factura generada', {
          invoiceId: invoiceRef.id,
          guideId,
          guideName: guide.nombre,
          totalSalary,
          status: 'MANAGER_REVIEW'
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
            <p><strong>Mes:</strong> ${invoice.month}</p>
            <p>El PDF se adjunta en este email y está disponible en tu dashboard.</p>
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
            <p>PDF disponible en Drive.</p>
          </div>
        `
      }),
      /*
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
            <p>Revisa el PDF adjunto para los detalles.</p>
          </div>
        `,
        attachments: [{
          content: pdfBuffer.toString('base64'),
          filename: `${invoiceNumber.replace('/', '-')}.pdf`,
          type: 'application/pdf',
          disposition: 'attachment'
        }]
      })
        */
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

    const guideComments = data.comments || 'Sin comentarios específicos';

    await db.collection('guide_invoices').doc(data.invoiceId).update({
      status: 'ERROR_REPORTED',
      guideComments: guideComments,
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
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h3>Error reportado en factura</h3>
          <p><strong>Guía:</strong> ${guide.nombre}</p>
          <p><strong>Email:</strong> ${guide.email}</p>
          <p><strong>Mes:</strong> ${invoice.month}</p>
          <p><strong>Tours:</strong> ${invoice.tours.length}</p>
          <hr style="margin: 20px 0;">
          <p><strong>Comentarios del guía:</strong></p>
          <p style="background: #f5f5f5; padding: 15px; border-left: 4px solid #ef4444; font-style: italic;">${guideComments}</p>
          <hr style="margin: 20px 0;">
          <p>Por favor, revisa los datos en el dashboard de facturas y contacta con el guía si es necesario.</p>
          <p><a href="https://calendar-app-tours.web.app/manager-invoices.html" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Ir a Dashboard</a></p>
        </div>
      `
    });

    logger.info('Invoice error reported', {
      invoiceId: data.invoiceId,
      guideId,
      guideName: guide.nombre,
      comments: guideComments
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

// =========================================
// FUNCTION: managerApproveInvoice
// =========================================
exports.managerApproveInvoice = onCall({
  cors: true,
  secrets: [sendgridKey]
}, async (request) => {
  const { data, auth } = request;

  if (!auth || auth.token.role !== 'manager') {
    throw new HttpsError('permission-denied', 'Solo managers');
  }

  if (!data.invoiceId || !data.tours || data.totalSalary === undefined) {
    throw new HttpsError('invalid-argument', 'Faltan campos requeridos');
  }

  try {
    const db = getFirestore();
    const invoiceSnap = await db.collection('guide_invoices').doc(data.invoiceId).get();

    if (!invoiceSnap.exists) {
      throw new HttpsError('not-found', 'Factura no encontrada');
    }

    const invoice = invoiceSnap.data();

    // Recalcular IVA con el nuevo total
    const baseImponible = data.totalSalary / 1.21;
    const iva = baseImponible * 0.21;

    // Actualizar factura en Firestore
    await db.collection('guide_invoices').doc(data.invoiceId).update({
      tours: data.tours,
      totalSalary: parseFloat(data.totalSalary.toFixed(2)),
      baseImponible: parseFloat(baseImponible.toFixed(2)),
      iva: parseFloat(iva.toFixed(2)),
      status: 'PENDING_APPROVAL',
      editedByManager: true,
      managerEditedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    // Email al guía
    sgMail.setApiKey(sendgridKey.value());
    await sgMail.send({
      to: invoice.guideEmail,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject: `Factura ${invoice.month} lista para revisión`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2>Tu factura está lista</h2>
          <p>Hola ${invoice.guideName},</p>
          <p>La factura de <strong>${invoice.month}</strong> ha sido revisada por el manager.</p>
          <p>Accede a tu dashboard para revisar y aprobar la factura.</p>
          <div style="margin: 20px 0;">
            <a href="https://calendar-app-tours.web.app/my-invoices.html" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
              Revisar Factura
            </a>
          </div>
          <hr style="margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">Spain Food Sherpas</p>
        </div>
      `
    });

    logger.info('Invoice approved by manager', {
      invoiceId: data.invoiceId,
      guideId: invoice.guideId,
      totalSalary: data.totalSalary
    });

    return { success: true };

  } catch (error) {
    logger.error('Error in managerApproveInvoice', {
      invoiceId: data.invoiceId,
      error: error.message
    });

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError('internal', 'Error al aprobar factura');
  }
});