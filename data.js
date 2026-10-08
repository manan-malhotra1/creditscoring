// Sasai Credit, Rule Engine Console: static configuration data

const NAVY = '#144989';
const DARK = '#172E7B';
const TEAL = '#48C2CF';

// Every surface a parameter can be tagged as applicable to: the ten rule
// sections plus the three profile screens that also consume parameters.
const SECTION_TAGS = [
  ['layer_0', 'L0 Routing'],
  ['layer_1', 'L1 Knockouts'],
  ['layer_2', 'L2 Fraud screens'],
  ['layer_3', 'L3 Score & thin-file'],
  ['layer_4', 'L4 Affordability'],
  ['layer_5', 'L5 Limits'],
  ['layer_6', 'L6 Portfolio'],
  ['bands', 'Score bands'],
  ['fallback', 'Fallback scorecard'],
  ['coldstart', 'Cold-start gates'],
];
const SECTION_TAG_LABEL = Object.fromEntries(SECTION_TAGS);

// ONE global definition per parameter. `sections` tags where it may be used;
// `type` drives which operators and which value editor the rule row offers.
const PARAM_DEFS = [
  // Customer input signals: read directly from the wallet and KYC record
  { key: 'age', label: 'Customer age', group: 'input', type: 'duration', unit: 'years', sections: ['layer_1', 'fallback', 'coldstart'] },
  { key: 'tenure', label: 'Wallet account age', group: 'input', type: 'duration', unit: 'months', sections: ['layer_0', 'layer_1', 'layer_2', 'layer_3', 'fallback', 'coldstart'] },
  { key: 'kyc', label: 'KYC status', group: 'input', type: 'category', values: ['Fully verified (Tier 2)', 'SIM-registered (Tier 1)', 'Unverified'], sections: ['layer_1', 'fallback', 'coldstart'] },
  { key: 'account', label: 'Account status', group: 'input', type: 'category', values: ['Active', 'Active-dormant <30d', 'Dormant', 'Suspended', 'Closed'], sections: ['layer_1', 'fallback', 'coldstart'] },
  { key: 'balance', label: 'Current wallet balance', group: 'input', type: 'currency', sections: ['layer_0', 'layer_3', 'fallback'] },
  { key: 'avgBalance', label: 'Average balance (90 days)', group: 'input', type: 'currency', sections: ['layer_0', 'layer_3', 'fallback'] },
  { key: 'device', label: 'Device type on file', group: 'input', type: 'category', values: ['Smartphone', 'Feature phone', 'Unknown'], sections: ['layer_1', 'layer_2', 'fallback', 'coldstart'] },
  { key: 'sim', label: 'SIM age', group: 'input', type: 'duration', unit: 'days', sections: ['layer_1', 'layer_2', 'fallback', 'coldstart'] },
  // A match on this customer, not a portfolio counter, so it may gate eligibility.
  { key: 'blocklist', label: 'Fraud blocklist match', group: 'input', type: 'category', values: ['No match', 'Match', 'Under investigation'], sections: ['layer_1', 'layer_2', 'coldstart'] },

  // Inferred customer signals: derived by the feature pipeline
  { key: 'income', label: 'Inferred monthly income', group: 'inferred', type: 'currency', sections: ['layer_0', 'layer_3', 'layer_4', 'fallback'] },
  { key: 'inflow', label: 'Average monthly inflow', group: 'inferred', type: 'currency', sections: ['layer_0', 'layer_2', 'layer_3', 'layer_4', 'fallback'] },
  { key: 'outflow', label: 'Average monthly outflow', group: 'inferred', type: 'currency', sections: ['layer_4'] },
  { key: 'consistency', label: 'Cashflow consistency', group: 'inferred', type: 'ratio', unit: 'index', sections: ['layer_0', 'layer_3', 'layer_4', 'fallback'] },
  { key: 'volatility', label: 'Balance volatility', group: 'inferred', type: 'ratio', unit: 'coefficient', sections: ['layer_0', 'layer_4', 'fallback'] },
  { key: 'afford', label: 'Affordability ratio', group: 'inferred', type: 'percent', sections: ['layer_4', 'fallback'] },
  { key: 'txnMonths', label: 'Months of transaction history', group: 'inferred', type: 'duration', unit: 'months', sections: ['layer_0', 'layer_3', 'fallback'] },
  // Money already at risk: a knockout at L1, a cap at L4 and L5.
  { key: 'exposure', label: 'Existing group exposure', group: 'inferred', type: 'currency', sections: ['layer_1', 'layer_4', 'layer_5'] },
  { key: 'onTime', label: 'On-time instalments paid', group: 'inferred', type: 'count', unit: 'instalments', sections: ['layer_3', 'fallback'] },
  { key: 'arrears', label: 'Days in arrears (last 90 days)', group: 'inferred', type: 'duration', unit: 'days', sections: ['layer_1', 'layer_3', 'fallback'] },
  { key: 'activeDays', label: 'Active-days ratio (90 days)', group: 'inferred', type: 'ratio', unit: 'ratio', sections: ['layer_0', 'layer_3', 'fallback'] },
  { key: 'recharge', label: 'Recharge regularity', group: 'inferred', type: 'category', values: ['steady weekly top-ups', 'irregular top-ups', 'no recent top-ups'], sections: ['layer_0', 'layer_3', 'fallback'] },

  // Model outputs: produced by the shared scoring model
  { key: 'score', label: 'Model score', group: 'model', type: 'points', unit: 'points', sections: ['layer_3', 'bands'] },
  { key: 'pd', label: 'Probability of default', group: 'model', type: 'percent', sections: ['layer_3', 'bands'] },
  { key: 'confidence', label: 'Model confidence (coverage)', group: 'model', type: 'ratio', unit: 'index', sections: ['layer_0', 'bands'] },

  // Aggregate / system signals: portfolio and operational counters.
  // Deliberately NEVER valid in knockouts or affordability.
  { key: 'dailyApprovals', label: 'Approvals so far today', group: 'system', type: 'count', unit: 'approvals', sections: ['layer_6'] },
  { key: 'dailyDisbursed', label: 'Value disbursed so far today', group: 'system', type: 'currency', sections: ['layer_6'] },
  { key: 'popAffected', label: 'Population affected by this draft', group: 'system', type: 'percent', sections: ['layer_6'] },
  { key: 'pilotExposure', label: 'Total pilot exposure', group: 'system', type: 'currency', sections: ['layer_5', 'layer_6'] },
  { key: 'pilotCell', label: 'Pilot cell', group: 'system', type: 'category', values: ['Harare', 'Bulawayo', 'Mutare', 'Gweru', 'All cells nationwide'], sections: ['layer_6'] },
  // Device sharing is both a fraud signal and a concentration signal.
  { key: 'cluster', label: 'Wallets sharing this device (30 days)', group: 'system', type: 'count', unit: 'wallets', sections: ['layer_2', 'layer_5', 'layer_6'] },
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
// Three invariants govern the whole engine, asserted in the engine's own test
// suite (Technical Solutioning v2.1 §6.1).
const ENGINE_INVARIANTS = [
  ['Any layer can stop the process', 'A customer who fails a knockout is decided there. No score is produced and no later layer runs, so the decision stays fast and easy to explain.'],
  ['Limits only ever go down', 'L3 produces an indicative offer. L4, L5 and L6 can each reduce it; none can raise it.'],
  ['No approval exceeds the affordability ceiling', 'Whatever the band allows, the instalment must be sustainable against income. There is no bypass, on any path.'],
];

// final limit = MINIMUM of every cap that applies (§6.1).
const LIMIT_FORMULA = ['band or scorecard limit', 'affordability limit', 'product maximum',
                       'customer exposure cap', 'tier cap'];

// Layer 0 routes to exactly one of these. It never declines (§6.2, §4.4).
const ROUTING_OUTCOMES = [
  ['SCORED', 'Scored', 'Every sufficiency threshold met. The model score is trusted and the customer is banded at L3.'],
  ['THIN_FILE', 'Thin file', 'Some data, but at least one parameter below sufficiency. Scored by the fallback scorecard at L3a instead, and capped.'],
  ['NO_FILE', 'No file', 'At least one parameter below its hard floor. Handled on the starter ladder at L3a. Still continues to L1: this is a routing decision, not a decline.'],
];

// ---------------------------------------------------------------------------
// The decision waterfall, generated from the engine's own rule frame and
// product profile, so keys, layers, units, value shapes and defaults are the
// ones the engine actually evaluates. Copy follows Technical Solutioning v2.1.
//
// Rule set   fea92de9-8bc9-405c-9c83-e5195b254afe rev 4
// Profile    1443698d-a76e-4098-a858-d0788383776b rev 1
// Regenerate with: python3 api-tests/genlayers.py
// ---------------------------------------------------------------------------

const LAYERS = [
  {
    key: 'layer_0', num: 'L0', ref: '§6.2', title: 'Data sufficiency and routing',
    question: 'Is there enough data to score this customer at all?',
    intro: 'This layer routes, it never declines. Every parameter carries two thresholds. A customer is SCORED only if all of them are at or above sufficiency, NO FILE if any single one is below its hard floor, and THIN FILE in between. All-must-pass on sufficiency and any-one-fails on the floor, deliberately unweighted, because a weighted rule cannot be explained to a declined customer or defended to a regulator.',
    settings: [
      { key: 'feature_completeness', label: 'Feature completeness', type: 'dual', essential: true, unit: 'percent',
        meaning: 'Share of the features the model needs that are actually present for this customer. If the model uses 40 features and 28 are there, completeness is 70 percent.' },
      { key: 'wallet_tenure', label: 'Wallet tenure', type: 'dual', essential: true, unit: 'days',
        meaning: 'Days since the Ecocash account was opened. Behaviour observed over a short period is not reliable evidence, so this is the floor for trusting a score at all.' },
      { key: 'transaction_history', label: 'Transaction history', type: 'dual', essential: true, unit: 'days',
        meaning: 'Distinct days in the last 90 on which the customer transacted. Measures genuine activity rather than a dormant account with one transaction.' },
      { key: 'dormancy', label: 'Dormancy', type: 'dual', essential: false, unit: 'days',
        meaning: 'Days since the last transaction of any kind. A long gap means the observed behaviour is stale, not that the customer is ineligible.' },
      { key: 'model_confidence', label: 'Model confidence', type: 'dual', essential: true, unit: 'percent',
        meaning: 'Confidence returned alongside the score. Below the floor the score is not trusted. This one routes to thin file and never to no file, because low confidence is the model’s problem, not the customer’s.' },
      { key: 'score_staleness_limit', label: 'Score staleness limit', type: 'cycles', essential: false, unit: 'cycles',
        meaning: 'How many cycles old a score may be before it is out of date. Scores recalculate every cycle, so this mainly catches a pipeline failure going unnoticed.' },
      { key: 'repeat_path_threshold', label: 'Repeat path threshold', type: 'loans', essential: false, unit: 'loans',
        meaning: 'How many closed loans before a customer is treated as a repeat borrower rather than a new one.' },
    ],
  },
  {
    key: 'layer_1', num: 'L1', ref: '§6.3', title: 'Hard knockouts',
    question: 'Is the customer eligible at all?',
    intro: 'Absolute eligibility, and eligibility only. The evidence thresholds sit at L0, which is what lets a genuinely new customer pass here and reach a starter offer. These are not risk judgements and the score does not affect them.',
    settings: [
      { key: 'minimum_age', label: 'Minimum age', type: 'years', essential: true, unit: 'years', action: 'decline',
        meaning: 'Youngest customer who may be offered credit.' },
      { key: 'maximum_age_at_maturity', label: 'Maximum age at maturity', type: 'years', essential: true, unit: 'years', action: 'decline',
        meaning: 'Oldest a customer may be when the final instalment falls due, not when they apply.' },
      { key: 'kyc_status', label: 'KYC status', type: 'multi', essential: true, action: 'decline',
        meaning: 'Which verification tiers are eligible. Carried through the serving store as a raw eligibility field, because it is excluded from the model feature set.' },
      { key: 'account_status', label: 'Account status', type: 'multi', essential: true, action: 'decline',
        meaning: 'Which wallet states are eligible.' },
      { key: 'deceased_indicator', label: 'Deceased indicator', type: 'flag', essential: false, action: 'decline',
        meaning: 'Excludes an account flagged as belonging to a deceased customer.' },
      { key: 'concurrent_loan_cap', label: 'Concurrent loan cap', type: 'loans', essential: true, unit: 'loans', action: 'decline',
        meaning: 'How many loans a customer may hold at once. Taking several at once is the fastest route to over-indebtedness.' },
      { key: 'blacklist_debarment', label: 'Blacklist or debarment', type: 'flag', essential: true, action: 'decline',
        meaning: 'Excludes a customer on a blacklist or under debarment.' },
      { key: 'fraud_aml_flag', label: 'Fraud or AML flag', type: 'flag', essential: true, action: 'decline',
        meaning: 'Excludes a customer carrying a fraud or anti-money-laundering flag. Non-negotiable, and cannot be waived by taking a deposit.' },
      { key: 'staff_related_parties', label: 'Staff and related parties', type: 'flag', essential: false, action: 'refer',
        meaning: 'Employees and connected parties, handled for governance reasons rather than risk ones.' },
      { key: 'currently_delinquent', label: 'Currently delinquent', type: 'days_past_due', essential: true, unit: 'days_past_due', action: 'decline',
        meaning: 'Days past due on any open loan above which a new loan is refused.' },
      { key: 'prior_default_lookback', label: 'Prior default with Ecocash', type: 'months', essential: true, unit: 'months', action: 'decline',
        meaning: 'Excludes a customer who has defaulted with Ecocash inside this window. Commercial rather than technical: a lookback trades safety against a smaller customer base. Set it knowing the daily data lag.' },
    ],
  },
  {
    key: 'layer_2', num: 'L2', ref: '§6.4', title: 'Fraud and first-payment-default screens',
    question: 'Does the application carry identity risk?',
    intro: 'Identity risk rather than credit risk, where the warning signs and the remedies both differ. SIM registration age and swap history are not available from the data and are deliberately not part of this design.',
    settings: [
      { key: 'minimum_account_age', label: 'Minimum account age', type: 'days', essential: false, unit: 'days', action: 'refer',
        meaning: 'Wallet age below which the application is stopped. Distinct from the L0 threshold, which asks whether a score can be trusted.' },
      { key: 'application_velocity', label: 'Application velocity', type: 'applications', essential: false, unit: 'applications', action: 'refer',
        meaning: 'Repeated applications in a short window suggest shopping for an approval. Computed live rather than from the daily extract.' },
      { key: 'profile_change_velocity', label: 'Profile change velocity', type: 'profile_changes', essential: false, unit: 'profile_changes', action: 'refer',
        meaning: 'KYC or contact details changing just before an application is an account-takeover signal.' },
      { key: 'pre_application_inflow_spike', label: 'Pre-application inflow spike', type: 'multiplier', essential: false, unit: 'multiplier', action: 'refer',
        meaning: 'Compares recent inflow against the longer baseline. A sudden spike can mean the wallet was funded to look more creditworthy.' },
      { key: 'device_change_frequency', label: 'Device change frequency', type: 'count', essential: false, action: 'refer',
        meaning: 'How often the device on the account has changed. Frequent changes can indicate device resale, which matters directly when the loan finances a device.' },
      { key: 'dormant_then_suddenly_active', label: 'Dormant then suddenly active', type: 'count', essential: false, action: 'refer',
        meaning: 'An account that was quiet and then became busy shortly before applying.' },
    ],
  },
  {
    key: 'layer_3', num: 'L3', ref: '§6.5', title: 'Score decisioning and bands',
    question: 'What band does the customer fall into, and what is the indicative offer?',
    intro: 'Converts risk into an indicative offer. The band table sets the shape of the offer; the limit matrix refines it downward on the score band and the affordability share together.',
    settings: [
      { key: 'predicted_confidence_band_table', label: 'Predicted confidence bands', type: 'table', essential: false,
        meaning: 'Bands the model’s repayment confidence falls into, reported alongside the credit band. Informational: it does not set the offer.' },
      { key: 'limit_matrix', label: 'Limit matrix', type: 'table', essential: true,
        meaning: 'The indicative multiplier on two axes: the score band, and the share of income the instalment would take. The affordability share comes from the maximum sustainable instalment computed at L4, not from the offer, which would be circular. The matrix only ever refines the offer downward, and the L4 cap still applies afterwards.' },
      { key: 'master_approval_cutoff', label: 'Master approval cutoff', type: 'score', essential: true, unit: 'score',
        meaning: 'A single score floor below which nobody is approved, whatever the band table says. The main lever for tightening or loosening overall.' },
      { key: 'refer_band_boundaries', label: 'Refer band boundaries', type: 'table', essential: false,
        meaning: 'Which bands would route to manual review. Dormant while referrals are switched off: those bands fall back to the action set in the referral policy.' },
      { key: 'score_source_cap', label: 'Score source cap', type: 'max_band', essential: true, unit: 'max_band',
        meaning: 'The highest band a scorecard score may reach. Model discrimination can only be measured on the model-scored population, so a scorecard score is held below the top bands.' },
      { key: 'manual_review_capacity', label: 'Manual review capacity', type: 'applications_per_day', essential: false, unit: 'applications_per_day',
        meaning: 'The most referred applications the team can handle per day. Meaningless while referrals are switched off.' },
      { key: 'referral_policy', label: 'Referral policy', type: 'table', essential: true,
        meaning: 'Whether manual review exists at all, and what each referral source does instead when it does not. With referrals off, every band or screen that would have referred takes its fallback action, so no application can sit in a queue that nobody is working.' },
      { key: 'band_table', label: 'Score bands', type: 'table', essential: true,
        meaning: 'The band each score falls into, and the indicative offer that comes with it.' },
    ],
  },
  {
    key: 'layer_3a', num: 'L3a', ref: '§6.6', title: 'Fallback scorecard',
    question: 'How is a customer the model cannot score given a score?',
    intro: 'Thin-file and no-file customers cannot be scored by the model, so a points scorecard scores them on observed signals onto the same 0 to 100 scale and they enter the same band table. Deterministic arithmetic over features Layer B already holds, not a trained model. Each attribute names the feature it reads and the bands that award its points.',
    settings: [
      { key: 'scorecard_cap', label: 'Scorecard band cap', type: 'max_band', essential: true, unit: 'max_band',
        meaning: 'The top band a scorecard-scored customer can reach.' },
      { key: 'average_wallet_balance_points', label: 'Average balance points', type: 'points', essential: false, feature: 'balanceAvg30d',
        meaning: 'Points for the average wallet balance. The largest single contributor, because a maintained balance is the strongest thin-file signal.' },
      { key: 'wallet_tenure_points', label: 'Wallet tenure points', type: 'points', essential: false, feature: 'accountTenureDays',
        meaning: 'Points for how long the wallet has been open.' },
      { key: 'active_days_last_30_points', label: 'Active days points', type: 'points', essential: false, feature: 'activeDays30d',
        meaning: 'Points for distinct days with activity in the last 30.' },
      { key: 'positive_cashflow_day_ratio_points', label: 'Positive cash-flow day ratio points', type: 'points', essential: false, feature: 'positiveCashflowRatio90d',
        meaning: 'Points for the share of days where money in exceeded money out.' },
      { key: 'transaction_count_last_30_points', label: 'Transaction count points', type: 'points', essential: false, feature: 'transactionCount30d',
        meaning: 'Points for the number of transactions in the last 30 days.' },
      { key: 'minimum_wallet_balance_points', label: 'Minimum balance points', type: 'points', essential: false, feature: 'balanceMin30d',
        meaning: 'Points for the lowest balance held, which shows whether the wallet is ever emptied.' },
      { key: 'inflow_regularity_points', label: 'Inflow regularity points', type: 'points', essential: false,
        meaning: 'Points for how regularly money arrives, rather than how much.' },
      { key: 'kyc_completeness_points', label: 'KYC completeness points', type: 'points', essential: false, feature: 'kycLevel',
        meaning: 'Points for how complete the customer’s verification record is.' },
    ],
  },
  {
    key: 'layer_4', num: 'L4', ref: '§6.7', title: 'Affordability',
    question: 'Is this specific instalment sustainable against income?',
    intro: 'A different question from the score. It applies to every path, including thin file and no file, with no bypass. Income is derived, never taken from gross inflow: balance is a stock and income is a flow, and neither is sufficient alone.',
    settings: [
      { key: 'instalment_to_income_cap', label: 'Instalment to income cap', type: 'percent', essential: true, unit: 'percent',
        meaning: 'The largest share of monthly income the instalment may represent. With income of $400 and a cap of 25 percent, the maximum instalment is $100.' },
      { key: 'existing_obligation_deduction', label: 'Existing obligation deduction', type: 'flag', essential: false,
        meaning: 'Whether instalments on the customer’s existing Ecocash loans are subtracted from income first. Loans held with other lenders are invisible until bureau or Credit Registry data is available.' },
      { key: 'income_confidence_threshold', label: 'Income confidence threshold', type: 'percent', essential: false, unit: 'percent',
        meaning: 'Above this, derived recurring income is used. Below it, the balance proxy is used instead and a haircut applies.' },
      { key: 'haircut_low_confidence', label: 'Haircut when confidence is low', type: 'percent', essential: false, unit: 'percent',
        meaning: 'How much estimated income is reduced when confidence falls below the threshold, so a weak estimate produces a cautious offer rather than a confident wrong one.' },
      { key: 'balance_proxy_intercept', label: 'Balance proxy intercept', type: 'USD', essential: false, unit: 'USD',
        meaning: 'The constant term of the same fitted relationship.' },
      { key: 'balance_proxy_coefficient', label: 'Balance proxy coefficient', type: 'multiplier', essential: false, unit: 'multiplier',
        meaning: 'Fitted, not chosen: derived by regressing derived income against average and median balance on the population where both are computable with high confidence, then applied where derivation fails.' },
      { key: 'income_stability_requirement', label: 'Income stability requirement', type: 'coefficient_of_variation', essential: false, unit: 'coefficient_of_variation',
        meaning: 'How variable income may be, as a coefficient of variation. Steady income supports an instalment more reliably than the same average arriving erratically.' },
      { key: 'net_disposable_income_floor', label: 'Net disposable income floor', type: 'USD', essential: true, unit: 'USD',
        meaning: 'The minimum that must remain after estimated expenses and the new instalment. Protects customers who pass the ratio test but have very little margin.' },
      { key: 'haircut_thin_no_file', label: 'Haircut, thin file and no file', type: 'percent', essential: true, unit: 'percent',
        meaning: 'A deeper reduction for customers with little history, set conservatively because obligations to other lenders cannot be seen.' },
      { key: 'minimum_monthly_income', label: 'Minimum monthly income', type: 'USD', essential: true, unit: 'USD',
        meaning: 'The floor below which no loan is offered, whatever the ratios say.' },
    ],
  },
  {
    key: 'layer_5', num: 'L5', ref: '§6.8', title: 'Exposure, limits and the credit ladder',
    question: 'What is the final limit, taken as the lowest of every applicable cap?',
    intro: 'Produces the final number as the lowest cap that applies. Limits are the most effective loss control available, because loss is exposure multiplied by default rate and a cutoff moves only the second term. Every value here lives on the product profile rather than the rule set, which is why this is the only product-specific layer, and why the credit ladder moved here: a starter limit is a property of the product.',
    // Held on the product profile rather than the rule set: the only
    // product-specific layer, and the only one with no rules of its own.
    profile: true,
    settings: [
      { key: 'productMaximum', label: 'Product maximum', type: 'currency', essential: true,
        meaning: 'The highest limit this product can ever offer. Band multipliers are applied to this figure.' },
      { key: 'minimumViableLimit', label: 'Minimum viable limit', type: 'currency', essential: true,
        meaning: 'If every cap combined comes out below this, no offer is made. This is also how a no-file customer with a zero starter limit is declined, by arithmetic rather than a gate.' },
      { key: 'totalCustomerExposureCap', label: 'Total customer exposure cap', type: 'currency', essential: true,
        meaning: 'The most a customer may owe across all Ecocash credit at once: existing outstanding balance plus the new limit.' },
      { key: 'limitRoundingIncrement', label: 'Limit rounding increment', type: 'currency', essential: false,
        meaning: 'The final limit is rounded down to a multiple of this, so customers are offered clean amounts.' },
      { key: 'permittedTenures', label: 'Permitted tenures', type: 'tenures', essential: true,
        meaning: 'The repayment periods, in months, that may be offered at all. A band can only pick from this list.' },
      { key: 'depositFloorPct', label: 'Deposit floor', type: 'percent', essential: false,
        meaning: 'A minimum deposit applied whatever the band says.' },
      { key: 'starterLimitThinFile', label: 'Starter limit, thin file', type: 'currency', essential: true,
        meaning: 'The most offered to a thin-file customer on a first loan.' },
      { key: 'starterLimitNoFile', label: 'Starter limit, no file', type: 'currency', essential: true,
        meaning: 'The most offered to a customer with no history at all. Set this to zero to decline that group instead: the decline then comes from the minimum viable limit, and the reason code names it.' },
      { key: 'ladderMaxTenureMonths', label: 'Ladder maximum tenure', type: 'months', essential: false,
        meaning: 'The longest repayment period on a ladder loan. A shorter term means the outcome is known sooner.' },
      { key: 'ladderDepositPct', label: 'Ladder deposit requirement', type: 'percent', essential: true,
        meaning: 'Share of value paid upfront on a ladder loan. A deposit reduces exposure and selects for committed customers.' },
      { key: 'loansRequiredToGraduate', label: 'Loans required to graduate', type: 'count', essential: false,
        meaning: 'How many loans must be repaid in full before the limit increases.' },
      { key: 'limitIncreasePerCyclePct', label: 'Limit increase per cycle', type: 'percent', essential: false,
        meaning: 'How much the limit rises after each successfully repaid loan, as a share of the previous limit.' },
      { key: 'maxLadderLimit', label: 'Maximum limit via the ladder', type: 'currency', essential: false,
        meaning: 'The ceiling reachable through the ladder alone, after which normal band scoring applies.' },
      { key: 'resetOnDelinquencyDaysPastDue', label: 'Reset on delinquency', type: 'days', essential: false,
        meaning: 'The level of lateness that resets a laddered customer to the starter limit.' },
      { key: 'coolingPeriodAfterDeclineDays', label: 'Cooling period after decline', type: 'days', essential: false,
        meaning: 'How long a declined customer waits before applying again.' },
    ],
  },
  {
    key: 'layer_6', num: 'L6', ref: '§6.9', title: 'Portfolio controls',
    question: 'Does this approval remain acceptable for the book as a whole?',
    intro: 'Every rule so far judges an individual customer; these protect the book. Their absence is usually what causes difficulty months later, when the book has quietly concentrated in the riskiest segment.',
    settings: [
      { key: 'max_thin_file_share_of_approvals', label: 'Maximum thin-file share of approvals', type: 'percent', essential: true, unit: 'percent',
        meaning: 'The share of daily approvals that may go to thin-file customers. Stops the book filling with the least-known customers during a growth push.' },
      { key: 'daily_disbursement_cap', label: 'Daily disbursement cap', type: 'USD_per_day', essential: true, unit: 'USD_per_day',
        meaning: 'A ceiling on the total amount disbursed per day. Controls the pace at which exposure builds.' },
      { key: 'new_to_credit_concentration_cap', label: 'New-to-credit concentration cap', type: 'percent', essential: true, unit: 'percent',
        meaning: 'The largest share of the book made up of customers with no prior repayment history.' },
      { key: 'automatic_tightening_trigger', label: 'Automatic tightening trigger', type: 'delinquency_percent', essential: false, unit: 'delinquency_percent', action: 'tighten_by_one_band',
        meaning: 'If early delinquency rises above an agreed level the engine tightens automatically, rather than waiting for a monthly review.' },
      { key: 'kill_switch', label: 'Kill switch', type: 'flag', essential: true,
        meaning: 'A manual control that halts all approvals immediately. Necessary for any live lending system.' },
      { key: 'random_approval_holdout', label: 'Random approval holdout', type: 'percent', essential: false, unit: 'percent',
        meaning: 'Approves a small share of applications just below the cutoff at random, so outcomes are observed for customers who would normally be declined. Without it every new model trains only on customers the previous rules passed, and becomes systematically over-optimistic.' },
    ],
  },
];

// Default values exactly as the engine's ACTIVE rule set holds them, so an
// unedited profile here and an unedited product there agree.
const LAYER_DEFAULTS = {
  layer_0: {
    feature_completeness: { value: {"unit": "percent", "operator": "gte", "hardFloor": 40, "sufficiency": 70}, enabled: true },
    wallet_tenure: { value: {"unit": "days", "operator": "gte", "hardFloor": 30, "sufficiency": 180}, enabled: true },
    transaction_history: { value: {"unit": "days", "operator": "gte", "hardFloor": 3, "sufficiency": 15}, enabled: true },
    dormancy: { value: {"unit": "days", "operator": "lte", "hardFloor": 90, "sufficiency": 30}, enabled: true },
    model_confidence: { value: {"unit": "percent", "operator": "gte", "hardFloor": null, "sufficiency": null, "floorBehavior": "route_thin_file"}, enabled: false },
    score_staleness_limit: { value: {"unit": "cycles", "operator": "lte", "threshold": 2}, enabled: false },
    repeat_path_threshold: { value: {"unit": "loans", "operator": "gte", "threshold": 1}, enabled: false },
  },
  layer_1: {
    minimum_age: { value: {"unit": "years", "operator": "gte", "threshold": 18}, enabled: true, action: 'decline' },
    maximum_age_at_maturity: { value: {"unit": "years", "operator": "lte", "threshold": 65}, enabled: true, action: 'decline' },
    kyc_status: { value: {"allowedValues": ["fully_verified"]}, enabled: true, action: 'decline' },
    account_status: { value: {"allowedValues": ["active"]}, enabled: false, action: 'decline' },
    deceased_indicator: { value: {"expectedValue": false}, enabled: false, action: 'decline' },
    concurrent_loan_cap: { value: {"unit": "loans", "operator": "lte", "threshold": 10}, enabled: true, action: 'decline' },
    blacklist_debarment: { value: {"expectedValue": false}, enabled: false, action: 'decline' },
    fraud_aml_flag: { value: {"expectedValue": false}, enabled: false, action: 'decline' },
    staff_related_parties: { value: {"expectedValue": false}, enabled: false, action: 'refer' },
    currently_delinquent: { value: {"unit": "days_past_due", "operator": "lte", "threshold": 45}, enabled: true, action: 'decline' },
    prior_default_lookback: { value: {"unit": "months", "operator": "gte", "threshold": 0.5}, enabled: true, action: 'decline' },
  },
  layer_2: {
    minimum_account_age: { value: {"unit": "days", "operator": "gte", "threshold": 90}, enabled: true, action: 'refer' },
    application_velocity: { value: {"unit": "applications", "operator": "gt", "threshold": 5, "windowDays": 30}, enabled: true, action: 'refer' },
    profile_change_velocity: { value: {"unit": "profile_changes", "operator": "gte", "threshold": 1, "windowDays": 14}, enabled: true, action: 'refer' },
    pre_application_inflow_spike: { value: {"unit": "multiplier", "operator": "gt", "currentWindowDays": 30, "baselineWindowDays": 90, "multiplierThreshold": 3}, enabled: true, action: 'refer' },
    device_change_frequency: { value: {}, enabled: false, action: 'refer' },
    dormant_then_suddenly_active: { value: {"dormancyMaxActiveDays": 0, "dormancyThresholdDays": 23, "reactivationWindowDays": 7, "reactivationMinActiveDays": 5}, enabled: true, action: 'refer' },
  },
  layer_3: {
    predicted_confidence_band_table: { value: {"rows": [{"outputs": {"band": "A"}, "rangeMax": 100, "rangeMin": 85}, {"outputs": {"band": "B"}, "rangeMax": 85, "rangeMin": 70}, {"outputs": {"band": "C"}, "rangeMax": 70, "rangeMin": 50}, {"outputs": {"band": "D"}, "rangeMax": 50, "rangeMin": 30}, {"outputs": {"band": "E"}, "rangeMax": 30, "rangeMin": 0}]}, enabled: true },
    limit_matrix: { value: {"rows": ["A", "B", "C", "D"], "cells": [[1, 1, 0.85, 0.7], [0.9, 0.75, 0.65, 0.55], [0.65, 0.5, 0.4, 0.35], [0.35, 0.25, 0.2, "refer"]], "rowKey": "band", "columns": [{"max": 10, "label": "under_10pct"}, {"max": 15, "label": "10_15pct"}, {"max": 20, "label": "15_20pct"}, {"max": 25, "label": "20_25pct"}]}, enabled: true },
    master_approval_cutoff: { value: {"unit": "score", "operator": "gte", "threshold": 35}, enabled: true },
    refer_band_boundaries: { value: {"rows": [{"outputs": {"bands": ["D"]}, "rangeMax": null, "rangeMin": null}]}, enabled: true },
    score_source_cap: { value: {"unit": "max_band", "value": "C"}, enabled: true },
    manual_review_capacity: { value: {"unit": "applications_per_day", "value": 0}, enabled: false },
    referral_policy: { value: {"fallbacks": {"layer_1": {"action": "decline"}, "layer_2": {"action": "decline"}, "layer_3": {"action": "decline", "depositUpliftPct": null}}, "referralsEnabled": false}, enabled: true },
    band_table: { value: {"rows": [{"outputs": {"band": "A", "decision": "approve", "depositPct": 0, "maxTenureMonths": 6}, "rangeMax": 100, "rangeMin": 85}, {"outputs": {"band": "B", "decision": "approve", "depositPct": 10, "maxTenureMonths": 6}, "rangeMax": 85, "rangeMin": 70}, {"outputs": {"band": "C", "decision": "approve", "depositPct": 20, "maxTenureMonths": 4}, "rangeMax": 70, "rangeMin": 50}, {"outputs": {"band": "D", "decision": "refer", "depositPct": 30, "maxTenureMonths": 3}, "rangeMax": 50, "rangeMin": 30}, {"outputs": {"band": "E", "decision": "decline"}, "rangeMax": 30, "rangeMin": 0}]}, enabled: true },
  },
  layer_3a: {
    scorecard_cap: { value: {"unit": "max_band", "value": "C"}, enabled: true },
    average_wallet_balance_points: { value: {"rows": [{"outputs": {"points": 0}, "rangeMax": 4.74, "rangeMin": null}, {"outputs": {"points": 6.67}, "rangeMax": 10.92, "rangeMin": 4.74}, {"outputs": {"points": 13.33}, "rangeMax": 24.42, "rangeMin": 10.92}, {"outputs": {"points": 20}, "rangeMax": null, "rangeMin": 24.42}], "feature": "balanceAvg30d", "maxPoints": 20}, enabled: true },
    wallet_tenure_points: { value: {"rows": [{"outputs": {"points": 0}, "rangeMax": 29, "rangeMin": 0}, {"outputs": {"points": 5}, "rangeMax": 89, "rangeMin": 30}, {"outputs": {"points": 10}, "rangeMax": 179, "rangeMin": 90}, {"outputs": {"points": 15}, "rangeMax": null, "rangeMin": 180}], "feature": "accountTenureDays", "maxPoints": 15}, enabled: true },
    active_days_last_30_points: { value: {"rows": [{"outputs": {"points": 0}, "rangeMax": 2, "rangeMin": 0}, {"outputs": {"points": 5}, "rangeMax": 7, "rangeMin": 3}, {"outputs": {"points": 10}, "rangeMax": 15, "rangeMin": 8}, {"outputs": {"points": 15}, "rangeMax": null, "rangeMin": 16}], "feature": "activeDays30d", "maxPoints": 15}, enabled: true },
    positive_cashflow_day_ratio_points: { value: {"rows": [{"outputs": {"points": 0}, "rangeMax": 0.33, "rangeMin": null}, {"outputs": {"points": 5}, "rangeMax": 0.5, "rangeMin": 0.33}, {"outputs": {"points": 10}, "rangeMax": 0.64, "rangeMin": 0.5}, {"outputs": {"points": 15}, "rangeMax": null, "rangeMin": 0.64}], "feature": "positiveCashflowRatio90d", "maxPoints": 15}, enabled: true },
    transaction_count_last_30_points: { value: {"rows": [{"outputs": {"points": 0}, "rangeMax": 4, "rangeMin": 0}, {"outputs": {"points": 3.33}, "rangeMax": 8, "rangeMin": 5}, {"outputs": {"points": 6.67}, "rangeMax": 15, "rangeMin": 9}, {"outputs": {"points": 10}, "rangeMax": null, "rangeMin": 16}], "feature": "transactionCount30d", "maxPoints": 10}, enabled: true },
    minimum_wallet_balance_points: { value: {"rows": [{"outputs": {"points": 0}, "rangeMax": 0, "rangeMin": null}, {"outputs": {"points": 3.33}, "rangeMax": 0.01, "rangeMin": 0}, {"outputs": {"points": 6.67}, "rangeMax": 0.17, "rangeMin": 0.01}, {"outputs": {"points": 10}, "rangeMax": null, "rangeMin": 0.17}], "feature": "balanceMin30d", "maxPoints": 10}, enabled: true },
    inflow_regularity_points: { value: {"rows": [], "feature": null, "maxPoints": 10}, enabled: false },
    kyc_completeness_points: { value: {"rows": [{"values": ["SELFREGSUB"], "outputs": {"points": 0}}, {"values": ["BANKSUBS", "GOLDSUBS", "FARMERS", "CARDSUBMAS"], "outputs": {"points": 5}}], "feature": "kycLevel", "maxPoints": 5}, enabled: true },
  },
  layer_4: {
    instalment_to_income_cap: { value: {"unit": "percent", "operator": "lte", "threshold": 25}, enabled: true },
    existing_obligation_deduction: { value: {"expectedValue": true}, enabled: true },
    income_confidence_threshold: { value: {"unit": "percent", "operator": "gte", "threshold": 70}, enabled: true },
    haircut_low_confidence: { value: {"unit": "percent", "value": 25}, enabled: true },
    balance_proxy_intercept: { value: {"unit": "USD", "value": 90}, enabled: true },
    balance_proxy_coefficient: { value: {"unit": "multiplier", "value": 5}, enabled: true },
    income_stability_requirement: { value: {"unit": "coefficient_of_variation", "operator": "lte", "threshold": 1.5}, enabled: true },
    net_disposable_income_floor: { value: {"unit": "USD", "operator": "gte", "threshold": 0}, enabled: true },
    haircut_thin_no_file: { value: {"unit": "percent", "value": 25}, enabled: true },
    minimum_monthly_income: { value: {"unit": "USD", "operator": "gte", "threshold": 50}, enabled: true },
  },
  layer_6: {
    max_thin_file_share_of_approvals: { value: {"unit": "percent", "operator": "lt", "threshold": 40}, enabled: false },
    daily_disbursement_cap: { value: {"unit": "USD_per_day", "value": null}, enabled: false },
    new_to_credit_concentration_cap: { value: {"unit": "percent", "operator": "lt", "threshold": 50}, enabled: false },
    automatic_tightening_trigger: { value: {"unit": "delinquency_percent", "operator": "gte", "threshold": 1.5}, enabled: false, action: 'tighten_by_one_band' },
    kill_switch: { value: {"expectedValue": false}, enabled: true },
    random_approval_holdout: { value: {"unit": "percent", "value": 2}, enabled: false },
  },
};

// The product profile as the engine holds it.
const PROFILE_VALUES = {
  "maxLadderLimit": 250,
  "productMaximum": 500,
  "depositFloorPct": 0,
  "ladderDepositPct": 30,
  "permittedTenures": [
    3,
    4,
    6
  ],
  "minimumViableLimit": 20,
  "starterLimitNoFile": 30,
  "starterLimitThinFile": 50,
  "ladderMaxTenureMonths": 3,
  "limitRoundingIncrement": 10,
  "loansRequiredToGraduate": 1,
  "limitIncreasePerCyclePct": 50,
  "totalCustomerExposureCap": 750,
  "coolingPeriodAfterDeclineDays": 30,
  "resetOnDelinquencyDaysPastDue": 30
};

const ENGINE_VERSIONS = { ruleVersionId: 'fea92de9-8bc9-405c-9c83-e5195b254afe', profileId: '1443698d-a76e-4098-a858-d0788383776b', profileRevision: 1, readAt: '2026-10-08' };

// Read out of the layer_3 band_table rule.
const BAND_ROWS = [
  { band: 'A', rangeMin: 85, rangeMax: 100, decision: 'approve', multiplier: null, maxTenureMonths: 6, depositPct: 0 },
  { band: 'B', rangeMin: 70, rangeMax: 85, decision: 'approve', multiplier: null, maxTenureMonths: 6, depositPct: 10 },
  { band: 'C', rangeMin: 50, rangeMax: 70, decision: 'approve', multiplier: null, maxTenureMonths: 4, depositPct: 20 },
  { band: 'D', rangeMin: 30, rangeMax: 50, decision: 'refer', multiplier: null, maxTenureMonths: 3, depositPct: 30 },
  { band: 'E', rangeMin: 0, rangeMax: 30, decision: 'decline', multiplier: null, maxTenureMonths: null, depositPct: null },
];

// The band by affordability-share matrix, layer_3 limit_matrix.
const LIMIT_MATRIX = { rows: ["A", "B", "C", "D"], columns: [{"max": 10, "label": "under_10pct"}, {"max": 15, "label": "10_15pct"}, {"max": 20, "label": "15_20pct"}, {"max": 25, "label": "20_25pct"}], cells: [[1, 1, 0.85, 0.7], [0.9, 0.75, 0.65, 0.55], [0.65, 0.5, 0.4, 0.35], [0.35, 0.25, 0.2, "refer"]] };

const CONFIDENCE_BANDS = [{"band": "A", "rangeMin": 85, "rangeMax": 100}, {"band": "B", "rangeMin": 70, "rangeMax": 85}, {"band": "C", "rangeMin": 50, "rangeMax": 70}, {"band": "D", "rangeMin": 30, "rangeMax": 50}, {"band": "E", "rangeMin": 0, "rangeMax": 30}];

// Whether manual review exists, and what each source does when it does not.
const REFERRAL_POLICY = {
  "fallbacks": {
    "layer_1": {
      "action": "decline"
    },
    "layer_2": {
      "action": "decline"
    },
    "layer_3": {
      "action": "decline",
      "depositUpliftPct": null
    }
  },
  "referralsEnabled": false
};

const LAYER_KEYS = LAYERS.map(l => l.key);

// Parameters measuring the same underlying thing in more than one layer. The
// draft sets these independently, so the console flags the overlap rather than
// silently resolving it.
const OVERLAP_GROUPS = [
  { tag: 'tenure', label: 'Account age is read in three places, on purpose',
    note: 'L0 asks whether there is enough history to trust a score. L2 asks whether a very new account is a fraud signal. L3a awards points for it on the fallback scorecard. Different questions on the same field, set independently, and the strictest always wins. Check all three are intentional.' },
  { tag: 'kyc', label: 'KYC is read twice, on purpose',
    note: 'L1 uses it as an absolute eligibility gate. L3a awards scorecard points for how complete the record is. A customer can therefore fail the gate and still have scored points, which is harmless because L1 runs first and stops the application.' },
  { tag: 'dormancy', label: 'Dormancy is read twice, on purpose',
    note: 'L0 asks whether a long gap makes the observed behaviour stale, which routes. L2 asks whether an account that went quiet and then became busy is a takeover signal, which refers. Same field, different question, different remedy.' },
  { tag: 'delinquency', label: 'Delinquency is read twice, on purpose',
    note: 'L1 refuses a new loan while the customer is past due. L3a resets a laddered customer to the starter limit at a different level of lateness. Set them knowing the daily data lag: a delinquency arising since the last extract is invisible to both.' },
];


const SECTION_ACTIONS = {
  layer_0: ['pass', 'decline', 'refer', 'capThin', 'hold'],
  layer_1: ['pass', 'decline', 'refer'],
  layer_2: ['pass', 'decline', 'refer', 'hold'],
  layer_3: ['pass', 'decline', 'refer', 'capThin', 'ladder', 'reduce', 'hold'],
  layer_4: ['pass', 'decline', 'refer', 'capAfford', 'reduce'],
  layer_5: ['pass', 'decline', 'refer', 'capAfford', 'reduce'],
  layer_6: ['pass', 'refer', 'throttle', 'hold'],
};

const LABEL = Object.fromEntries(PARAM_DEFS.map(d => [d.key, d.label]));
const OPLABEL = Object.fromEntries(OPERATORS);
const ACTLABEL = Object.fromEntries(ACTIONS);
const SENT_OP = { gte: 'is at least', lte: 'is at most', between: 'is between', in: 'is one of', notin: 'is not one of', eq: 'is' };


// Rule tuples: [section, param, op, value, action, enabled, code, reasonCode]
// reasonCode is the code the engine emits when THIS rule determines the outcome.

// ---------------------------------------------------------------------------
// Single-customer assessment
//
// One applicant, run down L0 to L6 in the order the engine evaluates, so the
// credit team can see which layer stopped an application and which cap bound a
// limit. Every field below is read by a setting or a condition somewhere in the
// waterfall; nothing is collected that no layer consumes. Fields are grouped by
// the layer that first reads them, and shown inside that layer's card.
// ---------------------------------------------------------------------------

const APPLICANT_FIELDS = {
  layer_0: [
    { key: 'featureCompleteness', label: 'Feature completeness', type: 'percent' },
    { key: 'modelConfidence', label: 'Model confidence', type: 'percent' },
    { key: 'scoreAgeDays', label: 'Age of the cached score', type: 'days' },
    { key: 'activeDays90', label: 'Active days in the last 90', type: 'count', unit: 'days' },
    { key: 'txnMonths', label: 'Months of transaction history', type: 'count', unit: 'months' },
    { key: 'closedLoans', label: 'Previous loans closed', type: 'count', unit: 'loans' },
    { key: 'inflow', label: 'Average monthly inflow', type: 'currency' },
    { key: 'consistency', label: 'Cashflow consistency', type: 'ratio', unit: 'index' },
    { key: 'volatility', label: 'Balance volatility', type: 'ratio', unit: 'coefficient' },
  ],
  layer_1: [
    { key: 'age', label: 'Customer age', type: 'count', unit: 'years' },
    { key: 'kyc', label: 'KYC status', type: 'select', param: 'kyc' },
    { key: 'account', label: 'Account status', type: 'select', param: 'account' },
    { key: 'blocklist', label: 'Fraud blocklist', type: 'select', param: 'blocklist' },
    { key: 'walletAgeDays', label: 'Wallet account age', type: 'days' },
    { key: 'daysSinceLastTxn', label: 'Days since the last transaction', type: 'days' },
    { key: 'activeLoans', label: 'Loans open right now', type: 'count', unit: 'loans' },
    { key: 'currentDpd', label: 'Days past due on any open loan', type: 'days' },
    { key: 'monthsSincePriorDefault', label: 'Months since a prior default', type: 'count', unit: 'months', blankLabel: 'never defaulted' },
    { key: 'productExposure', label: 'Open balance on this product', type: 'currency' },
    { key: 'isStaff', label: 'Staff or related party', type: 'toggle' },
  ],
  layer_2: [
    { key: 'simAgeDays', label: 'SIM age', type: 'days' },
    { key: 'daysSinceSimSwap', label: 'Days since a SIM swap', type: 'days', blankLabel: 'no swap on record' },
    { key: 'deviceChanges6m', label: 'Device changes in 6 months', type: 'count', unit: 'changes' },
    { key: 'applications30d', label: 'Applications in 30 days', type: 'count', unit: 'applications' },
    { key: 'daysSinceProfileChange', label: 'Days since a KYC or contact change', type: 'days', blankLabel: 'no recent change' },
    { key: 'inflowSpike', label: 'Inflow spike before applying', type: 'ratio', unit: 'x the 90-day average' },
    { key: 'walletsOnDevice', label: 'Wallets sharing this device', type: 'count', unit: 'wallets' },
    { key: 'dormantThenActive', label: 'Dormant, then suddenly active', type: 'toggle' },
  ],
  layer_3: [
    { key: 'score', label: 'Model score', type: 'count', unit: 'points' },
    { key: 'onTimeInstalments', label: 'On-time instalments paid', type: 'count', unit: 'instalments' },
    { key: 'arrearsDays90', label: 'Days in arrears in the last 90', type: 'days' },
  ],
  layer_4: [
    { key: 'income', label: 'Inferred monthly income', type: 'currency' },
    { key: 'expenses', label: 'Estimated monthly expenses', type: 'currency' },
    { key: 'otherInstalments', label: 'Instalments on other loans', type: 'currency' },
    { key: 'incomeConfidence', label: 'Confidence in the income estimate', type: 'percent' },
    { key: 'incomeCoV', label: 'Income variability', type: 'ratio', unit: 'coefficient of variation' },
  ],
  layer_5: [
    { key: 'totalExposure', label: 'Total balance across all products', type: 'currency' },
  ],
  layer_6: [
    { key: 'approvalsToday', label: 'Approvals so far today', type: 'count', unit: 'approvals' },
    { key: 'disbursedToday', label: 'Value disbursed so far today', type: 'currency' },
    { key: 'thinShareToday', label: 'Thin-file share of today’s approvals', type: 'percent' },
  ],
};

const APPLICANT_FIELD_LIST = Object.entries(APPLICANT_FIELDS)
  .flatMap(([layer, list]) => list.map(f => ({ ...f, layer })));
const APPLICANT_FIELD = Object.fromEntries(APPLICANT_FIELD_LIST.map(f => [f.key, f]));

// A steady repeat customer. Presets below change only the handful of fields
// that make their point, so what each one is testing stays visible.
const APPLICANT_BASE = {
  featureCompleteness: '92', modelConfidence: '88', scoreAgeDays: '1',
  activeDays90: '46', txnMonths: '26', closedLoans: '2',
  inflow: '290', consistency: '0.72', volatility: '0.42',
  age: '34', kyc: 'Fully verified (Tier 2)', account: 'Active', blocklist: 'No match',
  walletAgeDays: '790', daysSinceLastTxn: '1', activeLoans: '0', currentDpd: '0',
  monthsSincePriorDefault: '', productExposure: '0', isStaff: false,
  simAgeDays: '640', daysSinceSimSwap: '', deviceChanges6m: '0', applications30d: '1',
  daysSinceProfileChange: '', inflowSpike: '1.1', walletsOnDevice: '1', dormantThenActive: false,
  score: '78', onTimeInstalments: '6', arrearsDays90: '0',
  income: '260', expenses: '90', otherInstalments: '0', incomeConfidence: '88', incomeCoV: '0.28',
  totalExposure: '0',
  approvalsToday: '410', disbursedToday: '12500', thinShareToday: '22',
};

// Each preset changes only the handful of fields that make its point, and each
// is chosen to leave the waterfall somewhere different, so the trace can be
// read against a known expectation.
const APPLICANT_PRESETS = [
  { name: 'Established', hint: 'Long history, good score, comfortable income. The band decides the offer and nothing later cuts it.',
    values: {} },
  { name: 'Thin file', hint: 'Real but short history. L0 routes away from the model and the starter limit sets the offer.',
    values: { featureCompleteness: '48', modelConfidence: '52', activeDays90: '9', txnMonths: '2',
              closedLoans: '0', inflow: '95', consistency: '0.42', walletAgeDays: '120',
              score: '44', onTimeInstalments: '0', income: '110', expenses: '40', incomeConfidence: '74' } },
  { name: 'Brand new', hint: 'Wallet opened five weeks ago, no history at all. The cold-start branch runs, so there is still an offer.',
    values: { featureCompleteness: '4', modelConfidence: '11', activeDays90: '0', txnMonths: '0',
              closedLoans: '0', inflow: '0', consistency: '', volatility: '', walletAgeDays: '35',
              simAgeDays: '35', score: '', income: '', expenses: '', incomeConfidence: '' } },
  { name: 'Not verified', hint: 'Everything else is fine, but KYC is only SIM-registered. Whether L1 stops it depends on what this product accepts.',
    values: { kyc: 'SIM-registered (Tier 1)' } },
  { name: 'Shared device', hint: 'One handset, four wallets. Where the product finances a device, L2 refers rather than declines, because fraud rules catch genuine customers too.',
    values: { walletsOnDevice: '4' } },
  { name: 'Low score', hint: 'Eligible and honest, but the score sits below every band floor. L3 decides.',
    values: { score: '18', consistency: '0.31', onTimeInstalments: '1', arrearsDays90: '22', income: '120', expenses: '60' } },
  { name: 'Stretched', hint: 'Good score, little room in the budget. L4 cuts the limit well below what the band allows.',
    values: { income: '150', expenses: '55', otherInstalments: '20', incomeConfidence: '78', incomeCoV: '0.45' } },
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
  { key: 'assess', label: 'Assess a customer', hint: 'Run one applicant down the waterfall and see which layer decided' },
  { key: 'simulate', label: 'What-if simulation', hint: 'Check the impact before it goes live' },
  { key: 'publish', label: 'Publish', hint: 'Send to a checker for approval', action: true },
];
// Steps that must be complete before a profile may be sent for approval.
const PUBLISH_PREREQS = ['waterfall'];

// Profile-scoped screens: shown as tabs inside the profile workspace, not in the sidebar.
// Order matches SETUP_STEPS: the tabs are the set-up sequence.
const PROFILE_TABS = [
  ['waterfall', 'Decision waterfall'],
  ['assess', 'Assess a customer'],
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

// Bands come straight from the engine's layer_3 band_table: A to E on the
// 0 to 100 score scale, with the decision, tenure and deposit each one carries.
// The multiplier is null in the band table because the limit matrix supplies
// it, on the band and the affordability share together.
// pop and badRate are observed figures for the console's own charts; the engine
// does not hold them.
const DF_POP = { A: 9, B: 26, C: 31, D: 23, E: 11 };
const DF_BAD = { A: 1.9, B: 4.2, C: 8.7, D: 14.5, E: 24.8 };
const AA_POP = { A: 6, B: 16, C: 34, D: 30, E: 14 };
const AA_BAD = { A: 2.1, B: 3.9, C: 6.8, D: 12.1, E: 28.4 };

const TITLE = { approve: 'Approve', refer: 'Refer', decline: 'Decline' };

// Referrals can be switched off engine-wide. When they are, a band that would
// have referred takes the fallback action its layer declares, so the table
// shows what the customer actually gets rather than a queue nobody works.
function effectiveDecision(decision, layerKey) {
  if (decision !== 'refer') return { decision, viaFallback: false };
  if (REFERRAL_POLICY.referralsEnabled) return { decision, viaFallback: false };
  const fb = (REFERRAL_POLICY.fallbacks || {})[layerKey] || {};
  return { decision: fb.action || 'decline', viaFallback: true };
}

// The band table leaves multiplier null because the limit matrix supplies it on
// two axes. For the indicative figure the band row shows, take the matrix cell
// for the most generous affordability column; the real offer is computed from
// the customer's own affordability share at L3, and L4 caps it afterwards.
function headlineMultiplier(band) {
  const i = LIMIT_MATRIX.rows.indexOf(band);
  if (i === -1) return null;
  const cell = (LIMIT_MATRIX.cells[i] || [])[0];
  return typeof cell === 'number' ? cell : null;
}

// label/floor/maxTenure/deposit are display aliases over the engine's own
// field names, so the console renders one vocabulary while the data stays the
// engine's. Ordered lowest band first, which is how the ruler reads.
function bandsFrom(pop, bad) {
  return BAND_ROWS.slice().reverse().map(b => {
    const eff = effectiveDecision(b.decision, 'layer_3');
    return {
    ...b,
    label: b.band,
    floor: b.rangeMin ?? 0,
    authoredDecision: TITLE[b.decision] || b.decision,
    viaFallback: eff.viaFallback,
    decision: TITLE[eff.decision] || eff.decision,
    multiplier: b.multiplier ?? headlineMultiplier(b.band),
    maxTenure: b.maxTenureMonths,
    deposit: b.depositPct,
    pop: pop ? (pop[b.band] ?? 0) : 0,
    badRate: bad ? (bad[b.band] ?? null) : null,
  };
  });
}
const DF_BANDS = bandsFrom(DF_POP, DF_BAD);
const AA_BANDS = bandsFrom(AA_POP, AA_BAD);
const EMPTY_BANDS = bandsFrom(null, null);

// Device Financing starts from exactly what the engine holds. The other two
// products have no profile on the engine, so they start from the same shape
// with their own figures. L0 to L4 and L6 are product-agnostic by design, so
// only L5 differs between them.
const PROFILE_L5 = {
  df: PROFILE_VALUES,
  aa: { ...PROFILE_VALUES, productMaximum: 15, minimumViableLimit: 1,
        limitRoundingIncrement: 1, permittedTenures: [1],
        starterLimitThinFile: 2, starterLimitNoFile: 1, ladderMaxTenureMonths: 1,
        ladderDepositPct: 0, maxLadderLimit: 15 },
  // Nothing set yet: every field is a decision the credit team has still to make.
  blank: Object.fromEntries(Object.keys(PROFILE_VALUES).map(k =>
    [k, Array.isArray(PROFILE_VALUES[k]) ? [] : null])),
};

function seedLayers(product) {
  const out = structuredClone(LAYER_DEFAULTS);
  out.layer_5 = {};
  for (const [k, v] of Object.entries(PROFILE_L5[product])) {
    out.layer_5[k] = { value: { value: v }, enabled: true, action: null };
  }
  return out;
}
const LAYER_SEEDS = { df: seedLayers('df'), aa: seedLayers('aa'), blank: seedLayers('blank') };

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
  // % of scored population per bucket across the 0 to 100 score range
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
const DEFAULT_OPEN = { layer_0: true, layer_1: false, layer_2: false, layer_3: false,
                       layer_3a: false, layer_4: false, layer_5: false, layer_6: false };

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
    bands: DF_BANDS, versions: DF_VERSIONS, limits: LIMITS_DF, coldStart: COLDSTART_DF, layers: LAYER_SEEDS.df,
    touched: { simulate: true },
  },
  {
    name: 'Airtime Advance', blurb: 'Instant airtime top-up credit, repaid on next recharge', market: 'Zimbabwe',
    version: 'v2.1', status: 'Published', editedAt: '28 Jul 2026, 09:15', editedBy: 'R. Chikanda', third: 'View',
    bands: AA_BANDS, versions: AA_VERSIONS, limits: LIMITS_AA, coldStart: COLDSTART_AA, layers: LAYER_SEEDS.aa,
    touched: { simulate: true },
  },
  {
    name: 'Life Cover', blurb: 'Premium affordability profile, not yet configured', market: 'Zimbabwe',
    version: 'n/a', status: 'Not started', editedAt: 'n/a', editedBy: 'n/a', third: 'Copy rules',
    bands: EMPTY_BANDS, versions: [], limits: LIMITS_EMPTY, coldStart: COLDSTART_BLANK, layers: LAYER_SEEDS.blank,
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
