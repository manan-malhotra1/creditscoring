# Ecocash Rule Engine — 1,000 borrowers with known repayment outcomes

Run 2026-09-29 against staging, tenant `legacy`, product `device_financing`. A follow-up to the 30-customer report, on a fresh sample with no overlap.

**984 of 1,000 assessed. One approval.**

## Method

Same single request shape for every customer, so the customer is the only variable:

```json
{
  "tenantId": "legacy",
  "productCode": "device_financing",
  "customerId": "<MSISDN>",
  "requestedAmount": 300,
  "requestedTenure": 4,
  "channel": "app"
}
```

Sampled evenly within each repayment group from the 230,304 unique mobile numbers in `Arttha_RepaymentsNOTTO_MTD_2026_Jul_23.csv.filepart`, excluding the 30 already tested. Six concurrent requests, 296s wall clock. Traces were not pulled this time — at 1,000 customers that is a second 1,000 calls, and the decision body already carries `bindingConstraint`, `capsApplied` and `affordabilityLimit`. Full response bodies for all 1,000 are in `2026-09-29-msisdn-results-1000.json`.

| Repayment outcome | Sampled | Assessed | 404 |
|---|---:|---:|---:|
| `SETTLED` | 334 | 332 | 2 |
| `ON_TERM` | 333 | 332 | 1 |
| `OVERDUE` | 333 | 320 | 13 |
| **total** | **1000** | **984** | **16** |

> Same timing caveat as before: repayment data ends 22 Jul 2026, decisions taken 29 Sep 2026. The groups are context, not ground truth.

## Headline

| Decision | Count | Share |
|---|---:|---:|
| `DECLINE` | 654 | 66.5% |
| `REFER` | 329 | 33.4% |
| `APPROVE` | 1 | 0.1% |

### Every customer who scored into an approve band was declined

121 customers reached band A or B, which `band_table` maps to `decision: approve` — **37 in band A, 84 in band B**. Not one was approved:

| What stopped them | Count |
|---|---:|
| `layer_5/minimum_viable_limit` | 69 |
| `layer_4/income_stability_requirement` | 42 |
| `layer_4/minimum_monthly_income` | 8 |
| `layer_6/layer_6.new_to_credit_concentration_cap` | 2 |

The model is not the problem. Across the 400 model-scored customers the score spreads 38.4 to 97.0, median 60.5. It discriminates across the full range. Everything it ranks highly is then rejected downstream.

### The one approval is the customer the engine knows least about

`772116084` — routed **`NO_FILE`**, no model band, predicted confidence score 37.62 (band D), approved for **30 at 3 months with a 30 deposit** through the no-file starter ladder (`starter_limit_no_file` 30, `ladder_max_tenure` 3, `ladder_deposit_requirement` 30).

```json
{
  "tenantId": "legacy",
  "requestId": "2f02cce5-a8c3-440e-97e4-b2afe8b0dfb2",
  "decisionId": "9ba0c26c-5e4b-49a0-b71c-776ec2d034d9",
  "customerId": "772116084",
  "decision": "APPROVE",
  "routing": "NO_FILE",
  "scoreSource": "SCORECARD",
  "score": null,
  "band": null,
  "approvedLimit": 30,
  "tenure": 3,
  "deposit": 30,
  "instalment": 10,
  "affordabilityLimit": 36.559375,
  "incomeBasis": "BALANCE_PROXY",
  "incomeConfidence": null,
  "predictedConfidenceScore": 37.62076651244604,
  "predictedConfidenceBand": "D",
  "modelVersion": "CatBoost_V01_08092026",
  "topFeaturesAffectingScore": "[{\"feature\": \"activity_score\", \"impact\": \"DECREASES\", \"shap_value\": -5.3949}, {\"feature\": \"transaction_consistency_score\", \"impact\": \"DECREASES\", \"shap_value\": -4.8514}, {\"feature\": \"spending_score\", \"impact\": \"DECREASES\", \"shap_value\": -2.7693}, {\"feature\": \"positive_cashflow_days_90d\", \"impact\": \"DECREASES\", \"shap_value\": -2.0463}, {\"feature\": \"transaction_activity_spending_score\", \"impact\": \"DECREASES\", \"shap_value\": -1.577}]",
  "bindingConstraint": null,
  "capsApplied": [
    {
      "source": "layer_3_or_3a.indicative_limit",
      "value": 30
    },
    {
      "source": "layer_4.affordability_limit",
      "value": 36.559375
    },
    {
      "source": "product_profile.product_maximum",
      "value": 500
    },
    {
      "source": "product_profile.exposure_cap_remaining",
      "value": 722.62
    }
  ],
  "reasonCodes": [],
  "cohort": {
    "cohortId": null,
    "overridesApplied": []
  },
  "versions": {
    "ruleVersionId": "9816e919-1b79-4bf8-9f55-efc09f8161a1",
    "ruleVersionRevision": 5,
    "productProfileId": "ecf6027a-a611-48ff-8bf8-3a60d8a0e96e",
    "productProfileRevision": 1,
    "modelVersion": "CatBoost_V01_08092026",
    "featureVintage": "loan_features-live",
    "cycleId": "cycle-2026-09"
  },
  "timestamp": "2026-09-29T05:57:11.275Z"
}
```

Its affordability limit came out at 36.56 — above the 30 minimum viable limit — which is the whole reason it cleared. That is the single customer in 984 for whom the balance proxy returned an income high enough to matter, and the engine knew nothing else about them.

## Why almost nothing is approved

An affordability limit was computed for 627 of 984 customers. **560 of them (89.3%) came out at exactly 0.** Of the 67 that were positive, only **6** reached the 30 minimum viable limit.

So across 984 real borrowers, **6 cleared the affordability gate**.

| Binding constraint | Count | Share of assessed |
|---|---:|---:|
| `layer_3/band_table` | 279 | 28.4% |
| `layer_4/minimum_monthly_income` | 233 | 23.7% |
| `layer_5/minimum_viable_limit` | 202 | 20.5% |
| `layer_1/prior_default_lookback` | 103 | 10.5% |
| `layer_4/income_stability_requirement` | 80 | 8.1% |
| `layer_1/concurrent_loan_cap` | 28 | 2.8% |
| `layer_2/dormant_then_suddenly_active` | 21 | 2.1% |
| `layer_2/pre_application_inflow_spike` | 15 | 1.5% |
| `layer_2/application_velocity` | 14 | 1.4% |
| `layer_1/maximum_age_at_maturity` | 4 | 0.4% |
| `layer_1/minimum_age` | 2 | 0.2% |
| `layer_6/layer_6.new_to_credit_concentration_cap` | 2 | 0.2% |
| `—` | 1 | 0.1% |

`layer_4/minimum_monthly_income` and `layer_5/minimum_viable_limit` together account for 435 of the outcomes — the affordability chain, not risk, is what is deciding this book.

### Derived income never once worked

`BALANCE_PROXY` for 627 customers, no income figure at all for 357. **`DERIVED` income was produced for zero customers out of 984.** `income_confidence_threshold` (gte 70) is never being met, so every single assessment falls back to the proxy — and the proxy is `25 + 0.5 x balance`, which on this population clusters just above 25 against a `minimum_monthly_income` of 26.59 and a `net_disposable_income_floor` of 50.

## Repayment outcome barely moves the decision

| Repayment outcome | n | APPROVE | REFER | DECLINE | Refer+approve rate |
|---|---:|---:|---:|---:|---:|
| `SETTLED` | 332 | 0 | 121 | 211 | 36.4% |
| `ON_TERM` | 332 | 1 | 116 | 215 | 35.2% |
| `OVERDUE` | 320 | 0 | 92 | 228 | 28.7% |

Customers who repaid in full clear at 36.4%; customers who went overdue clear at 28.8%. There is a gradient in the right direction, but it is small — and it is entirely inside the REFER bucket, because approvals are not happening for anyone. A 7.6 point spread between fully-repaid and overdue borrowers is not the separation a credit engine is built to produce.

## The feature store is missing customers

- **16 of 1,000 (1.6%) returned HTTP 404**, `No loan_features rows found for customer_key ...` — a hard error rather than a decision, for customers who by definition have repayment history.
- **191 routed `NO_FILE` and 289 routed `THIN_FILE`** — 48.8% of those assessed. Every one of these is a borrower with a repayment record in the Arttha file.

The 404s are not evenly spread: **13 of the 16 are `OVERDUE` customers** (13 of 333, against 2 of 334 settled and 1 of 333 on-term). Whatever builds `loan_features` appears to drop customers whose loans went bad — which is exactly the population a credit engine most needs to be able to see. Worth confirming with whoever owns that pipeline before reading too much into it, but the skew is large enough to be unlikely by chance.

The 16 that 404'd:

| MSISDN | Repayment outcome | Repayments in file | Total repaid |
|---|---|---:|---:|
| `776038676` | ON_TERM | 14 | 68.53 |
| `776429734` | SETTLED | 8 | 20.01 |
| `785819109` | SETTLED | 3 | 11.36 |
| `771257133` | OVERDUE | 1 | 0.29 |
| `772222429` | OVERDUE | 42 | 11532.56 |
| `773902481` | OVERDUE | 5 | 27.84 |
| `774794424` | OVERDUE | 11 | 15.96 |
| `775962008` | OVERDUE | 19 | 193.53 |
| `776037928` | OVERDUE | 3 | 11.97 |
| `776966071` | OVERDUE | 2 | 0.98 |
| `779210124` | OVERDUE | 1 | 0.66 |
| `779406734` | OVERDUE | 1 | 0.14 |
| `779720128` | OVERDUE | 3 | 10.54 |
| `780768140` | OVERDUE | 5 | 34.28 |
| `782237434` | OVERDUE | 1 | 0.47 |
| `788491347` | OVERDUE | 11 | 32.43 |

```json
{
  "message": "No loan_features rows found for customer_key 776038676",
  "error": "Not Found",
  "statusCode": 404
}
```

## Caveat: which product profile these decisions used

All 984 decisions bound to product profile `ecf6027a-a611-48ff-8bf8-3a60d8a0e96e` — the profile created accidentally by the smoke test at 03:40Z on 2026-09-29, before that call was moved to a throwaway tenant. `legacy` carries six ACTIVE profiles and the engine takes the newest, so this one is currently in the path of every assessment on the tenant. Its values are identical to the five that preceded it (`productMaximum` 500, `minimumViableLimit` 30, `permittedTenures` [3,4,6], `depositFloorPct` 0), so the findings above do not depend on it — but it should be retired, and the API currently exposes no route to do so.

---

## Full results

All 1,000, sorted by repayment group then MSISDN. Complete response bodies are in `2026-09-29-msisdn-results-1000.json`.

### SETTLED

