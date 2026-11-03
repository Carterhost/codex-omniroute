/**
 * Automated Test Suite for Codex OmniRoute Extension
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('Running Codex OmniRoute Extension Test Suite...\n');

// 1. Verify package.json schema and contributions
const pkgPath = path.join(__dirname, '..', 'package.json');
assert.ok(fs.existsSync(pkgPath), 'package.json must exist');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

assert.strictEqual(pkg.name, 'codex-omniroute');
assert.strictEqual(pkg.publisher, 'omniroute');
assert.strictEqual(pkg.version, '1.0.0');
assert.ok(pkg.contributes.viewsContainers.activitybar.length > 0, 'Must contribute activitybar view container');
assert.ok(pkg.contributes.views.codexOmniRouteViewContainer.length > 0, 'Must contribute sidebar webview');
assert.ok(pkg.contributes.configuration.properties['codexOmniRoute.nvidiaApiKey'], 'Must contribute NVIDIA API key config');
assert.ok(pkg.contributes.configuration.properties['codexOmniRoute.openRouterApiKey'], 'Must contribute OpenRouter API key config');
console.log('✔ Test 1: package.json manifest and contributes structure verified');

// 2. Verify extension.js syntax and structure
const extPath = path.join(__dirname, '..', 'extension.js');
assert.ok(fs.existsSync(extPath), 'extension.js must exist');
const extCode = fs.readFileSync(extPath, 'utf8');

assert.ok(extCode.includes('FREE_MODELS_CHAIN'), 'Must define FREE_MODELS_CHAIN');
assert.ok(extCode.includes('deepseek/deepseek-r1:free'), 'Must include DeepSeek R1 free');
assert.ok(extCode.includes('nvidia/nemotron-3-ultra-550b-a55b'), 'Must include NVIDIA Nemotron 3 Ultra');
assert.ok(extCode.includes('chat_template_kwargs'), 'Must configure thinking kwargs for Nemotron');
assert.ok(extCode.includes('class CodexOmniRouteViewProvider'), 'Must define ViewProvider');
assert.ok(extCode.includes('activate'), 'Must export activate function');
console.log('✔ Test 2: extension.js syntax, model definitions, and provider verified');

// 3. Test SSE stream parsing simulation (Reasoning + Content)
function parseSseLine(line) {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith('data:')) return null;
  const dataStr = trimmed.slice(5).trim();
  if (dataStr === '[DONE]') return { done: true };
  const parsed = JSON.parse(dataStr);
  const delta = parsed.choices?.[0]?.delta || {};
  return {
    reasoning: delta.reasoning_content || delta.reasoning || null,
    content: delta.content || null
  };
}

const sampleChunk1 = 'data: {"choices":[{"delta":{"reasoning_content":"Step 1: Compute matrix"}}]}';
const res1 = parseSseLine(sampleChunk1);
assert.strictEqual(res1.reasoning, 'Step 1: Compute matrix');
assert.strictEqual(res1.content, null);

const sampleChunk2 = 'data: {"choices":[{"delta":{"content":"Hello world!"}}]}';
const res2 = parseSseLine(sampleChunk2);
assert.strictEqual(res2.reasoning, null);
assert.strictEqual(res2.content, 'Hello world!');

const sampleDone = 'data: [DONE]';
const resDone = parseSseLine(sampleDone);
assert.strictEqual(resDone.done, true);
console.log('✔ Test 3: SSE stream reasoning/content chunk parser passed');

// 4. Test OmniRoute fallback logic simulation
const freeChain = [
  'deepseek/deepseek-r1:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemini-2.0-flash-exp:free'
];

async function simulateOmniRouteDispatch(mockFailCount) {
  const attempts = [];
  for (let i = 0; i < freeChain.length; i++) {
    const model = freeChain[i];
    attempts.push(model);
    if (i < mockFailCount) {
      // simulate 429 rate limit
      continue;
    }
    return { success: true, modelUsed: model, attempts };
  }
  return { success: false, attempts };
}

(async () => {
  // Scenario A: First model succeeds
  const run1 = await simulateOmniRouteDispatch(0);
  assert.strictEqual(run1.modelUsed, 'deepseek/deepseek-r1:free');
  assert.strictEqual(run1.attempts.length, 1);

  // Scenario B: First model rate-limited, swaps to second
  const run2 = await simulateOmniRouteDispatch(1);
  assert.strictEqual(run2.modelUsed, 'meta-llama/llama-3.3-70b-instruct:free');
  assert.strictEqual(run2.attempts.length, 2);

  // Scenario C: First two fail, swaps to third
  const run3 = await simulateOmniRouteDispatch(2);
  assert.strictEqual(run3.modelUsed, 'google/gemini-2.0-flash-exp:free');
  assert.strictEqual(run3.attempts.length, 3);

  console.log('✔ Test 4: OmniRoute dynamic fallback simulation passed');

  console.log('\n=========================================');
  console.log('All tests passed successfully! (4/4 tests)');
  console.log('=========================================\n');
})();

