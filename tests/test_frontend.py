"""
TDD tests for frontend UX and security fixes.
Run with: pytest tests/test_frontend.py -v
All tests should FAIL before the fixes are applied.
"""
import re
import os
import pytest

HTML_PATH = os.path.join(os.path.dirname(__file__), '..', 'demo', 'index.html')

@pytest.fixture(scope='module')
def html():
    with open(HTML_PATH, 'r', encoding='utf-8') as f:
        return f.read()

# ── Security ──────────────────────────────────────────────────────────────────

class TestXSSPrevention:
    def test_dompurify_script_loaded(self, html):
        """DOMPurify must be loaded before any marked.parse usage."""
        assert 'dompurify' in html.lower(), \
            "DOMPurify is not loaded. Add: <script src='https://cdn.jsdelivr.net/npm/dompurify@3.0.6/dist/purify.min.js'></script>"

    def test_no_unsanitized_marked_parse_in_innerhtml(self, html):
        """innerHTML must never be assigned raw marked.parse output."""
        # Match: someElement.innerHTML = marked.parse(...)
        # or:    .innerHTML = marked.parse(
        pattern = r'\.innerHTML\s*=\s*marked\.parse\s*\('
        matches = re.findall(pattern, html)
        assert len(matches) == 0, \
            f"Found {len(matches)} unsanitized marked.parse() → innerHTML assignment(s). Wrap with DOMPurify.sanitize()"

    def test_dompurify_used_with_marked(self, html):
        """DOMPurify.sanitize must be called somewhere alongside marked.parse."""
        assert 'DOMPurify.sanitize' in html, \
            "DOMPurify.sanitize() is not called anywhere in the file"

# ── UX P0 ─────────────────────────────────────────────────────────────────────

class TestLandingValueProp:
    def test_design_molecules_headline(self, html):
        """Landing card must have a value proposition headline."""
        assert 'Design molecules with AI' in html, \
            "Missing landing headline: 'Design molecules with AI'"

    def test_landing_subtext(self, html):
        """Landing card must have a descriptive subtext."""
        # Check for key phrases from the proposed copy
        has_subtext = (
            'natural language' in html.lower() or
            'optimize' in html.lower() and 'design' in html.lower() and 'AI' in html
        )
        assert has_subtext, "Landing card is missing descriptive subtext about AI capabilities"

class TestChatPlaceholder:
    def test_specific_placeholder(self, html):
        """Chat input placeholder must be molecule-specific, not generic."""
        assert 'Ask me anything' not in html, \
            "Generic placeholder 'Ask me anything' still present"
        assert 'optimize' in html.lower() or 'analyze' in html.lower(), \
            "Chat placeholder should mention optimize/analyze molecules"

class TestModelSelectorVisibility:
    def test_model_trigger_has_border(self, html):
        """ai-model-trigger must have visible border styling."""
        # Check that the CSS for .ai-model-trigger includes a border
        trigger_css_area = html[max(0, html.find('ai-model-trigger')-200):html.find('ai-model-trigger')+500]
        assert 'border' in trigger_css_area.lower() or '1px' in trigger_css_area, \
            ".ai-model-trigger is missing a visible border"

# ── UX P1 ─────────────────────────────────────────────────────────────────────

class TestFooterAttribution:
    def test_footer_exists(self, html):
        """Footer with attribution must be present."""
        assert 'ChopChopMol 2.0' in html, "Footer attribution 'ChopChopMol 2.0' not found"
        assert 'Powered by' in html or 'powered by' in html.lower(), \
            "Footer must include 'Powered by' attribution"

class TestToolbarDividers:
    def test_divider_opacity_increased(self, html):
        """Toolbar dividers must use opacity 0.2 (not 0.1)."""
        # Look for toolbar-divider CSS definition
        divider_idx = html.find('toolbar-divider')
        if divider_idx == -1:
            pytest.skip("toolbar-divider class not found in file")
        # Find the CSS block for it (look within 300 chars)
        divider_block = html[divider_idx:divider_idx+400]
        assert 'rgba(255,255,255,0.1)' not in divider_block, \
            ".toolbar-divider still uses low-contrast rgba(255,255,255,0.1)"

class TestCopyImprovements:
    def test_model_picker_title(self, html):
        """Model picker title must be updated."""
        # Old: "Model & Reasoning" / New: "Choose Model & Thinking Mode"
        assert 'Choose Model' in html or 'Thinking Mode' in html, \
            "Model picker title not updated to 'Choose Model & Thinking Mode'"


# ── Engineering hardening ─────────────────────────────────────────────────────

API_UTILS_PATH = os.path.join(os.path.dirname(__file__), '..', 'demo', 'utils', 'apiUtils.js')
ERROR_HANDLER_PATH = os.path.join(os.path.dirname(__file__), '..', 'demo', 'utils', 'errorHandler.js')
MOLECULE_PATH = os.path.join(os.path.dirname(__file__), '..', 'demo', 'atom', 'molecule.js')


