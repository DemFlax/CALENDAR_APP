import { auth, db } from './firebase-config.js';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  getDoc
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js';

// Auto dark mode
if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
  document.documentElement.classList.add('dark');
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  document.documentElement.classList.toggle('dark', e.matches);
});

// i18n
const i18n = {
  es: {
    pageTitle: 'Mis Facturas',
    pendingTitle: 'Reportes Pendientes de Revisión',
    waitingTitle: 'Esperando Subir Factura',
    historyTitle: 'Historial de Facturas',
    noPending: 'No tienes reportes pendientes',
    noWaiting: 'No tienes facturas pendientes de subir',
    noHistory: 'No hay historial de facturas',
    viewDetail: 'Ver Detalle',
    month: 'Mes',
    total: 'Total',
    status: 'Estado',
    statusPending: '⏳ Pendiente',
    statusWaiting: '⏱️ Esperando Factura',
    statusOverdue: '⚠️ Vencida',
    statusApproved: '✅ Completada',
    statusRejected: '✗ Rechazada',
    modalTitle: 'Reporte Mensual',
    guideInfo: 'Información del Guía',
    dateCol: 'Fecha',
    slotCol: 'Turno',
    tourCol: 'Tour',
    paxCol: 'PAX',
    salaryCol: 'Salario (sin IVA)',
    baseLabel: 'Total (sin IVA)',
    ivaLabel: '',
    totalLabel: 'TOTAL (sin IVA)',
    approveBtn: 'Aprobar Reporte',
    rejectBtn: 'Rechazar Reporte',
    waitingLabel: 'Reporte aprobado - Pendiente factura oficial',
    uploadDeadlineText: 'Plazo máximo',
    uploadBtn: 'Subir Factura Oficial (PDF)',
    approvedLabel: 'Factura Completada',
    rejectedLabel: 'Reporte Rechazado',
    downloadPdf: 'Ver Factura en Drive',
    pdfDeleted: '⚠️ Factura eliminada de Drive',
    pdfDeletedError: 'La factura PDF fue eliminada de Drive. Contacta al manager.',
    invoiceNumber: 'Nº Factura',
    approvedOn: 'Completada el',
    rejectModalTitle: 'Rechazar Reporte',
    rejectCommentsLabel: 'Motivo del rechazo',
    rejectPlaceholder: 'Describe el problema encontrado...',
    cancelBtn: 'Cancelar',
    confirmRejectBtn: 'Confirmar Rechazo',
    uploadModalTitle: 'Subir Factura Oficial',
    invoiceNumberLabel: 'Número de Factura',
    invoiceNumberPlaceholder: '2025/042',
    pdfFileLabel: 'Archivo PDF',
    pdfHelpText: 'Solo archivos PDF. Máximo 10MB',
    confirmUploadBtn: 'Subir Factura',
    toastApproving: 'Aprobando reporte...',
    toastApproved: 'Reporte aprobado. Ahora sube tu factura oficial.',
    toastRejecting: 'Rechazando...',
    toastRejected: 'Reporte rechazado correctamente',
    toastUploading: 'Subiendo factura...',
    toastUploaded: 'Factura subida correctamente',
    toastError: 'Error al procesar',
    toastCommentsRequired: 'Debes escribir el motivo del rechazo',
    toastInvoiceNumberRequired: 'Debes introducir el número de factura',
    toastPdfRequired: 'Debes seleccionar un archivo PDF',
    toastPdfTooLarge: 'El archivo es demasiado grande (máx 10MB)',
    morning: 'Mañana',
    afternoon: 'Tarde',
    calendar: 'Calendario',
    logout: 'Salir'
  },
  en: {
    pageTitle: 'My Invoices',
    pendingTitle: 'Reports Pending Review',
    waitingTitle: 'Waiting to Upload Invoice',
    historyTitle: 'Invoice History',
    noPending: 'No pending reports',
    noWaiting: 'No invoices pending upload',
    noHistory: 'No invoice history',
    viewDetail: 'View Details',
    month: 'Month',
    total: 'Total',
    status: 'Status',
    statusPending: '⏳ Pending',
    statusWaiting: '⏱️ Waiting Invoice',
    statusOverdue: '⚠️ Overdue',
    statusApproved: '✅ Completed',
    statusRejected: '✗ Rejected',
    modalTitle: 'Monthly Report',
    guideInfo: 'Guide Information',
    dateCol: 'Date',
    slotCol: 'Shift',
    tourCol: 'Tour',
    paxCol: 'PAX',
    salaryCol: 'Salary (excl. VAT)',
    baseLabel: 'Total (excl. VAT)',
    ivaLabel: '',
    totalLabel: 'TOTAL (excl. VAT)',
    approveBtn: 'Approve Report',
    rejectBtn: 'Reject Report',
    waitingLabel: 'Report approved - Pending official invoice',
    uploadDeadlineText: 'Deadline',
    uploadBtn: 'Upload Official Invoice (PDF)',
    approvedLabel: 'Invoice Completed',
    rejectedLabel: 'Report Rejected',
    downloadPdf: 'View Invoice in Drive',
    pdfDeleted: '⚠️ Invoice deleted from Drive',
    pdfDeletedError: 'The invoice PDF was deleted from Drive. Contact the manager.',
    invoiceNumber: 'Invoice #',
    approvedOn: 'Completed on',
    rejectModalTitle: 'Reject Report',
    rejectCommentsLabel: 'Rejection reason',
    rejectPlaceholder: 'Describe the issue found...',
    cancelBtn: 'Cancel',
    confirmRejectBtn: 'Confirm Rejection',
    uploadModalTitle: 'Upload Official Invoice',
    invoiceNumberLabel: 'Invoice Number',
    invoiceNumberPlaceholder: '2025/042',
    pdfFileLabel: 'PDF File',
    pdfHelpText: 'PDF files only. Max 10MB',
    confirmUploadBtn: 'Upload Invoice',
    toastApproving: 'Approving report...',
    toastApproved: 'Report approved. Now upload your official invoice.',
    toastRejecting: 'Rejecting...',
    toastRejected: 'Report rejected successfully',
    toastUploading: 'Uploading invoice...',
    toastUploaded: 'Invoice uploaded successfully',
    toastError: 'Error processing',
    toastCommentsRequired: 'You must write the rejection reason',
    toastInvoiceNumberRequired: 'You must enter the invoice number',
    toastPdfRequired: 'You must select a PDF file',
    toastPdfTooLarge: 'File is too large (max 10MB)',
    morning: 'Morning',
    afternoon: 'Afternoon',
    calendar: 'Calendar',
    logout: 'Logout'
  }
};

