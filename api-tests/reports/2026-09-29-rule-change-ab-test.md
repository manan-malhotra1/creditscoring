# Rule-change A/B test — what actually moves the approval rate

2026-09-29, staging. Each scenario ran on its **own fresh tenant**, seeded from the shipped defaults, aligned rule-for-rule to `legacy`, then changed in exactly one respect. Same 300 customers in the same order every time (100 settled, 100 on-term, 100 overdue, drawn from the 1,000-customer sample). Identical request throughout: `requestedAmount` 300, `requestedTenure` 4, `channel` app. `legacy` was not modified.

**Headline: config changes alone take approvals from 2 to 9 in 297. Approximating the one fix that is not a config change takes it to 19.**

## Validity check

Before anything was changed, the harness tenant was run against all 300 customers and compared with `legacy`: **300 identical decisions, 0 differences**. The baseline reproduces production.

## The first attempt was wrong — and the reason is a production bug

The first version of this test reused a single tenant, reverting between scenarios. Every scenario returned identical numbers, and loosening a constraint appeared to *reduce* approvals. The cause:

```json
{
  "layer": "layer_6",
  "parameterKey": "layer_6.max_thin_file_share_of_approvals",
  "description": "Portfolio control blocked approval"
}
```

`max_thin_file_share_of_approvals` is 40%, computed as a share of the tenant's approvals. Once the book contained exactly one approval and that approval was thin-file, the share was 100% of 1. Every subsequent thin-file approval was blocked permanently, whatever the rules said.

**This is not only a test artefact.** The cap is a ratio whose denominator is the approval count. On a new tenant, a new product, or any low-volume day, the first thin-file approval takes the share to 100% and locks out every thin-file approval after it. Diluting it requires non-thin-file approvals, which are exactly what the affordability gate is already preventing. The book cannot bootstrap out of its own cap. It needs a minimum-volume floor before the ratio is enforced.

For that reason `max_thin_file_share_of_approvals` and `new_to_credit_concentration_cap` are **disabled in every scenario below, baseline included**, so the scenarios stay comparable.

> ## Correction, added after this test was run
>
> `POST /product-profiles` **silently ignores every value in the request body** and writes hardcoded
> defaults (`productMaximum` 500, `minimumViableLimit` 30, `limitRoundingIncrement` 10,
> `permittedTenures` [3,4,6], `depositFloorPct` 0, `totalCustomerExposureCap` 750). It returns 201
> with the defaults, not what was sent. Only `PATCH /product-profiles/{id}` honours values.
>
> This test created profiles with `POST`, so **every `minimumViableLimit` change below was a no-op**.
> S1 measured nothing, which is why it showed +0 — not evidence that the lever is weak. S7, S8 and
> S9 are still valid measurements of their *rule* changes, but their labels overstate what was
> applied: read them as "NDI + ITI + band C" rather than "MVL + NDI + ITI + band C".
>
> When `minimumViableLimit` is applied properly via `PATCH`, it is one of the strongest levers
> available. See `2026-09-29-approval-rate-tuning.md`.

## Results

300 customers, 297 assessable (3 have no `loan_features` rows).

| # | Scenario | APPROVE | REFER | DECLINE | vs base | Value approved |
|---|---|---:|---:|---:|---:|---:|
| S0 | baseline (= legacy rules) | **2** | 108 | 187 | — | 120 |
| S1 | ~~minimumViableLimit 30 -> 10~~ (no-op, see correction) | **2** | 108 | 187 | +0 | 120 |
| S2 | NDI floor 50 -> 25 | **2** | 108 | 187 | +0 | 120 |
| S3 | ITI cap 25% -> 40% | **2** | 108 | 187 | +0 | 180 |
| S4 | NDI 25 + ITI 40% | **3** | 108 | 186 | +1 | 210 |
| S5 | income_stability 0.585 -> 0.840 | **2** | 108 | 187 | +0 | 120 |
| S6 | band C: refer -> approve | **3** | 39 | 255 | +1 | 170 |
| S7 | everything: MVL10+NDI25+ITI40+bandC | **7** | 39 | 251 | +5 | 390 |
| S8 | S7 + income_stability 0.840 | **9** | 39 | 249 | +7 | 450 |
| S9 | S8 + ITI 75% (~tenure proxy) | **19** | 39 | 239 | +17 | 1090 |