@pytest.fixture(scope='module')
def api_utils():
    with open(API_UTILS_PATH, 'r', encoding='utf-8') as f:
        return f.read()


@pytest.fixture(scope='module')
def error_handler():
    with open(ERROR_HANDLER_PATH, 'r', encoding='utf-8') as f:
        return f.read()


@pytest.fixture(scope='module')
def molecule_js():
    with open(MOLECULE_PATH, 'r', encoding='utf-8') as f:
        return f.read()


class TestSSEErrorBoundary:
    def test_streamSSE_has_retry_param(self, api_utils):
        """streamSSE must accept a `retries` option for transport-level retries."""
        assert 'retries' in api_utils, "streamSSE missing retry support"
        # Exponential backoff should be implemented
        assert 'Math.pow' in api_utils or 'baseDelayMs' in api_utils, \
            "streamSSE missing exponential backoff"

    def test_per_event_handler_errors_contained(self, api_utils):
        """A single bad event must not kill the rest of the stream — the
        onEvent callback must be wrapped in try/catch."""
        # The onEvent invocation must be inside a try block
        assert 'try {\n                onEvent(event)' in api_utils \
            or "try { onEvent(event)" in api_utils, \
            "onEvent callback is not wrapped in try/catch (per-event error boundary missing)"


class TestGlobalErrorLog:
    def test_window_errors_array_initialized(self, error_handler):
        """`window.__errors` must be initialized so dev/QA can dump errors."""
        assert 'window.__errors' in error_handler, \
            "errorHandler.js does not expose window.__errors"

    def test_record_error_helper_exposed(self, error_handler):
        """A `recordError` helper must be exposed on window for callers to log
        their own caught errors."""
        assert 'window.recordError' in error_handler, \
            "window.recordError helper missing — callers can't log caught errors"

    def test_error_log_is_capped(self, error_handler):
        """The error log must be capped to avoid unbounded memory growth."""
        assert 'MAX_ERRORS' in error_handler or 'splice' in error_handler, \
            "Error log appears uncapped (memory leak risk)"


class TestThreeJsDisposalRace:
    def test_disposal_in_progress_flag_set(self, molecule_js):
        """The disposal-in-progress guard must be initialized in the
        constructor."""
        assert '_disposalInProgress' in molecule_js, \
            "Molecule._disposalInProgress flag not present"

    def test_reset_uses_guard(self, molecule_js):
        """reset() must check and set the disposal guard to be re-entry safe."""
        # The reset method should read the flag to early-return AND set it.
        idx = molecule_js.find('reset() {')
        assert idx != -1, "reset() method not found"
        body = molecule_js[idx:idx + 1500]
        assert '_disposalInProgress' in body, \
            "reset() does not consult the disposal guard"
        # And it should set it to true at start
        assert 'this._disposalInProgress = true' in body, \
            "reset() does not set _disposalInProgress = true"

    def test_create_force_arrows_respects_guard(self, molecule_js):
        """createForceArrows() must early-return during disposal."""
        idx = molecule_js.find('createForceArrows(')
        assert idx != -1, "createForceArrows method not found"
        body = molecule_js[idx:idx + 800]
        assert '_disposalInProgress' in body, \
            "createForceArrows() does not respect the disposal guard"

# ── Accessibility (Final QA regression) ──────────────────────────────────────

class TestAccessibility:
    def test_range_sliders_have_aria_labels(self, html):
        """Every <input type='range'> must have an aria-label for screen readers."""
        # Find all range inputs
        range_inputs = re.findall(r'<input[^>]*type="range"[^>]*>', html)
        assert len(range_inputs) > 0, "No range inputs found — test fixture broken"
        unlabeled = [r for r in range_inputs if 'aria-label' not in r]
        assert len(unlabeled) == 0, (
            f"{len(unlabeled)}/{len(range_inputs)} range sliders missing aria-label. "
            f"First: {unlabeled[0][:120] if unlabeled else ''}"
        )

    def test_skip_link_exists(self, html):
        """Skip-to-content link must be present for keyboard users."""
        assert 'class="skip-link"' in html, \
            "Missing skip-link for keyboard navigation"

    def test_html_lang_attribute(self, html):
        """<html> must have a lang attribute for screen readers."""
        assert re.search(r'<html[^>]*\blang=', html), \
            "<html> missing lang attribute"

    def test_meta_description_present(self, html):
        """Page must have a meta description for SEO and previews."""
        assert re.search(r'<meta[^>]*name="description"', html), \
            "Missing <meta name='description'>"

    def test_descriptive_page_title(self, html):
        """Page title must mention the product purpose, not just the name."""
        title_match = re.search(r'<title>([^<]+)</title>', html)
        assert title_match, "No <title> tag"
        title = title_match.group(1)
        # Must include at least one purpose-revealing word
        purpose_words = ['molecul', 'AI', 'chemistry', 'design']
        assert any(w.lower() in title.lower() for w in purpose_words), \
            f"Title '{title}' is not descriptive — should mention what the product does"

    def test_landing_card_has_region_role(self, html):
        """Landing card must be exposed as a landmark region."""
        assert re.search(r'id="landingCard"[^>]*role="region"', html), \
            "landingCard missing role='region' for screen-reader landmark navigation"


