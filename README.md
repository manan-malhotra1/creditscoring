# Sasai Credit: Rule Engine Console

A maker-checker console for configuring credit decisioning per product. Credit
policy staff set the rules, bands and limits for each product themselves; the
scoring model, the parameter vocabulary and the reason-code wording are shared
across every product and configured once.

**Live:** https://credit-rule-console.web.app

## Two builds

The site serves both structures so they can be compared:

| | | |
|---|---|---|
| [`/`](https://credit-rule-console.web.app/) | Chooser | Side-by-side summary of what differs |
| [`/v1/`](https://credit-rule-console.web.app/v1/) | Six-tab build | Configuration grouped by topic, roughly 40 parameters |
| [`/v2/`](https://credit-rule-console.web.app/v2/) | L0 to L6 waterfall | One spine in evaluation order, roughly 80 parameters |

v1 is the build as it stood at commit `63ce862`, kept unchanged apart from a
corner badge for switching between the two. v2 is the current work and is where
new development happens. Both share the same Global setup, maker-checker,
versioning and audit behaviour; only the per-product configuration differs.

## How v2 is organised

The sidebar holds only what is shared. Everything product-specific lives inside
a selected profile, as a numbered set-up sequence:

**Global setup**: shared by every product, not versioned per profile
- **Model & score range**: the one scoring model and its 0–1000 scale
- **Model health**: AUC / Gini / KS, PSI, calibration, score distribution (read-only)
- **Parameters & features**: every customer detail a rule may read, named once and
  tagged with the sections it is valid in
- **Fraud lists**, **Reason-code catalogue**, **Users & audit**

**A product profile**: its own parameters, bands and version history, organised as
the decision waterfall from the Technodysis rule engine draft
1. **Decision waterfall**, L0 to L6, in the order the engine evaluates them:
   L0 data sufficiency and routing, L1 hard knockouts, L2 fraud and
   first-payment-default screens, L3 score decisioning and thin-file handling,
   L4 affordability, L5 exposure and limit assignment, L6 portfolio controls
2. **What-if simulation**: projected impact, derived from the profile's own bands
3. **Publish**: gated until every parameter has a value, then sent to a checker

## Design decisions worth knowing

- **One definition per parameter.** A parameter is defined in Global setup and
  tagged with the sections it may be used in. A rule row only offers parameters
  tagged for its own section, so an eligibility gate cannot read a daily
  portfolio counter. Rename a parameter and every rule sentence updates.
- **Reason codes are emitted, not authored.** Each rule carries the code the
  engine emits when that rule decides the outcome; the catalogue holds wording
  only and decides nothing. The Decision explanation panel on What-if resolves
  codes from the rules that actually fired.
- **One source of truth for numbers.** The simulation's approval rate is computed
  from the same population weights the band table prints, so the two can never
  disagree. The book projection is capped by the profile's own launch maximum.
- **Ink is chosen from the fill.** Band labels pick dark or light text from the
  band colour's luminance, so labels stay legible if the palette changes.
- **The waterfall is the organising principle.** Layers, numbering and parameter
  names follow the Technodysis rule engine draft, so the credit team can work
  through that document and this console side by side. Two invariants are shown
  on the screen: any layer can stop the process, and limits only ever go down.
- **Band limits are multipliers, not amounts.** A band carries a multiplier of
  the product maximum plus its own maximum tenure and deposit, so changing the
  product maximum rescales every band at once.
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
index.html        the chooser landing page
v1/               the six-tab build, frozen at commit 63ce862
v2/               the L0 to L6 waterfall build, where development continues
```

Each build is four files:

- `index.html`: page shell (sidebar, top bar, view container, live region)
- `styles.css`: all styling
- `data.js`: layer definitions, parameter catalogue, reason codes, seed profiles
- `app.js`: state, per-screen renderers, derivations, and event delegation
