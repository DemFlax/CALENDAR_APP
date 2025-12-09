/** 
 * ============================================================
 *  EmailAutomation.gs
 *  Envío automático de emails a guests 18h antes y 12h después
 *  del tour, usando los eventos del calendario CALENDAR_ID.
 *  Requiere:
 *   - Advanced Calendar API activado (Calendar.Events).
 *   - El script corre como la cuenta remitente (ej. madrid@...).
 * ============================================================
 */

// Ciudad por defecto (fallback si la hoja no tiene city)
const SFS_CITY_DEFAULT = 'Madrid';

// ID de la hoja de guías (SFS_Guides_Config)
const GUIDES_SHEET_ID = '14Ftycui3_jAYm6-dIn8wFl9Lvg3CKQ_TQR-9VgIywkQ';

// Caché en memoria por ejecución: emailLower -> { name, city, phone }
var SFS_GUIDES_CACHE = null;

// Ventanas en horas alrededor del objetivo
const SFS_EMAIL_BEFORE_TARGET_HOURS = 18; // 18 horas antes
const SFS_EMAIL_BEFORE_WINDOW_HOURS = 2;  // margen 2h (entre 16–18h antes)

const SFS_EMAIL_AFTER_TARGET_HOURS  = 12; // 12 horas después
const SFS_EMAIL_AFTER_WINDOW_HOURS  = 2;  // margen 2h (entre 12–14h después)

// Dominios que NUNCA se consideran guests
const SFS_EMAIL_BLOCKED_DOMAINS = [
  'tripadvisor.com'
];

// Enlace de review Madrid (Tripadvisor)
const SFS_DEFAULT_REVIEW_LINK = 'https://www.tripadvisor.com/UserReviewEdit-g187514-d28577599-Spain_Food_Sherpas_Madrid-Madrid.html';

// Enlace de mapa del meeting point (Madrid – Calle Arrieta, 2)
const SFS_MEETING_POINT_LINK = 'https://maps.app.goo.gl/L6f1wtZA23oKZp459';


// =========================
// PLANTILLAS TEXTO PLANO
// =========================

// SUBJECT + BODY 18h ANTES (texto plano)
const SFS_EMAIL_BEFORE_SUBJECT = 'Tomorrow\'s food tour in Madrid – Spain Food Sherpas';

const SFS_EMAIL_BEFORE_BODY = `
Hi there,

This is {{GUIDE_NAME}} from Spain Food Sherpas ({{CITY}}). I’ll be your guide tomorrow for your "{{TOUR_NAME}}" experience at {{TOUR_TIME}}.

Tour start time: {{TOUR_TIME}}
Please try to arrive about 10 minutes early so we can start right on time.

Meeting point:
{{MEETING_POINT}}

You can also find the meeting point here:
{{MEETING_POINT_LINK}}

If you haven’t already, could you please let me know if you have any allergies or dietary restrictions? Just reply to this email.

Looking forward to meeting you,

{{GUIDE_NAME}}
Spain Food Sherpas, {{CITY}}
`.trim();

// SUBJECT + BODY 12h DESPUÉS (texto plano)
const SFS_EMAIL_AFTER_SUBJECT = 'Hope you guys had a great time yesterday';

const SFS_EMAIL_AFTER_BODY = `
Hi there,

Hope you guys had a great time yesterday!
It was great to meet you!

If you couldn't yesterday, may I ask you for a little bit of support to our small company?
You can't imagine how valuable your words are. If you can mention my name ({{GUIDE_NAME}}) in the review, that would be really helpful.

You can leave a short review here:
{{REVIEW_LINK}}

Thanks!
{{GUIDE_NAME}}
Spain Food Sherpas, {{CITY}}
`.trim();


// =========================
// PLANTILLAS HTML
// =========================

const SFS_EMAIL_BEFORE_BODY_HTML = `
<p>Hi there,</p>

<p>This is {{GUIDE_NAME}} from Spain Food Sherpas ({{CITY}}). I’ll be your guide tomorrow for your “{{TOUR_NAME}}” experience at {{TOUR_TIME}}.</p>

<p><strong>Tour start time:</strong> {{TOUR_TIME}}<br>
Please try to arrive about 10 minutes early so we can start right on time.</p>

<p><strong>Meeting point:</strong><br>
{{MEETING_POINT}}<br>
You can also find the meeting point here:
<a href="{{MEETING_POINT_LINK}}" target="_blank">Open in Google Maps</a>
</p>

<p>If you haven’t already, could you please let me know if you have any allergies or dietary restrictions? Just reply to this email.</p>

<p>Looking forward to meeting you,</p>

<p>{{GUIDE_NAME}}<br>
Spain Food Sherpas, {{CITY}}</p>
`.trim();

