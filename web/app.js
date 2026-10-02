import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm";

const SUPABASE_URL = "https://qgyzdoltjlryjthxxscw.supabase.co";
const SUPABASE_KEY = "sb_publishable_mCjtfE-W75s1yyUdw2NY2g_z6ic5DIc";
const EMAIL_CONFIRM_REDIRECT = "https://markyyy-lolz.github.io/MotoPOS-Web/?email-confirmed=1";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

const app = document.querySelector("#app");
const toastRoot = document.querySelector("#toast-root");
const modalRoot = document.querySelector("#modal-root");

const state = {
  session: null,
  user: null,
  membership: null,
  shop: null,
  isSystemAdmin: false,
  authMode: "signin",
  busy: false
};

const money = value => new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 2
}).format(Number(value || 0));

const number = value => new Intl.NumberFormat("en-PH").format(Number(value || 0));
const esc = value => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function niceDate(value, withTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return esc(value);
  return date.toLocaleString("en-PH", withTime ? {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit"
  } : {
    month: "short", day: "numeric", year: "numeric"
  });
}

function trialRemaining(expiresAt) {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return { days: 0, label: "Trial expired" };
  const days = Math.ceil(ms / 86400000);
  return { days, label: `${days} day${days === 1 ? "" : "s"} remaining` };
}

function statusTone(status) {
  const s = String(status || "").toLowerCase();
  if (["active","completed","paid","released","ready"].includes(s)) return "green";
  if (["trial","waiting","inspection","repairing","testing","open","pending"].includes(s)) return "yellow";
  if (["suspended","expired","cancelled","voided","refunded"].includes(s)) return "red";
  if (["manager","admin","owner","pro","business"].includes(s)) return "blue";
  return "gray";
}

function pill(value) {
  return `<span class="pill ${statusTone(value)}">${esc(value || "—")}</span>`;
}

function toast(message, type = "") {
  const node = document.createElement("div");
  node.className = `toast ${type}`;
  node.textContent = message;
  toastRoot.appendChild(node);
  setTimeout(() => node.remove(), 4300);
}

function showModal(html) {
  modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal">${html}</div></div>`;
  modalRoot.querySelector(".modal-backdrop")?.addEventListener("click", e => {
    if (e.target.classList.contains("modal-backdrop")) closeModal();
  });
}

function closeModal() {
  modalRoot.innerHTML = "";
}

function setHash(path) {
  const next = "#/" + path.replace(/^\/+/, "");
  if (location.hash === next) route();
  else location.hash = next;
}

