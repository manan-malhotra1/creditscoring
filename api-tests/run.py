#!/usr/bin/env python3
"""Smoke test for the Ecocash Rule Engine staging API.

Runs the quick start from the developer guide end to end and checks each
response against what the guide says should happen. Standard library only.

The API key is read from api-tests/.env or the CREDIT_API_KEY environment
variable, never passed on the command line, so it stays out of shell history
and out of this repository.
"""
import json, os, sys, time, urllib.error, urllib.request

BASE = os.environ.get('CREDIT_API_BASE',
                      'https://staging.sasaipaymentgateway.com/staging/creditscoring')
PRODUCT = os.environ.get('CREDIT_PRODUCT', 'device_financing')
TENANT = os.environ.get('CREDIT_TENANT', 'legacy')
# Creating a rule set or patching a rule changes the ACTIVE configuration for
# the whole tenant, and `legacy` is shared. Reads and assessments always run;
# the two steps that change shared config need CREDIT_ALLOW_WRITES=1.
WRITES = os.environ.get('CREDIT_ALLOW_WRITES') == '1'
CUSTOMER = int(os.environ.get('CREDIT_CUSTOMER', '777868302'))

G, R, Y, D, B = '\033[32m', '\033[31m', '\033[33m', '\033[2m', '\033[1m'
X = '\033[0m'

def load_key():
    key = os.environ.get('CREDIT_API_KEY')
    if key:
        return key.strip()
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
    if os.path.exists(path):
        for line in open(path):
            line = line.strip()
            if line.startswith('CREDIT_API_KEY='):
                return line.split('=', 1)[1].strip().strip('"\'')
    sys.exit(f"{R}No API key.{X} Put it in api-tests/.env as\n"
             f"  CREDIT_API_KEY=your-key-here\n"
             f"or export CREDIT_API_KEY before running.")

KEY = load_key()
results = []

def call(method, path, body=None, expect=200, note=''):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        'X-API-Key': KEY, 'Content-Type': 'application/json', 'Accept': 'application/json'})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            status, raw = r.status, r.read()
    except urllib.error.HTTPError as e:
        status, raw = e.code, e.read()
    except Exception as e:
        status, raw = 0, str(e).encode()
    ms = int((time.time() - t0) * 1000)
    try:
        payload = json.loads(raw)
    except Exception:
        payload = raw.decode('utf-8', 'replace')[:400]
    want = expect if isinstance(expect, tuple) else (expect,)
    ok = status in want
    results.append((ok, f"{method} {path.split('?')[0]}", status,
                    '/'.join(map(str, want)), note))
    mark = f"{G}ok{X}" if ok else f"{R}FAIL{X}"
    print(f"  [{mark}] {method:6} {path.split('?')[0]:42} {status} "
          f"(want {'/'.join(map(str, want))}) {ms:>5}ms  {D}{note}{X}")
    if not ok:
        print(f"       {R}{json.dumps(payload)[:500] if isinstance(payload, (dict, list)) else payload}{X}")
    return status, payload

def why(path_fragment, tenant=None):
    """The service logs every request with its server-side error, so a 500
    can be explained rather than just reported."""
    t = tenant or TENANT
    # The log row is written just after the response, so allow for the lag.
    for attempt in range(3):
        time.sleep(1.5)
        st, rows = call('GET', f'/api-logs?tenantId={t}&endpoint={path_fragment}'
                               f'&statusCode=500&limit=1', expect=200,
                        note=f'reading the service log for the cause (try {attempt + 1})')
        rows = rows if isinstance(rows, list) else (rows.get('items') if isinstance(rows, dict) else [])
        if rows:
            err = rows[0].get('errorMessage')
            print(f"       {R}server-side cause:{X} "
                  f"{str(err).strip().replace(chr(10), ' ')[:300] if err else 'none recorded'}")
            return err
    print(f"       {Y}no 500 recorded in the service log yet{X}")
    return None


def head(n, t):
    print(f"\n{B}{n}. {t}{X}")

def dump(obj, keys):
    for k in keys:
        v = obj.get(k)
        if isinstance(v, (dict, list)):
            v = json.dumps(v)
        s = str(v)
        print(f"       {k:28} {s[:96]}")

print(f"{B}Ecocash Rule Engine, staging smoke test{X}")
print(f"{D}base     {BASE}\ntenant   {TENANT}\nproduct  {PRODUCT}\ncustomer {CUSTOMER}\n"
      f"key      {KEY[:4]}…{KEY[-2:]} ({len(KEY)} chars)\n"
      f"writes   {'enabled' if WRITES else 'skipped (set CREDIT_ALLOW_WRITES=1)'}{X}")

