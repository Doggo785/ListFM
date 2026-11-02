"""Fail on High/Critical osv-scanner findings only.

osv-scanner exits 1 on ANY finding, but CONSTRAINTS.md tolerates
Medium/Low: gate on numeric max_severity (CVSS >= 7.0 = High).
Shared by CI and scripts/ci-local.sh. Usage: python3 scripts/osv_gate.py osv.json
"""

import json
import sys

data = json.load(open(sys.argv[1]))
bad = []
for res in data.get("results", []):
    for pkg in res.get("packages", []):
        p = pkg.get("package", {})
        label = f"{p.get('name', '?')}@{p.get('version', '?')}"
        for g in pkg.get("groups", []):
            try:
                sev = float(g.get("max_severity", "nan"))
            except (TypeError, ValueError):
                print(f"no parseable severity for {label} {g.get('ids')}, failing safe")
                sys.exit(1)
            if sev >= 7.0:
                bad.append(f"{g.get('ids')} {label} (max_severity={sev})")
if bad:
    print("FAIL: High/Critical vulnerabilities found:")
    print("\n".join(f"  - {b}" for b in bad))
    sys.exit(1)
print("OK: no High/Critical vulnerabilities (Medium/Low tolerated, see CONSTRAINTS.md).")
