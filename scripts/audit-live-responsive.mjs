// Prueba visual REAL del dominio publicado, sin acceder a datos privados.
// Ejecución en runner remoto con Chromium headless y capturas descargables.
// No modifica GESTLOK ni los usuarios: navegador sin sesión y sin service workers.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const require = createRequire('/tmp/gestlok-live-audit/package.json');
const { chromium } = require('playwright-core');
const origin = 'https://gestlok.com.ar/';
const target = 'artifacts/gestlok-live';
await mkdir(target, {recursive:true});
const configurations=[
 {name:'android-360',width:360,height:780,mobile:true},
 {name:'iphone-390',width:390,height:844,mobile:true},
 {name:'android-430',width:430,height:932,mobile:true},
 {name:'tablet-768',width:768,height:1024,mobile:false},
 {name:'desktop-1280',width:1280,height:900,mobile:false}
];
let chrome;
for(const binary of ['google-chrome','google-chrome-stable','chromium','chromium-browser']){
 try{chrome=execFileSync('which',[binary],{encoding:'utf8'}).trim();break;}catch{}
}
if(!chrome)throw Error('Chromium o Chrome no está instalado en el runner.');
const browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const report={origin,commit:process.env.GITHUB_SHA||'',timestamp:new Date().toISOString(),cases:[],globalErrors:[]};
try{
 for(const config of configurations){
  const context=await browser.newContext({
    viewport:{width:config.width,height:config.height},
    deviceScaleFactor:1,isMobile:config.mobile,hasTouch:config.mobile,
    serviceWorkers:'block',locale:'es-AR'
  });
  const page=await context.newPage();
  const entry={name:config.name,viewport:config.width,status:'not-checked',url:'',issues:[],consoleErrors:[]};
  page.on('pageerror',e=>entry.consoleErrors.push(e.message.slice(0,200)));
  try{
    const response=await page.goto(origin,{waitUntil:'domcontentloaded',timeout:40000});
    entry.httpStatus=response?.status()??null;
    entry.url=page.url();
    if(!response?.ok())entry.issues.push('HTTP '+entry.httpStatus);
    await page.locator('#au-in').waitFor({state:'visible',timeout:20000});
    await page.locator('#au-in .gbtn').waitFor({state:'visible',timeout:10000});
    entry.metrics=await page.evaluate(()=>{
      const card=document.querySelector('#auth .au-card');
      const google=document.querySelector('#au-in .gbtn');
      const email=document.querySelector('#au-email');
      const title=document.querySelector('#au-in h1');
      const css=el=>getComputedStyle(el);
      const b=card?.getBoundingClientRect();
      return {
        title:title?.textContent?.trim(),
        cardWidth:b?.width||0,cardLeft:b?.left||0,cardRight:b?.right||0,
        viewportWidth:window.innerWidth,scrollWidth:document.documentElement.scrollWidth,
        googleHeight:google?.getBoundingClientRect().height||0,
        emailFontSize:Number.parseFloat(css(email).fontSize||'0'),
        cardVisible:!!card&&b.width>0
      };
    });
    const m=entry.metrics;
    if(m.scrollWidth>config.width+2)entry.issues.push('Desbordamiento horizontal de '+(m.scrollWidth-config.width)+'px');
    if(config.width<=430){
      if(m.cardWidth<config.width-48)entry.issues.push('Login demasiado angosto: '+m.cardWidth.toFixed(0)+'px');
      if(m.googleHeight<47)entry.issues.push('Botón Google demasiado bajo: '+m.googleHeight.toFixed(0)+'px');
      if(m.emailFontSize<16)entry.issues.push('Input con letra menor a 16px');
    }
    if(config.width>=768&&m.cardWidth>650)entry.issues.push('Login demasiado ancho en tablet/PC');
    await page.screenshot({path:target+'/'+config.name+'.png',fullPage:true,animations:'disabled'});
    entry.status=entry.issues.length?'issues':'passed';
  }catch(e){
    entry.status='blocked';
    entry.issues.push(String(e.message).slice(0,500));
    try{await page.screenshot({path:target+'/'+config.name+'-error.png',fullPage:true});}catch{}
  }
  report.cases.push(entry);
  console.log('AUDIT_CASE '+JSON.stringify(entry));
  await context.close();
 }
 // Vista pública de empleados: cubre invitación/login sin tokens personales.
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 const page=await context.newPage();
 try{
  const resp=await page.goto(origin+'empleados/',{waitUntil:'domcontentloaded',timeout:40000});
  await page.waitForTimeout(1500);
  const m=await page.evaluate(()=>({title:document.title,innerWidth:window.innerWidth,scrollWidth:document.documentElement.scrollWidth,text:document.body.innerText.slice(0,200)}));
  const entry={name:'empleados-390',httpStatus:resp?.status(),...m};
  report.employeePage=entry;
  await page.screenshot({path:target+'/empleados-390.png',fullPage:true});
  console.log('AUDIT_EMPLOYEES '+JSON.stringify(entry));
 }catch(e){
  report.employeePage={status:'blocked',error:String(e.message).slice(0,500)};
  console.log('AUDIT_EMPLOYEES '+JSON.stringify(report.employeePage));
 }
 await context.close();
}finally{
 await browser.close();
 await writeFile(target+'/report.json',JSON.stringify(report,null,2));
}
const failures=report.cases.filter(c=>c.status!=='passed');
console.log('AUDIT_RESULT '+JSON.stringify({total:report.cases.length,passed:report.cases.length-failures.length,failed:failures.length,htmlOrigin:origin}));
if(failures.length)process.exitCode=1;
