const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');

const SLOTS = ['MAÑANA', 'T1', 'T2', 'T3'];

/**
 * Genera mes +2 si no existe
 * Schedule: días 1-3 de cada mes a las 02:00 Europe/Madrid
 * Idempotencia: verifica antes de crear
 */
exports.generateMonthlyShifts = onSchedule({
  schedule: '0 2 1-3 * *',
  timeZone: 'Europe/Madrid',
  memory: '256MiB',
  timeoutSeconds: 60,
  retryConfig: {
    retryCount: 3,
    maxRetryDuration: '600s',
    minBackoffDuration: '10s',
    maxBackoffDuration: '60s'
  }
}, async (event) => {
  const startTime = Date.now();
  
  try {
    const db = admin.firestore();
    const today = new Date();
    
    // Calcular mes +2
    const targetDate = new Date(today);
    targetDate.setMonth(today.getMonth() + 2);
    const targetYear = targetDate.getFullYear();
    const targetMonth = targetDate.getMonth();
    
    const monthKey = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`;
    const monthStart = `${monthKey}-01`;
    const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
    const monthEnd = `${monthKey}-${String(daysInMonth).padStart(2, '0')}`;
    
    logger.info('Checking month generation', {
      currentDate: today.toISOString(),
      targetMonth: monthKey,
      dateRange: `${monthStart} to ${monthEnd}`
    });
    
    // Verificar idempotencia
    const existingShifts = await db.collection('shifts')
      .where('fecha', '>=', monthStart)
      .where('fecha', '<=', monthEnd)
      .limit(1)
      .get();
    
    if (!existingShifts.empty) {
      logger.info('Month already exists, skipping', {
        month: monthKey,
        executionTimeMs: Date.now() - startTime
      });
      return { success: true, action: 'skipped', month: monthKey };
    }
    
    // Generar turnos
    const batch = db.batch();
    let shiftsCreated = 0;
    
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${monthKey}-${String(day).padStart(2, '0')}`;
      
      for (const slot of SLOTS) {
        const shiftId = `${dateStr}_${slot}`;
        const docRef = db.collection('shifts').doc(shiftId);
        
        batch.set(docRef, {
          fecha: dateStr,
          slot: slot,
          estado: 'LIBRE',
          guiaId: null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        shiftsCreated++;
      }
    }
    
    await batch.commit();
    
    const executionTimeMs = Date.now() - startTime;
    
    logger.info('Month generated successfully', {
      month: monthKey,
      shiftsCreated: shiftsCreated,
      executionTimeMs: executionTimeMs,
      daysInMonth: daysInMonth
    });
    
    return {
      success: true,
      action: 'created',
      month: monthKey,
      shiftsCreated: shiftsCreated,
      executionTimeMs: executionTimeMs
    };
    
  } catch (error) {
    logger.error('Error generating monthly shifts', {
      error: error.message,
      stack: error.stack,
      executionTimeMs: Date.now() - startTime
    });
    
    throw error; // Cloud Scheduler retry
  }
});