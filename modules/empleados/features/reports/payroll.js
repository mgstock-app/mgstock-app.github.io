import { parseClockHours, formatHours } from '../../utils/duration.js';
// Preserved behavior from test-app; mounted and disposed by the React hooks.
export function registerPayroll(scope, ctx) {
const { document, window } = scope;
ctx.$ = function (id) { return document.getElementById(id); };
ctx.clon = function (o) { return o == null ? o : JSON.parse(JSON.stringify(o)); };
ctx.formatHours = formatHours;
ctx.leerHoras = function (value) { return String(value).includes(':') ? parseClockHours(value) : ctx.leerNumero(value); };
ctx.r2 = function (n) { return Math.round(n * 100) / 100; };
ctx.pesos = function (n) { return ctx.fmtMoneda.format(Number(n) || 0).replace(/[\u00a0\u202f]/g, " "); };
ctx.cantTxt = function (tipo, n) {
    if (tipo === "monto")
        return "—";
    if (n == null || n === "")
        return "—";
    if (tipo === "horas")
        return formatHours(n) + " hs";
    if (tipo === "turnos")
        return ctx.fmtEntero.format(n) + (Number(n) === 1 ? " turno" : " turnos");
    return ctx.fmtEntero.format(n) + (Number(n) === 1 ? " día" : " días");
};
ctx.porUnidad = function (tipo) { return tipo === "horas" ? "/ hs" : (tipo === "turnos" ? "/ turno" : "/ día"); };
ctx.z2 = function (n) { return (n < 10 ? "0" : "") + n; };
ctx.fechaTxt = function (iso) { if (!iso)
    return ""; var p = String(iso).split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : String(iso); };
ctx.fechaCorta = function (iso) { if (!iso)
    return ""; var p = String(iso).split("-"); return p.length === 3 ? p[2] + "/" + p[1] : String(iso); };
ctx.fechaAA = function (iso) { if (!iso)
    return ""; var p = String(iso).split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0].slice(2) : String(iso); };
ctx.isoDe = function (d) { return d.getFullYear() + "-" + ctx.z2(d.getMonth() + 1) + "-" + ctx.z2(d.getDate()); };
ctx.lunesDe = function (iso) { var p = String(iso).split("-"); var d = new Date(+p[0], +p[1] - 1, +p[2]); var dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return ctx.isoDe(d); };
ctx.semanaTxt = function (desde, hasta) { return "Lun " + ctx.fechaAA(desde) + " al dom " + ctx.fechaAA(hasta || ctx.sumarDias(desde, 6)); };
ctx.fechaHoraTxt = function (iso) { if (!iso)
    return ""; var d = new Date(iso); if (isNaN(d))
    return ""; return ctx.z2(d.getDate()) + "/" + ctx.z2(d.getMonth() + 1) + "/" + d.getFullYear() + " " + ctx.z2(d.getHours()) + ":" + ctx.z2(d.getMinutes()); };
ctx.hoyIso = function () { var d = new Date(); return d.getFullYear() + "-" + ctx.z2(d.getMonth() + 1) + "-" + ctx.z2(d.getDate()); };
ctx.sumarDias = function (iso, n) { var p = String(iso).split("-"); if (p.length !== 3)
    return ""; var d = new Date(+p[0], +p[1] - 1, +p[2] + n); return d.getFullYear() + "-" + ctx.z2(d.getMonth() + 1) + "-" + ctx.z2(d.getDate()); };
