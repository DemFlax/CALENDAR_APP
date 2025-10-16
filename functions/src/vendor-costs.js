// =========================================
// VENDOR COSTS MODULE
// =========================================
const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');
const {logger} = require('firebase-functions');

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
// FUNCTION: registerVendorCost (callable)
// =========================================
exports.registerVendorCost = onCall(async (request) => {
  const { data, auth } = request;
  
  // 1. Auth check
  if (!auth || auth.token.role !== 'guide') {
    throw new HttpsError('unauthenticated', 'Must be authenticated guide');
  }
  
  const guideId = auth.token.guideId;
  const db = getFirestore();
  
  // 2. Validate required fields
  if (!data.shiftId || !data.numPax || !Array.isArray(data.vendors) || data.vendors.length === 0) {
    throw new HttpsError('invalid-argument', 'Missing required fields');
  }
  
  // 3. Validate numPax range
  if (data.numPax < 1 || data.numPax > 20) {
    throw new HttpsError('invalid-argument', 'numPax must be between 1 and 20');
  }
  
  try {
    // 4. Validate shift exists and is assigned to guide
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
    
    // 5. Validate shift date (max 7 days retroactive)
    const shiftDate = new Date(shift.fecha);
    const today = new Date();
    const diffDays = Math.floor((today - shiftDate) / (1000 * 60 * 60 * 24));
    
    if (diffDays > 7) {
      throw new HttpsError('failed-precondition', 'Cannot register vendor costs older than 7 days');
    }
    
    // 6. Check for duplicates
    const existingSnap = await db
      .collection('vendor_costs')
      .where('shiftId', '==', data.shiftId)
      .where('guideId', '==', guideId)
      .limit(1)
      .get();
    
    if (!existingSnap.empty) {
      throw new HttpsError('already-exists', 'Vendor cost already registered for this shift');
    }
    
    // 7. Validate all vendors exist and are active
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
    
    // 8. Get guide data
    const guideSnap = await db.collection('guides').doc(guideId).get();
    const guide = guideSnap.data();
    
    // 9. Calculate salary
    const salarioCalculado = await calculateSalary(data.numPax);
    
    // 10. Calculate total vendors
    const totalVendors = data.vendors.reduce((sum, v) => sum + v.importe, 0);
    
    // 11. Create vendor cost document
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
        driveFileId: null // TODO: Apps Script integration
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
// FUNCTION: calculateSalaryPreview (callable)
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
    logger.error('Error calculating salary preview', { numPax: data.numPax, error: error.message });
    throw new HttpsError('internal', 'Failed to calculate salary');
  }
});