# ── Backend wiring regressions ───────────────────────────────────────────────

AIAGENT_PATH = os.path.join(os.path.dirname(__file__), '..', 'demo', 'aiagent.js')
APIUTILS_PATH = os.path.join(os.path.dirname(__file__), '..', 'demo', 'utils', 'apiUtils.js')


@pytest.fixture(scope='module')
def aiagent_js():
    with open(AIAGENT_PATH, 'r', encoding='utf-8') as f:
        return f.read()


@pytest.fixture(scope='module')
def apiutils_js():
    with open(APIUTILS_PATH, 'r', encoding='utf-8') as f:
        return f.read()


class TestNoStaleBackendUrls:
    """The legacy `chopchopmol-2-0-3.onrender.com` host is dead. Any hard-coded
    reference in production paths will silently fail on dev/prod. All callers
    must route through `getBackendUrl()` (which honours the dev host)."""

    def test_no_chopchopmol_2_0_3_in_index(self, html):
        assert 'chopchopmol-2-0-3.onrender.com' not in html, \
            "Stale onrender URL still wired up — route through getBackendUrl() instead"

    def test_local_getbackendurl_handles_dev(self, html):
        """The fallback getBackendUrl in index.html must route dev.chopchopmol.com
        to api-dev.chopchopmol.com (not the legacy Render fallback)."""
        # We expect at least one block that mentions both the dev host and
        # the api-dev backend URL in the same conditional.
        assert "dev.chopchopmol.com" in html and "api-dev.chopchopmol.com" in html, \
            "Local getBackendUrl() does not branch on the dev frontend hostname"


class TestAuthHeadersUnconditional:
    """The dev backend used to lock its CORS allow-headers to `content-type`
    plus BYOK keys, which forced the frontend to short-circuit auth headers on
    api-dev.chopchopmol.com (otherwise preflight failed as 'Failed to fetch').
    The backend has since widened its allow-list (commit d4236ee), so the
    frontend must send Authorization / X-Guest-Code / X-Guest-Token to every
    backend unconditionally — same code path as prod. These tests pin that
    behavior so the host-aware short-circuit can't sneak back in."""

    def test_aiagent_byok_headers_no_dev_short_circuit(self, aiagent_js):
        m = re.search(r'function getByokHeaders\(\)\s*\{([\s\S]*?)\n\}', aiagent_js)
        assert m, "getByokHeaders() function body not found"
        body = m.group(1)
        assert 'isDevBackend' not in body, \
            "getByokHeaders() must not branch on the dev backend host — " \
            "backend CORS now accepts auth headers everywhere"
        assert 'api-dev.chopchopmol.com' not in body, \
            "getByokHeaders() must not reference the dev backend host"
        # Authorization + X-Guest-Code must be attached unconditionally — no
        # surrounding `if (...)` predicate other than the per-header presence
        # check (`if (t)` / `if (guestCode)`).
        assert "h['Authorization']" in body, \
            "getByokHeaders() must attach Authorization header"
        assert "h['X-Guest-Code']" in body, \
            "getByokHeaders() must attach X-Guest-Code header"

    def test_apiutils_auth_headers_no_dev_short_circuit(self, apiutils_js):
        m = re.search(r'export function getAuthHeaders\(\)\s*\{([\s\S]*?)\n\}', apiutils_js)
        assert m, "getAuthHeaders() function body not found"
        body = m.group(1)
        assert 'isDevBackend' not in body, \
            "getAuthHeaders() must not branch on the dev backend host"
        assert 'api-dev.chopchopmol.com' not in body, \
            "getAuthHeaders() must not reference the dev backend host"
        assert "h['Authorization']" in body, \
            "getAuthHeaders() must attach Authorization header"
        assert "h['X-Guest-Token']" in body, \
            "getAuthHeaders() must attach X-Guest-Token header"
        assert "h['X-Guest-Code']" in body, \
            "getAuthHeaders() must attach X-Guest-Code header"


