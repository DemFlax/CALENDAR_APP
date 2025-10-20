import { auth, db } from './firebase-config.js';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  getDocs,
  serverTimestamp
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
    pageTitle: 'Revisión de Facturas',
    dashboard: 'Dashboard',
    logout: 'Salir',
    statusLabel: 'Estado',
    guideLabel: 'Guía',
    monthLabel: 'Mes',
    allGuides: 'Todos',
    statusManagerReview: 'Pendientes Revisión',
    statusPendingApproval: 'Enviadas a Guías',
    statusApproved: 'Aprobadas',
    statusErrorReported: 'Con Errores',
    statusAll: 'Todas',
    loading: 'Cargando facturas...',
    noInvoices: 'No hay facturas con estos filtros',
    viewEdit: 'Ver / Editar',
    tours: 'tours',
    modalTitle: 'Editar Factura',
    toursMonth: 'Tours del Mes',
    dateCol: 'Fecha',
    slotCol: 'Turno',
    tourCol: 'Tour',
    paxCol: 'PAX',
    salaryCol: 'Salario',
    addExtraLine: 'Añadir línea extra',
    totalLabel: 'TOTAL',
    guideCommentsTitle: '⚠️ Comentarios del Guía',
    saveBtn: 'Guardar Cambios',
    approveSendBtn: 'Aprobar y Enviar a Guía',
    morning: 'Mañana',
    afternoon: 'Tarde',
    extraConcept: 'Concepto Extra',
    toastSaved: 'Cambios guardados correctamente',
    toastApproved: 'Factura aprobada y enviada al guía',
    toastError: 'Error al procesar',
    confirmApprove: '¿Confirmar envío al guía? Se le notificará por email.',
    confirmDelete: '¿Eliminar esta línea?'
  },
  en: {
    pageTitle: 'Invoice Review',
    dashboard: 'Dashboard',
    logout: 'Logout',
    statusLabel: 'Status',
    guideLabel: 'Guide',
    monthLabel: 'Month',
    allGuides: 'All',
    statusManagerReview: 'Pending Review',
    statusPendingApproval: 'Sent to Guides',
    statusApproved: 'Approved',
    statusErrorReported: 'With Errors',
    statusAll: 'All',
    loading: 'Loading invoices...',
    noInvoices: 'No invoices with these filters',
    viewEdit: 'View / Edit',
    tours: 'tours',
    modalTitle: 'Edit Invoice',
    toursMonth: 'Tours of the Month',
    dateCol: 'Date',
    slotCol: 'Shift',
    tourCol: 'Tour',
    paxCol: 'PAX',
    salaryCol: 'Salary',
    addExtraLine: 'Add extra line',
    totalLabel: 'TOTAL',
    guideCommentsTitle: '⚠️ Guide Comments',
    saveBtn: 'Save Changes',
    approveSendBtn: 'Approve and Send to Guide',
    morning: 'Morning',
    afternoon: 'Afternoon',
    extraConcept: 'Extra Concept',
    toastSaved: 'Changes saved successfully',
    toastApproved: 'Invoice approved and sent to guide',
    toastError: 'Error processing',
    confirmApprove: 'Confirm sending to guide? They will be notified by email.',
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
  document.getElementById('page-title').textContent = t('pageTitle');
  document.querySelector('a[href="/manager.html"]').textContent = t('dashboard');
  document.getElementById('logout-btn').textContent = t('logout');
  
  const statusFilter = document.getElementById('status-filter');
  statusFilter.options[0].text = t('statusAll');
  statusFilter.options[1].text = t('statusManagerReview');
  statusFilter.options[2].text = t('statusPendingApproval');
  statusFilter.options[3].text = t('statusApproved');
  statusFilter.options[4].text = t('statusErrorReported');
}

