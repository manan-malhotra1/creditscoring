**Subject: Rule Engine API: reference data we need before we can configure it**

Hi Kevin,

Thanks for the guides and the Swagger link. We have the key working, we can read the
rule frame, and we have mapped all 65 rules into our configuration console. Before we
can actually set values with any confidence, there is a set of reference information
the guide does not cover. I have grouped it below, most blocking first.

---

## 1. A rule-key reference: which feature each rule reads, and in what unit

This is the main ask. The guide lists the rule keys per layer, and the Feature Layer
Mapping we sent you lists 78 features against layers. Nothing joins the two. So for
any given rule we cannot tell which feature it reads or what its number means.

The clearest example: `currently_delinquent` is `{"operator": "lte", "threshold": 2}`.
Two what? Days past due, number of loans currently late, or a DPD bucket? The mapping
sheet has `previous_dpd_max`, `dpd_7_count`, `dpd_30_count` and
`current_outstanding_balance`, any of which could be behind it, and each would make
"2" mean something completely different. We cannot set that value responsibly, and it
is a hard knockout.

There are 16 thresholds in the same position. A few where the unit genuinely matters:

| Rule | Value today | What we cannot tell |
|---|---|---|
| `currently_delinquent` | `lte 2` | days, loans, or DPD bucket |
| `score_staleness_limit` | `lte 2` | cycles or days |
| `concurrent_loan_cap` | `lte 5` | open loans, or open loans on this product |
| `minimum_account_age` | `gte 90` | days, and how it differs from L0 `wallet_tenure` |
| `application_velocity` | `gt 3 / 30d` | applications or disbursed loans |
| `automatic_tightening_trigger` | `gte 1.5` | percent, a ratio, or a multiple |
| `reset_on_delinquency` | `gte 30` | days past due, presumably, but not stated |
| `balance_proxy_coefficient` | `0.5` | what it multiplies, and in what currency units |

Could you send a table of rule key, the feature or fields it reads, the unit, and the
valid range? Ideally as an endpoint we can call, but a spreadsheet would unblock us.

## 2. Signals the rule engine uses that are not in the feature mapping

Several rules clearly read something that is not in the 78 rows we sent you. We need
to know where each comes from, whether it is live today or a placeholder, and who
supplies it:

- `model_confidence` (L0), and `feature_completeness` (L0)
- `deceased_indicator`, `blacklist_debarment`, `fraud_aml_flag`,
  `staff_related_parties` (all L1)
- `device_change_frequency` (L2). This one has an **empty value object**, `{}`, so
  we cannot tell what it would even take
- `profile_change_velocity` (L2). There is no profile-change field in the data we
  supply

Most of these are currently `enabled: false`, which brings us to a related point: as
the rule set stands today, KYC status, account status, deceased indicator, blacklist
and fraud/AML flag are all switched off. A customer with incomplete KYC or an AML flag
would pass L1. Is that deliberate for staging, and what is the intended default for
production?

## 3. Allowed values

The guide gives one example of `action` ("for example `decline` or `refer`"). We have
seen a third, `tighten_by_one_band`, on `automatic_tightening_trigger`. We need the
complete list, and which actions are valid on which layer, since we are building a
dropdown and cannot guess.

The same applies to every other enumerated value. These are the only ones we have
observed, purely by reading the frame:

- `action`: `decline`, `refer`, `tighten_by_one_band`
- `operator`: `gte`, `lte`, `gt`. Are `lt`, `eq`, `between`, `in` supported?
- `floorBehavior`: `route_thin_file`. What else?
- `allowedValues` for `kyc_status`: `fully_verified`. What is the full KYC vocabulary?
- `allowedValues` for `account_status`: `active`. What are the other wallet states?
- `score_source_cap` and `scorecard_cap`: `"C"`. Presumably A to E.
- `aggregationMode` appears in the Swagger schema for `CreateRuleDto` but is not in
  the guide and never appears in the frame. What is it for, and what are its values?

Is there any chance of an endpoint that returns this vocabulary, something like
`GET /rule-versions/schema`? That would let our console build correct dropdowns
instead of free-text boxes, and it would stop us sending you invalid values.

## 4. PATCH specifics

Section 6 says `value` replaces the whole value object, so every setting must be
included even if unchanged. That is clear, and it is exactly why we need section 1:
to resend a value object safely we have to know every field it should contain.

Across the 65 rules there are **14 different value shapes** and **21 distinct field
names**. The guide documents three of them (`sufficiency`, `hardFloor`, `operator`),
and only because they appear in one worked example. The rest we reverse-engineered
from the frame: `expectedValue`, `allowedValues`, `windowDays`, `maxPoints`,
`floorBehavior`, `rowKey`, `multiplierThreshold`, `dormancyThresholdDays`,
`reactivationWindowDays`, `reactivationMinActiveDays`, `currentWindowDays`,
`baselineWindowDays`, `cells`, `columns`, `rows`, `months`, `value`, `threshold`.

Two follow-ups on PATCH:

- What happens if we send a `value` with a missing or misspelled field? Does it
  validate and reject, or store it and fail at decision time?
- Is there any concurrency control? We could not find an ETag or If-Match. If two of
  us edit the same tenant's rules, does the second write silently overwrite the first?

## 5. Three things that look like defects

**a. The rule version id does not version the values.** We pulled the frame on Friday
25th and again today. Same `sourceRuleVersionId` (`9816e919-1b79-4bf8-9f55-efc09f8161a1`),
but five rules have different values:

| Rule | Fri 25 Sep | Today |
|---|---|---|
| `prior_default_lookback` | `{"months": 6}` | `{"months": 1}` |
| `concurrent_loan_cap` | `lte 1` | `lte 5` |
| `application_velocity` | `gt 2` | `gt 3` |
| `minimum_monthly_income` | `gte 100` | `gte 25.58822916666667` |
| `income_stability_requirement` | `lte 0.5` | `lte 0.5850226034445457` |

Since PATCH edits in place, a decision that records `ruleVersionId: 9816e919` cannot
be reproduced later, because the values behind that id have changed. For audit and for
any dispute, we need the version id to be immutable, or a separate way to retrieve the
values as they stood when a decision was made.

**b. Something appears to be writing fitted values into policy parameters.**
`minimum_monthly_income` has been 100, then 26.02197916666667, and is now
25.58822916666667. `income_stability_requirement` has gone from 0.5 to
0.5850226034445457. A minimum monthly income of $25.588229 to fourteen decimal places
is not a credit policy decision. Is a job computing and writing these back? If so,
which parameters are model-owned and which are ours to set? We should not be editing
the same fields a pipeline overwrites.

**c. Product profile is unreachable.** `layer_5` does not appear in the frame at all.
`GET` and `POST /product-profiles`, which the guide makes step 1 of the quick start in
section 4.1, both return `404 Cannot GET /product-profiles`, and the endpoints are
absent from `/docs-json`. `POST /rule-versions` accepts a `productProfile` object and
returns 201, but the value comes back `null`, so it is silently dropped. That leaves
no way to set product maximum, minimum viable limit, exposure cap, rounding, permitted
tenures or deposit floor.

Related, and still outstanding from last week: `POST /decisions` returns 500 on every
request, with `Null constraint violation on the fields: (product_profile_id)` in your
own `/api-logs`. It looks like the same root cause.

---

Happy to take any of this on a call if that is quicker. The one item that unblocks the
most on our side is section 1: without knowing what each rule reads and in what unit,
we cannot set a single threshold with confidence, and we would rather not guess on
hard knockouts.

Best,
Manan
