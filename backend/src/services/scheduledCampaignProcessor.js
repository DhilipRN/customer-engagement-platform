import { getSupabaseClient } from '../config/supabase.js';
import { createCampaignService } from './campaigns.js';
import { createCustomerService } from './customers.js';
import { createMessageService } from './messages.js';
import { createMessageTemplateService } from './messageTemplates.js';

export function createScheduledCampaignProcessor(
  supabaseClient = getSupabaseClient()
) {
  const campaignService = createCampaignService(supabaseClient);
  const customerService = createCustomerService(supabaseClient);
  const messageService = createMessageService(supabaseClient);
  const templateService =
    createMessageTemplateService(supabaseClient);

  return {
    async processDueCampaigns(now = new Date().toISOString()) {
      const { data: campaigns, error } =
        await supabaseClient
          .from('campaigns')
          .select('*')
          .eq('status', 'scheduled')
          .not('scheduled_at', 'is', null)
          .lte('scheduled_at', now)
          .order('scheduled_at', { ascending: true });

      if (error) {
        throw error;
      }

      const results = [];

      for (const campaign of campaigns ?? []) {
        try {
          const templateResult =
            await templateService.findById(
              campaign.template_id
            );

          if (templateResult.error) {
            throw templateResult.error;
          }

          const template = templateResult.data;

          if (!template) {
            throw new Error(
              `Template not found for campaign ${campaign.id}.`
            );
          }

          if (
            template.business_id !== campaign.business_id
          ) {
            throw new Error(
              `Template does not belong to campaign business.`
            );
          }

          const customersResult =
            await customerService.listByBusinessId(
              campaign.business_id
            );

          if (customersResult.error) {
            throw customersResult.error;
          }

          const customers = customersResult.data ?? [];

          const existingMessagesResult =
            await messageService.list({
              businessId: campaign.business_id,
              campaignId: campaign.id,
            });

          if (existingMessagesResult.error) {
            throw existingMessagesResult.error;
          }

          const existingMessages =
            existingMessagesResult.data ?? [];

          let createdCount = 0;

          for (const customer of customers) {
            if (!customer.consent_given) {
              continue;
            }

            const alreadyCreated =
              existingMessages.some(
                (message) =>
                  message.customer_id === customer.id
              );

            if (alreadyCreated) {
              continue;
            }

            const messageText =
              template.message.replace(
                /\{\{\s*customer_name\s*\}\}/g,
                customer.name || ''
              );

            const messageResult =
              await messageService.create({
                business_id: campaign.business_id,
                customer_id: customer.id,
                campaign_id: campaign.id,
                template_id: template.id,
                message_text: messageText,
                status: 'queued',
                scheduled_at: now,
              });

            if (messageResult.error) {
              throw messageResult.error;
            }

            createdCount += 1;
          }

          const updateResult =
            await campaignService.update(campaign.id, {
              status: 'running',
            });

          if (updateResult.error) {
            throw updateResult.error;
          }

          results.push({
            campaignId: campaign.id,
            status: 'running',
            messagesCreated: createdCount,
          });
        } catch (error) {
          results.push({
            campaignId: campaign.id,
            status: 'error',
            error: error.message,
          });
        }
      }

      return results;
    },
  };
}