head(1, "Service is up")
call('GET', '/health', expect=200, note='no key needed')

head(2, "Create a product profile")
# Guide step 1, section 4.1. This build requires an ACTIVE product profile
# before a rule set can be created, so this is now the first real step rather
# than the known gap it used to be.
#
# It runs on a throwaway tenant. POST /product-profiles does not supersede the
# existing profile for the tenant it names, it adds another ACTIVE one beside
# it (legacy carries six as of 2026-09-29), so running this against a shared
# tenant quietly changes which profile assessments bind to.
DIAG = f'mm-probe-{int(time.time())}'
# The profile's own fields go nested under `values`, per the guide section 4.1.
# Sending them at the top level is now correctly rejected with a 400 naming each
# offending property; before 2026-10 it returned 201 and silently used defaults.
st, prof = call('POST', '/product-profiles', {
    'tenantId': DIAG, 'productCode': PRODUCT,
    'values': {
        'productMaximum': 500, 'minimumViableLimit': 30, 'totalCustomerExposureCap': 750,
        'limitRoundingIncrement': 10, 'permittedTenures': [3, 4, 6], 'depositFloorPct': 0,
    },
}, expect=(200, 201), note='on a throwaway tenant, not ' + TENANT)
profile_id = prof.get('id') if isinstance(prof, dict) else None
if isinstance(prof, dict):
    dump(prof, ['id', 'status', 'revision', 'values'])

head(3, "Read the rule frame: what are the defaults?")
st, frame = call('GET', f'/rule-versions/frame?tenantId={TENANT}&productCode={PRODUCT}',
                 expect=200, note='401 here means the key is wrong')
if st == 401:
    sys.exit(f"\n{R}The key was rejected. Nothing further can run.{X}")
if st == 200 and isinstance(frame, dict):
    print(f"       {D}sourceStatus={frame.get('sourceStatus')}  "
          f"layers={len(frame.get('layers', []))}  "
          f"rules={sum(len(l.get('rules', [])) for l in frame.get('layers', []))}{X}")

head(4, "A rule set can be created once the profile exists")
# On this build the profile is no longer passed inline on CreateRuleVersionDto;
# the rule set binds to whatever profile is ACTIVE for the tenant and product.
# Creating one on the throwaway tenant proves that ordering works end to end.
st, probe = call('POST', '/rule-versions', {
    'tenantId': DIAG, 'productCode': PRODUCT, 'label': 'rule set for the probe profile',
}, expect=(200, 201), note='same throwaway tenant, profile created in step 2')
if isinstance(probe, dict):
    dump(probe, ['id', 'status', 'revision'])
    print(f"       {D}seeded {len(probe.get('rules') or [])} rules{X}")
st, profs = call('GET', f'/product-profiles?tenantId={DIAG}', expect=200,
                 note='the profile is readable and still ACTIVE')
active = [p for p in profs if isinstance(p, dict) and p.get('status') == 'ACTIVE'] \
    if isinstance(profs, list) else []
ok_active = any(p.get('id') == profile_id for p in active)
results.append((ok_active, 'the profile created in step 2 is ACTIVE',
                (active[0].get('id') if active else 'none'), profile_id, ''))
print(f"       {(G + 'ok' + X) if ok_active else (R + 'FAIL' + X)} "
      f"{len(active)} ACTIVE profile(s) on {DIAG}")

head(5, "Create a rule set on the real tenant")
rule_version_id = None
if not WRITES:
    print(f"       {Y}skipped{X} {D}would supersede the ACTIVE rule set for tenant "
          f"'{TENANT}', which others are testing against{X}")
else:
  st, rv = call('POST', '/rule-versions', {
    'tenantId': TENANT,
    'productCode': PRODUCT,
    'label': 'Smoke test: defaults, max 600',
    'productProfile': {'productMaximum': 600},
  }, expect=(200, 201), note='guide step 2')
  rule_version_id = rv.get('id') if isinstance(rv, dict) else None
  if isinstance(rv, dict):
    dump(rv, ['id', 'status', 'label'])
    if 'productProfile' in rv:
        dump(rv, ['productProfile'])

head(6, "Assess a customer")
st, dec = call('POST', '/decisions', {
    'tenantId': TENANT, 'productCode': PRODUCT, 'customerId': CUSTOMER,
    'requestedAmount': 300, 'requestedTenure': 4, 'channel': 'app',
}, expect=(200, 201), note='guide step 3')
if st not in (200, 201):
    st, dec = call('POST', '/decisions', {
        'tenantId': TENANT, 'productCode': PRODUCT, 'customerId': CUSTOMER},
        expect=(200, 201), note='retry, minimal body')
