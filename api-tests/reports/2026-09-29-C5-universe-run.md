# C5 against the Ecocash customer universe

2026-09-29, staging, tenant `mm-c5run-1790668153`, configuration **C5**. Identical request for every customer: `requestedAmount` 300, `requestedTenure` 4, `channel` app.

Two populations, both drawn with a fixed seed:

| Population | Source | Sampled |
|---|---|---:|
| Ecocash universe | `identiy_dump_28_07_2026.csv.filepart`, `customer_type = Individual` — 8,817,730 unique MSISDNs | 21,000 |
| Known borrowers | `Arttha_RepaymentsNOTTO_MTD_2026_Jul_23.csv.filepart` — 230,304 unique | 5,000 |

## The headline is coverage, not limits

**97.8% of Ecocash Individual customers cannot be assessed at all.**

| | Universe | Borrowers |
|---|---:|---:|
| Sampled | 20,000 | 5,000 |
| HTTP 201 (a decision) | 440 | 4,733 |
| HTTP 404 `No loan_features rows` | 19,326 | 62 |
| **Assessable** | **2.20%** | **94.66%** |

95% CI on universe coverage: **2.01% – 2.41%**.

The feature store is, in effect, the set of people who have already borrowed. Borrowers are 94.7% covered; the general customer base is 2.2%. Extrapolated to all 8,817,730 Individual customers, roughly **176,857–212,741 are scoreable** — which lines up with the 230,304 unique borrowers in the repayment file. Everyone else returns an error, not a decision.

## Approval rate is stable wherever it can be measured

| Sample | Assessable | Approved | Rate of assessable |
|---|---:|---:|---:|
| 300 repayment-file customers (earlier test) | 297 | 108 | 36.4% |
| 5,000 borrowers | 4,733 | 1,792 | **37.9%** |
| 20,000 universe customers | 440 | 163 | **37.0%** |

Three independent samples, 36.4% / 37.9% / 37.0%. C5 behaves consistently. But note what the last row means in absolute terms: **163 approvals from 20,000 customers — 0.81% of the universe sampled.**

## Approved limits

### Borrowers — 1,792 approvals (the reliable sample)

| | |
|---|---|
| Total approved | **42,480** |
| Mean | 23.7 |
| Median | 20 |
| Min / Max | 10 / 170 |

| approvedLimit | Customers | Share | Cumulative |
|---:|---:|---:|---:|
| 10 | 51 | 2.8% | 2.8% |
| 20 | 1,323 | 73.8% | 76.7% |
| 30 | 281 | 15.7% | 92.4% |
| 40 | 81 | 4.5% | 96.9% |
| 50 | 29 | 1.6% | 98.5% |
| 60 | 9 | 0.5% | 99.0% |
| 70 | 6 | 0.3% | 99.3% |
| 80 | 3 | 0.2% | 99.5% |
| 90 | 1 | 0.1% | 99.6% |
| 100 | 1 | 0.1% | 99.6% |
| 110 | 2 | 0.1% | 99.7% |
| 120 | 1 | 0.1% | 99.8% |
| 150 | 1 | 0.1% | 99.8% |
| 170 | 3 | 0.2% | 100.0% |

**92.4% of all approvals are 30 or less, and 73.8% are exactly 20.** The distribution has almost no spread: 99.5% sit at 80 or below, and the largest limit written across 1,792 approvals is 170.

### Universe — 163 approvals

| | |
|---|---|
| Total approved | 3,930 |
| Mean | 24.1 |
| Median | 20 |
| Min / Max | 10 / 150 |

| approvedLimit | Customers |
|---:|---:|
| 10 | 4 |
| 20 | 121 |
| 30 | 26 |
| 40 | 5 |
| 50 | 4 |
| 70 | 2 |
| 150 | 1 |

## Extrapolated to the full Individual base

| | Point estimate | 95% CI |
|---|---:|---:|
| Customers | 8,817,730 | — |
| Assessable | 193,990 | 176,857 – 212,741 |
| Approved under C5 | **71,864** | 61,679 – 83,715 |
| Implied book at mean 24.1 | **1,732,683** | 1,487,116 – 2,018,413 |

Sampling error only. It assumes the feature store does not change and that the 21,000 sampled are representative of the 8.8M, which the fixed-seed random draw supports but does not guarantee.

## What blocks the rest

| Rule | Universe | Borrowers |
|---|---:|---:|
| `minimum_monthly_income` | 112 | 1,195 |
| `income_stability_requirement` | 46 | 551 |
| `prior_default_lookback` | 54 | 540 |
| `minimum_viable_limit` | 7 | 110 |
| `concurrent_loan_cap` | 4 | 51 |
| `maximum_age_at_maturity` | 4 | 31 |
| `minimum_age` | 0 | 16 |

`minimum_monthly_income` is the largest blocker in both — 1,195 of the borrower declines. As established earlier, most of these are customers for whom no income figure exists at all, so the threshold value is not the problem and lowering it will not reach them.

## Load, and a caveat on the numbers

| | Requests | 500 / 502 | Rate |
|---|---:|---:|---:|
| Universe (14 workers) | 20,000 | 234 | 1.2% |
| Borrowers (14 workers) | 5,000 | 205 | 4.1% |

The service log attributes the 500s to `Transaction API error: Unable to start a transaction in the given time` — database transaction-pool exhaustion under concurrent load. At 14 concurrent requests the borrower run lost **4.1%** to server errors; a pilot at 24 concurrent lost 1.8% on the cheaper 404-heavy path. Those failures are excluded from all rates above, so the percentages are of successfully-served requests.

This matters beyond this test: **the engine starts failing at 14 concurrent assessments.** Any production volume will need connection-pool and transaction work before it is a throughput question at all. Sustained rate observed was 5.3/s on the universe run and 2.9/s on the borrower run, the difference being that a 404 is cheap and a real assessment is not.

## Caveats

1. The tenure-dimensionality issue is **not** fixed here — the engine source is not in this repository, so it cannot be. Every limit above is still a monthly affordability figure used as a principal cap, which is why 73.8% of approvals are exactly 20.
2. No default outcomes were tested. Approval rate and limit size are all that is measured.
3. Income remains `25 + 0.5 x wallet balance` for every customer in every run.
4. The 100,000-customer run was reduced to 21,000 after the pilot showed 96.5% 404s and server-side transaction failures under load. Coverage is pinned to ±0.2 points, which is tighter than the question needs.

Raw results: `2026-09-29-universe-raw/`.
