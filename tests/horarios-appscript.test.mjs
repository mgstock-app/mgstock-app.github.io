import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
const source=readFileSync(new URL('../modules/empleados/utils/schedule-history.ts',import.meta.url),'utf8');
const out=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const mod={exports:{}};
vm.runInNewContext(out,{module:mod,exports:mod.exports});
const script=mod.exports.scriptParaSheets('synthetic-code','https://example.supabase.co','public-test');
test('Archivo automático: lunes 08 Argentina, una vez tras confirmar, reintenta fallos y no necesita navegador',()=>{
 const properties={GESTLOK_PLANILLA:'synthetic-sheet'};
 let saves=0,fail=false;
 const context={Date,Number,Error,PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k],setProperties:o=>Object.assign(properties,o)})},
  Utilities:{formatDate:(date,zone,fmt)=>{
   assert.equal(zone,'America/Argentina/Buenos_Aires');
   const local=new Date(date.getTime()-3*3600000);
   return fmt==='u'?String(local.getUTCDay()||7):fmt==='HHmm'?local.toISOString().slice(11,16).replace(':',''):local.toISOString().slice(0,10);
  }},SpreadsheetApp:{openById:id=>{assert.equal(id,'synthetic-sheet');return {};}}};
 vm.createContext(context);vm.runInContext(script,context);
 context.guardarArchivoGestlok=()=>{saves++;if(fail)throw Error('Exportación fallida');return {archivo_id:'synthetic-archive'};};
 const run=d=>context.ejecutarArchivoProgramadoGestlok(new Date(d));
 run('2026-11-09T10:59:00Z');assert.equal(saves,0);
 fail=true;assert.throws(()=>run('2026-11-09T11:00:00Z'),/fallida/);
 assert.equal(properties.GESTLOK_ULTIMO_LUNES,undefined);
 fail=false;run('2026-11-09T11:01:00Z');assert.equal(saves,2);
 run('2026-11-09T11:02:00Z');assert.equal(saves,2);
 run('2026-11-10T11:00:00Z');assert.equal(saves,2);
 run('2026-11-16T11:00:00Z');assert.equal(saves,3);
 assert.equal(properties.GESTLOK_ULTIMO_LUNES,'2026-11-16');
});
test('PDF: exporta hasta la última fila visible con contenido, no corta la hoja Semana ni envía si falla una exportación',()=>{
 let released=0,posted=0,fail=false;
 const pdf=Buffer.from('%PDF-1.4\nsynthetic complete PDF\n%%EOF');
 const values=[['Colaborador'],...Array.from({length:89},(_,i)=>[i===88?'Última persona':''])];
 const sheet=name=>({getName:()=>name,getLastColumn:()=>27,getSheetId:()=>name==='Semana'?0:2,
  getDataRange:()=>({getDisplayValues:()=>values}),getRange:range=>({getDisplayValue:()=>range==='B2'?'02/10/2026':'08/10/2026',getDisplayValues:()=>range==='K5:K64'?[['7']]:[['Persona ficticia','','','','','','','','40','']]})});
 const context={Error,JSON,String,Number,Math,LockService:{getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>released++})},
  SpreadsheetApp:{flush:()=>{}},ScriptApp:{getOAuthToken:()=> 'synthetic-oauth'},Utilities:{base64Encode:b=>Buffer.from(b).toString('base64')},
  UrlFetchApp:{fetch:(url,opts)=>{
   if(url.includes('/export?')){
    assert.match(url,/r2=90/,'Incluye última persona');
    if(url.includes('gid=0'))assert.match(url,/c2=27/,'Incluye todas las columnas de Semana');
    if(fail&&url.includes('gid=0'))throw Error('PDF no disponible');
    return {getBlob:()=>({getBytes:()=>Array.from(pdf),getContentType:()=> 'application/pdf'})};
   }
   posted++;const data=JSON.parse(opts.payload);
   assert.equal(data.p_desde,'02/10/2026');assert.equal(data.p_hasta,'08/10/2026');
   assert.equal(data.p_semana,pdf.toString('base64'));assert.equal(data.p_resumen,pdf.toString('base64'));
   return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({ok:true,archivo_id:'archive',semana:'2026-10-02'})};
  }}};
 vm.createContext(context);vm.runInContext(script,context);
 const ss={getId:()=> 'synthetic-sheet',getSheetByName:sheet};
 context.guardarArchivoGestlok(ss);assert.equal(posted,1);assert.equal(released,1);
 fail=true;assert.throws(()=>context.guardarArchivoGestlok(ss),/no disponible/);
 assert.equal(posted,1,'No envía archivo incompleto');assert.equal(released,2);
});
