# Sasai Credit: Rule Engine Console

A maker-checker console for configuring credit decisioning per product. Credit
policy staff set the rules, bands and limits for each product themselves; the
scoring model, the parameter vocabulary and the reason-code wording are shared
across every product and configured once.

**Live:** https://credit-rule-console.web.app

## What it is

One console. The per-product configuration follows the L0 to L6 waterfall from
the Ecocash Credit Scoring Technical Solutioning v2.1, and the layers,
parameter keys and value shapes are generated from the engine's own rule frame
(`GET /rule-versions/frame`), so the console and the engine cannot drift apart.

**Global setup**: shared by every product, not versioned per profile
- **Model & score range**: the one scoring model and its 0 to 100 scale
- **Model health**: AUC / Gini / KS, PSI, calibration, score distribution (read-only)
- **Parameters & features**: every customer detail a rule may read
- **Fraud lists**, **Reason-code catalogue**, **Users & audit**

**A product profile**: its own values and version history, as a numbered sequence
1. **Decision waterfall**, L0 to L6 in evaluation order: L0 data sufficiency and
   routing, L1 hard knockouts, L2 fraud and first-payment-default screens,
   L3 score decisioning and bands, L3a fallback scorecard and the credit ladder,
   L4 affordability, L5 exposure and limit assignment, L6 portfolio controls
2. **Assess a customer**: one applicant run down the whole waterfall, showing
   which layer decided and which cap bound the limit
3. **What-if simulation**: projected impact, derived from the profile's own bands
4. **Publish**: gated until every parameter has a value, then sent to a checker

## Keeping it aligned with the engine

`api-tests/` holds a smoke test for the staging API and the frame-to-model
generator. After a rule-set change on the engine, re-read the frame and
regenerate, rather than hand-editing the layer definitions:

```bash
python3 api-tests/run.py
```

## Design decisions worth knowing

- **One definition per parameter.** A parameter is defined in Global setup and
  tagged with the sections it may be used in. A rule row only offers parameters
  tagged for its own section, so an eligibility gate cannot read a daily
  portfolio counter. Rename a parameter and every rule sentence updates.
- **Reason codes are emitted, not authored.** Each rule carries the code the
  engine emits when that rule decides the outcome; the catalogue holds wording
  only and decides nothing. Assess a customer resolves the code from whatever
  actually stopped the application, so it can never disagree with the rules.
- **The assessment is computed, not narrated.** Every threshold in the trace is
  read from the profile's own draft. A check that cannot run says so: an unset
  threshold is a gap in the configuration and a missing value is a gap in the
  data, and neither is quietly treated as a pass.
- **One source of truth for numbers.** The simulation's approval rate is computed
  from the same population weights the band table prints, so the two can never
  disagree. The book projection is capped by the profile's own launch maximum.
- **Ink is chosen from the fill.** Band labels pick dark or light text from the
  band colour's luminance, so labels stay legible if the palette changes.
- **The waterfall is the organising principle.** Layers, numbering and parameter
  names follow the Technodysis rule engine draft, so the credit team can work
  through that document and this console side by side. Two invariants are shown
  on the screen: any layer can stop the process, and limits only ever go down.
- **Band limits are multipliers, not amounts.** A band carries its own maximum
  tenure and deposit; the multiplier comes from the L3 limit matrix, on the band
  and the affordability share together, so changing the product maximum
  rescales every band at once.
- **The model is generated, not transcribed.** Layer keys, rule keys, value
  shapes and default values are read from the engine's rule frame. Copy is
  ours; structure is the engine's.
- **Unset parameters are counted, not hidden.** Anything still needing a value
  from the credit team is tagged, filterable, and blocks publication.
- **Overlaps are flagged, not resolved.** Account age is gated in L0, L1 and L2
  for three different reasons; the console surfaces all four places rather than
  silently letting the strictest win.
- **No data is never a permanent decline.** A gate that cannot be evaluated
  returns "unknown", not "fail", and unknown routes to a lighter set of entry
  gates. Clearing those earns a starter offer; failing them defers the customer
  to a re-try date. KYC and fraud / AML are the only non-negotiable gates and
  cannot be waived by taking a deposit.

## Running locally

Static site, no build step, no dependencies.

```bash
python3 -m http.server 8741 --directory .
```

Then open http://localhost:8741.

## Deploying

Firebase Hosting, targeting the `credit-console` site:

```bash
firebase deploy --only hosting:credit-console
```

## Files

```
index.html        page shell (sidebar, top bar, view container, live region)
styles.css        all styling
data.js           layer definitions, parameter catalogue, reason codes, seed profiles
app.js            state, per-screen renderers, derivations, event delegation
assets/           the Sasai logo
api-tests/        staging API smoke test and poller
```

`assets/` holds the official Sasai logo as SVG: `sasai-logo.svg` for light
backgrounds, `sasai-logo-reversed.svg` for the navy sidebar and header,
`sasai-mark.svg` for the mark on its own, and `sasai-favicon.svg` for the
browser tab. The artwork's own colours are navy `#224989` and teal `#6BC0CF`,
which sit a shade off the interface palette below and are left as drawn.

