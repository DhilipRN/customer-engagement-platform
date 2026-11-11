import { Router } from 'express';
import { createBusinessService } from '../services/businesses.js';
import { createCampaignService } from '../services/campaigns.js';
import { createCustomerService } from '../services/customers.js';
import { createMessageTemplateService } from '../services/messageTemplates.js';
import { createMessageService } from '../services/messages.js';
import {
  getAuthorizedBusinessId,
  requireBusinessAccess,
} from '../middleware/auth.js';
import { createPermissionService } from '../middleware/permissions.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES=new Set(['pending','queued','scheduled','simulated','sent','failed','cancelled']);
const validId=(v)=>typeof v==='string'&&UUID.test(v); const validTime=(v)=>typeof v==='string'&&!Number.isNaN(new Date(v).valueOf());
const db=(res,e)=>{console.error(e);return res.status(500).json({error:'Unable to process the message request.'});};
function resolveRouteBusinessId(request,response){
  if(!request.profile)return{ok:true,businessId:null};
  const businessId=getAuthorizedBusinessId(request);
  if(request.profile.role==='admin'){
    if(businessId&&!validId(businessId))return response.status(400).json({error:'business_id must be a valid UUID.'}),{ok:false,businessId:null};
    return{ok:true,businessId:businessId||null};
  }
  if(!validId(businessId))return response.status(403).json({error:'An authorized business context is required.'}),{ok:false,businessId:null};
  return{ok:true,businessId};
}
function validate(body,{creating=false}={}) { const errors=[],v={}; for(const field of ['message_text','status','scheduled_at','sent_at']) if(body[field]!==undefined){if(field==='message_text'){if(typeof body[field]!=='string')errors.push('message_text must be a string.');else v[field]=body[field];} else if(field==='status'){if(!STATUSES.has(body[field]))errors.push('status is invalid.');else v[field]=body[field];}else if(!validTime(body[field])) errors.push(`${field} must be a valid ISO date-time.`); else v[field]=new Date(body[field]).toISOString();} if(creating){for(const field of ['business_id','customer_id']){if(!validId(body[field]))errors.push(`${field} must be a valid UUID.`);else v[field]=body[field];}for(const field of ['campaign_id','template_id'])if(body[field]!==undefined){if(!validId(body[field]))errors.push(`${field} must be a valid UUID.`);else v[field]=body[field];}if(typeof v.message_text!=='string')errors.push('message_text is required.'); if(!v.status)v.status='pending';} if(v.sent_at&&v.status!=='sent')errors.push('sent_at may only be set when status is sent.'); if(v.status==='sent'&&!v.sent_at&&creating)errors.push('sent_at is required when status is sent.'); return {errors,values:v}; }
const idempotencyKeyIsValid=(value)=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const isDuplicateError=(error)=>error?.code==='23505'||error?.status===409;
function sameIdempotentPayload(existing,values){
  const same=(left,right)=>(left??null)===(right??null);
  return existing?.business_id===values.business_id&&existing?.customer_id===values.customer_id&&existing?.message_text===values.message_text&&same(existing?.campaign_id,values.campaign_id)&&same(existing?.template_id,values.template_id);
}
export function createMessagesRouter({messageService,businessService,customerService,campaignService,messageTemplateService,permissionService,businessAccessMiddleware}={}){
 const r=Router();let ms=messageService,bs=businessService,cs=customerService,ca=campaignService,ts=messageTemplateService,ps=permissionService;const accessMiddleware=businessAccessMiddleware??requireBusinessAccess;const M=()=>ms??=createMessageService(),B=()=>bs??=createBusinessService(),C=()=>cs??=createCustomerService(),A=()=>ca??=createCampaignService(),T=()=>ts??=createMessageTemplateService(),P=()=>ps??=createPermissionService();
async function parents(v,res){const b=await B().findById(v.business_id);if(b.error)return db(res,b.error),false;if(!b.data)return res.status(404).json({error:'Business not found.'}),false;const c=await C().findById(v.customer_id);if(c.error)return db(res,c.error),false;if(!c.data)return res.status(404).json({error:'Customer not found.'}),false;if(c.data.business_id!==v.business_id)return res.status(400).json({error:'customer_id does not belong to business_id.'}),false;if(c.data.consent_given!==true)return res.status(403).json({error:'Customer has not provided consent to receive messages.'}),false;let campaign; if(v.campaign_id){campaign=await A().findById(v.campaign_id);if(campaign.error)return db(res,campaign.error),false;if(!campaign.data)return res.status(404).json({error:'Campaign not found.'}),false;if(campaign.data.business_id!==v.business_id)return res.status(400).json({error:'campaign_id does not belong to business_id.'}),false;if(!v.template_id)v.template_id=campaign.data.template_id;}if(v.template_id){const t=await T().findById(v.template_id);if(t.error)return db(res,t.error),false;if(!t.data)return res.status(404).json({error:'Message template not found.'}),false;if(t.data.business_id!==v.business_id)return res.status(400).json({error:'template_id does not belong to business_id.'}),false;if(campaign&&campaign.data.template_id!==v.template_id)return res.status(400).json({error:'template_id is inconsistent with campaign_id.'}),false;}return true;}
async function requireSendMessages(req,res,next){
  if(!req.profile||!req.user)return next();
  if(req.profile.role==='admin')return next();
  let authorization=req.businessAuthorization;
  if(!authorization){
    const businessId=req.body?.business_id||(req.profile.role==='client'?req.profile.business_id:null);
    try{
      const lookup=await P().getBusinessAuthorization(req,businessId);
      if(lookup?.error)return res.status(500).json({error:'Unable to verify message-send access.'});
      authorization=lookup?.data;
    }catch(error){
      console.error('Message-send authorization lookup failed:',error);
      return res.status(500).json({error:'Unable to verify message-send access.'});
    }
  }
  if(!authorization)return res.status(500).json({error:'Unable to verify message-send access.'});
  req.businessAuthorization=authorization;
  if(!authorization.authorized)return res.status(403).json({error:'You do not have access to this business.'});
  if(authorization.permissions?.send_messages!==true)return res.status(403).json({error:'You do not have permission to send messages.'});
  return next();
}
async function requireSendMessagesForUpdate(req,res,next){
  if(!req.profile||!req.user)return next();
  if(req.profile.role==='admin')return next();
  let authorization=req.businessAuthorization;
  if(!authorization){
    const businessId=req.query?.business_id||req.body?.business_id||(req.profile.role==='client'?req.profile.business_id:null);
    try{
      const lookup=await P().getBusinessAuthorization(req,businessId);
      if(lookup?.error)return res.status(500).json({error:'Unable to verify message-update access.'});
      authorization=lookup?.data;
    }catch(error){
      console.error('Message-update authorization lookup failed:',error);
      return res.status(500).json({error:'Unable to verify message-update access.'});
    }
  }
  if(!authorization)return res.status(500).json({error:'Unable to verify message-update access.'});
  req.businessAuthorization=authorization;
  if(!authorization.authorized)return res.status(403).json({error:'You do not have access to this business.'});
  if(authorization.permissions?.send_messages!==true)return res.status(403).json({error:'You do not have permission to send messages.'});
  return next();
}
async function requireViewChats(req,res,next){
  if(!req.profile||!req.user)return next();
  if(req.profile.role==='admin')return next();
  let authorization=req.businessAuthorization;
  if(!authorization){
    const businessId=req.query?.business_id||(req.profile.role==='client'?req.profile.business_id:null);
    try{
      const lookup=await P().getBusinessAuthorization(req,businessId);
      if(lookup?.error)return res.status(500).json({error:'Unable to verify message-read access.'});
      authorization=lookup?.data;
    }catch(error){
      console.error('Message-read authorization lookup failed:',error);
      return res.status(500).json({error:'Unable to verify message-read access.'});
    }
  }
  if(!authorization)return res.status(500).json({error:'Unable to verify message-read access.'});
  if(!authorization.authorized)return res.status(403).json({error:'You do not have access to this business.'});
  if(authorization.permissions?.view_chats!==true)return res.status(403).json({error:'You do not have permission to view chats.'});
  return next();
}
async function requireMessageOwner(req,res,next){
  if(!req.profile||!req.user)return res.status(403).json({error:'Authentication context is required for message deletion.'});
  if(req.profile.role==='admin')return next();
  let authorization=req.businessAuthorization;
  if(!authorization){
    const businessId=req.query?.business_id||(req.profile.role==='client'?req.profile.business_id:null);
    if(!businessId)return res.status(403).json({error:'An authorized business context is required.'});
    try{
      const lookup=await P().getBusinessAuthorization(req,businessId);
      if(lookup?.error)return res.status(500).json({error:'Unable to verify message-deletion access.'});
      authorization=lookup?.data;
    }catch(error){
      console.error('Message-deletion authorization lookup failed:',error);
      return res.status(500).json({error:'Unable to verify message-deletion access.'});
    }
  }
  if(!authorization)return res.status(500).json({error:'Unable to verify message-deletion access.'});
  req.businessAuthorization=authorization;
  if(!authorization.authorized)return res.status(403).json({error:'You do not have access to this business.'});
  if(authorization.source!=='membership'||authorization.membership?.role!=='owner'||!authorization.membership?.business_id)return res.status(403).json({error:'Only business owners can delete messages.'});
  return next();
}
 r.get('/', accessMiddleware, requireViewChats, async (req, res) => {
  const {
    business_id: businessId,
    customer_id: customerId,
    campaign_id: campaignId,
    status,
  } = req.query;

  if (!validId(businessId)) {
    return res.status(400).json({
      error: 'business_id query parameter must be a valid UUID.',
    });
  }

  if (
    (customerId !== undefined && !validId(customerId)) ||
    (campaignId !== undefined && !validId(campaignId))
  ) {
    return res.status(400).json({
      error:
        'customer_id and campaign_id query parameters must be valid UUIDs.',
    });
  }

  if (status !== undefined && !STATUSES.has(status)) {
    return res.status(400).json({
      error: 'status query parameter is invalid.',
    });
  }

  const business = await B().findById(businessId);

  if (business.error) {
    return db(res, business.error);
  }

  if (!business.data) {
    return res.status(404).json({
      error: 'Business not found.',
    });
  }

  if (customerId) {
    const customer = await C().findById(customerId);

    if (customer.error) {
      return db(res, customer.error);
    }

    if (!customer.data) {
      return res.status(404).json({
        error: 'Customer not found.',
      });
    }

    if (customer.data.business_id !== businessId) {
      return res.status(400).json({
        error: 'customer_id does not belong to business_id.',
      });
    }
  }

  if (campaignId) {
    const campaign = await A().findById(campaignId);

    if (campaign.error) {
      return db(res, campaign.error);
    }

    if (!campaign.data) {
      return res.status(404).json({
        error: 'Campaign not found.',
      });
    }

    if (campaign.data.business_id !== businessId) {
      return res.status(400).json({
        error: 'campaign_id does not belong to business_id.',
      });
    }
  }

  const { data, error } = await M().list({
    businessId,
    customerId,
    campaignId,
    status,
  });

  if (error) {
    return db(res, error);
  }

  const customersResult =
    await C().listByBusinessId(businessId);

  if (customersResult.error) {
    return db(res, customersResult.error);
  }

  const customerMap = new Map(
    (customersResult.data ?? []).map((customer) => [
      customer.id,
      { name: customer.name, phone: customer.phone },
    ])
  );

  const enrichedMessages = (data ?? []).map((message) => ({
    ...message,
    customerName:
      customerMap.get(message.customer_id)?.name ||
      'Unknown Customer',
    customerPhone: customerMap.get(message.customer_id)?.phone || null,
  }));

  return res.json({
    data: enrichedMessages,
  });
}); r.get('/:id',accessMiddleware,requireViewChats,async(req,res)=>{if(!validId(req.params.id))return res.status(400).json({error:'message id must be a valid UUID.'});const businessId=req.query?.business_id||((req.profile?.role==='client')?req.profile.business_id:null);const {data,error}=await M().findById(req.params.id,businessId);if(error)return db(res,error);return data?res.json({data}):res.status(404).json({error:'Message not found.'});});
 r.post('/',accessMiddleware,requireSendMessages,async(req,res)=>{
  const requestedIdempotencyKey=req.body?.idempotency_key;
  if(requestedIdempotencyKey!==undefined&&!idempotencyKeyIsValid(requestedIdempotencyKey))return res.status(400).json({error:'idempotency_key must be a valid UUID.'});
  if(requestedIdempotencyKey!==undefined&&!req.user?.id)return res.status(403).json({error:'Authentication context is required for idempotent message creation.'});
  const {errors,values}=validate(req.body??{},{creating:true});
  if(errors.length)return res.status(400).json({errors});
  if(!(await parents(values,res)))return;
  const scopedIdempotencyKey=requestedIdempotencyKey===undefined?null:`${req.user.id}:${requestedIdempotencyKey}`;
  if(scopedIdempotencyKey){
    const existing=await M().findByIdempotencyKey(values.business_id,scopedIdempotencyKey);
    if(existing.error)return db(res,existing.error);
    if(existing.data)return sameIdempotentPayload(existing.data,values)?res.status(200).json({data:existing.data}):res.status(409).json({error:'idempotency_key has already been used for a different message payload.'});
  }
  const queuedValues={...values,status:'queued',scheduled_at:new Date().toISOString()};
  delete queuedValues.sent_at;
  if(scopedIdempotencyKey)queuedValues.idempotency_key=scopedIdempotencyKey;
  const created=await M().create(queuedValues);
  if(!created.error)return res.status(201).json({data:created.data});
  if(!scopedIdempotencyKey||!isDuplicateError(created.error))return db(res,created.error);
  const existing=await M().findByIdempotencyKey(values.business_id,scopedIdempotencyKey);
  if(existing.error)return db(res,existing.error);
  if(!existing.data)return db(res,created.error);
  return sameIdempotentPayload(existing.data,values)?res.status(200).json({data:existing.data}):res.status(409).json({error:'idempotency_key has already been used for a different message payload.'});
 });
 r.put('/:id',accessMiddleware,requireSendMessagesForUpdate,async(req,res)=>{if(!validId(req.params.id))return res.status(400).json({error:'message id must be a valid UUID.'});const scope=resolveRouteBusinessId(req,res);if(!scope.ok)return undefined;const old=await M().findById(req.params.id,scope.businessId);if(old.error)return db(res,old.error);if(!old.data||(scope.businessId&&old.data.business_id!==scope.businessId))return res.status(404).json({error:'Message not found.'});const {errors,values}=validate(req.body??{});if(!Object.keys(values).length)errors.push('At least one editable field is required.');if(values.status==='sent'&&!values.sent_at&&!old.data.sent_at)errors.push('sent_at is required when status is sent.');if(errors.length)return res.status(400).json({errors});const {data,error}=await M().update(req.params.id,values,scope.businessId);if(!data&&!error)return res.status(404).json({error:'Message not found.'});return error?db(res,error):res.json({data});});
  r.delete('/:id',accessMiddleware,requireMessageOwner,async(req,res)=>{if(!validId(req.params.id))return res.status(400).json({error:'message id must be a valid UUID.'});const scope=resolveRouteBusinessId(req,res);if(!scope.ok)return undefined;const existing=await M().findById(req.params.id,scope.businessId);if(existing.error)return db(res,existing.error);if(!existing.data||(scope.businessId&&existing.data.business_id!==scope.businessId))return res.status(404).json({error:'Message not found.'});const {data,error}=await M().remove(req.params.id,scope.businessId);if(error)return db(res,error);if(!data)return res.status(404).json({error:'Message not found.'});return res.status(204).send();});return r;
}
