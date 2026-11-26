// Fixed categorical codes only; never return or log phone numbers or message contents.
export function classifyPilot(p,c){
 const e164=/^\+[1-9]\d{7,14}$/;
 if(p?.type!=='whatsapp.inbound_message.received')return 'OTHER_EVENT';
 const v=p?.whatsappInboundMessage;
 if(!v||typeof v!=='object')return 'MISSING_MESSAGE';
 if(!c.waba||!e164.test(c.to)||!e164.test(c.from)||c.from===c.to)return 'INVALID_CONFIG';
 if(v.wabaId!==c.waba)return 'OTHER_WABA';
 if(v.to!==c.to)return 'OTHER_DESTINATION';
 if(v.groupId)return 'GROUP';
 if(v.from!==c.from)return 'OTHER_SENDER';
 if(v.type!=='text')return 'OTHER_TYPE';
 if(v.text?.body!=='GESTLOK PRUEBA 001')return 'OTHER_TEXT';
 return 'TEST_RECEIVED';
}
