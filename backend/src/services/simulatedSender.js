
export function createSimulatedSender() {
  return {
    async send(message) {
      if (!message || !message.message_text) {
        return {
          success: false,
          error: 'Message text is required.',
        };
      }

      // Simulate a successful message send.
      return {
        success: true,
        status: 'sent',
        sentAt: new Date().toISOString(),
      };
    },
  };
}