function currentPath() {
  return location.hash.replace(/^#\/?/, "") || "";
}

function rolePages(role) {
  const r = String(role || "").toLowerCase();
  const full = ["overview","sales","inventory","customers","staff","service","suppliers","reports","license","devices","settings"];
  if (["owner","admin","manager"].includes(r)) return full;
  if (r === "cashier") return ["overview","sales","customers","service","license"];
  if (r === "inventory") return ["overview","inventory","suppliers","license"];
  if (r === "mechanic") return ["overview","customers","service","license"];
  return ["overview","license"];
}

function navLabel(page) {
  return ({
    overview:"Overview", sales:"Sales", inventory:"Inventory", customers:"Customers",
    staff:"Staff", service:"Service Jobs", suppliers:"Suppliers", reports:"Reports",
    license:"License", devices:"Devices", settings:"Settings"
  })[page] || page;
}

function friendlyError(error) {
  const raw = error?.message || String(error || "Something went wrong.");
  const lower = raw.toLowerCase();
  if (lower.includes("invalid login credentials")) return "Incorrect email or password.";
  if (lower.includes("email not confirmed")) return "Verify your email first, then sign in.";
  if (lower.includes("over_email_send_rate_limit")) return "Please wait about a minute before requesting another verification email.";
  if (lower.includes("row-level security") || lower.includes("permission denied")) return "Your account does not have permission for that action.";
  if (lower.includes("network") || lower.includes("fetch")) return "Unable to reach MotoPOS Cloud. Check your internet connection.";
  return raw.split("\n")[0].slice(0, 220);
}

async function loadAccessContext() {
  state.user = state.session?.user || null;
  state.membership = null;
  state.shop = null;
  state.isSystemAdmin = false;

  if (!state.user) return;

  const [memberRes, adminRes] = await Promise.all([
    supabase
      .from("shop_members")
      .select("id,shop_id,role,is_active,joined_at,shop:shops(id,name,phone,email,address,currency_code,timezone)")
      .eq("user_id", state.user.id)
      .eq("is_active", true)
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("system_admins")
      .select("user_id")
      .eq("user_id", state.user.id)
      .maybeSingle()
  ]);

  if (memberRes.error) console.warn("Membership load:", memberRes.error.message);
  state.membership = memberRes.data || null;
  state.shop = memberRes.data?.shop || null;
  state.isSystemAdmin = Boolean(adminRes.data);
}

function renderEmailVerified() {
  const hashParams = new URLSearchParams(location.hash.replace(/^#/, ""));
  const errorDescription = hashParams.get("error_description");
  const failed = Boolean(hashParams.get("error") || hashParams.get("error_code"));

  app.innerHTML = `
    <div class="setup">
      <div class="setup-card">
        <div class="brand"><span class="brand-logo">M</span><span>MotoPOS</span></div>
        <div style="height:14px"></div>
        <span class="eyebrow">${failed ? "Verification problem" : "Email verified"}</span>
        <h1>${failed ? "We couldn't verify that link" : "Email confirmed successfully"}</h1>
        <p>${
          failed
            ? esc(errorDescription || "The confirmation link may have expired or already been used.")
            : "Your MotoPOS email is verified. You can return to the Android app and sign in, or continue to MotoPOS Cloud here."
        }</p>
        <div class="form">
          ${failed
            ? '<a class="btn btn-primary" href="#/login?mode=signup">Create / resend from sign up</a>'
            : '<a class="btn btn-primary" href="#/login">Continue to MotoPOS Cloud</a>'}
          <a class="btn btn-secondary" href="#/">Back to MotoPOS website</a>
        </div>
      </div>
    </div>`;
}

function renderLanding() {
  app.innerHTML = `
    <div class="public-shell">
      <nav class="public-nav">
        <a href="#/" class="brand"><span class="brand-logo">M</span><span>MotoPOS</span></a>
        <div class="nav-actions">
          <a class="btn btn-secondary" href="#/login">Sign in</a>
          <a class="btn btn-primary" href="#/login?mode=signup">Start free setup</a>
        </div>
      </nav>

      <main>
        <section class="hero">
          <div>
            <span class="eyebrow">Motorcycle shop operating system</span>
            <h1>Parts, workshop and sales.<br><span class="gradient-text">One MotoPOS Cloud.</span></h1>
            <p>Manage motorcycle parts, customers, service jobs, staff access, receipts, devices and licensing from one cloud-connected system built for real shop operations.</p>
            <div class="hero-actions">
              <a class="btn btn-primary" href="#/login?mode=signup">Start 7-day Pro trial</a>
              <a class="btn btn-secondary" href="#/login">Open dashboard</a>
            </div>
            <div class="hero-trust">
              <span><b>Supabase</b> secured data</span>
              <span><b>Android</b> POS terminals</span>
              <span><b>7-day</b> Pro trial included</span>
              <span><b>GitHub</b> automated releases</span>
            </div>
          </div>

          <div class="mock-window" aria-hidden="true">
            <div class="mock-top"><i class="dot"></i><i class="dot"></i><i class="dot"></i></div>
            <div class="mock-body">
              <div class="mock-grid">
                <div class="mock-card"><span>Sales today</span><strong>₱28,450</strong></div>
                <div class="mock-card"><span>Active jobs</span><strong>8</strong></div>
                <div class="mock-card wide">
                  <span>Weekly performance</span>
                  <div class="bars">
                    <i style="height:32%"></i><i style="height:52%"></i><i style="height:43%"></i>
                    <i style="height:76%"></i><i style="height:61%"></i><i style="height:88%"></i><i style="height:69%"></i>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="section">
          <div class="section-head">
            <div><span class="kicker">Built for operations</span><h2>Everything your shop needs.</h2></div>
            <p>Android is your cashier terminal. MotoPOS Cloud is the control center for owners and managers.</p>
          </div>
          <div class="feature-grid">
            ${[
              ["POS","Fast product lookup, checkout and receipt workflows."],
              ["Inventory","Stock levels, reorder alerts, cost and selling prices."],
              ["Workshop","Motorcycle profiles, service history and job statuses."],
              ["Staff","Role-aware access for owners, managers and cashiers."],
              ["Reports","Sales, expenses, transactions and operating summaries."],
              ["Licensing","Plans, device limits, staff limits and remote suspension."]
            ].map((f,i)=>`<article class="feature-card"><div class="feature-icon">${String(i+1).padStart(2,"0")}</div><h3>${f[0]}</h3><p>${f[1]}</p></article>`).join("")}
          </div>
        </section>

        <section class="section">
          <div class="section-head">
            <div><span class="kicker">MotoPOS plans</span><h2>Start small. Scale when needed.</h2></div>
            <p>License plans are controlled from the secure MotoPOS developer console.</p>
          </div>
          <div id="pricing-grid" class="pricing-grid">
            <div class="loading-block"></div><div class="loading-block"></div><div class="loading-block"></div>
          </div>
        </section>
      </main>

      <footer class="footer"><span>© 2026 MotoPOS Cloud</span><span>Motorcycle parts • Service • POS • Licensing</span></footer>
    </div>`;

  loadPublicPlans();
}

async function loadPublicPlans() {
  const root = document.querySelector("#pricing-grid");
  if (!root) return;
  const { data, error } = await supabase
    .from("license_plans")
    .select("code,name,description,default_max_devices,default_max_staff,default_offline_grace_days")
    .eq("is_active", true)
    .order("default_max_devices");
  if (error || !data?.length) {
    root.innerHTML = `<div class="empty" style="grid-column:1/-1"><strong>MotoPOS plans</strong>Plan details are available after sign in.</div>`;
    return;
  }
  root.innerHTML = data.map(plan => `
    <article class="price-card ${plan.code === "pro" ? "featured" : ""}">
      <span class="kicker">${esc(plan.code)}</span>
      <h3>${esc(plan.name)}</h3>
      <p>${esc(plan.description || "")}</p>
      <div class="price-meta"><strong>${number(plan.default_max_devices)}</strong> device(s) · ${number(plan.default_max_staff)} staff</div>
      <a class="btn ${plan.code === "pro" ? "btn-primary" : "btn-secondary"}" href="#/login?mode=signup">Get started</a>
    </article>
  `).join("");
}

function renderAuth() {
  const signupFromUrl = location.hash.includes("mode=signup");
  if (signupFromUrl) state.authMode = "signup";
  const signup = state.authMode === "signup";

  app.innerHTML = `
    <div class="auth-wrap">
      <section class="auth-art">
        <a href="#/" class="brand"><span class="brand-logo">M</span><span>MotoPOS Cloud</span></a>
        <div>
          <span class="eyebrow">Secure business access</span>
          <h1>Run the shop.<br><span class="gradient-text">Not the paperwork.</span></h1>
          <p>Sign in as an owner, manager or staff member. Permissions are enforced in the database—not just hidden in the interface.</p>
        </div>
        <div class="help">Protected by Supabase Auth + Row Level Security.</div>
      </section>
      <section class="auth-side">
        <div class="auth-card">
          <h2>${signup ? "Create owner account" : "Welcome back"}</h2>
          <p>${signup ? "Create your MotoPOS identity, then set up your first shop." : "Sign in to your MotoPOS workspace."}</p>

          <div class="segment">
            <button data-mode="signin" class="${!signup ? "active" : ""}">Sign in</button>
            <button data-mode="signup" class="${signup ? "active" : ""}">Create account</button>
          </div>

          <form id="auth-form" class="form">
            ${signup ? `<div class="field"><label>Display name</label><input class="input" name="display_name" autocomplete="name" required placeholder="Shop owner name"></div>` : ""}
            <div class="field"><label>Email address</label><input class="input" type="email" name="email" autocomplete="email" required placeholder="you@example.com"></div>
            <div class="field"><label>Password</label><input class="input" type="password" name="password" autocomplete="${signup ? "new-password" : "current-password"}" minlength="6" required placeholder="Minimum 6 characters"></div>
            <button class="btn btn-primary" type="submit">${signup ? "Create MotoPOS account" : "Sign in"}</button>
            <a href="#/" class="btn btn-secondary">Back to website</a>
            ${signup ? '<div class="help">If email verification is enabled, verify your email before signing in.</div>' : ""}
          </form>
        </div>
      </section>
    </div>`;

  document.querySelectorAll("[data-mode]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.authMode = btn.dataset.mode;
      location.hash = state.authMode === "signup" ? "#/login?mode=signup" : "#/login";
      renderAuth();
    });
  });
  document.querySelector("#auth-form")?.addEventListener("submit", handleAuth);
}

