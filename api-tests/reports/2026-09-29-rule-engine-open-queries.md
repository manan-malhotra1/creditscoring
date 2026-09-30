# Rule Engine, query register

Raised in **Brainstorming and status update**, 29 September 2026, 11:02, duration 1h 15m.

* **Present:** Manan Malhotra (Ecocash / Sasai), Kevin Merchant, Arshath Ahamed, Yaswanth R (Technodysis)
* **Referenced but not present:** Rajneesh, Atul
* **Ecocash QAT begins 4 October 2026**

Status key:

* **Answered.** A clear answer was given.
* **Partial.** Answered in part, or the answer raised a further question.
* **Open.** Asked and not answered, or the answer was not acceptable.

---

## Section A. Documentation and process

### A1. Document versioning. *Agreed, action on Technodysis*

1. Every deliverable document must carry a version number, a date and a change log.
2. Multiple documents currently share the same filename with no version, so the latest cannot be identified without searching email.

**Question A1.1.** Will all future documents be issued as versioned, non editable PDFs with a change log? Excel is not acceptable as a deliverable format because it cannot be versioned.

### A2. Named individuals in documents. *Agreed, action on Technodysis*

1. The Starter Values document states values were "already agreed with Manan".
2. A personal name cannot appear as the basis for a control parameter.

**Question A2.1.** Will this wording be removed and replaced with a documented approval reference?

### A3. Document sign off. *Open*

**Question A3.1.** Who reviews and approves each document before it is issued, and where is that approval recorded? At present no reviewer or approver is named on any document, so it is not possible to tell whether a document represents an agreed position or a draft.

---

## Section B. Configuration integrity

### B1. Deployed configuration does not match the Starter Values document. *Open*

Kevin's answer was: "these are the values we began with; if after some testing somebody changed the values in the thresholds, then I'm not sure if that happened."

**Question B1.1.** Which values in the `legacy` tenant have been changed since the Starter Values document was issued, by whom, and on what date?

**Question B1.2.** Is the Starter Values document intended to describe what is deployed, or a target to be configured? If it is a target, when will `legacy` be brought into line with it?

### B2. Unexplained precision in three thresholds. *Open*

Three live thresholds carry sixteen decimal places and appear in no document:

1. `minimum_monthly_income` is **26.59117934431525**. The document says USD 100.
2. `income_stability_requirement` is **0.5850226034445457**. The document says 0.5. This was changed to its current value on 29 September at 01:27 UTC.
3. The same rule held **0.8396603523651834** before that change.

**Question B2.1.** Who set these three values, on what basis, and what approval did they go through? Values of this precision suggest a fitted or converted output written straight into configuration.

### B3. A reference tenant for the agreed starter configuration. *Agreed on a separate call, action on Technodysis*

Superseded in part by the agreement recorded at C1. The reference tenant is still required, but it should carry the agreed 50% starter configuration rather than the values in the current Starter Values document.

**Request B3.1.** Deliver the starter configuration described at C1 as a named tenant and product profile that we can assess against directly, and tell us the `tenantId`.

**Request B3.2.** Supply the full parameter list for that configuration, every layer and every rule, so Ecocash and ourselves are working from the same baseline rather than from a document that may not match what is deployed.

### B4. Audit trail. *Answered*

1. Arshath confirmed API logs record every change.
2. The logs are immutable and cannot be edited or deleted.

### B5. Maker checker for production. *Open*

1. Rule changes in production cannot be made by a single person without review.
2. It is accepted that staging is currently open for testing.

**Question B5.1.** What is the proposed maker checker or approval workflow for rule changes in production, and when will it be available?

### B6. Revisioning. *Partial*

1. Two conflicting statements were given in the same conversation: that revisions were not working, and that a fix was uploaded the previous night.
2. Arshath then said revisioning exists for rules and product profiles but not decisions.
3. Revisioning is only required for resources that can be changed, which is product profiles and rule sets, so decisions being excluded is correct.

**Question B6.1.** Please confirm in writing which endpoints currently enforce revision checking, as of which build, and state clearly whether this is complete or partial.

---

## Section C. Starter values and the USD 20 problem

### C1. Starter configuration targeting a 50% approval rate. *Agreed with Rajneesh on a separate call, action on Technodysis*

