// Sasai Credit — Rule Engine Console: application logic

function initials(name) {
  return name.split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
}

function makeFallback(prefix, blank) {
  if (blank) return { entries: [], tiers: { fullMin: 4, partialMin: 2, thinCeiling: 0, zeroMin: 0 } };
  const fb = structuredClone(FALLBACK_SEED);
  fb.entries.forEach((e, j) => { e.id = `${prefix}f${j}`; });
  return fb;
}

function makeProfile(seed, idx) {
  return {
    name: seed.name,
    blurb: seed.blurb,
    market: seed.market,
    version: seed.version,
    status: seed.status,
    editedAt: seed.editedAt,
    editedBy: seed.editedBy,
    third: seed.third,
    initials: initials(seed.name),
    versions: structuredClone(seed.versions || []),
    // The last measured/published baseline. Population share, bad rate and the
    // draft-vs-live delta are all derived against this, so a floor drag moves
    // the numbers while the seeded figures still read back exactly at the
    // seeded floors.
    liveBands: structuredClone(seed.bands),
    liveRules: seed.rules.map((r, j) => ({ id: `p${idx}r${j}`, section: r[0], param: r[1], op: r[2], value: r[3], value2: r[8] || '', action: r[4], enabled: r[5], code: r[6], rc: r[7] || '' })),
    liveLimits: structuredClone(seed.limits),
    // Everything a profile owns: its rules, bands, limits and section-collapse state.
    config: {
      rules: seed.rules.map((r, j) => ({ id: `p${idx}r${j}`, section: r[0], param: r[1], op: r[2], value: r[3], value2: r[8] || '', action: r[4], enabled: r[5], code: r[6], rc: r[7] || '' })),
      bands: structuredClone(seed.bands),
      open: { ...DEFAULT_OPEN },
      fallback: makeFallback(`p${idx}`, seed.blank),
      limits: structuredClone(seed.limits),
      touched: { ...(seed.touched || { simulate: false }) },
    },
  };
}

const state = {
  screen: 'profiles',        // 'profiles' | global keys | 'profile' (the workspace)
  profileIdx: null,          // which profile the workspace shows
  profileTab: PROFILE_TABS[0][0],  // active tab inside the workspace — step 1
  mode: 'view',              // 'view' (read-only) | 'edit'
  profiles: PROFILE_SEEDS.map(makeProfile),
  scoreMin: 0,
  scoreMax: 1000,
  publishOpen: false,
  createOpen: false,
  dragging: null,
  saved: true,               // false once the draft has an unsaved edit
  savedAt: null,             // set by "Save draft"
  confirmRemove: null,       // rule id awaiting a second click to delete
  bannerSeen: {},            // profiles whose read-only banner has been shown once
  simRunning: false,
  simRun: null,              // { at, population } of the last simulation run
  simPopIdx: 0,
  fbPreview: null,           // fallback-scorecard sample customer (per open profile)
  diSample: 0,               // selected sample in the Decision explanation preview
  // Global reason-code catalogue: wording only, shared by every profile.
  reasonCodes: structuredClone(REASON_CODES),
  modelFactors: structuredClone(MODEL_FACTORS),
  // Shared parameter definitions (Global setup → Parameters & features).
  // One definition per parameter, tagged with the sections it is valid in.
  paramDefs: structuredClone(PARAM_DEFS),
};

const $view = document.getElementById('view');
const $nav = document.getElementById('nav');
const $modal = document.getElementById('modal');

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ---------- Live region ---------- */

// Single polite announcer. Re-setting identical text would not re-announce, so
// clear first.
function announce(msg) {
  const el = document.getElementById('a11y-status');
  if (!el) return;
  el.textContent = '';
  setTimeout(() => { el.textContent = msg; }, 40);
}

/* ---------- Derived bad rate (B4) ---------- */

// Score density from the shared model's distribution: 20 buckets of 50 points.
// Only used for a profile that has never been measured, so has no population of
// its own to spread.
function modelDensityAt(score) {
  const buckets = MODEL_HEALTH.scoreDist;
  const w = (state.scoreMax - state.scoreMin) / buckets.length;
  const i = Math.floor((score - state.scoreMin) / w);
  return buckets[Math.max(0, Math.min(buckets.length - 1, i))];
}

// ONE source of truth for population share. The profile's measured bands each
// hold a share of the population across a known score range; spreading that
// share evenly over the range gives a density that can be re-sliced by any band
// layout. At the measured floors it reproduces the measured shares exactly, so
// the Score bands table, the simulation chart and the approval rate can never
// disagree — and a floor drag moves all three together.
function popDensityAt(profile, score) {
  const live = profile.liveBands || [];
  const total = live.reduce((n, b) => n + (Number(b.pop) || 0), 0);
  if (!total) return modelDensityAt(score);
  for (let i = 0; i < live.length; i++) {
    const lo = live[i].floor;
    const hi = i + 1 < live.length ? live[i + 1].floor : state.scoreMax;
    if (score >= lo && score < hi) return (Number(live[i].pop) || 0) / Math.max(1, hi - lo);
  }
  return 0;
}

// The measured bad rate at a single score, read off the band layout the profile
// was last measured on.
function measuredRateAt(liveBands, score) {
  let hit = null;
  liveBands.forEach(b => { if (score >= b.floor && b.badRate != null) hit = b; });
  return hit ? hit.badRate : null;
}

// Bad rate for an arbitrary score range: the population-weighted average of the
// measured rate across that range. A band sitting exactly on its measured floors
// reproduces the measured number; drag a floor and it moves monotonically,
// because the measured rate falls as the score rises.
function badRateForRange(profile, lo, hi) {
  const live = profile.liveBands || [];
  if (!live.some(b => b.badRate != null)) return null;
  let num = 0, den = 0;
  for (let s = lo; s < hi; s += 5) {
    const r = measuredRateAt(live, s);
    if (r == null) continue;
    const w = popDensityAt(profile, s);
    num += w * r;
    den += w;
  }
  return den ? Math.round((num / den) * 10) / 10 : null;
}

// Bands with their derived bad rate and derived population share. Everything
// that quotes a population share reads it from here.
function bandStats(profile) {
  const bands = profile.config.bands;
  const rows = bands.map((b, i) => {
    const next = i + 1 < bands.length ? bands[i + 1].floor : state.scoreMax;
    let pop = 0;
    for (let s = b.floor; s < next; s += 5) pop += popDensityAt(profile, s) * 5;
    return { band: b, i, lo: b.floor, hi: next, badRate: badRateForRange(profile, b.floor, next), popRaw: pop };
  });
  const total = rows.reduce((n, r) => n + r.popRaw, 0) || 1;
  rows.forEach(r => { r.pop = Math.round((r.popRaw / total) * 1000) / 10; });
  return rows;
}

function moneyOf(v) {
  const n = parseFloat(String(v).replace(/[$,]/g, ''));
  return isNaN(n) ? null : n;
}

// Portfolio KPIs derived from a band layout: approval rate, average limit and
// the population-weighted bad rate across everything actually approved.
function portfolioKpis(profile, bands) {
  const saved = profile.config.bands;
  profile.config.bands = bands;
  const rows = bandStats(profile);
  profile.config.bands = saved;
  let approved = 0, limitW = 0, badW = 0;
  rows.forEach(r => {
    const dec = String(r.band.decision || '');
    if (/decline|not configured/i.test(dec)) return;
    const lim = moneyOf(r.band.limit);
    if (lim == null) return;
    approved += r.pop;
    limitW += r.pop * lim;
    badW += r.pop * (r.badRate == null ? 0 : r.badRate);
  });
  return {
    approvalRate: Math.round(approved * 10) / 10,
    avgLimit: approved ? Math.round(limitW / approved) : 0,
    badRate: approved ? Math.round((badW / approved) * 10) / 10 : 0,
    rows,
  };
}

/* ---------- Limits matrix / bands alignment (B7) ---------- */

// The matrix has one row per band above the floor band. Derive the row count
// from the bands so the two can never disagree.
function syncMatrix(c) {
  const lim = c.limits;
  const need = Math.max(0, c.bands.length - 1);
  const cols = lim.matrixCols.length;
  if (!Array.isArray(lim.matrix)) lim.matrix = [];
  while (lim.matrix.length < need) lim.matrix.push(new Array(cols).fill('—'));
  if (lim.matrix.length > need) lim.matrix.length = need;
  lim.matrix.forEach(row => {
    while (row.length < cols) row.push('—');
    if (row.length > cols) row.length = cols;
  });
  return lim;
}

function nowStamp() {
  const d = new Date();
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}

function chip(text) {
  const [bg, fg, bd] = CHIP_COLORS[text] || CHIP_COLORS['Not started'];
  return `<span class="chip" style="background:${bg};color:${fg};border:1px solid ${bd};">${esc(text)}</span>`;
}

/* ---------- Readable ink on a coloured fill ---------- */

// The brand band ramp runs light (#98A2B3, #48C2CF) to dark (#172E7B). White
// text is unreadable on the light end — 2.1:1 on the teal. Pick the ink from the
// fill's own luminance so labels stay legible whatever the palette becomes.
const INK_DARK = '#0B1A33';
const INK_LIGHT = '#ffffff';

function relLuminance(hex) {
  const h = hex.replace('#', '');
  const v = [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16) / 255)
    .map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
