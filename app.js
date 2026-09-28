// Sasai Credit, Rule Engine Console: application logic

function initials(name) {
  return name.split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
}

function makeColdStart(prefix, seed) {
  const cs = structuredClone(seed || COLDSTART_BLANK);
  cs.gates = (cs.gates || []).map((g, j) => ({
    id: `${prefix}cg${j}`, param: g[0], op: g[1], value: g[2], locked: !!g[3], note: g[4] || '',
  }));
  return cs;
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
      coldStart: makeColdStart(`p${idx}`, seed.coldStart),
      layers: structuredClone(seed.layers || LAYER_SEEDS.blank),
      limits: structuredClone(seed.limits),
      touched: { simulate: false, assess: false, ...(seed.touched || {}) },
    },
  };
}

const state = {
  screen: 'profiles',        // 'profiles' | global keys | 'profile' (the workspace)
  profileIdx: null,          // which profile the workspace shows
  profileTab: PROFILE_TABS[0][0],  // active tab inside the workspace, step 1
  mode: 'view',              // 'view' (read-only) | 'edit'
  profiles: PROFILE_SEEDS.map(makeProfile),
  scoreMin: 0,
  scoreMax: 100,   // the engine scores 0 to 100, see Technical Solutioning v2.1 §6.5
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
  applicant: null,           // the customer being assessed, shared across profiles
  presetIdx: 0,              // which preset the applicant was last loaded from
  assessOpen: { l0: true },  // which layers of the trace are expanded
  layerShowAll: {},          // per layer: show every setting, not just essentials
  pathOpen: { scored: false, thin: false, insufficient: false },
  rowOpen: {},               // condition rows whose details are expanded
  showOpenOnly: false,       // filter to parameters still needing a value
  overlapTag: null,          // which overlap group is expanded
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
// disagree, and a floor drag moves all three together.
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
  while (lim.matrix.length < need) lim.matrix.push(new Array(cols).fill('n/a'));
  if (lim.matrix.length > need) lim.matrix.length = need;
  lim.matrix.forEach(row => {
    while (row.length < cols) row.push('n/a');
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
// text is unreadable on the light end, 2.1:1 on the teal. Pick the ink from the
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
// dark ink at full strength, so it gets no alpha at all. The size and weight
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
// A blank or unparseable numeric entry must not be written through, since it would
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
  return c ? `${c.code} · ${c.label}` : (code || 'n/a');
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
      title="${esc(label)}" aria-label="Global setup: ${esc(label)}"
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
    <div class="nav-helper">Do this once before your first product. Shared by every product: change once, applies everywhere.</div>
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
           title="Step ${stepCount} of ${stepCount} · Publish: finish ${esc(blockers.join(', '))} first"
           aria-label="Step ${stepCount} of ${stepCount}: Publish: ${esc(pub.note)}. Finish ${esc(blockers.join(', '))} first.">Publish…</button>`
      : `<button class="btn btn-primary" data-action="open-publish"
           title="Step ${stepCount} of ${stepCount} · Publish: ${esc(pub.note)}"
           aria-label="Step ${stepCount} of ${stepCount}: Publish: ${esc(pub.note)}">Publish…</button>`;
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

// Progress for any profile, not just the open one, since the list needs all of them.
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
        ${p.third ? `<button class="btn btn-outline btn-sm" data-action="${p.third === 'View' ? 'open-profile' : (p.third === 'Copy rules' ? 'open-duplicate' : 'noop')}" data-idx="${i}" aria-label="${esc(p.third)}: ${esc(p.name)}">${esc(p.third)}</button>` : ''}
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
            aria-pressed="${chosen.includes(v) ? 'true' : 'false'}" aria-label="${esc(v)}: ${chosen.includes(v) ? 'selected' : 'not selected'} for ${esc(ctx)}">${esc(v)}</button>`).join('')}
        ${chosen.filter(v => !values.includes(v)).map(v => `
          <button type="button" class="val-chip on val-chip-unknown" data-action="val-chip" data-rule="${r.id}" data-val="${esc(v)}" title="Not an allowed value for this parameter"
            aria-pressed="true" aria-label="${esc(v)}: selected for ${esc(ctx)}, not an allowed value">${esc(v)} ⚠</button>`).join('')}
      </span>`;
    }
    const known = values.includes(r.value);
    return `
    <select class="rule-value val-select${known ? '' : ' field-invalid'}" data-change="val-cat" data-rule="${r.id}"
      aria-label="Value for ${esc(ctx)}">
      ${values.map(v => `<option value="${esc(v)}"${v === r.value ? ' selected' : ''}>${esc(v)}</option>`).join('')}
      ${known ? '' : `<option value="${esc(r.value)}" selected>${esc(r.value)} (not an allowed value)</option>`}
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
      <div style="font-size:13px;color:#344054;font-variant-numeric:tabular-nums;">${stats[i].badRate == null ? 'n/a' : stats[i].badRate + '%'}</div>
      <div style="display:flex;align-items:center;gap:8px;">
        <div class="pop-track"><div class="pop-fill" style="width:${stats[i].pop * 2.6}%;background:${BAND_COLORS[i]};"></div></div>
        <span style="font-size:12px;color:#667085;font-variant-numeric:tabular-nums;width:38px;text-align:right;">${stats[i].pop}%</span>
      </div>
    </div>`).join('');

  return `
  <h1 class="page-title">Score bands</h1>
  <p class="page-desc" style="max-width:760px;">The model gives every customer a score out of 1000. On its own that number means nothing. A band is what turns it into a decision. Split the range into bands, and say what each band gets.</p>
  <ol class="howto" style="max-width:760px;margin-bottom:18px;">
    <li><strong>Drag a marker</strong> to move where one band ends and the next begins. Everyone whose score falls between two markers is treated the same way.</li>
    <li><strong>Each band gets a decision</strong>: decline, approve, or approve with a cap, plus a starting limit before affordability is taken into account.</li>
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
      aria-label="Affordability band ${j + 1} of ${lim.matrixCols.length}: column heading" /></th>`).join('');

  const rows = bandRows.map((b, i) => {
    const cells = lim.matrixCols.map((_, j) => {
      const t = (lim.matrix[i] && lim.matrix[i][j]) ?? 'n/a';
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
    const name = `${f.label}: ${f.hint}`;
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
        <li><strong>Down the side</strong>: the customer's score band. Better score, bigger offer.</li>
        <li><strong>Across the top</strong>: the repayment as a share of their monthly income. The further right, the more of their income it takes, so the offer shrinks.</li>
        <li><strong>In each cell</strong>: the amount in US dollars. Type <code>Decline</code> instead of an amount to refuse that combination outright.</li>
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
    return 'No changes against the published baseline yet. Rules, score-band floors and the launch cap all match the live version, so no customer sees a different decision.';
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
    title: fbOn ? `Fallback scorecard active with ${fbOn} signals` : 'Fallback scorecard not configured',
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
      : `<div class="sim-runline">Not run yet. The figures below are already derived from this draft's score bands; running stamps them against a named population.</div>`;

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
  <div class="sim-derived" style="margin-bottom:16px;">Derived from this draft's score bands read against the last measured population and default rates, over ${esc(r.pop.label)}. These are the same figures the <span class="nav-link" data-tab="bands">Score bands</span> table shows. Band approval rate is the share of scored customers whose band decision is not Decline; eligibility gates and rule-level declines sit in front of it and are not modelled here. Book assumes ${Math.round(SIM_TAKE_UP * 100)}% take-up of accepted offers${r.launchMax > 0 ? `, capped at the ${money(r.launchMax)} launch maximum set in <span class="nav-link" data-tab="limits">Limits &amp; affordability</span>` : ''}. Demand before the cap is ${money(r.demand)}.</div>

  <div class="sim-grid">
    <div class="card panel">
      <h2 class="panel-title">Band distribution: draft vs. last measured</h2>
      <div class="sim-chart">${bars}</div>
      <div class="sim-legend">
        <span><span class="legend-swatch" style="background:#C7D3E2;"></span>Last measured layout</span>
        <span><span class="legend-swatch" style="background:#144989;"></span>This draft</span>
      </div>

      <div style="margin-top:20px;border-top:1px solid #F2F4F7;padding-top:14px;">
        <h3 style="font-size:13px;font-weight:700;color:#101828;">Bad rate by band: draft vs. last measured</h3>
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
`;
}


/* ---------- Single-customer assessment: the engine ---------- */

// One applicant run down L0 to L6, in the order the engine evaluates. The two
// invariants shown on the waterfall govern the trace: any layer can stop it,
// and the limit only ever goes down. Every threshold is read from this
// profile's own configuration, so editing a setting changes this immediately.

function applicantState() {
  if (!state.applicant) {
    state.applicant = { ...APPLICANT_BASE, ...APPLICANT_PRESETS[0].values };
  }
  return state.applicant;
}

// Applicant value as a number, or null when the field is blank. Blank means
// "not known about this customer", which is never silently read as zero.
function aNum(key) {
  const v = applicantState()[key];
  if (v === '' || v == null || v === false) return v === false ? 0 : null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
// Setting value as a number, or null when the credit team has not set it yet.
function sNum(layerKey, key) {
  if (settingEntry(layerKey, key).enabled === false) return null;  // never evaluated
  const n = settingScalar(layerKey, key);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}
// The whole value object, for a rule with more than one field.
function sVal(layerKey, key) {
  return settingEntry(layerKey, key).enabled === false ? {} : settingValue(layerKey, key);
}

const DAY_IN = { day: 1, days: 1, week: 7, weeks: 7, month: 30, months: 30, year: 365, years: 365 };
function unitDays(u) { return DAY_IN[String(u || '').trim().toLowerCase().split(/\s+/)[0]] || null; }

// Durations are written in whichever unit reads naturally where they are set:
// a wallet age in days, an age in years, a cold-start gate in weeks. Both sides
// of a comparison are converted to days once, here, rather than per rule.
function durationDays(n, unit) {
  const k = unitDays(unit);
  return k == null || n == null ? null : n * k;
}

const MONEY_FMT = n => (Math.abs(n) >= 1000 ? '$' + n.toLocaleString('en-US') : '$' + n);

function fmtAmount(n, type, unit) {
  if (n == null) return 'not known';
  if (type === 'currency') return MONEY_FMT(Math.round(n * 100) / 100);
  if (type === 'percent') return n + '%';
  if (type === 'days') return plural(n, 'day');
  return unit ? `${n} ${unit}` : String(n);
}

// A check that cannot be run is reported as such. An unset threshold is a gap
// in the configuration and a missing value is a gap in the data; neither is a
// failure, and neither is quietly treated as a pass.
function check(o) {
  const { label, actual, threshold, dir, type, unit, effect, rc, why, blankMeans } = o;
  const base = { label, why, effect: null, rc: null };
  if (actual == null && blankMeans) {
    return { ...base, state: 'ok', detail: blankMeans };
  }
  if (threshold == null) {
    return { ...base, state: 'unset', detail: 'No threshold set yet, so this is not checked.' };
  }
  if (actual == null) {
    return { ...base, state: 'unknown',
      detail: cfg().coldStart.unknownIsNotFail
        ? 'Not known for this customer. Unknown does not count as a failure.'
        : 'Not known for this customer, and unknown counts as a failure here.',
      ...(cfg().coldStart.unknownIsNotFail ? {} : { effect, rc }) };
  }
  const ok = dir === 'min' ? actual >= threshold : actual <= threshold;
  return {
    ...base, state: ok ? 'ok' : 'fail',
    detail: `${fmtAmount(actual, type, unit)} against ${dir === 'min' ? 'a minimum of' : 'a maximum of'} ${fmtAmount(threshold, type, unit)}`,
    effect: ok ? null : effect, rc: ok ? null : rc,
  };
}

/* ---------- Generic condition evaluation ---------- */

// The applicant field that answers a shared parameter, with the unit it is
// carried in. Rules and cold-start gates are both written against parameters,
// so they share one evaluator rather than each parsing values themselves.
const PARAM_SOURCE = {
  age: () => ({ v: aNum('age'), unit: 'years' }),
  tenure: () => ({ v: aNum('walletAgeDays'), unit: 'days' }),
  kyc: () => ({ v: applicantState().kyc }),
  account: () => ({ v: applicantState().account }),
  blocklist: () => ({ v: applicantState().blocklist }),
  sim: () => ({ v: aNum('simAgeDays'), unit: 'days' }),
  txnMonths: () => ({ v: aNum('txnMonths'), unit: 'months' }),
  arrears: () => ({ v: aNum('arrearsDays90'), unit: 'days' }),
  inflow: () => ({ v: aNum('inflow') }),
  consistency: () => ({ v: aNum('consistency') }),
  volatility: () => ({ v: aNum('volatility') }),
  score: () => ({ v: aNum('score') }),
  onTime: () => ({ v: aNum('onTimeInstalments') }),
  cluster: () => ({ v: aNum('walletsOnDevice') }),
  income: () => ({ v: aNum('income') }),
  dailyApprovals: () => ({ v: aNum('approvalsToday') }),
  dailyDisbursed: () => ({ v: aNum('disbursedToday') }),
  balance: () => ({ v: aNum('inflow') }),
};

// Exposure is written three ways in the draft: on this product, in open loans
// of this kind, and across every product. The rule's own wording says which.
function exposureFor(value) {
  const t = String(value || '').toLowerCase();
  return /across products|total/.test(t)
    ? { v: aNum('totalExposure'), what: 'across all products' }
    : { v: aNum('productExposure'), what: 'on this product' };
}

// A condition the simulator cannot answer from an applicant is reported as not
// evaluated, with what it would need. Guessing would be worse than saying so.
const PARAM_UNAVAILABLE = {
  afford: 'the instalment, which L4 works out further down',
  pd: 'a probability of default from the model',
  confidence: 'model coverage, checked as a setting at L0 instead',
  popAffected: 'the blast radius of the draft, which is a portfolio figure',
  pilotCell: 'the cell this application came from',
  pilotExposure: 'total pilot exposure, which is a portfolio figure',
  device: 'the device type on file',
  avgBalance: 'a 90-day average balance',
  outflow: 'average monthly outflow',
  activeDays: 'the active-days ratio, checked as a setting at L0 instead',
  recharge: 'recharge regularity',
};

// Evaluates one condition (a rule or a cold-start gate) against the applicant.
// Returns null when the condition cannot be answered, so callers can say so.
function evalCondition(param, op, value) {
  const def = paramDef(param);
  if (!def) return { runnable: false, reason: 'this parameter is no longer defined in Global setup' };
  if (PARAM_UNAVAILABLE[param]) return { runnable: false, reason: PARAM_UNAVAILABLE[param] };

  if (param === 'exposure') {
    const { v, what } = exposureFor(value);
    const thr = parseFloat(String(splitValue(value).num).replace(/,/g, ''));
    if (v == null || !Number.isFinite(thr)) return { runnable: false, reason: 'an open balance for this customer' };
    return { runnable: true, ok: op === 'lte' ? v <= thr : op === 'eq' ? v === thr : v >= thr,
      actual: MONEY_FMT(v) + ' ' + what, threshold: MONEY_FMT(thr) };
  }

  const src = PARAM_SOURCE[param];
  if (!src) return { runnable: false, reason: `a value for ${labelOf(param).toLowerCase()}` };
  const got = src();
  if (got.v == null || got.v === '') return { runnable: false, reason: `a value for ${labelOf(param).toLowerCase()}` };

  if (def.type === 'category') {
    const list = catList(value).map(s => s.toLowerCase());
    const cur = String(got.v).toLowerCase();
    const inList = list.some(x => cur === x || cur.startsWith(x));
    const met = op === 'notin' ? !inList : inList;
    return { runnable: true, ok: met, actual: String(got.v), threshold: catList(value).join(' or ') };
  }

  const parts = splitValue(value);
  const thr = parseFloat(String(parts.num).replace(/,/g, ''));
  if (!Number.isFinite(thr)) return { runnable: false, reason: 'a numeric threshold on this condition' };

  let a = got.v, t = thr, shown = parts.num + (parts.suffix ? ' ' + parts.suffix : '');
  if (def.type === 'duration') {
    // The value carries its own unit word; fall back to the parameter's.
    const valueUnit = unitDays(parts.suffix) ? parts.suffix : def.unit;
    a = durationDays(got.v, got.unit || def.unit);
    t = durationDays(thr, valueUnit);
    if (a == null || t == null) return { runnable: false, reason: 'a comparable unit of time' };
  }
  const meets = op === 'lte' ? a <= t : op === 'eq' ? a === t : a >= t;
  return { runnable: true, ok: meets, actual: fieldDisplay(param, got), threshold: shown };
}

function fieldDisplay(param, got) {
  const def = paramDef(param);
  if (!def) return String(got.v);
  if (def.type === 'currency') return MONEY_FMT(got.v);
  const u = got.unit || def.unit;
  return u ? `${got.v} ${u}` : String(got.v);
}

// A rule becomes a trace line. `pass` rules stop the application when the
// condition is NOT met; every other action fires when it IS met.
function ruleCheck(r) {
  const res = evalCondition(r.param, r.op, r.value);
  const label = sentence(r);
  if (!res.runnable) {
    return { label, state: 'unknown', code: r.code, detail: `Not evaluated here: needs ${res.reason}.` };
  }
  const fires = r.action === 'pass' ? !res.ok : res.ok;
  return {
    label, code: r.code,
    detail: `${res.actual} against ${res.threshold}`,
    state: fires ? (r.action === 'ladder' ? 'fired' : 'fail') : 'ok',
    effect: fires ? (r.action === 'pass' ? 'decline' : r.action) : null,
    rc: fires ? r.rc : null,
  };
}

// What an action does to the application. Caps do not stop it; they are applied
// when the limit is assembled at L5.
const ACTION_STOPS = { decline: 'decline', refer: 'refer', hold: 'hold', throttle: 'hold' };

/* ---------- Single-customer assessment: the walk ---------- */

// Runs the applicant down the waterfall. Returns one entry per layer plus the
// caps that assembled the limit, so the trace and the summary are the same
// computation read two ways.
function assess() {
  const c = cfg();
  const a = applicantState();
  const L = {};                       // layer key -> trace entry
  LAYER_KEYS.forEach(k => { L[k] = { key: k, checks: [], rules: [], status: 'pending', note: '' }; });
  const rulesIn = () => [];   // conditions are the layer settings now

  let stopped = null;                 // { layer, kind, rc, why } once something stops it
  const stop = (layer, kind, rc, why) => { if (!stopped) stopped = { layer, kind, rc, why }; };
  // A stopping check explains itself with both its name and what it measured,
  // since the name alone ("Dormancy") does not say why the customer failed.
  const stopWhy = x => (x.code ? `${x.code}: ${x.label}` : x.label) + (x.detail ? ` (${x.detail})` : '');

  /* --- L0: is there enough data to score this customer at all? --- */
  // The real routing rule, from §6.2: all-must-pass on sufficiency, any-one-
  // fails on the hard floor, deliberately unweighted. L0 never declines.
  const l0 = L.layer_0;
  // Which applicant field answers each L0 parameter, and in which direction.
  const L0_FIELD = {
    feature_completeness: { field: 'featureCompleteness', dir: 'min', type: 'percent' },
    wallet_tenure:        { field: 'walletAgeDays',       dir: 'min', type: 'days' },
    transaction_history:  { field: 'activeDays90',        dir: 'min', type: 'count', unit: 'active days in 90' },
    dormancy:             { field: 'daysSinceLastTxn',    dir: 'max', type: 'days' },
    model_confidence:     { field: 'modelConfidence',     dir: 'min', type: 'percent', neverNoFile: true },
    score_staleness_limit:{ field: 'scoreAgeDays',        dir: 'max', type: 'days' },
    repeat_path_threshold:{ field: 'closedLoans',         dir: 'min', type: 'count', unit: 'closed loans', routingNeutral: true },
  };
  let belowFloor = 0, belowSufficiency = 0;
  (LAYERS.find(l => l.key === 'layer_0').settings || []).forEach(def => {
    const entry = settingEntry('layer_0', def.key);
    const map = L0_FIELD[def.key] || {};
    if (entry.enabled === false) {
      l0.checks.push({ label: def.label, state: 'unset',
        detail: 'Switched off, so it is never evaluated and never appears as a reason.', why: def.meaning });
      return;
    }
    const v = entry.value || {};
    const actual = map.field ? aNum(map.field) : null;
    const suff = v.sufficiency ?? v.threshold ?? v.value ?? null;
    const floor = v.hardFloor ?? null;
    if (suff == null && floor == null) {
      l0.checks.push({ label: def.label, state: 'unset',
        detail: 'No thresholds set yet, so this is not checked.', why: def.meaning });
      return;
    }
    if (actual == null) {
      l0.checks.push({ label: def.label, state: 'unknown',
        detail: 'Not known for this customer.', why: def.meaning });
      return;
    }
    const meets = t => (map.dir === 'max' ? actual <= t : actual >= t);
    const okSuff  = suff == null || meets(suff);
    const okFloor = floor == null || meets(floor);
    if (!map.routingNeutral) {
      if (!okFloor && !map.neverNoFile) belowFloor++;
      else if (!okSuff) belowSufficiency++;
    }
    const word = map.dir === 'max' ? 'at most' : 'at least';
    l0.checks.push({
      label: def.label,
      state: okSuff ? 'ok' : 'fail',
      detail: `${fmtAmount(actual, map.type, map.unit)} against sufficiency ${word} `
            + `${fmtAmount(suff, map.type, map.unit)}`
            + (floor == null ? ', no hard floor set' : `, hard floor ${word} ${fmtAmount(floor, map.type, map.unit)}`)
            + (okSuff ? '' : (okFloor || map.neverNoFile ? '. Below sufficiency, above the floor: thin file.' : '. Below the hard floor: no file.')),
      effect: okSuff ? null : 'route', rc: okSuff ? null : 'RC-301',
      why: def.meaning,
    });
  });
  l0.rules = [];

  const route = belowFloor > 0 ? 'insufficient' : (belowSufficiency > 0 ? 'thin' : 'scored');
  const routeLabel = { scored: 'SCORED', thin: 'THIN FILE', insufficient: 'NO FILE' }[route];
  l0.status = route === 'scored' ? 'passed' : 'routed';
  l0.note = {
    scored: 'Every parameter is at or above its sufficiency threshold, so the model score is trusted and the customer is banded at L3.',
    thin: `${plural(belowSufficiency, 'parameter')} below sufficiency but none below a hard floor. The fallback scorecard at L3a scores this customer instead, capped at the score-source cap. A routing decision, not a decline.`,
    insufficient: `${plural(belowFloor, 'parameter')} below a hard floor. The starter ladder at L3a applies. Still continues to L1: L0 never declines.`,
  }[route];
  const thinCapRule = null;


  /* --- The cold-start branch replaces the rest of the waterfall --- */
  if (route === 'insufficient' && !stopped) {
    const cs = c.coldStart;
    const gates = cs.gates.map(g => {
      const res = evalCondition(g.param, g.op, g.value);
      const label = `${labelOf(g.param)} ${OPLABEL[g.op]} ${g.value}`;
      if (!res.runnable) {
        return { label, state: cs.unknownIsNotFail ? 'unknown' : 'fail', locked: g.locked,
          detail: cs.unknownIsNotFail
            ? `Not known: needs ${res.reason}. Unknown does not count as a failure.`
            : `Not known: needs ${res.reason}, and unknown counts as a failure.` };
      }
      return { label, state: res.ok ? 'ok' : 'fail', locked: g.locked,
        detail: `${res.actual} against ${res.threshold}` };
    });
    const failed = gates.filter(g => g.state === 'fail');
    const st = cs.starter;
    const nano = Number(st.nanoAmount) || 0;
    const dep = Number(st.depositPct) || 0;
    const offers = [];
    if (!failed.length && (st.type === 'nano' || st.type === 'both') && nano > 0) offers.push({ label: 'Nano limit', amount: nano });
    if (!failed.length && (st.type === 'deposit' || st.type === 'both') && dep > 0) offers.push({ label: `Device with ${dep}% down payment`, amount: null });
    const retry = new Date();
    retry.setDate(retry.getDate() + (Number(cs.defer.retryDays) || 0));
    return {
      route, routeLabel, layers: L, coldStart: {
        gates, failed, offers,
        blockedByLocked: failed.some(g => g.locked),
        retryOn: retry.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        retryDays: Number(cs.defer.retryDays) || 0,
        onTimeRequired: Number(cs.graduation.onTimeRequired) || 0,
      },
      outcome: failed.length
        ? { kind: 'defer', label: 'Defer', at: 'Cold start', rc: 'RC-301',
            why: `${plural(failed.length, 'light entry gate')} not met. The customer may apply again in ${plural(Number(cs.defer.retryDays) || 0, 'day')}.` }
        : offers.length
          ? { kind: 'approve', label: 'Starter offer', at: 'Cold start', rc: null,
              why: 'Every light entry gate is met, so a starter offer is made with no score involved.' }
          : { kind: 'defer', label: 'Defer', at: 'Cold start', rc: 'RC-301',
              why: 'The gates are met but no starter offer is configured, so there is nothing to offer yet.' },
      offer: null, caps: [],
    };
  }

  /* --- L1: hard knockouts --- */
  const l1 = L.layer_1;
  const priorDefault = aNum('monthsSincePriorDefault');
  l1.checks.push(
    check({ label: 'Loans open right now', actual: aNum('activeLoans'), threshold: sNum('layer_1', 'concurrent_loan_cap'),
      dir: 'max', type: 'count', unit: 'loans', effect: 'decline', rc: 'RC-401', why: 'Holding several loans at once is one of the fastest routes to over-indebtedness.' }),
    check({ label: 'Currently delinquent', actual: aNum('currentDpd'), threshold: sNum('layer_1', 'currently_delinquent'),
      dir: 'max', type: 'days', effect: 'decline', rc: 'RC-103', why: 'Days past due on any open loan.' }),
    priorDefault == null
      ? { label: 'Prior default lookback', state: 'ok', detail: 'No prior default on record.', why: 'Excludes a customer who has defaulted with Ecocash inside the lookback.' }
      : check({ label: 'Prior default lookback', actual: priorDefault, threshold: sNum('layer_1', 'prior_default_lookback'),
          dir: 'min', type: 'count', unit: 'months since', effect: 'decline', rc: 'RC-401', why: 'Excludes a customer who has defaulted with Ecocash inside the lookback.' }),
  );
  const staffRule = settingValue('layer_1', 'staff_related_parties');
  if (a.isStaff) {
    l1.checks.push({
      label: 'Staff and related parties', state: staffRule === 'No special handling' ? 'ok' : 'fail',
      detail: `Flagged as staff. This profile is set to “${staffRule || 'nothing yet'}”.`,
      effect: staffRule === 'Exclude' ? 'decline' : staffRule === 'Refer to manual review' ? 'refer' : null,
      rc: 'RC-103', why: 'Usually routed to review rather than declined, for governance reasons.',
    });
  }
  l1.rules = [];
  const l1Stop = [...l1.checks, ...l1.rules].find(x => x.state === 'fail' && ACTION_STOPS[x.effect]);
  if (l1Stop) stop('L1', ACTION_STOPS[l1Stop.effect], l1Stop.rc, stopWhy(l1Stop));
  l1.status = l1Stop ? 'stopped' : 'passed';

  /* --- L2: fraud and first-payment-default screens --- */
  const l2 = L.layer_2;
  if (!stopped) {
    l2.checks.push(
      check({ label: 'Minimum account age', actual: aNum('walletAgeDays'), threshold: sNum('layer_2', 'minimum_account_age'),
        dir: 'min', type: 'days', effect: 'refer', rc: 'RC-104',
        why: 'Wallet age as an eligibility screen. L0 checks the same field asking whether a score can be trusted.' }),
      check({ label: 'Device changes', actual: aNum('deviceChanges6m'), threshold: sNum('layer_2', 'device_change_frequency'),
        dir: 'max', type: 'count', unit: 'changes in 6 months', effect: 'refer', rc: 'RC-403',
        why: 'Frequent changes can indicate device resale, which matters directly when the loan finances a device.' }),
      check({ label: 'Application velocity', actual: aNum('applications30d'), threshold: sNum('layer_2', 'application_velocity'),
        dir: 'max', type: 'count', unit: 'applications in 30 days', effect: 'refer', rc: 'RC-502',
        why: 'Repeated applications in a short period suggest shopping for an approval.' }),
      check({ label: 'Profile change velocity', actual: aNum('daysSinceProfileChange'), threshold: sNum('layer_2', 'profile_change_velocity'),
        dir: 'min', type: 'days', effect: 'refer', rc: 'RC-502', blankMeans: 'No recent KYC or contact change.',
        why: 'KYC or contact details changing just before an application is a takeover signal.' }),
      check({ label: 'Pre-application inflow spike', actual: aNum('inflowSpike'), threshold: sNum('layer_2', 'pre_application_inflow_spike'),
        dir: 'max', type: 'ratio', unit: 'x the 90-day average', effect: 'refer', rc: 'RC-502',
        why: 'A sudden spike can mean the wallet was funded to look more creditworthy.' }),
    );
    const dta = settingValue('layer_2', 'dormant_then_suddenly_active');
    if (a.dormantThenActive) {
      l2.checks.push({
        label: 'Dormant then suddenly active', state: dta === 'Off' || !dta ? 'ok' : 'fail',
        detail: dta && dta !== 'Off' ? `Flagged, and this profile is set to “${dta}”.` : 'Flagged, but this screen is switched off.',
        effect: dta === 'Decline' ? 'decline' : dta === 'Refer' ? 'refer' : null, rc: 'RC-502',
        why: 'An account that was quiet and then became busy shortly before applying.',
      });
    }
    l2.rules = [];
    const l2Stop = [...l2.checks, ...l2.rules].find(x => x.state === 'fail' && ACTION_STOPS[x.effect]);
    if (l2Stop) stop('L2', ACTION_STOPS[l2Stop.effect], l2Stop.rc, stopWhy(l2Stop));
    l2.status = l2Stop ? 'stopped' : 'passed';
  } else { l2.status = 'not-reached'; }

  /* --- L3: score decisioning, or the thin-file offer --- */
  const l3 = L.layer_3;
  const bands = c.bands;
  const score = aNum('score');
  let bandIdx = null, band = null, indicative = null, term = null, deposit = null, offerSource = '';
  if (!stopped) {
    if (route === 'thin') {
      indicative = sNum('layer_3a', 'starter_limit_thin_file');
      term = sNum('layer_3a', 'ladder_max_tenure');
      deposit = sNum('layer_3a', 'ladder_deposit_requirement');
      offerSource = 'Starter limit (thin-file path)';
      l3.checks.push({
        label: 'Thin-file offer', state: indicative == null ? 'unset' : 'ok',
        detail: indicative == null
          ? 'No starter limit set yet, so there is nothing to offer on this path.'
          : `${MONEY_FMT(indicative)} over ${plural(term ?? 0, 'month')}, ${deposit ?? 0}% deposit. Set on the thin-file path at L0.`,
        why: 'The model score is not used on this path. The limit is fixed and rises only as the customer repays.',
      });
      const ladder = [];
      l3.rules = ladder;
      const unlocked = ladder.filter(x => x.state === 'fail');
      if (unlocked.length) {
        l3.note = `${plural(unlocked.length, 'ladder condition')} met, so this customer is eligible for the next step up to the ${MONEY_FMT(sNum('layer_3a', 'max_ladder_limit') || 0)} ceiling.`;
      }
      if (indicative == null) stop('L3', 'decline', 'RC-301', 'no starter limit configured');
    } else {
      const cutoff = sNum('layer_3', 'master_approval_cutoff');
      // First to fail wins: the master cutoff is stated as overriding the band
      // table, so it is read before the band decision.
      l3.checks.push(check({
        label: 'Master approval cutoff', actual: score, threshold: cutoff,
        dir: 'min', type: 'count', unit: 'points', effect: 'decline', rc: 'RC-114',
        why: 'A single floor below which nobody is approved, whatever the band table says. Read before the band.',
      }));
      bands.forEach((b, i) => { if (score != null && score >= b.floor) { bandIdx = i; band = b; } });
      if (band) {
        const refer = catList(settingValue('layer_3', 'refer_band_boundaries')).some(x => x.toLowerCase() === band.label.toLowerCase());
        indicative = bandLimit(band);
        term = band.maxTenure;
        deposit = effectiveDeposit(band);
        offerSource = `${band.label} band`;
        l3.checks.push({
          label: 'Score band', state: band.decision === 'Decline' ? 'fail' : refer ? 'fail' : 'ok',
          detail: `${plural(score ?? 0, 'point')} lands in ${band.label}, floor ${band.floor}. Decision: ${band.decision}.${refer ? ' This band is set to refer.' : ''}`,
          effect: band.decision === 'Decline' ? 'decline' : refer ? 'refer' : null,
          rc: band.decision === 'Decline' ? 'RC-114' : 'RC-602',
          why: 'The band sets the indicative offer: a multiplier of the product maximum, plus a term and a deposit.',
        });
        if (indicative != null && band.decision !== 'Decline' && !refer) {
          l3.checks.push({
            label: 'Indicative offer', state: 'ok',
            detail: `${MONEY_FMT(indicative)} at ${band.multiplier}x the product maximum, over ${plural(term ?? 0, 'month')}, ${deposit ?? 0}% deposit${depositFloorBinds(band) ? ` (the L5 floor, above this band's own ${band.deposit}%)` : ''}.`,
            why: 'Every later layer can lower this figure. None can raise it.',
          });
        }
      } else if (score != null) {
        l3.checks.push({ label: 'Score band', state: 'fail',
          detail: `${plural(score, 'point')} sits below every band floor.`, effect: 'decline', rc: 'RC-114',
          why: 'No band covers this score, so there is no offer to make.' });
      } else {
        l3.checks.push({ label: 'Score band', state: 'unknown',
          detail: 'No model score for this customer, but L0 routed them as scored. Check the L0 thresholds.',
          why: 'The band is chosen from the score.' });
      }
      l3.rules = [];
    }
    if (thinCapRule) {
      l3.checks.push({ label: `Coverage cap from ${thinCapRule.code}`, state: 'fail',
        detail: `${thinCapRule.detail}. The limit is capped at the thin-file ceiling.`,
        effect: 'capThin', rc: thinCapRule.rc,
        why: 'A coverage rule at L0 can cap the limit without changing which path the customer takes.' });
    }
    const l3Stop = [...l3.checks, ...l3.rules].find(x => x.state === 'fail' && ACTION_STOPS[x.effect]);
    if (l3Stop) stop('L3', ACTION_STOPS[l3Stop.effect], l3Stop.rc, stopWhy(l3Stop));
    l3.status = l3Stop ? 'stopped' : [...l3.checks, ...l3.rules].some(x => x.state === 'fail' && /^cap/.test(x.effect || '')) ? 'capped' : 'passed';
  } else { l3.status = 'not-reached'; }

  /* --- L4: affordability --- */
  const l4 = L.layer_4;
  let affordLimit = null, maxInstalment = null, usableIncome = null;
  if (!stopped) {
    const rawIncome = aNum('income');
    const conf = aNum('incomeConfidence');
    const confFloor = sNum('layer_4', 'income_confidence_threshold');
    const haircut = sNum('layer_4', 'haircut_low_confidence');
    const cut = rawIncome != null && conf != null && confFloor != null && conf < confFloor && haircut != null;
    usableIncome = rawIncome == null ? null : (cut ? Math.round(rawIncome * (1 - haircut / 100)) : rawIncome);
    if (rawIncome != null) {
      l4.checks.push({
        label: 'Income used', state: 'ok',
        detail: cut
          ? `${MONEY_FMT(rawIncome)} estimated at ${conf}% confidence, below the ${confFloor}% threshold, so a ${haircut}% haircut applies: ${MONEY_FMT(usableIncome)} is used.`
          : `${MONEY_FMT(rawIncome)}, derived recurring income. The balance proxy is the fallback when confidence is below the threshold.`,
        why: 'Wallet inflow is not income. A weak estimate produces a cautious offer rather than a confident wrong one.',
      });
    }
    l4.checks.push(
      check({ label: 'Minimum income', actual: usableIncome, threshold: sNum('layer_4', 'minimum_monthly_income'),
        dir: 'min', type: 'currency', effect: 'decline', rc: 'RC-208', why: 'A floor below which no loan is offered, whatever the ratios say.' }),
      check({ label: 'Income stability', actual: aNum('incomeCoV'), threshold: sNum('layer_4', 'income_stability_requirement'),
        dir: 'max', type: 'ratio', unit: 'coefficient of variation', effect: 'refer', rc: 'RC-207',
        why: 'Steady income supports an instalment more reliably than the same average arriving erratically.' }),
    );
    const ratio = sNum('layer_4', 'instalment_to_income_cap');
    const floor = sNum('layer_4', 'net_disposable_income_floor');
    const deduct = sVal('layer_4', 'existing_obligation_deduction').expectedValue === true;
    const expenses = aNum('expenses') || 0;
    const others = deduct ? (aNum('otherInstalments') || 0) : 0;
    if (usableIncome != null && ratio != null) {
      const byRatio = usableIncome * (ratio / 100);
      const headroom = floor == null ? null : usableIncome - expenses - others - floor;
      maxInstalment = headroom == null ? byRatio : Math.max(0, Math.min(byRatio, headroom));
      const bound = headroom != null && headroom < byRatio ? 'disposable income' : 'the income ratio';
      l4.checks.push({
        label: 'Affordable instalment', state: maxInstalment > 0 ? 'ok' : 'fail',
        detail: `${MONEY_FMT(Math.round(maxInstalment))} per month. ${ratio}% of ${MONEY_FMT(usableIncome)} is ${MONEY_FMT(Math.round(byRatio))}`
          + (headroom == null ? ', with no disposable floor set.' : `; after ${MONEY_FMT(expenses)} expenses${deduct ? `, ${MONEY_FMT(others)} other instalments` : ''} and the ${MONEY_FMT(floor)} floor there is ${MONEY_FMT(Math.round(headroom))} left. Bound by ${bound}.`),
        effect: maxInstalment > 0 ? null : 'decline', rc: 'RC-207',
        why: 'A customer can be low risk and still be offered more than they can comfortably service.',
      });
      if (term) affordLimit = Math.max(0, maxInstalment * term);
    } else {
      l4.checks.push({ label: 'Affordable instalment', state: usableIncome == null ? 'unknown' : 'unset',
        detail: usableIncome == null ? 'No income for this customer, so no instalment can be worked out.' : 'No instalment-to-income cap set yet.',
        why: 'The affordability cap is the instalment the customer can carry, multiplied by the loan term.' });
    }
    l4.rules = [].map(r => {
      // A-01 reads the affordability ratio, which is the cap L4 has just
      // applied. Reporting it as "not evaluated" would hide the actual work.
      const mult = /monthly instalment/i.test(String(r.value)) ? parseFloat(splitValue(r.value).num) : null;
      if (mult != null && maxInstalment != null && Number.isFinite(mult)) {
        const src = PARAM_SOURCE[r.param];
        const have = src ? src().v : null;
        if (have == null) return ruleCheck(r);
        const target = mult * maxInstalment;
        const met = r.op === 'lte' ? have <= target : have >= target;
        const fires = r.action === 'pass' ? !met : met;
        return { label: sentence(r), code: r.code, state: fires ? 'fail' : 'ok',
          detail: `${MONEY_FMT(have)} against ${mult}\u00d7 the ${MONEY_FMT(Math.round(maxInstalment))} instalment, ${MONEY_FMT(Math.round(target))}.`,
          effect: fires ? (r.action === 'pass' ? 'decline' : r.action) : null, rc: fires ? r.rc : null };
      }
      if (r.param === 'afford' && maxInstalment != null && usableIncome) {
        return { label: sentence(r), code: r.code, state: 'ok',
          detail: `Applied. The instalment is held at ${MONEY_FMT(Math.round(maxInstalment))}, which is ${Math.round((maxInstalment / usableIncome) * 100)}% of income.`,
          effect: null, rc: null };
      }
      return ruleCheck(r);
    });
    const l4Stop = [...l4.checks, ...l4.rules].find(x => x.state === 'fail' && ACTION_STOPS[x.effect]);
    if (l4Stop) stop('L4', ACTION_STOPS[l4Stop.effect], l4Stop.rc, stopWhy(l4Stop));
    l4.status = l4Stop ? 'stopped' : 'passed';
  } else { l4.status = 'not-reached'; }

  /* --- L5: the final limit, taken as the lowest of every cap --- */
  const l5 = L.layer_5;
  let caps = [], finalLimit = null, bindingCap = null;
  if (!stopped) {
    const productMax = sNum('layer_5', 'productMaximum');
    const exposureCap = sNum('layer_5', 'totalCustomerExposureCap');
    const held = aNum('totalExposure');
    const headroom = exposureCap == null || held == null ? null : Math.max(0, exposureCap - held);
    const tier = route === 'thin' ? settingValue('layer_3a', 'scorecard_cap') : null;

    caps = [
      { label: offerSource || 'Band limit', amount: indicative, from: 'L3',
        note: indicative == null ? 'Nothing set, so this cap does not apply.' : '' },
      { label: 'Affordability limit', amount: affordLimit == null ? null : Math.round(affordLimit), from: 'L4',
        note: affordLimit == null ? 'Could not be worked out, so this cap does not apply.'
          : `${MONEY_FMT(Math.round(maxInstalment))} a month over ${plural(term ?? 0, 'month')}.` },
      { label: 'Product maximum', amount: productMax, from: 'L5',
        note: productMax == null ? 'Not set yet, so this cap does not apply.' : '' },
      { label: 'Customer exposure headroom', amount: headroom, from: 'L5',
        note: headroom == null ? 'Needs both an exposure cap and a balance for this customer.'
          : `${MONEY_FMT(exposureCap)} cap less ${MONEY_FMT(held)} already held.` },
      { label: 'Device tier cap', amount: null, from: 'L5',
        note: tier ? `Thin-file customers are limited to ${String(tier).toLowerCase()}, but this profile holds no price per tier, so nothing is capped here.`
                   : 'No price per device tier is configured, so nothing is capped here.' },
    ];
    // Rules at L5 that cap rather than decline become caps in the same list, so
    // there is one place where the limit is assembled.
    [].forEach(r => {
      const res = ruleCheck(r);
      l5.rules.push(res);
      if (res.state === 'fail' && (res.effect === 'capAfford' || res.effect === 'capThin')) {
        const thr = parseFloat(String(splitValue(r.value).num).replace(/,/g, ''));
        caps.push({ label: `Cap from ${r.code}`, amount: Number.isFinite(thr) ? thr : null, from: 'L5',
          note: sentence(r), rc: r.rc });
      }
      if (res.state === 'fail' && res.effect === 'reduce' && caps.length) {
        caps.push({ label: `Reduction from ${r.code}`, amount: null, from: 'L5', note: sentence(r), rc: r.rc, reduce: 0.3 });
      }
    });
    if (thinCapRule) {
      const ceiling = Number(c.fallback.tiers.thinCeiling);
      caps.push({ label: 'Thin-file ceiling', amount: Number.isFinite(ceiling) ? ceiling : null, from: 'L0',
        note: `Applied because ${thinCapRule.code} fired at L0.`, rc: thinCapRule.rc });
    }

    const live = caps.filter(x => x.amount != null);
    if (live.length) {
      bindingCap = live.reduce((lo, x) => (x.amount < lo.amount ? x : lo));
      finalLimit = bindingCap.amount;
      caps.forEach(x => { x.binding = x === bindingCap; });
      // A percentage reduction is applied after the lowest cap, since it acts
      // on whatever the limit turned out to be.
      caps.filter(x => x.reduce).forEach(x => { finalLimit = finalLimit * (1 - x.reduce); x.amount = Math.round(finalLimit); });
      finalLimit = roundLimit(finalLimit);
    }

    const minViable = sNum('layer_5', 'minimumViableLimit');
    l5.checks.push({
      label: 'Lowest cap wins', state: finalLimit == null ? 'unset' : 'ok',
      detail: finalLimit == null
        ? 'No cap could be worked out, so there is no limit to offer.'
        : `${bindingCap.label} is the lowest at ${MONEY_FMT(bindingCap.amount)}. Rounded by “${settingValue('layer_5', 'limitRoundingIncrement') || 'no rule set'}” to ${MONEY_FMT(finalLimit)}.`,
      why: 'The final limit is the lowest of every applicable cap. No layer can raise it.',
    });
    if (finalLimit == null) stop('L5', 'decline', 'RC-114', 'no limit could be assembled');
    l5.checks.push(check({ label: 'Minimum viable limit', actual: finalLimit, threshold: minViable,
      dir: 'min', type: 'currency', effect: 'decline', rc: 'RC-207',
      why: 'Below this the loan is not worth making, so it is declined rather than offered.' }));
    if (term != null && permittedTerms().length && !permittedTerms().includes(term)) {
      l5.checks.push({ label: 'Loan term', state: 'fail',
        detail: `${plural(term, 'month')} is not one of the permitted terms (${permittedTerms().map(t => t + ' mo').join(', ')}).`,
        effect: 'refer', rc: 'RC-602', why: 'L5 owns which repayment periods may be offered at all.' });
    }
    const l5Stop = [...l5.checks, ...l5.rules].find(x => x.state === 'fail' && ACTION_STOPS[x.effect]);
    if (l5Stop) stop('L5', ACTION_STOPS[l5Stop.effect], l5Stop.rc, stopWhy(l5Stop));
    l5.status = l5Stop ? 'stopped' : 'passed';
  } else { l5.status = 'not-reached'; }

  /* --- L6: does this approval remain acceptable for the book? --- */
  const l6 = L.layer_6;
  if (!stopped) {
    if (sVal('layer_6', 'kill_switch').expectedValue === true) {
      l6.checks.push({ label: 'Kill switch', state: 'fail', detail: 'On. Every approval is halted.',
        effect: 'hold', rc: 'RC-601', why: 'A manual control that stops all lending immediately.' });
    }
    l6.checks.push(check({ label: 'Daily disbursement cap', actual: aNum('disbursedToday'), threshold: sNum('layer_6', 'daily_disbursement_cap'),
      dir: 'max', type: 'currency', effect: 'hold', rc: 'RC-601', why: 'A ceiling on the total disbursed per day, controlling how fast exposure builds.' }));
    if (route === 'thin') {
      l6.checks.push(check({ label: 'Thin-file share of approvals', actual: aNum('thinShareToday'), threshold: sNum('layer_6', 'max_thin_file_share_of_approvals'),
        dir: 'max', type: 'percent', effect: 'hold', rc: 'RC-601',
        why: 'This customer is on the thin-file path, so this cap applies to them.' }));
    }
    // One tightening control in the engine: a trigger with a threshold and an
    // action. It fires on portfolio delinquency, which a single application
    // cannot tell us, so it is reported rather than applied.
    const tighten = settingEntry('layer_6', 'automatic_tightening_trigger');
    if (tighten.enabled !== false) {
      const thr = tighten.value && tighten.value.threshold;
      l6.checks.push({ label: 'Automatic tightening trigger', state: 'ok',
        detail: `Armed at ${thr ?? 'no threshold set'}, action ${String(tighten.action || 'none').replace(/_/g, ' ')}. `
              + 'It fires on early delinquency across the book, so it is not decided by this application.',
        why: 'Tightens the cutoff automatically rather than waiting for a monthly review.' });
    }
    const holdout = sNum('layer_6', 'random_approval_holdout');
    if (holdout) {
      l6.checks.push({ label: 'Random approval holdout', state: 'ok',
        detail: `${holdout}% of applications just below the cutoff are approved at random. Whether this one is chosen is not deterministic, so it is not simulated.`,
        why: 'Without a holdout every new model trains only on customers the old rules passed.' });
    }
    l6.rules = [];
    const l6Stop = [...l6.checks, ...l6.rules].find(x => x.state === 'fail' && ACTION_STOPS[x.effect]);
    if (l6Stop) stop('L6', ACTION_STOPS[l6Stop.effect], l6Stop.rc, stopWhy(l6Stop));
    l6.status = l6Stop ? 'stopped' : 'passed';
  } else { l6.status = 'not-reached'; }

  // "Capped the limit" belongs to the layer whose cap actually bound, not to
  // L5, which only picks the lowest of them.
  if (bindingCap && L[String(bindingCap.from).toLowerCase()] && L[String(bindingCap.from).toLowerCase()].status === 'passed') {
    L[String(bindingCap.from).toLowerCase()].status = 'capped';
  }

  /* --- The outcome --- */
  const kindLabel = { decline: 'Decline', refer: 'Refer for manual review', hold: 'Hold', defer: 'Defer' };
  const outcome = stopped
    ? { kind: stopped.kind, label: kindLabel[stopped.kind], at: stopped.layer, rc: stopped.rc, why: stopped.why }
    : { kind: 'approve', label: route === 'thin' ? 'Approve at the thin-file limit' : 'Approve', at: 'L6', rc: null,
        why: bindingCap ? `${bindingCap.label} was the lowest cap.` : 'No cap bound the limit.' };

  const instalment = finalLimit != null && term ? Math.round((finalLimit / term) * 100) / 100 : null;
  return {
    route, routeLabel, layers: L, caps, bindingCap, outcome, coldStart: null,
    offer: outcome.kind === 'approve' && finalLimit != null
      ? { limit: finalLimit, term, deposit, instalment, band: band ? band.label : offerSource }
      : null,
  };
}

/* ---------- Single-customer assessment: the screen ---------- */

const OUTCOME_STYLE = {
  approve: ['#ECFDF3', '#067647', '#ABEFC6'],
  decline: ['#FEF3F2', '#B42318', '#FECDCA'],
  refer:   ['#EFF4FF', '#172E7B', '#C7D7FE'],
  hold:    ['#FFF8E6', '#7A5B12', '#F5DFA5'],
  defer:   ['#FFF8E6', '#7A5B12', '#F5DFA5'],
};
const CHECK_MARK = { ok: '✓', fail: '✕', fired: '↑', unset: '?', unknown: '?' };

// One applicant field, editable in place inside the layer that reads it.
function applicantEditor(f) {
  const v = applicantState()[f.key];
  const name = `${f.label}, for the customer being assessed`;
  const common = `data-change="app-field" data-field="${esc(f.key)}"`;
  if (f.type === 'toggle') {
    return `<button class="switch switch-lg${v ? ' on' : ''}" data-action="app-toggle" data-field="${esc(f.key)}"
      role="switch" aria-checked="${v ? 'true' : 'false'}" aria-label="${esc(name)}"><span class="knob"></span></button>`;
  }
  if (f.type === 'select') {
    const def = paramDef(f.param) || {};
    return `<select class="lim-select" ${common} aria-label="${esc(name)}">
      ${(def.values || []).map(o => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}
    </select>`;
  }
  const affix = f.type === 'currency' ? '$' : '';
  const unit = f.unit || { percent: '%', days: 'days' }[f.type] || '';
  const step = f.type === 'ratio' ? '0.01' : '1';
  return `<span class="val-num lim-num">
    ${affix ? `<span class="val-affix">${affix}</span>` : ''}
    <input type="number" min="0" step="${step}" class="val-input" value="${esc(v ?? '')}"
      placeholder="${esc(f.blankLabel || 'not known')}" ${common} aria-label="${esc(name)}" />
    ${unit ? `<span class="val-unit">${esc(unit)}</span>` : ''}
  </span>`;
}

function checkLine(x) {
  const fired = x.state === 'fail' || x.state === 'fired';
  const rc = fired && x.rc ? `<span class="rule-code">${esc(x.rc)}</span>` : '';
  const effLabel = x.effect === 'route' ? 'Route to another path' : (ACTLABEL[x.effect] || x.effect);
  const tone = x.effect === 'route' ? ' chk-effect-route' : x.state === 'fired' ? ' chk-effect-good' : '';
  const eff = fired && x.effect ? `<span class="chk-effect${tone}">${esc(effLabel)}</span>` : '';
  return `
  <div class="chk chk-${x.state}">
    <span class="chk-mark" aria-hidden="true">${CHECK_MARK[x.state] || '·'}</span>
    <div class="chk-text">
      <div class="chk-label">${esc(x.label)}${x.code ? ` <span class="rule-code">${esc(x.code)}</span>` : ''}</div>
      <div class="chk-detail">${esc(x.detail || '')}</div>
      ${x.why ? `<div class="chk-why">${esc(x.why)}</div>` : ''}
    </div>
    <div class="chk-right">${eff}${rc}</div>
  </div>`;
}

function renderLimitWaterfall(r) {
  const live = r.caps.filter(x => x.amount != null);
  if (!live.length) return '';
  const max = Math.max(...live.map(x => x.amount), 1);
  const rows = r.caps.map(x => {
    if (x.amount == null) {
      return `
      <div class="cap-row cap-na">
        <div class="cap-name">${esc(x.label)} <span class="cap-from">${esc(x.from)}</span></div>
        <div class="cap-bar-wrap"><span class="cap-none">does not apply</span></div>
        <div class="cap-amt">n/a</div>
      </div>`;
    }
    return `
    <div class="cap-row${x.binding ? ' is-binding' : ''}">
      <div class="cap-name">${esc(x.label)} <span class="cap-from">${esc(x.from)}</span></div>
      <div class="cap-bar-wrap"><div class="cap-bar" style="width:${Math.max(2, (x.amount / max) * 100)}%;"></div></div>
      <div class="cap-amt">${esc(MONEY_FMT(x.amount))}${x.binding ? '<span class="cap-tag">binds</span>' : ''}</div>
    </div>`;
  }).join('');
  const notes = r.caps.filter(x => x.note).map(x => `<div class="cap-note"><strong>${esc(x.label)}:</strong> ${esc(x.note)}</div>`).join('');
  return `
  <div class="card panel">
    <h2 class="panel-title">Where the limit was cut</h2>
    <div class="panel-sub" style="margin-bottom:12px;">Limits only ever go down. The final limit is the lowest of every applicable cap, so the shortest bar is the one that decided the offer.</div>
    <div class="cap-table">${rows}</div>
    <div class="cap-notes">${notes}</div>
  </div>`;
}

function renderColdStartTrace(cs) {
  const gates = cs.gates.map(g => `
    <div class="chk chk-${g.state}">
      <span class="chk-mark" aria-hidden="true">${CHECK_MARK[g.state] || '·'}</span>
      <div class="chk-text">
        <div class="chk-label">${esc(g.label)}${g.locked ? ' <span class="tag-essential">Non-negotiable</span>' : ''}</div>
        <div class="chk-detail">${esc(g.detail)}</div>
      </div>
    </div>`).join('');
  return `
  <div class="card panel">
    <h2 class="panel-title">Cold-start branch</h2>
    <div class="panel-sub" style="margin-bottom:12px;">L1 to L6 are replaced by a short, data-light path, so a customer with no history is deferred rather than declined. Configure it on the <span class="nav-link" data-layer="l0">L0</span> insufficient-data path.</div>
    ${gates}
    <div class="cap-notes">
      ${cs.offers.length
        ? `<div class="cap-note"><strong>Starter offer:</strong> ${cs.offers.map(o => esc(o.amount != null ? MONEY_FMT(o.amount) + ' ' + o.label.toLowerCase() : o.label)).join(', ')}. Graduates after ${esc(plural(cs.onTimeRequired, 'on-time instalment'))}.</div>`
        : `<div class="cap-note"><strong>Retry:</strong> the customer may apply again on ${esc(cs.retryOn)}, ${esc(plural(cs.retryDays, 'day'))} from today.</div>`}
      ${cs.blockedByLocked ? `<div class="cap-note"><strong>Non-negotiable gate failed:</strong> this cannot be waived by taking a deposit.</div>` : ''}
    </div>
  </div>`;
}

function renderAssess() {
  const r = assess();
  const oc = OUTCOME_STYLE[r.outcome.kind] || OUTCOME_STYLE.hold;
  const rc = r.outcome.rc ? rcByCode(r.outcome.rc) : null;

  const presets = APPLICANT_PRESETS.map((p, i) => `
    <button class="seg-btn${i === state.presetIdx ? ' active' : ''}" data-action="app-preset" data-idx="${i}"
      aria-pressed="${i === state.presetIdx ? 'true' : 'false'}"
      title="${esc(p.hint)}" aria-label="Load the ${esc(p.name)} applicant: ${esc(p.hint)}">${esc(p.name)}</button>`).join('');

  const offer = r.offer ? `
    <div class="offer-grid">
      <div><div class="offer-k">Limit</div><div class="offer-v">${esc(MONEY_FMT(r.offer.limit))}</div></div>
      <div><div class="offer-k">Term</div><div class="offer-v">${r.offer.term == null ? 'not set' : esc(plural(r.offer.term, 'month'))}</div></div>
      <div><div class="offer-k">Deposit</div><div class="offer-v">${r.offer.deposit == null ? 'n/a' : esc(r.offer.deposit + '%')}</div></div>
      <div><div class="offer-k">Instalment</div><div class="offer-v">${r.offer.instalment == null ? 'n/a' : esc(MONEY_FMT(r.offer.instalment))}</div></div>
      <div><div class="offer-k">From</div><div class="offer-v offer-v-sm">${esc(r.offer.band)}</div></div>
    </div>` : '';

  const layers = LAYERS.map(layer => {
    const t = r.layers[layer.key];
    const fields = APPLICANT_FIELDS[layer.key] || [];
    const open = !!state.assessOpen[layer.key];
    const statusText = {
      passed: 'Passed', stopped: 'Stopped here', capped: 'Capped the limit',
      routed: 'Routed', 'not-reached': 'Not reached', pending: 'Not reached',
    }[t.status];
    const statusClass = { passed: 'ok', stopped: 'stop', capped: 'cap', routed: 'route' }[t.status] || 'skip';
    const all = [...t.checks, ...t.rules];
    const failed = all.filter(x => x.state === 'fail').length;
    const summary = t.status === 'not-reached'
      ? 'An earlier layer decided the application, so this one never ran.'
      : failed ? `${plural(failed, 'check')} did not pass` : `${plural(all.length, 'check')} run, all passed`;
    return `
    <div class="alayer alayer-${statusClass}">
      <button class="alayer-head" data-action="assess-layer" data-layer="${layer.key}" aria-expanded="${open ? 'true' : 'false'}"
        aria-label="${esc(`${layer.num} ${layer.title}: ${statusText}. ${summary}`)}">
        <span class="chip layer-num">${esc(layer.num)}</span>
        <span class="alayer-text">
          <span class="alayer-title">${esc(layer.title)}</span>
          <span class="alayer-sum">${esc(summary)}</span>
        </span>
        <span class="alayer-status">${esc(statusText)}</span>
        <span class="path-chev" aria-hidden="true">${open ? '▲' : '▼'}</span>
      </button>
      ${open ? `
      <div class="alayer-body">
        ${t.note ? `<p class="layer-intro">${esc(t.note)}</p>` : ''}
        ${all.length ? all.map(checkLine).join('') : `<div class="chk chk-unset"><span class="chk-mark" aria-hidden="true">·</span><div class="chk-text"><div class="chk-detail">Nothing configured in this layer yet, so nothing was checked.</div></div></div>`}
        ${fields.length ? `
        <h4 class="path-sub">What this layer reads about the customer</h4>
        <div class="afields">
          ${fields.map(f => `
          <div class="afield">
            <label class="afield-label" for="af-${esc(f.key)}">${esc(f.label)}</label>
            ${applicantEditor(f)}
          </div>`).join('')}
        </div>` : ''}
      </div>` : ''}
    </div>`;
  }).join('');

  return `
  <div class="assess-screen">
  <div class="page-head">
    <div>
      <h1 class="page-title">Assess a customer</h1>
      <p class="page-desc" style="max-width:680px;">One applicant, run down L0 to L6 in the order the engine evaluates. Every threshold comes from this profile's own draft, so a change on the waterfall shows up here immediately.</p>
    </div>
  </div>

  <div class="preset-bar">
    <span class="preset-label">Start from</span>
    <div class="preset-tabs">${presets}</div>
    <button class="btn btn-outline btn-sm" data-action="app-reset">Reset this applicant</button>
  </div>
  <div class="preset-hint">${esc(APPLICANT_PRESETS[state.presetIdx] ? APPLICANT_PRESETS[state.presetIdx].hint : '')}</div>

  <div class="card panel outcome-card" style="border-left:4px solid ${oc[1]};">
    <div class="outcome-top">
      <div style="min-width:0;">
        <div class="outcome-kicker">Outcome at ${esc(r.outcome.at)} · routed as ${esc(r.routeLabel.toLowerCase())}</div>
        <div class="outcome-label" style="color:${oc[1]};">${esc(r.outcome.label)}</div>
        <div class="outcome-why">${esc(r.outcome.why)}</div>
      </div>
      <span class="chip" style="background:${oc[0]};color:${oc[1]};border:1px solid ${oc[2]};">${esc(r.outcome.kind === 'approve' ? 'Offer made' : 'No offer')}</span>
    </div>
    ${offer}
    ${rc ? `
    <div class="outcome-rc">
      <span class="rule-code">${esc(rc.code)}</span>
      <div>
        <div class="rc-label">${esc(rc.label)}</div>
        ${rc.consumer ? `<div class="rc-consumer">Message to the customer: “${esc(rc.consumer)}”</div>`
                      : `<div class="rc-consumer rc-none">No customer message. Agent and audit only.</div>`}
      </div>
      <span class="rc-note">emitted</span>
    </div>` : ''}
  </div>

  ${r.coldStart ? renderColdStartTrace(r.coldStart) : renderLimitWaterfall(r)}

  <h2 class="panel-title" style="margin:20px 0 4px 0;">The trace</h2>
  <div class="panel-sub" style="margin-bottom:10px;">Open a layer to see every check it ran and to change what the customer looks like. Any layer can stop the process, so once one does, the rest are not reached.</div>
  <div class="alayers">${layers}</div>
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
      <button class="version-action" style="color:${actionColor};" aria-label="${esc(v.action)} ${esc(v.version)}: ${esc(v.status)}">${esc(v.action)}</button>
    </div>`;
    }).join('');

  return `
  <h1 class="page-title">Versions</h1>
  <p class="page-desc" style="margin-bottom:20px;">Every published version of ${esc(activeProfile().name)} is kept. Rolling back restores that exact rule set. The audit log for all users lives in <span class="nav-link" data-nav="users">Global setup → Users &amp; audit</span>.</p>

  <div class="card list-card" style="max-width:720px;">
    <h2 class="list-card-head">Version history: ${esc(activeProfile().name)}</h2>
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
    // Cold-start gates start "met" so the default preview shows the starter offer
    // rather than an immediate defer.
    const gates = {};
    cfg().coldStart.gates.forEach(g => { gates[g.id] = true; });
    state.fbPreview = { checks, income: '120', gates };
  }
  return state.fbPreview;
}

