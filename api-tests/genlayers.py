#!/usr/bin/env python3
"""Generate the console's layer model from the engine's own rule frame.

    python3 api-tests/genlayers.py          # reads the live frame, rewrites data.js

Keys, layers, value shapes, units and default values come from the engine, so
the console cannot drift from it. Only the explanatory copy is ours, and that
lives in api-tests/meanings.py.
"""
import json, os, re, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from meanings import LAYER_META, M, PROFILE

BASE = os.environ.get('CREDIT_API_BASE',
                      'https://staging.sasaipaymentgateway.com/staging/creditscoring')
TENANT = os.environ.get('CREDIT_TENANT', 'legacy')
PRODUCT = os.environ.get('CREDIT_PRODUCT', 'device_financing')

def key():
    k = os.environ.get('CREDIT_API_KEY')
    if k: return k.strip()
    p = os.path.join(HERE, '.env')
    if os.path.exists(p):
        for line in open(p):
            if line.startswith('CREDIT_API_KEY='):
                return line.split('=', 1)[1].strip().strip('"\'')
    sys.exit('no API key; see api-tests/.env')

def get(path):
    req = urllib.request.Request(BASE + path, headers={'X-API-Key': key(), 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())

def js(s):
    return "'" + str(s).replace('\\', '\\\\').replace("'", "\\'") + "'"

# Value shapes the console renders with a table of their own rather than fields.
TABLE_KEYS = {'band_table', 'predicted_confidence_band_table', 'limit_matrix',
              'refer_band_boundaries', 'referral_policy'}

def kind(k, v):
    v = v or {}
    if k in TABLE_KEYS:            return 'table'
    if 'maxPoints' in v:           return 'points'
    if 'hardFloor' in v:           return 'dual'
    if 'allowedValues' in v:       return 'multi'
    if 'expectedValue' in v:       return 'flag'
    return v.get('unit') or 'count'

def main():
    frame = get(f'/rule-versions/frame?tenantId={TENANT}&productCode={PRODUCT}')
    profs = get(f'/product-profiles?tenantId={TENANT}&productCode={PRODUCT}&status=ACTIVE')
    profs = profs if isinstance(profs, list) else profs.get('items', [])
    prof = profs[0] if profs else {'values': {}, 'id': None, 'revision': None}
    by = {L['layer']: L['rules'] for L in frame['layers']}

    out = [
      '// ---------------------------------------------------------------------------',
      "// The decision waterfall, generated from the engine's own rule frame and",
      '// product profile, so keys, layers, units, value shapes and defaults are the',
      '// ones the engine actually evaluates. Copy follows Technical Solutioning v2.1.',
      '//',
      f"// Rule set   {frame.get('sourceRuleVersionId')} rev {max([r.get('revision') or 0 for L in frame['layers'] for r in L['rules']] or [0])}",
      f"// Profile    {prof.get('id')} rev {prof.get('revision')}",
      '// Regenerate with: python3 api-tests/genlayers.py',
      '// ---------------------------------------------------------------------------',
      '', 'const LAYERS = [']

    order = ['layer_0', 'layer_1', 'layer_2', 'layer_3', 'layer_3a', 'layer_4', 'layer_5', 'layer_6']
    for lay in order:
        meta = LAYER_META[lay]
        out += ['  {',
                f"    key: {js(lay)}, num: {js(meta['num'])}, ref: {js(meta['ref'])}, title: {js(meta['title'])},",
                f"    question: {js(meta['question'])},",
                f"    intro: {js(meta['intro'])},"]
        if lay == 'layer_5':
            out += ['    // Held on the product profile rather than the rule set: the only',
                    '    // product-specific layer, and the only one with no rules of its own.',
                    '    profile: true,', '    settings: [']
            for k, (label, t, ess, mean) in PROFILE.items():
                out += [f"      {{ key: {js(k)}, label: {js(label)}, type: {js(t)}, essential: {str(ess).lower()},",
                        f"        meaning: {js(mean)} }},"]
        else:
            out.append('    settings: [')
            for r in by.get(lay, []):
                k = r['key']
                label, ess, mean = M.get(k, (k, False, ''))
                v = r.get('value') or {}
                bits = [f"key: {js(k)}", f"label: {js(label)}", f"type: {js(kind(k, v))}",
                        f"essential: {str(ess).lower()}"]
                if v.get('unit'):    bits.append(f"unit: {js(v['unit'])}")
                if v.get('feature'): bits.append(f"feature: {js(v['feature'])}")
                if r.get('action'):  bits.append(f"action: {js(r['action'])}")
                out += [f"      {{ {', '.join(bits)},", f"        meaning: {js(mean)} }},"]
        out += ['    ],', '  },']
    out.append('];')

    out += ['', "// Default values exactly as the engine's ACTIVE rule set holds them, so an",
            '// unedited profile here and an unedited product there agree.', 'const LAYER_DEFAULTS = {']
    for lay in order:
        if lay == 'layer_5':
            continue
        out.append(f'  {lay}: {{')
        for r in by.get(lay, []):
            act = f", action: {js(r['action'])}" if r.get('action') else ''
            out.append(f"    {r['key']}: {{ value: {json.dumps(r.get('value') or {})}, "
                       f"enabled: {str(bool(r.get('enabled', True))).lower()}{act} }},")
        out.append('  },')
    out.append('};')

    out += ['', '// The product profile as the engine holds it.',
            f"const PROFILE_VALUES = {json.dumps(prof.get('values') or {}, indent=2)};",
            '', f"const ENGINE_VERSIONS = {{ ruleVersionId: {js(frame.get('sourceRuleVersionId'))}, "
            f"profileId: {js(prof.get('id'))}, profileRevision: {json.dumps(prof.get('revision'))}, "
            f"readAt: {js(__import__('datetime').date.today().isoformat())} }};"]

    bt = next(r for r in by['layer_3'] if r['key'] == 'band_table')['value']
    out += ['', '// Read out of the layer_3 band_table rule.', 'const BAND_ROWS = [']
    for row in bt['rows']:
        o = row.get('outputs', {})
        out.append(f"  {{ band: {js(o.get('band'))}, rangeMin: {json.dumps(row.get('rangeMin'))}, "
                   f"rangeMax: {json.dumps(row.get('rangeMax'))}, decision: {js(o.get('decision'))}, "
                   f"multiplier: {json.dumps(o.get('multiplier'))}, maxTenureMonths: {json.dumps(o.get('maxTenureMonths'))}, "
                   f"depositPct: {json.dumps(o.get('depositPct'))} }},")
    out.append('];')

    lm = next(r for r in by['layer_3'] if r['key'] == 'limit_matrix')['value']
    out += ['', '// The band by affordability-share matrix, layer_3 limit_matrix.',
            f"const LIMIT_MATRIX = {{ rows: {json.dumps(lm.get('rows'))}, "
            f"columns: {json.dumps(lm.get('columns'))}, cells: {json.dumps(lm.get('cells'))} }};"]

    pcb = next(r for r in by['layer_3'] if r['key'] == 'predicted_confidence_band_table')['value']
    out += ['', 'const CONFIDENCE_BANDS = ' + json.dumps(
        [{'band': r['outputs']['band'], 'rangeMin': r.get('rangeMin'), 'rangeMax': r.get('rangeMax')}
         for r in pcb['rows']]) + ';']

    rp = next((r for r in by['layer_3'] if r['key'] == 'referral_policy'), None)
    out += ['', '// Whether manual review exists, and what each source does when it does not.',
            f"const REFERRAL_POLICY = {json.dumps((rp or {}).get('value') or {}, indent=2)};"]

    block = '\n'.join(out) + '\n'
    path = os.path.join(ROOT, 'data.js')
    src = open(path).read()
    start = src.index('// ---------------------------------------------------------------------------\n// The decision waterfall')
    end = src.index('const LAYER_KEYS')
    open(path, 'w').write(src[:start] + block + '\n' + src[end:])
    print(f"data.js regenerated: {sum(len(v) for v in by.values())} rules across {len(by)} layers, "
          f"{len(prof.get('values') or {})} profile fields")

if __name__ == '__main__':
    main()
