# DRAFT, not sent

**To:** Rajneesh
**Cc:** Kevin Merchant, Arshath Ahamed, Atul, Yaswanth R
**Subject:** Rule Engine: open queries from today's session, and a blocker ahead of QAT on 4 October

---

Rajneesh,

We ran a status and brainstorming session this morning with Kevin, Arshath and Yaswanth. I have attached a consolidated register of every query raised, marked as answered, partially answered or open, together with the test evidence behind each one.

Ahead of that, the headline.

Over the past four days I have put roughly 27,000 assessments through the staging engine, covering 26,000 distinct Ecocash customers drawn from both the Kashagi repayment file and a random sample of the wider customer base. Three things are working well:

1. The engine runs and the API is stable at low concurrency.
2. The decision trace is genuinely good. It records exactly why each decision was reached, which is what made the analysis below possible.
3. The team engaged with every point raised today and Kevin took clear actions.

The results, however, are not yet a lending product.

## 1. The blocking issue: every customer is offered USD 20

The numbers from testing:

1. 73.8% of all approvals are for exactly USD 20.
2. 92.4% are for USD 30 or less.
3. This holds for customers with model confidence scores above 90.
4. Band A and band C customers receive the same offer.

A distribution cannot be shaped like this, and it is not a calibration problem. The cause is a single defect:

1. The affordability limit is the amount a customer can service **per month**.
2. Layer 5 compares it against the **total loan principal**, with no multiplication by tenure.
3. A customer who can afford USD 25 a month over four months can support a principal of USD 100, not USD 25.

The consequences are measurable:

1. A customer now needs USD 120 of monthly income to qualify for the smallest loan the product offers, against a measured median income of USD 29.72 across real customers.
2. Across all approvals the engine writes 18.4% of the credit its own banding layer proposes.
3. One example: a band A customer scoring 91.7, zero deposit, where banding proposed a limit of 350 and the engine approved 20.

This is item C3 in the attached register and I would treat it as the single blocking issue. When I corrected for it in a controlled test on isolated tenants, approvals moved from 2 in 297 to 108 in 297, without touching a single eligibility or fraud rule.

## 2. Three points I would like your steer on

### 2.1 The starter configuration we agreed on our call

Following our call, my understanding of what we agreed is:

1. Technodysis will provide a **starter configuration that produces an approval rate of approximately 50%**, which I will take to Ecocash as the opening position.
2. Approvals should be **distributed sensibly across bands A, B, C and D**, rather than concentrated in one band as they are today. Please confirm how band E should be treated, since it is currently decline by definition.
3. The configuration must explicitly handle **no file and thin file customers**, not only scored customers. Together these are just over half of the assessable base in our testing: 22.4% no file and 28.1% thin file, against 49.5% scored.
4. Once Ecocash has reviewed it, we tighten or loosen from there according to their risk appetite. The 50% figure is a starting point for a commercial conversation, not a target to be defended.

This supersedes the discussion in the session about who owns the starter values. Kevin was straightforward that the current values were set by yourself, Atul and him, and that when they were defined the team had no view of customer behaviour. That is a reasonable position for a first pass, and this agreement resolves it.

Two things I would ask you to keep in view as the team builds it:

1. **Fixing the affordability calculation should come before loosening rules.** In controlled testing I reached 36.4% approval without touching a single eligibility or fraud rule, purely by correcting the affordability treatment and restoring band C to approve as your own Starter Values document specifies. Reaching 50% from there is realistic once item C3 is fixed.
2. **Reaching 50% by loosening risk rules instead would produce a poor book.** When I tested that route, the additional approvals came disproportionately from customers who had already gone overdue on previous Ecocash loans, while approvals for customers who had repaid in full barely moved. I would rather arrive at 50% through correct affordability arithmetic than through weaker eligibility screening, and I suspect you would too.

### 2.2 The balance proxy

1. Kevin confirmed in the session that the coefficient of 0.5 is, in his words, a random value pending expert input.
2. The Starter Values document itself says it should not be guessed, and that until the regression runs the proxy should be configured to return no figure so the customer declines visibly. The deployed system does the opposite.
3. This matters more than it first appears. Across 984 customers sampled in detail, derived income was produced for exactly zero. Every lending decision currently rests on that placeholder multiplier.
4. I would like to know who owns that value and when the regression will run.

