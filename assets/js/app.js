  /* =========================================================
   ApproveHub — Static Demo App (localStorage, hash routing)
   SPLIT FILE (Part 1 of 2): paste PART 4 immediately after this.
   ========================================================= */

(() => {
  "use strict";

  /* =========================
     Compliance strings (exact)
  ========================= */
  const COMPLIANCE = {
    VAT_DISCLAIMER:
      "VAT depends on the project and each supplier’s VAT status. Savings vary. We charge VAT on our management fee where applicable. Not tax advice.",
    FUNDS_STATEMENT:
      "We do not hold client funds. Funds are held and released by our escrow/PBA partner.",
  };

  /* =========================
     App constants
  ========================= */
  const APP = {
    name: "ApproveHub",
    storageKey: "approvehub_demo_db",
    schemaVersion: 1,
    roleKey: "approvehub_role",
    themeKey: "approvehub_theme",
  };

  const ROLES = ["client", "manager", "payee", "accountant", "admin"];

  const PERMS = {
    client: {
      nav: ["jobs", "payments", "approvals", "disputes", "messages", "company", "reports", "settings"],
      canEdit: false,
      canApproveStep1: false,
      canApproveStep2: true,
      canMessage: true,
      canDispute: true,
      canExport: true,
      canConfirmBank: false,
      canSendToPartner: false,
    },
    manager: {
      nav: ["jobs", "payments", "approvals", "disputes", "messages", "company", "reports", "settings"],
      canEdit: true,
      canApproveStep1: true,
      canApproveStep2: false,
      canMessage: true,
      canDispute: true,
      canExport: true,
      canConfirmBank: true,
      canSendToPartner: true,
    },
    payee: {
      nav: ["payments", "company", "settings"],
      canEdit: false,
      canApproveStep1: false,
      canApproveStep2: false,
      canMessage: false,
      canDispute: false,
      canExport: false,
      canConfirmBank: false,
      canSendToPartner: false,
    },
    accountant: {
      nav: ["jobs", "payments", "reports", "settings"],
      canEdit: false,
      canApproveStep1: false,
      canApproveStep2: false,
      canMessage: false,
      canDispute: false,
      canExport: true,
      canConfirmBank: false,
      canSendToPartner: false,
    },
    admin: {
      nav: ["jobs", "payments", "approvals", "disputes", "messages", "company", "reports", "settings"],
      canEdit: true,
      canApproveStep1: true,
      canApproveStep2: true,
      canMessage: true,
      canDispute: true,
      canExport: true,
      canConfirmBank: true,
      canSendToPartner: true,
    },
  };

  /* =========================
     DOM helpers
  ========================= */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function h(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k === "text") el.textContent = String(v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === null || v === undefined || v === false) continue;
      else el.setAttribute(k, String(v));
    }
    const list = Array.isArray(children) ? children : [children];
    for (const ch of list) {
      if (ch === null || ch === undefined || ch === false) continue;
      el.appendChild(typeof ch === "string" ? document.createTextNode(ch) : ch);
    }
    return el;
  }

  function mount(node) {
    const view = $("#view");
    if (!view) return;
    view.innerHTML = "";
    view.appendChild(node);
    $("#main")?.focus?.({ preventScroll: true });
  }

  /* =========================
     Utilities
  ========================= */
  const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 2 });
  const money = (n) => GBP.format(Number.isFinite(Number(n)) ? Number(n) : 0);

  function clamp(n, min, max) {
    const x = Number(n);
    if (!Number.isFinite(x)) return min;
    return Math.max(min, Math.min(max, x));
  }

  function safeFile(name) {
    return String(name || "file")
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "_")
      .replaceAll(/^_+|_+$/g, "")
      .slice(0, 70);
  }

  function uid(prefix = "id") {
    const rnd = () => Math.random().toString(16).slice(2);
    return `${prefix}_${rnd()}_${Date.now().toString(16)}`;
  }

  function fmtDateTime(ts) {
    try {
      const d = new Date(ts);
      return d.toLocaleString("en-GB", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    } catch {
      return String(ts);
    }
  }

  function downloadText(filename, text, mime = "text/plain") {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function toast(title, desc = "") {
    const root = $("#toasts");
    if (!root) return;
    const el = h("div", { class: "toast" }, [
      h("div", { class: "t", text: title }),
      h("div", { class: "d", text: desc }),
    ]);
    root.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  /* =========================
     Modal
  ========================= */
  function openModal({ title = "Dialog", body, footer, onReady } = {}) {
    const root = $("#modalRoot");
    if (!root) return;

    const close = () => {
      root.setAttribute("aria-hidden", "true");
      root.innerHTML = "";
    };

    root.innerHTML = "";
    root.setAttribute("aria-hidden", "false");

    const modal = h("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": title }, [
      h("div", { class: "modal-head" }, [
        h("div", {}, [h("div", { class: "card-title", text: title })]),
        h("button", { class: "modal-x", type: "button", "aria-label": "Close", onclick: close }, "✕"),
      ]),
      h("div", { class: "modal-body" }, body || h("div", {}, "")),
      h("div", { class: "modal-foot" }, footer || h("div", {}, "")),
    ]);

    root.appendChild(modal);

    const escHandler = (e) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", escHandler, { once: true });

    on(root, "click", (e) => {
      if (e.target === root) close();
    });

    onReady?.({ root, close });
  }

  /* =========================
     Global state
  ========================= */
  const state = {
    role: "manager",
    db: null,
  };

  function perms() {
    return PERMS[state.role] || PERMS.manager;
  }

  function canAccess(navKey) {
    return perms().nav.includes(navKey);
  }

  /* =========================
     DB schema + persistence
  ========================= */
  function defaultDb() {
    return {
      schemaVersion: APP.schemaVersion,
      companyProfile: {
        name: "ApproveHub Demo Ltd",
        address: "London, United Kingdom",
        currency: "GBP",
        partnerLabel: "our escrow/PBA partner",
      },
      users: [
        { id: "u_manager", role: "manager", name: "Jordan Patel" },
        { id: "u_client", role: "client", name: "Avery Singh" },
        { id: "u_payee", role: "payee", name: "Payee Contact" },
        { id: "u_accountant", role: "accountant", name: "Casey Morgan" },
        { id: "u_admin", role: "admin", name: "Demo Admin" },
      ],
      jobs: [],
      payees: [],
      invoices: [],
      milestones: [],
      releases: [],
      disputes: [],
      messages: [],
      auditLog: [],
      meta: { seededAt: null, lastBackupAt: null },
    };
  }

  function loadDbRaw() {
    try {
      const raw = localStorage.getItem(APP.storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveDb() {
    try {
      localStorage.setItem(APP.storageKey, JSON.stringify(state.db));
    } catch {
      toast("Storage error", "Could not save to localStorage.");
    }
  }

  function migrate(db) {
    if (!db || typeof db !== "object") return { ok: false, reason: "Missing db" };
    const v = Number(db.schemaVersion || 0);

    if (v === APP.schemaVersion) return { ok: true, db };

    // Minimal migrate: v0 -> v1
    if (v === 0) {
      db.schemaVersion = 1;
      db.meta = db.meta || { seededAt: null, lastBackupAt: null };
      for (const k of ["jobs", "payees", "invoices", "milestones", "releases", "disputes", "messages", "auditLog"]) {
        if (!Array.isArray(db[k])) db[k] = [];
      }
      return { ok: true, db };
    }

    return { ok: false, reason: `Schema mismatch (${v} vs ${APP.schemaVersion})` };
  }

  function audit(action, entityType, entityId, jobId = null, details = {}) {
    state.db.auditLog.unshift({
      id: uid("audit"),
      at: Date.now(),
      actorRole: state.role,
      action,
      entityType,
      entityId,
      jobId,
      details,
    });
    saveDb();
  }

  /* =========================
     Seed data
  ========================= */
  function seedIfNeeded() {
    if (state.db.meta.seededAt) return;

    const now = Date.now();
    state.db.meta.seededAt = now;

    // Payees (3)
    const p1 = {
      id: "payee_bromley_elec",
      name: "Bromley Electrical Ltd",
      type: "Contractor",
      email: "accounts@bromleyelectrical.example",
      phone: "+44 20 0000 1111",
      bank: { accountName: "Bromley Electrical Ltd", sortCode: "10-20-30", accountNumber: "12345678" },
      bankChanged: false,
      bankConfirmed: true,
      bankChangedAt: null,
      createdAt: now - 1000 * 60 * 60 * 24 * 40,
    };
    const p2 = {
      id: "payee_croydon_roof",
      name: "Croydon Roofing & Leadwork",
      type: "Contractor",
      email: "billing@croydonroofing.example",
      phone: "+44 20 0000 2222",
      bank: { accountName: "Croydon Roofing", sortCode: "20-10-40", accountNumber: "23456789" },
      bankChanged: true,
      bankConfirmed: false,
      bankChangedAt: now - 1000 * 60 * 60 * 24 * 3,
      createdAt: now - 1000 * 60 * 60 * 24 * 60,
    };
    const p3 = {
      id: "payee_southwark_timber",
      name: "Southwark Timber Merchants",
      type: "Supplier",
      email: "invoices@southwarktimber.example",
      phone: "+44 20 0000 3333",
      bank: { accountName: "Southwark Timber", sortCode: "30-20-10", accountNumber: "34567890" },
      bankChanged: false,
      bankConfirmed: true,
      bankChangedAt: null,
      createdAt: now - 1000 * 60 * 60 * 24 * 90,
    };
    state.db.payees.push(p1, p2, p3);

    // Jobs (5 open + 1 completed)
    const jobs = [
      {
        id: "job_hero_west_wickham",
        name: "West Wickham Loft Conversion",
        location: "West Wickham, London",
        status: "open",
        ringfencedBalance: 48250,
        createdAt: now - 1000 * 60 * 60 * 24 * 28,
        updatedAt: now - 1000 * 60 * 15,
        changeRequests: [
          {
            id: "cr_staircase_variation",
            title: "Variation: Staircase specification change",
            delta: 1450,
            managerApproved: true,
            clientApproved: false,
            createdAt: now - 1000 * 60 * 60 * 24 * 6,
          },
          {
            id: "cr_insulation_upgrade",
            title: "Variation: Insulation upgrade (additional boards)",
            delta: 980,
            managerApproved: true,
            clientApproved: true,
            createdAt: now - 1000 * 60 * 60 * 24 * 10,
          },
        ],
      },
      {
        id: "job_bromley_kitchen",
        name: "Bromley Kitchen Refurb",
        location: "Bromley, London",
        status: "open",
        ringfencedBalance: 19500,
        createdAt: now - 1000 * 60 * 60 * 24 * 16,
        updatedAt: now - 1000 * 60 * 60 * 3,
        changeRequests: [],
      },
      {
        id: "job_croydon_roof",
        name: "Croydon Roof Repair Programme",
        location: "Croydon, London",
        status: "open",
        ringfencedBalance: 11200,
        createdAt: now - 1000 * 60 * 60 * 24 * 9,
        updatedAt: now - 1000 * 60 * 60 * 4,
        changeRequests: [],
      },
      {
        id: "job_dulwich_fitout",
        name: "Dulwich Office Fit-Out",
        location: "Dulwich, London",
        status: "open",
        ringfencedBalance: 33500,
        createdAt: now - 1000 * 60 * 60 * 24 * 22,
        updatedAt: now - 1000 * 60 * 60 * 2,
        changeRequests: [],
      },
      {
        id: "job_greenwich_solar",
        name: "Greenwich Solar Install",
        location: "Greenwich, London",
        status: "open",
        ringfencedBalance: 27800,
        createdAt: now - 1000 * 60 * 60 * 24 * 12,
        updatedAt: now - 1000 * 60 * 60 * 5,
        changeRequests: [],
      },
      {
        id: "job_lewisham_done",
        name: "Lewisham Flat Renovation (Completed)",
        location: "Lewisham, London",
        status: "completed",
        ringfencedBalance: 0,
        createdAt: now - 1000 * 60 * 60 * 24 * 120,
        updatedAt: now - 1000 * 60 * 60 * 24 * 30,
        changeRequests: [],
      },
    ];
    state.db.jobs.push(...jobs);

    // Milestones for hero (11)
    const heroId = jobs[0].id;
    const ms = [
      { id: "ms1", title: "Deposit & mobilisation", amount: 5200, evidenceRequired: false, evidenceStatus: "N/A", approvalStatus: "Approved", releaseStatus: "Released" },
      { id: "ms2", title: "Structural steel (RSJs) installed", amount: 7400, evidenceRequired: true, evidenceStatus: "Provided", approvalStatus: "Approved", releaseStatus: "Sent" },
      { id: "ms3", title: "First fix electrics", amount: 3800, evidenceRequired: true, evidenceStatus: "Missing", approvalStatus: "Pending", releaseStatus: "Not requested" },
      { id: "ms4", title: "Roof alterations & dormer framing", amount: 6900, evidenceRequired: true, evidenceStatus: "Provided", approvalStatus: "Approved", releaseStatus: "Released" },
      { id: "ms5", title: "Insulation & vapour barrier", amount: 2400, evidenceRequired: true, evidenceStatus: "Provided", approvalStatus: "Approved", releaseStatus: "Not requested", changeRequestId: "cr_insulation_upgrade" },
      { id: "ms6", title: "Plasterboard & plaster skim", amount: 4100, evidenceRequired: false, evidenceStatus: "N/A", approvalStatus: "Pending", releaseStatus: "Not requested" },
      { id: "ms7", title: "Second fix electrics & testing", amount: 2200, evidenceRequired: true, evidenceStatus: "Missing", approvalStatus: "Pending", releaseStatus: "Not requested" },
      { id: "ms8", title: "Joinery & staircase", amount: 5600, evidenceRequired: true, evidenceStatus: "Provided", approvalStatus: "Pending", releaseStatus: "Not requested", changeRequestId: "cr_staircase_variation" },
      { id: "ms9", title: "Decoration & snagging", amount: 1800, evidenceRequired: false, evidenceStatus: "N/A", approvalStatus: "Pending", releaseStatus: "Not requested" },
      { id: "ms10", title: "Final completion & handover", amount: 3050, evidenceRequired: true, evidenceStatus: "Missing", approvalStatus: "Pending", releaseStatus: "Not requested" },
      { id: "ms11", title: "Contingency (if required)", amount: 1250, evidenceRequired: false, evidenceStatus: "N/A", approvalStatus: "Not started", releaseStatus: "Not requested" },
    ].map((m, i) => ({
      ...m,
      jobId: heroId,
      createdAt: now - 1000 * 60 * 60 * 24 * (20 - i),
      updatedAt: now - 1000 * 60 * 60 * 24 * (10 - i),
      payeeId: i % 3 === 0 ? p1.id : (i % 3 === 1 ? p2.id : p3.id),
    }));
    state.db.milestones.push(...ms);

    // Invoices for hero (28)
    const invStatuses = ["Draft", "Submitted", "Pending approval", "Approved", "Paid by client"];
    for (let i = 1; i <= 28; i++) {
      const payeeId = i % 3 === 0 ? p3.id : (i % 2 === 0 ? p2.id : p1.id);
      const base = 380 + i * 95;
      const totalToPayees = Math.round(base * (0.82 + (i % 5) * 0.02));
      const clientPaymentBeforeVat = totalToPayees + Math.round(450 + (i % 7) * 65);
      const status = i <= 3 ? "Paid by client" : invStatuses[i % invStatuses.length];
      state.db.invoices.push({
        id: `inv_${String(i).padStart(2, "0")}_hero`,
        jobId: heroId,
        title: `Invoice #${String(i).padStart(3, "0")}`,
        description: i % 4 === 0 ? "Materials + labour (variation items may apply)" : "Progress claim / stage payment",
        payeeId,
        status,
        totalToPayees,
        clientPaymentBeforeVat,
        feeVatRate: i % 6 === 0 ? 5 : 20,
        createdAt: now - 1000 * 60 * 60 * 24 * (30 - i),
        updatedAt: now - 1000 * 60 * 60 * 5,
        linkedMilestoneId: i <= 11 ? ms[i - 1].id : null,
      });
    }

    // Dispute example
    state.db.disputes.push({
      id: "disp_hero_ms3",
      jobId: heroId,
      targetType: "milestone",
      targetId: "ms3",
      status: "Under review",
      pauseRelease: true,
      createdAt: now - 1000 * 60 * 60 * 24 * 2,
      updatedAt: now - 1000 * 60 * 30,
      timeline: [
        { id: uid("dmsg"), at: now - 1000 * 60 * 60 * 24 * 2, actorRole: "client", type: "Opened", text: "Evidence for first fix electrics is incomplete. Please provide certificate and photos." },
        { id: uid("dmsg"), at: now - 1000 * 60 * 60 * 24 * 1, actorRole: "manager", type: "Note", text: "Chasing payee for EICR / installation certificate. Will update once received." },
        { id: uid("dmsg"), at: now - 1000 * 60 * 45, actorRole: "manager", type: "Status", text: "Moved to Under review." },
      ],
    });

    // Messages thread with a snapshot attachment
    const attachment = {
      id: "att_sum_hero_inv03",
      type: "invoiceSummary",
      jobId: heroId,
      invoiceId: "inv_03_hero",
      createdAt: now - 1000 * 60 * 60 * 6,
      snapshot: {
        clientPaymentBeforeVat: state.db.invoices.find((x) => x.id === "inv_03_hero")?.clientPaymentBeforeVat || 0,
        totalToPayees: state.db.invoices.find((x) => x.id === "inv_03_hero")?.totalToPayees || 0,
        feeVatRate: state.db.invoices.find((x) => x.id === "inv_03_hero")?.feeVatRate || 20,
        invoiceTitle: state.db.invoices.find((x) => x.id === "inv_03_hero")?.title || "Invoice #003",
      },
    };

    state.db.messages.push(
      { id: uid("msg"), jobId: heroId, at: now - 1000 * 60 * 60 * 10, actorRole: "manager", text: "Quick update: dormer framing complete. Next: first fix electrics evidence pack.", attachments: [] },
      { id: uid("msg"), jobId: heroId, at: now - 1000 * 60 * 60 * 6, actorRole: "manager", text: "Sharing the latest invoice summary for review.", attachments: [attachment] },
      { id: uid("msg"), jobId: heroId, at: now - 1000 * 60 * 60 * 5, actorRole: "client", text: "Received. Please make sure the evidence is uploaded before requesting the partner release.", attachments: [] }
    );

    // Releases seeded lightly (full logic in Part 4)
    state.db.releases.push(
      { id: "rel_hero_1", jobId: heroId, payeeId: p1.id, amount: 2200, linkedType: "invoice", linkedId: "inv_03_hero", status: "Submitted", notes: "Stage payment for labour", createdAt: now - 1000 * 60 * 60 * 24 * 4, updatedAt: now - 1000 * 60 * 60 * 12 },
      { id: "rel_hero_2", jobId: heroId, payeeId: p3.id, amount: 1800, linkedType: "milestone", linkedId: "ms2", status: "Manager approved", notes: "Materials: steel fixings & delivery", createdAt: now - 1000 * 60 * 60 * 24 * 5, updatedAt: now - 1000 * 60 * 60 * 6 },
      { id: "rel_hero_3", jobId: heroId, payeeId: p2.id, amount: 3100, linkedType: "milestone", linkedId: "ms3", status: "Client approved", notes: "First fix electrics (awaiting evidence)", createdAt: now - 1000 * 60 * 60 * 24 * 3, updatedAt: now - 1000 * 60 * 60 * 2 }
    );

    audit("seededDemo", "system", "seed", null, { seededAt: now });
    audit("openedDispute", "dispute", "disp_hero_ms3", heroId, { targetType: "milestone", targetId: "ms3" });
    audit("bankDetailsChanged", "payee", p2.id, null, { payeeName: p2.name });
    saveDb();
  }

  /* =========================
     Theme + role
  ========================= */
  function applyThemeFromStorage() {
    const mode = localStorage.getItem(APP.themeKey) || "system";
    if (mode === "light" || mode === "dark") document.documentElement.setAttribute("data-theme", mode);
    else document.documentElement.removeAttribute("data-theme");
  }

  function toggleTheme() {
    const cur = localStorage.getItem(APP.themeKey) || "system";
    const next = cur === "system" ? "light" : cur === "light" ? "dark" : "system";
    localStorage.setItem(APP.themeKey, next);
    applyThemeFromStorage();
    toast("Theme", `Set to ${next}`);
  }

  function getRole() {
    const r = localStorage.getItem(APP.roleKey) || "manager";
    return ROLES.includes(r) ? r : "manager";
  }

  function setRole(role) {
    if (!ROLES.includes(role)) return;
    state.role = role;
    localStorage.setItem(APP.roleKey, role);
    updateNavVisibility();
    updateNavCounters();
    route();
    toast("Role switched", role);
  }

  /* =========================
     Derived selectors
  ========================= */
  const getJob = (jobId) => state.db.jobs.find((j) => j.id === jobId) || null;
  const getPayee = (payeeId) => state.db.payees.find((p) => p.id === payeeId) || null;
  const getInvoice = (invoiceId) => state.db.invoices.find((i) => i.id === invoiceId) || null;
  const getMilestone = (msId) => state.db.milestones.find((m) => m.id === msId) || null;

  const jobInvoices = (jobId) => state.db.invoices.filter((i) => i.jobId === jobId);
  const jobMilestones = (jobId) => state.db.milestones.filter((m) => m.jobId === jobId);
  const jobReleases = (jobId) => state.db.releases.filter((r) => r.jobId === jobId);
  const jobDisputes = (jobId) => state.db.disputes.filter((d) => d.jobId === jobId);

  function computeJobProgress(jobId) {
    const m = jobMilestones(jobId);
    if (!m.length) return 0;
    const approved = m.filter((x) => x.approvalStatus === "Approved").length;
    return Math.round((approved / m.length) * 100);
  }

  /* =========================
     Navigation visibility + counters
  ========================= */
  function updateNavVisibility() {
    const allowed = new Set(perms().nav);
    $$(".nav-item").forEach((a) => {
      const key = a.getAttribute("data-route");
      if (!key) return;
      a.style.display = allowed.has(key) ? "" : "none";
    });
  }

  function approvalsCountForRole(role) {
    let count = 0;

    // Releases step approvals derive from status
    for (const r of state.db.releases) {
      if (role === "manager" && r.status === "Submitted") count++;
      if (role === "client" && r.status === "Manager approved") count++;
      if (role === "admin" && (r.status === "Submitted" || r.status === "Manager approved")) count++;
    }

    // Change requests + bank confirmations counted in Part 4 too (full list). Here: minimal.
    if (role === "manager" || role === "admin") {
      for (const p of state.db.payees) {
        if (p.bankChanged && !p.bankConfirmed) count++;
      }
    }
    for (const j of state.db.jobs) {
      for (const cr of j.changeRequests || []) {
        if ((role === "manager" || role === "admin") && !cr.managerApproved) count++;
        if ((role === "client" || role === "admin") && !cr.clientApproved) count++;
      }
    }

    return count;
  }

  function openDisputesCount() {
    return state.db.disputes.filter((d) => d.status !== "Closed").length;
  }

  function blockedReleasesCount() {
    // Full rule evaluation in Part 4; here we count client-approved as “potentially blocked”
    return state.db.releases.filter((r) => r.status === "Client approved").length;
  }

  function setCount(id, n) {
    const el = $(id);
    if (!el) return;
    if (n > 0) {
      el.hidden = false;
      el.textContent = String(n);
    } else {
      el.hidden = true;
      el.textContent = "0";
    }
  }

  function updateNavCounters() {
    setCount("#navCountApprovals", approvalsCountForRole(state.role));
    setCount("#navCountDisputes", openDisputesCount());
    setCount("#navCountPayments", blockedReleasesCount());

    const notifBadge = $("#notifBadge");
    if (notifBadge) {
      const total = approvalsCountForRole(state.role) + openDisputesCount() + blockedReleasesCount();
      notifBadge.hidden = total === 0;
      notifBadge.textContent = String(total);
    }
  }

  function setActiveNav(navKey) {
    $$(".nav-item").forEach((a) => a.classList.remove("active"));
    $(`.nav-item[data-route="${navKey}"]`)?.classList.add("active");
  }

  /* =========================
     Global Search
  ========================= */
  function buildSearchResults(q) {
    const term = String(q || "").trim().toLowerCase();
    if (!term) return [];

    const out = [];
    for (const j of state.db.jobs) {
      if ((j.name + " " + j.location).toLowerCase().includes(term)) {
        out.push({ type: "job", title: j.name, meta: j.location, href: `#/jobs/${j.id}` });
      }
    }
    for (const inv of state.db.invoices) {
      if ((inv.title + " " + (inv.description || "")).toLowerCase().includes(term)) {
        const job = getJob(inv.jobId);
        out.push({ type: "invoice", title: inv.title, meta: job?.name || "", href: `#/invoices/${inv.id}` });
      }
    }
    for (const p of state.db.payees) {
      if ((p.name + " " + p.type).toLowerCase().includes(term)) {
        out.push({ type: "payee", title: p.name, meta: p.type, href: `#/company?payee=${encodeURIComponent(p.id)}` });
      }
    }
    return out.slice(0, 12);
  }

  function renderSearchPopover(items) {
    const pop = $("#searchPopover");
    if (!pop) return;
    if (!items.length) {
      pop.hidden = true;
      pop.innerHTML = "";
      return;
    }
    pop.hidden = false;
    pop.innerHTML = items
      .map(
        (r) => `
        <div class="pop-item" role="button" tabindex="0" data-href="${esc(r.href)}">
          <div>
            <div style="font-weight:800">${esc(r.title)}</div>
            <div class="pop-k">${esc(r.type)} • ${esc(r.meta)}</div>
          </div>
          <div class="pop-k">↵</div>
        </div>
      `
      )
      .join("");

    $$(".pop-item", pop).forEach((el) => {
      const go = () => {
        const href = el.getAttribute("data-href");
        if (href) location.hash = href;
        pop.hidden = true;
        pop.innerHTML = "";
        $("#globalSearch").value = "";
      };
      on(el, "click", go);
      on(el, "keydown", (e) => {
        if (e.key === "Enter") go();
      });
    });
  }

  /* =========================
     Router (hash only)
  ========================= */
  const ROUTES = [];
  function addRoute({ key, pattern, roles, render }) {
    ROUTES.push({ key, pattern, roles, render });
  }

  function parseHash() {
    const raw = location.hash || "#/jobs";
    const h = raw.startsWith("#") ? raw.slice(1) : raw;
    const [path, qs] = h.split("?");
    const query = new URLSearchParams(qs || "");
    return { path: path || "/jobs", query };
  }

  function matchRoute(path) {
    for (const r of ROUTES) {
      const m = path.match(r.pattern);
      if (m) return { ...r, params: m.groups || {} };
    }
    return null;
  }

  function route() {
    const { path, query } = parseHash();
    const m = matchRoute(path);
    if (!m) {
      location.hash = "#/jobs";
      return;
    }

    // guard
    if (m.roles && !m.roles.includes(state.role)) {
      setActiveNav("jobs");
      mount(renderForbidden(m.key));
      return;
    }

    setActiveNav(m.key);
    mount(m.render(m.params, query));
    wireAfterRender(m.key, m.params, query);
    updateNavCounters();
  }

  function renderForbidden(routeKey) {
    return h("div", { class: "card pad" }, [
      h("div", { class: "card-title" }, "Access restricted"),
      h("div", { class: "card-sub" }, `This area is not available for the ${state.role} role.`),
      h("hr", { class: "sep" }),
      h("div", { class: "hstack" }, [
        h("a", { class: "btn primary", href: "#/jobs" }, "Go to Jobs"),
        h("a", { class: "btn", href: "#/settings" }, "Settings"),
      ]),
    ]);
  }

  /* =========================
     Page: Jobs Dashboard
  ========================= */
  function renderJobsDashboard(params, query) {
    const tab = query.get("tab") || "all";
    const canEdit = perms().canEdit;

    const filtered = state.db.jobs
      .slice()
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .filter((j) => {
        if (tab === "open") return j.status === "open";
        if (tab === "completed") return j.status === "completed";
        if (tab === "archived") return j.status === "archived";
        return true;
      });

    const tabs = h("div", { class: "hstack", style: "gap:10px" }, [
      h("a", { class: `pill ${tab === "all" ? "info" : ""}`, href: "#/jobs?tab=all" }, "All"),
      h("a", { class: `pill ${tab === "open" ? "info" : ""}`, href: "#/jobs?tab=open" }, "Open"),
      h("a", { class: `pill ${tab === "completed" ? "info" : ""}`, href: "#/jobs?tab=completed" }, "Completed"),
      h("a", { class: `pill ${tab === "archived" ? "info" : ""}`, href: "#/jobs?tab=archived" }, "Archived"),
    ]);

    const cards = h(
      "div",
      { class: "grid", style: "margin-top:16px" },
      filtered.map((j) => {
        const progress = computeJobProgress(j.id);
        const pending = jobReleases(j.id).filter((r) => r.status === "Submitted" || r.status === "Manager approved").length;
        const disputes = jobDisputes(j.id).filter((d) => d.status !== "Closed").length;
        const blocked = jobReleases(j.id).filter((r) => r.status === "Client approved").length;

        return h("div", { class: "card pad", role: "button", tabindex: "0", "data-job": j.id }, [
          h("div", { class: "split" }, [
            h("div", {}, [
              h("div", { style: "font-weight:950;font-size:18px;letter-spacing:-0.02em" }, j.name),
              h("div", { class: "muted", style: "margin-top:4px" }, j.location),
              h("div", { class: "hstack", style: "margin-top:10px" }, [
                h("span", { class: `pill ${j.status === "open" ? "info" : j.status === "completed" ? "ok" : "warn"}` }, j.status),
                h("span", { class: "pill" }, ["Pending approvals: ", h("b", {}, String(pending))]),
                h("span", { class: "pill" }, ["Disputes: ", h("b", {}, String(disputes))]),
                h("span", { class: "pill" }, ["Blocked releases: ", h("b", {}, String(blocked))]),
              ]),
            ]),
            h("div", { style: "min-width:220px" }, [
              h("div", { class: "muted", style: "font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.04em" }, "Progress"),
              h("div", { class: "progress", style: "margin-top:8px" }, [h("div", { style: `width:${progress}%` })]),
              h("div", { class: "muted", style: "margin-top:6px;font-size:13px" }, `${progress}% milestones approved`),
              h("div", { class: "muted", style: "margin-top:10px;font-size:12px" }, ["Ring-fenced balance: ", h("b", {}, money(j.ringfencedBalance))]),
            ]),
          ]),
        ]);
      })
    );

    const headerActions = h("div", { class: "hstack" }, [
      ...(canEdit ? [h("button", { class: "btn primary", type: "button", "data-action": "newJob" }, "+ New job")] : []),
      h("button", { class: "btn", type: "button", "data-action": "exportJson" }, "Export demo JSON"),
    ]);

    return h("div", { class: "card" }, [
      h("div", { class: "card-header" }, [
        h("div", {}, [
          h("div", { class: "card-title" }, "Jobs"),
          h("div", { class: "card-sub" }, "Tabs, real CRUD, progress, and counters (stored in localStorage)."),
        ]),
        headerActions,
      ]),
      h("div", { class: "card pad" }, [
        tabs,
        filtered.length ? cards : h("div", { class: "muted", style: "margin-top:16px" }, "No jobs in this tab."),
        h("hr", { class: "sep" }),
        h("div", { class: "grid cols-3" }, [
          h("div", { class: "card" }, [h("div", { class: "kpi" }, [h("div", { class: "k" }, "Open jobs"), h("div", { class: "v" }, String(state.db.jobs.filter((j) => j.status === "open").length))])]),
          h("div", { class: "card" }, [h("div", { class: "kpi" }, [h("div", { class: "k" }, "Approvals pending"), h("div", { class: "v" }, String(approvalsCountForRole(state.role)))])]),
          h("div", { class: "card" }, [h("div", { class: "kpi" }, [h("div", { class: "k" }, "Open disputes"), h("div", { class: "v" }, String(openDisputesCount()))])]),
        ]),
      ]),
    ]);
  }

  function wireJobsDashboard() {
    $$("#view .card[data-job]").forEach((c) => {
      const id = c.getAttribute("data-job");
      const go = () => (location.hash = `#/jobs/${id}`);
      on(c, "click", go);
      on(c, "keydown", (e) => e.key === "Enter" && go());
    });

    on($("#view [data-action='exportJson']"), "click", () => {
      state.db.meta.lastBackupAt = Date.now();
      saveDb();
      downloadText("approvehub-demo-export.json", JSON.stringify(state.db, null, 2), "application/json");
      toast("Exported", "Demo JSON downloaded.");
    });

    on($("#view [data-action='newJob']"), "click", () => {
      if (!perms().canEdit) return;

      openModal({
        title: "Create job",
        body: h("div", { class: "vstack" }, [
          h("div", { class: "grid cols-2" }, [
            h("div", { class: "field" }, [h("label", {}, "Job name"), h("input", { id: "jobName", placeholder: "e.g. South London Refurb" })]),
            h("div", { class: "field" }, [h("label", {}, "Location"), h("input", { id: "jobLoc", placeholder: "e.g. Croydon, London" })]),
          ]),
          h("div", { class: "field" }, [
            h("label", {}, "Ring-fenced balance (demo)"),
            h("input", { id: "jobBal", type: "number", min: "0", step: "50", placeholder: "e.g. 20000" }),
          ]),
        ]),
        footer: h("div", { class: "hstack" }, [
          h("button", { class: "btn", type: "button", "data-close": "1" }, "Cancel"),
          h("button", { class: "btn primary", type: "button", "data-create": "1" }, "Create"),
        ]),
        onReady: ({ root, close }) => {
          on($("[data-close]", root), "click", close);
          on($("[data-create]", root), "click", () => {
            const name = ($("#jobName", root).value || "").trim();
            const loc = ($("#jobLoc", root).value || "").trim();
            const bal = Number($("#jobBal", root).value || 0);

            if (!name) return toast("Missing field", "Please enter a job name.");

            const job = {
              id: uid("job"),
              name,
              location: loc || "London, United Kingdom",
              status: "open",
              ringfencedBalance: Math.max(0, bal),
              createdAt: Date.now(),
              updatedAt: Date.now(),
              changeRequests: [],
            };
            state.db.jobs.unshift(job);
            audit("jobCreated", "job", job.id, job.id, { name: job.name });
            saveDb();
            close();
            toast("Created", "Job added.");
            location.hash = `#/jobs/${job.id}`;
          });
        },
      });
    });
  }

  /* =========================
     Page: Job Detail
  ========================= */
  function renderJobDetail({ jobId }, query) {
    const job = getJob(jobId);
    if (!job) {
      return h("div", { class: "card pad" }, [
        h("div", { class: "card-title" }, "Job not found"),
        h("div", { class: "card-sub" }, "This job ID does not exist in the demo data."),
        h("hr", { class: "sep" }),
        h("a", { class: "btn primary", href: "#/jobs" }, "Back to Jobs"),
      ]);
    }

    const view = query.get("view") || "invoices";
    const canEdit = perms().canEdit;

    const progress = computeJobProgress(job.id);
    const pending = jobReleases(job.id).filter((r) => r.status === "Submitted" || r.status === "Manager approved").length;
    const disputes = jobDisputes(job.id).filter((d) => d.status !== "Closed").length;

    const viewSwitch = h("div", { class: "hstack" }, [
      h("a", { class: `btn ${view === "invoices" ? "primary" : ""}`, href: `#/jobs/${job.id}?view=invoices` }, "Invoice tiles"),
      h("a", { class: `btn ${view === "milestones" ? "primary" : ""}`, href: `#/jobs/${job.id}?view=milestones` }, "Milestones"),
    ]);

    const headerActions = h("div", { class: "hstack" }, [
      ...(canEdit ? [h("button", { class: "btn", type: "button", "data-action": "editJob" }, "Edit")] : []),
      ...(canEdit
        ? [
            job.status === "archived"
              ? h("button", { class: "btn", type: "button", "data-action": "unarchiveJob" }, "Unarchive")
              : h("button", { class: "btn danger", type: "button", "data-action": "archiveJob" }, "Archive"),
          ]
        : []),
      ...(perms().canExport ? [h("button", { class: "btn", type: "button", "data-action": "exportJobBundle" }, "Export job JSON")] : []),
    ]);

    const invoices = jobInvoices(job.id);
    const milestones = jobMilestones(job.id);

    const invoicesGrid = h(
      "div",
      { class: "grid cols-3" },
      invoices.map((inv) => {
        const payee = getPayee(inv.payeeId);
        const st = inv.status;
        const pill =
          st === "Paid by client" ? "ok" : st === "Approved" ? "info" : st === "Submitted" || st === "Pending approval" ? "warn" : "";

        return h("a", { class: "card pad", href: `#/invoices/${inv.id}`, style: "text-decoration:none" }, [
          h("div", { class: "split" }, [
            h("div", {}, [
              h("div", { style: "font-weight:950" }, inv.title),
              h("div", { class: "muted", style: "margin-top:4px" }, payee?.name || "Payee"),
            ]),
            h("span", { class: `pill ${pill}` }, st),
          ]),
          h("div", { class: "muted", style: "margin-top:10px;font-size:13px" }, inv.description || ""),
          h("hr", { class: "sep" }),
          h("div", { class: "split" }, [h("div", { class: "muted", style: "font-size:12px" }, "To payees"), h("div", { style: "font-weight:950" }, money(inv.totalToPayees))]),
          h("div", { class: "split", style: "margin-top:8px" }, [
            h("div", { class: "muted", style: "font-size:12px" }, "Client payment (before VAT)"),
            h("div", { style: "font-weight:950" }, money(inv.clientPaymentBeforeVat)),
          ]),
        ]);
      })
    );

    const milestonesGrid = h(
      "div",
      { class: "grid cols-2" },
      milestones.map((m) => {
        const evidencePill = !m.evidenceRequired ? "pill" : m.evidenceStatus === "Provided" ? "pill ok" : "pill bad";
        const apprPill = m.approvalStatus === "Approved" ? "pill ok" : m.approvalStatus === "Pending" ? "pill warn" : "pill";
        const relPill = m.releaseStatus === "Released" ? "pill ok" : m.releaseStatus === "Sent" ? "pill info" : "pill";

        const cr = m.changeRequestId ? (job.changeRequests || []).find((x) => x.id === m.changeRequestId) : null;

        return h("div", { class: "card pad" }, [
          h("div", { class: "split" }, [
            h("div", {}, [
              h("div", { style: "font-weight:950;font-size:16px" }, m.title),
              h("div", { class: "muted", style: "margin-top:4px" }, ["Amount: ", h("b", {}, money(m.amount))]),
            ]),
            h("div", { class: "hstack" }, [
              h("span", { class: evidencePill }, ["Evidence: ", h("b", {}, m.evidenceStatus)]),
              h("span", { class: apprPill }, ["Approval: ", h("b", {}, m.approvalStatus)]),
              h("span", { class: relPill }, ["Release: ", h("b", {}, m.releaseStatus)]),
            ]),
          ]),
          cr
            ? h("div", { class: "banner warn", style: "margin-top:12px" }, [
                h("div", { class: "title" }, "Change request linked"),
                h("div", { class: "body" }, `${cr.title} • Requires Manager + Client approval before totals update.`),
              ])
            : null,
          h("div", { class: "hstack", style: "margin-top:12px" }, [
            perms().canDispute ? h("button", { class: "btn", type: "button", "data-open-dispute": "1", "data-type": "milestone", "data-id": m.id }, "Open dispute") : null,
            canEdit ? h("button", { class: "btn ghost", type: "button", "data-edit-ms": "1", "data-id": m.id }, "Edit") : null,
          ]),
        ]);
      })
    );

    return h("div", { class: "card" }, [
      h("div", { class: "card-header" }, [
        h("div", {}, [
          h("div", { class: "card-title" }, job.name),
          h("div", { class: "card-sub" }, `${job.location} • Ring-fenced balance: ${money(job.ringfencedBalance)}`),
          h("div", { class: "hstack", style: "margin-top:10px" }, [
            h("span", { class: "pill info" }, ["Pending approvals: ", h("b", {}, String(pending))]),
            h("span", { class: `pill ${disputes ? "bad" : ""}` }, ["Disputes: ", h("b", {}, String(disputes))]),
            h("span", { class: "pill" }, ["Status: ", h("b", {}, job.status)]),
          ]),
        ]),
        headerActions,
      ]),
      h("div", { class: "card pad" }, [
        h("div", { class: "split" }, [
          viewSwitch,
          h("div", { style: "min-width:260px" }, [
            h("div", { class: "muted", style: "font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.04em" }, "Progress"),
            h("div", { class: "progress", style: "margin-top:8px" }, [h("div", { style: `width:${progress}%` })]),
            h("div", { class: "muted", style: "margin-top:6px;font-size:13px" }, `${progress}% milestones approved`),
          ]),
        ]),
        h("hr", { class: "sep" }),
        view === "milestones" ? milestonesGrid : invoicesGrid,
      ]),
    ]);
  }

  function wireJobDetail(jobId) {
    const job = getJob(jobId);
    if (!job) return;

    on($("#view [data-action='editJob']"), "click", () => {
      if (!perms().canEdit) return;

      openModal({
        title: "Edit job",
        body: h("div", { class: "vstack" }, [
          h("div", { class: "grid cols-2" }, [
            h("div", { class: "field" }, [h("label", {}, "Job name"), h("input", { id: "jobName", value: job.name })]),
            h("div", { class: "field" }, [h("label", {}, "Location"), h("input", { id: "jobLoc", value: job.location })]),
          ]),
          h("div", { class: "grid cols-2", style: "margin-top:12px" }, [
            h("div", { class: "field" }, [
              h("label", {}, "Status"),
              (() => {
                const sel = h("select", { id: "jobStatus" }, []);
                ["open", "completed", "archived"].forEach((s) => sel.appendChild(h("option", { value: s, selected: job.status === s ? "selected" : null }, s)));
                return sel;
              })(),
            ]),
            h("div", { class: "field" }, [
              h("label", {}, "Ring-fenced balance"),
              h("input", { id: "jobBal", type: "number", min: "0", step: "50", value: String(job.ringfencedBalance || 0) }),
            ]),
          ]),
        ]),
        footer: h("div", { class: "hstack" }, [
          h("button", { class: "btn", type: "button", "data-close": "1" }, "Cancel"),
          h("button", { class: "btn primary", type: "button", "data-save": "1" }, "Save"),
        ]),
        onReady: ({ root, close }) => {
          on($("[data-close]", root), "click", close);
          on($("[data-save]", root), "click", () => {
            const name = ($("#jobName", root).value || "").trim();
            if (!name) return toast("Missing field", "Please enter a job name.");

            job.name = name;
            job.location = ($("#jobLoc", root).value || "").trim();
            job.status = $("#jobStatus", root).value;
            job.ringfencedBalance = Math.max(0, Number($("#jobBal", root).value || 0));
            job.updatedAt = Date.now();

            audit("jobUpdated", "job", job.id, job.id, { name: job.name, status: job.status });
            saveDb();
            close();
            toast("Saved", "Job updated.");
            route();
          });
        },
      });
    });

    on($("#view [data-action='archiveJob']"), "click", () => {
      if (!perms().canEdit) return;
      job.status = "archived";
      job.updatedAt = Date.now();
      audit("jobArchived", "job", job.id, job.id, {});
      saveDb();
      toast("Archived", "Job archived.");
      route();
    });

    on($("#view [data-action='unarchiveJob']"), "click", () => {
      if (!perms().canEdit) return;
      job.status = "open";
      job.updatedAt = Date.now();
      audit("jobUnarchived", "job", job.id, job.id, {});
      saveDb();
      toast("Unarchived", "Job restored to Open.");
      route();
    });

    on($("#view [data-action='exportJobBundle']"), "click", () => {
      if (!perms().canExport) return;
      const bundle = {
        job,
        invoices: jobInvoices(job.id),
        milestones: jobMilestones(job.id),
        releases: jobReleases(job.id),
        disputes: jobDisputes(job.id),
        messages: state.db.messages.filter((m) => m.jobId === job.id),
        audit: state.db.auditLog.filter((a) => a.jobId === job.id),
      };
      downloadText(`${safeFile(job.name)}_bundle.json`, JSON.stringify(bundle, null, 2), "application/json");
      toast("Exported", "Job bundle JSON downloaded.");
    });

    // Dispute open (handled fully in Part 4; here we just jump to Disputes page)
    $$("[data-open-dispute]", $("#view")).forEach((btn) => {
      on(btn, "click", () => {
        toast("Disputes", "Open dispute UI is completed in Part 4.");
        location.hash = "#/disputes";
      });
    });

    // Milestone edit (light demo)
    $$("[data-edit-ms]", $("#view")).forEach((btn) => {
      on(btn, "click", () => {
        if (!perms().canEdit) return;
        const msId = btn.getAttribute("data-id");
        const m = getMilestone(msId);
        if (!m) return;

        openModal({
          title: "Edit milestone (demo)",
          body: h("div", { class: "vstack" }, [
            h("div", { class: "field" }, [h("label", {}, "Title"), h("input", { id: "msTitle", value: m.title })]),
            h("div", { class: "grid cols-2", style: "margin-top:12px" }, [
              h("div", { class: "field" }, [h("label", {}, "Amount"), h("input", { id: "msAmt", type: "number", min: "0", step: "50", value: String(m.amount || 0) })]),
              h("div", { class: "field" }, [
                h("label", {}, "Evidence status"),
                (() => {
                  const sel = h("select", { id: "msEv" }, []);
                  ["Provided", "Missing", "N/A"].forEach((v) => sel.appendChild(h("option", { value: v, selected: m.evidenceStatus === v ? "selected" : null }, v)));
                  return sel;
                })(),
              ]),
            ]),
            h("div", { class: "grid cols-2", style: "margin-top:12px" }, [
              h("div", { class: "field" }, [
                h("label", {}, "Approval status"),
                (() => {
                  const sel = h("select", { id: "msAp" }, []);
                  ["Not started", "Pending", "Approved"].forEach((v) => sel.appendChild(h("option", { value: v, selected: m.approvalStatus === v ? "selected" : null }, v)));
                  return sel;
                })(),
              ]),
              h("div", { class: "field" }, [
                h("label", {}, "Evidence required"),
                (() => {
                  const sel = h("select", { id: "msReq" }, []);
                  sel.appendChild(h("option", { value: "true", selected: m.evidenceRequired ? "selected" : null }, "Yes"));
                  sel.appendChild(h("option", { value: "false", selected: !m.evidenceRequired ? "selected" : null }, "No"));
                  return sel;
                })(),
              ]),
            ]),
          ]),
          footer: h("div", { class: "hstack" }, [
            h("button", { class: "btn", type: "button", "data-close": "1" }, "Cancel"),
            h("button", { class: "btn primary", type: "button", "data-save": "1" }, "Save"),
          ]),
          onReady: ({ root, close }) => {
            on($("[data-close]", root), "click", close);
            on($("[data-save]", root), "click", () => {
              m.title = ($("#msTitle", root).value || "").trim() || m.title;
              m.amount = Math.max(0, Number($("#msAmt", root).value || m.amount));
              m.evidenceStatus = $("#msEv", root).value;
              m.approvalStatus = $("#msAp", root).value;
              m.evidenceRequired = $("#msReq", root).value === "true";
              m.updatedAt = Date.now();
              audit("milestoneUpdated", "milestone", m.id, m.jobId, { evidenceStatus: m.evidenceStatus, approvalStatus: m.approvalStatus });
              saveDb();
              close();
              toast("Saved", "Milestone updated.");
              route();
            });
          },
        });
      });
    });
  }

  /* =========================
     Page: Invoice Detail / Summary (PDF + Share)
  ========================= */
  function computeInvoiceSummary(inv) {
    const clientPaymentBeforeVat = Number(inv.clientPaymentBeforeVat || 0);
    const totalToPayees = Number(inv.totalToPayees || 0);
    const feePot = Math.max(0, clientPaymentBeforeVat - totalToPayees);
    const vatRate = clamp(inv.feeVatRate ?? 20, 0, 100);
    const vatOnFee = Math.round(((feePot * vatRate) / 100) * 100) / 100;

    const grandTotal = clientPaymentBeforeVat + vatOnFee;

    // Example comparison: 20% VAT on whole client payment vs VAT on fee
    const exampleWholeVat = Math.round(clientPaymentBeforeVat * 0.2);
    const illustrativeDiff = Math.max(0, exampleWholeVat - vatOnFee);

    return { clientPaymentBeforeVat, totalToPayees, feePot, vatRate, vatOnFee, grandTotal, exampleWholeVat, illustrativeDiff };
  }

  function renderInvoiceDetail({ invoiceId }) {
    const inv = getInvoice(invoiceId);
    if (!inv) {
      return h("div", { class: "card pad" }, [
        h("div", { class: "card-title" }, "Invoice not found"),
        h("div", { class: "card-sub" }, "This invoice ID does not exist in the demo data."),
        h("hr", { class: "sep" }),
        h("a", { class: "btn primary", href: "#/jobs" }, "Back to Jobs"),
      ]);
    }

    const job = getJob(inv.jobId);
    const payee = getPayee(inv.payeeId);
    const s = computeInvoiceSummary(inv);

    const vatSelect = h("select", { id: "vatRateSelect" }, [
      h("option", { value: "20", selected: s.vatRate === 20 ? "selected" : null }, "20%"),
      h("option", { value: "5", selected: s.vatRate === 5 ? "selected" : null }, "5%"),
      h("option", { value: "0", selected: s.vatRate === 0 ? "selected" : null }, "0%"),
      h("option", { value: "custom", selected: ![20, 5, 0].includes(s.vatRate) ? "selected" : null }, "Custom"),
    ]);

    const customRate = h("input", {
      id: "vatRateCustom",
      type: "number",
      min: "0",
      max: "100",
      step: "0.5",
      value: String(s.vatRate),
    });

    const shareBtn = perms().canMessage ? h("button", { class: "btn", type: "button", "data-action": "share" }, "Share") : null;

    return h("div", { class: "card" }, [
      h("div", { class: "card-header" }, [
        h("div", {}, [
          h("div", { class: "card-title" }, `${inv.title} — Summary`),
          h("div", { class: "card-sub" }, `${job?.name || "Job"} • Payee: ${payee?.name || "—"}`),
        ]),
        h("div", { class: "hstack" }, [
          shareBtn,
          h("button", { class: "btn primary", type: "button", "data-action": "downloadPdf" }, "Download"),
          h("button", { class: "btn", type: "button", "data-action": "printFallback" }, "Print"),
        ]),
      ]),
      h("div", { class: "card pad" }, [
        h("div", { id: "invoiceSummary", class: "vstack" }, [
          h("div", { class: "grid cols-2" }, [
            h("div", { class: "card pad" }, [
              h("div", { class: "muted", style: "font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.04em" }, "Client payment before VAT (editable demo field)"),
              h("div", { style: "margin-top:8px;font-size:22px;font-weight:950" }, money(s.clientPaymentBeforeVat)),
              h("div", { class: "field", style: "margin-top:10px" }, [
                h("label", {}, "Edit amount"),
                h("input", { id: "clientPaymentInput", type: "number", min: "0", step: "10", value: String(s.clientPaymentBeforeVat) }),
              ]),
            ]),
            h("div", { class: "card pad" }, [
              h("div", { class: "muted", style: "font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.04em" }, "Total paid to subcontractors & suppliers"),
              h("div", { style: "margin-top:8px;font-size:22px;font-weight:950" }, money(s.totalToPayees)),
              h("div", { class: "muted", style: "margin-top:8px;font-size:13px" }, "This demo uses a stored invoice total (not line-item accounting)."),
            ]),
          ]),
          h("div", { class: "grid cols-2" }, [
            h("div", { class: "card pad" }, [
              h("div", { class: "muted", style: "font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.04em" }, "Leftover payment for your company (management fee pot)"),
              h("div", { style: "margin-top:8px;font-size:22px;font-weight:950" }, money(s.feePot)),
              h("div", { class: "muted", style: "margin-top:8px;font-size:13px" }, "Calculated as: Client payment (before VAT) minus total paid to payees."),
            ]),
            h("div", { class: "card pad" }, [
              h("div", { class: "muted", style: "font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.04em" }, "VAT on your fee"),
              h("div", { style: "margin-top:8px;font-size:22px;font-weight:950" }, money(s.vatOnFee)),
              h("div", { class: "grid cols-2", style: "margin-top:10px" }, [
                h("div", { class: "field" }, [h("label", {}, "VAT rate"), vatSelect]),
                h("div", { class: "field" }, [h("label", {}, "Custom rate"), customRate]),
              ]),
            ]),
          ]),
          h("div", { class: "card pad" }, [
            h("div", { class: "split" }, [
              h("div", {}, [
                h("div", { style: "font-weight:950" }, "Grand total (client pays, incl. VAT on fee)"),
                h("div", { class: "muted", style: "margin-top:4px" }, "Illustrative total for demo purposes."),
              ]),
              h("div", { style: "font-size:24px;font-weight:950" }, money(s.grandTotal)),
            ]),
            h("hr", { class: "sep" }),
            h("div", { class: "grid cols-2" }, [
              h("div", {}, [
                h("div", { style: "font-weight:950" }, "Illustrative VAT difference (example only)"),
                h("div", { class: "muted", style: "margin-top:6px;font-size:13px" }, "Example comparison: VAT at 20% on the whole client payment vs VAT on management fee only."),
              ]),
              h("div", { style: "text-align:right" }, [
                h("div", { style: "font-size:20px;font-weight:950" }, money(s.illustrativeDiff)),
                h("div", { class: "muted", style: "margin-top:6px;font-size:12px" }, COMPLIANCE.VAT_DISCLAIMER),
              ]),
            ]),
            h("hr", { class: "sep" }),
            h("div", { class: "banner info" }, [
              h("div", { class: "title" }, "Compliance note"),
              h("div", { class: "body" }, COMPLIANCE.VAT_DISCLAIMER),
            ]),
          ]),
          h("div", { class: "card pad" }, [
            h("div", { class: "split" }, [
              h("div", {}, [
                h("div", { style: "font-weight:950" }, "Invoice context"),
                h("div", { class: "muted", style: "margin-top:6px;font-size:13px" }, inv.description || ""),
              ]),
              h("div", { class: "hstack" }, [
                h("span", { class: "pill" }, inv.status),
                h("span", { class: "pill" }, ["Updated: ", h("b", {}, fmtDateTime(inv.updatedAt))]),
              ]),
            ]),
          ]),
        ]),
        h("div", { class: "muted", style: "margin-top:14px;font-size:12px" }, "Tip: “Download” generates a real PDF via html2pdf.js. “Print” is the fallback."),
      ]),
    ]);
  }

  async function generatePdfFromElement(element, filename) {
    const has = typeof window.html2pdf !== "undefined";
    if (!has) {
      toast("PDF unavailable", "html2pdf.js not loaded. Using print fallback.");
      window.print();
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.style.padding = "16px";
    wrapper.style.background = "white";
    wrapper.style.color = "black";
    wrapper.style.fontFamily = "Inter, Arial, sans-serif";

    wrapper.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px">
        <div style="font-weight:900;font-size:18px">${esc(APP.name)} — Invoice Summary</div>
        <div style="font-size:12px;color:#333">Generated: ${esc(fmtDateTime(Date.now()))}</div>
      </div>
      <div style="font-size:12px;color:#333;margin-bottom:10px">${esc(COMPLIANCE.VAT_DISCLAIMER)}</div>
    `;

    wrapper.appendChild(element.cloneNode(true));

    // remove buttons inside cloned content
    wrapper.querySelectorAll(".btn, .icon-btn").forEach((n) => n.remove());

    const opt = {
      margin: 10,
      filename,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    };

    try {
      await window.html2pdf().set(opt).from(wrapper).save();
      toast("Downloaded", "PDF generated.");
    } catch {
      toast("PDF failed", "Using print fallback.");
      window.print();
    }
  }

  function openShareModal(inv) {
    const job = getJob(inv.jobId);
    const payee = getPayee(inv.payeeId);
    const s = computeInvoiceSummary(inv);

    const text = [
      `${APP.name} — Invoice Summary`,
      `Job: ${job?.name || ""}`,
      `Invoice: ${inv.title}`,
      `Payee: ${payee?.name || ""}`,
      `Client payment before VAT: ${money(s.clientPaymentBeforeVat)}`,
      `Total paid to subcontractors & suppliers: ${money(s.totalToPayees)}`,
      `Management fee pot: ${money(s.feePot)}`,
      `VAT on fee (${s.vatRate}%): ${money(s.vatOnFee)}`,
      `Grand total (incl. VAT on fee): ${money(s.grandTotal)}`,
      ``,
      `Illustrative VAT difference (example only): ${money(s.illustrativeDiff)}`,
      COMPLIANCE.VAT_DISCLAIMER,
    ].join("\n");

    openModal({
      title: "Share invoice summary",
      body: h("div", { class: "vstack" }, [
        h("div", { class: "field" }, [h("label", {}, "Summary text"), h("textarea", { id: "shareText" }, text)]),
        h("div", { class: "banner info", style: "margin-top:12px" }, [
          h("div", { class: "title" }, "Attachment behaviour (static hosting)"),
          h("div", { class: "body" }, "In Messages, “summary attachment” is stored as metadata snapshot (not a persistent PDF). Use “Regenerate PDF” anytime."),
        ]),
      ]),
      footer: h("div", { class: "hstack" }, [
        h("button", { class: "btn", type: "button", "data-copy": "1" }, "Copy"),
        h("button", { class: "btn", type: "button", "data-send": "1" }, "Send to Messages thread"),
        h("button", { class: "btn primary", type: "button", "data-close": "1" }, "Done"),
      ]),
      onReady: ({ root, close }) => {
        const ta = $("#shareText", root);

        on($("[data-copy]", root), "click", async () => {
          try {
            await navigator.clipboard.writeText(ta.value);
            toast("Copied", "Summary copied to clipboard.");
          } catch {
            toast("Copy failed", "Select and copy manually.");
          }
        });

        on($("[data-send]", root), "click", () => {
          if (!perms().canMessage) return toast("Not allowed", "Only Client/Manager can send to Messages.");

          const attachment = {
            id: uid("att"),
            type: "invoiceSummary",
            jobId: inv.jobId,
            invoiceId: inv.id,
            createdAt: Date.now(),
            snapshot: {
              clientPaymentBeforeVat: s.clientPaymentBeforeVat,
              totalToPayees: s.totalToPayees,
              feeVatRate: s.vatRate,
              invoiceTitle: inv.title,
            },
          };

          state.db.messages.push({
            id: uid("msg"),
            jobId: inv.jobId,
            at: Date.now(),
            actorRole: state.role,
            text: ta.value,
            attachments: [attachment],
          });

          audit("sharedInvoiceSummaryToMessages", "invoice", inv.id, inv.jobId, { attachmentId: attachment.id });
          saveDb();
          toast("Sent", "Summary posted into the Messages thread.");
          close();
          location.hash = `#/messages?job=${encodeURIComponent(inv.jobId)}`;
        });

        on($("[data-close]", root), "click", close);
      },
    });
  }

  function wireInvoiceDetail(invoiceId) {
    const inv = getInvoice(invoiceId);
    if (!inv) return;

    const amountInput = $("#clientPaymentInput");
    on(amountInput, "change", () => {
      inv.clientPaymentBeforeVat = Math.max(0, Number(amountInput.value || 0));
      inv.updatedAt = Date.now();
      audit("invoiceClientPaymentUpdated", "invoice", inv.id, inv.jobId, { clientPaymentBeforeVat: inv.clientPaymentBeforeVat });
      saveDb();
      route();
    });

    const vatSelect = $("#vatRateSelect");
    const vatCustom = $("#vatRateCustom");

    function applyVatRate() {
      let rate = 20;
      if (vatSelect.value === "custom") rate = clamp(vatCustom.value, 0, 100);
      else rate = clamp(vatSelect.value, 0, 100);

      inv.feeVatRate = rate;
      inv.updatedAt = Date.now();
      audit("invoiceVatRateUpdated", "invoice", inv.id, inv.jobId, { feeVatRate: rate });
      saveDb();
      route();
    }

    on(vatSelect, "change", () => {
      vatCustom.disabled = vatSelect.value !== "custom";
      applyVatRate();
    });

    vatCustom.disabled = vatSelect.value !== "custom";
    on(vatCustom, "change", applyVatRate);

    on($("#view [data-action='downloadPdf']"), "click", async () => {
      const el = $("#invoiceSummary");
      if (!el) return;
      await generatePdfFromElement(el, `${safeFile(inv.title)}_summary.pdf`);
    });

    on($("#view [data-action='printFallback']"), "click", () => window.print());

    on($("#view [data-action='share']"), "click", () => {
      if (!perms().canMessage) return;
      openShareModal(inv);
    });
  }

  /* =========================
     Page: Company (Payees + bank protection)
  ========================= */
  function renderCompany(params, query) {
    const selectedPayeeId = query.get("payee");
    const canConfirm = perms().canConfirmBank || state.role === "admin";

    const list = state.role === "payee" ? [state.db.payees[0]].filter(Boolean) : state.db.payees;

    const cards = list.map((p) => {
      const banner = p.bankChanged && !p.bankConfirmed
        ? h("div", { class: "banner warn", style: "margin-top:10px" }, [
            h("div", { class: "title" }, "Bank details changed"),
            h("div", { class: "body" }, "Releases are blocked until confirmed by Manager."),
          ])
        : null;

      return h("div", { class: "card pad", style: "margin-bottom:12px", "data-payee-card": p.id }, [
        h("div", { class: "split" }, [
          h("div", {}, [
            h("div", { style: "font-weight:950;font-size:16px" }, p.name),
            h("div", { class: "muted", style: "margin-top:4px" }, `${p.type} • ${p.email}`),
            h("div", { class: "hstack", style: "margin-top:10px" }, [
              h("span", { class: `pill ${p.bankChanged && !p.bankConfirmed ? "warn" : "ok"}` }, ["Bank confirmed: ", h("b", {}, p.bankConfirmed ? "Yes" : "No")]),
              h("span", { class: "pill" }, ["Last change: ", h("b", {}, p.bankChangedAt ? fmtDateTime(p.bankChangedAt) : "—")]),
            ]),
          ]),
          h("div", { class: "hstack" }, [
            h("button", { class: "btn", type: "button", "data-edit-bank": p.id }, "Edit bank"),
            ...(canConfirm && p.bankChanged && !p.bankConfirmed
              ? [h("button", { class: "btn primary", type: "button", "data-confirm-bank": p.id }, "Confirm")]
              : []),
          ]),
        ]),
        banner,
        h("hr", { class: "sep" }),
        h("div", { class: "grid cols-3" }, [
          h("div", { class: "muted" }, ["Account name", h("br"), h("b", {}, p.bank.accountName)]),
          h("div", { class: "muted" }, ["Sort code", h("br"), h("b", {}, p.bank.sortCode)]),
          h("div", { class: "muted" }, ["Account number", h("br"), h("b", {}, p.bank.accountNumber)]),
        ]),
      ]);
    });

    return h("div", { class: "card" }, [
      h("div", { class: "card-header" }, [
        h("div", {}, [
          h("div", { class: "card-title" }, "Company"),
          h("div", { class: "card-sub" }, "Payees directory + bank change protection. Manager confirmation required for changed details."),
        ]),
        h("div", { class: "hstack" }, [h("span", { class: "pill" }, ["Role: ", h("b", {}, state.role)])]),
      ]),
      h("div", { class: "card pad" }, [
        h("div", { class: "banner info" }, [
          h("div", { class: "title" }, "Bank change protection"),
          h("div", { class: "body" }, "If payee bank details change, releases are blocked until Manager confirms. Confirmations are written to the Audit Log."),
        ]),
        h("hr", { class: "sep" }),
        ...cards,
        selectedPayeeId ? h("div", { class: "muted", style: "margin-top:10px;font-size:12px" }, `Selected payee: ${selectedPayeeId}`) : null,
      ]),
    ]);
  }

  function wireCompany() {
    $$("[data-edit-bank]").forEach((btn) => {
      on(btn, "click", () => {
        const id = btn.getAttribute("data-edit-bank");
        const p = getPayee(id);
        if (!p) return;

        const role = state.role;
        const allowed = role === "payee" || role === "manager" || role === "admin";
        if (!allowed) return toast("Not allowed", "This role cannot edit bank details.");

        openModal({
          title: "Edit bank details",
          body: h("div", { class: "vstack" }, [
            h("div", { class: "banner warn" }, [
              h("div", { class: "title" }, "Important"),
              h("div", { class: "body" }, "Changing bank details triggers a warning banner and blocks “Send to partner” until Manager confirms."),
            ]),
            h("div", { class: "grid cols-2", style: "margin-top:12px" }, [
              h("div", { class: "field" }, [h("label", {}, "Account name"), h("input", { id: "bnName", value: p.bank.accountName })]),
              h("div", { class: "field" }, [h("label", {}, "Sort code"), h("input", { id: "bnSort", value: p.bank.sortCode })]),
            ]),
            h("div", { class: "field", style: "margin-top:12px" }, [h("label", {}, "Account number"), h("input", { id: "bnAcc", value: p.bank.accountNumber })]),
          ]),
          footer: h("div", { class: "hstack" }, [
            h("button", { class: "btn", type: "button", "data-close": "1" }, "Cancel"),
            h("button", { class: "btn primary", type: "button", "data-save": "1" }, "Save"),
          ]),
          onReady: ({ root, close }) => {
            on($("[data-close]", root), "click", close);
            on($("[data-save]", root), "click", () => {
              const n = ($("#bnName", root).value || "").trim();
              const s = ($("#bnSort", root).value || "").trim();
              const a = ($("#bnAcc", root).value || "").trim();
              if (!n || !s || !a) return toast("Missing fields", "Fill all bank fields.");

              const changed = n !== p.bank.accountName || s !== p.bank.sortCode || a !== p.bank.accountNumber;

              p.bank.accountName = n;
              p.bank.sortCode = s;
              p.bank.accountNumber = a;

              if (changed) {
                p.bankChanged = true;
                p.bankConfirmed = false;
                p.bankChangedAt = Date.now();
                audit("bankDetailsChanged", "payee", p.id, null, { payeeName: p.name });
              }

              saveDb();
              close();
              toast("Saved", changed ? "Bank updated (confirmation required)." : "No changes.");
              route();
            });
          },
        });
      });
    });

    $$("[data-confirm-bank]").forEach((btn) => {
      on(btn, "click", () => {
        if (!perms().canConfirmBank && state.role !== "admin") return toast("Not allowed", "Only Manager can confirm bank details.");

        const id = btn.getAttribute("data-confirm-bank");
        const p = getPayee(id);
        if (!p) return;

        p.bankConfirmed = true;
        p.bankChanged = false;
        p.bankChangedAt = null;

        audit("bankDetailsConfirmed", "payee", p.id, null, { payeeName: p.name });
        saveDb();
        toast("Confirmed", "Bank details confirmed by Manager.");
        route();
      });
    });
  }

  /* =========================
     Page: Settings (Reset/Export/Import + theme)
  ========================= */
  function renderSettings() {
    const theme = localStorage.getItem(APP.themeKey) || "system";

    return h("div", { class: "card" }, [
      h("div", { class: "card-header" }, [
        h("div", {}, [
          h("div", { class: "card-title" }, "Settings"),
          h("div", { class: "card-sub" }, "Reset demo, export/import data, theme mode, schema version."),
        ]),
        h("div", { class: "hstack" }, [
          h("span", { class: "pill" }, ["Schema: ", h("b", {}, `v${APP.schemaVersion}`)]),
          h("span", { class: "pill" }, ["Role: ", h("b", {}, state.role)]),
        ]),
      ]),
      h("div", { class: "card pad" }, [
        h("div", { class: "grid cols-2" }, [
          h("div", { class: "card pad" }, [
            h("div", { class: "section-title" }, "Theme"),
            h("div", { class: "muted", style: "margin-top:6px;font-size:13px" }, "Auto dark mode (system) + manual override."),
            h("div", { class: "field", style: "margin-top:12px" }, [
              h("label", {}, "Theme mode"),
              (() => {
                const sel = h("select", { id: "themeMode" }, []);
                ["system", "light", "dark"].forEach((v) => sel.appendChild(h("option", { value: v, selected: theme === v ? "selected" : null }, v)));
                return sel;
              })(),
            ]),
            h("div", { class: "hstack", style: "margin-top:12px" }, [
              h("button", { class: "btn", type: "button", "data-action": "toggleTheme" }, "Toggle quick"),
            ]),
          ]),
          h("div", { class: "card pad" }, [
            h("div", { class: "section-title" }, "Data tools"),
            h("div", { class: "muted", style: "margin-top:6px;font-size:13px" }, "All app data is stored in localStorage for this browser/device."),
            h("div", { class: "hstack", style: "margin-top:12px;flex-wrap:wrap" }, [
              h("button", { class: "btn primary", type: "button", "data-action": "reset" }, "Reset demo"),
              h("button", { class: "btn", type: "button", "data-action": "export" }, "Export demo JSON"),
              h("label", { class: "btn", style: "cursor:pointer" }, [
                "Import demo JSON",
                h("input", { id: "importFile", type: "file", accept: "application/json", style: "display:none" }),
              ]),
            ]),
          ]),
        ]),
        h("hr", { class: "sep" }),
        h("div", { class: "card pad" }, [
          h("div", { class: "section-title" }, "Notes"),
          h("div", { class: "muted", style: "margin-top:6px;font-size:13px" }, [
            "• Reset clears all demo data and re-seeds on next load.\n",
            "• Export/Import lets you move a demo snapshot between browsers.\n",
            "• PDFs are generated client-side and not stored persistently on GitHub Pages.\n",
          ]),
        ]),
      ]),
    ]);
  }
function wireSettings() {
  const isPayee = state.role === "payee";

  // Theme dropdown
  const sel = $("#themeMode");
  on(sel, "change", () => {
    localStorage.setItem(APP.themeKey, sel.value);
    applyThemeFromStorage();
    toast("Theme", `Set to ${sel.value}`);
  });

  // Theme quick toggle
  on($("#view [data-action='toggleTheme']"), "click", toggleTheme);

  // Export
  on($("#view [data-action='export']"), "click", () => {
    if (isPayee) return toast("Not allowed", "Payee role cannot export demo data.");
    state.db.meta.lastBackupAt = Date.now();
    saveDb();
    downloadText("approvehub-demo-export.json", JSON.stringify(state.db, null, 2), "application/json");
    toast("Exported", "Demo JSON downloaded.");
  });

  // Reset
  on($("#view [data-action='reset']"), "click", () => {
    if (isPayee) return toast("Not allowed", "Payee role cannot reset demo data.");

    openModal({
      title: "Reset demo",
      body: h("div", { class: "banner warn" }, [
        h("div", { class: "title" }, "This will clear all local demo data"),
        h("div", { class: "body" }, "One-click reset will wipe localStorage for this demo and restore seed data."),
      ]),
      footer: h("div", { class: "hstack" }, [
        h("button", { class: "btn", type: "button", "data-close": "1" }, "Cancel"),
        h("button", { class: "btn danger", type: "button", "data-confirm": "1" }, "Reset"),
      ]),
      onReady: ({ root, close }) => {
        on($("[data-close]", root), "click", close);
        on($("[data-confirm]", root), "click", () => {
          localStorage.removeItem(APP.storageKey);
          state.db = defaultDb();
          seedIfNeeded();
          saveDb();
          close();
          toast("Reset", "Demo reset to seed data.");
          location.hash = "#/jobs";
        });
      },
    });
  });

  // Import
  const file = $("#importFile");
  on(file, "change", async () => {
    if (isPayee) {
      toast("Not allowed", "Payee role cannot import demo data.");
      file.value = "";
      return;
    }

    const f = file.files?.[0];
    if (!f) return;

    try {
      const text = await f.text();
      const parsed = JSON.parse(text);
      const mig = migrate(parsed);

      if (!mig.ok) {
        toast("Import blocked", mig.reason || "Incompatible schema.");
        file.value = "";
        return;
      }

      state.db = mig.db;
      saveDb();
      toast("Imported", "Demo JSON imported.");
      file.value = "";
      route();
    } catch {
      toast("Import failed", "Invalid JSON file.");
      file.value = "";
    }
  });

  // If Payee: disable/hide data tools UI
  if (isPayee) {
    const exportBtn = $("#view [data-action='export']");
    const resetBtn = $("#view [data-action='reset']");
    if (exportBtn) exportBtn.setAttribute("disabled", "disabled");
    if (resetBtn) resetBtn.setAttribute("disabled", "disabled");
    if (file) file.setAttribute("disabled", "disabled");
  }
}
  /* =========================
     Page placeholders (Part 4 completes)
  ========================= */
  function renderPaymentsPlaceholder() {
    return h("div", { class: "card pad" }, [
      h("div", { class: "card-title" }, "Payments"),
      h("div", { class: "card-sub" }, "Payments flow + release blocking rules are implemented in PART 4."),
      h("hr", { class: "sep" }),
      h("div", { class: "banner info" }, [
        h("div", { class: "title" }, "Important"),
        h("div", { class: "body" }, COMPLIANCE.FUNDS_STATEMENT),
      ]),
      h("div", { class: "muted", style: "margin-top:12px;font-size:12px" }, COMPLIANCE.FUNDS_STATEMENT),
    ]);
  }

  function renderApprovalsPlaceholder() {
    return h("div", { class: "card pad" }, [
      h("div", { class: "card-title" }, "Approvals"),
      h("div", { class: "card-sub" }, "Approvals inbox actions + audit entries are implemented in PART 4."),
    ]);
  }

  function renderDisputesPlaceholder() {
    return h("div", { class: "card pad" }, [
      h("div", { class: "card-title" }, "Disputes"),
      h("div", { class: "card-sub" }, "Disputes timeline + pause release toggle are implemented in PART 4."),
    ]);
  }

  function renderMessagesPlaceholder(params, query) {
    return h("div", { class: "card pad" }, [
      h("div", { class: "card-title" }, "Messages"),
      h("div", { class: "card-sub" }, "Messages thread + summary attachments + Regenerate PDF are implemented in PART 4."),
    ]);
  }

  function renderReportsPlaceholder() {
    return h("div", { class: "card pad" }, [
      h("div", { class: "card-title" }, "Reports"),
      h("div", { class: "card-sub" }, "CSV exports (jobs/invoices/milestones/releases/disputes/messages/payees/auditLog) are implemented in PART 4."),
    ]);
  }

  /* =========================
     Wire dispatcher
  ========================= */
  function wireAfterRender(routeKey, params, query) {
    if (routeKey === "jobs" && !params?.jobId && !params?.invoiceId) wireJobsDashboard();
    if (routeKey === "jobs" && params?.jobId) wireJobDetail(params.jobId);
    if (routeKey === "jobs" && params?.invoiceId) wireInvoiceDetail(params.invoiceId);

    if (routeKey === "company") wireCompany();
    if (routeKey === "settings") wireSettings();

    // placeholders will be wired in Part 4
  }

  /* =========================
     Route registrations
  ========================= */
  addRoute({ key: "jobs", pattern: /^\/jobs$/, roles: ["client", "manager", "accountant", "admin"], render: renderJobsDashboard });
  addRoute({ key: "jobs", pattern: /^\/jobs\/(?<jobId>[^/]+)$/, roles: ["client", "manager", "accountant", "admin"], render: renderJobDetail });
  addRoute({ key: "jobs", pattern: /^\/invoices\/(?<invoiceId>[^/]+)$/, roles: ["client", "manager", "accountant", "admin"], render: renderInvoiceDetail });

  addRoute({ key: "payments", pattern: /^\/payments$/, roles: ["client", "manager", "payee", "accountant", "admin"], render: renderPaymentsPlaceholder });
  addRoute({ key: "approvals", pattern: /^\/approvals$/, roles: ["client", "manager", "accountant", "admin"], render: renderApprovalsPlaceholder });
  addRoute({ key: "disputes", pattern: /^\/disputes$/, roles: ["client", "manager", "accountant", "admin"], render: renderDisputesPlaceholder });
  addRoute({ key: "messages", pattern: /^\/messages$/, roles: ["client", "manager", "admin"], render: renderMessagesPlaceholder });
  addRoute({ key: "company", pattern: /^\/company$/, roles: ["client", "manager", "payee", "accountant", "admin"], render: renderCompany });
  addRoute({ key: "reports", pattern: /^\/reports$/, roles: ["client", "manager", "accountant", "admin"], render: renderReportsPlaceholder });
  addRoute({ key: "settings", pattern: /^\/settings$/, roles: ["client", "manager", "payee", "accountant", "admin"], render: renderSettings });

  /* =========================
     Global header wiring
  ========================= */
  function initHeader() {
    // Role switch
    const sel = $("#roleSelect");
    if (sel) {
      sel.value = state.role;
      on(sel, "change", () => setRole(sel.value));
    }

    // Theme toggle
    on($("#themeToggle"), "click", toggleTheme);

    // Notifications modal (simple counters)
    on($("#notifBtn"), "click", () => {
      openModal({
        title: "Notifications",
        body: h("div", { class: "vstack" }, [
          h("div", { class: "card pad" }, [
            h("div", { class: "section-title" }, "Counters"),
            h("div", { class: "muted", style: "margin-top:6px;font-size:13px" }, "Pending approvals, open disputes, and blocked releases are shown in the nav."),
            h("hr", { class: "sep" }),
            h("div", { class: "grid cols-3" }, [
              h("div", { class: "kpi" }, [h("div", { class: "k" }, "Approvals"), h("div", { class: "v" }, String(approvalsCountForRole(state.role)))]),
              h("div", { class: "kpi" }, [h("div", { class: "k" }, "Disputes"), h("div", { class: "v" }, String(openDisputesCount()))]),
              h("div", { class: "kpi" }, [h("div", { class: "k" }, "Blocked"), h("div", { class: "v" }, String(blockedReleasesCount()))]),
            ]),
          ]),
        ]),
        footer: h("div", { class: "hstack" }, [h("button", { class: "btn primary", type: "button", "data-close": "1" }, "Close")]),
        onReady: ({ root, close }) => on($("[data-close]", root), "click", close),
      });
    });

    // Global search
    const input = $("#globalSearch");
    const pop = $("#searchPopover");
    if (input && pop) {
      on(input, "input", () => renderSearchPopover(buildSearchResults(input.value)));
      on(input, "focus", () => renderSearchPopover(buildSearchResults(input.value)));
      on(input, "keydown", (e) => {
        if (e.key === "Escape") {
          pop.hidden = true;
          pop.innerHTML = "";
          input.blur();
        }
      });
      on(document, "click", (e) => {
        if (!pop.contains(e.target) && e.target !== input) {
          pop.hidden = true;
          pop.innerHTML = "";
        }
      });
    }
  }

  /* =========================
     Init (Part 4 completes)
  ========================= */
  function initCore() {
    applyThemeFromStorage();
    state.role = getRole();

    const raw = loadDbRaw();
    if (!raw) {
      state.db = defaultDb();
      seedIfNeeded();
      saveDb();
    } else {
      const mig = migrate(raw);
      if (!mig.ok) {
        state.db = defaultDb();
        seedIfNeeded();
        saveDb();
        toast("Demo reset", "Incompatible schema detected. Seed data restored.");
      } else {
        state.db = mig.db;
        // Ensure required arrays exist
        for (const k of ["jobs", "payees", "invoices", "milestones", "releases", "disputes", "messages", "auditLog"]) {
          if (!Array.isArray(state.db[k])) state.db[k] = [];
        }
        if (!state.db.meta) state.db.meta = { seededAt: null, lastBackupAt: null };
        seedIfNeeded();
        saveDb();
      }
    }

    updateNavVisibility();
    updateNavCounters();
    initHeader();

    on(window, "hashchange", route);

    if (!location.hash || location.hash === "#") location.hash = "#/jobs";
    route();
  }

  /* =========================================================
     STOP HERE — paste PART 4 right after this line.
     (PART 4 adds Payments/Approvals/Disputes/Messages/Reports
      + exact release blocking rules + final init call.)
     ========================================================= */
  // Expose what Part 4 needs
window.__APP__ = {
  // core state + routing
  state,
  ROUTES,
  route,
  initCore,

  // ui helpers
  h,
  $,
  $$,
  on,
  toast,
  openModal,

  // formatting/helpers Part4 tries to use
  esc,
  money,
  fmtDateTime,
  uid,
  clamp,
  safeFile,
  downloadText,

  // permissions + selectors Part4 tries to use
  perms,
  getJob,
  getPayee,
  getInvoice,
  getMilestone,
  jobInvoices,
  jobMilestones,
  jobReleases,
  jobDisputes,

  // persistence
  saveDb,
  defaultDb,
  seedIfNeeded,

  // compliance strings
  COMPLIANCE,
};

// Do NOT init yet — Part 4 will call it