/* ---------- Cold-start / no-data path ---------- */

// Evaluated only when the customer has no usable data at all. Light gates are a
// separate, data-light list; failing one defers, it never declines permanently.
function coldStartCompute() {
  const cs = cfg().coldStart;
  const pv = fbPreviewState();
  const met = [], failed = [];
  cs.gates.forEach(g => (pv.gates[g.id] === false ? failed : met).push(g));
  const blockedBy = failed.filter(g => g.locked);
  const passes = failed.length === 0;

  const st = cs.starter;
  const nano = Number(st.nanoAmount) || 0;
  const deposit = Number(st.depositPct) || 0;
  const offers = [];
  if (passes && (st.type === 'nano' || st.type === 'both') && nano > 0) {
    offers.push(`$${nano} nano-limit`);
  }
  if (passes && (st.type === 'deposit' || st.type === 'both') && deposit > 0) {
    offers.push(`device with ${deposit}% down payment`);
  }

  const d = new Date();
  d.setDate(d.getDate() + (Number(cs.defer.retryDays) || 0));
  const retryOn = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  return {
    met, failed, blockedBy, passes, offers, retryOn,
    retryDays: Number(cs.defer.retryDays) || 0,
    deviceLock: !!st.deviceLock,
    onTimeRequired: Number(cs.graduation.onTimeRequired) || 0,
    // Passing the gates but having nothing configured to offer is still a defer,
    // not a decline.
    outcome: passes ? (offers.length ? 'starter' : 'defer-unconfigured') : 'defer',
  };
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
  if (tier === 'zero') limit = `$${t.zeroMin} (flat cold-start minimum)`;
  else if (band.decision === 'Decline' || isNaN(bandLimit)) limit = 'Decline at this score';
  else limit = `$${Math.min(bandLimit, cap)}${bandLimit > cap ? ` (band gives $${bandLimit}, capped)` : ''}`;
  const afford = incomeKnown
    ? `$${Math.round(income * 0.25)} / month instalment cap (25% of income)`
    : 'n/a · income unknown, zero-file minimum applies';
  return { score, signals, tier, band, bandIdx, limit, afford, incomeKnown };
}