ctx.leerNumero = function (s) {
    s = String(s == null ? "" : s).trim().replace(/[$\s]/g, "");
    if (!s)
        return null;
    var neg = false;
    if (s.charAt(0) === "-") {
        neg = true;
        s = s.slice(1);
    }
    if (s.indexOf(",") !== -1)
        s = s.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(s))
        s = s.replace(/\./g, "");
    if (!/^\d*\.?\d*$/.test(s) || s === "." || s === "")
        return NaN;
    var n = Number(s);
    return neg ? -n : n;
};
ctx.normalizarTel = function (txt) {
    var d = String(txt || "").replace(/\D/g, "");
    if (d.indexOf("00") === 0)
        d = d.slice(2);
    if (d.length === 10 && d.charAt(0) !== "0")
        d = "549" + d;
    else if (d.length === 11 && d.charAt(0) === "0")
        d = "549" + d.slice(1);
    else if (d.length === 12 && d.indexOf("54") === 0 && d.charAt(2) !== "9")
        d = "549" + d.slice(2);
    if (d.length < 11 || d.length > 15)
        return null;
    return d;
};
ctx.telTxt = function (d) { d = String(d || "").replace(/\D/g, ""); if (!d)
    return ""; if (d.length === 13 && d.indexOf("549") === 0)
    return "+54 9 " + d.slice(3); return "+" + d; };
ctx.localDe = function (h) { if (h && Object.prototype.hasOwnProperty.call(ctx.LOCALES, h.local)) return h.local; /* Legacy original Torcuato sheets predate the local field. */ if (h && !h.local && Object.prototype.hasOwnProperty.call(ctx.LOCALES, "dt")) return "dt"; return Object.keys(ctx.LOCALES)[0]; };
ctx.cicloDe = function (h) { return ctx.LOCALES[ctx.localDe(h)].ciclo; };
ctx.puestoDe = function (h) { return h && h.puesto === "encargado" ? "encargado" : "staff"; };
ctx.esTurno = function (h) { return !!(h && h.porTurno); };
ctx.activo = function (h, it) {
    if (!it.opcional)
        return true;
    var v = h && h[it.opcional];
    /* Hojas anteriores a que ausentes fuera opcional: queda activo si ya tenía datos cargados */
    if (v == null && it.opcional === "ausente") {
        var a = h && h.items && h.items.aus;
        return !!(a && (a.c != null || a.i != null));
    }
    return !!v;
};
ctx.ausJustificado = function (h) { return !!(h && h.ausJust); };
ctx.defItem = function (h, it) {
    var turno = ctx.esTurno(h);
    if (it.k === "trab")
        return turno ? { k: "trab", txt: "Turnos trabajados", tipo: "turnos" } : it;
    if (it.k === "off")
        return turno ? { k: "off", txt: "Turnos de OFF", tipo: "turnos" } : it;
    if (it.k === "fer")
        return { k: "fer", txt: turno ? "Turnos feriado" : "Horas feriado", tipo: turno ? "turnos" : "horas" };
    return it;
};
ctx.tarifaDe = function (h, k) { var t = ctx.normTarifas(h && h.tarifas); return ctx.LIGADAS.indexOf(k) > -1 ? t.trab : t[k]; };
ctx.puestoTxt = function (h) { return ctx.puestoDe(h) === "encargado" ? "Encargado" : "Staff"; };
ctx.nombreColab = function (h) { return String(h && h.nombre || "").trim(); };
ctx.tituloHoja = function (h) { return ctx.nombreColab(h) || (h && h.nombreHoja) || "Sin nombre"; };
ctx.estadoColab = function (h) { var e = h && h.estadoColab; if (ctx.ESTADOS_COLAB[e])
    return e; return h && h.inactivo ? "inactivo" : "activo"; };
ctx.esInactivo = function (h) { return ctx.estadoColab(h) === "inactivo"; };
ctx.modalidadTxt = function (h) { return ctx.esTurno(h) ? "Por turnos" : "Por horas"; };
ctx.pagoDe = function (h) { return h && h.pago === "efectivo" ? "efectivo" : "transferencia"; };
ctx.esEfectivo = function (h) { return ctx.pagoDe(h) === "efectivo"; };
ctx.pagoTxt = function (h) { if (ctx.esEfectivo(h))
    return "Efectivo"; var a = String(h && h.alias || "").trim(); return "Transferencia" + (a ? " · alias " + a : ""); };
