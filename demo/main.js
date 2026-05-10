import * as THREE from 'three';
import { ArcballControls } from 'jsm/controls/ArcballControls.js';
import { RGBELoader } from 'jsm/loaders/RGBELoader.js';

import Molecule from './atom/molecule.js';
import FileHandler from './utils/fileHandler.js';
import { reattachButtonHandler } from './utils/domUtils.js';
import './utils/orbitalUtils.js'; // Orbital visualization utilities
import './utils/moldenOrbitalUtils.js'; // Molden orbital grid generation
import {
    hideRestrictionMessage,
    showRestrictionMessage,
    showSignInPrompt,
    restoreOriginalHandlers,
    enableAtomInteraction,
    enableAllFeatures,
    disableAtomInteraction,
    storeOriginalHandlers,
    restrictFeatures,
    updateFeatureAccess,
    originalEventHandlers,
    isUserSignedIn

} from './handleFeatures.js';

import {
    saveStylePreferences,
    loadStylePreferences,
    applyStylePreferences,
    showNotification,
    resetToDefaults,

} from './handleStyles.js';

import './utils/toast.js';
import './utils/errorHandler.js';

// WebGL feature detection
function checkWebGLSupport() {
    try {
        const canvas = document.createElement('canvas');
        return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    } catch (e) {
        return false;
    }
}

if (!checkWebGLSupport()) {
    window.showCriticalError?.('WebGL is not supported by your browser. ChopChopMol requires WebGL to render 3D molecules. Please use a modern browser like Chrome, Firefox, or Edge, and ensure hardware acceleration is enabled.');
    throw new Error('WebGL not supported');
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000000);

let renderer;
try {
    renderer = new THREE.WebGLRenderer({
        antialias: false,
        powerPreference: "high-performance",
        alpha: true,
        preserveDrawingBuffer: true
    });
} catch (e) {
    console.error('WebGL renderer creation failed:', e);
    window.showCriticalError?.('Failed to initialize 3D rendering. Your GPU may not support WebGL, or hardware acceleration may be disabled in your browser settings.');
    throw e;
}
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

let controls = new ArcballControls(camera, renderer.domElement);

controls.rotateSpeed = 1.0;
controls.zoomSpeed = 2.0;
controls.panSpeed = 1.0;
controls.dynamicDampingFactor = 1.0;
controls.cursorZoom = true;
controls.enableAnimations = true;

let shiftDown = false;
let cmdDown = false;
let ribbonMode = false;
let ribbonGroup = null;
let atomsSelected = [];
let fragments = [];
let fragmentsSelected = [];
let hoveredAtom = null;
let bondLengthLabels = []; // Store bond length label objects
let contextMenuOpen = false;
let arrowKeyRotationStep = 0.1; // degrees per arrow key press
let arrowKeyTranslationStep = 0.1; // units per arrow key press
let currentRotationAngle = 0; // Track the current rotation angle globally
let baseAtomPositions = {}; // The TRUE original positions before ANY rotation
let rotationBasePositions = {}; // Original positions before any rotation
let rotationState = {
    basePositions: {},           // Original positions before any transformation
    currentAngle: 0,             // Current rotation angle in degrees
    isActive: false,              // Whether rotation is currently active
    axis: null,                   // Current rotation axis {point: Vector3, direction: Vector3}
    selectedAtoms: []             // Indices of atoms to rotate
};
let orthoCamera = null;
let useOrthographic = false;
window.sillyMode = null;

window.fragments = fragments;
let editingMolecule = true;


const light = new THREE.DirectionalLight(0xffffff, 3);
const ambientLight = new THREE.AmbientLight(0xffffff, 2);
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();



scene.add(light);
scene.add(ambientLight);
camera.position.z = 15;
let mode = 0;
let antialiasToggled = false
let labelMode = false; // Track label mode

const switchModeButton = document.getElementById('switchMode');
const toggleSillyButton = document.getElementById('toggleSilly');
const saveImageButton = document.getElementById('captureScreen');
const analyzeMoleculeButton = document.getElementById('analyze-molecule');
const editMoleculeButton = document.getElementById('editMolecule');
const closeStyleSelectorButton = document.getElementById('closeStyleSelector');
const initialCameraPosition = new THREE.Vector3(0, 0, 15);
const initialCameraTarget = new THREE.Vector3(0, 0, 0);

let dragging = false;
let dragPlane = new THREE.Plane();
let dragOffsets = {};
let isSelecting = false;
let selectionStart = { x: 0, y: 0 };
let selectionEnd = { x: 0, y: 0 };
let rotationAxis = null; // Store the defined axis
let axisAtoms = []; // Store the two atoms that define the axis
let axisVisualizer = null; // Three.js object to visualize the axis
let labels = [];
const selectionBox = document.getElementById('selectionBox');
const projectionVector = new THREE.Vector3();
let isolationHistory = [];
let currentIsolationIndex = -1;
let originalMoleculeData = null;
let originalFragments = [];
let isInIsolationMode = false;
let globalFragmentStore = {
    originalAtomCount: 0,
    fragments: [],  // Array of fragments, each is an array of original atom indices
    fragmentIdMap: new Map() // Maps fragment signatures to avoid duplicates
};
const fragmentColors = [
    0x0352ff,
    0xf5b638,
    0x7af538,
    0xd75eff,
    0x5eb9ff,
    0x00ffff,
    0x715eff,
    0xf7baff,
    0xff6b6b,
    0x4ecdc4,
    0xffe66d,
    0x95e1d3,
    0xf38181,
    0xaa96da,
    0xfcbad3,
    0xa8d8ea
];

export default class Main {
    constructor() {
        this.scene = scene;
        this.atomData = [];
        this.data = [];
        this.atomSettings = [];
        this.loader = new FileHandler(this);
        this.loader.parseJSON().then(settings => {
            this.atomSettings = settings || {};
            this.molecule = new Molecule(this, this.atomSettings, false);
            this.overlayMolecule = new Molecule(this, this.atomSettings, true);

        });
        this.mode = 0
        this.roughness = 0.17;
        this.metalness = 0.3;
        this.bondThickness = 0.15;
        this.opacity = 1;
        this.atomSize = 1;
        this.resolution = 16
        this.labelsToggled = false;
        initializeSelectionBox();


    }
    init(data, mode) {
        this.molecule.init(data, mode, true, false);
        render()
        console.log(this.data);
    }
    reset(soft = false) {
        // Clear atoms and bonds
        this.atoms = [];
        this.bonds = [];

        if (this.instancedMesh) {
            this.main.scene.remove(this.instancedMesh);

            if (this.instancedMesh.geometry) {
                this.instancedMesh.geometry.dispose();
            }

            if (this.instancedMesh.material) {
                if (Array.isArray(this.instancedMesh.material)) {
                    this.instancedMesh.material.forEach(mat => mat.dispose());
                } else {
                    this.instancedMesh.material.dispose();
                }
            }

            this.instancedMesh = null;
        }

        // Clear bond group
        if (this.bondGroup) {
            while (this.bondGroup.children.length > 0) {
                const child = this.bondGroup.children[0];
                this.bondGroup.remove(child);

                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => mat.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            }

            this.main.scene.remove(this.bondGroup);
            this.bondGroup = new THREE.Group();
        }

        // Clear ribbon
        if (ribbonGroup) {
            import('./utils/ribbon.js').then(module => {
                module.removeRibbon(ribbonGroup, scene);
                ribbonGroup = null;
            });
        }

        this.labels = [];

        atomsSelected = [];
        hoveredAtom = null;

        if (!soft) {
            rotationAxis = null;
            axisAtoms = [];
            if (axisVisualizer) {
                this.scene.remove(axisVisualizer);
                axisVisualizer.geometry.dispose();
                axisVisualizer.material.dispose();
                axisVisualizer = null;
            }
            fragments = [];
            labels = [];
            clearAllBondLengthLabels();
            fragmentsSelected = [];
        }
        this.molecule.reset();

        clearScene(this.scene);

        // When soft reset, re-add existing bondLengthLabel lines to scene (but not axis)
        if (soft && bondLengthLabels.length > 0) {
            bondLengthLabels.forEach(labelInfo => {
                if (labelInfo.line) {
                    this.scene.add(labelInfo.line);
                }
            });
        } else {
            labels.forEach(label => {
                createInfoLabel(label[0], label[1], label[2] ?? null, label[3] ?? null);
            });
        }
        updateFragmentList(document.getElementById('fragmentList'));
        render();
    }
    newMolecule(data, mode, center = true, soft = false, useRibbonMode = false, animate = true) {
        const landingCard = document.getElementById('landingCard');
        if (landingCard) landingCard.style.display = 'none';

        window._pendingChartData = null;
        this.reset(soft);
        this.molecule.init(data, mode, center, useRibbonMode);

        // If ribbon mode, create ribbon instead of showing atoms
        if (useRibbonMode && data.ribbonData) {
            import('./utils/ribbon.js').then(module => {
                ribbonGroup = module.createRibbon(
                    data.ribbonData,
                    scene,
                    this.molecule.stretch,
                    this.molecule.offset
                );
                render();
            });
            ribbonMode = true;
            // disableAtomInteractions();
        } else {
            // Normal mode - ensure interactions are enabled
            ribbonMode = false;
            console.log("numAtoms", this.molecule.atoms.length);
            enableAtomInteractions();

            // Hide meshes BEFORE any render if we're going to animate
            const shouldAnimate = animate && !soft && this.molecule.atoms.length > 0 && this.molecule.atoms.length < 5000 && window.sillyMode;
            if (this.molecule.instancedMesh) {
                this.molecule.instancedMesh.visible = true;
            }
            if (this.molecule.bondGroup?.children[0]) {
                this.molecule.bondGroup.children[0].visible = true;
            }
            if (shouldAnimate) {
                if (this.molecule.instancedMesh) {
                    this.molecule.instancedMesh.visible = false;
                }
                if (this.molecule.bondGroup?.children[0]) {
                    this.molecule.bondGroup.children[0].visible = false;
                }
            }

            // Trigger animation
            if (shouldAnimate) {
                setTimeout(() => {
                    if (typeof animateImplosion === 'function') {
                        animateImplosion();
                    }
                }, 10);
            }
        }

        this.molecule.updateBonds(this.mode);

        // Hide bonds too if animating (updateBonds may recreate them)
        const shouldAnimate = animate && !soft && !useRibbonMode && this.molecule.atoms.length > 0 && this.molecule.atoms.length < 5000 && window.sillyMode;
        if (shouldAnimate && this.molecule.bondGroup?.children[0]) {
            this.molecule.bondGroup.children[0].visible = false;
        }

        // Labels only work in normal mode
        if (!useRibbonMode && labelMode && this.molecule.atoms && this.molecule.atoms.length > 0) {
            this.toggleLabels(true);
        }

        render();
        // ... rest of the function
        window.endMeasurement = performance.now();
        const loadTimeMs = window.endMeasurement - window.startMeasurement;
        const loadTimeSec = loadTimeMs / 1000;
        console.log(`Load time: ${loadTimeSec} s`);

        window.startMeasurement = null;
        window.endMeasurement = null;
        this.data = data;

        // Update force arrow controls visibility
        if (window.updateForceArrowControls) {
            window.updateForceArrowControls();
        }
        if (window.updateChargeControls) {
            window.updateChargeControls();
        }
        if (window.updateRibbonToggle) {
            window.updateRibbonToggle();
        }

        // Clear stale undo history and initialize baseline for the new molecule
        if (typeof window.clearUndoHistory === 'function') {
            window.clearUndoHistory();
        }
        if (typeof window.initUndoState === 'function') {
            window.initUndoState();
        }
    }
    toggleLabels(override = null) {
        labelMode = override ?? !labelMode;
        if (this.molecule && this.molecule.atoms && this.molecule.atoms.length > 0) {
            const charges = window.showCharges ? getChargeArray(window.chargeVisualizationType) : null;
            this.molecule.toggleLabels(labelMode, window.showElements, window.showIndices, window.showCharges, charges);
        }
        render();
    }
    setNewMode(style = false) {
        if (style) {
            this.mode = {
                roughness: main.roughness, metalness: main.metalness,
                bondThickness: main.bondThickness, opacity: main.opacity,
                atomSize: main.atomSize, resolution: main.resolution,
                antialias: antialiasToggled, labels: main.labelsToggled,
                envMapIntensity: window.envMapEnabled ? (window.envMapIntensity || 1) : 0,
                transmission: main.transmission, ior: main.ior, thickness: main.thickness,
                clearcoat: main.clearcoat, sheen: main.sheen, iridescence: main.iridescence,
            };
        } else {
            this.mode = 0
        }
        mode = this.mode
        return this.mode
    }
    // Add a method to zoom the camera to fit the molecule
    zoomCameraToFitMolecule() {
        if (!this.molecule || !this.molecule.instancedMesh) return;
        const boundingBox = this.molecule.getBoundingBox();
        if (!boundingBox) return;
        const size = new THREE.Vector3();
        boundingBox.getSize(size);
        const center = new THREE.Vector3();
        boundingBox.getCenter(center);

        // Get the largest dimension
        const maxDim = Math.max(size.x, size.y, size.z);
        // Camera fov is vertical, so use height
        const fov = camera.fov * (Math.PI / 180); // vertical fov in radians
        const fitHeightDistance = maxDim / (2 * Math.tan(fov / 2));
        const fitWidthDistance = maxDim / (2 * Math.tan(fov / 2) * camera.aspect);
        const distance = Math.max(fitHeightDistance, fitWidthDistance);

        // Move camera to look at center, at the right distance
        camera.position.set(center.x, center.y, center.z + distance * 1.5);
        camera.lookAt(center);
        if (controls) {
            controls.target.copy(center);
            controls.update();
        }
        render();
    }
}

const main = new Main();
window.main = main;


const fileInput = document.getElementById("fileInput")

document.addEventListener('keydown', (event) => {
    if (event.metaKey && event.key.toLowerCase() === 'o') {
        event.preventDefault();
        fileInput.click();
    }
});

// In main.js, replace the fileInput event listener:

fileInput.addEventListener("change", (e) => {
    console.log(e)
    main.loader.handleFile(e, false);
}, false);

window.addEventListener('blur', () => {
    cmdDown = false;
    shiftDown = false;
    controls.enabled = true;
});
window.addEventListener('focus', () => {
    cmdDown = false;
    shiftDown = false;
});

document.getElementById("compare").addEventListener("change", (e) => {
    const file = e.target.files[0]
    const event =
        main.loader.handleFile(file, true);
}, false);
let isLPressed = false;

const styleSelector = document.getElementById('styleSelector');
const roughnessSelector = document.getElementById('style1');
const metalnessSelector = document.getElementById('style2');
const opacitySelector = document.getElementById('style3');
const bondsSelector = document.getElementById('style4');
const atomSizeSelector = document.getElementById('style5');
const resSelector = document.getElementById('style6')
const toggleAntialiasing = document.getElementById('style7')
const backgroundColorSelector = document.getElementById('style8');
const toggleOrthoCamera = document.getElementById('toggleOrtho');
const toggleStyleChanges = document.getElementById('toggleStyleChanges');

roughnessSelector.addEventListener('input', () => {
    main.roughness = roughnessSelector.value;
    if (mode != 0) {
        updateStyles();
    }
});
metalnessSelector.addEventListener('input', () => {
    main.metalness = metalnessSelector.value;
    if (mode != 0) {
        updateStyles();
    }
});
bondsSelector.addEventListener('input', () => {
    main.bondThickness = bondsSelector.value;
    if (mode != 0) {
        updateStyles();
    }
});
opacitySelector.addEventListener('input', () => {
    main.opacity = opacitySelector.value;
    if (mode != 0) {
        updateStyles();
    }
});
atomSizeSelector.addEventListener('input', () => {
    main.atomSize = atomSizeSelector.value;
    if (mode != 0) {
        updateStyles();
    }
});

resSelector.addEventListener('input', () => {
    main.resolution = resSelector.value;
    if (mode != 0) {
        updateStyles();
    }
});

const transmissionSelector = document.getElementById('styleTransmission');
const iorSelector = document.getElementById('styleIOR');
const thicknessSelector = document.getElementById('styleThickness');
const clearcoatSelector = document.getElementById('styleClearcoat');
const sheenSelector = document.getElementById('styleSheen');
const iridescenceSelector = document.getElementById('styleIridescence');

main.transmission = 0;
main.ior = 1.5;
main.thickness = 0.5;
main.clearcoat = 0;
main.sheen = 0;
main.iridescence = 0;

transmissionSelector.addEventListener('input', () => {
    main.transmission = parseFloat(transmissionSelector.value);
    if (mode != 0) updateStyles();
});
iorSelector.addEventListener('input', () => {
    main.ior = parseFloat(iorSelector.value);
    if (mode != 0) updateStyles();
});
thicknessSelector.addEventListener('input', () => {
    main.thickness = parseFloat(thicknessSelector.value);
    if (mode != 0) updateStyles();
});
clearcoatSelector.addEventListener('input', () => {
    main.clearcoat = parseFloat(clearcoatSelector.value);
    if (mode != 0) updateStyles();
});
sheenSelector.addEventListener('input', () => {
    main.sheen = parseFloat(sheenSelector.value);
    if (mode != 0) updateStyles();
});
iridescenceSelector.addEventListener('input', () => {
    main.iridescence = parseFloat(iridescenceSelector.value);
    if (mode != 0) updateStyles();
});

backgroundColorSelector.addEventListener('input', () => {
    const color = backgroundColorSelector.value;
    if (!window.envMapEnabled) {
        scene.background = new THREE.Color(color);
    } else {
        // Store the color so it's restored when env map is turned off
        savedBackgroundColor = new THREE.Color(color);
    }
    document.body.style.backgroundColor = color;
    applyBackgroundColorToUI(color);
    render();
});

// Build a 3-stop dark-leaning gradient from a single hex so panels still feel
// dimensional after the user picks a flat background. We perturb HSL lightness
// by ±2 steps to create the same "deep gradient" feel as the brand default,
// keyed off the user's color so panels and viewport stay visually unified.
function _hexToHsl(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    let r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        else if (max === g) h = ((b - r) / d + 2) * 60;
        else h = ((r - g) / d + 4) * 60;
    }
    return { h, s: s * 100, l: l * 100 };
}

// Convert an HSL color back to RGB triplet (0-255) — needed for shadows so we
// can write space-separated R G B into a CSS variable used inside rgb(... / α)
// syntax. Returns null if HSL is invalid.
function _hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [
        Math.round(255 * f(0)),
        Math.round(255 * f(8)),
        Math.round(255 * f(4)),
    ];
}

function applyBackgroundColorToUI(hex) {
    const hsl = _hexToHsl(hex);
    if (!hsl) return;
    // Persist the choice so reloads don't snap back to brand default.
    try { localStorage.setItem('chopchop_panel_color', hex); } catch { }
    const root = document.documentElement.style;

    // ── Panel background ────────────────────────────────────────────────
    // Panels MUST stay much darker than the viewport so they read as
    // floating chrome. Even if the user picks bright red, panels should
    // be a deep, muted version of red. We clamp to L = [3, 11] always —
    // independent of input lightness — and cut saturation modestly so
    // panels feel like UI surfaces, not solid swatches of pure hue.
    const panelL = 7;
    const panelS = Math.min(hsl.s, 55);
    const pLo = Math.max(3, panelL - 2);
    const pMid = panelL;
    const pHi = Math.min(11, panelL + 2);
    const panelGrad = `linear-gradient(180deg,` +
        ` hsla(${hsl.h.toFixed(0)}, ${panelS.toFixed(0)}%, ${pLo.toFixed(1)}%, 0.98) 0%,` +
        ` hsla(${hsl.h.toFixed(0)}, ${panelS.toFixed(0)}%, ${pMid.toFixed(1)}%, 0.98) 50%,` +
        ` hsla(${hsl.h.toFixed(0)}, ${panelS.toFixed(0)}%, ${pHi.toFixed(1)}%, 0.98) 100%)`;
    const panelGradDim = panelGrad.replace('180deg', '135deg');
    root.setProperty('--panel-bg', panelGrad);
    root.setProperty('--panel-bg-dim', panelGradDim);

    // ── Viewport / modal background ─────────────────────────────────────
    // For non-panel surfaces (modals, toolbar bg, body) we let the picked
    // color show through more — clamp [4, 30] so the user sees their pick
    // but it stays dark-mode legible.
    const lo = Math.max(4, Math.min(30, hsl.l - 1.5));
    const mid = Math.max(4, Math.min(30, hsl.l));
    const hi = Math.max(4, Math.min(30, hsl.l + 1.5));
    const grad = `linear-gradient(180deg,` +
        ` hsla(${hsl.h.toFixed(0)}, ${hsl.s.toFixed(0)}%, ${lo.toFixed(1)}%, 0.98) 0%,` +
        ` hsla(${hsl.h.toFixed(0)}, ${hsl.s.toFixed(0)}%, ${mid.toFixed(1)}%, 0.98) 50%,` +
        ` hsla(${hsl.h.toFixed(0)}, ${hsl.s.toFixed(0)}%, ${hi.toFixed(1)}%, 0.98) 100%)`;
    const gradDim = grad.replace('180deg', '135deg');
    root.setProperty('--brand-grad-deep', grad);
    root.setProperty('--brand-grad-dim', gradDim);

    // ── Shadow color ────────────────────────────────────────────────────
    // Derive shadow from the PANEL color, not the viewport color. Shadow is
    // the panel's natural "underside" — a slightly darker, slightly more
    // saturated version of the panel hue. At L=4 with the panel's hue + sat
    // intact, the shadow reads as a deep tinted color (e.g. deep wine-red
    // for a red theme, near-black navy for a blue theme), not pure black.
    // This makes shadows blend smoothly with the panel/viewport colorway
    // instead of looking like an unrelated black blob hovering on top.
    const shadowL = 4;            // ~half of panel L (7) — natural underside
    const shadowS = Math.min(panelS + 10, 70);  // slightly more saturated than panel
    const [sr, sg, sb] = _hslToRgb(hsl.h, shadowS, shadowL);
    root.setProperty('--ui-shadow-rgb', `${sr} ${sg} ${sb}`);

    // Inform Three.js / canvas-based features that the background changed.
    window.dispatchEvent(new CustomEvent('chopchopBgColorChanged', { detail: { color: hex } }));
}

// On first load, replay the saved color so the UI is consistent across reloads.
(function _restoreSavedPanelColor() {
    try {
        const saved = localStorage.getItem('chopchop_panel_color');
        if (saved && /^#[0-9a-f]{6}$/i.test(saved)) {
            backgroundColorSelector.value = saved;
            applyBackgroundColorToUI(saved);
            // Also seed the scene background so the 3D viewport matches.
            if (typeof scene !== 'undefined' && !window.envMapEnabled) {
                scene.background = new THREE.Color(saved);
            }
            document.body.style.backgroundColor = saved;
        }
    } catch { }
})();

// ── Text size slider (Style panel → "Text size") ───────────────────────────
// Drives the --ui-text-scale CSS var, which scales font-size on chat
// messages, chat input, file-explorer rows, and section headers via calc().
// Value persists in localStorage so size choice survives reloads.
const textSizeSlider = document.getElementById('textSizeSlider');
function applyTextScale(scale) {
    const s = Math.max(0.85, Math.min(1.4, Number(scale) || 1));
    document.documentElement.style.setProperty('--ui-text-scale', s.toFixed(3));
    try { localStorage.setItem('chopchop_text_scale', String(s)); } catch { }
}
if (textSizeSlider) {
    textSizeSlider.addEventListener('input', () => applyTextScale(textSizeSlider.value));
    // Restore saved scale on boot.
    try {
        const saved = parseFloat(localStorage.getItem('chopchop_text_scale') || '');
        if (!Number.isNaN(saved) && saved >= 0.85 && saved <= 1.4) {
            textSizeSlider.value = saved;
            applyTextScale(saved);
        }
    } catch { }
}


function updateStyles() {
    const previousSelection = [...atomsSelected];

    mode = main.setNewMode(true);

    // Try to update material properties in-place first
    const updated = main.molecule.updateMaterialProperties(main.mode);

    if (!updated) {
        // Material type changed (basic <-> standard), need full rebuild
        main.newMolecule(main.data,
            main.mode,
            true,
            true,
            false
        );

        // Restore selection after molecule is recreated
        atomsSelected = previousSelection;

        // Re-apply visual selection
        if (atomsSelected.length > 0) {
            atomsSelected.forEach(idx => {
                selectAtom(idx, false);
            });

            // Update UI
            const element = main.molecule.atoms[atomsSelected[0]].type;
            updateEditingContent(element, main.molecule.atomSettings[element].color);
            attachButtonEventListeners();
        }
    } else {
        // Material updated in-place, also update bonds with new sizes
        main.molecule.updateBonds(main.mode);
    }

    render();
}

toggleStyleChanges.addEventListener('change', () => {
    // Store current selection
    const previousSelection = [...atomsSelected];

    if (mode == 0) {
        mode = main.setNewMode(true);
    } else {
        mode = main.setNewMode();
    }
    main.newMolecule(
        main.data,
        main.mode,
        true,
        true,
        false
    );

    // Restore selection
    atomsSelected = previousSelection;
    if (atomsSelected.length > 0) {
        atomsSelected.forEach(idx => {
            selectAtom(idx, false);
        });

        const element = main.molecule.atoms[atomsSelected[0]].type;
        updateEditingContent(element, main.molecule.atomSettings[element].color);
        attachButtonEventListeners();
    }

    console.log(mode);
    render();
});

toggleAntialiasing.addEventListener('change', () => {
    antialiasToggled = toggleAntialiasing.checked;
    recreateRenderer(antialiasToggled);
});

// ── Environment Map (Polyhaven HDRIs) ────────────────────────────────
const POLYHAVEN_HDRIS = {
    'studio_small_09': 'Studio',
    'photo_studio_loft_hall': 'Loft Hall',
    'venice_sunset': 'Venice Sunset',
    'kloofendal_48d_partly_cloudy_puresky': 'Partly Cloudy',
    'dikhololo_night': 'Night Sky',
    'forest_slope': 'Forest',
    'syferfontein_0d_clear_puresky': 'Clear Sky',
    'abandoned_parking': 'Parking Lot',
    'industrial_workshop': 'Workshop',
    'rural_asphalt_road': 'Country Road',
};

const envMapCache = {};
let envMapLoading = false;
let savedBackgroundColor = null;
window.envMapEnabled = false;
window.envMapIntensity = 1;
window.envMapPreset = 'studio_small_09';
window.envMapResolution = '1k';

const rgbeLoader = new RGBELoader();

function getPolyhavenUrl(name, resolution) {
    return `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/${resolution}/${name}_${resolution}.hdr`;
}

function loadEnvMap(name, resolution) {
    const cacheKey = `${name}_${resolution}`;
    if (envMapCache[cacheKey]) {
        applyEnvTexture(envMapCache[cacheKey]);
        return;
    }

    envMapLoading = true;
    updateEnvMapLoadingUI(true, name);

    const url = getPolyhavenUrl(name, resolution);
    rgbeLoader.load(
        url,
        (hdrTexture) => {
            const pmremGenerator = new THREE.PMREMGenerator(renderer);
            pmremGenerator.compileEquirectangularShader();
            const envTexture = pmremGenerator.fromEquirectangular(hdrTexture).texture;
            hdrTexture.dispose();
            pmremGenerator.dispose();

            envMapCache[cacheKey] = envTexture;
            envMapLoading = false;
            updateEnvMapLoadingUI(false);
            applyEnvTexture(envTexture);
        },
        (progress) => {
            if (progress.total > 0) {
                const pct = Math.round((progress.loaded / progress.total) * 100);
                updateEnvMapLoadingUI(true, name, pct);
            }
        },
        (err) => {
            console.error('Failed to load HDRI:', err);
            envMapLoading = false;
            updateEnvMapLoadingUI(false);
            window.toastError?.(`Failed to load env map "${POLYHAVEN_HDRIS[name] || name}"`);
        }
    );
}

function applyEnvTexture(envTexture) {
    // Dispose old env/background textures to prevent memory leaks
    if (scene.environment && scene.environment.isTexture && scene.environment !== envTexture) {
        scene.environment.dispose();
    }
    if (scene.background && scene.background.isTexture && scene.background !== envTexture) {
        scene.background.dispose();
    }
    scene.environment = envTexture;
    if (!savedBackgroundColor && scene.background && scene.background.isColor) {
        savedBackgroundColor = scene.background.clone();
    }
    scene.background = envTexture;
    window.envMapEnabled = true;
    updateEnvMapIntensity(window.envMapIntensity || 1);
    render();
}

function disableEnvMap() {
    scene.environment = null;
    if (savedBackgroundColor) {
        scene.background = savedBackgroundColor;
        savedBackgroundColor = null;
    } else {
        scene.background = new THREE.Color(document.getElementById('style8').value);
    }
    window.envMapEnabled = false;
    updateEnvMapIntensity(0);
    render();
}

function applyEnvMap(enabled, preset) {
    if (enabled) {
        loadEnvMap(preset || window.envMapPreset, window.envMapResolution || '1k');
    } else {
        disableEnvMap();
    }
}

function updateEnvMapIntensity(intensity) {
    if (!main.molecule) return;
    if (main.molecule.instancedMesh && main.molecule.instancedMesh.material) {
        const mat = main.molecule.instancedMesh.material;
        if (mat.type !== 'MeshBasicMaterial') {
            mat.envMapIntensity = intensity;
            mat.needsUpdate = true;
        }
    }
    if (main.molecule.bondGroup) {
        main.molecule.bondGroup.traverse(child => {
            if (child.isMesh && child.material && child.material.type !== 'MeshBasicMaterial') {
                child.material.envMapIntensity = intensity;
                child.material.needsUpdate = true;
            }
        });
    }
}

function updateEnvMapLoadingUI(loading, name, pct) {
    const presetSelect = document.getElementById('envMapPreset');
    if (loading) {
        presetSelect.style.opacity = '0.6';
        presetSelect.title = pct !== undefined
            ? `Loading ${POLYHAVEN_HDRIS[name] || name}... ${pct}%`
            : `Loading ${POLYHAVEN_HDRIS[name] || name}...`;
    } else {
        presetSelect.style.opacity = '1';
        presetSelect.title = '';
    }
}

window.applyEnvMap = applyEnvMap;
window.updateEnvMapIntensity = updateEnvMapIntensity;

const toggleEnvMap = document.getElementById('toggleEnvMap');
const envMapPresetSelect = document.getElementById('envMapPreset');
const envMapIntensitySlider = document.getElementById('envMapIntensity');
const envMapResolutionSelect = document.getElementById('envMapResolution');
const envMapPresetRow = document.getElementById('envMapPresetRow');
const envMapIntensityRow = document.getElementById('envMapIntensityRow');
const envMapResolutionRow = document.getElementById('envMapResolutionRow');

toggleEnvMap.addEventListener('change', () => {
    const enabled = toggleEnvMap.checked;
    envMapPresetRow.style.opacity = enabled ? '1' : '0.5';
    envMapIntensityRow.style.opacity = enabled ? '1' : '0.5';
    envMapResolutionRow.style.opacity = enabled ? '1' : '0.5';
    if (enabled) {
        applyEnvMap(true, envMapPresetSelect.value);
    } else {
        disableEnvMap();
    }
});

envMapPresetSelect.addEventListener('change', () => {
    window.envMapPreset = envMapPresetSelect.value;
    if (toggleEnvMap.checked) {
        applyEnvMap(true, envMapPresetSelect.value);
    }
});

envMapResolutionSelect.addEventListener('change', () => {
    window.envMapResolution = envMapResolutionSelect.value;
    if (toggleEnvMap.checked) {
        applyEnvMap(true, envMapPresetSelect.value);
    }
});

envMapIntensitySlider.addEventListener('input', () => {
    window.envMapIntensity = parseFloat(envMapIntensitySlider.value);
    if (toggleEnvMap.checked) {
        updateEnvMapIntensity(window.envMapIntensity);
        render();
    }
});

window.addEventListener('keydown', function (e) {
    if (e.key === 'l') {
        isLPressed = true;
    }
});

window.addEventListener('keyup', function (e) {
    if (e.key === 'l') {
        isLPressed = false;
    }
    if (e.key == "Shift") {
        shiftDown = false;
        controls.enabled = true;
    }
    if (e.key == "Meta") {
        cmdDown = false;
        controls.enabled = true;
    }
});

// Easter egg: Hold "." and press "h" 3 times to explode the molecule
let periodHeld = false;
let hPressCount = 0;
let explosionAnimating = false;

window.addEventListener('keydown', (e) => {
    if (e.key === '.') {
        periodHeld = true;
        hPressCount = 0;
    }

    if (periodHeld && e.key.toLowerCase() === 'h') {
        hPressCount++;
        if (hPressCount >= 3 && !explosionAnimating) {
            triggerExplosion();
            hPressCount = 0;
        }
    }
});

window.addEventListener('keyup', (e) => {
    if (e.key === '.') {
        periodHeld = false;
        hPressCount = 0;
    }
});

