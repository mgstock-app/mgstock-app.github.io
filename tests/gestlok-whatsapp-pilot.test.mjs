import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,webcrypto} from 'node:crypto';
import {extractPilotMessages,verifySignature,isPilotProject} from '../supabase/functions/gestlok-whatsapp-pilot/pilot.mjs';
const cfg={waba:'11111',phoneId:'22222',testSenders:['5491100000000']};
const msg={id:'wamid.test123',from:'5491100000000',type:'text',timestamp:'1795645000',text:{body:'Pedido ficticio'}};
const payload=(messages=[msg],waba=cfg.waba,phone=cfg.phoneId,field='messages')=>({object:'whatsapp_business_account',entry:[{id:waba,changes:[{field,value:{messaging_product:'whatsapp',metadata:{phone_number_id:phone},messages}}]}]});
test('solo texto del número de prueba autorizado y sin duplicados',()=>{
 assert.equal(extractPilotMessages(payload([msg,msg]),cfg).length,1);
 assert.equal(extractPilotMessages(payload([msg],'99999'),cfg).length,0);
 assert.equal(extractPilotMessages(payload([msg],cfg.waba,'99999'),cfg).length,0);
 assert.equal(extractPilotMessages(payload([msg],cfg.waba,cfg.phoneId,'smb_message_echoes'),cfg).length,0);
 assert.equal(extractPilotMessages(payload([{...msg,from:'5491199999999'}]),cfg).length,0);
 assert.equal(extractPilotMessages(payload([{...msg,type:'image'}]),cfg).length,0);
 assert.equal(extractPilotMessages(payload([{...msg,text:{body:'a'.repeat(2001)}}]),cfg).length,0);
});
test('HMAC del cuerpo original y rechazo de firmas falsas',async()=>{
 const secret='test-secret-not-production',raw=new TextEncoder().encode('{"test":1}');
 const sig='sha256='+createHmac('sha256',secret).update(raw).digest('hex');
 assert.equal(await verifySignature(raw,sig,secret,webcrypto),true);
 assert.equal(await verifySignature(new TextEncoder().encode('{"test":2}'),sig,secret,webcrypto),false);
 assert.equal(await verifySignature(raw,'sha256='+'0'.repeat(64),secret,webcrypto),false);
 assert.equal(await verifySignature(raw,null,secret,webcrypto),false);
});

test('solo el origen HTTPS exacto del proyecto piloto',()=>{
 assert.equal(isPilotProject('https://irqeitzbfyerxcrogkyh.supabase.co'),true);
 for(const url of ['https://vgsepaaewbctjsjcpeta.supabase.co','https://irqeitzbfyerxcrogkyh.supabase.co.ejemplo.invalid','https://ejemplo.invalid/irqeitzbfyerxcrogkyh','https://irqeitzbfyerxcrogkyh.supabase.co@ejemplo.invalid','http://irqeitzbfyerxcrogkyh.supabase.co','https://irqeitzbfyerxcrogkyh.supabase.co/test']) assert.equal(isPilotProject(url),false);
});
