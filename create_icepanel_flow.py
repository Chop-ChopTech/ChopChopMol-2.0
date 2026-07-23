#!/usr/bin/env python3
"""Create an IcePanel *flow* for the ChopChopMol 2.0 landscape via the Flows API.

Flows can't live in the model-import JSON file (that schema only holds objects,
connections and tags). They are created through the API and must attach to an
existing diagram, referencing the real object IDs IcePanel assigned at import.
This script resolves those IDs live, then POSTs the flow.

Prerequisites
-------------
1. You already imported chopchopmol-icepanel.json into a landscape.
2. Open that landscape in IcePanel and open (or create) ONE diagram that shows
   the objects the flow walks through — the auto-generated system context
   diagram is a good default. Saving it once gives it an ID.
3. Create an API key: IcePanel -> Organization settings -> API keys.

Usage
-----
    export ICEPANEL_API_KEY="ip_xxx"

    # discover your landscape's diagrams + object names first:
    python create_icepanel_flow.py --landscape <LANDSCAPE_ID> --list

    # dry-run (prints the exact POST body, writes nothing):
    python create_icepanel_flow.py --landscape <LANDSCAPE_ID> \
        --diagram "Context" --dry-run

    # create it for real:
    python create_icepanel_flow.py --landscape <LANDSCAPE_ID> --diagram "Context"

`--version` defaults to "latest" (IcePanel's alias for the current version).
Find <LANDSCAPE_ID> in the app URL: /landscapes/<LANDSCAPE_ID>/versions/latest/...
"""
import argparse
import json
import os
import sys
import urllib.request
import urllib.error

API = "https://api.icepanel.io/v1"

# ----------------------------------------------------------------------------
# The flow narrative. Each step matches objects by the NAME they have in the
# imported model, so it survives IcePanel's ID reassignment. Step kinds:
#   ("note", text, type)            -> annotation (introduction/information/conclusion)
#   ("conn", origin, target, text)  -> walk an existing connection origin -> target
#   ("self", object, text)          -> a self-action on one object
# Missing objects/connections are skipped with a warning (never a hard failure).
# ----------------------------------------------------------------------------
FLOW_NAME = "AI-driven energy calculation"
STEPS = [
    ("note", "A researcher asks ChopChopMol to compute the energy of the loaded molecule.", "introduction"),
    ("conn", "Researcher / End User", "ChopChopMol Frontend",
     "Types a natural-language command (e.g. \"calculate the energy\") in the chat panel."),
    ("conn", "Agent Tool Executor", "AI Chat Proxy",
     "The frontend streams the message + molecule state to the Flask backend over SSE."),
    ("conn", "AI Chat Proxy", "Anthropic Claude API",
     "The backend calls Claude with the tool definitions; Claude returns a calculate_energy tool call."),
    ("conn", "MACE/DFT Client", "MACE Service",
     "The frontend executes the tool, requesting a MACE energy + forces calculation."),
    ("self", "MACE Service",
     "Runs the MACE ML potential (PyTorch/ASE) and returns energy plus per-atom forces."),
    ("note", "The frontend caches the result and renders an energy chart with force arrows for the user.", "conclusion"),
]


def req(method, path, api_key, body=None):
    url = f"{API}{path}"
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("X-API-Key", api_key)
    r.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(r) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        detail = e.read().decode()[:800]
        sys.exit(f"\nHTTP {e.code} on {method} {path}\n{detail}\n")


def get_all(path, api_key, key):
    """GET a list endpoint, following nextCursor pagination."""
    out, cursor = [], None
    while True:
        p = path + (f"?cursor={cursor}" if cursor else "")
        d = req("GET", p, api_key)
        out.extend(d.get(key, []))
        cursor = d.get("nextCursor")
        if not cursor:
            return out


def new_id(prefix, n):
    return f"{prefix}{n:04d}"