function triggerExplosion() {
    if (!main.molecule || !main.molecule.atoms || main.molecule.atoms.length === 0) return;

    explosionAnimating = true;

    const gravity = -0.015;
    const explosionForce = 1.5;
    const drag = 0.99;

    // Each atom gets velocity, spin, and tracks position
    const particles = main.molecule.atoms.map(() => ({
        vx: (Math.random() - 0.5) * explosionForce,
        vy: Math.random() * explosionForce * 0.8 + 0.3, // Bias upward initially
        vz: (Math.random() - 0.5) * explosionForce,
        spin: {
            x: (Math.random() - 0.5) * 0.1,
            y: (Math.random() - 0.5) * 0.1,
            z: (Math.random() - 0.5) * 0.1
        }
    }));

    // Bond particles
    let bondParticles = [];
    const bondMesh = main.molecule.bondGroup?.children[0];
    if (bondMesh && bondMesh.isInstancedMesh) {
        bondParticles = Array.from({ length: bondMesh.count }, () => ({
            vx: (Math.random() - 0.5) * explosionForce,
            vy: Math.random() * explosionForce * 0.8 + 0.3,
            vz: (Math.random() - 0.5) * explosionForce,
            spin: {
                x: (Math.random() - 0.5) * 0.15,
                y: (Math.random() - 0.5) * 0.15,
                z: (Math.random() - 0.5) * 0.15
            }
        }));
    }

    let frame = 0;
    const maxFrames = 180; // 3 seconds at 60fps

    function animateExplosion() {
        frame++;

        const instancedMesh = main.molecule.instancedMesh;
        if (!instancedMesh) return;

        const matrix = new THREE.Matrix4();
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        const euler = new THREE.Euler();
        const spinQuat = new THREE.Quaternion();

        // Animate atoms
        for (let i = 0; i < main.molecule.atoms.length; i++) {
            const p = particles[i];

            // Apply gravity
            p.vy += gravity;

            // Apply drag
            p.vx *= drag;
            p.vy *= drag;
            p.vz *= drag;

            instancedMesh.getMatrixAt(i, matrix);
            matrix.decompose(pos, quat, scale);

            // Update position
            pos.x += p.vx;
            pos.y += p.vy;
            pos.z += p.vz;

            // Apply spin
            euler.setFromQuaternion(quat);
            euler.x += p.spin.x;
            euler.y += p.spin.y;
            euler.z += p.spin.z;
            quat.setFromEuler(euler);

            // Slight shrink over time
            if (frame > maxFrames * 0.7) {
                scale.multiplyScalar(0.95);
            }

            matrix.compose(pos, quat, scale);
            instancedMesh.setMatrixAt(i, matrix);
        }
        instancedMesh.instanceMatrix.needsUpdate = true;

        // Animate styled bonds
        if (bondMesh && bondMesh.isInstancedMesh && bondParticles.length > 0) {
            for (let i = 0; i < bondMesh.count; i++) {
                const p = bondParticles[i];

                p.vy += gravity;
                p.vx *= drag;
                p.vy *= drag;
                p.vz *= drag;

                bondMesh.getMatrixAt(i, matrix);
                matrix.decompose(pos, quat, scale);

                pos.x += p.vx;
                pos.y += p.vy;
                pos.z += p.vz;

                euler.setFromQuaternion(quat);
                euler.x += p.spin.x;
                euler.y += p.spin.y;
                euler.z += p.spin.z;
                quat.setFromEuler(euler);

                if (frame > maxFrames * 0.7) {
                    scale.multiplyScalar(0.94);
                }

                matrix.compose(pos, quat, scale);
                bondMesh.setMatrixAt(i, matrix);
            }
            bondMesh.instanceMatrix.needsUpdate = true;
        }

        // Animate fast bonds (LineSegments) - scatter vertices
        if (bondMesh && bondMesh.isLineSegments) {
            const positions = bondMesh.geometry.attributes.position.array;
            for (let i = 0; i < positions.length; i += 3) {
                positions[i] += (Math.random() - 0.5) * 0.3;
                positions[i + 1] += gravity * frame * 0.1;
                positions[i + 2] += (Math.random() - 0.5) * 0.3;
            }
            bondMesh.geometry.attributes.position.needsUpdate = true;
        }

        render();

        if (frame < maxFrames) {
            requestAnimationFrame(animateExplosion);
        } else {
            // Clean up
            main.data = { atomData: [], numAtoms: 0 };
            main.molecule.reset();
            clearScene(main.scene);
            atomsSelected = [];
            fragments = [];
            fragmentsSelected = [];
            explosionAnimating = false;
            render();
            showNotification('💥 Boom!', 'info');
        }
    }

    animateExplosion();
}

// Simplified assembly animation: molecule pieces start scattered and assemble in a wave from left to right with eased motion (ease-out) and global fade-in
let assemblyAnimating = false;
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
}
window.toggleFullscreen = toggleFullscreen;

document.addEventListener("fullscreenchange", () => {
    const btn = document.querySelector('[onclick="toggleFullscreen()"] i');
    if (btn) btn.className = document.fullscreenElement ? "fa-solid fa-compress" : "fa-solid fa-expand";
});

function animateImplosion() {
    if (!main.molecule || !main.molecule.atoms || main.molecule.atoms.length === 0) return;
    if (assemblyAnimating) return;

    assemblyAnimating = true;

    const instancedMesh = main.molecule.instancedMesh;
    const atoms = main.molecule.atoms;
    const atomCount = atoms.length;

    const bondMesh = main.molecule.bondGroup?.children[0];
    const isStyledBonds = bondMesh && bondMesh.isInstancedMesh;
    const isFastBonds = bondMesh && bondMesh.isLineSegments;

    const matrix = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    // Store original material settings and enable transparency
    const atomMat = instancedMesh.material;
    const originalAtomOpacity = atomMat.opacity;
    const originalAtomTransparent = atomMat.transparent;
    atomMat.transparent = true;
    atomMat.opacity = 0;

    let bondMat = null;
    let originalBondOpacity = 1;
    let originalBondTransparent = false;
    if (bondMesh) {
        bondMat = bondMesh.material;
        originalBondOpacity = bondMat.opacity;
        originalBondTransparent = bondMat.transparent;
        bondMat.transparent = true;
        bondMat.opacity = 0;
    }

    // Calculate molecule center and size
    const boundingBox = main.molecule.getBoundingBox();
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    boundingBox.getCenter(center);
    boundingBox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const explosionRadius = maxDim * 4;

    // Store final atom states
    const atomStates = [];
    let maxDelay = 0;
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < atomCount; i++) {
        instancedMesh.getMatrixAt(i, matrix);
        matrix.decompose(pos, quat, scale);

        minX = Math.min(minX, pos.x);
        maxX = Math.max(maxX, pos.x);
    }
    for (let i = 0; i < atomCount; i++) {
        instancedMesh.getMatrixAt(i, matrix);
        matrix.decompose(pos, quat, scale);

        const direction = new THREE.Vector3().subVectors(pos, center);
        if (direction.lengthSq() < 0.001) {
            direction.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
        }
        direction.normalize();
        direction.x += (Math.random() - 0.5) * 0.5;
        direction.y += (Math.random() - 0.5) * 0.5;
        direction.z += (Math.random() - 0.5) * 0.5;
        direction.normalize();

        const distance = explosionRadius * (0.7 + Math.random() * 0.6);

        const normX = maxX > minX ? (pos.x - minX) / (maxX - minX) : 0;
        const delay = normX * 600 + Math.random() * 200; // Wave from left to right
        maxDelay = Math.max(maxDelay, delay);

        atomStates.push({
            startPos: pos.clone().add(direction.clone().multiplyScalar(distance)),
            endPos: pos.clone(),
            endQuat: quat.clone(),
            endScale: scale.clone(),
            delay: delay
        });
    }

    // Store final bond states
    const bondStates = [];
    let bondCount = 0;

    if (isStyledBonds) {
        bondCount = bondMesh.count;
        for (let i = 0; i < bondCount; i++) {
            bondMesh.getMatrixAt(i, matrix);
            matrix.decompose(pos, quat, scale);

            const direction = new THREE.Vector3().subVectors(pos, center);
            if (direction.lengthSq() < 0.001) {
                direction.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
            }
            direction.normalize();
            direction.x += (Math.random() - 0.5) * 0.5;
            direction.y += (Math.random() - 0.5) * 0.5;
            direction.z += (Math.random() - 0.5) * 0.5;
            direction.normalize();

            const distance = explosionRadius * (0.7 + Math.random() * 0.6);

            const normX = maxX > minX ? (pos.x - minX) / (maxX - minX) : 0;
            const delay = normX * 600 + Math.random() * 200;
            maxDelay = Math.max(maxDelay, delay);

            bondStates.push({
                startPos: pos.clone().add(direction.clone().multiplyScalar(distance)),
                endPos: pos.clone(),
                endQuat: quat.clone(),
                endScale: scale.clone(),
                delay: delay
            });
        }
    }

    let finalBondPositions = null;
    const fastBondStates = [];
    if (isFastBonds) {
        finalBondPositions = new Float32Array(bondMesh.geometry.attributes.position.array);
        bondCount = finalBondPositions.length / 6;

        for (let i = 0; i < bondCount; i++) {
            const idx = i * 6;

            const p1 = new THREE.Vector3(
                finalBondPositions[idx],
                finalBondPositions[idx + 1],
                finalBondPositions[idx + 2]
            );
            const p2 = new THREE.Vector3(
                finalBondPositions[idx + 3],
                finalBondPositions[idx + 4],
                finalBondPositions[idx + 5]
            );

            const bondCenter = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
            const bondHalfVec = new THREE.Vector3().subVectors(p2, bondCenter);

            const direction = new THREE.Vector3().subVectors(bondCenter, center);
            if (direction.lengthSq() < 0.001) {
                direction.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
            }
            direction.normalize();
            direction.x += (Math.random() - 0.5) * 0.5;
            direction.y += (Math.random() - 0.5) * 0.5;
            direction.z += (Math.random() - 0.5) * 0.5;
            direction.normalize();

            const distance = explosionRadius * (0.7 + Math.random() * 0.6);

            const normX = maxX > minX ? (bondCenter.x - minX) / (maxX - minX) : 0;
            const delay = normX * 600 + Math.random() * 200;
            maxDelay = Math.max(maxDelay, delay);

            fastBondStates.push({
                startOffset: direction.clone().multiplyScalar(distance),
                bondCenter: bondCenter,
                bondHalfVec: bondHalfVec,
                delay: delay
            });
        }
    }

    // Set initial scattered positions at full scale, no rotation changes
    for (let i = 0; i < atomCount; i++) {
        const state = atomStates[i];
        matrix.compose(state.startPos, state.endQuat, state.endScale);
        instancedMesh.setMatrixAt(i, matrix);
    }
    instancedMesh.instanceMatrix.needsUpdate = true;

    if (isStyledBonds) {
        for (let i = 0; i < bondCount; i++) {
            const state = bondStates[i];
            matrix.compose(state.startPos, state.endQuat, state.endScale);
            bondMesh.setMatrixAt(i, matrix);
        }
        bondMesh.instanceMatrix.needsUpdate = true;
    }

    if (isFastBonds) {
        const positions = bondMesh.geometry.attributes.position.array;
        for (let i = 0; i < bondCount; i++) {
            const state = fastBondStates[i];
            const idx = i * 6;

            const newCenter = state.bondCenter.clone().add(state.startOffset);
            const newP1 = newCenter.clone().sub(state.bondHalfVec);
            const newP2 = newCenter.clone().add(state.bondHalfVec);

            positions[idx] = newP1.x;
            positions[idx + 1] = newP1.y;
            positions[idx + 2] = newP1.z;
            positions[idx + 3] = newP2.x;
            positions[idx + 4] = newP2.y;
            positions[idx + 5] = newP2.z;
        }
        bondMesh.geometry.attributes.position.needsUpdate = true;
    }

    // Now make visible (scattered positions, 0 opacity)
    instancedMesh.visible = true;
    if (bondMesh) bondMesh.visible = true;

    // Animation with delays for wave effect
    const duration = 800;
    const totalDuration = duration + maxDelay;
    const startTime = performance.now();

    // Ease-out quadratic function for smooth deceleration
    const easeOutQuad = (t) => 1 - Math.pow(1 - t, 5);

    function animate() {
        const elapsed = performance.now() - startTime;
        const globalProgress = Math.min(elapsed / totalDuration, 1);

        // Global fade-in
        const fadeProgress = Math.min(globalProgress / 0.3, 1);
        const opacity = fadeProgress * fadeProgress; // Quadratic for smooth start

        atomMat.opacity = opacity * originalAtomOpacity;
        if (bondMat) {
            bondMat.opacity = opacity * originalBondOpacity;
        }

        for (let i = 0; i < atomCount; i++) {
            const state = atomStates[i];
            const effectiveElapsed = elapsed - state.delay;
            const progress = Math.max(0, Math.min(effectiveElapsed / duration, 1));
            const easedProgress = easeOutQuad(progress);
            const currentPos = new THREE.Vector3().lerpVectors(state.startPos, state.endPos, easedProgress);

            matrix.compose(currentPos, state.endQuat, state.endScale);
            instancedMesh.setMatrixAt(i, matrix);
        }
        instancedMesh.instanceMatrix.needsUpdate = true;

        if (isStyledBonds) {
            for (let i = 0; i < bondCount; i++) {
                const state = bondStates[i];
                const effectiveElapsed = elapsed - state.delay;
                const progress = Math.max(0, Math.min(effectiveElapsed / duration, 1));
                const easedProgress = easeOutQuad(progress);
                const currentPos = new THREE.Vector3().lerpVectors(state.startPos, state.endPos, easedProgress);

                matrix.compose(currentPos, state.endQuat, state.endScale);
                bondMesh.setMatrixAt(i, matrix);
            }
            bondMesh.instanceMatrix.needsUpdate = true;
        }

        if (isFastBonds) {
            const positions = bondMesh.geometry.attributes.position.array;

            for (let i = 0; i < bondCount; i++) {
                const state = fastBondStates[i];
                const idx = i * 6;

                const effectiveElapsed = elapsed - state.delay;
                const progress = Math.max(0, Math.min(effectiveElapsed / duration, 1));
                const easedProgress = easeOutQuad(progress);

                const factor = 1 - easedProgress;
                const currentOffset = state.startOffset.clone().multiplyScalar(factor);
                const currentCenter = state.bondCenter.clone().add(currentOffset);

                const newP1 = currentCenter.clone().sub(state.bondHalfVec);
                const newP2 = currentCenter.clone().add(state.bondHalfVec);

                positions[idx] = newP1.x;
                positions[idx + 1] = newP1.y;
                positions[idx + 2] = newP1.z;
                positions[idx + 3] = newP2.x;
                positions[idx + 4] = newP2.y;
                positions[idx + 5] = newP2.z;
            }
            bondMesh.geometry.attributes.position.needsUpdate = true;
        }

        render();

        if (globalProgress < 1) {
            requestAnimationFrame(animate);
        } else {
            atomMat.opacity = originalAtomOpacity;
            atomMat.transparent = originalAtomTransparent;
            if (bondMat) {
                bondMat.opacity = originalBondOpacity;
                bondMat.transparent = originalBondTransparent;
            }

            assemblyAnimating = false;
            render();
        }
    }

    requestAnimationFrame(animate);
}

window.animateImplosion = animateImplosion;

window.addEventListener('keydown', function (e) {
    if (isLPressed && e.key === 'Enter') {
        saveImage();
    }
    if (e.key == "Shift") {
        shiftDown = true;
        if (editingMolecule) {
            controls.enabled = false;
        }
    }

    if (e.key == "Meta") {
        cmdDown = true;
        if (editingMolecule) {
            controls.enabled = false;
        }
    }
});
window.addEventListener('keydown', function (e) {
    if (e.key == "j") {
        copyTextToClipboard(JSON.stringify(main.data));
    }
})
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);

    render()
});

switchModeButton.addEventListener('click', (e) => {
    e.stopPropagation();
    styleSelector.classList.remove('on');
});
toggleSillyButton.addEventListener('click', (e) => {
    window.sillyMode = !window.sillyMode;
    if (!window.sillyMode) {
        sillyModeCleanup();
    }
});

window.addEventListener('replyUpdated', (event) => {
    const newReply = event.detail;
    console.log(newReply);
    main.newMolecule(JSON.stringify(newReply), main.mode);

});

window.addEventListener('pointerdown', enhancedOnPointerDown, false);
renderer.domElement.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    return false;
});

function worldToScreen(worldPos, camera) {
    const vector = new THREE.Vector3();
    vector.copy(worldPos);
    vector.project(camera);

    // Use renderer dimensions and account for canvas offset
    const canvas = renderer.domElement;
    const canvasRect = canvas.getBoundingClientRect();

    const x = (vector.x * 0.5 + 0.5) * canvasRect.width + canvasRect.left;
    const y = (vector.y * -0.5 + 0.5) * canvasRect.height + canvasRect.top;

    return { x, y };
}

function getAtomWorldPosition(atomIndex, instancedMesh) {
    if (!instancedMesh) return new THREE.Vector3();
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    instancedMesh.getMatrixAt(atomIndex, matrix);
    position.setFromMatrixPosition(matrix);
    position.applyMatrix4(instancedMesh.matrixWorld);
    return position;
}

function getAtomRadius(atomIndex, molecule) {
    if (!molecule || !molecule.instancedMesh) return 1;
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3();

    molecule.instancedMesh.getMatrixAt(atomIndex, matrix);
    scale.setFromMatrixScale(matrix);
    return scale.x;
}

function getActiveCamera() {
    return useOrthographic ? orthoCamera : camera;
}

async function saveAsFile(format = 'xyz') {
    if (!main.data || !main.data.atomData || main.data.atomData.length === 0) {
        window.toastWarning?.('No molecule loaded to save');
        return;
    }

    // Dynamically import file writer
    const { saveFile, downloadFile, saveToFileExplorer } = await import('./utils/fileWriter.js');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `molecule_${timestamp}.${format}`;

    // Prepare save data
    let saveData;

    // Check if we have multiple frames
    if (window.xyzFrames && window.xyzFrames.length > 1) {
        const frames = window.xyzFrames.map((frame, idx) => ({
            atomData: frame.atomData,
            // Try frame.energy first, then window.frameEnergies
            energy: frame.energy !== undefined && frame.energy !== null
                ? frame.energy
                : (window.frameEnergies ? window.frameEnergies[idx] : null),
            metadata: frame.metadata || (window.frameMetadata ? window.frameMetadata[idx] : null)
        }));

        saveData = {
            frames: frames,
            energies: window.frameEnergies || frames.map(f => f.energy)
        };
    } else {
        // Single frame
        const atoms = main.data.atomData;
        let energy = main.data.energy;
        if (energy === undefined && window.frameEnergies && window.frameEnergies[0] !== undefined) {
            energy = window.frameEnergies[0];
        }

        const metadata = main.data.metadata || (window.frameMetadata ? window.frameMetadata[0] : null);

        // Add ORCA metadata if available
        if (window.orcaMetadata) {
            const combinedMetadata = { ...metadata, ...window.orcaMetadata };
            saveData = {
                atomData: atoms,
                energy: energy,
                metadata: combinedMetadata
            };
        } else {
            saveData = {
                atomData: atoms,
                energy: energy,
                metadata: metadata
            };
        }
    }

    // Generate file content
    const fileContent = saveFile(saveData, filename, format);

    // Download file
    downloadFile(fileContent, filename);
}

// Add event listener for the save button with format options
document.addEventListener('DOMContentLoaded', () => {
    const saveButton = document.getElementById('saveXYZ');
    if (saveButton) {
        // Change button text
        saveButton.innerHTML = '<i class="fas fa-file-download"></i> Save File';

        // Add context menu for format selection
        saveButton.addEventListener('click', (e) => {
            if (e.shiftKey || e.ctrlKey) {
                // Show format selector
                const format = prompt('Enter file format (xyz, extxyz, mol, pdb, pqr, gro, mol2):', 'xyz');
                if (format) {
                    saveAsFile(format.toLowerCase());
                }
            } else {
                // Default: save as XYZ with auto-included forces/energy
                saveAsFile('xyz');
            }
        });

        // Add right-click context menu
        saveButton.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const format = prompt('Enter file format (xyz, extxyz, mol, pdb, pqr, gro, mol2):', 'extxyz');
            if (format) {
                saveAsFile(format.toLowerCase());
            }
        });
    }
});

// Enhanced raycasting that checks distance to atom centers
function enhancedRaycast(raycaster, instancedMesh, atoms) {
    if (!instancedMesh || !atoms || atoms.length === 0) return [];
    // First try standard raycasting
    const intersects = raycaster.intersectObject(instancedMesh);

    if (intersects.length > 0) {
        return intersects;
    }

    // If no direct hit, check proximity to atom centers
    const ray = raycaster.ray;
    const threshold = 0.5; // Proximity threshold multiplier

    let closestAtom = null;
    let closestDistance = Infinity;

    for (let i = 0; i < atoms.length; i++) {
        const atomPos = getAtomWorldPosition(i, instancedMesh);
        const atomRadius = getAtomRadius(i, { instancedMesh }) * threshold;

        // Calculate distance from ray to atom center
        const rayToAtom = new THREE.Vector3().subVectors(atomPos, ray.origin);
        const projection = rayToAtom.dot(ray.direction);

        // Skip atoms behind the camera
        if (projection < 0) continue;

        // Find closest point on ray to atom center
        const closestPointOnRay = new THREE.Vector3()
            .copy(ray.direction)
            .multiplyScalar(projection)
            .add(ray.origin);

        const distanceToAtom = closestPointOnRay.distanceTo(atomPos);

        // Check if within selection radius
        if (distanceToAtom < atomRadius && distanceToAtom < closestDistance) {
            closestDistance = distanceToAtom;
            closestAtom = {
                instanceId: i,
                point: closestPointOnRay,
                distance: ray.origin.distanceTo(closestPointOnRay),
                object: instancedMesh
            };
        }
    }

    return closestAtom ? [closestAtom] : [];
}

// Update the bounding box computation for better selection
function updateInstancedMeshBounds(instancedMesh, atoms) {
    if (!instancedMesh || !atoms || atoms.length === 0) return;

    // Force update of bounding box
    instancedMesh.computeBoundingBox();
    instancedMesh.computeBoundingSphere();

    // Manually compute bounds if needed
    const box = new THREE.Box3();
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();

    for (let i = 0; i < atoms.length; i++) {
        instancedMesh.getMatrixAt(i, matrix);
        position.setFromMatrixPosition(matrix);
        box.expandByPoint(position);
    }

    instancedMesh.boundingBox = box;
}

function generateDataFromAtoms(atomIndexes) {
    const data = {}
    const cooordinates = []
    atomIndexes.forEach(idx => {
        const pos = main.molecule.atoms[idx].position
        const atom = main.molecule.atoms[idx];
        cooordinates.push({
            element: atom.type,
            x: pos.x / 4,
            y: pos.y / 4,
            z: pos.z / 4,
            originalIndex: atom.originalIndex  // JUST ADD THIS LINE
        })
    })
    data.atomData = cooordinates
    data.numAtoms = atomIndexes.length
    return data
}
function combineMultipleFragments(fragments) {
    return fragments.reduce((combined, fragment) => {
        return {
            atomData: [...combined.atomData, ...fragment.atomData],
            numAtoms: combined.numAtoms + fragment.numAtoms
        };
    }, { atomData: [], numAtoms: 0 });
}


// Check if atom is in selection box
function isAtomInSelection(atomIndex, camera) {
    if (!main.molecule || !main.molecule.atoms || !main.molecule.atoms[atomIndex] || !main.molecule.instancedMesh) {
        return false;
    }

    // Get the actual world position from the instanced mesh
    const worldPos = getAtomWorldPosition(atomIndex, main.molecule.instancedMesh);
    const screenPos = worldToScreen(worldPos, getActiveCamera());

    const minX = Math.min(selectionStart.x, selectionEnd.x);
    const maxX = Math.max(selectionStart.x, selectionEnd.x);
    const minY = Math.min(selectionStart.y, selectionEnd.y);
    const maxY = Math.max(selectionStart.y, selectionEnd.y);

    return screenPos.x >= minX && screenPos.x <= maxX &&
        screenPos.y >= minY && screenPos.y <= maxY;
}

// Update visual selection box
function updateSelectionBox() {
    const minX = Math.min(selectionStart.x, selectionEnd.x);
    const maxX = Math.max(selectionStart.x, selectionEnd.x);
    const minY = Math.min(selectionStart.y, selectionEnd.y);
    const maxY = Math.max(selectionStart.y, selectionEnd.y);

    selectionBox.style.left = minX + 'px';
    selectionBox.style.top = minY + 'px';
    selectionBox.style.width = (maxX - minX) + 'px';
    selectionBox.style.height = (maxY - minY) + 'px';
}

// Update atom selection based on box
function updateAtomSelection() {
    if (!main.molecule || !main.molecule.atoms || !main.molecule.instancedMesh) return;

    // Find atoms currently in selection box
    const atomsInBox = [];
    for (let i = 0; i < main.molecule.atoms.length; i++) {
        if (isAtomInSelection(i, getActiveCamera())) {
            atomsInBox.push(i);
        }
    }

    // Show selection for: existing selected atoms + atoms in box
    const allSelected = [...new Set([...atomsSelected, ...atomsInBox])];

    // Clear visual selection for all atoms first
    unselectAtom();

    // Highlight all atoms that should be selected (existing + preview)
    allSelected.forEach(idx => {
        selectAtom(idx, false);
    });


    // Update UI - Check the TOTAL count of selected atoms (including preview)
    if (allSelected.length > 0) {
        const element = main.molecule.atoms[allSelected[0]].type;
        updateEditingContent(element, main.molecule.atomSettings[element].color, allSelected.length);
    }
}

// Add to your existing window event listeners
window.addEventListener('pointermove', onSelectionMove, false);
window.addEventListener('pointerup', onSelectionUp, false);
window.addEventListener('pointermove', onPointerMove2, false);

function onSelectionMove(event) {
    if (isSelecting && cmdDown) {  // Check cmdDown to ensure we're still in selection mode
        selectionEnd.x = event.clientX;
        selectionEnd.y = event.clientY;
        updateSelectionBox();
        updateAtomSelection();
        render();
    }
}

function onSelectionUp(event) {
    if (event.button === 0 && isSelecting) {
        isSelecting = false;
        selectionBox.style.display = 'none';

        // Remove the selection-specific event listeners
        window.removeEventListener('pointermove', onSelectionMove, false);
        window.removeEventListener('pointerup', onSelectionUp, false);

        // Finalize the box selection - add atoms in box to selection
        if (main.molecule && main.molecule.atoms) {
            const newlySelected = [];
            for (let i = 0; i < main.molecule.atoms.length; i++) {
                if (isAtomInSelection(i, getActiveCamera())) {
                    if (!atomsSelected.includes(i)) {
                        newlySelected.push(i);
                        atomsSelected.push(i);
                    }
                }
            }

            // Refresh the highlighting for the final selection
            if (newlySelected.length > 0) {
                unselectAtom(); // Clear all
                atomsSelected.forEach(idx => {
                    selectAtom(idx, false); // Highlight final selection
                });

                // Attach button event listeners after box selection
                if (atomsSelected.length > 0) {
                    attachButtonEventListeners();
                }
            }
        }

        render();
    }
}

function createAxisVisualizer(atom1, atom2) {
    // Remove existing axis visualizer
    if (axisVisualizer) {
        main.scene.remove(axisVisualizer);
        axisVisualizer.geometry.dispose();
        axisVisualizer.material.dispose();
        axisVisualizer = null;
    }

    // Create a line to visualize the axis
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(6);

    // Get the actual world positions of the atoms
    const matrix1 = new THREE.Matrix4();
    const matrix2 = new THREE.Matrix4();
    main.molecule.instancedMesh.getMatrixAt(axisAtoms[0], matrix1);
    main.molecule.instancedMesh.getMatrixAt(axisAtoms[1], matrix2);

    const pos1 = new THREE.Vector3();
    const pos2 = new THREE.Vector3();
    pos1.setFromMatrixPosition(matrix1);
    pos2.setFromMatrixPosition(matrix2);

    // Apply the instancedMesh world transformation
    pos1.applyMatrix4(main.molecule.instancedMesh.matrixWorld);
    pos2.applyMatrix4(main.molecule.instancedMesh.matrixWorld);

    // Extend the line beyond the atoms for better visibility
    const direction = new THREE.Vector3().subVectors(pos2, pos1).normalize();
    const extendDistance = 1000; // Extend 10 units in each direction

    const start = new THREE.Vector3().copy(pos1).sub(direction.clone().multiplyScalar(extendDistance));
    const end = new THREE.Vector3().copy(pos2).add(direction.clone().multiplyScalar(extendDistance));

    positions[0] = start.x;
    positions[1] = start.y;
    positions[2] = start.z;
    positions[3] = end.x;
    positions[4] = end.y;
    positions[5] = end.z;

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.LineBasicMaterial({
        color: 0xff00ff, // Magenta color for visibility
        linewidth: 3,
        opacity: 0.8,
        transparent: true
    });

    axisVisualizer = new THREE.Line(geometry, material);
    main.scene.add(axisVisualizer);
    render(); // Make sure to render after adding the axis
}

function onPointerDown(event) {
    if (ribbonMode) return;
    if (editingMolecule) {
        if (true) {
            if (!main.molecule || !main.molecule.instancedMesh) {
                console.warn('Molecule or instancedMesh not initialized');
                return;
            }

            // Convert mouse to normalized device coordinates
            const rect = renderer.domElement.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            if (event.button === 0) { // Left click
                // Update bounds before raycasting
                updateInstancedMeshBounds(main.molecule.instancedMesh, main.molecule.atoms);

                raycaster.setFromCamera(mouse, getActiveCamera());

                // Use enhanced raycasting
                const intersects = enhancedRaycast(raycaster, main.molecule.instancedMesh, main.molecule.atoms);

                if (intersects.length > 0) {
                    // Clicking on an atom
                    const instanceId = intersects[0].instanceId;
                    if (instanceId !== undefined) {
                        if (shiftDown) {
                            // Shift + click: start dragging
                            dragging = true;

                            // If the clicked atom isn't in the selection, add it
                            if (!atomsSelected.includes(instanceId)) {
                                atomsSelected.push(instanceId);
                                selectAtom(instanceId);
                            }

                            // Set up drag plane through the clicked atom
                            const worldPos = getAtomWorldPosition(instanceId, main.molecule.instancedMesh);

                            dragPlane.setFromNormalAndCoplanarPoint(
                                camera.getWorldDirection(new THREE.Vector3()),
                                worldPos
                            );

                            // Calculate offsets for ALL selected atoms relative to click point
                            dragOffsets = {};
                            const intersectPoint = intersects[0].point;
                            atomsSelected.forEach(idx => {
                                const atomWorldPos = getAtomWorldPosition(idx, main.molecule.instancedMesh);
                                dragOffsets[idx] = new THREE.Vector3().copy(atomWorldPos).sub(intersectPoint);
                            });

                            window.addEventListener('pointermove', onPointerMove, false);
                            window.addEventListener('pointerup', onPointerUp, false);
                            return; // Don't do normal selection logic
                        }

                        if (cmdDown) {
                            // Cmd + click: toggle atom in selection
                            if (atomsSelected.includes(instanceId)) {
                                // Remove from selection
                                atomsSelected = atomsSelected.filter(id => id !== instanceId);
                                unselectAtom(instanceId);
                            } else {
                                // Add to selection
                                atomsSelected.push(instanceId);
                                selectAtom(instanceId, false);
                            }
                        } else {
                            // Normal click: select only this atom
                            atomsSelected = [instanceId];
                            fragments.forEach((fragment, fragIdx) => {
                                // Check if atomsSelected matches this fragment exactly
                                if (fragment.length === atomsSelected.length &&
                                    fragment.every(atom => atomsSelected.includes(atom))) {
                                    // This selection matches a fragment - add to fragmentsSelected if not there
                                    if (!fragmentsSelected.includes(fragIdx)) {
                                        fragmentsSelected.push(fragIdx);
                                    }
                                }
                            });
                            unselectAtom(); // Clear all
                            selectAtom(instanceId);
                        }

                        render();

                        if (atomsSelected.length > 0) {
                            attachButtonEventListeners();
                        }
                    }
                } else {
                    // Clicking on empty space
                    if (cmdDown) {
                        // Cmd + drag on empty space: start box selection
                        isSelecting = true;
                        selectionStart.x = event.clientX;
                        selectionStart.y = event.clientY;
                        selectionEnd.x = event.clientX;
                        selectionEnd.y = event.clientY;

                        selectionBox.style.display = 'block';
                        updateSelectionBox();

                        // Add the selection event listeners
                        window.addEventListener('pointermove', onSelectionMove, false);
                        window.addEventListener('pointerup', onSelectionUp, false);
                    } else {

                        if (fragmentsSelected.length === 0) {
                            if (window.sillyMode && atomsSelected.length > 0) {
                                sillyCascadeUnselect([...atomsSelected]);
                                atomsSelected = [];
                            } else {
                                atomsSelected = [];
                                unselectAtom();
                            }
                        }
                        // If fragments are selected, keep their atoms selected
                        else {
                            atomsSelected = [];
                            fragmentsSelected.forEach(fragIdx => {
                                if (fragIdx < fragments.length) {
                                    atomsSelected.push(...fragments[fragIdx]);
                                }
                            });
                            // Re-highlight the fragment atoms
                            selectFragment([], -1); // Call with empty to just update highlighting
                        }
                        render();
                    }
                }
            }
        }
    }
}



