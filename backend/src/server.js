
import 'dotenv/config';
import { createApp } from './app.js';
import { createScheduledMessageProcessor } from './services/scheduledMessageProcessor.js';
import { createScheduledCampaignProcessor } from './services/scheduledCampaignProcessor.js';
import { createScheduledAppointmentReminderProcessor } from './services/scheduledAppointmentReminderProcessor.js';


const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const app = createApp();

const messageProcessor = createScheduledMessageProcessor();
const campaignProcessor =
  createScheduledCampaignProcessor();

const appointmentReminderProcessor =
  createScheduledAppointmentReminderProcessor();

const schedulerIntervalMs = 60 * 1000; // Check every 60 seconds

async function processScheduledMessages() {
  try {
    const campaignResults =
      await campaignProcessor.processDueCampaigns();

    if (campaignResults.length > 0) {
      console.log(
        `Processed ${campaignResults.length} scheduled campaign(s).`
      );
      console.log(campaignResults);
    }

    const appointmentReminderResults =
  await appointmentReminderProcessor
    .processDueAppointmentReminders();

if (appointmentReminderResults.length > 0) {
  console.log(
    `Processed ${appointmentReminderResults.length} appointment reminder(s).`
  );
  console.log(appointmentReminderResults);
}

    const messageResults =
      await messageProcessor.processDueMessages();

    if (messageResults.length > 0) {
      console.log(
        `Processed ${messageResults.length} scheduled message(s).`
      );
      console.log(messageResults);
    }
  } catch (error) {
    console.error(
      'Scheduled processing failed:',
      error.message
    );
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