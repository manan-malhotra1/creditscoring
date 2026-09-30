# Ecocash Rule Engine — decision outcomes for 30 MSISDNs with known repayment history

Run on **2026-09-29** against staging, tenant `legacy`, product `device_financing`.

Every MSISDN in this report is a real borrower drawn from `Arttha_RepaymentsNOTTO_MTD_2026_Jul_23.csv.filepart` — 7,527,006 repayment rows covering 230,304 unique mobile numbers, spanning 2023-11-15 to 2026-07-22. The point of the exercise is to put customers whose actual repayment behaviour is already known through the engine and see what it decides.

## What was sent

Identical request for every customer, so the only variable is the customer:

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

`POST /decisions`, then `GET /decisions/{decisionId}/trace` for each. The MSISDN is passed straight through as `customerId` — the repayment file's `mobilenumber` is already in the 9-digit form the engine expects.

## How the 30 were chosen

The file is sorted newest-first by `paid_on` (verified: zero ascending violations across all 7.5M rows), so the first row per mobile number is that customer's most recent repayment. Customers were grouped on their latest `outstandingamount` and `loan_expiry_date` against the 23 Jul 2026 extract date, then sampled evenly within each group:

| Repayment outcome | Meaning | In file | Sampled |
|---|---|---|---|
| `SETTLED` | latest outstanding = 0 | 176,198 | 10 |
| `OVERDUE` | outstanding > 0, term already expired | 51,574 | 10 |
| `ON_TERM` | outstanding > 0, still within term | 2,532 | 10 |

> **Caveat on timing.** The repayment data ends 22 Jul 2026; these decisions were taken 29 Sep 2026. A customer marked `OVERDUE` here may well have repaid in the ten weeks since, and the engine sees the live feature store, not this file. Treat the grouping as context for reading the decisions, not as ground truth to score the engine against.

## Results at a glance

**29 of 30 assessed successfully. Zero approvals.**

| Decision | Count | | Routing | Count |
|---|---:|---|---|---:|
| `DECLINE` | 20 | | `SCORED` | 14 |
| `REFER` | 9 | | `THIN_FILE` | 8 |
|  |  | | `NO_FILE` | 7 |

| MSISDN | Repayment outcome | Repays | Outstanding | Routing | Decision | Band | Score | Binding constraint |
|---|---|---:|---:|---|---|---|---:|---|
| `771024712` | ON_TERM | 19 | 99.99 | `SCORED` | **DECLINE** | B | 82.49 | `layer_5` / `minimum_viable_limit` |
| `772482358` | ON_TERM | 576 | 16.99 | `NO_FILE` | **DECLINE** | — | — | `layer_4` / `minimum_monthly_income` |
| `773154836` | ON_TERM | 28 | 85.00 | `SCORED` | **REFER** | C | 63.83 | `layer_3` / `band_table` |
| `773768824` | ON_TERM | 16 | 1.00 | `SCORED` | **DECLINE** | B | 82.41 | `layer_5` / `minimum_viable_limit` |
| `774540383` | ON_TERM | 216 | 16.73 | `NO_FILE` | **DECLINE** | — | — | `layer_4` / `minimum_monthly_income` |
| `775727645` | ON_TERM | 211 | 4.15 | `SCORED` | **DECLINE** | — | — | `layer_1` / `prior_default_lookback` |
| `777222823` | ON_TERM | 280 | 66.66 | `THIN_FILE` | **REFER** | — | — | `layer_2` / `minimum_account_age` |
| `778802436` | ON_TERM | 17 | 96.00 | `SCORED` | **REFER** | C | 54.04 | `layer_3` / `band_table` |
| `782059468` | ON_TERM | 144 | 5.94 | `THIN_FILE` | **DECLINE** | — | — | `layer_5` / `minimum_viable_limit` |
| `784671885` | ON_TERM | 90 | 16.79 | `NO_FILE` | **DECLINE** | — | — | `layer_5` / `minimum_viable_limit` |
| `771000482` | SETTLED | 41 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | `layer_4` / `minimum_monthly_income` |
| `772467405` | SETTLED | 3 | 0.00 | `NO_FILE` | **DECLINE** | — | — | `layer_4` / `minimum_monthly_income` |
| `773045928` | SETTLED | 11 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | `layer_1` / `prior_default_lookback` |
| `773676156` | SETTLED | 12 | 0.00 | `SCORED` | **DECLINE** | B | 71.64 | `layer_4` / `income_stability_requirement` |
| `774472150` | SETTLED | 14 | 0.00 | `SCORED` | **REFER** | C | 60.01 | `layer_3` / `band_table` |
| `775651985` | SETTLED | 38 | 0.00 | `SCORED` | **REFER** | C | 63.15 | `layer_3` / `band_table` |
| `777113504` | SETTLED | 1 | 0.00 | `NO_FILE` | **DECLINE** | — | — | `layer_4` / `minimum_monthly_income` |
| `778824243` | SETTLED | 15 | 0.00 | `SCORED` | **DECLINE** | — | — | `layer_1` / `prior_default_lookback` |
| `782318953` | SETTLED | 434 | 0.00 | `NO_FILE` | **DECLINE** | — | — | `layer_5` / `minimum_viable_limit` |
| `784871370` | SETTLED | 23 | 0.00 | `THIN_FILE` | **DECLINE** | — | — | `layer_4` / `minimum_monthly_income` |
| `771000278` | OVERDUE | 46 | 27.71 | `THIN_FILE` | **DECLINE** | — | — | `layer_4` / `income_stability_requirement` |
| `772552692` | OVERDUE | 30 | 82.26 | `SCORED` | **REFER** | C | 57.40 | `layer_3` / `band_table` |
| `773318248` | OVERDUE | 23 | 13.50 | `THIN_FILE` | **DECLINE** | — | — | `layer_4` / `minimum_monthly_income` |
| `774115750` | OVERDUE | 42 | 29.80 | `SCORED` | **REFER** | C | 67.08 | `layer_3` / `band_table` |
| `775265032` | OVERDUE | 21 | 65.57 | `THIN_FILE` | **DECLINE** | — | — | `layer_4` / `minimum_monthly_income` |
| `776697600` | OVERDUE | 9 | 98.59 | `SCORED` | **REFER** | C | 67.52 | `layer_3` / `band_table` |
| `778227703` | OVERDUE | 27 | 29.38 | `SCORED` | **DECLINE** | — | — | `layer_1` / `prior_default_lookback` |
| `780256026` | OVERDUE | 10 | 4.18 | `NO_FILE` | **DECLINE** | — | — | `layer_4` / `minimum_monthly_income` |
| `783416969` | OVERDUE | 9 | 0.01 | — | **HTTP 404** | — | — | No loan_features rows found for customer_key 783416969 |
| `785689408` | OVERDUE | 8 | 4.28 | `SCORED` | **REFER** | C | 55.95 | `layer_3` / `band_table` |

## Findings

### 1. Nothing was approved, and affordability is the reason

Not one of the 29 successful assessments produced an approval — 20 `DECLINE`, 9 `REFER`. The scores themselves are not the problem: three customers scored into band B (82.49, 82.41, 71.64), which `band_table` maps to `decision: approve`. They were declined anyway, downstream of banding.

The traces show where. Of the customers who reached an affordability computation at all, **every one but a single customer came out at `affordabilityLimit: 0`**, and the arithmetic in layer 4 is consistent across all of them:

```
affordabilityLimit  =  min( instalment_to_income_cap (25%) x monthlyIncome,
                            monthlyIncome - net_disposable_income_floor (50) - existing obligations )

Below an income of 66.67 the NDI floor is the binding term, above it the 25% cap is.
Every customer in this 30-sample sat below 66.67, so only the NDI term shows here.

771024712   income 28.07  ->  0        (28.07 - 50 is negative)
773768824   income 26.74  ->  0
782059468   income 30.72  ->  0
784671885   income 27.31  ->  0
782318953   income 62.67  ->  12.67    (62.67 - 50, exactly)
```

Then layer 5 rejects what survives, because `minimumViableLimit` is 30:

```json
{
  "rounded": 0,
  "declined": true,
  "rawLimit": 0,
  "bindingCap": "layer_4.affordability_limit",
  "minimumViableLimit": 30
}
```

So the gate is effectively **monthly income ≥ 80** (the 50 floor plus the 30 minimum viable limit) before any loan can be written at all. Every customer who got an income figure at all got it from `BALANCE_PROXY` — not one produced `DERIVED` income — and on this population the proxy returns 25–63. The single highest earner in the sample, at 62.67, still fell 17.33 short.

`instalment_to_income_cap` (25%) never bound in this sample — the one customer with a positive affordability limit came in at 20.2%. In the 1,000-customer follow-up it binds for every customer earning above 66.67. See `2026-09-29-msisdn-decision-report-1000.md`.

### 2. The balance proxy compresses everyone into a narrow band just under the threshold

`minimum_monthly_income` is 26.59. Observed proxy incomes: 25.15, 25.28, 25.99, 25.93, 26.74, 27.31, 28.07, 30.72, 33.05, 35.08, 62.67. Four of those miss the threshold by less than 1.50 and are declined outright at layer 4 with `Monthly income below minimum_monthly_income`.

This is what `balance_proxy_intercept = 25` and `balance_proxy_coefficient = 0.5` produce when wallet balances are small: income ≈ 25 + half the balance, so the whole population piles up just above 25, straddling a 26.59 cutoff. The cutoff is deciding these cases, but it is separating customers by a couple of dollars of wallet balance rather than by anything that looks like capacity to repay.

### 3. Customers with hundreds of repayments are routed `NO_FILE`

15 of 29 were routed `NO_FILE` (7) or `THIN_FILE` (8) — meaning the feature store has little or nothing on them — even though the repayment file shows substantial history:

| MSISDN | Repayments in file | Total repaid | Routing |
|---|---:|---:|---|
| `772482358` | 576 | 4179.96 | `NO_FILE` |
| `774540383` | 216 | 2243.34 | `NO_FILE` |
| `777222823` | 280 | 9320.37 | `THIN_FILE` |
| `782059468` | 144 | 529.38 | `THIN_FILE` |
| `784671885` | 90 | 970.02 | `NO_FILE` |
| `771000482` | 41 | 141.69 | `THIN_FILE` |
| `782318953` | 434 | 4363.44 | `NO_FILE` |
| `784871370` | 23 | 120.02 | `THIN_FILE` |
| `771000278` | 46 | 376.07 | `THIN_FILE` |
| `773318248` | 23 | 108.11 | `THIN_FILE` |
| `775265032` | 21 | 132.49 | `THIN_FILE` |

`772482358` has **576 repayments totalling 4,179.96** in this file and is still routed `NO_FILE`. `782318953` has 434 repayments totalling 4,363.44, also `NO_FILE`. Whatever feeds `loan_features` is not seeing the Arttha repayment history for these customers.

One MSISDN returned **404** rather than a decision:

```json
{
  "message": "No loan_features rows found for customer_key 783416969",
  "error": "Not Found",
  "statusCode": 404
}
```

A customer absent from the feature store gets an HTTP error instead of a `NO_FILE` decision. That is an inconsistency worth a decision: either absence is a 404, or it is the thing `NO_FILE` routing exists to handle — it should not be both.

### 4. `prior_default_lookback` knocked out five customers, and its units disagree

Five customers never reached scoring because layer 1 knocked them out on `prior_default_lookback`. The condition reads `{"months": 1}` while the observed values are 9, 25, 26 and 28 — and a customer observed at 63 passed. The observed figure is evidently **days** since the prior default, compared against a threshold expressed in **months**.

The behaviour is correct (9–28 days is inside a one-month window; 63 days is outside), but condition and observation are in different units in the same trace record, which makes the trace read as though a 26-month-old default were being treated as recent.

### 5. `layer_5` runs but is invisible in the rule frame

`GET /rule-versions/frame` returns seven layers — 0, 1, 2, 3, 3a, 4, 6 — with no `layer_5`. Yet layer 5 is the binding constraint on the highest-scoring customers in this sample, and it appears in the traces with its own parameters (`minimumViableLimit`, rounding). Its rules cannot be read or edited through the frame endpoint, so the parameter that is currently blocking every approval is not visible where all the others are.

### 6. Repayment history and engine outcome are close to unrelated here

| Repayment outcome | DECLINE | REFER | APPROVE |
|---|---:|---:|---:|
| SETTLED | 8 | 2 | 0 |
| ON_TERM | 7 | 3 | 0 |
| OVERDUE | 5 | 4 | 0 |

Customers who repaid in full are declined at much the same rate as customers who went overdue. That is the expected consequence of findings 1–3: the outcome is being set by an income proxy and a fixed floor, before repayment behaviour gets a meaningful say. It is not evidence that the model ranks badly — the model's scores were never allowed to matter.

---

## Exact API output, per MSISDN

Verbatim `POST /decisions` response bodies. Full traces for all 30 are in `reports/2026-09-29-msisdn-results.json`.

### SETTLED

#### `771000482`

Repayment history in file: **41 repayments**, 141.69 repaid, principal 10.00, outstanding 0.00, last paid 2026-05-06 07:47:12.815, expiry 2026-04-11 00:00:00, mode `CUSTOMER_CREDIT_EVENT`.

HTTP 201 in 972ms. Trace layers: `layer_0` -> `layer_1` -> `layer_2` -> `layer_3a` -> `layer_4`.

