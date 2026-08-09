// Sasai Credit, Rule Engine Console: static configuration data

const NAVY = '#144989';
const DARK = '#172E7B';
const TEAL = '#48C2CF';

// Every surface a parameter can be tagged as applicable to: the ten rule
// sections plus the three profile screens that also consume parameters.
const SECTION_TAGS = [
  ['gates', 'Eligibility gates'],
  ['coverage', 'Data coverage'],
  ['limits', 'Limit assignment'],
  ['afford', 'Affordability'],
  ['exposure', 'Exposure'],
  ['thin', 'Thin-file'],
  ['ladder', 'Credit ladder'],
  ['blast', 'Blast radius'],
  ['fraud', 'Fraud & lists'],
  ['pilot', 'Pilot controls'],
  ['bands', 'Score bands'],
  ['fallback', 'Fallback scorecard'],
  ['coldstart', 'Cold-start gates'],
];
const SECTION_TAG_LABEL = Object.fromEntries(SECTION_TAGS);

// ONE global definition per parameter. `sections` tags where it may be used;
// `type` drives which operators and which value editor the rule row offers.
const PARAM_DEFS = [
  // Customer input signals: read directly from the wallet and KYC record
  { key: 'age', label: 'Customer age', group: 'input', type: 'duration', unit: 'years', sections: ['gates', 'coverage', 'fallback', 'coldstart'] },
  { key: 'tenure', label: 'Wallet tenure', group: 'input', type: 'duration', unit: 'months', sections: ['gates', 'coverage', 'fallback', 'thin', 'ladder', 'coldstart'] },
  { key: 'kyc', label: 'KYC status', group: 'input', type: 'category', values: ['Fully verified (Tier 2)', 'SIM-registered (Tier 1)', 'Unverified'], sections: ['gates', 'coverage', 'fallback', 'coldstart'] },
  { key: 'account', label: 'Account status', group: 'input', type: 'category', values: ['Active', 'Active-dormant <30d', 'Dormant', 'Suspended', 'Closed'], sections: ['gates', 'coverage', 'fallback', 'coldstart'] },
  { key: 'balance', label: 'Current wallet balance', group: 'input', type: 'currency', sections: ['coverage', 'fallback', 'thin'] },
  { key: 'avgBalance', label: 'Average balance (90 days)', group: 'input', type: 'currency', sections: ['coverage', 'fallback', 'thin'] },
  // Time on book: proves data sufficiency (thin-file) and earns ladder steps.
  { key: 'device', label: 'Device type on file', group: 'input', type: 'category', values: ['Smartphone', 'Feature phone', 'Unknown'], sections: ['gates', 'coverage', 'fallback', 'coldstart'] },
  { key: 'sim', label: 'SIM tenure', group: 'input', type: 'duration', unit: 'days', sections: ['gates', 'coverage', 'fallback', 'fraud', 'coldstart'] },

  // Inferred customer signals: derived by the feature pipeline
  { key: 'income', label: 'Inferred monthly income', group: 'inferred', type: 'currency', sections: ['afford', 'coverage', 'fallback', 'limits', 'thin'] },
  { key: 'inflow', label: 'Average monthly inflow', group: 'inferred', type: 'currency', sections: ['afford', 'coverage', 'fallback', 'limits', 'thin'] },
  { key: 'outflow', label: 'Average monthly outflow', group: 'inferred', type: 'currency', sections: ['afford', 'coverage', 'fallback', 'limits'] },
  { key: 'consistency', label: 'Cashflow consistency', group: 'inferred', type: 'ratio', unit: 'index', sections: ['afford', 'coverage', 'fallback', 'limits', 'thin'] },
  { key: 'volatility', label: 'Balance volatility', group: 'inferred', type: 'ratio', unit: 'coefficient', sections: ['afford', 'coverage', 'fallback', 'limits', 'thin'] },
  { key: 'afford', label: 'Affordability ratio', group: 'inferred', type: 'percent', sections: ['afford', 'coverage', 'fallback', 'limits'] },
  { key: 'txnMonths', label: 'Months of transaction history', group: 'inferred', type: 'duration', unit: 'months', sections: ['afford', 'coverage', 'fallback', 'limits', 'thin', 'ladder'] },
  // Money already at risk: caps the limit, and gates the next ladder step.
  { key: 'exposure', label: 'Existing group exposure', group: 'inferred', type: 'currency', sections: ['afford', 'limits', 'exposure', 'ladder'] },
  { key: 'onTime', label: 'On-time instalments paid', group: 'inferred', type: 'count', unit: 'instalments', sections: ['ladder', 'fallback', 'exposure'] },
  { key: 'arrears', label: 'Days in arrears (last 90 days)', group: 'inferred', type: 'duration', unit: 'days', sections: ['ladder', 'fallback', 'exposure'] },
  { key: 'activeDays', label: 'Active-days ratio (90 days)', group: 'inferred', type: 'ratio', unit: 'ratio', sections: ['coverage', 'fallback', 'thin'] },
  { key: 'recharge', label: 'Recharge regularity', group: 'inferred', type: 'category', values: ['steady weekly top-ups', 'irregular top-ups', 'no recent top-ups'], sections: ['coverage', 'fallback', 'thin'] },

  // Model outputs: produced by the shared scoring model
  { key: 'score', label: 'Model score', group: 'model', type: 'points', unit: 'points', sections: ['bands', 'coverage', 'limits', 'thin', 'ladder'] },
  { key: 'pd', label: 'Probability of default', group: 'model', type: 'percent', sections: ['bands', 'coverage', 'limits'] },
  { key: 'confidence', label: 'Model confidence (coverage)', group: 'model', type: 'ratio', unit: 'index', sections: ['bands', 'coverage', 'thin'] },

  // Aggregate / system signals: portfolio and operational counters.
  // Deliberately NEVER valid in eligibility or affordability.
  { key: 'dailyApprovals', label: 'Approvals so far today', group: 'system', type: 'count', unit: 'approvals', sections: ['blast', 'pilot'] },
  { key: 'dailyDisbursed', label: 'Value disbursed so far today', group: 'system', type: 'currency', sections: ['blast', 'pilot'] },
  { key: 'popAffected', label: 'Population affected by this draft', group: 'system', type: 'percent', sections: ['blast'] },
  // Portfolio-level exposure totals are themselves a concentration measure.
  { key: 'pilotExposure', label: 'Total pilot exposure', group: 'system', type: 'currency', sections: ['blast', 'pilot', 'exposure'] },
  { key: 'pilotCell', label: 'Pilot cell', group: 'system', type: 'category', values: ['Harare', 'Bulawayo', 'Mutare', 'Gweru', 'All cells nationwide'], sections: ['pilot'] },
  { key: 'blocklist', label: 'Fraud blocklist match', group: 'system', type: 'category', values: ['No match', 'Match', 'Under investigation'], sections: ['fraud', 'coldstart'] },
  // Device sharing is both a fraud signal and a concentration signal.
  { key: 'cluster', label: 'Wallets sharing this device (30 days)', group: 'system', type: 'count', unit: 'wallets', sections: ['fraud', 'blast', 'exposure'] },
];

