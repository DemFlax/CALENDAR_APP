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