function renderFallback(part) {
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
          ${paramValidIn(e.param, 'fallback') ? '' : `<optgroup label="Not valid here"><option value="${esc(e.param)}" selected>${esc(labelOf(e.param))} (not valid here)</option></optgroup>`}
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
    thinCeiling: 'Thin-file ceiling: hard cap on any fallback-scored offer, in US dollars',
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

  /* ---------- Cold-start / no-data policy ---------- */
  const cs = cfg().coldStart;
  const cold = coldStartCompute();

  // Same row shape as the points table above: a fixed-width control in the
  // switch column keeps every row's selects on the same vertical line.
  const gateRow = (g) => {
    const opts = paramsForSection('coldstart');
    const valid = opts.some(d => d.key === g.param);
    const sig = `${labelOf(g.param)} ${SENT_OP[g.op] || g.op} ${g.value}`;
    return `
    <div class="fb-row" style="background:${g.locked ? '#FBFCFD' : '#fff'};">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        ${g.locked
          ? `<span class="cs-lock" title="Non-negotiable, cannot be waived" aria-label="Non-negotiable gate, always on">🔒</span>`
          : `<span class="cs-lock cs-lock-open" aria-hidden="true"></span>`}
        <select class="fb-signal" data-change="cs-param" data-gate="${g.id}" ${g.locked ? 'disabled' : ''}
          aria-label="Parameter for light entry gate ${esc(sig)}">
          ${opts.map(d => `<option value="${esc(d.key)}"${d.key === g.param ? ' selected' : ''}>${esc(d.label)}</option>`).join('')}
          ${valid ? '' : `<option value="${esc(g.param)}" selected>${esc(labelOf(g.param))} (not valid here)</option>`}
        </select>
        <select class="fb-op" data-change="cs-op" data-gate="${g.id}" ${g.locked ? 'disabled' : ''}
          aria-label="Test for light entry gate ${esc(sig)}">${optionGroup(operatorsForParam(g.param), g.op)}</select>
        <input class="fb-value" value="${esc(g.value)}" data-change="cs-value" data-gate="${g.id}" ${g.locked ? 'disabled' : ''}
          aria-label="Value for light entry gate ${esc(sig)}" />
        ${g.locked
          ? `<span class="chip cs-chip-locked">Non-negotiable</span>`
          : `<button class="rule-remove" data-action="cs-remove" data-gate="${g.id}"
               aria-label="Remove light entry gate ${esc(sig)}" title="Remove gate">×</button>`}
      </div>
      ${g.note ? `<div class="fb-row-note">${esc(g.note)}</div>` : ''}
    </div>`;
  };

  // Single-select, so it reuses the same look as the sample selector on What-if.
  const starterButtons = STARTER_TYPES.map(([k, label]) => `
    <button type="button" class="seg-btn${cs.starter.type === k ? ' active' : ''}" data-action="cs-type" data-type="${k}"
      aria-pressed="${cs.starter.type === k ? 'true' : 'false'}">${esc(label)}</button>`).join('');

  const csNum = (field, val, pre, suf, label) => `
    <span class="val-num lim-num">
      ${pre ? `<span class="val-affix">${pre}</span>` : ''}
      <input type="number" min="0" class="val-input" value="${esc(val)}" data-change="cs-field" data-field="${field}"
        aria-label="${esc(label)}" />
      ${suf ? `<span class="val-unit">${suf}</span>` : ''}
    </span>`;

  const showNano = cs.starter.type === 'nano' || cs.starter.type === 'both';
  const showDeposit = cs.starter.type === 'deposit' || cs.starter.type === 'both';

  const coldStartSection = `
  <h2 class="page-title section-heading">Cold-start / no-data policy</h2>
  <p class="page-desc" style="max-width:820px;">Having <em>little</em> data and having <em>no</em> data are different problems. With no data at all, every gate that needs data cannot be answered, so a customer would fail all of them and be shut out permanently. This policy is the lighter path that stops that happening.</p>
  <p class="howto-example" style="max-width:820px;margin-bottom:18px;"><strong>Absence of data must never produce a permanent decline.</strong></p>

  <div style="display:grid;grid-template-columns:1.45fr 1fr;gap:16px;align-items:start;">
    <div style="display:flex;flex-direction:column;gap:16px;">

      <div class="card panel">
        <h3 class="panel-title">Missing data is "unknown", not "fail"</h3>
        <div class="panel-sub" style="margin-bottom:10px;">What the engine does with a check it cannot answer.</div>
        <div class="field-row" style="border-bottom:none;align-items:flex-start;">
          <div style="flex:1;min-width:0;">
            <div class="field-label">Route "unknown" to the cold-start path</div>
            <div class="field-hint" style="text-wrap:pretty;">${cs.unknownIsNotFail
              ? 'A gate that cannot be evaluated because the data is missing returns <strong>unknown</strong>. Unknown is sent down the light path below, not counted as a failure.'
              : '<strong>Warning:</strong> unknown currently counts as a failure. A customer with no data will fail every gate and be declined with no way back. This is the cold-start trap.'}</div>
          </div>
          <button class="switch switch-lg${cs.unknownIsNotFail ? ' on' : ''}" data-action="cs-unknown"
            role="switch" aria-checked="${cs.unknownIsNotFail ? 'true' : 'false'}"
            aria-label="Treat a gate that cannot be evaluated as unknown and route to the cold-start path, rather than failing it"><span class="knob"></span></button>
        </div>
      </div>

      <div class="card panel">
        <h3 class="panel-title">Light entry gates</h3>
        <div class="panel-sub" style="margin-bottom:10px;">Used only when there is no reliable score. A separate, shorter list from the scored path's <span class="nav-link" data-tab="rules">eligibility gates</span>, drawn only from identity and eligibility details a brand-new customer can actually satisfy.</div>
        ${cs.gates.map(gateRow).join('')}
        <div style="margin-top:12px;">
          <button class="add-rule" data-action="cs-add">+ Add light gate</button>
        </div>
        <div class="panel-footnote">🔒 KYC and fraud / AML are non-negotiable. They stay on, cannot be edited away, and cannot be waived by taking a deposit.</div>
      </div>

    </div>

    <div style="display:flex;flex-direction:column;gap:16px;">

      <div class="card panel">
        <h3 class="panel-title">Starter offer</h3>
        <div class="panel-sub" style="margin-bottom:10px;">What a customer who clears the light gates is offered.</div>
        <div class="seg-group cs-types" role="group" aria-label="Starter offer type">${starterButtons}</div>
        ${showNano ? `
        <div class="field-row">
          <div style="flex:1;min-width:0;">
            <div class="field-label">Fixed nano-limit</div>
            <div class="field-hint">A small cash limit, no deposit required.</div>
          </div>
          ${csNum('nanoAmount', cs.starter.nanoAmount, '$', '', 'Fixed nano-limit amount in US dollars')}
        </div>` : ''}
        ${showDeposit ? `
        <div class="field-row">
          <div style="flex:1;min-width:0;">
            <div class="field-label">Required down payment</div>
            <div class="field-hint">Share of the device price paid upfront to open the account.</div>
          </div>
          ${csNum('depositPct', cs.starter.depositPct, '', '%', 'Required down payment percentage')}
        </div>` : ''}
        <div class="field-row" style="border-bottom:none;">
          <div style="flex:1;min-width:0;">
            <div class="field-label">Require device-lock / IMEI control</div>
            <div class="field-hint">The handset can be locked remotely while a starter offer is outstanding.</div>
          </div>
          <button class="switch switch-lg${cs.starter.deviceLock ? ' on' : ''}" data-action="cs-devicelock"
            role="switch" aria-checked="${cs.starter.deviceLock ? 'true' : 'false'}"
            aria-label="Require device-lock or IMEI control for starter offers"><span class="knob"></span></button>
        </div>
      </div>

      <div class="card panel">
        <h3 class="panel-title">Graduation</h3>
        <div class="panel-sub" style="margin-bottom:10px;">How a starter customer earns their way onto the normal path.</div>
        <div class="field-row">
          <div style="flex:1;min-width:0;">
            <div class="field-label">On-time repayments required</div>
            <div class="field-hint">After this many, the customer is scored normally and enters the <span class="nav-link" data-action="cs-goto-ladder">Credit ladder</span>.</div>
          </div>
          ${csNum('onTimeRequired', cs.graduation.onTimeRequired, '', 'repayments', 'On-time repayments required before normal scoring')}
        </div>
      </div>

      <div class="card panel">
        <h3 class="panel-title">If the light gates are not met</h3>
        <div class="panel-sub" style="margin-bottom:10px;">The outcome is a defer, meaning "not yet". It is never a permanent decline.</div>
        <div class="field-row" style="border-bottom:none;">
          <div style="flex:1;min-width:0;">
            <div class="field-label">Re-try horizon</div>
            <div class="field-hint">The customer is invited back after this long, and is told so.</div>
          </div>
          ${csNum('retryDays', cs.defer.retryDays, '', 'days', 'Re-try horizon in days before the customer may apply again')}
        </div>
      </div>

    </div>
  </div>`;

  /* ---------- Shared live preview ---------- */
  const isColdPath = r.tier === 'zero';

  const coldGateChecks = cs.gates.map(g => `
    <label class="fb-check">
      <input type="checkbox" data-change="cs-check" data-gate="${g.id}" ${pv.gates[g.id] === false ? '' : 'checked'}
        aria-label="Sample customer meets ${esc(labelOf(g.param))} ${esc(SENT_OP[g.op] || g.op)} ${esc(g.value)}" />
      <span>${g.locked ? '🔒 ' : ''}${esc(labelOf(g.param))} <span style="color:#667085;">${esc(SENT_OP[g.op] || g.op)} ${esc(g.value)}</span></span>
    </label>`).join('');

  const coldResult = `
    <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;">
      <span class="chip" style="background:${cold.outcome === 'starter' ? '#ECFDF3' : '#FFF8E6'};color:${cold.outcome === 'starter' ? '#067647' : '#7A5B12'};border:1px solid ${cold.outcome === 'starter' ? '#ABEFC6' : '#F5DFA5'};">
        ${cold.outcome === 'starter' ? 'Starter offer' : 'Defer, not declined'}
      </span>
      <span class="chip" style="background:rgba(72,194,207,0.14);color:#144989;border:1px solid rgba(72,194,207,0.5);">score_source: rule-based fallback</span>
    </div>
    <div class="fb-result-row"><span>Path taken</span><strong>No usable data, so the cold-start path</strong></div>
    <div class="fb-result-row"><span>Light gates</span><strong>${cold.met.length} of ${cs.gates.length} met${cold.failed.length ? `, failed: ${esc(cold.failed.map(g => labelOf(g.param)).join(', '))}` : ''}</strong></div>
    ${cold.outcome === 'starter' ? `
      <div class="fb-result-row"><span>Starter offer</span><strong>${esc(cold.offers.join(' or '))}</strong></div>
      <div class="fb-result-row"><span>Device lock</span><strong>${cold.deviceLock ? 'Required while outstanding' : 'Not required'}</strong></div>
      <div class="fb-result-row"><span>Graduation</span><strong>${cold.onTimeRequired} on-time repayments, then scored normally</strong></div>
    ` : `
      <div class="fb-result-row"><span>Outcome</span><strong>Defer for ${cold.retryDays} days, invite back on ${esc(cold.retryOn)}</strong></div>
      ${cold.blockedBy.length ? `<div class="fb-result-row"><span>Blocked by</span><strong>${esc(cold.blockedBy.map(g => labelOf(g.param)).join(', '))} (non-negotiable, no deposit waives this)</strong></div>` : ''}
      ${cold.outcome === 'defer-unconfigured' ? `<div class="fb-result-row"><span>Note</span><strong>Gates are met but no starter offer is configured yet</strong></div>` : ''}
    `}
    <div class="fb-result-row"><span>Probability of default</span><strong>n/a <span style="font-weight:500;color:#667085;">no data to calibrate against</span></strong></div>
    <div class="cs-neverdecline">This is a deferral, not a decline. The customer is never permanently excluded for lacking data.</div>`;

  const pointsResult = `
    <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;">
      <span style="font-size:30px;font-weight:700;color:#101828;font-variant-numeric:tabular-nums;">${r.score}</span>
      <span class="chip" style="background:${BAND_COLORS[r.bandIdx]};color:${inkOn(BAND_COLORS[r.bandIdx])};border:1px solid ${BAND_COLORS[r.bandIdx]};">${esc(r.band.label)}</span>
      <span class="chip" style="background:rgba(72,194,207,0.14);color:#144989;border:1px solid rgba(72,194,207,0.5);">score_source: rule-based fallback</span>
    </div>
    <div class="fb-result-row"><span>Path taken</span><strong>Points scorecard</strong></div>
    <div class="fb-result-row"><span>Coverage tier</span><strong>${tierLabel} · ${r.signals} signal${r.signals === 1 ? '' : 's'}</strong></div>
    <div class="fb-result-row"><span>Recommended limit</span><strong>${esc(r.limit)}</strong></div>
    <div class="fb-result-row"><span>Affordability ceiling</span><strong>${esc(r.afford)}</strong></div>
    <div class="fb-result-row"><span>Probability of default</span><strong>n/a <span style="font-weight:500;color:#667085;">points scorecard, not a calibrated probability</span></strong></div>`;

  const previewPanel = `
  <div class="card panel" style="margin-top:16px;">
    <h2 class="panel-title">Live preview: sample customer</h2>
    <div class="panel-sub" style="margin-bottom:10px;">Untick everything and clear the income to see a customer with no data at all, and the cold-start path they take instead.</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1.1fr;gap:20px;align-items:start;">
      <div>
        <div class="cs-preview-head">Signals held${isColdPath ? ' <span class="cs-dim">(not used on this path)</span>' : ''}</div>
        <div${isColdPath ? ' class="cs-dim-block"' : ''}>
          ${previewChecks}
          <div style="display:flex;align-items:center;gap:8px;margin-top:10px;">
            <span style="font-size:12.5px;color:#344054;font-weight:600;">Income</span>
            <span style="font-size:12.5px;color:#667085;">$</span>
            <input class="fb-tier-input" style="width:64px;" value="${esc(pv.income)}" data-change="fb-income" placeholder="n/a"
              aria-label="Sample customer's inferred monthly income in US dollars: leave blank for unknown" />
            <span style="font-size:11.5px;color:#667085;">blank = unknown</span>
          </div>
        </div>
      </div>
      <div>
        <div class="cs-preview-head">Light gates met${isColdPath ? '' : ' <span class="cs-dim">(not used on this path)</span>'}</div>
        <div${isColdPath ? '' : ' class="cs-dim-block"'}>${coldGateChecks}</div>
      </div>
      <div style="border-left:1px solid #F2F4F7;padding-left:20px;">
        ${isColdPath ? coldResult : pointsResult}
      </div>
    </div>
  </div>`;


  const pointsBlock = `
  <h3 class="panel-title" style="margin-top:6px;">Fallback points scorecard</h3>
  <div class="panel-sub" style="margin-bottom:10px;">For a customer L0 routed as thin file. Points are awarded for whatever the customer can show, summed, and treated as a score on the same 0–1000 scale, then capped because a points total is a rougher guess than a model score.</div>
  ${entryRows}
  <div style="margin-top:12px;display:flex;align-items:center;gap:10px;">
    <button class="add-rule" data-action="fb-add">+ Add signal</button>
    <span style="margin-left:auto;font-size:12.5px;font-weight:700;color:${overScale ? '#7A5B12' : '#344054'};">
      Max achievable: ${maxPts} points${overScale ? ` · capped to ${state.scoreMax}` : ` · within the ${state.scoreMin}–${state.scoreMax} scale`}
    </span>
  </div>`;

  const coverageBlock = `
  <h3 class="panel-title" style="margin-top:18px;">Coverage tiers</h3>
  <div class="panel-sub" style="margin-bottom:6px;">How much data is enough to trust the scorecard.</div>
  ${tierRow('Full fallback', 'Enough signals present: score normally, capped at the thin-file ceiling.', numInput('fullMin', t.fullMin, 'at least&nbsp;signals:'))}
  ${tierRow('Partial coverage', 'Fewer signals: offer capped at 50% of the thin-file ceiling ($' + (Number(t.thinCeiling) / 2) + ').', numInput('partialMin', t.partialMin, 'at least&nbsp;signals:'))}
  ${tierRow('Zero-file', 'Too little data, in particular no inferable income. Skip scoring, assign a flat cold-start minimum.', numInput('zeroMin', t.zeroMin, '$'))}
  ${tierRow('Thin-file ceiling', 'Hard cap on any fallback-scored offer.', numInput('thinCeiling', t.thinCeiling, '$'))}`;

  if (part === 'coverage') return coverageBlock;
  if (part === 'cold') return coldStartSection;
  if (part === 'preview') return previewPanel;
  if (part === 'points') return pointsBlock;
  return coldStartSection + previewPanel;
}