const OPERATORS = [
  ['gte', 'at least'],
  ['lte', 'at most'],
  ['between', 'between'],
  ['in', 'in list'],
  ['eq', 'equals'],
  ['notin', 'not in list'],
];
// Operators offered per parameter type. List membership only for categoricals,
// range comparisons only for numerics. Equality suits both.
const TYPE_OPERATORS = {
  currency: ['gte', 'lte', 'between', 'eq'],
  percent: ['gte', 'lte', 'between', 'eq'],
  duration: ['gte', 'lte', 'between', 'eq'],
  count: ['gte', 'lte', 'between', 'eq'],
  ratio: ['gte', 'lte', 'between', 'eq'],
  points: ['gte', 'lte', 'between', 'eq'],
  category: ['eq', 'in', 'notin'],
};

const ACTIONS = [
  ['pass', 'Pass to next rule'],
  ['decline', 'Decline application'],
  ['refer', 'Refer for manual review'],
  ['capThin', 'Cap limit at thin-file ceiling'],
  ['capAfford', 'Cap limit at affordability ceiling'],
  ['reduce', 'Reduce limit by 30%'],
  ['ladder', 'Unlock next ladder step'],
  ['hold', 'Hold, retry in 30 days'],
  ['throttle', 'Throttle approvals for the day'],
];
// Actions offered per rule section. Eligibility gates decide only whether the
// application proceeds; ladder/throttle/cap actions belong to their own sections.
const SECTION_ACTIONS = {
  gates: ['pass', 'decline', 'refer'],
  coverage: ['pass', 'decline', 'refer', 'capThin', 'hold'],
  limits: ['pass', 'decline', 'refer', 'capAfford', 'reduce'],
  afford: ['pass', 'decline', 'refer', 'capAfford', 'reduce'],
  exposure: ['pass', 'decline', 'refer', 'capAfford', 'reduce'],
  thin: ['pass', 'decline', 'refer', 'capThin', 'hold'],
  ladder: ['pass', 'refer', 'ladder', 'hold'],
  blast: ['pass', 'refer', 'throttle', 'hold'],
  fraud: ['pass', 'decline', 'refer', 'hold'],
  pilot: ['pass', 'decline', 'refer', 'throttle', 'hold'],
};

const LABEL = Object.fromEntries(PARAM_DEFS.map(d => [d.key, d.label]));
const OPLABEL = Object.fromEntries(OPERATORS);
const ACTLABEL = Object.fromEntries(ACTIONS);
const SENT_OP = { gte: 'is at least', lte: 'is at most', between: 'is between', in: 'is one of', notin: 'is not one of', eq: 'is' };

const SECTIONS = [
  ['gates', 'Eligibility gates', 'Who is allowed to be scored at all', 'eligibility gates'],
  ['coverage', 'Data coverage', 'Minimum data before we trust the score', 'data coverage'],
  ['limits', 'Limit assignment', 'How the starting limit is chosen', 'limit assignment'],
  ['afford', 'Affordability', 'What the customer can actually repay', 'affordability'],
  ['exposure', 'Exposure & concentration', 'Total money at risk across a customer or segment', 'exposure'],
  ['thin', 'Thin-file & cold-start', 'Customers with little history', 'thin-file'],
  ['ladder', 'Credit ladder', 'Earning a bigger limit over time', 'the credit ladder'],
  ['blast', 'Blast radius & throttles', 'Daily brakes on volume and value', 'throttles'],
  ['fraud', 'Fraud & lists', 'Blocklists, watchlists and velocity checks', 'fraud & lists'],
  ['pilot', 'Pilot controls', 'Who is in the pilot and for how long', 'pilot controls'],
];