function onPointerMove(event) {
    if (ribbonMode) return;
    if (!dragging) return;

    // Convert mouse to normalized device coordinates
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, getActiveCamera());
    // Find intersection with drag plane
    const intersection = new THREE.Vector3();
    raycaster.ray.intersectPlane(dragPlane, intersection);

    if (rotationAxis && rotationAxis.direction) {
        // AXIS-CONSTRAINED DRAGGING
        const axisDirection = rotationAxis.direction.clone().normalize();
        const axisPoint = rotationAxis.point.clone();

        if (!window.dragStartIntersection) {
            window.dragStartIntersection = intersection.clone();
            return;
        }

        const fullMovement = new THREE.Vector3().subVectors(intersection, window.dragStartIntersection);
        const projectedLength = fullMovement.dot(axisDirection);
        const projectedMovement = axisDirection.clone().multiplyScalar(projectedLength);

        atomsSelected.forEach(idx => {
            const atom = main.molecule.atoms[idx];

            if (!window.originalDragPositions) {
                window.originalDragPositions = {};
            }
            if (!window.originalDragPositions[idx]) {
                window.originalDragPositions[idx] = atom.position.clone();
            }

            atom.position.copy(window.originalDragPositions[idx]).add(projectedMovement);
            atom.x = atom.position.x;
            atom.y = atom.position.y;
            atom.z = atom.position.z;

            updateAtomMatrix(idx);
        });
        main.molecule.instancedMesh.instanceMatrix.needsUpdate = true;
        mode = main.mode
        main.molecule.updateBonds(main.mode);

        updateAllBondLengthLabels();
        render();
    } else {
        // NORMAL FREE DRAGGING
        if (!main.molecule || !main.molecule.atoms || !main.molecule.instancedMesh) {
            dragging = false;
            return;
        }
        atomsSelected.forEach(idx => {
            const atom = main.molecule.atoms[idx];
            const offset = dragOffsets[idx] || new THREE.Vector3();

            // Apply the transformation accounting for instancedMesh transform
            const newPos = new THREE.Vector3().copy(intersection).add(offset);

            // Convert from world space to local space of instancedMesh
            const inverseMatrix = new THREE.Matrix4().copy(main.molecule.instancedMesh.matrixWorld).invert();
            newPos.applyMatrix4(inverseMatrix);

            atom.position.copy(newPos);
            atom.x = atom.position.x;
            atom.y = atom.position.y;
            atom.z = atom.position.z;

            updateAtomMatrix(idx);
        });
    }

    main.molecule.instancedMesh.instanceMatrix.needsUpdate = true;

    // Update bounds after moving atoms
    updateInstancedMeshBounds(main.molecule.instancedMesh, main.molecule.atoms);

    // Update bonds
    mode = main.mode
    main.molecule.updateBonds(main.mode);
    if (main.molecule.labels && main.molecule.labels.length > 0) {
        main.molecule.updateLabels();
        render()
    }

    render();
}


function onPointerMove2(event) {
    if (ribbonMode) return;
    if (dragging || isSelecting) return;

    if (!editingMolecule || !main.molecule || !main.molecule.instancedMesh || !main.molecule.atoms) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, getActiveCamera());

    // Update bounds before raycasting
    updateInstancedMeshBounds(main.molecule.instancedMesh, main.molecule.atoms);

    const intersects = enhancedRaycast(raycaster, main.molecule.instancedMesh, main.molecule.atoms);

    if (intersects.length > 0) {
        const instanceId = intersects[0].instanceId;

        if (hoveredAtom !== instanceId) {
            // Reset previous hover
            if (hoveredAtom !== null && !atomsSelected.includes(hoveredAtom)) {
                if (window.sillyMode) {
                    sillyStartHoverOut(hoveredAtom);
                } else {
                    const colorAttr = main.molecule.instancedMesh.geometry.getAttribute('color');
                    if (!colorAttr) return;
                    const color = getDisplayColorForAtom(hoveredAtom);
                    colorAttr.setXYZ(hoveredAtom, color.r, color.g, color.b);
                    colorAttr.needsUpdate = true;
                }
            }

            // Apply hover effect
            hoveredAtom = instanceId;
            if (!atomsSelected.includes(instanceId)) {
                if (window.sillyMode) {
                    sillyStartHoverIn(instanceId);
                } else {
                    const colorAttr = main.molecule.instancedMesh.geometry.getAttribute('color');
                    const color = getDisplayColorForAtom(instanceId);
                    // Lighten the color for hover
                    const hoverColor = color.clone().lerp(new THREE.Color(1, 1, 1), 0.3);
                    colorAttr.setXYZ(instanceId, hoverColor.r, hoverColor.g, hoverColor.b);
                    colorAttr.needsUpdate = true;
                }
            }

            renderer.domElement.style.cursor = 'pointer';
            render();
        }
    } else {
        // No hover
        if (hoveredAtom !== null && !atomsSelected.includes(hoveredAtom)) {
            if (window.sillyMode) {
                sillyStartHoverOut(hoveredAtom);
            } else {
                const colorAttr = main.molecule.instancedMesh.geometry.getAttribute('color');
                if (!colorAttr) {
                    hoveredAtom = null;
                    return;
                }
                const color = getDisplayColorForAtom(hoveredAtom);
                colorAttr.setXYZ(hoveredAtom, color.r, color.g, color.b);
                colorAttr.needsUpdate = true;
                render();
            }
        }
        hoveredAtom = null;
        renderer.domElement.style.cursor = 'default';
    }
}
function initializeFragmentStore(atomCount) {
    globalFragmentStore = {
        originalAtomCount: atomCount,
        fragments: [],
        fragmentIdMap: new Map()
    };
    console.log('Initialized fragment store for', atomCount, 'atoms');
}

// Add a fragment to the global store (always with original indices)
function addFragmentToGlobalStore(atomIndices, currentIsolationIndices = null) {
    let originalIndices;

    if (currentIsolationIndices) {
        originalIndices = atomIndices.map(localIdx => {
            if (localIdx < currentIsolationIndices.length) {
                return currentIsolationIndices[localIdx];
            }
            return null;
        }).filter(idx => idx !== null);
    } else {
        originalIndices = [...atomIndices];
    }

    const signature = originalIndices.slice().sort((a, b) => a - b).join(',');

    if (!globalFragmentStore.fragmentIdMap.has(signature)) {
        // NEW: Check and remove overlapping fragments before adding
        removeOverlappingFragments(originalIndices);  // <-- THIS IS NEW!

        globalFragmentStore.fragments.push(originalIndices);
        globalFragmentStore.fragmentIdMap.set(signature, globalFragmentStore.fragments.length - 1);
        console.log('Added fragment with original indices:', originalIndices);
        return true;
    }
    return false;
}

// Get fragments visible in current isolation (converts to local indices)
function getFragmentsForIsolation(isolationIndices = null) {
    if (!isolationIndices) {
        // At root level - return all fragments as-is
        return globalFragmentStore.fragments.map(f => [...f]);
    }

    // Create mapping from original to local indices
    const originalToLocal = new Map();
    isolationIndices.forEach((origIdx, localIdx) => {
        originalToLocal.set(origIdx, localIdx);
    });

    // Convert global fragments to local indices for current isolation
    const localFragments = [];
    const isolationSet = new Set(isolationIndices);

    globalFragmentStore.fragments.forEach(fragment => {
        // Check if all atoms of this fragment are in current isolation
        const allInIsolation = fragment.every(origIdx => isolationSet.has(origIdx));

        if (allInIsolation) {
            // Convert to local indices
            const localIndices = fragment.map(origIdx => originalToLocal.get(origIdx));
            if (localIndices.every(idx => idx !== undefined)) {
                localFragments.push(localIndices);
            }
        }
    });

    return localFragments;
}
// Solution 1: Create a separate function to attach button event listeners
function attachButtonEventListeners() {
    // Remove any existing listeners first to avoid duplicates
    const changeBtn = document.getElementById('changeAtomBtn');
    const removeBtn = document.getElementById('removeAtomBtn');
    const fragmentBtn = document.getElementById('createFragment');
    const isolateBtn = document.getElementById('isolateFragmentBtn');

    // Clone and replace to remove all existing event listeners
    reattachButtonHandler('changeAtom', () => {
        if (atomsSelected.length > 0) {
            const replacingMolecule = window.prompt("Enter the element you want to replace the current atom with");
            if (replacingMolecule && replacingMolecule.trim()) {
                const element = replacingMolecule.trim().toUpperCase();
                // Validate it's a known element
                if (!main.molecule.atomSettings[element]) {
                    window.toastError?.(`Unknown element: ${element}`);
                    return;
                }
                // Update all selected atoms in place (no rebuild needed)
                main.molecule.updateAtomElement(atomsSelected, element);
                // Update data array to match
                atomsSelected.forEach(idx => {
                    main.data.atomData[idx].element = element;
                });
                // Update bonds since bond lengths may change with different atom radii
                main.molecule.updateBonds(main.mode);
                if (typeof saveUndoState === 'function') {
                    saveUndoState("Change Element");
                }
                render();
            }
        }
    });

    reattachButtonHandler('removeAtom', () => {
        if (atomsSelected.length === 0) return;
        // Use the new removeAtoms method which rebuilds mesh efficiently
        main.molecule.removeAtoms(atomsSelected, main.mode);
        atomsSelected = [];
        if (typeof saveUndoState === 'function') {
            saveUndoState("Remove Atoms");
        }
        render();
    });

    reattachButtonHandler('createFragment', () => {
        // Create a copy of the selected atoms for the new fragment
        const newFragment = [...atomsSelected];

        // Get all atom indices in the molecule
        const totalAtoms = main.molecule.atoms.length;
        const allAtomIndices = Array.from({ length: totalAtoms }, (_, i) => i);

        // Process existing fragments to remove atoms that are now in the new fragment
        let updatedFragments = fragments.map(fragment => {
            // Remove atoms from existing fragments if they're in the new fragment
            return fragment.filter(atomIndex => !newFragment.includes(atomIndex));
        }).filter(fragment => fragment.length > 0); // Remove empty fragments

        // Find all atoms that are not in any fragment (including the new one)
        const atomsInFragments = new Set([
            ...newFragment,
            ...updatedFragments.flat()
        ]);

        const unassignedAtoms = allAtomIndices.filter(index => !atomsInFragments.has(index));

        // Create a new fragment for unassigned atoms if there are any
        if (unassignedAtoms.length > 0) {
            // Check if there's already an "unassigned" fragment (could be from previous operations)
            // If not, create one
            updatedFragments.push(unassignedAtoms);
        }

        // Add the new fragment
        updatedFragments.push(newFragment);

        // Update the global fragments array
        fragments = updatedFragments;

        // Log for debugging
        console.log('Fragment created:', newFragment);
        console.log('All fragments:', fragments);
        console.log('Total atoms covered:', fragments.flat().length, '/', totalAtoms);

        // Update the editing content to show the new fragment list
        if (atomsSelected.length > 0) {
            const firstAtom = main.molecule.atoms[atomsSelected[0]];
            updateEditingContent(firstAtom.type, main.molecule.atomSettings[firstAtom.type].color);
        }
    });

    reattachButtonHandler('isolateFragmentBtn', () => {
        if (fragmentsSelected.length > 0) {
            if (fragmentsSelected.length > 1) {
                // Multiple fragments: create combined isolation
                const combinedAtomIndices = [];
                let combinedName = 'Combined: ';

                fragmentsSelected.forEach((fragIdx, i) => {
                    if (fragIdx < fragments.length) {
                        combinedAtomIndices.push(...fragments[fragIdx]);
                        combinedName += `F${fragIdx + 1}${i < fragmentsSelected.length - 1 ? '+' : ''}`;
                    }
                });

                storeOriginalMolecule();

                if (!isInIsolationMode) {
                    originalFragments = JSON.parse(JSON.stringify(fragments));
                }

                // FIX: Map indices for nested isolations
                let mappedCombinedIndices;
                if (isInIsolationMode && currentIsolationIndex >= 0) {
                    const currentIsolation = isolationHistory[currentIsolationIndex];
                    mappedCombinedIndices = combinedAtomIndices.map(localIdx => {
                        if (localIdx < currentIsolation.originalIndices.length) {
                            return currentIsolation.originalIndices[localIdx];
                        }
                        return null;
                    }).filter(idx => idx !== null);
                } else {
                    mappedCombinedIndices = combinedAtomIndices;
                }

                const newData = generateDataFromAtoms(combinedAtomIndices);

                const isolationEntry = {
                    name: combinedName,
                    atomCount: combinedAtomIndices.length,
                    data: newData,
                    fragmentIndices: [...fragmentsSelected],
                    originalIndices: mappedCombinedIndices, // Use mapped indices
                    localIndices: combinedAtomIndices, // Keep local indices
                    timestamp: Date.now()
                };

                isolationHistory.push(isolationEntry);
                currentIsolationIndex = isolationHistory.length - 1;

                atomsSelected = [];
                fragmentsSelected = [];
                fragments = [];

                isInIsolationMode = true;

                main.newMolecule(
                    newData,
                    main.mode,
                    true,
                    true,
                    false
                );
                main.data = newData;

                updateIsolationModeUI();
            } else {
                // Single fragment
                isolateFragment(fragmentsSelected[0]);
            }
        } else if (atomsSelected.length > 0) {
            storeOriginalMolecule();

            if (!isInIsolationMode) {
                originalFragments = JSON.parse(JSON.stringify(fragments));
            }

            // FIX: Map atom selection indices for nested isolations
            let mappedAtomIndices;
            if (isInIsolationMode && currentIsolationIndex >= 0) {
                const currentIsolation = isolationHistory[currentIsolationIndex];
                mappedAtomIndices = atomsSelected.map(localIdx => {
                    if (localIdx < currentIsolation.originalIndices.length) {
                        return currentIsolation.originalIndices[localIdx];
                    }
                    return null;
                }).filter(idx => idx !== null);
            } else {
                mappedAtomIndices = [...atomsSelected];
            }

            const newData = generateDataFromAtoms(atomsSelected);

            const isolationEntry = {
                name: `${atomsSelected.length} Selected Atoms`,
                atomCount: atomsSelected.length,
                data: newData,
                originalIndices: mappedAtomIndices, // Use mapped indices
                localIndices: [...atomsSelected], // Keep local indices
                timestamp: Date.now()
            };

            isolationHistory.push(isolationEntry);
            currentIsolationIndex = isolationHistory.length - 1;

            atomsSelected = [];
            fragmentsSelected = [];
            fragments = [];

            isInIsolationMode = true;

            main.newMolecule(
                newData,
                main.mode,
                true,
                true,
                false
            );
            main.data = newData;

            updateIsolationModeUI();
            console.log(`Isolated ${isolationEntry.atomCount} selected atoms`);
        }

        updateEditingContent();
        render();
    });


    // Attach axis event listeners
    attachAxisEventListeners();
}

function resetRotationState() {
    // Reset the rotation state object
    rotationState.basePositions = {};
    rotationState.selectedAtoms = [];
    rotationState.currentAngle = 0;
    rotationState.isActive = false;
    rotationState.axis = null;

    // Reset slider flags - CRITICAL FIX
    window.rotationSliderOn = false;
    window.translationSliderOn = false;
    window.lastPosition = 0;
    window.lastTranslationPosition = 0;

    // Reset UI sliders
    const rotationSlider = document.getElementById('rotationSlider');
    if (rotationSlider) {
        rotationSlider.value = 0;
        rotationSlider.removeEventListener('input', rotationSlider._handler);
    }
    const translationSlider = document.getElementById('translationSlider');
    if (translationSlider) {
        translationSlider.value = 0;
        translationSlider.removeEventListener('input', translationSlider._handler);
    }
}

function saveCurrentFragments() {
    if (!fragments || fragments.length === 0) return;

    let isolationIndices = null;
    if (isInIsolationMode && currentIsolationIndex >= 0) {
        const currentIsolation = isolationHistory[currentIsolationIndex];
        isolationIndices = currentIsolation.originalIndices;
    }

    // NEW: Map all fragments to original indices first
    const newFragmentOriginalIndices = [];

    fragments.forEach(fragment => {
        let originalIndices;
        if (isolationIndices) {
            originalIndices = fragment.map(localIdx => {
                if (localIdx < isolationIndices.length) {
                    return isolationIndices[localIdx];
                }
                return null;
            }).filter(idx => idx !== null);
        } else {
            originalIndices = [...fragment];
        }
        newFragmentOriginalIndices.push(originalIndices);
    });

    // NEW: Remove parent fragment if we're subdividing it
    if (isolationIndices && newFragmentOriginalIndices.length > 1) {
        removeParentFragment(isolationIndices);  // <-- THIS IS NEW!
    }

    // Now add the new fragments
    newFragmentOriginalIndices.forEach(indices => {
        addFragmentToGlobalStore(indices);
    });

    console.log('Saved', fragments.length, 'fragments. Total stored:', globalFragmentStore.fragments.length);
}


function isolateFragment(fragmentIndex) {
    storeOriginalMolecule();

    if (fragmentIndex < 0 || fragmentIndex >= fragments.length) {
        console.error('Invalid fragment index:', fragmentIndex);
        return;
    }

    // Initialize global store on first isolation
    if (!isInIsolationMode && globalFragmentStore.fragments.length === 0) {
        initializeFragmentStore(originalMoleculeData.numAtoms);
    }

    // Save current fragments before isolating
    saveCurrentFragments();

    const fragmentAtomIndices = fragments[fragmentIndex];

    // Map to original indices
    let originalIndices;
    if (isInIsolationMode && currentIsolationIndex >= 0) {
        const currentIsolation = isolationHistory[currentIsolationIndex];
        originalIndices = fragmentAtomIndices.map(localIdx => {
            if (localIdx < currentIsolation.originalIndices.length) {
                return currentIsolation.originalIndices[localIdx];
            }
            return null;
        }).filter(idx => idx !== null);
    } else {
        originalIndices = [...fragmentAtomIndices];
    }

    console.log('Isolating fragment with original indices:', originalIndices);

    const newData = generateDataFromAtoms(fragmentAtomIndices);

    const isolationEntry = {
        name: `Fragment ${fragmentIndex + 1}`,
        atomCount: fragmentAtomIndices.length,
        data: newData,
        fragmentIndex: fragmentIndex,
        originalIndices: originalIndices,  // Always store original indices
        timestamp: Date.now()
    };

    if (isInIsolationMode && currentIsolationIndex < isolationHistory.length - 1) {
        isolationHistory = isolationHistory.slice(0, currentIsolationIndex + 1);
    }
    isolationHistory.push(isolationEntry);
    currentIsolationIndex = isolationHistory.length - 1;

    // Clear selections
    atomsSelected = [];
    fragmentsSelected = [];

    // Get fragments for new isolation level
    fragments = getFragmentsForIsolation(originalIndices);

    resetRotationState();
    isInIsolationMode = true;

    main.mode = newData.numAtoms <= 2000 ? 1 : 0;
    main.newMolecule(
        newData,
        main.setNewMode(newData.numAtoms <= 2000),
    );

    main.data = newData;
    resetCamera();
    updateIsolationModeUI();

    const fragmentList = document.getElementById('fragmentList');
    if (fragmentList) {
        updateFragmentList(fragmentList);
    }

    updateEditingContent();
    render();

    console.log('Fragment isolated. Fragments at this level:', fragments.length);
}

function removeOverlappingFragments(newFragmentIndices) {
    const newSet = new Set(newFragmentIndices);
    const fragmentsToRemove = [];

    // Find fragments that are supersets of the new fragment
    globalFragmentStore.fragments.forEach((fragment, index) => {
        const fragmentSet = new Set(fragment);

        // Check if existing fragment is a superset of new fragment
        if (fragment.length > newFragmentIndices.length) {
            let isSuperset = true;
            for (const idx of newFragmentIndices) {
                if (!fragmentSet.has(idx)) {
                    isSuperset = false;
                    break;
                }
            }
            if (isSuperset) {
                fragmentsToRemove.push(index);
            }
        }
    });

    // Remove superset fragments in reverse order to maintain indices
    fragmentsToRemove.sort((a, b) => b - a);
    fragmentsToRemove.forEach(index => {
        const removed = globalFragmentStore.fragments.splice(index, 1)[0];
        const signature = removed.slice().sort((a, b) => a - b).join(',');
        globalFragmentStore.fragmentIdMap.delete(signature);
        console.log('Removed superset fragment:', removed);
    });
}

function removeParentFragment(parentIndices) {
    const parentSignature = parentIndices.slice().sort((a, b) => a - b).join(',');

    // Find and remove the parent fragment
    const fragmentIndex = globalFragmentStore.fragments.findIndex(fragment => {
        const signature = fragment.slice().sort((a, b) => a - b).join(',');
        return signature === parentSignature;
    });

    if (fragmentIndex !== -1) {
        globalFragmentStore.fragments.splice(fragmentIndex, 1);
        globalFragmentStore.fragmentIdMap.delete(parentSignature);
        console.log('Removed parent fragment that was subdivided:', parentIndices);
    }
}
function restoreOriginalMolecule() {
    if (!originalMoleculeData) {
        console.error('No original molecule data to restore');
        return;
    }

    // Save current fragments before restoring
    saveCurrentFragments();

    // Update atom positions in original molecule
    if (isInIsolationMode && currentIsolationIndex >= 0) {
        const currentIsolation = isolationHistory[currentIsolationIndex];

        if (currentIsolation && currentIsolation.originalIndices && main.molecule.atoms) {
            const editedAtoms = main.molecule.atoms;
            currentIsolation.originalIndices.forEach((originalIdx, localIdx) => {
                if (localIdx < editedAtoms.length && originalIdx < originalMoleculeData.atomData.length) {
                    const editedAtom = editedAtoms[localIdx];
                    originalMoleculeData.atomData[originalIdx] = {
                        ...originalMoleculeData.atomData[originalIdx],
                        x: editedAtom.position.x / 4,
                        y: editedAtom.position.y / 4,
                        z: editedAtom.position.z / 4
                    };
                }
            });
        }
    }

    console.log('Restoring original molecule with', originalMoleculeData.numAtoms, 'atoms');
    console.log('Total fragments in global store:', globalFragmentStore.fragments.length);

    // Clear isolation mode
    isInIsolationMode = false;
    isolationHistory = [];
    currentIsolationIndex = -1;

    const restoredData = JSON.parse(JSON.stringify(originalMoleculeData));

    // Clear selections
    atomsSelected = [];
    fragmentsSelected = [];

    resetRotationState();

    // Restore all fragments at root level
    fragments = getFragmentsForIsolation(null);

    main.newMolecule(
        restoredData,
        main.setNewMode(restoredData.numAtoms <= 2000),
        true,
        true,
        false
    );

    main.data = restoredData;
    resetCamera();

    const fragmentList = document.getElementById('fragmentList');
    if (fragmentList) {
        updateFragmentList(fragmentList);
    }

    updateEditingContent();
    render();

    console.log('Restored with', fragments.length, 'fragments');
}


function highlightFragment(fragmentIndex) {
    if (!main.molecule || !main.molecule.instancedMesh) return;
    if (fragmentIndex >= fragments.length) {
        console.error('Invalid fragment index');
        return;
    }

    const fragment = fragments[fragmentIndex];
    const colorAttr = main.molecule.instancedMesh.geometry.getAttribute('color');
    if (!colorAttr) return;

    // Define distinct colors for fragments


    const color = new THREE.Color(fragmentColors[fragmentIndex % fragmentColors.length]);

    // Apply the fragment color
    // Apply the fragment color
    fragment.forEach(atomIndex => {
        colorAttr.setXYZ(atomIndex, color.r, color.g, color.b);
        main.molecule.atoms[atomIndex].displayColor = color;
    });

    colorAttr.needsUpdate = true;

    // Highlight bond halves for fragment atoms
    if (main.molecule.bonds && main.molecule.bondGroup?.children[0]) {
        const bondMesh = main.molecule.bondGroup.children[0];
        const bondColorAttr = bondMesh.geometry.getAttribute('color');
        if (bondColorAttr) {
            const fragmentSet = new Set(fragment);
            main.molecule.bonds.forEach((bond, bondIdx) => {
                const atom1Idx = main.molecule.atoms.indexOf(bond.atom1);
                const atom2Idx = main.molecule.atoms.indexOf(bond.atom2);
                if (fragmentSet.has(atom1Idx)) {
                    bondColorAttr.setXYZ(bondIdx * 2, color.r, color.g, color.b);
                }
                if (fragmentSet.has(atom2Idx)) {
                    bondColorAttr.setXYZ(bondIdx * 2 + 1, color.r, color.g, color.b);
                }
            });
            bondColorAttr.needsUpdate = true;
        }
    }

    render();
    render();
}

function resetIsolationState() {
    isInIsolationMode = false;
    isolationHistory = [];
    currentIsolationIndex = -1;
    originalMoleculeData = null;
    originalFragments = [];

    globalFragmentStore = {
        originalAtomCount: 0,
        fragments: [],
        fragmentIdMap: new Map()
    };
}

window.resetIsolationState = resetIsolationState;

function resetFragments() {
    fragments = [];

    if (!main.molecule || !main.molecule.instancedMesh || !main.molecule.atoms) return;

    // Reset atom colors to their original element colors
    const colorAttr = main.molecule.instancedMesh.geometry.getAttribute('color');
    if (!colorAttr) return;
    for (let i = 0; i < colorAttr.count; i++) {
        const atom = main.molecule.atoms[i];
        const color = getDisplayColorForAtom(i);
        atom.displayColor = color;
        colorAttr.setXYZ(i, color.r, color.g, color.b);
    }
    colorAttr.needsUpdate = true;
    updateBondColorsForDisplay();

    // Update UI
    if (atomsSelected.length > 0) {
        const firstAtom = main.molecule.atoms[atomsSelected[0]];
        updateEditingContent(firstAtom.type, main.molecule.atomSettings[firstAtom.type].color);
    }

    render();
}

// Editing panel removed — all editing is now done through the AI agent
function updateEditingContent() { }

function updateFragmentList(fragmentList) {
    fragmentList.innerHTML = '';
    fragmentList.style.alignItems = 'center';

    // Add "Show All Fragments" button if in isolation mode
    if (isInIsolationMode) {
        const showAllBtn = document.createElement('button');
        showAllBtn.textContent = 'Back to Full Molecule';
        showAllBtn.className = 'fancy-button';
        showAllBtn.style.cssText = `
            display: block;
            margin-bottom: 10px;
            background-color: rgb(64, 215, 64);
            padding: 8px 12px;
            font-size: 13px;
            width: 100%;
            box-shadow: none;
            border-radius: 0;
            z-index: 10000000000000000000!important;
        `;
        showAllBtn.addEventListener('click', restoreOriginalMolecule);
        fragmentList.appendChild(showAllBtn);

        // Add navigation buttons if there's history


        // Show current isolation info
        if (currentIsolationIndex >= 0 && currentIsolationIndex < isolationHistory.length) {
            const currentInfo = document.createElement('div');
            currentInfo.style.cssText = `
                padding: 5px;
                margin-bottom: 10px;
                background-color: rgba(255, 140, 0, 0.2);
                border-radius: 5px;
                color: white;
                font-size: 12px;
                text-align: center;
            `;
            const isolationData = isolationHistory[currentIsolationIndex];
            currentInfo.textContent = `Viewing: ${isolationData.name} (${isolationData.atomCount} atoms)`;
            fragmentList.appendChild(currentInfo);
        }
    }
    function hexToRGBA(hex, alpha = 1) {
        const r = (hex >> 16) & 0xff;
        const g = (hex >> 8) & 0xff;
        const b = hex & 0xff;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    fragments.forEach((fragment, index) => {
        const listItem = document.createElement('li');
        const color = hexToRGBA(fragmentColors[index % fragmentColors.length], 0.2);
        listItem.innerHTML = '';
        listItem.textContent = `Fragment ${index + 1}`;
        listItem.style.cursor = 'pointer';
        listItem.style.padding = '6px 8px';
        listItem.style.margin = '0px';
        listItem.style.borderRadius = '0px';
        listItem.style.transition = 'all ease-in-out 0.3s';
        listItem.style.width = '124px';
        listItem.style.fontSize = '14px';
        listItem.style.backgroundColor = color;
        listItem.dataset.fragmentIndex = index;
        listItem.style.textAlign = 'left';
        listItem.style.border = '1px solid rgb(255, 255, 255);'


        // Check if this fragment is currently selected
        if (fragmentsSelected.includes(index)) {
            listItem.classList.add('selected');
            listItem.style.backgroundColor = hexToRGBA(fragmentColors[index % fragmentColors.length], 0.7);
            listItem.style.boxShadow = `0px 0px 20px rgba(255, 255, 255, 0.23)`;

            // Add action buttons container
            const buttonContainer = document.createElement('div');
            buttonContainer.style.cssText = 'display: flex; gap: 5px; margin-top: 10px;';

            // Isolate Fragment button
            const isolateBtn = document.createElement('button');
            isolateBtn.textContent = 'Isolate';
            isolateBtn.className = 'fancy-button';
            isolateBtn.style.cssText = `
                flex: 1;
                background-color: ${hexToRGBA(fragmentColors[index % fragmentColors.length], 0.7)};
                padding: 5px 10px;
                font-size: 12px;
                width: fit-content;
                box-shadow: none;
                border-radius: 0px;
            `;

            isolateBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                isolateFragment(index);
            });

            buttonContainer.appendChild(isolateBtn);
            listItem.appendChild(buttonContainer);
        }

        // Add hover effect
        listItem.addEventListener('mouseenter', () => {
            if (!fragmentsSelected.includes(index)) {
                listItem.style.transform = 'scale(1.05)';
            }
        });

        listItem.addEventListener('mouseleave', () => {
            if (!fragmentsSelected.includes(index)) {
                listItem.style.transform = 'scale(1)';
                listItem.style.backgroundColor = color;
            }
        });

        // Add click handler with cmd/ctrl support
        listItem.addEventListener('click', (event) => {
            if (event.target.tagName === 'BUTTON') {
                return;
            }

            if (event.metaKey || event.ctrlKey) {
                // Cmd/Ctrl + click: toggle fragment in selection
                if (fragmentsSelected.includes(index)) {
                    fragmentsSelected = fragmentsSelected.filter(idx => idx !== index);
                    listItem.classList.remove('selected');
                    listItem.style.backgroundColor = 'transparent';
                } else {
                    fragmentsSelected.push(index);
                    listItem.classList.add('selected');
                    listItem.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
                }
            } else {
                // Normal click
                if (fragmentsSelected.includes(index)) {
                    fragmentsSelected = fragmentsSelected.filter(idx => idx !== index);
                    listItem.classList.remove('selected');
                    listItem.style.backgroundColor = 'transparent';
                } else {
                    fragmentList.querySelectorAll('li').forEach(item => {
                        item.classList.remove('selected');
                        item.style.backgroundColor = 'transparent';
                    });

                    fragmentsSelected = [index];
                    listItem.classList.add('selected');
                    listItem.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
                }
            }

            selectFragment(fragment, index);
            updateFragmentList(fragmentList);
        });

        fragmentList.appendChild(listItem);
    });

    attachButtonEventListeners();
}

function storeOriginalMolecule() {
    if (!originalMoleculeData) {
        originalMoleculeData = {
            atomData: JSON.parse(JSON.stringify(main.data.atomData)),
            numAtoms: main.data.numAtoms,
            // Store any other relevant data fields
        };
        console.log('Original molecule stored with', originalMoleculeData.numAtoms, 'atoms');
    }
}
let rotationSliderOn = false
let translationSliderOn = false
let lastPosition = 0