function contrastWith(hex, other) {
  const a = relLuminance(hex), b = relLuminance(other);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
// Whichever ink reads better on this fill; ties go to dark, which is safer at
// the small sizes these labels use.
function inkOn(bg) {
  return contrastWith(bg, INK_LIGHT) >= contrastWith(bg, INK_DARK) ? INK_LIGHT : INK_DARK;
}
// Secondary line on the same fill. The mid-blue only reaches 4.75:1 against the
// dark ink at full strength, so it gets no alpha at all — the size and weight
// difference already separates it from the label above.
function inkOnMuted(bg) {
  return inkOn(bg) === INK_LIGHT ? 'rgba(255,255,255,0.88)' : INK_DARK;
}

function paramDef(key) {
  return state.paramDefs.find(d => d.key === key) || null;
}

function labelOf(key) {
  const def = paramDef(key);
  return def ? def.label : (LABEL[key] || key);
}

/* ---------- Section scoping ---------- */

// Parameters this section may use, in catalogue order.
function paramsForSection(section) {
  return state.paramDefs.filter(d => (d.sections || []).includes(section));
}
function paramValidIn(key, section) {
  const d = paramDef(key);
  return !!d && (d.sections || []).includes(section);
}
function actionsForSection(section) {
  const allowed = SECTION_ACTIONS[section] || ACTIONS.map(([k]) => k);
  return ACTIONS.filter(([k]) => allowed.includes(k));
}
function actionValidIn(action, section) {
  return (SECTION_ACTIONS[section] || ACTIONS.map(([k]) => k)).includes(action);
}
function operatorsForParam(key) {
  const d = paramDef(key);
  const allowed = TYPE_OPERATORS[d ? d.type : ''] || OPERATORS.map(([k]) => k);
  return OPERATORS.filter(([k]) => allowed.includes(k));
}
function operatorValidFor(op, key) {
  const d = paramDef(key);
  const allowed = TYPE_OPERATORS[d ? d.type : ''];
  return !allowed || allowed.includes(op);
}

/* ---------- Typed values ---------- */

// Seed values are rich strings ("$40 per month", "25% of income"). Split them
// into a prefix/number/qualifier so the editor can show a typed numeric field
// without losing the wording the rule sentence reads back.
// The number may be signed; a leading "-" belongs to the number, not the prefix,
// otherwise a negative entry falls through into the suffix and corrupts the value
// on every later edit ("18 years" → "-5 years" → "30 -5 years").
function splitValue(v) {
  const m = String(v ?? '').match(/^\s*([$+]?)\s*(-?[\d][\d.,]*)\s*(.*)$/);
  if (!m) return { prefix: '', num: '', suffix: String(v ?? '').trim() };
  return { prefix: m[1] || '', num: m[2], suffix: m[3].trim() };
}
// A blank or unparseable numeric entry must not be written through — it would
// join to a value with no number in it, which splitValue then treats as suffix.
// Fall back to the number already stored, or 0.
function cleanNum(el, previous) {
  const raw = String(el.value ?? '').trim();
  if (raw !== '' && Number.isFinite(Number(raw))) {
    const min = el.getAttribute('min');
    if (min !== null && Number(raw) < Number(min)) return min;
    return raw;
  }
  const prev = splitValue(previous).num;
  return prev !== '' ? prev : '0';
}

function joinValue(prefix, num, suffix) {
  if (!suffix) return `${prefix}${num}`;
  const sep = /^[%×x]/.test(suffix) ? '' : ' ';
  return `${prefix}${num}${sep}${suffix}`;
}
// Values held by a categorical rule ("Active, Active-dormant <30d" → [...]).
function catList(v) {
  return String(v ?? '').split(',').map(s => s.trim()).filter(Boolean);
}

function paramPhrase(key) {
  const l = labelOf(key);
  return /^[A-Z][a-z]/.test(l) ? l.charAt(0).toLowerCase() + l.slice(1) : l;
}

// A `between` rule reads "is between X and Y" and holds both ends.
function upperValue(r) {
  if (r.value2) return r.value2;
  const { prefix, num, suffix } = splitValue(r.value);
  const n = parseFloat(String(num).replace(/,/g, ''));
  return joinValue(prefix, String(isNaN(n) ? 1 : (n === 0 ? 1 : n * 2)), suffix);
}

function sentence(r) {
  const p = paramPhrase(r.param);
  const test = r.op === 'between'
    ? `is between ${r.value} and ${upperValue(r)}`
    : `${SENT_OP[r.op] || 'is ' + OPLABEL[r.op]} ${r.value}`;
  if (r.action === 'pass') return `Only continue when ${p} ${test}.`;
  return `If ${p} ${test}, ${ACTLABEL[r.action].toLowerCase()}.`;
}

function cfg() {
  return activeProfile().config;
}

function rcByCode(code) {
  return state.reasonCodes.find(c => c.code === code) || null;
}

function rcText(code) {
  const c = rcByCode(code);
  return c ? `${c.code} · ${c.label}` : (code || '—');
}

function markDirty() {
  state.saved = false;
}

function setRule(id, key, v) {
  const r = cfg().rules.find(r => r.id === id);
  if (r) r[key] = v;
  markDirty();
  render();
}

/* ---------- Sidebar nav ---------- */

function navButtons(items) {
  return items.map(([key, label, icon]) => `
    <button class="nav-btn${state.screen === key ? ' active' : ''}" data-nav="${key}"
      title="${esc(label)}" aria-label="Global setup — ${esc(label)}"
      aria-current="${state.screen === key ? 'page' : 'false'}">
      <span class="nav-icon" aria-hidden="true">${icon}</span>
      <span>${esc(label)}</span>
    </button>`).join('');
}

function renderNav() {
  // "Product profiles" is also the home of the profile workspace, so it stays lit there.
  const profilesActive = state.screen === 'profiles' || state.screen === 'profile';
  const top = NAV_TOP.map(([key, label, icon]) => `
    <button class="nav-btn${profilesActive ? ' active' : ''}" data-nav="${key}"
      title="${esc(label)}" aria-label="${esc(label)}"
      aria-current="${profilesActive ? 'page' : 'false'}">
      <span class="nav-icon" aria-hidden="true">${icon}</span>
      <span>${esc(label)}</span>
    </button>`).join('');
  $nav.innerHTML = `
    ${top}
    <h2 class="nav-heading">Global setup</h2>
    <span class="nav-heading-rule" aria-hidden="true"></span>
    <div class="nav-helper">Do this once before your first product. Shared by every product — change once, applies everywhere.</div>
    ${navButtons(NAV_GLOBAL)}`;
}

function activeProfile() {
  return state.profiles[state.profileIdx ?? 0];
}

function renderHeader() {
  const $topbar = document.getElementById('topbar');
  if (state.screen === 'profile') {
    const p = activeProfile();
    const isEdit = state.mode === 'edit';
    const blockers = publishBlockers();
    // Publish is set-up step 7. It is an action, not a tab, so its step state
    // rides on this button rather than on a second navigation list.
    const pub = stepState('publish');
    const stepCount = SETUP_STEPS.length;
    const publishBtn = blockers.length
      ? `<button class="btn btn-primary is-disabled" data-action="publish-blocked"
           title="Step ${stepCount} of ${stepCount} · Publish — finish ${esc(blockers.join(', '))} first"
           aria-label="Step ${stepCount} of ${stepCount}: Publish — ${esc(pub.note)}. Finish ${esc(blockers.join(', '))} first.">Publish…</button>`
      : `<button class="btn btn-primary" data-action="open-publish"
           title="Step ${stepCount} of ${stepCount} · Publish — ${esc(pub.note)}"
           aria-label="Step ${stepCount} of ${stepCount}: Publish — ${esc(pub.note)}">Publish…</button>`;
    const actions = isEdit ? `
      <div class="dirty-label">${state.saved ? (state.savedAt ? 'Saved just now' : 'All changes saved') : 'Unsaved changes'}</div>
      <button class="btn btn-outline" data-action="go-simulate">Run what-if</button>
      <button class="btn btn-outline" data-action="save-draft">Save draft</button>
      ${publishBtn}` : `
      <div class="dirty-label">Read-only view</div>
      <button class="btn btn-primary" data-action="enter-edit">Edit profile</button>`;
    $topbar.innerHTML = `
      <div class="topbar-title">
        <div class="topbar-row">
          <div class="profile-name">${esc(p.name)}</div>
          <span class="version-pill">${esc(p.version)}</span>
          ${chip(p.status)}
          <span class="mode-pill${isEdit ? ' editing' : ''}">${isEdit ? 'Editing' : 'Viewing'}</span>
        </div>
        <div class="profile-sub">${esc(p.market)} · Ecocash wallet · model DF-Score v3 (0–1000)</div>
      </div>
      <div class="topbar-actions">${actions}</div>`;
  } else {
    $topbar.innerHTML = `
      <div class="topbar-title">
        <div class="topbar-row">
          <div class="profile-name">Rule Engine Console</div>
        </div>
        <div class="profile-sub">Global setup is shared by every product. Select a product profile to view or edit its rules.</div>
      </div>`;
  }
}

/* ---------- Screens ---------- */

// Progress for any profile, not just the open one — the list needs all of them.
function profileProgress(idx) {
  const prevIdx = state.profileIdx;
  state.profileIdx = idx;
  const done = SETUP_STEPS.filter(s => stepState(s.key).state === 'done').length;
  state.profileIdx = prevIdx;
  return done;
}

function renderProfiles() {
  const rows = state.profiles.map((p, i) => {
    const iconBg = p.status === 'Not started' ? '#98A2B3' : PROFILE_ICON_COLORS[i % PROFILE_ICON_COLORS.length];
    return `
    <div class="profiles-grid profile-row profile-row-click" data-action="open-profile" data-idx="${i}">
      <div style="display:flex;align-items:center;gap:12px;min-width:0;">
        <div style="width:36px;height:36px;border-radius:9px;flex:0 0 36px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:${inkOn(iconBg)};background:${iconBg};">${esc(p.initials)}</div>
        <div style="min-width:0;">
          <div style="font-size:14px;font-weight:600;color:#101828;">${esc(p.name)}</div>
          <div style="font-size:12px;color:#667085;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(p.blurb)}</div>
        </div>
      </div>
      <div style="font-size:13px;color:#344054;">${esc(p.market)}</div>
      <div style="font-size:13px;color:#344054;font-variant-numeric:tabular-nums;">${esc(p.version)}</div>
      <div>${chip(p.status)}</div>
      <div style="font-size:12.5px;color:#667085;">
        <div>${esc(p.editedAt)}</div>
        <div style="margin-top:2px;">${esc(p.editedBy)}</div>
        <div class="row-progress" title="Set-up steps complete">
          <span class="row-progress-track"><span class="row-progress-fill" style="width:${(profileProgress(i) / SETUP_STEPS.length) * 100}%;"></span></span>
          <span>${profileProgress(i)}/${SETUP_STEPS.length} set up</span>
        </div>
      </div>
      <div style="display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap;">
        <button class="btn btn-primary btn-sm" data-action="edit-profile" data-idx="${i}" aria-label="Edit ${esc(p.name)}">Edit</button>
        <button class="btn btn-outline btn-sm" data-action="duplicate-profile" data-idx="${i}" aria-label="Duplicate ${esc(p.name)}">Duplicate</button>
        ${p.third ? `<button class="btn btn-outline btn-sm" data-action="${p.third === 'View' ? 'open-profile' : (p.third === 'Copy rules' ? 'open-duplicate' : 'noop')}" data-idx="${i}" aria-label="${esc(p.third)} — ${esc(p.name)}">${esc(p.third)}</button>` : ''}
      </div>
    </div>`;
  }).join('');

  return `
  <div class="page-head">
    <div>
      <h1 class="page-title">Product profiles</h1>
      <p class="page-desc" style="max-width:640px;">Each product has its own named set of rules. The scoring model is shared; the rules below decide what the score means for this product.</p>
    </div>
    <div class="page-head-actions">
      <button class="btn btn-outline" data-action="open-duplicate">Duplicate a profile</button>
      <button class="btn btn-primary" style="padding:9px 18px;" data-action="open-create">New profile</button>
    </div>
  </div>

  <div class="card" style="overflow-x:auto;">
    <div class="profiles-grid grid-head">
      <div>Profile</div><div>Market</div><div>Version</div><div>Status</div><div>Last edited</div><div style="text-align:right;">Actions</div>
    </div>
    ${rows}
  </div>

  <div class="stat-cards">
    <div class="card stat-card">
      <h2 class="stat-label">Live decisions today</h2>
      <div class="stat-value">14,208</div>
      <div class="stat-note">Device Financing v1.4 · 31.2% approved</div>
    </div>
    <div class="card stat-card">
      <h2 class="stat-label">Average approved limit</h2>
      <div class="stat-value">$318</div>
      <div class="stat-note" style="color:#2A6F77;">+$12 vs. previous version</div>
    </div>
    <div class="card stat-card">
      <h2 class="stat-label">Pilot exposure used</h2>
      <div class="stat-value">$612k / $1.0m</div>
      <div class="stat-note">Launch cap resets on publish</div>
    </div>
  </div>`;
}

// Value editor driven by the parameter's type: currency / percent / duration /
// count / ratio / points get a numeric field with its unit; categoricals get a
// picker limited to the parameter's allowed values.
function valueEditor(r) {
  const d = paramDef(r.param);
  const type = d ? d.type : 'text';
  const ctx = `rule ${r.code}, ${labelOf(r.param)}`;

  if (type === 'category') {
    const values = d.values || [];
    if (r.op === 'in' || r.op === 'notin') {
      const chosen = catList(r.value);
      return `
      <span class="val-chips" data-rule="${r.id}" role="group" aria-label="Values for ${esc(ctx)}">
        ${values.map(v => `
          <button type="button" class="val-chip${chosen.includes(v) ? ' on' : ''}" data-action="val-chip" data-rule="${r.id}" data-val="${esc(v)}"
            aria-pressed="${chosen.includes(v) ? 'true' : 'false'}" aria-label="${esc(v)} — ${chosen.includes(v) ? 'selected' : 'not selected'} for ${esc(ctx)}">${esc(v)}</button>`).join('')}
        ${chosen.filter(v => !values.includes(v)).map(v => `
          <button type="button" class="val-chip on val-chip-unknown" data-action="val-chip" data-rule="${r.id}" data-val="${esc(v)}" title="Not an allowed value for this parameter"
            aria-pressed="true" aria-label="${esc(v)} — selected for ${esc(ctx)}, not an allowed value">${esc(v)} ⚠</button>`).join('')}
      </span>`;
    }
    const known = values.includes(r.value);
    return `
    <select class="rule-value val-select${known ? '' : ' field-invalid'}" data-change="val-cat" data-rule="${r.id}"
      aria-label="Value for ${esc(ctx)}">
      ${values.map(v => `<option value="${esc(v)}"${v === r.value ? ' selected' : ''}>${esc(v)}</option>`).join('')}
      ${known ? '' : `<option value="${esc(r.value)}" selected>${esc(r.value)} — not an allowed value</option>`}
    </select>`;
  }

  const affix = { currency: '$', percent: '', duration: '', count: '', ratio: '', points: '' }[type] || '';
  const step = type === 'ratio' ? '0.01' : (type === 'percent' ? '0.5' : '1');

  const numField = (raw, change, label) => {
    const { prefix, num, suffix } = splitValue(raw);
    const pre = prefix || (type === 'currency' ? affix : '');
    const unitLabel = suffix || (d && d.unit ? d.unit : '') || (type === 'percent' ? '%' : '');
    return `
    <span class="val-num">
      ${pre ? `<span class="val-affix">${esc(pre)}</span>` : ''}
      <input type="number" step="${step}" min="0" class="val-input" value="${esc(String(num).replace(/,/g, ''))}"
        data-change="${change}" data-rule="${r.id}" data-prefix="${esc(pre)}" data-suffix="${esc(suffix)}"
        aria-label="${esc(label)}${unitLabel ? `, in ${esc(unitLabel)}` : ''}" />
      ${unitLabel ? `<span class="val-unit">${esc(unitLabel)}</span>` : ''}
    </span>`;
  };

  // `between` needs both ends, or the sentence it reads back is nonsense.
  if (r.op === 'between') {
    return `${numField(r.value, 'val-num', `Lower value for ${ctx}`)}
    <span class="rule-then">and</span>
    ${numField(upperValue(r), 'val-num2', `Upper value for ${ctx}`)}`;
  }

  return numField(r.value, 'val-num', `Value for ${ctx}`);
}

function optionGroup(list, selected) {
  return list.map(([value, label]) =>
    `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`).join('');
}

function renderRules() {
  const c = cfg();
  const activeCount = c.rules.filter(r => r.enabled).length;
  const allOpen = Object.values(c.open).every(Boolean);

  const sections = SECTIONS.map(([key, title, desc, shortTitle], i) => {
    const rules = c.rules.filter(r => r.section === key);
    const open = !!c.open[key];
    const enabledCount = rules.filter(r => r.enabled).length;

    const ruleRows = open ? rules.map(r => {
      const badParam = !paramValidIn(r.param, key);
      const badAction = !actionValidIn(r.action, key);
      const badOp = !operatorValidFor(r.op, r.param);
      const warnings = [
        badParam ? `Parameter <strong>${esc(labelOf(r.param))}</strong> is not valid in ${esc(title)}. Pick a parameter tagged for this section, or add the tag in <span class="nav-link" data-nav="params">Global setup</span>.` : '',
        badAction ? `Action <strong>${esc(ACTLABEL[r.action] || r.action)}</strong> is not available in ${esc(title)}.` : '',
        badOp && !badParam ? `Operator <strong>${esc(OPLABEL[r.op] || r.op)}</strong> does not apply to a ${esc(paramDef(r.param) ? paramDef(r.param).type : 'this')} parameter.` : '',
      ].filter(Boolean);

      // Keep an out-of-scope selection visible rather than silently dropping it.
      const paramOptions = PARAM_GROUPS.map(([g, gLabel]) => {
        const opts = paramsForSection(key).filter(d => d.group === g);
        return opts.length ? `<optgroup label="${esc(gLabel)}">${optionGroup(opts.map(d => [d.key, d.label]), r.param)}</optgroup>` : '';
      }).join('') + (badParam
        ? `<optgroup label="Not valid in this section"><option value="${esc(r.param)}" selected>${esc(labelOf(r.param))} — not valid here</option></optgroup>`
        : '');

      const opOptions = optionGroup(operatorsForParam(r.param), r.op)
        + (badOp ? `<option value="${esc(r.op)}" selected>${esc(OPLABEL[r.op] || r.op)} — not valid here</option>` : '');

      const actionOptions = optionGroup(actionsForSection(key), r.action)
        + (badAction ? `<option value="${esc(r.action)}" selected>${esc(ACTLABEL[r.action] || r.action)} — not valid here</option>` : '');

      const confirming = state.confirmRemove === r.id;
      return `
      <div class="rule-row${warnings.length ? ' rule-row-warn' : ''}" style="background:${r.enabled ? '#fff' : '#FCFCFD'};">
        <div class="rule-inner">
          <button class="switch${r.enabled ? ' on' : ''}" data-action="toggle-rule" data-rule="${r.id}"
            role="switch" aria-checked="${r.enabled ? 'true' : 'false'}"
            aria-label="Rule ${esc(r.code)} enabled — ${esc(sentence(r))}"
            title="Enable or disable this rule"><span class="knob"></span></button>
          <div style="flex:1;min-width:0;">
            <div class="rule-sentence" style="color:${r.enabled ? '#101828' : '#5D6B82'};">${esc(sentence(r))}</div>
            <div class="rule-controls">
              <select class="rule-param${badParam ? ' field-invalid' : ''}" data-change="rule-param" data-rule="${r.id}"
                aria-label="Parameter for rule ${esc(r.code)}">${paramOptions}</select>
              <select class="rule-op${badOp ? ' field-invalid' : ''}" data-change="rule-op" data-rule="${r.id}"
                aria-label="Test for rule ${esc(r.code)}, ${esc(labelOf(r.param))}">${opOptions}</select>
              ${valueEditor(r)}
              <span class="rule-then">then</span>
              <select class="rule-action${badAction ? ' field-invalid' : ''}" data-change="rule-action" data-rule="${r.id}"
                aria-label="Action for rule ${esc(r.code)}">${actionOptions}</select>
              <span class="rule-code">${esc(r.code)}</span>
            </div>
            ${warnings.map(w => `<div class="rule-warn">⚠ ${w}</div>`).join('')}
            <div class="rule-rc-row">
              <span class="rule-rc-label">Reason code</span>
              <select class="rule-rc" data-change="rule-rc" data-rule="${r.id}"
                aria-label="Reason code emitted by rule ${esc(r.code)}"
                title="Code the engine emits when this rule determines the outcome">
                <option value=""${r.rc ? '' : ' selected'}>— no code —</option>
                ${state.reasonCodes.filter(c => c.kind === 'rule' && (c.active || c.code === r.rc))
                  .map(c => `<option value="${esc(c.code)}"${c.code === r.rc ? ' selected' : ''}>${esc(c.code)} · ${esc(c.label)}${c.active ? '' : ' (inactive)'}</option>`).join('')}
              </select>
              <span class="rule-rc-hint">emitted automatically when this rule decides the outcome</span>
            </div>
          </div>
          ${confirming
            ? `<button class="rule-remove confirming" data-action="remove-rule-confirm" data-rule="${r.id}"
                 aria-label="Confirm removing rule ${esc(r.code)}" title="Click again to remove rule ${esc(r.code)}">Remove?</button>`
            : `<button class="rule-remove" data-action="remove-rule" data-rule="${r.id}"
                 aria-label="Remove rule ${esc(r.code)}" title="Remove rule">×</button>`}
        </div>
      </div>`;
    }).join('') : '';

    return `
    <div class="card section-card">
      <div class="section-head" data-action="toggle-section" data-section="${key}"
        role="button" tabindex="0" aria-expanded="${open ? 'true' : 'false'}"
        aria-label="${esc(title)} — ${enabledCount} of ${rules.length} rules active. ${open ? 'Collapse' : 'Expand'} section."
        style="border-bottom:${open ? '1px solid #E4E7EC' : 'none'};">
        <div class="section-num">${String(i + 1).padStart(2, '0')}</div>
        <div style="min-width:0;">
          <h2 class="section-title">${esc(title)}</h2>
          <div class="section-desc">${esc(desc)}</div>
        </div>
        <div style="margin-left:auto;display:flex;align-items:center;gap:12px;">
          <span class="section-count">${enabledCount} of ${rules.length} active</span>
          <span class="section-chevron" aria-hidden="true">${open ? '▲' : '▼'}</span>
        </div>
      </div>
      ${open ? `
      <div style="padding:6px 0 14px 0;">
        ${ruleRows}
        <div class="add-rule-wrap">
          <button class="add-rule" data-action="add-rule" data-section="${key}">+ Add rule to ${esc(shortTitle)}</button>
        </div>
      </div>` : ''}
    </div>`;
  }).join('');

  return `
  <div class="page-head" style="margin-bottom:16px;">
    <div>
      <h1 class="page-title">Rules</h1>
      <p class="page-desc" style="max-width:760px;">A rule is one sentence: <em>when something about the customer is true, do this.</em> Read the sentence, then change any part of it using the boxes underneath. Nothing here needs code.</p>
    </div>
    <div class="page-head-actions">
      <div style="font-size:12.5px;color:#667085;">${activeCount} active of ${c.rules.length} rules</div>
      <button class="btn btn-outline" style="padding:8px 14px;font-size:12.5px;" data-action="expand-all">${allOpen ? 'Collapse all' : 'Expand all'}</button>
    </div>
  </div>

  <ol class="howto" style="max-width:860px;margin-bottom:18px;">
    <li><strong>What to check</strong> — the customer detail being tested, like age, income or the model score. These are named once in <span class="nav-link" data-nav="params">Global setup → Parameters &amp; features</span>; here you only pick one. Each group below offers just the details that make sense for it, so an eligibility check can't accidentally read a daily portfolio counter.</li>
    <li><strong>The test and the value</strong> — "at least 18 years", "is one of Active". The value box matches what you're testing: money, a percentage, a length of time, or a list to tick.</li>
    <li><strong>What happens</strong> — pass to the next rule, decline, send to a person to review, or cap the limit. Again, only the outcomes that suit that group are offered.</li>
    <li><strong>Reason code</strong> — what gets recorded if this rule is the one that decides the outcome. You choose the code here; the actual wording shown to staff and customers lives in the <span class="nav-link" data-nav="reasoncodes">Reason-code catalogue</span>.</li>
  </ol>
  <p class="howto-example" style="max-width:860px;margin-bottom:18px;">Use the switch on the left to turn a rule off without deleting it — it stops running but stays here so you can turn it back on.</p>

  ${sections}`;
}

function renderBands() {
  const s = state;
  const bands = cfg().bands;
  const span = Math.max(1, s.scoreMax - s.scoreMin);

  const segs = bands.map((b, i) => {
    const next = i + 1 < bands.length ? bands[i + 1].floor : s.scoreMax;
    const pct = ((next - b.floor) / span) * 100;
    return `
    <div class="band-seg" style="width:${pct}%;background:${BAND_COLORS[i]};">
      <div class="band-seg-label" style="color:${inkOn(BAND_COLORS[i])};">${esc(b.label)}</div>
      <div class="band-seg-range" style="color:${inkOnMuted(BAND_COLORS[i])};">${b.floor} – ${next}</div>
    </div>`;
  }).join('');

  const handles = bands.slice(1).map((b, idx) => {
    const i = idx + 1;
    const lo = bands[i - 1].floor + 20;
    const hi = (i + 1 < bands.length ? bands[i + 1].floor : s.scoreMax) - 20;
    return `
    <div class="band-handle" data-handle="${i}" style="left:${((b.floor - s.scoreMin) / span) * 100}%;"
      role="slider" tabindex="0"
      aria-label="Score floor for the ${esc(b.label)} band"
      aria-valuemin="${lo}" aria-valuemax="${hi}" aria-valuenow="${b.floor}" aria-valuetext="${b.floor} points">
      <div class="band-handle-bar"></div>
      <div class="band-handle-value">${b.floor}</div>
    </div>`;
  }).join('');

  const stats = bandStats(activeProfile());
  const rows = bands.map((b, i) => `
    <div class="bands-grid band-row">
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="band-dot" style="background:${BAND_COLORS[i]};"></span>
        <span style="font-size:13.5px;font-weight:600;color:#101828;">${esc(b.label)}</span>
      </div>
      <div style="font-size:13px;color:#344054;font-variant-numeric:tabular-nums;">${b.floor}</div>
      <div style="font-size:13px;color:#344054;">${esc(b.decision)}</div>
      <div style="font-size:13px;color:#101828;font-weight:600;">${esc(b.limit)}</div>
      <div style="font-size:13px;color:#344054;font-variant-numeric:tabular-nums;">${stats[i].badRate == null ? '—' : stats[i].badRate + '%'}</div>
      <div style="display:flex;align-items:center;gap:8px;">
        <div class="pop-track"><div class="pop-fill" style="width:${stats[i].pop * 2.6}%;background:${BAND_COLORS[i]};"></div></div>
        <span style="font-size:12px;color:#667085;font-variant-numeric:tabular-nums;width:38px;text-align:right;">${stats[i].pop}%</span>
      </div>
    </div>`).join('');

  return `
  <h1 class="page-title">Score bands</h1>
  <p class="page-desc" style="max-width:760px;">The model gives every customer a score out of 1000. On its own that number means nothing — a band is what turns it into a decision. Split the range into bands, and say what each band gets.</p>
  <ol class="howto" style="max-width:760px;margin-bottom:18px;">
    <li><strong>Drag a marker</strong> to move where one band ends and the next begins. Everyone whose score falls between two markers is treated the same way.</li>
    <li><strong>Each band gets a decision</strong> — decline, approve, or approve with a cap — and a starting limit before affordability is taken into account.</li>
    <li><strong>Bad rate</strong> shows how often customers in that band have actually defaulted. It should fall as you move right; if it doesn't, the band boundaries are in the wrong place.</li>
  </ol>

  <div class="card bands-card">
    <div class="bands-toolbar">
      <label>Model score range</label>
      <span class="readonly-value">${s.scoreMin} to ${s.scoreMax}</span>
      <span class="inherited-tag">inherited from the shared model · <span class="nav-link" data-nav="model">edit in Global setup</span></span>
      <div class="drag-hint">${s.dragging != null ? 'Release to set the band floor' : 'Drag the markers to move a band floor'}</div>
    </div>

    <div class="ruler" id="ruler">
      <div class="ruler-track">${segs}</div>
      ${handles}
      <div class="ruler-min">${s.scoreMin}</div>
      <div class="ruler-max">${s.scoreMax}</div>
    </div>

    <div class="bands-table">
      <div class="bands-grid grid-head">
        <div>Band</div><div>Score floor</div><div>Decision</div><div>Base limit</div><div>Bad rate</div><div>Population</div>
      </div>
      ${rows}
    </div>
    <div style="margin-top:10px;font-size:12px;color:#667085;">Bad rate and population are both derived from the last measured layout, re-sliced across each band's current score range. At the measured floors they read back the measured figures; move a floor and both move with it. The <span class="nav-link" data-tab="simulate">what-if simulation</span> reads the same numbers.</div>
  </div>`;
}

function renderLimits() {
  const lim = syncMatrix(cfg());
  const bandRows = cfg().bands.slice(1);

  const headCells = lim.matrixCols.map((c, j) => `
    <th><input class="matrix-col-input" value="${esc(c)}" data-change="lim-col" data-col="${j}"
      aria-label="Affordability band ${j + 1} of ${lim.matrixCols.length} — column heading" /></th>`).join('');

  const rows = bandRows.map((b, i) => {
    const cells = lim.matrixCols.map((_, j) => {
      const t = (lim.matrix[i] && lim.matrix[i][j]) ?? '—';
      const decline = /decline/i.test(t);
      const bg = decline ? '#FEF3F2' : `rgba(72,194,207,${0.05 + (lim.matrixCols.length - 1 - j) * 0.05})`;
      const fg = decline ? '#B42318' : '#101828';
      return `<td style="background:${bg};padding:4px;">
        <input class="matrix-cell-input" style="color:${fg};" value="${esc(t)}" data-change="lim-cell" data-row="${i}" data-col="${j}"
          aria-label="Limit for ${esc(b.label)} band at ${esc(lim.matrixCols[j])} affordability" />
      </td>`;
    }).join('');
    return `<tr><td class="matrix-band">${esc(b.label)}</td>${cells}</tr>`;
  }).join('');

  const fieldEditor = (f, listKey) => {
    const name = `${f.label} — ${f.hint}`;
    if (f.type === 'select') {
      return `<select class="lim-select" data-change="lim-field" data-list="${listKey}" data-key="${esc(f.key)}"
        aria-label="${esc(name)}">
        ${(f.options || []).map(o => `<option${o === f.value ? ' selected' : ''}>${esc(o)}</option>`).join('')}
      </select>`;
    }
    if (f.type === 'text') {
      return `<input class="lim-text" value="${esc(f.value)}" data-change="lim-field" data-list="${listKey}" data-key="${esc(f.key)}"
        aria-label="${esc(name)}" />`;
    }
    const affix = f.type === 'currency' ? '$' : '';
    const unit = f.type === 'percent' ? '%' : '';
    return `<span class="val-num lim-num">
      ${affix ? `<span class="val-affix">${affix}</span>` : ''}
      <input type="number" step="${f.type === 'percent' ? '0.5' : '1'}" min="0" class="val-input" value="${esc(f.value)}"
        data-change="lim-field" data-list="${listKey}" data-key="${esc(f.key)}"
        aria-label="${esc(name)}${affix ? ', in US dollars' : ''}${unit ? ', in percent' : ''}" />
      ${unit ? `<span class="val-unit">${unit}</span>` : ''}
    </span>`;
  };

  const fieldRows = (list, listKey) => list.map(f => `
    <div class="field-row">
      <div style="flex:1;min-width:0;">
        <div class="field-label">${esc(f.label)}</div>
        <div class="field-hint">${esc(f.hint)}</div>
      </div>
      ${fieldEditor(f, listKey)}
    </div>`).join('');

  return `
  <h1 class="page-title">Limits &amp; affordability</h1>
  <p class="page-desc" style="margin-bottom:20px;max-width:720px;">The band gives a starting limit; affordability trims it down. The customer is offered the lower of the two, capped by the ceilings below. Every value here is configured per product.</p>

  <div class="limits-grid">
    <div class="card panel">
      <h2 class="panel-title">How much to offer</h2>
      <div class="panel-sub">Two things decide the offer: how good the customer's score is, and how much of their income the repayment would eat up. Find the row, find the column, and the cell is the amount they get.</div>

      <ol class="howto">
        <li><strong>Down the side</strong> — the customer's score band. Better score, bigger offer.</li>
        <li><strong>Across the top</strong> — the repayment as a share of their monthly income. The further right, the more of their income it takes, so the offer shrinks.</li>
        <li><strong>In each cell</strong> — the amount in US dollars. Type <code>Decline</code> instead of an amount to refuse that combination outright.</li>
      </ol>
      ${(() => {
        // Read a real cell so the example can never drift from the table.
        const rowIdx = Math.min(2, Math.max(0, bandRows.length - 2));
        const colIdx = Math.min(2, lim.matrixCols.length - 1);
        const band = bandRows[rowIdx], col = lim.matrixCols[colIdx];
        const cell = lim.matrix[rowIdx] && lim.matrix[rowIdx][colIdx];
        if (!band || !cell) return '';
        return `<p class="howto-example">Example: a <strong>${esc(band.label)}</strong> customer whose repayment would take <strong>${esc(col)}</strong> of their income is offered <strong>${esc(cell)}</strong>.</p>`;
      })()}

      <div class="matrix-wrap">
        <div class="matrix-axis-top" aria-hidden="true">Repayment as a share of monthly income →</div>
        <table class="matrix">
          <caption class="sr-only">Limit offered in US dollars, by score band (rows) and repayment as a share of monthly income (columns)</caption>
          <thead><tr><th scope="col">Score band</th>${headCells}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="margin-top:10px;font-size:11.5px;color:#667085;">Rows follow the bands set in <span class="nav-link" data-tab="bands">Score bands</span>.</div>
    </div>

    <div style="display:flex;flex-direction:column;gap:16px;">
      <div class="card panel">
        <h2 class="panel-title" style="margin-bottom:14px;">Affordability &amp; terms</h2>
        ${fieldRows(lim.afford, 'afford')}
      </div>
      <div class="card panel">
        <h2 class="panel-title" style="margin-bottom:14px;">Caps &amp; ceilings</h2>
        ${fieldRows(lim.caps, 'caps')}
      </div>
    </div>
  </div>`;
}


// Every figure on this screen is recomputed from the profile's own bands, so
// "Run simulation" stamps a real result rather than replaying a fixture.
function capValue(profile, key) {
  const f = (profile.config.limits.caps || []).find(x => x.key === key);
  return f ? Number(f.value) || 0 : 0;
}

function simResults() {
  const p = activeProfile();
  const pop = SIM_POPULATIONS[state.simPopIdx] || SIM_POPULATIONS[0];
  const draft = portfolioKpis(p, p.config.bands);
  const live = portfolioKpis(p, p.liveBands);
  const approvals = pop.size * (draft.approvalRate / 100);
  const liveApprovals = pop.size * (live.approvalRate / 100);
  // Demand is what the offers would add up to at the stated take-up assumption;
  // the book can never exceed the launch maximum configured on the Limits tab.
  const demand = approvals * draft.avgLimit * SIM_TAKE_UP;
  const liveDemand = liveApprovals * live.avgLimit * SIM_TAKE_UP;
  const launchMax = capValue(p, 'launchMax');
  const book = launchMax > 0 ? Math.min(demand, launchMax) : demand;
  const liveBook = launchMax > 0 ? Math.min(liveDemand, launchMax) : liveDemand;
  // Share of the population that lands in a different band than it did before.
  let moved = 0;
  draft.rows.forEach((r, i) => { moved += Math.abs(r.pop - (live.rows[i] ? live.rows[i].pop : 0)); });
  return {
    pop, draft, live, demand, book, liveBook, launchMax,
    capped: launchMax > 0 && demand > launchMax,
    blast: Math.round((moved / 2) * 10) / 10,
  };
}

/* ---------- Draft vs. published baseline (shared by sim and publish) ---------- */

function ruleSig(r) {
  return [r.section, r.param, r.op, r.value, r.value2 || '', r.action, r.enabled, r.code, r.rc].join('|');
}

// One delta, quoted identically by the What-if screen and the publish modal.
function draftDelta() {
  const p = activeProfile();
  const live = p.liveRules || [];
  const draft = p.config.rules;
  const liveById = new Map(live.map(r => [r.id, r]));
  const draftById = new Map(draft.map(r => [r.id, r]));
  let added = 0, removed = 0, edited = 0;
  draft.forEach(r => {
    const was = liveById.get(r.id);
    if (!was) added++;
    else if (ruleSig(was) !== ruleSig(r)) edited++;
  });
  live.forEach(r => { if (!draftById.has(r.id)) removed++; });

  const floorsMoved = p.config.bands.filter((b, i) => p.liveBands[i] && p.liveBands[i].floor !== b.floor).length;
  const bandsAdded = Math.max(0, p.config.bands.length - p.liveBands.length);
  const bandsRemoved = Math.max(0, p.liveBands.length - p.config.bands.length);

  const liveCap = ((p.liveLimits && p.liveLimits.caps) || []).find(f => f.key === 'launchMax');
  const nowCap = capValue(p, 'launchMax');
  const wasCap = liveCap ? Number(liveCap.value) || 0 : 0;

  const r = simResults();
  return {
    rulesChanged: added + removed + edited, added, removed, edited,
    floorsMoved, bandsAdded, bandsRemoved,
    capChanged: nowCap !== wasCap, wasCap, nowCap,
    blast: r.blast,
    clean: (added + removed + edited) === 0 && floorsMoved === 0 && bandsAdded === 0 && bandsRemoved === 0 && nowCap === wasCap,
  };
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function deltaSummary() {
  const d = draftDelta();
  if (d.clean) {
    return 'No changes against the published baseline yet — rules, score-band floors and the launch cap all match the live version, so no customer sees a different decision.';
  }
  const parts = [];
  parts.push(`${plural(d.rulesChanged, 'rule')} changed`);
  if (d.floorsMoved) parts.push(`${plural(d.floorsMoved, 'score-band floor')} moved`);
  if (d.bandsAdded) parts.push(`${plural(d.bandsAdded, 'band')} added`);
  if (d.bandsRemoved) parts.push(`${plural(d.bandsRemoved, 'band')} removed`);
  parts.push(d.capChanged ? `launch cap ${d.nowCap > d.wasCap ? 'raised' : 'lowered'} to $${d.nowCap.toLocaleString('en-GB')}` : 'launch cap unchanged');
  return `${parts.join(' · ')}. ${d.blast === 0 ? 'No customer moves to a different score band.' : `${d.blast}% of the population moves to a different score band.`}`;
}

function money(n) {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}m`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}k`;
  return `$${Math.round(n)}`;
}
function delta(n, unit, goodWhenUp) {
  const d = Math.round(n * 10) / 10;
  if (d === 0) return { text: `no change vs. last measured`, color: '#667085' };
  const good = goodWhenUp ? d > 0 : d < 0;
  return { text: `${d > 0 ? '+' : ''}${unit === '$' ? '$' + Math.abs(d) * (d < 0 ? -1 : 1) : d}${unit === '$' ? '' : unit} vs. last measured`, color: good ? '#067647' : '#B42318' };
}

function renderSimulate() {
  const r = simResults();
  const p = activeProfile();

  const cards = [
    { label: 'Band approval rate', value: `${r.draft.approvalRate}%`, d: delta(r.draft.approvalRate - r.live.approvalRate, ' pts', true) },
    { label: 'Average limit', value: `$${r.draft.avgLimit}`, d: delta(r.draft.avgLimit - r.live.avgLimit, '$', true) },
    { label: 'Projected bad rate', value: `${r.draft.badRate}%`, d: delta(r.draft.badRate - r.live.badRate, ' pts', false) },
    { label: 'Book against launch cap', value: money(r.book),
      d: r.capped
        ? { text: `capped by the ${money(r.launchMax)} launch maximum`, color: '#7A5B12' }
        : (r.launchMax > 0 ? delta((r.book - r.liveBook) / 1000, 'k', true) : { text: 'no launch maximum set', color: '#667085' }) },
    { label: 'Blast radius', value: `${r.blast}%`, d: { text: r.blast > 5 ? 'Above the 5% review threshold' : 'Within the 5% review threshold', color: r.blast > 5 ? '#B42318' : '#067647' } },
  ];

  const stats = cards.map(st => `
    <div class="card stat-card">
      <h2 class="sim-stat-label">${esc(st.label)}</h2>
      <div class="stat-value">${esc(st.value)}</div>
      <div class="stat-note" style="color:${st.d.color};">${esc(st.d.text)}</div>
    </div>`).join('');

  const simMax = Math.max(1, ...r.draft.rows.map((row, i) => Math.max(row.pop, r.live.rows[i] ? r.live.rows[i].pop : 0)));
  const bars = r.draft.rows.map((row, i) => {
    const live = r.live.rows[i] ? r.live.rows[i].pop : 0;
    return `
    <div class="sim-col">
      <div class="sim-bars">
        <div class="sim-bar live" style="height:${(live / simMax) * 100}%;" title="Last measured: ${live}%"></div>
        <div class="sim-bar draft" style="height:${(row.pop / simMax) * 100}%;" title="Draft: ${row.pop}%"></div>
      </div>
      <div class="sim-col-label">${esc(row.band.label)}</div>
      <div class="sim-col-pct">${live}% → ${row.pop}%</div>
    </div>`;
  }).join('');

  // Drivers derived from what actually differs from the last measured layout.
  const drivers = [];
  p.config.bands.forEach((b, i) => {
    const was = p.liveBands[i];
    if (was && was.floor !== b.floor) {
      const now = r.draft.rows[i] ? r.draft.rows[i].pop : 0;
      const before = r.live.rows[i] ? r.live.rows[i].pop : 0;
      drivers.push({
        title: `${b.label} band floor moved ${was.floor} → ${b.floor}`,
        detail: `That band now holds ${now}% of the scored population instead of ${before}%, and its bad rate reads ${r.draft.rows[i].badRate}% against ${r.live.rows[i].badRate}%.`,
      });
    }
  });
  const enabled = p.config.rules.filter(x => x.enabled).length;
  drivers.push({
    title: `${enabled} of ${p.config.rules.length} rules switched on`,
    detail: 'Rules cap and decline on top of the band table; they can lower a limit or decline, but never raise a limit above what the band allows.',
  });
  const fbOn = p.config.fallback.entries.filter(e => e.enabled).length;
  drivers.push({
    title: fbOn ? `Fallback scorecard active — ${fbOn} signals` : 'Fallback scorecard not configured',
    detail: fbOn
      ? `Customers the model cannot score are scored on points instead, then capped at the $${p.config.fallback.tiers.thinCeiling} thin-file ceiling.`
      : 'Customers the model cannot score have no route to an offer until signals are switched on.',
  });

  const driverRows = drivers.map(d => `
    <div class="driver-row">
      <div class="driver-title">${esc(d.title)}</div>
      <div class="driver-detail">${esc(d.detail)}</div>
    </div>`).join('');

  const runline = state.simRunning
    ? `<div class="sim-runline is-running"><span class="sim-spinner" aria-hidden="true"></span> Running this draft against ${esc(r.pop.label)}…</div>`
    : state.simRun
      ? `<div class="sim-runline">Last run: <strong>${esc(state.simRun.at)}</strong> against <strong>${esc(state.simRun.population)}</strong></div>`
      : `<div class="sim-runline">Not run yet. The figures below are already derived from this draft's score bands — running stamps them against a named population.</div>`;

  return `
  <div class="page-head">
    <div>
      <h1 class="page-title">What-if simulation</h1>
      <p class="page-desc" style="max-width:660px;">Run this draft against a historical population before publishing.</p>
    </div>
    <div class="page-head-actions">
      <select class="sim-select" data-change="sim-pop" aria-label="Population to simulate against">
        ${SIM_POPULATIONS.map((o, i) => `<option value="${i}"${i === state.simPopIdx ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}
      </select>
      <button class="btn btn-primary sim-run" data-action="run-sim"${state.simRunning ? ' disabled' : ''}>${state.simRunning ? 'Running…' : 'Run simulation'}</button>
    </div>
  </div>

  ${runline}

  <div class="sim-stats">${stats}</div>
  <div class="sim-derived" style="margin-bottom:16px;">Derived from this draft's score bands read against the last measured population and default rates, over ${esc(r.pop.label)} — the same figures the <span class="nav-link" data-tab="bands">Score bands</span> table shows. Band approval rate is the share of scored customers whose band decision is not Decline; eligibility gates and rule-level declines sit in front of it and are not modelled here. Book assumes ${Math.round(SIM_TAKE_UP * 100)}% take-up of accepted offers${r.launchMax > 0 ? `, capped at the ${money(r.launchMax)} launch maximum set in <span class="nav-link" data-tab="limits">Limits &amp; affordability</span>` : ''} — demand before the cap is ${money(r.demand)}.</div>

  <div class="sim-grid">
    <div class="card panel">
      <h2 class="panel-title">Band distribution — draft vs. last measured</h2>
      <div class="sim-chart">${bars}</div>
      <div class="sim-legend">
        <span><span class="legend-swatch" style="background:#C7D3E2;"></span>Last measured layout</span>
        <span><span class="legend-swatch" style="background:#144989;"></span>This draft</span>
      </div>

      <div style="margin-top:20px;border-top:1px solid #F2F4F7;padding-top:14px;">
        <h3 style="font-size:13px;font-weight:700;color:#101828;">Bad rate by band — draft vs. last measured</h3>
        <div style="font-size:11.5px;color:#667085;margin-top:2px;margin-bottom:8px;">Judge the rule change on risk, not just volume.</div>
        ${r.draft.rows.map((row, i) => {
          const live = r.live.rows[i] ? r.live.rows[i].badRate : null;
          const draftRate = row.badRate;
          if (draftRate == null || live == null) {
            return `
            <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #F6F7F9;font-size:12.5px;">
              <span style="width:110px;color:#344054;font-weight:600;">${esc(row.band.label)}</span>
              <span style="color:#667085;">not measured</span>
            </div>`;
          }
          const diff = Math.round((draftRate - live) * 10) / 10;
          const color = diff > 0 ? '#B42318' : diff < 0 ? '#067647' : '#667085';
          const sign = diff > 0 ? '+' : '';
          return `
          <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #F6F7F9;font-size:12.5px;">
            <span style="width:110px;color:#344054;font-weight:600;">${esc(row.band.label)}</span>
            <span style="color:#667085;font-variant-numeric:tabular-nums;">${live}% → <strong style="color:#101828;">${draftRate}%</strong></span>
            <span style="margin-left:auto;font-weight:700;font-variant-numeric:tabular-nums;color:${color};">${diff === 0 ? 'no change' : sign + diff + ' pts'}</span>
          </div>`;
        }).join('')}
        <div class="sim-derived">Derived from the shared model's score distribution and measured default rates, re-read from this draft's band floors on every change.</div>
      </div>
    </div>

    <div class="card panel">
      <h2 class="panel-title" style="margin-bottom:12px;">What changed the outcome</h2>
      ${driverRows}
      <div class="blast-note">${esc(deltaSummary())} ${r.blast > 5 ? 'Above the 5% review threshold, so a checker sign-off is required.' : 'Below the 5% review threshold.'}</div>
    </div>
  </div>

  ${renderDecisionExplanation()}`;
}

// Read-only: shows the reason codes the engine WOULD emit for a sample customer.
// Codes are resolved from the rule that fired, never from a hand-authored map.
function renderDecisionExplanation() {
  const sample = SAMPLE_DECISIONS[state.diSample] || SAMPLE_DECISIONS[0];
  const rules = cfg().rules;
  const ruleByCode = (code) => rules.find(r => r.code === code);

  const outcomeColors = {
    decline: ['#FEF3F2', '#B42318', '#FECDCA'],
    approve: ['#ECFDF3', '#067647', '#ABEFC6'],
    refer: ['#EFF4FF', '#172E7B', '#C7D7FE'],
  }[sample.outcomeKind];

  const emitted = (code, source, note) => {
    const c = rcByCode(code);
    return `
    <div class="di-emit">
      <span class="rule-code">${esc(code || '—')}</span>
      <div style="flex:1;min-width:0;">
        <div class="di-emit-label">${esc(c ? c.label : 'Code not found in the catalogue')}</div>
        <div class="di-emit-source">${source}</div>
        ${c && c.consumer ? `<div class="di-emit-consumer">Consumer message: “${esc(c.consumer)}”</div>` : `<div class="di-emit-consumer di-none">No consumer message — administrator/agent only</div>`}
      </div>
      ${note ? `<span class="di-emit-note">${esc(note)}</span>` : ''}
    </div>`;
  };

  let body;
  if (sample.outcomeKind === 'approve') {
    const bound = ruleByCode(sample.boundRule);
    body = `
    <h3 class="di-group-label">Top contributing model factors</h3>
    ${sample.factors.map((code, i) => {
      const f = state.modelFactors.find(x => x.code === code);
      return emitted(code, `Model factor${f ? ` · ${esc(labelOf(f.param))}` : ''} — mapped in Global setup`, `#${i + 1}`);
    }).join('')}
    <h3 class="di-group-label" style="margin-top:14px;">Constraint that bound the limit</h3>
    ${bound
      ? emitted(bound.rc, `Rule ${esc(bound.code)} fired — “${esc(sentence(bound))}”`, esc(sample.boundLabel))
      : `<div class="di-emit di-none" style="padding:12px 14px;">Rule ${esc(sample.boundRule)} is no longer in this profile — no code emitted.</div>`}`;
  } else {
    const fired = ruleByCode(sample.firedRule);
    body = `
    <h3 class="di-group-label">Rule that determined the outcome</h3>
    ${fired
      ? emitted(fired.rc, `Rule ${esc(fired.code)} fired — “${esc(sentence(fired))}”`, sample.outcomeKind === 'decline' ? 'stopped here' : 'routed to review')
      : `<div class="di-emit di-none" style="padding:12px 14px;">Rule ${esc(sample.firedRule)} is no longer in this profile — no code emitted.</div>`}
    <h3 class="di-group-label" style="margin-top:14px;">Model factors</h3>
    <div class="di-emit di-none" style="padding:12px 14px;">Not evaluated — the application stopped before scoring, so no factor codes are emitted.</div>`;
  }

  return `
  <div class="card panel" style="margin-top:16px;">
    <div style="display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap;">
      <div style="min-width:0;">
        <h2 class="panel-title">Decision explanation <span class="mode-pill" style="vertical-align:middle;margin-left:6px;">Read-only</span></h2>
        <div class="panel-sub" style="max-width:660px;">The reason codes the engine would emit for a sample customer, resolved from the rules and model factors that actually fired. Nothing here is authored — change a rule's reason code in the Rules tab and this changes with it.</div>
      </div>
      <div class="di-tabs">
        ${SAMPLE_DECISIONS.map((s, i) => `
          <button class="di-tab${i === state.diSample ? ' active' : ''}" data-action="di-sample" data-idx="${i}"
            aria-pressed="${i === state.diSample ? 'true' : 'false'}"
            aria-label="Show the decision explanation for ${esc(s.name)} — ${esc(s.outcome)}">${esc(s.name)}</button>`).join('')}
      </div>
    </div>

    <div class="di-body">
      <div class="di-customer">
        <div>
          <div class="di-customer-name">${esc(sample.name)}</div>
          <div class="di-customer-sub">${esc(sample.summary)}</div>
        </div>
        <span class="chip" style="background:${outcomeColors[0]};color:${outcomeColors[1]};border:1px solid ${outcomeColors[2]};">${esc(sample.outcome)}</span>
      </div>
      <div class="di-detail">${esc(sample.detail)}</div>
      ${body}
    </div>
  </div>`;
}

function renderVersions() {
  const versions = activeProfile().versions;
  const versionRows = versions.length === 0
    ? `<div style="padding:22px 20px;font-size:13px;color:#667085;">No versions yet. Publishing this profile for the first time will create v1.0 here.</div>`
    : versions.map(v => {
    const dot = v.status === 'Live' ? '#12B76A' : v.status === 'Draft' ? '#F5B546' : '#D0D5DD';
    const actionColor = v.action === 'Roll back' ? NAVY : '#344054';
    return `
    <div class="version-row">
      <div class="version-dot" style="background:${dot};"></div>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="version-name">${esc(v.version)}</span>
          ${chip(v.status)}
        </div>
        <div class="version-summary">${esc(v.summary)}</div>
        <div class="version-meta">${esc(v.meta)}</div>
      </div>
      <button class="version-action" style="color:${actionColor};" aria-label="${esc(v.action)} ${esc(v.version)} — ${esc(v.status)}">${esc(v.action)}</button>
    </div>`;
    }).join('');

  return `
  <h1 class="page-title">Versions</h1>
  <p class="page-desc" style="margin-bottom:20px;">Every published version of ${esc(activeProfile().name)} is kept. Rolling back restores that exact rule set. The audit log for all users lives in <span class="nav-link" data-nav="users">Global setup → Users &amp; audit</span>.</p>

  <div class="card list-card" style="max-width:720px;">
    <h2 class="list-card-head">Version history — ${esc(activeProfile().name)}</h2>
    ${versionRows}
  </div>`;
}

/* ---------- Fallback scorecard ---------- */

function fbPreviewState() {
  if (!state.fbPreview) {
    const checks = {};
    cfg().fallback.entries.forEach(e => {
      if (!e.banded && e.enabled && (e.param === 'kyc' || e.param === 'tenure')) checks[e.id] = true;
    });
    state.fbPreview = { checks, income: '120' };
  }
  return state.fbPreview;
}

function fbCompute() {
  const fb = cfg().fallback;
  const pv = fbPreviewState();
  const income = parseFloat(pv.income);
  const incomeKnown = !isNaN(income) && income > 0;
  let pts = 0, signals = 0;
  fb.entries.forEach(e => {
    if (!e.enabled) return;
    if (e.banded) {
      if (incomeKnown) {
        signals++;
        const band = FB_INCOME_BANDS.find(([floor]) => income >= floor);
        pts += band ? band[1] : 0;
      }
    } else if (pv.checks[e.id]) {
      signals++;
      pts += Number(e.points) || 0;
    }
  });
  const score = Math.min(pts, state.scoreMax);
  const t = fb.tiers;
  const tier = (!incomeKnown || signals < t.partialMin) ? 'zero' : (signals >= t.fullMin ? 'full' : 'partial');
  const bands = cfg().bands;
  let bandIdx = 0;
  bands.forEach((b, i) => { if (score >= b.floor) bandIdx = i; });
  const band = bands[bandIdx];
  const bandLimit = parseFloat(String(band.limit).replace(/[$,]/g, ''));
  const cap = tier === 'full' ? Number(t.thinCeiling) : Number(t.thinCeiling) / 2;
  let limit;
  if (tier === 'zero') limit = `$${t.zeroMin} — flat cold-start minimum`;
  else if (band.decision === 'Decline' || isNaN(bandLimit)) limit = 'Decline at this score';
  else limit = `$${Math.min(bandLimit, cap)}${bandLimit > cap ? ` (band gives $${bandLimit}, capped)` : ''}`;
  const afford = incomeKnown
    ? `$${Math.round(income * 0.25)} / month instalment cap (25% of income)`
    : '— · income unknown, zero-file minimum applies';
  return { score, signals, tier, band, bandIdx, limit, afford, incomeKnown };
}

function renderFallback() {
  const fb = cfg().fallback;
  const pv = fbPreviewState();
  const maxPts = fb.entries.filter(e => e.enabled).reduce((n, e) => n + (Number(e.points) || 0), 0);
  const overScale = maxPts > state.scoreMax;

  const entryRows = fb.entries.map(e => {
    const sig = labelOf(e.param);
    return `
    <div class="fb-row" style="background:${e.enabled ? '#fff' : '#FCFCFD'};">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <button class="switch${e.enabled ? ' on' : ''}" style="margin-top:0;" data-action="fb-toggle" data-entry="${e.id}"
          role="switch" aria-checked="${e.enabled ? 'true' : 'false'}"
          aria-label="Scorecard signal ${esc(sig)} enabled"
          title="Enable or disable this signal"><span class="knob"></span></button>
        <select class="fb-signal" data-change="fb-param" data-entry="${e.id}" ${e.banded ? 'disabled' : ''}
          aria-label="Signal for scorecard row ${esc(sig)}">
          ${PARAM_GROUPS.map(([g, gLabel]) => {
            const opts = paramsForSection('fallback').filter(d => d.group === g);
            return opts.length ? `<optgroup label="${esc(gLabel)}">${optionGroup(opts.map(d => [d.key, d.label]), e.param)}</optgroup>` : '';
          }).join('')}
          ${paramValidIn(e.param, 'fallback') ? '' : `<optgroup label="Not valid here"><option value="${esc(e.param)}" selected>${esc(labelOf(e.param))} — not valid here</option></optgroup>`}
        </select>
        <select class="fb-op" data-change="fb-op" data-entry="${e.id}" ${e.banded ? 'disabled' : ''}
          aria-label="Test for scorecard signal ${esc(sig)}">${optionGroup(FB_OPERATORS, e.op)}</select>
        <input class="fb-value" value="${esc(e.value)}" data-change="fb-value" data-entry="${e.id}" ${e.banded ? 'disabled' : ''}
          aria-label="Value for scorecard signal ${esc(sig)}" />
        <span style="font-size:12px;color:#667085;" aria-hidden="true">→</span>
        <input class="fb-points" type="number" step="10" value="${esc(e.points)}" data-change="fb-points" data-entry="${e.id}"
          aria-label="Points awarded for scorecard signal ${esc(sig)}${e.banded ? ', maximum' : ''}" />
        <span style="font-size:12px;color:#667085;">pts${e.banded ? ' max' : ''}</span>
        <button class="rule-remove" data-action="fb-remove" data-entry="${e.id}"
          aria-label="Remove scorecard signal ${esc(sig)}" title="Remove signal">×</button>
      </div>
      ${e.note ? `<div style="font-size:11.5px;color:#667085;margin:6px 0 0 48px;">${esc(e.note)}</div>` : ''}
    </div>`;
  }).join('');

  const tierRow = (title, desc, control) => `
    <div class="field-row" style="align-items:flex-start;">
      <div style="flex:1;min-width:0;">
        <div class="field-label">${title}</div>
        <div class="field-hint" style="text-wrap:pretty;">${desc}</div>
      </div>
      ${control}
    </div>`;
  const t = fb.tiers;
  const TIER_LABEL = {
    fullMin: 'Minimum signals for full fallback coverage',
    partialMin: 'Minimum signals for partial coverage',
    zeroMin: 'Zero-file flat cold-start minimum, in US dollars',
    thinCeiling: 'Thin-file ceiling — hard cap on any fallback-scored offer, in US dollars',
  };
  const numInput = (field, val, pre) => `
    <span style="display:flex;align-items:center;gap:4px;white-space:nowrap;">
      ${pre ? `<span style="font-size:12.5px;color:#667085;" aria-hidden="true">${pre}</span>` : ''}
      <input class="fb-tier-input" type="number" value="${esc(val)}" data-change="fb-tier" data-field="${field}"
        aria-label="${esc(TIER_LABEL[field] || field)}" />
    </span>`;

  const r = fbCompute();
  const tierLabel = { full: 'Full fallback', partial: 'Partial coverage', zero: 'Zero-file' }[r.tier];
  const previewChecks = fb.entries.filter(e => e.enabled && !e.banded).map(e => `
    <label class="fb-check">
      <input type="checkbox" data-change="fb-check" data-entry="${e.id}" ${pv.checks[e.id] ? 'checked' : ''}
        aria-label="Sample customer has ${esc(labelOf(e.param))} ${esc(SENT_OP[e.op] || e.op)} ${esc(e.value)}, worth ${esc(e.points)} points" />
      <span>${esc(labelOf(e.param))} <span style="color:#667085;">${esc(SENT_OP[e.op] || e.op)} ${esc(e.value)}</span> <strong style="color:#144989;">+${esc(e.points)}</strong></span>
    </label>`).join('');

  return `
  <h1 class="page-title">Fallback scorecard</h1>
  <p class="page-desc" style="max-width:760px;">Some customers are too new to score — the model has nothing to work with. Rather than turn them away, this scorecard gives points for whatever they <em>can</em> show, adds the points up, and treats the total as a score.</p>
  <ol class="howto" style="max-width:760px;margin-bottom:18px;">
    <li><strong>Points for what they have</strong> — verified ID, months on the wallet, steady income. Set each signal's worth in the table below.</li>
    <li><strong>The total is the score</strong>, on the same 0–1000 scale as the model, so it flows through the same <span class="nav-link" data-tab="bands">Score bands</span> — but capped, because a points total is a rougher guess than a model score.</li>
    <li><strong>How much data is enough</strong> is set by the coverage tiers. Too little, and the customer gets a small flat starting amount instead of a scored offer.</li>
    <li><strong>Every fallback decision is labelled</strong> as rule-based, so you can always tell these apart from model-scored ones.</li>
  </ol>
  <div style="margin:12px 0 18px 0;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
    <span class="readonly-value">Score scale ${state.scoreMin}–${state.scoreMax}</span>
    <span class="inherited-tag">inherited from the shared model · signals come from <span class="nav-link" data-nav="params">Global setup → Parameters &amp; features</span></span>
  </div>

  <div style="display:grid;grid-template-columns:1.45fr 1fr;gap:16px;align-items:start;">
    <div style="display:flex;flex-direction:column;gap:16px;">
      <div class="card panel">
        <h2 class="panel-title">Points table</h2>
        <div class="panel-sub" style="margin-bottom:10px;">A customer earns points for each signal they can demonstrate. Signals reference the shared parameter definitions.</div>
        ${entryRows}
        <div style="margin-top:12px;display:flex;align-items:center;gap:10px;">
          <button class="add-rule" data-action="fb-add">+ Add signal</button>
          <span style="margin-left:auto;font-size:12.5px;font-weight:700;color:${overScale ? '#7A5B12' : '#344054'};">
            Max achievable: ${maxPts} points${overScale ? ` · capped to ${state.scoreMax} (score scale)` : ` · within the ${state.scoreMin}–${state.scoreMax} scale`}
          </span>
        </div>
      </div>

      <div class="explainer-note">Fallback scores flow through the same <span class="nav-link" data-tab="bands">Score bands</span>, but capped at the thin-file ceiling. Income, when available, drives the affordability ceiling as configured in <span class="nav-link" data-tab="limits">Limits &amp; affordability</span>; when income is unknown, the zero-file minimum applies.</div>
    </div>

    <div style="display:flex;flex-direction:column;gap:16px;">
      <div class="card panel">
        <h2 class="panel-title">Coverage tiers</h2>
        <div class="panel-sub" style="margin-bottom:6px;">How much data is enough to trust the scorecard.</div>
        ${tierRow('Full fallback', 'Enough signals present — score normally, capped at the thin-file ceiling.', numInput('fullMin', t.fullMin, 'at least&nbsp;signals:'))}
        ${tierRow('Partial coverage', 'Fewer signals — offer capped at 50% of the thin-file ceiling ($' + (Number(t.thinCeiling) / 2) + ').', numInput('partialMin', t.partialMin, 'at least&nbsp;signals:'))}
        ${tierRow('Zero-file', 'Too little data — in particular no inferable income. Skip scoring, assign a flat cold-start minimum.', numInput('zeroMin', t.zeroMin, '$'))}
        ${tierRow('Thin-file ceiling', 'Hard cap on any fallback-scored offer.', numInput('thinCeiling', t.thinCeiling, '$'))}
      </div>

      <div class="card panel">
        <h2 class="panel-title">Live preview — sample customer</h2>
        <div class="panel-sub" style="margin-bottom:8px;">Tick the signals this customer has.</div>
        ${previewChecks}
        <div style="display:flex;align-items:center;gap:8px;margin:10px 0 14px 0;">
          <span style="font-size:12.5px;color:#344054;font-weight:600;">Inferred monthly income</span>
          <span style="font-size:12.5px;color:#667085;">$</span>
          <input class="fb-tier-input" style="width:70px;" value="${esc(pv.income)}" data-change="fb-income" placeholder="—"
            aria-label="Sample customer's inferred monthly income in US dollars — leave blank for unknown" />
          <span style="font-size:11.5px;color:#667085;">blank = unknown</span>
        </div>
        <div style="border-top:1px solid #F2F4F7;padding-top:12px;">
          <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;">
            <span style="font-size:30px;font-weight:700;color:#101828;font-variant-numeric:tabular-nums;">${r.score}</span>
            <span class="chip" style="background:${BAND_COLORS[r.bandIdx]};color:${inkOn(BAND_COLORS[r.bandIdx])};border:1px solid ${BAND_COLORS[r.bandIdx]};">${esc(r.band.label)}</span>
            <span class="chip" style="background:rgba(72,194,207,0.14);color:#144989;border:1px solid rgba(72,194,207,0.5);">score_source: rule-based fallback</span>
          </div>
          <div class="fb-result-row"><span>Coverage tier</span><strong>${tierLabel} · ${r.signals} signal${r.signals === 1 ? '' : 's'}</strong></div>
          <div class="fb-result-row"><span>Recommended limit</span><strong>${esc(r.limit)}</strong></div>
          <div class="fb-result-row"><span>Affordability ceiling</span><strong>${esc(r.afford)}</strong></div>
          <div class="fb-result-row"><span>Probability of default</span><strong>— <span style="font-weight:500;color:#667085;">points scorecard, not a calibrated probability</span></strong></div>
        </div>
      </div>
    </div>
  </div>`;
}

/* ---------- Setup progress ---------- */

// Each step's state is derived from the profile's own configuration, so the
// strip reports what is actually set up rather than what someone clicked.
function stepState(key) {
  const c = cfg();
  const p = activeProfile();
  switch (key) {
    case 'rules': {
      if (!c.rules.length) return { state: 'todo', note: 'No rules yet' };
      const invalid = c.rules.filter(r => !paramValidIn(r.param, r.section) || !actionValidIn(r.action, r.section)).length;
      const enabled = c.rules.filter(r => r.enabled).length;
      if (!enabled) return { state: 'partial', note: 'No rule is switched on' };
      if (invalid) return { state: 'partial', note: `${invalid} rule${invalid === 1 ? '' : 's'} need attention` };
      return { state: 'done', note: `${enabled} active` };
    }
    case 'bands': {
      const unset = c.bands.filter(b => b.decision === 'Not configured').length;
      if (unset === c.bands.length) return { state: 'todo', note: 'No decisions set' };
      if (unset) return { state: 'partial', note: `${unset} band${unset === 1 ? '' : 's'} unset` };
      return { state: 'done', note: `${c.bands.length} bands` };
    }
    case 'fallback': {
      const on = c.fallback.entries.filter(e => e.enabled).length;
      if (!on) return { state: 'todo', note: 'No signals switched on' };
      if (!Number(c.fallback.tiers.thinCeiling)) return { state: 'partial', note: 'No thin-file ceiling' };
      return { state: 'done', note: `${on} signals` };
    }
    case 'limits': {
      const lim = syncMatrix(c);
      const caps = lim.caps;
      const zero = caps.filter(f => !Number(f.value)).length;
      const blanks = lim.matrix.flat().filter(v => !v || v === '—').length;
      if (zero === caps.length) return { state: 'todo', note: 'No caps set' };
      if (zero || blanks) return { state: 'partial', note: zero ? `${zero} cap${zero === 1 ? '' : 's'} unset` : 'Matrix incomplete' };
      return { state: 'done', note: 'Caps & matrix set' };
    }
    case 'simulate':
      return c.touched.simulate
        ? { state: 'done', note: 'Simulation run' }
        : { state: 'todo', note: 'Not run yet' };
    case 'publish': {
      if (p.status === 'Published' || p.status === 'Live') return { state: 'done', note: 'Live' };
      const blockers = publishBlockers();
      return blockers.length
        ? { state: 'todo', note: `Waiting on ${blockers.length} step${blockers.length === 1 ? '' : 's'}` }
        : { state: 'ready', note: 'Ready to send' };
    }
  }
  return { state: 'todo', note: '' };
}

function publishBlockers() {
  return PUBLISH_PREREQS.filter(k => stepState(k).state !== 'done')
    .map(k => SETUP_STEPS.find(s => s.key === k).label);
}

function setupSteps() {
  return SETUP_STEPS.map((s, i) => ({ ...s, num: i + 1, ...stepState(s.key) }));
}

// The steps ARE the tabs, so there is no second list of the same destinations —
// only a one-line count of how far the set-up has got.
function renderSetupSummary() {
  const steps = setupSteps();
  const done = steps.filter(s => s.state === 'done').length;
  const pct = (done / steps.length) * 100;
  return `
  <div class="setup-summary">
    <span class="setup-progress-track" aria-hidden="true"><span class="setup-progress-fill" style="width:${pct}%;"></span></span>
    <span class="setup-count">${done} of ${steps.length} steps complete</span>
    <span class="setup-hint">Work left to right, or jump to any step. Step ${steps.length}, Publish, is the button in the header.</span>
  </div>`;
}

// "Next: …" footer so a first-time setup can be walked end to end.
function renderStepFooter() {
  const idx = SETUP_STEPS.findIndex(s => s.key === state.profileTab);
  if (idx === -1) return '';   // Versions is history, not a setup step
  const prev = SETUP_STEPS[idx - 1];
  const next = SETUP_STEPS[idx + 1];
  const cur = stepState(state.profileTab);
  return `
  <div class="step-footer">
    ${prev ? `<button class="btn btn-outline btn-sm" data-action="setup-step" data-step="${prev.key}">← ${esc(prev.label)}</button>` : '<span></span>'}
    <span class="step-footer-state is-${cur.state}">${cur.state === 'done' ? '✓ ' : ''}${esc(cur.note)}</span>
    ${next ? `<button class="btn btn-primary btn-sm" data-action="setup-step" data-step="${next.key}">Next: ${esc(next.label)} →</button>` : '<span></span>'}
  </div>`;
}

/* ---------- Profile workspace ---------- */

const TAB_RENDERERS = {
  rules: () => renderRules(),
  bands: () => renderBands(),
  fallback: () => renderFallback(),
  limits: () => renderLimits(),
  simulate: () => renderSimulate(),
  versions: () => renderVersions(),
};

// ONE navigation control. Each tab carries its own step number and status, so
// the progress signalling and the destinations are the same list of things.
function renderProfileWorkspace() {
  const p = activeProfile();
  const steps = setupSteps();
  const byKey = Object.fromEntries(steps.map(s => [s.key, s]));

  const tabs = PROFILE_TABS.map(([key, label]) => {
    const s = byKey[key];              // Versions is history, not a set-up step
    const active = state.profileTab === key;
    const mark = s && s.state === 'done'
      ? '<span class="tab-status is-done" aria-hidden="true">✓</span>'
      : s && s.state === 'partial'
        ? '<span class="tab-status is-partial" aria-hidden="true"></span>'
        : '';
    const name = s
      ? `Step ${s.num} of ${steps.length}: ${label} — ${s.note}`
      : `${label} — published version history`;
    return `
    <button class="tab${active ? ' active' : ''}${s && s.state === 'done' ? ' is-done' : ''}"
      role="tab" id="tab-${key}" aria-controls="tabpanel" aria-selected="${active ? 'true' : 'false'}"
      tabindex="${active ? '0' : '-1'}" data-tab="${key}"
      title="${esc(s ? `${s.hint} · ${s.note}` : 'Every published version of this profile')}"
      aria-label="${esc(name)}">
      ${s ? `<span class="tab-num" aria-hidden="true">${s.num}</span>` : ''}<span>${esc(label)}</span>${mark}
    </button>`;
  }).join('');

  // Publish is the one set-up step that is an action rather than a destination,
  // so it lives on the header button instead of becoming an eighth tab.
  const blockers = publishBlockers();
  const nag = state.setupNag && blockers.length ? `
    <div class="blast-note" style="margin:0 0 16px 0;">
      Not ready to publish yet — finish ${blockers.map(b => `<strong>${esc(b)}</strong>`).join(', ')} first.
      A checker cannot approve a profile with an unconfigured step.
    </div>` : '';

  // The pill in the header and the dimmed controls already say "read-only";
  // the banner only appears the first time this profile is opened.
  const banner = state.mode === 'view' && state.showBanner ? `
    <div class="view-banner">
      <span>Viewing <strong>${esc(p.name)} ${esc(p.version)}</strong> — read-only. Nothing here can be changed until you switch to editing.</span>
      <button class="btn btn-primary btn-sm" data-action="enter-edit" style="font-weight:600;">Edit this profile</button>
    </div>` : '';

  // Versions is history, not a set-up step, so the progress line has nothing to
  // say there.
  const summary = state.profileTab === 'versions' ? '' : renderSetupSummary();
  const tabLabel = (PROFILE_TABS.find(([k]) => k === state.profileTab) || [null, ''])[1];

  return `
  <div class="crumbs">
    <span class="nav-link" data-nav="profiles" role="link" tabindex="0">← Product profiles</span>
    <span class="crumb-sep">/</span>
    <span class="crumb-current">${esc(p.name)} ${esc(p.version)}</span>
  </div>
  <div class="tabbar" role="tablist" aria-label="${esc(p.name)} set-up steps">${tabs}</div>
  ${summary}
  ${nag}
  ${banner}
  <div class="profile-content${state.mode === 'view' ? ' view-mode' : ''}"
    id="tabpanel" role="tabpanel" tabindex="0"
    aria-labelledby="tab-${state.profileTab}" aria-label="${esc(tabLabel)}">
    ${TAB_RENDERERS[state.profileTab]()}
    ${renderStepFooter()}
  </div>`;
}

/* ---------- Global setup screens ---------- */

function globalBadge() {
  return `<div class="global-note">Global setup — shared by every product. Change once, applies everywhere. Not versioned per profile.</div>`;
}

// Global setup screens get the same back affordance the profile workspace has.
function globalCrumbs() {
  const label = (NAV_GLOBAL.find(([k]) => k === state.screen) || [null, 'Global setup'])[1];
  return `
  <div class="crumbs">
    <span class="nav-link" data-nav="profiles" role="link" tabindex="0">← Product profiles</span>
    <span class="crumb-sep">/</span>
    <span class="crumb-current">Global setup · ${esc(label)}</span>
  </div>`;
}

function renderModel() {
  const s = state;
  const infoRows = [
    { label: 'Scoring model', hint: 'Built and retrained by Data Science', value: 'DF-Score v3' },
    { label: 'Owner', hint: 'Accountable for model performance', value: 'Group Credit Risk' },
    { label: 'Retraining cadence', hint: 'Champion/challenger refresh', value: 'Monthly' },
    { label: 'Used by', hint: 'Profiles reading this model today', value: state.profiles.filter(p => p.status !== 'Not started').map(p => `${p.name} ${p.version}`).join(', ') || 'No profiles yet' },
  ].map(f => `
    <div class="field-row">
      <div style="flex:1;min-width:0;">
        <div class="field-label">${esc(f.label)}</div>
        <div class="field-hint">${esc(f.hint)}</div>
      </div>
      <div class="field-value">${esc(f.value)}</div>
    </div>`).join('');

  return `
  ${globalCrumbs()}
  <h1 class="page-title">Model &amp; score range</h1>
  <p class="page-desc" style="margin-bottom:20px;">One scoring model is shared by every product profile. Profiles decide what the score means; they never change the model or its range.</p>
  ${globalBadge()}

  <div class="limits-grid" style="max-width:1000px;">
    <div class="card panel">
      <h2 class="panel-title" style="margin-bottom:14px;">Shared scoring model</h2>
      ${infoRows}
    </div>

    <div class="card panel">
      <h2 class="panel-title">Score range</h2>
      <div class="panel-sub">Every profile's band ruler is positioned on this range.</div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:16px;">
        <input class="score-input" value="${s.scoreMin}" data-change="score-min" aria-label="Shared model score range — minimum score" />
        <span style="color:#667085;font-size:12.5px;" aria-hidden="true">to</span>
        <input class="score-input" value="${s.scoreMax}" data-change="score-max" aria-label="Shared model score range — maximum score" />
      </div>
      <div style="margin-top:14px;font-size:12.5px;color:#667085;line-height:1.55;text-wrap:pretty;">Changing the range rescales the score-band ruler in every profile. Band floors keep their absolute values; review each profile's <span class="nav-link" data-nav="bands">score bands</span> after a change.</div>
    </div>
  </div>`;
}

function psiState(psi) {
  if (psi < 0.10) return { label: 'Stable', colors: ['#ECFDF3', '#067647', '#ABEFC6'] };
  if (psi <= 0.25) return { label: 'Watch', colors: ['#FFF8E6', '#7A5B12', '#F5DFA5'] };
  return { label: 'Action', colors: ['#FEF3F2', '#B42318', '#FECDCA'] };
}

function calibrationSvg() {
  const W = 340, H = 210, m = { l: 38, r: 12, t: 16, b: 34 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const max = 40;
  const x = v => m.l + (v / max) * pw;
  const y = v => m.t + ph - (v / max) * ph;
  const ticks = [0, 10, 20, 30, 40];
  const grid = ticks.map(t => `
    <line x1="${m.l}" y1="${y(t)}" x2="${W - m.r}" y2="${y(t)}" stroke="#F2F4F7" stroke-width="1"/>
    <text x="${m.l - 6}" y="${y(t) + 3.5}" text-anchor="end" font-size="11.5" fill="#667085">${t}%</text>
    <text x="${x(t)}" y="${H - m.b + 14}" text-anchor="middle" font-size="11.5" fill="#667085">${t}%</text>`).join('');
  const pts = MODEL_HEALTH.calibration;
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.pred).toFixed(1)},${y(p.obs).toFixed(1)}`).join(' ');
  const dots = pts.map(p => `
    <circle cx="${x(p.pred).toFixed(1)}" cy="${y(p.obs).toFixed(1)}" r="4" fill="#144989" stroke="#fff" stroke-width="1.5">
      <title>Predicted ${p.pred}% PD → observed ${p.obs}% default rate</title>
    </circle>`).join('');
  return `
  <svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block;" role="img" aria-label="Calibration: predicted probability of default versus observed default rate">
    ${grid}
    <line x1="${x(0)}" y1="${y(0)}" x2="${x(max)}" y2="${y(max)}" stroke="#D0D5DD" stroke-width="1.5" stroke-dasharray="4 4"/>
    <text x="${x(29)}" y="${y(31)}" font-size="11.5" fill="#667085" transform="rotate(-37 ${x(29)} ${y(31)})">perfect calibration</text>
    <path d="${path}" fill="none" stroke="#144989" stroke-width="2"/>
    ${dots}
    <text x="${m.l + pw / 2}" y="${H - 4}" text-anchor="middle" font-size="11.5" fill="#667085">Predicted PD (%)</text>
    <text x="${m.l - 28}" y="${m.t - 4}" font-size="11.5" fill="#667085">Observed (%)</text>
  </svg>`;
}