```json
{
  "tenantId": "legacy",
  "requestId": "10397126-930c-4f4b-8f37-60e8bb923dc1",
  "decisionId": "438532dc-cfb5-4147-80fc-74d13fdeeca3",
  "customerId": "771000482",
  "decision": "DECLINE",
  "routing": "THIN_FILE",
  "scoreSource": "SCORECARD",
  "score": null,
  "band": null,
  "approvedLimit": null,
  "tenure": null,
  "deposit": null,
  "instalment": null,
  "affordabilityLimit": 0,
  "incomeBasis": "BALANCE_PROXY",
  "incomeConfidence": null,
  "predictedConfidenceScore": 67.29813515986211,
  "predictedConfidenceBand": "C",
  "modelVersion": "CatBoost_V01_08092026",
  "topFeaturesAffectingScore": "[{\"feature\": \"transaction_consistency_score\", \"impact\": \"INCREASES\", \"shap_value\": 7.1498}, {\"feature\": \"expense_score\", \"impact\": \"INCREASES\", \"shap_value\": 6.5021}, {\"feature\": \"activity_score\", \"impact\": \"DECREASES\", \"shap_value\": -5.4035}, {\"feature\": \"cashflow_score\", \"impact\": \"INCREASES\", \"shap_value\": 3.3891}, {\"feature\": \"cashflow_retention_score\", \"impact\": \"INCREASES\", \"shap_value\": 2.6836}]",
  "bindingConstraint": {
    "layer": "layer_4",
    "parameterKey": "minimum_monthly_income",
    "description": "Monthly income below minimum_monthly_income"
  },
  "capsApplied": [],
  "reasonCodes": [
    {
      "code": "layer_4.minimum_monthly_income",
      "layer": "layer_4",
      "description": "Monthly income below minimum_monthly_income",
      "rank": 1
    }
  ],
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
  "timestamp": "2026-09-29T05:43:47.164Z"
}
```

<details><summary>Layer trace outcomes</summary>

```json
[
  {
    "layer": "layer_0",
    "sequence": 1,
    "outcome": {
      "route": "THIN_FILE",
      "repeatPath": false,
      "routeReason": "sufficiency_partial",
      "sufficiencyFailures": [
        "transaction_history"
      ]
    }
  },
  {
    "layer": "layer_1",
    "sequence": 2,
    "outcome": {
      "passed": true
    }
  },
  {
    "layer": "layer_2",
    "sequence": 3,
    "outcome": {
      "firedRuleKeys": []
    }
  },
  {
    "layer": "layer_3a",
    "sequence": 4,
    "outcome": {
      "route": "THIN_FILE",
      "reason": "scorecard not configured (no bucket boundaries defined) \u2014 flat starter/ladder offer used",
      "offerLimit": 50,
      "scorecardConfigured": false
    }
  },
  {
    "layer": "layer_4",
    "sequence": 5,
    "outcome": {
      "reason": "Monthly income below minimum_monthly_income",
      "declined": true,
      "monthlyIncome": 25.275
    }
  }
]
```

</details>

#### `772467405`

Repayment history in file: **3 repayments**, 10.00 repaid, principal 5.00, outstanding 0.00, last paid 2024-06-29 09:01:23.09, expiry 2024-05-29 00:00:00, mode `AUTO_REPAYMENT`.

HTTP 201 in 892ms. Trace layers: `layer_0` -> `layer_1` -> `layer_2` -> `layer_3a` -> `layer_4`.

```json
{
  "tenantId": "legacy",
  "requestId": "d4e09690-320b-4b56-9aae-d6925ea55869",
  "decisionId": "5437835a-ef7d-4fc4-a18c-3a8efce55ec9",
  "customerId": "772467405",
  "decision": "DECLINE",
  "routing": "NO_FILE",
  "scoreSource": "SCORECARD",
  "score": null,
  "band": null,
  "approvedLimit": null,
  "tenure": null,
  "deposit": null,
  "instalment": null,
  "affordabilityLimit": null,
  "incomeBasis": null,
  "incomeConfidence": null,
  "predictedConfidenceScore": 23.49399949276137,
  "predictedConfidenceBand": "E",
  "modelVersion": "CatBoost_V01_08092026",
  "topFeaturesAffectingScore": "[{\"feature\": \"activity_score\", \"impact\": \"DECREASES\", \"shap_value\": -5.8608}, {\"feature\": \"income_stability_score\", \"impact\": \"DECREASES\", \"shap_value\": -4.9244}, {\"feature\": \"transaction_consistency_score\", \"impact\": \"DECREASES\", \"shap_value\": -4.6145}, {\"feature\": \"expense_to_income_ratio_90d\", \"impact\": \"INCREASES\", \"shap_value\": 4.1207}, {\"feature\": \"expense_score\", \"impact\": \"DECREASES\", \"shap_value\": -4.0783}]",
  "bindingConstraint": {
    "layer": "layer_4",
    "parameterKey": "minimum_monthly_income",
    "description": "No income figure available (neither DERIVED nor BALANCE_PROXY)"
  },
  "capsApplied": [],
  "reasonCodes": [
    {
      "code": "layer_4.minimum_monthly_income",
      "layer": "layer_4",
      "description": "No income figure available (neither DERIVED nor BALANCE_PROXY)",
      "rank": 1
    }
  ],
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
  "timestamp": "2026-09-29T05:43:48.590Z"
}
```

<details><summary>Layer trace outcomes</summary>

```json
[
  {
    "layer": "layer_0",
    "sequence": 1,
    "outcome": {
      "route": "NO_FILE",
      "repeatPath": false,
      "routeReason": "hard_floor_failed",
      "sufficiencyFailures": [
        "feature_completeness",
        "transaction_history"
      ]
    }
  },
  {
    "layer": "layer_1",
    "sequence": 2,
    "outcome": {
      "passed": true
    }
  },
  {
    "layer": "layer_2",
    "sequence": 3,
    "outcome": {
      "firedRuleKeys": []
    }
  },
  {
    "layer": "layer_3a",
    "sequence": 4,
    "outcome": {
      "route": "NO_FILE",
      "reason": "scorecard not configured (no bucket boundaries defined) \u2014 flat starter/ladder offer used",
      "offerLimit": 30,
      "scorecardConfigured": false
    }
  },
  {
    "layer": "layer_4",
    "sequence": 5,
    "outcome": {
      "reason": "No income figure available (neither DERIVED nor BALANCE_PROXY)",
      "declined": true,
      "minIncome": 26.59117934431525
    }
  }
]
```

</details>

#### `773045928`

Repayment history in file: **11 repayments**, 40.78 repaid, principal 10.00, outstanding 0.00, last paid 2025-10-27 13:08:50.564, expiry 2025-09-30 00:00:00, mode `CUSTOMER_CREDIT_EVENT`.

HTTP 201 in 806ms. Trace layers: `layer_0` -> `layer_1`.

```json
{
  "tenantId": "legacy",
  "requestId": "5d4e316c-c605-4e80-8a8b-4c9eab466bcb",
  "decisionId": "7d676a26-22ce-40e2-8d8c-cf1f06135c14",
  "customerId": "773045928",
  "decision": "DECLINE",
  "routing": "THIN_FILE",
  "scoreSource": null,
  "score": null,
  "band": null,
  "approvedLimit": null,
  "tenure": null,
  "deposit": null,
  "instalment": null,
  "affordabilityLimit": null,
  "incomeBasis": null,
  "incomeConfidence": null,
  "predictedConfidenceScore": 42.4973102278843,
  "predictedConfidenceBand": "D",
  "modelVersion": "CatBoost_V01_08092026",
  "topFeaturesAffectingScore": "[{\"feature\": \"income_stability_score\", \"impact\": \"DECREASES\", \"shap_value\": -6.0957}, {\"feature\": \"transaction_consistency_score\", \"impact\": \"INCREASES\", \"shap_value\": 4.6459}, {\"feature\": \"expense_score\", \"impact\": \"DECREASES\", \"shap_value\": -3.7199}, {\"feature\": \"activity_score\", \"impact\": \"DECREASES\", \"shap_value\": -2.239}, {\"feature\": \"cashflow_score\", \"impact\": \"DECREASES\", \"shap_value\": -1.7891}]",
  "bindingConstraint": {
    "layer": "layer_1",
    "parameterKey": "prior_default_lookback",
    "description": "Layer 1 knockout"
  },
  "capsApplied": [],
  "reasonCodes": [
    {
      "code": "layer_1.prior_default_lookback",
      "layer": "layer_1",
      "description": "Layer 1 knockout failed: prior_default_lookback",
      "rank": 1
    }
  ],
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
  "timestamp": "2026-09-29T05:43:50.147Z"
}
```

<details><summary>Layer trace outcomes</summary>

```json
[
  {
    "layer": "layer_0",
    "sequence": 1,
    "outcome": {
      "route": "THIN_FILE",
      "repeatPath": false,
      "routeReason": "sufficiency_partial",
      "sufficiencyFailures": [
        "transaction_history"
      ]
    }
  },
  {
    "layer": "layer_1",
    "sequence": 2,
    "outcome": {
      "passed": false,
      "failedRuleKey": "prior_default_lookback"
    }
  }
]
```

</details>

#### `773676156`

Repayment history in file: **12 repayments**, 70.60 repaid, principal 10.00, outstanding 0.00, last paid 2026-07-14 12:23:59.922, expiry 2026-07-10 00:00:00, mode `CUSTOMER_CREDIT_EVENT`.

HTTP 201 in 1151ms. Trace layers: `layer_0` -> `layer_1` -> `layer_2` -> `layer_3` -> `layer_4`.

```json
{
  "tenantId": "legacy",
  "requestId": "c2e5dd0b-27a8-4eab-96e8-bc4265a63e12",
  "decisionId": "91553779-32d8-455c-b8f8-8e534393a5b1",
  "customerId": "773676156",
  "decision": "DECLINE",
  "routing": "SCORED",
  "scoreSource": "MODEL",
  "score": 71.64290883713052,
  "band": "B",
  "approvedLimit": null,
  "tenure": null,
  "deposit": null,
  "instalment": null,
  "affordabilityLimit": 0,
  "incomeBasis": "BALANCE_PROXY",
  "incomeConfidence": null,
  "predictedConfidenceScore": 71.64290883713052,
  "predictedConfidenceBand": "B",
  "modelVersion": "CatBoost_V01_08092026",
  "topFeaturesAffectingScore": "[{\"feature\": \"income_stability_score\", \"impact\": \"DECREASES\", \"shap_value\": -6.579}, {\"feature\": \"transaction_consistency_score\", \"impact\": \"INCREASES\", \"shap_value\": 4.485}, {\"feature\": \"cashflow_score\", \"impact\": \"INCREASES\", \"shap_value\": 2.8725}, {\"feature\": \"expense_score\", \"impact\": \"INCREASES\", \"shap_value\": 2.8246}, {\"feature\": \"net_cashflow_ratio_90d\", \"impact\": \"INCREASES\", \"shap_value\": 1.959}]",
  "bindingConstraint": {
    "layer": "layer_4",
    "parameterKey": "income_stability_requirement",
    "description": "Income too volatile (income_stability_requirement)"
  },
  "capsApplied": [],
  "reasonCodes": [
    {
      "code": "layer_4.income_stability_requirement",
      "layer": "layer_4",
      "description": "Income too volatile (income_stability_requirement)",
      "rank": 1
    }
  ],
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
  "timestamp": "2026-09-29T05:43:51.731Z"
}
```

<details><summary>Layer trace outcomes</summary>

```json
[
  {
    "layer": "layer_0",
    "sequence": 1,
    "outcome": {
      "route": "SCORED",
      "repeatPath": false,
      "routeReason": "sufficiency_all_passed",
      "sufficiencyFailures": []
    }
  },
  {
    "layer": "layer_1",
    "sequence": 2,
    "outcome": {
      "passed": true
    }
  },
  {
    "layer": "layer_2",
    "sequence": 3,
    "outcome": {
      "firedRuleKeys": []
    }
  },
  {
    "layer": "layer_3",
    "sequence": 4,
    "outcome": {
      "band": "B",
      "decision": "APPROVE",
      "limitMultiplier": 0.9,
      "affordabilitySharePct": 0
    }
  },
  {
    "layer": "layer_4",
    "sequence": 5,
    "outcome": {
      "reason": "Income too volatile (income_stability_requirement)",
      "declined": true,
      "monthlyIncome": 35.07906617647059
    }
  }
]
```

</details>

#### `774472150`

Repayment history in file: **14 repayments**, 179.00 repaid, principal 10.00, outstanding 0.00, last paid 2026-07-11 18:12:03.387, expiry 2026-07-19 00:00:00, mode `Customer Repayment`.

HTTP 201 in 833ms. Trace layers: `layer_0` -> `layer_1` -> `layer_2` -> `layer_3`.