const SFS_EMAIL_AFTER_BODY_HTML = `
<p>Hi there,</p>

<p>Hope you guys had a great time yesterday!<br>
It was great to meet you!</p>

<p>If you couldn't yesterday, may I ask you for a little bit of support to our small company?<br>
You can't imagine how valuable your words are.</p>

<p>You can leave a short review here:<br>
<a href="{{REVIEW_LINK}}" target="_blank">Leave your review on Tripadvisor</a></p>

<p>If you can mention my name ({{GUIDE_NAME}}) in the review, that would be really helpful.</p>

<p>Thanks!<br>
{{GUIDE_NAME}}<br>
Spain Food Sherpas, {{CITY}}</p>
`.trim();


// ======================================================
// LÓGICA PRINCIPAL
// ======================================================

function processAutomaticTourEmails() {
  const now = new Date();
  const nowMs = now.getTime();

  Logger.log('=== SFS processAutomaticTourEmails ===');
  Logger.log('Now (local): ' + now.toString());
  Logger.log('Now (ISO):   ' + now.toISOString());

  // Ventana de búsqueda: 24h antes / 24h después
  const timeMinIso = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();
  const timeMaxIso = new Date(nowMs + 24 * 60 * 60 * 1000).toISOString();

  Logger.log('timeMin: ' + timeMinIso);
  Logger.log('timeMax: ' + timeMaxIso);

  let pageToken = null;
  let totalEvents = 0;

  do {
    const resp = Calendar.Events.list(CALENDAR_ID, {
      timeMin: timeMinIso,
      timeMax: timeMaxIso,
      singleEvents: true,
      orderBy: 'startTime',
      pageToken: pageToken
    });

    const events = resp.items || [];
    Logger.log('Page events count: ' + events.length);
    totalEvents += events.length;

    events.forEach(function(event) {
      try {
        sfsProcessSingleEventForEmails_(event, now);
      } catch (err) {
        Logger.log('SFS EMAIL ERROR eventId=' + event.id + ': ' + err.toString());
      }
    });

    pageToken = resp.nextPageToken || null;
  } while (pageToken);

  Logger.log('Total events processed in window: ' + totalEvents);
}


function sfsProcessSingleEventForEmails_(event, now) {
  Logger.log('---');
  Logger.log('Event ID: ' + event.id);
  Logger.log('Summary: ' + (event.summary || 'Sin título'));

  if (!event.start || !event.start.dateTime) {
    Logger.log('Skipping event (no start.dateTime, maybe all-day).');
    return;
  }

  const start = new Date(event.start.dateTime);
  Logger.log('Start (local): ' + start.toString());
  Logger.log('Start (ISO):   ' + start.toISOString());

  const nowMs = now.getTime();
  const startMs = start.getTime();

  const diffBeforeHours = (startMs - nowMs) / (1000 * 60 * 60);
  const diffAfterHours  = (nowMs - startMs) / (1000 * 60 * 60);

  Logger.log('diffBeforeHours: ' + diffBeforeHours.toFixed(3));
  Logger.log('diffAfterHours:  ' + diffAfterHours.toFixed(3));

  // 1) Guía
  const guide = sfsDetectGuideFromEvent_(event);
  if (!guide) {
    Logger.log('No guide detected (0 or >1 valid attendees). Skipping.');
    return;
  }
  Logger.log('Guide detected: ' + guide.name + ' <' + guide.email + '> (city=' + guide.city + ')');

  // 2) Guests desde descripción
  const description = event.description || '';
  const attendeeEmails = (event.attendees || [])
    .map(function(a) { return a.email || ''; })
    .filter(function(e) { return !!e; });

  Logger.log('Attendee emails: ' + JSON.stringify(attendeeEmails));

  const guestEmails = sfsExtractGuestEmailsFromDescription_(description, guide.email, attendeeEmails);
  Logger.log('Guest emails extracted: ' + JSON.stringify(guestEmails));

  if (guestEmails.length === 0) {
    Logger.log('No guest emails found in description. Skipping.');
    return;
  }

  // 3) Flags en extendedProperties.private
  const privateProps = (event.extendedProperties && event.extendedProperties.private) || {};
  var beforeSent = privateProps.sfsEmail12hBeforeSent === 'true';
  var afterSent  = privateProps.sfsEmail12hAfterSent  === 'true';

  Logger.log('Flags -> beforeSent=' + beforeSent + ', afterSent=' + afterSent);

  var stateChanged = false;

  // 4) Email 18h ANTES
  if (!beforeSent &&
      diffBeforeHours <= SFS_EMAIL_BEFORE_TARGET_HOURS &&
      diffBeforeHours > (SFS_EMAIL_BEFORE_TARGET_HOURS - SFS_EMAIL_BEFORE_WINDOW_HOURS)) {

    Logger.log('Condition BEFORE met. Sending BEFORE email...');
    sfsSendEmailBeforeTour_(event, guide, guestEmails);
    beforeSent = true;
    privateProps.sfsEmail12hBeforeSent = 'true';
    stateChanged = true;
  } else {
    Logger.log('Condition BEFORE NOT met for this run.');
  }

  // 5) Email 12h DESPUÉS
  if (!afterSent &&
      diffAfterHours >= SFS_EMAIL_AFTER_TARGET_HOURS &&
      diffAfterHours < (SFS_EMAIL_AFTER_TARGET_HOURS + SFS_EMAIL_AFTER_WINDOW_HOURS)) {

    Logger.log('Condition AFTER met. Sending AFTER email...');
    sfsSendEmailAfterTour_(event, guide, guestEmails);
    afterSent = true;
    privateProps.sfsEmail12hAfterSent = 'true';
    stateChanged = true;
  } else {
    Logger.log('Condition AFTER NOT met for this run.');
  }

  // 6) Update flags
  if (stateChanged) {
    Logger.log('Updating extendedProperties.private flags in event...');
    const patchBody = {
      extendedProperties: {
        private: privateProps
      }
    };

    Calendar.Events.patch(patchBody, CALENDAR_ID, event.id, {
      sendUpdates: 'none'
    });
    Logger.log('Event flags updated.');
  } else {
    Logger.log('No state change, no patch.');
  }
}


