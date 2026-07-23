# Creating an IcePanel flow for ChopChopMol 2.0

**Flows can't go in the model-import JSON.** The file you uploaded
(`chopchopmol-icepanel.json`) uses IcePanel's `LandscapeImportData` schema,
which only carries objects, connections, and tags — there is no flow or diagram
field. Flows are created through the **Flows API** (still JSON, but a `POST` with
an API key), and each flow must attach to an existing **diagram**.

Because IcePanel assigns brand-new random IDs to every object at import time, a
static flow file can't reference them. `create_icepanel_flow.py` resolves the
real IDs live and builds the flow for you.

## Steps

1. **Import the model** (already done): `chopchopmol-icepanel.json`.

2. **Have a diagram.** In IcePanel, open your landscape and open the diagram the
   flow should animate on — the auto-generated **system context** diagram is a
   good default. Opening/saving it once gives it an ID. The flow narrative walks:
   Researcher → Frontend → AI Chat Proxy → Claude API → MACE Service, so pick a
   diagram where those objects are visible for the best visual result.

3. **Make an API key:** IcePanel → Organization settings → API keys.

4. **Find your landscape ID** in the app URL:
   `app.icepanel.io/landscapes/<LANDSCAPE_ID>/versions/latest/...`

5. **Run it:**
   ```bash
   export ICEPANEL_API_KEY="ip_xxx"

   # see your diagrams + the object names the flow expects
   python create_icepanel_flow.py --landscape <LANDSCAPE_ID> --list

   # preview the exact POST body without writing anything
   python create_icepanel_flow.py --landscape <LANDSCAPE_ID> --diagram "Context" --dry-run

   # create the flow
   python create_icepanel_flow.py --landscape <LANDSCAPE_ID> --diagram "Context"
   ```

The script skips (with a warning) any step whose object or connection isn't in
the model or isn't placed on the chosen diagram, so it never produces an invalid
flow. Edit the `STEPS` list at the top of the script to change the story.

## Files

| File | What it is |
|------|-----------|
| `create_icepanel_flow.py` | Resolves live IDs and POSTs the flow via the Flows API |
| `chopchopmol-flow.example.json` | Illustrative POST body (placeholder IDs) so you can see the shape |
| `chopchopmol-icepanel.json` | The model import (objects + connections + tags) |