// Rule tuples: [section, param, op, value, action, enabled, code, reasonCode]
// reasonCode is the code the engine emits when THIS rule determines the outcome.
const RULES = [
  ['gates', 'age', 'gte', '18 years', 'pass', true, 'E-01', 'RC-101'],
  ['gates', 'age', 'lte', '65 years', 'pass', true, 'E-02', 'RC-101'],
  ['gates', 'kyc', 'eq', 'Fully verified (Tier 2)', 'pass', true, 'E-03', 'RC-102'],
  ['gates', 'account', 'in', 'Active, Active-dormant <30d', 'pass', true, 'E-04', 'RC-103'],
  ['gates', 'tenure', 'gte', '6 months', 'pass', true, 'E-05', 'RC-104'],
  ['coverage', 'txnMonths', 'gte', '3 months', 'pass', true, 'D-01', 'RC-301'],
  ['coverage', 'inflow', 'gte', '$40 per month', 'pass', true, 'D-02', 'RC-303'],
  ['coverage', 'consistency', 'lte', '0.55 index', 'capThin', true, 'D-03', 'RC-302'],
  ['coverage', 'volatility', 'gte', '0.80 coefficient', 'refer', false, 'D-04', 'RC-302'],
  ['limits', 'score', 'gte', '500 points', 'pass', true, 'L-01', 'RC-114'],
  ['limits', 'income', 'gte', '$120 per month', 'pass', true, 'L-02', 'RC-208'],
  ['limits', 'exposure', 'gte', '$1 in open device loans', 'decline', true, 'L-03', 'RC-401'],
  ['afford', 'afford', 'gte', '25% of inferred monthly income', 'capAfford', true, 'A-01', 'RC-207'],
  ['afford', 'income', 'gte', '3× monthly instalment', 'pass', true, 'A-02', 'RC-207'],
  ['afford', 'inflow', 'lte', '2.5× monthly instalment', 'reduce', true, 'A-03', 'RC-207'],
  ['exposure', 'exposure', 'gte', '$600 total across products', 'capAfford', true, 'X-01', 'RC-401'],
  ['exposure', 'exposure', 'gte', '$450 on this product', 'capAfford', true, 'X-02', 'RC-401'],
  ['exposure', 'cluster', 'gte', '3 wallets', 'decline', false, 'X-03', 'RC-403'],
  ['thin', 'txnMonths', 'lte', '3 months', 'capThin', true, 'T-01', 'RC-301'],
  ['thin', 'score', 'lte', '300 points', 'capThin', true, 'T-02', 'RC-114'],
  ['thin', 'balance', 'gte', '$15 average over 30 days', 'pass', true, 'T-03', 'RC-304'],
  ['ladder', 'onTime', 'gte', '2 instalments', 'ladder', true, 'C-01', 'RC-701'],
  ['ladder', 'arrears', 'eq', '0 days', 'ladder', true, 'C-02', 'RC-701'],
  ['ladder', 'score', 'gte', '+40 points since last review', 'ladder', false, 'C-03', 'RC-701'],
  ['blast', 'dailyApprovals', 'gte', '1,200 approvals', 'throttle', true, 'B-01', 'RC-601'],
  ['blast', 'dailyDisbursed', 'gte', '$45,000', 'throttle', true, 'B-02', 'RC-601'],
  ['blast', 'popAffected', 'gte', '5%', 'refer', true, 'B-03', 'RC-602'],
  ['fraud', 'blocklist', 'eq', 'No match', 'pass', true, 'F-01', 'RC-501'],
  ['fraud', 'sim', 'lte', '90 days', 'decline', true, 'F-02', 'RC-502'],
  ['fraud', 'cluster', 'gte', '3 wallets', 'refer', true, 'F-03', 'RC-403'],
  ['pilot', 'pilotCell', 'in', 'Harare, Bulawayo', 'pass', true, 'P-01', 'RC-402'],
  ['pilot', 'pilotExposure', 'gte', '$1,000,000 launch maximum', 'throttle', true, 'P-02', 'RC-603'],
];

const BAND_COLORS = ['#98A2B3', '#48C2CF', '#3D8DBE', '#144989', '#172E7B'];

const NAV_TOP = [
  ['profiles', 'Product profiles', '▦'],
];
const NAV_GLOBAL = [
  ['model', 'Model & score range', '◎'],
  ['modelhealth', 'Model health', '≈'],
  ['params', 'Parameters & features', 'ƒ'],
  ['fraud', 'Fraud lists', '⊘'],
  ['reasoncodes', 'Reason-code catalogue', '#'],
  ['users', 'Users & audit', '◉'],
];
// The order a profile is actually set up in. Each step points at a tab that
// already exists; the last one is the publish action rather than a tab.
const SETUP_STEPS = [
  { key: 'fallback', label: 'Fallback scorecard', hint: 'Score customers the model cannot' },
  { key: 'bands', label: 'Score bands', hint: 'Turn the score into a decision and a starting limit' },
  { key: 'limits', label: 'Limits & affordability', hint: 'Set what the customer can actually be offered' },
  { key: 'rules', label: 'Rules', hint: 'Decide who qualifies and what happens' },
  { key: 'simulate', label: 'What-if simulation', hint: 'Check the impact before it goes live' },
  { key: 'publish', label: 'Publish', hint: 'Send to a checker for approval', action: true },
];
// Steps that must be complete before a profile may be sent for approval.
const PUBLISH_PREREQS = ['rules', 'bands', 'limits'];

// Profile-scoped screens: shown as tabs inside the profile workspace, not in the sidebar.
// Order matches SETUP_STEPS: the tabs are the set-up sequence.
const PROFILE_TABS = [
  ['fallback', 'Fallback scorecard'],
  ['bands', 'Score bands'],
  ['limits', 'Limits & affordability'],
  ['rules', 'Rules'],
  ['simulate', 'What-if simulation'],
  ['versions', 'Versions'],
];
const PROFILE_TAB_KEYS = PROFILE_TABS.map(([k]) => k);

const PARAM_GROUPS = [
  ['input', 'Customer input signals', 'Read directly from the wallet and KYC record'],
  ['inferred', 'Inferred customer signals', 'Derived by the feature pipeline from transaction history'],
  ['model', 'Model outputs', 'Produced by the shared scoring model'],
  ['system', 'Aggregate / system signals', 'Portfolio and operational counters. Never eligibility or affordability'],
];

