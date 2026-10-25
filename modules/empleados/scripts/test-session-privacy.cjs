const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function harness() {
  const slots = [], effects = [], removed = [], navigation = [];
  let cursor = 0, listener;
  const account = { user_id: "synthetic-a", role: "owner" };
  const api = { me: async () => account };
  const auth = {
    getUser: async () => ({ data: { user: { id: account.user_id } } }),
    signOut: async () => ({ error: null }),
    onAuthStateChange(fn) { listener = fn; return { data: { subscription: { unsubscribe() {} } } }; },
  };
  const hooks = {
    createContext: () => ({ Provider: "Provider" }),
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }];
    },
    useCallback: fn => fn,
    useEffect(fn) { effects.push(fn); },
  };
  const code = ts.transpileModule(fs.readFileSync("components/auth/AuthProvider.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function("exports", "require", "sessionStorage", "window", code)(exports, name => {
    if (name === "react") return hooks;
    if (name === "react/jsx-runtime") return { jsx: (type, props, key) => ({ type, props, key }) };
    if (name === "next/navigation") return { useRouter: () => ({ replace: path => navigation.push(path), refresh() {} }) };
    if (name === "@/lib/supabase/browser") return { createClient: () => ({ auth }) };
    if (name === "@/features/access/api") return { accessApi: api };
    throw new Error(`Unexpected dependency ${name}`);
  }, { removeItem: key => removed.push(key) }, { setInterval() {}, addEventListener() {}, clearInterval() {}, removeEventListener() {} });
  const render = () => { cursor = 0; return exports.AuthProvider({ children: "private subtree" }); };
  const state = () => render().props.value;
  render();
  return { auth, api, account, removed, navigation, render, state, start: () => effects[0](), event: (...args) => listener(...args) };
}

test("logout invalidates an in-flight membership response and removes only invitation state", async () => {
  const h = harness();
  const pending = deferred();
  h.api.me = () => pending.promise;
  const refresh = h.state().refresh();
  await Promise.resolve();
  await h.state().signOut();
  pending.resolve(h.account);
  await refresh;
  assert.equal(h.state().user, null);
  assert.equal(h.state().loading, false);
  assert.deepEqual(h.removed.sort(), ["recibonet_invitation", "recibonet_return_to"]);
  assert.deepEqual(h.navigation, ["/"]);
});

test("polling cannot repopulate private state while logout is pending", async () => {
  const h = harness(), pending = deferred();
  await h.state().refresh();
  h.auth.signOut = () => pending.promise;
  const logout = h.state().signOut();
  await h.state().refresh();
  assert.equal(h.state().user, null);
  pending.resolve({ error: null });
  await logout;
  assert.equal(h.state().user, null);
});

test("account switch clears old identity immediately and remounts private descendants", async () => {
  const h = harness();
  h.start();
  await new Promise(resolve => setImmediate(resolve));
  await h.state().refresh();
  assert.equal(h.render().key, "synthetic-a");
  const pending = deferred();
  h.api.me = () => pending.promise;
  h.event("SIGNED_IN", { user: { id: "synthetic-b" } });
  assert.equal(h.state().user, null);
  assert.equal(h.render().key, "signed-out");
  await Promise.resolve();
  pending.resolve({ user_id: "synthetic-b", role: "employee" });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.render().key, "synthetic-b");
});

test("a rejected logout reports failure without navigating or throwing", async () => {
  const h = harness();
  h.auth.signOut = async () => { throw new Error("offline"); };
  await h.state().signOut();
  assert.match(h.state().error, /No se pudo cerrar/);
  assert.equal(h.state().user, null);
  assert.equal(h.state().loading, false);
  assert.deepEqual(h.navigation, []);
});

test("Supabase emits essential cookies with Secure in production and SameSite=Lax", async () => {
  const { createServerClient } = require("@supabase/ssr");
  const code = ts.transpileModule(fs.readFileSync("lib/supabase/cookie-options.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  for (const environment of ["production", "development"]) {
    const options = {};
    new Function("exports", "process", code)(options, { env: { NODE_ENV: environment } });
    const cookies = [];
    const client = createServerClient("https://synthetic.supabase.co", "public-test-key", {
      cookieOptions: options.authCookieOptions,
      cookies: { getAll: () => [], setAll: items => cookies.push(...items) },
      global: { fetch: async () => new Response(JSON.stringify({
        access_token: "synthetic-access", refresh_token: "synthetic-refresh", token_type: "bearer",
        expires_in: 3600, user: { id: "synthetic-a" },
      }), { status: 200, headers: { "Content-Type": "application/json" } }) },
    });
    const { error } = await client.auth.signInWithPassword({ email: "test@example.invalid", password: "synthetic-only" });
    assert.equal(error, null);
    assert.ok(cookies.some(cookie => cookie.value), "Authentication cookies are preserved");
    for (const cookie of cookies) {
      assert.equal(cookie.options.secure, environment === "production");
      assert.equal(cookie.options.sameSite, "lax");
      assert.equal(cookie.options.httpOnly, false, "The browser SDK must be able to refresh tokens");
    }
  }
});