```json
{
  "tenantId": "legacy",
  "requestId": "3ec9535d-c7be-4471-b154-ed801d5d1be1",
  "decisionId": "e2af67a1-1619-4910-a16d-0802670017fb",
  "customerId": "774472150",
  "decision": "REFER",
  "routing": "SCORED",
  "scoreSource": "MODEL",
  "score": 60.00771231075716,
  "band": "C",
  "approvedLimit": null,
  "tenure": null,
  "deposit": null,
  "instalment": null,
  "affordabilityLimit": 0,
  "incomeBasis": "BALANCE_PROXY",
  "incomeConfidence": null,
  "predictedConfidenceScore": 60.00771231075716,
  "predictedConfidenceBand": "C",
  "modelVersion": "CatBoost_V01_08092026",
  "topFeaturesAffectingScore": "[{\"feature\": \"income_stability_score\", \"impact\": \"INCREASES\", \"shap_value\": 6.719}, {\"feature\": \"expense_score\", \"impact\": \"DECREASES\", \"shap_value\": -3.4348}, {\"feature\": \"cashflow_score\", \"impact\": \"DECREASES\", \"shap_value\": -2.6071}, {\"feature\": \"transaction_consistency_score\", \"impact\": \"INCREASES\", \"shap_value\": 1.8731}, {\"feature\": \"cashflow_retention_score\", \"impact\": \"DECREASES\", \"shap_value\": -1.5091}]",
  "bindingConstraint": {
    "layer": "layer_3",
    "parameterKey": "band_table",
    "description": "Band routed to manual review"
  },
  "capsApplied": [],
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
  "timestamp": "2026-09-29T05:43:53.369Z"
}
```

<details><summary>Layer trace outcomes</summary>

```json
[
  {
    "layer": "layer_0",
    "sequence": 1,
    "outcome": {
      "route": "SCORED",
      "repeatPath": false,
      "routeReason": "sufficiency_all_passed",
      "sufficiencyFailures": []
    }
  },
  {
    "layer": "layer_1",
    "sequence": 2,
    "outcome": {
      "passed": true
    }
  },
  {
    "layer": "layer_2",
    "sequence": 3,
    "outcome": {
      "firedRuleKeys": []
    }
  },
  {
    "layer": "layer_3",
    "sequence": 4,
    "outcome": {
      "band": "C",
      "decision": "REFER",
      "limitMultiplier": 0.65,
      "affordabilitySharePct": 0
    }
  }
]
```

</details>

#### `775651985`

Repayment history in file: **38 repayments**, 855.13 repaid, principal 100.00, outstanding 0.00, last paid 2026-07-17 12:24:39.847, expiry 2026-07-19 00:00:00, mode `Customer Repayment`.

HTTP 201 in 1045ms. Trace layers: `layer_0` -> `layer_1` -> `layer_2` -> `layer_3`.

```json
{
  "tenantId": "legacy",
  "requestId": "930be1f8-874c-4642-b915-316bfc074e33",
  "decisionId": "80be634a-5ba1-49d7-bd83-ea12b2d152d2",
  "customerId": "775651985",
  "decision": "REFER",
  "routing": "SCORED",
  "scoreSource": "MODEL",
  "score": 63.14802090433759,
  "band": "C",
  "approvedLimit": null,
  "tenure": null,
  "deposit": null,
  "instalment": null,
  "affordabilityLimit": 0,
  "incomeBasis": "BALANCE_PROXY",
  "incomeConfidence": null,
  "predictedConfidenceScore": 63.14802090433759,
  "predictedConfidenceBand": "C",
  "modelVersion": "CatBoost_V01_08092026",
  "topFeaturesAffectingScore": "[{\"feature\": \"income_stability_score\", \"impact\": \"INCREASES\", \"shap_value\": 6.5567}, {\"feature\": \"transaction_consistency_score\", \"impact\": \"INCREASES\", \"shap_value\": 5.3025}, {\"feature\": \"expense_score\", \"impact\": \"DECREASES\", \"shap_value\": -3.3764}, {\"feature\": \"cashflow_score\", \"impact\": \"DECREASES\", \"shap_value\": -2.4222}, {\"feature\": \"cashflow_retention_score\", \"impact\": \"DECREASES\", \"shap_value\": -1.5223}]",
  "bindingConstraint": {
    "layer": "layer_3",
    "parameterKey": "band_table",
    "description": "Band routed to manual review"
  },
  "capsApplied": [],
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
  "timestamp": "2026-09-29T05:43:55.446Z"
}
```

<details><summary>Layer trace outcomes</summary>

```json
[
  {
    "layer": "layer_0",
    "sequence": 1,
    "outcome": {
      "route": "SCORED",
      "repeatPath": false,
      "routeReason": "sufficiency_all_passed",
      "sufficiencyFailures": []
    }
  },
  {
    "layer": "layer_1",
    "sequence": 2,
    "outcome": {
      "passed": true
    }
  },
  {
    "layer": "layer_2",
    "sequence": 3,
    "outcome": {
      "firedRuleKeys": []
    }
  },
  {
    "layer": "layer_3",
    "sequence": 4,
    "outcome": {
      "band": "C",
      "decision": "REFER",
      "limitMultiplier": 0.65,
      "affordabilitySharePct": 0
    }
  }
]
```

</details>

#### `777113504`

Repayment history in file: **1 repayments**, 15.19 repaid, principal 15.00, outstanding 0.00, last paid 2025-07-18 14:10:30.999, expiry 2025-07-01 00:00:00, mode `CUSTOMER_CREDIT_EVENT`.

HTTP 201 in 997ms. Trace layers: `layer_0` -> `layer_1` -> `layer_2` -> `layer_3a` -> `layer_4`.

```json
{
  "tenantId": "legacy",
  "requestId": "4a28f7de-5e37-484a-a2dd-fed9beab6833",
  "decisionId": "49d8fa1c-4c1c-456b-94fd-7b6229ce9f0d",
  "customerId": "777113504",
  "decision": "DECLINE",
  "routing": "NO_FILE",
  "scoreSource": "SCORECARD",
  "score": null,
  "band": null,
  "approvedLimit": null,
  "tenure": null,
  "deposit": null,
  "instalment": null,
  "affordabilityLimit": null,
  "incomeBasis": null,
  "incomeConfidence": null,
  "predictedConfidenceScore": 23.49399949276137,
  "predictedConfidenceBand": "E",
  "modelVersion": "CatBoost_V01_08092026",
  "topFeaturesAffectingScore": "[{\"feature\": \"activity_score\", \"impact\": \"DECREASES\", \"shap_value\": -5.8608}, {\"feature\": \"income_stability_score\", \"impact\": \"DECREASES\", \"shap_value\": -4.9244}, {\"feature\": \"transaction_consistency_score\", \"impact\": \"DECREASES\", \"shap_value\": -4.6145}, {\"feature\": \"expense_to_income_ratio_90d\", \"impact\": \"INCREASES\", \"shap_value\": 4.1207}, {\"feature\": \"expense_score\", \"impact\": \"DECREASES\", \"shap_value\": -4.0783}]",
  "bindingConstraint": {
    "layer": "layer_4",
    "parameterKey": "minimum_monthly_income",
    "description": "No income figure available (neither DERIVED nor BALANCE_PROXY)"
  },
  "capsApplied": [],
  "reasonCodes": [
    {
      "code": "layer_4.minimum_monthly_income",
      "layer": "layer_4",
      "description": "No income figure available (neither DERIVED nor BALANCE_PROXY)",
      "rank": 1
    }
  ],
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
  "timestamp": "2026-09-29T05:43:57.399Z"
}
```

<details><summary>Layer trace outcomes</summary>

```json
[
  {
    "layer": "layer_0",
    "sequence": 1,
    "outcome": {
      "route": "NO_FILE",
      "repeatPath": false,
      "routeReason": "hard_floor_failed",
      "sufficiencyFailures": [
        "feature_completeness",
        "transaction_history"
      ]
    }
  },
  {
    "layer": "layer_1",
    "sequence": 2,
    "outcome": {
      "passed": true
    }
  },
  {
    "layer": "layer_2",
    "sequence": 3,
    "outcome": {
      "firedRuleKeys": []
    }
  },
  {
    "layer": "layer_3a",
    "sequence": 4,
    "outcome": {
      "route": "NO_FILE",
      "reason": "scorecard not configured (no bucket boundaries defined) \u2014 flat starter/ladder offer used",
      "offerLimit": 30,
      "scorecardConfigured": false
    }
  },
  {
    "layer": "layer_4",
    "sequence": 5,
    "outcome": {
      "reason": "No income figure available (neither DERIVED nor BALANCE_PROXY)",
      "declined": true,
      "minIncome": 26.59117934431525
    }
  }
]
```

</details>

#### `778824243`

Repayment history in file: **15 repayments**, 129.15 repaid, principal 15.00, outstanding 0.00, last paid 2026-02-24 00:39:43.22, expiry 2026-02-24 00:00:00, mode `AUTO_REPAYMENT`.

HTTP 201 in 1764ms. Trace layers: `layer_0` -> `layer_1`.

```json
{
  "tenantId": "legacy",
  "requestId": "acd2c2cf-50ad-4f81-a8d8-f7f2a2b9f41c",
  "decisionId": "8ce3f808-a16e-4544-b87b-e63494552189",
  "customerId": "778824243",
  "decision": "DECLINE",
  "routing": "SCORED",
  "scoreSource": null,
  "score": null,
  "band": null,
  "approvedLimit": null,
  "tenure": null,
  "deposit": null,
  "instalment": null,
  "affordabilityLimit": null,
  "incomeBasis": null,
  "incomeConfidence": null,
  "predictedConfidenceScore": 42.99096204271483,
  "predictedConfidenceBand": "D",
  "modelVersion": "CatBoost_V01_08092026",
  "topFeaturesAffectingScore": "[{\"feature\": \"transaction_consistency_score\", \"impact\": \"DECREASES\", \"shap_value\": -5.5875}, {\"feature\": \"expense_score\", \"impact\": \"DECREASES\", \"shap_value\": -3.6371}, {\"feature\": \"cashflow_score\", \"impact\": \"DECREASES\", \"shap_value\": -2.9075}, {\"feature\": \"activity_score\", \"impact\": \"INCREASES\", \"shap_value\": 1.8214}, {\"feature\": \"cashflow_retention_score\", \"impact\": \"DECREASES\", \"shap_value\": -1.6703}]",
  "bindingConstraint": {
    "layer": "layer_1",
    "parameterKey": "prior_default_lookback",
    "description": "Layer 1 knockout"
  },
  "capsApplied": [],
  "reasonCodes": [
    {
      "code": "layer_1.prior_default_lookback",
      "layer": "layer_1",
      "description": "Layer 1 knockout failed: prior_default_lookback",
      "rank": 1
    }
  ],
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
  "timestamp": "2026-09-29T05:44:00.050Z"
}
```

<details><summary>Layer trace outcomes</summary>

```json
[
  {
    "layer": "layer_0",
    "sequence": 1,
    "outcome": {
      "route": "SCORED",
      "repeatPath": false,
      "routeReason": "sufficiency_all_passed",
      "sufficiencyFailures": []
    }
  },
  {
    "layer": "layer_1",
    "sequence": 2,
    "outcome": {
      "passed": false,
      "failedRuleKey": "prior_default_lookback"
    }
  }
]
```

</details>

#### `782318953`

Repayment history in file: **434 repayments**, 4363.44 repaid, principal 300.00, outstanding 0.00, last paid 2026-07-13 08:48:18.591, expiry 2026-12-04 00:00:00, mode `CUSTOMER_CREDIT_EVENT`.

HTTP 201 in 793ms. Trace layers: `layer_0` -> `layer_1` -> `layer_2` -> `layer_3a` -> `layer_4` -> `layer_5`.

```json
{
  "tenantId": "legacy",
  "requestId": "91f465ba-55c7-45bc-9d80-2b310e155f7d",
  "decisionId": "4766b316-ba50-4b0f-9bfc-31c5ff2d40a6",
  "customerId": "782318953",
  "decision": "DECLINE",
  "routing": "NO_FILE",
  "scoreSource": "SCORECARD",
  "score": null,
  "band": null,
  "approvedLimit": null,
  "tenure": null,
  "deposit": null,
  "instalment": null,
  "affordabilityLimit": 12.669999999999995,
  "incomeBasis": "BALANCE_PROXY",
  "incomeConfidence": null,
  "predictedConfidenceScore": 27.95382686320358,
  "predictedConfidenceBand": "E",
  "modelVersion": "CatBoost_V01_08092026",
  "topFeaturesAffectingScore": "[{\"feature\": \"activity_score\", \"impact\": \"DECREASES\", \"shap_value\": -5.2665}, {\"feature\": \"transaction_consistency_score\", \"impact\": \"DECREASES\", \"shap_value\": -4.9433}, {\"feature\": \"expense_score\", \"impact\": \"DECREASES\", \"shap_value\": -4.3782}, {\"feature\": \"spending_score\", \"impact\": \"DECREASES\", \"shap_value\": -2.3614}, {\"feature\": \"positive_cashflow_days_90d\", \"impact\": \"DECREASES\", \"shap_value\": -2.0934}]",
  "bindingConstraint": {
    "layer": "layer_5",
    "parameterKey": "minimum_viable_limit",
    "description": "Final limit below minimum viable amount"
  },
  "capsApplied": [
    {
      "source": "layer_3_or_3a.indicative_limit",
      "value": 30
    },
    {
      "source": "layer_4.affordability_limit",
      "value": 12.669999999999995
    },
    {
      "source": "product_profile.product_maximum",
      "value": 500
    },
    {
      "source": "product_profile.exposure_cap_remaining",
      "value": 750
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
  "timestamp": "2026-09-29T05:44:01.648Z"
}
```

