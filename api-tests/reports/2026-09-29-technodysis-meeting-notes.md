# Technodysis — Rule Engine review: talking points

Prepared 29 Sep 2026. Based on the three documents supplied (Developer Guide, Starter Values, Rules & Units spreadsheet) and on live testing against the staging engine: **~27,000 assessments across 26,000 real Ecocash customers**, plus a 10-scenario controlled A/B test of rule changes.

---

## 1. Documentation and process

- **None of the three documents carries a version number, a date, or a changelog.** I checked all three — zero occurrences. We cannot tell which revision we are looking at, what changed since the last one, or whether the config I tested matches the document I was given.
- **Ask for semantic versioning and a change log on every document**, with the date and author on page 1, and a "changed since last version" section. This is the single cheapest fix and it blocks everything else.
- **The documents do not agree with each other or with the deployed system** (section 2). Without versioning we cannot even establish which one is meant to be authoritative.
- **Formatting makes the guide hard to use.** Text reflows mid-sentence, tables break across pages without repeating headers, and JSON examples are malformed — the response sample in section 4.1 opens with `{}` followed by field lines, which will not parse if anyone copies it.
- **The Starter Values document has no owner or approval line.** It references values "already agreed with Manan" but nothing records who signed off what, or when.
- **Request a single source of truth.** Right now the band table exists in the Starter Values PDF, the spreadsheet, and the deployed config, with three different sets of numbers. One of these should be authoritative and machine-readable.

---

## 2. Deployed configuration does not match their own Starter Values

This is the most important slide. These are their numbers, against what is actually running on `legacy` today.

| Parameter | Starter Values doc | Deployed now | Impact |
|---|---|---|---|
| Band A range | 75–100 | 85–100 | narrower top band |
| Band B range | 60–74 | 70–85 | |
| **Band C** | **45–59, Approve** | **50–70, Refer** | **the single largest cause of non-approval** |
| Band D | 35–44, Refer | 30–50, Refer | |
| Band E | 0–34, Decline | 0–30, Decline | |
| Minimum monthly income | USD 100 | 26.59117934431525 | unrounded, unexplained |
| Income stability CV | 0.5 or lower | 0.5850226034445457 | unrounded, changed again on 29 Sep |
| Prior default lookback | 6 months | 1 month | far looser than spec |
| Currently delinquent | more than 0 DPD | 2 DPD | looser than spec |
| Concurrent loan cap | 1 active loan | 6 | six times the spec |
| Application velocity | more than 2 in 30 days | more than 3 in 30 days | |

- **Band C is specified as Approve and deployed as Refer.** Their own document puts band C at "Approve, 4 months, 20% deposit". In production it routes to manual review. In my testing this one difference accounts for roughly 40 approvals in every 300 customers.
- **Three thresholds are unrounded 16-decimal floats** (26.59117934431525, 0.5850226034445457, and previously 0.8396603523651834). These look like fitted or converted values written straight through. Ask where they came from and who approved them — they are not in any document.
- **The risk rules are all looser than specified, while the affordability rules are all tighter.** Concurrent loans 6 vs 1, delinquency 2 DPD vs 0, default lookback 1 month vs 6. Meanwhile minimum income is the binding decline reason. The engine is permissive about risk and restrictive about capacity — the opposite of the intent in their own document.

---

## 3. The balance proxy — their document explicitly says not to do what is deployed

Quoting the Starter Values document verbatim:

> "The balance proxy coefficient is the one value here that should not be guessed... until that runs, **set it so the proxy path returns no figure and the customer declines on minimum income. Better to fail visibly than to lend against a made-up multiplier.**"

- **Deployed: `balance_proxy_coefficient = 0.5`, `balance_proxy_intercept = 25`, both enabled.** The regression they describe has not been run; the multiplier is the guess they warned against.
- **Of 984 customers I sampled in detail, `DERIVED` income was produced for exactly zero.** Every single assessment falls back to the proxy. So 100% of lending decisions are being made on the made-up multiplier.
- **The spreadsheet lists the "Valid Range" for these two as "0.5" and "25.0"** — the guessed values have been promoted into the specification as if they were the approved range.
- **The effect is that income is `25 + half the wallet balance`.** Measured median across real customers: 29.72. Minimum observed: exactly 25.00, which is the intercept. Half the customer base sits within 5 dollars of a constant.
- **Ask directly: when does the income regression run, and what is the plan until it does?** Their own document's answer is "fail visibly". That is a decision Ecocash should make knowingly, not inherit.

---

## 4. Specification versus implementation — gaps they have flagged themselves

The spreadsheet contains their own admissions. Worth reading these back to them.