function renderModelHealth() {
  const mh = MODEL_HEALTH;
  const liveReady = mh.live != null;

  const metricRows = (vals) => [
    ['auc', 'AUC-ROC'], ['gini', 'Gini'], ['ks', 'KS'],
  ].map(([key, label]) => `
    <div class="field-row">
      <div style="flex:1;min-width:0;">
        <div class="field-label">${label}</div>
        <div class="field-hint">${esc(mh.metricHints[key])}</div>
      </div>
      <div class="field-value" style="${vals ? '' : 'color:#5D6B82;background:#F2F4F7;border-color:#E4E7EC;'}">${vals ? esc(vals[key]) : '—'}</div>
    </div>`).join('');

  const psiRows = mh.psi.map(p => {
    const st = psiState(p.psi);
    return `
    <div class="field-row">
      <div style="flex:1;min-width:0;"><div class="field-label">${esc(p.name)}</div></div>
      <span style="font-size:12.5px;color:#344054;font-variant-numeric:tabular-nums;width:44px;text-align:right;">${p.psi.toFixed(2)}</span>
      <span class="chip" style="width:52px;text-align:center;background:${st.colors[0]};color:${st.colors[1]};border:1px solid ${st.colors[2]};">${st.label}</span>
    </div>`;
  }).join('');

  const distMax = Math.max(...mh.scoreDist);
  const distBars = mh.scoreDist.map((v, i) => `
    <div class="dist-bar" style="height:${(v / distMax) * 100}%;" title="${i * 50}–${i * 50 + 50}: ${v}% of scored population"></div>`).join('');

  const badMax = Math.max(...mh.badByBand.map(b => b.rate));
  const badBars = mh.badByBand.map(b => `
    <div class="badband-col">
      <div class="badband-value">${b.rate}%</div>
      <div class="badband-bar" style="height:${(b.rate / badMax) * 100}%;" title="${esc(b.label)}: ${b.rate}% bad rate (validation)"></div>
      <div class="badband-label">${esc(b.label)}</div>
    </div>`).join('');

  return `
  ${globalCrumbs()}
  <h1 class="page-title">Model health</h1>
  <p class="page-desc" style="margin-bottom:20px;">Quality metrics for the shared scoring model. Read-only for policy users — retraining and recalibration belong to Data Science.</p>
  ${globalBadge()}

  ${liveReady ? '' : `<div class="blast-note" style="margin:0 0 16px 0;max-width:1000px;">Validation only — live metrics available after go-live and first device outcomes. Targets to be confirmed after first training run.</div>`}

  <div class="card panel" style="max-width:1000px;margin-bottom:16px;display:flex;gap:26px;flex-wrap:wrap;align-items:center;">
    <div><div class="field-hint">Model</div><div style="font-size:14px;font-weight:700;color:#101828;margin-top:2px;">${esc(mh.version)}</div></div>
    <div><div class="field-hint">Last trained</div><div style="font-size:14px;font-weight:700;color:#101828;margin-top:2px;">${esc(mh.trained)}</div></div>
    <div><div class="field-hint">Retraining</div><div style="font-size:13px;font-weight:600;color:#344054;margin-top:2px;">${esc(mh.retrain)}</div></div>
    <div style="flex-basis:100%;font-size:11.5px;color:#667085;">${esc(mh.window)}</div>
  </div>

  <div class="limits-grid" style="max-width:1000px;margin-bottom:16px;">
    <div class="card panel">
      <h2 class="panel-title">Validation (out-of-time)</h2>
      <div class="panel-sub" style="margin-bottom:6px;">Held-out Jan–May 2026 cohort</div>
      ${metricRows(mh.validation)}
    </div>
    <div class="card panel">
      <h2 class="panel-title">Live (device outcomes)</h2>
      <div class="panel-sub" style="margin-bottom:6px;">${liveReady ? 'Observed on the live book' : 'Awaiting first device outcomes'}</div>
      ${metricRows(mh.live)}
    </div>
  </div>

  <div class="limits-grid" style="max-width:1000px;margin-bottom:16px;">
    <div class="card panel">
      <h2 class="panel-title">Population stability (PSI)</h2>
      <div class="panel-sub" style="margin-bottom:6px;">Scored population vs training population. Below 0.10 stable · 0.10–0.25 watch · above 0.25 action.</div>
      ${psiRows}
    </div>
    <div class="card panel">
      <h2 class="panel-title">Calibration</h2>
      <div class="panel-sub" style="margin-bottom:10px;">Predicted probability of default vs observed default rate, validation deciles.</div>
      ${calibrationSvg()}
    </div>
  </div>

  <div class="limits-grid" style="max-width:1000px;">
    <div class="card panel">
      <h2 class="panel-title">Score distribution</h2>
      <div class="panel-sub" style="margin-bottom:10px;">Share of scored population per 50-point bucket, 0–1000.</div>
      <div class="dist-chart">${distBars}</div>
      <div class="dist-axis"><span>0</span><span>250</span><span>500</span><span>750</span><span>1000</span></div>
    </div>
    <div class="card panel">
      <h2 class="panel-title">Bad rate by score band</h2>
      <div class="panel-sub" style="margin-bottom:10px;">Default rate rises as the score falls — rank ordering holds across every band.</div>
      <div class="badband-chart">${badBars}</div>
    </div>
  </div>`;
}