ctx.estadoTxt = function (h, e) { return ctx.ESTADOS[e]; };
ctx.firmaVigente = function (h) { return !!(h && h.firma && h.firma.img && h.firma.fecha && h.firma.fecha >= (h.actualizado || "")); };
ctx.montoEnLetras = function (monto) {
    var U = ["", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve"];
    var D = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
    var C = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];
    var apoc = function (s) { return s.replace(/veintiuno$/, "veintiún").replace(/uno$/, "un"); };
    var cien = function (x) { if (x === 0)
        return ""; if (x === 100)
        return "cien"; var c = Math.floor(x / 100), r = x % 100, t = r < 30 ? U[r] : D[Math.floor(r / 10)] + (r % 10 ? " y " + U[r % 10] : ""); return [C[c], t].filter(Boolean).join(" "); };
    var mil = function (x) { var m = Math.floor(x / 1000), r = x % 1000; var pre = m === 0 ? "" : (m === 1 ? "mil" : apoc(cien(m)) + " mil"); return [pre, cien(r)].filter(Boolean).join(" "); };
    var v = Math.abs(Number(monto) || 0), ent = Math.floor(v + 1e-9), cent = Math.round((v - ent) * 100);
    if (cent === 100) {
        ent++;
        cent = 0;
    }
    var mm = Math.floor(ent / 1e6), r = ent % 1e6;
    var pm = mm === 0 ? "" : (mm === 1 ? "un millón" : apoc(mil(mm)) + " millones");
    var txt = ent === 0 ? "cero" : [pm, mil(r)].filter(Boolean).join(" ");
    return txt + " con " + ctx.z2(cent) + "/100";
};
ctx.periodoTxt = function (h) {
    if (!h)
        return "";
    if (h.periodoFijo)
        return h.periodoFijo;
    if (ctx.cicloDe(h) === "semanal") {
        if (h.semDesde && h.semHasta)
            return "Semana del " + ctx.fechaAA(h.semDesde) + " al " + ctx.fechaAA(h.semHasta);
        if (h.semDesde)
            return "Semana del " + ctx.fechaTxt(h.semDesde);
        return "";
    }
    if (h.mes)
        return h.mes + (h.anio ? " " + h.anio : "");
    return "";
};
ctx.normItems = function (items) {
    var r = {};
    ctx.ITEMS.forEach(function (it) { var v = (items && items[it.k]) || {}; r[it.k] = { c: v.c == null ? null : v.c, i: v.i == null ? null : v.i }; });
    return r;
};
ctx.normTarifas = function (t) {
    var r = {};
    ctx.ITEMS.forEach(function (it) { if (it.tipo === "monto")
        return; var v = t && t[it.k]; r[it.k] = (typeof v === "number" && isFinite(v)) ? v : null; });
    r.off = r.fer = r.trab;
    return r;
};
ctx.hojaVacia = function (nombreHoja, local, puesto) {
    return { nombreHoja: nombreHoja, local: Object.prototype.hasOwnProperty.call(ctx.LOCALES, local) ? local : Object.keys(ctx.LOCALES)[0], puesto: puesto === "encargado" ? "encargado" : "staff", porTurno: false, orden: Date.now(),
        nombre: "", alias: "", pago: "transferencia", firma: null, extras: false, fecha: "", mes: "", anio: "", semDesde: "", semHasta: "", ausente: false, ausJust: false, vac: false, agu: false, obs: "", items: ctx.normItems(null), tarifas: ctx.normTarifas(null),
        contacto: null, ultimaExport: null, actualizado: new Date().toISOString() };
};
ctx.cantidadTotalTxt = function (h) {
    var total = ["trab", "off", "fer"].concat(h && h.extras ? ["extra"] : []).reduce(function (sum, key) {
        var value = Number(h && h.items && h.items[key] && h.items[key].c);
        return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
    var principal = ctx.cantTxt(ctx.esTurno(h) ? "turnos" : "horas", ctx.esTurno(h) ? total - (h && h.extras ? Number(h.items && h.items.extra && h.items.extra.c) || 0 : 0) : total);
    var adicionales = h && h.extras && h.items && h.items.extra ? Number(h.items.extra.c) || 0 : 0;
    return ctx.esTurno(h) && adicionales > 0 ? principal + " · " + ctx.cantTxt("horas", adicionales) + " extra" : principal;
};
ctx.totalDe = function (h) {
    var t = 0;
    ctx.ITEMS.forEach(function (it) {
        if (!ctx.activo(h, it))
            return;
        if (it.k === "aus" && ctx.ausJustificado(h))
            return;
        var v = h.items && h.items[it.k] && h.items[it.k].i;
        if (typeof v === "number" && isFinite(v))
            t += it.resta ? -Math.abs(v) : v;
    });
    return ctx.r2(t);
};
ctx.importeTxt = function (it, v, vacio, menos) {
    if (v == null)
        return vacio;
    return it && it.resta && v ? (menos || "− ") + ctx.pesos(Math.abs(v)) : ctx.pesos(v);
};
ctx.tieneDatos = function (h) { var it = h && h.items || {}; return Object.keys(it).some(function (k) { return it[k] && (it[k].c != null || it[k].i != null); }); };
ctx.estadoHoja = function (h) {
    if (!ctx.tieneDatos(h))
        return "vacia";
    if (h.ultimaExport && h.ultimaExport >= (h.actualizado || ""))
        return "enviada";
    if (ctx.esEfectivo(h) && ctx.firmaVigente(h))
        return "enviada";
    return "cargada";
};
ctx.camposDe = function (h) {
    h = h || {};
    return { nombre: h.nombre || "", alias: String(h.alias || "").trim(), pago: ctx.pagoDe(h), fecha: h.fecha || "", mes: h.mes || "", anio: h.anio || "", semDesde: h.semDesde || "", semHasta: h.semHasta || "",
        puesto: ctx.puestoDe(h), porTurno: ctx.esTurno(h), extras: !!h.extras, ausente: ctx.activo(h, ctx.ITEM_AUS), ausJust: ctx.ausJustificado(h), vac: !!h.vac, agu: !!h.agu, obs: h.obs || "", items: ctx.normItems(h.items), tarifas: ctx.normTarifas(h.tarifas),
        contacto: h.contacto && h.contacto.tel ? { nombre: h.contacto.nombre || "", tel: String(h.contacto.tel) } : null };
};
ctx.camposPeriodoVacio = function () { return { extras: false, fecha: "", mes: "", anio: "", semDesde: "", semHasta: "", ausente: false, ausJust: false, vac: false, agu: false, obs: "", firma: null, items: ctx.normItems(null) }; };
return () => {
"use strict";
ctx.ITEMS = [
    { k: "trab", txt: "Horas trabajadas", tipo: "horas" },
    { k: "extra", txt: "Horas extra", tipo: "horas", opcional: "extras" },
    { k: "off", txt: "Horas de OFF", tipo: "horas" },
    { k: "fer", txt: "Horas feriado", tipo: "horas" },
    { k: "aus", txt: "Días ausentes", tipo: "dias", opcional: "ausente", resta: true },
    { k: "vac", txt: "Vacaciones", tipo: "dias", opcional: "vac" },
    { k: "agu", txt: "Aguinaldo", tipo: "monto", opcional: "agu" }
];
ctx.LOCALES = window.REPORT_LOCALS ? Object.fromEntries(window.REPORT_LOCALS.map(local => [local.id, { txt: local.name, ciclo: local.cycle }])) : { dt: { txt: "Torcuato", ciclo: "mensual" }, munro: { txt: "Munro", ciclo: "semanal" } };
ctx.CICLOS = { mensual: "Liquidación mensual", semanal: "Liquidación semanal" };
ctx.CIERRE = { mensual: "Cerrar mes", semanal: "Cerrar semana" };
ctx.CARPETAS = { encargado: "Encargados", staff: "Staff" };
ctx.MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
ctx.TONOS = {
    marino: { txt: "Azul marino", claro: { band: "#1F3A5F", accent: "#1F3A5F", tint: "#EBF0F6", total: "#E1E9F3", focus: "#2F6FBF" }, oscuro: { band: "#24466E", accent: "#8DB4E2", tint: "#14202E", total: "#1C3049", focus: "#8DB4E2" } },
    petroleo: { txt: "Petróleo", claro: { band: "#0F4C5C", accent: "#0F4C5C", tint: "#E6F0F2", total: "#D7E8EC", focus: "#1F7A8C" }, oscuro: { band: "#165A6B", accent: "#7FC4D3", tint: "#112127", total: "#183A42", focus: "#7FC4D3" } },
    verde: { txt: "Verde", claro: { band: "#1E5B45", accent: "#1E5B45", tint: "#E8F1EC", total: "#D9EBE1", focus: "#2E8A66" }, oscuro: { band: "#23604A", accent: "#86CDB0", tint: "#12201B", total: "#1B3A2F", focus: "#86CDB0" } },
    bordo: { txt: "Bordó", claro: { band: "#6E1F33", accent: "#6E1F33", tint: "#F5EBEE", total: "#EFDDE2", focus: "#A8384F" }, oscuro: { band: "#7A2A3E", accent: "#E7A1B1", tint: "#21161A", total: "#42222C", focus: "#E7A1B1" } },
    grafito: { txt: "Grafito", claro: { band: "#2E3238", accent: "#2E3238", tint: "#EDEFF2", total: "#E1E4E9", focus: "#5A6472" }, oscuro: { band: "#3A3F47", accent: "#C7CDD6", tint: "#17191D", total: "#2E3239", focus: "#C7CDD6" } }
};
ctx.MODOS = { auto: "Automático", claro: "Claro", oscuro: "Oscuro" };
ctx.ESTADOS = { enviada: "Enviado", cargada: "Pendiente de envío", vacia: "Sin cargar" };
ctx.fmtMoneda = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2, maximumFractionDigits: 2 });
ctx.fmtImporte = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
ctx.fmtHoras = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
ctx.fmtEntero = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
ctx.LIGADAS = ["off", "fer"];
ctx.ESTADOS_COLAB = { activo: "Activo", refuerzo: "Refuerzo", descanso: "En descanso", inactivo: "Inactivo" };
ctx.ESTADOS_EFE = { enviada: "Recibo listo", cargada: "Pendiente de firma", vacia: "Sin cargar" };
ctx.ITEM_AUS = ctx.ITEMS.filter(function (x) { return x.k === "aus"; })[0];
};
}

