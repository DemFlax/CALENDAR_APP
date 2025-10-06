const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzSSOFCmzJDk9dkabOGdoJS4Stp318VjHC-ShH-Yng5YkUfu6K9n4OT0UCPuAJAEsbPFw/exec';
const API_KEY = 'calendar-api-key-2025-secure';

export async function validateTour(fecha, slot) {
  try {
    const url = `${APPS_SCRIPT_URL}?fecha=${fecha}&slot=${slot}&apiKey=${API_KEY}`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error('Network error');
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error validating tour:', error);
    throw error;
  }
}