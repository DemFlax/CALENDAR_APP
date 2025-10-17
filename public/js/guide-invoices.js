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
    pendingTitle: 'Facturas Pendientes de Aprobación',
    historyTitle: 'Historial de Facturas',
    noPending: 'No tienes facturas pendientes',
    noHistory: 'No hay historial de facturas',
    viewDetail: 'Ver Detalle',
    month: 'Mes',
    total: 'Total',
    status: 'Estado',
    pending: 'Pendiente',
    approved: 'Aprobada',
    error: 'Error Reportado',
    modalTitle: 'Factura Pro-Forma',
    guideInfo: 'Información del Guía',
    dateCol: 'Fecha',
    slotCol: 'Turno',
    tourCol: 'Tour',
    paxCol: 'PAX',
    salaryCol: 'Salario',
    totalLabel: 'TOTAL',
    numberingTitle: 'Numeración de Factura',
    autoLabel: 'Autogenerar número (SFS-XXX/25)',
    manualLabel: 'Introducir número manualmente',
    manualInputLabel: 'Número de Factura',
    manualWarning: '⚠️ Atención: Si eliges numeración manual, no podrás volver a usar numeración automática (requisito legal)',
    approveBtn: 'Aprobar Factura',
    reportBtn: 'Reportar Error',
    approvedLabel: 'Factura Aprobada',
    downloadPdf: 'Descargar PDF',
    invoiceNumber: 'Nº Factura',
    approvedOn: 'Aprobada el',
    toastApproved: 'Factura aprobada correctamente',
    toastError: 'Error al aprobar factura',
    toastReported: 'Error reportado al manager',
    morning: 'Mañana',
    afternoon: 'Tarde',
    calendar: 'Calendario',
    logout: 'Salir'
  },
  en: {
    pageTitle: 'My Invoices',
    pendingTitle: 'Pending Approval Invoices',
    historyTitle: 'Invoice History',
    noPending: 'No pending invoices',
    noHistory: 'No invoice history',
    viewDetail: 'View Details',
    month: 'Month',
    total: 'Total',
    status: 'Status',
    pending: 'Pending',
    approved: 'Approved',
    error: 'Error Reported',
    modalTitle: 'Pro-Forma Invoice',
    guideInfo: 'Guide Information',
    dateCol: 'Date',
    slotCol: 'Shift',
    tourCol: 'Tour',
    paxCol: 'PAX',
    salaryCol: 'Salary',
    totalLabel: 'TOTAL',
    numberingTitle: 'Invoice Numbering',
    autoLabel: 'Auto-generate number (SFS-XXX/25)',
    manualLabel: 'Enter number manually',
    manualInputLabel: 'Invoice Number',
    manualWarning: '⚠️ Warning: If you choose manual numbering, you cannot go back to automatic (legal requirement)',
    approveBtn: 'Approve Invoice',
    reportBtn: 'Report Error',
    approvedLabel: 'Invoice Approved',
    downloadPdf: 'Download PDF',
    invoiceNumber: 'Invoice #',
    approvedOn: 'Approved on',
    toastApproved: 'Invoice approved successfully',
    toastError: 'Error approving invoice',
    toastReported: 'Error reported to manager',
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
let historyUnsubscribe = null;
let currentInvoice = null;

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
  document.getElementById('history-title').textContent = t('historyTitle');
  document.getElementById('modal-title').textContent = t('modalTitle');
  document.getElementById('guide-info-title').textContent = t('guideInfo');
  document.getElementById('th-date').textContent = t('dateCol');
  document.getElementById('th-slot').textContent = t('slotCol');
  document.getElementById('th-tour').textContent = t('tourCol');
  document.getElementById('th-pax').textContent = t('paxCol');
  document.getElementById('th-salary').textContent = t('salaryCol');
  document.getElementById('total-label').textContent = t('totalLabel');
  document.getElementById('numbering-title').textContent = t('numberingTitle');
  document.getElementById('auto-label').textContent = t('autoLabel');
  document.getElementById('manual-label').textContent = t('manualLabel');
  document.getElementById('manual-input-label').textContent = t('manualInputLabel');
  document.getElementById('manual-warning').textContent = t('manualWarning');
  document.getElementById('approve-text').textContent = t('approveBtn');
  document.getElementById('report-text').textContent = t('reportBtn');
  document.getElementById('approved-label').textContent = t('approvedLabel');
  document.getElementById('download-text').textContent = t('downloadPdf');
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
  // Facturas pendientes
  if (pendingUnsubscribe) pendingUnsubscribe();
  
  const pendingQuery = query(
    collection(db, 'guide_invoices'),
    where('guideId', '==', currentGuideId),
    where('status', '==', 'PENDING_APPROVAL'),
    orderBy('createdAt', 'desc')
  );

  pendingUnsubscribe = onSnapshot(pendingQuery, (snapshot) => {
    renderInvoices(snapshot, 'pending-invoices', true);
  });

  // Historial (aprobadas y errores)
  if (historyUnsubscribe) historyUnsubscribe();
  
  const historyQuery = query(
    collection(db, 'guide_invoices'),
    where('guideId', '==', currentGuideId),
    where('status', 'in', ['APPROVED', 'ERROR_REPORTED']),
    orderBy('createdAt', 'desc')
  );

  historyUnsubscribe = onSnapshot(historyQuery, (snapshot) => {
    renderInvoices(snapshot, 'history-invoices', false);
  });
}

