// public/tools-migrate.js
import { auth } from './firebase-config.js';
import {
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import {
  getFunctions,
  httpsCallable,
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js';

const output = document.getElementById('output');
const runBtn = document.getElementById('run-btn');
const monthInput = document.getElementById('month-input');

runBtn.disabled = true;
output.textContent = 'Comprobando autenticación…';

const functions = getFunctions(undefined, 'us-central1');

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    output.textContent = 'No logueado. Redirigiendo a login…';
    window.location.href = '/login.html';
    return;
  }

  const token = await user.getIdTokenResult(true);
  if (token.claims.role !== 'manager') {
    alert('Solo el manager puede ejecutar esta migración.');
    await signOut(auth);
    window.location.href = '/login.html';
    return;
  }

  output.textContent = `Autenticado como manager (${user.email}). Listo para migrar.`;
  runBtn.disabled = false;
});

runBtn.addEventListener('click', async () => {
  const month = monthInput.value.trim();
  if (!/^[0-9]{4}-[0-9]{2}$/.test(month)) {
    alert('Mes inválido. Usa formato YYYY-MM, por ejemplo 2025-11');
    return;
  }

  runBtn.disabled = true;
  output.textContent = `Ejecutando migración para ${month}…`;

  try {
    const migrateFn = httpsCallable(functions, 'migrateVendorCostsToNet');
    const res = await migrateFn({ month });
    console.log('migrateVendorCostsToNet result:', res.data);

    const data = res.data || {};
    output.textContent =
      `OK.\nMes: ${data.invoiceMonth || month}\n` +
      `Docs revisados: ${data.total || 'N/A'}\n` +
      `Actualizados (NETO): ${data.updated || 0}\n` +
      `Errores: ${data.errors?.length || 0}`;
  } catch (err) {
    console.error('migrateVendorCostsToNet ERROR:', err);
    output.textContent =
      'ERROR en migración:\n' +
      (err.message || JSON.stringify(err));
  } finally {
    runBtn.disabled = false;
  }
});