// ============ GUÍAS (Sheets) ============

function sfsLoadGuidesCache_() {
  if (SFS_GUIDES_CACHE) {
    return SFS_GUIDES_CACHE;
  }

  const map = {};
  try {
    const ss = SpreadsheetApp.openById(GUIDES_SHEET_ID);
    const sheet = ss.getSheetByName('GUIDES') || ss.getSheets()[0];
    const values = sheet.getDataRange().getValues(); // incluye cabecera

    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      if (!row || !row[0]) continue;

      const email = String(row[0]).trim().toLowerCase();
      const name  = row[1] ? String(row[1]).trim() : '';
      const city  = row[2] ? String(row[2]).trim() : '';
      const phone = row[3] ? String(row[3]).trim() : '';

      if (!email) continue;

      map[email] = {
        email: email,
        name: name,
        city: city || SFS_CITY_DEFAULT,
        phone: phone
      };
    }

    Logger.log('Guides loaded from sheet: ' + Object.keys(map).length);
  } catch (err) {
    Logger.log('ERROR loading guides sheet: ' + err.toString());
  }

  SFS_GUIDES_CACHE = map;
  return SFS_GUIDES_CACHE;
}


function sfsGetGuideProfileByEmail_(email) {
  if (!email) return null;
  const cache = sfsLoadGuidesCache_();
  return cache[email.toLowerCase()] || null;
}


function sfsDetectGuideFromEvent_(event) {
  const attendees = event.attendees || [];
  if (attendees.length === 0) return null;

  const guides = attendees.filter(function(att) {
    if (!att.email) return false;
    const emailLower = att.email.toLowerCase();

    const blocked = SFS_EMAIL_BLOCKED_DOMAINS.some(function(domain) {
      return emailLower.indexOf(domain) !== -1;
    });
    return !blocked;
  });

  if (guides.length !== 1) {
    return null;
  }

  const guideAtt = guides[0];
  const email = guideAtt.email;
  const profile = sfsGetGuideProfileByEmail_(email);

  let name;
  let city;
  let phone;

  if (profile) {
    name  = profile.name || guideAtt.displayName || (email.split('@')[0]);
    city  = profile.city || SFS_CITY_DEFAULT;
    phone = profile.phone || '';
  } else {
    Logger.log('GUIDE PROFILE NOT FOUND in sheet for email: ' + email);
    name  = guideAtt.displayName || (email.split('@')[0]);
    city  = SFS_CITY_DEFAULT;
    phone = '';
  }

  return {
    email: email,
    name: name,
    city: city,
    phone: phone
  };
}