const TYPE_LABEL = {
  currency: 'Currency', percent: 'Percentage', duration: 'Duration',
  count: 'Count', ratio: 'Ratio', points: 'Points', category: 'Category',
};

function renderParams() {
  const groups = PARAM_GROUPS.map(([g, gLabel, gHint]) => {
    const rows = state.paramDefs.filter(d => d.group === g).map(d => {
      const used = state.profiles.reduce((n, p) => n + p.config.rules.filter(r => r.param === d.key).length, 0);
      const typeDetail = d.type === 'category'
        ? `${(d.values || []).length} allowed values`
        : (d.unit ? `in ${d.unit}` : (d.type === 'currency' ? 'in USD' : (d.type === 'percent' ? 'in %' : '')));
      return `
      <div class="param-row">
        <div class="param-row-top">
          <input class="param-label-input" value="${esc(d.label)}" data-change="param-label" data-key="${esc(d.key)}"
            aria-label="Display label for parameter ${esc(d.key)}" />
          <span class="rule-code">${esc(d.key)}</span>
          <span class="param-type">${esc(TYPE_LABEL[d.type] || d.type)}${typeDetail ? ` · ${esc(typeDetail)}` : ''}</span>
          <span class="param-usage">${used === 0 ? 'not used by any profile' : `used by ${used} rule${used === 1 ? '' : 's'}`}</span>
        </div>
        ${d.type === 'category' ? `<div class="param-values">Allowed values: ${(d.values || []).map(v => `<span class="param-value-chip">${esc(v)}</span>`).join('')}</div>` : ''}
        <div class="param-sections">
          <span class="param-sections-label">Applicable sections</span>
          ${SECTION_TAGS.map(([sk, sl]) => `
            <button type="button" class="sec-chip${(d.sections || []).includes(sk) ? ' on' : ''}" data-action="param-section" data-key="${esc(d.key)}" data-section="${esc(sk)}"
              aria-pressed="${(d.sections || []).includes(sk) ? 'true' : 'false'}"
              aria-label="${esc(d.label)} is ${(d.sections || []).includes(sk) ? '' : 'not '}applicable in ${esc(sl)}">${esc(sl)}</button>`).join('')}
        </div>
      </div>`;
    }).join('');
    return `
    <div class="card panel" style="margin-bottom:16px;">
      <h2 class="panel-title">${esc(gLabel)}</h2>
      <div class="panel-sub" style="margin-bottom:8px;">${esc(gHint)}</div>
      ${rows}
    </div>`;
  }).join('');

  return `
  ${globalCrumbs()}
  <h1 class="page-title">Parameters &amp; features</h1>
  <p class="page-desc" style="max-width:860px;">This is the vocabulary every product's rules are written in — each customer detail the engine can look at, named once, here. Rename one and every rule sentence that uses it updates everywhere at once.</p>
  <ol class="howto" style="max-width:860px;margin-bottom:18px;">
    <li><strong>The name</strong> is what appears in rule sentences. Change it here, never in a rule.</li>
    <li><strong>The type</strong> decides what a rule can do with it — money gets a currency box, a category gets a list to pick from, and so on. Set on creation.</li>
    <li><strong>Applicable sections</strong> is the important one: tick where this detail is allowed to be used. A rule only offers the details ticked for its own section, which is what stops an eligibility check reading today's approval count. Tick several and it appears in each of those lists.</li>
  </ol>
  ${globalBadge()}
  <div style="max-width:1000px;">${groups}</div>`;
}