const FRAUD_LISTS = [
  { name: 'Fraud blocklist', effect: 'Hard decline', detail: 'Confirmed fraud wallets and IDs. Any match declines before scoring.', meta: '12,408 entries · synced hourly from Group Fraud', rules: 'Referenced by rule F-01 in every profile' },
  { name: 'Device cluster watchlist', effect: 'Refer', detail: 'Devices shared by three or more wallets in the last 30 days.', meta: '3,120 devices · rebuilt nightly', rules: 'Referenced by rules F-03 and X-03' },
  { name: 'SIM-swap velocity list', effect: 'Hard decline', detail: 'MSISDNs with a SIM change inside the tenure window.', meta: 'Fed live from MNO change events', rules: 'Referenced by rule F-02' },
  { name: 'Agent watchlist', effect: 'Refer', detail: 'Agents with abnormal application clustering. Applications they assist are referred.', meta: '86 agents · reviewed weekly', rules: 'Not yet referenced by a rule' },
];

// Reason-code catalogue: WORDING ONLY. It decides nothing; the engine emits a
// code when a rule fires or a model factor contributes. kind: 'rule' | 'factor'.
// label = short internal wording for the admin/agent. consumer = optional
// customer-facing wording, used only if a reason is ever shown to the customer.
const REASON_CODES = [
  { code: 'RC-101', kind: 'rule', label: 'Age outside the eligible range', consumer: 'You are not eligible for this offer at the moment', active: true },
  { code: 'RC-102', kind: 'rule', label: 'KYC verification incomplete', consumer: 'Please complete your account verification to qualify', active: true },
  { code: 'RC-103', kind: 'rule', label: 'Wallet status not eligible', consumer: '', active: true },
  { code: 'RC-104', kind: 'rule', label: 'Wallet tenure below minimum', consumer: 'Your account is still new. Please try again once it is a little older', active: true },
  { code: 'RC-114', kind: 'rule', label: 'Credit score below product floor', consumer: 'Credit score below the threshold for this offer', active: true },
  { code: 'RC-207', kind: 'rule', label: 'Affordability cap binding: repayment too high', consumer: 'Monthly repayment too high for your income', active: true },
  { code: 'RC-208', kind: 'rule', label: 'Inferred income below product minimum', consumer: '', active: true },
  { code: 'RC-301', kind: 'rule', label: 'Insufficient transaction history (thin file)', consumer: 'Not enough account history yet. Please try again in 30 days', active: true },
  { code: 'RC-302', kind: 'rule', label: 'Cashflow too irregular to score', consumer: '', active: true },
  { code: 'RC-303', kind: 'rule', label: 'Monthly inflow below minimum', consumer: '', active: true },
  { code: 'RC-304', kind: 'rule', label: 'Wallet balance buffer too low', consumer: '', active: true },
  { code: 'RC-401', kind: 'rule', label: 'Existing credit exposure limit reached', consumer: 'You already have credit open with us', active: true },
  { code: 'RC-402', kind: 'rule', label: 'Outside the active pilot cells', consumer: 'This offer is not available in your area yet', active: true },
  { code: 'RC-403', kind: 'rule', label: 'Device shared by several wallets', consumer: '', active: true },
  { code: 'RC-501', kind: 'rule', label: 'Fraud blocklist match', consumer: 'We cannot offer credit on this account', active: true },
  { code: 'RC-502', kind: 'rule', label: 'Recent SIM change inside tenure window', consumer: '', active: true },
  { code: 'RC-601', kind: 'rule', label: 'Daily lending capacity reached: throttled', consumer: 'We are unable to process new offers right now, please try tomorrow', active: true },
  { code: 'RC-602', kind: 'rule', label: 'Held for checker review (blast radius)', consumer: '', active: true },
  { code: 'RC-603', kind: 'rule', label: 'Pilot exposure cap reached', consumer: '', active: true },
  { code: 'RC-701', kind: 'rule', label: 'Ladder step unlocked (informational)', consumer: 'Good news, your limit has increased', active: true },
  { code: 'RC-902', kind: 'rule', label: 'Legacy manual decline (retired)', consumer: '', active: false },
  { code: 'RC-801', kind: 'factor', label: 'Cashflow consistency', consumer: 'How steady your money in and out is', active: true },
  { code: 'RC-802', kind: 'factor', label: 'Length of wallet history', consumer: 'How long you have used the wallet', active: true },
  { code: 'RC-803', kind: 'factor', label: 'Monthly inflow level', consumer: 'The money coming into your wallet each month', active: true },
  { code: 'RC-804', kind: 'factor', label: 'Repayment track record', consumer: 'How you repaid previous credit', active: true },
  { code: 'RC-805', kind: 'factor', label: 'Balance stability', consumer: 'How steady your balance stays', active: true },
];

// Model factor → reason code. Managed in Global setup, not in the Rules tab.
const MODEL_FACTORS = [
  { param: 'consistency', code: 'RC-801', weight: 'High' },
  { param: 'txnMonths', code: 'RC-802', weight: 'High' },
  { param: 'inflow', code: 'RC-803', weight: 'Medium' },
  { param: 'onTime', code: 'RC-804', weight: 'Medium' },
  { param: 'volatility', code: 'RC-805', weight: 'Low' },
];

const USERS = [
  { initials: 'TM', name: 'T. Moyo', team: 'Credit Risk', role: 'Maker', detail: 'Can draft and edit rules; cannot publish.' },
  { initials: 'RC', name: 'R. Chikanda', team: 'Head of Credit', role: 'Checker', detail: 'Approves and publishes versions.' },
  { initials: 'ND', name: 'N. Dube', team: 'Risk Governance', role: 'Checker', detail: 'Second approver for blast radius above 5%.' },
  { initials: 'KA', name: 'K. Achebe', team: 'Data Science', role: 'Viewer', detail: 'Read-only access to rules and simulations.' },
];

