
import { createMessageService } from './messages.js';
import { createSimulatedSender } from './simulatedSender.js';

export function createScheduledMessageProcessor({
  messageService = createMessageService(),
  simulatedSender = createSimulatedSender(),
} = {}) {
  return {
    async processDueMessages() {
      const now = new Date().toISOString();

      const { data: messages, error } =
        await messageService.listDueQueued(now);

      if (error) {
        throw new Error(
          `Unable to fetch due queued messages: ${error.message}`
        );
      }

      const results = [];

      for (const message of messages ?? []) {
        try {
          const sendResult = await simulatedSender.send(message);

          const updateValues = sendResult.success
            ? {
                status: 'sent',
                sent_at: sendResult.sentAt,
              }
            : {
                status: 'failed',
              };

          const { data, error: updateError } =
            await messageService.update(message.id, updateValues);

          results.push({
            messageId: message.id,
            success: sendResult.success && !updateError,
            error: updateError?.message ?? sendResult.error ?? null,
            message: data,
          });
        } catch (error) {
          results.push({
            messageId: message.id,
            success: false,
            error: error.message,
          });
        }
      }

      return results;
    },
  };
}