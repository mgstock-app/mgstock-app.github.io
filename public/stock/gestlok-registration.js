/* Registration preferences are requests only. They never grant roles or modules. */
(() => {
  'use strict';
  const choices=Object.freeze({
    empleados:{label:'Administración de empleados',modules:['recibos_personal'],detail:'Recibos, personal, horarios y planillas.'},
    empresa:{label:'Administración de su empresa',modules:['comercial'],detail:'Productos, stock, proveedores y gestión comercial.'},
    ambas:{label:'Ambas',modules:['comercial','recibos_personal'],detail:'Empleados y gestión comercial desde la misma cuenta.'}
  });
  let activeEmail='',pendingTask;
  function parse(kind,choice){
    if(kind==='colaborador')return {kind,choice:'',modules:[]};
    if(kind!=='dueno'||!Object.hasOwn(choices,choice))throw Error('Elegí el tipo de cuenta y qué querés administrar.');
    return {kind,choice,modules:[...choices[choice].modules]};
  }
  function fields(prefix){
    const box=document.createElement('div');box.className='gl-registration-fields';
    box.innerHTML=`<div class="fld"><label for="${prefix}-kind">Tipo de cuenta</label><select id="${prefix}-kind" data-registration-kind required><option value="">Elegí una opción</option><option value="dueno">Soy dueño/a</option><option value="colaborador">Soy colaborador/a de una empresa</option></select></div>
      <div class="fld" data-registration-module-field hidden><label for="${prefix}-modules">¿Qué querés administrar con GESTLOK?</label><select id="${prefix}-modules" data-registration-choice aria-describedby="${prefix}-detail"><option value="">Elegí una opción</option>${Object.entries(choices).map(([key,c])=>`<option value="${key}">${c.label}</option>`).join('')}</select><small id="${prefix}-detail" data-registration-detail></small></div>`;
    return box;
  }
  function sync(form){
    const owner=form.querySelector('[data-registration-kind]').value==='dueno';
    form.querySelector('[data-registration-module-field]').hidden=!owner;
    const select=form.querySelector('[data-registration-choice]');select.required=owner;
    if(!owner)select.value='';
    form.querySelector('[data-registration-detail]').textContent=choices[select.value]?.detail||'';
  }
  function read(form){return parse(form.querySelector('[data-registration-kind]')?.value,form.querySelector('[data-registration-choice]')?.value);}
  function mountSignup(){
    const form=document.querySelector('#au-up');
    if(!form||form.querySelector('.gl-registration-fields'))return;
    form.querySelector('.fld').before(fields('gl-signup'));
  }
  function message(form,text,error=false){
    const output=form.querySelector('[data-registration-status]');output.textContent=text;
    output.className=error?'au-msg err':'au-msg';
  }
  function busy(form,on){form.querySelectorAll('button,select').forEach(el=>{el.disabled=on;});}
  function fill(form,kind,modules){
    const choice=Object.keys(choices).find(key=>choices[key].modules.join(',')===(modules||[]).join(','))||'';
    form.querySelector('[data-registration-kind]').value=kind;
    form.querySelector('[data-registration-choice]').value=choice;sync(form);
  }
  async function submit(form){
    let intent;try{intent=read(form);}catch(e){message(form,e.message,true);return;}
    busy(form,true);
    try{
      const {error}=await window.GestLokSupabase.rpc('gestlok_request_registration',{p_kind:intent.kind,p_modules:intent.modules});
      if(error)throw error;
      message(form,'Solicitud guardada. La administradora revisará tu cuenta y los módulos solicitados.');
    }catch{message(form,'No se pudo guardar la solicitud. Revisá la conexión y volvé a intentarlo.',true);}
    finally{busy(form,false);}
  }
  function pending(session){
    const email=String(session?.user?.email||'').toLowerCase();
    if(email===activeEmail&&pendingTask)return pendingTask;
    activeEmail=email;
    pendingTask=(async()=>{
      const parent=document.querySelector('[data-mode="pend"]');if(!parent)return;
      let form=parent.querySelector('#gl-registration-request');
      if(!form){
        form=document.createElement('form');form.id='gl-registration-request';
        const title=document.createElement('h2');title.textContent='Tu solicitud de acceso';
        const note=document.createElement('p');note.textContent='Elegí cómo vas a usar GESTLOK. La administradora habilitará los módulos y el acceso a tu empresa.';
        const button=document.createElement('button');button.className='btn primary';button.type='submit';button.textContent='Guardar solicitud';
        const output=document.createElement('p');output.setAttribute('role','status');output.setAttribute('aria-live','polite');output.dataset.registrationStatus='';
        form.append(title,note,fields('gl-request'),button,output);
        parent.querySelector('button').before(form);
      }
      busy(form,true);
      try{
        const {data,error}=await window.GestLokSupabase.rpc('gestlok_my_registration');
        if(error)throw error;
        if(email!==activeEmail)return;
        if(data){fill(form,data.kind,data.modules);message(form,data.status==='rejected'?'Tu solicitud fue rechazada. Podés revisarla y enviarla nuevamente.':'Tu solicitud está guardada y pendiente de revisión.');}
        else{
          const meta=session.user.user_metadata?.gestlok_registration;
          if(meta){
            let intent;try{intent=parse(meta.kind,meta.choice);}catch{return;}
            fill(form,intent.kind,intent.modules);
            await submit(form);
          }
        }
      }catch{message(form,'Completá tu solicitud y tocá Guardar. Si no se guarda, revisá la conexión.',true);}
      finally{if(email===activeEmail)busy(form,false);}
    })();
    return pendingTask;
  }
  function label(request){
    if(request?.tipoCuenta==='colaborador')return 'Solicitud de colaborador/a';
    if(request?.tipoCuenta!=='dueno')return '';
    const found=Object.values(choices).find(c=>JSON.stringify(c.modules)===JSON.stringify(request.modulosSolicitados));
    return found?'Solicitud de dueño/a · '+found.label:'Solicitud de dueño/a · Módulos pendientes';
  }
  document.addEventListener('change',e=>{if(e.target.matches('[data-registration-kind],[data-registration-choice]'))sync(e.target.closest('form'));});
  document.addEventListener('submit',e=>{if(e.target.id==='gl-registration-request'){e.preventDefault();submit(e.target);}},true);
  window.GestLokRegistration=Object.freeze({mountSignup,pending,read,parse,label});
})();