function renderFraud() {
  const effectChip = (effect) => {
    const colors = effect === 'Refer' ? ['#EFF4FF', '#172E7B', '#C7D7FE'] : ['#FEF3F2', '#B42318', '#FECDCA'];
    return `<span class="chip" style="background:${colors[0]};color:${colors[1]};border:1px solid ${colors[2]};">${esc(effect)}</span>`;
  };
  const rows = FRAUD_LISTS.map(l => `
    <div class="version-row">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="version-name">${esc(l.name)}</span>
          ${effectChip(l.effect)}
        </div>
        <div class="version-summary">${esc(l.detail)}</div>
        <div class="version-meta">${esc(l.meta)} · ${esc(l.rules)}</div>
      </div>
      <button class="version-action" style="color:#344054;" aria-label="Manage entries in ${esc(l.name)}">Manage entries</button>
    </div>`).join('');

  return `
  ${globalCrumbs()}
  <h1 class="page-title">Fraud lists</h1>
  <p class="page-desc" style="margin-bottom:20px;">Blocklists and watchlists maintained centrally. Profile rules reference a list by name; the entries are shared.</p>
  ${globalBadge()}
  <div class="card list-card" style="max-width:860px;">
    <h2 class="list-card-head">Shared lists</h2>
    ${rows}
  </div>`;
}

