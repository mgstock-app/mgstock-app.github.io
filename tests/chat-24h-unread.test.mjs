import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const app=readFileSync("public/stock/app.js","utf8");
const css=readFileSync("app/globals.css","utf8");
const sql=readFileSync("supabase/migrations/20261024_gestlok_chat_retention_24h.sql","utf8");

const helper=()=>{
  const chunk=app.match(/const CHAT_RETENTION_MS =[^]*?const chatSeenKey =/);
  assert.ok(chunk,"Helper para 24 horas presente");
  return vm.runInNewContext(chunk[0].replace(/const chatSeenKey =$/,"")+"\nchatRecent");
};
test("24h: chat vigente visible, mensajes antiguos e inválidos ocultos",()=>{
  const recent=helper();
  const now=Date.now();
  assert.equal(recent({fecha:now-1000}),true);
  assert.equal(recent({fecha:now-23*60*60*1000}),true);
  assert.equal(recent({fecha:now-25*60*60*1000}),false);
  assert.equal(recent({fecha:"sin fecha"}),false);
  assert.equal(recent({}),false);
});
test("El chat no se borra al cambiar de sección y guarda borradores por local",()=>{
  assert.match(app,/S\.chat\.filter\(chatRecent\)\.map\(/);
  assert.match(app,/const chatDraftKey = \(\) => 'gestlok-chat-draft-v1:'/);
  assert.match(app,/S\.chat = snap\.docs\.map[\s\S]*?\.filter\(chatRecent\)/);
  assert.match(app,/if \(S\.local\) refreshChatAges\(\);/);
  assert.match(app,/Los mensajes duran 24 horas/);
});
test("Punto de color al recibir mensajes de otra persona, por local y usuario",()=>{
  assert.match(app,/gestlok-chat-seen:'/);
  assert.match(app,/const since = Number\(lsGet\(chatSeenKey\(\), 0\)\) \|\| 0/);
  assert.match(app,/S\.unreadChat = S\.chat\.filter\(m => m\.autor !== S\.uid && Number\(m\.fecha\) > since\)\.length/);
  assert.match(app,/class="gl-chat-dot"/);
  assert.match(css,/\.gl-chat-dot\s*\{/);
  assert.match(app,/if \(S\.view === 'chat'\) markChatRead\(\)/);
});
test("La eliminación del servidor afecta solamente chats con más de 24 horas",()=>{
  assert.match(sql,/create policy gestlok_chat_read_max24h/i);
  assert.match(sql,/as restrictive for select to authenticated/i);
  assert.match(sql,/interval '24 hours'/i);
  assert.match(sql,/cron\.schedule\(/i);
  assert.match(sql,/delete from public\.docs/i);
  assert.match(sql,/where col ~ '\^\[\^\/\]\+\/chat\$'/i);
  assert.doesNotMatch(sql,/truncate\s+public\.docs/i);
  assert.doesNotMatch(sql,/delete\s+from\s+public\.docs\s*;/i);
});
test("Las notificaciones push permanecen desactivadas",()=>{
  assert.doesNotMatch(app,/Notification\.requestPermission|GestLokPush|pushManager/);
});
