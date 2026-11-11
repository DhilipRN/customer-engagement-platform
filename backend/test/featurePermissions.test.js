import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createCampaignsRouter } from '../src/routes/campaigns.js';
import { createMessageTemplatesRouter } from '../src/routes/messageTemplates.js';
import { createPurchasesRouter } from '../src/routes/purchases.js';
import { createAppointmentsRouter } from '../src/routes/Appointments.js';
import { createReviewAutomationsRouter } from '../src/routes/reviewAutomations.js';
import { createCustomerComebackExclusionsRouter } from '../src/routes/customerComebackExclusions.js';
import { createCustomerComebackMessagesRouter } from '../src/routes/customerComebackMessages.js';

const BUSINESS_ID = '96a26c1b-eae8-4cf2-bfe1-beba2827461d';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const REVIEW_AUTOMATION_ID = 'b5d4484c-5001-4cdc-b276-8ee96715d6b4';
const PURCHASE_ID = 'c6e5595d-6112-4dde-c387-9ff0782e6c5f';
const APPOINTMENT_ID = 'd7f66a6e-7223-4eef-d498-a0a1893f7d60';
const TEMPLATE_ID = 'e8a77b7f-8334-4ff0-e5a2-b1b2904e8e71';
const COMEBACK_EXCLUSION_CUSTOMER_ID = 'f9b88c8f-9445-4aa1-f6b3-c2c3915f9f82';
const CAMPAIGN_ID = 'a1c99d90-1556-4bb2-a7c4-d3d4a06a0a93';

const businessService = { findById: async (id) => ({ data: { id }, error: null }) };
const emptyActivity = { create: async () => ({ data: { id: USER_ID }, error: null }) };

function accessWithPermissions(permissions) {
  return (request, _response, next) => {
    request.businessAuthorization = {
      authorized: true,
      source: 'membership',
      membership: { business_id: BUSINESS_ID, role: 'receptionist' },
      permissions,
    };
    next();
  };
}

function routerFor(feature, permissions, services = {}) {
  const businessAccessMiddleware = accessWithPermissions(permissions);
  const common = { businessAccessMiddleware, businessService, permissionService: {} };

  if (feature === 'campaigns') {
    return createCampaignsRouter({
      ...common,
      campaignService: services.campaignService ?? {
        listByBusinessId: async () => ({ data: [], error: null }),
      },
    });
  }
  if (feature === 'templates') {
    return createMessageTemplatesRouter({
      ...common,
      messageTemplateService: services.messageTemplateService ?? {
        listByBusinessId: async () => ({ data: [], error: null }),
      },
    });
  }
  if (feature === 'purchases') {
    return createPurchasesRouter({
      ...common,
      purchaseService: services.purchaseService ?? {
        list: async () => ({ data: [], error: null }),
      },
    });
  }
  if (feature === 'appointments') {
    return createAppointmentsRouter({
      ...common,
      appointmentService: services.appointmentService ?? {
        listByBusinessId: async () => ({ data: [], error: null }),
      },
    });
  }
  if (feature === 'review-automations') {
    return createReviewAutomationsRouter({
      ...common,
      reviewAutomationService: services.reviewAutomationService ?? {
        findByBusinessId: async () => ({ data: null, error: null }),
      },
    });
  }
  if (feature === 'comeback-exclusions') {
    return createCustomerComebackExclusionsRouter({
      businessAccessMiddleware,
      exclusionService: services.exclusionService ?? {
        listByBusinessId: async () => ({ data: [], error: null }),
      },
    });
  }
  return createCustomerComebackMessagesRouter({
    businessAccessMiddleware,
    businessService,
    messageService: services.messageService,
    activityEventService: emptyActivity,
  });
}