// ============ GUESTS (emails en descripción) ============

function sfsExtractGuestEmailsFromDescription_(description, guideEmail, attendeeEmails) {
  if (!description) return [];

  const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig;
  const matches = description.match(EMAIL_REGEX) || [];

  const guideEmailLower = guideEmail ? guideEmail.toLowerCase() : '';
  const attendeeSet = {};
  (attendeeEmails || []).forEach(function(e) {
    attendeeSet[e.toLowerCase()] = true;
  });

  const blockSet = {};
  SFS_EMAIL_BLOCKED_DOMAINS.forEach(function(domain) {
    blockSet[domain.toLowerCase()] = true;
  });

  const resultSet = {};

  matches.forEach(function(raw) {
    const email = raw.trim().toLowerCase();
    if (!email) return;

    if (guideEmailLower && email === guideEmailLower) return;
    if (attendeeSet[email]) return;

    var blocked = false;
    Object.keys(blockSet).forEach(function(domain) {
      if (!blocked && email.indexOf(domain) !== -1) {
        blocked = true;
      }
    });
    if (blocked) return;

    resultSet[email] = true;
  });

  return Object.keys(resultSet);
}


// ============ ENVÍO DE EMAILS ============

function sfsSendEmailBeforeTour_(event, guide, guestEmails) {
  const start = new Date(event.start.dateTime);
  const tourName = event.summary || 'Your tour';
  const meetingPoint = event.location || 'Meeting point to be confirmed';

  const timeZone = Session.getScriptTimeZone();
  const tourDateStr = Utilities.formatDate(start, timeZone, 'EEEE, MMMM d');
  const tourTimeStr = Utilities.formatDate(start, timeZone, 'HH:mm');

  const data = {
    GUIDE_NAME: guide.name,
    TOUR_NAME: tourName,
    TOUR_DATE: tourDateStr,
    TOUR_TIME: tourTimeStr,
    MEETING_POINT: meetingPoint,
    MEETING_POINT_LINK: SFS_MEETING_POINT_LINK,
    REVIEW_LINK: SFS_DEFAULT_REVIEW_LINK,
    CITY: guide.city || SFS_CITY_DEFAULT
  };

  const textBody = sfsFillTemplate_(SFS_EMAIL_BEFORE_BODY, data);
  const htmlBody = sfsFillTemplate_(SFS_EMAIL_BEFORE_BODY_HTML, data);

  Logger.log('Sending BEFORE email to: ' + JSON.stringify(guestEmails));
  guestEmails.forEach(function(email) {
    GmailApp.sendEmail(email, SFS_EMAIL_BEFORE_SUBJECT, textBody, {
      name: 'Spain Food Sherpas – ' + guide.name,
      replyTo: guide.email,
      htmlBody: htmlBody,
      bcc: guide.email // copia oculta al guía SOLO en el email de ANTES
    });
  });
}


function sfsSendEmailAfterTour_(event, guide, guestEmails) {
  const start = new Date(event.start.dateTime);
  const tourName = event.summary || 'Your tour';

  const timeZone = Session.getScriptTimeZone();
  const tourDateStr = Utilities.formatDate(start, timeZone, 'EEEE, MMMM d');

  const data = {
    GUIDE_NAME: guide.name,
    TOUR_NAME: tourName,
    TOUR_DATE: tourDateStr,
    REVIEW_LINK: SFS_DEFAULT_REVIEW_LINK,
    CITY: guide.city || SFS_CITY_DEFAULT
  };

  const textBody = sfsFillTemplate_(SFS_EMAIL_AFTER_BODY, data);
  const htmlBody = sfsFillTemplate_(SFS_EMAIL_AFTER_BODY_HTML, data);

  Logger.log('Sending AFTER email to: ' + JSON.stringify(guestEmails));
  guestEmails.forEach(function(email) {
    GmailApp.sendEmail(email, SFS_EMAIL_AFTER_SUBJECT, textBody, {
      name: 'Spain Food Sherpas – ' + guide.name,
      replyTo: guide.email,
      htmlBody: htmlBody
      // sin BCC aquí: solo en el email de ANTES
    });
  });
}


// ============ UTILIDADES ============

function sfsFillTemplate_(template, data) {
  return template.replace(/{{(\w+)}}/g, function(match, key) {
    if (data.hasOwnProperty(key)) {
      return data[key];
    }
    return match;
  });
}