const monthNames = {
  es: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
};

let lang = localStorage.getItem('lang') || 'es';
function t(key) { return i18n[lang][key] || key; }

let currentUser = null;
let currentGuideId = null;
let guideName = '';
let pendingUnsubscribe = null;
let waitingUnsubscribe = null;
let historyUnsubscribe = null;
let currentInvoice = null;

// ============================================
// HELPER: Extraer y normalizar Drive File ID
// ============================================
function extractDriveFileId(urlOrId) {
  if (!urlOrId) return null;
  
  if (/^[a-zA-Z0-9_-]+$/.test(urlOrId) && urlOrId.length > 20) {
    return urlOrId;
  }
  
  const match = urlOrId.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  
  const directMatch = urlOrId.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (directMatch) return directMatch[1];
  
  return null;
}

function buildDriveViewUrl(fileId) {
  if (!fileId) return null;
  return `https://drive.google.com/file/d/${fileId}/view`;
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    const token = await user.getIdTokenResult(true);
    currentGuideId = token.claims.guideId;

    if (!currentGuideId) {
      alert('No tienes permisos de guía');
      await signOut(auth);
      window.location.href = '/login.html';
      return;
    }

    const guideDoc = await getDoc(doc(db, 'guides', currentGuideId));
    if (!guideDoc.exists() || guideDoc.data().estado !== 'activo') {
      alert('Cuenta inactiva');
      await signOut(auth);
      window.location.href = '/login.html';
      return;
    }

    guideName = guideDoc.data().nombre;

    updateUILanguage();
    initLanguageToggle();
    loadInvoices();
  } else {
    window.location.href = '/login.html';
  }
});

