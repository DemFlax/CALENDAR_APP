const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzYYRttG8chwjAy1NeoFRvSRSI5PlmdhuDLorD5E1lE63qwP2mixVmPzynu4ZVu9VvJdQ/exec';
const API_KEY = 'dev-secret-key-2025';

export async function validateTour(fecha, slot) {
  try {
    const url = `${APPS_SCRIPT_URL}?apiKey=${API_KEY}&fecha=${fecha}&slot=${slot}`;
    const response = await fetch(url, {
      method: 'GET'
    });
    
    if (!response.ok) throw new Error('Calendar API error');
    
    const data = await response.json();
    return data.exists;
  } catch (error) {
    console.error('Error validating tour:', error);
    return false;
  }
}