const fs = require('fs');
const path = require('path');

const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-config.json')));
BACKEND_URL = 'https://chopchopmol-ai-backend.onrender.com'
const DEBUG = process.env.DEBUG === 'true';

function parseXYZ(filepath) {
    const content = fs.readFileSync(filepath, 'utf-8');
    const lines = content.trim().split('\n');
    const numAtoms = parseInt(lines[0]);
    const atoms = [];

    for (let i = 2; i < 2 + numAtoms; i++) {
        const parts = lines[i].trim().split(/\s+/);
        atoms.push({
            type: parts[0],
            x: parseFloat(parts[1]),
            y: parseFloat(parts[2]),
            z: parseFloat(parts[3])
        });
    }

    const elements = {};
    atoms.forEach(a => elements[a.type] = (elements[a.type] || 0) + 1);

    return {
        hasAtoms: true,
        atomCount: numAtoms,
        selectedCount: 0,
        selectedIndices: [],
        fragments: [],
        hasAxis: false,
        axisAtoms: [],
        frameCount: 1,
        currentFrame: 0,
        hasMaceCache: false,
        maceFrameCount: 0,
        elements,
        atoms
    };
}

function mockToolResult(functionName, args, state) {
    if (DEBUG) console.log(`    [Tool] ${functionName}(${JSON.stringify(args)})`);

    switch (functionName) {
        case 'get_molecule_info':
            const formula = Object.entries(state.elements).map(([el, count]) => `${el}${count}`).join('');
            return {
                success: true,
                message: `${state.atomCount} atoms: ${Object.entries(state.elements).map(([k, v]) => `${v} ${k}`).join(', ')}`,
                data: { totalAtoms: state.atomCount, elements: state.elements, formula }
            };

        case 'select_atoms':
            return {
                success: true,
                message: `Selected ${args.indices?.length || 0} atoms`,
                selected: args.indices || []
            };

        case 'select_atoms_by_element':
            const element = args.element?.toUpperCase();
            const count = state.elements[element] || 0;
            const indices = [];
            state.atoms.forEach((a, i) => {
                if (a.type.toUpperCase() === element) indices.push(i);
            });
            return {
                success: true,
                message: `Selected ${count} ${element} atoms`,
                selectedCount: count,
                indices
            };

        case 'rotational_scan':
            // Mock a rotational scan - generates 36 frames (every 10 degrees)
            state.frameCount = 36;
            state.hasMaceCache = false;
            return {
                success: true,
                message: `Rotational scan complete: 36 frames generated (0° to 350°, 10° increments)`,
                frameCount: 36
            };

        case 'calculate_all_energies':
            // Mock MACE energy calculation
            const energies = [];
            for (let i = 0; i < state.frameCount; i++) {
                const angle = i * 10;
                // Simulate a typical torsion energy profile
                const energy = -150 + 5 * Math.sin(angle * Math.PI / 180) + 2 * Math.cos(2 * angle * Math.PI / 180);
                energies.push({
                    frame: i,
                    energy_eV: Math.round(energy * 1000) / 1000,
                    energy_kcal: Math.round(energy * 23.06 * 100) / 100
                });
            }
            state.hasMaceCache = true;
            state.maceFrameCount = state.frameCount;
            state.cachedEnergies = energies;
            return {
                success: true,
                message: `Calculated energies for ${state.frameCount} frames using ${args.model}`,
                frameCount: state.frameCount,
                energies,
                model: args.model
            };

        case 'get_cached_energies':
            if (!state.hasMaceCache) {
                return { success: false, message: "No cached MACE results" };
            }
            return {
                success: true,
                energies: state.cachedEnergies,
                frameCount: state.maceFrameCount
            };

        case 'create_chart':
            return {
                success: true,
                message: "Chart displayed",
                hasChart: true
            };

        case 'create_file':
            return {
                success: true,
                message: `Created file: ${args.filename}`
            };

        default:
            return { success: true, message: 'Done' };
    }
}

