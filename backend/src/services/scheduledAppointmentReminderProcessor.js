import { getSupabaseClient } from '../config/supabase.js';
import { createBusinessService } from './businesses.js';
import { createCustomerService } from './customers.js';
import { createMessageTemplateService } from './messageTemplates.js';
import { createMessageService } from './messages.js';
import { queueAppointmentReminder } from './appointmentReminderQueue.js';

export function createScheduledAppointmentReminderProcessor(
  supabaseClient = getSupabaseClient(),
  activityEventService = null,
) {
  const businessService = createBusinessService(supabaseClient);
  const customerService = createCustomerService(supabaseClient);
  const messageTemplateService = createMessageTemplateService(supabaseClient);
  const messageService = createMessageService(supabaseClient);

  return {
    async processDueAppointmentReminders(now = new Date().toISOString()) {
      const { data: appointments, error } = await supabaseClient
        .from('appointments')
        .select('*')
        .eq('status', 'scheduled')
        .eq('reminder_enabled', true)
        .not('template_id', 'is', null);

      if (error) throw error;

      const results = [];
      for (const appointment of appointments ?? []) {
        try {
          const result = await queueAppointmentReminder({
            appointment,
            now,
            businessService,
            customerService,
            messageTemplateService,
            messageService,
            activityEventService,
          });

          if (result.status !== 'not_due') {
            results.push({ appointmentId: appointment.id, ...result });
          }
        } catch (queueError) {
          results.push({
            appointmentId: appointment.id,
            status: 'error',
            error: queueError.message,
          });
        }
      }

      return results;
    },
  };
}
