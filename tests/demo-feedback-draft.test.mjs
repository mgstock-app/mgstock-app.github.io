import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(new URL('../public/stock/gestlok-demo-feedback-draft.js',import.meta.url),'utf8');
test('Borrador: calificación 1–5 estrellas y comentario opcional sin publicar ni enviar datos',()=>{
 const listeners={};
 const window={};
 const document={
  addEventListener:(name,callback)=>listeners[name]=callback,
  getElementById:()=>null
 };
 new vm.Script(code).runInNewContext({document,window});
 const draft=window.GestLokDemoFeedbackDraft;
 assert.equal(draft.preview,true);
 let html=draft.view();
 assert.match(html,/data-demo-star="1"/);
 assert.match(html,/data-demo-star="5"/);
 assert.match(html,/¿Querés dejarnos un comentario\?/);
 assert.match(html,/\(Opcional\)/);
 assert.doesNotMatch(html,/method="post"|action=|\/rest\/v1\/|\.rpc\(|fetch\(/i);
 assert.match(html,/type="submit" disabled/);
 assert.match(html,/No, gracias\. Solo quiero valorar la demo/);
 assert.doesNotMatch(html,/id="gl-demo-contact-value"/);
 assert.match(html,/role="group" aria-label="Puntaje de la demo/);
 const fakeBtn={dataset:{demoStar:'4'},closest:()=>true};
 listeners.click({target:{closest:()=>fakeBtn},preventDefault(){}});
 html=draft.view();
 assert.match(html,/Muy buena · 4 de 5 estrellas/);
 const input={name:'interest',value:'si',closest:()=>true};
 listeners.change({target:input});
 html=draft.view();
 assert.match(html,/id="gl-demo-contact-value"/);
 assert.match(html,/id="gl-demo-contact-name"/);
 assert.match(html,/Autorizo a GestLok a contactarme/);
 assert.match(html,/WhatsApp/);
 input.value='no';listeners.change({target:input});
 html=draft.view();
 assert.doesNotMatch(html,/id="gl-demo-contact-value"/);
 assert.match(html,/Muy buena · 4 de 5 estrellas/);
 let prevented=false;
 listeners.submit({target:{id:'gl-demo-feedback-form'},preventDefault(){prevented=true;}});
 assert.equal(prevented,true);
});
