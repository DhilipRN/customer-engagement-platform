import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createMessagesRouter } from '../src/routes/messages.js';

const BUSINESS='96a26c1b-eae8-4cf2-bfe1-beba2827461d';
const OTHER_BUSINESS='f3d24e3c-3e8c-4732-8224-3e71e1b73e62';
const MESSAGE='9c01ac38-6a1b-4b92-93cb-a4e5aa916e61';

async function request({profile,user,authorization,lookupError=false,messageBusinessId=BUSINESS,query=''}) {
  let findScope;
  let removeScope;
  const messageService={
    findById:async(id,businessId)=>{
      findScope=businessId;
      return {data:id===MESSAGE?{id,business_id:messageBusinessId}:null,error:null};
    },
    remove:async(id,businessId)=>{
      removeScope=businessId;
      return {data:id===MESSAGE?{id,business_id:messageBusinessId}:null,error:null};
    },
  };
  const app=express();
  app.use(express.json());
  app.use((req,_res,next)=>{
    if(user)req.user=user;
    if(profile)req.profile=profile;
    next();
  });
  app.use('/messages',createMessagesRouter({
    messageService,
    businessAccessMiddleware:(_req,_res,next)=>next(),
    permissionService:{
      getBusinessAuthorization:async()=>lookupError
        ? {data:null,error:new Error('lookup failed')}
        : {data:authorization,error:null},
    },
  }));
  const server=app.listen();
  try {
    const response=await fetch(`http://127.0.0.1:${server.address().port}/messages/${MESSAGE}${query}`,{method:'DELETE'});
    return {response,findScope,removeScope};
  } finally {
    await new Promise(resolve=>server.close(resolve));
  }
}

const ownerAuthorization={
  authorized:true,
  source:'membership',
  membership:{business_id:BUSINESS,role:'owner'},
  permissions:{send_messages:false,manage_customers:false},
};

test('admins can delete within the existing unrestricted scope',async()=>{
  const result=await request({profile:{role:'admin',business_id:null},user:{id:'admin'}});
  assert.equal(result.response.status,204);
  assert.equal(result.findScope,null);
  assert.equal(result.removeScope,null);
});

test('an owner membership can delete only in its authorized business',async()=>{
  const result=await request({
    profile:{role:'client',business_id:null},
    user:{id:'owner'},
    authorization:ownerAuthorization,
    query:`?business_id=${BUSINESS}`,
  });
  assert.equal(result.response.status,204);
  assert.equal(result.findScope,BUSINESS);
  assert.equal(result.removeScope,BUSINESS);
});

test('an owner membership for another business is denied',async()=>{
  const result=await request({
    profile:{role:'client',business_id:null},
    user:{id:'owner'},
    authorization:{...ownerAuthorization,authorized:false,membership:{business_id:OTHER_BUSINESS,role:'owner'}},
    query:`?business_id=${OTHER_BUSINESS}`,
  });
  assert.equal(result.response.status,403);
  assert.equal(result.findScope,undefined);
  assert.equal(result.removeScope,undefined);
});

test('receptionists are denied even when they can send messages',async()=>{
  const result=await request({
    profile:{role:'client',business_id:null},
    user:{id:'receptionist'},
    authorization:{...ownerAuthorization,membership:{business_id:BUSINESS,role:'receptionist'},permissions:{send_messages:true,manage_customers:true}},
  });
  assert.equal(result.response.status,403);
  assert.equal(result.findScope,undefined);
  assert.equal(result.removeScope,undefined);
});

test('legacy clients without owner membership are denied',async()=>{
  const result=await request({
    profile:{role:'client',business_id:BUSINESS},
    user:{id:'legacy-client'},
    authorization:{authorized:true,source:'legacy-client',permissions:{send_messages:true,manage_customers:true}},
  });
  assert.equal(result.response.status,403);
  assert.equal(result.findScope,undefined);
  assert.equal(result.removeScope,undefined);
});

test('missing authorization context is denied without an unscoped lookup',async()=>{
  const result=await request({profile:{role:'client',business_id:null},user:{id:'user'}});
  assert.equal(result.response.status,403);
  assert.equal(result.findScope,undefined);
  assert.equal(result.removeScope,undefined);
});

test('authorization lookup failures fail closed',async()=>{
  const result=await request({profile:{role:'client',business_id:BUSINESS},user:{id:'user'},lookupError:true});
  assert.equal(result.response.status,500);
  assert.equal(result.findScope,undefined);
  assert.equal(result.removeScope,undefined);
});

test('message business ownership is checked before deletion',async()=>{
  const result=await request({
    profile:{role:'client',business_id:null},
    user:{id:'owner'},
    authorization:ownerAuthorization,
    messageBusinessId:OTHER_BUSINESS,
    query:`?business_id=${BUSINESS}`,
  });
  assert.equal(result.response.status,404);
  assert.equal(result.findScope,BUSINESS);
  assert.equal(result.removeScope,undefined);
});