- **`currently_delinquent`** — spreadsheet says it "reads `dpd_7_count` and turns it into a 0/1 flag: 1 if any previous loan ever went more than 7 DPD. **It isn't current DPD.**" The rule is named "currently delinquent", its documented unit is "days past due", and it is configured with a threshold of 2. A threshold of 2 against a 0/1 flag can never fire. **This rule is dead.**
- **`prior_default_lookback`** — documented as "days since last default, converted to months", unit Months. In the live traces the observed values are 9, 25, 26, 28 and 63, and the condition is `{"months": 1}`. Customers are failing at 26 and passing at 63, so the comparison is days against a months threshold. The conversion is not happening. It is currently declining ~16% of otherwise eligible customers.
- **`dormant_then_suddenly_active`** — document says "inactive 30 days, then 5+ active days in 7". Spreadsheet says the implementation is "2 or fewer active days in days 31–90 and 5 or more in the last 30". Different rule.
- **`kyc_status`** — spreadsheet enum is GOLDSUBS / BANKSUBS / CARDSUBMAS. Deployed value is `"fully_verified"`. Actual production data contains GOLDSUBS (3.9M), SELFREGSUB (1.9M), BANKSUBS (1.5M), CARDSUBMAS (484k), FARMERS, SASUBS and others. **Three different vocabularies, none matching.** If this rule were enabled it would decline 100% of customers. It is currently disabled, which is the only reason it has not been noticed.
- **`feature_completeness`** — their own note: "inferred, not confirmed in code... **Inferred - verify**". This is a layer 0 gate deciding whether a customer is scoreable at all, and the vendor does not know what it reads.
- **`minimum_monthly_income`** — their own note: "exact formula owned by rule engine, **likely** built from `inflow_total_30d` or similar... **confirm derivation**". This is the largest single decline reason in the engine and they cannot state its formula.
- **Five layer 1 knockouts are placeholders**: deceased indicator, blacklist/debarment, fraud/AML flag, staff and related parties, device change frequency — all "Need more data", all disabled. **We have no fraud, AML, deceased or blacklist screening in production today.**
- **`tier_caps_by_band`** — "Not yet defined, depends on device catalogue". **`automatic_tightening_trigger`** — "baseline not yet established".

---

## 5. Defects found in live testing

- **The layer 6 portfolio caps deadlock at low volume.** `max_thin_file_share_of_approvals` is 40% computed as a share of approvals. With one approval on the book and that approval thin-file, the share is 100% of 1, and every subsequent thin-file approval is blocked permanently. Diluting it requires non-thin-file approvals, which affordability is already preventing. **The book cannot bootstrap out of its own cap.** It needs a minimum-volume floor before the ratio is enforced.
- **The engine fails under modest concurrency.** At 14 concurrent assessments, 4.1% of requests returned HTTP 500. The service log gives the cause: `Transaction API error: Unable to start a transaction in the given time` — database transaction-pool exhaustion. Sustained throughput was **2.9 assessments per second**. At that rate a single pass over the ~194,000 scoreable customers takes about 19 hours.
- **`legacy` currently has six ACTIVE product profiles simultaneously.** The guide states that creating a profile marks the previous one SUPERSEDED, and a clean test confirms that works. The six on `legacy` were created by the 22 Sep migration, which appears to have bypassed the supersede logic. Assessments silently bind to whichever the engine picks. **Data integrity issue on the migration, not the API.**
- **There is no way to delete or retire a product profile.** No DELETE route, no status transition on PATCH. Once created, a profile is permanent. Combined with the point above, `legacy` cannot be cleaned up through the API.
- **The API accepts unknown fields silently.** Sending profile values at the top level instead of nested under `values` returns 201 with the defaults applied and no warning. Strict validation with a 400 would have surfaced this immediately.
- **1.6% of known borrowers and 97.8% of the general customer base return HTTP 404**, `No loan_features rows found for customer_key ...` — a hard error rather than a `NO_FILE` decision. The engine has a NO_FILE routing path; absence from the feature store should use it, not fail the request.
- **Feature-store coverage is the real constraint.** Of 20,000 random Individual customers, only 440 (2.2%) could be assessed at all. Of 5,000 known borrowers, 94.7% could. The feature store is effectively "people who have already borrowed" — roughly 194,000 of 8.8M customers.

---

## 6. Why everyone is stuck at USD 20 — the core defect

This is the one to spend time on.

- **`affordabilityLimit` is a monthly figure, and layer 5 compares it against a loan principal.** There is no multiplication by tenure anywhere in the chain. A customer who can service 25 per month is capped at a 25 principal, not 25 × 3 months.
- The formula I reconstructed from live traces and verified exactly:
  `affordabilityLimit = min(0.25 × monthlyIncome, monthlyIncome − 50 − existing obligations)`
  That is a monthly surplus. It is then tested against `minimumViableLimit` (30) and used as the limit cap.
- **Consequence: a customer needs USD 120 per month of income to be approved for the smallest loan the product offers (30).** Measured median income is 29.72.
- **Across 1,792 approvals, 73.8% were for exactly 20 and 92.4% were for 30 or less.** The largest limit written in the entire test was 170, against a product maximum of 500.
- **The engine writes 18.4% of the credit its own banding layer proposes.** Sum of indicative limits across approvals: 16,670. Sum of approved limits: 3,070.
- Clearest single example — best-scoring customer in the sample:

```json
{ "band": "A", "score": 91.69, "approvedLimit": 20, "tenure": 6, "deposit": 0,
  "affordabilityLimit": 25.05,
  "capsApplied": [{ "source": "layer_3_or_3a.indicative_limit", "value": 350 }] }
```

Score 91.7, band A, zero deposit, banding proposed **350**, approved for **20**.

- **Every band A customer in my tests topped out at 20.** The largest loan in the book went to a band B customer who happened to have a higher wallet balance. **Loan size is currently ranked by wallet balance, not by credit score.**
- **Ask them to confirm the intended formula.** Whether affordability should cap the instalment (compared against `approvedLimit / tenure`) or the principal (`monthly surplus × tenure`). Either is defensible; what is deployed is neither.

---

## 7. What to change, with measured effect

I ran a controlled A/B test: fresh tenant per scenario, seeded from defaults, aligned rule-for-rule to `legacy`, one change at a time, same 300 customers each run. Baseline verified at 300/300 identical decisions to production.

**Single changes do almost nothing** — the gates are in series. Halving the disposable-income floor on its own: zero extra approvals. Reverting the stability threshold on its own: zero. Only combinations move the number.

### Recommended configuration ("C5") — 36.4% approval, no risk rule touched

| Rule | Layer | From | To | Rationale |
|---|---|---|---|---|
| `net_disposable_income_floor` | 4 | 50 | **0** | a flat USD 50 floor against a population whose measured median income is 29.72 zeroes out nearly every affordability limit |
| `instalment_to_income_cap` | 4 | 25% | **75%** | interim stand-in for the missing tenure multiplication |
| `income_stability_requirement` | 4 | 0.5850 | **0.8397** | reverts an unexplained tightening applied on 29 Sep |
| `band_table`, band C | 3 | Refer | **Approve** | restores their own Starter Values specification |
| `minimumViableLimit` | profile | 30 | **10** | |

Measured: **2 approvals → 108 of 297 (36.4%)**. Settled borrowers approved at 48.0% versus overdue at 28.9% — the engine does discriminate on repayment behaviour once the gates open. `prior_default_lookback`, `concurrent_loan_cap`, all layer 1 and all layer 2 screens left exactly as production has them.

**Important:** the ITI change to 75% is a workaround, not a fix. If they correct the tenure arithmetic, restore it to 25% and the limits will rise on their own rather than the approval count.

### Ordered asks

1. **Fix the monthly-versus-principal comparison in layers 4/5.** Largest single item; roughly half the available gain and the only one that raises loan sizes rather than counts.
2. **Add a minimum-volume floor to the layer 6 share caps.** Currently they deadlock the book at low volume.
3. **Run the income regression, or disable the balance proxy as their own document instructs.** Zero of 984 customers produced derived income.
4. **Reconcile deployed config with the Starter Values document**, and explain the three unrounded float thresholds.
5. **Fix `prior_default_lookback` units** (days compared against months) and **`currently_delinquent`** (dead rule — threshold 2 against a 0/1 flag).
6. **Populate the layer 3a scorecard or stop routing to it.** All eight point tables are enabled=false with empty rows; 40% of customers route to a scorecard that returns nothing, so they can never be banded.
7. **Return `NO_FILE` instead of HTTP 404** for customers absent from the feature store.
8. **Connection-pool and transaction work** before any volume discussion.

---

## 8. Questions to put to them

- Which document is authoritative when the Starter Values PDF, the spreadsheet and the deployed config disagree?
- Who changed `minimum_monthly_income` to 26.59117934431525, and on what basis? Same question for the two stability thresholds.
- Was band C deployed as Refer deliberately, or is it a transcription error from their own spec?
- What is the actual derivation of `minimum_monthly_income`? Their spreadsheet says "likely... confirm".
- When does the balance-proxy regression run, and what is the interim position until it does?
- What is the intended affordability semantics — instalment cap or principal cap?
- When do the five placeholder layer 1 rules (fraud, AML, deceased, blacklist, staff) get real data? We are lending with no fraud screening.
- What is the plan for feature-store coverage, given 97.8% of the customer base cannot currently be assessed?

---

## Appendix — evidence

| Finding | Source |
|---|---|
| 1,000-customer decision sweep | `2026-09-29-msisdn-decision-report-1000.md` |
| 30-customer detailed trace analysis | `2026-09-29-msisdn-decision-report.md` |
| 10-scenario controlled A/B test | `2026-09-29-rule-change-ab-test.md` |
| Approval-rate tuning, C5 and C6 | `2026-09-29-approval-rate-tuning.md` |
| 21,000-customer universe run | `2026-09-29-C5-universe-run.md` |
| All 108 C5 approvals with limits | `2026-09-29-C5-approved-limits.md` |

All testing was done on throwaway tenants. `legacy` rules were not modified at any point.
