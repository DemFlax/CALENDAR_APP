import { appsScriptConfig } from './firebase-config.js';

const { url: APPS_SCRIPT_URL, apiKey: API_KEY } = appsScriptConfig;

export async function validateTour(fecha, slot) {
  try {
    const url = `${APPS_SCRIPT_URL}?fecha=${fecha}&slot=${slot}&apiKey=${API_KEY}`;
   
    const response = await fetch(url);
    if (!response.ok) throw new Error('Network error');
   
    const data = await response.json();
   
    if (data.error) throw new Error(data.message);
   
    return data;
  } catch (error) {
    console.error('Error validating tour:', error);
    throw error;
  }
}

export async function addGuideToCalendarEvent(eventId, guideEmail) {
  try {
    const url = `${APPS_SCRIPT_URL}?endpoint=addGuideToEvent&eventId=${eventId}&guideEmail=${encodeURIComponent(guideEmail)}&apiKey=${API_KEY}`;
   
    const response = await fetch(url);
    if (!response.ok) throw new Error('Network error');
   
    const data = await response.json();
   
    if (data.error) throw new Error(data.message);
   
    return data;
  } catch (error) {
    console.error('Error adding guide to calendar:', error);
    throw error;
  }
}

export async function removeGuideFromCalendarEvent(eventId, guideEmail) {
  try {
    const url = `${APPS_SCRIPT_URL}?endpoint=removeGuideFromEvent&eventId=${eventId}&guideEmail=${encodeURIComponent(guideEmail)}&apiKey=${API_KEY}`;
   
    const response = await fetch(url);
    if (!response.ok) throw new Error('Network error');
   
    const data = await response.json();
   
    if (data.error) throw new Error(data.message);
   
    return data;
  } catch (error) {
    console.error('Error removing guide from calendar:', error);
    throw error;
  }
}

/**
 * Obtiene detalles completos de un tour desde Google Calendar
 * @param {string} eventId - ID del evento de Calendar
 * @param {Object} options - Opciones de configuración
 * @param {number} options.timeout - Timeout en ms (default: 10000)
 * @returns {Promise<Object>} Datos del evento
 * @throws {Error} Si falla la petición o timeout
 */
export async function getTourGuestDetails(eventId, options = {}) {
  const timeout = options.timeout || 10000;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const url = `${APPS_SCRIPT_URL}?endpoint=getEventDetails&eventId=${eventId}&apiKey=${API_KEY}`;
    
    const response = await fetch(url, {
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      const error = new Error(data.message);
      error.code = data.code;
      throw error;
    }
    
    return data.event;
    
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      const timeoutError = new Error('Request timeout');
      timeoutError.code = 'TIMEOUT';
      throw timeoutError;
    }
    
    console.error('Error fetching tour details:', error);
    throw error;
  }
}