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
function fakeCampaignService({ updateResult, mutationCalls } = {}) {
  const rows = [{ id: CAMPAIGN_ID, business_id: BUSINESS_ID, template_id: TEMPLATE_ID, name: 'Autumn reviews', status: 'draft', scheduled_at: null }, { id: OTHER_CAMPAIGN_ID, business_id: OTHER_BUSINESS_ID, template_id: OTHER_TEMPLATE_ID, name: 'Other reviews', status: 'draft', scheduled_at: null }];
  return {
    rows,
    listByBusinessId: async (businessId) => ({ data: rows.filter((row) => row.business_id === businessId), error: null }),
    findById: async (id, businessId = null) => ({ data: rows.find((row) => row.id === id && (!businessId || row.business_id === businessId)) ?? null, error: null }),
    create: async (values) => { mutationCalls && (mutationCalls.create += 1); const row = { id: '9c01ac38-6a1b-4b92-93cb-a4e5aa916e61', ...values }; rows.push(row); return { data: row, error: null }; },
    update: async (id, values, businessId = null) => { mutationCalls && (mutationCalls.update += 1); if (updateResult) return updateResult; const row = rows.find((item) => item.id === id && (!businessId || item.business_id === businessId)); if (!row) return { data: null, error: null }; Object.assign(row, values); return { data: row, error: null }; },
    remove: async (id, businessId = null) => { mutationCalls && (mutationCalls.remove += 1); const index = rows.findIndex((row) => row.id === id && (!businessId || row.business_id === businessId)); return { data: index < 0 ? null : rows.splice(index, 1)[0], error: null }; },
  };
}

function createFakeActivityEventService(events = [], { fail = false } = {}) {
  return {
    events,
    async create(event) {
      if (fail) return { data: null, error: new Error('Simulated audit failure') };
      events.push(event);
      return { data: { id: `event-${events.length}` }, error: null };
    },
  };
}

async function withClientApi(callback, options = {}) {
  const server = createApp({
    businessService: fakeBusinessService(),
    messageTemplateService: fakeTemplateService(),
    campaignService: options.campaignService ?? fakeCampaignService(),
    authMiddleware: (request, _response, next) => {
      request.profile = { role: 'client', business_id: BUSINESS_ID };
      next();
    },
  }).listen();
  try { await callback(`http://127.0.0.1:${server.address().port}`); } finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}