function rcUsage(code) {
  return state.profiles.reduce((n, p) => n + p.config.rules.filter(r => r.rc === code).length, 0);
}

function renderReasonCodes() {
  const codeRow = (rc) => {
    const used = rc.kind === 'rule' ? rcUsage(rc.code) : state.modelFactors.filter(f => f.code === rc.code).length;
    const usage = rc.kind === 'rule'
      ? (used === 0 ? 'not referenced by any rule' : `referenced by ${used} rule${used === 1 ? '' : 's'} across all profiles`)
      : (used === 0 ? 'not mapped to a model factor' : 'mapped to a model factor');
    return `
    <div class="rc-row${rc.active ? '' : ' rc-inactive'}">
      <span class="rule-code rc-code">${esc(rc.code)}</span>
      <div class="rc-fields">
        <label class="rc-field">
          <span class="rc-field-label">Internal label — administrator &amp; agent</span>
          <input value="${esc(rc.label)}" data-change="rc-label" data-code="${esc(rc.code)}"
            aria-label="Internal label for reason code ${esc(rc.code)} — administrator and agent" />
        </label>
        <label class="rc-field">
          <span class="rc-field-label">Consumer message — optional</span>
          <input value="${esc(rc.consumer)}" placeholder="Leave blank — never shown to the customer" data-change="rc-consumer" data-code="${esc(rc.code)}"
            aria-label="Consumer message for reason code ${esc(rc.code)} — optional" />
        </label>
        <div class="rc-usage">${usage}</div>
      </div>
      <button class="version-action rc-toggle" data-action="rc-toggle" data-code="${esc(rc.code)}"
        aria-label="${rc.active ? 'Deactivate' : 'Reactivate'} reason code ${esc(rc.code)} — ${esc(rc.label)}">${rc.active ? 'Deactivate' : 'Reactivate'}</button>
    </div>`;
  };

  const ruleCodes = state.reasonCodes.filter(c => c.kind === 'rule');
  const factorCodes = state.reasonCodes.filter(c => c.kind === 'factor');

  const factorRows = state.modelFactors.map(f => `
    <div class="field-row">
      <div style="flex:1;min-width:0;">
        <div class="field-label">${esc(labelOf(f.param))}</div>
        <div class="field-hint">Model factor · ${esc(f.weight)} contribution</div>
      </div>
      <select class="fb-op" style="min-width:230px;" data-change="factor-code" data-param="${esc(f.param)}"
        aria-label="Reason code emitted for the model factor ${esc(labelOf(f.param))}">
        ${factorCodes.map(c => `<option value="${esc(c.code)}"${c.code === f.code ? ' selected' : ''}>${esc(c.code)} · ${esc(c.label)}</option>`).join('')}
      </select>
    </div>`).join('');

  return `
  ${globalCrumbs()}
  <h1 class="page-title">Reason-code catalogue</h1>
  <p class="page-desc" style="max-width:820px;">Reasons are generated automatically from the rules and model factors that decide each application. Here you only manage the code and its wording.</p>
  <p class="page-desc" style="margin-bottom:18px;max-width:820px;">The full detailed set is for the administrator or agent; the consumer message is optional and used only if a reason is ever shown to the customer.</p>
  ${globalBadge()}

  <div class="blast-note" style="margin:0 0 16px 0;max-width:1000px;background:#F8FAFC;border-color:#E4E7EC;color:#344054;">
    This catalogue holds wording only — it does not decide anything. A code is attached to a rule in that profile's <span class="nav-link" data-tab="rules">Rules</span> tab, or to a model factor below, and the engine emits it when that rule or factor determines the outcome.
  </div>

  <div class="card list-card" style="max-width:1000px;margin-bottom:16px;">
    <div class="list-card-head" style="display:flex;align-items:center;gap:10px;">
      <h2 style="font-size:inherit;font-weight:inherit;">Rule codes</h2>
      <span style="margin-left:auto;font-size:12px;font-weight:500;color:#667085;">${ruleCodes.filter(c => c.active).length} active of ${ruleCodes.length}</span>
      <button class="btn btn-outline btn-sm" data-action="rc-add">+ Add code</button>
    </div>
    ${ruleCodes.map(codeRow).join('')}
  </div>

  <div class="card list-card" style="max-width:1000px;margin-bottom:16px;">
    <h2 class="list-card-head">Model-factor codes</h2>
    ${factorCodes.map(codeRow).join('')}
  </div>

  <div class="card panel" style="max-width:1000px;">
    <h2 class="panel-title">Model factor mapping</h2>
    <div class="panel-sub" style="margin-bottom:8px;">Each factor the model uses maps to a code, the same way a rule does. On an approve the engine emits the top contributing factors from this mapping. Managed here in Global setup, not in any profile.</div>
    ${factorRows}
  </div>`;
}

