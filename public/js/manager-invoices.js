import { auth, db } from './firebase-config.js';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  getDocs,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js';

// Dark mode
const darkModeToggle = document.getElementById('dark-mode-toggle');
if (localStorage.getItem('darkMode') === 'enabled') {
  document.documentElement.classList.add('dark');
}

darkModeToggle?.addEventListener('click', () => {
  document.documentElement.classList.toggle('dark');
  localStorage.setItem('darkMode', 
    document.documentElement.classList.contains('dark') ? 'enabled' : 'disabled'
  );
});

// i18n
const i18n = {
  es: {
    logout: 'Salir',
    statusLabel: 'Estado',
    guideLabel: 'Guía',
    monthLabel: 'Mes',
    allGuides: 'Todos',
    statusAll: 'Todas',
    statusManagerReview: '⏳ Pendiente Revisión',
    statusPendingGuideApproval: '📨 Enviada a Guía',
    statusWaitingUpload: '⏱️ Esperando Factura',
    statusUploadOverdue: '⚠️ Plazo Vencido',
    statusApproved: '✓ Aprobada',
    statusRejected: '✗ Rechazada',
    loading: 'Cargando facturas...',
    noInvoices: 'No hay facturas con estos filtros',
    viewEdit: 'Ver / Editar',
    tours: 'tours',
    overdueLabel: 'Vencido:',
    modalTitle: 'Revisar Reporte',
    toursMonth: 'Tours del Mes',
    dateCol: 'Fecha',
    slotCol: 'Turno',
    tourCol: 'Tour',
    paxCol: 'PAX',
    salaryCol: 'Salario',
    addExtraLine: 'Añadir línea extra',
    totalLabel: 'TOTAL',
    rejectionTitle: '⚠️ Motivo del Rechazo',
    saveBtn: 'Guardar Cambios',
    sendToGuideBtn: '✓ Enviar a Guía para Aprobación',
    alreadySent: '✓ Ya enviada',
    morning: 'Mañana',
    extraConcept: 'Concepto Extra',
    saving: 'Guardando...',
    sending: 'Enviando...',
    toastSaved: 'Cambios guardados correctamente',
    toastSent: 'Reporte enviado al guía correctamente',
    toastError: 'Error al procesar',
    confirmSend: '¿Enviar este reporte al guía? Se le notificará por email para revisión y aprobación.',
    confirmDelete: '¿Eliminar esta línea?'
  },
  en: {
    logout: 'Logout',
    statusLabel: 'Status',
    guideLabel: 'Guide',
    monthLabel: 'Month',
    allGuides: 'All',
    statusAll: 'All',
    statusManagerReview: '⏳ Pending Review',
    statusPendingGuideApproval: '📨 Sent to Guide',
    statusWaitingUpload: '⏱️ Waiting Invoice',
    statusUploadOverdue: '⚠️ Overdue',
    statusApproved: '✓ Approved',
    statusRejected: '✗ Rejected',
    loading: 'Loading invoices...',
    noInvoices: 'No invoices with these filters',
    viewEdit: 'View / Edit',
    tours: 'tours',
    overdueLabel: 'Overdue:',
    modalTitle: 'Review Report',
    toursMonth: 'Tours of the Month',
    dateCol: 'Date',
    slotCol: 'Shift',
    tourCol: 'Tour',
    paxCol: 'PAX',
    salaryCol: 'Salary',
    addExtraLine: 'Add extra line',
    totalLabel: 'TOTAL',
    rejectionTitle: '⚠️ Rejection Reason',
    saveBtn: 'Save Changes',
    sendToGuideBtn: '✓ Send to Guide for Approval',
    alreadySent: '✓ Already sent',
    morning: 'Morning',
    extraConcept: 'Extra Concept',
    saving: 'Saving...',
    sending: 'Sending...',
    toastSaved: 'Changes saved successfully',
    toastSent: 'Report sent to guide successfully',
    toastError: 'Error processing',
    confirmSend: 'Send this report to guide? They will be notified by email for review and approval.',
    confirmDelete: 'Delete this line?'
  }
};

let lang = localStorage.getItem('lang') || 'es';
function t(key) { return i18n[lang][key] || key; }

