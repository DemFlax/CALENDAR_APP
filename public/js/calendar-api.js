// =========================================
// CALENDAR API - SECURE PROXY VERSION
// =========================================
// Version: 2.0 (Security Fix C1)
// Date: 2025-11-05
// Changes: All Apps Script calls now go through authenticated Cloud Functions
// =========================================

import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js';

const functions = getFunctions();

/**
 * Validate if a tour exists in Google Calendar for given date/slot
 * @param {string} fecha - Date in YYYY-MM-DD format
 * @param {string} slot - Slot: MAÑANA, T1, T2, T3
 * @returns {Promise<Object>} { exists, eventId, summary, startTime, endTime }
 */
export async function validateTour(fecha, slot) {
  try {
    const proxyValidateTour = httpsCallable(functions, 'proxyValidateTour');
    const result = await proxyValidateTour({ fecha, slot });
    return result.data;
  } catch (error) {
    console.error('Error validating tour:', error);
    throw error;
  }
}

/**
 * Add guide email to Calendar event attendees
 * @param {string} eventId - Google Calendar event ID
 * @param {string} guideEmail - Guide's email to add
 * @returns {Promise<Object>} { success: true }
 */
export async function addGuideToCalendarEvent(eventId, guideEmail) {
  try {
    const proxyAddGuide = httpsCallable(functions, 'proxyAddGuideToEvent');
    const result = await proxyAddGuide({ eventId, guideEmail });
    return result.data;
  } catch (error) {
    console.error('Error adding guide to calendar:', error);
    throw error;
  }
}

/**
 * Remove guide email from Calendar event attendees
 * @param {string} eventId - Google Calendar event ID
 * @param {string} guideEmail - Guide's email to remove
 * @returns {Promise<Object>} { success: true }
 */
export async function removeGuideFromCalendarEvent(eventId, guideEmail) {
  try {
    const proxyRemoveGuide = httpsCallable(functions, 'proxyRemoveGuideFromEvent');
    const result = await proxyRemoveGuide({ eventId, guideEmail });
    return result.data;
  } catch (error) {
    console.error('Error removing guide from calendar:', error);
    throw error;
  }
}

/**
 * Get full event details from Google Calendar including description with guest info
 * @param {string} eventId - Google Calendar event ID
 * @param {Object} options - Configuration options
 * @param {number} options.timeout - Timeout in ms (handled by Cloud Functions)
 * @returns {Promise<Object>} Event details with parsed guest information
 */
export async function getTourGuestDetails(eventId, options = {}) {
  try {
    const proxyGetDetails = httpsCallable(functions, 'proxyGetEventDetails');
    const result = await proxyGetDetails({ eventId });
    return result.data;
  } catch (error) {
    // Preserve error codes from Apps Script
    if (error.code === 'functions/not-found') {
      const notFoundError = new Error('Event not found');
      notFoundError.code = 'NOT_FOUND';
      throw notFoundError;
    }
    
    if (error.code === 'functions/unauthenticated') {
      const authError = new Error('Authentication required');
      authError.code = 'UNAUTHORIZED';
      throw authError;
    }
    
    console.error('Error fetching tour details:', error);
    throw error;
  }
}