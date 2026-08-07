# Sasai Credit — Rule Engine Console

A maker–checker console for configuring credit decisioning per product. Credit
policy staff set the rules, bands and limits for each product themselves; the
scoring model, the parameter vocabulary and the reason-code wording are shared
across every product and configured once.

**Live:** https://credit-rule-console.web.app

## How it is organised

The sidebar holds only what is shared. Everything product-specific lives inside
a selected profile, as a numbered set-up sequence:

**Global setup** — shared by every product, not versioned per profile
- **Model & score range** — the one scoring model and its 0–1000 scale
- **Model health** — AUC / Gini / KS, PSI, calibration, score distribution (read-only)
- **Parameters & features** — every customer detail a rule may read, named once and
  tagged with the sections it is valid in
- **Fraud lists**, **Reason-code catalogue**, **Users & audit**

**A product profile** — its own rules, bands, limits and version history
1. **Fallback scorecard** — points-based scoring for customers the model cannot score
2. **Score bands** — turn the score into a decision and a starting limit
3. **Limits & affordability** — the score × affordability matrix, caps and ceilings
4. **Rules** — plain-sentence rules, scoped per section
5. **What-if simulation** — projected impact, derived from the profile's own bands
6. **Publish** — gated until steps 1–4 are configured, then sent to a checker

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

## Running locally

Static site — no build step, no dependencies.

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

- `index.html` — page shell (sidebar, top bar, view container, live region)
- `styles.css` — all styling
- `data.js` — parameter catalogue, section scoping, reason codes, seed profiles
- `app.js` — state, per-screen renderers, derivations, and event delegation