if st >= 500:
    why('/decisions')
decision_id = dec.get('decisionId') if isinstance(dec, dict) else None
if isinstance(dec, dict) and decision_id:
    dump(dec, ['decision', 'routing', 'scoreSource', 'score', 'band',
               'approvedLimit', 'tenure', 'deposit', 'instalment',
               'affordabilityLimit', 'incomeBasis', 'bindingConstraint'])
    print(f"       {D}capsApplied:{X}")
    for c in (dec.get('capsApplied') or [])[:8]:
        print(f"         {json.dumps(c)[:100]}")
    print(f"       {D}reasonCodes:{X}")
    for c in (dec.get('reasonCodes') or [])[:8]:
        print(f"         {json.dumps(c)[:100]}")
    print(f"       {D}versions: {json.dumps(dec.get('versions'))[:150]}{X}")
    # The null constraint on decision.product_profile_id is what broke every
    # assessment on the previous build, so assert the link is really populated.
    ppid = (dec.get('versions') or {}).get('productProfileId')
    results.append((bool(ppid), 'the decision is linked to a product profile',
                    ppid or 'null', 'a profile id', ''))
    print(f"       {(G + 'ok' + X) if ppid else (R + 'FAIL' + X)} "
          f"versions.productProfileId = {ppid}")

if decision_id:
    head(7, "Re-read the stored decision")
    call('GET', f'/decisions/{decision_id}?tenantId={TENANT}', expect=200, note='guide 8.1')

    head(8, "Trace it, layer by layer")
    st, tr = call('GET', f'/decisions/{decision_id}/trace?tenantId={TENANT}',
                  expect=200, note='guide 8.2')
    entries = tr if isinstance(tr, list) else (tr.get('layers') or tr.get('trace') or []) if isinstance(tr, dict) else []
    for e in entries:
        if not isinstance(e, dict):
            continue
        rules = e.get('rulesEvaluated') or []
        failed = [r for r in rules if isinstance(r, dict)
                  and (r.get('passed') is False or str(r.get('result', '')).upper() in ('FAIL', 'FAILED'))]
        print(f"       {e.get('layer', '?'):10} seq={str(e.get('sequence', '?')):3} "
              f"outcome={str(e.get('outcome'))[:44]:46} {len(rules)} rules, {len(failed)} failed")
        for r in failed[:3]:
            print(f"         {R}x{X} {json.dumps(r)[:110]}")

    head(9, "Tenant isolation: another tenant must not see this decision")
    call('GET', f'/decisions/{decision_id}?tenantId=someone-elses-tenant',
         expect=404, note='guide section 2')

head(10, "Change a rule, then assess again")
rid = None
if isinstance(frame, dict):
    for layer in frame.get('layers', []):
        for r in layer.get('rules', []):
            if r.get('key') == 'minimum_age':
                rid = r.get('id')
if not WRITES:
    print(f"       {Y}skipped{X} {D}would change the live rules for tenant '{TENANT}'{X}")
elif not rid:
    print(f"       {Y}minimum_age not found in the frame, skipping{X}")
else:
    call('PATCH', '/rule-versions/rules', {
        'tenantId': TENANT,
        'updates': [{'ruleId': rid, 'value': {'operator': 'gte', 'threshold': 99}}],
    }, expect=200, note='minimum_age -> 99, everybody should now fail it')
    st, dec2 = call('POST', '/decisions', {
        'tenantId': TENANT, 'productCode': PRODUCT, 'customerId': CUSTOMER},
        expect=(200, 201), note='same customer, tightened rules')
    if isinstance(dec2, dict):
        dump(dec2, ['decision', 'routing', 'approvedLimit'])
        before = dec.get('decision') if isinstance(dec, dict) else None
        after = dec2.get('decision')
        changed = before != after
        results.append((changed, 'rule edit changes the outcome', after, 'different from ' + str(before), ''))
        print(f"       {(G + 'ok' + X) if changed else (Y + 'note' + X)} "
              f"decision {before} -> {after}")
    call('PATCH', '/rule-versions/rules', {
        'tenantId': TENANT,
        'updates': [{'ruleId': rid, 'value': {'operator': 'gte', 'threshold': 18}}],
    }, expect=200, note='put minimum_age back to 18')

print(f"\n{B}Summary{X}")
passed = sum(1 for r in results if r[0])
for ok, name, got, want, note in results:
    print(f"  {(G + 'ok  ' + X) if ok else (R + 'FAIL' + X)} {name:48} {got} (want {want})")
print(f"\n{passed}/{len(results)} checks passed")
sys.exit(0 if passed == len(results) else 1)
