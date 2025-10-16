import { auth, db } from './firebase-config.js';
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  getDocs,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  writeBatch
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

let currentUser = null;
let vendorsUnsubscribe = null;
let editingVendorId = null;
let draggedVendor = null;

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    loadVendors();
  } else {
    window.location.href = '/login.html';
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await signOut(auth);
});

function loadVendors() {
  const vendorsQuery = query(collection(db, 'vendors'), where('estado', '==', 'activo'));
  if (vendorsUnsubscribe) vendorsUnsubscribe();
  
  vendorsUnsubscribe = onSnapshot(vendorsQuery, (snapshot) => {
    const vendorsList = document.getElementById('vendors-list');
    vendorsList.innerHTML = '';
    
    if (snapshot.empty) {
      vendorsList.innerHTML = '<div class="col-span-full text-center py-12"><p class="text-gray-500 dark:text-gray-400">No hay vendors registrados</p><button onclick="showCreateVendorModal()" class="mt-4 bg-emerald-600 text-white px-4 py-2 rounded-lg">Crear primer vendor</button></div>';
      return;
    }
    
    const vendors = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => a.orden - b.orden);
    
    vendors.forEach(vendor => {
      vendorsList.appendChild(createVendorCard(vendor));
    });
  });
}

function createVendorCard(vendor) {
  const card = document.createElement('div');
  card.className = 'bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-lg hover:shadow-xl transition border border-gray-200 dark:border-gray-700';
  card.draggable = true;
  card.dataset.vendorId = vendor.id;
  
  card.addEventListener('dragstart', handleDragStart);
  card.addEventListener('dragover', handleDragOver);
  card.addEventListener('drop', handleDrop);
  card.addEventListener('dragend', handleDragEnd);
  
  card.innerHTML = `
    <div class="flex justify-between items-start gap-3">
      <div class="flex items-center gap-2 flex-1 min-w-0">
        <svg class="w-5 h-5 text-gray-400 cursor-move flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
        </svg>
        <h3 class="font-bold text-lg truncate text-gray-900 dark:text-white">${vendor.nombre}</h3>
      </div>
      <div class="flex gap-1 flex-shrink-0">
        <button onclick="editVendor('${vendor.id}')" class="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg text-blue-600 dark:text-blue-400" title="Editar">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
          </svg>
        </button>
        <button onclick="deactivateVendor('${vendor.id}', '${vendor.nombre}')" class="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-red-600 dark:text-red-400" title="Desactivar">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
          </svg>
        </button>
      </div>
    </div>
    <div class="mt-3 space-y-1 text-sm text-gray-600 dark:text-gray-400">
      ${vendor.cif ? `<p>🆔 ${vendor.cif}</p>` : ''}
      ${vendor.direccion ? `<p>📍 ${vendor.direccion}</p>` : ''}
      ${vendor.email ? `<p>📧 ${vendor.email}</p>` : ''}
      <p class="text-xs text-gray-500 dark:text-gray-500 mt-2">Orden: ${vendor.orden}</p>
    </div>
  `;
  
  return card;
}

// DRAG & DROP
function handleDragStart(e) {
  draggedVendor = this.dataset.vendorId;
  this.style.opacity = '0.4';
}

function handleDragOver(e) {
  if (e.preventDefault) e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function handleDrop(e) {
  if (e.stopPropagation) e.stopPropagation();
  
  const targetVendorId = this.dataset.vendorId;
  if (draggedVendor !== targetVendorId) {
    reorderVendors(draggedVendor, targetVendorId);
  }
  
  return false;
}

function handleDragEnd() {
  this.style.opacity = '1';
}

async function reorderVendors(draggedId, targetId) {
  try {
    const vendorsSnapshot = await getDocs(query(collection(db, 'vendors'), where('estado', '==', 'activo')));
    const vendors = vendorsSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => a.orden - b.orden);
    
    const draggedIndex = vendors.findIndex(v => v.id === draggedId);
    const targetIndex = vendors.findIndex(v => v.id === targetId);
    
    const [removed] = vendors.splice(draggedIndex, 1);
    vendors.splice(targetIndex, 0, removed);
    
    const batch = writeBatch(db);
    vendors.forEach((vendor, index) => {
      batch.update(doc(db, 'vendors', vendor.id), { orden: index });
    });
    
    await batch.commit();
  } catch (error) {
    console.error('Error reordering:', error);
    alert('Error al reordenar vendors');
  }
}

// MODAL
window.showCreateVendorModal = function() {
  editingVendorId = null;
  document.getElementById('modal-title').textContent = 'Crear Vendor';
  document.getElementById('vendor-form').reset();
  document.getElementById('vendor-modal').classList.remove('hidden');
};

window.closeVendorModal = function() {
  document.getElementById('vendor-modal').classList.add('hidden');
  editingVendorId = null;
};

window.editVendor = async function(vendorId) {
  editingVendorId = vendorId;
  const vendorDoc = await getDocs(query(collection(db, 'vendors'), where('__name__', '==', vendorId)));
  const vendor = vendorDoc.docs[0].data();
  
  document.getElementById('modal-title').textContent = 'Editar Vendor';
  document.getElementById('nombre').value = vendor.nombre;
  document.getElementById('cif').value = vendor.cif || '';
  document.getElementById('direccion').value = vendor.direccion || '';
  document.getElementById('email').value = vendor.email || '';
  
  document.getElementById('vendor-modal').classList.remove('hidden');
};

window.deactivateVendor = async function(vendorId, nombre) {
  if (!confirm(`¿Desactivar vendor "${nombre}"?`)) return;
  
  try {
    await updateDoc(doc(db, 'vendors', vendorId), {
      estado: 'inactivo',
      updatedAt: serverTimestamp()
    });
    alert('Vendor desactivado');
  } catch (error) {
    console.error('Error:', error);
    alert('Error al desactivar vendor');
  }
};

// FORM SUBMIT
document.getElementById('vendor-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const nombre = document.getElementById('nombre').value.trim();
  const cif = document.getElementById('cif').value.trim() || null;
  const direccion = document.getElementById('direccion').value.trim() || null;
  const email = document.getElementById('email').value.trim() || null;
  
  if (!nombre) {
    alert('Nombre requerido');
    return;
  }
  
  try {
    if (editingVendorId) {
      await updateDoc(doc(db, 'vendors', editingVendorId), {
        nombre,
        cif,
        direccion,
        email,
        updatedAt: serverTimestamp()
      });
      alert('Vendor actualizado');
    } else {
      const vendorsSnapshot = await getDocs(query(collection(db, 'vendors'), where('estado', '==', 'activo')));
      const maxOrden = vendorsSnapshot.empty ? -1 : Math.max(...vendorsSnapshot.docs.map(doc => doc.data().orden));
      
      await addDoc(collection(db, 'vendors'), {
        nombre,
        cif,
        direccion,
        email,
        orden: maxOrden + 1,
        estado: 'activo',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      alert('Vendor creado');
    }
    
    closeVendorModal();
  } catch (error) {
    console.error('Error:', error);
    alert('Error al guardar vendor');
  }
});