
import 'dotenv/config';
import { createApp } from './app.js';
import { createScheduledMessageProcessor } from './services/scheduledMessageProcessor.js';

const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const app = createApp();

const messageProcessor = createScheduledMessageProcessor();

const schedulerIntervalMs = 60 * 1000; // Check every 60 seconds

async function processScheduledMessages() {
  try {
    const results = await messageProcessor.processDueMessages();

    if (results.length > 0) {
      console.log(`Processed ${results.length} scheduled message(s).`);
      console.log(results);
    }
  } catch (error) {
    console.error('Scheduled message processing failed:', error.message);
  }
}

app.listen(port, () => {
  console.log(`Customer Engagement API listening on port ${port}`);

  // Process due messages when the server starts.
  void processScheduledMessages();

  // Continue checking for due messages every 60 seconds.
  setInterval(() => {
    void processScheduledMessages();
  }, schedulerIntervalMs);
});