import cors from 'cors';
import express from 'express';
import { createBusinessesRouter } from './routes/businesses.js';
import { createCustomersRouter } from './routes/customers.js';
import { createPurchasesRouter } from './routes/purchases.js';
import { createMessageTemplatesRouter } from './routes/messageTemplates.js';
import { createCampaignsRouter } from './routes/campaigns.js';
import { createMessagesRouter } from './routes/messages.js';

export function createApp({ businessService, customerService, purchaseService, messageTemplateService, campaignService, messageService } = {}) {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });

  app.use('/businesses', createBusinessesRouter({ businessService }));
  app.use('/customers', createCustomersRouter({ businessService, customerService }));
  app.use('/purchases', createPurchasesRouter({ businessService, customerService, purchaseService }));
  app.use('/message-templates', createMessageTemplatesRouter({ businessService, messageTemplateService }));
  app.use('/campaigns', createCampaignsRouter({ businessService, messageTemplateService, campaignService }));
  app.use('/messages', createMessagesRouter({ businessService, customerService, messageTemplateService, campaignService, messageService }));

  app.use((error, _request, response, _next) => {
    if (error instanceof SyntaxError && 'body' in error) {
      return response.status(400).json({ error: 'Invalid JSON request body.' });
    }

    console.error(error);
    return response.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}