async function requestReviewAutomationDelete(allowed) {
  let deleted = false;
  const automation = {
    id: REVIEW_AUTOMATION_ID,
    business_id: BUSINESS_ID,
    enabled: true,
    delay_minutes: 120,
    template_id: TEMPLATE_ID,
  };
  const automationBefore = structuredClone(automation);
  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    request.user = { id: USER_ID };
    request.profile = { id: USER_ID, role: 'client', business_id: BUSINESS_ID };
    next();
  });
  app.use('/feature', routerFor('review-automations', { manage_automations: allowed }, {
    reviewAutomationService: {
      findById: async () => ({
        data: automation,
        error: null,
      }),
      remove: async () => {
        deleted = true;
        return { data: { id: REVIEW_AUTOMATION_ID }, error: null };
      },
    },
  }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/feature/${REVIEW_AUTOMATION_ID}?business_id=${BUSINESS_ID}`,
      { method: 'DELETE' },
    );
    return { response, deleted, automation, automationBefore };
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function requestPurchaseDelete(allowed) {
  let removeCalls = 0;
  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    request.user = { id: USER_ID };
    request.profile = { id: USER_ID, role: 'client', business_id: BUSINESS_ID };
    next();
  });
  app.use('/feature', routerFor('purchases', { manage_purchases: allowed }, {
    purchaseService: {
      remove: async () => {
        removeCalls += 1;
        return { data: { id: PURCHASE_ID, business_id: BUSINESS_ID }, error: null };
      },
    },
  }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/feature/${PURCHASE_ID}?business_id=${BUSINESS_ID}`,
      { method: 'DELETE' },
    );
    return { response, removeCalls };
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function requestPurchaseCreate(allowed) {
  let createCalls = 0;
  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    request.user = { id: USER_ID };
    request.profile = { id: USER_ID, role: 'client', business_id: BUSINESS_ID };
    next();
  });
  app.use('/feature', routerFor('purchases', { manage_purchases: allowed }, {
    purchaseService: {
      create: async () => {
        createCalls += 1;
        return { data: { id: PURCHASE_ID, business_id: BUSINESS_ID }, error: null };
      },
    },
  }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/feature`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          business_id: BUSINESS_ID,
          customer_id: COMEBACK_EXCLUSION_CUSTOMER_ID,
          amount: 10,
          purchase_date: '2026-10-21',
          product_name: 'Permission Test Purchase',
        }),
      },
    );
    return { response, createCalls };
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function requestAppointmentDelete(allowed) {
  let removeCalls = 0;
  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    request.user = { id: USER_ID };
    request.profile = { id: USER_ID, role: 'client', business_id: BUSINESS_ID };
    next();
  });
  app.use('/feature', routerFor('appointments', { manage_appointments: allowed }, {
    appointmentService: {
      remove: async () => {
        removeCalls += 1;
        return { data: { id: APPOINTMENT_ID, business_id: BUSINESS_ID }, error: null };
      },
    },
  }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/feature/${APPOINTMENT_ID}?business_id=${BUSINESS_ID}`,
      { method: 'DELETE' },
    );
    return { response, removeCalls };
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function requestAppointmentCreate(allowed) {
  let createCalls = 0;
  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    request.user = { id: USER_ID };
    request.profile = { id: USER_ID, role: 'client', business_id: BUSINESS_ID };
    next();
  });
  app.use('/feature', routerFor('appointments', { manage_appointments: allowed }, {
    appointmentService: {
      create: async () => {
        createCalls += 1;
        return { data: { id: APPOINTMENT_ID, business_id: BUSINESS_ID }, error: null };
      },
    },
  }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/feature`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          business_id: BUSINESS_ID,
          customer_id: COMEBACK_EXCLUSION_CUSTOMER_ID,
          appointment_date: '2026-10-21',
          appointment_time: '10:00',
          appointment_type: 'Permission Test Appointment',
          template_id: TEMPLATE_ID,
        }),
      },
    );
    return { response, createCalls };
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function requestTemplateDelete(allowed) {
  let removeCalls = 0;
  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    request.user = { id: USER_ID };
    request.profile = { id: USER_ID, role: 'client', business_id: BUSINESS_ID };
    next();
  });
  app.use('/feature', routerFor('templates', { manage_message_templates: allowed }, {
    messageTemplateService: {
      remove: async () => {
        removeCalls += 1;
        return { data: { id: TEMPLATE_ID, business_id: BUSINESS_ID }, error: null };
      },
    },
  }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/feature/${TEMPLATE_ID}?business_id=${BUSINESS_ID}`,
      { method: 'DELETE' },
    );
    return { response, removeCalls };
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function requestTemplateCreate(allowed) {
  let createCalls = 0;
  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    request.user = { id: USER_ID };
    request.profile = { id: USER_ID, role: 'client', business_id: BUSINESS_ID };
    next();
  });
  app.use('/feature', routerFor('templates', { manage_message_templates: allowed }, {
    messageTemplateService: {
      create: async () => {
        createCalls += 1;
        return { data: { id: TEMPLATE_ID, business_id: BUSINESS_ID }, error: null };
      },
    },
  }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/feature`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          business_id: BUSINESS_ID,
          name: 'Permission Test Template',
          category: 'transactional',
          message: 'Permission test message',
        }),
      },
    );
    return { response, createCalls };
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function requestComebackExclusionDelete(allowed) {
  let removeCalls = 0;
  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    request.user = { id: USER_ID };
    request.profile = { id: USER_ID, role: 'client', business_id: BUSINESS_ID };
    next();
  });
  app.use('/feature', routerFor('comeback-exclusions', { manage_automations: allowed }, {
    exclusionService: {
      remove: async () => {
        removeCalls += 1;
        return {
          data: {
            business_id: BUSINESS_ID,
            customer_id: COMEBACK_EXCLUSION_CUSTOMER_ID,
          },
          error: null,
        };
      },
    },
  }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/feature/${COMEBACK_EXCLUSION_CUSTOMER_ID}?business_id=${BUSINESS_ID}`,
      { method: 'DELETE' },
    );
    return { response, removeCalls };
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function requestComebackExclusionCreate(allowed) {
  let createCalls = 0;
  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    request.user = { id: USER_ID };
    request.profile = { id: USER_ID, role: 'client', business_id: BUSINESS_ID };
    next();
  });
  app.use('/feature', routerFor('comeback-exclusions', { manage_automations: allowed }, {
    exclusionService: {
      create: async () => {
        createCalls += 1;
        return {
          data: {
            business_id: BUSINESS_ID,
            customer_id: COMEBACK_EXCLUSION_CUSTOMER_ID,
          },
          error: null,
        };
      },
    },
  }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/feature?business_id=${BUSINESS_ID}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customer_id: COMEBACK_EXCLUSION_CUSTOMER_ID }),
      },
    );
    return { response, createCalls };
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function requestCampaignDelete(allowed) {
  let removeCalls = 0;
  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    request.user = { id: USER_ID };
    request.profile = { id: USER_ID, role: 'client', business_id: BUSINESS_ID };
    next();
  });
  app.use('/feature', routerFor('campaigns', { manage_campaigns: allowed }, {
    campaignService: {
      remove: async () => {
        removeCalls += 1;
        return { data: { id: CAMPAIGN_ID, business_id: BUSINESS_ID }, error: null };
      },
    },
  }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/feature/${CAMPAIGN_ID}?business_id=${BUSINESS_ID}`,
      { method: 'DELETE' },
    );
    return { response, removeCalls };
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function requestCampaignCreate(allowed) {
  let createCalls = 0;
  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    request.user = { id: USER_ID };
    request.profile = { id: USER_ID, role: 'client', business_id: BUSINESS_ID };
    next();
  });
  app.use('/feature', routerFor('campaigns', { manage_campaigns: allowed }, {
    campaignService: {
      create: async () => {
        createCalls += 1;
        return { data: { id: CAMPAIGN_ID, business_id: BUSINESS_ID }, error: null };
      },
    },
  }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/feature`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          business_id: BUSINESS_ID,
          name: 'Permission Test Campaign',
          template_id: TEMPLATE_ID,
        }),
      },
    );
    return { response, createCalls };
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function requestReviewAutomationUpdate(allowed) {
  let updateCalls = 0;
  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    request.user = { id: USER_ID };
    request.profile = { id: USER_ID, role: 'client', business_id: BUSINESS_ID };
    next();
  });
  app.use('/feature', routerFor('review-automations', { manage_automations: allowed }, {
    reviewAutomationService: {
      update: async () => {
        updateCalls += 1;
        return { data: { id: REVIEW_AUTOMATION_ID, business_id: BUSINESS_ID }, error: null };
      },
    },
  }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/feature/${REVIEW_AUTOMATION_ID}?business_id=${BUSINESS_ID}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      },
    );
    return { response, updateCalls };
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function requestReviewAutomationCreate(allowed) {
  let createCalls = 0;
  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    request.user = { id: USER_ID };
    request.profile = { id: USER_ID, role: 'client', business_id: BUSINESS_ID };
    next();
  });
  app.use('/feature', routerFor('review-automations', { manage_automations: allowed }, {
    reviewAutomationService: {
      create: async () => {
        createCalls += 1;
        return { data: { id: REVIEW_AUTOMATION_ID, business_id: BUSINESS_ID }, error: null };
      },
    },
  }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/feature`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          business_id: BUSINESS_ID,
          enabled: false,
          template_id: TEMPLATE_ID,
        }),
      },
    );
    return { response, createCalls };
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function requestComebackMessageCreate(allowed) {
  let createCalls = 0;
  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    request.user = { id: USER_ID };
    request.profile = { id: USER_ID, role: 'client', business_id: BUSINESS_ID };
    next();
  });
  app.use('/feature', routerFor('comeback-messages', { manage_automations: allowed }, {
    messageService: {
      create: async () => {
        createCalls += 1;
        return { data: { id: '2205fdc5-37a0-4390-a4b9-47914f3aadb5' }, error: null };
      },
    },
  }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/feature`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          business_id: BUSINESS_ID,
          customer_id: COMEBACK_EXCLUSION_CUSTOMER_ID,
          template_id: TEMPLATE_ID,
          days: 30,
        }),
      },
    );
    return { response, createCalls };
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function requestFeature(feature, permission, allowed, method = 'GET') {
  const permissions = { [permission]: allowed };
  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    request.user = { id: USER_ID };
    request.profile = { id: USER_ID, role: 'client', business_id: BUSINESS_ID };
    next();
  });
  app.use('/feature', routerFor(feature, permissions));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    const path = feature === 'comeback-messages'
      ? '/feature'
      : `/feature?business_id=${BUSINESS_ID}`;
    return await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: method === 'POST' ? JSON.stringify({ business_id: BUSINESS_ID }) : undefined,
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