def main():
    ap = argparse.ArgumentParser(description="Create an IcePanel flow for ChopChopMol 2.0")
    ap.add_argument("--landscape", required=True, help="Landscape ID (from the app URL)")
    ap.add_argument("--version", default="latest", help="Version ID or 'latest' (default)")
    ap.add_argument("--diagram", help="Diagram name or ID to attach the flow to")
    ap.add_argument("--name", default=FLOW_NAME, help="Flow name")
    ap.add_argument("--list", action="store_true", help="List diagrams + object names and exit")
    ap.add_argument("--dry-run", action="store_true", help="Print the POST body, write nothing")
    args = ap.parse_args()

    api_key = os.environ.get("ICEPANEL_API_KEY")
    if not api_key:
        sys.exit("Set ICEPANEL_API_KEY (IcePanel -> Organization settings -> API keys).")

    base = f"/landscapes/{args.landscape}/versions/{args.version}"
    objects = get_all(f"{base}/model/objects", api_key, "modelObjects")
    connections = get_all(f"{base}/model/connections", api_key, "modelConnections")
    diagrams = get_all(f"{base}/diagrams", api_key, "diagrams")

    by_name = {}
    for o in objects:
        by_name.setdefault(o["name"], o["id"])
    id_to_name = {o["id"]: o["name"] for o in objects}
    conn_by_pair = {(c["originId"], c["targetId"]): c for c in connections}

    if args.list:
        print(f"\n{len(diagrams)} diagram(s):")
        for d in diagrams:
            print(f"  - {d['name']!r}  id={d['id']}  type={d.get('type')}")
        print(f"\n{len(objects)} object(s) — names used by the flow narrative must match these:")
        for n in sorted(by_name):
            print(f"  - {n}")
        return

    if not diagrams:
        sys.exit("No diagrams found. Open the landscape in IcePanel and open/save a "
                 "diagram (the auto system-context diagram is fine), then re-run.")

    # resolve target diagram
    diagram = None
    if args.diagram:
        for d in diagrams:
            if args.diagram in (d["id"], d["name"]):
                diagram = d
                break
        if not diagram:
            sys.exit(f"Diagram {args.diagram!r} not found. Run --list to see options.")
    else:
        diagram = next((d for d in diagrams if d.get("type") == "context-diagram"), diagrams[0])
        print(f"No --diagram given; using {diagram['name']!r} (id={diagram['id']}).")

    diagram_model_id = diagram.get("modelId")

    # which model objects are actually placed on this diagram?
    content = req("GET", f"{base}/diagrams/{diagram['id']}/content", api_key)
    dc = content.get("diagramContent", content)
    on_diagram = {o.get("modelId") for o in dc.get("objects", {}).values()}

    # build steps
    steps = {}
    idx = 0
    warnings = []
    for entry in STEPS:
        kind = entry[0]
        sid = new_id("step-", idx + 1)
        step = {
            "id": sid, "index": idx,
            "originId": None, "targetId": None, "viaId": None,
            "parentId": diagram_model_id, "flowId": None, "paths": None,
            "description": "", "type": None,
        }
        if kind == "note":
            _, text, ntype = entry
            step["description"] = text
            step["type"] = ntype
        elif kind == "self":
            _, obj, text = entry
            oid = by_name.get(obj)
            if not oid:
                warnings.append(f"skip self-action: object {obj!r} not in model"); continue
            step["originId"] = step["targetId"] = oid
            step["description"] = text
            step["type"] = "self-action"
            if oid not in on_diagram:
                warnings.append(f"{obj!r} is not placed on diagram {diagram['name']!r}")
        elif kind == "conn":
            _, origin, target, text = entry
            oid, tid = by_name.get(origin), by_name.get(target)
            if not oid or not tid:
                miss = origin if not oid else target
                warnings.append(f"skip step: object {miss!r} not in model"); continue
            conn = conn_by_pair.get((oid, tid)) or conn_by_pair.get((tid, oid))
            if not conn:
                warnings.append(f"skip step: no connection {origin!r} -> {target!r} in model"); continue
            step["originId"], step["targetId"] = oid, tid
            step["viaId"] = conn.get("viaId")
            step["description"] = text
            step["type"] = "outgoing"
            if oid not in on_diagram or tid not in on_diagram:
                off = origin if oid not in on_diagram else target
                warnings.append(f"{off!r} is not placed on diagram {diagram['name']!r}")
        steps[sid] = step
        idx += 1

    for w in warnings:
        print(f"  ! {w}")

    payload = {
        "name": args.name,
        "diagramId": diagram["id"],
        "showConnectionNames": True,
        "steps": steps,
    }

    if args.dry_run:
        print("\n--- DRY RUN: flow POST body ---")
        print(json.dumps(payload, indent=2))
        print(f"\nWould POST to {base}/flows  ({len(steps)} steps)")
        return

    res = req("POST", f"{base}/flows", api_key, payload)
    flow = res.get("flow", res)
    fid = flow.get("id", "?")
    print(f"\nCreated flow {args.name!r} (id={fid}) with {len(steps)} steps.")
    print(f"Open it: https://app.icepanel.io/landscapes/{args.landscape}/versions/{args.version}"
          f"/flows/{fid}")


if __name__ == "__main__":
    main()