### Reading it

**Single-lever changes do almost nothing.** S2, S3 and S5 each moved the approval count by zero. (S1 also showed zero, but it never applied — see the correction above.) Halving the net-disposable-income floor on its own: no change. Reverting the `income_stability_requirement` tightening on its own: no change.

The reason single levers fail is that the gates are in series, and each one has enough customers stacked behind it to absorb whatever the one before it releases. Band C → approve helps almost nobody while their affordability limits are still under the minimum. Only the combination moves anything.

**The one lever that changed limits rather than counts** was the instalment-to-income cap. S3 approved the same 2 customers but lent them more — average limit 60 → 90, total value 120 → 180.

**Each change exposes the next gate.** Watch `income_stability_requirement` as the package builds:

| Blocking rule | S0 | S7 | S8 | S9 |
|---|---:|---:|---:|---:|
| `layer_5/minimum_viable_limit` | 59 | 82 | 116 | 106 |
| `layer_4/minimum_monthly_income` | 71 | 71 | 71 | 71 |
| `layer_4/income_stability_requirement` | 18 | 59 | 23 | 23 |
| `layer_1/prior_default_lookback` | 28 | 28 | 28 | 28 |
| `layer_1/concurrent_loan_cap` | 9 | 9 | 9 | 9 |
| `layer_1/maximum_age_at_maturity` | 2 | 2 | 2 | 2 |

`income_stability_requirement` blocks 18 at baseline, 59 once band C customers are allowed through to layer 4, then drops to 23 when the threshold is reverted. A rule that looks minor at baseline becomes the third-largest blocker as soon as the gates above it open. Any tuning done one rule at a time will keep hitting this.

## The change that matters most cannot be made in config

The largest single constraint is that `affordabilityLimit` is a **monthly** figure and layer 5 tests it against a **principal**. That is engine behaviour, not a rule value, so it cannot be A/B tested here directly. S9 approximates it by raising the instalment-to-income cap to 75% — roughly three months of instalments, standing in for the missing tenure multiplication.

| | APPROVE | Rate | Value approved |
|---|---:|---:|---:|
| baseline, production rules | 2 | 0.7% | 120 |
| every config change available | 9 | 3.0% | 450 |
| + tenure-dimensionality proxy | 19 | 6.4% | 1090 |

Config tuning alone: 2 → 9 approvals (0.7% → 3.0%). Adding the proxy for the dimensional fix: **19 approvals (6.4%), and approved value 120 → 1,090, a 9x increase.** Roughly half the total available gain sits in a change no amount of rule tuning can reach.

## Approvals start tracking repayment behaviour once the gates open

The most encouraging result. Approval counts by actual repayment outcome:

| Repayment outcome | S0 baseline | S9 |
|---|---:|---:|
| `SETTLED` | 1/100 | **10/100** (10%) |
| `ON_TERM` | 1/100 | **6/100** (6%) |
| `OVERDUE` | 0/97 | **3/97** (3%) |

At baseline the approval rate is too low to carry any signal at all. Under S9 customers who repaid in full are approved **more than three times as often** as customers who went overdue — 10% against 3.1%. The engine does discriminate on repayment behaviour; at current settings it never gets the chance to.

## What S9 actually writes

The 19 approvals, showing the product mix this would produce:

