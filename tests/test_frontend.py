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