function renderInvoices(snapshot, containerId, isPending) {
  const container = document.getElementById(containerId);
  
  if (snapshot.empty) {
    container.innerHTML = `<p class="text-gray-500 dark:text-gray-400 text-sm sm:text-base">${isPending ? t('noPending') : t('noHistory')}</p>`;
    return;
  }

  const invoices = [];
  snapshot.forEach(doc => invoices.push({ id: doc.id, ...doc.data() }));

  container.innerHTML = invoices.map(inv => {
    const [year, month] = inv.month.split('-');
    const monthName = monthNames[lang][parseInt(month) - 1];
    const statusClass = inv.status === 'APPROVED' ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' : 
                        inv.status === 'ERROR_REPORTED' ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200' :
                        'bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200';
    const statusText = inv.status === 'APPROVED' ? t('approved') : 
                       inv.status === 'ERROR_REPORTED' ? t('error') : t('pending');

    return `
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 hover:shadow-md transition-shadow cursor-pointer" 
           data-invoice-id="${inv.id}">
        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
          <div>
            <h3 class="text-lg font-semibold dark:text-white">${monthName} ${year}</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">${inv.tours.length} tours</p>
            <p class="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-2">${inv.totalSalary.toFixed(2)}€</p>
          </div>
          <div class="flex flex-col items-start sm:items-end gap-2">
            <span class="px-3 py-1 rounded-full text-xs font-semibold ${statusClass}">${statusText}</span>
            ${inv.invoiceNumber ? `<span class="text-xs text-gray-600 dark:text-gray-400">${t('invoiceNumber')}: ${inv.invoiceNumber}</span>` : ''}
            <button class="text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium view-detail-btn">${t('viewDetail')}</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Event listeners
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
  
  // Datos guía
  document.getElementById('modal-guide-name').textContent = invoice.guideName;
  document.getElementById('modal-guide-email').textContent = invoice.guideEmail;
  
  const [year, month] = invoice.month.split('-');
  const monthName = monthNames[lang][parseInt(month) - 1];
  document.getElementById('modal-month').textContent = `${t('month')}: ${monthName} ${year}`;

  // Tabla tours
  const tbody = document.getElementById('modal-tours-body');
  const locale = lang === 'es' ? 'es-ES' : 'en-US';
  
  tbody.innerHTML = invoice.tours.map(tour => {
    const dateObj = new Date(tour.fecha + 'T12:00:00');
    const dateStr = dateObj.toLocaleDateString(locale, { day: '2-digit', month: 'short' });
    const slotStr = tour.slot === 'MAÑANA' ? t('morning') : `${t('afternoon')} ${tour.slot}`;
    
    return `
      <tr class="border-b dark:border-gray-700">
        <td class="px-3 py-2">${dateStr}</td>
        <td class="px-3 py-2">${slotStr}</td>
        <td class="px-3 py-2">${tour.tourDescription || '-'}</td>
        <td class="px-3 py-2 text-center">${tour.numPax}</td>
        <td class="px-3 py-2 text-right font-semibold">${tour.salario.toFixed(2)}€</td>
      </tr>
    `;
  }).join('');

  // Total
  document.getElementById('modal-total').textContent = `${invoice.totalSalary.toFixed(2)}€`;

  // Secciones según estado
  const approvalSection = document.getElementById('approval-section');
  const approvedInfo = document.getElementById('approved-info');

  if (invoice.status === 'PENDING_APPROVAL') {
    approvalSection.classList.remove('hidden');
    approvedInfo.classList.add('hidden');
  } else if (invoice.status === 'APPROVED') {
    approvalSection.classList.add('hidden');
    approvedInfo.classList.remove('hidden');
    
    document.getElementById('approved-number').textContent = `${t('invoiceNumber')}: ${invoice.invoiceNumber}`;
    const approvedDate = invoice.approvedAt?.toDate?.() || new Date(invoice.approvedAt);
    document.getElementById('approved-date').textContent = `${t('approvedOn')}: ${approvedDate.toLocaleDateString(locale)}`;
    
    if (invoice.pdfDriveId) {
      document.getElementById('download-pdf').href = `https://drive.google.com/file/d/${invoice.pdfDriveId}/view`;
    }
  } else {
    approvalSection.classList.add('hidden');
    approvedInfo.classList.add('hidden');
  }

  modal.classList.remove('hidden');
}