function attachAxisEventListeners() {
    const defineAxisBtn = document.getElementById('defineAxisBtn');
    const removeAxisBtn = document.getElementById('removeAxisBtn');
    const rotationSlider = document.getElementById('rotationSlider');
    const translationSlider = document.getElementById('translationSlider');
    const rotationValue = document.getElementById('rotationValue');

    if (defineAxisBtn) {
        defineAxisBtn.addEventListener('click', () => {
            if (atomsSelected.length === 2) {
                const atom1 = main.molecule.atoms[atomsSelected[0]];
                const atom2 = main.molecule.atoms[atomsSelected[1]];

                // Use atom positions directly (they're already in the correct coordinate system)
                const pos1 = atom1.position.clone();
                const pos2 = atom2.position.clone();

                rotationAxis = {
                    point: pos1.clone(),
                    direction: new THREE.Vector3().subVectors(pos2, pos1).normalize()
                };

                axisAtoms = [...atomsSelected];

                // Create visual representation
                createAxisVisualizer(atom1, atom2);

                // Update UI
                updateEditingContent(atom1.type, main.molecule.atomSettings[atom1.type].color);

                console.log('Axis defined:', rotationAxis);
            }
        });
    }

    if (removeAxisBtn) {
        removeAxisBtn.addEventListener('click', () => {
            // Remove axis
            rotationAxis = null;
            axisAtoms = [];

            // Remove visual representation
            if (axisVisualizer) {
                main.scene.remove(axisVisualizer);
                axisVisualizer.geometry.dispose();
                axisVisualizer.material.dispose();
                axisVisualizer = null;
            }

            // Update UI
            if (atomsSelected.length > 0) {
                const element = main.molecule.atoms[atomsSelected[0]].type;
                updateEditingContent(element, main.molecule.atomSettings[element].color);
            }
            currentRotationAngle = 0;
            rotationBasePositions = {};
            render();
        });
    }

    if (rotationSlider) {
        let previousAngle = 0;
        let originalPositions = {}; // Store original positions when slider starts
        let isSliderActive = false;

        // Store original positions when starting to drag


        rotationSlider.addEventListener('input', (e) => {
            if (rotationSliderOn) {
                previousAngle = rotationState.currentAngle
                rotationSliderOn = false
            }

            const angle = previousAngle + parseFloat(e.target.value);
            console.log('Rotation angle:', angle);

            rotateSelectedAtoms(angle, { relative: false });
        });
    }
    if (translationSlider) {
        translationSlider.addEventListener('input', (e) => {
            if (translationSliderOn) {
                lastPosition = 0
                translationSliderOn = false
            }
            const pos = parseFloat(e.target.value) - lastPosition;
            lastPosition = parseFloat(e.target.value)
            translateSelectedAtoms(pos / 10);
        });
    }
}

function rotateSelectedAtoms(angle, options = {}) {
    // Default options
    const defaults = {
        relative: false,
        updateUI: true,
        atomIndices: null,
        axis: null
    };

    const opts = { ...defaults, ...options };

    // Validate molecule exists
    if (!main?.molecule?.atoms || main.molecule.atoms.length === 0) {
        console.warn('No molecule or atoms available for rotation');
        return false;
    }

    // Use provided axis or global rotationAxis
    const axis = opts.axis || rotationAxis;
    if (!axis?.direction || !axis?.point) {
        console.warn('No rotation axis defined');
        return false;
    }

    // Determine which atoms to rotate
    let atomsToRotate = opts.atomIndices;
    if (!atomsToRotate) {
        if (atomsSelected && atomsSelected.length > 0) {
            atomsToRotate = atomsSelected;
        } else {
            // Rotate all atoms if none selected
            atomsToRotate = Array.from({ length: main.molecule.atoms.length }, (_, i) => i);
        }
    }

    // Initialize base positions if needed
    if (!rotationState.isActive || Object.keys(rotationState.basePositions).length === 0) {
        initializeRotationState(atomsToRotate, axis);
    }

    // Calculate the actual angle to apply
    let targetAngle;
    if (opts.relative) {
        // Relative rotation: add to current angle
        targetAngle = rotationState.currentAngle + angle;
    } else {
        // Absolute rotation: set to specific angle
        targetAngle = angle;
    }

    // Clamp angle to -180 to 180 range
    targetAngle = clampAngle(targetAngle);

    // Perform the rotation
    performRotation(atomsToRotate, targetAngle, axis);

    // Update state
    rotationState.currentAngle = targetAngle;
    rotationState.isActive = true;

    // Update UI if requested
    if (opts.updateUI) {
        updateRotationUI(targetAngle);
    }

    // Update molecule visualization
    updateMoleculeVisualization();

    return true;
}

function initializeRotationState(atomIndices, axis) {
    rotationState.basePositions = {};
    rotationState.selectedAtoms = atomIndices;
    rotationState.axis = {
        point: axis.point.clone(),
        direction: axis.direction.clone().normalize()
    };

    // If there's already a rotation applied, reverse it to get base positions
    if (rotationState.currentAngle !== 0 && rotationState.isActive) {
        const reverseMatrix = new THREE.Matrix4().makeRotationAxis(
            rotationState.axis.direction,
            -rotationState.currentAngle * Math.PI / 180
        );

        atomIndices.forEach(idx => {
            const atom = main.molecule.atoms[idx];
            const tempPos = atom.position.clone();
            tempPos.sub(rotationState.axis.point);
            tempPos.applyMatrix4(reverseMatrix);
            tempPos.add(rotationState.axis.point);
            rotationState.basePositions[idx] = tempPos;
        });
    } else {
        // Store current positions as base
        atomIndices.forEach(idx => {
            const atom = main.molecule.atoms[idx];
            rotationState.basePositions[idx] = atom.position.clone();
        });
    }
}

function performRotation(atomIndices, targetAngle, axis) {
    const angleRadians = targetAngle * Math.PI / 180;
    const axisDirection = axis.direction.clone().normalize();
    const axisPoint = axis.point.clone();
    const rotationMatrix = new THREE.Matrix4().makeRotationAxis(axisDirection, angleRadians);

    atomIndices.forEach(idx => {
        const atom = main.molecule.atoms[idx];
        const basePos = rotationState.basePositions[idx];

        if (basePos) {
            // Start from base position
            const tempPos = basePos.clone();

            // Translate to origin (relative to axis point)
            tempPos.sub(axisPoint);

            // Apply rotation
            tempPos.applyMatrix4(rotationMatrix);

            // Translate back
            tempPos.add(axisPoint);

            // Update atom position
            atom.position.copy(tempPos);
            atom.x = atom.position.x;
            atom.y = atom.position.y;
            atom.z = atom.position.z;

            // Update visual matrix
            updateAtomMatrix(idx);
        }
    });
}

function translateSelectedAtoms(distance, options = {}) {
    const defaults = {
        atomIndices: null,
        axis: null,
        updateUI: true
    };

    const opts = { ...defaults, ...options };

    // Validate
    if (!main?.molecule?.atoms) {
        console.warn('No molecule available for translation');
        return false;
    }

    const axis = opts.axis || rotationAxis;
    if (!axis?.direction) {
        console.warn('No axis defined for translation');
        return false;
    }

    // Determine atoms to translate
    let atomsToTranslate = opts.atomIndices;
    if (!atomsToTranslate) {
        if (atomsSelected && atomsSelected.length > 0) {
            atomsToTranslate = atomsSelected;
        } else {
            atomsToTranslate = Array.from({ length: main.molecule.atoms.length }, (_, i) => i);
        }
    }

    // Calculate translation vector
    const axisDirection = axis.direction.clone().normalize();
    const translationVector = axisDirection.multiplyScalar(distance);

    // Apply translation
    atomsToTranslate.forEach(idx => {
        const atom = main.molecule.atoms[idx];
        atom.position.add(translationVector);
        atom.x = atom.position.x;
        atom.y = atom.position.y;
        atom.z = atom.position.z;

        // Update base positions if rotation is active
        if (rotationState.basePositions[idx]) {
            rotationState.basePositions[idx].add(translationVector);
        }

        updateAtomMatrix(idx);
    });

    // Update axis point if it moves with the atoms
    if (axisAtoms && axisAtoms.length > 0) {
        const movingAxisAtoms = axisAtoms.filter(idx => atomsToTranslate.includes(idx));
        if (movingAxisAtoms.length > 0) {
            if (axis.point) {
                axis.point.add(translationVector);
            }
            if (rotationState.axis?.point) {
                rotationState.axis.point.add(translationVector);
            }

            // Update axis visualizer if it exists
            if (axisVisualizer && axisAtoms.length === 2) {
                const atom1 = main.molecule.atoms[axisAtoms[0]];
                const atom2 = main.molecule.atoms[axisAtoms[1]];
                main.scene.remove(axisVisualizer);
                axisVisualizer.geometry.dispose();
                axisVisualizer.material.dispose();
                createAxisVisualizer(atom1, atom2);
            }
        }
    }

    // Update visualization
    updateMoleculeVisualization();

    return true;
}
function resetRotation() {
    if (Object.keys(rotationState.basePositions).length === 0) {
        console.log('No rotation to reset');
        return;
    }

    // Restore base positions
    Object.keys(rotationState.basePositions).forEach(idx => {
        const atom = main.molecule.atoms[idx];
        const basePos = rotationState.basePositions[idx];

        if (atom && basePos) {
            atom.position.copy(basePos);
            atom.x = atom.position.x;
            atom.y = atom.position.y;
            atom.z = atom.position.z;
            updateAtomMatrix(parseInt(idx));
        }
    });

    // Reset state
    rotationState.currentAngle = 0;
    rotationState.isActive = false;

    // Update UI
    updateRotationUI(0);
    updateMoleculeVisualization();
}

function finalizeRotation() {
    if (!rotationState.isActive) return;

    // Update base positions to current positions
    rotationState.selectedAtoms.forEach(idx => {
        const atom = main.molecule.atoms[idx];
        if (atom) {
            rotationState.basePositions[idx] = atom.position.clone();
        }
    });

    // Sync atom positions → main.data BEFORE saving undo state
    if (main.molecule.updateMainCoordinates) {
        main.molecule.updateMainCoordinates();
    }

    // Save undo AFTER updateMainCoordinates so main.data reflects the change
    if (typeof saveUndoState === 'function') {
        saveUndoState("Rotate Atoms");
    }

    console.log(`Rotation finalized at ${rotationState.currentAngle}°`);
}

function clampAngle(angle) {
    while (angle > 180) angle -= 360;
    while (angle < -180) angle += 360;
    return angle;
}

function updateRotationUI(angle) {
    const rotationSlider = document.getElementById('rotationSlider');
    if (rotationSlider) {
        rotationSlider.value = angle;
    }

    const rotationValue = document.getElementById('rotationValue');
    if (rotationValue) {
        rotationValue.textContent = `${angle.toFixed(1)}°`;
    }
}

function updateMoleculeVisualization() {
    mode = main.mode
    if (main?.molecule) {
        // Update instanced mesh
        if (main.molecule.instancedMesh) {
            main.molecule.instancedMesh.instanceMatrix.needsUpdate = true;
        }

        // Update bonds
        if (main.molecule.updateBonds) {
            main.molecule.updateBonds(main.mode);
        }

        // Update labels
        if (main.molecule.labels && main.molecule.labels.length > 0 && main.molecule.updateLabels) {
            main.molecule.updateLabels();
        }

        // Update bond length labels if function exists
        if (typeof updateAllBondLengthLabels === 'function') {
            updateAllBondLengthLabels();
        }
    }

    // Render the scene
    if (typeof render === 'function') {
        render();
    }
}

function attachEnhancedRotationHandlers() {
    const rotationSlider = document.getElementById('rotationSlider');
    const rotationValue = document.getElementById('rotationValue');

    if (!rotationSlider) return;

    let sliderActive = false;

    // Mouse down - prepare for rotation
    rotationSlider.addEventListener('mousedown', () => {
        sliderActive = true;

        // Initialize rotation state if needed
        if (!rotationState.isActive) {
            const atomsToRotate = atomsSelected.length > 0
                ? atomsSelected
                : Array.from({ length: main.molecule.atoms.length }, (_, i) => i);

            if (rotationAxis) {
                initializeRotationState(atomsToRotate, rotationAxis);
                rotationState.isActive = true;
            }
        }
    });

    // Input - perform rotation
    rotationSlider.addEventListener('input', (e) => {
        if (!sliderActive || !rotationAxis) return;

        const angle = parseFloat(e.target.value);

        // Rotate to absolute angle
        rotateSelectedAtoms(angle, {
            relative: false,
            updateUI: false  // Don't update slider since we're already handling it
        });

        // Update display
        if (rotationValue) {
            rotationValue.textContent = `${angle.toFixed(1)}°`;
        }
    });

    // Mouse up - finalize rotation
    rotationSlider.addEventListener('mouseup', () => {
        if (!sliderActive) return;
        sliderActive = false;
        finalizeRotation();
    });

    // Touch support
    rotationSlider.addEventListener('touchend', () => {
        if (!sliderActive) return;
        sliderActive = false;
        finalizeRotation();
    });
}

function attachKeyboardShortcuts() {
    const ROTATION_STEP = 0.1;     // degrees
    const TRANSLATION_STEP = 0.1; // units

    window.addEventListener('keydown', (e) => {
        if (!editingMolecule || !rotationAxis) return;

        // Check for shift key
        if (!e.shiftKey) return;

        // Prevent default behavior for arrow keys
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault();

            // Disable orbit controls temporarily
            if (controls) controls.enabled = false;

            switch (e.key) {
                case 'ArrowUp':
                    // Rotate forward
                    rotateSelectedAtoms(ROTATION_STEP, { relative: true });
                    break;

                case 'ArrowDown':
                    // Rotate backward
                    rotateSelectedAtoms(-ROTATION_STEP, { relative: true });
                    break;

                case 'ArrowRight':
                    // Translate forward along axis
                    translateSelectedAtoms(TRANSLATION_STEP);
                    break;

                case 'ArrowLeft':
                    // Translate backward along axis
                    translateSelectedAtoms(-TRANSLATION_STEP);
                    break;
            }
        }

        // Reset rotation with R key
        if (e.key === 'r' || e.key === 'R') {
            resetRotation();
        }

    });

    window.addEventListener('keyup', (e) => {
        if (e.key === 'Shift' && controls) {
            controls.enabled = true;

            // Finalize any ongoing transformations
            if (rotationState.isActive) {
                finalizeRotation();
            }
        }
    });
}

function initializeRotationSystem() {
    // Attach all event handlers
    attachEnhancedRotationHandlers();
    attachKeyboardShortcuts();
    attachMouseWheelRotation();

    // Reset state
    rotationState = {
        basePositions: {},
        currentAngle: 0,
        isActive: false,
        axis: null,
        selectedAtoms: []
    };

    console.log('Enhanced rotation system initialized');
}

function recreateRenderer(antialiasEnabled) {
    // Store current renderer size
    const width = renderer.domElement.width;
    const height = renderer.domElement.height;

    // Dispose old renderer to prevent memory leak
    renderer.dispose();
    document.body.removeChild(renderer.domElement);

    // Create new renderer with updated antialias
    renderer = new THREE.WebGLRenderer({
        antialias: antialiasEnabled,
        powerPreference: "high-performance",
        alpha: true,
        preserveDrawingBuffer: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);
    window.renderer = renderer;
    console.log("Render Limits:", renderer.capabilities.maxInstances);


    // Recreate controls
    controls = new ArcballControls(camera, renderer.domElement);
    controls.rotateSpeed = 2.0;
    controls.zoomSpeed = 2.0;
    controls.panSpeed = 1.0;
    controls.dynamicDampingFactor = 1.0;
    controls.cursorZoom = true;
    controls.enableAnimations = true;


    // IMPORTANT: Re-attach the enhanced pointer down event for atom selection
    // Remove first to prevent duplicate listeners across multiple recreateRenderer calls
    window.removeEventListener('pointerdown', enhancedOnPointerDown, false);
    window.addEventListener('pointerdown', enhancedOnPointerDown, false);

    // Env map textures depend on the renderer's PMREMGenerator, so invalidate cache
    Object.keys(envMapCache).forEach(k => {
        if (envMapCache[k] && envMapCache[k].dispose) envMapCache[k].dispose();
        delete envMapCache[k];
    });
    if (window.envMapEnabled) {
        applyEnvMap(true, window.envMapPreset);
    }

    render();
}


function updateAtomMatrix(atomIndex) {
    if (!main.molecule || !main.molecule.atoms || !main.molecule.atoms[atomIndex]) return;
    const atom = main.molecule.atoms[atomIndex];
    const matrix = new THREE.Matrix4();
    const settings = main.molecule.atomSettings[atom.type];
    let radius = (settings?.realRadius || 0.67) * 1.5;
    if (main.mode && main.mode.atomSize) {
        radius *= main.mode.atomSize;
    }
    matrix.makeScale(radius, radius, radius);
    matrix.setPosition(atom.position);
    main.molecule.instancedMesh.setMatrixAt(atomIndex, matrix);
}

function onPointerUp(event) {
    // Handle dragging cleanup
    const wasDragging = dragging;
    if (dragging) {
        dragging = false;
        dragOffsets = {};

        // Clean up axis dragging variables
        window.dragStartIntersection = null;
        window.originalDragPositions = null;
        if (main.molecule && main.molecule.labels && main.molecule.labels.length > 0) {
            main.molecule.updateLabels();
            render();
        }
        window.removeEventListener('pointermove', onPointerMove, false);
        window.removeEventListener('pointerup', onPointerUp, false);
    }

    // Handle selection box cleanup (backup in case onSelectionUp wasn't called)
    if (event.button === 0 && isSelecting) {
        onSelectionUp(event);
    }

    if (main.molecule) {
        // Sync atom positions → main.data BEFORE saving undo state
        main.molecule.updateMainCoordinates();
    }

    // Save undo AFTER updateMainCoordinates so main.data reflects the drag
    if (wasDragging) {
        saveUndoState("Move Atoms");
    }
}
function selectFragment(fragmentAtoms, fragmentIndex) {
    if (!main.molecule || !main.molecule.instancedMesh || !main.molecule.atoms) return;

    // Clear previous atom selection
    atomsSelected = [];

    // Build atomsSelected from all selected fragments
    fragmentsSelected.forEach(fragIdx => {
        if (fragIdx < fragments.length) {
            atomsSelected.push(...fragments[fragIdx]);
        }
    });

    // Reset color attributes for all atoms
    const colorAttr = main.molecule.instancedMesh.geometry.getAttribute('color');
    if (!colorAttr) return;
    for (let i = 0; i < colorAttr.count; i++) {
        const atom = main.molecule.atoms[i];
        if (!atom) continue;
        const color = getDisplayColorForAtom(i);
        atom.displayColor = color;
        colorAttr.setXYZ(i, color.r, color.g, color.b);
    }

    updateBondColorsForDisplay();

    // Highlight selected fragments
    fragmentsSelected.forEach(fragIdx => {
        if (fragIdx < fragments.length) {
            highlightFragment(fragIdx);
        }
    });

    colorAttr.needsUpdate = true;

    window.rotationSliderOn = true;  // Mark slider as needing reset
    window.translationSliderOn = true;  // Mark translation slider as needing reset

    // Reset the rotation state to ensure clean slate for fragment rotation
    if (rotationState) {
        rotationState.currentAngle = 0;
        rotationState.isActive = false;
    }

    // Reset slider UI values
    const rotationSlider = document.getElementById('rotationSlider');
    if (rotationSlider) {
        rotationSlider.value = 0;
    }

    const translationSlider = document.getElementById('translationSlider');
    if (translationSlider) {
        translationSlider.value = 0;
    }

    render();
}


function updateFragmentListSelection(selectedIndex) {
    const fragmentList = document.getElementById('fragmentList');
    if (!fragmentList) return;

    // Remove selection from all items
    fragmentList.querySelectorAll('li').forEach((item, index) => {
        item.classList.remove('selected');
        item.style.backgroundColor = 'transparent';

        // Add selection to the clicked item
        if (index === selectedIndex) {
            item.classList.add('selected');
            item.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
        }
    });
}
function initializeSelectionBox() {
    if (!document.getElementById('selectionBox')) {
        const selectionBoxElement = document.createElement('div');
        selectionBoxElement.id = 'selectionBox';
        selectionBoxElement.style.cssText = `
            position: fixed;
            border: 2px dashed rgba(255, 255, 255, 0.7);
            background-color: rgba(255, 255, 255, 0.1);
            pointer-events: none;
            display: none;
            z-index: 1000;
        `;
        document.body.appendChild(selectionBoxElement);
    }
}

function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort((x, y) => x - y);
    const sortedB = [...b].sort((x, y) => x - y);  // Fixed: x - y
    return sortedA.every((val, index) => val === sortedB[index]);
}

function selectAtom(index, reset = true) {
    if (!main.molecule || !main.molecule.instancedMesh || !main.molecule.atoms) return;
    if (index < 0 || index >= main.molecule.atoms.length) return;

    const colorAttr = main.molecule.instancedMesh.geometry.getAttribute('color');
    if (!colorAttr) return;

    // Only reset all colors if we're not in box selection mode
    if ((!isSelecting || !cmdDown) && reset) {
        for (let i = 0; i < colorAttr.count; i++) {
            const atom = main.molecule.atoms[i];
            const color = getDisplayColorForAtom(i);
            atom.displayColor = color;
            colorAttr.setXYZ(i, color.r, color.g, color.b);
        }
        updateBondColorsForDisplay();
    }

    // Highlight selected atom (yellow) + connected bond halves
    main.molecule.atoms[index].displayColor = new THREE.Color(1, 1, 0);

    // Collect bond half-indices connected to this atom
    const bondHalves = [];
    if (main.molecule.bonds && main.molecule.bondGroup?.children[0]) {
        const atom = main.molecule.atoms[index];
        main.molecule.bonds.forEach((bond, bondIdx) => {
            if (bond.atom1 === atom) bondHalves.push(bondIdx * 2);
            else if (bond.atom2 === atom) bondHalves.push(bondIdx * 2 + 1);
        });
    }

    if (window.sillyMode && !sillyAlreadySelected.has(index) && !isSelecting) {
        // Animate: color fade for atom and bonds
        sillyAlreadySelected.add(index);
        sillyStartSelectColor(index, bondHalves);
    } else {
        // Instant yellow
        if (window.sillyMode) sillyAlreadySelected.add(index);
        colorAttr.setXYZ(index, 1, 1, 0);
        colorAttr.needsUpdate = true;
        if (bondHalves.length > 0) {
            const bondMesh = main.molecule.bondGroup.children[0];
            const bondColorAttr = bondMesh.geometry.getAttribute('color');
            if (bondColorAttr) {
                for (const halfIdx of bondHalves) {
                    bondColorAttr.setXYZ(halfIdx, 1, 1, 0);
                }
                bondColorAttr.needsUpdate = true;
            }
        }
    }
}


function unselectAtom(index = null) {
    if (!main.molecule || !main.molecule.instancedMesh || !main.molecule.atoms) return;

    const colorAttr = main.molecule.instancedMesh.geometry.getAttribute('color');
    if (!colorAttr) return;

    if (index === null) {
        // Reset all atoms to their display color
        for (let i = 0; i < colorAttr.count; i++) {
            const atom = main.molecule.atoms[i];
            const color = getDisplayColorForAtom(i);
            atom.displayColor = color;
            colorAttr.setXYZ(i, color.r, color.g, color.b);
        }
        // Only clear silly tracking for atoms no longer in atomsSelected
        for (const idx of sillyAlreadySelected) {
            if (!atomsSelected.includes(idx)) sillyAlreadySelected.delete(idx);
        }
    } else {
        // Single atom deselect
        if (window.sillyMode && sillyAlreadySelected.has(index)) {
            sillyStartUnselectColor(index);
            sillyAlreadySelected.delete(index);
        } else {
            const color = getDisplayColorForAtom(index);
            main.molecule.atoms[index].displayColor = color;
            colorAttr.setXYZ(index, color.r, color.g, color.b);
        }
        if (!atomsSelected.includes(index)) sillyAlreadySelected.delete(index);
    }
    colorAttr.needsUpdate = true;
    updateBondColorsForDisplay();
}

function saveImage() {
    if (!main.data || main.data.numAtoms === 0) {
        window.toastWarning?.('No molecule loaded to capture');
        return;
    }

    const originalBackground = scene.background;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const scale = 2; // 2x resolution, increase for higher quality

    // Temporarily increase resolution
    renderer.setSize(width * scale, height * scale, false);
    scene.background = null;
    renderer.render(scene, camera);

    let imgData = renderer.domElement.toDataURL("image/png", 1.0);
    const link = document.createElement('a');
    link.setAttribute('href', imgData);
    link.setAttribute('target', '_blank');
    link.setAttribute('download', 'molecule.png');
    link.click();

    // Restore original
    renderer.setSize(width, height, false);
    scene.background = originalBackground;
    renderer.render(scene, camera);
}
function getScreenUrl() {

    const analysisPanel = document.getElementById('analysisResponseContainer');
    analysisPanel.querySelectorAll('p').forEach(p => p.remove());

    renderer.render(scene, camera);
    let imgData = renderer.domElement.toDataURL("image/png", 1.0);
    analysisPanel.classList.add('on');

    return imgData;
}
// Animation loop
function copyTextToClipboard(text) {
    if (!navigator.clipboard) {
        // fallback for older browsers
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";  // prevent scrolling to bottom
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
            const successful = document.execCommand('copy');
        } catch (err) {
            console.error('Fallback: Copy error', err);
        }

        document.body.removeChild(textArea);
        return;
    }

    navigator.clipboard.writeText(text)
        .then(() => {
            console.log('Copy successful!');
        })
        .catch(err => {
            console.error('Copy error:', err);
        });
}
function rotateCamera(angleToRotate, camera, controls = null) {
    const pos = camera.position;
    const angle = angleToRotate;
    const newX = pos.x * Math.cos(angle) + pos.z * Math.sin(angle);
    const newZ = -pos.x * Math.sin(angle) + pos.z * Math.cos(angle);
    camera.position.set(newX, pos.y, newZ);
    camera.lookAt(0, 0, 0);
    if (controls) {
        controls.target.set(0, 0, 0);
        controls.update();
    }
}

