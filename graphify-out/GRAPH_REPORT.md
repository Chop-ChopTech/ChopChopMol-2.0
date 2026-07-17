# Graph Report - .  (2026-07-09)

## Corpus Check
- 80 files · ~469,378 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 955 nodes · 1665 edges · 67 communities (49 shown, 18 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 144 edges (avg confidence: 0.72)
- Token cost: 887,232 input · 0 output

## Community Hubs (Navigation)
- Main Controller Scene Setup
- Local File Explorer
- Remote SSH File Browser
- Molecule Mesh Rendering
- Frames Scans and Parsing
- Chat UI and Job Polling
- Pointer Picking and Selection
- Access Gate and Billing Pages
- Deployment and AWS Migration
- Feature Gating and DOM Cache
- AI Agent Tools and BYOK
- Molecule Lifecycle and Fragments
- MACE and DFT Backend Calls
- Molecular File Parsers
- App Shell Screenshot
- Roadmap and Legal Docs
- Stripe Premium Subscription
- Atom Rotation and Translation
- Mobile UI Panels
- MACE Fine-Tuning Guide
- Geometry Measurement Labels
- Web Terminal Manager
- Protein Ribbon Rendering
- AWS Cognito Authentication
- Molecular File Export
- Chemical Database Search
- Atom Bond LOD Primitives
- Toast Notifications
- Atom Editing Panel Screenshot
- Charge and Force Coloring
- Orbital Isosurface Generation
- Style Panel Screenshot
- AI Chat Screenshot
- Undo Redo Manager
- Energy Chart Screenshot
- AI Agent Test Harness
- Environment Map Lighting
- Atom Hover Interactions
- Early Access Gate
- Measurement Overlay Screenshot
- Ball and Stick Screenshot
- Style Preferences Persistence
- NPM Package Config
- Molecular Graph Traversal
- Marching Cubes Worker
- Cognito Auth Migration
- DynamoDB Firestore Migration
- Cloud Molecule Storage
- ExtXYZ Serialization
- Session Heartbeat Tracking
- Onboarding Tutorial
- Frontend Deploy Script
- EC2 Resize Script
- EC2 Start Script
- EC2 Status Script
- EC2 Stop Script
- Model Picker Thinking Toggle
- Signed In Indicator
- BYOK Key Save
- Voice Silence Detection
- Cloud Molecule Load
- Cloud Molecule List
- Model List Rendering
- Account Icon Update
- Energy Chart Button

## God Nodes (most connected - your core abstractions)
1. `FileExplorer` - 61 edges
2. `Molecule` - 53 edges
3. `render()` - 40 edges
4. `RemoteFileManager` - 21 edges
5. `FileHandler` - 19 edges
6. `onPointerDown()` - 17 edges
7. `ChopChopMol Fixes List` - 16 edges
8. `isolateFragment()` - 14 edges
9. `TerminalManager` - 13 edges
10. `ChopChopMol 2.0 Features Roadmap` - 13 edges

## Surprising Connections (you probably didn't know these)
- `postJson body override (Medium)` --references--> `postJson()`  [EXTRACTED]
  fixes.pdf → demo/utils/apiUtils.js
- `AWS Backend Deployment Guide` --semantically_similar_to--> `ChopChopMol AWS Migration Guide`  [INFERRED] [semantically similar]
  aws.md → AWS_MIGRATION_GUIDE.md
- `Extended Thinking Budget Selector (Off/Low/Med/High)` --references--> `demo/index.html`  [INFERRED]
  screenshots/ai-chat.png → fixes.pdf
- `AI Assistant Chat Panel` --references--> `demo/index.html`  [INFERRED]
  screenshots/app-hero.png → fixes.pdf
- `Feature gating fixed (Critical)` --references--> `updateFeatureAccess()`  [EXTRACTED]
  fixes.pdf → demo/handleFeatures.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **AWS Target Architecture Services** — aws_migration_guide_ec2_gpu_backend, aws_migration_guide_dynamodb, aws_migration_guide_cognito, aws_migration_guide_s3_cloudfront, aws_migration_guide_caddy [EXTRACTED 0.90]
- **Legacy Stack Being Decommissioned** — aws_migration_guide_render, aws_migration_guide_runpod, aws_migration_guide_firestore, aws_migration_guide_firebase_auth, aws_migration_guide_firebase_hosting [EXTRACTED 0.90]
- **AWS Backend Deployment Options** — aws_ec2_option, aws_elastic_beanstalk_option, aws_app_runner_option, aws_lightsail_option [EXTRACTED 0.90]
- **High Priority Roadmap Features** — demo_plan_pbc_visualization, demo_plan_advanced_selection_language, demo_plan_normal_mode_animation, demo_plan_reaction_path_neb, demo_plan_orbital_visualization [EXTRACTED 1.00]
- **Guavion Legal Agreement (Terms + Privacy)** — demo_terms_of_service_document, demo_privacy_policy_document, demo_privacy_policy_guavion [EXTRACTED 1.00]
- **Early-Access Request and Approval Flow** — demo_early_access_html, demo_early_access_embed_html, demo_admin_html, demo_early_access_access_api [INFERRED 0.80]
- **Chat streaming render pipeline (SSE → tool rows / thinking / charts)** — demo_index_handlesend, demo_index_sse_streaming_protocol, demo_index_toolstatusmap, demo_index_tooliconmap, demo_index_renderinlinechart, demo_index_showtyping, demo_index_addmessage [EXTRACTED 0.90]
- **Conversation persistence subsystem (serialize/save/load/render)** — demo_index_serializeconversation, demo_index_autosaveconversation, demo_index_saveconversation, demo_index_loadandrenderconversation, demo_index_renderconversationfromhistory, demo_index_openhistorydrawer [INFERRED 0.85]
- **Background MACE job recovery flow (poll → apply result → update UI)** — demo_index_checkpendingjobs, demo_index_pollforjob, demo_index_processcompletedjob, demo_index_updatetoolrowstatus, demo_index_formatjobresult, demo_index_showframeslider [EXTRACTED 0.90]
- **Premium subscription checkout flow** — upgrade_index_premium_page, upgrade_index_subscribetopremium, upgrade_index_firebase_auth, upgrade_index_stripe_checkout [EXTRACTED 0.90]
- **Third-party data processing (AI, auth, payments)** — privacy_ai_chat_flow, privacy_byok_keys, privacy_firebase, privacy_stripe [INFERRED 0.75]
- **Hero 3D molecule rendering pipeline** — index_hero_molecule_renderer, index_molecule_data, index_animate_loop [EXTRACTED 0.90]
- **MACE/PySCF Fine-tuning Pipeline Stages** — demo_mace_pyscf_finetuning_guide_geometry_dataset, demo_mace_pyscf_finetuning_guide_pyscf_labeling, demo_mace_pyscf_finetuning_guide_finetuning_strategy, demo_mace_pyscf_finetuning_guide_active_learning, demo_mace_pyscf_finetuning_guide_core_loop [EXTRACTED 0.85]
- **Training Target and Fine-tuning Mode Choices** — demo_mace_pyscf_finetuning_guide_direct_learning, demo_mace_pyscf_finetuning_guide_delta_learning, demo_mace_pyscf_finetuning_guide_finetuning_modes [INFERRED 0.80]
- **Resource / memory leak fixes** — fixes_chartjs_memory_leak, fixes_threejs_memory_leaks, fixes_thinking_timer_cleanup, fixes_sse_timeout_timer_leak [INFERRED 0.75]
- **Frame/energy alignment fixes** — fixes_frame_energy_desync, fixes_orca_parser_mismatch, demo_utils_frameutils_loadframes [INFERRED 0.75]
- **Defensive parsing and input validation fixes** — fixes_sse_jsonparse_trycatch, fixes_tool_args_jsonparse, fixes_input_validation [INFERRED 0.75]
- **Style Adjustment Panel Controls** — demo_adjust_style_roughness_slider, demo_adjust_style_metalness_slider, demo_adjust_style_color_picker [INFERRED 0.85]
- **Molecular Viewport Rendering** — demo_demo2_molecule, demo_demo2_ball_stick_style, demo_demo2_cpk_coloring [INFERRED 0.75]
- **Atom Editing Controls** — demo_editing_replace_atom_button, demo_editing_remove_atom_button, demo_editing_create_fragment_button [EXTRACTED 1.00]
- **Rotation Axis Workflow** — demo_editing_rotation_axis_panel, demo_editing_remove_axis_button, demo_editing_rotate_slider, demo_editing_molecule_viewport [INFERRED 0.85]
- **Stacked tool rows in AI response** — screenshots_ai_chat_ai_response, screenshots_ai_chat_toggle_labels_tool, screenshots_ai_chat_bond_distance_tool [INFERRED 0.85]
- **Chat input controls (thinking budget, model, send)** — screenshots_ai_chat_input, screenshots_ai_chat_thinking_selector, screenshots_ai_chat_model_selector [INFERRED 0.85]
- **Three-Panel App Shell (Chat, Viewport, Files)** — screenshots_app_hero_ai_assistant_panel, screenshots_app_hero_3d_viewport, screenshots_app_hero_file_explorer [EXTRACTED 1.00]
- **Chat Input Controls (thinking, model, input)** — screenshots_app_hero_thinking_toggle, screenshots_app_hero_model_selector, screenshots_app_hero_chat_input [EXTRACTED 1.00]
- **Geometry Measurement Overlays** — screenshots_editing_angle_label, screenshots_editing_angle_arc, screenshots_editing_bond_length_label [EXTRACTED 1.00]
- **3D Editing Scene Composition** — screenshots_editing_viewport, screenshots_editing_ball_stick_molecule, screenshots_editing_nitrogen_atom, screenshots_editing_axis_lines [INFERRED 0.75]
- **Torsion Scan to Energy Calculation to Chart Pipeline** — screenshots_energy_torsion_scan_c4c5, screenshots_energy_mace_mpa0_source, screenshots_energy_torsion_energy_chart [INFERRED 0.85]
- **Secondary Structure Coloring Scheme** — screenshots_protein_alpha_helix, screenshots_protein_beta_sheet, screenshots_protein_coil_loop [EXTRACTED 1.00]
- **Ribbon Rendering Pipeline** — screenshots_protein_ribbon_rendering, screenshots_protein_backbone_ca, demo_utils_ribbon [INFERRED 0.85]
- **Torsion Scan to Energy Calculation to Chart Pipeline** — screenshots_torsion_scan_scan, screenshots_torsion_scan_mace_mp0a, screenshots_torsion_scan_energy_curve [INFERRED 0.85]

## Communities (67 total, 18 thin omitted)

### Community 0 - "Main Controller Scene Setup"
Cohesion: 0.02
Nodes (83): addFragmentToGlobalStore(), ambientLight, analyzeMoleculeButton, applyBackgroundColorToUI(), atomSizeSelector, atomsSelected, axisAtoms, backgroundColorSelector (+75 more)

### Community 2 - "Remote SSH File Browser"
Cohesion: 0.07
Nodes (23): MOLECULE_EXTENSIONS, RemoteFileManager, getAuthHeaders(), getBackendUrl(), getBackendUrlSync(), onBackendUrlOverride(), _pingHealth(), safeFetch() (+15 more)

### Community 4 - "Frames Scans and Parsing"
Cohesion: 0.05
Nodes (41): chopchopmol-ai-backend/app.py, demo/index.html, ChopChopMol App Icon, Ball-and-Stick Molecular Rendering, Benzene Molecule, createFrame(), generateTransformFrames(), getCurrentFrameIndex() (+33 more)

### Community 5 - "Chat UI and Job Polling"
Cohesion: 0.07
Nodes (39): addMessage (append chat message), autoSaveConversation (debounced persist), checkPendingJobs (restore background jobs), closeHistoryDrawer, createHistoryDrawer, deleteConversation, _downloadChartAsPNG, escapeHtml (+31 more)

### Community 6 - "Pointer Picking and Selection"
Cohesion: 0.14
Nodes (30): animate(), animateImplosion(), getActiveCamera(), getDisplayColorForAtom(), getScreenUrl(), highlightFragment(), isAtomInSelection(), onPointerDown() (+22 more)

### Community 7 - "Access Gate and Billing Pages"
Cohesion: 0.10
Nodes (26): act (approve/reject an access request), authedFetch (admin, Firebase ID token bearer), Admin Access Queue Page, load (fetch and render access requests), Access Control Backend API (/access/*), Early-Access Embeddable Form (Squarespace, dependency-free), Early-Access Request Page, Bring Your Own API Key (BYOK) — keys stay in browser localStorage (+18 more)

### Community 8 - "Deployment and AWS Migration"
Cohesion: 0.12
Nodes (25): Test and Deploy Workflow, Firebase Hosting Deploy on Merge, Firebase Hosting Deploy on PR, App Runner Option, AWS Backend Deployment Guide, CPU-only Dockerfile, EC2 Deployment Option, Amazon ECR Container Registry (+17 more)

### Community 9 - "Feature Gating and DOM Cache"
Cohesion: 0.13
Nodes (18): disableAtomInteraction(), enableAllFeatures(), enableAtomInteraction(), enableFreeFeatures(), hideRestrictionMessage(), mouse, originalEventHandlers, raycaster (+10 more)

### Community 10 - "AI Agent Tools and BYOK"
Cohesion: 0.12
Nodes (21): AI_CONFIG, BYOK_PREFIX, BYOK_STORAGE, byokGet(), byokHasFor(), compressToolResult(), extractScanXValues(), FUNCTIONS (+13 more)

### Community 11 - "Molecule Lifecycle and Fragments"
Cohesion: 0.17
Nodes (19): attachButtonEventListeners(), generateDataFromAtoms(), getFragmentsForIsolation(), initializeFragmentStore(), initializeSelectionBox(), isolateFragment(), loadMolecule(), Main (+11 more)

### Community 12 - "MACE and DFT Backend Calls"
Cohesion: 0.14
Nodes (22): postJson(), streamSSE(), callDftEnergy(), callDftEnergyBatch(), callDftEnergyBatchStream(), callDftEnergyStream(), callMaceEnergy(), callMaceEnergyBatch() (+14 more)

### Community 14 - "App Shell Screenshot"
Cohesion: 0.12
Nodes (17): MOLECULE_EXTENSIONS, Open Folder should access general files (e.g. Downloads), 3D Molecular Viewport, AI Assistant Chat Panel, ChopChopMol App Shell (Three-Panel Layout), Atom Labels (element + index, e.g. C0, O1, N2), Ball-and-Stick Molecule Rendering, Chat Input (Ask me anything + send/mic) (+9 more)

### Community 15 - "Roadmap and Legal Docs"
Cohesion: 0.12
Nodes (18): MIT License (ChopChopMol 2.0), Advanced Selection Language, Batch Processing, Normal Mode Animation (Vibrations), Electron Density / Orbital Visualization, Periodic Boundary Conditions (PBC) Visualization, Plugin / Extension System, Enhanced Protein Tools (+10 more)

### Community 16 - "Stripe Premium Subscription"
Cohesion: 0.13
Nodes (7): activatePremium(), checkFirebasePremium(), enablePremiumFeatures(), FEATURE_LIMITS, initializePremium(), premiumState, STORAGE_LIMITS

### Community 17 - "Atom Rotation and Translation"
Cohesion: 0.20
Nodes (17): attachAxisEventListeners(), attachEnhancedRotationHandlers(), attachKeyboardShortcuts(), attachMouseWheelRotation(), clampAngle(), createAxisVisualizer(), finalizeRotation(), initializeRotationState() (+9 more)

### Community 18 - "Mobile UI Panels"
Cohesion: 0.18
Nodes (5): initMobileUI(), initVirtualKeyboardHandler(), isMobile(), MobilePanelCoordinator, MobileToolbarController

### Community 19 - "MACE Fine-Tuning Guide"
Cohesion: 0.16
Nodes (16): Fine-tuning a MACE MLIP using PySCF — Practical Guide, Active Learning Loop, Core Fine-tuning Loop, Delta-Learning (ΔE Correction), Direct Learning Target, Fine-tuning Modes (Scratch / Domain Adaptation / Δ-model), MACE Fine-tuning Strategy, Geometry Dataset Construction (+8 more)

### Community 20 - "Geometry Measurement Labels"
Cohesion: 0.19
Nodes (15): calculateAngle(), calculateBondLength(), calculateDihedral(), clearAllBondLengthLabels(), createContextMenu(), createInfoLabel(), getAtomWorldPosition(), onAtomsMoved() (+7 more)

### Community 22 - "Protein Ribbon Rendering"
Cohesion: 0.18
Nodes (13): computeRMF(), createContinuousRibbon(), createRibbon(), getThickness(), getWidth(), Alpha Helices (Magenta), Backbone CA Trace, Beta Strands (Yellow) (+5 more)

### Community 23 - "AWS Cognito Authentication"
Cohesion: 0.30
Nodes (13): _b64url(), _challenge(), _clearTokens(), _decodeJwt(), getIdToken(), getUser(), handleRedirectCallback(), isSignedIn() (+5 more)

### Community 24 - "Molecular File Export"
Cohesion: 0.29
Nodes (12): detectFormat(), downloadFile(), generateTimestamp(), saveFile(), saveToFileExplorer(), writeExtXYZ(), writeGRO(), writeMOL() (+4 more)

### Community 25 - "Chemical Database Search"
Cohesion: 0.24
Nodes (12): load(), loadChEMBL(), loadDrugBank(), loadPDB(), loadPubChem(), parseSDF(), search(), searchChEMBL() (+4 more)

### Community 26 - "Atom Bond LOD Primitives"
Cohesion: 0.22
Nodes (5): Atom, Bond, LOD_LEVELS, lodGeometryCache, Hardcoded /4 replaced by molecule.stretch (Medium)

### Community 27 - "Toast Notifications"
Cohesion: 0.31
Nodes (10): dismissToast(), DURATIONS, escapeHtml(), getContainer(), ICONS, toast(), toastError(), toastInfo() (+2 more)

### Community 28 - "Atom Editing Panel Screenshot"
Cohesion: 0.20
Nodes (10): Atom Editing Panel, Create Fragment Button, Editing Instructions (shift-drag to move, cmd/ctrl to multi-select), Selected Element Indicator (Element: C), 3D Molecule Viewport with Rotation Axis Line, Remove Atom Button, Remove Axis Button, Replace Atom Button (+2 more)

### Community 29 - "Charge and Force Coloring"
Cohesion: 0.24
Nodes (9): applyChargeVisualization(), applyForceVisualization(), buildChargeArray(), buildChargeColorCache(), buildForceColorCache(), getChargeArray(), getChargeEntries(), getForceMagnitudes() (+1 more)

### Community 30 - "Orbital Isosurface Generation"
Cohesion: 0.24
Nodes (5): EDGE_TABLE, generateIsosurfaceAsync(), generatePhaseSeparatedIsosurface(), getMarchingCubesWorker(), TRI_TABLE

### Community 31 - "Style Panel Screenshot"
Cohesion: 0.25
Nodes (9): 3D Molecule Viewport (Ball-and-Stick), Atom RGB Color Picker, PBR Material Appearance Control, Metalness Slider, Roughness Slider, Adjust Style Panel Screenshot, Toggle Style Changes Panel, Toggle Antialiasing Checkbox (+1 more)

### Community 32 - "AI Chat Screenshot"
Cohesion: 0.22
Nodes (9): demo/handleFeatures.js, Atom Labels (element symbol + index), Setting Bond Distance Tool Row, Caffeine Molecule (24 atoms, ball-and-stick), Bond Distance Measurement (3.00 A axis line), Toggling Labels Tool Row, Stacked Tool Row, Top Toolbar (search, styles, features, avatar) (+1 more)

### Community 33 - "Undo Redo Manager"
Cohesion: 0.31
Nodes (6): createUndoButtons(), showNotification(), undoManager, updateUndoButtons(), Missing undo snapshots (High), window.undoManager exposed globally (Critical)

### Community 34 - "Energy Chart Screenshot"
Cohesion: 0.25
Nodes (9): AI Chat Panel (GPT-5.2, flowing layout), create_chart AI Tool Row, Dihedral Angle (deg) X-Axis, Energy (eV) Y-Axis, 3D Molecule Viewport with Frame Slider (Frame 43/73), MACE mpa-0 ML Potential Data Source, Periodic Two-Peak Rotational Barrier Trend, Torsion Scan Energy Profile Chart (+1 more)

### Community 35 - "AI Agent Test Harness"
Cohesion: 0.33
Nodes (8): CONFIG, fs, mockToolResult(), parseXYZ(), path, runTests(), sendPrompt(), validateResponse()

### Community 36 - "Environment Map Lighting"
Cohesion: 0.29
Nodes (8): applyEnvMap(), applyEnvTexture(), disableEnvMap(), getPolyhavenUrl(), loadEnvMap(), recreateRenderer(), updateEnvMapIntensity(), updateEnvMapLoadingUI()

### Community 37 - "Atom Hover Interactions"
Cohesion: 0.29
Nodes (8): disableAtomInteractions(), enableAtomInteractions(), enhancedOnPointerDown(), enhancedRaycast(), getAtomRadius(), onPointerMove2(), sillyStartHoverIn(), sillyStartHoverOut()

### Community 38 - "Early Access Gate"
Cohesion: 0.38
Nodes (7): _accessMe (GET /access/me), evaluateAccessGate (early-access gate), gateAwaitBackend (wait for EC2 backend health), gateHide, gateShow, isGuestBypassed, tryGuestBypass (guest code 0852)

### Community 39 - "Measurement Overlay Screenshot"
Cohesion: 0.29
Nodes (7): Green Angle Measurement Triangle, Angle Measurement Label (120.0 degrees), Colored Rotation Axis Lines, Ball-and-Stick Amine Molecule, Bond Length Label (1.49), Blue Nitrogen Atom (Amine), 3D Molecule Editing Viewport

### Community 40 - "Ball and Stick Screenshot"
Cohesion: 0.33
Nodes (6): Ball-and-Stick Rendering Style, Chart/Data Toolbar Icon, CPK Element Coloring (C grey, O red, N blue, H white), Rendered Molecule (Adrenaline/Epinephrine-like), File Upload Toolbar Icon, 3D Molecular Viewport (Ball-and-Stick)

### Community 41 - "Style Preferences Persistence"
Cohesion: 0.53
Nodes (5): applyStylePreferences(), loadStylePreferences(), resetToDefaults(), saveStylePreferences(), showNotification()

### Community 42 - "NPM Package Config"
Cohesion: 0.33
Nodes (5): dependencies, firebase, scripts, test:ai, test:ai:local

### Community 43 - "Molecular Graph Traversal"
Cohesion: 0.60
Nodes (4): buildAdjacencyList(), findConnectedFragment(), findFragmentAvoidingVertex(), setupFragmentTransform()

### Community 44 - "Marching Cubes Worker"
Cohesion: 0.40
Nodes (3): EDGE_TABLE, EDGE_VERTICES, TRI_TABLE

### Community 45 - "Cognito Auth Migration"
Cohesion: 0.50
Nodes (4): auth-cognito.js Frontend Auth Module, Amazon Cognito Authentication, cognito_auth.py JWT Verifier, Firebase Authentication

### Community 46 - "DynamoDB Firestore Migration"
Cohesion: 0.67
Nodes (4): data_store.py boto3 Data Layer, DynamoDB Database (5 tables), Firebase Firestore Database, migrate_firestore_to_dynamodb.py

### Community 47 - "Cloud Molecule Storage"
Cohesion: 0.50
Nodes (4): checkStorageLimit (70MB quota), deleteMolecule, saveMolecule (cloud Firestore save), updateStorageIndicator

### Community 48 - "ExtXYZ Serialization"
Cohesion: 0.67
Nodes (4): formatAtomLine(), generateMultiFrameExtxyz(), generateSingleFrameExtxyz(), getExtxyzProperties()

### Community 49 - "Session Heartbeat Tracking"
Cohesion: 0.67
Nodes (3): _currentUserId, initHeartbeat (60s session heartbeat), initIdleTracker (15-min idle logout)

### Community 50 - "Onboarding Tutorial"
Cohesion: 0.67
Nodes (3): renderStep (tutorial tooltip), showStep (tutorial step), startTutorial (onboarding overlay)

## Ambiguous Edges - Review These
- `demo/index.html` → `Not mobile responsive / misaligned on mobile`  [AMBIGUOUS]
  fixes.pdf · relation: conceptually_related_to
- `demo/index.html` → `UI covers model names`  [AMBIGUOUS]
  fixes.pdf · relation: conceptually_related_to

## Knowledge Gaps
- **221 isolated node(s):** `deploy-frontend.sh script`, `resize-instance.sh script`, `start-instance.sh script`, `status-instance.sh script`, `stop-instance.sh script` (+216 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `demo/index.html` and `Not mobile responsive / misaligned on mobile`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `demo/index.html` and `UI covers model names`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `ChopChopMol Fixes List` connect `Frames Scans and Parsing` to `Main Controller Scene Setup`, `Undo Redo Manager`, `Remote SSH File Browser`, `Feature Gating and DOM Cache`, `AI Agent Tools and BYOK`, `MACE and DFT Backend Calls`, `App Shell Screenshot`?**
  _High betweenness centrality (0.260) - this node is a cross-community bridge._
- **Why does `FileExplorer` connect `Local File Explorer` to `App Shell Screenshot`?**
  _High betweenness centrality (0.087) - this node is a cross-community bridge._
- **Why does `Open Folder should access general files (e.g. Downloads)` connect `App Shell Screenshot` to `Frames Scans and Parsing`?**
  _High betweenness centrality (0.085) - this node is a cross-community bridge._
- **What connects `deploy-frontend.sh script`, `resize-instance.sh script`, `start-instance.sh script` to the rest of the system?**
  _223 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Main Controller Scene Setup` be split into smaller, more focused modules?**
  _Cohesion score 0.019597069597069597 - nodes in this community are weakly interconnected._