/* ---------- The decision waterfall ---------- */

// A layer setting still waiting on a value from the credit team.
// A rule's value is an object whose fields differ by rule: {sufficiency,
// hardFloor} at L0, {operator, threshold} for a comparison, {value} for a
// scalar. Rather than a bespoke editor per shape, every field gets a labelled
// control, so a rule shape the engine adds later needs no new code here.
const VALUE_LABEL = {
  sufficiency: 'Sufficiency', hardFloor: 'Hard floor', threshold: 'Threshold',
  value: 'Value', months: 'Months', windowDays: 'Window, days',
  maxPoints: 'Maximum points', expectedValue: 'Must be',
  allowedValues: 'Allowed values', floorBehavior: 'Below the floor',
  dormancyThresholdDays: 'Dormant after, days',
  reactivationWindowDays: 'Reactivation window, days',
  reactivationMinActivityCount: 'Minimum activity in the window',
  currentWindowDays: 'Recent window, days', baselineWindowDays: 'Baseline window, days',
  multiplier: 'Multiple of the baseline', operator: 'Comparison',
};
// Rendered by their own panel rather than as plain fields.
const TABLE_FIELDS = ['rows', 'cells', 'cols', 'columns'];

const OP_WORD = { gte: 'at least', lte: 'at most', gt: 'more than', lt: 'less than', eq: 'exactly' };