In the session, Kevin's answer on the basis of the current values was:

> "When these values were defined, we had no idea what the customer behaviour normally is. Rajneesh had mentioned that these values are supposed to be given to us either by EcoCash or you or someone, because we are not exactly the finance experts."

This left ownership of the calibration undefined. It has since been settled on a call with Rajneesh. The agreed position is:

1. Technodysis will provide a **starter configuration that produces an approval rate of approximately 50%**.
2. Approvals should be **distributed sensibly across bands A, B, C and D**, rather than concentrated in a single band as they are today.
3. The configuration must explicitly handle **no file and thin file customers**, not only scored customers. In testing these are 22.4% and 28.1% of the assessable base respectively, against 49.5% scored, so together they are the majority.
4. This configuration becomes the opening position taken to Ecocash. It is then tightened or loosened according to their risk appetite.
5. The 50% figure is a starting point for a commercial conversation, not a target to be defended.

**Question C1.1.** How should band E be treated in this configuration? It is currently decline by definition, at a score range of 0 to 30.

**Question C1.2.** What date will the starter configuration be delivered, and can it be delivered as a working tenant rather than a document? See B3.

**Question C1.3.** Please state, for the delivered configuration, the expected approval rate for each of the three routing populations separately: scored, thin file and no file. A blended 50% that is 90% scored and 5% thin file would not be usable.

**Note on method.** Two findings from our own testing are relevant to how the 50% is reached:

1. An approval rate of 36.4% was achieved **without touching a single eligibility or fraud rule**, by correcting the affordability treatment described at C3 and restoring band C to approve as the current Starter Values document already specifies. Reaching 50% from that base is realistic once C3 is fixed.
2. When the same target was approached by loosening risk rules instead, the additional approvals came **disproportionately from customers who had already gone overdue** on previous Ecocash loans, while approvals for customers who had repaid in full barely moved. The ratio of settled to overdue approvals fell from 1.66 to 1.44. We would prefer the 50% to be reached through correct affordability arithmetic rather than weaker eligibility screening.

### C2. The USD 20 bulge. *Acknowledged, action on Technodysis*

Testing across 26,000 real customers shows a severe concentration:

1. 73.8% of all approvals are for exactly USD 20.
2. 92.4% are for USD 30 or less.
3. This holds for customers with model confidence scores above 90 and proxy income above USD 150.
4. A distribution cannot be shaped like this. Band A should not produce the same limit as band C.

**Request C2.1.** Run the engine over 200,000 of the customer records already supplied and review the resulting limit distribution before QAT.

### C3. Affordability is a monthly figure compared against a principal. *Open, highest priority*

This is the root cause of C2.

1. `affordabilityLimit` is the amount a customer can service **per month**.
2. Layer 5 then compares it against the **total loan principal**, with no multiplication by tenure.
3. A customer who can afford USD 25 per month over a four month term can support a principal of USD 100, not USD 25.

Verified from live traces:

```
affordabilityLimit = min(0.25 x monthlyIncome, monthlyIncome - 50 - existing obligations)
```

Measured effect:

1. A customer needs USD 120 per month of income to qualify for the smallest loan the product offers, which is USD 30, against a measured median income of USD 29.72.
2. Across all approvals the engine writes 18.4% of the credit its own banding layer proposes. Indicative limits totalling 16,670 became approved limits totalling 3,070.

Clearest example, a band A customer scoring 91.7 with a zero deposit:

```json
{ "band": "A", "score": 91.69, "approvedLimit": 20, "tenure": 6,
  "affordabilityLimit": 25.05,
  "capsApplied": [{ "source": "layer_3_or_3a.indicative_limit", "value": 350 }] }
```

Banding proposed 350. The engine approved 20.

**Question C3.1.** Is affordability intended to cap the monthly instalment, or the loan principal?

**Question C3.2.** If it caps the instalment, where is the comparison against `approvedLimit / tenure` made? If it caps the principal, where is the multiplication by tenure?

**Question C3.3.** When will this be corrected and retested?

### C4. Refer should be switched off for launch. *Agreed, action on Technodysis*

