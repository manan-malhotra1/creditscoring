import json, sys
sys.path.insert(0, '.')
from meanings import LAYER_META, M, PROFILE

frame = json.load(open('frame.json'))

PCT   = {'haircut_low_confidence','haircut_thin_no_file','limit_increase_per_cycle',
         'max_thin_file_share_of_approvals','new_to_credit_concentration_cap',
         'random_approval_holdout','instalment_to_income_cap','income_confidence_threshold',
         'feature_completeness','ladder_deposit_requirement'}
MONEY = {'starter_limit_thin_file','starter_limit_no_file','max_ladder_limit',
         'daily_disbursement_cap','minimum_monthly_income','net_disposable_income_floor',
         'balance_proxy_intercept'}
DAYS  = {'wallet_tenure','dormancy','minimum_account_age','cooling_period_after_decline',
         'reset_on_delinquency','currently_delinquent','profile_change_velocity'}
BANDV = {'score_source_cap','scorecard_cap'}

def kind(key, v):
    v = v or {}
    if 'hardFloor' in v and 'sufficiency' in v:     return 'dual'
    if 'allowedValues' in v:                        return 'multi'
    if 'expectedValue' in v:                        return 'flag'
    if 'cells' in v:                                return 'matrix'
    if 'maxPoints' in v:                            return 'points'
    if 'rows' in v:                                 return 'bands'
    if 'months' in v:                               return 'months'
    if 'dormancyThresholdDays' in v:                return 'composite'
    if key in BANDV:                                return 'band'
    if 'windowDays' in v:                           return 'window'
    if key in PCT:                                  return 'percent'
    if key in MONEY:                                return 'currency'
    if key in DAYS:                                 return 'days'
    if 'operator' in v:                             return 'threshold'
    return 'count'

def js(s):
    return "'" + str(s).replace('\\', '\\\\').replace("'", "\\'") + "'"

out = ['// ---------------------------------------------------------------------------',
       '// The decision waterfall, L0 to L6, generated from the engine\'s own rule frame',
       '// (GET /rule-versions/frame) so the keys, layers and value shapes here are the',
       "// ones the engine actually evaluates. Copy follows Technical Solutioning v2.1.",
       '// Regenerate with api-tests/sync-frame.py after a rule-set change.',
       '// ---------------------------------------------------------------------------',
       '', 'const LAYERS = [']

order = ['layer_0','layer_1','layer_2','layer_3','layer_3a','layer_4','layer_5','layer_6']
by = {L['layer']: L['rules'] for L in frame['layers']}

for lay in order:
    meta = LAYER_META[lay]
    out.append('  {')
    out.append(f"    key: {js(lay)}, num: {js(meta['num'])}, ref: {js(meta['ref'])}, title: {js(meta['title'])},")
    out.append(f"    question: {js(meta['question'])},")
    out.append(f"    intro: {js(meta['intro'])},")
    if lay == 'layer_5':
        out.append('    // Held on the product profile rather than the rule set: the only')
        out.append('    // product-specific layer, and the only one with no rules of its own.')
        out.append('    profile: true,')
        out.append('    settings: [')
        for k, label, t, ess, mean in PROFILE:
            out.append(f"      {{ key: {js(k)}, label: {js(label)}, type: {js(t)}, essential: {str(ess).lower()},")
            out.append(f"        meaning: {js(mean)} }},")
        out.append('    ],')
    else:
        out.append('    settings: [')
        for r in by.get(lay, []):
            k = r['key']
            label, ess, mean = M.get(k, (k, False, ''))
            t = kind(k, r.get('value'))
            extra = ''
            if r.get('action'):
                extra += f", action: {js(r['action'])}"
            out.append(f"      {{ key: {js(k)}, label: {js(label)}, type: {js(t)}, essential: {str(ess).lower()}{extra},")
            out.append(f"        meaning: {js(mean)} }},")
        out.append('    ],')
    out.append('  },')
out.append('];')
open('layers.gen.js','w').write('\n'.join(out) + '\n')
print('\n'.join(out[:26]))
print('...')
print(f"\ngenerated {len(out)} lines")

# ---- seeds: the engine's own default values, verbatim ----
seed = []
for lay in order:
    if lay == 'layer_5':
        continue
    vals = {}
    for r in by.get(lay, []):
        v = r.get('value') or {}
        vals[r['key']] = {'value': v, 'enabled': r.get('enabled', True),
                          'action': r.get('action')}
    seed.append((lay, vals))

lines = ["// Default values exactly as the engine's ACTIVE rule set holds them, so an",
         "// unedited profile in this console and an unedited product in the engine agree.",
         'const LAYER_DEFAULTS = {']
for lay, vals in seed:
    lines.append(f"  {lay}: {{")
    for k, d in vals.items():
        val = json.dumps(d['value'])
        act = f", action: {js(d['action'])}" if d['action'] else ''
        lines.append(f"    {k}: {{ value: {val}, enabled: {str(d['enabled']).lower()}{act} }},")
    lines.append('  },')
lines.append('};')

# ---- bands, read out of the band_table rule ----
bt = next(r for r in by['layer_3'] if r['key'] == 'band_table')['value']
lines += ['', '// Read out of the layer_3 band_table rule. Ranges are open until the first',
          '// training run places them against the observed score distribution.',
          'const BAND_ROWS = [']
for row in bt['rows']:
    o = row.get('outputs', {})
    lines.append(
        f"  {{ band: {js(o.get('band'))}, rangeMin: {json.dumps(row.get('rangeMin'))}, "
        f"rangeMax: {json.dumps(row.get('rangeMax'))}, decision: {js(o.get('decision'))}, "
        f"multiplier: {json.dumps(o.get('multiplier'))}, maxTenureMonths: {json.dumps(o.get('maxTenureMonths'))}, "
        f"depositPct: {json.dumps(o.get('depositPct'))} }},")
lines.append('];')

lm = next(r for r in by['layer_3'] if r['key'] == 'limit_matrix')['value']
lines += ['', '// The band by affordability-share matrix, layer_3 limit_matrix.',
          f"const LIMIT_MATRIX = {{ rows: {json.dumps(lm.get('rows'))}, "
          f"cols: {json.dumps(lm.get('cols') or lm.get('columns'))}, cells: {json.dumps(lm.get('cells'))} }};"]

pcb = next(r for r in by['layer_3'] if r['key'] == 'predicted_confidence_band_table')['value']
lines += ['', 'const CONFIDENCE_BANDS = ' + json.dumps(
    [{'band': r['outputs']['band'], 'rangeMin': r.get('rangeMin'), 'rangeMax': r.get('rangeMax')}
     for r in pcb['rows']]) + ';']

open('seeds.gen.js','w').write('\n'.join(lines) + '\n')
print('\n--- bands ---')
print('\n'.join(l for l in lines if l.startswith('  { band:')))
print('\n--- matrix ---')
print([l for l in lines if l.startswith('const LIMIT_MATRIX')][0][:400])
print('\n--- confidence bands ---')
print([l for l in lines if l.startswith('const CONFIDENCE_BANDS')][0][:300])