let currentUser = null;
let invoicesUnsubscribe = null;
let allInvoices = [];
let currentInvoice = null;
let allGuides = [];

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = '/login.html';
    return;
  }

  currentUser = user;
  const token = await user.getIdTokenResult(true);

  if (token.claims.role !== 'manager') {
    alert('Acceso denegado');
    window.location.href = '/login.html';
    return;
  }

  await loadGuides();
  updateUILanguage();
  initLanguageToggle();
  initFilters();
  loadInvoices();
});

function updateUILanguage() {
  const statusFilter = document.getElementById('status-filter');
  statusFilter.innerHTML = `
    <option value="ALL">${t('statusAll')}</option>
    <option value="MANAGER_REVIEW">${t('statusManagerReview')}</option>
    <option value="PENDING_GUIDE_APPROVAL">${t('statusPendingGuideApproval')}</option>
    <option value="WAITING_INVOICE_UPLOAD">${t('statusWaitingUpload')}</option>
    <option value="UPLOAD_OVERDUE">${t('statusUploadOverdue')}</option>
    <option value="APPROVED">${t('statusApproved')}</option>
    <option value="REJECTED">${t('statusRejected')}</option>
  `;
  
  document.getElementById('logout-btn').textContent = t('logout');
}

function initLanguageToggle() {
  const langToggle = document.getElementById('lang-toggle');
  if (!langToggle) return;
  
  langToggle.textContent = lang === 'es' ? 'EN' : 'ES';
  langToggle.addEventListener('click', () => {
    lang = lang === 'es' ? 'en' : 'es';
    localStorage.setItem('lang', lang);
    langToggle.textContent = lang === 'es' ? 'EN' : 'ES';
    updateUILanguage();
    renderInvoices();
  });
}

async function loadGuides() {
  const guidesQuery = query(
    collection(db, 'guides'),
    where('estado', '==', 'activo')
  );
  const snapshot = await getDocs(guidesQuery);
  
  allGuides = [];
  snapshot.forEach(doc => {
    allGuides.push({ id: doc.id, ...doc.data() });
  });
  
  const guideFilter = document.getElementById('guide-filter');
  guideFilter.innerHTML = `<option value="">${t('allGuides')}</option>`;
  allGuides.forEach(guide => {
    guideFilter.innerHTML += `<option value="${guide.id}">${guide.nombre}</option>`;
  });
}

function initFilters() {
  document.getElementById('status-filter').addEventListener('change', renderInvoices);
  document.getElementById('guide-filter').addEventListener('change', renderInvoices);
  document.getElementById('month-filter').addEventListener('change', renderInvoices);
}

function loadInvoices() {
  if (invoicesUnsubscribe) invoicesUnsubscribe();

  const invoicesQuery = query(
    collection(db, 'guide_invoices'),
    orderBy('createdAt', 'desc')
  );

  invoicesUnsubscribe = onSnapshot(invoicesQuery, (snapshot) => {
    allInvoices = [];
    snapshot.forEach(doc => {
      allInvoices.push({ id: doc.id, ...doc.data() });
    });
    renderInvoices();
  });
}