1. Rajneesh previously confirmed that refer is not a state we will operate initially, and that it would be switched off by configuration.
2. In the deployed band table, band C and band D both route to refer.
3. `refer_band_boundaries` forces band D to refer regardless of the band table.
4. There is no manual review function at Ecocash or Sasai to process referred cases one by one.

**Request C4.1.** Switch refer off for launch so that bands resolve to approve or decline only, and confirm which configuration flag controls this.

### C5. Manual review capacity. *Open*

1. `manual_review_capacity` is set to 50 per day.
2. The engine currently refers roughly a third of assessable customers.

**Question C5.1.** What happens to a referred case once daily capacity is exceeded: decline, queue, or approve?

---

## Section D. Balance proxy and income

### D1. Business language definition of the balance proxy. *Open*

Kevin's answer, quoted:

> "As far as I'm aware, this 0.5 value is a random value. It is not something that is enforced. That is something we want the expert opinion on. I will have to ask Atul exactly how he got these values."

A linear algebra explanation is not usable. The people configuring this are finance professionals, not mathematicians.

**Question D1.1.** Explain `balance_proxy_coefficient` and `balance_proxy_intercept` in business English. What does each represent, and what happens to the customer's offer if the coefficient moves from 0.5 to 0.6, to 1.0, or to 2.0?

**Question D1.2.** Who owns these two values, and when will the regression that produces the coefficient actually be run?

### D2. Derived income never produces a figure. *Open*

1. Across 984 customers sampled in detail, `DERIVED` income was produced for exactly zero.
2. Every assessment falls back to the balance proxy.
3. 100% of lending decisions therefore rest on a value Technodysis describes as random.

**Question D2.1.** What is the exact formula for derived income, and which features feed it? The rules spreadsheet says "exact formula owned by rule engine, likely built from `inflow_total_30d` or similar, confirm derivation". The word "likely" is not an acceptable description of the largest decline reason in the engine.

**Question D2.2.** Why does `income_confidence_threshold` of 70 never appear to be met?

**Question D2.3.** The Starter Values document states: *"until that runs, set it so the proxy path returns no figure and the customer declines on minimum income. Better to fail visibly than to lend against a made up multiplier."* The deployed system does the opposite. Was that a deliberate decision, and by whom?

---

## Section E. Features, parameters and definitions

### E1. Master list of configurable parameters. *Agreed, action on Technodysis*

Kevin committed to producing a versioned Word document listing every rule in Layer B, what it does, why it is needed, and how it is calculated from the underlying features or raw data.

**Request E1.1.** Expose this as an API returning, per layer, the configurable parameter keys, their units, valid ranges and permitted value sets. Without it a user interface cannot be built, because there is no way to know what to populate.

### E2. Relationship between the 78 feature matrix and the rule engine parameters. *Open, escalation*

1. A feature list was supplied by Technodysis. Ecocash mapped all 78 features layer by layer and returned it on 9 September.
2. The rule engine parameter sheet issued on 27 September uses different names and a different set.
3. Kevin explained that the original features were built for the machine learning model, that only some are used in rules, and that a second tier of derived parameters was created on top of them.
4. This change was not communicated when it was made. Twenty days of work were based on a mapping that no longer reflects the system.

**Question E2.1.** Provide a mapping document. For each of the 78 original features, state whether it is used in the rule engine, under what name, and in which layer.

**Question E2.2.** What is the second tier of derived parameters, how is each derived, and where is it documented?

**Question E2.3.** What is the agreed mechanism for notifying Ecocash when a design decision of this size is taken?

### E3. `currently_delinquent`. *Open*

1. The rules spreadsheet states it "reads `dpd_7_count` and turns it into a 0/1 flag: 1 if any previous loan ever went more than 7 DPD. It isn't current DPD."
2. The rule is named "currently delinquent" and its documented unit is "days past due".
3. The deployed threshold is **2**.
4. A threshold of 2 against a flag that can only be 0 or 1 can never fire.
5. Arshath's explanation, "this DPD count is like how many times the customer has paid after two days in seven days", matches neither the spreadsheet nor the rule name.

**Question E3.1.** State precisely, in English, what `currently_delinquent` reads and what it compares.

**Question E3.2.** Is the deployed threshold of 2 correct, and if the underlying value is a 0 or 1 flag, what is this rule currently doing?