async function handleAuth(event) {
  event.preventDefault();
  if (state.busy) return;
  state.busy = true;
  const form = new FormData(event.currentTarget);
  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "");
  const button = event.currentTarget.querySelector('button[type="submit"]');
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Please wait…";

  try {
    if (state.authMode === "signup") {
      const displayName = String(form.get("display_name") || "").trim();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName },
          emailRedirectTo: EMAIL_CONFIRM_REDIRECT
        }
      });
      if (error) throw error;
      if (data.session) {
        state.session = data.session;
        await loadAccessContext();
        toast("Account created.", "success");
        setHash("dashboard/overview");
      } else {
        toast("Verification email sent. Verify your account, then sign in.", "success");
        state.authMode = "signin";
        location.hash = "#/login";
        renderAuth();
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      state.session = data.session;
      await loadAccessContext();
      toast("Signed in.", "success");
      setHash(state.isSystemAdmin && !state.shop ? "admin" : "dashboard/overview");
    }
  } catch (error) {
    toast(friendlyError(error), "error");
  } finally {
    state.busy = false;
    if (button?.isConnected) {
      button.disabled = false;
      button.textContent = original;
    }
  }
}

function renderSetup() {
  app.innerHTML = `
    <div class="setup">
      <div class="setup-card">
        <div class="brand"><span class="brand-logo">M</span><span>MotoPOS</span></div>
        <h1>Finish your shop setup</h1>
        <p>Your owner account is authenticated. Create the first workspace that will belong to this account.</p>
        <div class="account-box"><strong>Signed-in owner</strong><span>${esc(state.user?.email || "Authenticated account")}</span></div>
        <form id="setup-form" class="form">
          <div class="field"><label>Shop name</label><input class="input" name="name" required placeholder="Example: 3A's Motorshop"></div>
          <div class="field"><label>Phone</label><input class="input" name="phone" placeholder="Optional"></div>
          <div class="field"><label>Address</label><textarea class="input" name="address" placeholder="Optional"></textarea></div>
          <button class="btn btn-primary" type="submit">Create MotoPOS workspace</button>
          <button class="btn btn-secondary" type="button" id="switch-account">Use another account</button>
        </form>
      </div>
    </div>`;

  document.querySelector("#setup-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = "Creating workspace…";
    try {
      const { error } = await supabase.rpc("bootstrap_shop", {
        p_name: String(form.get("name") || "").trim(),
        p_phone: String(form.get("phone") || "").trim() || null,
        p_address: String(form.get("address") || "").trim() || null
      });
      if (error) throw error;
      await loadAccessContext();
      toast("Workspace created.", "success");
      setHash("dashboard/overview");
    } catch (error) {
      toast(friendlyError(error), "error");
      button.disabled = false;
      button.textContent = "Create MotoPOS workspace";
    }
  });

  document.querySelector("#switch-account")?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    state.session = state.user = state.membership = state.shop = null;
    state.isSystemAdmin = false;
    setHash("login");
  });
}