class TestComputeDeviceToggle:
    """Users need a manual CPU / GPU selector so they can opt into GPU
    acceleration when a g4dn-class spot is live and stay on cheap CPU
    otherwise. The toggle persists in localStorage and rides on every
    MACE / DFT request body so the backend can route accordingly."""

    def test_toggle_exists_in_model_modal(self, html):
        assert 'aiComputeToggle' in html, \
            "Compute toggle (#aiComputeToggle) missing from model modal"
        assert 'data-device="cpu"' in html and 'data-device="gpu"' in html, \
            "Compute toggle must offer both CPU and GPU options"

    def test_compute_toggle_persists_to_localstorage(self, html):
        assert 'chopchop_compute_device' in html, \
            "Compute toggle must persist its choice to localStorage key 'chopchop_compute_device'"

    def test_mace_utils_exports_get_compute_device(self):
        path = os.path.join(os.path.dirname(__file__), '..', 'demo', 'utils', 'maceUtils.js')
        with open(path) as f:
            content = f.read()
        assert 'export function getComputeDevice' in content, \
            "maceUtils.js must export getComputeDevice() so call sites can inject the user's choice"
        assert "'chopchop_compute_device'" in content, \
            "getComputeDevice() must read from localStorage key 'chopchop_compute_device' (mirrors the UI)"

    def test_mace_calls_include_device_field(self):
        path = os.path.join(os.path.dirname(__file__), '..', 'demo', 'utils', 'maceUtils.js')
        with open(path) as f:
            content = f.read()
        # Every public MACE / DFT helper must inject the device field via
        # getComputeDevice() so the backend can route.
        for helper in ('callMaceEnergy', 'callMaceEnergyBatch', 'callMaceOptimize',
                       'callMaceMD', 'callDftEnergy', 'callDftEnergyBatch'):
            m = re.search(rf'export async function {helper}\([^)]*\)\s*\{{([\s\S]*?)\n\}}', content)
            assert m, f"{helper} not found in maceUtils.js"
            body = m.group(1)
            assert 'getComputeDevice()' in body, \
                f"{helper} must inject device: getComputeDevice() into its request body"


class TestGroqReducedToolsetNotice:
    """Groq free tier exposes a reduced toolset (27 of 59 tools). The UI must
    surface this so users understand why certain features may not be reachable
    when a Groq model is selected. Two requirements:
      1. Each Groq model's hint string mentions the toolset constraint.
      2. updateModelTrigger() shows the trigger badge with the toolset count
         when a Groq model is the active selection."""

    def test_llama_hint_mentions_toolset(self, html):
        # Find the metadata entry for llama-3.3-70b-versatile and assert its
        # hint mentions the 27/59 limit so users see it in the model picker.
        m = re.search(r"'llama-3\.3-70b-versatile':\s*\{[^}]*hint:\s*'([^']*)'", html)
        assert m, "llama-3.3-70b-versatile MODEL_META entry not found"
        hint = m.group(1)
        assert '27' in hint and '59' in hint, \
            f"Llama hint must surface the 27-of-59 toolset constraint; got: {hint!r}"

    def test_trigger_badge_shows_groq_toolset(self, html):
        # updateModelTrigger() must branch on isGroqModelValue() and reveal
        # the trigger badge with the toolset count.
        assert 'isGroqModelValue' in html, \
            "isGroqModelValue() helper missing — needed to detect Groq models"
        m = re.search(r'function updateModelTrigger\(\)\s*\{([\s\S]*?)\n\s{12}\}', html)
        assert m, "updateModelTrigger() function body not found"
        body = m.group(1)
        assert 'isGroqModelValue' in body, \
            "updateModelTrigger() must call isGroqModelValue() to gate the badge"
        assert '27/59' in body or "'27/59 tools'" in body, \
            "Trigger badge text must show '27/59 tools' for Groq models"


# ── Simplified model picker (4 models, 2 thinking levels) ─────────────────────