### E4. `previous_dpd_max`. *Open*

**Question E4.1.** What does `previous_dpd_max` mean in plain English: maximum days past due, across what population of loans, and over what window?

### E5. `prior_default_lookback` units. *Open*

1. Documented as "days since last default, converted to months", unit Months.
2. In live traces the observed values are 9, 25, 26, 28 and 63, against a condition of `{"months": 1}`.
3. Customers are failing at 26 and passing at 63, so days are being compared against a threshold expressed in months. The conversion is not happening.
4. This same class of defect was raised in a previous session.
5. It is currently declining roughly 16% of otherwise eligible customers.

**Question E5.1.** Confirm the unit of the observed value and the unit of the threshold, and correct one of them.

### E6. `dormant_then_suddenly_active`. *Open*

1. The Starter Values document describes it as "inactive 30 days, then 5+ active days in 7".
2. The rules spreadsheet describes the implementation as "2 or fewer active days in days 31 to 90 and 5 or more active days in the last 30".
3. These are two different rules.

**Question E6.1.** Which is implemented, and which is intended?

### E7. KYC status. *Partial, action on both sides*

Three vocabularies are in play and none of them match:

1. Rules spreadsheet enum: GOLDSUBS, BANKSUBS, CARDSUBMAS.
2. Deployed rule value: `"fully_verified"`.
3. Actual production data: GOLDSUBS (3.9M), SELFREGSUB (1.9M), BANKSUBS (1.5M), CARDSUBMAS (484k), FARMERS, SASUBS, SUBSCHILD, PEPSUBS and others.

If this rule were enabled today it would decline 100% of customers. It is disabled, which is the only reason it has not surfaced.

Agreed in the meeting:

1. SELFREGSUB is treated as no KYC.
2. All other levels are treated as full KYC.
3. Ecocash will issue data dictionary version 4.0 defining full KYC against each level.

**Request E7.1.** Once the dictionary is received, implement `kyc_status` as a two value field, fully verified or not verified, and confirm the mapping used.

### E8. Placeholder rules. *Answered, needs a date*

Five layer 1 knockouts are placeholders with no data, and all are disabled:

1. Deceased indicator
2. Blacklist or debarment
3. Fraud or AML flag
4. Staff and related parties
5. Device change frequency

**Question E8.1.** When will data be available for each, and what is the plan for fraud and AML screening at QAT and at launch? We would be lending with no fraud or AML screening in place.

### E9. Layer 3a scorecard is empty. *Open, not raised in the meeting*

1. All eight scorecard point tables in layer 3a are disabled with empty row sets.
2. In testing, 397 of 984 customers were routed to `scoreSource: SCORECARD`.
3. Every one of those 397 returned a null score and a null band.
4. Forty percent of customers are therefore routed to a scorecard that cannot produce a result, so they can never be banded.

**Question E9.1.** When will the scorecard tables be populated, and what should happen to thin file customers until they are?

---

## Section F. Platform and API defects

### F1. Concurrency and throughput. *Partial, no baseline given*

1. At 14 concurrent assessments, 4% to 5% of requests return HTTP 500.
2. The service log gives `Transaction API error: Unable to start a transaction in the given time`.
3. Sustained throughput measured at 2.9 assessments per second.
4. Yaswanth stated Postgres concurrency is set to the default of 50, that connection timeout could be increased, and that staging shares an environment with other products.

**Question F1.1.** What is the baseline sustained TPS on the currently provisioned hardware? A number is needed, not a configuration option.

**Question F1.2.** What is the maximum concurrent assessment rate we should design automation against?

**Question F1.3.** Is there a gateway capable of throttling in front of the engine?

**Question F1.4.** Will the engine have a dedicated environment for QAT, and for production?

### F2. Unknown fields accepted silently. *Open, answer not accepted*

1. Sending profile values at the top level of the payload instead of nested under `values` returns HTTP 201 with defaults applied and no warning.
2. Arshath's answer was that the rule structure is dynamic JSON with no structured validation, so unknown fields are accepted and errors surface later at decision time.
3. This is not acceptable. A caller can write arbitrary content into the database and receive a success response.
4. There is no payload size or content integrity check.

**Question F2.1.** Will payloads be validated against a per layer whitelist of permitted keys, rejecting anything else with a 400?