window.addEventListener('authStateChanged', (event) => {
    const { user } = event.detail;
    updateFeatureAccess(user, true, true);
    editingMolecule = true
    window.currentUserEmail = user ? user.email : null

    const saveSection = document.getElementById('molecule-save-section');
    if (saveSection) {
        let prompt = saveSection.parentElement.querySelector('.save-molecules-prompt');
        if (!prompt) {
            prompt = document.createElement('div');
            prompt.className = 'save-molecules-prompt';
            saveSection.parentElement.insertBefore(prompt, saveSection);
        }

        if (!user) {
            saveSection.style.display = 'none'
            prompt.innerHTML = '<p style="color: white; padding: 10px;">Sign in to save molecules</p>';
        } else {
            prompt.innerHTML = '';
            saveSection.style.display = 'block'
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    // Start with restricted access
    restrictFeatures();
});

const makeDefaultButton = document.getElementById('makeDefaultButton');
if (makeDefaultButton) {
    makeDefaultButton.addEventListener('click', async () => {
        // Get current user from Firebase Auth
        const { getAuth } = await import('https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js');
        const auth = getAuth();
        const user = auth.currentUser;

        if (user) {
            makeDefaultButton.disabled = true;
            makeDefaultButton.innerHTML = ' Saving...';

            const success = await saveStylePreferences(user.uid);

            setTimeout(() => {
                makeDefaultButton.disabled = false;
                makeDefaultButton.innerHTML = ' Make Default';
            }, 1000);
        } else {
            showNotification('Please sign in to save preferences', 'error');
        }
    });
}

if (typeof main !== 'undefined') {
    restrictFeatures();
}

function setSceneColor(color) {
    if (!window.envMapEnabled) {
        scene.background = new THREE.Color(color);
    } else {
        savedBackgroundColor = new THREE.Color(color);
    }
}

window.loadStylePreferences = loadStylePreferences;
window.saveStylePreferences = saveStylePreferences;
window.resetToDefaults = resetToDefaults;
window.recreateRenderer = recreateRenderer;
window.render = render;
window.setSceneColor = setSceneColor;
window.renderer = renderer;
window.mode = mode
window.labelMode = labelMode
window.mouse = mouse
window.raycaster = raycaster
window.camera = camera
window.labels = labels
window.rotateSelectedAtoms = rotateSelectedAtoms;
window.translateSelectedAtoms = translateSelectedAtoms;
window.updateAtomMatrix = updateAtomMatrix;
window.resetRotation = resetRotation;
window.finalizeRotation = finalizeRotation;
window.initializeRotationSystem = initializeRotationSystem;
window.rotationState = rotationState;
window.startMeasurement = null;
window.endMeasurement = null;
window.fileName = "";

// Auto-initialize if the script is loaded after DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeRotationSystem);
} else {
    initializeRotationSystem();
}
function attachMouseWheelRotation() {
    window.addEventListener('wheel', (e) => {
        if (!shiftDown || !rotationAxis || !main?.molecule?.atoms) return;

        // e.preventDefault();

        // Calculate rotation angle from wheel delta
        const angle = e.deltaY * 0.5; // Scale factor for sensitivity

        // Apply relative rotation
        rotateSelectedAtoms(angle, { relative: true });
    });
}
window.attachMouseWheelRotation = attachMouseWheelRotation
const buttonSound = new Audio()
buttonSound.src = "Create.wav"

document.querySelectorAll('button').forEach(button => {
    button.addEventListener('click', (event) => {
        buttonSound.play()
    });
});

function loopAround180(value) {
    if (value > 180 || value < -180) {
        let sign = value < 0 ? -1 : 1;
        let absVal = Math.abs(value);
        return sign * (absVal % 180);
    }
    return value;
}


document.addEventListener('DOMContentLoaded', () => {
    // Save molecule
    // In main.js, update the save-molecule-btn event listener:
    document.getElementById('save-molecule-btn')?.addEventListener('click', async () => {
        const nameInput = document.getElementById('molecule-name-input');
        const name = nameInput.value.trim();

        if (!name) {
            window.toastWarning?.('Please enter a molecule name');
            return;
        }

        const saved = await saveMolecule(name);
        if (saved) {
            nameInput.value = '';

            const select = document.getElementById('molecules-list');
            if (select.style.display !== 'none') {
                const molecules = await loadMoleculesList();
                select.innerHTML = '<option value="">Select a molecule...</option>';
                molecules.forEach(mol => {
                    const option = document.createElement('option');
                    option.value = JSON.stringify(mol);
                    option.textContent = `${mol.name} (${mol.atomCount} atoms)`;
                    select.appendChild(option);
                });
            }
        }
    });

    // Load molecules list
    document.getElementById('load-molecules-btn')?.addEventListener('click', async () => {
        const molecules = await loadMoleculesList();
        const select = document.getElementById('molecules-list');
        const actions = document.getElementById('molecule-actions');

        if (molecules.length === 0) {
            window.toastInfo?.('No saved molecules found');
            return;
        }

        // Clear and populate
        select.innerHTML = '<option value="">Select a molecule...</option>';
        molecules.forEach(mol => {
            const option = document.createElement('option');
            option.value = JSON.stringify(mol);
            option.textContent = `${mol.name} (${mol.atomCount} atoms)`;
            select.appendChild(option);
        });

        select.style.display = 'block';
        actions.style.display = 'block';
    });

    // Load selected
    document.getElementById('load-selected-btn')?.addEventListener('click', () => {
        const select = document.getElementById('molecules-list');
        if (!select.value) {
            window.toastWarning?.('Please select a molecule');
            return;
        }

        const moleculeData = JSON.parse(select.value);
        resetIsolationState();
        loadMolecule(moleculeData);

        // Hide the selection UI
        select.style.display = 'none';
        document.getElementById('molecule-actions').style.display = 'none';
        console.log(moleculeData.data.fragments);
        fragments = moleculeData.data.fragments.map(f => f.atoms);

        // Reset isolation state - we're viewing the full molecule
        isInIsolationMode = false;
        isolationHistory = [];
        currentIsolationIndex = -1;
        originalMoleculeData = null;
        originalFragments = [];
        if (fragments.length > 0) {
            document.getElementById('createFragment').style.display = 'block';
        }
        // Update the fragment list UI
        updateFragmentList(document.getElementById('fragmentList'));
        updateEditingContent();
    });

    // Delete selected
    document.getElementById('delete-selected-btn')?.addEventListener('click', async () => {
        const select = document.getElementById('molecules-list');
        if (!select.value) {
            window.toastWarning?.('Please select a molecule');
            return;
        }

        const moleculeData = JSON.parse(select.value);
        const deleted = await deleteMolecule(moleculeData.id);

        if (deleted) {
            // Refresh the list
            document.getElementById('load-molecules-btn').click();
        }
    });
});


const resetToDefaultsButton = document.getElementById('resetToDefaultButton');
if (resetToDefaultsButton) {
    resetToDefaultsButton.addEventListener('click', function () {
        resetToDefaults();
        updateStyles();
        render();
    });

}
function calculateBondLength(atom1, atom2) {
    const distance = atom1.position.distanceTo(atom2.position);
    return (distance / 4).toFixed(2); // Return distance with 3 decimal places
}

function calculateAngle(atom1, atom2, atom3) {
    // atom2 is the vertex/middle atom
    // Calculate vectors from middle atom to the other two
    const vector1 = new THREE.Vector3().subVectors(atom1.position, atom2.position);
    const vector2 = new THREE.Vector3().subVectors(atom3.position, atom2.position);

    // Calculate angle in radians, then convert to degrees
    const angleRadians = vector1.angleTo(vector2);
    const angleDegrees = (angleRadians * 180 / Math.PI).toFixed(1);

    return angleDegrees;
}
function calculateDihedral(atom1, atom2, atom3, atom4) {
    // Create vectors for the bonds
    const b1 = new THREE.Vector3().subVectors(atom2.position, atom1.position);
    const b2 = new THREE.Vector3().subVectors(atom3.position, atom2.position);
    const b3 = new THREE.Vector3().subVectors(atom4.position, atom3.position);

    // Calculate normal vectors to the planes
    const n1 = new THREE.Vector3().crossVectors(b1, b2).normalize();
    const n2 = new THREE.Vector3().crossVectors(b2, b3).normalize();

    // Calculate the dihedral angle
    const cosAngle = n1.dot(n2);
    const sinAngle = new THREE.Vector3().crossVectors(n1, n2).dot(b2.normalize());

    // Get angle in radians
    let angleRadians = Math.atan2(sinAngle, cosAngle);

    // Convert to 0-360 range instead of -180 to +180
    if (angleRadians < 0) {
        angleRadians += 2 * Math.PI;
    }

    // Convert to degrees
    const angleDegrees = (angleRadians * 180 / Math.PI).toFixed(1);

    return angleDegrees;
}
function createInfoLabel(atom1Index, atom2Index, atom3Index = null, atom4Index = null) {
    if (!main.molecule || !main.molecule.atoms || !main.molecule.instancedMesh) return;
    const atom1 = main.molecule.atoms[atom1Index];
    const atom2 = main.molecule.atoms[atom2Index];
    const atom3 = atom3Index !== null ? main.molecule.atoms[atom3Index] : null;
    const atom4 = atom4Index !== null ? main.molecule.atoms[atom4Index] : null;

    if (!atom1 || !atom2) return;

    // Get actual world positions from the instanced mesh
    const atom1WorldPos = getAtomWorldPosition(atom1Index, main.molecule.instancedMesh);
    const atom2WorldPos = getAtomWorldPosition(atom2Index, main.molecule.instancedMesh);
    const atom3WorldPos = atom3 ? getAtomWorldPosition(atom3Index, main.molecule.instancedMesh) : null;
    const atom4WorldPos = atom4 ? getAtomWorldPosition(atom4Index, main.molecule.instancedMesh) : null;

    // Determine measurement type
    const isDihedral = atom4 !== null;
    const isAngle = !isDihedral && atom3 !== null;

    // Calculate the value and position for the label
    let value, labelPosition, color;

    if (isDihedral) {
        // For dihedral: measure angle between two planes
        value = calculateDihedral(atom1, atom2, atom3, atom4) + "°";
        // Position label at the midpoint of the central bond (B-C)
        labelPosition = new THREE.Vector3()
            .addVectors(atom2WorldPos, atom3WorldPos)
            .multiplyScalar(0.5);
        color = "rgb(255, 140, 0)"; // Orange for dihedrals
    } else if (isAngle) {
        // For angle: atom2 is the vertex (middle atom)
        value = calculateAngle(atom1, atom2, atom3) + "°";
        // Position label closer to the vertex atom (atom2)
        const centroid = new THREE.Vector3()
            .add(atom1WorldPos)
            .add(atom2WorldPos)
            .add(atom3WorldPos)
            .divideScalar(3);
        labelPosition = new THREE.Vector3().lerpVectors(atom2WorldPos, centroid, 0.3);
        color = "rgb(221, 255, 0)"; // Yellow for angles
    } else {
        // For bond length: calculate midpoint between two atoms
        value = calculateBondLength(atom1, atom2);
        labelPosition = new THREE.Vector3()
            .addVectors(atom1WorldPos, atom2WorldPos)
            .multiplyScalar(0.5);
        color = "rgb(0, 170, 255)"; // Blue for bond lengths
    }

    // Create label element
    const labelDiv = document.createElement('div');
    labelDiv.className = isDihedral ? 'dihedral-label' : (isAngle ? 'angle-label' : 'bond-length-label');

    if (!isDihedral && !isAngle) {
        // For bond length: create an editable input that looks like a label
        const input = document.createElement('input');
        labelDiv.inputElement = input;  // Store reference for updateBondLengthLabel
        input.type = 'text';
        input.value = value;
        input.style.cssText = `
            color: ${color};
            font-family: 'Segoe UI', system-ui, sans-serif;
            font-size: 14px;
            font-weight: 600;
            background: transparent;
            border: none;
            padding: 2px 4px;
            text-align: center;
            width: 60px;
            cursor: text;
            outline: none;
            text-shadow: 
                -1px -1px 0 #000,
                1px -1px 0 #000,
                -1px 1px 0 #000,
                1px 1px 0 #000,
                0 0 3px rgba(0,0,0,0.9);
            transition: none!important;
        `;

        let justAppliedTransform = false; // Flag to prevent blur from resetting

        // Pre-calculate fragments once when label is created
        let cachedFragment1 = null;
        let cachedFragment2 = null;

        const buildAdjacencyList = () => {
            const adj = new Map();
            for (let i = 0; i < main.molecule.atoms.length; i++) {
                adj.set(i, []);
            }
            main.molecule.bonds.forEach(bond => {
                const idx1 = main.molecule.atoms.indexOf(bond.atom1);
                const idx2 = main.molecule.atoms.indexOf(bond.atom2);
                if (idx1 !== -1 && idx2 !== -1) {
                    adj.get(idx1).push(idx2);
                    adj.get(idx2).push(idx1);
                }
            });
            return adj;
        };

        const findConnectedAtoms = (startIdx, excludeIdx, adj) => {
            const visited = new Set([startIdx]);
            const queue = [startIdx];

            while (queue.length > 0) {
                const current = queue.shift();
                const neighbors = adj.get(current) || [];

                for (const neighborIdx of neighbors) {
                    if (current === startIdx && neighborIdx === excludeIdx) continue;
                    if (!visited.has(neighborIdx)) {
                        visited.add(neighborIdx);
                        queue.push(neighborIdx);
                    }
                }
            }
            return Array.from(visited);
        };

        // Cache fragments immediately
        const adj = buildAdjacencyList();
        const atom1Neighbors = adj.get(atom1Index) || [];
        if (atom1Neighbors.includes(atom2Index)) {
            cachedFragment1 = findConnectedAtoms(atom1Index, atom2Index, adj);
            cachedFragment2 = findConnectedAtoms(atom2Index, atom1Index, adj);
        }

        // Handle Enter key to apply distance
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const targetDistance = parseFloat(input.value);
                if (!isNaN(targetDistance) && targetDistance > 0) {
                    let atomsToMove = [];
                    let anchorAtomIndex;

                    if (cachedFragment1 && cachedFragment2) {
                        // Use cached fragments - move the smaller one
                        if (cachedFragment2.length <= cachedFragment1.length) {
                            atomsToMove = cachedFragment2;
                            anchorAtomIndex = atom1Index;
                        } else {
                            atomsToMove = cachedFragment1;
                            anchorAtomIndex = atom2Index;
                        }
                    } else {
                        // Fallback if not bonded
                        atomsToMove = [atom2Index];
                        anchorAtomIndex = atom1Index;
                    }

                    const referenceAtomIndex = atomsToMove.includes(atom1Index) ? atom1Index : atom2Index;

                    const targetDistanceInternal = targetDistance * 4;
                    const anchorAtom = main.molecule.atoms[anchorAtomIndex];
                    const referenceAtom = main.molecule.atoms[referenceAtomIndex];

                    const currentVector = new THREE.Vector3().subVectors(referenceAtom.position, anchorAtom.position);
                    const currentDistance = currentVector.length();

                    if (currentDistance === 0) {
                        input.blur();
                        return;
                    }

                    const translationDistance = targetDistanceInternal - currentDistance;
                    const direction = currentVector.normalize();
                    const translationVector = direction.multiplyScalar(translationDistance);

                    atomsToMove.forEach(atomIdx => {
                        const atom = main.molecule.atoms[atomIdx];
                        atom.position.add(translationVector.clone());
                        atom.x = atom.position.x;
                        atom.y = atom.position.y;
                        atom.z = atom.position.z;
                        updateAtomMatrix(atomIdx);
                    });

                    main.molecule.instancedMesh.instanceMatrix.needsUpdate = true;
                    main.molecule.updateBonds(main.mode);
                    if (main.molecule.labels && main.molecule.labels.length > 0) {
                        main.molecule.updateLabels();
                    }

                    justAppliedTransform = true;
                    updateAllBondLengthLabels();
                    main.molecule.updateMainCoordinates();
                    saveUndoState("Set Distance");
                    render();

                    input.blur();
                    return;
                }
                input.blur();
            } else if (e.key === 'Escape') {
                input.value = calculateBondLength(atom1, atom2);
                input.blur();
            }
        });

        // Focus effect
        input.addEventListener('focus', () => {
            input.style.textShadow = `
                -1px -1px 0 #000,
                1px -1px 0 #000,
                -1px 1px 0 #000,
                1px 1px 0 #000,
                0 0 8px ${color}`;
            input.select();
        });

        input.addEventListener('blur', () => {
            input.style.textShadow = `
                -1px -1px 0 #000,
                1px -1px 0 #000,
                -1px 1px 0 #000,
                1px 1px 0 #000,
                0 0 3px rgba(0,0,0,0.9)`;

            // Only reset value if we didn't just apply a transform
            if (!justAppliedTransform) {
                input.value = calculateBondLength(atom1, atom2);
            }

            // Reset the flag for next time
            justAppliedTransform = false;
        });

        labelDiv.appendChild(input);
        input.style.setProperty('transition', 'none', 'important');
        labelDiv.style.setProperty('transition', 'none', 'important');
        labelDiv.style.pointerEvents = 'auto';
        labelDiv.inputElement = input; // Store reference
    } else if (isDihedral) {
        // For dihedral: create an editable input
        const input = document.createElement('input');
        labelDiv.inputElement = input;
        input.type = 'text';
        input.value = value;
        input.style.cssText = `
            color: ${color};
            font-family: 'Segoe UI', system-ui, sans-serif;
            font-size: 14px;
            font-weight: 600;
            background: transparent;
            border: none;
            padding: 2px 4px;
            text-align: center;
            width: 70px;
            cursor: text;
            outline: none;
            text-shadow: 
                -1px -1px 0 #000,
                1px -1px 0 #000,
                -1px 1px 0 #000,
                1px 1px 0 #000,
                0 0 3px rgba(0,0,0,0.9);
            transition: none!important;
        `;

        let justAppliedTransform = false;

        // Pre-calculate fragment on the atom4 side (rotating around B-C axis)
        let cachedFragment = null;
        let cachedBasePositions = null;

        const buildAdjacencyList = () => {
            const adj = new Map();
            for (let i = 0; i < main.molecule.atoms.length; i++) {
                adj.set(i, []);
            }
            main.molecule.bonds.forEach(bond => {
                const idx1 = main.molecule.atoms.indexOf(bond.atom1);
                const idx2 = main.molecule.atoms.indexOf(bond.atom2);
                if (idx1 !== -1 && idx2 !== -1) {
                    adj.get(idx1).push(idx2);
                    adj.get(idx2).push(idx1);
                }
            });
            return adj;
        };

        const findConnectedAtoms = (startIdx, excludeIdx, adj) => {
            const visited = new Set([startIdx]);
            const queue = [startIdx];

            while (queue.length > 0) {
                const current = queue.shift();
                const neighbors = adj.get(current) || [];

                for (const neighborIdx of neighbors) {
                    if (current === startIdx && neighborIdx === excludeIdx) continue;
                    if (!visited.has(neighborIdx)) {
                        visited.add(neighborIdx);
                        queue.push(neighborIdx);
                    }
                }
            }
            return Array.from(visited);
        };

        // Cache fragment: atoms connected to atom3 (C), excluding atom2 (B)
        const adj = buildAdjacencyList();
        cachedFragment = findConnectedAtoms(atom3Index, atom2Index, adj);
        // Store base positions
        cachedBasePositions = {};
        cachedFragment.forEach(idx => {
            cachedBasePositions[idx] = main.molecule.atoms[idx].position.clone();
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const targetAngleStr = input.value.replace('°', '').trim();
                const targetAngle = parseFloat(targetAngleStr);

                if (!isNaN(targetAngle) && cachedFragment && cachedFragment.length > 0) {
                    // Get current dihedral angle
                    const currentAngle = parseFloat(calculateDihedral(
                        main.molecule.atoms[atom1Index],
                        main.molecule.atoms[atom2Index],
                        main.molecule.atoms[atom3Index],
                        main.molecule.atoms[atom4Index]
                    ));

                    // Calculate rotation needed
                    let deltaAngle = targetAngle - currentAngle;

                    // Normalize to -180 to 180
                    while (deltaAngle > 180) deltaAngle -= 360;
                    while (deltaAngle < -180) deltaAngle += 360;

                    const deltaRadians = deltaAngle * Math.PI / 180;

                    // Rotation axis is B->C
                    const axisStart = main.molecule.atoms[atom2Index].position.clone();
                    const axisEnd = main.molecule.atoms[atom3Index].position.clone();
                    const axisDirection = new THREE.Vector3().subVectors(axisEnd, axisStart).normalize();

                    // Create rotation matrix
                    const rotationMatrix = new THREE.Matrix4().makeRotationAxis(axisDirection, deltaRadians);

                    // Rotate all atoms in the fragment around the axis
                    cachedFragment.forEach(atomIdx => {
                        const atom = main.molecule.atoms[atomIdx];
                        const pos = atom.position.clone();

                        // Translate to axis origin (atom2/B position)
                        pos.sub(axisStart);

                        // Apply rotation
                        pos.applyMatrix4(rotationMatrix);

                        // Translate back
                        pos.add(axisStart);

                        // Update atom position
                        atom.position.copy(pos);
                        atom.x = atom.position.x;
                        atom.y = atom.position.y;
                        atom.z = atom.position.z;
                        updateAtomMatrix(atomIdx);
                    });

                    // Update base positions for next rotation
                    cachedFragment.forEach(idx => {
                        cachedBasePositions[idx] = main.molecule.atoms[idx].position.clone();
                    });

                    // Update everything
                    main.molecule.instancedMesh.instanceMatrix.needsUpdate = true;
                    main.molecule.updateBonds(main.mode);
                    if (main.molecule.labels && main.molecule.labels.length > 0) {
                        main.molecule.updateLabels();
                    }

                    justAppliedTransform = true;
                    updateAllBondLengthLabels();
                    main.molecule.updateMainCoordinates();
                    saveUndoState("Set Dihedral");
                    render();

                    input.blur();
                    return;
                }
                input.blur();
            } else if (e.key === 'Escape') {
                input.value = calculateDihedral(
                    main.molecule.atoms[atom1Index],
                    main.molecule.atoms[atom2Index],
                    main.molecule.atoms[atom3Index],
                    main.molecule.atoms[atom4Index]
                ) + '°';
                input.blur();
            }
        });

        input.addEventListener('focus', () => {
            input.style.textShadow = `
                -1px -1px 0 #000,
                1px -1px 0 #000,
                -1px 1px 0 #000,
                1px 1px 0 #000,
                0 0 8px ${color}`;
            input.select();
        });

        input.addEventListener('blur', () => {
            input.style.textShadow = `
                -1px -1px 0 #000,
                1px -1px 0 #000,
                -1px 1px 0 #000,
                1px 1px 0 #000,
                0 0 3px rgba(0,0,0,0.9)`;

            if (!justAppliedTransform) {
                input.value = calculateDihedral(
                    main.molecule.atoms[atom1Index],
                    main.molecule.atoms[atom2Index],
                    main.molecule.atoms[atom3Index],
                    main.molecule.atoms[atom4Index]
                ) + '°';
            }
            justAppliedTransform = false;
        });

        labelDiv.appendChild(input);
        labelDiv.style.pointerEvents = 'auto';
        input.style.setProperty('transition', 'none', 'important');
        labelDiv.style.setProperty('transition', 'none', 'important');

    } else if (isAngle) {
        // For angle (3 atoms): create an editable input
        const input = document.createElement('input');
        labelDiv.inputElement = input;
        input.type = 'text';
        input.value = value;
        input.style.cssText = `
            color: ${color};
            font-family: 'Segoe UI', system-ui, sans-serif;
            font-size: 14px;
            font-weight: 600;
            background: transparent;
            border: none;
            padding: 2px 4px;
            text-align: center;
            width: 70px;
            cursor: text;
            outline: none;
            text-shadow: 
                -1px -1px 0 #000,
                1px -1px 0 #000,
                -1px 1px 0 #000,
                1px 1px 0 #000,
                0 0 3px rgba(0,0,0,0.9);
            transition: none!important;
        `;

        let justAppliedTransform = false;

        // Pre-calculate fragment on atom1's side (excluding vertex atom2)
        let cachedFragment = null;

        const buildAdjacencyList = () => {
            const adj = new Map();
            for (let i = 0; i < main.molecule.atoms.length; i++) {
                adj.set(i, []);
            }
            main.molecule.bonds.forEach(bond => {
                const idx1 = main.molecule.atoms.indexOf(bond.atom1);
                const idx2 = main.molecule.atoms.indexOf(bond.atom2);
                if (idx1 !== -1 && idx2 !== -1) {
                    adj.get(idx1).push(idx2);
                    adj.get(idx2).push(idx1);
                }
            });
            return adj;
        };

        const findConnectedAtoms = (startIdx, excludeIdx, adj) => {
            const visited = new Set([startIdx]);
            const queue = [startIdx];
            while (queue.length > 0) {
                const current = queue.shift();
                const neighbors = adj.get(current) || [];
                for (const neighborIdx of neighbors) {
                    if (current === startIdx && neighborIdx === excludeIdx) continue;
                    if (!visited.has(neighborIdx)) {
                        visited.add(neighborIdx);
                        queue.push(neighborIdx);
                    }
                }
            }
            return Array.from(visited);
        };

        // Cache fragment: atoms connected to atom1 (A), excluding atom2 (B/vertex)
        const adj = buildAdjacencyList();
        cachedFragment = findConnectedAtoms(atom1Index, atom2Index, adj);

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const targetAngleStr = input.value.replace('°', '').trim();
                const targetAngle = parseFloat(targetAngleStr);

                console.log('=== ANGLE ADJUSTMENT DEBUG ===');
                console.log('Target angle string:', targetAngleStr);
                console.log('Target angle parsed:', targetAngle);
                console.log('Cached fragment:', cachedFragment);
                console.log('Fragment length:', cachedFragment ? cachedFragment.length : 0);

                if (!isNaN(targetAngle) && cachedFragment && cachedFragment.length > 0) {
                    const currentAngle = parseFloat(calculateAngle(
                        main.molecule.atoms[atom1Index],
                        main.molecule.atoms[atom2Index],
                        main.molecule.atoms[atom3Index]
                    ));

                    const deltaAngle = targetAngle - currentAngle;
                    const deltaRadians = deltaAngle * Math.PI / 180;

                    console.log('Current angle:', currentAngle);
                    console.log('Delta angle:', deltaAngle);
                    console.log('Delta radians:', deltaRadians);

                    const posA = main.molecule.atoms[atom1Index].position.clone();
                    const posB = main.molecule.atoms[atom2Index].position.clone();
                    const posC = main.molecule.atoms[atom3Index].position.clone();

                    console.log('Position A:', posA);
                    console.log('Position B (vertex):', posB);
                    console.log('Position C:', posC);

                    const vecBA = new THREE.Vector3().subVectors(posA, posB);
                    const vecBC = new THREE.Vector3().subVectors(posC, posB);
                    const rotationAxis = new THREE.Vector3().crossVectors(vecBA, vecBC).normalize();

                    console.log('Vector BA:', vecBA);
                    console.log('Vector BC:', vecBC);
                    console.log('Rotation axis:', rotationAxis);
                    console.log('Rotation axis length squared:', rotationAxis.lengthSq());

                    if (rotationAxis.lengthSq() < 0.0001) {
                        console.log('ABORT: rotation axis too small (collinear atoms)');
                        input.blur();
                        return;
                    }

                    // ... rest of the rotation code

                    // Create rotation matrix
                    const rotationMatrix = new THREE.Matrix4().makeRotationAxis(rotationAxis, -deltaRadians);

                    // Rotate all atoms in the fragment around vertex B
                    cachedFragment.forEach(atomIdx => {
                        const atom = main.molecule.atoms[atomIdx];
                        const pos = atom.position.clone();

                        // Translate to vertex origin
                        pos.sub(posB);

                        // Apply rotation
                        pos.applyMatrix4(rotationMatrix);

                        // Translate back
                        pos.add(posB);

                        // Update atom position
                        atom.position.copy(pos);
                        atom.x = atom.position.x;
                        atom.y = atom.position.y;
                        atom.z = atom.position.z;
                        updateAtomMatrix(atomIdx);
                    });

                    // Update everything
                    main.molecule.instancedMesh.instanceMatrix.needsUpdate = true;
                    main.molecule.updateBonds(main.mode);
                    if (main.molecule.labels && main.molecule.labels.length > 0) {
                        main.molecule.updateLabels();
                    }

                    justAppliedTransform = true;
                    updateAllBondLengthLabels();
                    main.molecule.updateMainCoordinates();
                    saveUndoState("Set Angle");
                    render();

                    input.value = calculateAngle(
                        main.molecule.atoms[atom1Index],
                        main.molecule.atoms[atom2Index],
                        main.molecule.atoms[atom3Index]
                    ) + '°';
                    input.blur();
                    return;
                }
                input.blur();
            } else if (e.key === 'Escape') {
                input.value = calculateAngle(
                    main.molecule.atoms[atom1Index],
                    main.molecule.atoms[atom2Index],
                    main.molecule.atoms[atom3Index]
                ) + '°';
                input.blur();
            }
        });

        input.addEventListener('focus', () => {
            input.style.textShadow = `
                -1px -1px 0 #000,
                1px -1px 0 #000,
                -1px 1px 0 #000,
                1px 1px 0 #000,
                0 0 8px ${color}`;
            input.select();
        });

        input.addEventListener('blur', () => {
            input.style.textShadow = `
                -1px -1px 0 #000,
                1px -1px 0 #000,
                -1px 1px 0 #000,
                1px 1px 0 #000,
                0 0 3px rgba(0,0,0,0.9)`;

            if (!justAppliedTransform) {
                input.value = calculateAngle(
                    main.molecule.atoms[atom1Index],
                    main.molecule.atoms[atom2Index],
                    main.molecule.atoms[atom3Index]
                ) + '°';
            }
            justAppliedTransform = false;
        });

        labelDiv.appendChild(input);
        labelDiv.style.pointerEvents = 'auto';
        input.style.setProperty('transition', 'none', 'important');
        labelDiv.style.setProperty('transition', 'none', 'important');
    }

    // CREATE VISUALIZATION
    let visualElement;

    if (isDihedral) {
        // For dihedral: create two semi-transparent triangular planes
        const planeGroup = new THREE.Group();

        // First plane (A-B-C)
        const geometry1 = new THREE.BufferGeometry();
        const vertices1 = new Float32Array([
            atom1WorldPos.x, atom1WorldPos.y, atom1WorldPos.z,
            atom2WorldPos.x, atom2WorldPos.y, atom2WorldPos.z,
            atom3WorldPos.x, atom3WorldPos.y, atom3WorldPos.z
        ]);

        const colors1 = new Float32Array([
            1.0, 0.55, 0.0,  // Orange
            1.0, 0.55, 0.0,
            1.0, 1.0, 1.0    // Fade to white
        ]);

        const indices1 = new Uint16Array([0, 1, 2]);

        geometry1.setAttribute('position', new THREE.BufferAttribute(vertices1, 3));
        geometry1.setAttribute('color', new THREE.BufferAttribute(colors1, 3));
        geometry1.setIndex(new THREE.BufferAttribute(indices1, 1));
        geometry1.computeVertexNormals();

        const material1 = new THREE.MeshBasicMaterial({
            vertexColors: true,
            opacity: 0.3,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            depthTest: true
        });

        const plane1 = new THREE.Mesh(geometry1, material1);
        planeGroup.add(plane1);

        // Second plane (B-C-D)
        const geometry2 = new THREE.BufferGeometry();
        const vertices2 = new Float32Array([
            atom2WorldPos.x, atom2WorldPos.y, atom2WorldPos.z,
            atom3WorldPos.x, atom3WorldPos.y, atom3WorldPos.z,
            atom4WorldPos.x, atom4WorldPos.y, atom4WorldPos.z
        ]);

        const colors2 = new Float32Array([
            1.0, 0.55, 0.0,  // Orange
            1.0, 0.55, 0.0,
            1.0, 1.0, 1.0    // Fade to white
        ]);

        const indices2 = new Uint16Array([0, 1, 2]);

        geometry2.setAttribute('position', new THREE.BufferAttribute(vertices2, 3));
        geometry2.setAttribute('color', new THREE.BufferAttribute(colors2, 3));
        geometry2.setIndex(new THREE.BufferAttribute(indices2, 1));
        geometry2.computeVertexNormals();

        const material2 = new THREE.MeshBasicMaterial({
            vertexColors: true,
            opacity: 0.3,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            depthTest: true
        });

        const plane2 = new THREE.Mesh(geometry2, material2);
        planeGroup.add(plane2);

        // Add edge lines for the central bond (B-C)
        const centralBondGeometry = new THREE.BufferGeometry();
        const centralBondVertices = new Float32Array([
            atom2WorldPos.x, atom2WorldPos.y, atom2WorldPos.z,
            atom3WorldPos.x, atom3WorldPos.y, atom3WorldPos.z
        ]);
        centralBondGeometry.setAttribute('position', new THREE.BufferAttribute(centralBondVertices, 3));

        const centralBondMaterial = new THREE.LineBasicMaterial({
            color: 0xff8c00,  // Orange
            linewidth: 3,
            opacity: 0.8,
            transparent: true
        });

        const centralBondLine = new THREE.Line(centralBondGeometry, centralBondMaterial);
        planeGroup.add(centralBondLine);

        visualElement = planeGroup;

    } else if (isAngle) {
        // Existing angle visualization code
        const geometry = new THREE.BufferGeometry();
        const vertices = new Float32Array([
            atom1WorldPos.x, atom1WorldPos.y, atom1WorldPos.z,
            atom2WorldPos.x, atom2WorldPos.y, atom2WorldPos.z,
            atom3WorldPos.x, atom3WorldPos.y, atom3WorldPos.z
        ]);

        const colors = new Float32Array([
            1.0, 1.0, 1.0,
            0.0353, 1.0, 0.0,
            1.0, 1.0, 1.0,
        ]);

        const indices = new Uint16Array([0, 1, 2]);

        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        geometry.computeVertexNormals();

        const material = new THREE.MeshBasicMaterial({
            vertexColors: true,
            opacity: 0.5,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            depthTest: true
        });

        visualElement = new THREE.Mesh(geometry, material);

        const edgeGeometry = new THREE.EdgesGeometry(geometry);
        const edgeMaterial = new THREE.LineBasicMaterial({
            color: 0x00ff00,
            opacity: 0,
            transparent: true,
            linewidth: 2
        });
        const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
        visualElement.add(edges);

    } else {
        // Existing bond length visualization code
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(6);

        positions[0] = atom1WorldPos.x;
        positions[1] = atom1WorldPos.y;
        positions[2] = atom1WorldPos.z;
        positions[3] = atom2WorldPos.x;
        positions[4] = atom2WorldPos.y;
        positions[5] = atom2WorldPos.z;

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const material = new THREE.LineDashedMaterial({
            color: 0x52a3fa,
            linewidth: 2,
            scale: 1,
            dashSize: 0.2,
            gapSize: 0.2,
            opacity: 0.8,
            transparent: true,
            depthTest: true,
            depthWrite: false
        });

        visualElement = new THREE.Line(geometry, material);
        visualElement.computeLineDistances();
    }

    // Add the visual element to the scene
    scene.add(visualElement);

    // Store the label info
    const labelInfo = {
        element: labelDiv,
        atom1Index: atom1Index,
        atom2Index: atom2Index,
        atom3Index: atom3Index,
        atom4Index: atom4Index,
        midpoint: labelPosition,
        line: visualElement,
        isAngle: isAngle,
        isDihedral: isDihedral
    };

    bondLengthLabels.push(labelInfo);

    // Update label position on screen
    updateBondLengthLabel(labelInfo);

    // Add to DOM
    document.body.appendChild(labelDiv);
    render();
}

function showAllBondLengths() {
    if (!main.molecule || !main.molecule.bonds || main.molecule.bonds.length === 0) return;

    // Toggle: if labels exist, clear them; otherwise show all
    if (bondLengthLabels.length > 0) {
        clearAllBondLengthLabels();
    } else {
        main.molecule.bonds.forEach(bond => {
            const atom1Index = main.molecule.atoms.indexOf(bond.atom1);
            const atom2Index = main.molecule.atoms.indexOf(bond.atom2);
            if (atom1Index !== -1 && atom2Index !== -1) {
                createInfoLabel(atom1Index, atom2Index);
            }
        });
    }
    render();
}

document.getElementById('showAllBondLengths')?.addEventListener('click', showAllBondLengths);


function performRotationFromBase(targetAngle, atomIndices) {
    if (!rotationAxis || !rotationAxis.direction) return;

    const angleRadians = targetAngle * Math.PI / 180;
    const axis = rotationAxis.direction.clone().normalize();
    const point = rotationAxis.point.clone();
    const rotationMatrix = new THREE.Matrix4().makeRotationAxis(axis, angleRadians);

    atomIndices.forEach(idx => {
        const atom = main.molecule.atoms[idx];
        const basePos = baseAtomPositions[idx];

        if (basePos) {
            // Start from base position
            const tempPos = basePos.clone();

            // Translate to rotation point
            tempPos.sub(point);

            // Apply rotation
            tempPos.applyMatrix4(rotationMatrix);

            // Translate back
            tempPos.add(point);

            // Update atom position
            atom.position.copy(tempPos);
            atom.x = atom.position.x;
            atom.y = atom.position.y;
            atom.z = atom.position.z;

            // Update visual representation
            updateAtomMatrix(idx);
        }
    });

    // Update the molecule
    main.molecule.instancedMesh.instanceMatrix.needsUpdate = true;
    mode = main.mode
    main.molecule.updateBonds(main.mode);
    if (main.molecule.labels && main.molecule.labels.length > 0) {
        main.molecule.updateLabels();
    }
}

// Translation function

// Enhanced keyup handler
window.addEventListener('keyup', function (e) {
    if (e.key === 'Shift') {
        shiftDown = false;
        controls.enabled = true;

        if (Object.keys(rotationBasePositions).length > 0) {
            main.molecule.updateMainCoordinates();
            saveUndoState("Fine-tune Transformation");
        }
    }
});



// Reset camera function
function resetCamera() {
    // Reset camera position
    camera.position.copy(initialCameraPosition);

    // Reset camera rotation by looking at origin
    camera.lookAt(initialCameraTarget);
    camera.up.set(0, 1, 0);

    // Reset controls target and update
    if (controls) {
        controls.target.copy(initialCameraTarget);
        controls.reset();
        controls.update();
    }

    // Trigger a render
    if (typeof render !== 'undefined') {
        render();
    }
    main.zoomCameraToFitMolecule();
    render();
}
window.resetCamera = resetCamera