<details><summary>Layer trace outcomes</summary>

```json
[
  {
    "layer": "layer_0",
    "sequence": 1,
    "outcome": {
      "route": "NO_FILE",
      "repeatPath": false,
      "routeReason": "hard_floor_failed",
      "sufficiencyFailures": [
        "transaction_history"
      ]
    }
  },
  {
    "layer": "layer_1",
    "sequence": 2,
    "outcome": {
      "passed": true
    }
  },
  {
    "layer": "layer_2",
    "sequence": 3,
    "outcome": {
      "firedRuleKeys": []
    }
  },
  {
    "layer": "layer_3a",
    "sequence": 4,
    "outcome": {
      "route": "NO_FILE",
      "reason": "scorecard not configured (no bucket boundaries defined) \u2014 flat starter/ladder offer used",
      "offerLimit": 30,
      "scorecardConfigured": false
    }
  },
  {
    "layer": "layer_4",
    "sequence": 5,
    "outcome": {
      "incomeBasis": "BALANCE_PROXY",
      "monthlyIncome": 62.66999999999999,
      "affordabilityLimit": 12.66999999999999,
      "affordabilitySharePct": 20.2170097335248
    }
  },
  {
    "layer": "layer_5",
    "sequence": 6,
    "outcome": {
      "rounded": 10,
      "declined": true,
      "rawLimit": 12.66999999999999,
      "bindingCap": "layer_4.affordability_limit",
      "minimumViableLimit": 30
    }
  }
]
```

</details>

#### `784871370`

Repayment history in file: **23 repayments**, 120.02 repaid, principal 15.00, outstanding 0.00, last paid 2025-10-12 16:14:56.52, expiry 2025-06-14 00:00:00, mode `CUSTOMER_CREDIT_EVENT`.

HTTP 201 in 845ms. Trace layers: `layer_0` -> `layer_1` -> `layer_2` -> `layer_3a` -> `layer_4`.

```json
{
  "tenantId": "legacy",
  "requestId": "f15bf0c2-4e34-4f97-9cad-4c2e4dc7945e",
  "decisionId": "e7005e96-d4aa-4419-abff-007d36992c39",
  "customerId": "784871370",
  "decision": "DECLINE",
  "routing": "THIN_FILE",
  "scoreSource": "SCORECARD",
  "score": null,
  "band": null,
  "approvedLimit": null,
  "tenure": null,
  "deposit": null,
  "instalment": null,
  "affordabilityLimit": null,
  "incomeBasis": null,
  "incomeConfidence": null,
  "predictedConfidenceScore": 23.49399949276137,
  "predictedConfidenceBand": "E",
  "modelVersion": "CatBoost_V01_08092026",
  "topFeaturesAffectingScore": "[{\"feature\": \"activity_score\", \"impact\": \"DECREASES\", \"shap_value\": -5.8608}, {\"feature\": \"income_stability_score\", \"impact\": \"DECREASES\", \"shap_value\": -4.9244}, {\"feature\": \"transaction_consistency_score\", \"impact\": \"DECREASES\", \"shap_value\": -4.6145}, {\"feature\": \"expense_to_income_ratio_90d\", \"impact\": \"INCREASES\", \"shap_value\": 4.1207}, {\"feature\": \"expense_score\", \"impact\": \"DECREASES\", \"shap_value\": -4.0783}]",
  "bindingConstraint": {
    "layer": "layer_4",
    "parameterKey": "minimum_monthly_income",
    "description": "No income figure available (neither DERIVED nor BALANCE_PROXY)"
  },
  "capsApplied": [],
  "reasonCodes": [
    {
      "code": "layer_4.minimum_monthly_income",
      "layer": "layer_4",
      "description": "No income figure available (neither DERIVED nor BALANCE_PROXY)",
      "rank": 1
    }
  ],
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
  "timestamp": "2026-09-29T05:44:03.272Z"
}
```

<details><summary>Layer trace outcomes</summary>

```json
[
  {
    "layer": "layer_0",
    "sequence": 1,
    "outcome": {
      "route": "THIN_FILE",
      "repeatPath": false,
      "routeReason": "sufficiency_partial",
      "sufficiencyFailures": [
        "feature_completeness",
        "transaction_history"
      ]
    }
  },
  {
    "layer": "layer_1",
    "sequence": 2,
    "outcome": {
      "passed": true
    }
  },
  {
    "layer": "layer_2",
    "sequence": 3,
    "outcome": {
      "firedRuleKeys": []
    }
  },
  {
    "layer": "layer_3a",
    "sequence": 4,
    "outcome": {
      "route": "THIN_FILE",
      "reason": "scorecard not configured (no bucket boundaries defined) \u2014 flat starter/ladder offer used",
      "offerLimit": 50,
      "scorecardConfigured": false
    }
  },
  {
    "layer": "layer_4",
    "sequence": 5,
    "outcome": {
      "reason": "No income figure available (neither DERIVED nor BALANCE_PROXY)",
      "declined": true,
      "minIncome": 26.59117934431525
    }
  }
]
```

</details>

### ON_TERM

#### `771024712`

Repayment history in file: **19 repayments**, 195.33 repaid, principal 100.00, outstanding 99.99, last paid 2026-07-15 23:39:50.607, expiry 2026-08-13 00:00:00, mode `Customer Repayment`.

HTTP 201 in 928ms. Trace layers: `layer_0` -> `layer_1` -> `layer_2` -> `layer_3` -> `layer_4` -> `layer_5`.

```json
{
  "tenantId": "legacy",
  "requestId": "7f32465a-44b8-4138-9ba9-cba9627b9fa1",
  "decisionId": "fa93594f-3699-4313-bebf-7c1d93a1b746",
  "customerId": "771024712",
  "decision": "DECLINE",
  "routing": "SCORED",
  "scoreSource": "MODEL",
  "score": 82.48534741544296,
  "band": "B",
  "approvedLimit": null,
  "tenure": null,
  "deposit": null,
  "instalment": null,
  "affordabilityLimit": 0,
  "incomeBasis": "BALANCE_PROXY",
  "incomeConfidence": null,
  "predictedConfidenceScore": 82.48534741544296,
  "predictedConfidenceBand": "B",
  "modelVersion": "CatBoost_V01_08092026",
  "topFeaturesAffectingScore": "[{\"feature\": \"cashflow_score\", \"impact\": \"INCREASES\", \"shap_value\": 4.8115}, {\"feature\": \"transaction_consistency_score\", \"impact\": \"INCREASES\", \"shap_value\": 3.7812}, {\"feature\": \"expense_score\", \"impact\": \"INCREASES\", \"shap_value\": 2.5551}, {\"feature\": \"net_cashflow_ratio_90d\", \"impact\": \"INCREASES\", \"shap_value\": 2.259}, {\"feature\": \"expense_to_income_ratio_90d\", \"impact\": \"INCREASES\", \"shap_value\": 1.6587}]",
  "bindingConstraint": {
    "layer": "layer_5",
    "parameterKey": "minimum_viable_limit",
    "description": "Final limit below minimum viable amount"
  },
  "capsApplied": [
    {
      "source": "layer_3_or_3a.indicative_limit",
      "value": 450
    },
    {
      "source": "layer_4.affordability_limit",
      "value": 0
    },
    {
      "source": "product_profile.product_maximum",
      "value": 500
    },
    {
      "source": "product_profile.exposure_cap_remaining",
      "value": 750
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
  "timestamp": "2026-09-29T05:43:26.648Z"
}
```

<details><summary>Layer trace outcomes</summary>

```json
[
  {
    "layer": "layer_0",
    "sequence": 1,
    "outcome": {
      "route": "SCORED",
      "repeatPath": false,
      "routeReason": "sufficiency_all_passed",
      "sufficiencyFailures": []
    }
  },
  {
    "layer": "layer_1",
    "sequence": 2,
    "outcome": {
      "passed": true
    }
  },
  {
    "layer": "layer_2",
    "sequence": 3,
    "outcome": {
      "firedRuleKeys": []
    }
  },
  {
    "layer": "layer_3",
    "sequence": 4,
    "outcome": {
      "band": "B",
      "decision": "APPROVE",
      "limitMultiplier": 0.9,
      "affordabilitySharePct": 0
    }
  },
  {
    "layer": "layer_4",
    "sequence": 5,
    "outcome": {
      "incomeBasis": "BALANCE_PROXY",
      "monthlyIncome": 28.06834982893451,
      "affordabilityLimit": 0,
      "affordabilitySharePct": 0
    }
  },
  {
    "layer": "layer_5",
    "sequence": 6,
    "outcome": {
      "rounded": 0,
      "declined": true,
      "rawLimit": 0,
      "bindingCap": "layer_4.affordability_limit",
      "minimumViableLimit": 30
    }
  }
]
```

</details>

#### `772482358`

Repayment history in file: **576 repayments**, 4179.96 repaid, principal 300.00, outstanding 16.99, last paid 2026-07-13 12:43:42.388, expiry 2026-10-03 00:00:00, mode `Customer Repayment`.

HTTP 201 in 1684ms. Trace layers: `layer_0` -> `layer_1` -> `layer_2` -> `layer_3a` -> `layer_4`.

```json
{
  "tenantId": "legacy",
  "requestId": "6bb90d0a-12cc-4459-a0be-c4f1e0151b9a",
  "decisionId": "cee61fda-2aaa-4e10-a14f-2fe6f670ad52",
  "customerId": "772482358",
  "decision": "DECLINE",
  "routing": "NO_FILE",
  "scoreSource": "SCORECARD",
  "score": null,
  "band": null,
  "approvedLimit": null,
  "tenure": null,
  "deposit": null,
  "instalment": null,
  "affordabilityLimit": 0,
  "incomeBasis": "BALANCE_PROXY",
  "incomeConfidence": null,
  "predictedConfidenceScore": 55.32420505799654,
  "predictedConfidenceBand": "C",
  "modelVersion": "CatBoost_V01_08092026",
  "topFeaturesAffectingScore": "[{\"feature\": \"expense_score\", \"impact\": \"INCREASES\", \"shap_value\": 5.7992}, {\"feature\": \"activity_score\", \"impact\": \"DECREASES\", \"shap_value\": -4.7083}, {\"feature\": \"transaction_consistency_score\", \"impact\": \"DECREASES\", \"shap_value\": -4.6088}, {\"feature\": \"cashflow_score\", \"impact\": \"INCREASES\", \"shap_value\": 3.7328}, {\"feature\": \"cashflow_retention_score\", \"impact\": \"INCREASES\", \"shap_value\": 2.5825}]",
  "bindingConstraint": {
    "layer": "layer_4",
    "parameterKey": "minimum_monthly_income",
    "description": "Monthly income below minimum_monthly_income"
  },
  "capsApplied": [],
  "reasonCodes": [
    {
      "code": "layer_4.minimum_monthly_income",
      "layer": "layer_4",
      "description": "Monthly income below minimum_monthly_income",
      "rank": 1
    }
  ],
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
  "timestamp": "2026-09-29T05:43:29.003Z"
}
```

<details><summary>Layer trace outcomes</summary>

```json
[
  {
    "layer": "layer_0",
    "sequence": 1,
    "outcome": {
      "route": "NO_FILE",
      "repeatPath": false,
      "routeReason": "hard_floor_failed",
      "sufficiencyFailures": [
        "transaction_history"
      ]
    }
  },
  {
    "layer": "layer_1",
    "sequence": 2,
    "outcome": {
      "passed": true
    }
  },
  {
    "layer": "layer_2",
    "sequence": 3,
    "outcome": {
      "firedRuleKeys": []
    }
  },
  {
    "layer": "layer_3a",
    "sequence": 4,
    "outcome": {
      "route": "NO_FILE",
      "reason": "scorecard not configured (no bucket boundaries defined) \u2014 flat starter/ladder offer used",
      "offerLimit": 30,
      "scorecardConfigured": false
    }
  },
  {
    "layer": "layer_4",
    "sequence": 5,
    "outcome": {
      "reason": "Monthly income below minimum_monthly_income",
      "declined": true,
      "monthlyIncome": 25.145
    }
  }
]
```

</details>

#### `773154836`

Repayment history in file: **28 repayments**, 295.09 repaid, principal 100.00, outstanding 85.00, last paid 2026-07-20 16:17:05.955, expiry 2026-08-17 00:00:00, mode `Customer Repayment`.

HTTP 201 in 926ms. Trace layers: `layer_0` -> `layer_1` -> `layer_2` -> `layer_3`.

```json
{
  "tenantId": "legacy",
  "requestId": "d5ba12cb-5fef-4484-8266-357b3636d55b",
  "decisionId": "26cbd96b-c549-453c-af58-b7fab05022a5",
  "customerId": "773154836",
  "decision": "REFER",
  "routing": "SCORED",
  "scoreSource": "MODEL",
  "score": 63.83194462538926,
  "band": "C",
  "approvedLimit": null,
  "tenure": null,
  "deposit": null,
  "instalment": null,
  "affordabilityLimit": 0,
  "incomeBasis": "BALANCE_PROXY",
  "incomeConfidence": null,
  "predictedConfidenceScore": 63.83194462538926,
  "predictedConfidenceBand": "C",
  "modelVersion": "CatBoost_V01_08092026",
  "topFeaturesAffectingScore": "[{\"feature\": \"transaction_consistency_score\", \"impact\": \"INCREASES\", \"shap_value\": 2.1973}, {\"feature\": \"cashflow_score\", \"impact\": \"DECREASES\", \"shap_value\": -1.6817}, {\"feature\": \"income_stability_score\", \"impact\": \"INCREASES\", \"shap_value\": 1.4287}, {\"feature\": \"activity_score\", \"impact\": \"INCREASES\", \"shap_value\": 1.2118}, {\"feature\": \"net_cashflow_ratio_90d\", \"impact\": \"DECREASES\", \"shap_value\": -1.0991}]",
  "bindingConstraint": {
    "layer": "layer_3",
    "parameterKey": "band_table",
    "description": "Band routed to manual review"
  },
  "capsApplied": [],
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
  "timestamp": "2026-09-29T05:43:30.612Z"
}
```