function settingEntry(layerKey, key) {
  const store = cfg().layers[layerKey] || (cfg().layers[layerKey] = {});
  if (!store[key]) store[key] = { value: {}, enabled: true, action: null };
  return store[key];
}
function settingValue(layerKey, key) {
  return settingEntry(layerKey, key).value || {};
}
// The single number a simple rule carries, whatever field name it uses.
function settingScalar(layerKey, key) {
  const v = settingValue(layerKey, key);
  for (const f of ['value', 'threshold', 'months', 'sufficiency']) {
    if (v[f] !== undefined && v[f] !== null) return v[f];
  }
  return null;
}
function editableFields(v) {
  return Object.keys(v || {}).filter(f => !TABLE_FIELDS.includes(f) && f !== 'operator');
}
// A rule needs attention when a field the engine will read has no value in it.
function settingNeedsValue(def, val) {
  const v = val || {};
  const fields = editableFields(v);
  if (!fields.length) return Object.keys(v).length === 0;
  return fields.some(f => v[f] === null || v[f] === undefined || v[f] === '');
}

function layerSettingDefs(layer) {
  return layer.settings || [];
}

// Every parameter across every layer that still needs a value.
function openParameters() {
  const out = [];
  LAYERS.forEach(l => layerSettingDefs(l).forEach(d => {
    if (settingNeedsValue(d, settingValue(l.key, d.key))) out.push({ layer: l, def: d });
  }));
  return out;
}