// Function to update bond length label position
function updateBondLengthLabel(labelInfo) {
    if (!main.molecule || !main.molecule.atoms || !main.molecule.instancedMesh) return;
    const atom1 = main.molecule.atoms[labelInfo.atom1Index];
    const atom2 = main.molecule.atoms[labelInfo.atom2Index];
    const atom3 = labelInfo.atom3Index !== null ? main.molecule.atoms[labelInfo.atom3Index] : null;
    const atom4 = labelInfo.atom4Index !== null ? main.molecule.atoms[labelInfo.atom4Index] : null;

    if (!atom1 || !atom2) return;

    // Get actual world positions from the instanced mesh
    const atom1WorldPos = getAtomWorldPosition(labelInfo.atom1Index, main.molecule.instancedMesh);
    const atom2WorldPos = getAtomWorldPosition(labelInfo.atom2Index, main.molecule.instancedMesh);
    const atom3WorldPos = atom3 ? getAtomWorldPosition(labelInfo.atom3Index, main.molecule.instancedMesh) : null;
    const atom4WorldPos = atom4 ? getAtomWorldPosition(labelInfo.atom4Index, main.molecule.instancedMesh) : null;

    // Recalculate position based on type
    if (labelInfo.isDihedral) {
        // For dihedral: midpoint of central bond
        labelInfo.midpoint.addVectors(atom2WorldPos, atom3WorldPos).multiplyScalar(0.5);
    } else if (labelInfo.isAngle) {
        // For angle: position closer to vertex atom
        const centroid = new THREE.Vector3()
            .add(atom1WorldPos)
            .add(atom2WorldPos)
            .add(atom3WorldPos)
            .divideScalar(3);
        labelInfo.midpoint.lerpVectors(atom2WorldPos, centroid, 0.3);
    } else {
        // For bond length: midpoint between two atoms
        labelInfo.midpoint.addVectors(atom1WorldPos, atom2WorldPos).multiplyScalar(0.5);
    }

    // Convert 3D position to 2D screen position
    const screenPos = worldToScreen(labelInfo.midpoint, getActiveCamera());

    // Update label position
    labelInfo.element.style.position = 'absolute';
    labelInfo.element.style.left = `${screenPos.x}px`;
    labelInfo.element.style.top = `${screenPos.y}px`;
    labelInfo.element.style.transform = 'translate(-50%, -50%)';

    // Update value if atoms have moved
    if (labelInfo.isDihedral) {
        const newDihedral = calculateDihedral(atom1, atom2, atom3, atom4);
        if (labelInfo.element.inputElement && document.activeElement !== labelInfo.element.inputElement) {
            labelInfo.element.inputElement.value = `${newDihedral}°`;
        } else if (!labelInfo.element.inputElement) {
            labelInfo.element.textContent = `${newDihedral}°`;
        }
    } else if (labelInfo.isAngle) {
        const newAngle = calculateAngle(atom1, atom2, atom3);
        if (labelInfo.element.inputElement && document.activeElement !== labelInfo.element.inputElement) {
            labelInfo.element.inputElement.value = `${newAngle}°`;
        } else if (!labelInfo.element.inputElement) {
            labelInfo.element.textContent = `${newAngle}°`;
        }
    } else {
        const newDistance = calculateBondLength(atom1, atom2);
        // Update input value if it exists and is not focused
        if (labelInfo.element.inputElement && document.activeElement !== labelInfo.element.inputElement) {
            labelInfo.element.inputElement.value = newDistance;
        } else if (!labelInfo.element.inputElement) {
            labelInfo.element.textContent = newDistance;
        }
    }

    // UPDATE THE VISUALIZATION GEOMETRY
    if (labelInfo.line) {
        if (labelInfo.isDihedral) {
            // Update both planes for dihedral
            const planeGroup = labelInfo.line;

            // Update first plane (A-B-C)
            const plane1 = planeGroup.children[0];
            const vertices1 = plane1.geometry.attributes.position.array;
            vertices1[0] = atom1WorldPos.x;
            vertices1[1] = atom1WorldPos.y;
            vertices1[2] = atom1WorldPos.z;
            vertices1[3] = atom2WorldPos.x;
            vertices1[4] = atom2WorldPos.y;
            vertices1[5] = atom2WorldPos.z;
            vertices1[6] = atom3WorldPos.x;
            vertices1[7] = atom3WorldPos.y;
            vertices1[8] = atom3WorldPos.z;
            plane1.geometry.attributes.position.needsUpdate = true;
            plane1.geometry.computeVertexNormals();

            // Update second plane (B-C-D)
            const plane2 = planeGroup.children[1];
            const vertices2 = plane2.geometry.attributes.position.array;
            vertices2[0] = atom2WorldPos.x;
            vertices2[1] = atom2WorldPos.y;
            vertices2[2] = atom2WorldPos.z;
            vertices2[3] = atom3WorldPos.x;
            vertices2[4] = atom3WorldPos.y;
            vertices2[5] = atom3WorldPos.z;
            vertices2[6] = atom4WorldPos.x;
            vertices2[7] = atom4WorldPos.y;
            vertices2[8] = atom4WorldPos.z;
            plane2.geometry.attributes.position.needsUpdate = true;
            plane2.geometry.computeVertexNormals();

            // Update central bond line
            const centralBond = planeGroup.children[2];
            const centralVertices = centralBond.geometry.attributes.position.array;
            centralVertices[0] = atom2WorldPos.x;
            centralVertices[1] = atom2WorldPos.y;
            centralVertices[2] = atom2WorldPos.z;
            centralVertices[3] = atom3WorldPos.x;
            centralVertices[4] = atom3WorldPos.y;
            centralVertices[5] = atom3WorldPos.z;
            centralBond.geometry.attributes.position.needsUpdate = true;

        } else if (labelInfo.isAngle) {
            // Update plane geometry for angle
            const geometry = labelInfo.line.geometry;
            const vertices = geometry.attributes.position.array;

            vertices[0] = atom1WorldPos.x;
            vertices[1] = atom1WorldPos.y;
            vertices[2] = atom1WorldPos.z;
            vertices[3] = atom2WorldPos.x;
            vertices[4] = atom2WorldPos.y;
            vertices[5] = atom2WorldPos.z;
            vertices[6] = atom3WorldPos.x;
            vertices[7] = atom3WorldPos.y;
            vertices[8] = atom3WorldPos.z;

            geometry.attributes.position.needsUpdate = true;
            geometry.computeVertexNormals();

            // Update the edge lines if they exist
            if (labelInfo.line.children[0]) {
                const edgeGeometry = labelInfo.line.children[0].geometry;
                edgeGeometry.dispose();
                labelInfo.line.children[0].geometry = new THREE.EdgesGeometry(geometry);
            }
        } else {
            // Update bond line
            const positions = labelInfo.line.geometry.attributes.position.array;
            positions[0] = atom1WorldPos.x;
            positions[1] = atom1WorldPos.y;
            positions[2] = atom1WorldPos.z;
            positions[3] = atom2WorldPos.x;
            positions[4] = atom2WorldPos.y;
            positions[5] = atom2WorldPos.z;

            labelInfo.line.geometry.attributes.position.needsUpdate = true;
            labelInfo.line.computeLineDistances();
        }
    }
}

function updateAllBondLengthLabels() {
    bondLengthLabels.forEach(labelInfo => {
        updateBondLengthLabel(labelInfo);
    });
}

function removeBondLengthLabel(index) {
    if (bondLengthLabels[index]) {
        // Remove the label from DOM safely
        if (bondLengthLabels[index].element && bondLengthLabels[index].element.parentNode) {
            bondLengthLabels[index].element.parentNode.removeChild(bondLengthLabels[index].element);
        }

        // Remove the dotted line from the scene
        if (bondLengthLabels[index].line) {
            scene.remove(bondLengthLabels[index].line);
            // Dispose of geometry and material to free memory
            bondLengthLabels[index].line.geometry.dispose();
            bondLengthLabels[index].line.material.dispose();
        }

        bondLengthLabels.splice(index, 1);
    }
}

window.bondLengthLabels = bondLengthLabels;
window.removeBondLengthLabel = removeBondLengthLabel;

function clearAllBondLengthLabels() {
    bondLengthLabels.forEach(labelInfo => {
        // Remove label from DOM safely
        if (labelInfo.element && labelInfo.element.parentNode) {
            labelInfo.element.parentNode.removeChild(labelInfo.element);
        }

        // Remove line/group from scene
        if (labelInfo.line) {
            scene.remove(labelInfo.line);
            // Handle both simple lines and groups (for dihedrals)
            if (labelInfo.line.geometry) {
                labelInfo.line.geometry.dispose();
            }
            if (labelInfo.line.material) {
                labelInfo.line.material.dispose();
            }
            // For groups (dihedrals), dispose children
            if (labelInfo.line.children) {
                labelInfo.line.children.forEach(child => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) child.material.dispose();
                });
            }
        }
    });
    bondLengthLabels = [];
}



// Create context menu
function createContextMenu(x, y, atom1Index, atom2Index) {
    // Remove any existing context menu
    removeContextMenu();

    const menu = document.createElement('div');
    menu.id = 'atom-context-menu';
    menu.style.cssText = `
        position: absolute;
        left: ${x}px;
        top: ${y}px;
        background: rgba(30, 30, 30, 0.95);
        border: 1px solid #444;
        border-radius: 4px;
        padding: 4px 0;
        box-shadow: 2px 2px 10px rgba(0,0,0,0.5);
        z-index: 10000;
        min-width: 150px;
    `;

    // Check if label already exists for this pair
    const existingLabel = bondLengthLabels.findIndex(label =>
        (label.atom1Index === atom1Index && label.atom2Index === atom2Index) ||
        (label.atom1Index === atom2Index && label.atom2Index === atom1Index)
    );

    if (existingLabel === -1) {
        // Add "Show Bond Length" option
        const showLengthOption = document.createElement('div');
        showLengthOption.textContent = 'Show Bond Length';
        showLengthOption.style.cssText = `
            padding: 8px 16px;
            cursor: pointer;
            color: white;
            font-size: 14px;
            transition: background-color 0.2s;
        `;
        showLengthOption.onmouseover = () => {
            showLengthOption.style.backgroundColor = 'rgba(0, 132, 255, 0.3)';
        };
        showLengthOption.onmouseout = () => {
            showLengthOption.style.backgroundColor = 'transparent';
        };
        showLengthOption.onclick = () => {
            createInfoLabel(atom1Index, atom2Index);
            removeContextMenu();
        };
        menu.appendChild(showLengthOption);
    } else {
        // Add "Hide Bond Length" option
        const hideLengthOption = document.createElement('div');
        hideLengthOption.textContent = 'Hide Bond Length';
        hideLengthOption.style.cssText = `
            padding: 8px 16px;
            cursor: pointer;
            color: white;
            font-size: 14px;
            transition: background-color 0.2s;
        `;
        hideLengthOption.onmouseover = () => {
            hideLengthOption.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
        };
        hideLengthOption.onmouseout = () => {
            hideLengthOption.style.backgroundColor = 'transparent';
        };
        hideLengthOption.onclick = () => {
            removeBondLengthLabel(existingLabel);
            removeContextMenu();
        };
        menu.appendChild(hideLengthOption);
    }

    // Add separator
    const separator = document.createElement('hr');
    separator.style.cssText = `
        margin: 4px 0;
        border: none;
        border-top: 1px solid #444;
    `;
    menu.appendChild(separator);

    // Add "Clear All Labels" option
    const clearAllOption = document.createElement('div');
    clearAllOption.textContent = 'Clear All Labels';
    clearAllOption.style.cssText = `
        padding: 8px 16px;
        cursor: pointer;
        color: white;
        font-size: 14px;
        transition: background-color 0.2s;
    `;
    clearAllOption.onmouseover = () => {
        clearAllOption.style.backgroundColor = 'rgba(255, 132, 0, 0.3)';
    };
    clearAllOption.onmouseout = () => {
        clearAllOption.style.backgroundColor = 'transparent';
    };
    clearAllOption.onclick = () => {
        clearAllBondLengthLabels();
        removeContextMenu();
    };
    menu.appendChild(clearAllOption);

    document.body.appendChild(menu);
    contextMenuOpen = true;
}

// Remove context menu
function removeContextMenu() {
    const menu = document.getElementById('atom-context-menu');
    if (menu) {
        document.body.removeChild(menu);
    }
    contextMenuOpen = false;
}

function enhancedOnPointerDown(event) {
    // Call your existing onPointerDown logic first for left clicks
    if (event.button === 0) {
        // Your existing left-click code here
        onPointerDown(event);
    }

    // Handle right-click or two-finger tap
    if (event.button === 2) { // Right-click
        event.preventDefault();

        // Check if exactly 2 atoms are selected
        if (atomsSelected.length === 2) {
            const rect = renderer.domElement.getBoundingClientRect();
            const menuX = event.clientX;
            const menuY = event.clientY;

            createContextMenu(menuX, menuY, atomsSelected[0], atomsSelected[1]);
        }
    }
}

// Replace the existing event listener — remove both old handlers before re-adding
window.removeEventListener('pointerdown', onPointerDown, false);
window.removeEventListener('pointerdown', enhancedOnPointerDown, false);
window.addEventListener('pointerdown', enhancedOnPointerDown, false);

// Prevent default context menu
renderer.domElement.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    return false;
});

// Close context menu when clicking elsewhere
document.addEventListener('click', (event) => {
    if (contextMenuOpen && !event.target.closest('#atom-context-menu')) {
        removeContextMenu();
    }
});

function onAtomsMoved() {
    updateAllBondLengthLabels();
}

function onMoleculeReset() {
    clearAllBondLengthLabels();
}

document.addEventListener('keydown', (event) => {
    // Press 'B' to show/hide measurements
    if (event.key === 'b' || event.key === 'B') {
        if (atomsSelected.length === 2) {
            // Bond length functionality for 2 atoms
            const existingLabel = bondLengthLabels.findIndex(label =>
                !label.isAngle && !label.isDihedral &&
                ((label.atom1Index === atomsSelected[0] && label.atom2Index === atomsSelected[1]) ||
                    (label.atom1Index === atomsSelected[1] && label.atom2Index === atomsSelected[0]))
            );

            if (existingLabel === -1) {
                // Create label
                labels.push([atomsSelected[0], atomsSelected[1]]);
                console.log(labels);
                createInfoLabel(atomsSelected[0], atomsSelected[1]);

                // Also create axis automatically
                const atom1 = main.molecule.atoms[atomsSelected[0]];
                const atom2 = main.molecule.atoms[atomsSelected[1]];

                const pos1 = atom1.position.clone();
                const pos2 = atom2.position.clone();

                rotationAxis = {
                    point: pos1.clone(),
                    direction: new THREE.Vector3().subVectors(pos2, pos1).normalize()
                };

                axisAtoms = [...atomsSelected];
                createAxisVisualizer(atom1, atom2);

                // Update UI to show axis controls
                const element = main.molecule.atoms[atomsSelected[0]].type;
                updateEditingContent(element, main.molecule.atomSettings[element].color);

                console.log('Created bond length label and axis');
            } else {
                // Remove both label and axis
                removeBondLengthLabel(existingLabel);

                // Remove axis
                rotationAxis = null;
                axisAtoms = [];
                if (axisVisualizer) {
                    main.scene.remove(axisVisualizer);
                    axisVisualizer.geometry.dispose();
                    axisVisualizer.material.dispose();
                    axisVisualizer = null;
                }

                // Update UI
                if (atomsSelected.length > 0) {
                    const element = main.molecule.atoms[atomsSelected[0]].type;
                    updateEditingContent(element, main.molecule.atomSettings[element].color);
                }

                console.log('Removed bond length label and axis');
            }
        } else if (atomsSelected.length === 3) {
            // Angle functionality for 3 atoms
            const existingLabel = bondLengthLabels.findIndex(label =>
                label.isAngle &&
                label.atom1Index === atomsSelected[0] &&
                label.atom2Index === atomsSelected[1] &&
                label.atom3Index === atomsSelected[2]
            );

            if (existingLabel === -1) {
                labels.push([atomsSelected[0], atomsSelected[1], atomsSelected[2]]);
                console.log(labels);
                createInfoLabel(atomsSelected[0], atomsSelected[1], atomsSelected[2]);
            } else {
                removeBondLengthLabel(existingLabel);
            }
        } else if (atomsSelected.length === 4) {
            // Dihedral angle functionality for 4 atoms
            const existingLabel = bondLengthLabels.findIndex(label =>
                label.isDihedral &&
                label.atom1Index === atomsSelected[0] &&
                label.atom2Index === atomsSelected[1] &&
                label.atom3Index === atomsSelected[2] &&
                label.atom4Index === atomsSelected[3]
            );

            if (existingLabel === -1) {
                labels.push([atomsSelected[0], atomsSelected[1], atomsSelected[2], atomsSelected[3]]);
                console.log('Creating dihedral measurement for atoms:', atomsSelected);
                createInfoLabel(atomsSelected[0], atomsSelected[1], atomsSelected[2], atomsSelected[3]);
            } else {
                removeBondLengthLabel(existingLabel);
            }
        }
    }

    // Press 'L' to clear all labels
    if (event.key === 'l' || event.key === 'L') {
        if (event.shiftKey) {
            clearAllBondLengthLabels();

            // Also remove axis
            rotationAxis = null;
            axisAtoms = [];
            if (axisVisualizer) {
                main.scene.remove(axisVisualizer);
                axisVisualizer.geometry.dispose();
                axisVisualizer.material.dispose();
                axisVisualizer = null;
            }
        }
    }
    if (event.key == ' ') {
        if (atomsSelected.length === 2) {
            const atom1 = main.molecule.atoms[atomsSelected[0]];
            const atom2 = main.molecule.atoms[atomsSelected[1]];

            const pos1 = atom1.position.clone();
            const pos2 = atom2.position.clone();

            rotationAxis = {
                point: pos1.clone(),
                direction: new THREE.Vector3().subVectors(pos2, pos1).normalize()
            };

            axisAtoms = [...atomsSelected];
            createAxisVisualizer(atom1, atom2);

            // Also create label if it doesn't exist
            const existingLabel = bondLengthLabels.findIndex(label =>
                !label.isAngle && !label.isDihedral &&
                ((label.atom1Index === atomsSelected[0] && label.atom2Index === atomsSelected[1]) ||
                    (label.atom1Index === atomsSelected[1] && label.atom2Index === atomsSelected[0]))
            );

            if (existingLabel === -1) {
                labels.push([atomsSelected[0], atomsSelected[1]]);
                createInfoLabel(atomsSelected[0], atomsSelected[1]);
            }

            updateEditingContent(atom1.type, main.molecule.atomSettings[atom1.type].color);
            console.log('Axis and label defined');
        }
    }
});

function createRenderer(antialiasOn) {
    if (renderer) {
        // Remove old canvas
        renderer.domElement.remove();
        renderer.dispose();
    }

    renderer = new THREE.WebGLRenderer({ antialias: antialiasOn, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    document.body.appendChild(renderer.domElement);
    return renderer
}

function createOrthoCamera() {
    const aspect = window.innerWidth / window.innerHeight;
    const frustumSize = 30;
    orthoCamera = new THREE.OrthographicCamera(
        -frustumSize * aspect / 2,
        frustumSize * aspect / 2,
        frustumSize / 2,
        -frustumSize / 2,
        0.1,
        1000000
    );
    orthoCamera.position.copy(camera.position);
    orthoCamera.lookAt(controls.target);
}

toggleOrthoCamera.addEventListener('change', () => {
    useOrthographic = toggleOrthoCamera.checked;

    if (useOrthographic) {
        if (!orthoCamera) createOrthoCamera();
        orthoCamera.position.copy(camera.position);
        orthoCamera.lookAt(controls.target);
        controls.object = orthoCamera;
    } else {
        camera.position.copy(orthoCamera.position);
        camera.lookAt(controls.target);
        controls.object = camera;
    }
    controls.update();
    render();
});

// --- Silly Mode: smooth micro-interactions ---
// Active animations: Map<key, {type, startTime, ...}>
const sillyAnimations = new Map();
const sillyAlreadySelected = new Set(); // tracks atoms that already played select animation

function sillyStartSelectColor(atomIndex, bondHalves) {
    const mol = main.molecule;
    if (!mol || !mol.instancedMesh || atomIndex >= mol.instancedMesh.count) return;

    // Capture the atom's current color as the start
    const colorAttr = mol.instancedMesh.geometry.getAttribute('color');
    const fromColor = new THREE.Color(colorAttr.getX(atomIndex), colorAttr.getY(atomIndex), colorAttr.getZ(atomIndex));

    const bondMesh = mol.bondGroup?.children[0];
    const isStyled = bondMesh && bondMesh.isInstancedMesh;

    // For styled bonds, create yellow overlay cylinders that grow from atom end
    const bondOverlays = [];
    if (bondHalves.length > 0 && isStyled) {
        const bondRadius = bondMesh.geometry.parameters?.radiusTop || 0.1;
        const radialSegs = bondMesh.geometry.parameters?.radialSegments || 8;
        // Slightly larger radius to render on top without z-fighting
        const overlayGeo = new THREE.CylinderGeometry(bondRadius * 1.03, bondRadius * 1.03, 1, radialSegs);
        const overlayMat = bondMesh.material.clone();
        overlayMat.vertexColors = false;
        overlayMat.color.set(0xffff00);
        overlayMat.transparent = true;
        overlayMat.opacity = 0;

        const m = new THREE.Matrix4();
        const p = new THREE.Vector3();
        const q = new THREE.Quaternion();
        const s = new THREE.Vector3();

        for (let bi = 0; bi < bondHalves.length; bi++) {
            const halfIdx = bondHalves[bi];
            bondMesh.getMatrixAt(halfIdx, m);
            m.decompose(p, q, s);

            const yAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(q).normalize();
            const halfLen = s.y;

            // atom1 half (even): atom at bottom (-Y end), grow upward (+Y)
            // atom2 half (odd):  atom at top (+Y end), grow downward (-Y)
            const isAtom1Half = halfIdx % 2 === 0;
            const atomEnd = p.clone().addScaledVector(yAxis, isAtom1Half ? -halfLen * 0.5 : halfLen * 0.5);
            const growDir = isAtom1Half ? 1 : -1;

            const overlay = new THREE.Mesh(overlayGeo, overlayMat);
            overlay.quaternion.copy(q);
            overlay.scale.set(s.x, 0.001, s.z);
            overlay.position.copy(atomEnd);

            mol.bondGroup.add(overlay);

            bondOverlays.push({
                mesh: overlay,
                atomEnd: atomEnd.clone(),
                yAxis: yAxis.clone(),
                growDir,
                halfLen,
                xScale: s.x,
                zScale: s.z,
            });
        }
    }

    sillyAnimations.set('selcolor_' + atomIndex, {
        type: 'select_color',
        atomIndex,
        bondHalves,
        fromColor,
        bondOverlays,
        isStyled,
        startTime: performance.now(),
        duration: 150,
    });
}

function sillyCreateUnselectOverlays(mol, atomIndex) {
    const bondHalves = [];
    if (mol.bonds && mol.bondGroup?.children[0]) {
        const atom = mol.atoms[atomIndex];
        mol.bonds.forEach((bond, bondIdx) => {
            if (bond.atom1 === atom) bondHalves.push(bondIdx * 2);
            else if (bond.atom2 === atom) bondHalves.push(bondIdx * 2 + 1);
        });
    }

    const bondMesh = mol.bondGroup?.children[0];
    const isStyled = bondMesh && bondMesh.isInstancedMesh;
    const bondOverlays = [];

    if (bondHalves.length > 0 && isStyled) {
        const bondRadius = bondMesh.geometry.parameters?.radiusTop || 0.1;
        const radialSegs = bondMesh.geometry.parameters?.radialSegments || 8;
        const overlayGeo = new THREE.CylinderGeometry(bondRadius * 1.03, bondRadius * 1.03, 1, radialSegs);
        const overlayMat = bondMesh.material.clone();
        overlayMat.vertexColors = false;
        overlayMat.color.set(0xffff00);
        overlayMat.transparent = true;
        overlayMat.opacity = 1;

        const m = new THREE.Matrix4();
        const p = new THREE.Vector3();
        const q = new THREE.Quaternion();
        const s = new THREE.Vector3();

        for (let bi = 0; bi < bondHalves.length; bi++) {
            const halfIdx = bondHalves[bi];
            bondMesh.getMatrixAt(halfIdx, m);
            m.decompose(p, q, s);

            const yAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(q).normalize();
            const halfLen = s.y;
            const isAtom1Half = halfIdx % 2 === 0;
            const atomEnd = p.clone().addScaledVector(yAxis, isAtom1Half ? -halfLen * 0.5 : halfLen * 0.5);
            const growDir = isAtom1Half ? 1 : -1;

            const overlay = new THREE.Mesh(overlayGeo, overlayMat);
            overlay.quaternion.copy(q);
            overlay.scale.set(s.x, halfLen, s.z);
            overlay.position.copy(atomEnd).addScaledVector(yAxis, growDir * halfLen * 0.5);

            mol.bondGroup.add(overlay);

            bondOverlays.push({
                mesh: overlay,
                atomEnd: atomEnd.clone(),
                yAxis: yAxis.clone(),
                growDir,
                halfLen,
                xScale: s.x,
                zScale: s.z,
            });
        }

        // Set bond colors to target immediately (overlay covers them during animation)
        const bondColorAttr = bondMesh.geometry.getAttribute('color');
        if (bondColorAttr) {
            for (const halfIdx of bondHalves) {
                const bondIdx = Math.floor(halfIdx / 2);
                const bond = mol.bonds[bondIdx];
                const atomIdx = (halfIdx % 2 === 0)
                    ? mol.atoms.indexOf(bond.atom1)
                    : mol.atoms.indexOf(bond.atom2);
                const c = atomIdx >= 0 ? getDisplayColorForAtom(atomIdx) : new THREE.Color(0xffffff);
                bondColorAttr.setXYZ(halfIdx, c.r, c.g, c.b);
            }
            bondColorAttr.needsUpdate = true;
        }
    }

    return bondOverlays;
}

function sillyStartUnselectColor(atomIndex, delay) {
    const mol = main.molecule;
    if (!mol || !mol.instancedMesh || atomIndex >= mol.instancedMesh.count) return;

    const targetColor = getDisplayColorForAtom(atomIndex);

    // If no delay, create overlays now. Otherwise defer to update loop.
    const bondOverlays = delay ? [] : sillyCreateUnselectOverlays(mol, atomIndex);

    sillyAnimations.set('unselcolor_' + atomIndex, {
        type: 'unselect_color',
        atomIndex,
        targetColor,
        bondOverlays,
        overlaysCreated: !delay,
        delay: delay || 0,
        startTime: performance.now(),
        duration: 150,
    });
}

function sillyCascadeUnselect(selectedIndices) {
    const mol = main.molecule;
    if (!mol || !mol.bonds) return;

    // Build adjacency list (only between selected atoms)
    const selectedSet = new Set(selectedIndices);
    const adj = new Map();
    for (const idx of selectedIndices) adj.set(idx, []);

    mol.bonds.forEach(bond => {
        const i1 = mol.atoms.indexOf(bond.atom1);
        const i2 = mol.atoms.indexOf(bond.atom2);
        if (selectedSet.has(i1) && selectedSet.has(i2)) {
            adj.get(i1).push(i2);
            adj.get(i2).push(i1);
        }
    });

    // BFS from lowest index, then next unvisited, etc.
    const visited = new Set();
    const depthMap = new Map();
    const sorted = [...selectedIndices].sort((a, b) => a - b);

    for (const startIdx of sorted) {
        if (visited.has(startIdx)) continue;
        const queue = [startIdx];
        visited.add(startIdx);
        depthMap.set(startIdx, depthMap.size === 0 ? 0 : Math.max(...depthMap.values()) + 1);

        while (queue.length > 0) {
            const current = queue.shift();
            const currentDepth = depthMap.get(current);
            for (const neighbor of (adj.get(current) || [])) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    depthMap.set(neighbor, currentDepth + 1);
                    queue.push(neighbor);
                }
            }
        }
    }

    // Schedule staggered unselect animations
    const delayPerLevel = 60; // ms between each wave
    for (const [atomIdx, depth] of depthMap) {
        sillyStartUnselectColor(atomIdx, depth * delayPerLevel);
    }

    sillyAlreadySelected.clear();
}

function sillyStartHoverIn(atomIndex) {
    // Cancel any existing hover-out for this atom
    sillyAnimations.delete('hover_' + atomIndex);
    sillyAnimations.set('hover_' + atomIndex, {
        type: 'hover_in',
        atomIndex,
        startTime: performance.now(),
        duration: 100,
    });
}

function sillyStartHoverOut(atomIndex) {
    sillyAnimations.delete('hover_' + atomIndex);
    sillyAnimations.set('hover_' + atomIndex, {
        type: 'hover_out',
        atomIndex,
        startTime: performance.now(),
        duration: 150,
    });
}

function sillyModeUpdate(now) {
    if (!window.sillyMode) return;
    if (sillyAnimations.size === 0) return;

    const mol = main.molecule;
    if (!mol || !mol.instancedMesh) return;

    const mesh = mol.instancedMesh;
    const colorAttr = mesh.geometry.getAttribute('color');

    let colorDirty = false;
    const toRemove = [];

    for (const [key, anim] of sillyAnimations) {
        const elapsed = now - anim.startTime;
        const t = Math.min(elapsed / anim.duration, 1);

        if (anim.type === 'hover_in') {
            const idx = anim.atomIndex;
            if (idx >= mesh.count || !colorAttr) { toRemove.push(key); continue; }

            if (atomsSelected.includes(idx)) { toRemove.push(key); continue; }

            const baseColor = getDisplayColorForAtom(idx);
            const hoverColor = baseColor.clone().lerp(new THREE.Color(1, 1, 1), 0.3);

            // Smooth lerp from base -> hover
            const eased = t * t * (3 - 2 * t); // smoothstep
            const r = baseColor.r + (hoverColor.r - baseColor.r) * eased;
            const g = baseColor.g + (hoverColor.g - baseColor.g) * eased;
            const b = baseColor.b + (hoverColor.b - baseColor.b) * eased;
            colorAttr.setXYZ(idx, r, g, b);
            colorDirty = true;

            if (t >= 1) toRemove.push(key);

        } else if (anim.type === 'hover_out') {
            const idx = anim.atomIndex;
            if (idx >= mesh.count || !colorAttr) { toRemove.push(key); continue; }

            if (atomsSelected.includes(idx)) { toRemove.push(key); continue; }

            const baseColor = getDisplayColorForAtom(idx);
            const hoverColor = baseColor.clone().lerp(new THREE.Color(1, 1, 1), 0.3);

            // Smooth lerp from hover -> base
            const eased = t * t * (3 - 2 * t);
            const r = hoverColor.r + (baseColor.r - hoverColor.r) * eased;
            const g = hoverColor.g + (baseColor.g - hoverColor.g) * eased;
            const b = hoverColor.b + (baseColor.b - hoverColor.b) * eased;
            colorAttr.setXYZ(idx, r, g, b);
            colorDirty = true;

            if (t >= 1) toRemove.push(key);

        } else if (anim.type === 'select_color') {
            const idx = anim.atomIndex;
            if (idx >= mesh.count || !colorAttr) { toRemove.push(key); continue; }

            const eased = t * t * (3 - 2 * t);

            // Fade atom color toward yellow
            const fr = anim.fromColor;
            colorAttr.setXYZ(idx,
                fr.r + (1 - fr.r) * eased,
                fr.g + (1 - fr.g) * eased,
                fr.b + (0 - fr.b) * eased
            );
            colorDirty = true;

            // Grow yellow overlay cylinders from atom end along each bond half
            for (const ov of anim.bondOverlays) {
                const len = ov.halfLen * eased;
                ov.mesh.scale.set(ov.xScale, Math.max(len, 0.001), ov.zScale);
                ov.mesh.position.copy(ov.atomEnd).addScaledVector(ov.yAxis, ov.growDir * len * 0.5);
                ov.mesh.material.opacity = eased;
            }

            // When done: remove overlays and set bond colors to final yellow
            if (t >= 1) {
                for (const ov of anim.bondOverlays) {
                    mol.bondGroup.remove(ov.mesh);
                }
                const bondMeshRef = mol.bondGroup?.children[0];
                if (bondMeshRef) {
                    const bondColorAttr = bondMeshRef.geometry.getAttribute('color');
                    if (bondColorAttr) {
                        for (const halfIdx of anim.bondHalves) {
                            bondColorAttr.setXYZ(halfIdx, 1, 1, 0);
                        }
                        bondColorAttr.needsUpdate = true;
                    }
                }
                toRemove.push(key);
            }

        } else if (anim.type === 'unselect_color') {
            const idx = anim.atomIndex;
            if (idx >= mesh.count || !colorAttr) { toRemove.push(key); continue; }

            const elapsed = now - anim.startTime;
            const effectiveElapsed = elapsed - anim.delay;
            if (effectiveElapsed < 0) continue; // waiting for cascade delay

            // Create overlays on first active frame if deferred
            if (!anim.overlaysCreated) {
                anim.bondOverlays = sillyCreateUnselectOverlays(mol, idx);
                anim.overlaysCreated = true;
            }

            const tLocal = Math.min(effectiveElapsed / anim.duration, 1);
            const eased = tLocal * tLocal * (3 - 2 * tLocal);
            const reverseEased = 1 - eased;

            // Fade atom color from yellow toward target
            const tc = anim.targetColor;
            colorAttr.setXYZ(idx,
                1 + (tc.r - 1) * eased,
                1 + (tc.g - 1) * eased,
                0 + (tc.b - 0) * eased
            );
            colorDirty = true;

            // Shrink bond overlays back toward atom
            for (const ov of anim.bondOverlays) {
                const len = ov.halfLen * reverseEased;
                ov.mesh.scale.set(ov.xScale, Math.max(len, 0.001), ov.zScale);
                ov.mesh.position.copy(ov.atomEnd).addScaledVector(ov.yAxis, ov.growDir * len * 0.5);
                ov.mesh.material.opacity = reverseEased;
            }

            if (tLocal >= 1) {
                for (const ov of anim.bondOverlays) {
                    mol.bondGroup.remove(ov.mesh);
                }
                toRemove.push(key);
            }
        }
    }

    for (const key of toRemove) sillyAnimations.delete(key);
    if (colorDirty) colorAttr.needsUpdate = true;
    if (colorDirty) render();
}

function sillyModeCleanup() {
    const mol = main.molecule;
    for (const [key, anim] of sillyAnimations) {
        // Remove overlay meshes and finalize bond colors
        if (anim.bondOverlays) {
            for (const ov of anim.bondOverlays) {
                ov.mesh.parent?.remove(ov.mesh);
            }
        }
        if (anim.type === 'select_color' && mol?.bondGroup?.children[0]) {
            const bondColorAttr = mol.bondGroup.children[0].geometry.getAttribute('color');
            if (bondColorAttr && anim.bondHalves) {
                for (const halfIdx of anim.bondHalves) {
                    bondColorAttr.setXYZ(halfIdx, 1, 1, 0);
                }
                bondColorAttr.needsUpdate = true;
            }
        }
    }
    sillyAnimations.clear();
    sillyAlreadySelected.clear();
}