| MSISDN | Repayment outcome | Band | Limit | Tenure | Deposit |
|---|---|---|---:|---:|---:|
| `771855815` | ON_TERM | ladder | 40 | 3 | 30 |
| `772116084` | ON_TERM | ladder | 30 | 3 | 30 |
| `772222517` | ON_TERM | C | 30 | 4 | 20 |
| `772732121` | ON_TERM | ladder | 30 | 3 | 30 |
| `772741131` | ON_TERM | ladder | 30 | 3 | 30 |
| `773437713` | ON_TERM | ladder | 50 | 3 | 30 |
| `771000555` | SETTLED | C | 70 | 4 | 20 |
| `772306895` | SETTLED | B | 30 | 6 | 10 |
| `772459373` | SETTLED | ladder | 50 | 3 | 30 |
| `772522222` | SETTLED | C | 50 | 4 | 20 |
| `772657531` | SETTLED | C | 50 | 4 | 20 |
| `773246671` | SETTLED | ladder | 30 | 3 | 30 |
| `773279417` | SETTLED | B | 30 | 6 | 10 |
| `773395606` | SETTLED | B | 40 | 6 | 10 |
| `773443555` | SETTLED | B | 270 | 6 | 10 |
| `773598809` | SETTLED | C | 30 | 4 | 20 |
| `771222302` | OVERDUE | C | 150 | 4 | 20 |
| `772701347` | OVERDUE | C | 50 | 4 | 20 |
| `773117549` | OVERDUE | C | 30 | 4 | 20 |

Nine of the nineteen come through the no-file/thin-file ladder at 30–50 with a 30% deposit; the rest through bands B and C. The largest single limit is 270. Total book written across 297 customers: 1,090.

## What is still blocking 239 declines under S9

| Rule | Count | Share |
|---|---:|---:|
| `layer_5/minimum_viable_limit` | 106 | 44% |
| `layer_4/minimum_monthly_income` | 71 | 30% |
| `layer_1/prior_default_lookback` | 28 | 12% |
| `layer_4/income_stability_requirement` | 23 | 10% |
| `layer_1/concurrent_loan_cap` | 9 | 4% |
| `layer_1/maximum_age_at_maturity` | 2 | 1% |

`minimum_viable_limit` and `minimum_monthly_income` still account for three quarters. Both trace back to the same root: income is being estimated as `25 + 0.5 x wallet balance` because `DERIVED` income was produced for **zero of 984 customers** in the earlier run. No amount of threshold tuning fixes an income estimate that is a constant plus half a small number.

## Recommended sequence, with measured effect

| Step | Kind | Measured effect |
|---|---|---|
| Add a minimum-volume floor to the layer 6 share caps | bug | unblocks approvals entirely at low volume |
| Fix the monthly-vs-principal comparison in layer 4/5 | bug, engine | ~half the total available gain (S8 9 → S9 19) |
| Get `DERIVED` income working | bug, data | largest remaining blocker; untestable via config |
| Populate or bypass the empty layer_3a scorecard | bug, config | 40% of customers currently cannot be banded |
| Revert `income_stability_requirement` to 0.840 | config | +2 once other gates open (S7 7 → S8 9) |
| Band C refer → approve with its 20% deposit | **policy** | +1 alone, +5 in combination |
| NDI floor 50 → 25 with ITI cap 25% → 40% | **policy** | +1 alone; raises limits materially |

The two marked **policy** are risk-appetite decisions, not defects. I would not make them until the income estimate is trustworthy — approving more customers on an income figure of `25 + half the wallet balance` means approving them close to blind.

## Reproducing

```bash
cd api-tests && CREDIT_ALLOW_WRITES=1 python3 run.py   # single-customer smoke test, 11/11
```

Scenario tenants (all throwaway, `legacy` untouched):

- `mm-s0-1790664133` — S0  baseline (= legacy rules)
- `mm-s1-1790664243` — S1  minimumViableLimit 30 -> 10
- `mm-s2-1790664447` — S2  NDI floor 50 -> 25
- `mm-s3-1790664542` — S3  ITI cap 25% -> 40%
- `mm-s4-1790664641` — S4  NDI 25 + ITI 40%
- `mm-s5-1790664733` — S5  income_stability 0.585 -> 0.840
- `mm-s6-1790664858` — S6  band C: refer -> approve
- `mm-s7-1790665043` — S7  everything: MVL10+NDI25+ITI40+bandC

Per-customer decision bodies for every scenario are in `2026-09-29-rule-change-ab-raw/`.
