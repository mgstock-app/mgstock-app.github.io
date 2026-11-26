// Private, server-controlled exclusions for automatic WhatsApp attention.
// The provider contact is never blocked, and these numbers are not logged.
// Country code required: don't infer the country or a local area code.
const e164=/^\+[1-9]\d{7,14}$/;
export function exclusionKey(value){
 if(typeof value!=='string')return null;
 const phone=value.trim().replace(/[\s()-]/g,'');
 if(!e164.test(phone))return null;
 // WhatsApp in Argentina can present the international mobile 9 or omit it.
 // Treat these two forms of the SAME ten-digit national number as equivalent.
 const ar=/^\+54(?:9)?(\d{10})$/.exec(phone);
 return ar?'AR:'+ar[1]:phone;
}
export function prepareExclusions(values=[]){
 // Bad configuration must fail closed, rather than silently replying to staff.
 if(!Array.isArray(values)||values.length>500)throw Error('Lista de exclusiones inválida');
 const result=new Set();
 for(const value of values){const key=exclusionKey(value);if(!key)throw Error('Número de exclusión inválido');result.add(key);}
 return result;
}
export function excludedSender(exclusions,verifiedSender){
 const key=exclusionKey(verifiedSender);
 return key!==null&&exclusions.has(key);
}