function updateUILanguage() {
  document.getElementById('page-title').textContent = `${t('pageTitle')} - ${guideName}`;
  document.getElementById('pending-title').textContent = t('pendingTitle');
  document.getElementById('waiting-title').textContent = t('waitingTitle');
  document.getElementById('history-title').textContent = t('historyTitle');
  document.getElementById('modal-title').textContent = t('modalTitle');
  document.getElementById('guide-info-title').textContent = t('guideInfo');
  document.getElementById('th-date').textContent = t('dateCol');
  document.getElementById('th-slot').textContent = t('slotCol');
  document.getElementById('th-tour').textContent = t('tourCol');
  document.getElementById('th-pax').textContent = t('paxCol');
  document.getElementById('th-salary').textContent = t('salaryCol');
  document.getElementById('base-label').textContent = t('baseLabel');
  document.getElementById('iva-label').textContent = t('ivaLabel');
  document.getElementById('total-label').textContent = t('totalLabel');
  document.getElementById('approve-text').textContent = t('approveBtn');
  document.getElementById('reject-text').textContent = t('rejectBtn');
  document.getElementById('waiting-label').textContent = t('waitingLabel');
  document.getElementById('upload-text').textContent = t('uploadBtn');
  document.getElementById('approved-label').textContent = t('approvedLabel');
  document.getElementById('rejected-label').textContent = t('rejectedLabel');
  document.getElementById('download-text').textContent = t('downloadPdf');
  document.getElementById('reject-modal-title').textContent = t('rejectModalTitle');
  document.getElementById('reject-comments-label').textContent = t('rejectCommentsLabel');
  document.getElementById('reject-comments').placeholder = t('rejectPlaceholder');
  document.getElementById('cancel-reject-btn').textContent = t('cancelBtn');
  document.getElementById('confirm-reject-btn').textContent = t('confirmRejectBtn');
  document.getElementById('upload-modal-title').textContent = t('uploadModalTitle');
  document.getElementById('invoice-number-label').textContent = t('invoiceNumberLabel');
  document.getElementById('invoice-number-input').placeholder = t('invoiceNumberPlaceholder');
  document.getElementById('pdf-file-label').textContent = t('pdfFileLabel');
  document.getElementById('pdf-help-text').textContent = t('pdfHelpText');
  document.getElementById('cancel-upload-btn').textContent = t('cancelBtn');
  document.getElementById('confirm-upload-btn').textContent = t('confirmUploadBtn');
  document.querySelector('a[href="/guide.html"]').textContent = t('calendar');
  document.getElementById('logout-btn').textContent = t('logout');
}

function initLanguageToggle() {
  const langToggle = document.getElementById('lang-toggle');
  langToggle.textContent = lang === 'es' ? 'EN' : 'ES';
  langToggle.addEventListener('click', () => {
    lang = lang === 'es' ? 'en' : 'es';
    localStorage.setItem('lang', lang);
    langToggle.textContent = lang === 'es' ? 'EN' : 'ES';
    updateUILanguage();
    loadInvoices();
  });
}

function loadInvoices() {
  // Pendientes de aprobación
  if (pendingUnsubscribe) pendingUnsubscribe();
  const pendingQuery = query(
    collection(db, 'guide_invoices'),
    where('guideId', '==', currentGuideId),
    where('status', '==', 'PENDING_GUIDE_APPROVAL'),
    orderBy('createdAt', 'desc')
  );
  pendingUnsubscribe = onSnapshot(pendingQuery, (snapshot) => {
    renderInvoices(snapshot, 'pending-invoices', 'pending');
  });

  // Esperando subir factura
  if (waitingUnsubscribe) waitingUnsubscribe();
  const waitingQuery = query(
    collection(db, 'guide_invoices'),
    where('guideId', '==', currentGuideId),
    where('status', 'in', ['WAITING_INVOICE_UPLOAD', 'UPLOAD_OVERDUE']),
    orderBy('createdAt', 'desc')
  );
  waitingUnsubscribe = onSnapshot(waitingQuery, (snapshot) => {
    renderInvoices(snapshot, 'waiting-invoices', 'waiting');
  });

  // Historial
  if (historyUnsubscribe) historyUnsubscribe();
  const historyQuery = query(
    collection(db, 'guide_invoices'),
    where('guideId', '==', currentGuideId),
    where('status', 'in', ['APPROVED', 'REJECTED']),
    orderBy('createdAt', 'desc')
  );
  historyUnsubscribe = onSnapshot(historyQuery, (snapshot) => {
    renderInvoices(snapshot, 'history-invoices', 'history');
  });
}

