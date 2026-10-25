const fs = require("node:fs");
const ts = require("typescript");
const assert = require("node:assert/strict");

async function main() {
  const states = [], callbacks = [];
  const api = {
    access: async () => ({ status: "active" }),
    image: async () => ({ image: "data:image/png;base64,AAAA", server_now: new Date().toISOString(), expires_at: new Date(Date.now() + 60000).toISOString() }),
  };
  const hooks = {
    useState(initial) { const index = states.length; states.push(initial); return [initial, value => { states[index] = typeof value === "function" ? value(states[index]) : value; }]; },
    useRef: current => ({ current }),
    useCallback(fn) { callbacks.push(fn); return fn; },
    useEffect() {},
  };
  const code = ts.transpileModule(fs.readFileSync("components/reports/EmployeeReport.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const result = {};
  const timers = [];
  new Function("exports", "require", "document", "setTimeout", "clearTimeout", code)(result, name => {
    if (name === "react") return hooks;
    if (name === "@/features/access/api") return { accessApi: api };
    if (name === "next/image") return { default: "img" };
    return require(name);
  }, { hidden: false }, fn => { timers.push(fn); return timers.length; }, () => {});
  result.EmployeeReport();
  const refresh = callbacks[0];
  await refresh();
  assert.equal(states[1], "data:image/png;base64,AAAA");
  api.access = async () => { throw new Error("Sin conexión"); };
  await refresh();
  assert.equal(states[1], null, "An access check failure hides the image");
  assert.equal(states[0], null, "Stale access state is cleared");
  assert.equal(states[2], "Sin conexión");
  api.access = async () => ({ status: "active" });
  await refresh();
  assert.equal(states[2], "", "Successful retry clears the old error");
  assert.equal(states[1], "data:image/png;base64,AAAA");
  timers.at(-1)();
  assert.equal(states[1], null);
  assert.equal(states[0].status, "expired");
  api.access = async () => ({ status: "unavailable" });
  await refresh();
  assert.equal(states[1], null);
  console.log("PASS: report view hides images on failed checks/expiry and clears errors after reconnection.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
