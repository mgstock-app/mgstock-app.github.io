// Preserved behavior from test-app; mounted and disposed by the React hooks.
export function registerSharingAndBackups(scope, ctx) {
const { document, window, setTimeout } = scope;
ctx.exportarDatos = function () {
    var h = ctx.S.srv[ctx.S.activo];
    if (!h)
        return;
    var c = h.contacto || {};
    ctx.abrirModal('<h2 id="mTitulo">Exportar a WhatsApp</h2><p class="m-sub" id="mSub"></p>' +
        '<label class="t" for="eNombre">Nombre del colaborador</label><input type="text" id="eNombre" autocomplete="off">' +
        '<label class="t" for="eTel">Teléfono de WhatsApp</label><input type="tel" id="eTel" inputmode="tel" autocomplete="off" placeholder="11 1234 5678">' +
        '<p class="hint" id="eTelHint"></p>' +
        '<label class="t" for="eMsg">Saludo</label><textarea id="eMsg" rows="2"></textarea>' +
        '<p class="hint">El reporte va como imagen. Este saludo acompaña el envío; si lo borrás, se abre el chat sin texto.</p>' +
        '<p class="err-txt" id="eErr"></p>' +
        '<div class="m-acc"><button type="button" class="btn sec" data-cerrar>Cancelar</button><button type="button" class="btn prim" id="eSig">Generar imagen</button></div>');
    ctx.$("mSub").textContent = ctx.LOCALES[ctx.localDe(h)].txt + " · " + ctx.tituloHoja(h) + " · Total " + ctx.pesos(ctx.totalDe(h));
    ctx.$("eTelHint").textContent = c.tel ? "Número guardado de este colaborador. Si lo cambiás, se actualiza en la hoja." : "Con código de área, sin 0 ni 15. Queda guardado en la hoja para los próximos envíos.";
    ctx.$("eNombre").value = c.nombre || h.nombre || "";
    ctx.$("eTel").value = c.tel ? ctx.telTxt(c.tel) : "";
    ctx.$("eMsg").value = ctx.saludo(ctx.$("eNombre").value, h);
    var tocado = false;
    scope.listen(ctx.$("eMsg"), "input", function () { tocado = true; });
    scope.listen(ctx.$("eNombre"), "input", function () { if (!tocado)
        ctx.$("eMsg").value = ctx.saludo(ctx.$("eNombre").value, h); });
    if (ctx.$("eNombre").value && !ctx.$("eTel").value)
        setTimeout(function () { ctx.$("eTel").focus(); }, 40);
    scope.listen(ctx.$("eSig"), "click", function () {
        var nombre = ctx.$("eNombre").value.trim(), tel = ctx.normalizarTel(ctx.$("eTel").value);
        if (!nombre) {
            ctx.$("eErr").textContent = "Completá el nombre del colaborador.";
            ctx.$("eNombre").focus();
            return;
        }
        if (!tel) {
            ctx.$("eErr").textContent = "El teléfono no parece válido. Escribilo con código de área, sin 0 ni 15 (ej: 11 1234 5678).";
            ctx.$("eTel").focus();
            return;
        }
        var id = ctx.S.activo, msg = ctx.$("eMsg").value.trim();
        ctx.confirmarReporte(h, "whatsapp", function () {
            ctx.modalCerrable = true;
            ctx.abrirModal('<h2 id="mTitulo">Generando la imagen…</h2><p class="m-sub">Un momento.</p>');
            ctx.modalCerrable = false;
            var env = ctx.prepararEnvio(h, nombre, tel, msg);
            env.onShared = function () { return ctx.registrarEnvio(id, nombre, tel); };
            return ctx.crearImagen(h, nombre).then(function (image) {
                ctx.modalCerrable = true;
                env.img = image;
                ctx.mostrarListo(h, nombre, tel, env, false);
                ctx.pintarTodo();
            }).catch(function () {
                ctx.modalCerrable = true;
                ctx.abrirModal('<h2 id="mTitulo">No se pudo generar la imagen</h2><p>No se registró ningún envío. Volvé a intentarlo.</p><button data-cerrar>Cerrar</button>');
            });
        });
    });
};
ctx.mostrarListo = function (h, nombre, tel, env, okHist) {
    ctx.abrirModal('<h2 id="mTitulo">Reporte listo para enviar</h2><p class="m-sub" id="lPara"></p>' +
        (env.img ? '<div class="vista-img"><img id="lVista" alt="Vista previa del reporte"></div>' : '') +
        '<div class="copiar"><span id="lTel"></span><button type="button" class="link" id="lCopiar">Copiar número</button></div>' +
        '<div class="acc-envio" id="lAcc"></div>' +
        '<p class="hint" id="lHist"></p>' +
        '<div class="m-acc"><button type="button" class="btn sec" data-cerrar>Listo</button></div>');
    ctx.$("lPara").textContent = "Para " + nombre + " · el número queda guardado en la hoja";
    ctx.$("lTel").textContent = ctx.telTxt(tel);
    ctx.$("lHist").textContent = okHist ? "El reporte quedó guardado en el historial de la hoja." : "Al compartir se registra Enviado y se guarda una copia en tu historial privado.";
    if (env.img) {
        try {
            ctx.$("lVista").src = URL.createObjectURL(env.img);
        }
        catch (e) { }
    }
    scope.listen(ctx.$("lCopiar"), "click", function () {
        var sel = function () { var r = document.createRange(); r.selectNodeContents(ctx.$("lTel")); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); };
        try {
            navigator.clipboard.writeText(ctx.telTxt(tel)).then(function () { ctx.$("lCopiar").textContent = "Copiado"; }, sel);
        }
        catch (e) {
            sel();
        }
    });
    ctx.accionesEnvio(ctx.$("lAcc"), env, nombre, h);
};
ctx.esperar = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
ctx.conReintento = function (fn, n) {
    n = n || 0;
    return fn().catch(function (e) {
        var c = e && e.code;
        if (n < 5 && (c === "resource_exhausted" || c === "unavailable"))
            return ctx.esperar(700 * (n + 1) + Math.random() * 400).then(function () { return ctx.conReintento(fn, n + 1); });
        throw e;
    });
};
ctx.cuandoTxt = function (iso) { var dias = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5); return { dias: dias, txt: dias <= 0 ? "hoy" : (dias === 1 ? "ayer" : "hace " + dias + " días") }; };
ctx.pintarCopia = function () {
    var c = ctx.S.copia, el = ctx.$("copiaUlt"), n = ctx.S.nube, en = ctx.$("nubeUlt");
    ctx.$("bRestaurar").hidden = ctx.$("bNube").hidden = ctx.S.soloLectura || !ctx.S.esDuena;
    ctx.$("cardCopia").hidden = ctx.S.soloLectura || !ctx.S.esDuena;
    if (ctx.S.nubeOcupada) {
        en.textContent = "Guardando copia en la nube…";
        en.classList.remove("vieja");
    }
    else if (!n || !n.fecha) {
        en.textContent = "Todavía no hay copias en la nube";
        en.classList.add("vieja");
    }
    else {
        var q = ctx.cuandoTxt(n.fecha);
        en.textContent = "Última copia en la nube: " + ctx.fechaHoraTxt(n.fecha) + " (" + q.txt + ")";
        en.classList.toggle("vieja", q.dias >= 2);
    }
    el.classList.toggle("neutro", !(c && c.fecha));
    if (!c || !c.fecha) {
        el.textContent = "Todavía no descargaste ningún archivo (opcional)";
        el.classList.remove("vieja");
        return;
    }
    var w = ctx.cuandoTxt(c.fecha);
    el.textContent = "Último archivo descargado: " + ctx.fechaHoraTxt(c.fecha) + " (" + w.txt + ")" + (w.dias >= 30 ? " · conviene descargar uno nuevo" : "");
    el.classList.toggle("vieja", w.dias >= 30);
};
ctx.armarCopia = function (avance) {
    var db = ctx.S.db, copia = { tipo: ctx.COPIA_TIPO, version: 1, app: "Gestion Interna", creado: new Date().toISOString(), ajustes: {}, hojas: [] };
    return ctx.conReintento(function () { return db.doc("ajustes/tema").get(); }).then(function (t) { if (t.exists)
        copia.ajustes.tema = t.data(); })
        .then(function () { return ctx.conReintento(function () { return db.collection("hojas").get(); }); })
        .then(function (snap) {
        var docs = snap.docs, i = 0;
        return docs.reduce(function (p, d) {
            return p.then(function () {
                return ctx.conReintento(function () { return db.collection("hojas/" + d.id + "/historial").get(); }).then(function (hs) {
                    copia.hojas.push({ id: d.id, datos: d.data(), historial: hs.docs.map(function (x) { return { id: x.id, datos: x.data() }; }) });
                    i++;
                    if (avance)
                        avance(i, docs.length);
                });
            });
        }, Promise.resolve());
    }).then(function () { return copia; });
};
ctx.cuentaCopia = function (copia) {
    var r = { hojas: copia.hojas.length, registros: 0, dt: 0, munro: 0 };
    copia.hojas.forEach(function (h) { r.registros += (h.historial || []).length; r[ctx.localDe(h.datos) === "munro" ? "munro" : "dt"]++; });
    return r;
};
ctx.nombreCopia = function (prefijo) {
    var d = new Date(), z = function (n) { return (n < 10 ? "0" : "") + n; };
    return prefijo + " " + d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()) + " " + z(d.getHours()) + "h" + z(d.getMinutes()) + ".json";
};
ctx.bajarCopia = function (copia, archivo) {
    var json = JSON.stringify(copia, null, 1);
    return ctx.S.downloads.save({ filename: archivo, data: json }).then(function () {
        var k = ctx.cuentaCopia(copia), reg = { fecha: new Date().toISOString(), hojas: k.hojas, registros: k.registros };
        ctx.S.copia = reg;
        ctx.pintarCopia();
        return ctx.conReintento(function () { return ctx.S.db.doc("ajustes/copia").set(reg); }).catch(function () { });
    });
};
ctx.errDescarga = function (e) {
    var c = e && e.code;
    return c === "declined" ? "No se descargó el archivo." : (c === "rate_limited" ? "Ya hay una descarga abierta. Esperá unos segundos y probá de nuevo." : "No se pudo descargar el archivo en esta vista.");
};
ctx.hacerCopia = function () {
    if (!ctx.S.db)
        return;
    if (!ctx.S.downloads) {
        ctx.toast("Esta vista no permite descargar archivos. Abrí la planilla desde claude.ai.", "err");
        return;
    }
    ctx.abrirModal('<h2 id="mTitulo">Copia de seguridad</h2><p class="m-sub" id="cpSub">Leyendo las hojas de los dos locales…</p>' +
        '<div class="progreso"><span id="cpBar" style="width:0"></span></div><dl class="resumen-envio" id="cpRes" hidden><dt>Hojas</dt><dd id="cpHojas"></dd><dt>Registros de historial</dt><dd id="cpReg"></dd></dl>' +
        '<p class="hint" id="cpTxt"></p><p class="err-txt" id="mErr"></p>' +
        '<div class="m-acc"><button type="button" class="btn sec" id="cpCerrar" hidden>Cerrar</button><button type="button" class="btn prim" id="cpBajar" hidden>Descargar de nuevo</button></div>');
    ctx.modalCerrable = false;
    var copia = null, archivo = ctx.nombreCopia("Copia de seguridad Reportes staff");
    var bajar = function () {
        ctx.$("cpBajar").hidden = ctx.$("cpCerrar").hidden = true;
        ctx.$("mErr").textContent = "";
        ctx.$("cpTxt").textContent = "Confirmá la descarga en el aviso que aparece.";
        ctx.bajarCopia(copia, archivo).then(function () {
            ctx.modalCerrable = true;
            ctx.cerrarModal();
            ctx.toast("Copia de seguridad descargada con éxito");
        }, function (e) {
            ctx.modalCerrable = true;
            ctx.$("cpTxt").textContent = "";
            ctx.$("mErr").textContent = ctx.errDescarga(e);
            ctx.$("cpBajar").hidden = ctx.$("cpCerrar").hidden = false;
        });
    };
    scope.listen(ctx.$("cpCerrar"), "click", function () { ctx.modalCerrable = true; ctx.cerrarModal(); });
    scope.listen(ctx.$("cpBajar"), "click", bajar);
    ctx.armarCopia(function (i, n) { ctx.$("cpBar").style.width = Math.round(i / n * 100) + "%"; ctx.$("cpSub").textContent = "Leyendo hojas… " + i + " de " + n; }).then(function (c) {
        copia = c;
        var k = ctx.cuentaCopia(c);
        ctx.$("cpSub").textContent = "La copia está lista.";
        ctx.$("cpHojas").textContent = k.hojas + " (Torcuato " + k.dt + " · Munro " + k.munro + ")";
        ctx.$("cpReg").textContent = k.registros;
        ctx.$("cpRes").hidden = false;
        bajar();
    }, function (e) { ctx.modalCerrable = true; ctx.$("cpSub").textContent = "No se pudo armar la copia."; ctx.$("mErr").textContent = ctx.msgError(e); ctx.$("cpCerrar").hidden = false; });
};
return () => {
/* ---------- Enviar pendientes uno por uno ---------- */
scope.listen(ctx.$("bPendientes"), "click", function () {
    var lista = ctx.pendientesTransfer(ctx.S.local);
    if (!lista.length) {
        ctx.toast("No hay reportes por transferencia pendientes de envío");
        return;
    }
    var pos = 0, enviados = 0;
    var fin = function () { ctx.cerrarModal(); ctx.pintarTodo(); ctx.toast(enviados ? "Envíos terminados · " + enviados + (enviados === 1 ? " reporte enviado" : " reportes enviados") : "No se envió ningún reporte"); };
    var mostrar = function () {
        if (pos >= lista.length) {
            fin();
            return;
        }
        var id = lista[pos], h = ctx.S.srv[id], c = h.contacto || {}, nombre = h.nombre || c.nombre || "", tel = c.tel || "";
        var listo = !!(nombre && tel);
        ctx.abrirModal('<h2 id="mTitulo"></h2><div class="progreso"><span id="pBar"></span></div>' +
            '<dl class="resumen-envio"><dt>Colaborador</dt><dd id="pNom"></dd><dt>Puesto</dt><dd id="pPue"></dd><dt>Período</dt><dd id="pPer"></dd><dt>Total</dt><dd id="pTot" class="num"></dd><dt>WhatsApp</dt><dd id="pTel"></dd></dl>' +
            (listo ? '' : '<div id="pFalta"><label class="t" for="pNombre">Nombre del colaborador</label><input type="text" id="pNombre" autocomplete="off">' +
                '<label class="t" for="pTelIn">Teléfono de WhatsApp</label><input type="tel" id="pTelIn" inputmode="tel" autocomplete="off" placeholder="11 1234 5678">' +
                '<p class="hint">Queda guardado en la hoja para los próximos envíos.</p><p class="err-txt" id="pErr"></p>' +
                '<button type="button" class="btn prim" id="pUsar" style="margin-top:8px">Usar estos datos</button></div>') +
            '<div class="conf-caja" id="pConf"' + (listo ? '' : ' hidden') + '><p class="conf-preg">¿Confirma que el reporte está listo para enviarse por WhatsApp?</p>' +
            '<p class="hint">Al aceptar se prepara la imagen. Al compartir se guarda en tu historial privado. Si lo rechaza, se abre la hoja para seguir modificándola.</p>' +
            '<p class="err-txt" id="pConfErr"></p><div class="conf-acc"><button type="button" class="btn sec" id="pRech">Rechazar</button><button type="button" class="btn prim" id="pAcep">Aceptar</button></div></div>' +
            '<div class="acc-envio" id="pPasos" hidden><p class="hint">Preparando la imagen…</p></div><p class="ok-txt" id="pOk" hidden>Quedó guardado en el historial de la hoja.</p>' +
            '<div class="m-acc"><button type="button" class="btn sec" id="pTerminar">Terminar</button><button type="button" class="btn sec" id="pSaltar">Saltar</button><button type="button" class="btn prim" id="pSig"></button></div>');
        ctx.$("mTitulo").textContent = "Enviar pendientes · " + (pos + 1) + " de " + lista.length;
        ctx.$("pBar").style.width = Math.round(pos / lista.length * 100) + "%";
        ctx.$("pNom").textContent = nombre || "Sin nombre cargado";
        ctx.$("pPue").textContent = ctx.puestoTxt(h) + " · " + ctx.modalidadTxt(h).toLowerCase();
        ctx.$("pPer").textContent = ctx.periodoTxt(h) || "—";
        ctx.$("pTot").textContent = ctx.pesos(ctx.totalDe(h));
        ctx.$("pTel").textContent = tel ? ctx.telTxt(tel) : "Sin cargar";
        ctx.$("pSig").textContent = pos + 1 < lista.length ? "Siguiente" : "Terminar";
        var env = null;
        var preparar = function () {
            var e = ctx.prepararEnvio(h, nombre, tel, ctx.saludo(nombre, h));
            e.onShared = function () { return ctx.registrarEnvio(id, nombre, tel).then(function () { enviados++; ctx.$("pOk").hidden = false; }); };
            env = e;
            ctx.$("pPasos").hidden = false;
            ctx.$("pOk").hidden = true;
            ctx.crearImagen(h, nombre).then(function (b) { e.img = b; }, function () { e.img = null; }).then(function () {
                if (env !== e || !ctx.$("pPasos"))
                    return;
                ctx.accionesEnvio(ctx.$("pPasos"), e, nombre, h);
            });
        };
        if (!listo) {
            ctx.$("pNombre").value = nombre;
            ctx.$("pTelIn").value = tel ? ctx.telTxt(tel) : "";
            scope.listen(ctx.$("pUsar"), "click", function () {
                var n = ctx.$("pNombre").value.trim(), t = ctx.normalizarTel(ctx.$("pTelIn").value);
                if (!n) {
                    ctx.$("pErr").textContent = "Completá el nombre del colaborador.";
                    return;
                }
                if (!t) {
                    ctx.$("pErr").textContent = "El teléfono no parece válido. Escribilo con código de área, sin 0 ni 15.";
                    return;
                }
                nombre = n;
                tel = t;
                ctx.$("pNom").textContent = n;
                ctx.$("pTel").textContent = ctx.telTxt(t);
                ctx.$("pFalta").hidden = true;
                ctx.$("pConf").hidden = false;
            });
        }
        scope.listen(ctx.$("pAcep"), "click", function () {
            ctx.$("pAcep").disabled = ctx.$("pRech").disabled = true;
            ctx.$("pConfErr").textContent = "";
            ctx.$("pConf").hidden = true; preparar(); ctx.pintarTodo();
        });
        scope.listen(ctx.$("pRech"), "click", function () {
            ctx.pintarTodo();
            ctx.seguirModificando(id, "Envío cancelado · podés seguir modificando la hoja" + (nombre ? " de " + nombre : ""));
        });
        scope.listen(ctx.$("pSig"), "click", function () { pos++; mostrar(); });
        scope.listen(ctx.$("pSaltar"), "click", function () { pos++; mostrar(); });
        scope.listen(ctx.$("pTerminar"), "click", fin);
    };
    ctx.salirSiHaceFalta(mostrar);
});
ctx.COPIA_TIPO = "reportes-staff-copia";
ctx.ID_OK = /^[A-Za-z0-9_-]{1,200}$/;
};
}
