-- Prevent concurrent bulk requests or scheduler retries from creating
-- multiple appointment reminder messages for the same appointment.
create unique index if not exists messages_appointment_reminder_unique_idx
  on public.messages (appointment_id)
  where appointment_id is not null
    and source = 'appointment_reminder';