| MSISDN | Repays | Outstanding | Routing | Decision | Band | Score | Afford. | Binding constraint |
|---|---:|---:|---|---|---|---:|---:|---|
| `771000555` | 16 | 0.00 | `SCORED` | **REFER** | C | 56.9 | 27.98 | `layer_3/band_table` |
| `771068537` | 60 | 0.00 | `SCORED` | **DECLINE** | — | — | — | `layer_1/concurrent_loan_cap` |
| `771133447` | 12 | 0.00 | `SCORED` | **REFER** | C | 59.9 | 0.00 | `layer_3/band_table` |
| `771194492` | 64 | 0.00 | `SCORED` | **DECLINE** | A | 89.8 | 0.00 | `layer_5/minimum_viable_limit` |
| `771227313` | 57 | 0.00 | `SCORED` | **REFER** | C | 56.6 | 0.00 | `layer_3/band_table` |
| `771291124` | 7 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `771348587` | 19 | 0.00 | `SCORED` | **REFER** | D | 49.5 | 0.00 | `layer_3/band_table` |
| `771415992` | 6 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `771472063` | 32 | 0.00 | `SCORED` | **DECLINE** | B | 77.5 | 0.00 | `layer_4/income_stability_requirement` |
| `771530153` | 49 | 0.00 | `SCORED` | **REFER** | D | 48.1 | 15.84 | `layer_3/band_table` |
| `771586416` | 6 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `771649968` | 14 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `771713074` | 1 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `771772541` | 114 | 0.00 | `SCORED` | **DECLINE** | — | — | — | `layer_1/concurrent_loan_cap` |
| `771830046` | 10 | 0.00 | `SCORED` | **REFER** | C | 59.0 | 0.00 | `layer_3/band_table` |
| `771894453` | 1 | 0.00 | `SCORED` | **DECLINE** | — | — | — | `layer_1/maximum_age_at_maturity` |
| `771961128` | 6 | 0.00 | `THIN_FILE` | **REFER** | — | — | — | `layer_2/dormant_then_suddenly_active` |
| `772113100` | 27 | 0.00 | `SCORED` | **REFER** | D | 46.8 | 0.00 | `layer_3/band_table` |
| `772162835` | 2 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `772213820` | 3 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `772224501` | 19 | 0.00 | `SCORED` | **REFER** | C | 66.4 | 0.00 | `layer_3/band_table` |
| `772248043` | 378 | 0.00 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `772270072` | 36 | 0.00 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `772288578` | 1 | 0.00 | `SCORED` | **REFER** | C | 50.9 | 0.00 | `layer_3/band_table` |
| `772306895` | 3 | 0.00 | `SCORED` | **DECLINE** | B | 81.2 | 8.92 | `layer_5/minimum_viable_limit` |
| `772325088` | 6 | 0.00 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `772341738` | 31 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `772359168` | 9 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `772375829` | 41 | 0.00 | `SCORED` | **REFER** | C | 54.8 | 0.00 | `layer_3/band_table` |
| `772390326` | 1 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `772404985` | 18 | 0.00 | `SCORED` | **REFER** | C | 56.9 | 0.00 | `layer_3/band_table` |
| `772423639` | 3 | 0.00 | `SCORED` | **DECLINE** | B | 71.4 | 0.00 | `layer_5/minimum_viable_limit` |
| `772442087` | 57 | 0.00 | `SCORED` | **REFER** | C | 55.0 | 0.00 | `layer_3/band_table` |
| `772459373` | 8 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 20.65 | `layer_4/income_stability_requirement` |
| `772480036` | 2 | 0.00 | `SCORED` | **DECLINE** | B | 84.8 | 0.00 | `layer_5/minimum_viable_limit` |
| `772496380` | 11 | 0.00 | `SCORED` | **DECLINE** | B | 81.0 | 0.00 | `layer_5/minimum_viable_limit` |
| `772522222` | 2 | 0.00 | `SCORED` | **REFER** | C | 68.4 | 18.87 | `layer_3/band_table` |
| `772545875` | 23 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/income_stability_requirement` |
| `772564986` | 5 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `772585929` | 11 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `772604712` | 18 | 0.00 | `SCORED` | **DECLINE** | A | 89.2 | 0.00 | `layer_5/minimum_viable_limit` |
| `772621956` | 8 | 0.00 | `SCORED` | **REFER** | C | 60.4 | 0.00 | `layer_3/band_table` |
| `772638636` | 2 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `772657531` | 65 | 0.00 | `SCORED` | **REFER** | C | 67.7 | 19.37 | `layer_3/band_table` |
| `772674330` | 2 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `772690935` | 40 | 0.00 | `SCORED` | **REFER** | C | 55.0 | 0.00 | `layer_3/band_table` |
| `772707280` | 12 | 0.00 | `SCORED` | **REFER** | D | 49.6 | 0.00 | `layer_3/band_table` |
| `772723367` | 15 | 0.00 | `SCORED` | **DECLINE** | B | 77.4 | 0.00 | `layer_5/minimum_viable_limit` |
| `772737240` | 19 | 0.00 | `SCORED` | **DECLINE** | A | 90.6 | 0.00 | `layer_4/income_stability_requirement` |
| `772753471` | 432 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `772769456` | 8 | 0.00 | `SCORED` | **REFER** | D | 49.4 | 0.00 | `layer_3/band_table` |
| `772785430` | 2 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/income_stability_requirement` |
| `772810843` | 12 | 0.00 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `772832203` | 19 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `772848202` | 108 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `772864277` | 30 | 0.00 | `SCORED` | **REFER** | C | 57.9 | 0.00 | `layer_3/band_table` |
| `772880754` | 27 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `772894707` | 8 | 0.00 | `SCORED` | **REFER** | C | 56.9 | 0.00 | `layer_3/band_table` |
| `772909764` | 7 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `772924556` | 19 | 0.00 | `SCORED` | **REFER** | D | 47.1 | 0.00 | `layer_3/band_table` |
| `772939217` | 30 | 0.00 | `SCORED` | **REFER** | C | 53.7 | 0.00 | `layer_3/band_table` |
| `772952729` | 36 | 0.00 | `SCORED` | **REFER** | C | 56.3 | 0.00 | `layer_3/band_table` |
| `772966564` | 27 | 0.00 | `SCORED` | **REFER** | C | 69.2 | 0.00 | `layer_3/band_table` |
| `772979682` | 10 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `772997275` | 403 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `773016327` | 3 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `773032416` | 21 | 0.00 | `SCORED` | **REFER** | C | 62.2 | 0.00 | `layer_3/band_table` |
| `773048265` | 11 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `773064502` | 12 | 0.00 | `SCORED` | **DECLINE** | B | 79.1 | 0.00 | `layer_5/minimum_viable_limit` |
| `773086899` | 7 | 0.00 | `SCORED` | **REFER** | C | 55.8 | 0.00 | `layer_3/band_table` |
| `773105415` | 19 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `773130852` | 3 | 0.00 | `SCORED` | **REFER** | C | 59.2 | 0.00 | `layer_3/band_table` |
| `773154739` | 47 | 0.00 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `773177361` | 6 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `773197880` | 44 | 0.00 | `SCORED` | **REFER** | C | 57.9 | 0.00 | `layer_3/band_table` |
| `773212923` | 5 | 0.00 | `SCORED` | **DECLINE** | B | 81.4 | 0.00 | `layer_5/minimum_viable_limit` |
| `773228794` | 57 | 0.00 | `SCORED` | **REFER** | C | 56.4 | 0.00 | `layer_3/band_table` |
| `773246671` | 378 | 0.00 | `NO_FILE` | **DECLINE** | — | — | 12.72 | `layer_5/minimum_viable_limit` |
| `773263446` | 324 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `773279417` | 6 | 0.00 | `SCORED` | **DECLINE** | B | 74.8 | 11.24 | `layer_5/minimum_viable_limit` |
| `773297096` | 45 | 0.00 | `SCORED` | **DECLINE** | — | — | — | `layer_1/concurrent_loan_cap` |
| `773327428` | 36 | 0.00 | `SCORED` | **REFER** | — | — | — | `layer_2/application_velocity` |
| `773362586` | 20 | 0.00 | `SCORED` | **REFER** | C | 55.1 | 0.00 | `layer_3/band_table` |
| `773379436` | 17 | 0.00 | `SCORED` | **REFER** | C | 66.6 | 0.00 | `layer_3/band_table` |
| `773395606` | 1 | 0.00 | `SCORED` | **DECLINE** | B | 72.6 | 16.71 | `layer_4/income_stability_requirement` |
| `773411139` | 8 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `773427678` | 3 | 0.00 | `SCORED` | **REFER** | C | 56.5 | 0.00 | `layer_3/band_table` |
| `773443555` | 7 | 0.00 | `SCORED` | **DECLINE** | B | 82.9 | 96.34 | `layer_6/layer_6.new_to_credit_concentration_cap` |
| `773459587` | 5 | 0.00 | `SCORED` | **REFER** | C | 65.4 | 0.00 | `layer_3/band_table` |
| `773477256` | 26 | 0.00 | `SCORED` | **REFER** | C | 52.9 | 0.00 | `layer_3/band_table` |
| `773496002` | 2 | 0.00 | `THIN_FILE` | **REFER** | — | — | — | `layer_2/pre_application_inflow_spike` |
| `773513759` | 11 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `773530009` | 2 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `773547454` | 2 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `773561510` | 6 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/income_stability_requirement` |
| `773581103` | 4 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `773598809` | 13 | 0.00 | `SCORED` | **REFER** | C | 61.8 | 10.58 | `layer_3/band_table` |
| `773616333` | 4 | 0.00 | `SCORED` | **REFER** | — | — | — | `layer_2/application_velocity` |
| `773634380` | 6 | 0.00 | `SCORED` | **REFER** | C | 55.9 | 0.00 | `layer_3/band_table` |
| `773650936` | 2 | 0.00 | `SCORED` | **DECLINE** | B | 83.0 | 0.00 | `layer_5/minimum_viable_limit` |
| `773669285` | 6 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `773689224` | 5 | 0.00 | `SCORED` | **DECLINE** | A | 89.3 | 0.00 | `layer_5/minimum_viable_limit` |
| `773712226` | 27 | 0.00 | `SCORED` | **REFER** | C | 56.0 | 0.00 | `layer_3/band_table` |
| `773734055` | 11 | 0.00 | `THIN_FILE` | **REFER** | — | — | — | `layer_2/dormant_then_suddenly_active` |
| `773751722` | 9 | 0.00 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `773769808` | 11 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `773788295` | 27 | 0.00 | `SCORED` | **REFER** | C | 61.2 | 11.02 | `layer_3/band_table` |
| `773808730` | 45 | 0.00 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `773827896` | 13 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `773848385` | 22 | 0.00 | `SCORED` | **DECLINE** | A | 91.2 | 0.00 | `layer_4/income_stability_requirement` |
| `773865420` | 4 | 0.00 | `THIN_FILE` | **REFER** | — | — | — | `layer_2/pre_application_inflow_spike` |
| `773887573` | 180 | 0.00 | `SCORED` | **REFER** | C | 56.9 | 0.00 | `layer_3/band_table` |
| `773903975` | 13 | 0.00 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `773920241` | 4 | 0.00 | `SCORED` | **REFER** | D | 44.8 | 0.00 | `layer_3/band_table` |
| `773938860` | 22 | 0.00 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `773960163` | 5 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `773981911` | 7 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `774002739` | 10 | 0.00 | `SCORED` | **REFER** | C | 50.4 | 0.00 | `layer_3/band_table` |
| `774025210` | 2 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `774046226` | 7 | 0.00 | `SCORED` | **REFER** | C | 68.1 | 0.00 | `layer_3/band_table` |
| `774067485` | 73 | 0.00 | `SCORED` | **DECLINE** | B | 75.5 | 12.18 | `layer_5/minimum_viable_limit` |
| `774091128` | 17 | 0.00 | `SCORED` | **DECLINE** | B | 74.2 | 0.00 | `layer_5/minimum_viable_limit` |
| `774118713` | 7 | 0.00 | `SCORED` | **DECLINE** | B | 77.0 | 0.00 | `layer_4/income_stability_requirement` |
| `774144500` | 1 | 0.00 | `SCORED` | **REFER** | C | 50.7 | 0.00 | `layer_3/band_table` |
| `774173381` | 9 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `774204608` | 13 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `774225882` | 13 | 0.00 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `774269919` | 15 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `774312344` | 1 | 0.00 | `SCORED` | **DECLINE** | B | 71.0 | 0.00 | `layer_4/income_stability_requirement` |
| `774339302` | 62 | 0.00 | `SCORED` | **REFER** | C | 54.0 | 19.47 | `layer_3/band_table` |
| `774368038` | 414 | 0.00 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `774391670` | 3 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `774418962` | 59 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/income_stability_requirement` |
| `774447959` | 3 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/income_stability_requirement` |
| `774482357` | 2 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `774517982` | 8 | 0.00 | `SCORED` | **DECLINE** | B | 76.4 | 169.71 | `layer_6/layer_6.new_to_credit_concentration_cap` |
| `774551678` | 24 | 0.00 | `SCORED` | **REFER** | C | 68.2 | 0.00 | `layer_3/band_table` |
| `774587509` | 15 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `774619549` | 180 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `774650967` | 2 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `774692231` | 3 | 0.00 | `SCORED` | **REFER** | C | 55.9 | 0.00 | `layer_3/band_table` |
| `774727357` | 16 | 0.00 | `SCORED` | **REFER** | C | 57.4 | 0.00 | `layer_3/band_table` |
| `774763330` | 3 | 0.00 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `774796818` | 5 | 0.00 | `SCORED` | **REFER** | C | 58.8 | 0.00 | `layer_3/band_table` |
| `774830066` | 2 | 0.00 | `SCORED` | **REFER** | C | 56.2 | 0.00 | `layer_3/band_table` |
| `774864933` | 2 | 0.00 | `SCORED` | **REFER** | D | 48.7 | 0.00 | `layer_3/band_table` |
| `774896882` | 6 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `774945449` | 25 | 0.00 | `SCORED` | **REFER** | C | 56.2 | 0.00 | `layer_3/band_table` |
| `774990125` | 36 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `775023475` | 51 | 0.00 | `SCORED` | **REFER** | C | 56.2 | 5.83 | `layer_3/band_table` |
| `775052512` | 41 | 0.00 | `SCORED` | **REFER** | C | 54.8 | 0.00 | `layer_3/band_table` |
| `775081608` | 42 | 0.00 | `SCORED` | **REFER** | C | 56.5 | 0.00 | `layer_3/band_table` |
| `775112609` | 14 | 0.00 | `SCORED` | **REFER** | D | 49.5 | 0.00 | `layer_3/band_table` |
| `775138933` | 28 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/income_stability_requirement` |
| `775163240` | 20 | 0.00 | `SCORED` | **DECLINE** | B | 79.7 | 0.00 | `layer_4/income_stability_requirement` |
| `775197910` | 34 | 0.00 | `SCORED` | **REFER** | C | 62.0 | 0.00 | `layer_3/band_table` |
| `775229883` | 9 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `775263026` | 4 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `775308620` | 31 | 0.00 | `SCORED` | **DECLINE** | A | 97.0 | 0.00 | `layer_5/minimum_viable_limit` |
| `775342397` | 3 | 0.00 | `SCORED` | **REFER** | C | 61.9 | 4.25 | `layer_3/band_table` |
| `775372680` | 34 | 0.00 | `SCORED` | **REFER** | C | 63.6 | 0.00 | `layer_3/band_table` |
| `775409152` | 21 | 0.00 | `SCORED` | **REFER** | C | 57.6 | 0.00 | `layer_3/band_table` |
| `775447589` | 396 | 0.00 | `NO_FILE` | **DECLINE** | — | — | 13.33 | `layer_5/minimum_viable_limit` |
| `775487922` | 7 | 0.00 | `SCORED` | **REFER** | C | 59.1 | 0.00 | `layer_3/band_table` |
| `775529462` | 1 | 0.00 | `SCORED` | **DECLINE** | B | 80.2 | 0.00 | `layer_5/minimum_viable_limit` |
| `775568960` | 2 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `775610189` | 5 | 0.00 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `775646487` | 36 | 0.00 | `SCORED` | **REFER** | C | 64.7 | 0.00 | `layer_3/band_table` |
| `775684429` | 4 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `775718188` | 17 | 0.00 | `SCORED` | **REFER** | C | 62.3 | 0.00 | `layer_3/band_table` |
| `775755240` | 3 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `775792881` | 3 | 0.00 | `SCORED` | **DECLINE** | B | 84.2 | 0.00 | `layer_5/minimum_viable_limit` |
| `775830518` | 7 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `775867846` | 4 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/income_stability_requirement` |
| `775903604` | 20 | 0.00 | `SCORED` | **DECLINE** | — | — | — | `layer_1/concurrent_loan_cap` |
| `775937155` | 7 | 0.00 | `SCORED` | **REFER** | D | 45.9 | 0.00 | `layer_3/band_table` |
| `775974001` | 6 | 0.00 | `SCORED` | **REFER** | C | 54.5 | 10.84 | `layer_3/band_table` |
| `776010929` | 9 | 0.00 | `SCORED` | **REFER** | C | 60.3 | 0.00 | `layer_3/band_table` |
| `776050314` | 1 | 0.00 | `SCORED` | **REFER** | C | 61.7 | 0.00 | `layer_3/band_table` |
| `776094343` | 11 | 0.00 | `SCORED` | **REFER** | C | 50.1 | 0.00 | `layer_3/band_table` |
| `776135302` | 486 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `776174250` | 180 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 17.45 | `layer_5/minimum_viable_limit` |
| `776215055` | 8 | 0.00 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `776257207` | 23 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `776308086` | 2 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `776348874` | 22 | 0.00 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `776388643` | 33 | 0.00 | `SCORED` | **REFER** | C | 61.8 | 0.00 | `layer_3/band_table` |
| `776429734` | 8 | 0.00 | — | **HTTP 404** | — | — | — | no loan_features rows |
| `776468106` | 4 | 0.00 | `SCORED` | **REFER** | C | 51.9 | 0.00 | `layer_3/band_table` |
| `776524766` | 7 | 0.00 | `SCORED` | **DECLINE** | B | 80.1 | 0.00 | `layer_5/minimum_viable_limit` |
| `776577273` | 9 | 0.00 | `SCORED` | **REFER** | C | 54.1 | 0.00 | `layer_3/band_table` |
| `776623900` | 342 | 0.00 | `NO_FILE` | **DECLINE** | — | — | 12.90 | `layer_5/minimum_viable_limit` |
| `776684029` | 6 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `776743294` | 31 | 0.00 | `SCORED` | **DECLINE** | B | 73.7 | 0.00 | `layer_4/income_stability_requirement` |
| `776801995` | 252 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `776854209` | 2 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 4.01 | `layer_4/income_stability_requirement` |
| `776902056` | 1 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `776960846` | 6 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `777008569` | 31 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `777050493` | 6 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `777090740` | 13 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `777130360` | 19 | 0.00 | `SCORED` | **REFER** | C | 60.0 | 0.00 | `layer_3/band_table` |
| `777177547` | 14 | 0.00 | `SCORED` | **REFER** | C | 63.2 | 0.00 | `layer_3/band_table` |
| `777222984` | 131 | 0.00 | `SCORED` | **REFER** | — | — | — | `layer_2/pre_application_inflow_spike` |
| `777282573` | 3 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `777335714` | 28 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/income_stability_requirement` |
| `777381996` | 9 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/income_stability_requirement` |
| `777434424` | 37 | 0.00 | `SCORED` | **REFER** | C | 66.1 | 0.00 | `layer_3/band_table` |
| `777480300` | 8 | 0.00 | `SCORED` | **DECLINE** | A | 90.7 | 0.00 | `layer_4/minimum_monthly_income` |
| `777525064` | 4 | 0.00 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `777569317` | 13 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `777611534` | 2 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `777659356` | 15 | 0.00 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `777705718` | 24 | 0.00 | `SCORED` | **REFER** | C | 62.4 | 0.00 | `layer_3/band_table` |
| `777750307` | 6 | 0.00 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `777789104` | 10 | 0.00 | `SCORED` | **REFER** | C | 65.0 | 0.00 | `layer_3/band_table` |
| `777827865` | 15 | 0.00 | `SCORED` | **DECLINE** | B | 71.3 | 0.00 | `layer_4/income_stability_requirement` |
| `777877594` | 24 | 0.00 | `SCORED` | **REFER** | C | 53.6 | 5.06 | `layer_3/band_table` |
| `777925327` | 17 | 0.00 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `777972250` | 7 | 0.00 | `SCORED` | **REFER** | C | 65.7 | 0.00 | `layer_3/band_table` |
| `778014776` | 5 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `778062426` | 6 | 0.00 | `SCORED` | **REFER** | C | 54.9 | 0.00 | `layer_3/band_table` |
| `778107393` | 28 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/income_stability_requirement` |
| `778162701` | 44 | 0.00 | `SCORED` | **REFER** | C | 56.4 | 17.42 | `layer_3/band_table` |
| `778218934` | 3 | 0.00 | `SCORED` | **REFER** | D | 47.6 | 0.00 | `layer_3/band_table` |
| `778266684` | 3 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `778318449` | 2 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `778371172` | 7 | 0.00 | `THIN_FILE` | **REFER** | — | — | — | `layer_2/dormant_then_suddenly_active` |
| `778424100` | 6 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `778491125` | 2 | 0.00 | `SCORED` | **REFER** | C | 66.9 | 12.48 | `layer_3/band_table` |
| `778555901` | 2 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `778625123` | 35 | 0.00 | `SCORED` | **REFER** | C | 68.5 | 0.00 | `layer_3/band_table` |
| `778691520` | 12 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `778759680` | 144 | 0.00 | `SCORED` | **DECLINE** | B | 78.6 | 0.00 | `layer_4/income_stability_requirement` |
| `778823745` | 20 | 0.00 | `SCORED` | **DECLINE** | B | 83.0 | 0.00 | `layer_5/minimum_viable_limit` |
| `778892114` | 15 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `778949821` | 5 | 0.00 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `779015320` | 19 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/income_stability_requirement` |
| `779077414` | 4 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `779132038` | 30 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `779187052` | 5 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `779242387` | 2 | 0.00 | `SCORED` | **DECLINE** | A | 92.3 | 0.00 | `layer_5/minimum_viable_limit` |
| `779303621` | 7 | 0.00 | `SCORED` | **REFER** | C | 51.2 | 0.00 | `layer_3/band_table` |
| `779351781` | 22 | 0.00 | `SCORED` | **DECLINE** | A | 86.2 | 0.00 | `layer_5/minimum_viable_limit` |
| `779413018` | 4 | 0.00 | `SCORED` | **REFER** | D | 45.4 | 0.00 | `layer_3/band_table` |
| `779469027` | 18 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 1.40 | `layer_5/minimum_viable_limit` |
| `779517692` | 41 | 0.00 | `SCORED` | **REFER** | C | 53.0 | 0.00 | `layer_3/band_table` |
| `779570767` | 21 | 0.00 | `SCORED` | **REFER** | C | 56.8 | 0.00 | `layer_3/band_table` |
| `779623623` | 39 | 0.00 | `SCORED` | **DECLINE** | B | 80.4 | 0.00 | `layer_5/minimum_viable_limit` |
| `779679444` | 3 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `779743648` | 1 | 0.00 | `SCORED` | **REFER** | C | 58.0 | 28.12 | `layer_3/band_table` |
| `779799643` | 1 | 0.00 | `SCORED` | **DECLINE** | A | 88.1 | 0.00 | `layer_4/income_stability_requirement` |
| `779865097` | 22 | 0.00 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `779924678` | 3 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `779991199` | 3 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `780144235` | 28 | 0.00 | `SCORED` | **REFER** | C | 59.4 | 6.44 | `layer_3/band_table` |
| `780392343` | 8 | 0.00 | `THIN_FILE` | **REFER** | — | — | — | `layer_2/dormant_then_suddenly_active` |
| `780580482` | 3 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `780763460` | 29 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `780943680` | 6 | 0.00 | `SCORED` | **DECLINE** | A | 89.8 | 0.00 | `layer_4/income_stability_requirement` |
| `781198922` | 11 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `781519591` | 2 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `781858446` | 5 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `782030695` | 59 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `782107035` | 5 | 0.00 | `SCORED` | **DECLINE** | A | 94.4 | 0.00 | `layer_5/minimum_viable_limit` |
| `782170659` | 15 | 0.00 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `782230061` | 9 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `782289889` | 30 | 0.00 | `SCORED` | **REFER** | C | 62.3 | 0.00 | `layer_3/band_table` |
| `782358150` | 18 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `782414605` | 28 | 0.00 | `SCORED` | **REFER** | C | 51.2 | 0.00 | `layer_3/band_table` |
| `782473853` | 1 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `782551116` | 3 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `782629325` | 7 | 0.00 | `SCORED` | **REFER** | D | 48.7 | 0.00 | `layer_3/band_table` |
| `782706635` | 12 | 0.00 | `SCORED` | **REFER** | C | 61.3 | 0.00 | `layer_3/band_table` |
| `782822957` | 26 | 0.00 | `SCORED` | **REFER** | C | 65.1 | 0.00 | `layer_3/band_table` |
| `782886610` | 1 | 0.00 | `SCORED` | **REFER** | D | 47.4 | 0.00 | `layer_3/band_table` |
| `782970389` | 4 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `783028153` | 75 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `783106906` | 11 | 0.00 | `SCORED` | **DECLINE** | A | 85.7 | 0.00 | `layer_5/minimum_viable_limit` |
| `783177897` | 38 | 0.00 | `SCORED` | **REFER** | C | 62.5 | 0.00 | `layer_3/band_table` |
| `783236280` | 5 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `783298271` | 52 | 0.00 | `SCORED` | **REFER** | — | — | — | `layer_2/pre_application_inflow_spike` |
| `783370066` | 8 | 0.00 | `SCORED` | **REFER** | D | 45.8 | 0.00 | `layer_3/band_table` |
| `783427022` | 1 | 0.00 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `783497921` | 4 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `783570847` | 270 | 0.00 | `NO_FILE` | **DECLINE** | — | — | 12.22 | `layer_5/minimum_viable_limit` |
| `783646064` | 20 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `783718437` | 3 | 0.00 | `SCORED` | **REFER** | C | 54.4 | 14.34 | `layer_3/band_table` |
| `783782307` | 2 | 0.00 | `SCORED` | **REFER** | D | 47.6 | 0.00 | `layer_3/band_table` |
| `783851371` | 108 | 0.00 | `SCORED` | **REFER** | C | 69.3 | 0.00 | `layer_3/band_table` |
| `783932185` | 2 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `784014994` | 2 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `784104789` | 18 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `784191203` | 7 | 0.00 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `784284230` | 29 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `784359942` | 1 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `784457200` | 10 | 0.00 | `SCORED` | **REFER** | D | 47.4 | 6.81 | `layer_3/band_table` |
| `784530742` | 27 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `784614288` | 21 | 0.00 | `SCORED` | **DECLINE** | B | 71.1 | 0.00 | `layer_4/minimum_monthly_income` |
| `784701570` | 18 | 0.00 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `784781002` | 6 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `784880978` | 3 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `784957500` | 26 | 0.00 | `SCORED` | **DECLINE** | B | 82.0 | 0.27 | `layer_4/income_stability_requirement` |
| `785035357` | 2 | 0.00 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `785120820` | 16 | 0.00 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `785187657` | 1 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `785276676` | 1 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/income_stability_requirement` |
| `785371107` | 5 | 0.00 | `SCORED` | **REFER** | D | 44.5 | 0.00 | `layer_3/band_table` |
| `785471644` | 4 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `785564011` | 32 | 0.00 | `SCORED` | **DECLINE** | A | 89.9 | 0.00 | `layer_5/minimum_viable_limit` |
| `785643464` | 4 | 0.00 | `SCORED` | **REFER** | C | 63.2 | 0.00 | `layer_3/band_table` |
| `785716737` | 1 | 0.00 | `SCORED` | **DECLINE** | B | 82.0 | 0.00 | `layer_5/minimum_viable_limit` |
| `785819109` | 3 | 0.00 | — | **HTTP 404** | — | — | — | no loan_features rows |
| `785916496` | 20 | 0.00 | `SCORED` | **DECLINE** | B | 71.9 | 0.00 | `layer_4/income_stability_requirement` |
| `786009872` | 5 | 0.00 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `786148380` | 11 | 0.00 | `SCORED` | **REFER** | C | 60.6 | 4.93 | `layer_3/band_table` |
| `786280377` | 2 | 0.00 | `SCORED` | **DECLINE** | B | 77.5 | 0.00 | `layer_5/minimum_viable_limit` |
| `786395540` | 17 | 0.00 | `SCORED` | **REFER** | D | 47.1 | 0.00 | `layer_3/band_table` |
| `786528840` | 10 | 0.00 | `SCORED` | **DECLINE** | A | 88.6 | 0.00 | `layer_4/income_stability_requirement` |
| `786665383` | 4 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `786813108` | 43 | 0.00 | `SCORED` | **REFER** | C | 61.1 | 0.00 | `layer_3/band_table` |
| `786974693` | 14 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/income_stability_requirement` |
| `787176938` | 5 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `787351844` | 41 | 0.00 | `SCORED` | **REFER** | C | 65.2 | 0.00 | `layer_3/band_table` |
| `787517727` | 3 | 0.00 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `787703191` | 1 | 0.00 | `SCORED` | **REFER** | C | 52.3 | 0.00 | `layer_3/band_table` |
| `787860265` | 13 | 0.00 | `SCORED` | **REFER** | D | 44.8 | 0.00 | `layer_3/band_table` |
| `788064795` | 7 | 0.00 | `SCORED` | **REFER** | C | 55.2 | 0.00 | `layer_3/band_table` |
| `788240165` | 6 | 0.00 | `SCORED` | **DECLINE** | B | 79.6 | 0.00 | `layer_4/minimum_monthly_income` |
| `788440650` | 1 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `788643740` | 4 | 0.00 | `THIN_FILE` | **REFER** | — | — | — | `layer_2/pre_application_inflow_spike` |
| `788826179` | 7 | 0.00 | `SCORED` | **DECLINE** | A | 93.1 | 0.00 | `layer_5/minimum_viable_limit` |
| `789007262` | 3 | 0.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_1/maximum_age_at_maturity` |
| `789532273` | 3 | 0.00 | `SCORED` | **REFER** | C | 58.0 | 0.00 | `layer_3/band_table` |