function renderShell(page) {
  const role = state.membership?.role || "staff";
  const pages = rolePages(role);
  if (!pages.includes(page)) page = "overview";

  const adminLink = state.isSystemAdmin
    ? `<a class="nav-item ${currentPath() === "admin" ? "active" : ""}" href="#/admin"><span>Developer Control</span><span class="nav-badge">ADMIN</span></a>`
    : "";

  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand"><span class="brand-logo">M</span><span>MotoPOS</span></div>
        <div class="shop-chip"><strong>${esc(state.shop?.name || "MotoPOS")}</strong><span>${esc(role)}</span></div>
        <nav class="nav-list">
          ${pages.map(p => `<a class="nav-item ${p === page ? "active" : ""}" href="#/dashboard/${p}"><span>${navLabel(p)}</span></a>`).join("")}
          ${adminLink}
        </nav>
        <div class="sidebar-bottom"><button id="sign-out" class="btn btn-secondary" style="width:100%">Sign out</button></div>
      </aside>

      <div class="main">
        <header class="topbar">
          <div class="topbar-title"><strong>${esc(state.shop?.name || "MotoPOS Cloud")}</strong><span>Cloud operations dashboard</span></div>
          <div class="user-pill"><div class="avatar">${esc((state.user?.email || "M").slice(0,1).toUpperCase())}</div><div class="user-copy"><strong style="font-size:12px">${esc(state.user?.email || "")}</strong><div class="help">${esc(role)}</div></div></div>
        </header>
        <main id="page-content" class="content"><div class="loading-block"></div></main>
      </div>

      <nav class="mobile-nav">
        ${pages.slice(0,4).map(p => `<a class="${p === page ? "active" : ""}" href="#/dashboard/${p}">${navLabel(p)}</a>`).join("")}
        ${state.isSystemAdmin ? `<a href="#/admin">Admin</a>` : pages.length > 4 ? `<a href="#/dashboard/license">More</a>` : ""}
      </nav>
    </div>`;

  document.querySelector("#sign-out")?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    state.session = state.user = state.membership = state.shop = null;
    state.isSystemAdmin = false;
    setHash("");
  });

  loadDashboardPage(page);
}

async function loadDashboardPage(page) {
  const root = document.querySelector("#page-content");
  if (!root || !state.shop) return;
  try {
    switch (page) {
      case "overview": return await pageOverview(root);
      case "sales": return await pageSales(root);
      case "inventory": return await pageInventory(root);
      case "customers": return await pageCustomers(root);
      case "staff": return await pageStaff(root);
      case "service": return await pageService(root);
      case "suppliers": return await pageSuppliers(root);
      case "reports": return await pageReports(root);
      case "license": return await pageLicense(root);
      case "devices": return await pageDevices(root);
      case "settings": return await pageSettings(root);
      default: return await pageOverview(root);
    }
  } catch (error) {
    root.innerHTML = `<div class="empty"><strong>Unable to load this page</strong>${esc(friendlyError(error))}</div>`;
  }
}

function head(title, subtitle, action = "") {
  return `<div class="page-head"><div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>${action}</div>`;
}

async function pageOverview(root) {
  const shopId = state.shop.id;
  const canFinance = ["owner","admin","manager"].includes(state.membership.role);

  const queries = [
    supabase.from("sales").select("id,total_amount,status,created_at,sale_number").eq("shop_id", shopId).order("created_at",{ascending:false}).limit(100),
    supabase.from("products").select("id,name,sku,stock_quantity,reorder_level,selling_price").eq("shop_id",shopId).eq("is_active",true),
    supabase.from("job_orders").select("id,job_number,status,complaint,created_at").eq("shop_id",shopId).order("created_at",{ascending:false}).limit(30)
  ];
  if (canFinance) queries.push(supabase.from("expenses").select("id,amount,expense_date").eq("shop_id",shopId).order("expense_date",{ascending:false}).limit(100));

  const [salesRes, productRes, jobRes, expenseRes] = await Promise.all(queries);
  for (const r of [salesRes,productRes,jobRes,expenseRes].filter(Boolean)) if (r.error) throw r.error;

  const sales = salesRes.data || [];
  const products = productRes.data || [];
  const jobs = jobRes.data || [];
  const expenses = expenseRes?.data || [];

  const now = new Date();
  const sameDay = value => {
    const d = new Date(value);
    return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth() && d.getDate()===now.getDate();
  };
  const todaySales = sales.filter(s => s.status === "completed" && sameDay(s.created_at));
  const todayRevenue = todaySales.reduce((sum,s)=>sum+Number(s.total_amount||0),0);
  const todayExpense = expenses.filter(e=>sameDay(e.expense_date)).reduce((sum,e)=>sum+Number(e.amount||0),0);
  const lowStock = products.filter(p=>Number(p.stock_quantity)<=Number(p.reorder_level));
  const activeJobs = jobs.filter(j=>!["released","cancelled"].includes(j.status));

  root.innerHTML = `
    ${head("Overview","Live snapshot of your motorcycle shop")}
    <section class="metrics">
      <article class="metric"><div class="metric-label">Sales today</div><div class="metric-value">${money(todayRevenue)}</div><div class="metric-sub">${todaySales.length} completed transaction(s)</div></article>
      <article class="metric"><div class="metric-label">Active jobs</div><div class="metric-value">${number(activeJobs.length)}</div><div class="metric-sub">Workshop queue</div></article>
      <article class="metric"><div class="metric-label">Low stock</div><div class="metric-value">${number(lowStock.length)}</div><div class="metric-sub">At or below reorder level</div></article>
      <article class="metric"><div class="metric-label">${canFinance ? "Net today" : "Products"}</div><div class="metric-value">${canFinance ? money(todayRevenue-todayExpense) : number(products.length)}</div><div class="metric-sub">${canFinance ? `Expenses ${money(todayExpense)}` : "Active inventory items"}</div></article>
    </section>
    <section class="grid-2">
      <div class="card">
        <div class="card-title"><h3>Recent sales</h3><a href="#/dashboard/sales">View all</a></div>
        <div class="stat-list">
          ${sales.slice(0,6).map(s=>`<div class="stat-row"><span>${esc(s.sale_number || "Sale")} · ${niceDate(s.created_at,true)}</span><strong>${money(s.total_amount)}</strong></div>`).join("") || '<div class="empty"><strong>No sales yet</strong>Your completed transactions will appear here.</div>'}
        </div>
      </div>
      <div class="card">
        <div class="card-title"><h3>Workshop queue</h3><a href="#/dashboard/service">Open service</a></div>
        <div class="stat-list">
          ${activeJobs.slice(0,6).map(j=>`<div class="stat-row"><span>${esc(j.job_number || "Job")} · ${esc(j.complaint || "Service job")}</span><strong>${pill(j.status)}</strong></div>`).join("") || '<div class="empty"><strong>No active jobs</strong>New service jobs will appear here.</div>'}
        </div>
      </div>
    </section>`;
}

async function pageSales(root) {
  const { data, error } = await supabase.from("sales")
    .select("id,sale_number,total_amount,subtotal,discount_amount,tax_amount,status,created_at,completed_at")
    .eq("shop_id",state.shop.id).order("created_at",{ascending:false}).limit(150);
  if (error) throw error;
  root.innerHTML = `
    ${head("Sales","Recent POS transactions from all allowed terminals")}
    <div class="table-wrap"><table><thead><tr><th>Sale</th><th>Date</th><th>Status</th><th>Subtotal</th><th>Discount</th><th>Total</th></tr></thead><tbody>
      ${(data||[]).map(s=>`<tr><td><strong>${esc(s.sale_number)}</strong></td><td>${niceDate(s.created_at,true)}</td><td>${pill(s.status)}</td><td>${money(s.subtotal)}</td><td>${money(s.discount_amount)}</td><td><strong>${money(s.total_amount)}</strong></td></tr>`).join("") || '<tr><td colspan="6">No transactions yet.</td></tr>'}
    </tbody></table></div>`;
}

async function pageInventory(root) {
  const { data, error } = await supabase.from("products")
    .select("id,name,sku,brand,cost_price,selling_price,stock_quantity,reorder_level,unit,is_active")
    .eq("shop_id",state.shop.id).order("name");
  if (error) throw error;
  root.innerHTML = `
    ${head("Inventory","Parts, prices and stock levels")}
    <div class="table-wrap"><table><thead><tr><th>Product</th><th>SKU</th><th>Brand</th><th>Stock</th><th>Cost</th><th>Selling</th><th>Status</th></tr></thead><tbody>
      ${(data||[]).map(p=>`<tr><td><strong>${esc(p.name)}</strong></td><td>${esc(p.sku)}</td><td>${esc(p.brand||"—")}</td><td>${number(p.stock_quantity)} ${esc(p.unit||"pc")}</td><td>${money(p.cost_price)}</td><td><strong>${money(p.selling_price)}</strong></td><td>${Number(p.stock_quantity)<=Number(p.reorder_level)?pill("low stock"):pill(p.is_active?"active":"inactive")}</td></tr>`).join("") || '<tr><td colspan="7">No products yet.</td></tr>'}
    </tbody></table></div>`;
}

async function pageCustomers(root) {
  const { data, error } = await supabase.from("customers")
    .select("id,name,phone,email,address,created_at")
    .eq("shop_id",state.shop.id).order("name").limit(200);
  if (error) throw error;
  root.innerHTML = `
    ${head("Customers","Customer directory connected to motorcycle and service records")}
    <div class="table-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Address</th><th>Since</th></tr></thead><tbody>
      ${(data||[]).map(c=>`<tr><td><strong>${esc(c.name)}</strong></td><td>${esc(c.phone||"—")}</td><td>${esc(c.email||"—")}</td><td>${esc(c.address||"—")}</td><td>${niceDate(c.created_at)}</td></tr>`).join("") || '<tr><td colspan="5">No customers yet.</td></tr>'}
    </tbody></table></div>`;
}

async function pageStaff(root) {
  const canManage = ["owner","admin"].includes(state.membership.role);
  const { data, error } = await supabase.from("shop_members")
    .select("id,user_id,role,is_active,joined_at,profile:user_profiles(display_name)")
    .eq("shop_id",state.shop.id).order("joined_at");
  if (error) throw error;

  root.innerHTML = `
    ${head(
      "Staff",
      "Role-based access for the people working in your shop",
      canManage ? '<button id="add-staff" class="btn btn-primary">Add staff account</button>' : ""
    )}
    <div class="card" style="margin-bottom:14px">
      <div class="help">Each staff member signs in with their own MotoPOS account. Their Android screens are limited by the role assigned here.</div>
    </div>
    <div class="table-wrap"><table><thead><tr><th>Staff</th><th>Role</th><th>Status</th><th>Joined</th></tr></thead><tbody>
      ${(data||[]).map(m=>`<tr><td><strong>${esc(m.profile?.display_name || "MotoPOS user")}</strong><div class="help">${esc(m.user_id.slice(0,8))}…</div></td><td>${pill(m.role)}</td><td>${pill(m.is_active?"active":"inactive")}</td><td>${niceDate(m.joined_at)}</td></tr>`).join("") || '<tr><td colspan="4">No staff memberships found.</td></tr>'}
    </tbody></table></div>`;

  document.querySelector("#add-staff")?.addEventListener("click", () => openStaffModal(root));
}

function openStaffModal(root) {
  showModal(`
    <h2>Create staff account</h2>
    <p>The staff member can immediately sign in to the MotoPOS Android app using the email and temporary password you set here.</p>
    <form id="staff-form" class="form">
      <div class="field"><label>Full name</label><input class="input" name="display_name" required placeholder="Juan Dela Cruz"></div>
      <div class="field"><label>Email address</label><input class="input" type="email" name="email" required placeholder="cashier@example.com"></div>
      <div class="field"><label>Temporary password</label><input class="input" type="password" name="password" minlength="8" required placeholder="At least 8 characters"></div>
      <div class="field">
        <label>Role</label>
        <select class="input" name="role">
          <option value="cashier">Cashier</option>
          <option value="mechanic">Mechanic</option>
          <option value="inventory">Inventory Staff</option>
          <option value="manager">Manager</option>
          <option value="admin">Shop Admin</option>
        </select>
      </div>
      <div class="help">The shop's MotoPOS license controls the maximum number of active staff accounts.</div>
      <div class="modal-actions">
        <button type="button" id="close-staff" class="btn btn-secondary">Cancel</button>
        <button type="submit" class="btn btn-primary">Create staff</button>
      </div>
    </form>`);

  document.querySelector("#close-staff")?.addEventListener("click", closeModal);
  document.querySelector("#staff-form")?.addEventListener("submit", event => createStaff(event, root));
}

async function createStaff(event, root) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = "Creating…";

  const { data, error } = await supabase.functions.invoke("invite-staff", {
    body: {
      shop_id: state.shop.id,
      display_name: String(form.get("display_name") || "").trim(),
      email: String(form.get("email") || "").trim(),
      password: String(form.get("password") || ""),
      role: String(form.get("role") || "cashier")
    }
  });

  if (error || data?.error) {
    toast(friendlyError(data?.error || error), "error");
    button.disabled = false;
    button.textContent = "Create staff";
    return;
  }

  closeModal();
  toast(`${data.display_name || "Staff account"} created as ${data.role}.`, "success");
  await pageStaff(root);
}

async function pageService(root) {
  const { data, error } = await supabase.from("job_orders")
    .select("id,job_number,status,priority,complaint,diagnosis,odometer_in,created_at")
    .eq("shop_id",state.shop.id).order("created_at",{ascending:false}).limit(150);
  if (error) throw error;
  root.innerHTML = `
    ${head("Service Jobs","Workshop queue and motorcycle service progress")}
    <div class="table-wrap"><table><thead><tr><th>Job</th><th>Status</th><th>Priority</th><th>Complaint</th><th>Odometer</th><th>Created</th></tr></thead><tbody>
      ${(data||[]).map(j=>`<tr><td><strong>${esc(j.job_number)}</strong></td><td>${pill(j.status)}</td><td>${pill(j.priority)}</td><td>${esc(j.complaint||"—")}</td><td>${j.odometer_in?number(j.odometer_in)+" km":"—"}</td><td>${niceDate(j.created_at,true)}</td></tr>`).join("") || '<tr><td colspan="6">No job orders yet.</td></tr>'}
    </tbody></table></div>`;
}

async function pageSuppliers(root) {
  const { data, error } = await supabase.from("suppliers")
    .select("id,name,contact_person,phone,email,address,is_active,created_at")
    .eq("shop_id",state.shop.id).order("name");
  if (error) throw error;
  root.innerHTML = `
    ${head("Suppliers","Parts suppliers and purchasing contacts")}
    <div class="table-wrap"><table><thead><tr><th>Supplier</th><th>Contact</th><th>Phone</th><th>Email</th><th>Status</th></tr></thead><tbody>
      ${(data||[]).map(s=>`<tr><td><strong>${esc(s.name)}</strong></td><td>${esc(s.contact_person||"—")}</td><td>${esc(s.phone||"—")}</td><td>${esc(s.email||"—")}</td><td>${pill(s.is_active?"active":"inactive")}</td></tr>`).join("") || '<tr><td colspan="5">No suppliers yet.</td></tr>'}
    </tbody></table></div>`;
}

async function pageReports(root) {
  const [salesRes, expensesRes] = await Promise.all([
    supabase.from("sales").select("total_amount,status,created_at").eq("shop_id",state.shop.id).order("created_at",{ascending:false}).limit(1000),
    supabase.from("expenses").select("amount,expense_date").eq("shop_id",state.shop.id).order("expense_date",{ascending:false}).limit(1000)
  ]);
  if (salesRes.error) throw salesRes.error;
  if (expensesRes.error) throw expensesRes.error;
  const completed = (salesRes.data||[]).filter(s=>s.status==="completed");
  const revenue = completed.reduce((sum,s)=>sum+Number(s.total_amount||0),0);
  const expenses = (expensesRes.data||[]).reduce((sum,e)=>sum+Number(e.amount||0),0);
  const avg = completed.length ? revenue/completed.length : 0;

  root.innerHTML = `
    ${head("Reports","Current cloud totals from your accessible data")}
    <section class="metrics">
      <article class="metric"><div class="metric-label">Revenue</div><div class="metric-value">${money(revenue)}</div><div class="metric-sub">${number(completed.length)} completed sales</div></article>
      <article class="metric"><div class="metric-label">Expenses</div><div class="metric-value">${money(expenses)}</div><div class="metric-sub">Recorded operating expenses</div></article>
      <article class="metric"><div class="metric-label">Net</div><div class="metric-value">${money(revenue-expenses)}</div><div class="metric-sub">Revenue minus expenses</div></article>
      <article class="metric"><div class="metric-label">Average sale</div><div class="metric-value">${money(avg)}</div><div class="metric-sub">Per completed transaction</div></article>
    </section>`;
}

async function pageLicense(root) {
  const [licenseRes, deviceRes, memberRes] = await Promise.all([
    supabase.from("shop_licenses").select("id,plan_code,status,license_key_last4,starts_at,expires_at,max_devices,max_staff,offline_grace_days").eq("shop_id",state.shop.id).maybeSingle(),
    supabase.from("device_sessions").select("id,device_id,device_name,app_version,last_seen_at,is_active").eq("shop_id",state.shop.id).order("last_seen_at",{ascending:false}),
    supabase.from("shop_members").select("id").eq("shop_id",state.shop.id).eq("is_active",true)
  ]);
  if (licenseRes.error) throw licenseRes.error;
  if (deviceRes.error) throw deviceRes.error;

  const license = licenseRes.data;
  const devices = (deviceRes.data||[]).filter(d=>d.is_active);
  const staffCount = memberRes.data?.length || 0;
  const trial = license?.status === "trial" ? trialRemaining(license.expires_at) : null;
  const effectiveStatus =
    license?.status === "trial" && trial?.days === 0 ? "expired" : license?.status;

  root.innerHTML = `
    ${head("License","MotoPOS plan, trial, limits and current activation status")}
    ${license ? `
      ${license.status === "trial" ? `
        <div class="card" style="margin-bottom:14px;border-color:rgba(59,130,246,.28)">
          <div class="card-title"><h3>7-day Pro Trial</h3>${pill(effectiveStatus)}</div>
          <div class="help">
            ${trial?.days > 0
              ? `Your full MotoPOS Pro trial is active. <strong style="color:var(--text)">${esc(trial.label)}</strong>. No license key is required during the trial.`
              : "Your 7-day MotoPOS trial has expired. Ask the MotoPOS administrator to issue a paid license to continue licensed operations."}
          </div>
        </div>
      ` : ""}
      <section class="metrics">
        <article class="metric">
          <div class="metric-label">Plan</div>
          <div class="metric-value" style="text-transform:capitalize">${license.status === "trial" ? "Pro Trial" : esc(license.plan_code)}</div>
          <div class="metric-sub">${license.status === "trial" ? "Full Pro features for 7 days" : `Key ending ••••${esc(license.license_key_last4||"—")}`}</div>
        </article>
        <article class="metric">
          <div class="metric-label">Status</div>
          <div class="metric-value" style="text-transform:capitalize">${esc(effectiveStatus)}</div>
          <div class="metric-sub">${license.expires_at ? `${license.status === "trial" ? (trial?.label || "Trial") : "Expires"} · ${niceDate(license.expires_at)}` : "No expiration set"}</div>
        </article>
        <article class="metric"><div class="metric-label">Devices</div><div class="metric-value">${devices.length}/${license.max_devices}</div><div class="metric-sub">Active registered devices</div></article>
        <article class="metric"><div class="metric-label">Staff</div><div class="metric-value">${staffCount}/${license.max_staff}</div><div class="metric-sub">${license.status === "trial" ? "Trial staff allowance" : `${license.offline_grace_days}-day offline grace`}</div></article>
      </section>
      <div class="card">
        <div class="card-title"><h3>${license.status === "trial" ? "Trial rules" : "License security"}</h3></div>
        <div class="help">
          ${license.status === "trial"
            ? "Trial starts automatically when a new shop has no paid license. After 7 days it expires automatically. Issuing a paid license replaces the trial."
            : "MotoPOS stores only a SHA-256 hash of the activation key. The full key is shown only when your MotoPOS administrator issues or reissues it."}
        </div>
      </div>
    ` : `
      <div class="empty"><strong>Preparing your free trial</strong>A new shop without a paid license automatically receives a 7-day MotoPOS Pro trial.</div>
    `}
  `;
}

async function pageDevices(root) {
  const { data, error } = await supabase.from("device_sessions")
    .select("id,device_id,device_name,app_version,last_seen_at,is_active,created_at")
    .eq("shop_id",state.shop.id).order("last_seen_at",{ascending:false});
  if (error) throw error;
  root.innerHTML = `
    ${head("Devices","Android POS terminals and authenticated device sessions")}
    <div class="table-wrap"><table><thead><tr><th>Device</th><th>ID</th><th>App</th><th>Status</th><th>Last seen</th></tr></thead><tbody>
      ${(data||[]).map(d=>`<tr><td><strong>${esc(d.device_name||"MotoPOS device")}</strong></td><td>${esc(d.device_id)}</td><td>${esc(d.app_version||"—")}</td><td>${pill(d.is_active?"active":"inactive")}</td><td>${niceDate(d.last_seen_at,true)}</td></tr>`).join("") || '<tr><td colspan="5">No registered devices yet.</td></tr>'}
    </tbody></table></div>`;
}

async function pageSettings(root) {
  root.innerHTML = `
    ${head("Settings","Shop identity used across MotoPOS")}
    <div class="card" style="max-width:720px">
      <form id="shop-settings" class="form">
        <div class="field"><label>Shop name</label><input class="input" name="name" value="${esc(state.shop.name||"")}" required></div>
        <div class="grid-2">
          <div class="field"><label>Phone</label><input class="input" name="phone" value="${esc(state.shop.phone||"")}"></div>
          <div class="field"><label>Email</label><input class="input" type="email" name="email" value="${esc(state.shop.email||"")}"></div>
        </div>
        <div class="field"><label>Address</label><textarea class="input" name="address">${esc(state.shop.address||"")}</textarea></div>
        <button class="btn btn-primary" type="submit">Save shop settings</button>
      </form>
    </div>`;
  document.querySelector("#shop-settings")?.addEventListener("submit", async event => {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const { data, error } = await supabase.from("shops").update({
      name:String(f.get("name")||"").trim(),
      phone:String(f.get("phone")||"").trim()||null,
      email:String(f.get("email")||"").trim()||null,
      address:String(f.get("address")||"").trim()||null
    }).eq("id",state.shop.id).select("id,name,phone,email,address,currency_code,timezone").single();
    if (error) return toast(friendlyError(error),"error");
    state.shop = data;
    toast("Shop settings saved.","success");
    pageSettings(root);
  });
}

async function renderAdmin() {
  if (!state.isSystemAdmin) {
    app.innerHTML = `<div class="setup"><div class="setup-card"><h1>Access denied</h1><p>This area is restricted to MotoPOS system administrators.</p><a class="btn btn-secondary" href="#/dashboard/overview">Return to dashboard</a></div></div>`;
    return;
  }

  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand"><span class="brand-logo">M</span><span>MotoPOS</span></div>
        <div class="shop-chip"><strong>Developer Control</strong><span>System administrator</span></div>
        <nav class="nav-list">
          <a class="nav-item active" href="#/admin"><span>Clients & Licenses</span><span class="nav-badge">ADMIN</span></a>
          ${state.shop ? '<a class="nav-item" href="#/dashboard/overview"><span>My Shop</span></a>' : ""}
        </nav>
        <div class="sidebar-bottom"><button id="admin-sign-out" class="btn btn-secondary" style="width:100%">Sign out</button></div>
      </aside>
      <div class="main">
        <header class="topbar"><div class="topbar-title"><strong>MotoPOS Control Center</strong><span>License and client administration</span></div><div class="user-pill"><div class="avatar">A</div><div class="user-copy"><strong style="font-size:12px">${esc(state.user?.email||"")}</strong><div class="help">system admin</div></div></div></header>
        <main id="admin-content" class="content"><div class="loading-block"></div></main>
      </div>
    </div>`;

  document.querySelector("#admin-sign-out")?.addEventListener("click", async()=>{
    await supabase.auth.signOut(); state.session=state.user=null; setHash("");
  });
  await loadAdminClients();
}

