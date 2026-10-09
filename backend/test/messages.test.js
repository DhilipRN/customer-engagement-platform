import assert from 'node:assert/strict';
import test from 'node:test';
import {createApp}from '../src/app.js';
import { bypassAuth } from './authTestHelper.js';

const B='96a26c1b-eae8-4cf2-bfe1-beba2827461d',OB='f3d24e3c-3e8c-4732-8224-3e71e1b73e62',C='e693ff85-1344-4764-9d10-e2d4cbbeedc7',OC='8c144f5c-55c0-4d48-a21c-a3fb3adf2a33',T='4a9f2baa-eae0-4f7c-b2d4-4d3d2e1cffb8',OT='6a1e6a9d-0a1a-4a4a-8a1a-123456789abc',A='b5d4484c-5001-4cdc-b276-8ee96715d6b4',OA='7b2e5b9e-1b1c-4b2a-9c3d-5d6e7f8a9b0c',M='9c01ac38-6a1b-4b92-93cb-a4e5aa916e61',OM='8d12bc49-7b2c-4c83-94dc-b5f6bb027f72';
const one = (data) => ({
  findById: async (id) => ({
    data: id === data.id ? data : null,
    error: null,
  }),

  listByBusinessId: async (businessId) => ({
    data:
      data.business_id === businessId
        ? [data]
        : [],
    error: null,
  }),
});
function service({ updateResult = null } = {}){const rows=[{id:M,business_id:B,customer_id:C,campaign_id:A,template_id:T,message_text:'Hi {{customer_name}}',status:'pending'}];return{list:async()=>({data:rows,error:null}),findById:async id=>({data:rows.find(x=>x.id===id)??null,error:null}),create:async v=>({data:{id:'2205fdc5-37a0-4390-a4b9-47914f3aadb5',...v},error:null}),update:async(id,v)=>updateResult??({data:{...rows[0],...v},error:null}),remove:async()=>({data:rows[0],error:null})};}async function api(fn, messageService = service())
{const s=createApp({businessService:one({id:B}),
customerService:one({id:C,business_id:B}),
messageTemplateService:one({id:T,business_id:B}),
campaignService:one({id:A,business_id:B,template_id:T}),
authMiddleware: bypassAuth,
messageService}).listen();
try{await fn(`http://127.0.0.1:${s.address().port}`)}finally{await new Promise(r=>s.close(r))}}
test('Messages API creates scoped messages and validates sent timestamps',async()=>api(async u=>{const bad=await fetch(`${u}/messages`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({business_id:B,customer_id:C,message_text:'x',status:'sent'})});assert.equal(bad.status,400);const ok=await fetch(`${u}/messages`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({business_id:B,customer_id:C,campaign_id:A,message_text:'x'})});assert.equal(ok.status,201)}));
test('Messages API filters and performs CRUD', async () =>
  api(async (u) => {
    const listResponse = await fetch(
      `${u}/messages?business_id=${B}&customer_id=${C}&campaign_id=${A}&status=pending`
    );

    assert.equal(listResponse.status, 200);

    const getResponse = await fetch(
      `${u}/messages/${M}`
    );

    assert.equal(getResponse.status, 200);

    const updateResponse = await fetch(
      `${u}/messages/${M}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'sent',
          sent_at: '2026-09-13T10:00:00Z',
        }),
      }
    );

    assert.equal(updateResponse.status, 200);

    const deleteResponse = await fetch(
      `${u}/messages/${M}`,
      {
        method: 'DELETE',
      }
    );

    assert.equal(deleteResponse.status, 204);
  })
);

function clientService(){const rows=[{id:M,business_id:B,customer_id:C,campaign_id:A,template_id:T,message_text:'Hi {{customer_name}}',status:'pending'},{id:OM,business_id:OB,customer_id:OC,campaign_id:OA,template_id:OT,message_text:'Other',status:'pending'}];return{list:async({businessId})=>({data:rows.filter(x=>x.business_id===businessId),error:null}),findById:async(id,businessId=null)=>({data:rows.find(x=>x.id===id&&(!businessId||x.business_id===businessId))??null,error:null}),create:async v=>({data:{id:'2205ac38-6a1b-4b92-93cb-a4e5aa916e61',...v},error:null}),update:async(id,v,businessId=null)=>{const row=rows.find(x=>x.id===id&&(!businessId||x.business_id===businessId));return{data:row?{...row,...v}:null,error:null}},remove:async(id,businessId=null)=>{const i=rows.findIndex(x=>x.id===id&&(!businessId||x.business_id===businessId));return{data:i<0?null:rows[i],error:null}}};}
async function clientApi(fn){const other={id:OB,business_id:OB};const server=createApp({businessService:{findById:async id=>({data:[B,OB].includes(id)?{id}:null,error:null})},customerService:{findById:async id=>({data:id===C?{id,business_id:B}:id===OC?{id,business_id:OB}:null,error:null}),listByBusinessId:async id=>({data:id===B?[{id:C,name:'Client'}]:[],error:null})},messageTemplateService:{findById:async id=>({data:id===T?{id,business_id:B}:id===OT?{id,business_id:OB}:null,error:null})},campaignService:{findById:async id=>({data:id===A?{id,business_id:B,template_id:T}:id===OA?{id,business_id:OB,template_id:OT}:null,error:null})},messageService:clientService(),authMiddleware:(req,_res,next)=>{req.profile={role:'client',business_id:B};next();}}).listen();try{await fn(`http://127.0.0.1:${server.address().port}`)}finally{await new Promise(r=>server.close(r))}}

test('Messages API isolates client access by business',async()=>clientApi(async u=>{assert.equal((await fetch(`${u}/messages?business_id=${OB}`)).status,403);assert.equal((await fetch(`${u}/messages/${OM}`)).status,404);const wrongBusiness=await fetch(`${u}/messages`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({business_id:OB,customer_id:OC,message_text:'x'})});assert.equal(wrongBusiness.status,403);const wrongCustomer=await fetch(`${u}/messages`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({business_id:B,customer_id:OC,message_text:'x'})});assert.equal(wrongCustomer.status,400);const wrongCampaign=await fetch(`${u}/messages`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({business_id:B,customer_id:C,campaign_id:OA,message_text:'x'})});assert.equal(wrongCampaign.status,400);const wrongTemplate=await fetch(`${u}/messages`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({business_id:B,customer_id:C,template_id:OT,message_text:'x'})});assert.equal(wrongTemplate.status,400);const update=await fetch(`${u}/messages/${OM}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({message_text:'tampered'})});assert.equal(update.status,404);assert.equal((await fetch(`${u}/messages/${OM}`,{method:'DELETE'})).status,404)}));
test('Messages API returns 404 when an update affects no message',async()=>api(async u=>{const response=await fetch(`${u}/messages/${M}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({message_text:'No-op update'})});assert.equal(response.status,404);assert.deepEqual(await response.json(),{error:'Message not found.'})},service({updateResult:{data:null,error:null}})));
