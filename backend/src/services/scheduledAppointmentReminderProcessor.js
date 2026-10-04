import { getSupabaseClient } from '../config/supabase.js';

export function createScheduledAppointmentReminderProcessor(
  supabaseClient = getSupabaseClient()
) {
  return {
    async processDueAppointmentReminders(
      now = new Date().toISOString()
    ) {
      const nowDate = new Date(now);

      const { data: appointments, error } =
        await supabaseClient
          .from('appointments')
          .select('*')
          .eq('status', 'scheduled')
          .eq('reminder_enabled', true)
          .not('template_id', 'is', null);

      if (error) throw error;

      const results = [];

      for (const appointment of appointments ?? []) {
        try {
          // Calculate the appointment and reminder times.
          const appointmentDateTime = new Date(
            `${appointment.appointment_date}T${appointment.appointment_time}`
          );

          if (Number.isNaN(appointmentDateTime.getTime())) {
            throw new Error('Invalid appointment date or time.');
          }

          // Do not send reminders for past appointments.
          if (appointmentDateTime <= nowDate) {
            continue;
          }

          const reminderAt = new Date(
            appointmentDateTime.getTime() -
              Number(appointment.reminder_minutes ?? 1440) *
                60_000
          );

          // Wait until the reminder time arrives.
          if (reminderAt > nowDate) {
            continue;
          }

          // Check whether a reminder already exists.
          const existingResult = await supabaseClient
            .from('messages')
            .select('id')
            .eq('appointment_id', appointment.id)
            .maybeSingle();

          if (existingResult.error) {
            throw existingResult.error;
          }

          if (existingResult.data) {
            results.push({
              appointmentId: appointment.id,
              status: 'already_queued',
            });
            continue;
          }

          // Load the appointment customer.
          const customerResult = await supabaseClient
            .from('customers')
            .select('*')
            .eq('id', appointment.customer_id)
            .eq('business_id', appointment.business_id)
            .maybeSingle();

          if (customerResult.error) {
            throw customerResult.error;
          }

          const customer = customerResult.data;

          if (!customer) {
            throw new Error('Appointment customer not found.');
          }

          // Respect the customer's messaging consent.
          if (!customer.consent_given) {
            results.push({
              appointmentId: appointment.id,
              status: 'skipped_no_consent',
            });
            continue;
          }

          // Load the business.
          const businessResult = await supabaseClient
            .from('businesses')
            .select('*')
            .eq('id', appointment.business_id)
            .maybeSingle();

          if (businessResult.error) {
            throw businessResult.error;
          }

          const business = businessResult.data;

          if (!business) {
            throw new Error('Appointment business not found.');
          }

          // Load a template belonging to this business.
          const templateResult = await supabaseClient
            .from('message_templates')
            .select('*')
            .eq('id', appointment.template_id)
            .eq('business_id', appointment.business_id)
            .maybeSingle();

          if (templateResult.error) {
            throw templateResult.error;
          }

          const template = templateResult.data;

          if (!template) {
            throw new Error(
              'Appointment reminder template not found.'
            );
          }

          // Replace appointment-related template variables.
          const variables = {
            customer_name: customer.name || '',
            business_name: business.name || '',
            appointment_date: appointment.appointment_date,
            appointment_time:
              appointment.appointment_time.slice(0, 5),
            appointment_type: appointment.appointment_type || '',
          };

          const messageText = template.message.replace(
            /\{\{\s*([a-z_]+)\s*\}\}/g,
            (match, name) =>
              Object.hasOwn(variables, name)
                ? variables[name]
                : match
          );

          // Queue the reminder for the existing message processor.
          const messageResult = await supabaseClient
            .from('messages')
            .insert({
              business_id: appointment.business_id,
              customer_id: appointment.customer_id,
              campaign_id: null,
              appointment_id: appointment.id,
              template_id: template.id,
              message_text: messageText,
              status: 'queued',
              scheduled_at: reminderAt.toISOString(),
            })
            .select('*')
            .single();

          if (messageResult.error) {
            // The unique index prevents duplicate reminders.
            if (messageResult.error.code === '23505') {
              results.push({
                appointmentId: appointment.id,
                status: 'already_queued',
              });
              continue;
            }

            throw messageResult.error;
          }

          results.push({
            appointmentId: appointment.id,
            status: 'queued',
            messageId: messageResult.data.id,
          });
        } catch (error) {
          results.push({
            appointmentId: appointment.id,
            status: 'error',
            error: error.message,
          });
        }
      }

      return results;
    },
  };
}