class TestSimplifiedPicker:
    """Picker pared down to a single Auto entry (Groq Llama 3.3 70B). Users
    who want Claude/GPT bring their own API key via the BYOK modal — see
    TestSingleModelDropdown above for the canonical assertions. These
    legacy tests are kept as guards that nothing slips back in."""

    FINAL_MODEL_VALUES = [
        'llama-3.3-70b-versatile',
    ]

    REMOVED_MODEL_VALUES = [
        # All Claude/OpenAI/legacy values — must not appear in the static
        # <select>. Users get them through the BYOK path instead.
        'claude-opus-4-7', 'claude-sonnet-4-6', 'gpt-5',
        'claude-opus-4-6', 'claude-opus-4-5-20251101', 'claude-opus-4-1-20250805',
        'claude-opus-4-20250514', 'claude-sonnet-4-5-20250929',
        'claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001',
        'claude-3-5-haiku-20241022', 'gpt-5-mini', 'gpt-5-nano',
        'gpt-5.1', 'gpt-5.2', 'gpt-5.3-chat-latest', 'gpt-5.4', 'gpt-5.5',
        'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'o3', 'o4-mini',
        'meta-llama/llama-4-scout-17b-16e-instruct',
        'meta-llama/llama-4-maverick-17b-128e-instruct',
        'llama-3.1-8b-instant', 'gemma2-9b-it',
    ]

    def test_select_has_exactly_one_option(self, html):
        """The #aiModelSelect element must hold exactly one Auto entry."""
        m = re.search(r'<select id="aiModelSelect"[^>]*>([\s\S]*?)</select>', html)
        assert m, "#aiModelSelect block not found"
        block = m.group(1)
        options = re.findall(r'<option\s+value="([^"]+)"', block)
        assert len(options) == 1, \
            f"Expected exactly 1 <option> tag inside #aiModelSelect (Auto only); got {len(options)}: {options}"

    def test_select_contains_the_retained_value(self, html):
        """The single retained model value must be present in the select block."""
        m = re.search(r'<select id="aiModelSelect"[^>]*>([\s\S]*?)</select>', html)
        assert m, "#aiModelSelect block not found"
        block = m.group(1)
        for value in self.FINAL_MODEL_VALUES:
            assert f'value="{value}"' in block, \
                f"Retained model value {value!r} missing from #aiModelSelect"

    def test_removed_models_no_longer_in_select(self, html):
        """None of the retired model values should appear inside the select."""
        m = re.search(r'<select id="aiModelSelect"[^>]*>([\s\S]*?)</select>', html)
        assert m, "#aiModelSelect block not found"
        block = m.group(1)
        for value in self.REMOVED_MODEL_VALUES:
            assert f'value="{value}"' not in block, \
                f"Removed model value {value!r} still present in #aiModelSelect"

    def test_thinking_toggle_has_two_buttons(self, html):
        """The thinking toggle must have exactly 2 buttons: Off (0) and On (10000)."""
        m = re.search(
            r'<div class="ai-thinking-toggle" id="aiThinkingToggle">([\s\S]*?)</div>',
            html,
        )
        assert m, "#aiThinkingToggle block not found"
        block = m.group(1)
        budgets = re.findall(r'data-budget="(\d+)"', block)
        assert budgets == ['0', '10000'], \
            f"Expected exactly two data-budget buttons [0, 10000], got {budgets}"

    def test_old_thinking_budget_values_gone_from_toggle(self, html):
        """The legacy 4096 (Low) and 32000 (High) budgets must no longer be
        rendered as user-facing buttons. They may still appear in the migration
        comment / logic but not as data-budget attributes."""
        m = re.search(
            r'<div class="ai-thinking-toggle" id="aiThinkingToggle">([\s\S]*?)</div>',
            html,
        )
        assert m, "#aiThinkingToggle block not found"
        block = m.group(1)
        assert 'data-budget="4096"' not in block, \
            "Legacy Low (4096) budget button still wired into the thinking toggle"
        assert 'data-budget="32000"' not in block, \
            "Legacy High (32000) budget button still wired into the thinking toggle"

    def test_groq_tab_present_in_modal(self, html):
        """The model modal must expose a Groq tab so Llama doesn't get orphaned."""
        assert 'data-provider="Groq"' in html, \
            "Model modal missing a data-provider='Groq' tab for the Llama option"


# ── Dynamic typing-indicator label (UX P1) ───────────────────────────────────

class TestDynamicTypingLabel:
    """The chat typing indicator used to say 'Thinking' with 3 dots for the
    entire round-trip — even when the user had thinking turned off, and even
    while a tool was running. The label must reflect the actual SSE phase
    and include an elapsed-time counter."""

    def test_chat_status_label_state_exists(self, html):
        """A mutable _chatStatusLabel variable must exist so the SSE handler
        can update the label across multiple events."""
        assert '_chatStatusLabel' in html, \
            "_chatStatusLabel state variable missing — typing indicator can't be dynamic"

    def test_writing_response_phase(self, html):
        """The first text token must flip the label to 'Writing response'."""
        assert "_setStatus('Writing response')" in html, \
            "First text token must update the status label to 'Writing response'"

    def test_calling_tool_phase(self, html):
        """The tool_status SSE event must update the label to 'Calling tool: …'."""
        assert "_setStatus(`Calling tool:" in html, \
            "tool_status SSE event must update the status label to 'Calling tool: …'"

    def test_thinking_phase_only_on_thinking_start(self, html):
        """The 'Thinking' label must only be set in the thinking_start branch
        — not unconditionally for every request."""
        assert "_setStatus('Thinking')" in html, \
            "thinking_start branch must set the status label to 'Thinking'"

    def test_silence_watchdog_present(self, html):
        """A silence watchdog must swap the label to 'Waiting for backend'
        after a quiet period."""
        assert 'SILENCE_THRESHOLD_MS' in html, \
            "Silence watchdog threshold constant missing"
        assert 'Waiting for backend' in html, \
            "Silence watchdog must surface 'Waiting for backend' label"

    def test_elapsed_counter_present(self, html):
        """The status line must include an elapsed-time counter so users can
        distinguish slow from stuck."""
        assert 'ELAPSED_THRESHOLD_MS' in html, \
            "Elapsed-time counter threshold missing"
        # The counter format is "{label} · {seconds}s" — verify the seconds suffix
        # construction is present.
        assert '${seconds}s' in html, \
            "Elapsed counter must append a seconds suffix to the status label"

    def test_aiagent_does_not_hardcode_thinking(self):
        """aiagent.js must not send a 'Thinking' status string on every
        request — the chat UI's _setStatus is what governs the label now."""
        path = os.path.join(os.path.dirname(__file__), '..', 'demo', 'aiagent.js')
        with open(path) as f:
            content = f.read()
        # The "i === 0" initial onChunk call must NOT send 'Thinking' anymore.
        # Match the legacy line so a future revert is caught immediately.
        assert "onChunk(null, 'Thinking');" not in content, \
            "aiagent.js still hardcodes 'Thinking' as the initial status — " \
            "the chat UI should drive the label via SSE phase instead"