### ON_TERM

| MSISDN | Repays | Outstanding | Routing | Decision | Band | Score | Afford. | Binding constraint |
|---|---:|---:|---|---|---|---:|---:|---|
| `771059229` | 8 | 20.00 | `SCORED` | **REFER** | D | 47.3 | 24.20 | `layer_3/band_table` |
| `771169050` | 22 | 96.00 | `SCORED` | **DECLINE** | A | 91.7 | 0.00 | `layer_5/minimum_viable_limit` |
| `771222046` | 138 | 230.00 | `SCORED` | **REFER** | — | — | — | `layer_2/application_velocity` |
| `771222772` | 47 | 6.25 | `SCORED` | **REFER** | D | 46.8 | 0.00 | `layer_3/band_table` |
| `771317949` | 180 | 16.02 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `771419899` | 40 | 95.00 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `771459616` | 33 | 20.00 | `SCORED` | **REFER** | C | 59.5 | 0.00 | `layer_3/band_table` |
| `771482743` | 37 | 90.00 | `SCORED` | **DECLINE** | B | 79.3 | 0.00 | `layer_4/income_stability_requirement` |
| `771516261` | 216 | 12.04 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `771552868` | 19 | 70.00 | `SCORED` | **REFER** | C | 57.5 | 0.00 | `layer_3/band_table` |
| `771606369` | 21 | 80.00 | `SCORED` | **DECLINE** | B | 81.8 | 0.00 | `layer_4/income_stability_requirement` |
| `771650390` | 62 | 27.00 | `SCORED` | **REFER** | C | 54.7 | 0.00 | `layer_3/band_table` |
| `771703099` | 252 | 6.51 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `771737293` | 9 | 30.00 | `SCORED` | **REFER** | C | 53.2 | 0.00 | `layer_3/band_table` |
| `771777715` | 324 | 17.00 | `SCORED` | **REFER** | D | 41.9 | — | `layer_3/band_table` |
| `771855815` | 54 | 14.25 | `THIN_FILE` | **DECLINE** | — | — | 18.54 | `layer_5/minimum_viable_limit` |
| `771911319` | 28 | 3.50 | `SCORED` | **REFER** | C | 64.0 | 0.00 | `layer_3/band_table` |
| `771984632` | 31 | 60.00 | `SCORED` | **REFER** | C | 59.9 | 0.00 | `layer_3/band_table` |
| `772116084` | 396 | 16.35 | `NO_FILE` | **APPROVE** | — | — | 36.56 | `—` |
| `772206037` | 162 | 8.40 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `772222159` | 260 | 61.72 | `SCORED` | **REFER** | C | 62.1 | 0.00 | `layer_3/band_table` |
| `772222517` | 202 | 19.15 | `SCORED` | **REFER** | C | 50.3 | 6.56 | `layer_3/band_table` |
| `772222894` | 6 | 400.00 | `SCORED` | **REFER** | D | 49.3 | 0.00 | `layer_3/band_table` |
| `772245131` | 68 | 90.00 | `SCORED` | **REFER** | C | 60.3 | 0.00 | `layer_3/band_table` |
| `772256152` | 7 | 97.00 | `SCORED` | **REFER** | C | 57.8 | 0.00 | `layer_3/band_table` |
| `772272730` | 468 | 13.38 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `772283742` | 468 | 13.34 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `772292941` | 900 | 5.66 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `772327608` | 60 | 69.92 | `SCORED` | **DECLINE** | B | 79.8 | 0.00 | `layer_5/minimum_viable_limit` |
| `772344835` | 144 | 14.68 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `772368443` | 306 | 6.21 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `772378132` | 396 | 12.17 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `772396915` | 48 | 3.00 | `SCORED` | **REFER** | C | 62.2 | 0.00 | `layer_3/band_table` |
| `772420439` | 486 | 15.97 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `772438725` | 180 | 3.98 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `772468094` | 144 | 12.62 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `772483725` | 324 | 16.70 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `772492484` | 1 | 9.50 | `SCORED` | **DECLINE** | B | 75.7 | 0.00 | `layer_5/minimum_viable_limit` |
| `772521465` | 144 | 0.68 | `SCORED` | **DECLINE** | — | — | — | `layer_1/maximum_age_at_maturity` |
| `772539056` | 51 | 90.00 | `SCORED` | **REFER** | C | 59.7 | 0.00 | `layer_3/band_table` |
| `772579725` | 117 | 5.39 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `772597188` | 40 | 90.00 | `SCORED` | **DECLINE** | B | 82.0 | 0.00 | `layer_5/minimum_viable_limit` |
| `772612815` | 306 | 7.03 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `772640299` | 109 | 5.12 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `772661302` | 2 | 5.00 | `SCORED` | **REFER** | — | — | — | `layer_2/application_velocity` |
| `772670052` | 3 | 13.00 | `SCORED` | **REFER** | D | 47.6 | 0.00 | `layer_3/band_table` |
| `772692028` | 252 | 9.36 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `772702302` | 108 | 1.70 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `772718492` | 27 | 60.00 | `SCORED` | **DECLINE** | B | 79.2 | 21.50 | `layer_4/income_stability_requirement` |
| `772732121` | 468 | 3.03 | `NO_FILE` | **DECLINE** | — | — | 17.47 | `layer_5/minimum_viable_limit` |
| `772741131` | 54 | 13.01 | `NO_FILE` | **DECLINE** | — | — | 16.17 | `layer_5/minimum_viable_limit` |
| `772762813` | 20 | 93.35 | `SCORED` | **DECLINE** | — | — | — | `layer_1/concurrent_loan_cap` |
| `772779085` | 154 | 4.92 | `SCORED` | **REFER** | D | 48.4 | 0.00 | `layer_3/band_table` |
| `772803068` | 58 | 99.00 | `SCORED` | **REFER** | C | 66.6 | 0.00 | `layer_3/band_table` |
| `772813960` | 180 | 3.36 | `THIN_FILE` | **DECLINE** | — | — | 3.37 | `layer_5/minimum_viable_limit` |
| `772826639` | 27 | 28.00 | `SCORED` | **DECLINE** | — | — | — | `layer_1/concurrent_loan_cap` |
| `772844668` | 35 | 4.00 | `SCORED` | **REFER** | — | — | — | `layer_2/application_velocity` |
| `772852035` | 90 | 75.70 | `SCORED` | **DECLINE** | — | — | — | `layer_1/concurrent_loan_cap` |
| `772859762` | 54 | 85.00 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `772889378` | 95 | 90.00 | `SCORED` | **REFER** | C | 50.8 | 0.00 | `layer_3/band_table` |
| `772913603` | 216 | 3.35 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `772927280` | 28 | 37.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `772942195` | 270 | 0.67 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `772953041` | 15 | 70.00 | `SCORED` | **DECLINE** | A | 94.7 | 0.00 | `layer_4/minimum_monthly_income` |
| `772971299` | 252 | 3.69 | `SCORED` | **REFER** | D | 40.3 | 0.00 | `layer_3/band_table` |
| `773005774` | 180 | 0.70 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `773029499` | 13 | 25.00 | `SCORED` | **DECLINE** | — | — | — | `layer_1/concurrent_loan_cap` |
| `773050951` | 98 | 38.00 | `SCORED` | **REFER** | C | 55.9 | 0.00 | `layer_3/band_table` |
| `773067754` | 181 | 17.34 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `773090898` | 175 | 4.14 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `773108885` | 99 | 55.65 | `SCORED` | **REFER** | — | — | — | `layer_2/application_velocity` |
| `773125440` | 24 | 95.00 | `SCORED` | **REFER** | D | 49.2 | 0.00 | `layer_3/band_table` |
| `773155316` | 234 | 10.68 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `773178043` | 450 | 9.37 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `773207084` | 180 | 12.37 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `773217650` | 396 | 3.95 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `773228519` | 19 | 9.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `773255261` | 47 | 10.00 | `SCORED` | **REFER** | D | 47.9 | 0.00 | `layer_3/band_table` |
| `773279609` | 288 | 6.14 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `773289029` | 295 | 11.70 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `773303659` | 23 | 39.93 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `773328865` | 378 | 3.38 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `773357466` | 396 | 3.31 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `773374546` | 18 | 0.33 | `SCORED` | **REFER** | D | 42.2 | 0.00 | `layer_3/band_table` |
| `773397030` | 6 | 3.47 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `773415871` | 88 | 70.00 | `SCORED` | **REFER** | C | 62.0 | 0.00 | `layer_3/band_table` |
| `773437713` | 18 | 17.28 | `THIN_FILE` | **DECLINE** | — | — | 24.14 | `layer_5/minimum_viable_limit` |
| `773451743` | 12 | 99.54 | `SCORED` | **DECLINE** | B | 83.1 | 0.00 | `layer_5/minimum_viable_limit` |
| `773457998` | 396 | 6.44 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `773474390` | 14 | 11.00 | `SCORED` | **REFER** | C | 50.9 | 0.00 | `layer_3/band_table` |
| `773488744` | 41 | 85.00 | `SCORED` | **REFER** | C | 59.6 | 2.89 | `layer_3/band_table` |
| `773499796` | 234 | 10.61 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `773504326` | 43 | 7.00 | `SCORED` | **REFER** | C | 68.1 | 0.00 | `layer_3/band_table` |
| `773520292` | 216 | 10.83 | `SCORED` | **REFER** | D | 47.6 | 0.00 | `layer_3/band_table` |
| `773527209` | 432 | 17.34 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `773536252` | 34 | 6.12 | `SCORED` | **DECLINE** | B | 74.1 | 0.00 | `layer_5/minimum_viable_limit` |
| `773548826` | 11 | 39.96 | `SCORED` | **REFER** | C | 53.4 | 0.00 | `layer_3/band_table` |
| `773564337` | 117 | 5.21 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `773596581` | 27 | 14.73 | `SCORED` | **DECLINE** | B | 73.5 | 0.00 | `layer_5/minimum_viable_limit` |
| `773610822` | 306 | 1.67 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `773620133` | 13 | 14.90 | `SCORED` | **REFER** | D | 49.7 | 0.00 | `layer_3/band_table` |
| `773635369` | 18 | 17.50 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `773644447` | 88 | 78.00 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `773664296` | 108 | 4.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `773683798` | 378 | 14.70 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `773717132` | 136 | 5.00 | `SCORED` | **DECLINE** | — | — | — | `layer_1/concurrent_loan_cap` |
| `773731791` | 38 | 19.80 | `SCORED` | **DECLINE** | B | 72.3 | 0.00 | `layer_5/minimum_viable_limit` |
| `773750057` | 126 | 17.34 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/income_stability_requirement` |
| `773770990` | 40 | 80.00 | `SCORED` | **REFER** | C | 58.5 | 0.00 | `layer_3/band_table` |
| `773782960` | 44 | 5.00 | `SCORED` | **DECLINE** | — | — | — | `layer_1/concurrent_loan_cap` |
| `773796416` | 258 | 14.62 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `773818618` | 2 | 6.50 | `SCORED` | **REFER** | C | 65.3 | 0.00 | `layer_3/band_table` |
| `773840622` | 270 | 17.44 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `773858096` | 38 | 97.50 | `SCORED` | **REFER** | C | 59.9 | 0.00 | `layer_3/band_table` |
| `773872155` | 360 | 17.22 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `773882978` | 9 | 20.00 | `SCORED` | **DECLINE** | B | 74.8 | 0.00 | `layer_5/minimum_viable_limit` |
| `773906614` | 342 | 6.67 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `773930853` | 270 | 1.68 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `773952063` | 4 | 10.00 | `SCORED` | **DECLINE** | B | 72.2 | 0.00 | `layer_5/minimum_viable_limit` |
| `773967758` | 17 | 99.00 | `SCORED` | **REFER** | C | 55.5 | 0.00 | `layer_3/band_table` |
| `773984190` | 55 | 27.00 | `SCORED` | **REFER** | C | 59.6 | 0.00 | `layer_3/band_table` |
| `774001651` | 288 | 13.45 | `SCORED` | **REFER** | D | 38.9 | 0.00 | `layer_3/band_table` |
| `774010245` | 162 | 16.68 | `SCORED` | **REFER** | D | 44.5 | 0.00 | `layer_3/band_table` |
| `774029302` | 414 | 14.85 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `774040857` | 252 | 13.36 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `774048575` | 576 | 8.84 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `774076061` | 25 | 34.76 | `SCORED` | **REFER** | D | 46.1 | 0.00 | `layer_3/band_table` |
| `774100360` | 90 | 1.40 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `774128402` | 468 | 14.30 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `774147592` | 25 | 5.50 | `SCORED` | **REFER** | C | 52.4 | 0.00 | `layer_3/band_table` |
| `774180456` | 79 | 33.10 | `SCORED` | **DECLINE** | — | — | — | `layer_1/concurrent_loan_cap` |
| `774222187` | 627 | 9.04 | `SCORED` | **DECLINE** | — | — | — | `layer_1/concurrent_loan_cap` |
| `774222577` | 84 | 48.91 | `SCORED` | **REFER** | C | 55.0 | 0.00 | `layer_3/band_table` |
| `774222742` | 86 | 482.00 | `SCORED` | **DECLINE** | B | 76.6 | 0.00 | `layer_4/income_stability_requirement` |
| `774250941` | 414 | 15.78 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `774303055` | 56 | 0.25 | `SCORED` | **REFER** | C | 58.7 | 0.00 | `layer_3/band_table` |
| `774347248` | 50 | 95.00 | `SCORED` | **REFER** | C | 61.3 | 0.00 | `layer_3/band_table` |
| `774368013` | 342 | 0.13 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `774385165` | 63 | 4.00 | `SCORED` | **DECLINE** | — | — | — | `layer_1/concurrent_loan_cap` |
| `774407571` | 252 | 5.36 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `774427428` | 31 | 20.00 | `SCORED` | **REFER** | C | 56.8 | 13.59 | `layer_3/band_table` |
| `774447461` | 360 | 14.72 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `774484486` | 117 | 6.21 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/income_stability_requirement` |
| `774511978` | 270 | 16.06 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `774542629` | 66 | 53.90 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `774570061` | 51 | 13.00 | `SCORED` | **REFER** | C | 53.4 | 0.00 | `layer_3/band_table` |
| `774605905` | 86 | 60.00 | `SCORED` | **DECLINE** | B | 75.0 | 0.00 | `layer_5/minimum_viable_limit` |
| `774643628` | 33 | 3.00 | `SCORED` | **REFER** | C | 62.2 | 0.00 | `layer_3/band_table` |
| `774686462` | 13 | 2.00 | `SCORED` | **REFER** | C | 51.8 | 0.00 | `layer_3/band_table` |
| `774721211` | 33 | 24.00 | `SCORED` | **DECLINE** | — | — | — | `layer_1/concurrent_loan_cap` |
| `774741366` | 16 | 14.00 | `SCORED` | **DECLINE** | A | 90.0 | 0.00 | `layer_4/income_stability_requirement` |
| `774773572` | 156 | 41.00 | `SCORED` | **REFER** | C | 58.6 | 0.00 | `layer_3/band_table` |
| `774826276` | 47 | 1.00 | `SCORED` | **REFER** | C | 55.8 | 0.00 | `layer_3/band_table` |
| `774863433` | 436 | 14.70 | `SCORED` | **REFER** | C | 67.7 | 0.00 | `layer_3/band_table` |
| `774896092` | 29 | 71.00 | `SCORED` | **REFER** | C | 51.5 | 0.00 | `layer_3/band_table` |
| `774951778` | 540 | 0.66 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `774983742` | 74 | 23.50 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/income_stability_requirement` |
| `775029507` | 1080 | 14.07 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `775061005` | 42 | 29.48 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `775086741` | 80 | 20.00 | `SCORED` | **REFER** | C | 55.6 | 0.00 | `layer_3/band_table` |
| `775112346` | 522 | 8.37 | `NO_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `775134189` | 5 | 40.00 | `SCORED` | **DECLINE** | A | 89.7 | 0.00 | `layer_4/income_stability_requirement` |
| `775153664` | 248 | 4.36 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `775168352` | 238 | 2.42 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `775184909` | 378 | 3.89 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `775231549` | 198 | 16.88 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `775240825` | 265 | 12.45 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `775303723` | 234 | 4.03 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `775327863` | 108 | 6.64 | `THIN_FILE` | **REFER** | — | — | — | `layer_2/dormant_then_suddenly_active` |
| `775378224` | 13 | 96.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/income_stability_requirement` |
| `775401708` | 198 | 12.22 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `775423056` | 433 | 32.15 | `SCORED` | **DECLINE** | B | 73.1 | 10.97 | `layer_5/minimum_viable_limit` |
| `775462728` | 180 | 13.02 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `775499910` | 26 | 10.00 | `SCORED` | **DECLINE** | B | 80.4 | 0.00 | `layer_5/minimum_viable_limit` |
| `775521312` | 432 | 16.31 | `NO_FILE` | **DECLINE** | — | — | 16.76 | `layer_5/minimum_viable_limit` |
| `775556957` | 180 | 16.93 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `775597141` | 288 | 6.90 | `SCORED` | **REFER** | D | 39.7 | — | `layer_3/band_table` |
| `775640813` | 378 | 8.48 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `775667044` | 18 | 4.84 | `SCORED` | **DECLINE** | B | 71.4 | 0.00 | `layer_5/minimum_viable_limit` |
| `775708155` | 180 | 14.02 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `775732301` | 25 | 72.98 | `SCORED` | **REFER** | C | 55.2 | 1.73 | `layer_3/band_table` |
| `775750759` | 1 | 14.90 | `SCORED` | **DECLINE** | B | 81.4 | 0.00 | `layer_5/minimum_viable_limit` |
| `775771209` | 38 | 19.23 | `SCORED` | **REFER** | C | 62.5 | 0.74 | `layer_3/band_table` |
| `775801675` | 360 | 12.61 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `775828241` | 122 | 5.00 | `SCORED` | **REFER** | — | — | — | `layer_2/application_velocity` |
| `775862647` | 414 | 13.77 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `775903230` | 19 | 21.11 | `SCORED` | **DECLINE** | B | 79.6 | 0.00 | `layer_5/minimum_viable_limit` |
| `775933225` | 65 | 80.00 | `SCORED` | **REFER** | C | 58.6 | 0.00 | `layer_3/band_table` |
| `775949996` | 576 | 15.34 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `775988274` | 176 | 9.03 | `SCORED` | **REFER** | D | 38.4 | 0.00 | `layer_3/band_table` |
| `776038676` | 14 | 9.90 | — | **HTTP 404** | — | — | — | no loan_features rows |
| `776066978` | 90 | 2.07 | `SCORED` | **DECLINE** | A | 88.2 | 0.00 | `layer_4/income_stability_requirement` |
| `776116535` | 28 | 97.00 | `SCORED` | **REFER** | C | 58.8 | 0.70 | `layer_3/band_table` |
| `776173705` | 38 | 4.73 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `776205894` | 5 | 14.00 | `SCORED` | **REFER** | C | 57.1 | 0.00 | `layer_3/band_table` |
| `776243093` | 251 | 0.01 | `THIN_FILE` | **REFER** | — | — | — | `layer_2/dormant_then_suddenly_active` |
| `776272150` | 21 | 7.00 | `SCORED` | **DECLINE** | A | 86.5 | 0.00 | `layer_5/minimum_viable_limit` |
| `776299125` | 31 | 13.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `776340154` | 137 | 6.95 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `776380909` | 342 | 17.51 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `776436923` | 486 | 0.23 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `776556925` | 33 | 99.00 | `SCORED` | **REFER** | D | 49.7 | 0.00 | `layer_3/band_table` |
| `776608374` | 25 | 5.00 | `SCORED` | **REFER** | C | 51.2 | 0.00 | `layer_3/band_table` |
| `776654299` | 1 | 8.00 | `SCORED` | **REFER** | C | 55.1 | 0.00 | `layer_3/band_table` |
| `776705627` | 39 | 95.00 | `SCORED` | **DECLINE** | A | 88.4 | 0.00 | `layer_5/minimum_viable_limit` |
| `776788819` | 122 | 9.16 | `SCORED` | **DECLINE** | — | — | — | `layer_1/concurrent_loan_cap` |
| `776840778` | 11 | 29.77 | `SCORED` | **REFER** | C | 55.8 | 0.00 | `layer_3/band_table` |
| `776895951` | 126 | 1.24 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `776938739` | 153 | 4.92 | `SCORED` | **DECLINE** | — | — | — | `layer_1/concurrent_loan_cap` |
| `776971242` | 2 | 7.00 | `SCORED` | **DECLINE** | B | 77.1 | 0.00 | `layer_5/minimum_viable_limit` |
| `777012822` | 56 | 99.00 | `SCORED` | **REFER** | C | 63.2 | 0.00 | `layer_3/band_table` |
| `777065165` | 486 | 15.66 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `777101682` | 378 | 17.34 | `THIN_FILE` | **REFER** | — | — | — | `layer_2/dormant_then_suddenly_active` |
| `777132870` | 15 | 27.00 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `777164067` | 4 | 5.00 | `SCORED` | **DECLINE** | A | 85.4 | 23.79 | `layer_4/income_stability_requirement` |
| `777186297` | 21 | 17.00 | `SCORED` | **DECLINE** | A | 87.3 | 0.00 | `layer_4/income_stability_requirement` |
| `777222870` | 704 | 61.68 | `SCORED` | **REFER** | — | — | — | `layer_2/pre_application_inflow_spike` |
| `777269132` | 48 | 90.00 | `SCORED` | **REFER** | C | 59.6 | 0.00 | `layer_3/band_table` |
| `777294000` | 65 | 9.13 | `SCORED` | **DECLINE** | B | 78.8 | 0.00 | `layer_5/minimum_viable_limit` |
| `777334251` | 23 | 30.00 | `SCORED` | **REFER** | C | 61.8 | 0.00 | `layer_3/band_table` |
| `777360240` | 55 | 23.90 | `SCORED` | **REFER** | C | 65.7 | 0.00 | `layer_3/band_table` |
| `777409734` | 18 | 39.00 | `SCORED` | **DECLINE** | B | 83.2 | 0.00 | `layer_4/income_stability_requirement` |
| `777444050` | 342 | 6.12 | `NO_FILE` | **DECLINE** | — | — | — | `layer_1/minimum_age` |
| `777460973` | 59 | 14.00 | `SCORED` | **REFER** | C | 60.0 | 4.34 | `layer_3/band_table` |
| `777490849` | 38 | 15.10 | `SCORED` | **REFER** | C | 59.6 | 0.00 | `layer_3/band_table` |
| `777538866` | 126 | 4.29 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/income_stability_requirement` |
| `777566815` | 13 | 2.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `777602062` | 24 | 9.00 | `SCORED` | **DECLINE** | — | — | — | `layer_1/concurrent_loan_cap` |
| `777668063` | 43 | 9.04 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/income_stability_requirement` |
| `777722383` | 13 | 29.26 | `SCORED` | **DECLINE** | B | 78.9 | 0.00 | `layer_4/income_stability_requirement` |
| `777740163` | 11 | 80.00 | `SCORED` | **REFER** | C | 58.7 | 0.00 | `layer_3/band_table` |
| `777775528` | 15 | 55.00 | `SCORED` | **DECLINE** | A | 90.1 | 0.00 | `layer_5/minimum_viable_limit` |
| `777799725` | 26 | 13.00 | `SCORED` | **REFER** | D | 49.3 | 0.00 | `layer_3/band_table` |
| `777822197` | 64 | 9.00 | `SCORED` | **DECLINE** | — | — | — | `layer_1/concurrent_loan_cap` |
| `777874715` | 14 | 84.00 | `SCORED` | **DECLINE** | B | 76.8 | 0.00 | `layer_5/minimum_viable_limit` |
| `777910847` | 1 | 3.00 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `777956354` | 486 | 15.95 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `777985138` | 378 | 17.25 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `778034663` | 7 | 3.00 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `778093547` | 7 | 1.00 | `SCORED` | **DECLINE** | — | — | — | `layer_1/concurrent_loan_cap` |
| `778139968` | 3 | 90.00 | `SCORED` | **DECLINE** | B | 74.4 | 0.00 | `layer_5/minimum_viable_limit` |
| `778179892` | 54 | 17.00 | `SCORED` | **DECLINE** | B | 73.6 | 0.00 | `layer_4/income_stability_requirement` |
| `778201535` | 2 | 3.00 | `SCORED` | **REFER** | C | 60.3 | 0.00 | `layer_3/band_table` |
| `778230597` | 18 | 5.49 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `778310461` | 324 | 16.46 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `778344833` | 36 | 5.88 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `778410617` | 450 | 16.35 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `778458099` | 41 | 0.31 | `SCORED` | **DECLINE** | B | 81.3 | 0.00 | `layer_5/minimum_viable_limit` |
| `778535273` | 7 | 28.00 | `SCORED` | **DECLINE** | B | 70.2 | 0.00 | `layer_4/income_stability_requirement` |
| `778581775` | 378 | 8.55 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `778661367` | 306 | 17.34 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `778750616` | 16 | 15.00 | `SCORED` | **REFER** | D | 48.8 | 0.00 | `layer_3/band_table` |
| `778802747` | 6 | 50.00 | `SCORED` | **REFER** | C | 55.9 | 8.70 | `layer_3/band_table` |
| `778872744` | 1 | 10.00 | `SCORED` | **DECLINE** | B | 82.8 | 0.00 | `layer_5/minimum_viable_limit` |
| `778932289` | 15 | 55.00 | `SCORED` | **DECLINE** | B | 70.8 | 0.00 | `layer_5/minimum_viable_limit` |
| `778978584` | 3 | 92.00 | `SCORED` | **DECLINE** | B | 73.4 | 0.00 | `layer_4/income_stability_requirement` |
| `779031646` | 234 | 3.36 | `SCORED` | **REFER** | C | 61.7 | 0.00 | `layer_3/band_table` |
| `779052429` | 378 | 17.22 | `NO_FILE` | **DECLINE** | — | — | 13.81 | `layer_5/minimum_viable_limit` |
| `779092374` | 3 | 75.00 | `SCORED` | **REFER** | C | 50.7 | 0.00 | `layer_3/band_table` |
| `779117086` | 11 | 90.00 | `SCORED` | **REFER** | C | 61.3 | 0.00 | `layer_3/band_table` |
| `779162171` | 367 | 13.54 | `SCORED` | **REFER** | C | 52.7 | 0.00 | `layer_3/band_table` |
| `779215126` | 3 | 2.00 | `SCORED` | **REFER** | C | 54.3 | 0.00 | `layer_3/band_table` |
| `779242783` | 414 | 16.55 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `779273799` | 50 | 82.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/income_stability_requirement` |
| `779305542` | 270 | 6.43 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `779335761` | 306 | 9.90 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `779362894` | 252 | 12.70 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `779418025` | 4 | 4.00 | `SCORED` | **REFER** | C | 62.3 | 0.00 | `layer_3/band_table` |
| `779465015` | 4 | 50.00 | `SCORED` | **REFER** | C | 59.5 | 0.00 | `layer_3/band_table` |
| `779525376` | 9 | 29.00 | `SCORED` | **REFER** | C | 56.0 | 0.00 | `layer_3/band_table` |
| `779569352` | 594 | 6.15 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `779617666` | 13 | 8.00 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `779667141` | 504 | 15.54 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `779738230` | 4 | 18.00 | `SCORED` | **REFER** | — | — | — | `layer_2/pre_application_inflow_spike` |
| `779805865` | 3 | 14.30 | `SCORED` | **DECLINE** | B | 79.6 | 0.00 | `layer_4/income_stability_requirement` |
| `779859953` | 42 | 19.92 | `SCORED` | **DECLINE** | B | 70.1 | 0.00 | `layer_5/minimum_viable_limit` |
| `779951221` | 60 | 40.00 | `SCORED` | **REFER** | — | — | — | `layer_2/application_velocity` |
| `779995333` | 38 | 3.23 | `SCORED` | **REFER** | C | 58.5 | 0.00 | `layer_3/band_table` |
| `780124081` | 36 | 17.15 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `780254108` | 10 | 21.00 | `SCORED` | **DECLINE** | A | 85.2 | 0.00 | `layer_5/minimum_viable_limit` |
| `780521540` | 414 | 15.31 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `780619407` | 108 | 18.99 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `780889688` | 20 | 10.00 | `SCORED` | **DECLINE** | B | 82.0 | 0.00 | `layer_4/income_stability_requirement` |
| `781157021` | 5 | 13.60 | `SCORED` | **REFER** | C | 57.2 | 0.00 | `layer_3/band_table` |
| `781258197` | 13 | 0.50 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `781328632` | 54 | 10.82 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `781623340` | 86 | 29.96 | `SCORED` | **DECLINE** | — | — | — | `layer_1/concurrent_loan_cap` |
| `781824176` | 146 | 20.99 | `SCORED` | **DECLINE** | — | — | — | `layer_1/concurrent_loan_cap` |
| `782089782` | 20 | 17.54 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `782135497` | 36 | 2.01 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/maximum_age_at_maturity` |
| `782205004` | 5 | 4.90 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `782268105` | 144 | 14.07 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `782324918` | 576 | 0.70 | `THIN_FILE` | **REFER** | — | — | — | `layer_2/application_velocity` |
| `782386112` | 324 | 1.37 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `782429918` | 432 | 0.97 | `NO_FILE` | **DECLINE** | — | — | 7.98 | `layer_5/minimum_viable_limit` |
| `782486675` | 36 | 4.14 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `782563989` | 41 | 89.00 | `SCORED` | **REFER** | C | 53.3 | 1.89 | `layer_3/band_table` |
| `782631183` | 3 | 5.00 | `SCORED` | **REFER** | C | 57.6 | 0.00 | `layer_3/band_table` |
| `782665277` | 87 | 3.49 | `SCORED` | **REFER** | — | — | — | `layer_2/application_velocity` |
| `782779010` | 16 | 72.00 | `SCORED` | **REFER** | C | 55.2 | 0.00 | `layer_3/band_table` |
| `782854773` | 28 | 97.71 | `SCORED` | **REFER** | — | — | — | `layer_2/application_velocity` |
| `782918859` | 45 | 98.00 | `SCORED` | **DECLINE** | B | 73.8 | 0.00 | `layer_5/minimum_viable_limit` |
| `782987516` | 2 | 14.00 | `SCORED` | **DECLINE** | B | 71.5 | 0.00 | `layer_5/minimum_viable_limit` |
| `783026053` | 69 | 3.00 | `SCORED` | **DECLINE** | A | 94.4 | 0.00 | `layer_5/minimum_viable_limit` |
| `783117765` | 30 | 27.50 | `SCORED` | **DECLINE** | — | — | — | `layer_1/concurrent_loan_cap` |
| `783190998` | 8 | 71.00 | `SCORED` | **REFER** | C | 55.4 | 0.00 | `layer_3/band_table` |
| `783317595` | 126 | 16.92 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `783374170` | 71 | 70.00 | `SCORED` | **REFER** | C | 69.0 | 0.00 | `layer_3/band_table` |
| `783434150` | 22 | 55.00 | `SCORED` | **REFER** | C | 56.6 | 0.00 | `layer_3/band_table` |
| `783476504` | 270 | 15.36 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `783528906` | 10 | 3.02 | `SCORED` | **REFER** | C | 69.6 | 0.00 | `layer_3/band_table` |
| `783613846` | 13 | 24.00 | `SCORED` | **REFER** | C | 55.8 | 0.00 | `layer_3/band_table` |
| `783665378` | 29 | 90.00 | `SCORED` | **DECLINE** | B | 78.7 | 0.00 | `layer_5/minimum_viable_limit` |
| `783727600` | 5 | 95.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/income_stability_requirement` |
| `783774950` | 126 | 0.07 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `783846520` | 108 | 4.82 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `783882655` | 9 | 4.00 | `SCORED` | **DECLINE** | B | 77.0 | 0.00 | `layer_5/minimum_viable_limit` |
| `783951165` | 53 | 10.00 | `SCORED` | **REFER** | C | 58.7 | 0.00 | `layer_3/band_table` |
| `784116454` | 47 | 90.00 | `SCORED` | **REFER** | C | 65.5 | 0.00 | `layer_3/band_table` |
| `784226077` | 70 | 77.17 | `SCORED` | **REFER** | C | 53.7 | 0.00 | `layer_3/band_table` |
| `784306049` | 50 | 89.00 | `SCORED` | **REFER** | C | 68.3 | 0.00 | `layer_3/band_table` |
| `784395301` | 511 | 7.05 | `THIN_FILE` | **DECLINE** | — | — | 12.76 | `layer_5/minimum_viable_limit` |
| `784484056` | 60 | 97.00 | `SCORED` | **DECLINE** | A | 86.8 | 0.00 | `layer_5/minimum_viable_limit` |
| `784556835` | 144 | 6.18 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `784673616` | 28 | 1.00 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `784808882` | 53 | 29.87 | `SCORED` | **REFER** | D | 46.7 | 9.43 | `layer_3/band_table` |
| `784888826` | 1 | 14.85 | `SCORED` | **REFER** | — | — | — | `layer_2/pre_application_inflow_spike` |
| `784950274` | 252 | 16.02 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `785027227` | 6 | 40.00 | `SCORED` | **REFER** | C | 65.6 | 0.00 | `layer_3/band_table` |
| `785126983` | 52 | 17.80 | `SCORED` | **DECLINE** | — | — | — | `layer_1/concurrent_loan_cap` |
| `785204287` | 25 | 4.56 | `SCORED` | **DECLINE** | B | 72.7 | 0.00 | `layer_5/minimum_viable_limit` |
| `785271607` | 8 | 4.00 | `SCORED` | **REFER** | D | 49.7 | 0.00 | `layer_3/band_table` |
| `785348268` | 1 | 9.50 | `SCORED` | **REFER** | C | 56.0 | 0.00 | `layer_3/band_table` |

