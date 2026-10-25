// Preserved behavior from test-app; mounted and disposed by the React hooks.
export function registerPeriodAndCanvas(scope, ctx) {
const { document } = scope;
ctx.confirmarBorrarRegistro = function (r) {
    var id = ctx.S.activo, d = r.d || {}, per = d.periodo || (d.mes ? d.mes + (d.anio ? " " + d.anio : "") : "");
    ctx.confirmar({ titulo: "Borrar reporte del historial",
        texto: "¿Está seguro de que desea borrar de forma permanente el reporte registrado el " + ctx.fechaHoraTxt(d.registrado) + (per ? " (" + per + ")" : "") + "? Esta acción no se puede deshacer.",
        cancelar: "Rechazar", boton: "Aceptar", peligro: true, ok: function () {
            return ctx.S.db.doc("hojas/" + id + "/historial/" + r.id).delete().then(function () {
                if (ctx.S.activo === id) {
                    ctx.S.hist = ctx.S.hist.filter(function (x) { return x.id !== r.id; });
                    ctx.pintarHistorial();
                }
                ctx.toast("Reporte borrado del historial con éxito");
            });
        } });
};
ctx.masFrecuente = function (arr) { var c = {}, best = null, n = 0; arr.forEach(function (x) { if (!x)
    return; c[x] = (c[x] || 0) + 1; if (c[x] > n) {
    n = c[x];
    best = x;
} }); return best; };
ctx.siguientePeriodo = function (l) {
    var ids = ctx.hojasLocal(l);
    if (ctx.LOCALES[l].ciclo === "mensual") {
        var p = ctx.masFrecuente(ids.map(function (id) { var h = ctx.S.srv[id]; return h.mes && h.anio ? h.mes + "|" + h.anio : ""; }));
        if (!p)
            return null;
        var parts = p.split("|"), i = ctx.MESES.indexOf(parts[0]), y = +parts[1];
        if (i < 0 || !y)
            return null;
        var ni = (i + 1) % 12, ny = i === 11 ? y + 1 : y;
        return { actual: parts[0] + " " + parts[1], txt: ctx.MESES[ni] + " " + ny, campos: { mes: ctx.MESES[ni], anio: String(ny) } };
    }
    var d = ctx.masFrecuente(ids.map(function (id) { return ctx.S.srv[id].semDesde || ""; }));
    if (!d)
        return null;
    var nd = ctx.sumarDias(ctx.lunesDe(d), 7), nh = ctx.sumarDias(nd, 6);
    return { actual: "la semana del " + ctx.fechaAA(d), txt: "Semana del " + ctx.fechaAA(nd) + " al " + ctx.fechaAA(nh), campos: { semDesde: nd, semHasta: nh } };
};
ctx.textoDetalle = function (h, nombre) {
    var l = ["*GESTLOK · " + ctx.LOCALES[ctx.localDe(h)].txt + "*"];
    l.push("Colaborador: " + (nombre || h.nombre || ""));
    l.push("Puesto: " + ctx.puestoTxt(h) + " · " + ctx.modalidadTxt(h).toLowerCase());
    if (ctx.periodoTxt(h))
        l.push("Período: " + ctx.periodoTxt(h));
    l.push("");
    var tar = ctx.normTarifas(h.tarifas);
    ctx.ITEMS.forEach(function (it0) {
        if (!ctx.activo(h, it0))
            return;
        var it = ctx.defItem(h, it0), v = (h.items && h.items[it.k]) || {}, t = it.tipo === "monto" ? null : tar[it.k];
        if (it.k === "aus" && ctx.ausJustificado(h)) {
            l.push("• " + it.txt + " (justificado): " + ctx.cantTxt(it.tipo, v.c) + " · sin descuento");
            return;
        }
        var cant = it.tipo === "monto" ? "" : ctx.cantTxt(it.tipo, v.c) + (t != null && v.c != null ? " × " + ctx.pesos(t) : "") + " · ";
        l.push("• " + it.txt + (it.resta ? " (descuento)" : "") + ": " + cant + ctx.importeTxt(it, v.i, "$ 0,00", "- "));
    });
    l.push("");
    l.push("*Total: " + ctx.pesos(ctx.totalDe(h)) + "*");
    if (h.obs) {
        l.push("");
        l.push("Observaciones: " + h.obs);
    }
    return l.join("\n");
};
ctx.saludo = function (nombre, h) {
    var p = String(nombre || "").trim().split(/\s+/)[0] || "", per = ctx.periodoTxt(h);
    var cuando = per ? (ctx.cicloDe(h) === "semanal" ? " de la " + per.charAt(0).toLowerCase() + per.slice(1) : " correspondiente a " + per.toLowerCase()) : "";
    return "Hola" + (p ? " " + p : "") + ", te comparto tu reporte" + cuando + ". Cualquier consulta, avisame.";
};
ctx.rgb = function (hex) { var n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
ctx.LienzoDoc = function (k) {
    k = k || 6;
    var W = 210, HMAX = 600, imgs = {};
    var c = document.createElement("canvas");
    c.width = W * k;
    c.height = HMAX * k;
    var x = c.getContext("2d");
    x.fillStyle = "#fff";
    x.fillRect(0, 0, c.width, c.height);
    var fill = "#000", stroke = "#000", tcol = "#000", fam = "helvetica", st = "normal", size = 10, lw = 0.2;
    var col = function (a) { return a.length >= 3 ? "rgb(" + a[0] + "," + a[1] + "," + a[2] + ")" : "rgb(" + a[0] + "," + a[0] + "," + a[0] + ")"; };
    var fuente = function () { return (st.indexOf("bold") > -1 ? "700 " : "400 ") + (size * 0.3528 * k).toFixed(2) + "px " + (fam === "times" ? '"Source Serif 4",Georgia,"Times New Roman",serif' : '"IBM Plex Sans",Helvetica,Arial,sans-serif'); };
    var pintar = function (trazar, s) {
        s = s || "S";
        if (s.indexOf("F") > -1) {
            x.fillStyle = fill;
            x.beginPath();
            trazar();
            x.fill();
        }
        if (s === "S" || s.indexOf("D") > -1) {
            x.strokeStyle = stroke;
            x.lineWidth = Math.max(1, lw * k);
            x.beginPath();
            trazar();
            x.stroke();
        }
    };
    this.alto = 297;
    this.setFillColor = function () { fill = col(arguments); };
    this.setDrawColor = function () { stroke = col(arguments); };
    this.setTextColor = function () { tcol = col(arguments); };
    this.setFont = function (f, s) { fam = f; st = s || "normal"; };
    this.setFontSize = function (s) { size = s; };
    this.setLineWidth = function (w) { lw = w; };
    this.rect = function (X, Y, w, h, s) { pintar(function () { x.rect(X * k, Y * k, w * k, h * k); }, s); };
    this.roundedRect = function (X, Y, w, h, r, r2, s) {
        pintar(function () {
            var a = X * k, b = Y * k, ww = w * k, hh = h * k, rr = r * k;
            x.moveTo(a + rr, b);
            x.arcTo(a + ww, b, a + ww, b + hh, rr);
            x.arcTo(a + ww, b + hh, a, b + hh, rr);
            x.arcTo(a, b + hh, a, b, rr);
            x.arcTo(a, b, a + ww, b, rr);
            x.closePath();
        }, s);
    };
    this.line = function (a, b, c2, d) { x.strokeStyle = stroke; x.lineWidth = Math.max(1, lw * k); x.beginPath(); x.moveTo(a * k, b * k); x.lineTo(c2 * k, d * k); x.stroke(); };
    this.text = function (t, X, Y, o) { x.font = fuente(); x.fillStyle = tcol; x.textAlign = (o && o.align) || "left"; x.textBaseline = "alphabetic"; x.fillText(String(t), X * k, Y * k); };
    this.splitTextToSize = function (t, w) {
        x.font = fuente();
        var max = w * k, out = [];
        String(t).split(/\n/).forEach(function (par) {
            var l = "";
            par.split(/\s+/).forEach(function (p) { if (!p)
                return; var pr = l ? l + " " + p : p; if (x.measureText(pr).width > max && l) {
                out.push(l);
                l = p;
            }
            else
                l = pr; });
            out.push(l);
        });
        return out;
    };
    this.precargar = function (src) { return new Promise(function (res) { var im = new Image(); im.onload = function () { imgs[src] = im; res(); }; im.onerror = function () { res(); }; im.src = src; }); };
    this.addImage = function (src, f, X, Y, w, h) { if (imgs[src])
        x.drawImage(imgs[src], X * k, Y * k, w * k, h * k); };
    this.addPage = function () { };
    this.getNumberOfPages = function () { return 1; };
    this.setPage = function () { };
    this.aBlob = function () {
        var alto = Math.min(HMAX, Math.ceil(this.alto)), c2 = document.createElement("canvas");
        c2.width = c.width;
        c2.height = alto * k;
        c2.getContext("2d").drawImage(c, 0, 0);
        return new Promise(function (res, rej) { c2.toBlob(function (b) { if (b)
            res(b);
        else
            rej(new Error("img")); }, "image/png"); });
    };
};
return () => {
scope.listen(ctx.$("bPrimera"), "click", function () { ctx.modalNombreHoja(null); });
scope.listen(ctx.$("bRenombrar"), "click", function () { ctx.conGuardado(function () { ctx.modalNombreHoja(ctx.S.activo); }); });
scope.listen(ctx.$("bEliminar"), "click", function () {
    ctx.salirSiHaceFalta(function () {
        var id = ctx.S.activo, h = ctx.S.srv[id];
        if (!h)
            return;
        ctx.confirmar({ titulo: "Eliminar la hoja “" + ctx.tituloHoja(h) + "”", texto: "Se borran sus datos, el número guardado y todo su historial. No se puede deshacer.", boton: "Eliminar hoja", peligro: true, ok: function () {
                return ctx.S.db.collection("hojas/" + id + "/historial").get().then(function (snap) {
                    return snap.docs.reduce(function (p, d) { return p.then(function () { return ctx.S.db.doc("hojas/" + id + "/historial/" + d.id).delete(); }); }, Promise.resolve());
                }).then(function () { return ctx.S.db.doc("hojas/" + id).delete(); }).then(function () {
                    delete ctx.S.srv[id];
                    ctx.S.orden = ctx.S.orden.filter(function (x) { return x !== id; });
                    ctx.S.activo = ctx.elegir(ctx.S.local, ctx.S.carpeta);
                    ctx.guardarPref();
                    ctx.suscribirHistorial();
                    ctx.pintarTodo();
                    ctx.toast("Hoja eliminada");
                });
            } });
    });
});
scope.listen(ctx.$("bLimpiar"), "click", function () {
    ctx.conGuardado(function () {
        ctx.abrirModal('<h2 id="mTitulo">Limpiar esta hoja</h2><p class="m-sub">Se borran la fecha, el período, las cantidades, los importes, las observaciones, la firma, vacaciones y aguinaldo. Quedan el nombre, el puesto, la forma de pago, el WhatsApp, el alias, los valores unitarios y el historial.</p>' +
            '<p class="err-txt" id="mErr"></p><div class="m-acc"><button type="button" class="btn sec" data-cerrar>Cancelar</button><button type="button" class="btn sec" id="mSolo">Limpiar sin guardar</button><button type="button" class="btn prim" id="mGuardar">Guardar en historial y limpiar</button></div>');
        var limpiar = function (antes) {
            ctx.$("mSolo").disabled = ctx.$("mGuardar").disabled = true;
            var id = ctx.S.activo, p = antes ? ctx.registrarHistorialDe(id, "Guardado al limpiar") : Promise.resolve();
            var vacio = ctx.camposPeriodoVacio();
            p.then(function () { var u = ctx.clon(vacio); u.actualizado = new Date().toISOString(); return ctx.S.db.doc("hojas/" + id).update(u); })
                .then(function () { var h = ctx.S.srv[id]; if (h) {
                Object.keys(vacio).forEach(function (k) { h[k] = ctx.clon(vacio[k]); });
                h.actualizado = new Date().toISOString();
            } ctx.cerrarModal(); ctx.pintarTodo(); ctx.toast(antes ? "Guardado en el historial y hoja limpia" : "Hoja lista para el nuevo período"); })
                .catch(function (e) { ctx.$("mErr").textContent = ctx.msgError(e); ctx.$("mSolo").disabled = ctx.$("mGuardar").disabled = false; });
        };
        scope.listen(ctx.$("mSolo"), "click", function () { limpiar(false); });
        scope.listen(ctx.$("mGuardar"), "click", function () { limpiar(true); });
    });
});
scope.listen(ctx.$("bOlvidar"), "click", function () {
    var id = ctx.S.activo;
    ctx.confirmar({ titulo: "Borrar el número guardado", texto: "La próxima exportación de esta hoja va a pedir el número de nuevo.", boton: "Borrar número", peligro: true, ok: function () {
            return ctx.S.db.doc("hojas/" + id).update({ contacto: null }).then(function () { if (ctx.S.srv[id])
                ctx.S.srv[id].contacto = null; ctx.pintarValores(); ctx.toast("Número borrado"); });
        } });
});
scope.listen(ctx.$("bCerrar"), "click", function () {
    var l = ctx.S.local, ids = ctx.hojasLocal(l), conDatos = ids.filter(function (id) { return ctx.tieneDatos(ctx.S.srv[id]); }), m = ctx.metricasLocal(l), sig = ctx.siguientePeriodo(l);
    var ciclo = ctx.LOCALES[l].ciclo, nombreCierre = ctx.CIERRE[ciclo];
    ctx.abrirModal('<h2 id="mTitulo"></h2><p class="m-sub" id="cTxt"></p>' +
        '<dl class="resumen-envio"><dt>Hojas con datos</dt><dd id="cDatos"></dd><dt>Sin enviar</dt><dd id="cPend"></dd></dl>' +
        '<p class="alerta" id="cAlerta" hidden></p>' +
        (sig ? '<label class="check"><input type="checkbox" id="cSig" checked> <span id="cSigTxt"></span></label>' : '') +
        '<div class="progreso" id="cProg" hidden><span style="width:0"></span></div><p class="hint" id="cProgTxt"></p>' +
        '<p class="err-txt" id="mErr"></p>' +
        '<div class="m-acc"><button type="button" class="btn sec" data-cerrar id="cCancel">Cancelar</button><button type="button" class="btn prim" id="cOk"></button></div>');
    ctx.$("mTitulo").textContent = nombreCierre + " · " + ctx.LOCALES[l].txt;
    ctx.$("cTxt").textContent = "Las hojas con datos que todavía no se enviaron se guardan en su historial, y todas quedan limpias para el período siguiente. Se mantienen el nombre, el puesto, el WhatsApp, el alias y los valores unitarios.";
    ctx.$("cDatos").textContent = conDatos.length + " de " + ids.length;
    ctx.$("cPend").textContent = m.pendientes;
    if (m.pendientes) {
        ctx.$("cAlerta").hidden = false;
        ctx.$("cAlerta").textContent = "Hay " + m.pendientes + (m.pendientes === 1 ? " reporte cargado que todavía no se envió." : " reportes cargados que todavía no se enviaron.") + " Si cerrás ahora, quedan guardados en el historial pero sin enviar.";
    }
    if (sig)
        ctx.$("cSigTxt").textContent = "Dejar todas las hojas en el período siguiente: " + sig.txt;
    ctx.$("cOk").textContent = nombreCierre;
    scope.listen(ctx.$("cOk"), "click", function () {
        var preparar = sig && ctx.$("cSig") && ctx.$("cSig").checked;
        ctx.$("cOk").disabled = true;
        ctx.$("cCancel").disabled = true;
        ctx.modalCerrable = false;
        ctx.$("cProg").hidden = false;
        var hecho = 0, total = ids.length, barra = ctx.$("cProg").querySelector("span");
        var paso = function () { hecho++; barra.style.width = Math.round(hecho / total * 100) + "%"; ctx.$("cProgTxt").textContent = "Cerrando hojas… " + hecho + " de " + total; };
        var ahora = new Date().toISOString();
        ctx.$("cProgTxt").textContent = "Guardando una copia en la nube antes del cierre…";
        ctx.guardarCopiaNube("Antes del cierre · " + ctx.LOCALES[l].txt).then(function () {
            return ids.reduce(function (p, id) {
                return p.then(function () {
                    var h = ctx.S.srv[id];
                    if (!h) {
                        paso();
                        return;
                    }
                    /* Las hojas ya enviadas o descargadas ya tienen su fila en el historial: no se duplican */
                    var yaReg = !!(h.ultimaExport && h.ultimaExport >= (h.actualizado || ""));
                    var antes = ctx.tieneDatos(h) && !yaReg ? ctx.registrarHistorialDe(id, "Cierre de período (sin enviar)") : Promise.resolve();
                    return antes.then(function () {
                        var u = ctx.camposPeriodoVacio();
                        if (preparar)
                            Object.keys(sig.campos).forEach(function (k) { u[k] = sig.campos[k]; });
                        u.actualizado = ahora;
                        return ctx.S.db.doc("hojas/" + id).update(u).then(function () { Object.keys(u).forEach(function (k) { h[k] = ctx.clon(u[k]); }); paso(); });
                    });
                });
            }, Promise.resolve());
        }, function (e) { var er = new Error("previa"); er.previa = e; throw er; }).then(function () {
            ctx.modalCerrable = true;
            ctx.cerrarModal();
            ctx.pintarTodo();
            ctx.toast("Período cerrado con éxito" + (preparar ? " · listo para " + sig.txt : "") + ". Quedó una copia en la nube de cómo estaba antes del cierre.");
        }).catch(function (e) {
            ctx.modalCerrable = true;
            ctx.$("cCancel").disabled = false;
            if (e && e.previa) {
                ctx.$("cOk").disabled = false;
                ctx.$("cProgTxt").textContent = "";
                ctx.$("mErr").textContent = "No se pudo guardar la copia en la nube antes del cierre (" + ctx.msgError(e.previa) + "). No se cerró ninguna hoja; probá de nuevo.";
                return;
            }
            ctx.$("mErr").textContent = ctx.msgError(e) + " Se cerraron " + hecho + " de " + total + " hojas; podés volver a intentar.";
        });
    });
});
};
}
