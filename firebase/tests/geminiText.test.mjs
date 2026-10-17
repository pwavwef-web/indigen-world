import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readTextModelConfig, textModelEndpoint } from '../../services/functions/lib/gemini-text-policy.js';
import { plannerGenerationConfig } from '../../services/functions/lib/kawuri.js';
import { generate, setCommunityAutomationToolingClient } from '../../services/functions/lib/community-automation.js';

test('text consumers default to Gemini 4 global and retain independent rollback settings', () => {
  for (const scope of ['KAWURI', 'COMMUNITY_AUTOMATION']) {
    assert.deepEqual(readTextModelConfig({}, scope), { model: 'gemini-4-argon', location: 'global' });
    assert.deepEqual(readTextModelConfig({ [`${scope}_MODEL`]: ' ', [`${scope}_LOCATION`]: '' }, scope), { model: 'gemini-4-argon', location: 'global' });
  }
  const env = { KAWURI_MODEL: 'gemini-2.5-flash', KAWURI_LOCATION: 'us-central1', COMMUNITY_AUTOMATION_MODEL: ' gemini-3.8-flash ', COMMUNITY_AUTOMATION_LOCATION: ' global ' };
  assert.deepEqual(readTextModelConfig(env), { model: 'gemini-2.5-flash', location: 'us-central1' });
  assert.deepEqual(readTextModelConfig(env, 'COMMUNITY_AUTOMATION'), { model: 'gemini-3.8-flash', location: 'global' });
});

test('global and regional Vertex URLs route to their supported API hosts', () => {
  assert.equal(textModelEndpoint('demo-text', 'gemini-4-argon', 'global'), 'https://aiplatform.googleapis.com/v1/projects/demo-text/locations/global/publishers/google/models/gemini-4-argon:generateContent');
  assert.equal(textModelEndpoint('demo-text', 'gemini-2.5-flash', 'us-central1'), 'https://us-central1-aiplatform.googleapis.com/v1/projects/demo-text/locations/us-central1/publishers/google/models/gemini-2.5-flash:generateContent');
});

test('planner uses supported reasoning settings and reserves output room for Gemini 4', () => {
  const config = plannerGenerationConfig('gemini-4-argon');
  assert.deepEqual(config.thinkingConfig, { thinkingLevel: 'LOW' });
  assert.equal(config.responseMimeType, 'application/json');
  assert.ok(config.maxOutputTokens >= 2048);
  assert.equal('temperature' in config, false);
  assert.deepEqual(plannerGenerationConfig('gemini-2.5-flash'), {
    maxOutputTokens: 512, temperature: 0, thinkingConfig: { thinkingBudget: 0 }, responseMimeType: 'application/json',
  });
});

test('community text generation sends a Gemini 4 schema request and rejects truncated output', async () => {
  let finishReason = 'STOP';
  setCommunityAutomationToolingClient({ models: { async generateContent(request) {
    assert.equal(request.model, 'gemini-4-argon');
    assert.deepEqual(request.config.thinkingConfig, { thinkingLevel: 'LOW' });
    assert.ok(request.config.maxOutputTokens >= 4096);
    assert.equal(request.config.responseMimeType, 'application/json');
    assert.deepEqual(request.config.responseJsonSchema.required, ['text']);
    assert.equal('temperature' in request.config, false);
    return { candidates: [{ finishReason }], text: '{"text":"Synthetic verification"}' };
  } } });
  try {
    assert.deepEqual(await generate('Synthetic English evidence', { text: { type: 'string' } }), { text: 'Synthetic verification' });
    finishReason = 'MAX_TOKENS';
    await assert.rejects(generate('Synthetic English evidence', { text: { type: 'string' } }), /did not finish/);
  } finally { setCommunityAutomationToolingClient(null); }
});
