const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const Module = require("node:module");
const path = require("node:path");

const filename = path.resolve("utils/assignment-selection.ts");
const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = module.paths;
mod._compile(output, filename);
const { assignmentSelection } = mod.exports;

const companies = [
  { id: "alessandro", organization_id: "owner-a", name: "Alessandro" },
  { id: "other", organization_id: "owner-b", name: "Otra empresa" },
];
const locals = [
  { id: "munro", name: "Munro", company_id: "alessandro", organization_id: "owner-a" },
  { id: "torcuato", name: "Torcuato", company_id: "alessandro", organization_id: "owner-a" },
  { id: "shop", name: "Tienda", company_id: "other", organization_id: "owner-b" },
];
const pending = { role: null, status: "pending", organization_id: null, account_kind: "collaborator" };

assert.equal(assignmentSelection(pending, companies, locals, "", "", false).availableCompanies.length, 0,
  "No company selection without administrator approval");
const admin = assignmentSelection(pending, companies, locals, "alessandro", "torcuato", true);
assert.equal(admin.availableCompanies.length, 2, "The administrator can choose an authorized existing owner company");
assert.equal(admin.company.id, "alessandro");
assert.equal(admin.local.id, "torcuato");
assert.deepEqual(admin.availableLocals.map(x => x.id), ["munro", "torcuato"],
  "Only the selected company's locals are listed");
assert.equal(assignmentSelection(pending, companies, locals, "other", "", true).availableLocals.length, 1);
const assigned = { ...pending, organization_id: "owner-a" };
const restricted = assignmentSelection(assigned, companies, locals, "other", "", true);
assert.deepEqual(restricted.availableCompanies.map(x => x.id), ["alessandro"],
  "An already linked user cannot be moved to an unrelated organization");
assert.equal(restricted.company.id, "alessandro");
assert.equal(assignmentSelection({ ...pending, account_kind: "owner" }, companies, locals, "", "", true).availableCompanies.length, 0,
  "Owner registrations are not silently converted into collaborators");
assert.equal(assignmentSelection({ ...pending, role: "employee", status: "approved" }, companies, locals, "", "", true).availableCompanies.length, 0,
  "The exceptional flow is only for unassigned pending accounts");

const modal = fs.readFileSync(path.resolve("components/users/AssignmentModal.tsx"), "utf8");
assert(modal.includes("await accessApi.invite(selectedCompany.organization_id, target.email)"),
  "Unlinked accounts must be explicitly invited into the selected organization before assignment");
assert(modal.includes("await accessApi.assign(") && modal.includes("await accessApi.assignManager("),
  "Existing server-enforced scoped assignment RPCs remain in use");

const formatSource = fs.readFileSync(path.resolve("utils/owner-local-summary.ts"), "utf8");
const ownerFilename = path.resolve("utils/owner-local-summary.ts");
const ownerCompiled = ts.transpileModule(formatSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const ownerModule = new Module(ownerFilename, module);
ownerModule.filename = ownerFilename;
ownerModule.paths = module.paths;
ownerModule._compile(ownerCompiled, ownerFilename);
const { formatOwnerLocalSummary } = ownerModule.exports;
const owner = { role: "owner", organization_id: "owner-a" };
const otherOwner = { role: "owner", organization_id: "owner-b" };

assert.equal(formatOwnerLocalSummary(owner, locals, companies), "Munro y Torcuato",
  "Alessandro's owner sees both branches, not Sin asignar");
assert.equal(formatOwnerLocalSummary(otherOwner, locals, companies), "Tienda",
  "Another owner sees only branches in their organization");
assert.equal(formatOwnerLocalSummary({ role: "owner", organization_id: null }, locals, companies),
  "Sin locales visibles", "Never infer ownership without verified organization membership");
assert.equal(formatOwnerLocalSummary({ role: "employee", organization_id: "owner-a" }, locals, companies),
  "Sin locales visibles", "Employee is never presented as an owner");
assert.equal(formatOwnerLocalSummary(owner, [], companies), "Sin locales creados",
  "An owner without locals is not described as unassigned");
assert.equal(formatOwnerLocalSummary(owner, [...locals,
    {id:"market",name:"Mercado",company_id:"alessandro",organization_id:"owner-a"},
    {id:"office",name:"Oficina",company_id:"alessandro",organization_id:"owner-a"},
    {id:"warehouse",name:"Depósito",company_id:"alessandro",organization_id:"owner-a"}], companies),
  "Depósito, Mercado, Munro, Oficina y Torcuato",
  "All future branches remain visible with correct Spanish punctuation");
const companiesWithDuplicate = [...companies, {id:"another-a",name:"Otra empresa",organization_id:"owner-a"}];
const localsWithDuplicate = [...locals, {id:"second-munro",name:"Munro",company_id:"another-a",organization_id:"owner-a"}];
assert.equal(formatOwnerLocalSummary(owner, localsWithDuplicate, companiesWithDuplicate),
  "Munro (Alessandro), Munro (Otra empresa) y Torcuato",
  "Same-name branches in two companies are distinguishable");
assert.equal(formatOwnerLocalSummary(owner, [
    {id:"foreign",name:"Confidencial",company_id:"alessandro",organization_id:"owner-b"},
    ...locals], companies).includes("Confidencial"), false,
  "Even mismatched company IDs cannot leak another organization's branch names");
const usersTable = fs.readFileSync(path.resolve("components/users/UsersTable.tsx"), "utf8");
assert(usersTable.includes('if (item.role === "owner")') &&
       usersTable.includes("formatOwnerLocalSummary(item, data.locals, data.companies)") &&
       usersTable.includes("<td>{localLabel(item)}</td>"),
  "Owner local column uses tenant-scoped local names instead of a single local_id");
assert(usersTable.includes('item.role === "manager"') &&
       usersTable.includes('"Espacios autorizados"'),
  "Existing manager and global-admin display behavior remains unchanged");

console.log("PASS: global administrator can choose an existing owner company for unlinked pending collaborators without crossing existing tenant boundaries.");