<details><summary>Layer trace outcomes</summary>

```json
[
  {
    "layer": "layer_0",
    "sequence": 1,
    "outcome": {
      "route": "SCORED",
      "repeatPath": false,
      "routeReason": "sufficiency_all_passed",
      "sufficiencyFailures": []
    }
  },
  {
    "layer": "layer_1",
    "sequence": 2,
    "outcome": {
      "passed": true
    }
  },
  {
    "layer": "layer_2",
    "sequence": 3,
    "outcome": {
      "firedRuleKeys": []
    }
  },
  {
    "layer": "layer_3",
    "sequence": 4,
    "outcome": {
      "band": "C",
      "decision": "REFER",
      "limitMultiplier": 0.65,
      "affordabilitySharePct": 0
    }
  }
]
```

</details>

#### `773768824`

Repayment history in file: **16 repayments**, 75.39 repaid, principal 5.00, outstanding 1.00, last paid 2026-07-19 19:32:43.412, expiry 2026-07-26 00:00:00, mode `Customer Repayment`.

HTTP 201 in 1357ms. Trace layers: `layer_0` -> `layer_1` -> `layer_2` -> `layer_3` -> `layer_4` -> `layer_5`.

```json
{
  "tenantId": "legacy",
  "requestId": "a4b0b081-8353-4d29-806f-97b941a7b263",
  "decisionId": "c2382c10-41c5-488c-b072-3b89f0a698a7",
  "customerId": "773768824",
  "decision": "DECLINE",
  "routing": "SCORED",
  "scoreSource": "MODEL",
  "score": 82.40522288430839,
  "band": "B",
  "approvedLimit": null,
  "tenure": null,
  "deposit": null,
  "instalment": null,
  "affordabilityLimit": 0,
  "incomeBasis": "BALANCE_PROXY",
  "incomeConfidence": null,
  "predictedConfidenceScore": 82.40522288430839,
  "predictedConfidenceBand": "B",
  "modelVersion": "CatBoost_V01_08092026",
  "topFeaturesAffectingScore": "[{\"feature\": \"expense_score\", \"impact\": \"INCREASES\", \"shap_value\": 4.6937}, {\"feature\": \"cashflow_score\", \"impact\": \"INCREASES\", \"shap_value\": 4.306}, {\"feature\": \"cashflow_retention_score\", \"impact\": \"INCREASES\", \"shap_value\": 3.0225}, {\"feature\": \"net_cashflow_ratio_90d\", \"impact\": \"INCREASES\", \"shap_value\": 1.9853}, {\"feature\": \"activity_score\", \"impact\": \"INCREASES\", \"shap_value\": 1.5538}]",
  "bindingConstraint": {
    "layer": "layer_5",
    "parameterKey": "minimum_viable_limit",
    "description": "Final limit below minimum viable amount"
  },
  "capsApplied": [
    {
      "source": "layer_3_or_3a.indicative_limit",
      "value": 450
    },
    {
      "source": "layer_4.affordability_limit",
      "value": 0
    },
    {
      "source": "product_profile.product_maximum",
      "value": 500
    },
    {
      "source": "product_profile.exposure_cap_remaining",
      "value": 750
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
  "timestamp": "2026-09-29T05:43:34.031Z"
}
```

<details><summary>Layer trace outcomes</summary>

```json
[
  {
    "layer": "layer_0",
    "sequence": 1,
    "outcome": {
      "route": "SCORED",
      "repeatPath": false,
      "routeReason": "sufficiency_all_passed",
      "sufficiencyFailures": []
    }
  },
  {
    "layer": "layer_1",
    "sequence": 2,
    "outcome": {
      "passed": true
    }
  },
  {
    "layer": "layer_2",
    "sequence": 3,
    "outcome": {
      "firedRuleKeys": []
    }
  },
  {
    "layer": "layer_3",
    "sequence": 4,
    "outcome": {
      "band": "B",
      "decision": "APPROVE",
      "limitMultiplier": 0.9,
      "affordabilitySharePct": 0
    }
  },
  {
    "layer": "layer_4",
    "sequence": 5,
    "outcome": {
      "incomeBasis": "BALANCE_PROXY",
      "monthlyIncome": 26.74432284541724,
      "affordabilityLimit": 0,
      "affordabilitySharePct": 0
    }
  },
  {
    "layer": "layer_5",
    "sequence": 6,
    "outcome": {
      "rounded": 0,
      "declined": true,
      "rawLimit": 0,
      "bindingCap": "layer_4.affordability_limit",
      "minimumViableLimit": 30
    }
  }
]
```

</details>

#### `774540383`

Repayment history in file: **216 repayments**, 2243.34 repaid, principal 300.00, outstanding 16.73, last paid 2026-07-19 02:18:03.04, expiry 2026-12-19 00:00:00, mode `AUTO_REPAYMENT`.

HTTP 201 in 2504ms. Trace layers: `layer_0` -> `layer_1` -> `layer_2` -> `layer_3a` -> `layer_4`.

```json
{
  "tenantId": "legacy",
  "requestId": "873ba07b-4ff9-4cf3-91f2-2d4f664422ec",
  "decisionId": "dd612e01-9a56-4980-8d69-d70a75e8f52d",
  "customerId": "774540383",
  "decision": "DECLINE",
  "routing": "NO_FILE",
  "scoreSource": "SCORECARD",
  "score": null,
  "band": null,
  "approvedLimit": null,
  "tenure": null,
  "deposit": null,
  "instalment": null,
  "affordabilityLimit": null,
  "incomeBasis": null,
  "incomeConfidence": null,
  "predictedConfidenceScore": 24.22129632013719,
  "predictedConfidenceBand": "E",
  "modelVersion": "CatBoost_V01_08092026",
  "topFeaturesAffectingScore": "[{\"feature\": \"activity_score\", \"impact\": \"DECREASES\", \"shap_value\": -5.8511}, {\"feature\": \"income_stability_score\", \"impact\": \"DECREASES\", \"shap_value\": -4.9352}, {\"feature\": \"transaction_consistency_score\", \"impact\": \"DECREASES\", \"shap_value\": -4.6004}, {\"feature\": \"expense_to_income_ratio_90d\", \"impact\": \"INCREASES\", \"shap_value\": 4.104}, {\"feature\": \"expense_score\", \"impact\": \"DECREASES\", \"shap_value\": -4.0971}]",
  "bindingConstraint": {
    "layer": "layer_4",
    "parameterKey": "minimum_monthly_income",
    "description": "No income figure available (neither DERIVED nor BALANCE_PROXY)"
  },
  "capsApplied": [],
  "reasonCodes": [
    {
      "code": "layer_4.minimum_monthly_income",
      "layer": "layer_4",
      "description": "No income figure available (neither DERIVED nor BALANCE_PROXY)",
      "rank": 1
    }
  ],
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
  "timestamp": "2026-09-29T05:43:37.228Z"
}
```

<details><summary>Layer trace outcomes</summary>

```json
[
  {
    "layer": "layer_0",
    "sequence": 1,
    "outcome": {
      "route": "NO_FILE",
      "repeatPath": false,
      "routeReason": "hard_floor_failed",
      "sufficiencyFailures": [
        "feature_completeness",
        "transaction_history"
      ]
    }
  },
  {
    "layer": "layer_1",
    "sequence": 2,
    "outcome": {
      "passed": true
    }
  },
  {
    "layer": "layer_2",
    "sequence": 3,
    "outcome": {
      "firedRuleKeys": []
    }
  },
  {
    "layer": "layer_3a",
    "sequence": 4,
    "outcome": {
      "route": "NO_FILE",
      "reason": "scorecard not configured (no bucket boundaries defined) \u2014 flat starter/ladder offer used",
      "offerLimit": 30,
      "scorecardConfigured": false
    }
  },
  {
    "layer": "layer_4",
    "sequence": 5,
    "outcome": {
      "reason": "No income figure available (neither DERIVED nor BALANCE_PROXY)",
      "declined": true,
      "minIncome": 26.59117934431525
    }
  }
]
```

</details>

#### `775727645`

Repayment history in file: **211 repayments**, 1509.73 repaid, principal 150.00, outstanding 4.15, last paid 2026-07-13 08:42:28.316, expiry 2026-10-17 00:00:00, mode `Customer Repayment`.

HTTP 201 in 1560ms. Trace layers: `layer_0` -> `layer_1`.

```json
{
  "tenantId": "legacy",
  "requestId": "557c7f91-174c-4b39-88ec-14a905480de2",
  "decisionId": "2eebf435-f5e9-413a-b7dc-bc19ec65a9f2",
  "customerId": "775727645",
  "decision": "DECLINE",
  "routing": "SCORED",
  "scoreSource": null,
  "score": null,
  "band": null,
  "approvedLimit": null,
  "tenure": null,
  "deposit": null,
  "instalment": null,
  "affordabilityLimit": null,
  "incomeBasis": null,
  "incomeConfidence": null,
  "predictedConfidenceScore": 54.54482195558227,
  "predictedConfidenceBand": "C",
  "modelVersion": "CatBoost_V01_08092026",
  "topFeaturesAffectingScore": "[{\"feature\": \"expense_score\", \"impact\": \"DECREASES\", \"shap_value\": -3.4389}, {\"feature\": \"cashflow_score\", \"impact\": \"DECREASES\", \"shap_value\": -3.0592}, {\"feature\": \"transaction_consistency_score\", \"impact\": \"INCREASES\", \"shap_value\": 2.8456}, {\"feature\": \"income_stability_score\", \"impact\": \"INCREASES\", \"shap_value\": 1.5751}, {\"feature\": \"cashflow_retention_score\", \"impact\": \"DECREASES\", \"shap_value\": -1.549}]",
  "bindingConstraint": {
    "layer": "layer_1",
    "parameterKey": "prior_default_lookback",
    "description": "Layer 1 knockout"
  },
  "capsApplied": [],
  "reasonCodes": [
    {
      "code": "layer_1.prior_default_lookback",
      "layer": "layer_1",
      "description": "Layer 1 knockout failed: prior_default_lookback",
      "rank": 1
    }
  ],
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
  "timestamp": "2026-09-29T05:43:39.587Z"
}
```

<details><summary>Layer trace outcomes</summary>

```json
[
  {
    "layer": "layer_0",
    "sequence": 1,
    "outcome": {
      "route": "SCORED",
      "repeatPath": false,
      "routeReason": "sufficiency_all_passed",
      "sufficiencyFailures": []
    }
  },
  {
    "layer": "layer_1",
    "sequence": 2,
    "outcome": {
      "passed": false,
      "failedRuleKey": "prior_default_lookback"
    }
  }
]
```

</details>

#### `777222823`

Repayment history in file: **280 repayments**, 9320.37 repaid, principal 1000.00, outstanding 66.66, last paid 2026-06-27 10:19:12.648, expiry 2026-09-27 00:00:00, mode `Customer Repayment`.

HTTP 201 in 1187ms. Trace layers: `layer_0` -> `layer_1` -> `layer_2`.

```json
{
  "tenantId": "legacy",
  "requestId": "3b46aa55-4ff1-4284-ab60-5a6e085aad98",
  "decisionId": "5d5129ef-343a-4b8d-a3e4-97993f454bdc",
  "customerId": "777222823",
  "decision": "REFER",
  "routing": "THIN_FILE",
  "scoreSource": null,
  "score": null,
  "band": null,
  "approvedLimit": null,
  "tenure": null,
  "deposit": null,
  "instalment": null,
  "affordabilityLimit": null,
  "incomeBasis": null,
  "incomeConfidence": null,
  "predictedConfidenceScore": 56.49387391864268,
  "predictedConfidenceBand": "C",
  "modelVersion": "CatBoost_V01_08092026",
  "topFeaturesAffectingScore": "[{\"feature\": \"income_stability_score\", \"impact\": \"INCREASES\", \"shap_value\": 9.8865}, {\"feature\": \"tenure_score\", \"impact\": \"DECREASES\", \"shap_value\": -9.0356}, {\"feature\": \"transaction_consistency_score\", \"impact\": \"INCREASES\", \"shap_value\": 4.7262}, {\"feature\": \"expense_score\", \"impact\": \"DECREASES\", \"shap_value\": -3.4391}, {\"feature\": \"cashflow_score\", \"impact\": \"DECREASES\", \"shap_value\": -2.131}]",
  "bindingConstraint": {
    "layer": "layer_2",
    "parameterKey": "minimum_account_age",
    "description": "Fraud screen fired"
  },
  "capsApplied": [],
  "reasonCodes": [
    {
      "code": "layer_2.minimum_account_age",
      "layer": "layer_2",
      "description": "Fraud screen fired: minimum_account_age",
      "rank": 1
    }
  ],
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
  "timestamp": "2026-09-29T05:43:41.291Z"
}
```