async function loadAdminClients() {
  const root = document.querySelector("#admin-content");
  if (!root) return;
  const { data, error } = await supabase.rpc("admin_client_overview");
  if (error) {
    root.innerHTML = `<div class="empty"><strong>Unable to load clients</strong>${esc(friendlyError(error))}</div>`;
    return;
  }
  const clients = data || [];
  const active = clients.filter(c=>["active","trial"].includes(c.license_status)).length;
  const devices = clients.reduce((sum,c)=>sum+Number(c.device_count||0),0);

  root.innerHTML = `
    ${head("Clients & Licenses","Central control for MotoPOS shops, plans and devices")}
    <section class="metrics">
      <article class="metric"><div class="metric-label">Client shops</div><div class="metric-value">${number(clients.length)}</div><div class="metric-sub">Registered workspaces</div></article>
      <article class="metric"><div class="metric-label">Active licenses</div><div class="metric-value">${number(active)}</div><div class="metric-sub">Active or trial</div></article>
      <article class="metric"><div class="metric-label">Active devices</div><div class="metric-value">${number(devices)}</div><div class="metric-sub">Across all clients</div></article>
      <article class="metric"><div class="metric-label">Unlicensed</div><div class="metric-value">${number(clients.filter(c=>c.license_status==="unlicensed").length)}</div><div class="metric-sub">Awaiting a license</div></article>
    </section>
    <div class="table-wrap"><table><thead><tr><th>Shop</th><th>Owner</th><th>Plan</th><th>License</th><th>Devices</th><th>Staff</th><th>Expires</th><th>Actions</th></tr></thead><tbody>
      ${clients.map(c=>`
        <tr>
          <td><strong>${esc(c.shop_name)}</strong><div class="help">${esc(String(c.shop_id).slice(0,8))}…</div></td>
          <td>${esc(c.owner_email||"—")}</td>
          <td>${c.plan_code?pill(c.plan_code):"—"}</td>
          <td>${pill(c.license_status)}${c.license_key_last4?`<div class="help">••••${esc(c.license_key_last4)}</div>`:""}</td>
          <td>${number(c.device_count)}/${c.max_devices??"—"}</td>
          <td>${number(c.member_count)}/${c.max_staff??"—"}</td>
          <td>${c.license_status === "trial" && c.expires_at ? `<strong>${esc(trialRemaining(c.expires_at)?.label || "Trial")}</strong><div class="help">${niceDate(c.expires_at)}</div>` : niceDate(c.expires_at)}</td>
          <td><div class="actions">
            <button class="btn btn-primary btn-sm issue-license" data-shop="${esc(c.shop_id)}" data-name="${esc(c.shop_name)}">Issue</button>
            ${c.license_status!=="unlicensed" ? `<button class="btn ${c.license_status==="suspended"?"btn-success":"btn-danger"} btn-sm status-license" data-shop="${esc(c.shop_id)}" data-status="${c.license_status==="suspended"?"active":"suspended"}">${c.license_status==="suspended"?"Reactivate":"Suspend"}</button>` : ""}
            <button class="btn btn-secondary btn-sm reset-devices" data-shop="${esc(c.shop_id)}">Reset devices</button>
          </div></td>
        </tr>`).join("") || '<tr><td colspan="8">No client shops found.</td></tr>'}
    </tbody></table></div>`;

  root.querySelectorAll(".issue-license").forEach(btn=>btn.addEventListener("click",()=>openLicenseModal(btn.dataset.shop,btn.dataset.name)));
  root.querySelectorAll(".status-license").forEach(btn=>btn.addEventListener("click",()=>setLicenseStatus(btn.dataset.shop,btn.dataset.status)));
  root.querySelectorAll(".reset-devices").forEach(btn=>btn.addEventListener("click",()=>resetDevices(btn.dataset.shop)));
}