### 2.3 A twenty day gap in communication

1. In early September Technodysis supplied a feature list. I mapped all 78 features to the seven layers and returned it on 9 September.
2. The rule engine parameter sheet issued on 27 September uses different names and a different set, because a second tier of derived parameters was created in between.
3. That may well be the right technical decision and I am not disputing it. It was not communicated, and the mapping I had been working from no longer describes the system.
4. I would like an agreed mechanism for flagging design changes of that size when they are taken, rather than discovering them in a spreadsheet three weeks later.

## 3. A data request, so we can show Ecocash where the numbers come from

The balance proxy currently returns a median monthly income of about USD 27 to 30. Before I take that to Ecocash I need to know whether the inferred parameters are being computed correctly, because the distribution does not look like an income distribution:

1. The minimum income the engine produces is exactly USD 25.00, which is the value of `balance_proxy_intercept`. A floor sitting exactly on a model constant suggests the balance input is contributing very little.
2. 52.6% of customers fall between USD 25 and USD 30. 80% fall between USD 25 and USD 40.
3. Back solving the formula, the median customer is credited with an average wallet balance of USD 9.45.
4. A wallet balance is a stock at a point in time. Income is a flow over a period. I would like to understand the basis on which one is being used to estimate the other.
5. Under the current configuration a customer needs USD 120 of monthly income to qualify for the smallest loan the product offers. On our figures that is 0.9% of the scoreable population.

Section G of the attached register sets out 24 population level statistics we would like supplied across the full customer base rather than a sample. The priority items are:

1. How many customers produce a **derived** income at all, and its distribution. We have observed zero.
2. The distribution of the balance features feeding the proxy, so we can see whether the problem is the formula or the underlying data.
3. The distribution of `inflow_total_30d` and `inflow_total_90d` beside the proxy, since that is what a genuine income estimate should be built from.
4. The gap between the indicative limit that banding proposes and the final approved limit, across the population.
5. **Historical default rate by band A to E, computed from the Kashagi repayment history already supplied.** This is the single most important item. Without it the band boundaries are an even split with no risk content behind them, and we cannot tell Ecocash what a band means.

I need these to answer the question Ecocash will ask first, which is whether a device financing product is viable on this customer base. At the moment I cannot tell them whether the constraint is genuine customer affordability or a measurement problem in the engine, and those have very different answers.

These figures also underpin the starter configuration in 2.1. A 50% approval rate set without knowing the income distribution behind it is a number rather than a position, and Ecocash will ask how it was arrived at.

## 4. Engineering defects, all detailed in the register

1. No file customers receive an HTTP 404 instead of a NO_FILE decision.
2. The layer 6 thin file share cap mathematically deadlocks a new book on day one.
3. `prior_default_lookback` compares days against a threshold expressed in months.
4. `currently_delinquent` has a threshold of 2 against what the documentation says is a 0 or 1 flag.
5. The API accepts unknown fields in a payload and returns 201.
6. We need a baseline TPS figure from Yaswanth. At 14 concurrent assessments roughly 5% of requests fail on Postgres transaction pool exhaustion.

## 5. Documentation

Kevin has agreed to versioned documents with change logs, and a rule dictionary explaining each parameter in business terms and what it does to the customer's offer. That will help considerably. Two additions I would ask for:

1. Documents should carry a named reviewer and a named approver.
2. Personal names should not be used as the basis for a parameter value. The Starter Values document currently states that values were "already agreed with Manan", which is not something that can sit in a control document.

## 6. What I would like to agree with you this week

1. A fix and retest date for the affordability calculation.
2. A delivery date for the starter configuration targeting a 50% approval rate, as agreed on our call, ahead of 4 October.
3. That the starter configuration is delivered as a named tenant and product profile we can assess against directly, with the full parameter list documented, so that Ecocash and ourselves are working from the same baseline rather than from a document that may not match what is deployed.
4. Confirmation of whether refer is switched off for launch, as we previously agreed. Bands C and D currently both route to refer, and there is no manual review function on our side to process them.
5. A date for the population statistics pack in section G, in particular the default rate by band.

I would rather raise all of this now than at QAT. My concern is scope and sequencing against the 4 October date, not effort.

Happy to walk through the evidence on a call at your convenience.

Regards,
Manan

---

**Attachment:** Rule Engine, query register, 29 September 2026