// Airtime Advance: small instant top-up credit, with its own rule set and bands.
const AA_RULES = [
  ['gates', 'age', 'gte', '18 years', 'pass', true, 'E-01', 'RC-101'],
  ['gates', 'kyc', 'eq', 'SIM-registered (Tier 1)', 'pass', true, 'E-02', 'RC-102'],
  ['gates', 'account', 'in', 'Active', 'pass', true, 'E-03', 'RC-103'],
  ['gates', 'tenure', 'gte', '3 months', 'pass', true, 'E-04', 'RC-104'],
  ['coverage', 'txnMonths', 'gte', '1 month', 'pass', true, 'D-01', 'RC-301'],
  ['coverage', 'inflow', 'gte', '$5 per month', 'pass', true, 'D-02', 'RC-303'],
  ['limits', 'score', 'gte', '380 points', 'pass', true, 'L-01', 'RC-114'],
  ['limits', 'exposure', 'gte', '$1 in open advances', 'decline', true, 'L-02', 'RC-401'],
  ['afford', 'afford', 'gte', '15% of inferred monthly income', 'capAfford', true, 'A-01', 'RC-207'],
  ['exposure', 'exposure', 'gte', '$15 on this product', 'capAfford', true, 'X-01', 'RC-401'],
  ['thin', 'txnMonths', 'lte', '1 month', 'capThin', true, 'T-01', 'RC-301'],
  ['ladder', 'onTime', 'gte', '3 repayments', 'ladder', true, 'C-01', 'RC-701'],
  ['ladder', 'arrears', 'eq', '0 days', 'ladder', true, 'C-02', 'RC-701'],
  ['blast', 'dailyApprovals', 'gte', '8,000 approvals', 'throttle', true, 'B-01', 'RC-601'],
  ['blast', 'dailyDisbursed', 'gte', '$20,000', 'throttle', true, 'B-02', 'RC-601'],
  ['fraud', 'blocklist', 'eq', 'No match', 'pass', true, 'F-01', 'RC-501'],
  ['fraud', 'sim', 'lte', '30 days', 'decline', true, 'F-02', 'RC-502'],
  ['pilot', 'pilotCell', 'in', 'All cells nationwide', 'pass', true, 'P-01', 'RC-402'],
];

const DF_BANDS = [
  { label: 'Below floor', floor: 0, decision: 'Decline', limit: 'n/a', pop: 11, badRate: 24.8 },
  { label: 'Thin-file', floor: 100, decision: 'Approve at thin-file cap', limit: '$80', pop: 23, badRate: 14.5 },
  { label: 'Conservative', floor: 300, decision: 'Approve, affordability capped', limit: '$180', pop: 31, badRate: 8.7 },
  { label: 'Standard', floor: 500, decision: 'Approve', limit: '$350', pop: 26, badRate: 4.2 },
  { label: 'Prime', floor: 750, decision: 'Approve, ladder eligible', limit: '$600', pop: 9, badRate: 1.9 },
];
const AA_BANDS = [
  { label: 'Below floor', floor: 0, decision: 'Decline', limit: 'n/a', pop: 14, badRate: 28.4 },
  { label: 'Starter', floor: 80, decision: 'Approve at starter cap', limit: '$2', pop: 30, badRate: 12.1 },
  { label: 'Regular', floor: 300, decision: 'Approve', limit: '$6', pop: 34, badRate: 6.8 },
  { label: 'Plus', floor: 550, decision: 'Approve', limit: '$10', pop: 16, badRate: 3.9 },
  { label: 'Max', floor: 800, decision: 'Approve, ladder eligible', limit: '$15', pop: 6, badRate: 2.1 },
];
const EMPTY_BANDS = [
  { label: 'Below floor', floor: 0, decision: 'Not configured', limit: 'n/a', pop: 0, badRate: null },
  { label: 'Band 2', floor: 100, decision: 'Not configured', limit: 'n/a', pop: 0, badRate: null },
  { label: 'Band 3', floor: 300, decision: 'Not configured', limit: 'n/a', pop: 0, badRate: null },
  { label: 'Band 4', floor: 500, decision: 'Not configured', limit: 'n/a', pop: 0, badRate: null },
  { label: 'Band 5', floor: 750, decision: 'Not configured', limit: 'n/a', pop: 0, badRate: null },
];

// Model health (Global setup): read-only quality metrics for the shared model.
// live: null = no device outcomes yet; the screen shows the validation-only banner.
const MODEL_HEALTH = {
  version: 'DF-Score v3',
  trained: '12 Jun 2026',
  retrain: 'Monthly champion/challenger; next scheduled 12 Sep 2026',
  window: 'Out-of-time validation: Jan–May 2026 wallet cohort, 61,400 customers, 90-day bad definition',
  validation: { auc: '0.74', gini: '0.48', ks: '0.36' },
  live: null,
  metricHints: {
    auc: 'Probability the model ranks a random good above a random bad',
    gini: '2 × AUC − 1; portfolio standard for rank power',
    ks: 'Maximum separation between good and bad score distributions',
  },
  psi: [
    { name: 'Model score', psi: 0.04 },
    { name: 'Average monthly inflow', psi: 0.07 },
    { name: 'Cashflow consistency', psi: 0.12 },
    { name: 'Wallet tenure', psi: 0.03 },
    { name: 'Balance volatility', psi: 0.11 },
  ],
  // Validation deciles: predicted probability of default vs observed default rate (%)
  calibration: [
    { pred: 2, obs: 1.6 }, { pred: 4, obs: 3.8 }, { pred: 6, obs: 6.5 },
    { pred: 9, obs: 9.4 }, { pred: 13, obs: 14.0 }, { pred: 18, obs: 19.5 },
    { pred: 25, obs: 27.0 }, { pred: 34, obs: 36.2 },
  ],
  // % of scored population per 50-point bucket, 0–1000
  scoreDist: [0.6, 1.2, 2.1, 3.4, 4.8, 6.2, 7.6, 8.8, 9.6, 10.0, 9.7, 8.9, 7.7, 6.3, 4.9, 3.6, 2.4, 1.4, 0.6, 0.2],
  // Bad rate by DF score band (validation), rank ordering check
  badByBand: [
    { label: 'Below floor', rate: 24.8 },
    { label: 'Thin-file', rate: 14.5 },
    { label: 'Conservative', rate: 8.7 },
    { label: 'Standard', rate: 4.2 },
    { label: 'Prime', rate: 1.9 },
  ],
};