<details><summary>Layer trace outcomes</summary>

```json
[
  {
    "layer": "layer_0",
    "sequence": 1,
    "outcome": {
      "route": "THIN_FILE",
      "repeatPath": false,
      "routeReason": "sufficiency_partial",
      "sufficiencyFailures": [
        "wallet_tenure"
      ]
    }
  },
  {
    "layer": "layer_1",
    "sequence": 2,
    "outcome": {
      "passed": true
    }
  },
  {
    "layer": "layer_2",
    "sequence": 3,
    "outcome": {
      "firedRuleKeys": [
        "minimum_account_age"
      ]
    }
  }
]
```

</details>

#### `778802436`

Repayment history in file: **17 repayments**, 67.15 repaid, principal 100.00, outstanding 96.00, last paid 2026-06-25 11:09:55.973, expiry 2026-07-24 00:00:00, mode `Customer Repayment`.

HTTP 201 in 935ms. Trace layers: `layer_0` -> `layer_1` -> `layer_2` -> `layer_3`.

```json
{
  "tenantId": "legacy",
  "requestId": "7fc583a0-5c41-4c01-b508-a9f5fc9f20fe",
  "decisionId": "0ed81e0c-53c4-409d-8c97-99b18c02f03d",
  "customerId": "778802436",
  "decision": "REFER",
  "routing": "SCORED",
  "scoreSource": "MODEL",
  "score": 54.03781214340524,
  "band": "C",
  "approvedLimit": null,
  "tenure": null,
  "deposit": null,
  "instalment": null,
  "affordabilityLimit": 0,
  "incomeBasis": "BALANCE_PROXY",
  "incomeConfidence": null,
  "predictedConfidenceScore": 54.03781214340524,
  "predictedConfidenceBand": "C",
  "modelVersion": "CatBoost_V01_08092026",
  "topFeaturesAffectingScore": "[{\"feature\": \"transaction_consistency_score\", \"impact\": \"INCREASES\", \"shap_value\": 4.4118}, {\"feature\": \"expense_score\", \"impact\": \"DECREASES\", \"shap_value\": -3.5739}, {\"feature\": \"income_stability_score\", \"impact\": \"DECREASES\", \"shap_value\": -2.4009}, {\"feature\": \"cashflow_score\", \"impact\": \"DECREASES\", \"shap_value\": -2.2983}, {\"feature\": \"cashflow_retention_score\", \"impact\": \"DECREASES\", \"shap_value\": -1.5788}]",
  "bindingConstraint": {
    "layer": "layer_3",
    "parameterKey": "band_table",
    "description": "Band routed to manual review"
  },
  "capsApplied": [],
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
  "timestamp": "2026-09-29T05:43:42.783Z"
}
```

<details><summary>Layer trace outcomes</summary>

```json
[
  {
    "layer": "layer_0",
    "sequence": 1,
    "outcome": {
      "route": "SCORED",
      "repeatPath": false,
      "routeReason": "sufficiency_all_passed",
      "sufficiencyFailures": []
    }
  },
  {
    "layer": "layer_1",
    "sequence": 2,
    "outcome": {
      "passed": true
    }
  },
  {
    "layer": "layer_2",
    "sequence": 3,
    "outcome": {
      "firedRuleKeys": []
    }
  },
  {
    "layer": "layer_3",
    "sequence": 4,
    "outcome": {
      "band": "C",
      "decision": "REFER",
      "limitMultiplier": 0.65,
      "affordabilitySharePct": 0
    }
  }
]
```

</details>

#### `782059468`

Repayment history in file: **144 repayments**, 529.38 repaid, principal 120.00, outstanding 5.94, last paid 2026-07-20 07:37:21.562, expiry 2026-11-20 00:00:00, mode `AUTO_REPAYMENT`.

HTTP 201 in 656ms. Trace layers: `layer_0` -> `layer_1` -> `layer_2` -> `layer_3a` -> `layer_4` -> `layer_5`.

```json
{
  "tenantId": "legacy",
  "requestId": "b6997e40-0f13-431b-8098-cd12325d1378",
  "decisionId": "3c7abf8d-e721-4e40-b697-3924a46adc6e",
  "customerId": "782059468",
  "decision": "DECLINE",
  "routing": "THIN_FILE",
  "scoreSource": "SCORECARD",
  "score": null,
  "band": null,
  "approvedLimit": null,
  "tenure": null,
  "deposit": null,
  "instalment": null,
  "affordabilityLimit": 0,
  "incomeBasis": "BALANCE_PROXY",
  "incomeConfidence": null,
  "predictedConfidenceScore": 37.62816316220643,
  "predictedConfidenceBand": "D",
  "modelVersion": "CatBoost_V01_08092026",
  "topFeaturesAffectingScore": "[{\"feature\": \"expense_score\", \"impact\": \"DECREASES\", \"shap_value\": -3.7286}, {\"feature\": \"cashflow_score\", \"impact\": \"DECREASES\", \"shap_value\": -2.9874}, {\"feature\": \"transaction_consistency_score\", \"impact\": \"DECREASES\", \"shap_value\": -2.9183}, {\"feature\": \"positive_cashflow_days_90d\", \"impact\": \"DECREASES\", \"shap_value\": -2.0671}, {\"feature\": \"cashflow_retention_score\", \"impact\": \"DECREASES\", \"shap_value\": -1.828}]",
  "bindingConstraint": {
    "layer": "layer_5",
    "parameterKey": "minimum_viable_limit",
    "description": "Final limit below minimum viable amount"
  },
  "capsApplied": [
    {
      "source": "layer_3_or_3a.indicative_limit",
      "value": 50
    },
    {
      "source": "layer_4.affordability_limit",
      "value": 0
    },
    {
      "source": "product_profile.product_maximum",
      "value": 500
    },
    {
      "source": "product_profile.exposure_cap_remaining",
      "value": 688.26
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
  "timestamp": "2026-09-29T05:43:44.091Z"
}
```

<details><summary>Layer trace outcomes</summary>

```json
[
  {
    "layer": "layer_0",
    "sequence": 1,
    "outcome": {
      "route": "THIN_FILE",
      "repeatPath": false,
      "routeReason": "sufficiency_partial",
      "sufficiencyFailures": [
        "transaction_history"
      ]
    }
  },
  {
    "layer": "layer_1",
    "sequence": 2,
    "outcome": {
      "passed": true
    }
  },
  {
    "layer": "layer_2",
    "sequence": 3,
    "outcome": {
      "firedRuleKeys": []
    }
  },
  {
    "layer": "layer_3a",
    "sequence": 4,
    "outcome": {
      "route": "THIN_FILE",
      "reason": "scorecard not configured (no bucket boundaries defined) \u2014 flat starter/ladder offer used",
      "offerLimit": 50,
      "scorecardConfigured": false
    }
  },
  {
    "layer": "layer_4",
    "sequence": 5,
    "outcome": {
      "incomeBasis": "BALANCE_PROXY",
      "monthlyIncome": 30.71802083333333,
      "affordabilityLimit": 0,
      "affordabilitySharePct": 0
    }
  },
  {
    "layer": "layer_5",
    "sequence": 6,
    "outcome": {
      "rounded": 0,
      "declined": true,
      "rawLimit": 0,
      "bindingCap": "layer_4.affordability_limit",
      "minimumViableLimit": 30
    }
  }
]
```

</details>

#### `784671885`

Repayment history in file: **90 repayments**, 970.02 repaid, principal 300.00, outstanding 16.79, last paid 2026-07-12 02:14:08.398, expiry 2026-10-12 00:00:00, mode `AUTO_REPAYMENT`.

HTTP 201 in 837ms. Trace layers: `layer_0` -> `layer_1` -> `layer_2` -> `layer_3a` -> `layer_4` -> `layer_5`.

```json
{
  "tenantId": "legacy",
  "requestId": "641337fd-06fd-4cdd-a6a9-4b4b44c072a4",
  "decisionId": "46204f7c-e6ac-41d9-9beb-96ff8c6725dd",
  "customerId": "784671885",
  "decision": "DECLINE",
  "routing": "NO_FILE",
  "scoreSource": "SCORECARD",
  "score": null,
  "band": null,
  "approvedLimit": null,
  "tenure": null,
  "deposit": null,
  "instalment": null,
  "affordabilityLimit": 0,
  "incomeBasis": "BALANCE_PROXY",
  "incomeConfidence": null,
  "predictedConfidenceScore": 24.46883146396235,
  "predictedConfidenceBand": "E",
  "modelVersion": "CatBoost_V01_08092026",
  "topFeaturesAffectingScore": "[{\"feature\": \"activity_score\", \"impact\": \"DECREASES\", \"shap_value\": -5.7447}, {\"feature\": \"income_stability_score\", \"impact\": \"DECREASES\", \"shap_value\": -4.9806}, {\"feature\": \"transaction_consistency_score\", \"impact\": \"DECREASES\", \"shap_value\": -4.6032}, {\"feature\": \"expense_score\", \"impact\": \"DECREASES\", \"shap_value\": -4.0989}, {\"feature\": \"expense_to_income_ratio_90d\", \"impact\": \"INCREASES\", \"shap_value\": 4.0899}]",
  "bindingConstraint": {
    "layer": "layer_5",
    "parameterKey": "minimum_viable_limit",
    "description": "Final limit below minimum viable amount"
  },
  "capsApplied": [
    {
      "source": "layer_3_or_3a.indicative_limit",
      "value": 30
    },
    {
      "source": "layer_4.affordability_limit",
      "value": 0
    },
    {
      "source": "product_profile.product_maximum",
      "value": 500
    },
    {
      "source": "product_profile.exposure_cap_remaining",
      "value": 750
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
  "timestamp": "2026-09-29T05:43:45.615Z"
}
```

<details><summary>Layer trace outcomes</summary>

```json
[
  {
    "layer": "layer_0",
    "sequence": 1,
    "outcome": {
      "route": "NO_FILE",
      "repeatPath": false,
      "routeReason": "hard_floor_failed",
      "sufficiencyFailures": [
        "transaction_history"
      ]
    }
  },
  {
    "layer": "layer_1",
    "sequence": 2,
    "outcome": {
      "passed": true
    }
  },
  {
    "layer": "layer_2",
    "sequence": 3,
    "outcome": {
      "firedRuleKeys": []
    }
  },
  {
    "layer": "layer_3a",
    "sequence": 4,
    "outcome": {
      "route": "NO_FILE",
      "reason": "scorecard not configured (no bucket boundaries defined) \u2014 flat starter/ladder offer used",
      "offerLimit": 30,
      "scorecardConfigured": false
    }
  },
  {
    "layer": "layer_4",
    "sequence": 5,
    "outcome": {
      "incomeBasis": "BALANCE_PROXY",
      "monthlyIncome": 27.31,
      "affordabilityLimit": 0,
      "affordabilitySharePct": 0
    }
  },
  {
    "layer": "layer_5",
    "sequence": 6,
    "outcome": {
      "rounded": 0,
      "declined": true,
      "rawLimit": 0,
      "bindingCap": "layer_4.affordability_limit",
      "minimumViableLimit": 30
    }
  }
]
```

</details>

### OVERDUE

#### `771000278`

Repayment history in file: **46 repayments**, 376.07 repaid, principal 30.00, outstanding 27.71, last paid 2026-07-13 15:22:00.74, expiry 2026-06-23 00:00:00, mode `CUSTOMER_CREDIT_EVENT`.

HTTP 201 in 696ms. Trace layers: `layer_0` -> `layer_1` -> `layer_2` -> `layer_3a` -> `layer_4`.

```json
{
  "tenantId": "legacy",
  "requestId": "1ad0f732-2558-402b-a4d0-f48605f92fca",
  "decisionId": "6ac9c4ae-96ea-4333-88c9-4676268712ec",
  "customerId": "771000278",
  "decision": "DECLINE",
  "routing": "THIN_FILE",
  "scoreSource": "SCORECARD",
  "score": null,
  "band": null,
  "approvedLimit": null,
  "tenure": null,
  "deposit": null,
  "instalment": null,
  "affordabilityLimit": 0,
  "incomeBasis": "BALANCE_PROXY",
  "incomeConfidence": null,
  "predictedConfidenceScore": 78.88953488887184,
  "predictedConfidenceBand": "B",
  "modelVersion": "CatBoost_V01_08092026",
  "topFeaturesAffectingScore": "[{\"feature\": \"expense_score\", \"impact\": \"INCREASES\", \"shap_value\": 7.1079}, {\"feature\": \"cashflow_score\", \"impact\": \"INCREASES\", \"shap_value\": 3.275}, {\"feature\": \"cashflow_retention_score\", \"impact\": \"INCREASES\", \"shap_value\": 2.9806}, {\"feature\": \"transaction_consistency_score\", \"impact\": \"INCREASES\", \"shap_value\": 2.3287}, {\"feature\": \"net_cashflow_ratio_90d\", \"impact\": \"INCREASES\", \"shap_value\": 2.2299}]",
  "bindingConstraint": {
    "layer": "layer_4",
    "parameterKey": "income_stability_requirement",
    "description": "Income too volatile (income_stability_requirement)"
  },
  "capsApplied": [],
  "reasonCodes": [
    {
      "code": "layer_4.income_stability_requirement",
      "layer": "layer_4",
      "description": "Income too volatile (income_stability_requirement)",
      "rank": 1
    }
  ],
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
  "timestamp": "2026-09-29T05:44:04.701Z"
}
```