function renderInvoices(snapshot, containerId, section) {
  const container = document.getElementById(containerId);

  if (snapshot.empty) {
    const emptyMsg = section === 'pending' ? t('noPending') :
                     section === 'waiting' ? t('noWaiting') : t('noHistory');
    container.innerHTML = `<p class="text-gray-500 dark:text-gray-400 text-sm sm:text-base">${emptyMsg}</p>`;
    return;
  }

  const invoices = [];
  snapshot.forEach(docSnap => invoices.push({ id: docSnap.id, ...docSnap.data() }));

  container.innerHTML = invoices.map(inv => {
    const [year, month] = inv.month.split('-');
    const monthName = monthNames[lang][parseInt(month, 10) - 1];

    const statusConfig = {
      PENDING_GUIDE_APPROVAL: { class: 'bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200', text: t('statusPending') },
      WAITING_INVOICE_UPLOAD: { class: 'bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200', text: t('statusWaiting') },
      UPLOAD_OVERDUE: { class: 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200', text: t('statusOverdue') },
      APPROVED: { class: 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200', text: t('statusApproved') },
      REJECTED: { class: 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200', text: t('statusRejected') }
    };

    const status = statusConfig[inv.status] || {
      class: 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200',
      text: inv.status
    };

    const total = inv.totalSalary || 0;

    return `
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 hover:shadow-md transition-shadow cursor-pointer"
           data-invoice-id="${inv.id}">
        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
          <div>
            <h3 class="text-lg font-semibold dark:text-white">${monthName} ${year}</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">${inv.tours.length} tours</p>
            <p class="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-2">${total.toFixed(2)}€</p>
          </div>
          <div class="flex flex-col items-start sm:items-end gap-2">
            <span class="px-3 py-1 rounded-full text-xs font-semibold ${status.class}">${status.text}</span>
            ${inv.invoiceNumber ? `<span class="text-xs text-gray-600 dark:text-gray-400">${t('invoiceNumber')}: ${inv.invoiceNumber}</span>` : ''}
            <button class="text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium view-detail-btn">${t('viewDetail')}</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-invoice-id]').forEach(card => {
    card.querySelector('.view-detail-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const invoiceId = card.dataset.invoiceId;
      const invoice = invoices.find(i => i.id === invoiceId);
      openInvoiceModal(invoice);
    });
  });
}

function openInvoiceModal(invoice) {
  currentInvoice = invoice;
  const modal = document.getElementById('invoice-modal');

  document.getElementById('modal-guide-name').textContent = invoice.guideName;
  document.getElementById('modal-guide-email').textContent = invoice.guideEmail;

  const [year, month] = invoice.month.split('-');
  const monthName = monthNames[lang][parseInt(month, 10) - 1];
  document.getElementById('modal-month').textContent = `${t('month')}: ${monthName} ${year}`;

  const tbody = document.getElementById('modal-tours-body');
  const locale = lang === 'es' ? 'es-ES' : 'en-US';

  tbody.innerHTML = invoice.tours.map(tour => {
    const dateObj = new Date(tour.fecha + 'T12:00:00');
    const dateStr = dateObj.toLocaleDateString(locale, { day: '2-digit', month: 'short' });
    const slotStr = tour.slot === 'MAÑANA' ? t('morning') : `${t('afternoon')} ${tour.slot}`;
    const salary = tour.salario || tour.salarioCalculado || 0;

    return `
      <tr class="border-b dark:border-gray-700">
        <td class="px-3 py-2">${dateStr}</td>
        <td class="px-3 py-2">${slotStr}</td>
        <td class="px-3 py-2">${tour.tourDescription || '-'}</td>
        <td class="px-3 py-2 text-center">${tour.numPax || 0}</td>
        <td class="px-3 py-2 text-right font-semibold">${salary.toFixed(2)}€</td>
      </tr>
    `;
  }).join('');

  // Desglose en neto (ya viene neto de Firestore)
  const total = invoice.totalSalary || 0;
  document.getElementById('modal-base').textContent = `${total.toFixed(2)}€`;
  document.getElementById('modal-iva').textContent = '';
  document.getElementById('modal-total').textContent = `${total.toFixed(2)}€`;

  const approvalSection = document.getElementById('approval-section');
  const waitingSection = document.getElementById('waiting-upload-section');
  const approvedInfo = document.getElementById('approved-info');
  const rejectedInfo = document.getElementById('rejected-info');

  approvalSection.classList.add('hidden');
  waitingSection.classList.add('hidden');
  approvedInfo.classList.add('hidden');
  rejectedInfo.classList.add('hidden');

  if (invoice.status === 'PENDING_GUIDE_APPROVAL') {
    approvalSection.classList.remove('hidden');
  } else if (invoice.status === 'WAITING_INVOICE_UPLOAD' || invoice.status === 'UPLOAD_OVERDUE') {
    waitingSection.classList.remove('hidden');
    if (invoice.uploadDeadline) {
      const deadline = invoice.uploadDeadline.toDate();
      document.getElementById('upload-deadline-text').textContent =
        `${t('uploadDeadlineText')}: ${deadline.toLocaleString(locale)}`;
    }
  } else if (invoice.status === 'APPROVED') {
    approvedInfo.classList.remove('hidden');
    document.getElementById('approved-number').textContent =
      `${t('invoiceNumber')}: ${invoice.invoiceNumber || '-'}`;

    if (invoice.uploadedAt) {
      const uploadedDate = invoice.uploadedAt.toDate();
      document.getElementById('approved-date').textContent =
        `${t('approvedOn')}: ${uploadedDate.toLocaleDateString(locale)}`;
    }

    const driveLink = document.getElementById('download-pdf');
    const textSpan = document.getElementById('download-text');
    
    if (invoice.pdfDeleted === true) {
      driveLink.href = '#';
      driveLink.classList.add('pointer-events-none', 'opacity-50', 'cursor-not-allowed');
      driveLink.classList.remove('hover:underline');
      
      textSpan.textContent = t('pdfDeleted');
      textSpan.classList.remove('text-blue-600', 'dark:text-blue-400');
      textSpan.classList.add('text-red-600', 'dark:text-red-400');
      
      driveLink.onclick = (e) => {
        e.preventDefault();
        showToast(t('pdfDeletedError'), 'error');
        return false;
      };
    } else {
      const rawUrl = invoice.invoiceFileUrl || invoice.officialInvoicePdfUrl || invoice.pdfDriveId;
      const fileId = extractDriveFileId(rawUrl);
      
      if (fileId) {
        const driveUrl = buildDriveViewUrl(fileId);
        driveLink.href = driveUrl;
        driveLink.classList.remove('pointer-events-none', 'opacity-50', 'cursor-not-allowed');
        driveLink.classList.add('hover:underline');
        
        textSpan.textContent = t('downloadPdf');
        textSpan.classList.remove('text-red-600', 'dark:text-red-400');
        textSpan.classList.add('text-blue-600', 'dark:text-blue-400');
        
        driveLink.onclick = null;
      } else {
        driveLink.href = '#';
        driveLink.classList.add('pointer-events-none', 'opacity-50', 'cursor-not-allowed');
        driveLink.classList.remove('hover:underline');
        
        textSpan.textContent = t('pdfDeleted');
        textSpan.classList.remove('text-blue-600', 'dark:text-blue-400');
        textSpan.classList.add('text-red-600', 'dark:text-red-400');
        
        driveLink.onclick = (e) => {
          e.preventDefault();
          showToast(t('pdfDeletedError'), 'error');
          return false;
        };
      }
    }
  } else if (invoice.status === 'REJECTED') {
    rejectedInfo.classList.remove('hidden');
    document.getElementById('rejection-comments').textContent =
      invoice.rejectionComments || '-';
  }

  modal.classList.remove('hidden');
}

document.getElementById('close-modal').addEventListener('click', () => {
  document.getElementById('invoice-modal').classList.add('hidden');
  currentInvoice = null;
});

// Aprobar
document.getElementById('approve-btn').addEventListener('click', async () => {
  if (!currentInvoice) return;

  const approveBtn = document.getElementById('approve-btn');
  approveBtn.disabled = true;
  approveBtn.classList.add('opacity-50', 'cursor-not-allowed');

  showToast(t('toastApproving'), 'info');

  try {
    const functionsInstance = getFunctions(undefined, 'us-central1');
    const guideApproveReport = httpsCallable(functionsInstance, 'guideApproveReport');

    await guideApproveReport({ invoiceId: currentInvoice.id });

    showToast(t('toastApproved'), 'success');
    document.getElementById('invoice-modal').classList.add('hidden');
    
    setTimeout(() => {
      const waitingInvoice = { ...currentInvoice, status: 'WAITING_INVOICE_UPLOAD' };
      currentInvoice = waitingInvoice;
      openInvoiceModal(waitingInvoice);
    }, 1000);
  } catch (error) {
    console.error('Error approving:', error);
    showToast(t('toastError') + ': ' + error.message, 'error');
  } finally {
    approveBtn.disabled = false;
    approveBtn.classList.remove('opacity-50', 'cursor-not-allowed');
  }
});

// Rechazar
document.getElementById('reject-btn').addEventListener('click', () => {
  if (!currentInvoice) return;
  document.getElementById('reject-comments').value = '';
  document.getElementById('reject-modal').classList.remove('hidden');
});

document.getElementById('cancel-reject-btn').addEventListener('click', () => {
  document.getElementById('reject-modal').classList.add('hidden');
});

document.getElementById('confirm-reject-btn').addEventListener('click', async () => {
  const comments = document.getElementById('reject-comments').value.trim();
  
  if (!comments) {
    showToast(t('toastCommentsRequired'), 'error');
    return;
  }

  const confirmBtn = document.getElementById('confirm-reject-btn');
  confirmBtn.disabled = true;
  confirmBtn.textContent = t('toastRejecting');

  try {
    const functionsInstance = getFunctions(undefined, 'us-central1');
    const guideRejectReport = httpsCallable(functionsInstance, 'guideRejectReport');

    await guideRejectReport({
      invoiceId: currentInvoice.id,
      comments: comments
    });

    showToast(t('toastRejected'), 'success');
    document.getElementById('reject-modal').classList.add('hidden');
    document.getElementById('invoice-modal').classList.add('hidden');
    currentInvoice = null;
  } catch (error) {
    console.error('Error rejecting:', error);
    showToast(t('toastError') + ': ' + error.message, 'error');
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = t('confirmRejectBtn');
  }
});

// Upload PDF
document.getElementById('upload-invoice-btn').addEventListener('click', () => {
  if (!currentInvoice) return;
  document.getElementById('invoice-number-input').value = '';
  document.getElementById('pdf-file-input').value = '';
  document.getElementById('upload-modal').classList.remove('hidden');
});

document.getElementById('cancel-upload-btn').addEventListener('click', () => {
  document.getElementById('upload-modal').classList.add('hidden');
});

document.getElementById('confirm-upload-btn').addEventListener('click', async () => {
  const invoiceNumber = document.getElementById('invoice-number-input').value.trim();
  const pdfFile = document.getElementById('pdf-file-input').files[0];

  if (!invoiceNumber) {
    showToast(t('toastInvoiceNumberRequired'), 'error');
    return;
  }

  if (!pdfFile) {
    showToast(t('toastPdfRequired'), 'error');
    return;
  }

  if (pdfFile.size > 10 * 1024 * 1024) {
    showToast(t('toastPdfTooLarge'), 'error');
    return;
  }

  const confirmBtn = document.getElementById('confirm-upload-btn');
  confirmBtn.disabled = true;
  confirmBtn.textContent = t('toastUploading');

  showToast(t('toastUploading'), 'info');

  try {
    const reader = new FileReader();
    const pdfBase64 = await new Promise((resolve, reject) => {
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(pdfFile);
    });

    const functionsInstance = getFunctions(undefined, 'us-central1');
    const uploadOfficialInvoice = httpsCallable(functionsInstance, 'uploadOfficialInvoice');

    await uploadOfficialInvoice({
      invoiceId: currentInvoice.id,
      invoiceNumber: invoiceNumber,
      pdfBase64: pdfBase64
    });

    showToast(t('toastUploaded'), 'success');
    document.getElementById('upload-modal').classList.add('hidden');
    document.getElementById('invoice-modal').classList.add('hidden');
    currentInvoice = null;
  } catch (error) {
    console.error('Error uploading:', error);
    showToast(t('toastError') + ': ' + error.message, 'error');
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = t('confirmUploadBtn');
  }
});

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toast-message');
  toastMessage.textContent = message;
  toast.className = `fixed bottom-4 right-4 px-4 py-2 sm:px-6 sm:py-3 rounded-lg shadow-lg ${
    type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500'
  } text-white text-sm sm:text-base z-50`;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

document.getElementById('logout-btn').addEventListener('click', async () => {
  try {
    await signOut(auth);
    window.location.href = '/login.html';
  } catch (error) {
    console.error('Error signing out:', error);
  }
});

window.addEventListener('beforeunload', () => {
  if (pendingUnsubscribe) pendingUnsubscribe();
  if (waitingUnsubscribe) waitingUnsubscribe();
  if (historyUnsubscribe) historyUnsubscribe();
});
