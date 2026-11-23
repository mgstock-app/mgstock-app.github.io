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
    const rubro_otro=rubro==='otro'?String(n?.rubro_otro||'').replace(/\s+/g,' ').trim():'';
    if(rubro==='otro'&&(rubro_otro.length<2||rubro_otro.length>40))throw Error('Escribí cuál es tu rubro.');
    if(localidad.length>60)throw Error('La localidad es demasiado larga.');
    return rubro==='otro'?{nombre,rubro,rubro_otro,localidad}:{nombre,rubro,localidad};
  }
  let activeEmail='',pendingTask;
  const codigoLimpio=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  function parse(kind,choice,negocio,codigo){
    if(kind==='colaborador'){
      const c=codigoLimpio(codigo);
      if(!/^[A-HJ-NP-Z2-9]{8}$/.test(c))throw Error('Escribí el código privado del local (8 letras y números). Te lo da el dueño.');
      return {kind,choice:'',modules:[],codigo:c};
    }
    if(kind==='dueno'&&!choice)choice='chat';
    if(kind!=='dueno'||!Object.hasOwn(choices,choice))throw Error('Elegí el tipo de cuenta y qué querés administrar.');
    const intent={kind,choice,modules:[...choices[choice].modules]};
    if(choice==='chat')intent.negocio=negocioLimpio(negocio);
    return intent;
  }
  function fields(prefix){
    const box=document.createElement('div');box.className='gl-registration-fields';
    box.innerHTML=`<div class="fld"><label for="${prefix}-kind">Tipo de cuenta</label><select id="${prefix}-kind" data-registration-kind required><option value="">Elegí una opción</option><option value="dueno">Soy dueño/a</option><option value="colaborador">Soy gerente de un local</option></select></div>
      <div class="fld" data-registration-module-field hidden><label for="${prefix}-modules">¿Qué querés administrar con GESTLOK?</label><select id="${prefix}-modules" data-registration-choice aria-describedby="${prefix}-detail"><option value="chat">${choices.chat.label}</option></select></div>
      <div class="gl-registration-chat" data-registration-chat hidden>
        <div class="fld"><label for="${prefix}-negocio">Nombre de tu comercio</label><input id="${prefix}-negocio" data-registration-negocio maxlength="80" autocomplete="organization" placeholder="Ej.: La Esquina Pizzería"></div>
        <small class="gl-registration-detail">${choices.chat.detail}</small>
        <div class="fld"><label for="${prefix}-rubro">Rubro</label><select id="${prefix}-rubro" data-registration-rubro><option value="">Elegí el rubro</option>${Object.entries(rubros).map(([k,t])=>`<option value="${k}">${t}</option>`).join('')}</select></div>
        <div class="fld" data-registration-rubro-otro-field hidden><label for="${prefix}-rubro-otro">¿Cuál es tu rubro?</label><input id="${prefix}-rubro-otro" data-registration-rubro-otro maxlength="40" placeholder="Ej.: Librería, heladería, verdulería"></div>
        <div class="fld"><label for="${prefix}-localidad">Localidad del local (opcional)</label><input id="${prefix}-localidad" data-registration-localidad maxlength="60" placeholder="Ej.: Vicente López"></div>
      </div>
      <div class="fld" data-registration-gerente hidden><label for="${prefix}-codigo">Código privado del local</label><input id="${prefix}-codigo" data-registration-codigo maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Ej.: K7PA3QXM">
        <small>Te lo da el dueño: lo ve en su panel de GESTLOK Chat → Ajustes. El dueño acepta tu ingreso.</small></div>
      ${prefix==='gl-signup'?'<p class="gl-registration-o">o</p><button type="button" class="btn gl-registration-google" data-registration-google>Registrarme con Google</button>':''}`;
    return box;
  }
  function sync(form){
    const kind=form.querySelector('[data-registration-kind]').value,owner=kind==='dueno',gerente=kind==='colaborador';
    // Por ahora el alta pública ofrece solo GESTLOK Chat: la elección queda fija y oculta.
    form.querySelector('[data-registration-module-field]').hidden=true;
    const select=form.querySelector('[data-registration-choice]');select.value=owner?'chat':'';select.required=false;
    const box=form.querySelector('[data-registration-chat]');
    if(box){box.hidden=!owner;box.querySelector('[data-registration-negocio]').required=owner;box.querySelector('[data-registration-rubro]').required=owner;
      const otro=owner&&box.querySelector('[data-registration-rubro]').value==='otro';
      box.querySelector('[data-registration-rubro-otro-field]').hidden=!otro;box.querySelector('[data-registration-rubro-otro]').required=otro;}
    const g=form.querySelector('[data-registration-gerente]');
    if(g){g.hidden=!gerente;g.querySelector('[data-registration-codigo]').required=gerente;}
  }
  const negocioDe=form=>({nombre:form.querySelector('[data-registration-negocio]')?.value,rubro:form.querySelector('[data-registration-rubro]')?.value,
    rubro_otro:form.querySelector('[data-registration-rubro-otro]')?.value,localidad:form.querySelector('[data-registration-localidad]')?.value});
  function read(form){return parse(form.querySelector('[data-registration-kind]')?.value,form.querySelector('[data-registration-choice]')?.value,negocioDe(form),
    form.querySelector('[data-registration-codigo]')?.value);}
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
  function fill(form,kind,modules,negocio,codigo){
    form.querySelector('[data-registration-kind]').value=kind;
    const set=(sel,v)=>{const el=form.querySelector(sel);if(el)el.value=v||'';};
    if(negocio&&kind==='dueno'){
      set('[data-registration-negocio]',negocio.nombre);set('[data-registration-rubro]',negocio.rubro);
      set('[data-registration-rubro-otro]',negocio.rubro_otro);set('[data-registration-localidad]',negocio.localidad);
    }
    if(kind==='colaborador')set('[data-registration-codigo]',codigo||negocio?.codigo);
    sync(form);
  }
  async function submit(form){
    let intent;try{intent=read(form);}catch(e){message(form,e.message,true);return;}
    busy(form,true);
    try{
      const rpc=(fn,args)=>window.GestLokSupabase.rpc(fn,args);
      const {data,error}=intent.kind==='colaborador'?await rpc('gestlok_request_gerente_registration',{p_codigo:intent.codigo})
        :intent.choice==='chat'?await rpc('gestlok_request_chat_registration',{p_negocio:intent.negocio})
        :await rpc('gestlok_request_registration',{p_kind:intent.kind,p_modules:intent.modules});
      if(error)throw error;
      if(data?.error)throw new Error(data.error);
      try{localStorage.removeItem(CLAVE_CHAT);}catch{}
      message(form,intent.kind==='colaborador'?'Solicitud enviada a '+(data?.empresa||'la empresa')+(data?.local?' · '+data.local:'')+'. Cuando el dueño la acepte vas a entrar como gerente.'
        :intent.choice==='chat'?'Solicitud guardada. La administradora revisará tu comercio y te avisará cuando GESTLOK Chat esté activo.'
        :'Solicitud guardada. La administradora revisará tu cuenta y los módulos solicitados.');
    }catch(e){message(form,/c[oó]digo/i.test(String(e?.message||''))?String(e.message):'No se pudo guardar la solicitud. Revisá la conexión y volvé a intentarlo.',true);}
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
        const note=document.createElement('p');note.textContent='Si sos dueño, contanos de tu comercio. Si sos gerente, escribí el código privado de tu local.';
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
        if(data){fill(form,data.kind,data.modules,data.negocio,data.negocio?.codigo);message(form,data.status==='rejected'?'Tu solicitud fue rechazada. Podés revisarla y enviarla nuevamente.':'Tu solicitud está guardada y pendiente de revisión.');}
        else{
          // Lo elegido al registrarse queda en este equipo (con Google todavía no se conoce el email: se guarda vacío).
          let guardado=null;try{const g=JSON.parse(localStorage.getItem(CLAVE_CHAT)||'null');if(g&&(g.email===email||g.email===''))guardado=g;}catch{}
          let meta=session.user.user_metadata?.gestlok_registration;
          if(!meta&&guardado?.kind)meta={kind:guardado.kind,choice:guardado.choice};
          if(meta){
            let intent;try{intent=parse(meta.kind,meta.choice,guardado?.negocio,guardado?.codigo);}
            catch{
              if(meta.kind==='dueno'||meta.kind==='colaborador'){fill(form,meta.kind,[],guardado?.negocio,guardado?.codigo);
                message(form,meta.kind==='dueno'?'Completá los datos de tu comercio y tocá Guardar solicitud.':'Escribí el código privado del local y tocá Guardar solicitud.');}
              return;
            }
            fill(form,intent.kind,intent.modules,intent.negocio,intent.codigo);
            await submit(form);
          }
        }
      }catch{message(form,'Completá tu solicitud y tocá Guardar. Si no se guarda, revisá la conexión.',true);}
      finally{if(email===activeEmail)busy(form,false);}
    })();
    return pendingTask;
  }
  function label(request){
    if(request?.tipoCuenta==='colaborador'){
      const n=request.negocio||{};
      return n.tipo==='gerente'?'Solicitud de gerente · '+(n.empresa||'')+(n.local?' · '+n.local:'')+' · La acepta el dueño desde su panel':'Solicitud de colaborador/a';
    }
    if(request?.tipoCuenta!=='dueno')return '';
    const found=Object.values(choices).find(c=>JSON.stringify(c.modules)===JSON.stringify(request.modulosSolicitados));
    if(found===choices.chat){
      const n=request.negocio||{};
      return 'Solicitud de dueño/a · GESTLOK Chat'+(n.nombre?' · '+n.nombre:'')+(rubros[n.rubro]?' ('+rubros[n.rubro]+')':'')+
        ' · Aprobala en Herramientas → GESTLOK Chat';
    }
    return found?'Solicitud de dueño/a · '+found.label:'Solicitud de dueño/a · Módulos pendientes';
  }
  document.addEventListener('change',e=>{if(e.target.matches('[data-registration-kind],[data-registration-choice],[data-registration-rubro]'))sync(e.target.closest('form'));});
  // Registrarme con Google: primero valida lo elegido, lo guarda en este equipo y usa el mismo ingreso con Google.
  document.addEventListener('click',e=>{
    const b=e.target.closest?.('[data-registration-google]');if(!b)return;
    e.preventDefault();e.stopPropagation();
    const form=b.closest('form');let intent;
    try{intent=read(form);}catch(err){const out=document.querySelector('#au-msg-up,[data-au-msg="up"]');if(out){out.textContent=err.message;}else{window.alert(err.message);}return;}
    try{localStorage.setItem(CLAVE_CHAT,JSON.stringify({email:'',kind:intent.kind,choice:intent.choice,negocio:intent.negocio||null,codigo:intent.codigo||null}));}catch{}
    document.querySelector('#au-in [data-au="google"]')?.click();
  },true);
  document.addEventListener('submit',e=>{
    if(e.target.id==='gl-registration-request'){e.preventDefault();submit(e.target);return;}
    // Al crear la cuenta con GESTLOK Chat: se recuerdan los datos del comercio para enviarlos al confirmar el email.
    if(e.target.id==='au-up'){
      try{const intent=read(e.target);const email=String(e.target.querySelector('#au-email2')?.value||'').trim().toLowerCase();
        if(email&&(intent.choice==='chat'||intent.kind==='colaborador'))localStorage.setItem(CLAVE_CHAT,JSON.stringify({email,kind:intent.kind,choice:intent.choice,negocio:intent.negocio||null,codigo:intent.codigo||null}));}catch{}
    }
  },true);
  // «Recordar mi email» en el ingreso. La contraseña la guarda el navegador (los campos ya lo permiten); GESTLOK nunca la guarda.
  const NO_RECORDAR='gestlok:no-recordar-email';
  function mountRecordar(){
    if(typeof document.querySelector!=='function')return;
    const form=document.querySelector('#au-in');if(!form||form.querySelector('[data-registration-recordar]'))return;
    let no=false;try{no=localStorage.getItem(NO_RECORDAR)==='1';if(no)localStorage.removeItem('gestlok:ultimo-email');}catch{}
    const l=document.createElement('label');l.className='gl-registration-recordar';
    l.innerHTML='<input type="checkbox" data-registration-recordar'+(no?'':' checked')+'> Recordar mi email';
    // En la misma línea que «Contraseña»: no agrega alto al formulario.
    const fld=form.querySelector('#au-pass')?.closest('.fld');if(fld)fld.prepend(l);else form.querySelector('button[type="submit"]')?.before(l);
  }
  document.addEventListener('change',e=>{
    if(!e.target.matches?.('[data-registration-recordar]'))return;
    try{if(e.target.checked)localStorage.removeItem(NO_RECORDAR);else{localStorage.setItem(NO_RECORDAR,'1');localStorage.removeItem('gestlok:ultimo-email');}}catch{}
  });
  mountRecordar();document.addEventListener('DOMContentLoaded',mountRecordar);
  window.GestLokRegistration=Object.freeze({mountSignup,pending,read,parse,label,rubros,mountRecordar});
})();