function renderUsers() {
  const roleChip = (role) => {
    const colors = role === 'Maker' ? ['#EAF0F7', '#144989', '#D3E0EE']
      : role === 'Checker' ? ['#ECFDF3', '#067647', '#ABEFC6']
      : ['#F2F4F7', '#667085', '#E4E7EC'];
    return `<span class="chip" style="background:${colors[0]};color:${colors[1]};border:1px solid ${colors[2]};">${esc(role)}</span>`;
  };
  const userRows = USERS.map(u => `
    <div class="version-row" style="align-items:center;">
      <div class="user-avatar user-avatar-dark">${esc(u.initials)}</div>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="version-name">${esc(u.name)}</span>
          ${roleChip(u.role)}
        </div>
        <div class="version-summary">${esc(u.team)} — ${esc(u.detail)}</div>
      </div>
    </div>`).join('');

  const auditRows = AUDIT.map(a => `
    <div class="audit-row">
      <div class="audit-what"><strong style="font-weight:700;">${esc(a.who)}</strong> ${esc(a.what)}</div>
      <div class="audit-when">${esc(a.when)}</div>
    </div>`).join('');

  return `
  ${globalCrumbs()}
  <h1 class="page-title">Users &amp; audit</h1>
  <p class="page-desc" style="margin-bottom:20px;">Maker–checker roles apply across every product. The audit log records every change in every profile and in global setup.</p>
  ${globalBadge()}

  <div class="versions-grid">
    <div class="card list-card">
      <h2 class="list-card-head">Users &amp; roles</h2>
      ${userRows}
    </div>
    <div class="card list-card">
      <h2 class="list-card-head">Audit log — all products</h2>
      ${auditRows}
    </div>
  </div>`;
}

/* ---------- Publish modal ---------- */

function renderCreateModal() {
  const dup = state.createMode === 'duplicate';
  const first = state.profiles.findIndex(p => p.config.rules.length > 0);
  const baseOptions = state.profiles
    .filter(p => p.config.rules.length > 0)
    .map(p => {
      const i = state.profiles.indexOf(p);
      const sel = dup && i === first ? ' selected' : '';
      return `<option value="${i}"${sel}>Copy rules from ${esc(p.name)} ${esc(p.version)}</option>`;
    })
    .join('');
  return `
  <div class="modal-overlay" data-action="close-create-overlay">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <div class="modal-head">
        <h2 class="modal-title" id="modalTitle">${dup ? 'Duplicate a product profile' : 'New product profile'}</h2>
        <div class="modal-sub">${dup
          ? 'Copies the rules, bands and limits of an existing profile into a new draft. The original is untouched; the copy starts at v0.1.'
          : 'Rules, bands and limits are created per product. The scoring model, parameters and lists come from Global setup automatically.'}</div>
      </div>
      <div class="modal-body">
        <label>Product name
          <input id="npName" placeholder="e.g. Solar PayGo Loan" aria-label="Product name" />
        </label>
        <label>Market
          <select id="npMarket" aria-label="Market">${MARKETS.map(m => `<option>${esc(m)}</option>`).join('')}</select>
        </label>
        <label>Description
          <input id="npBlurb" placeholder="One line shown on the profiles list" aria-label="One-line description shown on the profiles list" />
        </label>
        <label>Start from
          <select id="npBase" aria-label="Profile to start from">
            <option value=""${dup ? '' : ' selected'}>Blank profile — no rules yet</option>
            ${baseOptions}
          </select>
        </label>
        <div id="npError" style="display:none;font-size:12.5px;color:#B42318;">Give the profile a name before ${dup ? 'duplicating' : 'creating'} it.</div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-outline" data-action="close-create">Cancel</button>
        <button class="btn btn-primary btn-wide" data-action="create-profile">${dup ? 'Duplicate profile' : 'Create profile'}</button>
      </div>
    </div>
  </div>`;
}

/* ---------- Dialog focus management ---------- */

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Remember what opened the dialog so focus can go back there on close.
function openDialog(set) {
  state.dialogReturn = document.activeElement;
  set();
  renderModal();
  const modal = $modal.querySelector('.modal');
  if (modal) (modal.querySelector(FOCUSABLE) || modal).focus({ preventScroll: true });
}

function closeDialog(set) {
  set();
  renderModal();
  const back = state.dialogReturn;
  state.dialogReturn = null;
  if (back && document.contains(back)) back.focus({ preventScroll: true });
}

function dialogOpen() {
  return state.publishOpen || state.createOpen;
}