<details><summary>Layer trace outcomes</summary>

```json
[
  {
    "layer": "layer_0",
    "sequence": 1,
    "outcome": {
      "route": "THIN_FILE",
      "repeatPath": false,
      "routeReason": "sufficiency_partial",
      "sufficiencyFailures": [
        "transaction_history"
      ]
    }
  },
  {
    "layer": "layer_1",
    "sequence": 2,
    "outcome": {
      "passed": true
    }
  },
  {
    "layer": "layer_2",
    "sequence": 3,
    "outcome": {
      "firedRuleKeys": []
    }
  },
  {
    "layer": "layer_3a",
    "sequence": 4,
    "outcome": {
      "route": "THIN_FILE",
      "reason": "scorecard not configured (no bucket boundaries defined) \u2014 flat starter/ladder offer used",
      "offerLimit": 50,
      "scorecardConfigured": false
    }
  },
  {
    "layer": "layer_4",
    "sequence": 5,
    "outcome": {
      "reason": "Income too volatile (income_stability_requirement)",
      "declined": true,
      "monthlyIncome": 33.04902678571429
    }
  }
]
```

</details>

#### `772552692`

Repayment history in file: **30 repayments**, 270.95 repaid, principal 100.00, outstanding 82.26, last paid 2026-07-19 08:32:04.231, expiry 2026-07-07 00:00:00, mode `CUSTOMER_CREDIT_EVENT`.

HTTP 201 in 948ms. Trace layers: `layer_0` -> `layer_1` -> `layer_2` -> `layer_3`.

```json
{
  "tenantId": "legacy",
  "requestId": "3fba8d13-3b93-43a0-abd1-c41981e99b88",
  "decisionId": "6dd05cf6-6f7d-47f6-bc43-8efb45d7f8a0",
  "customerId": "772552692",
  "decision": "REFER",
  "routing": "SCORED",
  "scoreSource": "MODEL",
  "score": 57.39674555878696,
  "band": "C",
  "approvedLimit": null,
  "tenure": null,
  "deposit": null,
  "instalment": null,
  "affordabilityLimit": 0,
  "incomeBasis": "BALANCE_PROXY",
  "incomeConfidence": null,
  "predictedConfidenceScore": 57.39674555878696,
  "predictedConfidenceBand": "C",
  "modelVersion": "CatBoost_V01_08092026",
  "topFeaturesAffectingScore": "[{\"feature\": \"transaction_consistency_score\", \"impact\": \"INCREASES\", \"shap_value\": 4.7412}, {\"feature\": \"expense_score\", \"impact\": \"DECREASES\", \"shap_value\": -3.4974}, {\"feature\": \"cashflow_score\", \"impact\": \"DECREASES\", \"shap_value\": -2.6703}, {\"feature\": \"net_cashflow_ratio_90d\", \"impact\": \"DECREASES\", \"shap_value\": -1.48}, {\"feature\": \"cashflow_retention_score\", \"impact\": \"DECREASES\", \"shap_value\": -1.4713}]",
  "bindingConstraint": {
    "layer": "layer_3",
    "parameterKey": "band_table",
    "description": "Band routed to manual review"
  },
  "capsApplied": [],
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
  "timestamp": "2026-09-29T05:44:06.243Z"
}
```

<details><summary>Layer trace outcomes</summary>

```json
[
  {
    "layer": "layer_0",
    "sequence": 1,
    "outcome": {
      "route": "SCORED",
      "repeatPath": false,
      "routeReason": "sufficiency_all_passed",
      "sufficiencyFailures": []
    }
  },
  {
    "layer": "layer_1",
    "sequence": 2,
    "outcome": {
      "passed": true
    }
  },
  {
    "layer": "layer_2",
    "sequence": 3,
    "outcome": {
      "firedRuleKeys": []
    }
  },
  {
    "layer": "layer_3",
    "sequence": 4,
    "outcome": {
      "band": "C",
      "decision": "REFER",
      "limitMultiplier": 0.65,
      "affordabilitySharePct": 0
    }
  }
]
```

</details>

#### `773318248`

Repayment history in file: **23 repayments**, 108.11 repaid, principal 15.00, outstanding 13.50, last paid 2026-06-26 15:57:24.943, expiry 2026-03-04 00:00:00, mode `CUSTOMER_CREDIT_EVENT`.

HTTP 201 in 1488ms. Trace layers: `layer_0` -> `layer_1` -> `layer_2` -> `layer_3a` -> `layer_4`.

```json
{
  "tenantId": "legacy",
  "requestId": "a69444b4-a26b-475d-acb6-da4617d8bc80",
  "decisionId": "e0716add-3adf-4368-bf17-181df627904c",
  "customerId": "773318248",
  "decision": "DECLINE",
  "routing": "THIN_FILE",
  "scoreSource": "SCORECARD",
  "score": null,
  "band": null,
  "approvedLimit": null,
  "tenure": null,
  "deposit": null,
  "instalment": null,
  "affordabilityLimit": 0,
  "incomeBasis": "BALANCE_PROXY",
  "incomeConfidence": null,
  "predictedConfidenceScore": 28.62767932878149,
  "predictedConfidenceBand": "E",
  "modelVersion": "CatBoost_V01_08092026",
  "topFeaturesAffectingScore": "[{\"feature\": \"activity_score\", \"impact\": \"DECREASES\", \"shap_value\": -5.027}, {\"feature\": \"transaction_consistency_score\", \"impact\": \"DECREASES\", \"shap_value\": -5.0177}, {\"feature\": \"expense_score\", \"impact\": \"DECREASES\", \"shap_value\": -4.3256}, {\"feature\": \"cashflow_retention_score\", \"impact\": \"DECREASES\", \"shap_value\": -2.1364}, {\"feature\": \"cashflow_score\", \"impact\": \"DECREASES\", \"shap_value\": -2.0997}]",
  "bindingConstraint": {
    "layer": "layer_4",
    "parameterKey": "minimum_monthly_income",
    "description": "Monthly income below minimum_monthly_income"
  },
  "capsApplied": [],
  "reasonCodes": [
    {
      "code": "layer_4.minimum_monthly_income",
      "layer": "layer_4",
      "description": "Monthly income below minimum_monthly_income",
      "rank": 1
    }
  ],
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
  "timestamp": "2026-09-29T05:44:08.456Z"
}
```

<details><summary>Layer trace outcomes</summary>

```json
[
  {
    "layer": "layer_0",
    "sequence": 1,
    "outcome": {
      "route": "THIN_FILE",
      "repeatPath": false,
      "routeReason": "sufficiency_partial",
      "sufficiencyFailures": [
        "transaction_history"
      ]
    }
  },
  {
    "layer": "layer_1",
    "sequence": 2,
    "outcome": {
      "passed": true
    }
  },
  {
    "layer": "layer_2",
    "sequence": 3,
    "outcome": {
      "firedRuleKeys": []
    }
  },
  {
    "layer": "layer_3a",
    "sequence": 4,
    "outcome": {
      "route": "THIN_FILE",
      "reason": "scorecard not configured (no bucket boundaries defined) \u2014 flat starter/ladder offer used",
      "offerLimit": 50,
      "scorecardConfigured": false
    }
  },
  {
    "layer": "layer_4",
    "sequence": 5,
    "outcome": {
      "reason": "Monthly income below minimum_monthly_income",
      "declined": true,
      "monthlyIncome": 25.99677083333333
    }
  }
]
```

</details>

#### `774115750`

Repayment history in file: **42 repayments**, 173.36 repaid, principal 30.00, outstanding 29.80, last paid 2026-07-15 04:02:33.143, expiry 2026-07-15 00:00:00, mode `AUTO_REPAYMENT`.

HTTP 201 in 1363ms. Trace layers: `layer_0` -> `layer_1` -> `layer_2` -> `layer_3`.

```json
{
  "tenantId": "legacy",
  "requestId": "0c24e70a-33aa-4897-9dd7-6aa5a2e2c848",
  "decisionId": "6e3f3bf7-5bc8-4870-bfcc-94f677d1db6f",
  "customerId": "774115750",
  "decision": "REFER",
  "routing": "SCORED",
  "scoreSource": "MODEL",
  "score": 67.08160807227152,
  "band": "C",
  "approvedLimit": null,
  "tenure": null,
  "deposit": null,
  "instalment": null,
  "affordabilityLimit": 0,
  "incomeBasis": "BALANCE_PROXY",
  "incomeConfidence": null,
  "predictedConfidenceScore": 67.08160807227152,
  "predictedConfidenceBand": "C",
  "modelVersion": "CatBoost_V01_08092026",
  "topFeaturesAffectingScore": "[{\"feature\": \"expense_score\", \"impact\": \"INCREASES\", \"shap_value\": 2.8563}, {\"feature\": \"transaction_consistency_score\", \"impact\": \"DECREASES\", \"shap_value\": -2.0408}, {\"feature\": \"activity_score\", \"impact\": \"INCREASES\", \"shap_value\": 1.7718}, {\"feature\": \"income_stability_score\", \"impact\": \"DECREASES\", \"shap_value\": -1.7586}, {\"feature\": \"expense_to_income_ratio_90d\", \"impact\": \"INCREASES\", \"shap_value\": 1.6344}]",
  "bindingConstraint": {
    "layer": "layer_3",
    "parameterKey": "band_table",
    "description": "Band routed to manual review"
  },
  "capsApplied": [],
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
  "timestamp": "2026-09-29T05:44:11.463Z"
}
```

<details><summary>Layer trace outcomes</summary>

```json
[
  {
    "layer": "layer_0",
    "sequence": 1,
    "outcome": {
      "route": "SCORED",
      "repeatPath": false,
      "routeReason": "sufficiency_all_passed",
      "sufficiencyFailures": []
    }
  },
  {
    "layer": "layer_1",
    "sequence": 2,
    "outcome": {
      "passed": true
    }
  },
  {
    "layer": "layer_2",
    "sequence": 3,
    "outcome": {
      "firedRuleKeys": []
    }
  },
  {
    "layer": "layer_3",
    "sequence": 4,
    "outcome": {
      "band": "C",
      "decision": "REFER",
      "limitMultiplier": 0.65,
      "affordabilitySharePct": 0
    }
  }
]
```

</details>

#### `775265032`

Repayment history in file: **21 repayments**, 132.49 repaid, principal 75.00, outstanding 65.57, last paid 2026-07-22 19:20:35.592, expiry 2026-07-02 00:00:00, mode `CUSTOMER_CREDIT_EVENT`.

HTTP 201 in 1360ms. Trace layers: `layer_0` -> `layer_1` -> `layer_2` -> `layer_3a` -> `layer_4`.

```json
{
  "tenantId": "legacy",
  "requestId": "e6bd5d83-374e-4d51-8150-39625d49a188",
  "decisionId": "1f9eb75b-faf5-4a9c-a4e9-49602d6853f4",
  "customerId": "775265032",
  "decision": "DECLINE",
  "routing": "THIN_FILE",
  "scoreSource": "SCORECARD",
  "score": null,
  "band": null,
  "approvedLimit": null,
  "tenure": null,
  "deposit": null,
  "instalment": null,
  "affordabilityLimit": 0,
  "incomeBasis": "BALANCE_PROXY",
  "incomeConfidence": null,
  "predictedConfidenceScore": 60.73719957727884,
  "predictedConfidenceBand": "C",
  "modelVersion": "CatBoost_V01_08092026",
  "topFeaturesAffectingScore": "[{\"feature\": \"income_stability_score\", \"impact\": \"DECREASES\", \"shap_value\": -5.3854}, {\"feature\": \"expense_score\", \"impact\": \"INCREASES\", \"shap_value\": 4.2369}, {\"feature\": \"cashflow_score\", \"impact\": \"INCREASES\", \"shap_value\": 4.0215}, {\"feature\": \"cashflow_retention_score\", \"impact\": \"INCREASES\", \"shap_value\": 2.8099}, {\"feature\": \"activity_score\", \"impact\": \"DECREASES\", \"shap_value\": -2.537}]",
  "bindingConstraint": {
    "layer": "layer_4",
    "parameterKey": "minimum_monthly_income",
    "description": "Monthly income below minimum_monthly_income"
  },
  "capsApplied": [],
  "reasonCodes": [
    {
      "code": "layer_4.minimum_monthly_income",
      "layer": "layer_4",
      "description": "Monthly income below minimum_monthly_income",
      "rank": 1
    }
  ],
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
  "timestamp": "2026-09-29T05:44:13.740Z"
}
```

<details><summary>Layer trace outcomes</summary>

