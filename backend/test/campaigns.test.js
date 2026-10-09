import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { bypassAuth } from './authTestHelper.js';

const BUSINESS_ID = '96a26c1b-eae8-4cf2-bfe1-beba2827461d';
const OTHER_BUSINESS_ID = 'f3d24e3c-3e8c-4732-8224-3e71e1b73e62';
const TEMPLATE_ID = '4a9f2baa-eae0-4f7c-b2d4-4d3d2e1cffb8';
const OTHER_TEMPLATE_ID = '8c144f5c-55c0-4d48-a21c-a3fb3adf2a33';
const CAMPAIGN_ID = 'b5d4484c-5001-4cdc-b276-8ee96715d6b4';
const OTHER_CAMPAIGN_ID = '9c01ac38-6a1b-4b92-93cb-a4e5aa916e61';

function fakeBusinessService() { return { findById: async (id) => ({ data: [BUSINESS_ID, OTHER_BUSINESS_ID].includes(id) ? { id } : null, error: null }) }; }
function fakeTemplateService() { return { findById: async (id) => ({ data: id === TEMPLATE_ID ? { id, business_id: BUSINESS_ID } : id === OTHER_TEMPLATE_ID ? { id, business_id: 'f3d24e3c-3e8c-4732-8224-3e71e1b73e62' } : null, error: null }) }; }
function fakeCampaignService({ updateResult } = {}) {
  const rows = [{ id: CAMPAIGN_ID, business_id: BUSINESS_ID, template_id: TEMPLATE_ID, name: 'Autumn reviews', status: 'draft', scheduled_at: null }, { id: OTHER_CAMPAIGN_ID, business_id: OTHER_BUSINESS_ID, template_id: OTHER_TEMPLATE_ID, name: 'Other reviews', status: 'draft', scheduled_at: null }];
  return {
    listByBusinessId: async (businessId) => ({ data: rows.filter((row) => row.business_id === businessId), error: null }),
    findById: async (id, businessId = null) => ({ data: rows.find((row) => row.id === id && (!businessId || row.business_id === businessId)) ?? null, error: null }),
    create: async (values) => { const row = { id: '9c01ac38-6a1b-4b92-93cb-a4e5aa916e61', ...values }; rows.push(row); return { data: row, error: null }; },
    update: async (id, values, businessId = null) => { if (updateResult) return updateResult; const row = rows.find((item) => item.id === id && (!businessId || item.business_id === businessId)); if (!row) return { data: null, error: null }; Object.assign(row, values); return { data: row, error: null }; },
    remove: async (id, businessId = null) => { const index = rows.findIndex((row) => row.id === id && (!businessId || row.business_id === businessId)); return { data: index < 0 ? null : rows.splice(index, 1)[0], error: null }; },
  };
}

async function withClientApi(callback) {
  const server = createApp({
    businessService: fakeBusinessService(),
    messageTemplateService: fakeTemplateService(),
    campaignService: fakeCampaignService(),
    authMiddleware: (request, _response, next) => {
      request.profile = { role: 'client', business_id: BUSINESS_ID };
      next();
    },
  }).listen();
  try { await callback(`http://127.0.0.1:${server.address().port}`); } finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}
async function withApi(callback, options = {}) {
  const server = createApp({ businessService: fakeBusinessService(),
    authMiddleware: bypassAuth,
    messageTemplateService: fakeTemplateService(), campaignService: options.campaignService ?? fakeCampaignService(options) }).listen();
  try { await callback(`http://127.0.0.1:${server.address().port}`); } finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }

}
test('Campaign API validates business-scoped list and template ownership', async () => {
  await withApi(async (url) => {
    assert.equal((await fetch(`${url}/campaigns`)).status, 400);
    const wrongTemplate = await fetch(`${url}/campaigns`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: BUSINESS_ID, template_id: OTHER_TEMPLATE_ID, name: 'Bad', status: 'draft' }) });
    assert.equal(wrongTemplate.status, 400);
    assert.equal((await fetch(`${url}/campaigns?business_id=${BUSINESS_ID}`)).status, 200);
  });
});
test('Campaign API creates scheduled campaigns and enforces status transitions', async () => {
  await withApi(async (url) => {
    const missingDate = await fetch(`${url}/campaigns`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: BUSINESS_ID, template_id: TEMPLATE_ID, name: 'Scheduled', status: 'scheduled' }) });
    assert.equal(missingDate.status, 400);
    const create = await fetch(`${url}/campaigns`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: BUSINESS_ID, template_id: TEMPLATE_ID, name: 'Scheduled', status: 'scheduled', scheduled_at: '2026-10-01T10:00:00Z' }) });
    assert.equal(create.status, 201);
    const invalid = await fetch(`${url}/campaigns/${CAMPAIGN_ID}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'completed' }) });
    assert.equal(invalid.status, 400);
    const valid = await fetch(`${url}/campaigns/${CAMPAIGN_ID}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'cancelled' }) });
    assert.equal(valid.status, 200);
  });
});
test('Campaign API reads, updates, and deletes campaigns', async () => {
  await withApi(async (url) => {
    assert.equal((await fetch(`${url}/campaigns/${CAMPAIGN_ID}`)).status, 200);
    const update = await fetch(`${url}/campaigns/${CAMPAIGN_ID}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Updated reviews' }) });
    assert.equal(update.status, 200);
    assert.equal((await fetch(`${url}/campaigns/${CAMPAIGN_ID}`, { method: 'DELETE' })).status, 204);
  });
});

test('Campaign API isolates client access by business', async () => {
  await withClientApi(async (url) => {
    assert.equal((await fetch(`${url}/campaigns?business_id=${OTHER_BUSINESS_ID}`)).status, 403);
    assert.equal((await fetch(`${url}/campaigns/${OTHER_CAMPAIGN_ID}`)).status, 404);

    const wrongBusinessCreate = await fetch(`${url}/campaigns`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: OTHER_BUSINESS_ID, template_id: TEMPLATE_ID, name: 'Tampered', status: 'draft' }) });
    assert.equal(wrongBusinessCreate.status, 403);

    const wrongTemplateCreate = await fetch(`${url}/campaigns`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: BUSINESS_ID, template_id: OTHER_TEMPLATE_ID, name: 'Tampered template', status: 'draft' }) });
    assert.equal(wrongTemplateCreate.status, 400);

    const wrongBusinessUpdate = await fetch(`${url}/campaigns/${OTHER_CAMPAIGN_ID}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Tampered' }) });
    assert.equal(wrongBusinessUpdate.status, 404);
    assert.equal((await fetch(`${url}/campaigns/${OTHER_CAMPAIGN_ID}`, { method: 'DELETE' })).status, 404);
  });
});

test('Campaign API returns 404 when an update affects no campaign', async () => {
  await withApi(async (url) => {
    const response = await fetch(`${url}/campaigns/${CAMPAIGN_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'No-op update' }),
    });

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'Campaign not found.' });
  }, { updateResult: { data: null, error: null } });
});