function openLicenseModal(shopId, shopName) {
  const date = new Date(); date.setFullYear(date.getFullYear()+1);
  const expires = date.toISOString().slice(0,10);
  showModal(`
    <h2>Issue MotoPOS license</h2>
    <p>${esc(shopName)} · A new key will replace the previous activation key for this shop.</p>
    <form id="license-form" class="form">
      <input type="hidden" name="shop_id" value="${esc(shopId)}">
      <div class="field"><label>Plan</label><select class="input" name="plan"><option value="basic">Basic</option><option value="pro" selected>Pro</option><option value="business">Business</option></select></div>
      <div class="field"><label>Expiration date</label><input class="input" type="date" name="expires" value="${expires}"></div>
      <div class="grid-2"><div class="field"><label>Max devices</label><input class="input" type="number" min="1" name="devices" value="3"></div><div class="field"><label>Max staff</label><input class="input" type="number" min="1" name="staff" value="10"></div></div>
      <div class="modal-actions"><button type="button" id="close-license" class="btn btn-secondary">Cancel</button><button type="submit" class="btn btn-primary">Generate license</button></div>
    </form>`);
  document.querySelector("#close-license")?.addEventListener("click",closeModal);
  document.querySelector("#license-form")?.addEventListener("submit",issueLicense);
}