**Question F2.2.** What limits exist today on payload size and content?

**Question F2.3.** If dynamic rule structures are genuinely required, how is the permitted key set enforced?

### F3. No file customers receive a hard error instead of a decision. *Open, action on Technodysis*

1. Customers with no rows in `loan_features` return `HTTP 404, No loan_features rows found for customer_key`.
2. This is precisely what a no file customer looks like, and the engine has a `NO_FILE` routing path built for it.

Intended design, per Rule Engine V version 2.1:

1. No file customers receive a starter limit and enter the credit ladder.
2. Thin file customers are scored by the layer 3a weighted scorecard.

**Question F3.1.** Will no file customers be routed to `NO_FILE` with a starter limit and ladder, rather than returning a 404?

**Question F3.2.** Has a customer ever been classified `NO_FILE` in testing? None was observed.

### F4. Layer 6 thin file share cap deadlocks a new book. *Acknowledged, action on Technodysis*

1. `max_thin_file_share_of_approvals` is 40%, computed as a share of approvals.
2. On a new tenant, if the first approval is a thin file customer, the share is 100% of 1.
3. Every subsequent thin file approval is then blocked permanently.
4. The book cannot dilute the ratio, because the approvals needed to do so are the ones being blocked.
5. This will occur in production on day one, not only in testing.

**Request F4.1.** Apply a minimum approval volume floor before the ratio is enforced, and confirm the floor value.

### F5. Product profile lifecycle. *Open, not raised in the meeting*

1. The `legacy` tenant currently holds six ACTIVE product profiles simultaneously.
2. The Developer Guide states that creating a profile marks the previous one SUPERSEDED, and a clean test confirms that behaviour works correctly.
3. The six appear to originate from the 22 September migration, which bypassed the supersede logic.
4. Assessments silently bind to whichever profile the engine selects.
5. Separately, there is no way to delete or retire a product profile, a rule set or a tenant. No DELETE route exists and PATCH will not change status.
6. Testing has left 25 throwaway tenants and 26 product profiles on staging that cannot be removed through the API.

**Question F5.1.** Which of the six profiles is authoritative, and will the duplicates be cleaned up?

**Question F5.2.** Is a deletion or retirement endpoint planned?

---

## Section G. Population statistics to be provided

### G1. Why this is being asked

1. The balance proxy currently returns a median monthly income of about USD 29.72, and a minimum of exactly USD 25.00.
2. USD 25.00 is the value of `balance_proxy_intercept`. A floor sitting exactly on a model constant is a sign that the input is contributing almost nothing.
3. Back solving the proxy formula, the median customer is being credited with an average wallet balance of USD 9.45.
4. A wallet balance is a stock at a point in time. Income is a flow over a period. Taking half a balance snapshot and calling it monthly income has no economic basis, and the resulting distribution does not look like an income distribution.
5. Ecocash will reasonably ask how a device financing product can be built on this. We need population level figures to answer that, and to show whether the problem is risk appetite or measurement.

**Question G1.1.** Are the inferred parameters, in particular derived income and the balance proxy, being computed correctly? The distribution below suggests they are not.

### G2. What we have measured so far

These come from our own testing and are offered so the format of the request is unambiguous. They are based on a sample, not the full population, which is why the full figures are being requested.

**Monthly income produced by the engine, n = 350 scoreable customers**

| No. | Income band | Customers | Share |
|---:|---|---:|---:|
| 1 | Below 26.59, the `minimum_monthly_income` threshold | 65 | 18.6% |
| 2 | 26.59 to 30 | 119 | 34.0% |
| 3 | 30 to 40 | 96 | 27.4% |
| 4 | 40 to 50 | 26 | 7.4% |
| 5 | 50 to 80 | 36 | 10.3% |
| 6 | 80 to 120 | 5 | 1.4% |
| 7 | 120 and above | 3 | 0.9% |

Read the last two rows together with this fact: under the current configuration a customer needs **USD 120 of monthly income to qualify for the smallest loan the product offers, which is USD 30**. On these figures that is 0.9% of the scoreable population.

**Decile table, with the wallet balance implied by the proxy formula**

