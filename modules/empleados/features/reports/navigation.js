// Preserved behavior from test-app; mounted and disposed by the React hooks.
export function registerNavigation(scope, ctx) {
const { document, window, setTimeout, clearTimeout, MutationObserver } = scope;
ctx.leerLS = function (k) { try {
    return localStorage.getItem(k);
}
catch (e) {
    return null;
} };
ctx.escribirLS = function (k, v) { try {
    localStorage.setItem(k, v);
}
catch (e) { } };
ctx.hojasLocal = function (l) { return ctx.S.orden.filter(function (id) { var h = ctx.S.srv[id]; return h && ctx.localDe(h) === l; }); };
ctx.hojasDe = function (l, c) { return ctx.hojasLocal(l).filter(function (id) { return ctx.puestoDe(ctx.S.srv[id]) === c; }); };
ctx.hojasOrdenadas = function (l) { return ctx.hojasDe(l, "encargado").concat(ctx.hojasDe(l, "staff")); };
ctx.pendientesTransfer = function (l) { return ctx.hojasOrdenadas(l).filter(function (id) { var h = ctx.S.srv[id]; return ctx.estadoHoja(h) === "cargada"; }); };
ctx.vista = function () { return ctx.S.editando ? ctx.S.borrador : (ctx.S.activo ? ctx.S.srv[ctx.S.activo] : null); };
ctx.hayCambios = function () {
    if (!ctx.S.editando)
        return false;
    var a = ctx.camposDe(ctx.S.borrador), b = ctx.camposDe(ctx.S.srv[ctx.S.activo]);
    a.fecha = b.fecha = ""; /* la fecha es automática: no cuenta como cambio */
    return JSON.stringify(a) !== JSON.stringify(b);
};
ctx.modoOscuro = function () {
    if (ctx.S.tema.modo === "oscuro")
        return true;
    if (ctx.S.tema.modo === "claro")
        return false;
    var t = document.documentElement.getAttribute("data-theme");
    if (t === "dark")
        return true;
    if (t === "light")
        return false;
    try {
        return matchMedia("(prefers-color-scheme: dark)").matches;
    }
    catch (e) {
        return false;
    }
};
ctx.aplicarTema = function () {
    var b = document.body, t = ctx.TONOS[ctx.S.tema.tono] || ctx.TONOS.marino, v = t[ctx.modoOscuro() ? "oscuro" : "claro"];
    if (ctx.S.tema.modo === "claro" || ctx.S.tema.modo === "oscuro")
        b.setAttribute("data-modo", ctx.S.tema.modo);
    else
        b.removeAttribute("data-modo");
    ["band", "accent", "tint", "total", "focus"].forEach(function (k) { b.style.setProperty("--" + k, v[k]); });
};
ctx.guardarTema = function () {
    /* Quien no es la dueña elige el tono solo de su pantalla (en su dispositivo); el tono de la planilla y de los reportes es el de la dueña */
    if (!ctx.S.esDuena) {
        ctx.escribirLS("rsdt-tema-propio", JSON.stringify(ctx.S.tema));
        ctx.toast("Tono aplicado en tu pantalla");
        return;
    }
    ctx.escribirLS("rsdt-tema", JSON.stringify(ctx.S.tema));
    if (!ctx.S.db || ctx.S.soloLectura) {
        ctx.toast("Tono aplicado");
        return;
    }
    ctx.S.db.doc("ajustes/tema").set({ tono: ctx.S.tema.tono, modo: ctx.S.tema.modo }).then(function () { ctx.toast("Tono guardado con éxito"); }, function () { ctx.toast("Tono aplicado en este dispositivo. No se pudo guardar.", "err"); });
};
ctx.toast = function (txt, tipo) {
    var t = ctx.$("toast");
    t.className = "toast" + (tipo === "err" ? " err" : "");
    t.querySelector(".ico").textContent = tipo === "err" ? "!" : "✓";
    ctx.$("toastTxt").textContent = txt;
    t.hidden = false;
    clearTimeout(ctx.toastT);
    ctx.toastT = setTimeout(function () { t.hidden = true; }, 3600);
};
ctx.estado = function (txt, esError) { var e = ctx.$("estado"); e.textContent = txt || ""; e.classList.toggle("err", !!esError); };
ctx.msgError = function (e) {
    var c = e && e.code;
    if (c === "invalid_argument")
        return "No tenés permiso para modificar esta planilla.";
    if (c === "quota_exceeded")
        return "La planilla llegó a su límite de espacio. Borrá registros viejos del historial.";
    return "No se pudo guardar. Revisá la conexión y probá de nuevo.";
};
ctx.guardarPref = function () { ctx.escribirLS("rsdt-nav3", JSON.stringify({ ultimo: ctx.S.ultimo })); };
ctx.elegir = function (l, c) { var ids = ctx.hojasDe(l, c), u = ctx.S.ultimo[l + ":" + c]; return (u && ids.indexOf(u) !== -1) ? u : (ids[0] || null); };
ctx.asegurarSeleccion = function () {
    if (ctx.S.pantalla !== "local" || ctx.S.carpeta === "resumen")
        return;
    if (ctx.S.activo && ctx.S.srv[ctx.S.activo]) {
        var h = ctx.S.srv[ctx.S.activo];
        ctx.S.local = ctx.localDe(h);
        ctx.S.carpeta = ctx.puestoDe(h);
        return;
    }
    ctx.S.activo = ctx.elegir(ctx.S.local, ctx.S.carpeta);
};
ctx.salirSiHaceFalta = function (cb) {
    if (!ctx.S.editando) {
        cb();
        return;
    }
    if (!ctx.hayCambios()) {
        ctx.salirEdicion(true);
        cb();
        return;
    }
    var h = ctx.S.srv[ctx.S.activo] || {};
    ctx.abrirModal('<h2 id="mTitulo">Tenés cambios sin guardar</h2><p class="m-sub" id="mTxt"></p>' +
        '<div class="m-acc"><button type="button" class="btn sec" id="mDescartar">Descartar cambios</button><button type="button" class="btn prim" id="mGuardar">Guardar y seguir</button></div>');
    ctx.$("mTxt").textContent = "En la hoja “" + ctx.tituloHoja(h) + "”.";
    scope.listen(ctx.$("mDescartar"), "click", function () { ctx.cerrarModal(); ctx.salirEdicion(true); cb(); });
    scope.listen(ctx.$("mGuardar"), "click", function () { ctx.cerrarModal(); ctx.guardar().then(function (ok) { if (ok)
        cb(); }); });
};
ctx.irInicio = function () { ctx.salirSiHaceFalta(function () { ctx.S.pantalla = "inicio"; ctx.S.activo = null; ctx.suscribirHistorial(); ctx.pintarTodo(); window.scrollTo(0, 0); }); };
ctx.abrirLocal = function (l) { ctx.salirSiHaceFalta(function () { ctx.S.pantalla = "local"; ctx.S.local = l; ctx.S.carpeta = "resumen"; ctx.S.activo = null; ctx.suscribirHistorial(); ctx.pintarTodo(); window.scrollTo(0, 0); }); };
ctx.irACarpeta = function (c) {
    if (c === ctx.S.carpeta)
        return;
    ctx.salirSiHaceFalta(function () { ctx.S.carpeta = c; ctx.S.activo = c === "resumen" ? null : ctx.elegir(ctx.S.local, c); ctx.suscribirHistorial(); ctx.pintarTodo(); });
};
ctx.irA = function (id) {
    ctx.salirSiHaceFalta(function () {
        var h = ctx.S.srv[id];
        if (!h)
            return;
        ctx.S.carpeta = ctx.puestoDe(h);
        ctx.S.activo = id;
        ctx.S.ultimo[ctx.S.local + ":" + ctx.S.carpeta] = id;
        ctx.guardarPref();
        ctx.suscribirHistorial();
        ctx.pintarTodo();
    });
};
ctx.metricasLocal = function (l) {
    var ids = ctx.hojasLocal(l), total = 0, env = 0, pend = 0;
    ids.forEach(function (id) { var h = ctx.S.srv[id], e = ctx.estadoHoja(h); total += ctx.totalDe(h); if (e === "enviada")
        env++; if (e === "cargada")
        pend++; });
    return { n: ids.length, total: ctx.r2(total), enviadas: env, pendientes: pend };
};
ctx.cuentaEstados = function (l) {
    var r = { activo: 0, refuerzo: 0, inactivo: 0 };
    ctx.hojasLocal(l).forEach(function (id) { r[ctx.estadoColab(ctx.S.srv[id])]++; });
    return r;
};
ctx.pintarInicio = function () {
    var cont = ctx.$("locales");
    cont.textContent = "";
    var ownerRoot = document.body.closest('[data-owner-locals]');
    var ownerLocals = ownerRoot ? ownerRoot.getAttribute('data-owner-locals').split(',') : null;
    Object.keys(ctx.LOCALES).forEach(function (l) {
        if (ownerLocals && !ownerLocals.includes(l)) return;
        var m = ctx.metricasLocal(l), e = ctx.cuentaEstados(l), b = document.createElement("button");
        b.type = "button";
        b.className = "local-card";
        b.innerHTML = '<div class="lc-top"><div><div class="eyebrow">Local</div><div class="lc-nombre"></div><div class="lc-cuenta"></div></div><span class="badge"></span></div>' +
            '<dl class="lc-stats"><div><dt><i class="dot activo"></i>Activos</dt><dd class="ea"></dd></div><div><dt><i class="dot inactivo"></i>Inactivos</dt><dd class="ei"></dd></div><div><dt><i class="dot refuerzo"></i>Refuerzos</dt><dd class="er"></dd></div>' +
            '<div class="lc-env"><dt>Enviados</dt><dd class="cv"></dd></div></dl>' +
            '<div class="lc-pie" style="justify-content:flex-end"><span class="lc-abrir">Abrir local →</span></div>';
        b.querySelector(".lc-nombre").textContent = ctx.LOCALES[l].txt;
        var ne = ctx.hojasDe(l, "encargado").length, ns = ctx.hojasDe(l, "staff").length;
        b.querySelector(".lc-cuenta").textContent = ne + (ne === 1 ? " encargado" : " encargados") + " · " + ns + " staff";
        b.querySelector(".badge").textContent = ctx.CICLOS[ctx.LOCALES[l].ciclo];
        b.querySelector(".ea").textContent = e.activo;
        b.querySelector(".ei").textContent = e.inactivo;
        b.querySelector(".er").textContent = e.refuerzo;
        b.querySelector(".cv").textContent = m.enviadas + " de " + m.n;
        b.setAttribute("aria-label", "Abrir " + ctx.LOCALES[l].txt + ": " + e.activo + " activos, " + e.inactivo + " inactivos, " + e.refuerzo + " refuerzos, " + m.enviadas + " de " + m.n + " enviados");
        scope.listen(b, "click", function () { ctx.abrirLocal(l); });
        cont.appendChild(b);
    });
    ctx.pintarCopia();
    if (ownerRoot) document.body.dispatchEvent(new CustomEvent('owner-overview', { bubbles: true, detail: Object.keys(ctx.LOCALES).map(function(l) {
        var metrics = ctx.metricasLocal(l);
        return { id: l, total: metrics.n, sent: metrics.enviadas, activity: ctx.hojasLocal(l).map(function(id) { var h=ctx.S.srv[id]; return {title:'Reporte enviado',date:h.ultimaExport,local:ctx.LOCALES[l].txt}; }).filter(function(a){return !!a.date;}) };
    }) }));
};
ctx.pintarLocal = function () {
    var l = ctx.S.local, m = ctx.metricasLocal(l);
    window.dispatchEvent(new CustomEvent("report-local-changed", { detail: l }));
    ctx.$("migaLocal").textContent = ctx.LOCALES[l].txt;
    ctx.$("localNombre").textContent = ctx.LOCALES[l].txt;
    ctx.$("localCiclo").textContent = ctx.CICLOS[ctx.LOCALES[l].ciclo];
    ctx.$("mEnviados").textContent = m.enviadas + " de " + m.n;
    ctx.$("mPendientes").textContent = m.pendientes;
    ctx.$("nEnc").textContent = ctx.hojasDe(l, "encargado").length;
    ctx.$("nStaff").textContent = ctx.hojasDe(l, "staff").length;
    ctx.$("cRes").setAttribute("aria-selected", ctx.S.carpeta === "resumen" ? "true" : "false");
    ctx.$("cEnc").setAttribute("aria-selected", ctx.S.carpeta === "encargado" ? "true" : "false");
    ctx.$("cStaff").setAttribute("aria-selected", ctx.S.carpeta === "staff" ? "true" : "false");
    ctx.$("bCerrar").textContent = ctx.CIERRE[ctx.LOCALES[l].ciclo];
    var pendTr = ctx.pendientesTransfer(l).length;
    ctx.$("bPendientes").textContent = "Enviar pendientes (" + pendTr + ")";
    ctx.$("bPendientes").disabled = !pendTr || ctx.S.soloLectura;
    ctx.$("bCerrar").disabled = ctx.S.soloLectura;
    ctx.$("bPendientes").hidden = ctx.$("bCerrar").hidden = ctx.S.soloLectura;
};
ctx.pintarResumen = function () {
    var tb = ctx.$("resCuerpo");
    tb.textContent = "";
    ["encargado", "staff"].forEach(function (c) {
        var ids = ctx.hojasDe(ctx.S.local, c);
        if (!ids.length)
            return;
        var g = document.createElement("tr");
        g.className = "grupo";
        var gt = document.createElement("td");
        gt.colSpan = 8;
        gt.textContent = ctx.CARPETAS[c];
        g.appendChild(gt);
        tb.appendChild(g);
        ids.forEach(function (id) {
            var h = ctx.S.srv[id], e = ctx.estadoHoja(h), t = ctx.totalDe(h);
            var tr = document.createElement("tr");
            tr.tabIndex = 0;
            var q = document.createElement("td");
            q.className = "quien";
            var b = document.createElement("b");
            b.textContent = ctx.tituloHoja(h);
            q.appendChild(b);
            var ec = ctx.estadoColab(h);
            if (ec !== "activo") {
                var ti = document.createElement("span");
                ti.className = "tag-inact" + (ec === "refuerzo" ? " ref" : "");
                ti.innerHTML = '<i class="dot ' + ec + '"></i>' + ctx.ESTADOS_COLAB[ec];
                b.appendChild(ti);
            }
            if (!ctx.nombreColab(h)) {
                var s = document.createElement("span");
                s.textContent = "Sin colaborador cargado";
                q.appendChild(s);
            }
            tr.appendChild(q);
            var w = document.createElement("td");
            w.className = "num";
            w.style.whiteSpace = "nowrap";
            var tiene = h.contacto && h.contacto.tel;
            w.textContent = tiene ? ctx.telTxt(h.contacto.tel) : "Sin cargar";
            if (!tiene)
                w.style.color = "var(--muted)";
            tr.appendChild(w);
            var al = document.createElement("td"), alias = String(h.alias || "").trim();
            if (ctx.esEfectivo(h)) {
                al.textContent = "Efectivo";
            }
            else if (alias) {
                var aw = document.createElement("div");
                aw.className = "alias";
                var as = document.createElement("span");
                as.textContent = alias;
                aw.appendChild(as);
                var ab = document.createElement("button");
                ab.type = "button";
                ab.textContent = "Copiar";
                ab.setAttribute("aria-label", "Copiar alias " + alias);
                scope.listen(ab, "click", function (ev) { ev.stopPropagation(); ctx.copiarAlias(alias); });
                scope.listen(ab, "keydown", function (ev) { ev.stopPropagation(); });
                aw.appendChild(ab);
                al.appendChild(aw);
            }
            else {
                al.textContent = "Transferencia · sin alias";
                al.style.color = "var(--muted)";
            }
            tr.appendChild(al);
            var p = document.createElement("td");
            p.textContent = ctx.puestoTxt(h) + (ctx.puestoDe(h) === "encargado" ? " · " + ctx.modalidadTxt(h).toLowerCase() : "");
            tr.appendChild(p);
            var pe = document.createElement("td");
            pe.textContent = ctx.periodoTxt(h) || "—";
            tr.appendChild(pe);
            var tt = document.createElement("td");
            tt.className = "r";
            tt.textContent = ctx.pesos(t);
            tr.appendChild(tt);
            var es = document.createElement("td");
            var ch = document.createElement("span");
            ch.className = "chip " + e;
            ch.textContent = ctx.estadoTxt(h, e);
            es.appendChild(ch);
            tr.appendChild(es);
            var ul = document.createElement("td");
            ul.textContent = h.ultimaExport ? ctx.fechaHoraTxt(h.ultimaExport) : "—";
            tr.appendChild(ul);
            scope.listen(tr, "click", function () { ctx.irA(id); });
            scope.listen(tr, "keydown", function (ev) { if (ev.key === "Enter")
                ctx.irA(id); });
            tb.appendChild(tr);
        });
    });
};
ctx.pintarPersonas = function () {
    var nav = ctx.$("personas");
    nav.textContent = "";
    ctx.hojasDe(ctx.S.local, ctx.S.carpeta).forEach(function (id) {
        var h = ctx.S.srv[id], b = document.createElement("button");
        b.type = "button";
        b.className = "persona";
        b.setAttribute("role", "tab");
        b.setAttribute("aria-selected", id === ctx.S.activo ? "true" : "false");
        var d = document.createElement("i");
        d.className = "dot " + ctx.estadoColab(h);
        b.appendChild(d);
        var n = document.createElement("span");
        n.className = "n";
        n.textContent = ctx.tituloHoja(h);
        b.appendChild(n);
        b.title = ctx.tituloHoja(h) + " · " + ctx.ESTADOS_COLAB[ctx.estadoColab(h)] + " · " + ctx.estadoTxt(h, ctx.estadoHoja(h));
        scope.listen(b, "click", function () { if (id !== ctx.S.activo)
            ctx.irA(id); });
        nav.appendChild(b);
    });
    if (!ctx.S.soloLectura && ctx.S.db) {
        var nb = document.createElement("button");
        nb.type = "button";
        nb.className = "persona nueva";
        nb.textContent = "+ Nueva hoja";
        scope.listen(nb, "click", function () { ctx.salirSiHaceFalta(function () { ctx.modalNombreHoja(null); }); });
        nav.appendChild(nb);
    }
};
return () => {
ctx.S = { db: null, downloads: null, orden: [], srv: {}, pantalla: "inicio", local: "dt", carpeta: "resumen", activo: null, ultimo: {},
    editando: false, borrador: null, hist: [], unsubHist: null, cargado: false, soloLectura: false, esDuena: true, tema: { tono: "marino", modo: "auto" }, guardando: false };
ctx.errores = {};
try {
    scope.listen(matchMedia("(prefers-color-scheme: dark)"), "change", ctx.aplicarTema);
}
catch (e) { }
try {
    new MutationObserver(ctx.aplicarTema).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
}
catch (e) { }
(function () { var c = ctx.leerLS("rsdt-tema"); if (c) {
    try {
        var o = JSON.parse(c);
        if (o && ctx.TONOS[o.tono])
            ctx.S.tema = { tono: o.tono, modo: ctx.MODOS[o.modo] ? o.modo : "auto" };
    }
    catch (e) { }
} ctx.aplicarTema(); })();
ctx.toastT = null;
(function () { try {
    var p = JSON.parse(ctx.leerLS("rsdt-nav3") || "null");
    if (p && p.ultimo)
        ctx.S.ultimo = p.ultimo;
}
catch (e) { } })();
scope.listen(ctx.$("bInicio"), "click", ctx.irInicio);
scope.listen(ctx.$("cRes"), "click", function () { ctx.irACarpeta("resumen"); });
scope.listen(ctx.$("cEnc"), "click", function () { ctx.irACarpeta("encargado"); });
scope.listen(ctx.$("cStaff"), "click", function () { ctx.irACarpeta("staff"); });
};
}