```json
[
  {
    "layer": "layer_0",
    "sequence": 1,
    "outcome": {
      "route": "THIN_FILE",
      "repeatPath": false,
      "routeReason": "sufficiency_partial",
      "sufficiencyFailures": [
        "transaction_history"
      ]
    }
  },
  {
    "layer": "layer_1",
    "sequence": 2,
    "outcome": {
      "passed": true
    }
  },
  {
    "layer": "layer_2",
    "sequence": 3,
    "outcome": {
      "firedRuleKeys": []
    }
  },
  {
    "layer": "layer_3a",
    "sequence": 4,
    "outcome": {
      "route": "THIN_FILE",
      "reason": "scorecard not configured (no bucket boundaries defined) \u2014 flat starter/ladder offer used",
      "offerLimit": 50,
      "scorecardConfigured": false
    }
  },
  {
    "layer": "layer_4",
    "sequence": 5,
    "outcome": {
      "reason": "Monthly income below minimum_monthly_income",
      "declined": true,
      "monthlyIncome": 25.93488636363636
    }
  }
]
```

</details>

#### `776697600`

Repayment history in file: **9 repayments**, 31.41 repaid, principal 100.00, outstanding 98.59, last paid 2026-07-20 18:17:41.719, expiry 2026-07-19 00:00:00, mode `CUSTOMER_CREDIT_EVENT`.

HTTP 201 in 1499ms. Trace layers: `layer_0` -> `layer_1` -> `layer_2` -> `layer_3`.

```json
{
  "tenantId": "legacy",
  "requestId": "084c46dd-3f7f-458f-8ebb-ff031c998c80",
  "decisionId": "38e7ea78-f1e3-41c8-9777-c88834201ab0",
  "customerId": "776697600",
  "decision": "REFER",
  "routing": "SCORED",
  "scoreSource": "MODEL",
  "score": 67.51806635154225,
  "band": "C",
  "approvedLimit": null,
  "tenure": null,
  "deposit": null,
  "instalment": null,
  "affordabilityLimit": 0,
  "incomeBasis": "BALANCE_PROXY",
  "incomeConfidence": null,
  "predictedConfidenceScore": 67.51806635154225,
  "predictedConfidenceBand": "C",
  "modelVersion": "CatBoost_V01_08092026",
  "topFeaturesAffectingScore": "[{\"feature\": \"transaction_consistency_score\", \"impact\": \"INCREASES\", \"shap_value\": 4.374}, {\"feature\": \"income_stability_score\", \"impact\": \"INCREASES\", \"shap_value\": 1.2484}, {\"feature\": \"cashflow_score\", \"impact\": \"DECREASES\", \"shap_value\": -1.2142}, {\"feature\": \"activity_score\", \"impact\": \"INCREASES\", \"shap_value\": 1.2125}, {\"feature\": \"positive_cashflow_days_90d\", \"impact\": \"INCREASES\", \"shap_value\": 0.8232}]",
  "bindingConstraint": {
    "layer": "layer_3",
    "parameterKey": "band_table",
    "description": "Band routed to manual review"
  },
  "capsApplied": [],
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
  "timestamp": "2026-09-29T05:44:15.886Z"
}
```

<details><summary>Layer trace outcomes</summary>

```json
[
  {
    "layer": "layer_0",
    "sequence": 1,
    "outcome": {
      "route": "SCORED",
      "repeatPath": false,
      "routeReason": "sufficiency_all_passed",
      "sufficiencyFailures": []
    }
  },
  {
    "layer": "layer_1",
    "sequence": 2,
    "outcome": {
      "passed": true
    }
  },
  {
    "layer": "layer_2",
    "sequence": 3,
    "outcome": {
      "firedRuleKeys": []
    }
  },
  {
    "layer": "layer_3",
    "sequence": 4,
    "outcome": {
      "band": "C",
      "decision": "REFER",
      "limitMultiplier": 0.65,
      "affordabilitySharePct": 0
    }
  }
]
```

</details>

#### `778227703`

Repayment history in file: **27 repayments**, 101.88 repaid, principal 30.00, outstanding 29.38, last paid 2026-07-18 05:56:12.625, expiry 2026-07-18 00:00:00, mode `AUTO_REPAYMENT`.

HTTP 201 in 2535ms. Trace layers: `layer_0` -> `layer_1`.

```json
{
  "tenantId": "legacy",
  "requestId": "4dfddf6d-324d-4046-a701-213f5f3541db",
  "decisionId": "4beaec89-8263-408e-8f05-53e9edbb83de",
  "customerId": "778227703",
  "decision": "DECLINE",
  "routing": "SCORED",
  "scoreSource": null,
  "score": null,
  "band": null,
  "approvedLimit": null,
  "tenure": null,
  "deposit": null,
  "instalment": null,
  "affordabilityLimit": null,
  "incomeBasis": null,
  "incomeConfidence": null,
  "predictedConfidenceScore": 63.06102121785955,
  "predictedConfidenceBand": "C",
  "modelVersion": "CatBoost_V01_08092026",
  "topFeaturesAffectingScore": "[{\"feature\": \"transaction_consistency_score\", \"impact\": \"INCREASES\", \"shap_value\": 4.9682}, {\"feature\": \"income_stability_score\", \"impact\": \"DECREASES\", \"shap_value\": -2.5052}, {\"feature\": \"cashflow_score\", \"impact\": \"DECREASES\", \"shap_value\": -1.733}, {\"feature\": \"activity_score\", \"impact\": \"INCREASES\", \"shap_value\": 1.2253}, {\"feature\": \"net_cashflow_90d\", \"impact\": \"INCREASES\", \"shap_value\": 0.7316}]",
  "bindingConstraint": {
    "layer": "layer_1",
    "parameterKey": "prior_default_lookback",
    "description": "Layer 1 knockout"
  },
  "capsApplied": [],
  "reasonCodes": [
    {
      "code": "layer_1.prior_default_lookback",
      "layer": "layer_1",
      "description": "Layer 1 knockout failed: prior_default_lookback",
      "rank": 1
    }
  ],
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
  "timestamp": "2026-09-29T05:44:19.416Z"
}
```

<details><summary>Layer trace outcomes</summary>

```json
[
  {
    "layer": "layer_0",
    "sequence": 1,
    "outcome": {
      "route": "SCORED",
      "repeatPath": false,
      "routeReason": "sufficiency_all_passed",
      "sufficiencyFailures": []
    }
  },
  {
    "layer": "layer_1",
    "sequence": 2,
    "outcome": {
      "passed": false,
      "failedRuleKey": "prior_default_lookback"
    }
  }
]
```

</details>

#### `780256026`

Repayment history in file: **10 repayments**, 33.52 repaid, principal 10.00, outstanding 4.18, last paid 2025-06-08 09:22:33.729, expiry 2025-05-12 00:00:00, mode `CUSTOMER_CREDIT_EVENT`.

HTTP 201 in 1408ms. Trace layers: `layer_0` -> `layer_1` -> `layer_2` -> `layer_3a` -> `layer_4`.

```json
{
  "tenantId": "legacy",
  "requestId": "3ecc9404-04d4-45e3-a8c6-292b775f5ae6",
  "decisionId": "c11e4614-4fd9-4bfc-98f0-e7d5f3c18427",
  "customerId": "780256026",
  "decision": "DECLINE",
  "routing": "NO_FILE",
  "scoreSource": "SCORECARD",
  "score": null,
  "band": null,
  "approvedLimit": null,
  "tenure": null,
  "deposit": null,
  "instalment": null,
  "affordabilityLimit": null,
  "incomeBasis": null,
  "incomeConfidence": null,
  "predictedConfidenceScore": 23.49399949276137,
  "predictedConfidenceBand": "E",
  "modelVersion": "CatBoost_V01_08092026",
  "topFeaturesAffectingScore": "[{\"feature\": \"activity_score\", \"impact\": \"DECREASES\", \"shap_value\": -5.8608}, {\"feature\": \"income_stability_score\", \"impact\": \"DECREASES\", \"shap_value\": -4.9244}, {\"feature\": \"transaction_consistency_score\", \"impact\": \"DECREASES\", \"shap_value\": -4.6145}, {\"feature\": \"expense_to_income_ratio_90d\", \"impact\": \"INCREASES\", \"shap_value\": 4.1207}, {\"feature\": \"expense_score\", \"impact\": \"DECREASES\", \"shap_value\": -4.0783}]",
  "bindingConstraint": {
    "layer": "layer_4",
    "parameterKey": "minimum_monthly_income",
    "description": "No income figure available (neither DERIVED nor BALANCE_PROXY)"
  },
  "capsApplied": [],
  "reasonCodes": [
    {
      "code": "layer_4.minimum_monthly_income",
      "layer": "layer_4",
      "description": "No income figure available (neither DERIVED nor BALANCE_PROXY)",
      "rank": 1
    }
  ],
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
  "timestamp": "2026-09-29T05:44:21.476Z"
}
```

<details><summary>Layer trace outcomes</summary>

```json
[
  {
    "layer": "layer_0",
    "sequence": 1,
    "outcome": {
      "route": "NO_FILE",
      "repeatPath": false,
      "routeReason": "hard_floor_failed",
      "sufficiencyFailures": [
        "feature_completeness",
        "transaction_history",
        "dormancy"
      ]
    }
  },
  {
    "layer": "layer_1",
    "sequence": 2,
    "outcome": {
      "passed": true
    }
  },
  {
    "layer": "layer_2",
    "sequence": 3,
    "outcome": {
      "firedRuleKeys": []
    }
  },
  {
    "layer": "layer_3a",
    "sequence": 4,
    "outcome": {
      "route": "NO_FILE",
      "reason": "scorecard not configured (no bucket boundaries defined) \u2014 flat starter/ladder offer used",
      "offerLimit": 30,
      "scorecardConfigured": false
    }
  },
  {
    "layer": "layer_4",
    "sequence": 5,
    "outcome": {
      "reason": "No income figure available (neither DERIVED nor BALANCE_PROXY)",
      "declined": true,
      "minIncome": 26.59117934431525
    }
  }
]
```

</details>

#### `783416969`

Repayment history in file: **9 repayments**, 32.77 repaid, principal 14.90, outstanding 0.01, last paid 2025-03-11 12:07:32.077, expiry 2024-07-13 00:00:00, mode `CUSTOMER_CREDIT_EVENT`.

HTTP 404 in 1187ms.

```json
{
  "message": "No loan_features rows found for customer_key 783416969",
  "error": "Not Found",
  "statusCode": 404
}
```

#### `785689408`

Repayment history in file: **8 repayments**, 30.88 repaid, principal 5.00, outstanding 4.28, last paid 2026-07-16 02:30:05.547, expiry 2026-07-16 00:00:00, mode `AUTO_REPAYMENT`.

HTTP 201 in 1050ms. Trace layers: `layer_0` -> `layer_1` -> `layer_2` -> `layer_3`.

```json
{
  "tenantId": "legacy",
  "requestId": "57c5c69a-4cc8-43a9-b749-6b74ec02ca47",
  "decisionId": "06ee2590-af5c-4898-a888-94a112ef2e64",
  "customerId": "785689408",
  "decision": "REFER",
  "routing": "SCORED",
  "scoreSource": "MODEL",
  "score": 55.94751875085045,
  "band": "C",
  "approvedLimit": null,
  "tenure": null,
  "deposit": null,
  "instalment": null,
  "affordabilityLimit": 0,
  "incomeBasis": "BALANCE_PROXY",
  "incomeConfidence": null,
  "predictedConfidenceScore": 55.94751875085045,
  "predictedConfidenceBand": "C",
  "modelVersion": "CatBoost_V01_08092026",
  "topFeaturesAffectingScore": "[{\"feature\": \"transaction_consistency_score\", \"impact\": \"INCREASES\", \"shap_value\": 4.9629}, {\"feature\": \"expense_score\", \"impact\": \"DECREASES\", \"shap_value\": -3.3757}, {\"feature\": \"cashflow_score\", \"impact\": \"DECREASES\", \"shap_value\": -3.0445}, {\"feature\": \"cashflow_retention_score\", \"impact\": \"DECREASES\", \"shap_value\": -1.5574}, {\"feature\": \"income_stability_score\", \"impact\": \"INCREASES\", \"shap_value\": 1.5295}]",
  "bindingConstraint": {
    "layer": "layer_3",
    "parameterKey": "band_table",
    "description": "Band routed to manual review"
  },
  "capsApplied": [],
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
  "timestamp": "2026-09-29T05:44:24.423Z"
}
```

<details><summary>Layer trace outcomes</summary>

```json
[
  {
    "layer": "layer_0",
    "sequence": 1,
    "outcome": {
      "route": "SCORED",
      "repeatPath": false,
      "routeReason": "sufficiency_all_passed",
      "sufficiencyFailures": []
    }
  },
  {
    "layer": "layer_1",
    "sequence": 2,
    "outcome": {
      "passed": true
    }
  },
  {
    "layer": "layer_2",
    "sequence": 3,
    "outcome": {
      "firedRuleKeys": []
    }
  },
  {
    "layer": "layer_3",
    "sequence": 4,
    "outcome": {
      "band": "C",
      "decision": "REFER",
      "limitMultiplier": 0.65,
      "affordabilitySharePct": 0
    }
  }
]
```

</details>

---

## Reproducing this

```bash
# stratify the repayment file (about 90s over 1.3GB)
awk -F, 'NR>1 && NF>=10 && !seen[$1]++ {print $1","$7","$10}' \
  Arttha_RepaymentsNOTTO_MTD_2026_Jul_23.csv.filepart > latest_per_msisdn.csv

# then assess each MSISDN
cd api-tests && CREDIT_CUSTOMER=<msisdn> python3 run.py
```

The smoke test `api-tests/run.py` covers the same endpoints for a single customer and passes 11/11 against this build.