// Decision explanation samples. Each names the rule (by rule code) that actually
// fired; the emitted reason code is resolved live from that rule's own setting,
// so reasons always track the rules rather than a hand-authored mapping.
const SAMPLE_DECISIONS = [
  {
    id: 'sd1', name: 'Applicant A', summary: '24 · wallet 4 months · score not computed',
    outcome: 'Decline', outcomeKind: 'decline',
    firedRule: 'E-05',
    detail: 'Wallet tenure is 4 months, below the 6-month eligibility gate. Evaluation stopped at the first failing gate, so no later rule ran and the model was never called.',
  },
  {
    id: 'sd2', name: 'Applicant B', summary: '31 · wallet 14 months · score 305 · 3 months history',
    outcome: 'Approve at thin-file cap', outcomeKind: 'approve',
    factors: ['RC-802', 'RC-801', 'RC-803'],
    boundRule: 'T-01', boundLabel: 'capped by thin-file ceiling',
    detail: 'All gates passed. The model scored 305 and the thin-file rule bound the limit before affordability did.',
  },
  {
    id: 'sd3', name: 'Applicant C', summary: '38 · wallet 3 years · score 642 · income $180',
    outcome: 'Approve', outcomeKind: 'approve',
    factors: ['RC-801', 'RC-804', 'RC-803'],
    boundRule: 'A-01', boundLabel: 'capped by affordability',
    detail: 'All gates passed. The band gave a $350 starting limit; the affordability ratio trimmed it to $45 per month of instalment capacity.',
  },
  {
    id: 'sd4', name: 'Applicant D', summary: '29 · device seen on 4 wallets this month',
    outcome: 'Refer for manual review', outcomeKind: 'refer',
    firedRule: 'F-03',
    detail: 'Gates passed, but the device-cluster check matched 4 wallets on one handset and routed the application to manual review.',
  },
];

// Fallback scorecard: rule-based scoring when the ML model has no reliable score.
// Seeded per profile; signals reference the shared parameter definitions.
const FALLBACK_SEED = {
  entries: [
    { param: 'kyc', op: 'eq', value: 'Fully verified (Tier 2)', points: 150, note: '', enabled: true },
    { param: 'tenure', op: 'gte', value: '12 months', points: 150, note: '6–12 months scores +80 instead', enabled: true },
    { param: 'income', op: 'banded', value: 'income bands', points: 250, note: '≥$150 +250 · $80–150 +150 · $40–80 +60 · unknown +0', enabled: true, banded: true },
    { param: 'consistency', op: 'gte', value: '0.70 index', points: 120, note: '', enabled: true },
    { param: 'activeDays', op: 'gte', value: '0.50 ratio', points: 80, note: '', enabled: true },
    { param: 'avgBalance', op: 'gte', value: '$10 buffer over 90 days', points: 100, note: '', enabled: true },
    { param: 'recharge', op: 'eq', value: 'steady weekly top-ups', points: 50, note: 'Inactive: data not yet available', enabled: false },
  ],
  tiers: { fullMin: 4, partialMin: 2, thinCeiling: 80, zeroMin: 8 },
};
// Income points bands for the banded entry: [income floor, points]
const FB_INCOME_BANDS = [[150, 250], [80, 150], [40, 60]];
const FB_OPERATORS = [...OPERATORS, ['banded', 'banded']];

// Cold-start / no-data policy. Low data and no data are different problems: with
// no data at all, a gate that needs data cannot be evaluated, so if "unknown"
// counted as "fail" the customer would fail every gate and be excluded forever.
// This policy is the lighter path that prevents that trap.
// Light gate tuples: [param, op, value, locked, note]
const COLDSTART_LIGHT_GATES = [
  ['kyc', 'eq', 'Fully verified (Tier 2)', true, 'Non-negotiable. Cannot be waived by a deposit.'],
  ['blocklist', 'eq', 'No match', true, 'Non-negotiable fraud / AML check. Cannot be waived by a deposit.'],
  ['account', 'in', 'Active', false, ''],
  ['age', 'gte', '18 years', false, ''],
  ['tenure', 'gte', '4 weeks', false, 'Weeks, not months: a new wallet must still be able to qualify.'],
  ['sim', 'gte', '4 weeks', false, ''],
];

const STARTER_TYPES = [
  ['nano', 'Fixed nano-limit'],
  ['deposit', 'Device with required down payment'],
  ['both', 'Both allowed'],
];