// Derived from the band multiplier and the product maximum, then rounded by the
// profile's own rounding rule. Limits only ever go down, so this is a ceiling.
function roundLimit(amount) {
  const rule = settingValue('layer_5', 'limitRoundingIncrement') || '';
  const step = /\$1,/.test(rule) ? 1 : /\$5,/.test(rule) ? 5 : /\$10,/.test(rule) ? 10 : 0;
  if (!step || !isFinite(amount)) return amount;
  return Math.floor(amount / step) * step;
}
function bandLimit(b) {
  if (b.multiplier == null) return null;
  const max = Number(settingValue('layer_5', 'productMaximum'));
  if (!isFinite(max) || !max) return null;
  return roundLimit(b.multiplier * max);
}
function bandLimitLabel(b) {
  const v = bandLimit(b);
  return v == null ? 'n/a' : `$${v}`;
}

// Settings sharing an overlap tag are set independently in different layers.
function overlapPeers(tag) {
  const peers = [];
  LAYERS.forEach(l => (l.settings || []).forEach(d => {
    if (d.overlap === tag) peers.push({ layer: l, def: d, value: settingValue(l.key, d.key) });
  }));
  return peers;
}
// The draft also gates account age through L1 and L2 rules, not just settings.
function tenureOverlapRows() {
  const rows = overlapPeers('tenure').map(p => ({
    where: `${p.layer.num} setting`, what: p.def.label, value: p.value ? `${p.value} days` : 'not set',
  }));
  cfg().rules.filter(r => ['tenure', 'sim'].includes(r.param) && ['l1', 'l2'].includes(r.section))
    .forEach(r => rows.push({
      where: `${(LAYERS.find(l => l.key === r.section) || {}).num} rule ${r.code}`,
      what: labelOf(r.param), value: r.value,
    }));
  return rows;
}

function fieldControl(layerKey, key, field, val, label) {
  const common = `data-change="rule-field" data-list="${layerKey}" data-key="${esc(key)}" data-field="${esc(field)}"`;
  const name = `${label} for ${key.replace(/_/g, ' ')}`;
  if (typeof val === 'boolean') {
    return `<button class="switch switch-lg${val ? ' on' : ''}" data-action="rule-flag"
      data-list="${layerKey}" data-key="${esc(key)}" data-field="${esc(field)}"
      role="switch" aria-checked="${val ? 'true' : 'false'}" aria-label="${esc(name)}"><span class="knob"></span></button>`;
  }
  if (Array.isArray(val)) {
    return `<input class="lim-text" value="${esc(val.join(', '))}" placeholder="none set"
      ${common} data-array="1" aria-label="${esc(name)}" />`;
  }
  if (typeof val === 'string') {
    return `<input class="lim-text" value="${esc(val)}" placeholder="not set" ${common} aria-label="${esc(name)}" />`;
  }
  return `<span class="val-num lim-num">
    <input type="number" step="any" class="val-input" value="${val === null || val === undefined ? '' : esc(val)}"
      placeholder="not set" ${common} aria-label="${esc(name)}" />
  </span>`;
}

// Every field of the rule's value, each labelled, plus the comparison word when
// the rule carries one so the row reads as a sentence rather than a number.
function settingEditor(layerKey, d) {
  const v = settingValue(layerKey, d.key);
  const fields = editableFields(v);
  if (!fields.length) return `<span class="readonly-value">set in the table below</span>`;
  const op = v.operator ? `<span class="val-unit">${esc(OP_WORD[v.operator] || v.operator)}</span>` : '';
  return `<span class="rule-fields">${op}${fields.map(f => `
    <span class="rule-field">
      <span class="rule-field-label">${esc(VALUE_LABEL[f] || f)}</span>
      ${fieldControl(layerKey, d.key, f, v[f], VALUE_LABEL[f] || f)}
    </span>`).join('')}</span>`;
}

/* ---------- One row type for every parameter ---------- */

// Settings and conditions are the same thing: a parameter with a value. They
// render identically. What a condition carries extra (operator, action, reason
// code) hides behind a details disclosure, because it is rarely changed.
function paramRow(opts) {
  const { id, name, meaning, control, tags = '', on = null, onAction = '', details = '', open = false, warn = '' } = opts;
  return `
  <div class="prow${warn ? ' prow-warn' : ''}${on === false ? ' prow-off' : ''}">
    <div class="prow-main">
      ${on === null ? '' : `
        <button class="switch${on ? ' on' : ''}" style="margin-top:0;" ${onAction}
          role="switch" aria-checked="${on ? 'true' : 'false'}"
          aria-label="${esc(name)} enabled"><span class="knob"></span></button>`}
      <div class="prow-text">
        <div class="prow-name">${esc(name)}${tags}</div>
        <div class="prow-meaning">${meaning}</div>
      </div>
      <div class="prow-value">${control}</div>
      ${details ? `
        <button class="prow-more${open ? ' is-open' : ''}" data-action="row-details" data-row="${esc(id)}"
          aria-expanded="${open ? 'true' : 'false'}" aria-label="More options for ${esc(name)}">${open ? 'Less' : 'More'}</button>` : ''}
    </div>
    ${warn ? `<div class="prow-warnline">${warn}</div>` : ''}
    ${details && open ? `<div class="prow-details">${details}</div>` : ''}
  </div>`;
}

// A layer setting, as a parameter row.
function settingRow(layerKey, d) {
  const val = settingValue(layerKey, d.key);
  const needs = settingNeedsValue(d, val);
  const tags = [
    d.essential ? '<span class="tag-essential">Credit team</span>' : '',
    needs ? '<span class="tag-open">Needs a value</span>' : '',
    d.overlap ? `<button class="tag-overlap" data-action="show-overlap" data-tag="${esc(d.overlap)}">Also set at another layer</button>` : '',
  ].join('');
  const entry = settingEntry(layerKey, d.key);
  return paramRow({
    id: `${layerKey}.${d.key}`, name: d.label, meaning: esc(d.meaning),
    control: settingEditor(layerKey, d), tags,
    on: entry.enabled !== false,
    onAction: `data-action="rule-enabled" data-list="${layerKey}" data-key="${esc(d.key)}"`,
  });
}

// A condition, as the same parameter row. The sentence is the meaning.
function conditionRow(r, layerKey) {
  const badParam = !paramValidIn(r.param, layerKey);
  const badAction = !actionValidIn(r.action, layerKey);
  const badOp = !operatorValidFor(r.op, r.param);
  const warn = badParam
    ? `⚠ <strong>${esc(labelOf(r.param))}</strong> is not available at ${esc(layerKey.toUpperCase())}.`
    : badAction ? `⚠ <strong>${esc(ACTLABEL[r.action] || r.action)}</strong> is not available at ${esc(layerKey.toUpperCase())}.`
    : badOp ? `⚠ <strong>${esc(OPLABEL[r.op] || r.op)}</strong> does not apply to this kind of value.` : '';

  const paramOptions = PARAM_GROUPS.map(([g, gLabel]) => {
    const o = paramsForSection(layerKey).filter(d => d.group === g);
    return o.length ? `<optgroup label="${esc(gLabel)}">${optionGroup(o.map(d => [d.key, d.label]), r.param)}</optgroup>` : '';
  }).join('') + (badParam ? `<option value="${esc(r.param)}" selected>${esc(labelOf(r.param))} (not available here)</option>` : '');

  const details = `
    <div class="pd-grid">
      <label class="pd-field"><span>What to check</span>
        <select data-change="rule-param" data-rule="${r.id}" aria-label="Parameter for rule ${esc(r.code)}">${paramOptions}</select></label>
      <label class="pd-field"><span>Test</span>
        <select data-change="rule-op" data-rule="${r.id}" aria-label="Test for rule ${esc(r.code)}">${optionGroup(operatorsForParam(r.param), r.op)}</select></label>
      <label class="pd-field"><span>Then</span>
        <select data-change="rule-action" data-rule="${r.id}" aria-label="Outcome for rule ${esc(r.code)}">${optionGroup(actionsForSection(layerKey), r.action)}${badAction ? `<option value="${esc(r.action)}" selected>${esc(ACTLABEL[r.action] || r.action)} (not available here)</option>` : ''}</select></label>
      <label class="pd-field pd-wide"><span>Reason code recorded if this decides the outcome</span>
        <select data-change="rule-rc" data-rule="${r.id}" aria-label="Reason code for rule ${esc(r.code)}">
          <option value=""${r.rc ? '' : ' selected'}>(no code)</option>
          ${state.reasonCodes.filter(c => c.kind === 'rule' && (c.active || c.code === r.rc))
            .map(c => `<option value="${esc(c.code)}"${c.code === r.rc ? ' selected' : ''}>${esc(c.code)} · ${esc(c.label)}</option>`).join('')}
        </select></label>
    </div>
    <div class="pd-foot">
      <span class="rule-code">${esc(r.code)}</span>
      <button class="btn btn-outline btn-sm" data-action="remove-rule" data-rule="${r.id}">Remove this condition</button>
    </div>`;

  return paramRow({
    id: r.id, name: labelOf(r.param), meaning: esc(sentence(r)),
    control: valueEditor(r), tags: '', on: r.enabled,
    onAction: `data-action="toggle-rule" data-rule="${r.id}"`,
    details, open: !!state.rowOpen[r.id], warn,
  });
}

/* ---------- Score bands ---------- */


// L5 owns which repayment periods may be offered at all. A band picks from that
// list rather than holding a free number, so an unofferable term is impossible.
function permittedTerms() {
  const raw = String(settingValue('layer_5', 'permittedTenures') || '');
  const nums = (raw.match(/\d+/g) || []).map(Number).filter(n => n > 0);
  return [...new Set(nums)].sort((a, b) => a - b);
}

// L5's deposit floor is a minimum applied whatever the band says, so the floor
// wins when it is higher. The band keeps its own value; this is what is offered.
function effectiveDeposit(b) {
  const floor = Number(settingValue('layer_5', 'depositFloorPct'));
  if (b.deposit == null) return null;
  return isFinite(floor) ? Math.max(b.deposit, floor) : b.deposit;
}
function depositFloorBinds(b) {
  const floor = Number(settingValue('layer_5', 'depositFloorPct'));
  return b.deposit != null && isFinite(floor) && floor > b.deposit;
}