async function sendPrompt(message, state, sessionId) {
    let allContent = '';
    let allToolCalls = [];
    let lastToolCalls = [];
    const maxIterations = 10; // More iterations for complex workflows

    for (let iter = 0; iter < maxIterations; iter++) {
        const payload = {
            sessionId,
            state: { ...state }, // Send current state
            model: 'gpt-5-mini'
        };

        if (iter === 0) {
            payload.message = message;
        } else if (lastToolCalls.length > 0) {
            payload.message = '';
            payload.toolResults = {
                results: lastToolCalls.map(tc => {
                    const args = JSON.parse(tc.function.arguments || '{}');
                    const result = mockToolResult(tc.function.name, args, state);
                    return {
                        tool_call_id: tc.id,
                        content: JSON.stringify(result)
                    };
                })
            };
        } else {
            break;
        }

        if (DEBUG) console.log(`    [Iter ${iter}] Sending request...`);

        const response = await fetch(`${BACKEND_URL}/ai/chat/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const text = await response.text();
        if (DEBUG) console.log(`    [Response] ${text.slice(0, 300)}...`);

        const lines = text.split('\n').filter(l => l.startsWith('data: '));

        lastToolCalls = [];

        for (const line of lines) {
            try {
                const data = JSON.parse(line.slice(6));

                if (data.type === 'text' || data.type === 'content') {
                    allContent += data.content || '';
                }
                if (data.type === 'tool_calls' && Array.isArray(data.toolCalls)) {
                    lastToolCalls = data.toolCalls;
                    allToolCalls.push(...data.toolCalls);
                }
            } catch (e) {
                if (DEBUG) console.log(`    [Parse Error] ${e.message}`);
            }
        }

        if (DEBUG) {
            console.log(`    [Iter ${iter}] Content length: ${allContent.length}, Tools this iter: ${lastToolCalls.length}`);
            if (lastToolCalls.length > 0) {
                console.log(`    [Tools] ${lastToolCalls.map(tc => tc.function.name).join(', ')}`);
            }
        }

        if (lastToolCalls.length === 0) break;
    }

    return { content: allContent, toolCalls: allToolCalls };
}

function validateResponse(response, expect) {
    const { content, toolCalls } = response;
    const contentLower = (content || '').toLowerCase();

    switch (expect.type) {
        case 'contains':
            return expect.values.every(v => contentLower.includes(v.toLowerCase()));

        case 'contains_any':
            return expect.values.some(v => contentLower.includes(v.toLowerCase()));

        case 'function_called':
            if (!toolCalls || toolCalls.length === 0) return false;
            const allowedFunctions = Array.isArray(expect.function) ? expect.function : [expect.function];
            return toolCalls.some(tc => allowedFunctions.includes(tc.function?.name));

        case 'workflow':
            // Check that all expected steps were called in order
            if (!toolCalls || toolCalls.length === 0) return false;

            const calledFunctions = toolCalls.map(tc => ({
                name: tc.function?.name,
                args: JSON.parse(tc.function?.arguments || '{}')
            }));

            let searchStart = 0;
            for (const step of expect.steps) {
                let found = false;
                for (let i = searchStart; i < calledFunctions.length; i++) {
                    const called = calledFunctions[i];
                    if (called.name === step.function) {
                        // Check args if specified
                        if (step.args_contain) {
                            const argsMatch = Object.entries(step.args_contain).every(([key, value]) => {
                                if (typeof value === 'string') {
                                    return called.args[key]?.toLowerCase().includes(value.toLowerCase());
                                }
                                return called.args[key] === value;
                            });
                            if (!argsMatch) continue;
                        }
                        found = true;
                        searchStart = i + 1;
                        break;
                    }
                }
                if (!found) {
                    if (DEBUG) console.log(`    [Workflow] Missing step: ${step.function}`);
                    return false;
                }
            }
            return true;

        default:
            return false;
    }
}

async function runTests() {
    console.log('🧪 ChopChopMol AI Test Suite\n');

    const moleculePath = path.join(__dirname, 'fixtures', CONFIG.molecule);
    const state = parseXYZ(moleculePath);
    const sessionId = `test-${Date.now()}`;

    console.log(`📦 Loaded ${CONFIG.molecule}: ${state.atomCount} atoms`);
    console.log(`   Elements: ${JSON.stringify(state.elements)}\n`);

    let passed = 0;
    let failed = 0;
    const failures = [];

    for (const test of CONFIG.tests) {
        // Create fresh state for each test
        const testState = parseXYZ(moleculePath);

        process.stdout.write(`  ${test.name}... `);

        try {
            const response = await sendPrompt(test.prompt, testState, sessionId + '-' + test.name);
            const success = validateResponse(response, test.expect);

            if (success) {
                console.log('✅');
                passed++;
            } else {
                console.log('❌');
                failed++;
                failures.push({
                    name: test.name,
                    prompt: test.prompt,
                    expected: test.expect,
                    got: response.content ? response.content.slice(0, 200) : '(empty)',
                    toolsCalled: response.toolCalls?.map(tc => tc.function?.name) || []
                });
            }
        } catch (error) {
            console.log('❌ (error)');
            failed++;
            failures.push({
                name: test.name,
                error: error.message
            });
        }

        await new Promise(r => setTimeout(r, 1000)); // Longer delay for complex tests
    }

    console.log(`\n${'─'.repeat(40)}`);
    console.log(`Results: ${passed} passed, ${failed} failed`);

    if (failures.length > 0) {
        console.log('\nFailures:');
        failures.forEach(f => {
            console.log(`\n  ❌ ${f.name}`);
            if (f.error) {
                console.log(`     Error: ${f.error}`);
            } else {
                console.log(`     Prompt: "${f.prompt}"`);
                console.log(`     Expected: ${JSON.stringify(f.expected)}`);
                console.log(`     Got: "${f.got}"`);
                if (f.toolsCalled?.length > 0) {
                    console.log(`     Tools called: ${f.toolsCalled.join(' → ')}`);
                }
            }
        });
    }

    process.exit(failed > 0 ? 1 : 0);
}

runTests();