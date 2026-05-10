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