# ── Cloud panel auth state (UX P1) ───────────────────────────────────────────

FILE_EXPLORER_PATH = os.path.join(os.path.dirname(__file__), '..', 'demo', 'fileExplorer.js')


@pytest.fixture(scope='module')
def file_explorer_js():
    with open(FILE_EXPLORER_PATH, 'r', encoding='utf-8') as f:
        return f.read()


class TestCloudPanelAuthState:
    """The right-rail Cloud panel used to say 'Sign in to use cloud storage'
    even after sign-in, implying broken auth. Bind the panel render to
    Firebase auth state so it reads 'Signed in as ...' + empty state when
    signed in, and the sign-in prompt when signed out."""

    def test_cloud_panel_renders_on_authStateChanged(self, file_explorer_js):
        # The file explorer must re-render the cloud list on every auth
        # state change, not just once.
        assert "addEventListener('authStateChanged'" in file_explorer_js, \
            "fileExplorer.js does not listen for authStateChanged"
        # The listener must call loadCloudMolecules (the panel render path).
        assert 'loadCloudMolecules' in file_explorer_js, \
            "loadCloudMolecules() not referenced in fileExplorer.js"

    def test_signed_out_branch_shows_signin_copy(self, file_explorer_js):
        assert 'Sign in to use cloud storage' in file_explorer_js, \
            "Cloud panel must show 'Sign in to use cloud storage' for signed-out users"

    def test_signed_in_empty_state_present(self, file_explorer_js):
        assert 'No saved molecules yet' in file_explorer_js, \
            "Cloud panel must show 'No saved molecules yet' for signed-in users with no files"
        assert 'Signed in as' in file_explorer_js, \
            "Cloud panel must show 'Signed in as {email}' for signed-in users"


# ── Backend switcher gated (UX P1) ───────────────────────────────────────────

class TestBackendSwitcherGated:
    """End users were flipping the RunPod/Render toggle and breaking their
    session. The pill row must be hidden by default and only revealed for
    users with the admin/qa Firebase custom claim."""

    def test_show_backend_switcher_default_false(self, html):
        assert 'SHOW_BACKEND_SWITCHER = false' in html, \
            "SHOW_BACKEND_SWITCHER must default to false (fail-closed)"

    def test_admin_claim_check_present(self, html):
        assert 'userHasAdminClaim' in html, \
            "userHasAdminClaim() helper missing — backend switcher can't gate on custom claims"
        assert 'getIdTokenResult' in html, \
            "Admin gate must read Firebase ID token result for custom claims"
        assert 'claims.admin' in html or "claims['admin']" in html, \
            "Admin gate must check the 'admin' custom claim"

    def test_switcher_hidden_by_default(self, html):
        """The init function must set display:none on #backendSwitcher
        before any async claim check resolves."""
        # Find the init function body and assert it hides the root first.
        idx = html.find('initBackendSwitcher')
        assert idx != -1, "initBackendSwitcher() not found"
        body = html[idx:idx + 2500]
        assert "root.style.display = 'none'" in body, \
            "initBackendSwitcher() must hide #backendSwitcher by default"


# ── Guest-code field hidden (UX P1) ──────────────────────────────────────────