// Modal controls
document.getElementById('close-modal').addEventListener('click', () => {
  document.getElementById('invoice-modal').classList.add('hidden');
  currentInvoice = null;
});

// Invoice mode radio
document.querySelectorAll('input[name="invoice-mode"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    const manualContainer = document.getElementById('manual-input-container');
    if (e.target.value === 'MANUAL') {
      manualContainer.classList.remove('hidden');
    } else {
      manualContainer.classList.add('hidden');
    }
  });
});

// Approve invoice
document.getElementById('approve-btn').addEventListener('click', async () => {
  if (!currentInvoice) return;

  const mode = document.querySelector('input[name="invoice-mode"]:checked').value;
  let invoiceNumber = null;

  if (mode === 'MANUAL') {
    invoiceNumber = document.getElementById('manual-invoice-number').value.trim();
    if (!invoiceNumber) {
      showToast('Debes introducir un número de factura', 'error');
      return;
    }
  }

  const approveBtn = document.getElementById('approve-btn');
  approveBtn.disabled = true;
  approveBtn.classList.add('opacity-50', 'cursor-not-allowed');

  try {
    const functions = getFunctions();
    const approveInvoice = httpsCallable(functions, 'approveInvoice');
    
    await approveInvoice({
      invoiceId: currentInvoice.id,
      mode: mode,
      invoiceNumber: invoiceNumber
    });

    showToast(t('toastApproved'), 'success');
    document.getElementById('invoice-modal').classList.add('hidden');
    currentInvoice = null;
  } catch (error) {
    console.error('Error approving invoice:', error);
    showToast(error.message || t('toastError'), 'error');
  } finally {
    approveBtn.disabled = false;
    approveBtn.classList.remove('opacity-50', 'cursor-not-allowed');
  }
});

// Report error
document.getElementById('report-error-btn').addEventListener('click', async () => {
  if (!currentInvoice) return;

  const reportBtn = document.getElementById('report-error-btn');
  reportBtn.disabled = true;
  reportBtn.classList.add('opacity-50', 'cursor-not-allowed');

  try {
    const functions = getFunctions();
    const reportInvoiceError = httpsCallable(functions, 'reportInvoiceError');
    
    await reportInvoiceError({
      invoiceId: currentInvoice.id
    });

    showToast(t('toastReported'), 'success');
    document.getElementById('invoice-modal').classList.add('hidden');
    currentInvoice = null;
  } catch (error) {
    console.error('Error reporting:', error);
    showToast(error.message || t('toastError'), 'error');
  } finally {
    reportBtn.disabled = false;
    reportBtn.classList.remove('opacity-50', 'cursor-not-allowed');
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
  if (historyUnsubscribe) historyUnsubscribe();
});