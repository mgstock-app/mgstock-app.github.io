import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {createSupabasePilotStore} from '../gestlok-ycloud-adapter/bridge.mjs';
import {createMetaPilot,TEST_PROJECT} from './handler.mjs';
const env=(key:string)=>Deno.env.get(key)||'';
const project=env('SUPABASE_URL').replace(/\/$/,'');
const db=project===TEST_PROJECT&&env('SUPABASE_SERVICE_ROLE_KEY')?createClient(TEST_PROJECT,env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}}):null;
const rpc=async(fn:string,args:Record<string,unknown>)=>{if(!db)throw Error('Wrong project');return db.rpc(fn,args);};
const call=async(fn:string,args:Record<string,unknown>)=>{const {data,error}=await rpc(fn,args);if(error)throw Error('Pilot RPC');return data;};
Deno.serve(createMetaPilot({project,appSecret:env('META_TEST_APP_SECRET'),verifyToken:env('META_TEST_VERIFY_TOKEN'),accessToken:env('META_TEST_ACCESS_TOKEN'),testSender:env('META_TEST_ALLOWED_SENDER'),enabled:env('META_TEST_REPLY_ENABLED')==='true'&&!!db,expiresAt:env('META_TEST_EXPIRES_AT'),store:createSupabasePilotStore(rpc),reserve:(event:string)=>call('gestlok_meta_pilot_reserve',{p_event_hash:event}),outcome:(event:string,result:string,diagnostic?:{httpStatus?:number|null;graphCode?:number|null;graphSubcode?:number|null})=>call('gestlok_meta_pilot_outcome_diagnostic',{p_event_hash:event,p_outcome:result,p_http_status:diagnostic?.httpStatus??null,p_graph_code:diagnostic?.graphCode??null,p_graph_subcode:diagnostic?.graphSubcode??null})}));