/** Read-only projection of the payroll engine for the employee dashboard.
 * It never writes data and uses the same formulas as PDF and planilla.
 */
export function summarizeReport(sheet, local) {
    const ctx = {};
    registerPayroll({ window: { REPORT_LOCALS: [local] } }, ctx)();
    const h = sheet || {};
    const rows = ctx.ITEMS.filter(function (it) { return ctx.activo(h, it); }).map(function (it) {
        const field = h.items && h.items[it.k] || {};
        const descriptor = ctx.defItem(h, it);
        return {
            key: it.k,
            label: descriptor.txt,
            type: descriptor.tipo,
            quantity: field.c == null ? null : field.c,
            rate: descriptor.tipo === "monto" ? null : ctx.tarifaDe(h, it.k),
            amount: it.k === "aus" && ctx.ausJustificado(h) ? 0 : (typeof field.i === "number" && Number.isFinite(field.i) ? (it.resta ? -Math.abs(field.i) : field.i) : null),
        };
    });
    return {
        name: ctx.tituloHoja(h),
        role: ctx.puestoTxt(h),
        status: ctx.estadoColab(h),
        mode: ctx.modalidadTxt(h),
        period: ctx.periodoTxt(h),
        payment: ctx.pagoTxt(h),
        quantity: ctx.cantidadTotalTxt(h),
        total: ctx.totalDe(h),
        reportStatus: ctx.estadoHoja(h),
        lastDelivery: h.ultimaExport || null,
        rows,
    };
}