const COLDSTART_DF = {
  unknownIsNotFail: true,
  gates: COLDSTART_LIGHT_GATES,
  starter: { type: 'both', nanoAmount: '8', depositPct: '35', deviceLock: true },
  graduation: { onTimeRequired: '3' },
  defer: { retryDays: '30' },
};
const COLDSTART_AA = {
  unknownIsNotFail: true,
  // Airtime advances have no device, so the deposit route does not apply.
  gates: COLDSTART_LIGHT_GATES.filter(g => g[0] !== 'sim'),
  starter: { type: 'nano', nanoAmount: '2', depositPct: '0', deviceLock: false },
  graduation: { onTimeRequired: '3' },
  defer: { retryDays: '14' },
};
const COLDSTART_BLANK = {
  unknownIsNotFail: true,
  // The two non-negotiable gates are always present, even before configuration.
  gates: COLDSTART_LIGHT_GATES.filter(g => g[3]),
  starter: { type: 'nano', nanoAmount: '0', depositPct: '0', deviceLock: false },
  graduation: { onTimeRequired: '0' },
  defer: { retryDays: '30' },
};

const DEFAULT_OPEN = { gates: true, coverage: true, limits: false, afford: true, exposure: false, thin: false, ladder: false, blast: false, fraud: false, pilot: false };

const DF_VERSIONS = [
  { version: 'v1.5', status: 'Draft', summary: '7 rules changed, Standard floor 500 → 520, coverage tightened.', meta: 'Edited by T. Moyo · 4 Aug 2026', action: 'Compare' },
  { version: 'v1.4', status: 'Live', summary: 'Launch configuration for the Harare and Bulawayo pilot cells.', meta: 'Published by R. Chikanda · effective 19 Jul 2026', action: 'Compare' },
  { version: 'v1.3', status: 'Archived', summary: 'Thin-file ceiling raised $60 → $80; ladder step added.', meta: 'Published 2 Jul 2026 · retired 19 Jul 2026', action: 'Roll back' },
  { version: 'v1.2', status: 'Rolled back', summary: 'Daily disbursement cap removed in error; reverted within 6 hours.', meta: 'Published 21 Jun 2026 · rolled back same day', action: 'Roll back' },
];
const AA_VERSIONS = [
  { version: 'v2.1', status: 'Live', summary: 'Advance ceiling raised $10 → $15 after repayment cohort review.', meta: 'Published by R. Chikanda · effective 28 Jul 2026', action: 'Compare' },
  { version: 'v2.0', status: 'Archived', summary: 'Introduced 3-strike lockout for late repayers.', meta: 'Published 9 May 2026 · retired 28 Jul 2026', action: 'Roll back' },
  { version: 'v1.0', status: 'Archived', summary: 'Initial national launch: airtime only, $2–$10 advances.', meta: 'Published 11 Feb 2026 · retired 9 May 2026', action: 'Roll back' },
];

// Limits & affordability, configurable PER PROFILE. Field types drive the
// editor: percent / currency / months / select / text.
const INCOME_PROXIES = ['90-day median inflow', '90-day mean inflow', '30-day median inflow', 'Declared income', 'Blended inflow + declared'];

const LIMITS_DF = {
  matrixCols: ['Below 10%', '10–18%', '18–25%', 'Above 25%'],
  matrix: [
    ['$120', '$100', '$80', 'Decline'],
    ['$220', '$180', '$140', '$60'],
    ['$400', '$350', '$260', '$120'],
    ['$650', '$560', '$420', '$180'],
  ],
  afford: [
    { key: 'ratio', label: 'Affordability ratio', hint: 'Instalment as a share of inferred monthly income', value: '25', type: 'percent' },
    { key: 'proxy', label: 'Income proxy', hint: 'How inferred income is derived', value: '90-day median inflow', type: 'select', options: INCOME_PROXIES },
    { key: 'terms', label: 'Term options', hint: 'Offered at checkout', value: '3 / 4 / 6 months', type: 'text' },
    { key: 'minInst', label: 'Minimum instalment', hint: 'Below this we do not lend', value: '12', type: 'currency' },
    { key: 'deposit', label: 'Deposit required', hint: 'Share of device price paid upfront', value: '20', type: 'percent' },
  ],
  caps: [
    { key: 'perCustomer', label: 'Per customer', hint: 'Across all Sasai credit products', value: '600', type: 'currency' },
    { key: 'perProduct', label: 'Per product', hint: 'This product only', value: '450', type: 'currency' },
    { key: 'thinCeiling', label: 'Thin-file ceiling', hint: 'Cold-start customers', value: '80', type: 'currency' },
    { key: 'launchMax', label: 'Launch maximum', hint: 'Total pilot exposure before review', value: '1000000', type: 'currency' },
  ],
};

const LIMITS_AA = {
  matrixCols: ['Below 10%', '10–18%', '18–25%', 'Above 25%'],
  matrix: [
    ['$3', '$2', '$2', 'Decline'],
    ['$8', '$6', '$4', '$2'],
    ['$12', '$10', '$7', '$4'],
    ['$15', '$15', '$11', '$6'],
  ],
  afford: [
    { key: 'ratio', label: 'Affordability ratio', hint: 'Advance as a share of inferred monthly income', value: '15', type: 'percent' },
    { key: 'proxy', label: 'Income proxy', hint: 'How inferred income is derived', value: '30-day median inflow', type: 'select', options: INCOME_PROXIES },
    { key: 'terms', label: 'Term options', hint: 'Repaid on next recharge', value: 'Single repayment, 30 days', type: 'text' },
    { key: 'minInst', label: 'Minimum advance', hint: 'Below this we do not lend', value: '2', type: 'currency' },
    { key: 'deposit', label: 'Deposit required', hint: 'Not applicable to airtime advances', value: '0', type: 'percent' },
  ],
  caps: [
    { key: 'perCustomer', label: 'Per customer', hint: 'Across all Sasai credit products', value: '600', type: 'currency' },
    { key: 'perProduct', label: 'Per product', hint: 'This product only', value: '15', type: 'currency' },
    { key: 'thinCeiling', label: 'Thin-file ceiling', hint: 'Cold-start customers', value: '2', type: 'currency' },
    { key: 'launchMax', label: 'Launch maximum', hint: 'Total exposure before review', value: '250000', type: 'currency' },
  ],
};