### OVERDUE

| MSISDN | Repays | Outstanding | Routing | Decision | Band | Score | Afford. | Binding constraint |
|---|---:|---:|---|---|---|---:|---:|---|
| `771000445` | 2 | 11.22 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `771060708` | 80 | 30.51 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `771115811` | 6 | 4.36 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `771174964` | 6 | 9.57 | `SCORED` | **REFER** | C | 53.4 | 0.00 | `layer_3/band_table` |
| `771222302` | 125 | 169.23 | `SCORED` | **REFER** | C | 63.4 | 50.56 | `layer_3/band_table` |
| `771257133` | 1 | 14.71 | — | **HTTP 404** | — | — | — | no loan_features rows |
| `771307615` | 4 | 13.41 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `771357446` | 2 | 4.01 | `SCORED` | **DECLINE** | B | 80.5 | 0.00 | `layer_4/minimum_monthly_income` |
| `771422366` | 1 | 10.80 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `771469261` | 124 | 19.00 | `SCORED` | **REFER** | — | — | — | `layer_2/pre_application_inflow_spike` |
| `771524431` | 3 | 6.95 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `771569156` | 5 | 14.79 | `SCORED` | **REFER** | C | 50.3 | 0.00 | `layer_3/band_table` |
| `771614477` | 5 | 14.13 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `771667970` | 11 | 8.75 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `771719794` | 3 | 32.58 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `771776473` | 1 | 4.89 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `771834712` | 3 | 9.87 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `771879128` | 5 | 15.17 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `771954803` | 14 | 19.59 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `772110382` | 6 | 14.24 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `772202584` | 9 | 19.86 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `772222429` | 42 | 490.92 | — | **HTTP 404** | — | — | — | no loan_features rows |
| `772244048` | 4 | 9.86 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `772273201` | 29 | 77.95 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `772300220` | 13 | 14.81 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `772327873` | 16 | 95.45 | `SCORED` | **REFER** | D | 47.3 | 0.00 | `layer_3/band_table` |
| `772355943` | 45 | 23.54 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/income_stability_requirement` |
| `772380630` | 10 | 97.11 | `SCORED` | **REFER** | C | 68.8 | 0.00 | `layer_3/band_table` |
| `772402968` | 1 | 13.52 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `772428807` | 5 | 99.78 | `SCORED` | **REFER** | D | 43.9 | 0.00 | `layer_3/band_table` |
| `772453609` | 45 | 21.16 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `772478377` | 35 | 13.84 | `SCORED` | **REFER** | C | 64.2 | 0.00 | `layer_3/band_table` |
| `772506657` | 20 | 4.90 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `772543074` | 10 | 14.90 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `772566733` | 11 | 18.44 | `SCORED` | **REFER** | C | 62.4 | 0.00 | `layer_3/band_table` |
| `772593327` | 25 | 10.23 | `THIN_FILE` | **REFER** | — | — | — | `layer_2/dormant_then_suddenly_active` |
| `772617575` | 11 | 99.76 | `SCORED` | **REFER** | C | 63.0 | 0.00 | `layer_3/band_table` |
| `772641365` | 16 | 14.86 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `772661814` | 86 | 28.97 | `SCORED` | **DECLINE** | — | — | — | `layer_1/concurrent_loan_cap` |
| `772684000` | 13 | 84.57 | `SCORED` | **REFER** | C | 66.3 | 0.00 | `layer_3/band_table` |
| `772701347` | 13 | 20.13 | `SCORED` | **REFER** | C | 51.7 | 20.60 | `layer_3/band_table` |
| `772725877` | 6 | 12.59 | `NO_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `772748565` | 35 | 12.95 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `772771570` | 24 | 59.88 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/income_stability_requirement` |
| `772802733` | 22 | 24.56 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `772832296` | 50 | 28.52 | `SCORED` | **REFER** | C | 66.1 | 0.00 | `layer_3/band_table` |
| `772858178` | 73 | 14.23 | `SCORED` | **REFER** | C | 63.1 | 0.00 | `layer_3/band_table` |
| `772879640` | 17 | 19.56 | `SCORED` | **DECLINE** | — | — | — | `layer_1/concurrent_loan_cap` |
| `772905000` | 13 | 25.92 | `SCORED` | **REFER** | D | 47.2 | 11.00 | `layer_3/band_table` |
| `772926158` | 7 | 92.76 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `772944768` | 5 | 9.45 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `772963877` | 53 | 3.81 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `772986983` | 13 | 95.92 | `SCORED` | **REFER** | D | 44.3 | 42.68 | `layer_3/band_table` |
| `773013785` | 60 | 27.98 | `SCORED` | **DECLINE** | A | 95.5 | 0.00 | `layer_5/minimum_viable_limit` |
| `773031310` | 10 | 4.75 | `SCORED` | **DECLINE** | B | 84.3 | 0.00 | `layer_4/income_stability_requirement` |
| `773048703` | 34 | 49.82 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `773068377` | 720 | 14.32 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `773095215` | 5 | 6.51 | `NO_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `773117549` | 22 | 18.82 | `SCORED` | **REFER** | C | 61.9 | 14.40 | `layer_3/band_table` |
| `773139923` | 40 | 10.29 | `SCORED` | **REFER** | D | 46.6 | 18.85 | `layer_3/band_table` |
| `773164346` | 10 | 4.76 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/income_stability_requirement` |
| `773189601` | 9 | 14.76 | `SCORED` | **REFER** | D | 47.4 | 0.00 | `layer_3/band_table` |
| `773210301` | 20 | 29.81 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `773230272` | 22 | 13.41 | `SCORED` | **DECLINE** | B | 74.3 | 0.00 | `layer_4/income_stability_requirement` |
| `773250669` | 15 | 6.61 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `773270178` | 41 | 14.70 | `SCORED` | **REFER** | C | 59.8 | 0.00 | `layer_3/band_table` |
| `773292742` | 14 | 12.57 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `773321038` | 2 | 12.08 | `THIN_FILE` | **REFER** | — | — | — | `layer_2/dormant_then_suddenly_active` |
| `773358392` | 150 | 56.00 | `SCORED` | **DECLINE** | A | 92.5 | 0.00 | `layer_4/income_stability_requirement` |
| `773379562` | 44 | 19.23 | `SCORED` | **REFER** | C | 56.9 | 0.00 | `layer_3/band_table` |
| `773403186` | 38 | 26.43 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `773426158` | 73 | 5.79 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `773447784` | 19 | 9.03 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `773468720` | 3 | 14.85 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `773492348` | 28 | 59.60 | `SCORED` | **REFER** | C | 53.4 | 0.00 | `layer_3/band_table` |
| `773518558` | 6 | 11.59 | `THIN_FILE` | **REFER** | — | — | — | `layer_2/pre_application_inflow_spike` |
| `773541145` | 17 | 29.81 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/income_stability_requirement` |
| `773560320` | 29 | 14.56 | `SCORED` | **DECLINE** | A | 92.9 | 0.00 | `layer_4/minimum_monthly_income` |
| `773584813` | 5 | 9.88 | `SCORED` | **REFER** | D | 45.1 | 0.00 | `layer_3/band_table` |
| `773607055` | 3 | 9.17 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `773627958` | 19 | 14.33 | `SCORED` | **REFER** | C | 58.6 | 0.00 | `layer_3/band_table` |
| `773650818` | 16 | 23.88 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `773674958` | 6 | 2.78 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `773699012` | 21 | 14.48 | `THIN_FILE` | **REFER** | — | — | — | `layer_2/dormant_then_suddenly_active` |
| `773722099` | 4 | 99.87 | `SCORED` | **REFER** | — | — | — | `layer_2/pre_application_inflow_spike` |
| `773745030` | 23 | 89.96 | `SCORED` | **DECLINE** | B | 82.8 | 0.00 | `layer_4/income_stability_requirement` |
| `773767900` | 60 | 21.59 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `773790910` | 25 | 1.96 | `SCORED` | **REFER** | C | 69.2 | 0.00 | `layer_3/band_table` |
| `773811455` | 25 | 9.61 | `SCORED` | **REFER** | D | 46.8 | 0.00 | `layer_3/band_table` |
| `773833520` | 28 | 25.55 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `773855540` | 5 | 4.11 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `773880444` | 38 | 21.87 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `773902481` | 5 | 4.46 | — | **HTTP 404** | — | — | — | no loan_features rows |
| `773922816` | 7 | 5.32 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `773949591` | 12 | 0.67 | `SCORED` | **REFER** | C | 69.4 | 0.00 | `layer_3/band_table` |
| `773973154` | 15 | 9.89 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `773995884` | 5 | 99.56 | `SCORED` | **REFER** | C | 59.6 | 0.00 | `layer_3/band_table` |
| `774022164` | 9 | 14.37 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `774050856` | 1 | 11.00 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `774074732` | 4 | 0.01 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `774101622` | 17 | 5.13 | `SCORED` | **REFER** | C | 54.6 | 0.00 | `layer_3/band_table` |
| `774132990` | 2 | 7.99 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `774162318` | 15 | 1.12 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `774190314` | 38 | 14.68 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `774222380` | 110 | 7.12 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `774237456` | 1 | 9.89 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `774280867` | 69 | 91.70 | `SCORED` | **DECLINE** | B | 70.6 | 0.00 | `layer_5/minimum_viable_limit` |
| `774315109` | 40 | 99.76 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `774349138` | 17 | 68.08 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `774383505` | 504 | 15.96 | `NO_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `774412821` | 26 | 0.01 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `774443280` | 15 | 29.80 | `SCORED` | **DECLINE** | B | 70.3 | 0.00 | `layer_4/income_stability_requirement` |
| `774474968` | 28 | 68.79 | `SCORED` | **REFER** | D | 49.0 | 0.00 | `layer_3/band_table` |
| `774507937` | 1 | 4.37 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `774539919` | 27 | 1.06 | `THIN_FILE` | **REFER** | — | — | — | `layer_2/application_velocity` |
| `774579663` | 1 | 3.38 | `SCORED` | **REFER** | C | 68.7 | 0.00 | `layer_3/band_table` |
| `774612331` | 407 | 0.50 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `774647581` | 11 | 89.28 | `SCORED` | **REFER** | C | 59.1 | 0.00 | `layer_3/band_table` |
| `774685535` | 13 | 14.41 | `SCORED` | **REFER** | C | 56.0 | 0.00 | `layer_3/band_table` |
| `774720719` | 1 | 17.03 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `774757580` | 11 | 0.84 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `774794424` | 11 | 15.18 | — | **HTTP 404** | — | — | — | no loan_features rows |
| `774833834` | 16 | 70.86 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `774864403` | 2 | 10.38 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `774901342` | 45 | 9.83 | `SCORED` | **REFER** | C | 66.2 | 0.00 | `layer_3/band_table` |
| `774948633` | 19 | 9.42 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `774988507` | 9 | 14.63 | `NO_FILE` | **DECLINE** | — | — | — | `layer_1/minimum_age` |
| `775023583` | 1 | 3.63 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `775059066` | 3 | 9.89 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/income_stability_requirement` |
| `775091760` | 4 | 9.61 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `775126954` | 46 | 29.58 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/income_stability_requirement` |
| `775159954` | 15 | 64.95 | `SCORED` | **REFER** | C | 54.3 | 0.00 | `layer_3/band_table` |
| `775192605` | 3 | 39.80 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `775229088` | 56 | 11.61 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `775267132` | 14 | 21.75 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `775313079` | 19 | 14.85 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `775356917` | 25 | 8.60 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `775394903` | 7 | 9.63 | `SCORED` | **REFER** | C | 56.5 | 0.00 | `layer_3/band_table` |
| `775438747` | 31 | 79.99 | `SCORED` | **REFER** | C | 66.5 | 0.00 | `layer_3/band_table` |
| `775485778` | 1 | 14.84 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `775527421` | 39 | 93.99 | `SCORED` | **REFER** | C | 54.7 | 0.00 | `layer_3/band_table` |
| `775568183` | 3 | 14.83 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/income_stability_requirement` |
| `775615142` | 4 | 15.10 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `775654264` | 8 | 15.00 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `775693336` | 463 | 19.78 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `775733924` | 1 | 4.90 | `NO_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `775771379` | 22 | 14.89 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `775807996` | 33 | 66.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `775851776` | 29 | 92.66 | `SCORED` | **REFER** | C | 64.4 | 0.00 | `layer_3/band_table` |
| `775890408` | 45 | 19.86 | `SCORED` | **DECLINE** | — | — | — | `layer_1/concurrent_loan_cap` |
| `775929482` | 810 | 5.42 | `NO_FILE` | **REFER** | — | — | — | `layer_2/application_velocity` |
| `775962008` | 19 | 24.71 | — | **HTTP 404** | — | — | — | no loan_features rows |
| `775997867` | 46 | 59.26 | `SCORED` | **REFER** | C | 52.8 | 0.00 | `layer_3/band_table` |
| `776037928` | 3 | 9.06 | — | **HTTP 404** | — | — | — | no loan_features rows |
| `776084534` | 30 | 23.86 | `SCORED` | **REFER** | C | 51.7 | 0.00 | `layer_3/band_table` |
| `776130446` | 17 | 22.00 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `776172510` | 21 | 4.40 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `776214448` | 4 | 99.37 | `SCORED` | **REFER** | C | 59.4 | 0.00 | `layer_3/band_table` |
| `776260432` | 45 | 73.58 | `SCORED` | **DECLINE** | A | 93.7 | 0.00 | `layer_5/minimum_viable_limit` |
| `776312844` | 1 | 12.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `776351967` | 18 | 23.18 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `776400984` | 17 | 63.89 | `SCORED` | **REFER** | D | 49.6 | 0.00 | `layer_3/band_table` |
| `776438051` | 2 | 13.97 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `776483563` | 12 | 4.48 | `SCORED` | **DECLINE** | B | 82.1 | 0.00 | `layer_5/minimum_viable_limit` |
| `776532491` | 6 | 49.65 | `SCORED` | **REFER** | C | 64.7 | 0.00 | `layer_3/band_table` |
| `776588153` | 14 | 12.72 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `776636358` | 36 | 12.05 | `SCORED` | **DECLINE** | — | — | — | `layer_1/concurrent_loan_cap` |
| `776682607` | 2 | 8.19 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `776733440` | 26 | 14.00 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `776781611` | 10 | 15.54 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `776830440` | 44 | 60.61 | `THIN_FILE` | **DECLINE** | — | — | 19.38 | `layer_5/minimum_viable_limit` |
| `776873453` | 4 | 13.65 | `NO_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `776914724` | 69 | 14.82 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `776966071` | 2 | 6.61 | — | **HTTP 404** | — | — | — | no loan_features rows |
| `777012691` | 11 | 9.82 | `THIN_FILE` | **REFER** | — | — | — | `layer_2/dormant_then_suddenly_active` |
| `777053899` | 20 | 5.83 | `SCORED` | **REFER** | C | 54.1 | 0.00 | `layer_3/band_table` |
| `777093330` | 80 | 29.43 | `SCORED` | **DECLINE** | B | 76.7 | 0.00 | `layer_5/minimum_viable_limit` |
| `777137249` | 2 | 4.71 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `777179944` | 4 | 8.97 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `777222519` | 517 | 27.40 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `777275945` | 28 | 19.28 | `SCORED` | **REFER** | D | 49.7 | 0.00 | `layer_3/band_table` |
| `777327512` | 8 | 79.15 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `777376238` | 12 | 15.25 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `777427764` | 62 | 60.32 | `SCORED` | **REFER** | C | 56.7 | 0.00 | `layer_3/band_table` |
| `777478690` | 1 | 9.34 | `SCORED` | **REFER** | C | 68.7 | 0.00 | `layer_3/band_table` |
| `777519327` | 21 | 39.88 | `THIN_FILE` | **REFER** | — | — | — | `layer_2/pre_application_inflow_spike` |
| `777563118` | 16 | 3.89 | `SCORED` | **REFER** | D | 44.5 | 0.00 | `layer_3/band_table` |
| `777603657` | 11 | 12.66 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `777646839` | 7 | 14.29 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `777688688` | 2 | 4.12 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `777728308` | 16 | 14.65 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `777766208` | 5 | 98.19 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `777805210` | 10 | 13.66 | `THIN_FILE` | **REFER** | — | — | — | `layer_2/dormant_then_suddenly_active` |
| `777845704` | 71 | 29.80 | `SCORED` | **REFER** | C | 67.7 | 0.00 | `layer_3/band_table` |
| `777892009` | 24 | 98.78 | `SCORED` | **REFER** | — | — | — | `layer_2/pre_application_inflow_spike` |
| `777941192` | 2 | 17.91 | `THIN_FILE` | **REFER** | — | — | — | `layer_2/dormant_then_suddenly_active` |
| `777986028` | 1 | 14.81 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `778029348` | 10 | 9.80 | `SCORED` | **DECLINE** | A | 85.4 | 0.00 | `layer_4/income_stability_requirement` |
| `778071196` | 6 | 4.65 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `778122514` | 11 | 12.56 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `778182909` | 9 | 4.02 | `THIN_FILE` | **REFER** | — | — | — | `layer_2/dormant_then_suddenly_active` |
| `778235106` | 7 | 6.22 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `778281975` | 35 | 9.72 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `778332882` | 1 | 14.90 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `778393697` | 4 | 4.35 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `778450577` | 7 | 4.84 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/income_stability_requirement` |
| `778508175` | 21 | 51.40 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `778567895` | 1 | 9.59 | `SCORED` | **REFER** | C | 57.5 | 0.00 | `layer_3/band_table` |
| `778636943` | 63 | 5.55 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `778700354` | 540 | 16.06 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `778773796` | 5 | 4.85 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `778838415` | 8 | 23.44 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/income_stability_requirement` |
| `778897217` | 7 | 7.77 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `778941687` | 23 | 9.66 | `SCORED` | **REFER** | — | — | — | `layer_2/dormant_then_suddenly_active` |
| `779006881` | 21 | 0.89 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `779064668` | 50 | 14.34 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/income_stability_requirement` |
| `779114913` | 1 | 14.88 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `779161424` | 2 | 14.65 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `779210124` | 1 | 14.34 | — | **HTTP 404** | — | — | — | no loan_features rows |
| `779249983` | 3 | 4.46 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `779302459` | 40 | 88.46 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `779355058` | 28 | 0.02 | `NO_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `779406734` | 1 | 9.86 | — | **HTTP 404** | — | — | — | no loan_features rows |
| `779466631` | 2 | 10.76 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `779508867` | 2 | 13.76 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `779555058` | 2 | 13.60 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `779615529` | 37 | 90.72 | `SCORED` | **REFER** | D | 40.3 | 58.21 | `layer_3/band_table` |
| `779665071` | 1 | 12.86 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `779720128` | 3 | 14.59 | — | **HTTP 404** | — | — | — | no loan_features rows |
| `779779783` | 1 | 4.35 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/income_stability_requirement` |
| `779846355` | 8 | 13.16 | `SCORED` | **REFER** | C | 69.5 | 0.00 | `layer_3/band_table` |
| `779906285` | 9 | 18.79 | `SCORED` | **DECLINE** | — | — | — | `layer_1/concurrent_loan_cap` |
| `779963686` | 18 | 29.16 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/income_stability_requirement` |
| `780045122` | 1 | 14.31 | `THIN_FILE` | **DECLINE** | — | — | 4.39 | `layer_5/minimum_viable_limit` |
| `780188603` | 4 | 4.90 | `SCORED` | **DECLINE** | B | 76.0 | 0.00 | `layer_4/minimum_monthly_income` |
| `780378541` | 33 | 99.16 | `SCORED` | **REFER** | C | 50.7 | 0.00 | `layer_3/band_table` |
| `780533431` | 13 | 97.80 | `SCORED` | **REFER** | C | 52.0 | 0.00 | `layer_3/band_table` |
| `780644832` | 1 | 9.00 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `780768140` | 5 | 6.74 | — | **HTTP 404** | — | — | — | no loan_features rows |
| `780876999` | 14 | 9.86 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `781011365` | 1 | 4.86 | `THIN_FILE` | **REFER** | — | — | — | `layer_2/dormant_then_suddenly_active` |
| `781194055` | 8 | 88.85 | `SCORED` | **REFER** | D | 46.2 | 0.00 | `layer_3/band_table` |
| `781406806` | 8 | 14.11 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `781584221` | 15 | 14.81 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `781845422` | 32 | 63.49 | `THIN_FILE` | **REFER** | — | — | — | `layer_2/dormant_then_suddenly_active` |
| `782006600` | 8 | 24.14 | `SCORED` | **REFER** | D | 42.7 | 0.00 | `layer_3/band_table` |
| `782067119` | 522 | 16.34 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `782131407` | 36 | 19.79 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `782185442` | 38 | 29.66 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `782237434` | 1 | 14.53 | — | **HTTP 404** | — | — | — | no loan_features rows |
| `782292055` | 10 | 3.73 | `SCORED` | **REFER** | C | 69.6 | 0.00 | `layer_3/band_table` |
| `782351806` | 1 | 4.48 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `782402011` | 17 | 15.21 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `782466619` | 5 | 5.99 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `782518493` | 6 | 7.88 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `782577621` | 6 | 11.30 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `782636842` | 20 | 94.80 | `SCORED` | **REFER** | C | 57.0 | 0.00 | `layer_3/band_table` |
| `782698453` | 20 | 16.11 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `782818253` | 2 | 9.64 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `782875225` | 14 | 26.52 | `SCORED` | **REFER** | C | 62.1 | 0.00 | `layer_3/band_table` |
| `782933769` | 4 | 87.99 | `SCORED` | **DECLINE** | B | 73.2 | 0.00 | `layer_4/income_stability_requirement` |
| `783005721` | 11 | 14.76 | `SCORED` | **REFER** | — | — | — | `layer_2/pre_application_inflow_spike` |
| `783063670` | 1 | 14.73 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `783133757` | 16 | 29.74 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/income_stability_requirement` |
| `783196063` | 12 | 9.73 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `783249925` | 10 | 14.50 | `SCORED` | **DECLINE** | B | 73.5 | 0.00 | `layer_5/minimum_viable_limit` |
| `783314142` | 14 | 94.42 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `783372163` | 2 | 14.78 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `783424037` | 14 | 6.60 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `783484116` | 5 | 99.43 | `SCORED` | **REFER** | C | 59.5 | 0.00 | `layer_3/band_table` |
| `783550060` | 21 | 3.53 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/income_stability_requirement` |
| `783613551` | 67 | 81.93 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `783666627` | 3 | 0.26 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `783719716` | 29 | 42.35 | `SCORED` | **REFER** | D | 43.9 | 0.00 | `layer_3/band_table` |
| `783779438` | 17 | 14.82 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `783839517` | 20 | 10.00 | `SCORED` | **REFER** | — | — | — | `layer_2/application_velocity` |
| `783900577` | 1 | 10.73 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `783966325` | 4 | 9.59 | `THIN_FILE` | **REFER** | — | — | — | `layer_2/dormant_then_suddenly_active` |
| `784026916` | 53 | 9.05 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `784095073` | 38 | 29.25 | `SCORED` | **DECLINE** | A | 86.1 | 0.00 | `layer_4/income_stability_requirement` |
| `784168427` | 18 | 38.68 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `784235024` | 1 | 4.40 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `784310091` | 41 | 0.27 | `SCORED` | **REFER** | C | 69.1 | 0.00 | `layer_3/band_table` |
| `784399202` | 1 | 14.88 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `784469506` | 3 | 2.22 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `784530201` | 42 | 76.35 | `SCORED` | **REFER** | — | — | — | `layer_2/dormant_then_suddenly_active` |
| `784597113` | 3 | 9.74 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `784665342` | 53 | 14.56 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `784743143` | 17 | 4.65 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `784810432` | 11 | 14.90 | `SCORED` | **REFER** | C | 55.3 | 0.00 | `layer_3/band_table` |
| `784895898` | 23 | 99.83 | `SCORED` | **REFER** | C | 63.7 | 19.72 | `layer_3/band_table` |
| `784968639` | 15 | 29.88 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `785037928` | 4 | 10.77 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `785112988` | 1 | 14.89 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `785172283` | 10 | 99.90 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `785231719` | 8 | 15.86 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `785307606` | 2 | 0.51 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `785392498` | 8 | 94.87 | `SCORED` | **DECLINE** | B | 79.0 | 0.00 | `layer_4/income_stability_requirement` |
| `785469334` | 17 | 4.06 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `785533006` | 69 | 27.70 | `SCORED` | **REFER** | C | 57.4 | 0.00 | `layer_3/band_table` |
| `785595353` | 5 | 4.15 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `785664421` | 4 | 5.02 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `785743595` | 1 | 4.90 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `785817396` | 31 | 73.62 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `785889593` | 19 | 6.19 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `785962107` | 24 | 12.06 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `786036016` | 76 | 67.23 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `786141525` | 3 | 7.14 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `786237447` | 53 | 29.14 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `786332352` | 576 | 15.87 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `786423054` | 4 | 14.75 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `786520881` | 2 | 5.99 | `NO_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `786615140` | 1 | 9.72 | `THIN_FILE` | **REFER** | — | — | — | `layer_2/dormant_then_suddenly_active` |
| `786712229` | 48 | 98.09 | `SCORED` | **REFER** | D | 42.8 | 0.00 | `layer_3/band_table` |
| `786822791` | 3 | 99.62 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/income_stability_requirement` |
| `786948718` | 3 | 4.16 | `NO_FILE` | **DECLINE** | — | — | 0.00 | `layer_5/minimum_viable_limit` |
| `787068689` | 1 | 9.50 | `SCORED` | **REFER** | C | 55.5 | 0.00 | `layer_3/band_table` |
| `787216104` | 4 | 10.90 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `787350406` | 26 | 95.42 | `SCORED` | **REFER** | D | 49.1 | 0.00 | `layer_3/band_table` |
| `787450620` | 9 | 68.67 | `SCORED` | **DECLINE** | A | 93.7 | 0.00 | `layer_4/income_stability_requirement` |
| `787584876` | 1 | 14.24 | `THIN_FILE` | **REFER** | — | — | — | `layer_2/dormant_then_suddenly_active` |
| `787722223` | 5 | 1.57 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `787832249` | 9 | 4.74 | `THIN_FILE` | **DECLINE** | — | — | 0.00 | `layer_4/minimum_monthly_income` |
| `787951856` | 1 | 6.59 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `788092014` | 2 | 13.77 | `THIN_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `788211810` | 1 | 4.38 | `SCORED` | **DECLINE** | A | 85.7 | 0.00 | `layer_4/minimum_monthly_income` |
| `788320804` | 8 | 99.06 | `SCORED` | **DECLINE** | B | 72.1 | 0.00 | `layer_4/income_stability_requirement` |
| `788491347` | 11 | 3.49 | — | **HTTP 404** | — | — | — | no loan_features rows |
| `788608116` | 33 | 99.82 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |
| `788743916` | 26 | 17.89 | `SCORED` | **REFER** | — | — | — | `layer_2/pre_application_inflow_spike` |
| `788861308` | 4 | 10.36 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `788981614` | 3 | 10.21 | `NO_FILE` | **DECLINE** | — | — | — | `layer_4/minimum_monthly_income` |
| `789222967` | 20 | 14.84 | `SCORED` | **DECLINE** | — | — | — | `layer_1/prior_default_lookback` |