function animate() {
    window.fragments = fragments;
    requestAnimationFrame(animate);
    sillyModeUpdate(performance.now());
    controls.update();
    render();
}
function render() {
    renderer.render(scene, getActiveCamera());
    updateAllBondLengthLabels();
    if (main.molecule && main.molecule.labelInstancedMesh && main.molecule.labelInstancedMesh.visible) {
        main.molecule.updateLabels();
    }
}

function updateRendererSize() {
    // Calculate available space accounting for open panels
    const aiPanel = document.getElementById('aiChatPanel');
    const explorerPanel = document.getElementById('fileExplorerPanel');
    const mobile = window.isMobile?.() || window.matchMedia('(max-width: 768px)').matches;

    // On mobile, panels overlay the canvas — no offset needed
    let leftOffset = 0;
    let rightOffset = 0;
    if (!mobile) {
        leftOffset = (aiPanel && aiPanel.classList.contains('open')) ? aiPanel.offsetWidth : 0;
        rightOffset = (explorerPanel && explorerPanel.classList.contains('open')) ? explorerPanel.offsetWidth : 0;
    }

    const width = window.innerWidth - leftOffset - rightOffset;
    let height = window.innerHeight;

    // On mobile, canvas only fills the space above the fixed AI panel
    if (mobile && aiPanel) {
        const panelHeight = aiPanel.offsetHeight || 0;
        height = window.innerHeight - panelHeight;
    }

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    if (orthoCamera) {
        const aspect = width / height;
        const frustumSize = 30;
        orthoCamera.left = -frustumSize * aspect / 2;
        orthoCamera.right = frustumSize * aspect / 2;
        orthoCamera.top = frustumSize / 2;
        orthoCamera.bottom = -frustumSize / 2;
        orthoCamera.updateProjectionMatrix();
    }

    renderer.setSize(width, height);
    renderer.domElement.style.marginLeft = leftOffset + 'px';

    // On mobile, CSS handles positioning — skip JS overrides
    if (!mobile) {
        // Sync text editor position with viewport area
        const textEditor = document.getElementById('textEditorModal');
        if (textEditor) {
            textEditor.style.left = leftOffset + 'px';
            textEditor.style.right = rightOffset + 'px';
        }

        // Center frame slider on canvas
        const frameSlider = document.getElementById('frameSliderContainer');
        if (frameSlider) {
            frameSlider.style.left = (leftOffset + width / 2) + 'px';
        }
        const toolbarBg = document.getElementById('toolbar-background');
        const canvasCenter = leftOffset + width / 2;
        if (toolbarBg) {
            toolbarBg.style.left = canvasCenter + 'px';
            toolbarBg.style.transform = 'translateX(-50%)';
        }
        document.documentElement.style.setProperty('--properties-panel-left', canvasCenter + 'px');
        const fragmentListContainer = document.getElementById('fragmentListContainer');
        if (fragmentListContainer) {
            fragmentListContainer.style.left = (leftOffset + 10) + 'px';
        }
    }

    render();
}
window.addEventListener('resize', updateRendererSize);
window.updateRendererSize = updateRendererSize;
function toggleRibbon() {
    if (!window.main || !window.main.data) {
        window.toastWarning?.('No molecule loaded');
        return;
    }

    if (!window.main.data.ribbonData) {
        window.toastWarning?.('This molecule is not a protein — no backbone found');
        return;
    }

    ribbonMode = !ribbonMode;

    // Store current data and mode
    const currentData = window.main.data;
    const currentMode = window.main.mode;

    // Completely recreate the molecule in the new mode
    console.log(`Switching to ${ribbonMode ? 'ribbon' : 'ball-and-stick'} mode`);

    window.main.newMolecule(
        currentData,
        currentMode,
        true,
        false,
        ribbonMode  // Pass ribbonMode state
    );

    // Recenter camera
    window.main.zoomCameraToFitMolecule();
}

function disableAtomInteractions() {
    // Remove pointer event listeners — use window consistently
    window.removeEventListener('pointerdown', enhancedOnPointerDown, false);
    window.removeEventListener('pointermove', onPointerMove2, false);
    renderer.domElement.style.cursor = 'default';

    // Clear any selections
    atomsSelected = [];
    hoveredAtom = null;

    console.log('Atom interactions disabled');
}

function enableAtomInteractions() {
    // Re-attach pointer event listeners — use window consistently (avoid duplicates)
    window.removeEventListener('pointerdown', enhancedOnPointerDown, false);
    window.removeEventListener('pointermove', onPointerMove2, false);

    window.addEventListener('pointerdown', enhancedOnPointerDown, false);
    window.addEventListener('pointermove', onPointerMove2, false);

    console.log('Atom interactions enabled');
}

function testMoleculeFromJSON(json) {
    window.main.newMolecule(json, window.main.setNewMode(json.numAtoms <= 2000));
    window.main.zoomCameraToFitMolecule();
}
window.testMoleculeFromJSON = testMoleculeFromJSON;

window.toggleRibbon = toggleRibbon;
(function () {
    const panel = document.getElementById('dbSearchPanel');
    const input = document.getElementById('dbSearchInput');
    const dropdown = document.getElementById('dbSearchDropdown');
    const tbody = document.getElementById('dbSearchResults');
    const sourceSelect = document.getElementById('dbSourceSelect');
    panel.classList.add('active');

    if (!panel || !input || !dropdown || !tbody) return;

    const loader = panel.querySelector('.db-search-loader');
    let debounce;
    let activeIdx = -1;
    let items = [];

    // Update placeholder based on selected database
    sourceSelect?.addEventListener('change', () => {
        const placeholders = {
            pubchem: 'Search compounds (e.g., caffeine)...',
            pdb: 'Search PDB ID or name (e.g., 1CRN)...',
            chembl: 'Search ChEMBL (e.g., aspirin)...',
            drugbank: 'Enter DrugBank ID (e.g., DB00945)...'
        };
        input.placeholder = placeholders[sourceSelect.value] || 'Search molecules...';
        dropdown.classList.remove('show');
        items = [];
    });

    document.addEventListener('click', (e) => {
        if (window.dbSearchJustResized) return;
        if (!panel.contains(e.target)) dropdown.classList.remove('show');
    });

    input.addEventListener('focus', () => {
        if (items.length > 0) dropdown.classList.add('show');
    });

    input.oninput = (e) => {
        const q = e.target.value.trim();
        clearTimeout(debounce);
        if (q.length < 2) {
            dropdown.classList.remove('show');
            return;
        }
        loader.classList.add('show');
        debounce = setTimeout(() => search(q), 300);
    };

    async function search(q) {
        const source = sourceSelect?.value || 'pubchem';
        try {
            switch (source) {
                case 'pubchem': await searchPubChem(q); break;
                case 'pdb': await searchPDB(q); break;
                case 'chembl': await searchChEMBL(q); break;
                case 'drugbank': await searchDrugBank(q); break;
            }
        } catch (err) {
            console.error(err);
            tbody.innerHTML = '<tr><td colspan="3" class="db-search-empty">Search failed</td></tr>';
            dropdown.classList.add('show');
        } finally {
            loader.classList.remove('show');
        }
    }

    // PubChem search with descriptions for ALL results
    async function searchPubChem(q) {
        const res = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/autocomplete/compound/${encodeURIComponent(q)}/json?limit=8`);
        const data = await res.json();
        const names = data.dictionary_terms?.compound || [];

        if (!names.length) {
            items = [];
            showResults([]);
            return;
        }

        // Fetch CIDs for each name in parallel
        const cidPromises = names.map(name =>
            fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name)}/cids/JSON`)
                .then(r => r.json())
                .then(d => ({ name, cid: d.IdentifierList?.CID?.[0] }))
                .catch(() => ({ name, cid: null }))
        );

        const cidResults = await Promise.all(cidPromises);
        const validCids = cidResults.filter(r => r.cid).map(r => r.cid);

        // Map name to CID
        const nameToCid = {};
        cidResults.forEach(r => nameToCid[r.name] = r.cid);

        // Fetch descriptions for all CIDs at once
        const cidDesc = {};
        if (validCids.length) {
            try {
                const descRes = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${validCids.join(',')}/description/JSON`);
                const descData = await descRes.json();
                (descData.InformationList?.Information || []).forEach(d => {
                    if (d.Description && !cidDesc[d.CID]) cidDesc[d.CID] = d.Description;
                });
            } catch (e) { /* ignore */ }
        }

        items = names.filter(name => nameToCid[name]);
        showResults(items.map(name => ({
            name,
            source: 'PubChem',
            type: cidDesc[nameToCid[name]] || 'Compound',
            cid: nameToCid[name]
        })));
    }

    // RCSB PDB search
    async function searchPDB(q) {
        const query = q.trim().toUpperCase();

        // Check if it looks like a PDB ID (4 characters, starts with number)
        const isPdbId = /^\d[A-Z0-9]{3}$/i.test(query);

        const searchQuery = isPdbId ? {
            type: 'terminal',
            service: 'text',
            parameters: {
                attribute: 'rcsb_entry_container_identifiers.entry_id',
                operator: 'exact_match',
                value: query
            }
        } : {
            type: 'terminal',
            service: 'full_text',
            parameters: { value: q }
        };

        const res = await fetch('https://search.rcsb.org/rcsbsearch/v2/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: searchQuery,
                return_type: 'entry',
                request_options: { paginate: { start: 0, rows: 15 } }
            })
        });
        const data = await res.json();
        items = data.result_set?.map(r => r.identifier) || [];
        showResults(items.map(id => ({ name: id, source: 'PDB', type: 'Structure' })));
    }

    // ChEMBL search
    async function searchChEMBL(q) {
        const res = await fetch(`https://www.ebi.ac.uk/chembl/api/data/molecule/search?q=${encodeURIComponent(q)}&format=json&limit=15`);
        const data = await res.json();
        items = data.molecules || [];
        showResults(items.map(m => ({
            name: m.pref_name || m.molecule_chembl_id,
            id: m.molecule_chembl_id,
            source: 'ChEMBL',
            type: 'Molecule'
        })));
    }

    // DrugBank (direct ID lookup)
    async function searchDrugBank(q) {
        // DrugBank doesn't have a public search API, show direct ID entry
        items = [{ name: q.toUpperCase(), source: 'DrugBank', type: 'Drug ID' }];
        showResults(items);
    }

    function showResults(list) {
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="3" class="db-search-empty">No results found</td></tr>';
            dropdown.classList.add('show');
            return;
        }

        tbody.innerHTML = list.slice(0, 15).map((item, i) => `
        <tr data-i="${i}" data-name="${item.name}" data-id="${item.id || item.name}" data-source="${item.source}"${item.cid ? ` data-cid="${item.cid}"` : ''}>
            <td class="col-name" title="${item.name}">${item.name}</td>
            <td class="col-type">${item.source}</td>
            <td class="col-desc" title="Click to expand">${item.type || ''}</td>
        </tr>
    `).join('');

        dropdown.classList.add('show');
        activeIdx = -1;

        tbody.querySelectorAll('tr[data-name]').forEach(row => {
            row.onclick = (e) => {
                if (e.target.classList.contains('col-desc')) {
                    e.stopPropagation();
                    // Collapse others first
                    tbody.querySelectorAll('.col-desc.expanded').forEach(el => {
                        if (el !== e.target) el.classList.remove('expanded');
                    });
                    e.target.classList.toggle('expanded');
                    return;
                }
                load(row.dataset.name, row.dataset.source, row.dataset.id, row.dataset.cid);
            };
        });
    }

    input.onkeydown = (e) => {
        const rows = tbody.querySelectorAll('tr[data-name]');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIdx = Math.min(activeIdx + 1, rows.length - 1);
            updateActive(rows);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIdx = Math.max(activeIdx - 1, 0);
            updateActive(rows);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeIdx >= 0 && rows[activeIdx]) {
                const row = rows[activeIdx];
                load(row.dataset.name, row.dataset.source, row.dataset.id, row.dataset.cid);
            }
        } else if (e.key === 'Escape') {
            dropdown.classList.remove('show');
        }
    };

    function updateActive(rows) {
        rows.forEach((row, i) => {
            row.classList.toggle('active', i === activeIdx);
            if (i === activeIdx) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
    }

    async function load(name, source, id, cid) {
        dropdown.classList.remove('show');
        input.value = name;
        loader.classList.add('show');

        try {
            switch (source) {
                case 'PubChem': await loadPubChem(name, cid); break;
                case 'PDB': await loadPDB(name); break;
                case 'ChEMBL': await loadChEMBL(id || name); break;
                case 'DrugBank': await loadDrugBank(name); break;
                default: await loadPubChem(name);
            }
        } catch (err) {
            console.error('Load error:', err);
            window.toastError?.('Failed to load molecule');
        } finally {
            loader.classList.remove('show');
        }
    }

    // Load from PubChem
    async function loadPubChem(name, existingCid) {
        let cid = existingCid && existingCid !== 'undefined' ? existingCid : null;
        if (!cid) {
            const cidRes = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name)}/cids/JSON`);
            const cidData = await cidRes.json();
            cid = cidData.IdentifierList?.CID?.[0];
        }
        if (!cid) throw new Error('Molecule not found');

        // Try 3D first, fall back to 2D
        let sdfRes = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/record/SDF?record_type=3d`);
        if (!sdfRes.ok) {
            sdfRes = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/record/SDF`);
            if (!sdfRes.ok) throw new Error('Structure unavailable');
        }

        const sdfText = await sdfRes.text();
        const molData = parseSDF(sdfText);
        loadMolecule(molData);
    }

    // Load from RCSB PDB
    // Load from RCSB PDB - handles huge files like 4v88
    async function loadPDB(pdbId) {
        // Try compressed mmCIF first (smallest), then compressed PDB, then uncompressed
        const urls = [
            `https://files.rcsb.org/download/${pdbId}.cif.gz`,
            `https://files.rcsb.org/download/${pdbId}.pdb.gz`,
            `https://files.rcsb.org/download/${pdbId}.cif`,
            `https://files.rcsb.org/download/${pdbId}.pdb`
        ];

        let data = null;
        let ext = 'pdb';

        for (const url of urls) {
            try {
                const res = await fetch(url);
                if (!res.ok) continue;

                const isGzip = url.endsWith('.gz');
                ext = url.includes('.cif') ? 'cif' : 'pdb';

                if (isGzip) {
                    const buffer = await res.arrayBuffer();
                    const ds = new DecompressionStream('gzip');
                    const decompressed = new Response(new Blob([buffer]).stream().pipeThrough(ds));
                    data = await decompressed.text();
                } else {
                    data = await res.text();
                }
                break;
            } catch (e) {
                continue;
            }
        }

        if (!data) throw new Error('PDB structure not found');

        const blob = new Blob([data], { type: 'text/plain' });
        const file = new File([blob], `${pdbId}.${ext}`);
        window.main?.loader?.handleFile({ target: { files: [file] } }, false);
    }

    // Load from ChEMBL
    async function loadChEMBL(chemblId) {
        const res = await fetch(`https://www.ebi.ac.uk/chembl/api/data/molecule/${chemblId}?format=json`);
        if (!res.ok) throw new Error('ChEMBL molecule not found');

        const data = await res.json();
        const molfile = data.molecule_structures?.molfile;
        if (!molfile) throw new Error('No structure available');

        const molData = parseSDF(molfile);
        loadMolecule(molData);
    }

    // Load from DrugBank (requires structure file URL - limited without API key)
    async function loadDrugBank(drugId) {
        // Try PubChem as fallback since DrugBank API is restricted
        window.toastInfo?.('DrugBank requires API access. Searching PubChem instead.');
        await loadPubChem(drugId);
    }

    function parseSDF(sdfText) {
        const lines = sdfText.split('\n');
        const countsLine = lines[3];
        const numAtoms = parseInt(countsLine.slice(0, 3));
        const numBonds = parseInt(countsLine.slice(3, 6));
        const atomData = [];

        for (let i = 4; i < 4 + numAtoms; i++) {
            const line = lines[i];
            if (!line || line.length < 34) continue;
            const x = parseFloat(line.slice(0, 10).trim());
            const y = parseFloat(line.slice(10, 20).trim());
            const z = parseFloat(line.slice(20, 30).trim());
            const element = line.slice(31, 34).trim();
            atomData.push({ element, x, y, z });
        }

        // Parse bond block to get actual bonds
        const bonds = [];
        const bondStart = 4 + numAtoms;
        for (let i = bondStart; i < bondStart + numBonds; i++) {
            const line = lines[i];
            if (!line || line.length < 6) continue;
            const a1 = parseInt(line.slice(0, 3)) - 1; // 1-indexed to 0-indexed
            const a2 = parseInt(line.slice(3, 6)) - 1;
            if (a1 >= 0 && a2 >= 0 && a1 < numAtoms && a2 < numAtoms) {
                bonds.push([a1, a2]);
            }
        }

        // Calculate average bond length from actual bonds
        if (bonds.length > 0 && atomData.length > 1) {
            let totalDist = 0;
            bonds.forEach(([a1, b1]) => {
                const dx = atomData[a1].x - atomData[b1].x;
                const dy = atomData[a1].y - atomData[b1].y;
                const dz = atomData[a1].z - atomData[b1].z;
                totalDist += Math.sqrt(dx * dx + dy * dy + dz * dz);
            });
            const avgBondLen = totalDist / bonds.length;

            // Expected average bond length is ~1.4-1.5 Å
            // If significantly off, scale the coordinates
            if (avgBondLen < 0.87 || avgBondLen > 3.0) {
                const scale = 1.25 / avgBondLen;
                atomData.forEach(a => {
                    a.x *= scale;
                    a.y *= scale;
                    a.z *= scale;
                });
                console.log(`SDF coordinates scaled by ${scale.toFixed(2)} (avg bond was ${avgBondLen.toFixed(3)} Å)`);
            }
        }

        return { atomData, numAtoms };
    }

    function loadMolecule(molData) {
        // Clear frames, energies, and MACE cache when loading from database
        window.xyzFrames = null;
        window.frameEnergies = [];
        window.lastMaceResults = null;
        const frameSliderContainer = document.getElementById('frameSliderContainer');
        if (frameSliderContainer) {
            frameSliderContainer.style.display = 'none';
        }

        window.main.newMolecule(molData, window.main.setNewMode(molData.numAtoms <= 2000));
        window.main.zoomCameraToFitMolecule();
    }

    (function () {
        const panel = document.getElementById('dbSearchPanel');
        if (!panel) return;

        const resizerLeft = panel.querySelector('.db-search-resizer-left');
        const resizerRight = panel.querySelector('.db-search-resizer-right');
        const resizerBottom = panel.querySelector('.db-search-resizer-bottom');

        let isResizing = false;
        let currentResizer = null;
        let startX, startY, startWidth, startHeight;

        function onMouseDown(e, resizer) {
            isResizing = true;
            currentResizer = resizer;
            startX = e.clientX;
            startY = e.clientY;
            startWidth = panel.offsetWidth;
            startHeight = panel.offsetHeight;

            document.body.style.cursor = resizer === 'bottom' ? 'ns-resize' : 'ew-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        }

        function onMouseMove(e) {
            if (!isResizing) return;

            if (currentResizer === 'right') {
                const newWidth = startWidth + ((e.clientX - startX) * 2);
                panel.style.width = Math.max(280, Math.min(800, newWidth)) + 'px';
            } else if (currentResizer === 'left') {
                const delta = (startX - e.clientX) * 2;
                const newWidth = startWidth + delta;
                if (newWidth >= 280 && newWidth <= 800) {
                    panel.style.width = newWidth + 'px';
                }
            } else if (currentResizer === 'bottom') {
                const newHeight = startHeight + (e.clientY - startY);
                panel.style.height = Math.max(94, Math.min(500, newHeight)) + 'px';
                const dropdown = document.getElementById('dbSearchDropdown');
                if (dropdown && dropdown.classList.contains('show')) {
                    dropdown.style.maxHeight = (newHeight - 100) + 'px';
                }
            }
        }

        function onMouseUp() {
            if (isResizing) {
                isResizing = false;
                currentResizer = null;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';

                // Prevent click-outside from closing panel
                window.dbSearchJustResized = true;
                setTimeout(() => { window.dbSearchJustResized = false; }, 100);
            }
        }

        resizerLeft?.addEventListener('mousedown', (e) => onMouseDown(e, 'left'));
        resizerRight?.addEventListener('mousedown', (e) => onMouseDown(e, 'right'));
        resizerBottom?.addEventListener('mousedown', (e) => onMouseDown(e, 'bottom'));

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    })();
})();

window.labelIndexMode = false;
window.showElements = true;
window.showIndices = false;
window.showCharges = false;

document.getElementById('showElements').addEventListener('change', updateLabelMode);
document.getElementById('showIndices').addEventListener('change', updateLabelMode);
document.getElementById('showCharges').addEventListener('change', updateLabelMode);

function updateLabelMode() {
    window.showElements = document.getElementById('showElements').checked;
    window.showIndices = document.getElementById('showIndices').checked;
    window.showCharges = document.getElementById('showCharges').checked;

    if (!main.molecule || !main.molecule.atoms || main.molecule.atoms.length === 0) {
        return;
    }

    const shouldShowLabels = window.showElements || window.showIndices || window.showCharges;
    labelMode = shouldShowLabels;
    const charges = window.showCharges ? getChargeArray(window.chargeVisualizationType) : null;
    main.molecule.toggleLabels(shouldShowLabels, window.showElements, window.showIndices, window.showCharges, charges);
    render();
}

// Ribbon/Cartoon toggle
document.getElementById('toggleRibbonCheckbox').addEventListener('change', function () {
    window.toggleRibbon();
    // Sync checkbox state with actual ribbonMode (toggleRibbon may fail if no protein)
    this.checked = window.ribbonMode;
});

window.updateRibbonToggle = function () {
    const row = document.getElementById('ribbonToggleRow');
    const checkbox = document.getElementById('toggleRibbonCheckbox');
    const hasRibbon = !!window.main?.data?.ribbonData;
    row.style.display = hasRibbon ? '' : 'none';
    checkbox.checked = window.ribbonMode;
};

// Force arrows toggle
window.forceArrowScale = 1.0;
document.getElementById('toggleForceArrows').addEventListener('change', function () {
    if (!main.molecule) return;
    main.molecule.toggleForceArrows(this.checked, window.forceArrowScale);
    render();
});

document.getElementById('forceScaleSlider').addEventListener('input', function () {
    window.forceArrowScale = parseFloat(this.value);
    document.getElementById('forceScaleValue').textContent = window.forceArrowScale.toFixed(1);
    if (!main.molecule) return;
    if (document.getElementById('toggleForceArrows').checked) {
        main.molecule.updateForceArrows(window.forceArrowScale);
        render();
    }
    if (window.forceVisualizationEnabled) {
        applyForceVisualization();
    }
});

document.getElementById('toggleForceColors')?.addEventListener('change', function () {
    window.forceVisualizationEnabled = this.checked;
    applyForceVisualization();
});

// Charge visualization controls
window.chargeVisualizationEnabled = false;
window.chargeVisualizationType = 'mulliken';
window.chargeMaxAbs = 0;
window.chargeColorCache = null;
window.forceVisualizationEnabled = false;
window.forceMaxMag = 0;
window.forceColorCache = null;

function getChargeEntries(type) {
    if (!window.orcaMetadata) return null;
    if (type === 'loewdin') return window.orcaMetadata.loewdinCharges || [];
    return window.orcaMetadata.mullikenCharges || [];
}

function buildChargeArray(entries, atomCount) {
    if (!entries || entries.length === 0 || !atomCount) return null;
    let minIndex = Infinity;
    let maxIndex = -Infinity;
    entries.forEach(entry => {
        if (typeof entry.index !== 'number') return;
        minIndex = Math.min(minIndex, entry.index);
        maxIndex = Math.max(maxIndex, entry.index);
    });
    let offset = 0;
    if (maxIndex === atomCount && minIndex >= 1) {
        offset = -1;
    }
    const charges = new Array(atomCount).fill(null);
    entries.forEach(entry => {
        const idx = entry.index + offset;
        if (idx >= 0 && idx < atomCount) {
            charges[idx] = entry.charge;
        }
    });
    return charges;
}

function getChargeArray(type) {
    if (!main.molecule) return null;
    const entries = getChargeEntries(type);
    return buildChargeArray(entries, main.molecule.atoms.length);
}

function applyChargeVisualization() {
    if (!main.molecule) return;
    if (!window.chargeVisualizationEnabled) {
        main.molecule.clearChargeColors();
        window.chargeColorCache = null;
        window.chargeMaxAbs = 0;
        updateBondColorsForDisplay();
        render();
        return;
    }

    const charges = getChargeArray(window.chargeVisualizationType);
    if (!charges) {
        main.molecule.clearChargeColors();
        window.chargeColorCache = null;
        window.chargeMaxAbs = 0;
        updateBondColorsForDisplay();
        render();
        return;
    }

    let maxAbs = 0;
    for (let i = 0; i < charges.length; i++) {
        const q = charges[i];
        if (q === null || q === undefined || Number.isNaN(q)) continue;
        const abs = Math.abs(q);
        if (abs > maxAbs) maxAbs = abs;
    }

    window.chargeMaxAbs = maxAbs;
    window.chargeColorCache = buildChargeColorCache(charges, maxAbs);
    if (!window.forceVisualizationEnabled) {
        main.molecule.applyChargeColors(charges, { maxAbs });
        updateBondColorsForDisplay();
    } else {
        updateBondColorsForDisplay();
    }
    if (labelMode && window.showCharges) {
        main.molecule.toggleLabels(true, window.showElements, window.showIndices, true, charges);
    }
    render();
}

function getForceMagnitudes(scale = 1, stretch = 1) {
    if (!main.molecule || !main.molecule.forceData) return null;
    const magnitudes = new Array(main.molecule.atoms.length).fill(null);
    for (let i = 0; i < main.molecule.atoms.length && i < main.molecule.forceData.length; i++) {
        const force = main.molecule.forceData[i];
        if (!force || force.fx === undefined || force.fy === undefined || force.fz === undefined) continue;
        const fx = force.fx * scale * stretch;
        const fy = force.fy * scale * stretch;
        const fz = force.fz * scale * stretch;
        const mag = Math.sqrt(fx * fx + fy * fy + fz * fz);
        magnitudes[i] = mag;
    }
    return magnitudes;
}

function buildForceColorCache(magnitudes) {
    if (!magnitudes || magnitudes.length === 0) return null;
    const colors = new Float32Array(magnitudes.length * 3);

    for (let i = 0; i < magnitudes.length; i++) {
        const mag = magnitudes[i];
        let r = 1;
        let g = 1;
        let b = 1;
        if (mag !== null && mag !== undefined && !Number.isNaN(mag)) {
            const t = Math.min(1, Math.max(0, mag));
            r = t;
            g = 1 - t;
            b = 0;
        }
        const idx = i * 3;
        colors[idx] = r;
        colors[idx + 1] = g;
        colors[idx + 2] = b;
    }

    return colors;
}

function applyForceVisualization() {
    if (!main.molecule) return;
    if (!window.forceVisualizationEnabled) {
        window.forceColorCache = null;
        window.forceMaxMag = 0;
        if (window.chargeVisualizationEnabled) {
            applyChargeVisualization();
        } else {
            main.molecule.clearChargeColors();
            updateBondColorsForDisplay();
            render();
        }
        return;
    }

    const scale = window.forceArrowScale || 1;
    const stretch = main.molecule?.stretch || 1;
    const magnitudes = getForceMagnitudes(scale, stretch);
    if (!magnitudes) {
        window.forceColorCache = null;
        window.forceMaxMag = 0;
        window.forceVisualizationEnabled = false;
        const toggle = document.getElementById('toggleForceColors');
        if (toggle) toggle.checked = false;
        if (window.chargeVisualizationEnabled) {
            applyChargeVisualization();
        } else {
            main.molecule.clearChargeColors();
            updateBondColorsForDisplay();
            render();
        }
        return;
    }

    let maxMag = 0;
    for (let i = 0; i < magnitudes.length; i++) {
        const mag = magnitudes[i];
        if (mag === null || mag === undefined || Number.isNaN(mag)) continue;
        maxMag = Math.max(maxMag, mag);
    }

    if (maxMag <= 0) {
        window.forceColorCache = null;
        window.forceMaxMag = 0;
        window.forceVisualizationEnabled = false;
        const toggle = document.getElementById('toggleForceColors');
        if (toggle) toggle.checked = false;
        if (window.chargeVisualizationEnabled) {
            applyChargeVisualization();
        } else {
            main.molecule.clearChargeColors();
            updateBondColorsForDisplay();
            render();
        }
        return;
    }

    window.forceMaxMag = maxMag;
    window.forceColorCache = buildForceColorCache(magnitudes);

    const colorAttr = main.molecule.instancedMesh?.geometry?.getAttribute('color');
    if (colorAttr && window.forceColorCache) {
        for (let i = 0; i < main.molecule.atoms.length; i++) {
            const idx = i * 3;
            const r = window.forceColorCache[idx];
            const g = window.forceColorCache[idx + 1];
            const b = window.forceColorCache[idx + 2];
            colorAttr.setXYZ(i, r, g, b);
            main.molecule.atoms[i].displayColor = new THREE.Color(r, g, b);
        }
        colorAttr.needsUpdate = true;
    }
    updateBondColorsForDisplay();
    render();
}

function buildChargeColorCache(charges, maxAbs) {
    if (!charges || charges.length === 0 || !maxAbs) return null;
    const colors = new Float32Array(charges.length * 3);
    const pos = { r: 0.9, g: 0.25, b: 0.25 };
    const neg = { r: 0.25, g: 0.45, b: 0.95 };
    const base = { r: 1, g: 1, b: 1 };

    for (let i = 0; i < charges.length; i++) {
        const q = charges[i];
        let r = base.r;
        let g = base.g;
        let b = base.b;
        if (q !== null && q !== undefined && !Number.isNaN(q)) {
            const t = Math.min(1, Math.abs(q) / maxAbs);
            const target = q >= 0 ? pos : neg;
            r = base.r * (1 - t) + target.r * t;
            g = base.g * (1 - t) + target.g * t;
            b = base.b * (1 - t) + target.b * t;
        }
        const idx = i * 3;
        colors[idx] = r;
        colors[idx + 1] = g;
        colors[idx + 2] = b;
    }

    return colors;
}

function getDisplayColorForAtom(atomIndex) {
    if (window.forceVisualizationEnabled && window.forceColorCache && window.forceColorCache.length >= (atomIndex * 3 + 3)) {
        const idx = atomIndex * 3;
        return new THREE.Color(window.forceColorCache[idx], window.forceColorCache[idx + 1], window.forceColorCache[idx + 2]);
    }
    if (window.chargeVisualizationEnabled && window.chargeColorCache && window.chargeColorCache.length >= (atomIndex * 3 + 3)) {
        const idx = atomIndex * 3;
        return new THREE.Color(window.chargeColorCache[idx], window.chargeColorCache[idx + 1], window.chargeColorCache[idx + 2]);
    }
    const atom = main.molecule.atoms[atomIndex];
    return new THREE.Color(main.molecule.atomSettings[atom.type].color);
}

function updateBondColorsForDisplay() {
    if (!main.molecule || !main.molecule.bonds || !main.molecule.bondGroup?.children[0]) return;
    const bondMesh = main.molecule.bondGroup.children[0];
    const bondColorAttr = bondMesh.geometry.getAttribute('color');
    if (!bondColorAttr) return;
    main.molecule.bonds.forEach((bond, bondIdx) => {
        const atom1Idx = main.molecule.atoms.indexOf(bond.atom1);
        const atom2Idx = main.molecule.atoms.indexOf(bond.atom2);
        const c1 = atom1Idx >= 0 ? getDisplayColorForAtom(atom1Idx) : new THREE.Color(bond.atom1.color);
        const c2 = atom2Idx >= 0 ? getDisplayColorForAtom(atom2Idx) : new THREE.Color(bond.atom2.color);
        bondColorAttr.setXYZ(bondIdx * 2, c1.r, c1.g, c1.b);
        bondColorAttr.setXYZ(bondIdx * 2 + 1, c2.r, c2.g, c2.b);
    });
    bondColorAttr.needsUpdate = true;
}

document.getElementById('toggleChargeColors')?.addEventListener('change', function () {
    window.chargeVisualizationEnabled = this.checked;
    applyChargeVisualization();
    window.updateChargeControls?.();
});

document.getElementById('chargeTypeSelect')?.addEventListener('change', function () {
    window.chargeVisualizationType = this.value;
    window.updateChargeControls?.();
});