class TestGuestCodeHidden:
    """The legacy 'Continue as guest' field on the sign-in screen is
    server-side-disabled (REQUIRE_AUTH=true), so the UI must hide it to
    stop users from typing a code and getting an opaque failure."""

    def test_guest_code_inputs_hidden(self, html):
        # The wrapping form must be marked with the feature flag attribute
        # AND have display:none so it doesn't render.
        # We accept either the form or the divider being flagged — both should
        # be hidden together so they can be revived as a unit.
        m = re.search(
            r'<div class="ag-form"[^>]*data-feature="guest-code"[^>]*style="[^"]*display\s*:\s*none[^"]*"',
            html,
        )
        assert m, \
            "Guest-code form must carry data-feature='guest-code' and display:none"

    def test_guest_code_divider_hidden(self, html):
        m = re.search(
            r'<div class="ag-divider"[^>]*data-feature="guest-code"[^>]*style="[^"]*display\s*:\s*none[^"]*"',
            html,
        )
        assert m, \
            "Guest-code 'or' divider must carry data-feature='guest-code' and display:none"

    def test_request_access_link_still_visible(self, html):
        """The Request access link must stay visible — only the guest-code
        path is hidden."""
        assert 'early-access.html">Request access' in html, \
            "Request access link disappeared along with the guest-code field"


# ── Sign-in error mapping (UX P0 — no raw Firebase strings) ──────────────────

class TestSignInErrorMapping:
    """The sign-in form must surface friendly, user-language error messages
    instead of leaking the raw 'Firebase: Error (auth/invalid-credential).'
    SDK string. The banner must sit between password and Sign-in (line of
    sight), not 330px below the form."""

    def test_firebase_error_map_exists(self, html):
        assert 'FIREBASE_AUTH_ERROR_MESSAGES' in html, \
            "FIREBASE_AUTH_ERROR_MESSAGES map is missing — raw Firebase strings will leak"

    def test_invalid_credential_mapped(self, html):
        assert "'auth/invalid-credential': 'Email or password is incorrect.'" in html, \
            "auth/invalid-credential must map to 'Email or password is incorrect.'"

    def test_too_many_requests_mapped(self, html):
        assert "'auth/too-many-requests'" in html and 'try again in a minute' in html.lower(), \
            "auth/too-many-requests must surface a throttle-aware message"

    def test_network_error_mapped(self, html):
        assert "'auth/network-request-failed'" in html and 'check your connection' in html.lower(), \
            "auth/network-request-failed must surface a network-aware message"

    def test_inline_error_banner_present(self, html):
        """The error banner must exist between password input and Sign-in button."""
        assert 'id="ag-signin-error"' in html, \
            "Inline sign-in error banner (#ag-signin-error) is missing"
        # Verify the banner is positioned between the password field and the
        # Sign-in submit button so the user sees it in their line of sight.
        idx_pw = html.find('id="ag-pw"')
        idx_err = html.find('id="ag-signin-error"')
        idx_submit = html.find('id="ag-email-btn"')
        assert idx_pw < idx_err < idx_submit, \
            "Sign-in error banner must sit between the password input and the Sign-in button"


# ── Chat error card (UX P0 — backend failure UX) ─────────────────────────────

class TestChatErrorCard:
    """When the AI backend is unreachable, the chat must render a real error
    card with a Retry button (and a Show details disclosure for the raw
    error message) — not a tiny red pill saying 'Failed to fetch'."""

    def test_error_card_renderer_exists(self, html):
        """renderChatErrorCard() must be defined in the inline chat script."""
        assert 'function renderChatErrorCard' in html, \
            "renderChatErrorCard() helper missing — error card cannot be built"

    def test_error_card_emits_retry_button(self, html):
        """The renderer must emit an .ai-error-card-retry button in its markup."""
        # The retry button class string must appear in the renderer body so
        # network failures get a real retry CTA, not a tiny red pill.
        assert 'ai-error-card-retry' in html, \
            "Error card renderer does not emit a .ai-error-card-retry button"
        assert 'Retry' in html, \
            "Error card Retry label missing"

    def test_error_card_has_details_disclosure(self, html):
        """The renderer must emit a Show details disclosure for the raw
        error.name + error.message string."""
        assert 'ai-error-card-details' in html, \
            "Error card renderer does not emit a .ai-error-card-details disclosure"
        assert 'Show details' in html, \
            "Show details toggle label missing from error card"

    def test_aiagent_uses_connect_timeout(self):
        """sendToAI must wrap the initial fetch in a connect timeout so
        users don't stare at 'Thinking…' indefinitely on a TCP/DNS failure.
        Originally 10s; bumped to 60s in af74692 after live testing showed
        Groq free-tier TTFT hits 30-45s and the 10s ceiling was firing
        AFTER the upstream call had legitimately started."""
        path = os.path.join(os.path.dirname(__file__), '..', 'demo', 'aiagent.js')
        with open(path) as f:
            content = f.read()
        assert 'CONNECT_TIMEOUT_MS' in content, \
            "aiagent.js must define a CONNECT_TIMEOUT_MS for the initial fetch"
        # Extract numeric value and assert it's in the sane 30-120s range.
        m = re.search(r'const CONNECT_TIMEOUT_MS\s*=\s*(\d+)\s*;', content)
        assert m, "CONNECT_TIMEOUT_MS must be a numeric literal"
        ms = int(m.group(1))
        assert 30000 <= ms <= 120000, \
            f"CONNECT_TIMEOUT_MS={ms} outside the 30-120s sane range " \
            f"(too short → fires during normal Groq TTFT; too long → user " \
            f"stares at a stuck spinner)"

    def test_aiagent_classifies_errors(self):
        """sendToAI must surface errorKind so the UI can branch on
        network vs. server vs. client failures."""
        path = os.path.join(os.path.dirname(__file__), '..', 'demo', 'aiagent.js')
        with open(path) as f:
            content = f.read()
        assert 'errorKind' in content, \
            "aiagent.js must emit errorKind on failed sends"
        assert "errorKind: 'network'" in content, \
            "aiagent.js must classify transport-level failures as errorKind: 'network'"


