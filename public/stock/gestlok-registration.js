/* Registration preferences are requests only. They never grant roles or modules. */
(() => {
  'use strict';
  const choices=Object.freeze({
    empleados:{label:'Administración de empleados',modules:['recibos_personal'],detail:'Recibos, personal, horarios y planillas.'},
    empresa:{label:'Administración de su empresa',modules:['comercial'],detail:'Productos, stock, proveedores y gestión comercial.'},
    ambas:{label:'Ambas',modules:['comercial','recibos_personal'],detail:'Empleados y gestión comercial desde la misma cuenta.'},
    chat:{label:'GESTLOK Chat · pedidos por chat',modules:['gestlok_chat'],detail:'Tus clientes piden solos por chat. La administradora revisa tu comercio y lo activa; después cargás tu carta.'}
  });
  // Datos del comercio para GESTLOK Chat (solo se piden si elige esa opción).
  const rubros=Object.freeze({gastronomia:'Gastronomía (pizzería, rotisería, empanadas…)',cafeteria:'Cafetería o panadería',almacen:'Almacén o kiosco',
    perfumeria:'Perfumería o cosmética',ferreteria:'Ferretería',mascotas:'Pet shop',otro:'Otro rubro'});
  const CLAVE_CHAT='gestlok_registro_chat';
  function negocioLimpio(n){
    const nombre=String(n?.nombre||'').replace(/\s+/g,' ').trim(),rubro=String(n?.rubro||''),localidad=String(n?.localidad||'').replace(/\s+/g,' ').trim();
    if(nombre.length<2||nombre.length>80)throw Error('Escribí el nombre de tu comercio.');
    if(!Object.hasOwn(rubros,rubro))throw Error('Elegí el rubro de tu comercio.');
    if(localidad.length>60)throw Error('La localidad es demasiado larga.');
    return {nombre,rubro,localidad};
  }
  let activeEmail='',pendingTask;
  function parse(kind,choice,negocio){
    if(kind==='colaborador')return {kind,choice:'',modules:[]};
    if(kind!=='dueno'||!Object.hasOwn(choices,choice))throw Error('Elegí el tipo de cuenta y qué querés administrar.');
    const intent={kind,choice,modules:[...choices[choice].modules]};
    if(choice==='chat')intent.negocio=negocioLimpio(negocio);
    return intent;
  }
  function fields(prefix){
    const box=document.createElement('div');box.className='gl-registration-fields';
    box.innerHTML=`<div class="fld"><label for="${prefix}-kind">Tipo de cuenta</label><select id="${prefix}-kind" data-registration-kind required><option value="">Elegí una opción</option><option value="dueno">Soy dueño/a</option><option value="colaborador">Soy colaborador/a de una empresa</option></select></div>
      <div class="fld" data-registration-module-field hidden><label for="${prefix}-modules">¿Qué querés administrar con GESTLOK?</label><select id="${prefix}-modules" data-registration-choice aria-describedby="${prefix}-detail"><option value="">Elegí una opción</option>${Object.entries(choices).map(([key,c])=>`<option value="${key}">${c.label}</option>`).join('')}</select><small id="${prefix}-detail" data-registration-detail></small></div>
      <div class="gl-registration-chat" data-registration-chat hidden>
        <div class="fld"><label for="${prefix}-negocio">Nombre de tu comercio</label><input id="${prefix}-negocio" data-registration-negocio maxlength="80" autocomplete="organization" placeholder="Ej.: La Esquina Pizzería"></div>
        <div class="fld"><label for="${prefix}-rubro">Rubro</label><select id="${prefix}-rubro" data-registration-rubro><option value="">Elegí el rubro</option>${Object.entries(rubros).map(([k,t])=>`<option value="${k}">${t}</option>`).join('')}</select></div>
        <div class="fld"><label for="${prefix}-localidad">Localidad del local (opcional)</label><input id="${prefix}-localidad" data-registration-localidad maxlength="60" placeholder="Ej.: Vicente López"></div>
      </div>`;
    return box;
  }
  function sync(form){
    const owner=form.querySelector('[data-registration-kind]').value==='dueno';
    form.querySelector('[data-registration-module-field]').hidden=!owner;
    const select=form.querySelector('[data-registration-choice]');select.required=owner;
    if(!owner)select.value='';
    form.querySelector('[data-registration-detail]').textContent=choices[select.value]?.detail||'';
    const chat=owner&&select.value==='chat',box=form.querySelector('[data-registration-chat]');
    if(box){box.hidden=!chat;box.querySelector('[data-registration-negocio]').required=chat;box.querySelector('[data-registration-rubro]').required=chat;}
  }
  const negocioDe=form=>({nombre:form.querySelector('[data-registration-negocio]')?.value,rubro:form.querySelector('[data-registration-rubro]')?.value,
    localidad:form.querySelector('[data-registration-localidad]')?.value});
  function read(form){return parse(form.querySelector('[data-registration-kind]')?.value,form.querySelector('[data-registration-choice]')?.value,negocioDe(form));}
  function mountSignup(){
    const form=document.querySelector('#au-up');
    if(!form||form.querySelector('.gl-registration-fields'))return;
    form.querySelector('.fld').before(fields('gl-signup'));
  }
  function message(form,text,error=false){
    const output=form.querySelector('[data-registration-status]');output.textContent=text;
    output.className=error?'au-msg err':'au-msg';
  }
  function busy(form,on){form.querySelectorAll('button,select,input').forEach(el=>{el.disabled=on;});}
  function fill(form,kind,modules,negocio){
    const choice=Object.keys(choices).find(key=>choices[key].modules.join(',')===(modules||[]).join(','))||'';
    form.querySelector('[data-registration-kind]').value=kind;
    form.querySelector('[data-registration-choice]').value=choice;
    if(negocio){
      const set=(sel,v)=>{const el=form.querySelector(sel);if(el)el.value=v||'';};
      set('[data-registration-negocio]',negocio.nombre);set('[data-registration-rubro]',negocio.rubro);set('[data-registration-localidad]',negocio.localidad);
    }
    sync(form);
  }
  async function submit(form){
    let intent;try{intent=read(form);}catch(e){message(form,e.message,true);return;}
    busy(form,true);
    try{
      const {error}=intent.choice==='chat'
        ?await window.GestLokSupabase.rpc('gestlok_request_chat_registration',{p_negocio:intent.negocio})
        :await window.GestLokSupabase.rpc('gestlok_request_registration',{p_kind:intent.kind,p_modules:intent.modules});
      if(error)throw error;
      try{localStorage.removeItem(CLAVE_CHAT);}catch{}
      message(form,intent.choice==='chat'?'Solicitud guardada. La administradora revisará tu comercio y te avisará cuando GESTLOK Chat esté activo.'
        :'Solicitud guardada. La administradora revisará tu cuenta y los módulos solicitados.');
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
        if(data){fill(form,data.kind,data.modules,data.negocio);message(form,data.status==='rejected'?'Tu solicitud fue rechazada. Podés revisarla y enviarla nuevamente.':'Tu solicitud está guardada y pendiente de revisión.');}
        else{
          const meta=session.user.user_metadata?.gestlok_registration;
          if(meta){
            // Los datos del comercio se guardan en este equipo al crear la cuenta (no en la cuenta).
            let guardado=null;try{const g=JSON.parse(localStorage.getItem(CLAVE_CHAT)||'null');if(g&&g.email===email)guardado=g.negocio;}catch{}
            let intent;try{intent=parse(meta.kind,meta.choice,guardado);}
            catch{
              if(meta.kind==='dueno'&&meta.choice==='chat'){fill(form,'dueno',choices.chat.modules,null);message(form,'Completá los datos de tu comercio y tocá Guardar solicitud.');}
              return;
            }
            fill(form,intent.kind,intent.modules,intent.negocio);
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
    if(found===choices.chat){
      const n=request.negocio||{};
      return 'Solicitud de dueño/a · GESTLOK Chat'+(n.nombre?' · '+n.nombre:'')+(rubros[n.rubro]?' ('+rubros[n.rubro]+')':'')+
        ' · Aprobala en Herramientas → GESTLOK Chat';
    }
    return found?'Solicitud de dueño/a · '+found.label:'Solicitud de dueño/a · Módulos pendientes';
  }
  document.addEventListener('change',e=>{if(e.target.matches('[data-registration-kind],[data-registration-choice]'))sync(e.target.closest('form'));});
  document.addEventListener('submit',e=>{
    if(e.target.id==='gl-registration-request'){e.preventDefault();submit(e.target);return;}
    // Al crear la cuenta con GESTLOK Chat: se recuerdan los datos del comercio para enviarlos al confirmar el email.
    if(e.target.id==='au-up'){
      try{const intent=read(e.target);const email=String(e.target.querySelector('#au-email2')?.value||'').trim().toLowerCase();
        if(intent.choice==='chat'&&email)localStorage.setItem(CLAVE_CHAT,JSON.stringify({email,negocio:intent.negocio}));}catch{}
    }
  },true);
  window.GestLokRegistration=Object.freeze({mountSignup,pending,read,parse,label,rubros});
})();
