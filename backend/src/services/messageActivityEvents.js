export async function recordSystemMessageEvent(
  activityEventService,
  message,
  eventType,
  { before, after, metadata } = {},
) {
  if (!activityEventService) {
    return { data: null, error: null, skipped: true };
  }

  try {
    const result = await activityEventService.create({
      scope_type: 'business',
      business_id: message.business_id,
      actor_user_id: null,
      actor_type: 'system',
      event_type: eventType,
      entity_type: 'message',
      entity_id: message.id,
      customer_id: message.customer_id ?? null,
      is_reconstructed: false,
      visibility: 'audit_only',
      ...(before === undefined ? {} : { before }),
      ...(after === undefined ? {} : { after }),
      ...(metadata === undefined ? {} : { metadata }),
    });

    if (result?.error) return result;
    if (!result?.data) {
      return {
        data: null,
        error: new Error('Activity event persistence returned no record.'),
      };
    }

    return result;
  } catch (error) {
    return { data: null, error };
  }
}