async function issueLicense(event) {
  event.preventDefault();
  const f = new FormData(event.currentTarget);
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled=true; button.textContent="Generating…";
  const expiresRaw = String(f.get("expires")||"");
  const expiresAt = expiresRaw ? new Date(expiresRaw+"T23:59:59+08:00").toISOString() : null;
  const { data, error } = await supabase.rpc("admin_issue_license", {
    p_shop_id:String(f.get("shop_id")),
    p_plan_code:String(f.get("plan")),
    p_expires_at:expiresAt,
    p_max_devices:Number(f.get("devices"))||null,
    p_max_staff:Number(f.get("staff"))||null
  });
  if (error) {
    toast(friendlyError(error),"error"); button.disabled=false; button.textContent="Generate license"; return;
  }
  const result = data || {};
  showModal(`
    <h2>License generated</h2>
    <p>Copy this key now. MotoPOS stores only its cryptographic hash, so the full key is not retrievable later.</p>
    <div class="key-box" id="issued-key">${esc(result.license_key||"")}</div>
    <div class="stat-list" style="margin-top:13px">
      <div class="stat-row"><span>Plan</span><strong>${esc(result.plan_code||"")}</strong></div>
      <div class="stat-row"><span>Devices</span><strong>${esc(result.max_devices||"")}</strong></div>
      <div class="stat-row"><span>Staff</span><strong>${esc(result.max_staff||"")}</strong></div>
      <div class="stat-row"><span>Expires</span><strong>${niceDate(result.expires_at)}</strong></div>
    </div>
    <div class="modal-actions"><button id="copy-key" class="btn btn-primary">Copy key</button><button id="done-key" class="btn btn-secondary">Done</button></div>`);
  document.querySelector("#copy-key")?.addEventListener("click", async()=>{
    await navigator.clipboard.writeText(result.license_key||"");
    toast("License key copied.","success");
  });
  document.querySelector("#done-key")?.addEventListener("click",async()=>{closeModal();await loadAdminClients();});
}