const readCases = [
  ['campaigns', 'view_campaigns'],
  ['templates', 'view_message_templates'],
  ['purchases', 'view_purchases'],
  ['appointments', 'view_appointments'],
  ['review-automations', 'view_automations'],
  ['comeback-exclusions', 'view_automations'],
];

for (const [feature, permission] of readCases) {
  test(`${feature} read requires ${permission}`, async () => {
    assert.equal((await requestFeature(feature, permission, true)).status, 200);
    assert.equal((await requestFeature(feature, permission, false)).status, 403);
  });
}

const manageCases = [
  ['campaigns', 'manage_campaigns'],
  ['templates', 'manage_message_templates'],
  ['purchases', 'manage_purchases'],
  ['appointments', 'manage_appointments'],
  ['review-automations', 'manage_automations'],
  ['comeback-exclusions', 'manage_automations'],
  ['comeback-messages', 'manage_automations'],
];

for (const [feature, permission] of manageCases) {
  test(`${feature} mutation requires ${permission}`, async () => {
    assert.equal((await requestFeature(feature, permission, false, 'POST')).status, 403);
  });
}

test('read permission does not grant campaign mutation permission', async () => {
  const response = await requestFeature('campaigns', 'manage_campaigns', false, 'POST');
  assert.equal(response.status, 403);
});

