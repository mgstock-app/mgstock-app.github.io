// Preserved behavior from test-app; mounted and disposed by the React hooks.
export function registerCloudBackups(scope, ctx) {
const { document, window, setTimeout } = scope;
ctx.leerCopia = function (texto) {
    var o;
    try {
        o = JSON.parse(texto);
    }
    catch (e) {
        return { err: "El archivo no es una copia de seguridad válida." };
    }
    if (!o || o.tipo !== ctx.COPIA_TIPO || !Array.isArray(o.hojas))
        return { err: "Este archivo no es una copia de seguridad de esta planilla." };
    var hojas = o.hojas.filter(function (h) {
        return h && typeof h.id === "string" && ctx.ID_OK.test(h.id) && h.datos && typeof h.datos === "object" && !Array.isArray(h.datos) && typeof h.datos.nombreHoja === "string";
    }).map(function (h) {
        return { id: h.id, datos: h.datos, historial: (Array.isArray(h.historial) ? h.historial : []).filter(function (r) { return r && typeof r.id === "string" && ctx.ID_OK.test(r.id) && r.datos && typeof r.datos === "object" && !Array.isArray(r.datos); }) };
    });
    if (!hojas.length)
        return { err: "La copia no tiene hojas para restaurar." };
    return { copia: { tipo: ctx.COPIA_TIPO, creado: o.creado || "", ajustes: o.ajustes && typeof o.ajustes === "object" ? o.ajustes : {}, hojas: hojas } };
};
ctx.restaurarCopia = function (copia, avance) {
    if (!window.REPORT_IS_DEMO && window.reportServices.restore)
        return window.reportServices.restore(copia);
    var db = ctx.S.db, tareas = [];
    copia.hojas.forEach(function (h) {
        tareas.push(function () { return db.doc("hojas/" + h.id).set(h.datos); });
        h.historial.forEach(function (r) { tareas.push(function () { return db.doc("hojas/" + h.id + "/historial/" + r.id).set(r.datos); }); });
    });
    var t = copia.ajustes && copia.ajustes.tema;
    if (t && ctx.TONOS[t.tono])
        tareas.push(function () { return db.doc("ajustes/tema").set({ tono: t.tono, modo: ctx.MODOS[t.modo] ? t.modo : "auto" }); });
    var hecho = 0;
    return tareas.reduce(function (p, f) { return p.then(function () { return ctx.conReintento(f).then(function () { hecho++; if (avance)
        avance(hecho, tareas.length); }); }); }, Promise.resolve());
};
ctx.modalRestaurar = function (copia) {
    var k = ctx.cuentaCopia(copia);
    ctx.abrirModal('<h2 id="mTitulo">Restaurar copia de seguridad</h2><p class="m-sub" id="rSub"></p>' +
        '<dl class="resumen-envio"><dt>Hojas</dt><dd id="rHojas"></dd><dt>Registros de historial</dt><dd id="rReg"></dd></dl>' +
        '<p class="alerta">Las hojas de la copia vuelven a quedar como estaban ese día: datos, valores unitarios, WhatsApp, alias y firmas. Lo que hayas cargado después en esas hojas se reemplaza. El historial no se borra: se recuperan los registros de la copia y se mantienen los más nuevos. Las hojas creadas después de la copia no se tocan.</p>' +
        '<p class="hint">Antes de restaurar se guarda sola en la nube una copia de cómo está todo ahora, así podés volver atrás.</p>' +
        '<div class="progreso" id="rProg" hidden><span style="width:0"></span></div><p class="hint" id="rTxt"></p><p class="err-txt" id="mErr"></p>' +
        '<div class="m-acc"><button type="button" class="btn sec" data-cerrar id="rCancel">Cancelar</button><button type="button" class="btn rojo" id="rOk">Restaurar</button></div>');
    ctx.$("rSub").textContent = (copia.creado ? "Copia del " + ctx.fechaHoraTxt(copia.creado) : "Copia sin fecha") + (copia.motivo ? " · " + copia.motivo : "");
    ctx.$("rHojas").textContent = k.hojas + " (Torcuato " + k.dt + " · Munro " + k.munro + ")";
    ctx.$("rReg").textContent = k.registros;
    scope.listen(ctx.$("rOk"), "click", function () {
        var barra = ctx.$("rProg").querySelector("span");
        ctx.$("rOk").disabled = ctx.$("rCancel").disabled = true;
        ctx.modalCerrable = false;
        ctx.$("mErr").textContent = "";
        var reactivar = function (msg) { ctx.modalCerrable = true; ctx.$("rOk").disabled = ctx.$("rCancel").disabled = false; ctx.$("rTxt").textContent = ""; ctx.$("mErr").textContent = msg; };
        ctx.$("rTxt").textContent = "Guardando en la nube una copia de cómo está todo ahora…";
        var paso1 = ctx.guardarCopiaNube("Antes de restaurar").catch(function (e) { var er = new Error("previa"); er.previa = e; throw er; });
        paso1.then(function () {
            ctx.$("rProg").hidden = false;
            ctx.$("rTxt").textContent = "Restaurando…";
            return ctx.restaurarCopia(copia, function (i, n) { barra.style.width = Math.round(i / n * 100) + "%"; ctx.$("rTxt").textContent = "Restaurando… " + i + " de " + n; });
        }).then(function () {
            ctx.modalCerrable = true;
            ctx.cerrarModal();
            ctx.suscribirHistorial();
            ctx.pintarTodo();
            ctx.toast("Copia restaurada con éxito · " + k.hojas + " hojas");
        }).catch(function (e) {
            if (e && e.previa)
                reactivar("No se pudo guardar la copia previa en la nube (" + ctx.msgError(e.previa) + "). Por seguridad no se restauró nada.");
            else
                reactivar(ctx.msgError(e) + " La restauración quedó a medias: volvé a tocar Restaurar para completarla.");
        });
    });
};
ctx.idCopiaNube = function () { var d = new Date(), z = function (n) { return (n < 10 ? "0" : "") + n; }; return "c" + d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + "-" + z(d.getHours()) + z(d.getMinutes()) + z(d.getSeconds()) + "-" + Math.random().toString(36).slice(2, 6); };
ctx.enSerie = function (tareas, avance) { var hecho = 0; return tareas.reduce(function (p, f) { return p.then(function () { return ctx.conReintento(f).then(function () { hecho++; if (avance)
    avance(hecho, tareas.length); }); }); }, Promise.resolve()); };
ctx.guardarCopiaNube = function (motivo) {
    if (!ctx.S.db || (window.REPORT_PERMISSIONS && !window.REPORT_PERMISSIONS.allowed('backups')))
        return Promise.reject(new Error("sin acceso"));
    if (ctx.S.nubeOcupada)
        return ctx.S.nubeOcupada;
    var db = ctx.S.db;
    var p = ctx.armarCopia().then(function (copia) {
        var id = ctx.idCopiaNube(), k = ctx.cuentaCopia(copia), tareas = [];
        var meta = { creado: copia.creado, motivo: motivo, hojas: k.hojas, registros: k.registros, dt: k.dt, munro: k.munro, tema: copia.ajustes.tema || null, estado: "guardando" };
        tareas.push(function () { return db.doc("copias/" + id).set(meta); });
        copia.hojas.forEach(function (h) {
            var partes = [];
            for (var i = 0; i < h.historial.length; i += ctx.NUBE_PARTE)
                partes.push(h.historial.slice(i, i + ctx.NUBE_PARTE));
            tareas.push(function () { return db.doc("copias/" + id + "/hojas/" + h.id).set({ datos: h.datos, partes: partes.length }); });
            partes.forEach(function (pt, n) { tareas.push(function () { return db.doc("copias/" + id + "/hojas/" + h.id + "/historial/p" + n).set({ n: n, registros: pt }); }); });
        });
        tareas.push(function () { meta.estado = "lista"; return db.doc("copias/" + id).set(meta); });
        tareas.push(function () { return db.doc("ajustes/nube").set({ fecha: copia.creado, id: id, motivo: motivo }); });
        return ctx.enSerie(tareas).then(function () { ctx.S.nube = { fecha: copia.creado, id: id, motivo: motivo }; return id; });
    });
    ctx.S.nubeOcupada = p;
    ctx.pintarCopiaSiInicio();
    p.then(function () { ctx.S.nubeOcupada = null; ctx.pintarCopiaSiInicio(); ctx.podarCopiasNube(); }, function () { ctx.S.nubeOcupada = null; ctx.pintarCopiaSiInicio(); });
    return p;
};
ctx.pintarCopiaSiInicio = function () { if (ctx.S.cargado && ctx.S.pantalla === "inicio")
    ctx.pintarCopia(); };
ctx.listarCopiasNube = function () {
    return ctx.conReintento(function () { return ctx.S.db.collection("copias").limit(1000).get(); }).then(function (snap) {
        return snap.docs.map(function (d) { var x = d.data() || {}; return { id: d.id, creado: x.creado || "", motivo: x.motivo || "", hojas: x.hojas || 0, registros: x.registros || 0, estado: x.estado || "" }; })
            .sort(function (a, b) { return a.creado < b.creado ? 1 : -1; });
    });
};
ctx.borrarCopiaNube = function (id) {
    var db = ctx.S.db;
    return ctx.conReintento(function () { return db.collection("copias/" + id + "/hojas").limit(1000).get(); }).then(function (hs) {
        var tareas = [];
        return hs.docs.reduce(function (p, d) {
            return p.then(function () {
                return ctx.conReintento(function () { return db.collection("copias/" + id + "/hojas/" + d.id + "/historial").limit(1000).get(); }).then(function (ps) {
                    ps.docs.forEach(function (x) { tareas.push(function () { return db.doc("copias/" + id + "/hojas/" + d.id + "/historial/" + x.id).delete(); }); });
                    tareas.push(function () { return db.doc("copias/" + id + "/hojas/" + d.id).delete(); });
                });
            });
        }, Promise.resolve()).then(function () { tareas.push(function () { return db.doc("copias/" + id).delete(); }); return ctx.enSerie(tareas); });
    });
};
ctx.podarCopiasNube = function () {
    if (!ctx.S.db || ctx.S.soloLectura || ctx.S.podando)
        return;
    ctx.S.podando = true;
    ctx.listarCopiasNube().then(function (l) {
        var listas = l.filter(function (c) { return c.estado === "lista"; }), viejas = listas.slice(ctx.NUBE_MAX);
        var colgadas = l.filter(function (c) { return c.estado !== "lista" && c.id !== (ctx.S.nube && ctx.S.nube.id) && (!c.creado || Date.now() - new Date(c.creado).getTime() > 3600e3); });
        return viejas.concat(colgadas).reduce(function (p, c) { return p.then(function () { return ctx.borrarCopiaNube(c.id); }); }, Promise.resolve());
    }).catch(function () { }).then(function () { ctx.S.podando = false; });
};
ctx.cargarCopiaNube = function (id) {
    var db = ctx.S.db;
    return Promise.all([
        ctx.conReintento(function () { return db.doc("copias/" + id).get(); }),
        ctx.conReintento(function () { return db.collection("copias/" + id + "/hojas").limit(1000).get(); })
    ]).then(function (r) {
        var meta = r[0].exists ? r[0].data() : {}, hojas = [];
        return r[1].docs.reduce(function (p, d) {
            return p.then(function () {
                return ctx.conReintento(function () { return db.collection("copias/" + id + "/hojas/" + d.id + "/historial").limit(1000).get(); }).then(function (ps) {
                    var partes = ps.docs.map(function (x) { return x.data() || {}; }).sort(function (a, b) { return (a.n || 0) - (b.n || 0); }), hist = [];
                    partes.forEach(function (pt) { (pt.registros || []).forEach(function (rg) { hist.push(rg); }); });
                    var x = d.data() || {};
                    hojas.push({ id: d.id, datos: x.datos, historial: hist });
                });
            });
        }, Promise.resolve()).then(function () {
            var res = ctx.leerCopia(JSON.stringify({ tipo: ctx.COPIA_TIPO, creado: meta.creado || "", ajustes: meta.tema ? { tema: meta.tema } : {}, hojas: hojas }));
            if (res.err)
                throw new Error(res.err);
            res.copia.motivo = meta.motivo || "";
            return res.copia;
        });
    });
};
ctx.modalNube = function () {
    ctx.abrirModal('<h2 id="mTitulo">Copias en la nube</h2><p class="m-sub">Se guardan solas todos los días y antes de cada cierre o restauración. Quedan las últimas ' + ctx.NUBE_MAX + '.</p>' +
        '<ul class="nube-lista" id="nLista"><li><div class="nl-txt"><span>Cargando…</span></div></li></ul><p class="err-txt" id="mErr"></p>' +
        '<div class="m-acc"><button type="button" class="btn sec" data-cerrar>Cerrar</button><button type="button" class="btn prim" id="nAhora">Guardar una copia ahora</button></div>');
    var pintar = function () {
        ctx.listarCopiasNube().then(function (l) {
            if (!ctx.$("nLista"))
                return;
            var listas = l.filter(function (c) { return c.estado === "lista"; }), ul = ctx.$("nLista");
            ul.textContent = "";
            if (!listas.length) {
                ul.innerHTML = '<li><div class="nl-txt"><span>Todavía no hay copias en la nube.</span></div></li>';
                return;
            }
            listas.forEach(function (c) {
                var li = document.createElement("li"), t = document.createElement("div"), b = document.createElement("b"), sp = document.createElement("span"), bt = document.createElement("button");
                t.className = "nl-txt";
                b.textContent = ctx.fechaHoraTxt(c.creado) + " · " + ctx.cuandoTxt(c.creado).txt;
                sp.textContent = c.motivo + " · " + c.hojas + " hojas · " + c.registros + " registros";
                t.appendChild(b);
                t.appendChild(sp);
                bt.type = "button";
                bt.className = "btn sec";
                bt.textContent = window.REPORT_PERMISSIONS.allowed("restore") ? "Restaurar" : "Descargar";
                scope.listen(bt, "click", function () {
                    bt.disabled = true;
                    bt.textContent = "Abriendo…";
                    ctx.cargarCopiaNube(c.id).then(function (copia) { if (window.REPORT_PERMISSIONS.allowed("restore")) ctx.modalRestaurar(copia); else ctx.bajarCopia(copia, ctx.nombreCopia("Copia")); }, function (e) { bt.disabled = false; bt.textContent = window.REPORT_PERMISSIONS.allowed("restore") ? "Restaurar" : "Descargar"; ctx.$("mErr").textContent = (e && e.message && !e.code ? e.message : ctx.msgError(e)); });
                });
                li.appendChild(t);
                li.appendChild(bt);
                ul.appendChild(li);
            });
        }, function (e) { if (ctx.$("mErr"))
            ctx.$("mErr").textContent = ctx.msgError(e); });
    };
    pintar();
    scope.listen(ctx.$("nAhora"), "click", function () {
        var b = ctx.$("nAhora");
        b.disabled = true;
        b.textContent = "Guardando…";
        ctx.guardarCopiaNube("Guardada a mano").then(function () { ctx.toast("Copia guardada en la nube"); if (ctx.$("nAhora")) {
            b.disabled = false;
            b.textContent = "Guardar una copia ahora";
            pintar();
        } }, function (e) { if (ctx.$("nAhora")) {
            b.disabled = false;
            b.textContent = "Guardar una copia ahora";
            ctx.$("mErr").textContent = ctx.msgError(e);
        } });
    });
};
ctx.revisarCopiaDiaria = function () {
    if (ctx.S.revisoNube || !ctx.S.db || ctx.S.soloLectura || !ctx.S.orden.length)
        return;
    ctx.S.revisoNube = true;
    ctx.conReintento(function () { return ctx.S.db.doc("ajustes/nube").get(); }).then(function (d) {
        ctx.S.nube = d.exists ? d.data() : null;
        ctx.pintarCopiaSiInicio();
        if (!ctx.S.nube || !ctx.S.nube.fecha || Date.now() - new Date(ctx.S.nube.fecha).getTime() > ctx.NUBE_CADA) {
            setTimeout(function () { ctx.guardarCopiaNube("Automática diaria").catch(function () { }); }, 2500);
        }
    }).catch(function () { });
};
ctx.infoPermiso = function () {
    ctx.abrirModal('<h2 id="mTitulo">No se pudo guardar</h2><p class="m-sub">Tu acceso a la planilla permite verla, pero no guardar cambios.</p>' +
        '<p class="hint">Para cargar datos y enviar reportes, la dueña tiene que invitarte por mail con permiso de Editor desde el menú Compartir (y la planilla no tiene que estar compartida por link público). Después volvé a abrir la planilla.</p>' +
        '<div class="m-acc"><button type="button" class="btn prim" data-cerrar>Entendido</button></div>');
};
ctx.infoNotas = function () {
    ctx.abrirModal('<h2 id="mTitulo">Dejar una nota</h2><p class="m-sub">Desde acá no se pudo abrir el cuadro de notas.</p>' +
        '<p class="hint">Para dejar notas, la dueña tiene que compartirte la planilla con permiso para comentar (Comentarista). Si ya lo tenés, también podés usar el modo comentarios de Claude y tocar sobre la parte de la planilla que querés que se cambie.</p>' +
        '<div class="m-acc"><button type="button" class="btn prim" data-cerrar>Entendido</button></div>');
};
ctx.dejarNota = function (el) {
    if (!ctx.S.comments || !el) {
        ctx.infoNotas();
        return;
    }
    ctx.S.comments.openComposer({ element: el }).then(function (r) {
        if (!r || !r.opened)
            ctx.toast("Si no se abrió el cuadro de la nota, tocá el botón de nuevo.");
    }, function (e) {
        var c = e && e.code;
        if (c === "rate_limited")
            ctx.toast("Esperá unos segundos y probá de nuevo.", "err");
        else
            ctx.infoNotas();
    });
};
return () => {
ctx.NUBE_MAX = 12;
ctx.NUBE_CADA = 20 * 3600 * 1000;
ctx.NUBE_PARTE = 60;
};
}