| No. | Percentile | Monthly income | Implied average wallet balance |
|---:|---|---:|---:|
| 1 | Minimum | 25.00 | 0.00 |
| 2 | 10th | 25.68 | 1.35 |
| 3 | 20th | 26.66 | 3.32 |
| 4 | 30th | 27.46 | 4.92 |
| 5 | 40th | 28.48 | 6.96 |
| 6 | 50th, median | 29.72 | 9.45 |
| 7 | 60th | 31.18 | 12.35 |
| 8 | 70th | 34.19 | 18.38 |
| 9 | 80th | 40.03 | 30.06 |
| 10 | 90th | 57.51 | 65.01 |
| 11 | Maximum | 678.82 | 1,307.65 |

Concentration:

1. 52.6% of customers fall between USD 25 and USD 30, a five dollar band.
2. 71.1% fall between USD 25 and USD 35.
3. 80.0% fall between USD 25 and USD 40.

A genuine income distribution is not shaped like this. Half the population sitting within five dollars of the model's own intercept indicates that the balance input is contributing very little and the constant is doing the work.

**Other measured distributions, n = 4,733 assessed borrowers**

| No. | Measure | Result |
|---:|---|---|
| 1 | Income basis: balance proxy | 63.5% |
| 2 | Income basis: none produced at all | 36.5% |
| 3 | Income basis: derived | 0.0% |
| 4 | Routing: scored | 49.5% |
| 5 | Routing: thin file | 28.1% |
| 6 | Routing: no file | 22.4% |
| 7 | Band A | 3.5% |
| 8 | Band B | 10.2% |
| 9 | Band C | 22.7% |
| 10 | Band D | 5.3% |
| 11 | No band produced | 58.2% |
| 12 | Model score, median where produced | 62.0 |
| 13 | Affordability limit, median | 23.18 |
| 14 | Approved limit, median | 20 |
| 15 | Approved limit, mean | 23.70 |

### G3. Statistics requested across the full population

**Request G3.1.** Provide the following across the entire customer base held in `loan_features`, not a sample. For every numeric measure, give count, minimum, 10th, 25th, 50th, 75th, 90th and 99th percentile, maximum, and mean. Percentages should state both numerator and denominator.

**Coverage and population base**

| No. | Statistic | Purpose |
|---:|---|---|
| 1 | Total Ecocash individual customers, against total rows present in `loan_features` | Establishes how much of the base can be assessed at all |
| 2 | Count by routing outcome: scored, thin file, no file, and not present in the feature store | Shows the size of each population before any rule applies |
| 3 | Distribution of `feature_completeness` | Shows whether the 40 and 70 thresholds sit in sensible places |

**Income, the priority set**

| No. | Statistic | Purpose |
|---:|---|---|
| 4 | Count and distribution of **derived** income, where the engine produced one | We have observed zero. We need to know whether that holds at population scale |
| 5 | Distribution of **balance proxy** income | The figure currently driving every decision |
| 6 | Distribution of `income_confidence`, and the count clearing the threshold of 70 | Explains why derived income is never used |
| 7 | Distribution of `income_cv_monthly`, the stability measure, and the count clearing the threshold | Quantifies how many customers this rule removes |
| 8 | Distribution of the four balance features feeding the proxy: `balance_avg_30d`, `balance_median_30d`, `balance_avg_90d`, `balance_median_90d` | Shows the raw input, so we can see whether the proxy or the data is the problem |
| 9 | Distribution of `inflow_total_30d` and `inflow_total_90d` | This is what a genuine income estimate should be built from. We would like to see it beside the proxy |
| 10 | Distribution of existing obligations deducted at layer 4 | Currently invisible in the decision output |

**Affordability and limits**

| No. | Statistic | Purpose |
|---:|---|---|
| 11 | Distribution of `affordabilityLimit` | The binding cap on almost every approval |
| 12 | Distribution of the indicative limit produced by layer 3 or 3a, **before** affordability is applied | Shows the size of the gap between what banding proposes and what is offered |
| 13 | Distribution of the final `approvedLimit` | The output Ecocash will see |
| 14 | Cross tabulation: band A to E against approved limit band | Should show larger limits at better bands. Currently it does not |
| 15 | Cross tabulation: income decile against approved limit | Shows whether income or score is driving the offer |

**Scoring**

