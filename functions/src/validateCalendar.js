const fetch = require('node-fetch');
const { logger } = require('firebase-functions');

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxObVxcrVN03Jmiy7svvDS-AbHcPJ_YjbiLCqnrkkxEEDID2j-w8QMRHSGJH8A_ZZ_j8Q/exec';
const API_KEY = 'tu-api-key-segura-123';

async function validateTourExists(fecha, slot) {
  try {
    const url = `${APPS_SCRIPT_URL}?fecha=${fecha}&slot=${slot}&apiKey=${API_KEY}`;
    
    logger.info('Validating tour', { fecha, slot });
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.message || 'Calendar validation error');
    }
    
    logger.info('Validation result', { exists: data.exists, eventId: data.eventId });
    
    return {
      exists: data.exists,
      eventId: data.eventId,
      summary: data.summary
    };
    
  } catch (error) {
    logger.error('Error validating tour', { error: error.message, fecha, slot });
    throw error;
  }
}

async function addGuideToEvent(eventId, guideEmail) {
  try {
    const url = `${APPS_SCRIPT_URL}?endpoint=addGuideToEvent&eventId=${eventId}&guideEmail=${encodeURIComponent(guideEmail)}&apiKey=${API_KEY}`;
    
    logger.info('Adding guide to event', { eventId, guideEmail });
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      timeout: 3000
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.message);
    }
    
    logger.info('Guide added to event', { success: data.success });
    return true;
    
  } catch (error) {
    logger.error('Error adding guide to event', { error: error.message });
    return false;
  }
}

async function removeGuideFromEvent(eventId, guideEmail) {
  try {
    const url = `${APPS_SCRIPT_URL}?endpoint=removeGuideFromEvent&eventId=${eventId}&guideEmail=${encodeURIComponent(guideEmail)}&apiKey=${API_KEY}`;
    
    logger.info('Removing guide from event', { eventId, guideEmail });
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      timeout: 3000
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.message);
    }
    
    logger.info('Guide removed from event', { success: data.success });
    return true;
    
  } catch (error) {
    logger.error('Error removing guide from event', { error: error.message });
    return false;
  }
}

module.exports = {
  validateTourExists,
  addGuideToEvent,
  removeGuideFromEvent
};