async function setLicenseStatus(shopId, status) {
  if (!confirm(`${status==="suspended"?"Suspend":"Reactivate"} this MotoPOS license?`)) return;
  const { error } = await supabase.rpc("admin_set_license_status",{p_shop_id:shopId,p_status:status});
  if (error) return toast(friendlyError(error),"error");
  toast(`License ${status}.`,"success");
  await loadAdminClients();
}

async function resetDevices(shopId) {
  if (!confirm("Deactivate all registered devices for this shop? They will need to activate again.")) return;
  const { data, error } = await supabase.rpc("admin_reset_devices",{p_shop_id:shopId});
  if (error) return toast(friendlyError(error),"error");
  toast(`${data||0} device(s) reset.`,"success");
  await loadAdminClients();
}

async function route() {
  const path = currentPath();

  if (new URLSearchParams(location.search).get("email-confirmed") === "1") {
    renderEmailVerified();
    return;
  }

  if (!state.session) {
    if (path.startsWith("login")) renderAuth();
    else renderLanding();
    return;
  }

  if (path === "admin") {
    await renderAdmin();
    return;
  }

  if (!state.membership || !state.shop) {
    if (state.isSystemAdmin && path === "admin") await renderAdmin();
    else renderSetup();
    return;
  }

  const page = path.startsWith("dashboard/") ? path.split("/")[1] : "overview";
  renderShell(page || "overview");
}

async function init() {
  const { data } = await supabase.auth.getSession();
  state.session = data.session;
  await loadAccessContext();

  supabase.auth.onAuthStateChange(async (_event, session) => {
    state.session = session;
    await loadAccessContext();
    route();
  });

  window.addEventListener("hashchange", route);
  route();
}

init().catch(error => {
  console.error(error);
  app.innerHTML = `<div class="setup"><div class="setup-card"><h1>MotoPOS Cloud</h1><p>${esc(friendlyError(error))}</p><button class="btn btn-primary" onclick="location.reload()">Reload</button></div></div>`;
});