function initLanguageToggle() {
  const langToggle = document.getElementById('lang-toggle');
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
  guideFilter.innerHTML = '<option value="">' + t('allGuides') + '</option>';
  allGuides.forEach(guide => {
    guideFilter.innerHTML += '<option value="' + guide.id + '">' + guide.nombre + '</option>';
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
    container.innerHTML = '<p class="text-gray-500 dark:text-gray-400">' + t('noInvoices') + '</p>';
    return;
  }

  container.innerHTML = filtered.map(inv => {
    const statusClasses = {
      'MANAGER_REVIEW': 'bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200',
      'PENDING_APPROVAL': 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200',
      'APPROVED': 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200',
      'ERROR_REPORTED': 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
    };

    const statusTexts = {
      'MANAGER_REVIEW': t('statusManagerReview'),
      'PENDING_APPROVAL': t('statusPendingApproval'),
      'APPROVED': t('statusApproved'),
      'ERROR_REPORTED': t('statusErrorReported')
    };

    return '<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 hover:shadow-md transition-shadow">' +
      '<div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">' +
        '<div class="flex-1">' +
          '<div class="flex items-center gap-3 mb-2">' +
            '<h3 class="text-lg font-semibold dark:text-white">' + inv.guideName + '</h3>' +
            '<span class="px-3 py-1 rounded-full text-xs font-semibold ' + statusClasses[inv.status] + '">' + statusTexts[inv.status] + '</span>' +
          '</div>' +
          '<p class="text-sm text-gray-600 dark:text-gray-400">' + inv.month + ' · ' + inv.tours.length + ' ' + t('tours') + '</p>' +
          '<p class="text-2xl font-bold text-sky-600 dark:text-sky-400 mt-2">' + (inv.totalSalary || 0).toFixed(2) + '€</p>' +
        '</div>' +
        '<button onclick="openEditModal(\'' + inv.id + '\')" class="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded font-semibold text-sm">' +
          t('viewEdit') +
        '</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

window.openEditModal = async function(invoiceId) {
  const invoice = allInvoices.find(i => i.id === invoiceId);
  if (!invoice) return;

  currentInvoice = invoice;

  document.getElementById('modal-subtitle').textContent = invoice.guideName + ' - ' + invoice.month;

  renderToursTable();
  updateModalTotal();

  // Mostrar comentarios si ERROR_REPORTED
  const commentsSection = document.getElementById('guide-comments-section');
  if (invoice.status === 'ERROR_REPORTED' && invoice.guideComments) {
    commentsSection.classList.remove('hidden');
    document.getElementById('guide-comments').textContent = invoice.guideComments;
  } else {
    commentsSection.classList.add('hidden');
  }

  // Deshabilitar "Aprobar y Enviar" si ya está PENDING_APPROVAL o superior
  const approveBtn = document.getElementById('approve-send-btn');
  if (invoice.status !== 'MANAGER_REVIEW' && invoice.status !== 'ERROR_REPORTED') {
    approveBtn.disabled = true;
    approveBtn.classList.add('opacity-50', 'cursor-not-allowed');
  } else {
    approveBtn.disabled = false;
    approveBtn.classList.remove('opacity-50', 'cursor-not-allowed');
  }

  document.getElementById('edit-modal').classList.remove('hidden');
};

function renderToursTable() {
  const tbody = document.getElementById('tours-table-body');

  tbody.innerHTML = currentInvoice.tours.map((tour, index) => {
    const salary = tour.salario || tour.salarioCalculado || 0;

    return '<tr class="border-b dark:border-gray-700">' +
      '<td class="px-3 py-2">' +
        '<input type="date" value="' + tour.fecha + '" onchange="updateTourField(' + index + ', \'fecha\', this.value)" ' +
          'class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm dark:text-gray-300" />' +
      '</td>' +
      '<td class="px-3 py-2">' +
        '<select onchange="updateTourField(' + index + ', \'slot\', this.value)" ' +
          'class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm dark:text-gray-300">' +
          '<option value="MAÑANA"' + (tour.slot === 'MAÑANA' ? ' selected' : '') + '>' + t('morning') + '</option>' +
          '<option value="T1"' + (tour.slot === 'T1' ? ' selected' : '') + '>T1</option>' +
          '<option value="T2"' + (tour.slot === 'T2' ? ' selected' : '') + '>T2</option>' +
          '<option value="T3"' + (tour.slot === 'T3' ? ' selected' : '') + '>T3</option>' +
          '<option value="EXTRA"' + (tour.slot === 'EXTRA' ? ' selected' : '') + '>EXTRA</option>' +
        '</select>' +
      '</td>' +
      '<td class="px-3 py-2">' +
        '<input type="text" value="' + (tour.tourDescription || tour.description || '') + '" ' +
          'onchange="updateTourField(' + index + ', \'tourDescription\', this.value)" ' +
          'class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm dark:text-gray-300 ' +
          (tour.isExtra ? 'font-semibold text-emerald-600 dark:text-emerald-400' : '') + '" />' +
      '</td>' +
      '<td class="px-3 py-2">' +
        '<input type="number" min="0" value="' + (tour.numPax || 0) + '" ' +
          'onchange="updateTourField(' + index + ', \'numPax\', parseInt(this.value))" ' +
          'class="w-20 text-center bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm dark:text-gray-300" />' +
      '</td>' +
      '<td class="px-3 py-2">' +
        '<input type="number" step="0.01" min="0" value="' + salary + '" ' +
          'onchange="updateTourField(' + index + ', \'salario\', parseFloat(this.value))" ' +
          'class="w-24 text-right bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 font-semibold text-sm dark:text-gray-300" />' +
      '</td>' +
      '<td class="px-3 py-2 text-center">' +
        (tour.isExtra ? '<button onclick="deleteTour(' + index + ')" class="text-red-600 hover:text-red-700 dark:text-red-400">' +
          '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
            '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>' +
          '</svg>' +
        '</button>' : '') +
      '</td>' +
    '</tr>';
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
  saveBtn.textContent = 'Guardando...';

  try {
    await updateDoc(doc(db, 'guide_invoices', currentInvoice.id), {
      tours: currentInvoice.tours,
      totalSalary: currentInvoice.totalSalary,
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

document.getElementById('approve-send-btn').addEventListener('click', async () => {
  const token = await currentUser.getIdTokenResult(true);
  console.log('TOKEN CLAIMS:', token.claims);
  
  if (!confirm(t('confirmApprove'))) return;

  const approveBtn = document.getElementById('approve-send-btn');
  approveBtn.disabled = true;
  approveBtn.textContent = 'Aprobando...';

  try {
    const functions = getFunctions(undefined, 'us-central1');
    const managerApproveInvoice = httpsCallable(functions, 'managerApproveInvoice');

    await managerApproveInvoice({
      invoiceId: currentInvoice.id,
      tours: currentInvoice.tours,
      totalSalary: currentInvoice.totalSalary
    });

    showToast(t('toastApproved'), 'success');
    document.getElementById('edit-modal').classList.add('hidden');
    currentInvoice = null;
  } catch (error) {
    console.error('Error approving:', error);
    showToast(t('toastError'), 'error');
  } finally {
    approveBtn.disabled = false;
    approveBtn.textContent = t('approveSendBtn');
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
  toast.className = 'fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white z-50 ' + typeClass;
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