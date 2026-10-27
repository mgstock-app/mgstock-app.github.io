// Preserved behavior from test-app; mounted and disposed by the React hooks.
export function registerBootstrap(scope, ctx) {
const { document, window } = scope;
ctx.sinDatos = function (txt) { ctx.S.cargado = true; ctx.S.soloLectura = true; ctx.$("txtSinAcceso").textContent = txt; ctx.pintarTodo(); };
ctx.iniciar = function () {
    if (!window.reportServices || !window.reportServices.use) {
        ctx.sinDatos("Iniciá sesión desde la página de acceso.");
        return;
    }
    window.reportServices.use("downloads").then(function (d) { ctx.S.downloads = d; }, function () { });
    Promise.all([window.reportServices.use("db"), window.reportServices.use("user").catch(function () { return null; })]).then(function (r) {
        if (!scope.active) return;
        var db = r[0], user = r[1];
        if (!db) {
            ctx.sinDatos("Iniciá sesión desde la página de acceso.");
            return;
        }
        ctx.S.db = db;
        var puede = function () { try {
            return user && user.can ? user.can("data.write").catch(function () { return null; }) : Promise.resolve(null);
        }
        catch (e) {
            return Promise.resolve(null);
        } };
        (user ? Promise.all([user.isOwner(), user.canEdit(), puede()]) : Promise.resolve([null, null, null])).then(function (p) {
            /* La dueña hace todo. Quien la plataforma deja escribir (invitado como Editor) carga datos y envía reportes;
               eliminar hojas, borrar registros del historial y restaurar copias quedan para la dueña. Sin permiso de escritura: modo lectura. */
            ctx.S.esDuena = p[0] === true;
            if (p[0] !== true && p[1] !== true && p[2] !== true)
                ctx.S.soloLectura = true; /* si la plataforma no informa (null), se intenta y decide el guardado */
            if (!ctx.S.esDuena)
                window.reportServices.use("comments").then(function (c) { ctx.S.comments = c || null; }, function () { ctx.S.comments = null; });
            db.doc("ajustes/tema").onSnapshot(function (d) {
                if (!d.exists)
                    return;
                var t = d.data();
                if (t && ctx.TONOS[t.tono]) {
                    ctx.S.temaPlanilla = { tono: t.tono, modo: ctx.MODOS[t.modo] ? t.modo : "auto" };
                    var propio = null;
                    if (!ctx.S.esDuena) {
                        try {
                            propio = JSON.parse(ctx.leerLS("rsdt-tema-propio") || "null");
                        }
                        catch (e) { }
                    }
                    if (propio && ctx.TONOS[propio.tono])
                        ctx.S.tema = { tono: propio.tono, modo: ctx.MODOS[propio.modo] ? propio.modo : "auto" };
                    else {
                        ctx.S.tema = { tono: ctx.S.temaPlanilla.tono, modo: ctx.S.temaPlanilla.modo };
                        if (ctx.S.esDuena)
                            ctx.escribirLS("rsdt-tema", JSON.stringify(ctx.S.tema));
                    }
                    ctx.aplicarTema();
                }
            }, function () { });
            db.doc("ajustes/copia").onSnapshot(function (d) {
                ctx.S.copia = d.exists ? d.data() : null;
                if (ctx.S.cargado && ctx.S.pantalla === "inicio")
                    ctx.pintarCopia();
            }, function () { });
            db.collection("hojas").orderBy("orden").onSnapshot(function (snap) {
                if (snap.metadata.fromCache && snap.empty && !ctx.S.cargado)
                    return;
                ctx.S.orden = snap.docs.map(function (d) { return d.id; });
                var nuevo = {};
                snap.docs.forEach(function (d) { nuevo[d.id] = ctx.clon(d.data()); });
                ctx.S.srv = nuevo;
                if (ctx.S.editando && !ctx.S.srv[ctx.S.activo]) {
                    ctx.salirEdicion(true);
                    ctx.toast("Esta hoja se eliminó desde otro dispositivo.", "err");
                }
                var antes = ctx.S.activo;
                ctx.asegurarSeleccion();
                ctx.S.cargado = true;
                ctx.revisarCopiaDiaria();
                if (antes !== ctx.S.activo)
                    ctx.suscribirHistorial();
                if (ctx.$("overlay").hidden || !ctx.S.editando)
                    ctx.pintarTodo();
                ctx.estado(ctx.S.soloLectura ? "Solo lectura" : "");
            }, function () { ctx.S.cargado = true; ctx.estado("Se perdió la conexión con los datos. Recargá la página.", true); ctx.pintarTodo(); });
        });
    }).catch(function () { ctx.sinDatos("No se pudo conectar con los datos de la planilla."); });
};
return () => {
scope.listen(ctx.$("bNota"), "click", function () {
    var el = ctx.S.pantalla === "inicio" ? ctx.$("vInicio") : (ctx.S.carpeta !== "resumen" && ctx.S.activo ? ctx.$("papel") : ctx.$("vLocal"));
    ctx.dejarNota(el);
});
scope.listen(ctx.$("bNotaHoja"), "click", function () { ctx.dejarNota(ctx.$("papel")); });
/* Botón "Guardar en la nube": guarda la hoja abierta (si se está modificando) y una copia completa de la planilla */
scope.listen(ctx.$("bGuardarNube"), "click", function () {
    var b = ctx.$("bGuardarNube");
    if (b.disabled || !ctx.S.db || ctx.S.soloLectura)
        return;
    ctx.conGuardado(function () {
        b.disabled = true;
        ctx.$("bGNLargo").textContent = "Guardando…";
        ctx.$("bGNCorto").textContent = "Guardando…";
        ctx.guardarCopiaNube("Guardada a mano").then(function () {
            ctx.toast("Todo guardado en la nube con éxito");
        }, function (e) {
            ctx.toast("No se pudo guardar en la nube. " + ctx.msgError(e), "err");
        }).then(function () { b.disabled = false; ctx.$("bGNLargo").textContent = "Guardar en la nube"; ctx.$("bGNCorto").textContent = "Guardar"; });
    });
});
scope.listen(ctx.$("bNube"), "click", function () { if (!ctx.S.esDuena || !ctx.S.db || (window.REPORT_PERMISSIONS && !window.REPORT_PERMISSIONS.allowed('backups')))
    return; ctx.salirSiHaceFalta(ctx.modalNube); });
scope.listen(ctx.$("bCopia"), "click", function () { ctx.salirSiHaceFalta(ctx.hacerCopia); });
scope.listen(ctx.$("bRestaurar"), "click", function () {
    if (!ctx.S.esDuena || !ctx.S.db || (window.REPORT_PERMISSIONS && !window.REPORT_PERMISSIONS.allowed('restore')))
        return;
    ctx.salirSiHaceFalta(function () { ctx.$("fRestaurar").value = ""; ctx.$("fRestaurar").click(); });
});
scope.listen(ctx.$("fRestaurar"), "change", function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f)
        return;
    if (f.size > 60 * 1024 * 1024) {
        ctx.toast("El archivo es demasiado grande para ser una copia de esta planilla.", "err");
        return;
    }
    var r = new FileReader();
    r.onload = function () { var res = ctx.leerCopia(String(r.result || "")); if (res.err)
        ctx.toast(res.err, "err");
    else
        ctx.modalRestaurar(res.copia); };
    r.onerror = function () { ctx.toast("No se pudo leer el archivo.", "err"); };
    r.readAsText(f);
});
/* ---------- Arranque ---------- */
ctx.construirTabla();
ctx.pintarTodo();
scope.listen(window, "beforeunload", function (e) { if (ctx.hayCambios()) {
    e.preventDefault();
    e.returnValue = "";
} });
ctx.iniciar();
document.getElementById('bRestaurar').disabled = window.REPORT_IS_DEMO === true;
ctx.downloadCurrent = document.createElement('button');
ctx.downloadCurrent.id = 'report-download';
ctx.downloadCurrent.className = 'btn sec';
ctx.downloadCurrent.textContent = 'Descargar reporte actual';
document.getElementById('bExportar').parentNode.appendChild(ctx.downloadCurrent);
var publish = document.createElement('button');
publish.className = 'btn prim'; publish.textContent = 'Publicar imagen para el colaborador';
document.getElementById('bExportar').parentNode.appendChild(publish);
scope.listen(publish, 'click', function () { if (!ctx.S.activo || ctx.S.guardando) return; ctx.conGuardado(function () { publish.disabled = true; window.reportServices.publish(ctx.S.activo).then(function () { ctx.toast('Imagen publicada para el colaborador.'); }).catch(function (error) { ctx.toast(error.message, 'err'); }).finally(function () { publish.disabled = false; }); }); });
scope.listen(ctx.downloadCurrent, 'click', function () { var h = ctx.vista(); if (!h)
    return; try {
    ctx.S.downloads.save({ filename: 'Reporte ' + ctx.tituloHoja(h) + '.pdf', data: ctx.crearPdf(h, ctx.tituloHoja(h)) }).catch(function () { ctx.toast('La descarga no está habilitada.', 'err'); });
}
catch (e) {
    ctx.toast('No se pudo preparar el PDF.', 'err');
} });
};
}