function renderInvoices() {
  const container = document.getElementById('invoices-list');
  const statusFilter = document.getElementById('status-filter').value;
  const guideFilter = document.getElementById('guide-filter').value;
  const monthFilter = document.getElementById('month-filter').value;

  let filtered = allInvoices;

  if (statusFilter !== 'ALL') {
    filtered = filtered.filter(inv => inv.status === statusFilter);
  }

  if (guideFilter) {
    filtered = filtered.filter(inv => inv.guideId === guideFilter);
  }

  if (monthFilter) {
    filtered = filtered.filter(inv => inv.month === monthFilter);
  }

  if (filtered.length === 0) {
    container.innerHTML = `<p class="text-gray-500 dark:text-gray-400">${t('noInvoices')}</p>`;
    return;
  }

  container.innerHTML = filtered.map(inv => {
    const statusConfig = {
      'MANAGER_REVIEW': { 
        class: 'bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200', 
        text: t('statusManagerReview')
      },
      'PENDING_GUIDE_APPROVAL': { 
        class: 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200', 
        text: t('statusPendingGuideApproval')
      },
      'WAITING_INVOICE_UPLOAD': { 
        class: 'bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200', 
        text: t('statusWaitingUpload')
      },
      'UPLOAD_OVERDUE': { 
        class: 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200', 
        text: t('statusUploadOverdue')
      },
      'APPROVED': { 
        class: 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200', 
        text: t('statusApproved')
      },
      'REJECTED': { 
        class: 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200', 
        text: t('statusRejected')
      }
    };

    const status = statusConfig[inv.status] || { 
      class: 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200', 
      text: inv.status 
    };

    return `
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 hover:shadow-md transition-shadow">
        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
          <div class="flex-1">
            <div class="flex items-center gap-3 mb-2">
              <h3 class="text-lg font-semibold dark:text-white">${inv.guideName}</h3>
              <span class="px-3 py-1 rounded-full text-xs font-semibold ${status.class}">${status.text}</span>
            </div>
            <p class="text-sm text-gray-600 dark:text-gray-400">${inv.month} · ${inv.tours.length} ${t('tours')}</p>
            <p class="text-2xl font-bold text-sky-600 dark:text-sky-400 mt-2">${(inv.totalSalary || 0).toFixed(2)}€</p>
            ${inv.status === 'UPLOAD_OVERDUE' && inv.uploadDeadline ? `
              <p class="text-xs text-orange-600 dark:text-orange-400 mt-1">
                ${t('overdueLabel')} ${new Date(inv.uploadDeadline.toDate()).toLocaleString(lang === 'es' ? 'es-ES' : 'en-US')}
              </p>
            ` : ''}
          </div>
          <button onclick="openEditModal('${inv.id}')" class="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded font-semibold text-sm">
            ${t('viewEdit')}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

window.openEditModal = async function(invoiceId) {
  const invoice = allInvoices.find(i => i.id === invoiceId);
  if (!invoice) return;

  currentInvoice = invoice;

  document.getElementById('modal-title').textContent = t('modalTitle');
  document.getElementById('modal-subtitle').textContent = `${invoice.guideName} - ${invoice.month}`;

  renderToursTable();
  updateModalTotal();

  // Mostrar comentarios rechazo si REJECTED
  const commentsSection = document.getElementById('guide-comments-section');
  const commentsTitle = document.getElementById('guide-comments-section').querySelector('h4');
  if (commentsTitle) {
    commentsTitle.textContent = t('rejectionTitle');
  }
  
  if (invoice.status === 'REJECTED' && invoice.rejectionComments) {
    commentsSection.classList.remove('hidden');
    document.getElementById('guide-comments').textContent = invoice.rejectionComments;
  } else {
    commentsSection.classList.add('hidden');
  }

  // Actualizar botones
  const saveBtn = document.getElementById('save-btn');
  saveBtn.textContent = t('saveBtn');

  const sendBtn = document.getElementById('send-to-guide-btn');
  if (invoice.status !== 'MANAGER_REVIEW' && invoice.status !== 'REJECTED') {
    sendBtn.disabled = true;
    sendBtn.classList.add('opacity-50', 'cursor-not-allowed');
    sendBtn.textContent = t('alreadySent');
  } else {
    sendBtn.disabled = false;
    sendBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    sendBtn.textContent = t('sendToGuideBtn');
  }

  document.getElementById('edit-modal').classList.remove('hidden');
};

function renderToursTable() {
  const tbody = document.getElementById('tours-table-body');

  tbody.innerHTML = currentInvoice.tours.map((tour, index) => {
    const salary = tour.salario || tour.salarioCalculado || 0;

    return `
      <tr class="border-b dark:border-gray-700">
        <td class="px-3 py-2">
          <input type="date" value="${tour.fecha}" onchange="updateTourField(${index}, 'fecha', this.value)"
            class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm dark:text-gray-300" />
        </td>
        <td class="px-3 py-2">
          <select onchange="updateTourField(${index}, 'slot', this.value)"
            class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm dark:text-gray-300">
            <option value="MAÑANA"${tour.slot === 'MAÑANA' ? ' selected' : ''}>${t('morning')}</option>
            <option value="T1"${tour.slot === 'T1' ? ' selected' : ''}>T1</option>
            <option value="T2"${tour.slot === 'T2' ? ' selected' : ''}>T2</option>
            <option value="T3"${tour.slot === 'T3' ? ' selected' : ''}>T3</option>
            <option value="EXTRA"${tour.slot === 'EXTRA' ? ' selected' : ''}>EXTRA</option>
          </select>
        </td>
        <td class="px-3 py-2">
          <input type="text" value="${tour.tourDescription || tour.description || ''}"
            onchange="updateTourField(${index}, 'tourDescription', this.value)"
            class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm dark:text-gray-300 ${tour.isExtra ? 'font-semibold text-emerald-600 dark:text-emerald-400' : ''}" />
        </td>
        <td class="px-3 py-2">
          <input type="number" min="0" value="${tour.numPax || 0}"
            onchange="updateTourField(${index}, 'numPax', parseInt(this.value))"
            class="w-20 text-center bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm dark:text-gray-300" />
        </td>
        <td class="px-3 py-2">
          <input type="number" step="0.01" min="0" value="${salary}"
            onchange="updateTourField(${index}, 'salario', parseFloat(this.value))"
            class="w-24 text-right bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 font-semibold text-sm dark:text-gray-300" />
        </td>
        <td class="px-3 py-2 text-center">
          ${tour.isExtra ? `
            <button onclick="deleteTour(${index})" class="text-red-600 hover:text-red-700 dark:text-red-400">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </button>
          ` : ''}
        </td>
      </tr>
    `;
  }).join('');
}

window.updateTourField = function(index, field, value) {
  currentInvoice.tours[index][field] = value;
  if (field === 'salario') {
    updateModalTotal();
  }
};

window.deleteTour = function(index) {
  if (!confirm(t('confirmDelete'))) return;
  currentInvoice.tours.splice(index, 1);
  renderToursTable();
  updateModalTotal();
};

document.getElementById('add-extra-line').addEventListener('click', () => {
  currentInvoice.tours.push({
    fecha: currentInvoice.month + '-01',
    slot: 'EXTRA',
    tourDescription: t('extraConcept'),
    numPax: 0,
    salario: 0,
    isExtra: true
  });
  renderToursTable();
});

function updateModalTotal() {
  const total = currentInvoice.tours.reduce((sum, tour) => {
    return sum + (tour.salario || tour.salarioCalculado || 0);
  }, 0);
  
  currentInvoice.totalSalary = total;
  document.getElementById('modal-total').textContent = total.toFixed(2) + '€';
}

document.getElementById('save-btn').addEventListener('click', async () => {
  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = t('saving');

  try {
    const baseImponible = currentInvoice.totalSalary / 1.21;
    const iva = baseImponible * 0.21;

    await updateDoc(doc(db, 'guide_invoices', currentInvoice.id), {
      tours: currentInvoice.tours,
      totalSalary: currentInvoice.totalSalary,
      baseImponible: parseFloat(baseImponible.toFixed(2)),
      iva: parseFloat(iva.toFixed(2)),
      editedByManager: true,
      managerEditedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    showToast(t('toastSaved'), 'success');
  } catch (error) {
    console.error('Error saving:', error);
    showToast(t('toastError'), 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = t('saveBtn');
  }
});

document.getElementById('send-to-guide-btn').addEventListener('click', async () => {
  if (!confirm(t('confirmSend'))) return;

  const sendBtn = document.getElementById('send-to-guide-btn');
  sendBtn.disabled = true;
  sendBtn.textContent = t('sending');

  try {
    const functions = getFunctions(undefined, 'us-central1');
    const managerSendToGuide = httpsCallable(functions, 'managerSendToGuide');

    await managerSendToGuide({
      invoiceId: currentInvoice.id,
      tours: currentInvoice.tours,
      totalSalary: currentInvoice.totalSalary
    });

    showToast(t('toastSent'), 'success');
    document.getElementById('edit-modal').classList.add('hidden');
    currentInvoice = null;
  } catch (error) {
    console.error('Error sending to guide:', error);
    showToast(t('toastError') + ': ' + error.message, 'error');
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = t('sendToGuideBtn');
  }
});

document.getElementById('close-modal').addEventListener('click', () => {
  document.getElementById('edit-modal').classList.add('hidden');
  currentInvoice = null;
});

function showToast(message, type) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  const typeClass = type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-blue-600';
  toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white z-50 ${typeClass}`;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

document.getElementById('logout-btn').addEventListener('click', async () => {
  await signOut(auth);
  window.location.href = '/login.html';
});

window.addEventListener('beforeunload', () => {
  if (invoicesUnsubscribe) invoicesUnsubscribe();
});