class TestChatComposerNoGrammarly:
    """The chat textarea should suppress Grammarly's injected overlay icons
    (huge user cohort has Grammarly installed; the badge squats over the right
    side of the input). Use the data-gramm / spellcheck attributes Grammarly
    documents as opt-out signals."""

    def test_chat_textarea_opts_out_of_grammarly(self, html):
        m = re.search(r'<textarea[^>]*id="aiChatInput"[^>]*>', html)
        assert m, "aiChatInput textarea not found"
        tag = m.group(0)
        assert 'data-gramm="false"' in tag, \
            "aiChatInput is missing data-gramm=\"false\" — Grammarly overlay will inject"
        assert 'spellcheck="false"' in tag, \
            "aiChatInput should set spellcheck=\"false\" to suppress browser spell-check too"


class TestSingleModelDropdown:
    """The model picker is now reduced to a single 'Auto' entry (Llama 3.3
    70B via Groq). Users who want Claude/GPT bring their own API key via
    the BYOK modal (key icon in the AI Assistant header). This keeps
    hosted token costs predictable on dev — the server only pays for the
    Groq free-tier path."""

    def test_only_groq_llama_in_dropdown(self, html):
        # The <select> should contain exactly one <option> value
        m = re.search(r'<select id="aiModelSelect"[^>]*>([\s\S]*?)</select>', html)
        assert m, "aiModelSelect not found"
        block = m.group(1)
        options = re.findall(r'<option value="([^"]+)"', block)
        assert options == ['llama-3.3-70b-versatile'], \
            f"Dropdown must have exactly one option (llama-3.3-70b-versatile); got {options}"

    def test_byok_hint_inside_picker(self, html):
        assert 'aiModelByokOpen' in html, \
            "Picker missing the BYOK-open hint button (#aiModelByokOpen)"
        assert 'Bring your own API key' in html, \
            "Picker must point users at BYOK with the literal phrase 'Bring your own API key'"

    def test_fallback_model_is_groq_only(self, html):
        m = re.search(r"const FALLBACK_MODEL\s*=\s*'([^']+)'", html)
        assert m, "FALLBACK_MODEL must be a single quoted string literal"
        assert m.group(1) == 'llama-3.3-70b-versatile', \
            f"FALLBACK_MODEL must be llama-3.3-70b-versatile; got {m.group(1)!r}"


class TestDevFirebaseProjectIsolation:
    """The dev frontend (dev.chopchopmol.com) MUST authenticate against the
    `chopchopmoldev` Firebase project, not the prod `chopchopmol-2` project —
    otherwise tokens issued by the frontend can't be verified by the dev
    backend (whose Admin SA is for `chopchopmoldev`), and every authed call
    returns 401. Bug discovered when Nguyen's email/password login failed
    even though his founder account existed (in the dev project)."""

    def test_dev_firebase_project_branch_present(self, html):
        assert 'isDevFirebaseHost' in html, \
            "Hostname-based Firebase project selection missing"
        assert '"chopchopmoldev"' in html, \
            "chopchopmoldev projectId not present — dev frontend will sign into the wrong project"
        assert 'dev.chopchopmol.com' in html, \
            "dev.chopchopmol.com must be in the DEV_FB_HOSTS set"

    def test_prod_firebase_config_still_present(self, html):
        # Prod path must remain reachable for chopchopmol.com
        assert '"chopchopmol-2"' in html, \
            "chopchopmol-2 projectId removed — prod will break"

    def test_dev_fallback_model_is_llama(self, html):
        # Dev's Anthropic key is a placeholder; defaulting new users to
        # Llama-on-Groq avoids the 401 invalid-x-api-key wall.
        assert "'llama-3.3-70b-versatile'" in html, \
            "Dev fallback model must be llama-3.3-70b-versatile while Anthropic key is dummy"
        assert "isDevFirebaseHost" in html and "FALLBACK_MODEL" in html, \
            "FALLBACK_MODEL must branch on host"