// Escape closes; Tab cycles within the dialog rather than escaping behind it.
document.addEventListener('keydown', (e) => {
  if (!dialogOpen()) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    closeDialog(() => { state.publishOpen = false; state.createOpen = false; });
    return;
  }
  if (e.key !== 'Tab') return;
  const modal = $modal.querySelector('.modal');
  if (!modal) return;
  const items = [...modal.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  else if (!modal.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
});

function renderModal() {
  if (state.createOpen) { $modal.innerHTML = renderCreateModal(); return; }
  if (!state.publishOpen) { $modal.innerHTML = ''; return; }
  const p = activeProfile();
  $modal.innerHTML = `
  <div class="modal-overlay" data-action="close-publish-overlay">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <div class="modal-head">
        <h2 class="modal-title" id="modalTitle">Send ${esc(p.name)} ${esc(p.version === '—' ? 'v0.1' : p.version)} for approval</h2>
        <div class="modal-sub">Maker–checker: a second approver must sign off before this goes live.</div>
      </div>
      <div class="modal-body">
        <div class="modal-summary">${esc(deltaSummary())}</div>
        <label>Approver
          <select aria-label="Approver — the checker who must sign this off">
            <option>R. Chikanda — Head of Credit</option>
            <option>N. Dube — Risk Governance</option>
          </select>
        </label>
        <label>Effective date
          <input value="15 Aug 2026, 06:00 CAT" aria-label="Effective date and time" />
        </label>
        <label>Change note
          <textarea aria-label="Change note for the checker" placeholder="Explain to the checker why this change is being made.">${esc(deltaSummary())}</textarea>
        </label>
      </div>
      <div class="modal-foot">
        <button class="btn btn-outline" data-action="close-publish">Cancel</button>
        <button class="btn btn-primary btn-wide" data-action="close-publish">Send for approval</button>
      </div>
    </div>
  </div>`;
}

/* ---------- Render ---------- */

const SCREENS = {
  profiles: renderProfiles,
  profile: renderProfileWorkspace,
  model: renderModel,
  modelhealth: renderModelHealth,
  params: renderParams,
  fraud: renderFraud,
  reasoncodes: renderReasonCodes,
  users: renderUsers,
};

function openProfile(idx, mode, tab) {
  const wasScreen = state.screen;
  state.screen = 'profile';
  if (idx != null && idx !== state.profileIdx) {
    state.profileIdx = idx;
    state.fbPreview = null; // sample customer belongs to one profile's scorecard
    state.simRun = null;
  }
  if (state.profileIdx == null) state.profileIdx = 0;
  if (mode) state.mode = mode;
  if (tab) state.profileTab = tab;
  state.confirmRemove = null;
  // The read-only banner is shown once per profile; the header pill and the
  // dimmed controls carry the message after that.
  if (wasScreen !== 'profile') {
    state.showBanner = !state.bannerSeen[state.profileIdx];
    state.bannerSeen[state.profileIdx] = true;
  }
  render();
}

// "Now on step 3 of 7, Fallback scorecard" — spoken, not just shown.
function announceStep(key) {
  const steps = setupSteps();
  const s = steps.find(x => x.key === key);
  const tab = PROFILE_TABS.find(([k]) => k === key);
  if (s) announce(`Now on step ${s.num} of ${steps.length}, ${s.label}. ${s.note}`);
  else if (tab) announce(`Now on ${tab[1]}`);
}

function goToTab(key) {
  state.profileTab = key;
  state.confirmRemove = null;
  state.setupNag = false;
  render();
  announceStep(key);
}

// render() replaces innerHTML wholesale, which would drop focus to <body> after
// every edit and eject a keyboard user to the top of the document. Identify the
// focused control by its data-* signature, then restore it afterwards.
const FOCUS_KEYS = ['change', 'action', 'input', 'nav', 'tab', 'step', 'section',
  'rule', 'entry', 'key', 'code', 'param', 'list', 'field', 'col', 'row', 'val', 'idx', 'handle'];

function focusSignature(el) {
  if (!el || el === document.body || !$view.contains(el)) return null;
  const parts = FOCUS_KEYS
    .filter(k => el.dataset[k] !== undefined)
    .map(k => `[data-${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}="${CSS.escape(el.dataset[k])}"]`);
  if (!parts.length) return null;
  return {
    selector: el.tagName.toLowerCase() + parts.join(''),
    start: el.selectionStart ?? null,
    end: el.selectionEnd ?? null,
  };
}

function restoreFocus(sig) {
  if (!sig) return;
  const el = $view.querySelector(sig.selector);
  if (!el) return;
  el.focus({ preventScroll: true });
  // Text-like inputs only: putting the caret back where it was.
  if (sig.start != null && typeof el.setSelectionRange === 'function') {
    try { el.setSelectionRange(sig.start, sig.end); } catch (_) { /* number inputs refuse */ }
  }
}

function render() {
  const sig = focusSignature(document.activeElement);
  renderNav();
  renderHeader();
  $view.innerHTML = SCREENS[state.screen]();
  renderModal();
  restoreFocus(sig);
}

/* ---------- Events ---------- */

document.addEventListener('click', (e) => {
  // Delegation reads e.target.closest; a non-Element target (a synthetic event
  // dispatched on document) would otherwise throw.
  if (!(e.target instanceof Element)) return;
  const navBtn = e.target.closest('[data-nav]');
  if (navBtn) {
    const key = navBtn.dataset.nav;
    if (PROFILE_TAB_KEYS.includes(key)) {
      // Links like "review each profile's score bands" target a profile-scoped tab.
      openProfile(null, null, key);
    } else {
      state.screen = key;
      render();
    }
    return;
  }

  const tabBtn = e.target.closest('[data-tab]');
  if (tabBtn) {
    // From a global screen this doubles as a link into the profile workspace.
    if (state.screen === 'profile') {
      goToTab(tabBtn.dataset.tab);
    } else {
      openProfile(null, null, tabBtn.dataset.tab);
    }
    return;
  }

  const el = e.target.closest('[data-action]');
  // A click anywhere else abandons a pending rule deletion.
  if (state.confirmRemove && (!el || el.dataset.action !== 'remove-rule-confirm')) {
    state.confirmRemove = null;
    if (!el) render();
  }
  if (!el) return;
  const action = el.dataset.action;

  switch (action) {
    case 'noop':
      break;
    case 'go-simulate':
      openProfile(null, null, 'simulate'); break;
    case 'open-publish':
      openDialog(() => { state.publishOpen = true; }); break;
    case 'close-publish':
      closeDialog(() => { state.publishOpen = false; }); break;
    case 'close-publish-overlay':
      if (e.target === el) closeDialog(() => { state.publishOpen = false; });
      break;
    case 'open-profile':
      openProfile(Number(el.dataset.idx), 'view', PROFILE_TABS[0][0]); break;
    case 'edit-profile':
      openProfile(Number(el.dataset.idx), 'edit', PROFILE_TABS[0][0]); break;
    case 'enter-edit':
      state.mode = 'edit'; render(); break;
    case 'toggle-section': {
      const key = el.dataset.section;
      cfg().open[key] = !cfg().open[key];
      render(); break;
    }
    case 'expand-all': {
      const all = Object.values(cfg().open).every(Boolean);
      SECTIONS.forEach(([k]) => { cfg().open[k] = !all; });
      render(); break;
    }
    case 'toggle-rule': {
      const r = cfg().rules.find(r => r.id === el.dataset.rule);
      if (r) { r.enabled = !r.enabled; markDirty(); render(); }
      break;
    }
    // Two-step delete: the × arms it, a second click confirms.
    case 'remove-rule': {
      const r = cfg().rules.find(x => x.id === el.dataset.rule);
      state.confirmRemove = el.dataset.rule;
      render();
      if (r) announce(`Remove rule ${r.code}? Activate the confirm button to delete it, or click elsewhere to keep it.`);
      break;
    }
    case 'remove-rule-confirm': {
      const r = cfg().rules.find(x => x.id === el.dataset.rule);
      cfg().rules = cfg().rules.filter(x => x.id !== el.dataset.rule);
      state.confirmRemove = null;
      markDirty(); render();
      if (r) announce(`Rule ${r.code} removed.`);
      break;
    }
    case 'add-rule': {
      // Seed the new rule with a parameter and action that are valid here.
      const sec = el.dataset.section;
      const d = paramsForSection(sec)[0];
      const ops = TYPE_OPERATORS[d ? d.type : ''] || ['gte'];
      const value = d && d.type === 'category' ? (d.values || [''])[0] : joinValue('', '0', d && d.unit ? d.unit : '');
      cfg().rules.push({
        id: 'n' + Date.now(), section: sec,
        param: d ? d.key : '', op: ops[0], value,
        action: (SECTION_ACTIONS[sec] || ['pass'])[0],
        enabled: true, code: 'NEW', rc: '',
      });
      markDirty(); render(); break;
    }
    case 'fb-toggle': {
      const en = cfg().fallback.entries.find(x => x.id === el.dataset.entry);
      if (en) { en.enabled = !en.enabled; markDirty(); render(); }
      break;
    }
    case 'fb-remove':
      cfg().fallback.entries = cfg().fallback.entries.filter(x => x.id !== el.dataset.entry);
      markDirty(); render(); break;
    case 'fb-add':
      cfg().fallback.entries.push({ id: 'fn' + Date.now(), param: 'tenure', op: 'gte', value: '6 months', points: 50, note: '', enabled: true });
      markDirty(); render(); break;
    case 'di-sample':
      state.diSample = Number(el.dataset.idx); render(); break;
    case 'setup-step': {
      const step = el.dataset.step;
      if (step === 'publish') {
        const blockers = publishBlockers();
        if (blockers.length) {
          state.setupNag = true; render();
          announce(`Not ready to publish. Finish ${blockers.join(', ')} first.`);
        } else {
          openDialog(() => { state.publishOpen = true; });
          announce('Publish dialog opened — send this draft to a checker for approval.');
        }
      } else {
        goToTab(step);
      }
      break;
    }
    case 'publish-blocked': {
      state.setupNag = true; render();
      const blockers = publishBlockers();
      announce(`Not ready to publish. Finish ${blockers.join(', ')} first.`);
      break;
    }
    case 'val-chip': {
      const r = cfg().rules.find(x => x.id === el.dataset.rule);
      if (r) {
        const v = el.dataset.val;
        const chosen = catList(r.value);
        const next = chosen.includes(v) ? chosen.filter(x => x !== v) : [...chosen, v];
        r.value = next.join(', ');
        markDirty();
      }
      render(); break;
    }
    case 'param-section': {
      const d = paramDef(el.dataset.key);
      if (d) {
        const s = el.dataset.section;
        d.sections = (d.sections || []).includes(s)
          ? d.sections.filter(x => x !== s)
          : [...(d.sections || []), s];
      }
      render(); break;
    }
    case 'rc-toggle': {
      const c = rcByCode(el.dataset.code);
      if (c) c.active = !c.active;
      render(); break;
    }
    case 'rc-add': {
      const nums = state.reasonCodes
        .filter(c => c.kind === 'rule')
        .map(c => Number(c.code.split('-')[1]))
        .filter(n => !isNaN(n));
      const next = 'RC-' + String(Math.max(0, ...nums) + 1).padStart(3, '0');
      state.reasonCodes.push({ code: next, kind: 'rule', label: 'New reason code', consumer: '', active: true });
      render(); break;
    }
    case 'run-sim': {
      if (state.simRunning) break;
      const pop = SIM_POPULATIONS[state.simPopIdx] || SIM_POPULATIONS[0];
      state.simRunning = true;
      render();
      announce(`Running the simulation against ${pop.label}.`);
      setTimeout(() => {
        state.simRunning = false;
        state.simRun = { at: nowStamp(), population: pop.label };
        cfg().touched.simulate = true;
        const r = simResults();
        render();
        announce(`Simulation complete against ${pop.label}. Band approval rate ${r.draft.approvalRate} percent, average limit ${r.draft.avgLimit} dollars, projected bad rate ${r.draft.badRate} percent.`);
      }, 650);
      break;
    }
    case 'save-draft': {
      const p = activeProfile();
      p.editedAt = nowStamp();
      p.editedBy = 'T. Moyo';
      state.saved = true;
      state.savedAt = p.editedAt;
      render();
      announce('Draft saved'); break;
    }
    case 'open-create':
      openDialog(() => { state.createMode = 'new'; state.createOpen = true; }); break;
    case 'open-duplicate':
      openDialog(() => { state.createMode = 'duplicate'; state.createOpen = true; }); break;
    case 'close-create':
      closeDialog(() => { state.createOpen = false; }); break;
    case 'close-create-overlay':
      if (e.target === el) closeDialog(() => { state.createOpen = false; });
      break;
    case 'create-profile': {
      const name = (document.getElementById('npName').value || '').trim();
      if (!name) {
        document.getElementById('npError').style.display = 'block';
        break;
      }
      const market = document.getElementById('npMarket').value;
      const blurb = (document.getElementById('npBlurb').value || '').trim() || 'Not yet described';
      const baseVal = document.getElementById('npBase').value;
      const base = baseVal === '' ? null : state.profiles[Number(baseVal)];
      state.profiles.push({
        name, blurb, market,
        version: 'v0.1', status: 'Draft',
        editedAt: nowStamp(), editedBy: 'T. Moyo',
        third: '', initials: initials(name),
        versions: [],
        // A brand-new draft starts level with itself: zero delta until edited.
        liveBands: structuredClone(base ? base.config.bands : EMPTY_BANDS),
        liveRules: base ? structuredClone(base.config.rules) : [],
        liveLimits: structuredClone(base ? base.config.limits : LIMITS_EMPTY),
        config: base ? structuredClone(base.config) : {
          rules: [],
          bands: structuredClone(EMPTY_BANDS),
          open: { ...DEFAULT_OPEN },
          fallback: makeFallback('n' + Date.now(), true),
          limits: structuredClone(LIMITS_EMPTY),
          touched: { simulate: false },
        },
      });
      state.createOpen = false;
      const dup = state.createMode === 'duplicate';
      openProfile(state.profiles.length - 1, 'edit', PROFILE_TABS[0][0]);
      announce(dup
        ? `${name} duplicated from ${base ? base.name : 'a blank profile'} and opened for editing.`
        : `Profile ${name} created and opened for editing.`);
      break;
    }
    case 'duplicate-profile': {
      const src = state.profiles[Number(el.dataset.idx)];
      const copy = structuredClone(src);
      state.profiles.push({
        ...copy,
        // The copy is its own baseline — it has not diverged from anything yet.
        liveBands: structuredClone(copy.config.bands),
        liveRules: structuredClone(copy.config.rules),
        liveLimits: structuredClone(copy.config.limits),
        name: `${src.name} (copy)`,
        version: 'v0.1', status: 'Draft',
        editedAt: nowStamp(), editedBy: 'T. Moyo',
        third: '', initials: src.initials,
        versions: [],
      });
      state.screen = 'profiles';
      render();
      announce(`${src.name} duplicated as ${src.name} (copy).`);
      break;
    }
  }
});

document.addEventListener('change', (e) => {
  // Delegation reads e.target.closest; a non-Element target (a synthetic event
  // dispatched on document) would otherwise throw.
  if (!(e.target instanceof Element)) return;
  const el = e.target.closest('[data-change]');
  if (!el) return;
  const kind = el.dataset.change;

  switch (kind) {
    case 'rule-rc': setRule(el.dataset.rule, 'rc', el.value); break;
    case 'rule-param': {
      // Switching parameter switches type, so coerce the operator and value
      // to something valid rather than leaving a nonsensical combination.
      const r = cfg().rules.find(x => x.id === el.dataset.rule);
      if (r) {
        r.param = el.value;
        const d = paramDef(r.param);
        const ops = (TYPE_OPERATORS[d ? d.type : ''] || []);
        if (ops.length && !ops.includes(r.op)) r.op = ops[0];
        if (d && d.type === 'category') {
          if (!(d.values || []).includes(r.value)) r.value = (d.values || [''])[0];
        } else {
          const { num } = splitValue(r.value);
          r.value = joinValue('', num || '0', d && d.unit ? d.unit : '');
        }
        // The old upper bound carried the old parameter's unit — re-derive it.
        r.value2 = '';
        if (r.op === 'between') r.value2 = upperValue(r);
        markDirty();
      }
      render(); break;
    }
    case 'val-num': {
      const r = cfg().rules.find(x => x.id === el.dataset.rule);
      if (r) { r.value = joinValue(el.dataset.prefix || '', cleanNum(el, r.value), el.dataset.suffix || ''); markDirty(); }
      render(); break;
    }
    case 'val-num2': {
      const r = cfg().rules.find(x => x.id === el.dataset.rule);
      if (r) { r.value2 = joinValue(el.dataset.prefix || '', cleanNum(el, r.value2), el.dataset.suffix || ''); markDirty(); }
      render(); break;
    }
    case 'val-cat': setRule(el.dataset.rule, 'value', el.value); break;
    case 'sim-pop':
      state.simPopIdx = Number(el.value) || 0; render(); break;
    case 'lim-field': {
      const list = cfg().limits[el.dataset.list];
      const f = list && list.find(x => x.key === el.dataset.key);
      if (f) {
        f.value = (f.type === 'currency' || f.type === 'percent') ? cleanNum(el, f.value) : el.value;
        markDirty();
      }
      render(); break;
    }
    case 'lim-col':
      cfg().limits.matrixCols[Number(el.dataset.col)] = el.value;
      markDirty(); render(); break;
    case 'lim-cell': {
      const m = cfg().limits.matrix;
      const rI = Number(el.dataset.row);
      if (!m[rI]) m[rI] = [];
      m[rI][Number(el.dataset.col)] = el.value;
      markDirty(); render(); break;
    }
    case 'rule-op': {
      // `between` needs an upper bound, or the sentence it reads back is broken.
      const r = cfg().rules.find(x => x.id === el.dataset.rule);
      if (r) {
        r.op = el.value;
        if (r.op === 'between' && !r.value2) r.value2 = upperValue(r);
        markDirty();
      }
      render(); break;
    }
    case 'rule-value': setRule(el.dataset.rule, 'value', el.value); break;
    case 'rule-action': setRule(el.dataset.rule, 'action', el.value); break;
    case 'score-min':
      state.scoreMin = Number(el.value) || 0; render(); break;
    case 'score-max':
      state.scoreMax = Number(el.value) || 1000; render(); break;
    case 'param-label': {
      const def = state.paramDefs.find(d => d.key === el.dataset.key);
      if (def && el.value.trim()) def.label = el.value.trim();
      render(); break;
    }
    case 'fb-param': case 'fb-op': case 'fb-value': case 'fb-points': {
      const entry = cfg().fallback.entries.find(x => x.id === el.dataset.entry);
      if (entry) {
        const key = { 'fb-param': 'param', 'fb-op': 'op', 'fb-value': 'value', 'fb-points': 'points' }[kind];
        entry[key] = key === 'points' ? (Number(el.value) || 0) : el.value;
        markDirty();
      }
      render(); break;
    }
    case 'fb-tier':
      cfg().fallback.tiers[el.dataset.field] = Number(el.value) || 0;
      markDirty(); render(); break;
    case 'fb-check':
      fbPreviewState().checks[el.dataset.entry] = el.checked;
      render(); break;
    case 'fb-income':
      fbPreviewState().income = el.value.trim();
      render(); break;
    case 'rc-label': case 'rc-consumer': {
      const c = rcByCode(el.dataset.code);
      if (c) c[kind === 'rc-label' ? 'label' : 'consumer'] = el.value.trim();
      render(); break;
    }
    case 'factor-code': {
      const f = state.modelFactors.find(x => x.param === el.dataset.param);
      if (f) f.code = el.value;
      render(); break;
    }
  }
});

/* ---------- Keyboard ---------- */

document.addEventListener('keydown', (e) => {
  if (!(e.target instanceof Element)) return;
  // Tablist: left/right (and Home/End) move between tabs, per the ARIA pattern.
  const tab = e.target.closest('[role="tab"]');
  if (tab) {
    const tabs = [...document.querySelectorAll('.tabbar [role="tab"]')];
    const i = tabs.indexOf(tab);
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next !== -1) {
      e.preventDefault();
      const key = tabs[next].dataset.tab;
      goToTab(key);
      const moved = document.getElementById(`tab-${key}`);
      if (moved) moved.focus();
      return;
    }
  }

  // Section heads and breadcrumb links behave like the buttons they look like.
  const pressable = e.target.closest('[role="button"], [role="link"]');
  if (pressable && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    pressable.click();
    return;
  }

  // Band floors are draggable; arrows move them for anyone not using a pointer.
  const handle = e.target.closest('[data-handle]');
  if (handle && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
    e.preventDefault();
    const i = Number(handle.dataset.handle);
    const bands = cfg().bands;
    const lo = bands[i - 1].floor + 20;
    const hi = (i + 1 < bands.length ? bands[i + 1].floor : state.scoreMax) - 20;
    const step = e.shiftKey ? 25 : 5;
    let v = bands[i].floor;
    if (e.key === 'ArrowLeft') v -= step;
    else if (e.key === 'ArrowRight') v += step;
    else if (e.key === 'Home') v = lo;
    else v = hi;
    bands[i].floor = Math.max(lo, Math.min(hi, v));
    markDirty();
    render();
    const again = document.querySelector(`[data-handle="${i}"]`);
    if (again) again.focus();
    announce(`${bands[i].label} floor ${bands[i].floor}`);
  }
});

/* ---------- Band handle dragging ---------- */

document.addEventListener('pointerdown', (e) => {
  // Delegation reads e.target.closest; a non-Element target (a synthetic event
  // dispatched on document) would otherwise throw.
  if (!(e.target instanceof Element)) return;
  const handle = e.target.closest('[data-handle]');
  if (!handle) return;
  e.preventDefault();
  state.dragging = Number(handle.dataset.handle);
  render();
});

window.addEventListener('pointermove', (e) => {
  if (state.dragging == null) return;
  const ruler = document.getElementById('ruler');
  if (!ruler) return;
  const rect = ruler.getBoundingClientRect();
  const { scoreMin, scoreMax } = state;
  const bands = cfg().bands;
  const raw = scoreMin + ((e.clientX - rect.left) / rect.width) * (scoreMax - scoreMin);
  const i = state.dragging;
  const lo = bands[i - 1].floor + 20;
  const hi = (i + 1 < bands.length ? bands[i + 1].floor : scoreMax) - 20;
  bands[i].floor = Math.round(Math.max(lo, Math.min(hi, raw)) / 5) * 5;
  markDirty();
  render();
});

window.addEventListener('pointerup', () => {
  if (state.dragging != null) {
    state.dragging = null;
    render();
  }
});

render();