async function withApi(callback, options = {}) {
  const activityEventService = options.activityEventService ?? createFakeActivityEventService();
  const server = createApp({ businessService: fakeBusinessService(),
    authMiddleware: bypassAuth,
    messageTemplateService: fakeTemplateService(),
    campaignService: options.campaignService ?? fakeCampaignService(options),
    activityEventService,
  }).listen();
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
  const mutationCalls = { create: 0, update: 0, remove: 0 };
  const campaignService = fakeCampaignService({ mutationCalls });
  const campaignBefore = structuredClone(
    campaignService.rows.find((row) => row.id === OTHER_CAMPAIGN_ID),
  );

  await withClientApi(async (url) => {
    assert.equal((await fetch(`${url}/campaigns?business_id=${OTHER_BUSINESS_ID}`)).status, 403);
    assert.equal((await fetch(`${url}/campaigns/${OTHER_CAMPAIGN_ID}`)).status, 404);

    const wrongBusinessCreate = await fetch(`${url}/campaigns`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: OTHER_BUSINESS_ID, template_id: TEMPLATE_ID, name: 'Tampered', status: 'draft' }) });
    assert.equal(wrongBusinessCreate.status, 403);
    assert.equal(mutationCalls.create, 0);

    const wrongTemplateCreate = await fetch(`${url}/campaigns`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: BUSINESS_ID, template_id: OTHER_TEMPLATE_ID, name: 'Tampered template', status: 'draft' }) });
    assert.equal(wrongTemplateCreate.status, 400);

    const wrongBusinessUpdate = await fetch(`${url}/campaigns/${OTHER_CAMPAIGN_ID}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Tampered' }) });
    assert.equal(wrongBusinessUpdate.status, 404);
    assert.equal(mutationCalls.update, 0);
    assert.deepEqual(
      campaignService.rows.find((row) => row.id === OTHER_CAMPAIGN_ID),
      campaignBefore,
    );
    assert.equal((await fetch(`${url}/campaigns/${OTHER_CAMPAIGN_ID}`, { method: 'DELETE' })).status, 404);
    assert.equal(mutationCalls.remove, 0);
    assert.deepEqual(
      campaignService.rows.find((row) => row.id === OTHER_CAMPAIGN_ID),
      campaignBefore,
    );
  }, { campaignService });
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

test('Campaign API records lifecycle audit events', async () => {
  const events = [];
  const campaign = {
    id: CAMPAIGN_ID,
    business_id: BUSINESS_ID,
    template_id: TEMPLATE_ID,
    name: 'Autumn reviews',
    status: 'draft',
    scheduled_at: null,
  };
  const campaignService = {
    findById: async () => ({ data: { ...campaign }, error: null }),
    create: async (values) => {
      Object.assign(campaign, values);
      return { data: { ...campaign }, error: null };
    },
    update: async (_id, values) => {
      Object.assign(campaign, values);
      return { data: { ...campaign }, error: null };
    },
    remove: async () => ({ data: { id: campaign.id }, error: null }),
  };
  const activityEventService = createFakeActivityEventService(events);

  await withApi(async (url) => {
    const create = await fetch(`${url}/campaigns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: BUSINESS_ID,
        template_id: TEMPLATE_ID,
        name: 'Lifecycle campaign',
        status: 'draft',
      }),
    });
    assert.equal(create.status, 201);

    const update = await fetch(`${url}/campaigns/${CAMPAIGN_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated lifecycle campaign' }),
    });
    assert.equal(update.status, 200);

    for (const [status, scheduledAt] of [
      ['scheduled', '2026-10-20T10:00:00.000Z'],
      ['running', undefined],
      ['completed', undefined],
    ]) {
      const body = scheduledAt ? { status, scheduled_at: scheduledAt } : { status };
      const response = await fetch(`${url}/campaigns/${CAMPAIGN_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 200);
    }

    const deleted = await fetch(`${url}/campaigns/${CAMPAIGN_ID}`, {
      method: 'DELETE',
    });
    assert.equal(deleted.status, 204);
  }, { campaignService, activityEventService });

  assert.deepEqual(events.map((event) => event.event_type), [
    'campaign.created',
    'campaign.updated',
    'campaign.scheduled',
    'campaign.started',
    'campaign.completed',
    'campaign.deleted',
  ]);
  assert.deepEqual(events[1].before, { name: 'Lifecycle campaign' });
  assert.deepEqual(events[1].after, { name: 'Updated lifecycle campaign' });
  assert.deepEqual(events[2].after, {
    status: 'scheduled',
    scheduled_at: '2026-10-20T10:00:00.000Z',
  });
  assert.equal(events[5].entity_id, CAMPAIGN_ID);
});

test('Campaign API records cancellation and reports audit failures explicitly', async () => {
  const events = [];
  const cancellationService = fakeCampaignService();
  const activityEventService = createFakeActivityEventService(events);

  await withApi(async (url) => {
    const response = await fetch(`${url}/campaigns/${CAMPAIGN_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    });
    assert.equal(response.status, 200);
  }, { campaignService: cancellationService, activityEventService });

  assert.deepEqual(events.map((event) => event.event_type), ['campaign.cancelled']);

  await withApi(async (url) => {
    const response = await fetch(`${url}/campaigns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: BUSINESS_ID,
        template_id: TEMPLATE_ID,
        name: 'Audit failure campaign',
        status: 'draft',
      }),
    });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: 'Campaign operation succeeded, but its audit event could not be recorded.',
    });
  }, { activityEventService: createFakeActivityEventService([], { fail: true }) });
});