test('review automation deletion requires manage_automations', async () => {
  const { response, deleted, automation, automationBefore } = await requestReviewAutomationDelete(false);
  assert.equal(response.status, 403);
  assert.equal(deleted, false);
  assert.deepEqual(automation, automationBefore);
});

test('purchase deletion requires manage_purchases', async () => {
  const { response, removeCalls } = await requestPurchaseDelete(false);
  assert.equal(response.status, 403);
  assert.equal(removeCalls, 0);
});

test('appointment deletion requires manage_appointments', async () => {
  const { response, removeCalls } = await requestAppointmentDelete(false);
  assert.equal(response.status, 403);
  assert.equal(removeCalls, 0);
});

test('message-template deletion requires manage_message_templates', async () => {
  const { response, removeCalls } = await requestTemplateDelete(false);
  assert.equal(response.status, 403);
  assert.equal(removeCalls, 0);
});

test('Customer Comeback exclusion deletion requires manage_automations', async () => {
  const { response, removeCalls } = await requestComebackExclusionDelete(false);
  assert.equal(response.status, 403);
  assert.equal(removeCalls, 0);
});

test('campaign deletion requires manage_campaigns', async () => {
  const { response, removeCalls } = await requestCampaignDelete(false);
  assert.equal(response.status, 403);
  assert.equal(removeCalls, 0);
});

test('review automation update requires manage_automations', async () => {
  const { response, updateCalls } = await requestReviewAutomationUpdate(false);
  assert.equal(response.status, 403);
  assert.equal(updateCalls, 0);
});

test('Customer Comeback message creation requires manage_automations', async () => {
  const { response, createCalls } = await requestComebackMessageCreate(false);
  assert.equal(response.status, 403);
  assert.equal(createCalls, 0);
});

test('Customer Comeback exclusion creation requires manage_automations', async () => {
  const { response, createCalls } = await requestComebackExclusionCreate(false);
  assert.equal(response.status, 403);
  assert.equal(createCalls, 0);
});

test('campaign creation requires manage_campaigns', async () => {
  const { response, createCalls } = await requestCampaignCreate(false);
  assert.equal(response.status, 403);
  assert.equal(createCalls, 0);
});

test('review automation creation requires manage_automations', async () => {
  const { response, createCalls } = await requestReviewAutomationCreate(false);
  assert.equal(response.status, 403);
  assert.equal(createCalls, 0);
});

test('purchase creation requires manage_purchases', async () => {
  const { response, createCalls } = await requestPurchaseCreate(false);
  assert.equal(response.status, 403);
  assert.equal(createCalls, 0);
});

test('appointment creation requires manage_appointments', async () => {
  const { response, createCalls } = await requestAppointmentCreate(false);
  assert.equal(response.status, 403);
  assert.equal(createCalls, 0);
});

test('message-template creation requires manage_message_templates', async () => {
  const { response, createCalls } = await requestTemplateCreate(false);
  assert.equal(response.status, 403);
  assert.equal(createCalls, 0);
});