const LIMITS_EMPTY = {
  matrixCols: ['Below 10%', '10–18%', '18–25%', 'Above 25%'],
  matrix: [['n/a', 'n/a', 'n/a', 'n/a'], ['n/a', 'n/a', 'n/a', 'n/a'], ['n/a', 'n/a', 'n/a', 'n/a'], ['n/a', 'n/a', 'n/a', 'n/a']],
  afford: [
    { key: 'ratio', label: 'Affordability ratio', hint: 'Instalment as a share of inferred monthly income', value: '0', type: 'percent' },
    { key: 'proxy', label: 'Income proxy', hint: 'How inferred income is derived', value: '90-day median inflow', type: 'select', options: INCOME_PROXIES },
    { key: 'terms', label: 'Term options', hint: 'Offered at checkout', value: 'Not configured', type: 'text' },
    { key: 'minInst', label: 'Minimum instalment', hint: 'Below this we do not lend', value: '0', type: 'currency' },
    { key: 'deposit', label: 'Deposit required', hint: 'Share of price paid upfront', value: '0', type: 'percent' },
  ],
  caps: [
    { key: 'perCustomer', label: 'Per customer', hint: 'Across all Sasai credit products', value: '0', type: 'currency' },
    { key: 'perProduct', label: 'Per product', hint: 'This product only', value: '0', type: 'currency' },
    { key: 'thinCeiling', label: 'Thin-file ceiling', hint: 'Cold-start customers', value: '0', type: 'currency' },
    { key: 'launchMax', label: 'Launch maximum', hint: 'Total exposure before review', value: '0', type: 'currency' },
  ],
};

// Each profile carries its OWN rules, bands, limits and version history.
const PROFILE_SEEDS = [
  {
    name: 'Device Financing', blurb: 'Handset instalments, 3–6 months, Ecocash wallet', market: 'Zimbabwe',
    version: 'v1.5', status: 'Draft', editedAt: '4 Aug 2026, 11:20', editedBy: 'T. Moyo', third: 'Roll back',
    rules: RULES, bands: DF_BANDS, versions: DF_VERSIONS, limits: LIMITS_DF, coldStart: COLDSTART_DF,
    touched: { simulate: true },
  },
  {
    name: 'Airtime Advance', blurb: 'Instant airtime top-up credit, repaid on next recharge', market: 'Zimbabwe',
    version: 'v2.1', status: 'Published', editedAt: '28 Jul 2026, 09:15', editedBy: 'R. Chikanda', third: 'View',
    rules: AA_RULES, bands: AA_BANDS, versions: AA_VERSIONS, limits: LIMITS_AA, coldStart: COLDSTART_AA,
    touched: { simulate: true },
  },
  {
    name: 'Life Cover', blurb: 'Premium affordability profile, not yet configured', market: 'Zimbabwe',
    version: 'n/a', status: 'Not started', editedAt: 'n/a', editedBy: 'n/a', third: 'Copy rules',
    rules: [], bands: EMPTY_BANDS, versions: [], limits: LIMITS_EMPTY, coldStart: COLDSTART_BLANK,
    touched: { simulate: false },
    blank: true,   // nothing seeded; this profile starts from zero
  },
];

const MARKETS = ['Zimbabwe', 'Zambia', 'Lesotho', 'Botswana', 'South Africa'];
const PROFILE_ICON_COLORS = ['#144989', '#3D8DBE', '#48A0A9', '#172E7B', '#6172B8'];


// Planning assumption, not a derived figure: share of accepted offers actually
// drawn down. Used only to turn approved volume into a projected book, which is
// then capped by the profile's own launch maximum.
const SIM_TAKE_UP = 0.35;

// Historical populations the what-if simulation can be stamped against.
// KPIs themselves are derived from the profile's own bands, not from a fixture.
const SIM_POPULATIONS = [
  { label: 'Ecocash wallet base, Jan–Jun 2026 (240k)', size: 240000 },
  { label: 'Active device-financing applicants (38k)', size: 38000 },
  { label: 'Thin-file cohort (61k)', size: 61000 },
];

const AUDIT = [
  { who: 'T. Moyo', what: 'changed Standard band floor from 500 to 520.', when: '4 Aug 2026, 11:20' },
  { who: 'T. Moyo', what: 'enabled rule D-02 "Average monthly inflow at least $40 per month".', when: '4 Aug 2026, 11:04' },
  { who: 'N. Dube', what: 'commented on the affordability ratio: "hold at 25% until Q4 review".', when: '3 Aug 2026, 16:41' },
  { who: 'T. Moyo', what: 'disabled rule X-03 "Same-device household cluster".', when: '3 Aug 2026, 09:12' },
  { who: 'R. Chikanda', what: 'published Device Financing v1.4, effective 19 Jul 2026 06:00.', when: '18 Jul 2026, 17:55' },
  { who: 'R. Chikanda', what: 'approved v1.4 as checker; maker was T. Moyo.', when: '18 Jul 2026, 17:52' },
];

const CHIP_COLORS = {
  Published: ['#ECFDF3', '#067647', '#ABEFC6'],
  Live: ['#ECFDF3', '#067647', '#ABEFC6'],
  Draft: ['#FFF8E6', '#7A5B12', '#F5DFA5'],
  'In review': ['#EFF4FF', '#172E7B', '#C7D7FE'],
  'Not started': ['#F2F4F7', '#667085', '#E4E7EC'],
  Archived: ['#F2F4F7', '#667085', '#E4E7EC'],
  'Rolled back': ['#FEF3F2', '#B42318', '#FECDCA'],
};
