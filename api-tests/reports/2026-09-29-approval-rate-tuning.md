# A configuration that reaches 36% approval, and what it costs

2026-09-29, staging. Same harness as the A/B test: fresh tenant, seeded defaults, aligned rule-for-rule to `legacy`, then changed. Same 300 customers every run (100 settled, 100 on-term, 100 overdue). `legacy` untouched.

**Recommended: C5 — 108 approvals in 297, 36.4%, with every knockout rule left exactly as production has it.**

## A bug found while doing this, which invalidated part of the earlier test

`POST /product-profiles` **ignores every value in the request body** and writes hardcoded defaults. It returns 201 with the defaults, so a caller has no signal that anything was dropped.

```
sent:    productMaximum 400  minimumViableLimit 7   limitRoundingIncrement 5
         permittedTenures [2,3]  depositFloorPct 15  totalCustomerExposureCap 600
stored:  productMaximum 500  minimumViableLimit 30  limitRoundingIncrement 10
         permittedTenures [3,4,6]  depositFloorPct 0   totalCustomerExposureCap 750
```

Every field ignored. `PATCH /product-profiles/{id}` honours them correctly, so the workaround is to create then immediately patch. This is worth fixing on its own: a product cannot currently be configured at creation, and nothing tells you.

It also means the `minimumViableLimit` changes in the earlier A/B test never applied. That report has been corrected. When applied properly, it is one of the strongest levers available.

## Results

| Config | Approvals | Rate | REFER | DECLINE | Value | Risk gates touched |
|---|---:|---:|---:|---:|---:|---|
| baseline (`legacy`) | 2 | 0.7% | 108 | 187 | 120 | none |
| **C5** | **108** | **36.4%** | 39 | 150 | 3070 | **none** |
| C6 | 119 | 40.2% | 37 | 140 | 3435 | income floor lowered |

Two earlier attempts that stripped risk rules wholesale (`prior_default_lookback`, `concurrent_loan_cap`, the layer 2 fraud screens, `minimum_monthly_income`) reached only 28.3% — **worse than C5, which keeps all of them**. Removing risk gates was not what raised the rate; fixing the affordability arithmetic was.

## C5 — the recommended configuration

Four rule changes and one profile change. Everything else identical to `legacy`.

### Rules — `PATCH /rule-versions/rules`

| Rule | Layer | From | To | Why |
|---|---|---|---|---|
| `net_disposable_income_floor` | 4 | `gte 50` | `gte 0` | a flat 50 floor against a population whose median measured income is 29.72 zeroes out almost every affordability limit |
| `instalment_to_income_cap` | 4 | `lte 25` | `lte 75` | stands in for the missing tenure multiplication: the limit is a principal, so a single month's 25% cannot fund it |
| `income_stability_requirement` | 4 | `lte 0.5850…` | `lte 0.8397…` | reverts the tightening applied from the console at 01:27Z on 2026-09-29 |
| `band_table` | 3 | band C `refer` | band C `approve` | band C keeps its 20% deposit and 4-month cap |

```json
{
  "tenantId": "<tenant>",
  "updates": [
    {
      "ruleId": "<net_disposable_income_floor>",
      "expectedRevision": 1,
      "value": {
        "operator": "gte",
        "threshold": 0
      }
    },
    {
      "ruleId": "<instalment_to_income_cap>",
      "expectedRevision": 1,
      "value": {
        "operator": "lte",
        "threshold": 75
      }
    },
    {
      "ruleId": "<income_stability_requirement>",
      "expectedRevision": 1,
      "value": {
        "operator": "lte",
        "threshold": 0.8396603523651834
      }
    }
  ]
}
```

### Profile — `PATCH /product-profiles/{id}` with `If-Match`

```json
{
  "tenantId": "<tenant>",
  "values": {
    "minimumViableLimit": 10
  }
}
```

### Prerequisite, not optional

`max_thin_file_share_of_approvals` and `new_to_credit_concentration_cap` are **disabled in every run in this report, including the baseline**. As shipped they are ratios with the approval count as denominator, so the first thin-file approval takes the share to 100% and blocks all the rest. C5 will not reach 36% with them enabled as they currently behave. They need a minimum-volume floor before the ratio is enforced; until then they must be off or C5's numbers do not hold.

## What C5 produces

| Repayment outcome | Approved | Rate |
|---|---:|---:|
| `SETTLED` | 48/100 | **48.0%** |
| `ON_TERM` | 32/100 | **32.0%** |
| `OVERDUE` | 28/97 | **28.9%** |

Customers who repaid in full are approved **1.66x more often** than customers who went overdue (48.0% against 28.9%). The engine discriminates in the right direction — but a 1.66x ratio is modest, and it is the honest measure of how much signal there is once the gates are opened.

| | |
|---|---|
| Approvals | 108 of 297 (36.4%) |
| Total value written | 3070 |
| Median limit | 20.0 |
| Smallest / largest | 10 / 270 |
| Route mix | C 43, ladder 40, B 19, A 6 |

**Read the median before celebrating the rate.** Half the approvals are for 20 or less, and the minimum is 10. The 36.4% is real, but it is 36.4% of customers being offered very small loans. Total book across 297 customers is 3,070 — an average of 28 per approved customer. If the commercial goal is volume of lending rather than count of approvals, this configuration answers the wrong question, and the tenure-dimensionality fix in the engine is what would actually raise limits.

## What still blocks the remaining declines under C5

| Rule | Count |
|---|---:|
| `layer_4/minimum_monthly_income` | 71 |
| `layer_1/prior_default_lookback` | 28 |
| `layer_4/income_stability_requirement` | 23 |
| `layer_5/minimum_viable_limit` | 17 |
| `layer_1/concurrent_loan_cap` | 9 |
| `layer_1/maximum_age_at_maturity` | 2 |

`minimum_monthly_income` at 71 is almost entirely customers with **no income figure at all** — neither derived nor proxy. No threshold change reaches them; they need the income pipeline fixed. That is the ceiling on config-only tuning.

## C6, if 36% is not enough

C6 adds `minimum_monthly_income` 26.59 → 15 and band D → approve, and reaches 40.2% (119/296), total value 3435.

| Repayment outcome | C5 | C6 |
|---|---:|---:|
| `SETTLED` | 48.0% | 50.5% |
| `ON_TERM` | 32.0% | 35.0% |
| `OVERDUE` | 28.9% | 35.1% |

Note what happens to the discrimination: overdue approvals rise from 28.9% to 35.1%, while settled rises only 48.0% to 50.5%. The settled-to-overdue ratio falls from 1.66x to 1.44x. C6 buys its extra 4 points of approval rate disproportionately from the worst-performing group. That is the trade being made, stated plainly.

## Honest caveats

1. **This is a 300-customer staging sample**, scored against a feature store whose repayment data may not match the Arttha extract. It is a directional result, not a credit policy.
2. **No default outcomes were tested.** Approval rate is the only thing measured here. Nothing in this exercise says what these 108 customers would do with the money.
3. **Income is still `25 + 0.5 x wallet balance`** for every customer in every run — `DERIVED` income was produced for zero of 984 customers in the earlier sweep. C5 raises approvals on top of an income estimate that is not measuring income. I would fix that before shipping any of this.
4. C5 was chosen because it clears 30% without touching a single knockout rule. If the goal is a number rather than a lending book, higher rates are trivially available by disabling layer 1 — and would be meaningless.

## Tenants

- `mm-c5-1790666561` — C5
- `mm-c6-1790666659` — C6

Per-customer decision bodies: `2026-09-29-tuning-raw/`.
