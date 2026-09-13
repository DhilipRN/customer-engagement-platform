import cors from 'cors';
import express from 'express';
import { createBusinessesRouter } from './routes/businesses.js';

export function createApp({ businessService } = {}) {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });

  app.use('/businesses', createBusinessesRouter({ businessService }));

  app.use((error, _request, response, _next) => {
    if (error instanceof SyntaxError && 'body' in error) {
      return response.status(400).json({ error: 'Invalid JSON request body.' });
    }

    console.error(error);
    return response.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}
