// Sasai Credit, Rule Engine Console: static configuration data

const NAVY = '#144989';
const DARK = '#172E7B';
const TEAL = '#48C2CF';

// Every surface a parameter can be tagged as applicable to: the ten rule
// sections plus the three profile screens that also consume parameters.
const SECTION_TAGS = [
  ['l0', 'L0 Routing'],
  ['l1', 'L1 Knockouts'],
  ['l2', 'L2 Fraud screens'],
  ['l3', 'L3 Score & thin-file'],
  ['l4', 'L4 Affordability'],
  ['l5', 'L5 Limits'],
  ['l6', 'L6 Portfolio'],
  ['bands', 'Score bands'],
  ['fallback', 'Fallback scorecard'],
  ['coldstart', 'Cold-start gates'],
];
const SECTION_TAG_LABEL = Object.fromEntries(SECTION_TAGS);

// ONE global definition per parameter. `sections` tags where it may be used;
// `type` drives which operators and which value editor the rule row offers.
const PARAM_DEFS = [
  // Customer input signals: read directly from the wallet and KYC record
  { key: 'age', label: 'Customer age', group: 'input', type: 'duration', unit: 'years', sections: ['l1', 'fallback', 'coldstart'] },
  { key: 'tenure', label: 'Wallet account age', group: 'input', type: 'duration', unit: 'months', sections: ['l0', 'l1', 'l2', 'l3', 'fallback', 'coldstart'] },
  { key: 'kyc', label: 'KYC status', group: 'input', type: 'category', values: ['Fully verified (Tier 2)', 'SIM-registered (Tier 1)', 'Unverified'], sections: ['l1', 'fallback', 'coldstart'] },
  { key: 'account', label: 'Account status', group: 'input', type: 'category', values: ['Active', 'Active-dormant <30d', 'Dormant', 'Suspended', 'Closed'], sections: ['l1', 'fallback', 'coldstart'] },
  { key: 'balance', label: 'Current wallet balance', group: 'input', type: 'currency', sections: ['l0', 'l3', 'fallback'] },
  { key: 'avgBalance', label: 'Average balance (90 days)', group: 'input', type: 'currency', sections: ['l0', 'l3', 'fallback'] },
  { key: 'device', label: 'Device type on file', group: 'input', type: 'category', values: ['Smartphone', 'Feature phone', 'Unknown'], sections: ['l1', 'l2', 'fallback', 'coldstart'] },
  { key: 'sim', label: 'SIM age', group: 'input', type: 'duration', unit: 'days', sections: ['l1', 'l2', 'fallback', 'coldstart'] },
  // A match on this customer, not a portfolio counter, so it may gate eligibility.
  { key: 'blocklist', label: 'Fraud blocklist match', group: 'input', type: 'category', values: ['No match', 'Match', 'Under investigation'], sections: ['l1', 'l2', 'coldstart'] },

  // Inferred customer signals: derived by the feature pipeline
  { key: 'income', label: 'Inferred monthly income', group: 'inferred', type: 'currency', sections: ['l0', 'l3', 'l4', 'fallback'] },
  { key: 'inflow', label: 'Average monthly inflow', group: 'inferred', type: 'currency', sections: ['l0', 'l2', 'l3', 'l4', 'fallback'] },
  { key: 'outflow', label: 'Average monthly outflow', group: 'inferred', type: 'currency', sections: ['l4'] },
  { key: 'consistency', label: 'Cashflow consistency', group: 'inferred', type: 'ratio', unit: 'index', sections: ['l0', 'l3', 'l4', 'fallback'] },
  { key: 'volatility', label: 'Balance volatility', group: 'inferred', type: 'ratio', unit: 'coefficient', sections: ['l0', 'l4', 'fallback'] },
  { key: 'afford', label: 'Affordability ratio', group: 'inferred', type: 'percent', sections: ['l4', 'fallback'] },
  { key: 'txnMonths', label: 'Months of transaction history', group: 'inferred', type: 'duration', unit: 'months', sections: ['l0', 'l3', 'fallback'] },
  // Money already at risk: a knockout at L1, a cap at L4 and L5.
  { key: 'exposure', label: 'Existing group exposure', group: 'inferred', type: 'currency', sections: ['l1', 'l4', 'l5'] },
  { key: 'onTime', label: 'On-time instalments paid', group: 'inferred', type: 'count', unit: 'instalments', sections: ['l3', 'fallback'] },
  { key: 'arrears', label: 'Days in arrears (last 90 days)', group: 'inferred', type: 'duration', unit: 'days', sections: ['l1', 'l3', 'fallback'] },
  { key: 'activeDays', label: 'Active-days ratio (90 days)', group: 'inferred', type: 'ratio', unit: 'ratio', sections: ['l0', 'l3', 'fallback'] },
  { key: 'recharge', label: 'Recharge regularity', group: 'inferred', type: 'category', values: ['steady weekly top-ups', 'irregular top-ups', 'no recent top-ups'], sections: ['l0', 'l3', 'fallback'] },

  // Model outputs: produced by the shared scoring model
  { key: 'score', label: 'Model score', group: 'model', type: 'points', unit: 'points', sections: ['l3', 'bands'] },
  { key: 'pd', label: 'Probability of default', group: 'model', type: 'percent', sections: ['l3', 'bands'] },
  { key: 'confidence', label: 'Model confidence (coverage)', group: 'model', type: 'ratio', unit: 'index', sections: ['l0', 'bands'] },

  // Aggregate / system signals: portfolio and operational counters.
  // Deliberately NEVER valid in knockouts or affordability.
  { key: 'dailyApprovals', label: 'Approvals so far today', group: 'system', type: 'count', unit: 'approvals', sections: ['l6'] },
  { key: 'dailyDisbursed', label: 'Value disbursed so far today', group: 'system', type: 'currency', sections: ['l6'] },
  { key: 'popAffected', label: 'Population affected by this draft', group: 'system', type: 'percent', sections: ['l6'] },
  { key: 'pilotExposure', label: 'Total pilot exposure', group: 'system', type: 'currency', sections: ['l5', 'l6'] },
  { key: 'pilotCell', label: 'Pilot cell', group: 'system', type: 'category', values: ['Harare', 'Bulawayo', 'Mutare', 'Gweru', 'All cells nationwide'], sections: ['l6'] },
  // Device sharing is both a fraud signal and a concentration signal.
  { key: 'cluster', label: 'Wallets sharing this device (30 days)', group: 'system', type: 'count', unit: 'wallets', sections: ['l2', 'l5', 'l6'] },
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
// Actions offered per layer. L1 decides only whether the application proceeds;
// caps belong to the layers that own a ceiling; throttles to portfolio controls.
// ---------------------------------------------------------------------------
// The decision waterfall, L0 to L6, as set out in the Technodysis rule engine
// draft. Evaluation runs top to bottom. Two invariants govern the whole engine:
// any layer can stop the process, and limits only ever go down.
// ---------------------------------------------------------------------------

const ENGINE_INVARIANTS = [
  ['Any layer can stop the process', 'A customer who fails a knockout is decided there. No score is produced and no later layer runs, so the decision stays fast and easy to explain.'],
  ['Limits only ever go down', 'L3 produces an indicative offer from the band. L4, L5 and L6 can each reduce it; none can raise it. The final limit is the lowest of every applicable cap.'],
];

const LIMIT_FORMULA = ['band limit', 'affordability limit', 'product maximum', 'customer exposure cap', 'device tier cap'];

// Layer 0 routes to exactly one of these.
const ROUTING_OUTCOMES = [
  ['scored', 'Scored', 'Enough data to use the model. Continues to L1, then scored normally at L3.'],
  ['thin', 'Thin file', 'Some data, but not enough to score reliably. Continues to L1, then handled by the thin-file rules at L3.'],
  ['insufficient', 'Insufficient data', 'Too little data for a responsible decision. Declined, with a reason saying the customer may qualify later.'],
];

// Settings are single-value parameters. Rules are conditions written as
// sentences. A layer can hold either or both.
// type: percent | currency | days | months | count | ratio | select | text | toggle
// essential: flagged in the draft as a commercial decision for the credit team.
const LAYERS = [
  {
    key: 'l0', num: 'L0', ref: '§2', title: 'Data sufficiency and routing', canStop: true,
    question: 'Is there enough data to score this customer at all?',
    intro: 'A model applied to a customer with almost no data still returns a number, and that number means nothing. This layer recognises the situation and routes it instead.',
    thinFile: [
      { key: 'starterLimit', label: 'Starter limit', type: 'currency', essential: true,
        meaning: 'The most offered to a customer with no repayment history.' },
      { key: 'starterTenure', label: 'Maximum loan term', type: 'months', essential: false,
        meaning: 'The longest repayment period on a first loan. A shorter term means the outcome is known sooner.' },
      { key: 'starterDeposit', label: 'Deposit requirement', type: 'percent', essential: true,
        meaning: 'The share of device value paid upfront. A deposit reduces exposure and selects for committed customers.' },
      { key: 'eligibleTier', label: 'Eligible device tier', type: 'select', essential: false,
        options: ['Entry tier only', 'Entry and mid tier', 'All tiers'],
        meaning: 'Which device value tiers a thin-file customer may finance.' },
      { key: 'loansToGraduate', label: 'Loans required to graduate', type: 'count', unit: 'loans', essential: false,
        meaning: 'How many loans must be repaid in full before the limit increases.' },
      { key: 'increasePerCycle', label: 'Limit increase per cycle', type: 'percent', essential: false,
        meaning: 'How much the limit rises after each successfully repaid loan, as a share of the previous limit.' },
      { key: 'ladderCeiling', label: 'Maximum limit via the ladder', type: 'currency', essential: false,
        meaning: 'The ceiling reachable through the ladder alone, before normal model scoring applies.' },
      { key: 'resetDpd', label: 'Reset on delinquency', type: 'days', essential: false,
        meaning: 'The level of lateness that resets a customer to the starter limit.' },
      { key: 'coolingPeriod', label: 'Cooling period after decline', type: 'days', essential: false,
        meaning: 'How long a declined customer must wait before applying again.' },
    ],
    settings: [
      { key: 'featureCompleteness', label: 'Minimum feature completeness', type: 'percent', essential: false,
        meaning: 'The share of the features the model needs that are actually available for this customer. If the model uses 40 features and 28 are present, completeness is 70 percent.' },
      { key: 'minWalletTenure', label: 'Minimum account age to be scored', type: 'days', essential: false, overlap: 'tenure',
        meaning: 'How long the customer has had the wallet. Behaviour observed over a short period is not reliable evidence, so this is the floor for trusting a score at all.' },
      { key: 'minTxnHistory', label: 'Minimum transaction history', type: 'count', unit: 'active days in 90', essential: false,
        meaning: 'Distinct days in the last 90 on which the customer transacted. Measures genuine activity rather than a dormant account with one transaction.' },
      { key: 'minLoanHistoryRepeat', label: 'Minimum loan history for repeat path', type: 'count', unit: 'closed loans', essential: false,
        meaning: 'How many previous loans must be closed before a customer is treated as a repeat borrower rather than a new one.' },
      { key: 'scoreStaleness', label: 'Score staleness limit', type: 'days', essential: false,
        meaning: 'How old a cached score may be before it is out of date. Scores recalculate daily, so this mainly catches a pipeline failure going unnoticed.' },
      { key: 'modelConfidenceFloor', label: 'Model confidence floor', type: 'percent', essential: true,
        meaning: 'The model returns a confidence level alongside the score. Below this level the score is not trusted and the customer is routed to thin-file handling.' },
    ],
  },
  {
    key: 'l1', num: 'L1', ref: '§3', title: 'Hard knockouts', canStop: true,
    question: 'Is the customer eligible at all?',
    intro: 'Absolute eligibility rules. They are not risk judgements and the score does not affect them. They run first because they are quick and they remove the customer entirely.',
    settings: [
      { key: 'priorDefaultLookback', label: 'Prior default lookback', type: 'months', essential: true,
        meaning: 'Exclude a customer who has previously defaulted with Ecocash within this period. A lookback lets customers become eligible again over time; permanent exclusion is safer but permanently shrinks the base.' },
      { key: 'concurrentLoanCap', label: 'Concurrent loan cap', type: 'count', unit: 'active loans', essential: true,
        meaning: 'How many loans a customer may hold at once. Taking several loans simultaneously is one of the fastest routes to over-indebtedness.' },
      { key: 'delinquentDpd', label: 'Currently delinquent threshold', type: 'days', essential: false,
        meaning: 'Days past due on any active loan above which a new loan is refused.' },
      { key: 'minAccountTenure', label: 'Minimum account age to be eligible', type: 'days', essential: false, overlap: 'tenure',
        meaning: 'How long the customer has had the wallet, as an eligibility floor. Distinct from the L0 threshold, which asks whether there is enough history to trust a score.' },
      { key: 'dormancyLimit', label: 'Dormancy limit', type: 'days', essential: false,
        meaning: 'Maximum days since the last transaction of any kind. A customer inactive for longer is not currently engaged with the wallet.' },
      { key: 'staffHandling', label: 'Staff and related parties', type: 'select', essential: false,
        options: ['Refer to manual review', 'Exclude', 'No special handling'],
        meaning: 'How employees and connected parties are treated. Usually routed to review rather than declined, for governance reasons.' },
    ],
  },
  {
    key: 'l2', num: 'L2', ref: '§4', title: 'Fraud and first-payment-default screens', canStop: true,
    question: 'Does the application carry identity risk?',
    intro: 'A customer who never makes a single payment usually has not suffered a change in circumstances. The warning signs differ from credit warning signs, and so do the remedies. Most of these should refer rather than decline, because fraud rules always catch some genuine customers.',
    settings: [
      { key: 'simSwapWindow', label: 'Recent SIM swap window', type: 'days', essential: false,
        meaning: 'Refer where the SIM has been swapped within this window. A recent swap can indicate an account takeover. SIM data may not be available; the control is kept for completeness.' },
      { key: 'deviceChangeFreq', label: 'Device change frequency', type: 'count', unit: 'changes in 6 months', essential: false,
        meaning: 'How many times the device on the account has changed. Frequent changes can indicate device resale, which matters directly when the loan finances a device.' },
      { key: 'applicationVelocity', label: 'Application velocity', type: 'count', unit: 'applications in 30 days', essential: false,
        meaning: 'Repeated applications in a short period suggest shopping for an approval.' },
      { key: 'profileChangeWindow', label: 'Profile change velocity', type: 'days', essential: false,
        meaning: 'Refer where KYC details or contact information changed within this window before an application.' },
      { key: 'inflowSpike', label: 'Pre-application inflow spike', type: 'ratio', unit: 'x the 90-day average', essential: false,
        meaning: 'Compares wallet inflow in the last 30 days against the preceding 90-day average. A sudden spike can indicate a customer funding the wallet artificially to appear more creditworthy.' },
      { key: 'dormantThenActive', label: 'Dormant then suddenly active', type: 'select', essential: false,
        options: ['Refer', 'Decline', 'Off'],
        meaning: 'Flags an account that was inactive and then became busy shortly before applying.' },
    ],
  },
  {
    key: 'l3', num: 'L3', ref: '§5.2 and §5.3', title: 'Score decisioning and thin-file handling', canStop: true,
    question: 'What band does the customer fall into, and what is the indicative offer?',
    intro: 'Converts risk into an offer. Works differently depending on whether L0 routed the customer as scored or thin file.',
    settings: [
      { key: 'masterCutoff', label: 'Master approval cutoff', type: 'count', unit: 'score', essential: true,
        meaning: 'A single score threshold below which no customer is approved, whatever the band table says. The main lever for tightening or loosening overall. Evaluation order decides: whichever of this and the band decision is reached first, decides.' },
      { key: 'referBands', label: 'Refer band boundaries', type: 'text', essential: true,
        meaning: 'Which bands route to manual review rather than being decided automatically.' },
      { key: 'reviewCapacity', label: 'Manual review capacity', type: 'count', unit: 'applications per day', essential: true,
        meaning: 'The most referred applications the team can handle per day. Determines how widely the referral rules can be set.' },
      { key: 'overrideAuthority', label: 'Override authority', type: 'text', essential: true,
        meaning: 'Who may override an engine decision, and up to what limit. Every override records the user, the reason and the original decision.' },
    ],
  },
  {
    key: 'l4', num: 'L4', ref: '§6', title: 'Affordability', canStop: true,
    question: 'Is this specific instalment sustainable against the customer’s income?',
    intro: 'The score asks whether a customer is likely to repay. Affordability asks whether this instalment is sustainable. A customer can be low risk and still be offered more than they can comfortably service.',
    settings: [
      { key: 'instalmentToIncome', label: 'Instalment to income cap', type: 'percent', essential: true,
        meaning: 'The largest share of monthly income the instalment may represent. With income of $400 and a cap of 25 percent, the maximum instalment is $100.' },
      { key: 'disposableFloor', label: 'Net disposable income floor', type: 'currency', essential: true,
        meaning: 'The minimum that must remain after estimated expenses and the new instalment are deducted. Protects customers who pass the ratio test but have very little margin.' },
      { key: 'deductObligations', label: 'Existing obligation deduction', type: 'toggle', essential: false,
        meaning: 'Whether instalments on the customer’s existing loans are subtracted from income before the calculation.' },
      { key: 'incomeStability', label: 'Income stability requirement', type: 'ratio', unit: 'coefficient of variation', essential: false,
        meaning: 'How variable income may be. 0.5 means the standard deviation may be up to half the mean. Steady income supports an instalment more reliably than the same average arriving erratically.' },
      { key: 'minIncome', label: 'Minimum inferred monthly income', type: 'currency', essential: true,
        meaning: 'The floor below which no loan is offered, whatever the ratios say.' },
      { key: 'incomeConfidence', label: 'Income confidence threshold', type: 'percent', essential: false,
        meaning: 'The engine estimates income from wallet behaviour and reports how confident it is. Below this level a haircut is applied.' },
      { key: 'incomeHaircut', label: 'Income haircut when confidence is low', type: 'percent', essential: false,
        meaning: 'How much estimated income is reduced when confidence falls below the threshold, so a weak estimate produces a cautious offer.' },
      { key: 'incomeMethod', label: 'How income is derived', type: 'select', essential: false,
        options: ['Recurring credits, excluding self-transfers and pass-through', '90-day median inflow', '30-day median inflow', 'Declared income'],
        meaning: 'Total wallet inflow is not income: it mixes genuine income with peer transfers, cash deposits and money passing through. The default identifies credits recurring at similar intervals in similar amounts, excludes self-transfers and inflows immediately withdrawn, and separates trading or agent activity.' },
    ],
  },
  {
    key: 'l5', num: 'L5', ref: '§7', title: 'Exposure and limit assignment', canStop: true,
    question: 'What is the final limit, taken as the lowest of every applicable cap?',
    intro: 'Limits are the most effective loss control available. Loss is the amount lent multiplied by the rate of default; a cutoff moves only the second term, limits move the first directly. This is why a weaker customer can be approved with a small limit rather than declined.',
    settings: [
      { key: 'productMaximum', label: 'Product maximum', type: 'currency', essential: true,
        meaning: 'The largest amount financeable under this product, whatever the score. Band multipliers are applied to this figure.' },
      { key: 'minViableLimit', label: 'Minimum viable limit', type: 'currency', essential: false,
        meaning: 'The smallest amount worth lending. If every cap combined produces less than this, the application is declined rather than an impractical offer being made.' },
      { key: 'customerExposureCap', label: 'Total customer exposure cap', type: 'currency', essential: true,
        meaning: 'The most a customer may owe across all Ecocash credit products at any time.' },
      { key: 'limitRounding', label: 'Limit rounding', type: 'select', essential: false,
        options: ['Nearest $1, rounded down', 'Nearest $5, rounded down', 'Nearest $10, rounded down', 'No rounding'],
        meaning: 'Limits are rounded down to a sensible increment so customers are offered clean amounts.' },
      { key: 'depositFloor', label: 'Deposit floor', type: 'percent', essential: false,
        meaning: 'A minimum deposit applied whatever the band.' },
      { key: 'permittedTenures', label: 'Permitted loan terms', type: 'text', essential: true,
        meaning: 'The repayment periods customers may choose from.' },
    ],
  },
  {
    key: 'l6', num: 'L6', ref: '§8', title: 'Portfolio controls', canStop: true,
    question: 'Does this approval remain acceptable for the loan book as a whole?',
    intro: 'Every rule so far judges an individual customer. These protect the book. They are usually absent from a first version, and their absence is usually what causes difficulty months later, when the book has quietly become concentrated in the riskiest segment.',
    settings: [
      { key: 'thinFileShare', label: 'Maximum thin-file share of approvals', type: 'percent', essential: true,
        meaning: 'The share of daily approvals that may go to thin-file customers. Stops the book filling with the least-known customers during a growth push.' },
      { key: 'dailyDisbursementCap', label: 'Daily disbursement cap', type: 'currency', essential: true,
        meaning: 'A ceiling on the total amount disbursed per day. Controls the pace at which exposure builds.' },
      { key: 'newToCreditCap', label: 'New-to-credit concentration cap', type: 'percent', essential: true,
        meaning: 'The largest share of the total book made up of customers with no prior repayment history.' },
      { key: 'autoTighten', label: 'Automatic tightening trigger', type: 'select', essential: false,
        options: ['Tighten by one band', 'Tighten by two bands', 'Off'],
        meaning: 'If early delinquency rises above an agreed level, the engine tightens the cutoff automatically rather than waiting for a monthly review.' },
      { key: 'killSwitch', label: 'Kill switch', type: 'toggle', essential: true,
        meaning: 'A manual control that halts all approvals immediately. Necessary for any live lending system.' },
      { key: 'randomHoldout', label: 'Random approval holdout', type: 'percent', essential: false,
        meaning: 'A small share of applications just below the cutoff are approved at random, so outcomes are observed for customers who would normally be declined. Without it every new model trains only on customers who passed the previous rules and becomes systematically over-optimistic.' },
      { key: 'seasonalityWindows', label: 'Seasonality windows', type: 'text', essential: false,
        meaning: 'School fee terms create a large, non-negotiable drain on household cash. Loans maturing just after a fee term default more often for reasons unrelated to customer quality.' },
      { key: 'macroTightening', label: 'Global macro tightening', type: 'select', essential: false,
        options: ['Off', 'Tighten by one band', 'Tighten by two bands'],
        meaning: 'Currency and inflation movements shift default rates across a whole book at once, for reasons no individual feature predicts. One control tightens everything in a single action.' },
    ],
  },
];

const LAYER_KEYS = LAYERS.map(l => l.key);

// Parameters measuring the same underlying thing in more than one layer. The
// draft sets these independently, so the console flags the overlap rather than
// silently resolving it.
const OVERLAP_GROUPS = [
  { tag: 'tenure', label: 'Account age is gated twice, on purpose',
    note: 'L0 asks whether there is enough history to trust a score. L1 asks whether the customer is eligible at all. Different questions, but set independently, and the stricter one always wins. Check both are intentional.' },
];


const SECTION_ACTIONS = {
  l0: ['pass', 'decline', 'refer', 'capThin', 'hold'],
  l1: ['pass', 'decline', 'refer'],
  l2: ['pass', 'decline', 'refer', 'hold'],
  l3: ['pass', 'decline', 'refer', 'capThin', 'ladder', 'reduce', 'hold'],
  l4: ['pass', 'decline', 'refer', 'capAfford', 'reduce'],
  l5: ['pass', 'decline', 'refer', 'capAfford', 'reduce'],
  l6: ['pass', 'refer', 'throttle', 'hold'],
};

const LABEL = Object.fromEntries(PARAM_DEFS.map(d => [d.key, d.label]));
const OPLABEL = Object.fromEntries(OPERATORS);
const ACTLABEL = Object.fromEntries(ACTIONS);
const SENT_OP = { gte: 'is at least', lte: 'is at most', between: 'is between', in: 'is one of', notin: 'is not one of', eq: 'is' };


// Rule tuples: [section, param, op, value, action, enabled, code, reasonCode]
// reasonCode is the code the engine emits when THIS rule determines the outcome.
const RULES = [
  ['l1', 'age', 'gte', '18 years', 'pass', true, 'E-01', 'RC-101'],
  ['l1', 'age', 'lte', '65 years', 'pass', true, 'E-02', 'RC-101'],
  ['l1', 'kyc', 'eq', 'Fully verified (Tier 2)', 'pass', true, 'E-03', 'RC-102'],
  ['l1', 'account', 'in', 'Active, Active-dormant <30d', 'pass', true, 'E-04', 'RC-103'],
  ['l1', 'blocklist', 'eq', 'No match', 'pass', true, 'E-05', 'RC-501'],
  ['l0', 'txnMonths', 'gte', '3 months', 'pass', true, 'D-01', 'RC-301'],
  ['l0', 'inflow', 'gte', '$40 per month', 'pass', true, 'D-02', 'RC-303'],
  ['l0', 'consistency', 'lte', '0.55 index', 'capThin', true, 'D-03', 'RC-302'],
  ['l0', 'volatility', 'gte', '0.80 coefficient', 'refer', false, 'D-04', 'RC-302'],
  ['l3', 'score', 'gte', '500 points', 'pass', true, 'L-01', 'RC-114'],
  ['l1', 'exposure', 'gte', '$1 in open device loans', 'decline', true, 'E-06', 'RC-401'],
  ['l4', 'afford', 'gte', '25% of inferred monthly income', 'capAfford', true, 'A-01', 'RC-207'],
  ['l4', 'income', 'gte', '3× monthly instalment', 'pass', true, 'A-02', 'RC-207'],
  ['l4', 'inflow', 'lte', '2.5× monthly instalment', 'reduce', true, 'A-03', 'RC-207'],
  ['l5', 'exposure', 'gte', '$600 total across products', 'capAfford', true, 'X-01', 'RC-401'],
  ['l5', 'exposure', 'gte', '$450 on this product', 'capAfford', true, 'X-02', 'RC-401'],
  ['l5', 'cluster', 'gte', '3 wallets', 'decline', false, 'X-03', 'RC-403'],
  ['l3', 'onTime', 'gte', '2 instalments', 'ladder', true, 'C-01', 'RC-701'],
  ['l3', 'arrears', 'eq', '0 days', 'ladder', true, 'C-02', 'RC-701'],
  ['l3', 'score', 'gte', '+40 points since last review', 'ladder', false, 'C-03', 'RC-701'],
  ['l6', 'dailyApprovals', 'gte', '1,200 approvals', 'throttle', true, 'B-01', 'RC-601'],
  ['l6', 'dailyDisbursed', 'gte', '$45,000', 'throttle', true, 'B-02', 'RC-601'],
  ['l6', 'popAffected', 'gte', '5%', 'refer', true, 'B-03', 'RC-602'],
  ['l2', 'sim', 'lte', '90 days', 'decline', true, 'F-02', 'RC-502'],
  ['l2', 'cluster', 'gte', '3 wallets', 'refer', true, 'F-03', 'RC-403'],
  ['l6', 'pilotCell', 'in', 'Harare, Bulawayo', 'pass', true, 'P-01', 'RC-402'],
  ['l6', 'pilotExposure', 'gte', '$1,000,000 launch maximum', 'throttle', true, 'P-02', 'RC-603'],
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
  { key: 'waterfall', label: 'Decision waterfall', hint: 'Set every parameter, L0 to L6, in the order the engine evaluates them' },
  { key: 'simulate', label: 'What-if simulation', hint: 'Check the impact before it goes live' },
  { key: 'publish', label: 'Publish', hint: 'Send to a checker for approval', action: true },
];
// Steps that must be complete before a profile may be sent for approval.
const PUBLISH_PREREQS = ['waterfall'];

// Profile-scoped screens: shown as tabs inside the profile workspace, not in the sidebar.
// Order matches SETUP_STEPS: the tabs are the set-up sequence.
const PROFILE_TABS = [
  ['waterfall', 'Decision waterfall'],
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
  ['l1', 'age', 'gte', '18 years', 'pass', true, 'E-01', 'RC-101'],
  ['l1', 'kyc', 'eq', 'SIM-registered (Tier 1)', 'pass', true, 'E-02', 'RC-102'],
  ['l1', 'account', 'in', 'Active', 'pass', true, 'E-03', 'RC-103'],
  ['l1', 'blocklist', 'eq', 'No match', 'pass', true, 'E-04', 'RC-501'],
  ['l0', 'txnMonths', 'gte', '1 month', 'pass', true, 'D-01', 'RC-301'],
  ['l0', 'inflow', 'gte', '$5 per month', 'pass', true, 'D-02', 'RC-303'],
  ['l3', 'score', 'gte', '380 points', 'pass', true, 'L-01', 'RC-114'],
  ['l1', 'exposure', 'gte', '$1 in open advances', 'decline', true, 'E-05', 'RC-401'],
  ['l4', 'afford', 'gte', '15% of inferred monthly income', 'capAfford', true, 'A-01', 'RC-207'],
  ['l5', 'exposure', 'gte', '$15 on this product', 'capAfford', true, 'X-01', 'RC-401'],
  ['l3', 'onTime', 'gte', '3 repayments', 'ladder', true, 'C-01', 'RC-701'],
  ['l3', 'arrears', 'eq', '0 days', 'ladder', true, 'C-02', 'RC-701'],
  ['l6', 'dailyApprovals', 'gte', '8,000 approvals', 'throttle', true, 'B-01', 'RC-601'],
  ['l6', 'dailyDisbursed', 'gte', '$20,000', 'throttle', true, 'B-02', 'RC-601'],
  ['l2', 'sim', 'lte', '30 days', 'decline', true, 'F-02', 'RC-502'],
  ['l6', 'pilotCell', 'in', 'All cells nationwide', 'pass', true, 'P-01', 'RC-402'],
];

// Bands carry a multiplier of the product maximum rather than an absolute
// amount, so changing the product maximum rescales every band at once.
// [label, floor, decision, multiplier, maxTenure, deposit, pop, badRate]
const DF_BANDS = [
  { label: 'Below floor', floor: 0, decision: 'Decline', multiplier: null, maxTenure: null, deposit: null, pop: 11, badRate: 24.8 },
  { label: 'Thin-file', floor: 100, decision: 'Approve at thin-file cap', multiplier: 0.25, maxTenure: 3, deposit: 30, pop: 23, badRate: 14.5 },
  { label: 'Conservative', floor: 300, decision: 'Approve, affordability capped', multiplier: 0.50, maxTenure: 4, deposit: 20, pop: 31, badRate: 8.7 },
  { label: 'Standard', floor: 500, decision: 'Approve', multiplier: 0.75, maxTenure: 6, deposit: 10, pop: 26, badRate: 4.2 },
  { label: 'Prime', floor: 750, decision: 'Approve, ladder eligible', multiplier: 1.00, maxTenure: 6, deposit: 0, pop: 9, badRate: 1.9 },
];
const AA_BANDS = [
  { label: 'Below floor', floor: 0, decision: 'Decline', multiplier: null, maxTenure: null, deposit: null, pop: 14, badRate: 28.4 },
  { label: 'Starter', floor: 80, decision: 'Approve at starter cap', multiplier: 0.25, maxTenure: 1, deposit: 0, pop: 30, badRate: 12.1 },
  { label: 'Regular', floor: 300, decision: 'Approve', multiplier: 0.50, maxTenure: 1, deposit: 0, pop: 34, badRate: 6.8 },
  { label: 'Plus', floor: 550, decision: 'Approve', multiplier: 0.75, maxTenure: 1, deposit: 0, pop: 16, badRate: 3.9 },
  { label: 'Max', floor: 800, decision: 'Approve, ladder eligible', multiplier: 1.00, maxTenure: 1, deposit: 0, pop: 6, badRate: 2.1 },
];
const EMPTY_BANDS = [
  { label: 'Below floor', floor: 0, decision: 'Not configured', multiplier: null, maxTenure: null, deposit: null, pop: 0, badRate: null },
  { label: 'Band 2', floor: 100, decision: 'Not configured', multiplier: null, maxTenure: null, deposit: null, pop: 0, badRate: null },
  { label: 'Band 3', floor: 300, decision: 'Not configured', multiplier: null, maxTenure: null, deposit: null, pop: 0, badRate: null },
  { label: 'Band 4', floor: 500, decision: 'Not configured', multiplier: null, maxTenure: null, deposit: null, pop: 0, badRate: null },
  { label: 'Band 5', floor: 750, decision: 'Not configured', multiplier: null, maxTenure: null, deposit: null, pop: 0, badRate: null },
];

// Per-profile values for the layer settings. An empty string means the value
// still has to come from the credit team, which the console counts and gates
// publication on.
const LAYER_SEEDS = {
  df: {
    l0: { featureCompleteness: '70', minWalletTenure: '180', minTxnHistory: '15', minLoanHistoryRepeat: '1', scoreStaleness: '7', modelConfidenceFloor: '', starterLimit: '50', starterTenure: '3', starterDeposit: '30', eligibleTier: 'Entry tier only', loansToGraduate: '1', increasePerCycle: '50', ladderCeiling: '250', resetDpd: '30', coolingPeriod: '30' },
    l1: { priorDefaultLookback: '24', concurrentLoanCap: '1', delinquentDpd: '0', minAccountTenure: '90', dormancyLimit: '30', staffHandling: 'Refer to manual review' },
    l2: { simSwapWindow: '30', deviceChangeFreq: '2', applicationVelocity: '2', profileChangeWindow: '14', inflowSpike: '3', dormantThenActive: 'Refer' },
    l3: { masterCutoff: '', referBands: 'Thin-file', reviewCapacity: '', overrideAuthority: '' },
    l4: { instalmentToIncome: '25', disposableFloor: '50', deductObligations: true, incomeStability: '0.5',
          minIncome: '100', incomeConfidence: '70', incomeHaircut: '25',
          incomeMethod: 'Recurring credits, excluding self-transfers and pass-through' },
    l5: { productMaximum: '500', minViableLimit: '30', customerExposureCap: '750',
          limitRounding: 'Nearest $10, rounded down', depositFloor: '0', permittedTenures: '3, 4 and 6 months' },
    l6: { thinFileShare: '40', dailyDisbursementCap: '', newToCreditCap: '50', autoTighten: 'Tighten by one band',
          killSwitch: false, randomHoldout: '2', seasonalityWindows: 'January, May, September', macroTightening: 'Off' },
  },
  aa: {
    l0: { featureCompleteness: '70', minWalletTenure: '90', minTxnHistory: '8', minLoanHistoryRepeat: '1', scoreStaleness: '7', modelConfidenceFloor: '', starterLimit: '2', starterTenure: '1', starterDeposit: '0', eligibleTier: 'All tiers', loansToGraduate: '3', increasePerCycle: '50', ladderCeiling: '15', resetDpd: '14', coolingPeriod: '14' },
    l1: { priorDefaultLookback: '24', concurrentLoanCap: '1', delinquentDpd: '0', minAccountTenure: '90', dormancyLimit: '30', staffHandling: 'Refer to manual review' },
    l2: { simSwapWindow: '30', deviceChangeFreq: '2', applicationVelocity: '2', profileChangeWindow: '14', inflowSpike: '3', dormantThenActive: 'Refer' },
    l3: { masterCutoff: '', referBands: 'Starter', reviewCapacity: '', overrideAuthority: '' },
    l4: { instalmentToIncome: '15', disposableFloor: '10', deductObligations: true, incomeStability: '0.6',
          minIncome: '40', incomeConfidence: '70', incomeHaircut: '25', incomeMethod: '30-day median inflow' },
    l5: { productMaximum: '15', minViableLimit: '1', customerExposureCap: '750',
          limitRounding: 'Nearest $1, rounded down', depositFloor: '0', permittedTenures: 'Single repayment, 30 days' },
    l6: { thinFileShare: '60', dailyDisbursementCap: '', newToCreditCap: '60', autoTighten: 'Tighten by one band',
          killSwitch: false, randomHoldout: '2', seasonalityWindows: 'January, May, September', macroTightening: 'Off' },
  },
  blank: {
    l0: {}, l1: {}, l2: {}, l3: {}, l4: {}, l5: {}, l6: {},
  },
};

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
    id: 'sd1', name: 'Applicant A', summary: '24 · wallet 4 months · 2 months of history · score not computed',
    outcome: 'Routed to cold-start', outcomeKind: 'route',
    firedRule: 'D-01',
    detail: 'Cleared the non-negotiable eligibility gates, then failed the L0 data check: 2 months of transaction history against a 3-month threshold. That is a routing decision, not a decline. The scored path is skipped and the customer is handled on the thin-file path instead.',
  },
  {
    id: 'sd2', name: 'Applicant B', summary: '31 · wallet 14 months · score 305 · 3 months history',
    outcome: 'Approve at thin-file cap', outcomeKind: 'approve',
    factors: ['RC-802', 'RC-801', 'RC-803'],
    boundRule: 'D-03', boundLabel: 'capped at the thin-file ceiling',
    detail: 'All gates passed and coverage was satisfied, so this customer was scored normally. Cashflow consistency was weak enough for the coverage rule to cap the limit at the thin-file ceiling before affordability bound it.',
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

// Only the routing layer opens on arrival; the rest are one click away.
const DEFAULT_OPEN = { l0: true, l1: false, l2: false, l3: false, l4: false, l5: false, l6: false };

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
    rules: RULES, bands: DF_BANDS, versions: DF_VERSIONS, limits: LIMITS_DF, coldStart: COLDSTART_DF, layers: LAYER_SEEDS.df,
    touched: { simulate: true },
  },
  {
    name: 'Airtime Advance', blurb: 'Instant airtime top-up credit, repaid on next recharge', market: 'Zimbabwe',
    version: 'v2.1', status: 'Published', editedAt: '28 Jul 2026, 09:15', editedBy: 'R. Chikanda', third: 'View',
    rules: AA_RULES, bands: AA_BANDS, versions: AA_VERSIONS, limits: LIMITS_AA, coldStart: COLDSTART_AA, layers: LAYER_SEEDS.aa,
    touched: { simulate: true },
  },
  {
    name: 'Life Cover', blurb: 'Premium affordability profile, not yet configured', market: 'Zimbabwe',
    version: 'n/a', status: 'Not started', editedAt: 'n/a', editedBy: 'n/a', third: 'Copy rules',
    rules: [], bands: EMPTY_BANDS, versions: [], limits: LIMITS_EMPTY, coldStart: COLDSTART_BLANK, layers: LAYER_SEEDS.blank,
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
