/* =====================================================================
   LANTERN — Supabase client (incident reports only)
   ---------------------------------------------------------------------
   A tiny wrapper around Supabase's REST API (PostgREST) using plain
   fetch(). No SDK or CDN script is needed, so there is one less thing
   that can fail during a demo.

   - Only the PUBLIC key from config.js is ever used.
   - If a secret / service_role key is pasted by mistake, it is refused.
   - Every call returns { ok: true, ... } or { ok: false, reason }.
     Nothing here throws, so a database problem can never crash the app.
   ===================================================================== */
(function (global) {
'use strict';

const TABLE = 'incident_reports';
const TIMEOUT_MS = 6000;

const cfg = global.LANTERN_CONFIG || {};
const clean = v => (typeof v === 'string' ? v.trim() : '');
const url = clean(cfg.SUPABASE_URL).replace(/\/+$/, '');
const key = clean(cfg.SUPABASE_ANON_KEY);

function looksLikePlaceholder(s){ return !s || /YOUR[_-]|<[^>]*>/i.test(s); }

function decodeJwtRole(k){
  try {
    const payload = k.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload)).role || null;
  } catch (e) { return null; }
}
function isJwt(k){ return /^eyJ/.test(k) && k.split('.').length === 3; }
function isSecretKey(k){ return /^sb_secret_/.test(k) || decodeJwtRole(k) === 'service_role'; }

/* Decide once, at load time, whether the database can be used at all. */
let disabledReason = null;
if (looksLikePlaceholder(url) || looksLikePlaceholder(key)) {
  disabledReason = 'not-configured';
} else if (!/^https:\/\//i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(url)) {
  disabledReason = 'bad-url';
} else if (isSecretKey(key)) {
  disabledReason = 'secret-key';
  console.error('[LANTERN] A secret/service_role key was found in js/config.js. ' +
    'It has been ignored. Use the PUBLIC (publishable/anon) key only, and rotate the secret key in Supabase.');
}

function headers(extra){
  const h = Object.assign({ apikey: key }, extra || {});
  // Legacy anon keys are JWTs and may also be sent as a Bearer token.
  // Publishable keys (sb_publishable_...) are not JWTs and go in `apikey` only.
  if (isJwt(key)) h.Authorization = 'Bearer ' + key;
  return h;
}

async function request(path, options){
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url + '/rest/v1/' + path, Object.assign({}, options, { signal: ctrl.signal }));
    if (!res.ok) return { ok: false, reason: 'http-' + res.status, status: res.status };
    const data = res.status === 204 ? null : await res.json();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, reason: err && err.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}

/* Load saved reports (newest first, capped at 500). */
async function fetchIncidents(){
  if (disabledReason) return { ok: false, reason: disabledReason };
  const query = 'select=id,route_segment,severity,incident_hour,reported_at&order=created_at.desc&limit=500';
  const r = await request(TABLE + '?' + query, { method: 'GET', headers: headers({ Accept: 'application/json' }) });
  if (!r.ok) return r;
  if (!Array.isArray(r.data)) return { ok: false, reason: 'bad-response' };
  return { ok: true, rows: r.data };
}

/* Save one report. Only whitelisted fields are ever sent. */
async function saveIncident(report){
  if (disabledReason) return { ok: false, reason: disabledReason };
  const body = {
    route_segment: String(report.route_segment),
    segment_name:  String(report.segment_name || '').slice(0, 80),
    severity:      report.severity | 0,
    incident_hour: report.incident_hour | 0,
    reported_at:   report.reported_at || new Date().toISOString()
  };
  const r = await request(TABLE, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify(body)
  });
  if (!r.ok) return r;
  const row = Array.isArray(r.data) ? r.data[0] : r.data;
  return { ok: true, row: row || null };
}

/* Short, plain-language cause for the UI. */
function describeFailure(reason){
  switch (reason) {
    case 'not-configured': return 'Supabase is not configured yet';
    case 'bad-url':        return 'the Supabase URL in js/config.js is not valid';
    case 'secret-key':     return 'a secret key was found in js/config.js and was ignored';
    case 'timeout':        return 'the request timed out';
    case 'network':        return 'the network request failed';
    case 'http-401':
    case 'http-403':       return 'access was denied (check the key and the table policies)';
    case 'http-404':       return 'the incident_reports table was not found (run supabase/schema.sql)';
    case 'http-400':       return 'the database rejected the data (check the table schema)';
    case 'bad-response':   return 'the database sent an unexpected response';
    default:               return 'the database returned an error';
  }
}

global.LanternDB = {
  isConfigured: () => !disabledReason,
  disabledReason: () => disabledReason,
  fetchIncidents,
  saveIncident,
  describeFailure
};

})(window);