function renderBandTable() {
  const bands = cfg().bands;
  const s = state;
  const span = Math.max(1, s.scoreMax - s.scoreMin);
  const productMax = Number(settingValue('layer_5', 'productMaximum'));

  const segs = bands.map((b, i) => {
    const next = i + 1 < bands.length ? bands[i + 1].floor : s.scoreMax;
    const pct = ((next - b.floor) / span) * 100;
    return `<div class="band-seg" style="width:${pct}%;background:${BAND_COLORS[i]};">
      <div class="band-seg-label" style="color:${inkOn(BAND_COLORS[i])};">${esc(b.label)}</div>
      <div class="band-seg-range" style="color:${inkOnMuted(BAND_COLORS[i])};">${b.floor} – ${next}</div>
    </div>`;
  }).join('');

  const handles = bands.slice(1).map((b, idx) => {
    const i = idx + 1;
    return `<div class="band-handle" data-handle="${i}" style="left:${((b.floor - s.scoreMin) / span) * 100}%;"
      role="slider" tabindex="0" aria-label="Floor of the ${esc(b.label)} band"
      aria-valuemin="${bands[i - 1].floor + 20}" aria-valuemax="${(i + 1 < bands.length ? bands[i + 1].floor : s.scoreMax) - 20}"
      aria-valuenow="${b.floor}">
      <div class="band-handle-bar"></div><div class="band-handle-value">${b.floor}</div></div>`;
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
      <div>${b.multiplier == null ? '<span style="color:#667085;">n/a</span>' : `
        <input type="number" min="0" max="1" step="0.05" class="val-input band-input" value="${b.multiplier}"
          data-change="band-multiplier" data-idx="${i}" aria-label="Limit multiplier for the ${esc(b.label)} band" />`}</div>
      <div style="font-size:13px;font-weight:600;color:#101828;font-variant-numeric:tabular-nums;">${esc(bandLimitLabel(b))}</div>
      <div>${b.maxTenure == null ? '<span style="color:#667085;">n/a</span>' : (() => {
        const terms = permittedTerms();
        // Until L5 says which terms may be offered there is nothing to check a
        // band against, so an unset list is treated as "not constrained yet"
        // rather than as every band being wrong.
        const ok = !terms.length || terms.includes(Number(b.maxTenure));
        return `<select class="band-input${ok ? '' : ' field-invalid'}" data-change="band-tenure" data-idx="${i}"
          aria-label="Maximum loan term for the ${esc(b.label)} band, chosen from the terms permitted at L5">
          ${terms.map(t => `<option value="${t}"${Number(b.maxTenure) === t ? ' selected' : ''}>${t} mo</option>`).join('')}
          ${terms.includes(Number(b.maxTenure)) ? '' : `<option value="${esc(b.maxTenure)}" selected>${esc(b.maxTenure)} mo${terms.length ? ' (not permitted)' : ''}</option>`}
        </select>`;
      })()}</div>
      <div>${b.deposit == null ? '<span style="color:#667085;">n/a</span>' : `
        <span class="dep-cell">
          <input type="number" min="0" max="100" step="5" class="val-input band-input" value="${b.deposit}"
            data-change="band-deposit" data-idx="${i}" aria-label="Deposit percentage for the ${esc(b.label)} band" />
          ${depositFloorBinds(b) ? `<span class="dep-floor" title="The L5 deposit floor is higher than this band's own figure, so the floor is what is offered">floor ${effectiveDeposit(b)}%</span>` : ''}
        </span>`}</div>
      <div style="font-size:13px;color:#344054;font-variant-numeric:tabular-nums;">${stats[i].badRate == null ? 'n/a' : stats[i].badRate + '%'}</div>
      <div style="display:flex;align-items:center;gap:8px;">
        <div class="pop-track"><div class="pop-fill" style="width:${stats[i].pop * 2.6}%;background:${BAND_COLORS[i]};"></div></div>
        <span style="font-size:12px;color:#667085;font-variant-numeric:tabular-nums;width:38px;text-align:right;">${stats[i].pop}%</span>
      </div>
    </div>`).join('');

  return `
  <h3 class="panel-title" style="margin-top:6px;">Score bands</h3>
  <div class="panel-sub" style="margin-bottom:10px;">Each band carries a decision and terms that tighten as risk rises. The limit is a multiplier of the product maximum${isFinite(productMax) && productMax ? ` of $${productMax}` : ''}, set in <span class="nav-link" data-layer="l5">L5</span>, so changing that figure rescales every band at once.</div>
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
      <div>Band</div><div>Score floor</div><div>Decision</div><div>Multiplier</div><div>Limit</div>
      <div>Max tenure</div><div>Deposit</div><div>Bad rate</div><div>Population</div>
    </div>
    ${rows}
  </div>
  <div style="margin-top:10px;font-size:11.5px;color:#667085;">Bad rate is measured by the shared model; use it to justify where each band floor sits. Limit is the multiplier applied to the product maximum, rounded by the L5 rounding rule. Loan terms are chosen from the terms permitted at <span class="nav-link" data-layer="l5">L5</span>, and the L5 deposit floor overrides a band deposit that sits below it.</div>`;
}



/* ---------- L0: the three paths, each with its own configuration ---------- */

function draftRef(ref) {
  return ref ? `<span class="draft-ref" title="Section of the Technodysis rule engine draft">draft ${esc(ref)}</span>` : '';
}

function pathPanel(layer) {
  const c = cfg();
  const thin = layer.thinFile || [];
  const csOn = c.coldStart.gates.length;
  const fbOn = c.fallback.entries.filter(e => e.enabled).length;
  const t = c.fallback.tiers;

  const paths = [
    {
      key: 'scored', label: 'Scored', ref: '§2',
      lead: 'Enough data to use the model. Continues to L1, then scored normally at L3.',
      summary: `${(layer.settings || []).length} thresholds`,
      body: () => `
        <p class="path-note">These thresholds decide whether the model score can be trusted at all. Fail any and the customer drops to one of the paths below.</p>
        ${(layer.settings || []).map(d => settingRow(layer.key, d)).join('')}`,
    },
    {
      key: 'thin', label: 'Thin file', ref: '§5.1',
      lead: 'Some data, but not enough to score reliably. Scored on points instead, and capped.',
      summary: `${fbOn} signals · ladder to $${settingValue(layer.key, 'ladderCeiling') || '0'}`,
      body: () => `
        <p class="path-note">The engine does not guess. It awards points for whatever the customer can show, treats the total as a score on the same scale, and raises the limit only as they demonstrate repayment.</p>
        ${renderFallback('points')}
        ${renderFallback('coverage')}
        <h4 class="path-sub">The ladder ${draftRef('§5.1')}</h4>
        ${thin.map(d => settingRow(layer.key, d)).join('')}`,
    },
    {
      key: 'insufficient', label: 'Insufficient data', ref: 'Ecocash extension',
      lead: 'Too little data to score at all. A short, cautious path so no customer is permanently locked out.',
      summary: `${csOn} light gates · defer ${c.coldStart.defer.retryDays} days`,
      body: () => renderFallback('cold'),
    },
  ];

  return `
  <div class="paths">
    <div class="paths-head">
      <h3 class="panel-title">Which path does this customer take?</h3>
      <div class="panel-sub">Exactly one of the three. Everything each path does is configured inside it.</div>
    </div>
    ${paths.map(p => {
      const open = !!state.pathOpen[p.key];
      return `
      <div class="path path-${p.key}${open ? ' is-open' : ''}">
        <button class="path-head" data-action="toggle-path" data-path="${p.key}" aria-expanded="${open ? 'true' : 'false'}">
          <span class="path-dot"></span>
          <span class="path-text">
            <span class="path-label">${esc(p.label)} ${draftRef(p.ref)}</span>
            <span class="path-lead">${esc(p.lead)}</span>
          </span>
          <span class="path-summary">${esc(p.summary)}</span>
          <span class="path-chev" aria-hidden="true">${open ? '▲' : '▼'}</span>
        </button>
        ${open ? `<div class="path-body">${p.body()}</div>` : ''}
      </div>`;
    }).join('')}
  </div>
  ${renderFallback('preview')}`;
}

/* ---------- Waterfall screen ---------- */

function layerRuleRows(layerKey) {
  const c = cfg();
  const rules = c.rules.filter(r => r.section === layerKey);
  if (!rules.length) return '';
  return `
  <h3 class="panel-title" style="margin-top:18px;">Conditions</h3>
  <div class="panel-sub" style="margin-bottom:6px;">Each reads as a sentence. Parameters come from <span class="nav-link" data-nav="params">Global setup</span>; only those valid in ${esc(layerKey.toUpperCase())} are offered.</div>
  ${rules.map(r => conditionRow(r, layerKey)).join('')}
  <div class="add-rule-wrap" style="padding-left:0;">
    <button class="add-rule" data-action="add-rule" data-section="${layerKey}">+ Add condition to ${esc(layerKey.toUpperCase())}</button>
  </div>`;
}

function layerCard(layer, i) {
  const c = cfg();
  const open = !!c.open[layer.key];
  const rules = c.rules.filter(r => r.section === layer.key);
  const enabled = rules.filter(r => r.enabled).length;
  const defs = layerSettingDefs(layer);
  const openCount = defs.filter(d => settingNeedsValue(d, settingValue(layer.key, d.key))).length;
  const showAll = !!state.layerShowAll[layer.key];
  // Essentials, anything still unset, and anything flagged as overlapping
  // another layer stay visible; the rest hide behind "show all".
  const visible = showAll ? defs : defs.filter(d =>
    d.essential || d.overlap || settingNeedsValue(d, settingValue(layer.key, d.key)));
  const hidden = defs.length - visible.length;

  // A disabled rule is never evaluated and never appears as a reason for a
  // decision (§6.12), so the count of what is actually live is worth showing.
  const live = defs.filter(d => settingEntry(layer.key, d.key).enabled !== false).length;
  const summary = [
    defs.length ? `${live} of ${defs.length} rule${defs.length === 1 ? '' : 's'} on` : '',
    layer.profile ? 'product profile' : '',
  ].filter(Boolean).join(' · ');

  const core = layer.settings || [];
  const thin = layer.thinFile || [];
  const visibleIn = list => list.filter(d => visible.includes(d));

  const body = !open ? '' : `
  <div class="layer-body">
    <p class="layer-intro">${esc(layer.intro)}</p>

    ${defs.length && layer.key !== 'l0' ? `
      <div class="layer-settings-head">
        <h3 class="panel-title">Settings</h3>
        ${hidden > 0 || showAll ? `<button class="btn btn-outline btn-sm" data-action="layer-showall" data-list="${layer.key}">${showAll ? 'Show essentials only' : `Show all ${defs.length}`}</button>` : ''}
      </div>
      ${visibleIn(core).map(d => settingRow(layer.key, d)).join('')}
      ${hidden > 0 && !showAll ? `<div class="layer-hidden-note">${hidden} more setting${hidden === 1 ? '' : 's'} hidden. These carry a working default and are rarely changed.</div>` : ''}
    ` : ''}

    ${layer.key === 'l0' ? pathPanel(layer) : ''}
    ${layer.key === 'l3' ? renderBandTable() : ''}

    ${false && thin.length && visibleIn(thin).length ? `
      <h3 class="panel-title" style="margin-top:18px;">Thin-file ladder</h3>
      <div class="panel-sub" style="margin-bottom:6px;">Where there is too little data to score reliably the engine does not guess. It offers a small, short, cautious amount and raises the limit as the customer demonstrates repayment. Every completed cycle produces exactly the repayment data the model needs.</div>
      ${visibleIn(thin).map(d => settingRow(layer.key, d)).join('')}
      <div class="explainer-note" style="margin-top:12px;">The cold-start policy for a customer with <em>no</em> data at all, including the light entry gates and the never-a-permanent-decline rule, is configured on <span class="nav-link" data-tab="waterfall" data-layer="l0">L0</span> routing and the <span class="nav-link" data-action="open-coldstart">cold-start policy</span>.</div>
    ` : ''}

    ${layer.key === 'l5' ? `
      <div class="limit-formula">
        <div class="lf-title">final limit = MINIMUM of</div>
        <div class="lf-terms">${LIMIT_FORMULA.map(t => `<span class="lf-term">${esc(t)}</span>`).join('<span class="lf-comma">,</span>')}</div>
        <div class="lf-note">Limits only ever go down. L3 produces the indicative offer; L4, L5 and L6 can each reduce it and none can raise it.</div>
      </div>` : ''}

    ${layerRuleRows(layer.key)}
  </div>`;

  return `
  <div class="card section-card layer-card" data-layer="${layer.key}">
    <div class="section-head" data-action="toggle-section" data-section="${layer.key}"
      role="button" tabindex="0" aria-expanded="${open ? 'true' : 'false'}"
      aria-label="${esc(layer.num)}, ${esc(layer.title)}. ${esc(summary)}. ${openCount ? openCount + ' need a value. ' : ''}${open ? 'Collapse' : 'Expand'}."
      style="border-bottom:${open ? '1px solid #E4E7EC' : 'none'};">
      <div class="section-num layer-num">${esc(layer.num)}</div>
      <div style="min-width:0;">
        <h2 class="section-title">${esc(layer.title)} ${draftRef(layer.ref)}</h2>
        <div class="section-desc">${esc(layer.question)}</div>
      </div>
      <div style="margin-left:auto;display:flex;align-items:center;gap:10px;">
        ${openCount ? `<span class="chip tag-open">${openCount} need a value</span>` : ''}
        ${layer.canStop ? '<span class="chip chip-stop" title="This layer can end the assessment">Can stop</span>' : ''}
        <span class="section-count">${esc(summary)}</span>
        <span class="section-chevron" aria-hidden="true">${open ? '▲' : '▼'}</span>
      </div>
    </div>
    ${body}
  </div>`;
}

function renderWaterfall() {
  const openParams = openParameters();
  const allOpen = LAYER_KEYS.every(k => cfg().open[k]);

  const overlapPanel = state.overlapTag ? (() => {
    const g = OVERLAP_GROUPS.find(x => x.tag === state.overlapTag);
    const rows = tenureOverlapRows();
    return `
    <div class="overlap-panel">
      <div class="overlap-head"><strong>${esc(g.label)}</strong>
        <button class="rule-remove" data-action="hide-overlap" aria-label="Dismiss">×</button></div>
      <div class="overlap-note">${esc(g.note)}</div>
      <table class="overlap-table"><tbody>
        ${rows.map(r => `<tr><td>${esc(r.where)}</td><td>${esc(r.what)}</td><td><strong>${esc(r.value)}</strong></td></tr>`).join('')}
      </tbody></table>
    </div>`;
  })() : '';

  return `
  <div class="page-head" style="margin-bottom:14px;">
    <div>
      <h1 class="page-title">Decision waterfall</h1>
      <p class="page-desc" style="max-width:820px;">Every parameter the engine uses, in the order it evaluates them. A customer runs from L0 down, and the first layer that decides, decides.</p>
    </div>
    <div class="page-head-actions">
      ${openParams.length
        ? `<button class="btn btn-outline btn-open-filter${state.showOpenOnly ? ' is-on' : ''}" data-action="toggle-open-only">${state.showOpenOnly ? 'Showing' : 'Show'} ${openParams.length} needing a value</button>`
        : `<span class="chip" style="background:#ECFDF3;color:#067647;border:1px solid #ABEFC6;">All parameters set</span>`}
      <button class="btn btn-outline" style="padding:8px 14px;font-size:12.5px;" data-action="expand-all">${allOpen ? 'Collapse all' : 'Expand all'}</button>
    </div>
  </div>

  <div class="invariants">
    ${ENGINE_INVARIANTS.map(([t, d]) => `
      <div class="invariant"><div class="inv-title">${esc(t)}</div><div class="inv-note">${esc(d)}</div></div>`).join('')}
  </div>

  ${overlapPanel}

  ${state.showOpenOnly ? `
    <div class="card panel" style="margin-bottom:14px;">
      <h2 class="panel-title">Still needs a value from the credit team</h2>
      <div class="panel-sub" style="margin-bottom:10px;">Publication is blocked until these are set. Several depend on the score distribution, which follows model training.</div>
      ${openParams.map(({ layer, def }) => `
        <div class="field-row">
          <div style="flex:1;min-width:0;">
            <div class="field-label"><span class="open-layer">${esc(layer.num)}</span> ${esc(def.label)}
              ${def.essential ? '<span class="tag-essential">Credit team</span>' : ''}</div>
            <div class="field-hint">${esc(def.meaning)}</div>
          </div>
          ${settingEditor(layer.key, def)}
        </div>`).join('')}
    </div>` : ''}

  ${LAYERS.map(layerCard).join('')}`;
}

/* ---------- Setup progress ---------- */

// Each step's state is derived from the profile's own configuration, so the
// strip reports what is actually set up rather than what someone clicked.
function stepState(key) {
  const c = cfg();
  const p = activeProfile();
  switch (key) {
    case 'waterfall': {
      const open = openParameters().length;
      const rules = c.rules.length;
      const invalid = c.rules.filter(r => !paramValidIn(r.param, r.section) || !actionValidIn(r.action, r.section)).length;
      if (!rules && open) return { state: 'todo', note: 'Nothing configured yet' };
      if (open) return { state: 'partial', note: `${open} need a value` };
      if (invalid) return { state: 'partial', note: `${invalid} condition${invalid === 1 ? '' : 's'} need attention` };
      return { state: 'done', note: 'All parameters set' };
    }
    // Assessing is a check rather than a setting, so this step is complete once
    // an applicant has actually been run and the note carries what it concluded.
    case 'assess': {
      if (!c.touched.assess) return { state: 'todo', note: 'No customer assessed yet' };
      const r = assess();
      return { state: 'done', note: `${r.outcome.label} at ${r.outcome.at}` };
    }
    case 'simulate':
      return c.touched.simulate ? { state: 'done', note: 'Simulation run' } : { state: 'todo', note: 'Not run yet' };
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

// The steps ARE the tabs, so there is no second list of the same destinations,
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
  waterfall: () => renderWaterfall(),
  assess: () => renderAssess(),
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
      ? `Step ${s.num} of ${steps.length}: ${label}. ${s.note}`
      : `${label}, published version history`;
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
      Not ready to publish yet. Finish ${blockers.map(b => `<strong>${esc(b)}</strong>`).join(', ')} first.
      A checker cannot approve a profile with an unconfigured step.
    </div>` : '';

  // The pill in the header and the dimmed controls already say "read-only";
  // the banner only appears the first time this profile is opened.
  const banner = state.mode === 'view' && state.showBanner ? `
    <div class="view-banner">
      <span>Viewing <strong>${esc(p.name)} ${esc(p.version)}</strong>: read-only. Nothing here can be changed until you switch to editing.</span>
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
  return `<div class="global-note">Global setup: shared by every product. Change once, applies everywhere. Not versioned per profile.</div>`;
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
        <input class="score-input" value="${s.scoreMin}" data-change="score-min" aria-label="Shared model score range: minimum score" />
        <span style="color:#667085;font-size:12.5px;" aria-hidden="true">to</span>
        <input class="score-input" value="${s.scoreMax}" data-change="score-max" aria-label="Shared model score range: maximum score" />
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
      <div class="field-value" style="${vals ? '' : 'color:#5D6B82;background:#F2F4F7;border-color:#E4E7EC;'}">${vals ? esc(vals[key]) : 'n/a'}</div>
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
  <p class="page-desc" style="margin-bottom:20px;">Quality metrics for the shared scoring model. Read-only for policy users; retraining and recalibration belong to Data Science.</p>
  ${globalBadge()}

  ${liveReady ? '' : `<div class="blast-note" style="margin:0 0 16px 0;max-width:1000px;">Validation only. Live metrics available after go-live and first device outcomes. Targets to be confirmed after first training run.</div>`}

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
      <div class="panel-sub" style="margin-bottom:10px;">Default rate rises as the score falls, so rank ordering holds across every band.</div>
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
  <p class="page-desc" style="max-width:860px;">This is the vocabulary every product's rules are written in: each customer detail the engine can look at, named once, here. Rename one and every rule sentence that uses it updates everywhere at once.</p>
  <ol class="howto" style="max-width:860px;margin-bottom:18px;">
    <li><strong>The name</strong> is what appears in rule sentences. Change it here, never in a rule.</li>
    <li><strong>The type</strong> decides what a rule can do with it. Money gets a currency box, a category gets a list to pick from, and so on. Set on creation.</li>
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
          <span class="rc-field-label">Internal label for administrator &amp; agent</span>
          <input value="${esc(rc.label)}" data-change="rc-label" data-code="${esc(rc.code)}"
            aria-label="Internal label for reason code ${esc(rc.code)}: administrator and agent" />
        </label>
        <label class="rc-field">
          <span class="rc-field-label">Consumer message (optional)</span>
          <input value="${esc(rc.consumer)}" placeholder="Leave blank so it is never shown to the customer" data-change="rc-consumer" data-code="${esc(rc.code)}"
            aria-label="Consumer message for reason code ${esc(rc.code)}: optional" />
        </label>
        <div class="rc-usage">${usage}</div>
      </div>
      <button class="version-action rc-toggle" data-action="rc-toggle" data-code="${esc(rc.code)}"
        aria-label="${rc.active ? 'Deactivate' : 'Reactivate'} reason code ${esc(rc.code)}: ${esc(rc.label)}">${rc.active ? 'Deactivate' : 'Reactivate'}</button>
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
    This catalogue holds wording only. It does not decide anything. A code is attached to a rule in that profile's <span class="nav-link" data-tab="rules">Rules</span> tab, or to a model factor below, and the engine emits it when that rule or factor determines the outcome.
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
        <div class="version-summary">${esc(u.team)}. ${esc(u.detail)}</div>
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
  <p class="page-desc" style="margin-bottom:20px;">Maker-checker roles apply across every product. The audit log records every change in every profile and in global setup.</p>
  ${globalBadge()}

  <div class="versions-grid">
    <div class="card list-card">
      <h2 class="list-card-head">Users &amp; roles</h2>
      ${userRows}
    </div>
    <div class="card list-card">
      <h2 class="list-card-head">Audit log, all products</h2>
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
            <option value=""${dup ? '' : ' selected'}>Blank profile with no rules yet</option>
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
        <h2 class="modal-title" id="modalTitle">Send ${esc(p.name)} ${esc(p.version === 'n/a' ? 'v0.1' : p.version)} for approval</h2>
        <div class="modal-sub">Maker-checker: a second approver must sign off before this goes live.</div>
      </div>
      <div class="modal-body">
        <div class="modal-summary">${esc(deltaSummary())}</div>
        <label>Approver
          <select aria-label="Approver: the checker who must sign this off">
            <option>R. Chikanda, Head of Credit</option>
            <option>N. Dube, Risk Governance</option>
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
  if (state.profileTab === 'assess') cfg().touched.assess = true;
  render();
}

// "Now on step 3 of 7, Fallback scorecard": spoken, not just shown.
function announceStep(key) {
  const steps = setupSteps();
  const s = steps.find(x => x.key === key);
  const tab = PROFILE_TABS.find(([k]) => k === key);
  if (s) announce(`Now on step ${s.num} of ${steps.length}, ${s.label}. ${s.note}`);
  else if (tab) announce(`Now on ${tab[1]}`);
}

function goToTab(key) {
  state.profileTab = key;
  if (key === 'assess') cfg().touched.assess = true;
  state.confirmRemove = null;
  state.setupNag = false;
  render();
  announceStep(key);
}

// render() replaces innerHTML wholesale, which would drop focus to <body> after
// every edit and eject a keyboard user to the top of the document. Identify the
// focused control by its data-* signature, then restore it afterwards.
// Must cover every data-* attribute that identifies a control, or the signature
// matches several elements and focus lands on the wrong one, or on a disabled one.
const FOCUS_KEYS = ['change', 'action', 'input', 'nav', 'tab', 'step', 'section',
  'rule', 'entry', 'gate', 'key', 'code', 'param', 'list', 'field', 'col', 'row',
  'val', 'type', 'idx', 'handle', 'layer', 'path'];

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
  // A disabled match would silently swallow the focus and leave it on <body>.
  if (!el || el.disabled) return;
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
  const layerLink = e.target.closest('[data-layer]:not(.layer-card):not([data-action])');
  if (layerLink && layerLink.dataset.layer && !layerLink.closest('.layer-card > .section-head')) {
    const k = layerLink.dataset.layer;
    if (LAYER_KEYS.includes(k)) {
      cfg().open[k] = true; state.profileTab = 'waterfall'; render();
      const card = $view.querySelector(`.layer-card[data-layer="${k}"]`);
      if (card) card.scrollIntoView({ block: 'start' });
      return;
    }
  }

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
      const all = LAYER_KEYS.every(k => cfg().open[k]);
      LAYER_KEYS.forEach(k => { cfg().open[k] = !all; });
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
    case 'layer-toggle': {
      const store = cfg().layers[el.dataset.list] || (cfg().layers[el.dataset.list] = {});
      store[el.dataset.key] = !store[el.dataset.key];
      markDirty(); render(); break;
    }
    case 'toggle-path':
      state.pathOpen[el.dataset.path] = !state.pathOpen[el.dataset.path];
      render(); break;
    case 'row-details':
      state.rowOpen[el.dataset.row] = !state.rowOpen[el.dataset.row];
      render(); break;
    case 'layer-showall':
      state.layerShowAll[el.dataset.list] = !state.layerShowAll[el.dataset.list];
      render(); break;
    case 'toggle-open-only':
      state.showOpenOnly = !state.showOpenOnly;
      announce(state.showOpenOnly
        ? `Showing the ${openParameters().length} parameters still needing a value.`
        : 'Showing every layer.');
      render(); break;
    case 'show-overlap':
      state.overlapTag = el.dataset.tag; render(); break;
    case 'hide-overlap':
      state.overlapTag = null; render(); break;
    case 'open-coldstart':
      cfg().open.l0 = true; state.profileTab = 'waterfall'; render(); break;
    case 'fb-add':
      cfg().fallback.entries.push({ id: 'fn' + Date.now(), param: 'tenure', op: 'gte', value: '6 months', points: 50, note: '', enabled: true });
      markDirty(); render(); break;

    /* ---------- Cold-start policy ---------- */
    case 'cs-unknown':
      cfg().coldStart.unknownIsNotFail = !cfg().coldStart.unknownIsNotFail;
      announce(cfg().coldStart.unknownIsNotFail
        ? 'Unknown is routed to the cold-start path.'
        : 'Warning: unknown now counts as a failure, which can exclude a customer permanently.');
      markDirty(); render(); break;
    case 'cs-add': {
      const d = paramsForSection('coldstart')[0];
      const ops = TYPE_OPERATORS[d ? d.type : ''] || ['gte'];
      cfg().coldStart.gates.push({
        id: 'cg' + Date.now(), param: d ? d.key : '', op: ops[0],
        value: d && d.type === 'category' ? (d.values || [''])[0] : joinValue('', '0', d && d.unit ? d.unit : ''),
        locked: false, note: '',
      });
      markDirty(); render(); break;
    }
    case 'cs-remove': {
      const g = cfg().coldStart.gates.find(x => x.id === el.dataset.gate);
      // Non-negotiable gates are not removable, whatever the DOM says.
      if (g && !g.locked) {
        cfg().coldStart.gates = cfg().coldStart.gates.filter(x => x.id !== g.id);
        markDirty();
      }
      render(); break;
    }
    case 'cs-type':
      cfg().coldStart.starter.type = el.dataset.type;
      markDirty(); render(); break;
    case 'cs-devicelock':
      cfg().coldStart.starter.deviceLock = !cfg().coldStart.starter.deviceLock;
      markDirty(); render(); break;
    case 'cs-goto-ladder':
      cfg().open.ladder = true;
      state.profileTab = 'rules';
      announce('Opened the Credit ladder section in Rules.');
      render(); break;
    case 'rule-enabled': {
      const entry = settingEntry(el.dataset.list, el.dataset.key);
      entry.enabled = entry.enabled === false;
      announce(entry.enabled
        ? `${el.dataset.key.replace(/_/g, ' ')} switched on.`
        : `${el.dataset.key.replace(/_/g, ' ')} switched off. A disabled rule is never evaluated and never appears as a reason.`);
      markDirty(); render(); break;
    }
    case 'rule-flag': {
      const entry = settingEntry(el.dataset.list, el.dataset.key);
      const f = el.dataset.field;
      entry.value[f] = !entry.value[f];
      markDirty(); render(); break;
    }

    /* ---------- Assess a customer ---------- */
    case 'assess-layer':
      state.assessOpen[el.dataset.layer] = !state.assessOpen[el.dataset.layer];
      render(); break;
    case 'app-preset': {
      state.presetIdx = Number(el.dataset.idx);
      state.applicant = { ...APPLICANT_BASE, ...APPLICANT_PRESETS[state.presetIdx].values };
      cfg().touched.assess = true;
      const r = assess();
      announce(`${APPLICANT_PRESETS[state.presetIdx].name} loaded. ${r.outcome.label} at ${r.outcome.at}.`);
      render(); break;
    }
    case 'app-reset':
      state.applicant = { ...APPLICANT_BASE, ...APPLICANT_PRESETS[state.presetIdx].values };
      announce(`Applicant reset to ${APPLICANT_PRESETS[state.presetIdx].name}.`);
      render(); break;
    case 'app-toggle':
      applicantState()[el.dataset.field] = !applicantState()[el.dataset.field];
      cfg().touched.assess = true;
      render(); break;
    case 'setup-step': {
      const step = el.dataset.step;
      if (step === 'publish') {
        const blockers = publishBlockers();
        if (blockers.length) {
          state.setupNag = true; render();
          announce(`Not ready to publish. Finish ${blockers.join(', ')} first.`);
        } else {
          openDialog(() => { state.publishOpen = true; });
          announce('Publish dialog opened. Send this draft to a checker for approval.');
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
          coldStart: makeColdStart('n' + Date.now(), COLDSTART_BLANK),
          layers: structuredClone(LAYER_SEEDS.blank),
          limits: structuredClone(LIMITS_EMPTY),
          touched: { simulate: false, assess: false },
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
        // The copy is its own baseline; it has not diverged from anything yet.
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
        // The old upper bound carried the old parameter's unit, so re-derive it.
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
    // One field of a rule's value object.
    case 'rule-field': {
      const entry = settingEntry(el.dataset.list, el.dataset.key);
      const f = el.dataset.field;
      const raw = String(el.value ?? '').trim();
      if (el.dataset.array) {
        entry.value[f] = raw ? raw.split(',').map(x => Number(x.trim())).filter(n => isFinite(n)) : [];
      } else if (el.type === 'number') {
        entry.value[f] = raw === '' ? null : Number(raw);
      } else {
        entry.value[f] = raw;
      }
      markDirty(); render(); break;
    }
    case 'sim-pop':
      state.simPopIdx = Number(el.value) || 0; render(); break;
    // An applicant field. Blank is kept blank: it means "not known about this
    // customer", which the trace reports rather than reading as zero.
    case 'app-field': {
      const raw = String(el.value ?? '').trim();
      applicantState()[el.dataset.field] = raw;
      cfg().touched.assess = true;
      render(); break;
    }
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
    case 'layer-setting': {
      const store = cfg().layers[el.dataset.list] || (cfg().layers[el.dataset.list] = {});
      const def = layerSettingDefs(LAYERS.find(l => l.key === el.dataset.list) || {})
        .find(d => d.key === el.dataset.key);
      const numeric = def && ['percent', 'currency', 'days', 'months', 'count', 'ratio'].includes(def.type);
      // A cleared numeric stays cleared here: an unset parameter is meaningful.
      store[el.dataset.key] = numeric && el.value.trim() !== '' ? cleanNum(el, store[el.dataset.key]) : el.value;
      markDirty(); render(); break;
    }
    case 'band-multiplier': case 'band-tenure': case 'band-deposit': {
      const b = cfg().bands[Number(el.dataset.idx)];
      if (b) {
        const f = { 'band-multiplier': 'multiplier', 'band-tenure': 'maxTenure', 'band-deposit': 'deposit' }[kind];
        const v = Number(el.value);
        if (isFinite(v) && v >= 0) b[f] = f === 'multiplier' ? Math.min(1, v) : v;
        markDirty();
      }
      render(); break;
    }
    case 'fb-income':
      fbPreviewState().income = el.value.trim();
      render(); break;
    case 'cs-param': case 'cs-op': case 'cs-value': {
      const g = cfg().coldStart.gates.find(x => x.id === el.dataset.gate);
      if (g && !g.locked) {
        if (kind === 'cs-param') {
          g.param = el.value;
          const d = paramDef(g.param);
          const ops = TYPE_OPERATORS[d ? d.type : ''] || [];
          if (ops.length && !ops.includes(g.op)) g.op = ops[0];
          if (d && d.type === 'category' && !(d.values || []).includes(g.value)) g.value = (d.values || [''])[0];
        } else {
          g[kind === 'cs-op' ? 'op' : 'value'] = el.value;
        }
        markDirty();
      }
      render(); break;
    }
    case 'cs-field': {
      const f = el.dataset.field;
      const cs = cfg().coldStart;
      const target = f === 'onTimeRequired' ? cs.graduation : (f === 'retryDays' ? cs.defer : cs.starter);
      target[f] = cleanNum(el, target[f]);
      markDirty(); render(); break;
    }
    case 'cs-check':
      fbPreviewState().gates[el.dataset.gate] = el.checked;
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