// Function to show/hide force arrow controls based on data availability
window.updateForceArrowControls = function () {
    const molecule = main.molecule;
    const hasForces = molecule && molecule.hasForceData();
    const statusEl = document.getElementById('forceArrowsStatus');
    const colorStatusEl = document.getElementById('forceColorsStatus');
    const checkbox = document.getElementById('toggleForceArrows');
    const colorCheckbox = document.getElementById('toggleForceColors');

    console.log('[ForceArrows] updateForceArrowControls called');
    console.log('[ForceArrows] molecule exists:', !!molecule);
    console.log('[ForceArrows] hasForceData():', hasForces);
    if (molecule) {
        console.log('[ForceArrows] forceData:', molecule.forceData);
        console.log('[ForceArrows] forceData length:', molecule.forceData?.length);
        if (molecule.forceData && molecule.forceData.length > 0) {
            console.log('[ForceArrows] First force entry:', molecule.forceData[0]);
        }
    }

    if (statusEl) {
        if (hasForces) {
            const count = molecule.forceData?.length || 0;
            statusEl.textContent = `(${count} atoms)`;
            statusEl.style.color = '#4CAF50';
        } else {
            statusEl.textContent = '(no data)';
            statusEl.style.color = '#888';
        }
    }

    checkbox.disabled = !hasForces;
    if (!hasForces) {
        checkbox.checked = false;
    }

    if (colorCheckbox) {
        colorCheckbox.disabled = !hasForces;
        if (!hasForces) {
            colorCheckbox.checked = false;
            window.forceVisualizationEnabled = false;
            window.forceColorCache = null;
            window.forceMaxMag = 0;
            if (window.chargeVisualizationEnabled) {
                applyChargeVisualization();
            } else {
                main.molecule?.clearChargeColors();
                updateBondColorsForDisplay();
            }
        } else if (colorCheckbox.checked) {
            applyForceVisualization();
        }
    }

    if (colorStatusEl) {
        if (hasForces) {
            const scale = window.forceArrowScale || 1;
            const stretch = molecule?.stretch || 1;
            const magnitudes = getForceMagnitudes(scale, stretch);
            let maxMag = 0;
            let count = 0;
            if (magnitudes) {
                magnitudes.forEach(mag => {
                    if (mag === null || mag === undefined || Number.isNaN(mag)) return;
                    count++;
                    if (mag > maxMag) maxMag = mag;
                });
            }
            colorStatusEl.textContent = count > 0 ? `(${count} atoms, max ${maxMag.toFixed(3)})` : '(no data)';
            colorStatusEl.style.color = count > 0 ? '#4CAF50' : '#888';
        } else {
            colorStatusEl.textContent = '(no data)';
            colorStatusEl.style.color = '#888';
        }
    }

    // Update properties panel empty state
    updatePropertiesEmptyState();
};

// Function to show/hide charge controls based on data availability
window.updateChargeControls = function () {
    const molecule = main.molecule;
    const hasMulliken = !!(window.orcaMetadata && window.orcaMetadata.mullikenCharges && window.orcaMetadata.mullikenCharges.length > 0);
    const hasLoewdin = !!(window.orcaMetadata && window.orcaMetadata.loewdinCharges && window.orcaMetadata.loewdinCharges.length > 0);
    const hasCharges = !!(molecule && (hasMulliken || hasLoewdin));
    const statusEl = document.getElementById('chargeStatus');
    const checkbox = document.getElementById('toggleChargeColors');
    const select = document.getElementById('chargeTypeSelect');
    const section = document.getElementById('chargeSection');

    if (section) {
        section.style.display = hasCharges ? 'flex' : 'none';
    }

    if (select) {
        const mullikenOption = select.querySelector('option[value="mulliken"]');
        const loewdinOption = select.querySelector('option[value="loewdin"]');
        if (mullikenOption) mullikenOption.disabled = !hasMulliken;
        if (loewdinOption) loewdinOption.disabled = !hasLoewdin;

        if (window.chargeVisualizationType === 'mulliken' && !hasMulliken && hasLoewdin) {
            window.chargeVisualizationType = 'loewdin';
            select.value = 'loewdin';
        } else if (window.chargeVisualizationType === 'loewdin' && !hasLoewdin && hasMulliken) {
            window.chargeVisualizationType = 'mulliken';
            select.value = 'mulliken';
        }
    }

    if (statusEl) {
        if (hasCharges) {
            const charges = getChargeArray(window.chargeVisualizationType);
            let maxAbs = 0;
            let count = 0;
            if (charges) {
                charges.forEach(q => {
                    if (q === null || q === undefined || Number.isNaN(q)) return;
                    count++;
                    const abs = Math.abs(q);
                    if (abs > maxAbs) maxAbs = abs;
                });
            }
            statusEl.textContent = count > 0 ? `(${count} atoms, max ±${maxAbs.toFixed(3)})` : '(no data)';
            statusEl.style.color = count > 0 ? '#4CAF50' : '#888';
        } else {
            statusEl.textContent = '(no data)';
            statusEl.style.color = '#888';
        }
    }

    if (checkbox) {
        checkbox.disabled = !hasCharges;
        if (!hasCharges) {
            checkbox.checked = false;
            window.chargeVisualizationEnabled = false;
            main.molecule?.clearChargeColors();
            window.chargeColorCache = null;
            window.chargeMaxAbs = 0;
            updateBondColorsForDisplay();
            if (labelMode && window.showCharges) {
                updateLabelMode();
            }
        } else if (checkbox.checked) {
            applyChargeVisualization();
        }
    }

    // Update properties panel empty state
    updatePropertiesEmptyState();
};

// Update properties panel empty state based on available data
window.updatePropertiesEmptyState = function () {
    const molecule = main.molecule;
    const hasForces = molecule && molecule.hasForceData();
    const hasMulliken = !!(window.orcaMetadata && window.orcaMetadata.mullikenCharges && window.orcaMetadata.mullikenCharges.length > 0);
    const hasLoewdin = !!(window.orcaMetadata && window.orcaMetadata.loewdinCharges && window.orcaMetadata.loewdinCharges.length > 0);
    const hasCharges = molecule && (hasMulliken || hasLoewdin);

    const forceSection = document.getElementById('forceSection');
    const chargeSection = document.getElementById('chargeSection');
    const emptyState = document.getElementById('propertiesEmpty');

    // Show force section if there's force data
    if (forceSection) {
        forceSection.style.display = hasForces ? 'block' : 'none';
    }

    // Show charge section if there's charge data
    if (chargeSection) {
        chargeSection.style.display = hasCharges ? 'flex' : 'none';
    }

    // Show/hide empty state based on available data
    if (emptyState) {
        emptyState.style.display = (hasForces || hasCharges) ? 'none' : 'flex';
    }
};

// ========== Orbital Visualization Controls ==========

// Track currently selected orbital in the table
window.selectedOrbitalIndex = -1;

// Track orbital grid quality (resolution)
window.orbitalQuality = 50;

// Progress bar update for orbital preloading
function updateOrbitalPreloadProgress(loaded, total) {
    const bar = document.getElementById('orbitalPreloadBar');
    const fill = document.getElementById('orbitalPreloadFill');
    if (!bar || !fill) return;

    if (total === 0) {
        bar.style.display = 'none';
        return;
    }

    bar.style.display = 'block';
    const pct = Math.round((loaded / total) * 100);
    fill.style.width = `${pct}%`;

    if (loaded >= total) {
        bar.classList.add('complete');
        setTimeout(() => {
            bar.style.display = 'none';
            bar.classList.remove('complete');
        }, 2000);
    } else {
        bar.classList.remove('complete');
    }

    // Update status text during preload (only if no orbital is actively selected/displayed)
    const statusEl = document.getElementById('orbitalStatus');
    if (statusEl && window.selectedOrbitalIndex < 0) {
        if (loaded < total) {
            statusEl.textContent = `(loading ${loaded}/${total})`;
            statusEl.style.color = '#FFA500';
        } else {
            statusEl.textContent = `(${total} MOs ready)`;
            statusEl.style.color = '#4CAF50';
        }
    }
}

// Function to select and display an orbital from the table
async function selectOrbitalFromTable(orbitalIndex) {
    if (!main.molecule) return;

    const statusEl = document.getElementById('orbitalStatus');
    const tableRows = document.querySelectorAll('#orbitalTableBody tr');

    // Update selected row visual
    tableRows.forEach((row, i) => {
        if (parseInt(row.dataset.index) === orbitalIndex) {
            row.classList.add('selected');
        } else {
            row.classList.remove('selected');
        }
    });

    window.selectedOrbitalIndex = orbitalIndex;

    // For molden files, generate grid for selected orbital using PySCF backend
    if (window.moldenData && window.moldenData.rawContent) {
        const gridSize = window.orbitalQuality || 50;
        const padding = 4.0;

        // Check cache first — if preloaded, this is instant (no network)
        const cached = window.getCachedOrbital?.(orbitalIndex, gridSize, padding);
        if (cached) {
            console.log(`[Orbitals] Cache hit for orbital ${orbitalIndex}`);
            window.orbitalData = cached;

            if (window.calculateDefaultIsovalue) {
                const defaultIso = window.calculateDefaultIsovalue(cached);
                document.getElementById('isovalueSlider').value = defaultIso;
                document.getElementById('isovalueValue').textContent = defaultIso.toFixed(3);
            }

            const currentIso = parseFloat(document.getElementById('isovalueSlider')?.value || main.molecule.orbitalIsovalue || 0.02);
            if (main.molecule.createOrbitalVisualizationAsync) {
                await main.molecule.createOrbitalVisualizationAsync(currentIso);
            } else {
                main.molecule.updateOrbitalIsovalue(currentIso);
            }
            main.molecule.toggleOrbitals(true);
            render();

            if (statusEl) {
                statusEl.textContent = cached.orbitalType || `MO ${orbitalIndex + 1}`;
                statusEl.style.color = '#4CAF50';
            }
            return;
        }

        // Cache miss — fall back to single-orbital request
        console.log('[Orbitals] Cache miss, requesting orbital', orbitalIndex, 'from PySCF backend...');

        if (statusEl) {
            statusEl.textContent = '(loading...)';
            statusEl.style.color = '#FFA500';
        }

        try {
            if (!window.generateMoldenOrbitalGridFromBackend) {
                throw new Error('Molden orbital utilities not loaded');
            }

            const orbitalData = await window.generateMoldenOrbitalGridFromBackend(
                window.moldenData.rawContent,
                orbitalIndex,
                gridSize,
                padding
            );

            if (!orbitalData) {
                throw new Error('Failed to generate orbital grid from backend');
            }

            window.orbitalData = orbitalData;

            console.log('[Orbitals] Grid received from backend:', {
                dimensions: orbitalData.gridInfo.dimensions,
                valueRange: [orbitalData.minValue, orbitalData.maxValue],
                orbitalType: orbitalData.orbitalType
            });

            if (window.calculateDefaultIsovalue) {
                const defaultIso = window.calculateDefaultIsovalue(orbitalData);
                document.getElementById('isovalueSlider').value = defaultIso;
                document.getElementById('isovalueValue').textContent = defaultIso.toFixed(3);
            }

            if (statusEl) {
                const typeLabel = orbitalData.orbitalType || `MO ${orbitalIndex + 1}`;
                statusEl.textContent = typeLabel + ' (rendering...)';
                statusEl.style.color = '#FFA500';
            }

            const currentIso = parseFloat(document.getElementById('isovalueSlider')?.value || main.molecule.orbitalIsovalue || 0.02);

            if (main.molecule.createOrbitalVisualizationAsync) {
                await main.molecule.createOrbitalVisualizationAsync(currentIso);
            } else {
                main.molecule.updateOrbitalIsovalue(currentIso);
            }
            main.molecule.toggleOrbitals(true);
            render();

            if (statusEl) {
                const typeLabel = orbitalData.orbitalType || `MO ${orbitalIndex + 1}`;
                statusEl.textContent = typeLabel;
                statusEl.style.color = '#4CAF50';
            }

        } catch (error) {
            console.error('[Orbitals] Error generating grid from backend:', error);
            if (statusEl) {
                statusEl.textContent = 'Error';
                statusEl.style.color = '#F44336';
            }
            if (error.message && !error.message.includes('HTTP')) {
                window.toastError?.('Orbital visualization failed');
            }
        }

        return;
    }

    // For cube files, just show/update
    if (window.orbitalData) {
        const isovalue = parseFloat(document.getElementById('isovalueSlider').value);
        main.molecule.toggleOrbitals(true);
        main.molecule.updateOrbitalIsovalue(isovalue);
        render();
    }
}

// Isovalue slider with debouncing for async rendering
let isovalueUpdateTimeout = null;
let isovalueUpdatePending = false;

document.getElementById('isovalueSlider')?.addEventListener('input', function () {
    const isovalue = parseFloat(this.value);
    document.getElementById('isovalueValue').textContent = isovalue.toFixed(3);

    if (!main.molecule) return;
    if (!main.molecule.orbitalVisible) return;

    // Debounce: wait for user to stop dragging before expensive recalc
    if (isovalueUpdateTimeout) {
        clearTimeout(isovalueUpdateTimeout);
    }

    isovalueUpdateTimeout = setTimeout(async () => {
        if (isovalueUpdatePending) return;
        isovalueUpdatePending = true;

        try {
            // Use async version if available for smoother UI
            if (main.molecule.updateOrbitalIsovalueAsync) {
                await main.molecule.updateOrbitalIsovalueAsync(isovalue);
            } else {
                main.molecule.updateOrbitalIsovalue(isovalue);
            }
            render();
        } finally {
            isovalueUpdatePending = false;
        }
    }, 150);  // 150ms debounce
});

// Orbital opacity slider
document.getElementById('orbitalOpacitySlider')?.addEventListener('input', function () {
    const opacity = parseFloat(this.value);
    document.getElementById('orbitalOpacityValue').textContent = opacity.toFixed(2);

    if (!main.molecule) return;
    main.molecule.updateOrbitalOpacity(opacity);
    render();
});

// Orbital quality slider (grid resolution)
document.getElementById('orbitalQualitySlider')?.addEventListener('change', function () {
    const quality = parseInt(this.value);
    document.getElementById('orbitalQualityValue').textContent = quality;
    window.orbitalQuality = quality;

    // Clear cache and re-preload at new resolution
    window.clearOrbitalCache?.();

    if (window.moldenData && window.moldenData.rawContent) {
        window.preloadAllOrbitals?.(
            window.moldenData.rawContent,
            quality,
            4.0,
            (loaded, total) => updateOrbitalPreloadProgress(loaded, total)
        ).catch(err => console.warn('[Orbitals] Re-preload failed:', err));
    }

    // Re-generate current orbital with new quality
    if (window.selectedOrbitalIndex >= 0 && window.moldenData) {
        selectOrbitalFromTable(window.selectedOrbitalIndex);
    }
});

// Update display value while dragging (without regenerating)
document.getElementById('orbitalQualitySlider')?.addEventListener('input', function () {
    document.getElementById('orbitalQualityValue').textContent = this.value;
});

// Phase toggles
document.getElementById('showPositivePhase')?.addEventListener('change', function () {
    if (!main.molecule) return;
    const showNegative = document.getElementById('showNegativePhase')?.checked || false;
    main.molecule.toggleOrbitalPhases(this.checked, showNegative);
    render();
});

document.getElementById('showNegativePhase')?.addEventListener('change', function () {
    if (!main.molecule) return;
    const showPositive = document.getElementById('showPositivePhase')?.checked || false;
    main.molecule.toggleOrbitalPhases(showPositive, this.checked);
    render();
});

// Orbital render mode buttons
function setOrbitalRenderMode(mode) {
    if (!main.molecule) return;

    // Update button states
    document.querySelectorAll('.orbital-mode-btn').forEach(btn => btn.classList.remove('active'));
    if (mode === 'solid') {
        document.getElementById('orbitalModeSolid')?.classList.add('active');
    } else if (mode === 'wireframe') {
        document.getElementById('orbitalModeWireframe')?.classList.add('active');
    } else if (mode === 'dots') {
        document.getElementById('orbitalModeDots')?.classList.add('active');
    }

    // Show/hide point size control
    const pointSizeControl = document.getElementById('pointSizeControl');
    if (pointSizeControl) {
        pointSizeControl.style.display = mode === 'dots' ? 'flex' : 'none';
    }

    // Show/hide material preset control (only for solid mode)
    const materialPresetControl = document.getElementById('materialPresetControl');
    if (materialPresetControl) {
        materialPresetControl.style.display = mode === 'solid' ? 'flex' : 'none';
    }

    // Update visualization
    main.molecule.setOrbitalRenderMode(mode);
    render();
}

document.getElementById('orbitalModeSolid')?.addEventListener('click', () => setOrbitalRenderMode('solid'));
document.getElementById('orbitalModeWireframe')?.addEventListener('click', () => setOrbitalRenderMode('wireframe'));
document.getElementById('orbitalModeDots')?.addEventListener('click', () => setOrbitalRenderMode('dots'));

// Point size slider for dots mode
document.getElementById('orbitalPointSizeSlider')?.addEventListener('input', function () {
    const size = parseFloat(this.value);
    document.getElementById('orbitalPointSizeValue').textContent = size.toFixed(2);

    if (!main.molecule) return;
    main.molecule.setOrbitalPointSize(size);
    render();
});

// Material preset dropdown
document.getElementById('orbitalMaterialPreset')?.addEventListener('change', function () {
    if (!main.molecule) return;
    main.molecule.setOrbitalMaterialPreset(this.value);
    render();
});

// Function to show/hide orbital table panel based on data availability
window.updateOrbitalControls = function () {
    const molecule = main.molecule;
    const hasOrbitals = molecule && molecule.hasOrbitalData();
    const statusEl = document.getElementById('orbitalStatus');
    const orbitalTablePanel = document.getElementById('orbitalTablePanel');
    const orbitalTableBody = document.getElementById('orbitalTableBody');

    console.log('[Orbitals] updateOrbitalControls called');
    console.log('[Orbitals] molecule exists:', !!molecule);
    console.log('[Orbitals] hasOrbitalData():', hasOrbitals);

    if (hasOrbitals && orbitalTablePanel) {
        const info = molecule.getOrbitalInfo();
        console.log('[Orbitals] Orbital info:', info);

        // Show the orbital table panel
        orbitalTablePanel.classList.add('open');

        // Update panel position based on file explorer state
        setTimeout(updateOrbitalPanelPosition, 50);

        // Update status
        if (statusEl) {
            if (info.fileType === 'cube') {
                if (info.gridDimensions) {
                    const [nx, ny, nz] = info.gridDimensions;
                    statusEl.textContent = `(${nx}×${ny}×${nz})`;
                } else {
                    statusEl.textContent = '(cube)';
                }
                statusEl.style.color = '#4CAF50';

                // Set default isovalue for cube files
                if (window.orbitalData && window.calculateDefaultIsovalue) {
                    const defaultIso = window.calculateDefaultIsovalue(window.orbitalData);
                    document.getElementById('isovalueSlider').value = defaultIso;
                    document.getElementById('isovalueValue').textContent = defaultIso.toFixed(3);
                }
            } else if (info.fileType === 'molden') {
                statusEl.textContent = `(${info.numOrbitals} MOs)`;
                statusEl.style.color = '#4CAF50';
            }
        }

        // Populate the orbital table
        if (orbitalTableBody && info.fileType === 'molden' && window.moldenData) {
            orbitalTableBody.innerHTML = '';
            const orbitals = window.moldenData.orbitals || window.moldenData.molecularOrbitals || [];
            const homoIndex = info.homoIndex;
            const lumoIndex = info.lumoIndex;

            orbitals.forEach((orbital, i) => {
                const tr = document.createElement('tr');
                tr.dataset.index = i;

                // Determine orbital type label
                let typeLabel = '';
                let typeClass = '';
                if (i === homoIndex) {
                    typeLabel = 'HOMO';
                    typeClass = 'homo';
                } else if (i === lumoIndex) {
                    typeLabel = 'LUMO';
                    typeClass = 'lumo';
                } else if (i < homoIndex) {
                    const diff = homoIndex - i;
                    typeLabel = `H-${diff}`;
                } else if (i > lumoIndex) {
                    const diff = i - lumoIndex;
                    typeLabel = `L+${diff}`;
                }

                if (typeClass) tr.classList.add(typeClass);

                const energy = orbital.energy !== undefined ? orbital.energy.toFixed(4) : '-';
                const occ = orbital.occupation !== undefined ? orbital.occupation.toFixed(1) : '-';

                tr.innerHTML = `
                    <td>${i + 1}</td>
                    <td class="orbital-type">${typeLabel}</td>
                    <td>${occ}</td>
                    <td class="orbital-energy">${energy}</td>
                `;

                tr.addEventListener('click', () => selectOrbitalFromTable(i));
                orbitalTableBody.appendChild(tr);
            });

            // Auto-scroll to HOMO/LUMO region
            if (homoIndex >= 0) {
                const homoRow = orbitalTableBody.querySelector(`tr[data-index="${homoIndex}"]`);
                if (homoRow) {
                    setTimeout(() => {
                        homoRow.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    }, 100);
                }
            }

            // Start background preload of ALL orbitals
            const gridSize = window.orbitalQuality || 50;
            window.preloadAllOrbitals?.(
                window.moldenData.rawContent,
                gridSize,
                4.0,
                (loaded, total) => updateOrbitalPreloadProgress(loaded, total)
            ).catch(err => console.warn('[Orbitals] Preload failed:', err));

        } else if (orbitalTableBody && info.fileType === 'cube') {
            // For cube files, just show a single entry
            orbitalTableBody.innerHTML = `
                <tr data-index="0" class="selected">
                    <td>1</td>
                    <td class="orbital-type">Cube</td>
                    <td>-</td>
                    <td class="orbital-energy">-</td>
                </tr>
            `;
            orbitalTableBody.querySelector('tr')?.addEventListener('click', () => selectOrbitalFromTable(0));
        }
    } else {
        // Hide the orbital table panel and clear cache
        if (orbitalTablePanel) {
            orbitalTablePanel.classList.remove('open');
        }
        window.clearOrbitalCache?.();
        if (statusEl) {
            statusEl.textContent = '';
            statusEl.style.color = '#888';
        }
    }

    // Update properties panel empty state (now just for forces)
    updatePropertiesEmptyState();
};

// Track file explorer state to adjust orbital panel position
window.updateOrbitalPanelPosition = function updateOrbitalPanelPosition() {
    const fileExplorer = document.getElementById('fileExplorerPanel');
    const orbitalPanel = document.getElementById('orbitalTablePanel');
    if (!orbitalPanel) return;

    if (fileExplorer && fileExplorer.classList.contains('open')) {
        const explorerWidth = fileExplorer.offsetWidth || 244;
        orbitalPanel.style.right = (explorerWidth + 10) + 'px';
        orbitalPanel.classList.remove('explorer-closed');
    } else {
        orbitalPanel.style.right = '10px';
        orbitalPanel.classList.add('explorer-closed');
    }
}

// Listen for file explorer toggle
const explorerCollapseToggle = document.getElementById('explorerCollapseToggle');
if (explorerCollapseToggle) {
    const originalClickHandler = explorerCollapseToggle.onclick;
    explorerCollapseToggle.addEventListener('click', () => {
        setTimeout(updateOrbitalPanelPosition, 350);
    });
}

// Also observe mutations on file explorer panel
const fileExplorerPanel = document.getElementById('fileExplorerPanel');
if (fileExplorerPanel) {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'class' || mutation.attributeName === 'style') {
                updateOrbitalPanelPosition();
            }
        });
    });
    observer.observe(fileExplorerPanel, { attributes: true });
}

// Listen for explorer resize
const explorerResizer = document.getElementById('explorerResizer');
if (explorerResizer) {
    explorerResizer.addEventListener('mouseup', () => {
        setTimeout(updateOrbitalPanelPosition, 50);
    });
}

// Transition settings
window.transitionSettings = {
    enabled: false,
    duration: 300
};

const toggleTransitions = document.getElementById('toggleTransitions');
const transitionDuration = document.getElementById('transitionDuration');
const transitionDurationValue = document.getElementById('transitionDurationValue');
const transitionDurationRow = document.getElementById('transitionDurationRow');

if (toggleTransitions) {
    toggleTransitions.addEventListener('change', function () {
        window.transitionSettings.enabled = this.checked;
        if (transitionDurationRow) {
            transitionDurationRow.style.opacity = this.checked ? '1' : '0.5';
        }
    });
}

if (transitionDuration) {
    transitionDuration.addEventListener('input', function () {
        window.transitionSettings.duration = parseInt(this.value);
        if (transitionDurationValue) {
            transitionDurationValue.textContent = this.value + 'ms';
        }
    });
}

// Initialize transition duration row opacity
if (transitionDurationRow) {
    transitionDurationRow.style.opacity = '0.5';
}

render();
controls.addEventListener('change', () => {
    render();
});

// Export THREE.js
window.THREE = THREE;

// Export functions
window.selectAtom = selectAtom;
window.unselectAtom = unselectAtom;
window.applyChargeVisualization = applyChargeVisualization;
window.applyForceVisualization = applyForceVisualization;
window.updateBondColorsForDisplay = updateBondColorsForDisplay;
window.getChargeArray = getChargeArray;
window.rotateSelectedAtoms = rotateSelectedAtoms;
window.translateSelectedAtoms = translateSelectedAtoms;
window.updateEditingContent = updateEditingContent;
window.attachButtonEventListeners = attachButtonEventListeners;
window.rotateCamera = rotateCamera;
window.render = render;
window.initializeRotationState = initializeRotationState;
window.updateMoleculeVisualization = updateMoleculeVisualization;
window.createInfoLabel = createInfoLabel;
window.removeBondLengthLabel = removeBondLengthLabel;
window.clearAllBondLengthLabels = clearAllBondLengthLabels;
window.calculateBondLength = calculateBondLength;
window.calculateAngle = calculateAngle;
window.updateFragmentList = updateFragmentList;
window.updateEditingContent = updateEditingContent;

window.exportToXYZ = function (name = 'molecule') {
    const atoms = window.main?.data?.atomData;
    if (!atoms?.length) return null;

    let content = `${atoms.length}\n${name}\n`;
    atoms.forEach(a => {
        content += `${a.element.padEnd(4)} ${a.x.toFixed(6).padStart(12)} ${a.y.toFixed(6).padStart(12)} ${a.z.toFixed(6).padStart(12)}\n`;
    });
    return content;
};

window.exportToPDB = function () {
    const atoms = window.main?.data?.atomData;
    if (!atoms?.length) return null;

    // Calculate bonds
    const bonds = new Map(); // atom index -> array of bonded atom indices
    const covalentRadii = {
        'H': 0.31, 'C': 0.76, 'N': 0.71, 'O': 0.66, 'F': 0.57, 'P': 1.07, 'S': 1.05,
        'Cl': 1.02, 'Br': 1.20, 'I': 1.39, 'B': 0.84, 'Si': 1.11, 'Se': 1.20,
        'default': 0.77
    };

    const getRadius = (el) => covalentRadii[el] || covalentRadii['default'];

    for (let i = 0; i < atoms.length; i++) {
        bonds.set(i + 1, []);
        for (let j = i + 1; j < atoms.length; j++) {
            const a1 = atoms[i], a2 = atoms[j];
            const dx = a1.x - a2.x, dy = a1.y - a2.y, dz = a1.z - a2.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const maxBondDist = (getRadius(a1.element) + getRadius(a2.element)) * 1.3;

            if (dist <= maxBondDist && dist > 0.4) {
                bonds.get(i + 1).push(j + 1);
                if (!bonds.has(j + 1)) bonds.set(j + 1, []);
                bonds.get(j + 1).push(i + 1);
            }
        }
    }

    let content = '';

    // ATOM records
    atoms.forEach((a, i) => {
        const serial = (i + 1).toString().padStart(5);
        const name = a.element.padStart(2).padEnd(4);
        const resName = 'MOL';
        const chainId = 'A';
        const resSeq = '1'.padStart(4);
        const x = a.x.toFixed(3).padStart(8);
        const y = a.y.toFixed(3).padStart(8);
        const z = a.z.toFixed(3).padStart(8);
        const occupancy = '1.00'.padStart(6);
        const tempFactor = '0.00'.padStart(6);
        const element = a.element.padStart(2);

        content += `HETATM${serial} ${name} ${resName} ${chainId}${resSeq}    ${x}${y}${z}${occupancy}${tempFactor}          ${element}\n`;
    });

    // CONECT records
    bonds.forEach((connected, atomNum) => {
        if (connected.length > 0) {
            let conect = `CONECT${atomNum.toString().padStart(5)}`;
            connected.forEach(c => {
                conect += c.toString().padStart(5);
            });
            content += conect + '\n';
        }
    });

    content += 'END\n';
    return content;
};

window.exportToSDF = function (name = 'molecule') {
    const atoms = window.main?.data?.atomData;
    if (!atoms?.length) return null;

    // Calculate bonds based on covalent radii
    const bonds = [];
    const covalentRadii = {
        'H': 0.31, 'C': 0.76, 'N': 0.71, 'O': 0.66, 'F': 0.57, 'P': 1.07, 'S': 1.05,
        'Cl': 1.02, 'Br': 1.20, 'I': 1.39, 'B': 0.84, 'Si': 1.11, 'Se': 1.20,
        'default': 0.77
    };

    const getRadius = (el) => covalentRadii[el] || covalentRadii['default'];

    for (let i = 0; i < atoms.length; i++) {
        for (let j = i + 1; j < atoms.length; j++) {
            const a1 = atoms[i], a2 = atoms[j];
            const dx = a1.x - a2.x, dy = a1.y - a2.y, dz = a1.z - a2.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const maxBondDist = (getRadius(a1.element) + getRadius(a2.element)) * 1.3;

            if (dist <= maxBondDist && dist > 0.4) {
                bonds.push({ i: i + 1, j: j + 1, order: 1 });
            }
        }
    }

    const numAtoms = atoms.length.toString().padStart(3);
    const numBonds = bonds.length.toString().padStart(3);

    let content = `${name}\n`;
    content += `  ChopChopMol\n\n`;
    content += `${numAtoms}${numBonds}  0  0  0  0  0  0  0  0999 V2000\n`;

    // Atom block
    atoms.forEach(a => {
        const x = a.x.toFixed(4).padStart(10);
        const y = a.y.toFixed(4).padStart(10);
        const z = a.z.toFixed(4).padStart(10);
        const element = ` ${a.element.padEnd(3)}`;
        content += `${x}${y}${z}${element} 0  0  0  0  0  0  0  0  0  0  0  0\n`;
    });

    // Bond block
    bonds.forEach(b => {
        const i = b.i.toString().padStart(3);
        const j = b.j.toString().padStart(3);
        const order = b.order.toString().padStart(3);
        content += `${i}${j}${order}  0  0  0  0\n`;
    });

    content += 'M  END\n';
    return content;
};

window.exportToMol2 = function (name = 'molecule') {
    const atoms = window.main?.data?.atomData;
    if (!atoms?.length) return null;

    let content = `@<TRIPOS>MOLECULE\n${name}\n${atoms.length} 0 0 0 0\nSMALL\nNO_CHARGES\n\n@<TRIPOS>ATOM\n`;

    atoms.forEach((a, i) => {
        const id = (i + 1).toString().padStart(7);
        const name = `${a.element}${i + 1}`.padEnd(8);
        const x = a.x.toFixed(4).padStart(10);
        const y = a.y.toFixed(4).padStart(10);
        const z = a.z.toFixed(4).padStart(10);
        const type = a.element.padEnd(6);
        content += `${id} ${name}${x}${y}${z} ${type}    1 MOL         0.0000\n`;
    });

    return content;
};

window.exportToFormat = function (format, name = 'molecule') {
    switch (format) {
        case 'pdb': return window.exportToPDB();
        case 'mol': case 'sdf': return window.exportToSDF(name);
        case 'mol2': return window.exportToMol2(name);
        case 'xyz': default: return window.exportToXYZ(name);
    }
};

// Export variables using defineProperty to keep in sync
Object.defineProperty(window, 'atomsSelected', {
    get: function () { return atomsSelected; },
    set: function (val) { atomsSelected = val; },
    configurable: true
});

Object.defineProperty(window, 'rotationAxis', {
    get: function () { return rotationAxis; },
    set: function (val) { rotationAxis = val; },
    configurable: true
});

Object.defineProperty(window, 'axisAtoms', {
    get: function () { return axisAtoms; },
    set: function (val) { axisAtoms = val; },
    configurable: true
});

Object.defineProperty(window, 'rotationState', {
    get: function () { return rotationState; },
    set: function (val) { rotationState = val; },
    configurable: true
});

Object.defineProperty(window, 'labelMode', {
    get: function () { return labelMode; },
    set: function (val) { labelMode = val; },
    configurable: true
});

Object.defineProperty(window, 'ribbonMode', {
    get: function () { return typeof ribbonMode !== 'undefined' ? ribbonMode : false; },
    set: function (val) { if (typeof ribbonMode !== 'undefined') ribbonMode = val; },
    configurable: true
});

Object.defineProperty(window, 'fragments', {
    get: function () { return fragments; },
    set: function (val) { fragments = val; },
    configurable: true
});
Object.defineProperty(window, 'bondLengthLabels', {
    get: function () { return bondLengthLabels; },
    set: function (val) { bondLengthLabels = val; },
    configurable: true
});


animate();