| No. | Statistic | Purpose |
|---:|---|---|
| 16 | Distribution of the model score across the full population | Lets us judge whether the band boundaries are placed sensibly |
| 17 | Distribution of `predicted_confidence_score` | Same, for the confidence band table |
| 18 | Count of customers by band A to E across the full population | The band mix Ecocash should expect |

**Decisioning**

| No. | Statistic | Purpose |
|---:|---|---|
| 19 | Decision mix across the population: approve, refer, decline | The headline number for Ecocash |
| 20 | Count of declines by binding rule, ranked | Tells us which single rule to fix first |
| 21 | Layer by layer funnel: how many customers reach each layer, and how many are lost at each | Shows where the population is being removed |

**Calibration evidence, the most important item**

| No. | Statistic | Purpose |
|---:|---|---|
| 22 | Historical default or delinquency rate by band A to E, computed from the Kashagi repayment history already supplied | This is the only evidence that the band boundaries mean anything. Without it the bands are an even split with no risk content |
| 23 | Distribution of `previous_dpd_max` and `dpd_7_count` across the population | Needed to set `currently_delinquent` and `prior_default_lookback` to sensible values |
| 24 | Observed repayment outcome by model score decile | Confirms whether the model ranks risk correctly on our own book |

### G4. Format of the response

**Request G4.1.** Supply the above as a spreadsheet of values plus a short written commentary, with:

1. The date of the data extract and the number of customers it covers.
2. The definition, in one sentence of business English, of every measure reported.
3. The unit of every measure.
4. A statement of which figures are computed from live data and which are placeholders.

Charts are welcome but the underlying numbers must be supplied, because Ecocash will be shown these figures and we need to be able to reproduce them.

---

## Section H. Summary of actions

| No. | Action | Reference | Owner |
|---:|---|---|---|
| 1 | Correct the affordability monthly versus principal calculation | C3 | Technodysis |
| 2 | Versioned documents with change log, remove personal names | A1, A2 | Technodysis |
| 3 | Rule dictionary in business English, with the effect of each value on the offer | E1, D1 | Technodysis |
| 4 | Mapping between the 78 features and the rule engine parameters | E2 | Technodysis |
| 5 | Switch refer off for launch | C4 | Technodysis |
| 6 | Minimum volume floor on the layer 6 share caps | F4 | Technodysis |
| 7 | Route no file customers to `NO_FILE` rather than 404 | F3 | Technodysis |
| 8 | Baseline TPS figure and QAT environment confirmation | F1 | Technodysis, Yaswanth |
| 9 | Payload validation against a permitted key set | F2 | Technodysis |
| 10 | Starter configuration targeting 50% approval, delivered as a working tenant | C1, B3 | Technodysis |
| 11 | Re run limit distribution over 200,000 supplied records | C2 | Technodysis |
| 12 | Data dictionary v4.0 defining full KYC by level | E7 | Ecocash, Sasai |
| 13 | Confirm treatment of band E, and expected approval rate per routing population | C1 | Technodysis |
| 14 | Population statistics pack, coverage, income, limits, scoring, decisioning | G3 | Technodysis |
| 15 | Default rate by band from the Kashagi history, to validate the band boundaries | G3, item 22 | Technodysis |
| 16 | Confirm whether derived income and the balance proxy are computed correctly | G1 | Technodysis |

---

## Section I. Supporting evidence

All figures in this register come from testing against the staging engine on 28 and 29 September:

1. Approximately 27,000 assessments across 26,000 distinct Ecocash customers.
2. A ten scenario controlled A/B test of rule changes, each on an isolated tenant.
3. The `legacy` rule set was not modified at any point.

| No. | Report | Contents |
|---:|---|---|
| 1 | `2026-09-29-msisdn-decision-report-1000.md` | 1,000 borrowers, full decision bodies |
| 2 | `2026-09-29-rule-change-ab-test.md` | Ten scenario controlled A/B test |
| 3 | `2026-09-29-approval-rate-tuning.md` | Configuration reaching 36.4% approval |
| 4 | `2026-09-29-C5-universe-run.md` | 21,000 universe customers, 5,000 borrowers |
| 5 | `2026-09-29-C5-approved-limits.md` | Every approved limit and its binding cap |
