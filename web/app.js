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
  busy: false,
  supportThreadId: null,
  supportChannel: null
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
  const full = ["overview","sales","inventory","customers","staff","service","suppliers","operations","reports","support","license","devices","settings"];
  if (["owner","admin","manager"].includes(r)) return full;
  if (r === "cashier") return ["overview","sales","customers","service","operations","support","license"];
  if (r === "inventory") return ["overview","inventory","suppliers","operations","support","license"];
  if (r === "mechanic") return ["overview","customers","service","operations","support","license"];
  return ["overview","support","license"];
}

function navLabel(page) {
  return ({
    overview:"Overview", sales:"Sales", inventory:"Inventory", customers:"Customers",
    staff:"Staff", service:"Service Jobs", suppliers:"Suppliers", operations:"Operations", reports:"Reports",
    support:"Support Chat", license:"License", devices:"Devices", settings:"Settings"
  })[page] || page;
}

async function functionErrorDetails(error) {
  if (!error) return null;
  try {
    const response = error.context;
    if (response && typeof response.clone === "function") {
      const cloned = response.clone();
      const type = cloned.headers?.get?.("content-type") || "";
      if (type.includes("application/json")) return await cloned.json();
      const text = await cloned.text();
      if (text) return { error: text };
    }
  } catch (_) {}
  return null;
}

function friendlyError(error) {
  const raw = error?.message || String(error || "Something went wrong.");
  const lower = raw.toLowerCase();
  if (lower.includes("invalid login credentials")) return "Incorrect email or password.";
  if (lower.includes("email not confirmed")) return "Verify your email first, then sign in.";
  if (lower.includes("over_email_send_rate_limit") || lower.includes("email rate limit exceeded")) return "Verification email limit reached. Please try again later. For production sign-ups, MotoPOS needs a custom SMTP email provider.";
  if (lower.includes("unexpected status code returned from hook: 405")) return "Account creation is temporarily unavailable because the email hook is misconfigured. Please contact MotoPOS Support.";
  if (lower.includes("row-level security") || lower.includes("permission denied")) return "Your account does not have permission for that action.";
  if (lower.includes("network") || lower.includes("fetch")) return "Unable to reach MotoPOS Cloud. Check your internet connection.";
  return raw.split("\n")[0].slice(0, 220);
}

