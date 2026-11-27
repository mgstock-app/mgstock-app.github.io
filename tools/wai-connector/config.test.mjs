import test from 'node:test';
import assert from 'node:assert/strict';
import {validateConfig,TEST_URL} from './config.mjs';
const key=(role='anon',ref='irqeitzbfyerxcrogkyh')=>'e30.'+Buffer.from(JSON.stringify({role,ref})).toString('base64url')+'.signature-test';
const valid=()=>({url:TEST_URL,anonKey:key(),testOnly:true,sessions:[{id:'10000000-0000-4000-8000-000000000001',number:'+5491100000001',key:'a'.repeat(64)}]});
test('importación del piloto: limita proyecto, credenciales y números válidos',()=>{
 assert.equal(validateConfig(valid()).enableTestMessages,false);
 assert.throws(()=>validateConfig({...valid(),url:'https://vgsepaaewbctjsjcpeta.supabase.co'}),/Prueba/);
 assert.throws(()=>validateConfig({...valid(),anonKey:key('service_role')}),/pública/);
 assert.throws(()=>validateConfig({...valid(),url:TEST_URL+'/?x=1'}),/Prueba/);
 const d=valid();d.sessions.push({...d.sessions[0],id:'20000000-0000-4000-8000-000000000001',number:'+541100000001'});
 assert.throws(()=>validateConfig(d),/repetida/);
});
