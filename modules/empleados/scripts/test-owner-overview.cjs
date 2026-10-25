const assert = require("node:assert/strict");


function verifyStableWorkspace(selectVisibleCompany) {
  const fs = require("node:fs");
  const ts = require("typescript");
  const React = require("react");
  const primary = { id: "company-a", organization_id: "test-org", name: "A" };
  const secondary = { id: "company-b", organization_id: "test-org", name: "B" };
  const spaces = { companies: [primary, secondary], organizations: [], loading: false };
  const local = { id: "local-a", company_id: primary.id, organization_id: "test-org" };
  const states = [[local], [], [], "", "", false, false, [], []];
  const memos = [];
  let stateIndex = 0, memoIndex = 0;
  const hooks = {
    useState(initial) { const index = stateIndex++; return [index in states ? states[index] : initial, value => { states[index] = typeof value === "function" ? value(states[index]) : value; }]; },
    useMemo(fn, deps) { const index = memoIndex++; const prev = memos[index]; if (!prev || deps.some((dep,i) => !Object.is(dep,prev.deps[i]))) memos[index] = { deps, value: fn() }; return memos[index].value; },
    useRef: () => ({ current: null }),
    useEffect() {},
  };
  const Workspace = () => null;
  const source = ts.transpileModule(fs.readFileSync("components/owner/OwnerHome.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const output = {};
  new Function("exports", "require", source)(output, name => {
    if (name === "react") return hooks;
    if (name === "next/link") return { default: "a" };
    if (name === "./OwnerSidebar") return { OwnerSidebar: () => null };
    if (name.endsWith(".css")) return {};
    if (name === "@/hooks/use-organization-data") return { useOrganizationData: () => spaces };
    if (name === "@/features/access/api") return { accessApi: {} };
    if (name === "@/components/reports/ReportWorkspace") return { ReportWorkspace: Workspace };
    if (name === "@/components/invitations/SharedOwnerCode") return { SharedOwnerCode: () => null };
    if (name === "@/lib/supabase/browser") return {};
    if (name === "@/utils/owner-company") return { selectVisibleCompany };
    return require(name);
  });
  function render() {
    stateIndex = memoIndex = 0;
    const tree = output.OwnerHome({ user: { role: "owner", organization_id: "test-org" } });
    let locals;
    function visit(node) {
      if (!React.isValidElement(node)) return;
      if (node.type === Workspace) locals = node.props.locals;
      React.Children.forEach(node.props.children,visit);
    }
    visit(tree);
    return locals;
  }
  const first = render();
  assert.equal(first.length,1);
  states[7] = [{ id: local.id, total: 1, sent: 0, activity: [] }];
  states[6] = true;
  assert.strictEqual(render(),first,"Overview events and menu changes must not remount the report engine");
  const added = { id: "local-b", company_id: primary.id, organization_id: "test-org" };
  states[0] = [local,added];
  const changed = render();
  assert.notStrictEqual(changed,first,"A real local change must refresh the workspace");
  assert.equal(changed.length,2);
  states[3] = secondary.id;
  assert.equal(render(),undefined,"Switching company must not retain another company's workspace");
  console.log("PASS: stable report workspace across overview updates; actual local/company changes still apply");
}

async function main() {
  const { resolveOverviewSheetLocal } = await import("../utils/overview-sheet-local.js");
  const { selectVisibleCompany } = await import("../utils/owner-company.js");
  const localIds = ["munro", "dt"];
  const sheet = (path, local) => ({ path, data: local === undefined ? {} : { local } });

  assert.equal(resolveOverviewSheetLocal(sheet("hojas/enc1"), localIds), "dt");
  assert.equal(resolveOverviewSheetLocal(sheet("hojas/staff6"), localIds), "dt");
  assert.equal(resolveOverviewSheetLocal(sheet("hojas/munro-enc1", "munro"), localIds), "munro");
  assert.equal(resolveOverviewSheetLocal(sheet("hojas/munro-staff5"), localIds), "munro");
  assert.equal(resolveOverviewSheetLocal(sheet("hojas/enc1"), ["munro"]), null);
  assert.equal(resolveOverviewSheetLocal(sheet("hojas/enc1", "different"), localIds), null);
  assert.equal(resolveOverviewSheetLocal(sheet("hojas/mystery"), localIds), null);

  const companies = [
    { id: "home", organization_id: "owner-home" },
    { id: "shared", organization_id: "original" },
  ];
  assert.equal(selectVisibleCompany(companies, "", "owner-home", true)?.id, "shared");
  assert.equal(selectVisibleCompany(companies, "home", "owner-home", true)?.id, "home");
  assert.equal(selectVisibleCompany(companies, "", "owner-home", false)?.id, "home");
  assert.equal(selectVisibleCompany([], "", "owner-home", true), undefined);
  console.log("PASS: legacy sheets and authorized company selection");
  verifyStableWorkspace(selectVisibleCompany);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