function setupMotion(scope = document) {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const items = scope.querySelectorAll?.(
    ".section-head, .feature-card, .price-card, .manual-section, .manual-intro-card"
  ) || [];

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -45px 0px" });

  items.forEach(item => {
    if (item.classList.contains("is-visible") || item.classList.contains("reveal-motion")) return;
    item.classList.add("reveal-motion");
    observer.observe(item);
  });
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

function renderManual() {
  const sections = [
    {
      id: "getting-started",
      title: "Getting Started",
      eyebrow: "01",
      summary: "Create your account, verify your email, create a shop, and start the 7-day Pro Trial.",
      body: `
        <h3>1. Create an owner account</h3>
        <p>Open MotoPOS and choose <strong>Create Account</strong>. Enter the owner's name, email, and password.</p>
        <h3>2. Verify the email</h3>
        <p>Open the Supabase verification email and press the confirmation link. It should return to the MotoPOS Cloud confirmation page. After verification, go back to the Android app and sign in.</p>
        <h3>3. Create the shop workspace</h3>
        <p>Enter the shop name, phone number, and address. The first account becomes the shop owner.</p>
        <h3>4. Automatic trial</h3>
        <p>If the shop has no paid license, MotoPOS automatically starts a <strong>7-day Pro Trial</strong>. No license key is required during the trial.</p>
      `
    },
    {
      id: "roles",
      title: "Accounts & Roles",
      eyebrow: "02",
      summary: "Understand what Owner, Admin, Manager, Cashier, Inventory, and Mechanic accounts can access.",
      body: `
        <div class="manual-table">
          <div><strong>Owner</strong><span>Full shop control, staff, settings, reports, license and devices.</span></div>
          <div><strong>Admin</strong><span>Most owner-level shop controls except protected system-level functions.</span></div>
          <div><strong>Manager</strong><span>Operations, inventory, reports, service and day-to-day supervision.</span></div>
          <div><strong>Cashier</strong><span>POS, customers, service lookup and permitted transaction tasks.</span></div>
          <div><strong>Inventory</strong><span>Products, stock, suppliers and inventory adjustments.</span></div>
          <div><strong>Mechanic</strong><span>Customers, motorcycles and service/job-order workflows.</span></div>
        </div>
        <p>Each employee should use a separate MotoPOS account. Do not share the owner login.</p>
      `
    },
    {
      id: "pos",
      title: "POS & Checkout",
      eyebrow: "03",
      summary: "Add products to the cart, choose a customer, complete payment, and confirm the sale.",
      body: `
        <h3>Starting a sale</h3>
        <p>Open <strong>POS</strong>, search by product name, SKU or barcode, then add items to the cart. Adjust quantities before checkout.</p>
        <h3>Checkout</h3>
        <p>Press Checkout, choose the payment method, review totals, discounts and customer information, then complete the transaction.</p>
        <h3>Transaction Complete</h3>
        <p>After the database confirms the sale, MotoPOS shows a centered <strong>Transaction Complete</strong> dialog with the sale number and final total. Press <strong>Done</strong> to begin the next sale.</p>
        <div class="manual-note"><strong>Important:</strong> Stock is deducted only after the sale is successfully completed. If checkout fails, the transaction should not be treated as completed.</div>
      `
    },
    {
      id: "inventory",
      title: "Inventory Management",
      eyebrow: "04",
      summary: "Add products, edit prices, adjust stock, monitor low stock and archive old items.",
      body: `
        <h3>Add a product</h3>
        <p>Go to <strong>Inventory → Add Product</strong>. Enter the product name, SKU, barcode, brand, type, cost, selling price, reorder level, unit and optional opening stock.</p>
        <h3>Edit product details</h3>
        <p>Use <strong>Edit</strong> to update product information, pricing, barcode, brand, part number, shelf location and active status.</p>
        <h3>Adjust stock</h3>
        <p>Use <strong>Stock</strong> / <strong>Adjust Stock</strong>. Positive values add stock; negative values deduct stock. Select a reason such as Adjustment, Return, Damage, Theft or Opening Stock and add notes when useful.</p>
        <h3>Archive instead of deleting</h3>
        <p>Archive old products when you want to hide them from normal selling while keeping transaction history intact.</p>
        <div class="manual-note"><strong>Inventory history:</strong> Manual stock adjustments are recorded as inventory movements for accountability.</div>
      `
    },
    {
      id: "customers",
      title: "Customers & Motorcycles",
      eyebrow: "05",
      summary: "Maintain customer contact information and connect motorcycles to service history.",
      body: `
        <p>Use the <strong>Customers</strong> section to store customer name, phone, email and address. Customer records can be connected to motorcycles and service jobs.</p>
        <p>For service-oriented shops, keep motorcycle details consistent so previous repairs and parts usage are easier to review.</p>
      `
    },
    {
      id: "service",
      title: "Service & Job Orders",
      eyebrow: "06",
      summary: "Track workshop jobs from complaint and diagnosis through repair and release.",
      body: `
        <p>Open <strong>Service</strong> to review job numbers, complaint, priority, odometer and status.</p>
        <p>Use consistent statuses such as <strong>Waiting → Inspection → Repairing → Testing → Ready → Released</strong> so the whole team knows the motorcycle's current stage.</p>
        <p>Parts and labor associated with a service job should be attached to the same job order whenever available.</p>
      `
    },
    {
      id: "staff",
      title: "Staff Management",
      eyebrow: "07",
      summary: "Create separate staff accounts and assign the correct role.",
      body: `
        <p>Owners and Shop Admins can open <strong>Staff → Add Staff Account</strong>. Enter the employee's full name, email, temporary password and role.</p>
        <p>The shop's license controls the maximum number of active staff accounts. Staff should change and protect their login credentials after receiving them.</p>
      `
    },
    {
      id: "support",
      title: "Support Chat",
      eyebrow: "08",
      summary: "Contact MotoPOS Support directly from the app or web dashboard.",
      body: `
        <p>Open <strong>Support</strong> or <strong>Support Chat</strong>, create a new conversation, choose the priority and describe the issue.</p>
        <p>Replies from the MotoPOS team appear in the same conversation. Conversations may be marked Open, Pending or Closed.</p>
        <p>For faster troubleshooting, include the device model, app version, affected screen and the exact error message.</p>
      `
    },
    {
      id: "license",
      title: "Trial, License & Devices",
      eyebrow: "09",
      summary: "Understand the 7-day trial, paid activation, device limits and suspended/expired access.",
      body: `
        <h3>7-day Pro Trial</h3>
        <p>A new shop without a paid license receives the Pro Trial automatically. The app displays the remaining trial days.</p>
        <h3>Paid activation</h3>
        <p>When a paid license is issued, a new unregistered Android device may ask for the MotoPOS license key. Enter the key provided by the MotoPOS administrator.</p>
        <h3>Expired or suspended license</h3>
        <p>The app blocks licensed operations when the license is expired or suspended. After the administrator renews/reactivates it, press <strong>Check License Again</strong>.</p>
        <h3>Device limits</h3>
        <p>Each plan has a maximum number of active devices. Old devices can be reset from the Developer Control Center when necessary.</p>
      `
    },
    {
      id: "reports",
      title: "Dashboard & Reports",
      eyebrow: "10",
      summary: "Use sales, stock, expenses and service data to monitor shop operations.",
      body: `
        <p>The dashboard summarizes sales, active jobs, low-stock products and other role-appropriate information.</p>
        <p>Reports use cloud data from completed sales and recorded expenses. Owners, admins and managers have broader financial visibility than lower staff roles.</p>
      `
    },
    {
      id: "web",
      title: "MotoPOS Cloud Website",
      eyebrow: "11",
      summary: "Use the web dashboard for management, inventory, support and shop administration.",
      body: `
        <p>The Android app is designed for counter and workshop operations. <strong>MotoPOS Cloud</strong> is the management layer for owners and managers.</p>
        <p>From the website you can review sales, manage inventory, staff, service jobs, suppliers, reports, support, license status and devices based on your role.</p>
      `
    },
    {
      id: "admin",
      title: "System Admin Guide",
      eyebrow: "12",
      summary: "Manage client shops, licenses, user accounts and the MotoPOS Support Inbox.",
      body: `
        <p>The <strong>Developer Control Center</strong> is only for approved MotoPOS System Admin accounts.</p>
        <h3>Clients & Licenses</h3>
        <p>Issue Basic, Pro or Business licenses, set expiration dates, device/staff limits, suspend/reactivate licenses and reset registered devices.</p>
        <h3>Users & Emails</h3>
        <p>Disable accounts, remove/anonymize email addresses, or permanently delete accounts when it is safe. Accounts with protected business history should normally be disabled/anonymized rather than force-deleted.</p>
        <h3>Support Inbox</h3>
        <p>Review customer conversations, reply as MotoPOS Support and change the request status.</p>
        <div class="manual-note"><strong>Safety:</strong> Never expose the Supabase service-role key, master credentials or private administrator secrets in the public website or Android APK.</div>
      `
    },
    {
      id: "troubleshooting",
      title: "Troubleshooting",
      eyebrow: "13",
      summary: "Quick fixes for the most common account, license, connection and transaction issues.",
      body: `
        <div class="manual-faq">
          <details open><summary>Email verification opens localhost</summary><p>Use a newly generated verification email after the MotoPOS redirect URL is configured. Old links may still contain the previous redirect.</p></details>
          <details><summary>Unexpected status code returned from hook: 405</summary><p>The Supabase Send Email Auth Hook is pointing to a normal website page instead of an email-hook endpoint. Disable that custom hook or configure a valid Send Email Edge Function, then try creating the account again.</p></details>
          <details><summary>Incorrect email or password</summary><p>Confirm the email is verified, then check the exact email/password used for the account.</p></details>
          <details><summary>Trial expired</summary><p>Ask the MotoPOS administrator to issue or renew a license, then press Check License Again.</p></details>
          <details><summary>Device limit reached</summary><p>Deactivate/reset an old device or upgrade the plan's device limit.</p></details>
          <details><summary>Product cannot go below zero</summary><p>The shop has negative stock disabled. Correct the physical count or receive/add stock before completing the deduction.</p></details>
          <details><summary>Transaction did not complete</summary><p>Do not assume the sale was recorded unless MotoPOS displays Transaction Complete. Check the Sales list before retrying to avoid duplicate charging.</p></details>
          <details><summary>Need more help</summary><p>Open Support Chat and send the exact issue, screenshot/error text, device model and app version.</p></details>
        </div>
      `
    }
  ];

  app.innerHTML = `
    <div class="public-shell manual-page">
      <nav class="public-nav">
        <a href="#/" class="brand"><span class="brand-logo">M</span><span>MotoPOS</span></a>
        <div class="nav-actions">
          <a class="btn btn-secondary" href="#/">Website</a>
          ${state.session && state.shop ? '<a class="btn btn-primary" href="#/dashboard/overview">Dashboard</a>' : '<a class="btn btn-primary" href="#/login">Sign in</a>'}
        </div>
      </nav>

      <section class="manual-hero">
        <span class="eyebrow">MotoPOS Help Center</span>
        <h1>App Manual & User Guide</h1>
        <p>Step-by-step instructions for owners, cashiers, inventory staff, mechanics, managers and MotoPOS administrators.</p>
        <div class="manual-search-wrap">
          <input id="manual-search" class="input manual-search" type="search" placeholder="Search manual — e.g. checkout, inventory, trial, staff…" autocomplete="off">
        </div>
      </section>

      <div class="manual-layout">
        <aside class="manual-toc">
          <strong>Contents</strong>
          ${sections.map(s=>`<a href="#manual-${s.id}" data-manual-link="${s.id}"><span>${s.eyebrow}</span>${esc(s.title)}</a>`).join("")}
        </aside>

        <main class="manual-content" id="manual-content">
          <div class="manual-intro-card">
            <div>
              <span class="kicker">Current guide</span>
              <h2>MotoPOS Android + MotoPOS Cloud</h2>
              <p>This manual covers the current core workflows. Features may expand as new MotoPOS versions are released.</p>
            </div>
            <div class="manual-version">v1.x</div>
          </div>

          ${sections.map(s=>`
            <article class="manual-section" id="manual-${s.id}" data-manual-section data-search="${esc((s.title+" "+s.summary).toLowerCase())}">
              <div class="manual-section-head">
                <span>${s.eyebrow}</span>
                <div><h2>${esc(s.title)}</h2><p>${esc(s.summary)}</p></div>
              </div>
              <div class="manual-body">${s.body}</div>
            </article>
          `).join("")}

          <div id="manual-empty" class="empty" style="display:none"><strong>No matching guide found</strong>Try another keyword such as POS, inventory, license, staff or support.</div>
        </main>
      </div>

      <footer class="footer">
        <span>© 2026 MotoPOS Cloud · App Manual</span>
        <span><a href="#/manual">Help Center</a> · <a href="#/">MotoPOS Website</a></span>
      </footer>
    </div>`;

  const search = document.querySelector("#manual-search");
  const cards = [...document.querySelectorAll("[data-manual-section]")];
  const empty = document.querySelector("#manual-empty");

  search?.addEventListener("input", () => {
    const term = search.value.trim().toLowerCase();
    let visible = 0;
    cards.forEach(card => {
      const haystack = (card.textContent || "").toLowerCase();
      const show = !term || haystack.includes(term);
      card.style.display = show ? "" : "none";
      if (show) visible++;
    });
    if (empty) empty.style.display = visible ? "none" : "";
  });

  document.querySelectorAll("[data-manual-link]").forEach(link => {
    link.addEventListener("click", event => {
      event.preventDefault();
      const id = link.dataset.manualLink;
      document.querySelector("#manual-" + id)?.scrollIntoView({behavior:"smooth",block:"start"});
    });
  });
}

function renderLanding() {
  app.innerHTML = `
    <div class="public-shell">
      <nav class="public-nav">
        <a href="#/" class="brand"><span class="brand-logo">M</span><span>MotoPOS</span></a>
        <div class="nav-actions">
          <a class="btn btn-secondary" href="#/manual">App Manual</a>
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
              <a class="btn btn-secondary" href="#/manual">Read the app manual</a>
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

        <section class="section founder-section">
          <div class="founder-card reveal-motion is-visible">
            <div class="founder-mark">MR</div>
            <div class="founder-copy">
              <span class="kicker">Meet the developer</span>
              <h2>Hi, I’m Mark Reymuel Pascual.</h2>
              <p>I’m the developer behind MotoPOS, building practical digital tools for real workflows. MotoPOS is focused on helping motorcycle shops manage sales, inventory, service jobs, staff access, customers, support, and cloud operations in one connected system.</p>
              <p class="founder-note">Have a question, suggestion, partnership idea, or need help with MotoPOS? You can contact me directly on Facebook.</p>
              <div class="founder-actions">
                <a class="btn btn-primary" href="https://facebook.com/profile.php?id=61590474910314" target="_blank" rel="noopener noreferrer">Contact me on Facebook</a>
                <a class="btn btn-secondary" href="#/manual">Read the MotoPOS manual</a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer class="footer"><span>© 2026 MotoPOS Cloud · Built by Mark Reymuel Pascual</span><span><a href="#/manual">App Manual</a> · <a href="https://facebook.com/profile.php?id=61590474910314" target="_blank" rel="noopener noreferrer">Facebook Contact</a> · Motorcycle parts • Service • POS • Licensing</span></footer>
    </div>`;

  setupMotion();
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
  const pricing = {
    basic: { monthly: "₱499", annual: "₱4,990/year", note: "Best for small parts shops" },
    pro: { monthly: "₱999", annual: "₱9,990/year", note: "Best for full motorcycle shops" },
    business: { monthly: "₱1,799", annual: "₱17,990/year", note: "Best for larger teams" }
  };

  root.innerHTML = data.map(plan => {
    const price = pricing[plan.code] || { monthly: "Contact us", annual: "", note: "" };
    return `
      <article class="price-card ${plan.code === "pro" ? "featured" : ""}">
        ${plan.code === "pro" ? '<div class="price-badge">Most popular</div>' : ""}
        <span class="kicker">${esc(plan.code)}</span>
        <h3>${esc(plan.name)}</h3>
        <div class="plan-price"><strong>${price.monthly}</strong>${price.monthly.startsWith("₱") ? "<span>/month</span>" : ""}</div>
        <div class="plan-annual">${esc(price.annual)}</div>
        <p>${esc(plan.description || "")}</p>
        <div class="plan-note">${esc(price.note)}</div>
        <div class="price-meta">
          <strong>${number(plan.default_max_devices)}</strong> device(s)
          <span>·</span>
          <strong>${number(plan.default_max_staff)}</strong> staff
        </div>
        <div class="trial-copy">Includes a free 7-day Pro Trial for new shops.</div>
        <a class="btn ${plan.code === "pro" ? "btn-primary" : "btn-secondary"}" href="#/login?mode=signup">Start free trial</a>
      </article>
    `;
  }).join("");
  setupMotion(root);
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
          <a class="nav-item" href="#/manual"><span>App Manual</span><span class="nav-badge">HELP</span></a>
          ${adminLink}
        </nav>
        <div class="sidebar-bottom"><button id="sign-out" class="btn btn-secondary" style="width:100%">Sign out</button></div>
      </aside>

      <div class="main">
        <header class="topbar">
          <div class="topbar-title"><strong>${esc(state.shop?.name || "MotoPOS Cloud")}</strong><span>Cloud operations dashboard</span></div>
          <div class="toolbar"><a class="btn btn-secondary btn-sm" href="#/manual">Manual</a><div class="user-pill"><div class="avatar">${esc((state.user?.email || "M").slice(0,1).toUpperCase())}</div><div class="user-copy"><strong style="font-size:12px">${esc(state.user?.email || "")}</strong><div class="help">${esc(role)}</div></div></div></div>
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
      case "operations": return await pageOperations(root);
      case "reports": return await pageReports(root);
      case "support": return await pageSupport(root);
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
  const canManage = ["owner","admin","manager","inventory"].includes(state.membership.role);
  const [productRes, categoryRes] = await Promise.all([
    supabase.from("products")
      .select("id,category_id,name,sku,barcode,brand,description,part_number,item_type,cost_price,selling_price,wholesale_price,stock_quantity,reorder_level,track_stock,unit,shelf_location,oem,warranty_days,is_active")
      .eq("shop_id",state.shop.id).order("name"),
    supabase.from("product_categories")
      .select("id,name,is_active")
      .eq("shop_id",state.shop.id).order("sort_order").order("name")
  ]);
  if (productRes.error) throw productRes.error;
  if (categoryRes.error) throw categoryRes.error;

  const products = productRes.data || [];
  const categories = categoryRes.data || [];
  const lowCount = products.filter(p=>p.is_active && Number(p.stock_quantity)<=Number(p.reorder_level)).length;
  const stockValue = products.filter(p=>p.is_active).reduce((sum,p)=>sum+(Number(p.stock_quantity||0)*Number(p.cost_price||0)),0);

  root.innerHTML = `
    ${head(
      "Inventory",
      "Add products, edit pricing, adjust stock and archive items",
      canManage ? '<button id="add-product" class="btn btn-primary">Add product</button>' : ""
    )}
    <section class="metrics">
      <article class="metric"><div class="metric-label">Products</div><div class="metric-value">${number(products.filter(p=>p.is_active).length)}</div><div class="metric-sub">Active catalog items</div></article>
      <article class="metric"><div class="metric-label">Low stock</div><div class="metric-value">${number(lowCount)}</div><div class="metric-sub">Need replenishment</div></article>
      <article class="metric"><div class="metric-label">Inventory cost</div><div class="metric-value">${money(stockValue)}</div><div class="metric-sub">Current stock × cost</div></article>
      <article class="metric"><div class="metric-label">Archived</div><div class="metric-value">${number(products.filter(p=>!p.is_active).length)}</div><div class="metric-sub">Hidden from normal selling</div></article>
    </section>
    <div class="table-wrap"><table><thead><tr><th>Product</th><th>SKU / Barcode</th><th>Stock</th><th>Cost</th><th>Selling</th><th>Status</th>${canManage?"<th>Manage</th>":""}</tr></thead><tbody>
      ${products.map(p=>`<tr>
        <td><strong>${esc(p.name)}</strong><div class="help">${esc(p.brand||p.part_number||p.item_type||"—")}</div></td>
        <td>${esc(p.sku)}<div class="help">${esc(p.barcode||"No barcode")}</div></td>
        <td><strong>${number(p.stock_quantity)} ${esc(p.unit||"pc")}</strong><div class="help">Reorder at ${number(p.reorder_level)}</div></td>
        <td>${money(p.cost_price)}</td>
        <td><strong>${money(p.selling_price)}</strong></td>
        <td>${!p.is_active ? pill("inactive") : Number(p.stock_quantity)<=Number(p.reorder_level)?pill("low stock"):pill("active")}</td>
        ${canManage?`<td><div class="inventory-actions">
          <button class="btn btn-secondary btn-sm edit-product" data-id="${p.id}">Edit</button>
          <button class="btn btn-secondary btn-sm adjust-stock" data-id="${p.id}">Stock</button>
          <button class="btn ${p.is_active?"btn-danger":"btn-success"} btn-sm toggle-product" data-id="${p.id}" data-active="${p.is_active?"0":"1"}">${p.is_active?"Archive":"Restore"}</button>
        </div></td>`:""}
      </tr>`).join("") || `<tr><td colspan="${canManage?7:6}">No products yet.</td></tr>`}
    </tbody></table></div>`;

  document.querySelector("#add-product")?.addEventListener("click",()=>openProductModal(root,null,categories));
  root.querySelectorAll(".edit-product").forEach(btn=>{
    const product=products.find(p=>p.id===btn.dataset.id);
    btn.addEventListener("click",()=>openProductModal(root,product,categories));
  });
  root.querySelectorAll(".adjust-stock").forEach(btn=>{
    const product=products.find(p=>p.id===btn.dataset.id);
    btn.addEventListener("click",()=>openStockModal(root,product));
  });
  root.querySelectorAll(".toggle-product").forEach(btn=>btn.addEventListener("click",async()=>{
    const active=btn.dataset.active==="1";
    const { error } = await supabase.from("products")
      .update({is_active:active,updated_at:new Date().toISOString()})
      .eq("id",btn.dataset.id)
      .eq("shop_id",state.shop.id);
    if(error) return toast(friendlyError(error),"error");
    toast(active?"Product restored.":"Product archived.","success");
    await pageInventory(root);
  }));
}

function openProductModal(root, product, categories) {
  showModal(`
    <h2>${product?"Edit product":"Add product"}</h2>
    <p>${product?"Update product information. Use Stock Adjustment for quantity changes.":"Create a new product in this shop's inventory."}</p>
    <form id="product-form" class="form">
      <div class="grid-2">
        <div class="field"><label>Product name</label><input class="input" name="name" required value="${esc(product?.name||"")}" placeholder="CVT Cleaning Kit"></div>
        <div class="field"><label>SKU</label><input class="input" name="sku" required value="${esc(product?.sku||"")}" placeholder="CVT-001"></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>Barcode</label><input class="input" name="barcode" value="${esc(product?.barcode||"")}"></div>
        <div class="field"><label>Brand</label><input class="input" name="brand" value="${esc(product?.brand||"")}"></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>Category</label><select class="input" name="category_id"><option value="">No category</option>${categories.filter(x=>x.is_active).map(x=>`<option value="${x.id}" ${product?.category_id===x.id?"selected":""}>${esc(x.name)}</option>`).join("")}</select></div>
        <div class="field"><label>Type</label><select class="input" name="item_type">
          ${["part","accessory","oil","tire","battery","service_item","other"].map(x=>`<option value="${x}" ${(product?.item_type||"part")===x?"selected":""}>${x.replace("_"," ")}</option>`).join("")}
        </select></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>Cost price</label><input class="input" type="number" step="0.01" min="0" name="cost_price" value="${product?.cost_price??0}" required></div>
        <div class="field"><label>Selling price</label><input class="input" type="number" step="0.01" min="0" name="selling_price" value="${product?.selling_price??0}" required></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>Reorder level</label><input class="input" type="number" step="0.01" min="0" name="reorder_level" value="${product?.reorder_level??5}" required></div>
        <div class="field"><label>Unit</label><input class="input" name="unit" value="${esc(product?.unit||"pc")}" required></div>
      </div>
      ${product?"":'<div class="field"><label>Opening stock</label><input class="input" type="number" step="0.01" min="0" name="opening_stock" value="0"></div>'}
      <div class="grid-2">
        <div class="field"><label>Part number</label><input class="input" name="part_number" value="${esc(product?.part_number||"")}"></div>
        <div class="field"><label>Shelf location</label><input class="input" name="shelf_location" value="${esc(product?.shelf_location||"")}"></div>
      </div>
      <div class="field"><label>Description</label><textarea class="input" name="description">${esc(product?.description||"")}</textarea></div>
      <div class="modal-actions"><button type="button" id="close-product" class="btn btn-secondary">Cancel</button><button type="submit" class="btn btn-primary">${product?"Save changes":"Add product"}</button></div>
    </form>`);
  document.querySelector("#close-product")?.addEventListener("click",closeModal);
  document.querySelector("#product-form")?.addEventListener("submit",async event=>{
    event.preventDefault();
    const fd=new FormData(event.currentTarget);
    const button=event.currentTarget.querySelector('button[type="submit"]');
    button.disabled=true; button.textContent="Saving…";
    const payload={
      shop_id:state.shop.id,
      category_id:String(fd.get("category_id")||"")||null,
      name:String(fd.get("name")||"").trim(),
      sku:String(fd.get("sku")||"").trim(),
      barcode:String(fd.get("barcode")||"").trim()||null,
      brand:String(fd.get("brand")||"").trim()||null,
      item_type:String(fd.get("item_type")||"part"),
      cost_price:Number(fd.get("cost_price")||0),
      selling_price:Number(fd.get("selling_price")||0),
      reorder_level:Number(fd.get("reorder_level")||0),
      unit:String(fd.get("unit")||"pc").trim()||"pc",
      part_number:String(fd.get("part_number")||"").trim()||null,
      shelf_location:String(fd.get("shelf_location")||"").trim()||null,
      description:String(fd.get("description")||"").trim()||null,
      updated_at:new Date().toISOString()
    };
    try{
      let saved;
      if(product){
        const res=await supabase.from("products").update(payload).eq("id",product.id).eq("shop_id",state.shop.id).select("id").single();
        if(res.error) throw res.error;
        saved=res.data;
      }else{
        const res=await supabase.from("products").insert({...payload,stock_quantity:0,is_active:true}).select("id").single();
        if(res.error) throw res.error;
        saved=res.data;
        const opening=Number(fd.get("opening_stock")||0);
        if(opening>0){
          const adj=await supabase.rpc("adjust_inventory_stock",{p_product_id:saved.id,p_quantity_delta:opening,p_reason:"opening",p_notes:"Opening stock"});
          if(adj.error) throw adj.error;
        }
      }
      closeModal(); toast(product?"Product updated.":"Product added.","success"); await pageInventory(root);
    }catch(error){
      toast(friendlyError(error),"error"); button.disabled=false; button.textContent=product?"Save changes":"Add product";
    }
  });
}

function openStockModal(root, product) {
  showModal(`
    <h2>Adjust stock</h2>
    <p><strong>${esc(product.name)}</strong> · Current stock: ${number(product.stock_quantity)} ${esc(product.unit||"pc")}</p>
    <form id="stock-form" class="form">
      <div class="field"><label>Quantity change</label><input class="input" type="number" step="0.01" name="delta" required placeholder="Use +10 to add or -2 to deduct"></div>
      <div class="field"><label>Reason</label><select class="input" name="reason"><option value="adjustment">Manual adjustment</option><option value="opening">Opening stock</option><option value="return">Customer/Supplier return</option><option value="damage">Damaged stock</option><option value="theft">Lost/Theft</option></select></div>
      <div class="field"><label>Notes</label><textarea class="input" name="notes" placeholder="Why is stock being adjusted?"></textarea></div>
      <div class="modal-actions"><button type="button" id="close-stock" class="btn btn-secondary">Cancel</button><button type="submit" class="btn btn-primary">Apply adjustment</button></div>
    </form>`);
  document.querySelector("#close-stock")?.addEventListener("click",closeModal);
  document.querySelector("#stock-form")?.addEventListener("submit",async event=>{
    event.preventDefault();
    const fd=new FormData(event.currentTarget);
    const delta=Number(fd.get("delta")||0);
    if(!delta) return toast("Enter a non-zero stock adjustment.","error");
    const {error}=await supabase.rpc("adjust_inventory_stock",{
      p_product_id:product.id,
      p_quantity_delta:delta,
      p_reason:String(fd.get("reason")||"adjustment"),
      p_notes:String(fd.get("notes")||"").trim()||null
    });
    if(error) return toast(friendlyError(error),"error");
    closeModal(); toast("Stock adjusted and movement recorded.","success"); await pageInventory(root);
  });
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
    const details = error ? await functionErrorDetails(error) : null;
    const message =
      data?.error ||
      details?.error ||
      details?.message ||
      details?.msg ||
      error;
    toast(friendlyError(message), "error");
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

async function pageSupport(root) {
  const { data: threads, error } = await supabase.from("support_threads")
    .select("id,subject,status,priority,last_message_at,created_at")
    .eq("shop_id",state.shop.id)
    .order("last_message_at",{ascending:false});
  if(error) throw error;
  const list=threads||[];
  if(!state.supportThreadId || !list.some(t=>t.id===state.supportThreadId)) state.supportThreadId=list[0]?.id||null;

  root.innerHTML=`
    ${head("Support Chat","Talk directly with MotoPOS support",'<button id="new-support" class="btn btn-primary">New conversation</button>')}
    <div class="chat-layout">
      <div class="chat-list">
        ${list.map(t=>`<button class="chat-thread ${t.id===state.supportThreadId?"active":""}" data-thread="${t.id}"><strong>${esc(t.subject)}</strong><span>${esc(t.status)} · ${niceDate(t.last_message_at,true)}</span></button>`).join("")||'<div class="empty"><strong>No conversations</strong>Start a support chat whenever you need help.</div>'}
      </div>
      <div id="support-chat-panel" class="chat-panel"></div>
    </div>`;

  document.querySelector("#new-support")?.addEventListener("click",()=>openNewSupportThread(root));
  root.querySelectorAll(".chat-thread").forEach(btn=>btn.addEventListener("click",async()=>{
    state.supportThreadId=btn.dataset.thread;
    await pageSupport(root);
  }));
  await renderSupportChatPanel(document.querySelector("#support-chat-panel"),state.supportThreadId,false);
}

function openNewSupportThread(root) {
  showModal(`
    <h2>New support conversation</h2>
    <p>Describe what you need help with. Your message will appear in the MotoPOS Developer Support inbox.</p>
    <form id="new-support-form" class="form">
      <div class="field"><label>Subject</label><input class="input" name="subject" minlength="3" maxlength="160" required placeholder="Example: Printer not connecting"></div>
      <div class="field"><label>Priority</label><select class="input" name="priority"><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option><option value="low">Low</option></select></div>
      <div class="field"><label>Message</label><textarea class="input" name="message" minlength="1" maxlength="4000" required placeholder="Tell us what happened…"></textarea></div>
      <div class="modal-actions"><button type="button" id="close-support-new" class="btn btn-secondary">Cancel</button><button type="submit" class="btn btn-primary">Start chat</button></div>
    </form>`);
  document.querySelector("#close-support-new")?.addEventListener("click",closeModal);
  document.querySelector("#new-support-form")?.addEventListener("submit",async event=>{
    event.preventDefault();
    const fd=new FormData(event.currentTarget);
    const {data:thread,error}=await supabase.from("support_threads").insert({
      shop_id:state.shop.id,
      created_by:state.user.id,
      subject:String(fd.get("subject")||"").trim(),
      priority:String(fd.get("priority")||"normal"),
      status:"open"
    }).select("id").single();
    if(error) return toast(friendlyError(error),"error");
    const msg=await supabase.from("support_messages").insert({
      thread_id:thread.id,
      shop_id:state.shop.id,
      sender_id:state.user.id,
      sender_type:"customer",
      body:String(fd.get("message")||"").trim()
    });
    if(msg.error) return toast(friendlyError(msg.error),"error");
    state.supportThreadId=thread.id;
    closeModal(); toast("Support conversation started.","success"); await pageSupport(root);
  });
}

async function renderSupportChatPanel(panel, threadId, adminMode) {
  if(state.supportChannel){
    await supabase.removeChannel(state.supportChannel);
    state.supportChannel=null;
  }
  if(!panel) return;
  if(!threadId){
    panel.innerHTML='<div class="empty" style="margin:auto"><strong>Select a conversation</strong>Messages will appear here.</div>';
    return;
  }

  const [threadRes,messageRes]=await Promise.all([
    supabase.from("support_threads").select("id,shop_id,subject,status,priority,last_message_at,shop:shops(name)").eq("id",threadId).single(),
    supabase.from("support_messages").select("id,body,sender_type,created_at,sender_id").eq("thread_id",threadId).order("created_at")
  ]);
  if(threadRes.error){panel.innerHTML=`<div class="empty"><strong>Unable to load chat</strong>${esc(friendlyError(threadRes.error))}</div>`;return;}
  if(messageRes.error){panel.innerHTML=`<div class="empty"><strong>Unable to load messages</strong>${esc(friendlyError(messageRes.error))}</div>`;return;}
  const t=threadRes.data;
  const messages=messageRes.data||[];

  panel.innerHTML=`
    <div class="chat-head">
      <div><strong>${esc(t.subject)}</strong><div class="help">${adminMode?esc(t.shop?.name||"Shop")+" · ":""}${esc(t.priority)} priority · ${esc(t.status)}</div></div>
      ${adminMode?`<select id="support-status" class="input" style="width:auto;height:38px"><option value="open" ${t.status==="open"?"selected":""}>Open</option><option value="pending" ${t.status==="pending"?"selected":""}>Pending</option><option value="closed" ${t.status==="closed"?"selected":""}>Closed</option></select>`:pill(t.status)}
    </div>
    <div class="chat-messages" id="support-message-list">
      ${messages.map(m=>{
        const mine=adminMode?m.sender_type==="support":m.sender_type==="customer";
        return `<div class="chat-bubble ${mine?"support":""}"><p>${esc(m.body)}</p><small>${m.sender_type==="support"?"MotoPOS Support":adminMode?"Customer":"You"} · ${niceDate(m.created_at,true)}</small></div>`;
      }).join("")||'<div class="empty"><strong>No messages yet</strong>Send the first message below.</div>'}
    </div>
    <form id="support-compose" class="chat-compose">
      <input class="input" name="message" maxlength="4000" autocomplete="off" placeholder="${t.status==="closed"&&!adminMode?"Conversation closed":"Type a message…"}" ${t.status==="closed"&&!adminMode?"disabled":""}>
      <button class="btn btn-primary" type="submit" ${t.status==="closed"&&!adminMode?"disabled":""}>Send</button>
    </form>`;

  const list=panel.querySelector("#support-message-list");
  if(list) list.scrollTop=list.scrollHeight;

  panel.querySelector("#support-status")?.addEventListener("change",async e=>{
    const {error}=await supabase.from("support_threads").update({status:e.target.value,updated_at:new Date().toISOString()}).eq("id",threadId);
    if(error) return toast(friendlyError(error),"error");
    toast("Support status updated.","success");
  });

  panel.querySelector("#support-compose")?.addEventListener("submit",async event=>{
    event.preventDefault();
    const fd=new FormData(event.currentTarget);
    const body=String(fd.get("message")||"").trim();
    if(!body) return;
    const {error}=await supabase.from("support_messages").insert({
      thread_id:threadId,
      shop_id:t.shop_id,
      sender_id:state.user.id,
      sender_type:adminMode?"support":"customer",
      body
    });
    if(error) return toast(friendlyError(error),"error");
    event.currentTarget.reset();
    await renderSupportChatPanel(panel,threadId,adminMode);
  });

  state.supportChannel=supabase.channel(`support-${threadId}-${Date.now()}`)
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"support_messages",filter:`thread_id=eq.${threadId}`},async()=> {
      if(document.body.contains(panel)) await renderSupportChatPanel(panel,threadId,adminMode);
    })
    .subscribe();
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

  const path=currentPath();
  const section=path==="admin/users"?"users":path==="admin/support"?"support":"clients";

  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand"><span class="brand-logo">M</span><span>MotoPOS</span></div>
        <div class="shop-chip"><strong>Developer Control</strong><span>System administrator</span></div>
        <nav class="nav-list">
          <a class="nav-item ${section==="clients"?"active":""}" href="#/admin"><span>Clients & Licenses</span><span class="nav-badge">ADMIN</span></a>
          <a class="nav-item ${section==="users"?"active":""}" href="#/admin/users"><span>Users & Emails</span></a>
          <a class="nav-item ${section==="support"?"active":""}" href="#/admin/support"><span>Support Inbox</span></a>
          <a class="nav-item" href="#/manual"><span>App Manual</span><span class="nav-badge">HELP</span></a>
          ${state.shop ? '<a class="nav-item" href="#/dashboard/overview"><span>My Shop</span></a>' : ""}
        </nav>
        <div class="sidebar-bottom"><button id="admin-sign-out" class="btn btn-secondary" style="width:100%">Sign out</button></div>
      </aside>
      <div class="main">
        <header class="topbar"><div class="topbar-title"><strong>MotoPOS Control Center</strong><span>Users, licenses, support and clients</span></div><div class="user-pill"><div class="avatar">A</div><div class="user-copy"><strong style="font-size:12px">${esc(state.user?.email||"")}</strong><div class="help">system admin</div></div></div></header>
        <main id="admin-content" class="content"><div class="loading-block"></div></main>
      </div>
    </div>`;

  document.querySelector("#admin-sign-out")?.addEventListener("click", async()=>{
    await supabase.auth.signOut(); state.session=state.user=null; setHash("");
  });

  if(section==="users") await loadAdminUsers();
  else if(section==="support") await loadAdminSupport();
  else await loadAdminClients();
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

async function loadAdminUsers() {
  const root=document.querySelector("#admin-content");
  if(!root) return;
  const {data,error}=await supabase.functions.invoke("admin-users",{body:{action:"list"}});
  if(error||data?.error){
    root.innerHTML=`<div class="empty"><strong>Unable to load users</strong>${esc(friendlyError(data?.error||error))}</div>`;
    return;
  }
  const users=data?.users||[];
  root.innerHTML=`
    ${head("Users & Emails","Manage MotoPOS Auth accounts safely")}
    <div class="card danger-zone" style="margin-bottom:14px"><div class="help"><strong style="color:var(--text)">Permanent Delete</strong> removes an Auth account only when it has no protected business history. <strong style="color:var(--text)">Remove Email & Disable</strong> is the safe option for accounts linked to old sales or service records.</div></div>
    <div class="table-wrap"><table><thead><tr><th>User</th><th>Email</th><th>Membership</th><th>Email</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      ${users.map(u=>{
        const membership=(u.memberships||[]).filter(m=>m.is_active).map(m=>`${m.shop?.name||"Shop"} · ${m.role}`).join(", ");
        const banned=u.banned_until && new Date(u.banned_until)>new Date();
        return `<tr>
          <td><strong>${esc(u.display_name||"MotoPOS User")}</strong><div class="help">${esc(u.id.slice(0,8))}… ${u.is_system_admin?"· SYSTEM ADMIN":""}</div></td>
          <td>${esc(u.email||"—")}</td>
          <td>${esc(membership||"No active shop")}</td>
          <td>${pill(u.email_confirmed_at?"verified":"unverified")}</td>
          <td>${pill(banned||u.profile_active===false?"disabled":"active")}</td>
          <td><div class="actions">
            ${u.is_system_admin?'<span class="help">Protected admin</span>':`
              <button class="btn btn-secondary btn-sm user-ban" data-id="${u.id}" data-ban="${banned?"0":"1"}">${banned?"Enable":"Disable"}</button>
              <button class="btn btn-danger btn-sm user-anonymize" data-id="${u.id}" data-email="${esc(u.email||"")}">Remove Email & Disable</button>
              <button class="btn btn-danger btn-sm user-delete" data-id="${u.id}" data-email="${esc(u.email||"")}">Delete</button>
            `}
          </div></td>
        </tr>`;
      }).join("")||'<tr><td colspan="6">No users found.</td></tr>'}
    </tbody></table></div>`;

  root.querySelectorAll(".user-ban").forEach(btn=>btn.addEventListener("click",()=>adminUserAction(btn.dataset.id,btn.dataset.ban==="1"?"ban":"unban")));
  root.querySelectorAll(".user-anonymize").forEach(btn=>btn.addEventListener("click",async()=>{
    if(!confirm(`Remove the original email ${btn.dataset.email} and permanently disable login? Business history will be preserved.`)) return;
    await adminUserAction(btn.dataset.id,"disable_anonymize");
  }));
  root.querySelectorAll(".user-delete").forEach(btn=>btn.addEventListener("click",async()=>{
    if(!confirm(`Permanently delete ${btn.dataset.email}? This only works when the account has no protected business history.`)) return;
    await adminUserAction(btn.dataset.id,"delete");
  }));
}

async function adminUserAction(userId,action){
  const {data,error}=await supabase.functions.invoke("admin-users",{body:{action,user_id:userId}});
  const details = error ? await functionErrorDetails(error) : null;
  const result = data || details;

  if(error || result?.error){
    if(action==="delete" && result?.can_anonymize){
      showModal(`
        <h2>Permanent deletion blocked</h2>
        <p>This account is linked to existing MotoPOS business history. Permanently deleting the Auth user could break old sales, shop ownership, service records, inventory history or audit logs.</p>
        ${Array.isArray(result.last_owner_shops) && result.last_owner_shops.length ? `
          <div class="card danger-zone" style="margin:14px 0">
            <div class="help"><strong style="color:var(--text)">Last owner of</strong><br>${result.last_owner_shops.map(x=>esc(x)).join("<br>")}</div>
          </div>` : ""}
        ${Array.isArray(result.references) && result.references.length ? `
          <div class="card danger-zone" style="margin:14px 0">
            <div class="help"><strong style="color:var(--text)">Linked records</strong><br>${result.references.map(x=>esc(x)).join("<br>")}</div>
          </div>` : ""}
        <p><strong>Recommended:</strong> remove the original email and disable the account. Historical transactions stay intact, but the person can no longer sign in.</p>
        <div class="modal-actions">
          <button id="cancel-safe-delete" class="btn btn-secondary">Cancel</button>
          <button id="safe-delete-user" class="btn btn-danger">Remove Email & Disable</button>
        </div>`);
      document.querySelector("#cancel-safe-delete")?.addEventListener("click",closeModal);
      document.querySelector("#safe-delete-user")?.addEventListener("click",async()=>{
        closeModal();
        await adminUserAction(userId,"disable_anonymize");
      });
      return;
    }

    toast(result?.error || friendlyError(error),"error");
    return;
  }

  toast(
    action==="delete"?"User permanently deleted.":
    action==="disable_anonymize"?"Original email removed and account disabled. Business history was preserved.":
    action==="ban"?"User disabled.":"User enabled.",
    "success"
  );
  await loadAdminUsers();
}

async function loadAdminSupport() {
  const root=document.querySelector("#admin-content");
  if(!root) return;
  const {data,error}=await supabase.from("support_threads")
    .select("id,shop_id,subject,status,priority,last_message_at,created_at,shop:shops(name)")
    .order("last_message_at",{ascending:false})
    .limit(200);
  if(error){
    root.innerHTML=`<div class="empty"><strong>Unable to load support inbox</strong>${esc(friendlyError(error))}</div>`;
    return;
  }
  const threads=data||[];
  if(!state.supportThreadId || !threads.some(t=>t.id===state.supportThreadId)) state.supportThreadId=threads[0]?.id||null;
  root.innerHTML=`
    ${head("Support Inbox","Live conversations from MotoPOS client shops")}
    <section class="metrics">
      <article class="metric"><div class="metric-label">Open</div><div class="metric-value">${number(threads.filter(t=>t.status==="open").length)}</div><div class="metric-sub">Need attention</div></article>
      <article class="metric"><div class="metric-label">Pending</div><div class="metric-value">${number(threads.filter(t=>t.status==="pending").length)}</div><div class="metric-sub">Waiting / in progress</div></article>
      <article class="metric"><div class="metric-label">Urgent</div><div class="metric-value">${number(threads.filter(t=>t.priority==="urgent"&&t.status!=="closed").length)}</div><div class="metric-sub">High priority queue</div></article>
      <article class="metric"><div class="metric-label">Closed</div><div class="metric-value">${number(threads.filter(t=>t.status==="closed").length)}</div><div class="metric-sub">Resolved conversations</div></article>
    </section>
    <div class="chat-layout">
      <div class="chat-list">${threads.map(t=>`<button class="chat-thread ${t.id===state.supportThreadId?"active":""}" data-thread="${t.id}"><strong>${esc(t.shop?.name||"Shop")} · ${esc(t.subject)}</strong><span>${esc(t.priority)} · ${esc(t.status)} · ${niceDate(t.last_message_at,true)}</span></button>`).join("")||'<div class="empty"><strong>No support requests</strong>Client chats will appear here.</div>'}</div>
      <div id="admin-support-panel" class="chat-panel"></div>
    </div>`;
  root.querySelectorAll(".chat-thread").forEach(btn=>btn.addEventListener("click",async()=>{
    state.supportThreadId=btn.dataset.thread;
    await loadAdminSupport();
  }));
  await renderSupportChatPanel(document.querySelector("#admin-support-panel"),state.supportThreadId,true);
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


function portalTokenFromPath() {
  const path = currentPath();
  const query = path.includes("?") ? path.slice(path.indexOf("?") + 1) : "";
  return new URLSearchParams(query).get("token") || "";
}

function portalStatus(value) {
  return pill(value || "—");
}

async function renderCustomerPortal() {
  const token = portalTokenFromPath();

  if (!token) {
    app.innerHTML = [
      '<div class="portal-shell">',
        '<div class="portal-wrap">',
          '<div class="portal-brand"><span class="brand-logo">M</span><span>MotoPOS Customer Portal</span></div>',
          '<div class="portal-card portal-error-card">',
            '<span class="eyebrow">Private customer access</span>',
            '<h1>Portal link required</h1>',
            '<p>This page needs the secure customer link issued by the motorcycle shop.</p>',
            '<a class="btn btn-secondary" href="#/">Back to MotoPOS</a>',
          '</div>',
        '</div>',
      '</div>'
    ].join("");
    return;
  }

  app.innerHTML = [
    '<div class="portal-shell">',
      '<div class="portal-wrap">',
        '<div class="portal-brand"><span class="brand-logo">M</span><span>MotoPOS Customer Portal</span></div>',
        '<div class="portal-card">',
          '<div class="portal-loading"><span class="spinner"></span><strong>Loading your service records…</strong></div>',
        '</div>',
      '</div>',
    '</div>'
  ].join("");

  const result = await supabase.rpc("portal_customer_snapshot", { p_token: token });
  if (result.error) {
    app.innerHTML = [
      '<div class="portal-shell">',
        '<div class="portal-wrap">',
          '<div class="portal-brand"><span class="brand-logo">M</span><span>MotoPOS Customer Portal</span></div>',
          '<div class="portal-card portal-error-card">',
            '<span class="eyebrow">Secure link</span>',
            '<h1>Link unavailable</h1>',
            '<p>', esc(friendlyError(result.error)), '</p>',
            '<p class="muted">The link may be invalid, expired, or revoked. Request a new customer portal link from your shop.</p>',
          '</div>',
        '</div>',
      '</div>'
    ].join("");
    return;
  }

  const snapshot = result.data || {};
  const shop = snapshot.shop || {};
  const customer = snapshot.customer || {};
  const motorcycles = Array.isArray(snapshot.motorcycles) ? snapshot.motorcycles : [];
  const jobs = Array.isArray(snapshot.jobs) ? snapshot.jobs : [];
  const warranties = Array.isArray(snapshot.warranties) ? snapshot.warranties : [];
  const bookings = Array.isArray(snapshot.bookings) ? snapshot.bookings : [];

  const motorcycleOptions = motorcycles.length
    ? motorcycles.map(function (bike) {
        const label = [bike.make, bike.model, bike.variant, bike.plate_number].filter(Boolean).join(" • ");
        return '<option value="' + esc(bike.id) + '">' + esc(label || "Motorcycle") + '</option>';
      }).join("")
    : '<option value="">No motorcycle on file</option>';

  const motorcycleCards = motorcycles.length
    ? motorcycles.map(function (bike) {
        return [
          '<div class="portal-list-item">',
            '<div>',
              '<strong>', esc([bike.make, bike.model].filter(Boolean).join(" ") || "Motorcycle"), '</strong>',
              '<span>', esc([bike.variant, bike.model_year, bike.plate_number].filter(Boolean).join(" • ") || "No plate details"), '</span>',
            '</div>',
            '<b>', esc(bike.odometer_km != null ? number(bike.odometer_km) + " km" : "—"), '</b>',
          '</div>'
        ].join("");
      }).join("")
    : '<div class="portal-empty">No motorcycle records yet.</div>';

  const jobCards = jobs.length
    ? jobs.map(function (job) {
        return [
          '<div class="portal-list-item portal-list-stack">',
            '<div class="portal-row">',
              '<div>',
                '<strong>', esc(job.job_number || "Job order"), '</strong>',
                '<span>', esc(niceDate(job.created_at, true)), '</span>',
              '</div>',
              portalStatus(job.status),
            '</div>',
            '<p>', esc(job.complaint || "No complaint / service note recorded."), '</p>',
            job.estimated_completion ? '<small>Estimated completion: ' + esc(niceDate(job.estimated_completion, true)) + '</small>' : '',
          '</div>'
        ].join("");
      }).join("")
    : '<div class="portal-empty">No service job history yet.</div>';

  const warrantyCards = warranties.length
    ? warranties.map(function (warranty) {
        return [
          '<div class="portal-list-item portal-list-stack">',
            '<div class="portal-row">',
              '<div>',
                '<strong>', esc(warranty.description || "Warranty"), '</strong>',
                '<span>', esc((warranty.warranty_type || "warranty") + " • " + (warranty.starts_on || "—") + " to " + (warranty.expires_on || "No expiry")), '</span>',
              '</div>',
              portalStatus(warranty.status),
            '</div>',
          '</div>'
        ].join("");
      }).join("")
    : '<div class="portal-empty">No warranty records available.</div>';

  const bookingCards = bookings.length
    ? bookings.map(function (booking) {
        return [
          '<div class="portal-list-item">',
            '<div>',
              '<strong>', esc(niceDate(booking.requested_at, true)), '</strong>',
              '<span>', esc(booking.service_notes || "Service appointment"), '</span>',
            '</div>',
            portalStatus(booking.status),
          '</div>'
        ].join("");
      }).join("")
    : '<div class="portal-empty">No bookings yet.</div>';

  app.innerHTML = [
    '<div class="portal-shell">',
      '<div class="portal-wrap">',
        '<header class="portal-header">',
          '<div class="portal-brand"><span class="brand-logo">M</span><span>MotoPOS Customer Portal</span></div>',
          '<div class="portal-shop">',
            '<strong>', esc(shop.name || "MotoPOS Shop"), '</strong>',
            '<span>', esc([shop.phone, shop.email].filter(Boolean).join(" • ") || "Customer service portal"), '</span>',
          '</div>',
        '</header>',

        '<section class="portal-hero-card">',
          '<div>',
            '<span class="eyebrow">Private service dashboard</span>',
            '<h1>Hello, ', esc(customer.name || "Rider"), '</h1>',
            '<p>Review your motorcycle records, service progress, warranty coverage and appointments in one place.</p>',
          '</div>',
          '<div class="portal-wallet">',
            '<div><span>Loyalty points</span><strong>', esc(number(customer.loyalty_points || 0)), '</strong></div>',
            '<div><span>Store credit</span><strong>', esc(money(customer.store_credit_balance || 0)), '</strong></div>',
          '</div>',
        '</section>',

        '<div class="portal-grid">',
          '<section class="portal-card">',
            '<div class="portal-section-head"><div><span class="eyebrow">Garage</span><h2>Your motorcycles</h2></div></div>',
            motorcycleCards,
          '</section>',

          '<section class="portal-card">',
            '<div class="portal-section-head"><div><span class="eyebrow">Workshop</span><h2>Service history</h2></div></div>',
            jobCards,
          '</section>',

          '<section class="portal-card">',
            '<div class="portal-section-head"><div><span class="eyebrow">Coverage</span><h2>Warranty</h2></div></div>',
            warrantyCards,
          '</section>',

          '<section class="portal-card">',
            '<div class="portal-section-head"><div><span class="eyebrow">Appointments</span><h2>Bookings</h2></div></div>',
            bookingCards,
          '</section>',
        '</div>',

        '<section class="portal-card portal-booking-card">',
          '<div class="portal-section-head">',
            '<div><span class="eyebrow">Book a visit</span><h2>Request service</h2></div>',
            '<span class="portal-private">Secure customer link</span>',
          '</div>',
          '<div class="portal-form-grid">',
            '<label><span>Motorcycle</span><select id="portal-bike">', motorcycleOptions, '</select></label>',
            '<label><span>Preferred date & time</span><input id="portal-booking-at" type="datetime-local" /></label>',
            '<label class="portal-full"><span>Requested service / concern</span><textarea id="portal-booking-notes" rows="4" placeholder="Example: change oil, check front brake, tune-up…"></textarea></label>',
          '</div>',
          '<div class="portal-form-actions">',
            '<span id="portal-booking-message" class="muted">The shop will review and confirm your request.</span>',
            '<button id="portal-booking-submit" class="btn btn-primary" type="button">Request booking</button>',
          '</div>',
        '</section>',

        '<footer class="portal-footer">',
          '<span>Powered by MotoPOS</span>',
          '<span>', esc(shop.address || "Motorcycle parts & service management"), '</span>',
        '</footer>',
      '</div>',
    '</div>'
  ].join("");

  const dateInput = document.querySelector("#portal-booking-at");
  if (dateInput) {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset() + 60);
    dateInput.min = now.toISOString().slice(0, 16);
  }

  document.querySelector("#portal-booking-submit")?.addEventListener("click", async function () {
    const button = document.querySelector("#portal-booking-submit");
    const message = document.querySelector("#portal-booking-message");
    const motorcycleId = document.querySelector("#portal-bike")?.value || null;
    const localDate = document.querySelector("#portal-booking-at")?.value || "";
    const notes = document.querySelector("#portal-booking-notes")?.value?.trim() || "";

    if (!localDate) {
      if (message) message.textContent = "Choose your preferred date and time.";
      return;
    }

    const parsed = new Date(localDate);
    if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
      if (message) message.textContent = "Please choose a future appointment time.";
      return;
    }

    if (button) {
      button.disabled = true;
      button.textContent = "Sending…";
    }
    if (message) message.textContent = "Sending booking request…";

    const booking = await supabase.rpc("portal_create_booking", {
      p_token: token,
      p_motorcycle_id: motorcycleId || null,
      p_requested_at: parsed.toISOString(),
      p_service_notes: notes || null
    });

    if (booking.error) {
      if (message) message.textContent = friendlyError(booking.error);
      if (button) {
        button.disabled = false;
        button.textContent = "Request booking";
      }
      return;
    }

    toast("Booking request sent.", "success");
    await renderCustomerPortal();
  });
}

async function route() {
  const path = currentPath();

  if (new URLSearchParams(location.search).get("email-confirmed") === "1") {
    renderEmailVerified();
    return;
  }

  if (path === "manual") {
    renderManual();
    return;
  }

  if (path === "portal" || path.startsWith("portal?")) {
    await renderCustomerPortal();
    return;
  }

  if (!state.session) {
    if (path.startsWith("login")) renderAuth();
    else renderLanding();
    return;
  }

  if (path === "admin" || path.startsWith("admin/")) {
    await renderAdmin();
    return;
  }

  if (!state.membership || !state.shop) {
    if (state.isSystemAdmin && (path === "admin" || path.startsWith("admin/"))) await renderAdmin();
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
