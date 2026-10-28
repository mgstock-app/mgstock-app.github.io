const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const ts = require("typescript");
const { jsPDF } = require("jspdf");
function load(file) {
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};
  new Function("exports", "require", output)(exports, (specifier) => load(path.resolve(path.dirname(file), specifier)));
  return exports;
}
async function main() {
  const duration = load("utils/duration.js");
  assert.equal(duration.parseClockHours("145:50"), 145 + 50 / 60);
  assert.equal(duration.formatHours(145 + 50 / 60), "145:50");
  assert.equal(duration.parseScheduleQuantity("0:01", "horas"), 1 / 60);
  assert.equal(duration.parseScheduleQuantity("24:00", "horas"), 24);
  assert.equal(duration.parseScheduleQuantity("12", "turnos"), 12);
  for (const text of ["1:60", "1:99", "-1:30", "1:", "1:3", "Infinity"])
    assert(Number.isNaN(duration.parseScheduleQuantity(text, "horas")));
  for (const text of ["1:30", "1,5", "-1", "745"])
    assert(Number.isNaN(duration.parseScheduleQuantity(text, "turnos")));
  assert.equal(Math.round(duration.parseClockHours("145:50") * 4000 * 100) / 100, 583333.33);
  const { assignmentSelection, needsAssignment } = load("utils/assignment-selection.ts");
  const pendingAccount = { organization_id: "org-a", status: "pending", role: null };
  const companies = [
    { id: "a", organization_id: "org-a" },
    { id: "foreign", organization_id: "org-b" },
  ];
  const localRows = [
    { id: "local-a", company_id: "a", organization_id: "org-a" },
    { id: "local-foreign", company_id: "foreign", organization_id: "org-b" },
  ];
  let assignment = assignmentSelection(pendingAccount, companies, localRows);
  assert.equal(assignment.company.id, "a", "One authorized company is selected automatically");
  assert.equal(assignment.local.id, "local-a");
  assert.equal(assignment.availableCompanies.length, 1, "Unrelated owners are excluded");
  assert.equal(assignmentSelection(pendingAccount, companies, []).availableLocals.length, 0);
  const multipleCompanies = [...companies, { id: "a2", organization_id: "org-a" }];
  assert.equal(assignmentSelection(pendingAccount, multipleCompanies, localRows).company, undefined);
  assignment = assignmentSelection(pendingAccount, multipleCompanies, localRows, "a2", "local-a");
  assert.equal(assignment.company.id, "a2");
  assert.equal(assignment.local, undefined, "Changing company clears the previous local");
  assert.equal(assignmentSelection({ ...pendingAccount, organization_id: null }, companies, localRows).company, undefined);
  assert(needsAssignment(pendingAccount));
  assert(!needsAssignment({ status: "rejected", role: null }));
  assert(!needsAssignment({ status: "approved", role: "employee", local_id: "local-a", sheet_id: "sheet-a" }));
  assert(needsAssignment({ status: "approved", role: "employee", local_id: "local-a", sheet_id: null }));
  assert(needsAssignment({ status: "approved", role: "manager", manager_company_id: null }));
  assert(needsAssignment({ status: "approved", role: "manager", manager_company_id: "a" }));
  assert(!needsAssignment({ status: "approved", role: "manager", manager_company_id: "a", local_id: "local-a", sheet_id: "sheet-a" }));
  const invitationUtils = load("utils/invitations.ts");
  const validCode = "a".repeat(64);
  assert(invitationUtils.isInvitationCode(validCode));
  assert(!invitationUtils.isInvitationCode("invalid"));
  assert.equal(
    invitationUtils.resolveInvitationCode("invalid", validCode),
    "invalid",
    "An invalid explicit URL must not reuse a previous invitation",
  );
  assert.equal(
    invitationUtils.resolveInvitationCode("", validCode),
    "",
    "An empty explicit URL must not join the cached company",
  );
  assert.equal(
    invitationUtils.resolveInvitationCode(null, validCode),
    validCode,
    "Google return recovers the original invitation",
  );
  const dates = load("utils/schedules.ts");
  assert.equal(dates.periodStart("semanal", "2026-10-18"), "2026-10-12");
  assert.equal(dates.periodStart("semanal", "2027-01-01"), "2026-12-28");
  assert.equal(dates.periodStart("mensual", "2026-10-17"), "2026-10-01");
  assert.equal(dates.periodStart("semanal", ""), "");
  const ctx = {};
  const scope = {
    window: { jspdf: { jsPDF } },
    document: {},
    setTimeout,
    clearTimeout,
  };
  for (const file of fs
    .readdirSync("features/reports")
    .filter((file) => file.endsWith(".js") && file !== "runtime.js")) {
    const register = Object.values(
      load(path.join("features/reports", file)),
    )[0];
    const initialize = register(scope, ctx);
    if (file === "payroll.js") initialize();
  }
  ctx.S = { tema: { tono: "marino", modo: "claro" } };
  const sample = {
    nombre: "Persona ficticia",
    ausente: true,
    ausJust: false,
    items: {
      trab: { i: 40000 },
      off: { i: 8000 },
      fer: { i: 0 },
      aus: { i: 8000 },
    },
  };
  assert.equal(ctx.localDe({}), "dt", "Legacy Torcuato sheets without a local stay in Torcuato");
  assert.equal(ctx.localDe({ local: "munro" }), "munro", "New Munro sheets stay in Munro");
  assert.equal(ctx.totalDe(sample), 40000);
  sample.ausJust = true;
  assert.equal(ctx.totalDe(sample), 48000);
  assert.equal(ctx.leerNumero("1.234,56"), 1234.56);
  const hourly = { items: { trab: { c: ctx.leerHoras("145:50"), i: null } }, tarifas: { trab: 4000 } };
  ctx.recalcular(hourly, "trab");
  assert.equal(hourly.items.trab.i, 583333.33);
  assert.equal(ctx.cantTxt("horas", hourly.items.trab.c), "145:50 hs");
  assert.equal(ctx.leerHoras("1,5"), 1.5);
  // Hours and shifts must never be mixed silently; overtime keeps its own rate.
  const overtime = {
    local: "munro", nombre: "Persona de prueba", extras: true, porTurno: false,
    items: { trab: { c: 32, i: null }, extra: { c: 4, i: null } },
    tarifas: { trab: 3500, extra: 5250 },
  };
  ctx.recalcular(overtime, "trab");
  ctx.recalcular(overtime, "extra");
  assert.equal(overtime.items.trab.i, 112000);
  assert.equal(overtime.items.extra.i, 21000);
  assert.equal(ctx.totalDe(overtime), 133000);
  assert.equal(ctx.cantidadTotalTxt(overtime), "36:00 hs");
  assert(ctx.ITEMS.some(item => item.k === "extra" && item.opcional === "extras"));
  const readOnly = load("features/reports/payroll.js").summarizeReport(
    overtime, { id: "munro", name: "Munro", cycle: "semanal" },
  );
  assert.equal(readOnly.total, ctx.totalDe(overtime), "Dashboard and PDF share the payroll formula");
  assert.equal(readOnly.rows.find(item => item.key === "extra").amount, 21000);
  const shifts = {
    ...overtime, porTurno: true,
    items: { trab: { c: 10, i: 100000 }, extra: { c: 4, i: 21000 } },
    tarifas: { trab: 10000, extra: 5250 },
  };
  assert.equal(ctx.totalDe(shifts), 121000);
  assert.equal(ctx.cantidadTotalTxt(shifts), "10 turnos · 4:00 hs extra");
  shifts.extras = false;
  assert.equal(ctx.totalDe(shifts), 100000, "Disabled overtime is excluded");
  assert.equal(ctx.cantidadTotalTxt(shifts), "10 turnos");
  const oldSheet = { items: { trab: { c: 10, i: 100000 } }, porTurno: true };
  assert.equal(ctx.totalDe(oldSheet), 100000, "Existing records without overtime remain unchanged");
  const totals = { items: { trab: { c: 130.5 }, off: { c: 24 }, fer: { c: 0 }, aus: { c: 2 }, vac: { c: 5 } } };
  assert.equal(ctx.cantidadTotalTxt(totals), "154:30 hs");
  totals.items.fer.c = 50 / 60;
  assert.equal(ctx.cantidadTotalTxt(totals), "155:20 hs");
  assert.equal(ctx.cantidadTotalTxt({}), "0:00 hs");
  assert.equal(ctx.cantidadTotalTxt({ porTurno: true, items: { trab: { c: 12 }, off: { c: 2 }, fer: { c: 1 } } }), "15 turnos");
  assert(Number.isNaN(ctx.leerHoras("145:60")));
  assert.equal(ctx.sumarDias("2026-10-26", 6), "2026-11-01");
  const pdf = ctx.crearPdf(sample, sample.nombre);
  assert(pdf instanceof Blob);
  assert((await pdf.text()).startsWith("%PDF-"));
  const captured = { text: [], lines: [] };
  function CapturedPdf(options) {
    const doc = new jsPDF(options);
    const originalText = doc.text.bind(doc), originalLine = doc.line.bind(doc);
    doc.text = (value, x, y, options = {}) => { captured.text.push({ value: String(value), x, y, size: doc.getFontSize(), width: doc.getTextWidth(String(value)), align: options.align }); return originalText(value, x, y, options); };
    doc.line = (x1, y1, x2, y2) => { captured.lines.push({ x1, y1, x2, y2 }); return originalLine(x1, y1, x2, y2); };
    return doc;
  }
  const previousLocalName = ctx.LOCALES.munro.txt;
  const longLocalName = "Local semanal ficticio CamPrueba sucursal de nombre extenso";
  ctx.LOCALES.munro.txt = longLocalName;
  scope.window.jspdf.jsPDF = CapturedPdf;
  ctx.crearPdf({ ...sample, local: "munro", semDesde: "2026-10-19", semHasta: "2026-10-25" }, sample.nombre);
  scope.window.jspdf.jsPDF = jsPDF;
  ctx.LOCALES.munro.txt = previousLocalName;
  const titleLines = captured.text.filter(line => line.x === 20 && line.size === 22);
  assert(titleLines.length > 1, "Long local names wrap instead of overlapping the period");
  assert.equal(titleLines.map(line => line.value).join(" "), longLocalName);
  assert(titleLines.every(line => line.width <= 95.3), "Local title stays inside its own column");
  const headerMetadata = captured.text.filter(line => line.align === "right" && line.y < captured.lines[0].y1);
  assert(headerMetadata.every(line => line.width <= 74), "Period and date stay in their own column");
  assert(captured.lines[0].y1 > Math.max(...titleLines.map(line => line.y), ...headerMetadata.map(line => line.y)), "Header separator clears both columns");
  console.log("PASS: long local names and weekly periods fit separate PDF header columns");
  for (const payment of ["efectivo", "transferencia"]) {
    const privateSample = { ...sample, pago: payment, alias: "PRIVATE_ALIAS_739", obs: "" };
    const rendered = await ctx.crearPdf(privateSample, privateSample.nombre).text();
    assert(!rendered.includes("PRIVATE_ALIAS_739"), "Shared PDF must not include payment alias");
    assert(!rendered.includes("Forma de pago"), "Shared PDF must not include payment method");
    assert(!rendered.includes("RECIBO DE PAGO EN EFECTIVO"), "Shared PDF must not reveal cash payment");
    assert(!ctx.textoDetalle(privateSample, privateSample.nombre).includes("PRIVATE_ALIAS_739"));
  }
  assert(ctx.esTurno({ puesto: "staff", porTurno: true }), "Staff can be paid by shifts");
  assert.equal(ctx.estadoTxt({ pago: "efectivo" }, "enviada"), "Enviado");
  const dynamic = {};
  scope.window.REPORT_LOCALS = [
    { id: "centro", name: "Centro", cycle: "semanal" },
  ];
  const register = load("features/reports/payroll.js").registerPayroll;
  register(scope, dynamic)();
  assert.equal(
    dynamic.hojaVacia("Colaborador", "centro", "staff").local,
    "centro",
  );
  assert.equal(dynamic.cicloDe({ local: "centro" }), "semanal");
  assert.equal(dynamic.LOCALES.centro.txt, "Centro");
  const { readReportCollection } = load("utils/read-report-collection.ts");
  const records = Array.from({ length: 2750 }, (_, i) => ({
    path: "hojas/persona/historial/" + i,
    data: {},
  }));
  const pages = [];
  const fakeClient = {
    from() {
      let exact = false;
      const query = {
        select(_columns, options) {
          exact = !!options.count;
          return query;
        },
        eq() {
          return query;
        },
        order() {
          return query;
        },
        async range(start, end) {
          pages.push(start);
          return {
            data: records.slice(start, Math.min(end + 1, start + 650)),
            count: exact ? records.length : null,
            error: null,
          };
        },
      };
      return query;
    },
  };
  assert.equal(
    (await readReportCollection(fakeClient, "hojas/persona/historial")).length,
    2750,
  );
  assert.equal(
    pages.length,
    5,
    "Pagination respects the actual server page size",
  );
  console.log(
    "PASS: payroll, absence deductions, AR amounts, dates, PDF generation and dynamic local folders.",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
