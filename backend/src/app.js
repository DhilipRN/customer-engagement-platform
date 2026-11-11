
import cors from 'cors';
import express from 'express';
import { requireAuth } from './middleware/auth.js';
import { createBusinessesRouter } from './routes/businesses.js';
import { createCustomersRouter } from './routes/customers.js';
import { createPurchasesRouter } from './routes/purchases.js';
import { createMessageTemplatesRouter } from './routes/messageTemplates.js';
import { createCampaignsRouter } from './routes/campaigns.js';
import { createMessagesRouter } from './routes/messages.js';
import { createReviewAutomationsRouter } from './routes/reviewAutomations.js';
import { createAppointmentsRouter } from './routes/Appointments.js';
import { createUserProfilesRouter } from './routes/userProfiles.js';
import { createCustomerComebackExclusionsRouter } from './routes/customerComebackExclusions.js';
import { createCustomerComebackMessagesRouter } from './routes/customerComebackMessages.js';
import { createBusinessMembershipsRouter } from './routes/businessMemberships.js';
import { createWhatsAppWebhooksRouter } from './routes/whatsappWebhooks.js';
import { getWhatsAppWebhookConfig } from './config/env.js';
import { createBusinessWhatsAppSettings } from './services/businessWhatsAppSettings.js';
import { createBusinessWhatsAppSettingsRouter } from './routes/businessWhatsAppSettings.js';
import { createPurchaseService } from './services/purchases.js';
import { createAppointmentService } from './services/Appointments.js';

export function createApp({
  businessService,
  customerService,
  purchaseService,
  messageTemplateService,
  campaignService,
  messageService,
  reviewAutomationService,
  appointmentService,
  activityEventService,
  customerComebackExclusionService,
  customerComebackMessageService,
  membershipService,
  businessAccessMiddleware,
  permissionService,
  supabaseClient,
  authMiddleware = requireAuth,
  getBusinessIdForPhoneNumberId,
  businessWhatsAppSettings,

} = {}) {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });

  const whatsappWebhookConfig = getWhatsAppWebhookConfig();
  app.use(
    '/api/webhooks/whatsapp',
    createWhatsAppWebhooksRouter({
      messageService,
      customerService,
      activityEventService,
      verifyToken: whatsappWebhookConfig.verifyToken,
      getBusinessIdForPhoneNumberId:
        getBusinessIdForPhoneNumberId ??
        (async () => whatsappWebhookConfig.businessId),
    }),
  );

  app.use(authMiddleware);

  app.use(
    '/api/businesses',
    createBusinessWhatsAppSettingsRouter({
      settingsService: businessWhatsAppSettings ?? createBusinessWhatsAppSettings(),
      businessService,
      businessAccessMiddleware,
      permissionService,
    }),
  );

  app.use(
    '/businesses',
    createBusinessMembershipsRouter({
      businessService,
      membershipService,
      permissionService,
      activityEventService,
    }),
  );

  app.use(
    '/businesses',
    createBusinessesRouter({
      businessService,
      activityEventService,
      permissionService,
    }),
  );

  app.use(
    '/customers',
    createCustomersRouter({
      businessService,
      customerService,
      purchaseService: purchaseService ?? (
        supabaseClient ? createPurchaseService(supabaseClient) : undefined
      ),
      appointmentService: appointmentService ?? (
        supabaseClient ? createAppointmentService(supabaseClient) : undefined
      ),
      activityEventService,
      messageService,
      businessAccessMiddleware,
    })
  );

  app.use(
    '/purchases',
    createPurchasesRouter({
      businessService,
      customerService,
      purchaseService,
      reviewAutomationService,
      messageTemplateService,
      messageService,
      activityEventService,
      businessAccessMiddleware,
      permissionService,
    })
  );

  app.use(
    '/message-templates',
    createMessageTemplatesRouter({
      businessService,
      messageTemplateService,
      activityEventService,
      businessAccessMiddleware,
      permissionService,
    })
  );

  app.use(
    '/campaigns',
    createCampaignsRouter({
      businessService,
      messageTemplateService,
      campaignService,
      activityEventService,
      businessAccessMiddleware,
      permissionService,
    })
  );

  app.use(
    '/messages',
    createMessagesRouter({
      businessService,
      customerService,
      messageTemplateService,
      campaignService,
      messageService,
      businessAccessMiddleware,
    })
  );

  app.use(
    '/review-automations',
    createReviewAutomationsRouter({
      businessService,
      messageTemplateService,
      reviewAutomationService,
      activityEventService,
      businessAccessMiddleware,
      permissionService,
    })
  );

    app.use(
    '/appointments',
    createAppointmentsRouter({
      appointmentService,
      businessService,
      customerService,
      messageTemplateService,
      messageService,
      activityEventService,
      businessAccessMiddleware,
      permissionService,
    })
  );

app.use(
  '/user-profiles',
  createUserProfilesRouter({ supabaseClient, activityEventService })
);

  app.use(
    '/customer-comeback-exclusions',
    createCustomerComebackExclusionsRouter({
      customerService,
      exclusionService: customerComebackExclusionService,
      businessAccessMiddleware,
      permissionService,
    })
  );

  app.use(
    '/customer-comeback-messages',
    createCustomerComebackMessagesRouter({
      businessService,
      customerService,
      purchaseService,
      appointmentService,
      messageTemplateService,
      exclusionService: customerComebackExclusionService,
      messageService: customerComebackMessageService ?? messageService,
      businessAccessMiddleware,
      permissionService,
    })
  );

  app.use((error, _request, response, _next) => {
    if (error instanceof SyntaxError && 'body' in error) {
      return response.status(400).json({ error: 'Invalid JSON request body.' });
    }

    console.error(error);
    return response.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}
