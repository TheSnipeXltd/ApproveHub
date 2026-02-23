// PART 1 START
(() => {
  "use strict";

  /* =========================================================
     ApproveHub — Static Demo App (single-file JS)
     - Hash routing only
     - localStorage persistence + schema migration/reset
     - Event delegation: #view + #modalRoot
     ========================================================= */

  const LS_KEY = "approvehub_demo_db";
  const SCHEMA_VERSION = 1;

  // MUST MATCH EXACTLY (character-for-character)
  const VAT_DISCLAIMER =
    "VAT depends on the project and each supplier’s VAT status. Savings vary. We charge VAT on our management fee where applicable. Not tax advice.";
  const FUNDS_STATEMENT =
    "We do not hold client funds. Funds are held and released by our escrow/PBA partner.";

  const ROLE_LABEL = {
    manager: "Manager",
    client: "Client",
    payee: "Payee",
    accountant: "Accountant",
    admin: "Admin",
  };

  const ROLE_PERMS = {
    manager: { nav: ["jobs","payments","approvals","disputes","messages","company","reports","settings"], canReset:true, canExport:true, canImport:true, canApproveManager:true, canApproveClient:false, canConfirmBank:true, canSendToPartner:true, canMarkReleased:true, canEditBank:true, canEditInvoice:true, canCreateJob:true },
    client: { nav: ["jobs","payments","approvals","disputes","messages","company","settings"], canReset:false, canExport:true, canImport:true, canApproveManager:false, canApproveClient:true, canConfirmBank:false, canSendToPartner:false, canMarkReleased:false, canEditBank:false, canEditInvoice:true, canCreateJob:false },
    payee: { nav: ["payments","messages","company","settings"], canReset:false, canExport:false, canImport:false, canApproveManager:false, canApproveClient:false, canConfirmBank:false, canSendToPartner:false, canMarkReleased:false, canEditBank:true, canEditInvoice:false, canCreateJob:false },
    accountant: { nav: ["jobs","reports","settings"], canReset:false, canExport:true, canImport:true, canApproveManager:false, canApproveClient:false, canConfirmBank:false, canSendToPartner:false, canMarkReleased:false, canEditBank:false, canEditInvoice:false, canCreateJob:false },
    admin: { nav: ["jobs","payments","approvals","disputes","messages","company","reports","settings"], canReset:true, canExport:true, canImport:true, canApproveManager:true, canApproveClient:true, canConfirmBank:true, canSendToPartner:true, canMarkReleased:true, canEditBank:true, canEditInvoice:true, canCreateJob:true },
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const nowIso = () => new Date().toISOString();
  const dayIso = (daysAgo = 0) => new Date(Date.now() - daysAgo * 86400000).toISOString();

  function uid(prefix) {
    return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatGBP(n) {
    const num = Number(n || 0);
    try { return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(num); }
    catch { return `£${num.toFixed(2)}`; }
  }

  function formatDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "2-digit" });
  }

  function parseQuery(qs) {
    const out = {};
    if (!qs) return out;
    const s = qs.startsWith("?") ? qs.slice(1) : qs;
    for (const part of s.split("&")) {
      if (!part) continue;
      const [k, v] = part.split("=");
      out[decodeURIComponent(k)] = decodeURIComponent(v || "");
    }
    return out;
  }

  function downloadText(filename, text, mime = "text/plain") {
    const blob = new Blob([text], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 250);
  }

  function toCsv(rows) {
    const safe = (v) => {
      const s = String(v ?? "");
      if (/[,"\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
      return s;
    };
    if (!rows.length) return "empty\n";
    const cols = Object.keys(rows[0]);
    return cols.map(safe).join(",") + "\n" +
      rows.map((r) => cols.map((c) => safe(r[c])).join(",")).join("\n") + "\n";
  }

  /* ---------------------------
     Storage + Seed
  --------------------------- */
  let db = null;

  const ui = {
    role: localStorage.getItem("approvehub_role") || "manager",
    theme: localStorage.getItem("approvehub_theme") || "system", // system | light | dark
    route: { path: "/jobs", params: {}, query: {} },
  };

  function perms() { return ROLE_PERMS[ui.role] || ROLE_PERMS.manager; }

  function loadDb() {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  function saveDb() {
    localStorage.setItem(LS_KEY, JSON.stringify(db));
  }

  function migrate(loaded) {
    if (!loaded) return null;
    if (loaded.schemaVersion !== SCHEMA_VERSION) return null; // reset on mismatch
    return loaded;
  }

  function seedIfNeeded() {
    const loaded = migrate(loadDb());
    if (!loaded) { db = defaultDb(); saveDb(); return; }
    db = loaded;
  }

  function resetDb(reason = "Reset demo") {
    db = defaultDb();
    db.meta.lastResetReason = reason;
    saveDb();
    toast("info", "Demo reset", "Demo data has been reset.");
    log("reset_demo", "db", "root", null, { reason });
    routeTo("#/jobs");
  }

  /* ---------------------------
     Finders + Derived
  --------------------------- */
  function getJob(jobId) { return db.jobs.find(j => j.id === jobId) || null; }
  function getPayee(payeeId) { return db.payees.find(p => p.id === payeeId) || null; }
  function getMilestone(msId) { return db.milestones.find(m => m.id === msId) || null; }
  function getInvoice(invId) { return db.invoices.find(i => i.id === invId) || null; }
  function getRelease(relId) { return db.releases.find(r => r.id === relId) || null; }

  function jobMilestones(job) { return (job?.milestoneIds || []).map(getMilestone).filter(Boolean); }
  function jobInvoices(job) { return (job?.invoiceIds || []).map(getInvoice).filter(Boolean); }
  function jobReleases(job) { return (job?.releaseIds || []).map(getRelease).filter(Boolean); }
  function jobDisputes(job) { return (job?.disputeIds || []).map(id => db.disputes.find(d => d.id === id)).filter(Boolean); }
  function jobThreadMessages(job) { return db.messages.filter(m => m.threadId === job.threadId).sort((a,b) => (a.ts > b.ts ? 1 : -1)); }

  function invoiceTotals(inv) {
    const clientPaymentBeforeVat = Number(inv.clientPaymentBeforeVat || 0);
    const totalToPayees = (inv.lineItems || []).reduce((s, li) => s + Number(li.amount || 0), 0);
    const feePot = Math.max(0, clientPaymentBeforeVat - totalToPayees);
    const vatRate = clamp(Number(inv.feeVatRate ?? 20), 0, 100);
    const vatOnFee = Math.round((feePot * vatRate / 100) * 100) / 100;
    const grandTotal = Math.round((clientPaymentBeforeVat + vatOnFee) * 100) / 100;

    // Illustrative example ONLY
    const exampleWholeVat = Math.round((clientPaymentBeforeVat * 0.2) * 100) / 100;
    const illustrativeDiff = Math.max(0, Math.round((exampleWholeVat - vatOnFee) * 100) / 100);

    return { clientPaymentBeforeVat, totalToPayees, feePot, vatRate, vatOnFee, grandTotal, exampleWholeVat, illustrativeDiff };
  }

  /* CONTINUES IN PART 2 */
// PART 1 END

 // PART 2 START
  /* ---------------------------
     Default DB (seed)
  --------------------------- */
  function defaultDb() {
    const payees = [
      {
        id: "pay_oakbeam",
        type: "contractor",
        name: "Oak & Beam Carpentry Ltd",
        vatRegistered: true,
        vatNumber: "GB 184 2211 73",
        bank: { accountName: "Oak & Beam Carpentry Ltd", sortCode: "20-11-05", accountNumber: "43819277", bankName: "Barclays" },
        bankChanged: false,
        bankConfirmed: true,
        updatedAt: dayIso(3),
      },
      {
        id: "pay_electrics",
        type: "contractor",
        name: "South London Electrics",
        vatRegistered: false,
        vatNumber: "",
        bank: { accountName: "South London Electrics", sortCode: "04-00-04", accountNumber: "11849201", bankName: "HSBC" },
        bankChanged: false,
        bankConfirmed: true,
        updatedAt: dayIso(5),
      },
      {
        id: "pay_supplies",
        type: "supplier",
        name: "BuildPro Supplies",
        vatRegistered: true,
        vatNumber: "GB 992 3011 41",
        bank: { accountName: "BuildPro Supplies", sortCode: "60-02-49", accountNumber: "90114425", bankName: "NatWest" },
        bankChanged: false,
        bankConfirmed: true,
        updatedAt: dayIso(4),
      },
    ];

    const jobs = [
      { id: "job_hero", name: "Loft Conversion — West Wickham", clientName: "A. Patel", address: "West Wickham, BR4 (demo)", status: "open", archived: false, createdAt: dayIso(26), updatedAt: dayIso(1), description: "Dormer loft conversion with staged releases to trades and suppliers.", milestoneIds: ["ms_dep","ms_struct","ms_first","ms_second","ms_final"], invoiceIds: ["inv_hero_1"], releaseIds: ["rel_hero_1","rel_hero_2"], disputeIds: ["dis_hero_1"], threadId: "thr_job_hero" },
      { id: "job_kext", name: "Kitchen Extension — Beckenham", clientName: "J. Morris", address: "Beckenham, BR3 (demo)", status: "open", archived: false, createdAt: dayIso(40), updatedAt: dayIso(3), description: "Single-storey rear extension. Pending client approval for a stage release.", milestoneIds: ["ms_k1","ms_k2","ms_k3"], invoiceIds: ["inv_kext_1"], releaseIds: ["rel_kext_1"], disputeIds: [], threadId: "thr_job_kext" },
      { id: "job_roof", name: "Roof Repair — Croydon", clientName: "S. Green", address: "Croydon, CR0 (demo)", status: "open", archived: false, createdAt: dayIso(14), updatedAt: dayIso(2), description: "Urgent repair. Draft release awaiting submission.", milestoneIds: ["ms_r1"], invoiceIds: ["inv_roof_1"], releaseIds: ["rel_roof_1"], disputeIds: [], threadId: "thr_job_roof" },
      { id: "job_bath", name: "Bathroom Refurb — Bromley", clientName: "K. Singh", address: "Bromley, BR1 (demo)", status: "open", archived: false, createdAt: dayIso(20), updatedAt: dayIso(7), description: "Mid-project. No disputes.", milestoneIds: ["ms_b1"], invoiceIds: ["inv_bath_1"], releaseIds: [], disputeIds: [], threadId: "thr_job_bath" },
      { id: "job_drive", name: "Driveway Resurface — Orpington", clientName: "D. Clark", address: "Orpington, BR6 (demo)", status: "open", archived: false, createdAt: dayIso(9), updatedAt: dayIso(1), description: "Materials ordered. Awaiting evidence on milestone.", milestoneIds: ["ms_d1"], invoiceIds: ["inv_drive_1"], releaseIds: ["rel_drive_1"], disputeIds: [], threadId: "thr_job_drive" },
      { id: "job_done", name: "Flat Refresh — Lewisham (Completed)", clientName: "R. Evans", address: "Lewisham, SE13 (demo)", status: "completed", archived: false, createdAt: dayIso(80), updatedAt: dayIso(50), description: "Completed job (demo).", milestoneIds: ["ms_c1"], invoiceIds: ["inv_done_1"], releaseIds: ["rel_done_1"], disputeIds: [], threadId: "thr_job_done" },
    ];

    const milestones = [
      { id: "ms_dep", jobId: "job_hero", title: "Deposit & Pre-start", evidenceRequired: false, evidenceProvided: true, targetDate: dayIso(30) },
      { id: "ms_struct", jobId: "job_hero", title: "Structure & Steel Installed", evidenceRequired: true, evidenceProvided: true, targetDate: dayIso(18) },
      { id: "ms_first", jobId: "job_hero", title: "First Fix Completed", evidenceRequired: true, evidenceProvided: false, targetDate: dayIso(10) },
      { id: "ms_second", jobId: "job_hero", title: "Second Fix Completed", evidenceRequired: true, evidenceProvided: false, targetDate: dayIso(5) },
      { id: "ms_final", jobId: "job_hero", title: "Practical Completion", evidenceRequired: true, evidenceProvided: false, targetDate: dayIso(-7) },

      { id: "ms_k1", jobId: "job_kext", title: "Groundworks", evidenceRequired: true, evidenceProvided: true, targetDate: dayIso(25) },
      { id: "ms_k2", jobId: "job_kext", title: "Shell Weather-tight", evidenceRequired: true, evidenceProvided: true, targetDate: dayIso(12) },
      { id: "ms_k3", jobId: "job_kext", title: "Kitchen Fit", evidenceRequired: true, evidenceProvided: true, targetDate: dayIso(4) },

      { id: "ms_r1", jobId: "job_roof", title: "Repair Complete", evidenceRequired: true, evidenceProvided: false, targetDate: dayIso(2) },

      { id: "ms_b1", jobId: "job_bath", title: "First Fix", evidenceRequired: true, evidenceProvided: true, targetDate: dayIso(8) },

      { id: "ms_d1", jobId: "job_drive", title: "Materials Delivered", evidenceRequired: true, evidenceProvided: false, targetDate: dayIso(1) },

      { id: "ms_c1", jobId: "job_done", title: "Practical Completion", evidenceRequired: true, evidenceProvided: true, targetDate: dayIso(60) },
    ];

    const invoices = [
      {
        id: "inv_hero_1",
        jobId: "job_hero",
        number: "INV-00041",
        createdAt: dayIso(2),
        updatedAt: dayIso(1),
        clientPaymentBeforeVat: 15290,
        feeVatRate: 20,
        lineItems: [
          { id: "li_1", payeeId: "pay_oakbeam", category: "contractor", description: "Carpentry (phase 1)", amount: 6200 },
          { id: "li_2", payeeId: "pay_electrics", category: "contractor", description: "Electrical first fix", amount: 3100 },
          { id: "li_3", payeeId: "pay_supplies", category: "supplier", description: "Timber + fixings", amount: 1450 },
        ],
      },
      {
        id: "inv_kext_1",
        jobId: "job_kext",
        number: "INV-00052",
        createdAt: dayIso(5),
        updatedAt: dayIso(3),
        clientPaymentBeforeVat: 11800,
        feeVatRate: 20,
        lineItems: [
          { id: "li_k1", payeeId: "pay_supplies", category: "supplier", description: "Blockwork + concrete", amount: 3200 },
          { id: "li_k2", payeeId: "pay_oakbeam", category: "contractor", description: "Framing + install", amount: 4100 },
        ],
      },
      {
        id: "inv_roof_1",
        jobId: "job_roof",
        number: "INV-00060",
        createdAt: dayIso(3),
        updatedAt: dayIso(2),
        clientPaymentBeforeVat: 2800,
        feeVatRate: 20,
        lineItems: [
          { id: "li_r1", payeeId: "pay_supplies", category: "supplier", description: "Tiles + underlay", amount: 640 },
          { id: "li_r2", payeeId: "pay_oakbeam", category: "contractor", description: "Labour", amount: 980 },
        ],
      },
      {
        id: "inv_bath_1",
        jobId: "job_bath",
        number: "INV-00058",
        createdAt: dayIso(10),
        updatedAt: dayIso(7),
        clientPaymentBeforeVat: 5400,
        feeVatRate: 20,
        lineItems: [
          { id: "li_b1", payeeId: "pay_supplies", category: "supplier", description: "Bathroom suite", amount: 1600 },
        ],
      },
      {
        id: "inv_drive_1",
        jobId: "job_drive",
        number: "INV-00063",
        createdAt: dayIso(2),
        updatedAt: dayIso(1),
        clientPaymentBeforeVat: 7600,
        feeVatRate: 20,
        lineItems: [
          { id: "li_d1", payeeId: "pay_supplies", category: "supplier", description: "Aggregate + binder", amount: 2100 },
          { id: "li_d2", payeeId: "pay_oakbeam", category: "contractor", description: "Labour + plant", amount: 2500 },
        ],
      },
      {
        id: "inv_done_1",
        jobId: "job_done",
        number: "INV-00012",
        createdAt: dayIso(62),
        updatedAt: dayIso(50),
        clientPaymentBeforeVat: 9200,
        feeVatRate: 20,
        lineItems: [
          { id: "li_c1", payeeId: "pay_oakbeam", category: "contractor", description: "Joinery", amount: 3000 },
          { id: "li_c2", payeeId: "pay_supplies", category: "supplier", description: "Paint + consumables", amount: 450 },
        ],
      },
    ];

    const releases = [
      {
        id: "rel_hero_1",
        jobId: "job_hero",
        invoiceId: "inv_hero_1",
        milestoneId: "ms_struct",
        title: "Release — Structure stage",
        status: "Submitted",
        approvals: { manager: false, client: false },
        sentToPartnerAt: null,
        releasedAt: null,
        createdAt: dayIso(2),
        updatedAt: dayIso(1),
        payeeSplits: [
          { payeeId: "pay_oakbeam", amount: 3000 },
          { payeeId: "pay_electrics", amount: 1400 },
          { payeeId: "pay_supplies", amount: 900 },
        ],
        notes: "Stage release for structure milestone.",
      },
      {
        id: "rel_hero_2",
        jobId: "job_hero",
        invoiceId: "inv_hero_1",
        milestoneId: "ms_first",
        title: "Release — First fix stage",
        status: "Draft",
        approvals: { manager: false, client: false },
        sentToPartnerAt: null,
        releasedAt: null,
        createdAt: dayIso(1),
        updatedAt: dayIso(1),
        payeeSplits: [
          { payeeId: "pay_oakbeam", amount: 2200 },
          { payeeId: "pay_electrics", amount: 900 },
        ],
        notes: "Draft release awaiting submission.",
      },
      {
        id: "rel_kext_1",
        jobId: "job_kext",
        invoiceId: "inv_kext_1",
        milestoneId: "ms_k2",
        title: "Release — Shell stage",
        status: "Manager approved",
        approvals: { manager: true, client: false },
        sentToPartnerAt: null,
        releasedAt: null,
        createdAt: dayIso(5),
        updatedAt: dayIso(3),
        payeeSplits: [
          { payeeId: "pay_supplies", amount: 1400 },
          { payeeId: "pay_oakbeam", amount: 1900 },
        ],
        notes: "Awaiting client approval.",
      },
      {
        id: "rel_roof_1",
        jobId: "job_roof",
        invoiceId: "inv_roof_1",
        milestoneId: "ms_r1",
        title: "Release — Roof repair",
        status: "Draft",
        approvals: { manager: false, client: false },
        sentToPartnerAt: null,
        releasedAt: null,
        createdAt: dayIso(2),
        updatedAt: dayIso(2),
        payeeSplits: [
          { payeeId: "pay_supplies", amount: 500 },
          { payeeId: "pay_oakbeam", amount: 800 },
        ],
        notes: "Evidence missing for milestone (demo blocker).",
      },
      {
        id: "rel_drive_1",
        jobId: "job_drive",
        invoiceId: "inv_drive_1",
        milestoneId: "ms_d1",
        title: "Release — Materials delivery",
        status: "Submitted",
        approvals: { manager: false, client: false },
        sentToPartnerAt: null,
        releasedAt: null,
        createdAt: dayIso(1),
        updatedAt: dayIso(1),
        payeeSplits: [
          { payeeId: "pay_supplies", amount: 1200 },
        ],
        notes: "Submitted for approvals.",
      },
      {
        id: "rel_done_1",
        jobId: "job_done",
        invoiceId: "inv_done_1",
        milestoneId: "ms_c1",
        title: "Release — Completion",
        status: "Released",
        approvals: { manager: true, client: true },
        sentToPartnerAt: dayIso(58),
        releasedAt: dayIso(57),
        createdAt: dayIso(60),
        updatedAt: dayIso(57),
        payeeSplits: [
          { payeeId: "pay_oakbeam", amount: 2800 },
          { payeeId: "pay_supplies", amount: 420 },
        ],
        notes: "Completed release (demo).",
      },
    ];

    const disputes = [
      {
        id: "dis_hero_1",
        jobId: "job_hero",
        title: "Client query: scope clarification",
        status: "open",
        pauseRelease: true,
        createdAt: dayIso(4),
        updatedAt: dayIso(1),
        timeline: [
          { ts: dayIso(4), byRole: "client", type: "opened", text: "Query on whether second fix includes additional sockets." },
          { ts: dayIso(2), byRole: "manager", type: "comment", text: "Explained allowance. Awaiting confirmation." },
        ],
      },
    ];

    const messages = [
      { id: "msg_hero_1", threadId: "thr_job_hero", jobId: "job_hero", ts: dayIso(3), byRole: "manager", text: "Kick-off: milestones and payment approvals will be tracked here.", attachments: [] },
      { id: "msg_hero_2", threadId: "thr_job_hero", jobId: "job_hero", ts: dayIso(2), byRole: "client", text: "Thanks — please keep me posted before releases are sent.", attachments: [] },
      { id: "msg_kext_1", threadId: "thr_job_kext", jobId: "job_kext", ts: dayIso(4), byRole: "manager", text: "Shell stage ready for sign-off once you review photos.", attachments: [] },
    ];

    const auditLog = [
      { id: uid("aud"), ts: dayIso(2), actorRole: "manager", action: "seed_demo", entityType: "db", entityId: "root", jobId: null, details: { note: "Initial seed" } },
    ];

    return {
      schemaVersion: SCHEMA_VERSION,
      meta: { seededAt: nowIso(), lastResetReason: "" },
      payees,
      jobs,
      milestones,
      invoices,
      releases,
      disputes,
      messages,
      snapshots: [],
      auditLog,
    };
  }

  /* ---------------------------
     Audit log
  --------------------------- */
  function log(action, entityType, entityId, jobId, details = {}) {
    db.auditLog.unshift({
      id: uid("aud"),
      ts: nowIso(),
      actorRole: ui.role,
      action,
      entityType,
      entityId,
      jobId: jobId || null,
      details,
    });
    saveDb();
  }

  /* ---------------------------
     Toasts
  --------------------------- */
  const TOASTS_MAX = 4;

  function toast(kind, title, message) {
    const root = $("#toasts");
    if (!root) return;

    const id = uid("toast");
    const pill = kind === "bad" ? "bad" : kind === "warn" ? "warn" : kind === "ok" ? "ok" : "info";

    const html = `
      <div class="toast" data-toast-id="${id}">
        <div>
          <div class="t-title"><span class="pill ${pill}">${escapeHtml(kind.toUpperCase())}</span> ${escapeHtml(title)}</div>
          <div class="t-msg">${escapeHtml(message)}</div>
        </div>
        <button class="icon-btn" type="button" data-action="toast-close" data-toast-id="${id}" aria-label="Dismiss">✕</button>
      </div>
    `;

    root.insertAdjacentHTML("afterbegin", html);

    const items = $$(".toast", root);
    for (let i = TOASTS_MAX; i < items.length; i++) items[i].remove();

    setTimeout(() => {
      const el = root.querySelector(`[data-toast-id="${id}"]`);
      if (el) el.remove();
    }, 5200);
  }

  function bindToastDelegationOnce() {
    const root = $("#toasts");
    if (!root) return;

    root.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      if (btn.dataset.action === "toast-close") {
        const id = btn.dataset.toastId;
        const el = root.querySelector(`[data-toast-id="${id}"]`);
        if (el) el.remove();
      }
    });
  }

  /* CONTINUES IN PART 3 */
// PART 2 END

 // PART 3 START
  /* ---------------------------
     Modal (uses #modalRoot)
  --------------------------- */
  const modalState = { open: false, lastFocus: null };

  function openModal({ title, bodyHtml, footerHtml, ariaLabel }) {
    const root = $("#modalRoot");
    if (!root) return;

    modalState.lastFocus = document.activeElement;

    root.hidden = false;
    root.setAttribute("aria-hidden", "false");

    root.innerHTML = `
      <div class="modal-backdrop" data-action="modal-close" aria-hidden="true"></div>
      <div class="modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(ariaLabel || title || "Dialog")}">
        <div class="modal-head">
          <div class="card-title">${escapeHtml(title || "Dialog")}</div>
          <button class="icon-btn modal-x" type="button" data-action="modal-close" aria-label="Close">✕</button>
        </div>
        <div class="modal-body">${bodyHtml || ""}</div>
        <div class="modal-foot">
          ${footerHtml || `<div class="muted">Esc to close</div><button class="btn" type="button" data-action="modal-close">Close</button>`}
        </div>
      </div>
    `;

    const focusable = root.querySelector("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
    if (focusable) focusable.focus();

    modalState.open = true;
  }

  function closeModal() {
    const root = $("#modalRoot");
    if (!root) return;
    root.innerHTML = "";
    root.hidden = true;
    root.setAttribute("aria-hidden", "true");
    modalState.open = false;

    if (modalState.lastFocus && typeof modalState.lastFocus.focus === "function") {
      modalState.lastFocus.focus();
    }
    modalState.lastFocus = null;
  }

  function bindModalDelegationOnce() {
    const root = $("#modalRoot");
    if (!root) return;

    // click delegation
    root.addEventListener("click", (e) => {
      const el = e.target.closest("[data-action]");
      if (!el) return;

      const action = el.dataset.action;
      if (action === "modal-close") {
        e.preventDefault();
        closeModal();
        return;
      }

      // modal actions flow through normal handler
      handleAction(action, el.dataset, { inModal: true });
    });

    // change delegation (import file input)
    root.addEventListener("change", (e) => {
      const input = e.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (input.dataset.action !== "import-file") return;

      const file = input.files && input.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result || ""));
          importDb(parsed);
        } catch {
          toast("bad", "Import failed", "That file is not valid JSON for this demo.");
        }
      };
      reader.readAsText(file);
    });

    // ESC closes modal
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modalState.open) closeModal();
    });
  }

  /* ---------------------------
     Router (hash only)
  --------------------------- */
  function routeTo(hash) {
    window.location.hash = hash;
  }

  function ensureDefaultHash() {
    if (!window.location.hash || window.location.hash === "#") {
      window.location.hash = "#/jobs";
    }
  }

  function parseRoute() {
    let h = window.location.hash || "";
    if (!h || h === "#") return { path: "/jobs", params: {}, query: {} };

    if (h.startsWith("#")) h = h.slice(1);
    const [rawPath, rawQs] = h.split("?");
    const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
    const query = parseQuery(rawQs ? `?${rawQs}` : "");
    return matchRoute(path, query);
  }

  function matchRoute(path, query) {
    const seg = path.split("/").filter(Boolean);
    const out = { path, params: {}, query: query || {} };

    if (seg.length === 1 && seg[0] === "jobs") return out;
    if (seg.length === 2 && seg[0] === "jobs") { out.params.jobId = seg[1]; return out; }
    if (seg.length === 2 && seg[0] === "invoices") { out.params.invoiceId = seg[1]; return out; }

    if (seg.length === 1 && ["payments","approvals","disputes","messages","company","reports","settings"].includes(seg[0])) return out;

    return { path: "/notfound", params: {}, query: {} };
  }

  function bindRouterOnce() {
    window.addEventListener("hashchange", () => {
      ui.route = parseRoute();
      render();
    });
  }

  /* ---------------------------
     Theme + Role (header wiring)
  --------------------------- */
  function applyThemePref(pref) {
    ui.theme = pref;
    localStorage.setItem("approvehub_theme", pref);

    const html = document.documentElement;
    if (pref === "dark") html.setAttribute("data-theme", "dark");
    else if (pref === "light") html.setAttribute("data-theme", "light");
    else html.removeAttribute("data-theme");
  }

  function cycleTheme() {
    // system -> light -> dark -> system
    const next = ui.theme === "system" ? "light" : (ui.theme === "light" ? "dark" : "system");
    applyThemePref(next);
    toast("info", "Theme", `Theme set to ${next}.`);
    log("set_theme", "ui", "theme", null, { theme: next });
  }

  function setRole(role) {
    if (!ROLE_PERMS[role]) role = "manager";
    ui.role = role;
    localStorage.setItem("approvehub_role", role);
    toast("info", "Role switched", `You are now viewing as ${ROLE_LABEL[role] || role}.`);
    log("set_role", "ui", "role", null, { role });

    updateNavVisibility();
    updateNavCounts();
    render();
  }

  /* ---------------------------
     Approvals inbox (used by Approvals + Notifications)
  --------------------------- */
  function approvalsInboxItems() {
    const items = [];

    // bank confirmations
    for (const p of db.payees) {
      if (p.bankChanged && !p.bankConfirmed) {
        items.push({ type: "bank", id: p.id, label: `Confirm bank details: ${p.name}` });
      }
    }

    // release approvals + ready to send
    for (const r of db.releases) {
      if (r.status === "Submitted" && !r.approvals.manager) {
        items.push({ type: "release_mgr", id: r.id, label: `Approve release (Manager): ${r.title}` });
      }
      if (r.status === "Manager approved" && !r.approvals.client) {
        items.push({ type: "release_client", id: r.id, label: `Approve release (Client): ${r.title}` });
      }
      if (r.status === "Client approved") {
        items.push({ type: "release_ready", id: r.id, label: `Ready to send: ${r.title}` });
      }
    }

    return items;
  }

  function countApprovalsForRole(role) {
    const p = ROLE_PERMS[role] || ROLE_PERMS.manager;
    const items = approvalsInboxItems();
    let count = 0;
    for (const it of items) {
      if (it.type === "bank" && p.canConfirmBank) count++;
      if (it.type === "release_mgr" && p.canApproveManager) count++;
      if (it.type === "release_client" && p.canApproveClient) count++;
      if (it.type === "release_ready" && p.canSendToPartner) count++;
    }
    return count;
  }

  function openNotifications() {
    const items = approvalsInboxItems();
    const p = perms();

    const visible = items.filter(it => {
      if (it.type === "bank") return p.canConfirmBank;
      if (it.type === "release_mgr") return p.canApproveManager;
      if (it.type === "release_client") return p.canApproveClient;
      if (it.type === "release_ready") return p.canSendToPartner;
      return false;
    });

    const rows = visible.length ? `
      <div class="vstack">
        ${visible.map(it => `
          <div class="card">
            <div class="split">
              <div>
                <div class="card-title">${escapeHtml(it.label)}</div>
                <div class="card-sub muted">Action type: ${escapeHtml(it.type)}</div>
              </div>
              <div class="hstack">
                ${it.type === "bank" ? `<button class="btn primary" data-action="confirm-bank" data-payee-id="${escapeHtml(it.id)}">Confirm</button>` : ``}
                ${it.type === "release_mgr" ? `<button class="btn primary" data-action="approve-release-manager" data-release-id="${escapeHtml(it.id)}">Approve</button>` : ``}
                ${it.type === "release_client" ? `<button class="btn primary" data-action="approve-release-client" data-release-id="${escapeHtml(it.id)}">Approve</button>` : ``}
                ${it.type === "release_ready" ? `<button class="btn primary" data-action="send-to-partner" data-release-id="${escapeHtml(it.id)}">Send to partner</button>` : ``}
                <a class="btn ghost" href="#/approvals">Open inbox</a>
              </div>
            </div>
          </div>
        `).join("")}
      </div>
    ` : `<div class="banner info">No items needing action for this role right now.</div>`;

    openModal({
      title: "Notifications",
      ariaLabel: "Notifications and approvals",
      bodyHtml: rows,
      footerHtml: `<div class="muted">Tip: use Roles to preview different inboxes.</div><button class="btn" type="button" data-action="modal-close">Close</button>`
    });
  }

  /* ---------------------------
     Search popover
  --------------------------- */
  function renderSearchPopover(q) {
    const pop = $("#searchPopover");
    if (!pop) return;

    const query = String(q || "").trim().toLowerCase();
    if (!query) { pop.hidden = true; pop.innerHTML = ""; return; }

    const hits = [];

    for (const j of db.jobs) {
      if ((j.name || "").toLowerCase().includes(query) || j.id.toLowerCase().includes(query)) {
        hits.push({ type: "Job", tag: j.id, label: j.name, href: `#/jobs/${j.id}` });
      }
    }

    for (const inv of db.invoices) {
      if ((inv.number || "").toLowerCase().includes(query) || inv.id.toLowerCase().includes(query)) {
        const job = getJob(inv.jobId);
        hits.push({ type: "Invoice", tag: inv.number, label: job ? job.name : inv.jobId, href: `#/invoices/${inv.id}` });
      }
    }

    for (const p of db.payees) {
      if ((p.name || "").toLowerCase().includes(query) || p.id.toLowerCase().includes(query)) {
        hits.push({ type: "Payee", tag: p.type, label: p.name, href: `#/company?payee=${encodeURIComponent(p.id)}` });
      }
    }

    const sliced = hits.slice(0, 8);
    if (!sliced.length) {
      pop.innerHTML = `<div class="pop-item"><div><div class="card-title">No results</div><div class="muted">Try “Loft”, “INV-”, or a payee name.</div></div></div>`;
      pop.hidden = false;
      return;
    }

    pop.innerHTML = sliced.map(h => `
      <a class="pop-item" href="${escapeHtml(h.href)}">
        <div style="min-width:82px">
          <span class="pill info">${escapeHtml(h.type)}</span>
        </div>
        <div>
          <div class="card-title">${escapeHtml(h.label)}</div>
          <div class="muted">${escapeHtml(h.tag)}</div>
        </div>
      </a>
    `).join("");
    pop.hidden = false;
  }

  function bindHeaderOnce() {
    const roleSel = $("#roleSelect");
    const themeBtn = $("#themeToggle");
    const notifBtn = $("#notifBtn");
    const search = $("#globalSearch");
    const pop = $("#searchPopover");

    if (roleSel) {
      roleSel.value = ui.role;
      roleSel.addEventListener("change", () => setRole(roleSel.value));
    }

    if (themeBtn) themeBtn.addEventListener("click", () => cycleTheme());
    if (notifBtn) notifBtn.addEventListener("click", () => openNotifications());

    if (search && pop) {
      search.addEventListener("input", () => renderSearchPopover(search.value));
      search.addEventListener("focus", () => renderSearchPopover(search.value));

      document.addEventListener("click", (e) => {
        const within = e.target.closest(".search");
        if (!within) { pop.hidden = true; pop.innerHTML = ""; }
      });
    }
  }

  /* ---------------------------
     Nav visibility + counts
  --------------------------- */
  function updateNavVisibility() {
    const allowed = new Set(perms().nav || []);
    const nav = $("#sideNav");
    if (!nav) return;

    for (const a of $$(".nav-item", nav)) {
      const route = a.getAttribute("data-route") || "";
      const show = allowed.has(route);
      a.classList.toggle("hidden", !show);
      if (!show) {
        a.setAttribute("aria-hidden", "true");
        a.setAttribute("tabindex", "-1");
      } else {
        a.removeAttribute("aria-hidden");
        a.removeAttribute("tabindex");
      }
    }
  }

  function setNavActive() {
    const nav = $("#sideNav");
    if (!nav) return;
    const seg = (ui.route.path.split("/").filter(Boolean)[0] || "jobs");
    for (const a of $$(".nav-item", nav)) {
      const r = a.getAttribute("data-route");
      a.classList.toggle("active", r === seg);
    }
  }

  function setCount(sel, n) {
    const el = $(sel);
    if (!el) return;
    const num = Number(n || 0);
    el.textContent = String(num);
    el.hidden = num <= 0;
  }

  function updateNavCounts() {
    const openJobs = db.jobs.filter(j => !j.archived && j.status !== "completed").length;
    setCount("#navCountJobs", openJobs);

    const openReleases = db.releases.filter(r => r.status !== "Released").length;
    setCount("#navCountPayments", openReleases);

    const appr = countApprovalsForRole(ui.role);
    setCount("#navCountApprovals", appr);

    const openDisputes = db.disputes.filter(d => d.status === "open").length;
    setCount("#navCountDisputes", openDisputes);

    const recent = db.messages.filter(m => new Date(m.ts).getTime() > Date.now() - 3*86400000);
    const msgCount = recent.filter(m => m.byRole !== ui.role).length;
    setCount("#navCountMessages", msgCount);

    const badge = $("#notifBadge");
    if (badge) {
      const n = countApprovalsForRole(ui.role);
      badge.textContent = String(n);
      badge.hidden = n <= 0;
    }
  }

  /* CONTINUES IN PART 4 */
// PART 3 END
 // PART 4 START
  /* ---------------------------
     Release blockers (reasons)
  --------------------------- */
  function releaseBlockers(release) {
    const reasons = [];
    const job = getJob(release.jobId);

    // approvals required
    if (!release.approvals?.manager) reasons.push("Manager approval is required.");
    if (!release.approvals?.client) reasons.push("Client approval is required.");

    // bank confirmations
    const payeeIds = (release.payeeSplits || []).map(s => s.payeeId);
    const affected = db.payees.filter(p => payeeIds.includes(p.id) && p.bankChanged && !p.bankConfirmed);
    if (affected.length) reasons.push(`Bank details changed and not confirmed: ${affected.map(p => p.name).join(", ")}.`);

    // dispute pause
    const activePause = db.disputes.some(d => d.jobId === release.jobId && d.pauseRelease && d.status !== "closed");
    if (activePause) reasons.push("A dispute is pausing releases for this job.");

    // evidence required
    if (release.milestoneId) {
      const ms = getMilestone(release.milestoneId);
      if (ms && ms.evidenceRequired && !ms.evidenceProvided) reasons.push(`Evidence missing for milestone: ${ms.title}.`);
    }

    if (!job) reasons.push("Job not found for this release (demo data error).");
    return reasons;
  }

  /* ---------------------------
     Render (router -> #view)
  --------------------------- */
  function render() {
    // safer nav hiding (also hide via inline style even if CSS missing)
    updateNavVisibility();
    setNavActive();
    updateNavCounts();

    const view = $("#view");
    if (!view) return;

    const { path, params, query } = ui.route;

    let html = "";
    if (path === "/jobs") html = renderJobs(query);
    else if (path.startsWith("/jobs/")) html = renderJobDetail(params.jobId, query);
    else if (path.startsWith("/invoices/")) html = renderInvoiceDetail(params.invoiceId);
    else if (path === "/payments") html = renderPayments(query);
    else if (path === "/approvals") html = renderApprovals();
    else if (path === "/disputes") html = renderDisputes(query);
    else if (path === "/messages") html = renderMessages(query);
    else if (path === "/company") html = renderCompany(query);
    else if (path === "/reports") html = renderReports();
    else if (path === "/settings") html = renderSettings();
    else html = renderNotFound();

    view.innerHTML = html;

    const main = $("#main");
    if (main) main.focus();
  }

  function renderNotFound() {
    return `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Not found</div>
            <div class="card-sub">That page doesn’t exist in this demo.</div>
          </div>
          <a class="btn primary" href="#/jobs">Go to Jobs</a>
        </div>
      </div>
    `;
  }

  /* ---------------------------
     Override nav visibility (ensures hiding works)
  --------------------------- */
  function updateNavVisibility() {
    const allowed = new Set(perms().nav || []);
    const nav = $("#sideNav");
    if (!nav) return;

    for (const a of $$(".nav-item", nav)) {
      const route = a.getAttribute("data-route") || "";
      const show = allowed.has(route);

      // hard hide (works even if .hidden CSS missing)
      a.style.display = show ? "" : "none";

      if (!show) {
        a.setAttribute("aria-hidden", "true");
        a.setAttribute("tabindex", "-1");
      } else {
        a.removeAttribute("aria-hidden");
        a.removeAttribute("tabindex");
      }
    }
  }

  /* ---------------------------
     Pages
  --------------------------- */
  function renderJobs(query) {
    const tab = (query.tab || "open").toLowerCase(); // open | archived | completed
    const canCreate = perms().canCreateJob;
    const canExport = perms().canExport;

    const open = db.jobs.filter(j => !j.archived && j.status !== "completed");
    const archived = db.jobs.filter(j => j.archived);
    const completed = db.jobs.filter(j => !j.archived && j.status === "completed");

    const list = tab === "archived" ? archived : (tab === "completed" ? completed : open);

    const tiles = `
      <div class="grid cols-3">
        <div class="kpi"><div class="kpi-v">${open.length}</div><div class="kpi-l">Open jobs</div></div>
        <div class="kpi"><div class="kpi-v">${db.releases.filter(r => r.status !== "Released").length}</div><div class="kpi-l">Active releases</div></div>
        <div class="kpi"><div class="kpi-v">${db.disputes.filter(d => d.status === "open").length}</div><div class="kpi-l">Open disputes</div></div>
      </div>
    `;

    const tabs = `
      <div class="hstack">
        <a class="btn ${tab==="open"?"primary":"ghost"}" href="#/jobs?tab=open">Open</a>
        <a class="btn ${tab==="completed"?"primary":"ghost"}" href="#/jobs?tab=completed">Completed</a>
        <a class="btn ${tab==="archived"?"primary":"ghost"}" href="#/jobs?tab=archived">Archived</a>
      </div>
    `;

    const actions = `
      <div class="hstack">
        ${canCreate ? `<button class="btn primary" data-action="create-job">Create job</button>` : ``}
        ${canExport ? `<button class="btn" data-action="export-db">Export JSON</button>` : ``}
        ${perms().canImport ? `<button class="btn" data-action="import-db">Import JSON</button>` : ``}
      </div>
    `;

    const rows = list.length ? `
      <table class="table">
        <thead>
          <tr><th>Job</th><th>Status</th><th>Client</th><th>Updated</th><th></th></tr>
        </thead>
        <tbody>
          ${list.map(j => `
            <tr>
              <td>
                <div><strong>${escapeHtml(j.name)}</strong></div>
                <div class="muted">${escapeHtml(j.address)}</div>
              </td>
              <td><span class="pill ${j.status==="completed"?"ok":"info"}">${escapeHtml(j.archived ? "Archived" : j.status)}</span></td>
              <td>${escapeHtml(j.clientName)}</td>
              <td>${escapeHtml(formatDate(j.updatedAt))}</td>
              <td><a class="btn primary" href="#/jobs/${escapeHtml(j.id)}">Open</a></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    ` : `<div class="banner info">No jobs in this tab.</div>`;

    return `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Jobs</div>
            <div class="card-sub">Create, track, and export job bundles for clients and stakeholders.</div>
          </div>
          ${actions}
        </div>

        ${tiles}
        <div class="sep"></div>

        <div class="split">
          ${tabs}
          <div class="muted">Role: <strong>${escapeHtml(ROLE_LABEL[ui.role] || ui.role)}</strong></div>
        </div>

        <div class="sep"></div>
        ${rows}
      </div>
    `;
  }

  function renderJobDetail(jobId, query) {
    const job = getJob(jobId);
    if (!job) return renderNotFound();

    const tab = (query.tab || "invoices").toLowerCase(); // invoices | milestones | releases | disputes
    const canExport = perms().canExport;

    const headerActions = `
      <div class="hstack">
        <button class="btn" data-action="edit-job" data-job-id="${escapeHtml(job.id)}">Edit job</button>
        <button class="btn ${job.archived ? "primary" : ""}" data-action="${job.archived ? "unarchive-job" : "archive-job"}" data-job-id="${escapeHtml(job.id)}">
          ${job.archived ? "Unarchive" : "Archive"}
        </button>
        ${canExport ? `<button class="btn" data-action="export-job" data-job-id="${escapeHtml(job.id)}">Export job bundle</button>` : ``}
      </div>
    `;

    const tabs = `
      <div class="hstack">
        <a class="btn ${tab==="invoices"?"primary":"ghost"}" href="#/jobs/${escapeHtml(job.id)}?tab=invoices">Invoices</a>
        <a class="btn ${tab==="milestones"?"primary":"ghost"}" href="#/jobs/${escapeHtml(job.id)}?tab=milestones">Milestones</a>
        <a class="btn ${tab==="releases"?"primary":"ghost"}" href="#/jobs/${escapeHtml(job.id)}?tab=releases">Releases</a>
        <a class="btn ${tab==="disputes"?"primary":"ghost"}" href="#/jobs/${escapeHtml(job.id)}?tab=disputes">Disputes</a>
      </div>
    `;

    const invoices = jobInvoices(job);
    const milestones = jobMilestones(job);
    const releases = jobReleases(job);
    const disputes = jobDisputes(job);

    let body = "";
    if (tab === "milestones") {
      body = `
        <table class="table">
          <thead><tr><th>Milestone</th><th>Target</th><th>Evidence</th><th></th></tr></thead>
          <tbody>
            ${milestones.map(ms => `
              <tr>
                <td>
                  <div><strong>${escapeHtml(ms.title)}</strong></div>
                  <div class="muted">Evidence required: ${ms.evidenceRequired ? "Yes" : "No"}</div>
                </td>
                <td>${escapeHtml(formatDate(ms.targetDate))}</td>
                <td>
                  <span class="pill ${!ms.evidenceRequired ? "info" : (ms.evidenceProvided ? "ok" : "warn")}">
                    ${!ms.evidenceRequired ? "Not required" : (ms.evidenceProvided ? "Provided" : "Missing")}
                  </span>
                </td>
                <td>
                  ${ms.evidenceRequired ? `<button class="btn" data-action="toggle-evidence" data-ms-id="${escapeHtml(ms.id)}">${ms.evidenceProvided ? "Mark missing" : "Mark provided"}</button>` : `<span class="muted">—</span>`}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;
    } else if (tab === "releases") {
      body = releases.length ? `
        <table class="table">
          <thead><tr><th>Release</th><th>Status</th><th>Approvals</th><th></th></tr></thead>
          <tbody>
            ${releases.map(r => {
              const a = r.approvals || { manager:false, client:false };
              const statusPill = r.status === "Released" ? "ok" : (r.status === "Submitted" ? "warn" : "info");
              return `
                <tr>
                  <td>
                    <div><strong>${escapeHtml(r.title)}</strong></div>
                    <div class="muted">Milestone: ${escapeHtml(getMilestone(r.milestoneId)?.title || "—")}</div>
                  </td>
                  <td><span class="pill ${statusPill}">${escapeHtml(r.status)}</span></td>
                  <td class="muted">Mgr: ${a.manager ? "✓" : "—"} • Client: ${a.client ? "✓" : "—"}</td>
                  <td><a class="btn primary" href="#/payments?job=${encodeURIComponent(job.id)}">Open Payments</a></td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      ` : `<div class="banner info">No releases linked to this job yet.</div>`;
    } else if (tab === "disputes") {
      body = disputes.length ? `
        <div class="vstack">
          ${disputes.map(d => `
            <div class="card">
              <div class="split">
                <div>
                  <div class="card-title">${escapeHtml(d.title)}</div>
                  <div class="card-sub">Status: <span class="pill ${d.status==="closed"?"ok":"warn"}">${escapeHtml(d.status)}</span> • Pause releases: <span class="pill ${d.pauseRelease?"bad":"ok"}">${d.pauseRelease ? "ON" : "OFF"}</span></div>
                </div>
                <div class="hstack">
                  <a class="btn primary" href="#/disputes?job=${encodeURIComponent(job.id)}">Open Disputes</a>
                </div>
              </div>
            </div>
          `).join("")}
        </div>
      ` : `<div class="banner info">No disputes for this job.</div>`;
    } else {
      body = invoices.length ? `
        <table class="table">
          <thead><tr><th>Invoice</th><th>Client payment (before VAT)</th><th>Updated</th><th></th></tr></thead>
          <tbody>
            ${invoices.map(inv => {
              const t = invoiceTotals(inv);
              return `
                <tr>
                  <td>
                    <div><strong>${escapeHtml(inv.number)}</strong></div>
                    <div class="muted">Created: ${escapeHtml(formatDate(inv.createdAt))}</div>
                  </td>
                  <td><strong>${escapeHtml(formatGBP(t.clientPaymentBeforeVat))}</strong></td>
                  <td>${escapeHtml(formatDate(inv.updatedAt))}</td>
                  <td><a class="btn primary" href="#/invoices/${escapeHtml(inv.id)}">Open</a></td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      ` : `<div class="banner info">No invoices for this job.</div>`;
    }

    return `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">${escapeHtml(job.name)}</div>
            <div class="card-sub">${escapeHtml(job.clientName)} • ${escapeHtml(job.address)} • <span class="pill ${job.archived?"warn":"info"}">${escapeHtml(job.archived ? "Archived" : job.status)}</span></div>
          </div>
          ${headerActions}
        </div>

        <div class="banner info">
          <div class="split">
            <div><strong>Demo note:</strong> Changes persist in <span class="muted">localStorage</span>.</div>
            <div class="hstack">
              <a class="btn ghost" href="#/messages?job=${encodeURIComponent(job.id)}">Open messages</a>
              <a class="btn ghost" href="#/payments?job=${encodeURIComponent(job.id)}">Open payments</a>
            </div>
          </div>
        </div>

        <div class="sep"></div>
        ${tabs}
        <div class="sep"></div>
        ${body}
      </div>
    `;
  }

  function renderInvoiceDetail(invoiceId) {
    const inv = getInvoice(invoiceId);
    if (!inv) return renderNotFound();
    const job = getJob(inv.jobId);
    const t = invoiceTotals(inv);
    const canEdit = perms().canEditInvoice;

    const lineRows = (inv.lineItems || []).map(li => {
      const p = getPayee(li.payeeId);
      return `
        <tr>
          <td>
            <div><strong>${escapeHtml(li.description)}</strong></div>
            <div class="muted">${escapeHtml(p ? p.name : li.payeeId)} • ${escapeHtml(li.category)}</div>
          </td>
          <td>${escapeHtml(formatGBP(li.amount))}</td>
        </tr>
      `;
    }).join("");

    const editable = canEdit ? `
      <div class="grid cols-2">
        <div class="field">
          <label for="invBeforeVat">Client payment before VAT</label>
          <input id="invBeforeVat" type="number" inputmode="decimal" step="0.01" value="${escapeHtml(String(t.clientPaymentBeforeVat))}" />
          <div class="muted">Editable in demo. Affects fee pot and VAT on fee pot.</div>
        </div>
        <div class="field">
          <label for="invVatRate">VAT rate on fee pot (%)</label>
          <input id="invVatRate" type="number" inputmode="numeric" step="1" value="${escapeHtml(String(t.vatRate))}" />
          <div class="muted">Typically 20% (demo). Clamped 0–100.</div>
        </div>
      </div>
      <div class="hstack">
        <button class="btn primary" data-action="save-invoice" data-invoice-id="${escapeHtml(inv.id)}">Save</button>
        <button class="btn ghost" data-action="revert-invoice" data-invoice-id="${escapeHtml(inv.id)}">Revert</button>
      </div>
    ` : `
      <div class="banner warn">
        Viewing as <strong>${escapeHtml(ROLE_LABEL[ui.role] || ui.role)}</strong>. Editing is disabled for this role.
      </div>
    `;

    return `
      <div class="card" id="invoiceView" data-invoice-id="${escapeHtml(inv.id)}">
        <div class="card-header">
          <div>
            <div class="card-title">${escapeHtml(inv.number)} <span class="pill info">Invoice</span></div>
            <div class="card-sub">${escapeHtml(job ? job.name : inv.jobId)} • Created ${escapeHtml(formatDate(inv.createdAt))}</div>
          </div>
          <div class="hstack">
            <button class="btn" data-action="download-pdf" data-invoice-id="${escapeHtml(inv.id)}">Download PDF</button>
            <button class="btn" data-action="print-invoice" data-invoice-id="${escapeHtml(inv.id)}">Print</button>
            <button class="btn primary" data-action="share-invoice" data-invoice-id="${escapeHtml(inv.id)}">Share</button>
            <a class="btn ghost" href="#/jobs/${escapeHtml(inv.jobId)}?tab=invoices">Back</a>
          </div>
        </div>

        ${editable}
        <div class="sep"></div>

        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Line items</div>
              <div class="card-sub">Trades + suppliers paid by client (demo).</div>
            </div>
          </div>
          <table class="table">
            <thead><tr><th>Description</th><th>Amount</th></tr></thead>
            <tbody>${lineRows}</tbody>
          </table>
        </div>

        <div class="sep"></div>
        <div class="grid cols-3">
          <div class="kpi"><div class="kpi-v">${escapeHtml(formatGBP(t.totalToPayees))}</div><div class="kpi-l">Total to payees</div></div>
          <div class="kpi"><div class="kpi-v">${escapeHtml(formatGBP(t.feePot))}</div><div class="kpi-l">Management fee pot</div></div>
          <div class="kpi"><div class="kpi-v">${escapeHtml(formatGBP(t.vatOnFee))}</div><div class="kpi-l">VAT on fee pot</div></div>
        </div>

        <div class="sep"></div>
        <div class="grid cols-2">
          <div class="card">
            <div class="card-title">Grand total (client pays)</div>
            <div class="card-sub muted">Client payment before VAT + VAT on fee pot</div>
            <div style="font-size:28px;font-weight:900;letter-spacing:-0.02em;margin-top:8px;">${escapeHtml(formatGBP(t.grandTotal))}</div>
            <div class="muted" style="margin-top:8px;">VAT on fee pot: <strong>${escapeHtml(formatGBP(t.vatOnFee))}</strong></div>
          </div>
          <div class="card">
            <div class="card-title">Compliance</div>
            <div class="card-sub muted">Shown wherever VAT is displayed</div>
            <div class="banner warn" style="margin-top:10px;">${escapeHtml(VAT_DISCLAIMER)}</div>
          </div>
        </div>

        <div class="sep"></div>
        <div class="banner info">
          <div class="split">
            <div>
              <strong>Illustrative difference (example only):</strong> ${escapeHtml(formatGBP(t.illustrativeDiff))}
              <div class="muted">Compares 20% VAT on full client payment vs VAT only on the fee pot (illustration).</div>
            </div>
            <span class="pill info">Example only</span>
          </div>
        </div>
      </div>
    `;
  }

  /* CONTINUES IN PART 5 */
// PART 4 END

 // PART 5 START
  function renderPayments(query) {
    const jobId = query.job || "";
    const filterJob = jobId ? getJob(jobId) : null;

    const can = perms();
    const list = filterJob
      ? jobReleases(filterJob)
      : db.releases.slice().sort((a,b) => (a.updatedAt > b.updatedAt ? -1 : 1));

    const header = `
      <div class="split">
        <div>
          <div class="card-title">Payments</div>
          <div class="card-sub">Releases flow: Draft → Submitted → Manager approved → Client approved → Sent to partner → Released.</div>
        </div>
        <div class="hstack">
          <button class="btn primary" data-action="create-release"${filterJob ? ` data-job-id="${escapeHtml(filterJob.id)}"` : ""}>Create release request</button>
          ${filterJob ? `<a class="btn ghost" href="#/jobs/${escapeHtml(filterJob.id)}?tab=releases">Back to job</a>` : ``}
        </div>
      </div>
    `;

    const banner = `
      <div class="banner info">
        <div><strong>Funds statement:</strong> ${escapeHtml(FUNDS_STATEMENT)}</div>
        <div class="muted" style="margin-top:6px;">This demo does not hold or move money. “Send to partner” is simulated.</div>
      </div>
    `;

    const filter = `
      <div class="hstack">
        <div class="field" style="min-width:280px;">
          <label for="payJobFilter">Filter by job</label>
          <select id="payJobFilter" data-action="payments-filter">
            <option value="">All jobs</option>
            ${db.jobs.map(j => `<option value="${escapeHtml(j.id)}"${j.id===jobId?" selected":""}>${escapeHtml(j.name)}</option>`).join("")}
          </select>
        </div>
        <div class="muted">Role permissions apply to actions.</div>
      </div>
    `;

    const rows = list.length ? `
      <table class="table">
        <thead>
          <tr>
            <th>Release</th>
            <th>Status</th>
            <th>Approvals</th>
            <th>Amount</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(r => {
            const job = getJob(r.jobId);
            const ms = r.milestoneId ? getMilestone(r.milestoneId) : null;
            const amount = (r.payeeSplits || []).reduce((s, x) => s + Number(x.amount || 0), 0);
            const pill = r.status === "Released" ? "ok"
              : r.status === "Sent to partner" ? "info"
              : r.status === "Client approved" ? "info"
              : r.status === "Manager approved" ? "warn"
              : r.status === "Submitted" ? "warn"
              : "info";
            const a = r.approvals || { manager:false, client:false };

            const actions = [];
            if (r.status === "Draft") actions.push(`<button class="btn primary" data-action="submit-release" data-release-id="${escapeHtml(r.id)}">Submit</button>`);
            if (r.status === "Submitted" && can.canApproveManager) actions.push(`<button class="btn primary" data-action="approve-release-manager" data-release-id="${escapeHtml(r.id)}">Mgr approve</button>`);
            if (r.status === "Manager approved" && can.canApproveClient) actions.push(`<button class="btn primary" data-action="approve-release-client" data-release-id="${escapeHtml(r.id)}">Client approve</button>`);
            if (r.status === "Client approved" && can.canSendToPartner) actions.push(`<button class="btn primary" data-action="send-to-partner" data-release-id="${escapeHtml(r.id)}">Send to partner</button>`);
            if (r.status === "Sent to partner" && can.canMarkReleased) actions.push(`<button class="btn primary" data-action="mark-released" data-release-id="${escapeHtml(r.id)}">Mark released</button>`);
            actions.push(`<button class="btn" data-action="view-release" data-release-id="${escapeHtml(r.id)}">View</button>`);

            return `
              <tr>
                <td>
                  <div><strong>${escapeHtml(r.title)}</strong></div>
                  <div class="muted">${escapeHtml(job ? job.name : r.jobId)}${ms ? ` • ${escapeHtml(ms.title)}` : ""}</div>
                </td>
                <td><span class="pill ${pill}">${escapeHtml(r.status)}</span></td>
                <td class="muted">Mgr: ${a.manager ? "✓" : "—"} • Client: ${a.client ? "✓" : "—"}</td>
                <td><strong>${escapeHtml(formatGBP(amount))}</strong></td>
                <td><div class="hstack">${actions.join("")}</div></td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    ` : `<div class="banner info">No releases found.</div>`;

    return `
      <div class="card">
        ${header}
        <div class="sep"></div>
        ${banner}
        <div class="sep"></div>
        ${filter}
        <div class="sep"></div>
        ${rows}
      </div>
    `;
  }

  function renderApprovals() {
    const p = perms();
    const items = approvalsInboxItems();

    const visible = items.filter(it => {
      if (it.type === "bank") return p.canConfirmBank;
      if (it.type === "release_mgr") return p.canApproveManager;
      if (it.type === "release_client") return p.canApproveClient;
      if (it.type === "release_ready") return p.canSendToPartner;
      return false;
    });

    const rows = visible.length ? `
      <div class="vstack">
        ${visible.map(it => {
          if (it.type === "bank") {
            const payee = getPayee(it.id);
            return `
              <div class="card">
                <div class="split">
                  <div>
                    <div class="card-title">Bank confirmation</div>
                    <div class="card-sub">${escapeHtml(payee ? payee.name : it.id)} • Bank details changed</div>
                  </div>
                  <div class="hstack">
                    <button class="btn primary" data-action="confirm-bank" data-payee-id="${escapeHtml(it.id)}">Confirm</button>
                    <a class="btn ghost" href="#/company?payee=${encodeURIComponent(it.id)}">View payee</a>
                  </div>
                </div>
              </div>
            `;
          }

          const rel = getRelease(it.id);
          const job = rel ? getJob(rel.jobId) : null;
          return `
            <div class="card">
              <div class="split">
                <div>
                  <div class="card-title">${escapeHtml(rel ? rel.title : it.label)}</div>
                  <div class="card-sub">${escapeHtml(job ? job.name : "—")} • <span class="pill info">${escapeHtml(it.type)}</span></div>
                </div>
                <div class="hstack">
                  ${it.type === "release_mgr" ? `<button class="btn primary" data-action="approve-release-manager" data-release-id="${escapeHtml(it.id)}">Approve</button>` : ``}
                  ${it.type === "release_client" ? `<button class="btn primary" data-action="approve-release-client" data-release-id="${escapeHtml(it.id)}">Approve</button>` : ``}
                  ${it.type === "release_ready" ? `<button class="btn primary" data-action="send-to-partner" data-release-id="${escapeHtml(it.id)}">Send to partner</button>` : ``}
                  ${rel ? `<a class="btn ghost" href="#/payments?job=${encodeURIComponent(rel.jobId)}">Open payments</a>` : ``}
                </div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    ` : `<div class="banner info">No items requiring action for this role.</div>`;

    return `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Approvals</div>
            <div class="card-sub">Inbox for releases, bank confirmations, and change approvals.</div>
          </div>
          <div class="muted">Role: <strong>${escapeHtml(ROLE_LABEL[ui.role] || ui.role)}</strong></div>
        </div>
        ${rows}
      </div>
    `;
  }

  function renderDisputes(query) {
    const jobId = query.job || "";
    const job = jobId ? getJob(jobId) : null;
    const list = job ? jobDisputes(job) : db.disputes.slice();

    const filter = `
      <div class="hstack">
        <div class="field" style="min-width:280px;">
          <label for="disJobFilter">Filter by job</label>
          <select id="disJobFilter" data-action="disputes-filter">
            <option value="">All jobs</option>
            ${db.jobs.map(j => `<option value="${escapeHtml(j.id)}"${j.id===jobId?" selected":""}>${escapeHtml(j.name)}</option>`).join("")}
          </select>
        </div>
        <button class="btn primary" data-action="create-dispute"${job ? ` data-job-id="${escapeHtml(job.id)}"` : ""}>Create dispute</button>
      </div>
    `;

    const rows = list.length ? `
      <div class="vstack">
        ${list.map(d => {
          const j = getJob(d.jobId);
          return `
            <div class="card">
              <div class="split">
                <div>
                  <div class="card-title">${escapeHtml(d.title)}</div>
                  <div class="card-sub">
                    ${escapeHtml(j ? j.name : d.jobId)} •
                    <span class="pill ${d.status==="closed"?"ok":"warn"}">${escapeHtml(d.status)}</span> •
                    Pause releases: <span class="pill ${d.pauseRelease?"bad":"ok"}">${d.pauseRelease ? "ON" : "OFF"}</span>
                  </div>
                </div>
                <div class="hstack">
                  <button class="btn" data-action="toggle-pause" data-dispute-id="${escapeHtml(d.id)}">${d.pauseRelease ? "Unpause" : "Pause"} releases</button>
                  <button class="btn" data-action="toggle-dispute" data-dispute-id="${escapeHtml(d.id)}">${d.status==="closed" ? "Reopen" : "Close"}</button>
                  <button class="btn primary" data-action="view-dispute" data-dispute-id="${escapeHtml(d.id)}">View</button>
                </div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    ` : `<div class="banner info">No disputes found.</div>`;

    return `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Disputes</div>
            <div class="card-sub">Disputes can pause release sending until resolved.</div>
          </div>
          <div class="muted">Blocking rule: pauseRelease ON blocks “Send to partner”.</div>
        </div>
        ${filter}
        <div class="sep"></div>
        ${rows}
      </div>
    `;
  }

  function renderMessages(query) {
    const jobId = query.job || "";
    const job = jobId ? getJob(jobId) : null;

    const picker = `
      <div class="field" style="min-width:280px;">
        <label for="msgJobPick">Job</label>
        <select id="msgJobPick" data-action="messages-filter">
          <option value="">Select a job…</option>
          ${db.jobs.map(j => `<option value="${escapeHtml(j.id)}"${j.id===jobId?" selected":""}>${escapeHtml(j.name)}</option>`).join("")}
        </select>
      </div>
    `;

    if (!job) {
      return `
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Messages</div>
              <div class="card-sub">Job threads, posts, and invoice snapshot attachments.</div>
            </div>
          </div>
          <div class="hstack">${picker}</div>
          <div class="sep"></div>
          <div class="banner info">Select a job to view the thread.</div>
        </div>
      `;
    }

    const msgs = jobThreadMessages(job);
    const thread = `
      <div class="vstack">
        ${msgs.map(m => {
          const attachments = (m.attachments || []).map(a => {
            if (a.type === "invoice_snapshot") {
              return `
                <div class="banner info">
                  <div class="split">
                    <div>
                      <strong>Invoice snapshot:</strong> ${escapeHtml(a.name || a.snapshotId)}
                      <div class="muted">You can regenerate a PDF from this stored snapshot.</div>
                    </div>
                    <div class="hstack">
                      <button class="btn primary" data-action="regen-pdf" data-snapshot-id="${escapeHtml(a.snapshotId)}">Regenerate PDF</button>
                    </div>
                  </div>
                </div>
              `;
            }
            return `<div class="banner info"><strong>Attachment:</strong> ${escapeHtml(a.name || "File")}</div>`;
          }).join("");

          return `
            <div class="card">
              <div class="split">
                <div>
                  <div class="card-title">${escapeHtml(ROLE_LABEL[m.byRole] || m.byRole)}</div>
                  <div class="card-sub">${escapeHtml(formatDate(m.ts))}</div>
                </div>
                <span class="pill info">${escapeHtml(m.byRole)}</span>
              </div>
              <div class="sep"></div>
              <div>${escapeHtml(m.text)}</div>
              ${attachments ? `<div class="sep"></div>${attachments}` : ``}
            </div>
          `;
        }).join("")}
      </div>
    `;

    const composer = `
      <div class="card">
        <div class="card-title">Post a message</div>
        <div class="card-sub">Posting writes into localStorage (static demo).</div>
        <div class="sep"></div>
        <div class="field">
          <label for="msgText">Message</label>
          <textarea id="msgText" rows="3" placeholder="Write an update…"></textarea>
        </div>
        <div class="hstack">
          <button class="btn primary" data-action="post-message" data-job-id="${escapeHtml(job.id)}">Post</button>
          <a class="btn ghost" href="#/jobs/${escapeHtml(job.id)}">Open job</a>
        </div>
      </div>
    `;

    return `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Messages</div>
            <div class="card-sub">${escapeHtml(job.name)} • Thread</div>
          </div>
          <div class="hstack">${picker}</div>
        </div>
        ${composer}
        <div class="sep"></div>
        ${thread}
      </div>
    `;
  }

  function renderCompany(query) {
    const focusPayee = query.payee || "";
    const canEdit = perms().canEditBank;
    const canConfirm = perms().canConfirmBank;

    const banner = `
      <div class="banner info">
        <div class="split">
          <div><strong>Bank change flow:</strong> editing sets <span class="pill warn">bankChanged</span>. Manager/Admin must confirm before sending releases.</div>
          <div class="muted">Blocking enforced on “Send to partner”.</div>
        </div>
      </div>
    `;

    const rows = `
      <table class="table">
        <thead><tr><th>Payee</th><th>VAT</th><th>Bank</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${db.payees.map(p => {
            const status = p.bankChanged && !p.bankConfirmed ? "warn" : (p.bankConfirmed ? "ok" : "info");
            const statusText = p.bankChanged && !p.bankConfirmed ? "Changed • Needs confirm" : (p.bankConfirmed ? "Confirmed" : "Unconfirmed");
            const highlight = (focusPayee && focusPayee === p.id) ? `style="outline:2px solid rgba(124,221,255,.45); outline-offset:2px; border-radius:12px;"` : "";
            return `
              <tr ${highlight}>
                <td>
                  <div><strong>${escapeHtml(p.name)}</strong></div>
                  <div class="muted">${escapeHtml(p.type)} • ${escapeHtml(p.id)}</div>
                </td>
                <td class="muted">${p.vatRegistered ? `VAT reg • ${escapeHtml(p.vatNumber)}` : "Not VAT registered"}</td>
                <td class="muted">
                  ${escapeHtml(p.bank.bankName)} • ${escapeHtml(p.bank.sortCode)} • ${escapeHtml(p.bank.accountNumber)}
                  <div class="muted">A/C: ${escapeHtml(p.bank.accountName)}</div>
                </td>
                <td><span class="pill ${status}">${escapeHtml(statusText)}</span></td>
                <td>
                  <div class="hstack">
                    ${canEdit ? `<button class="btn" data-action="edit-bank" data-payee-id="${escapeHtml(p.id)}">Edit bank</button>` : ``}
                    ${canConfirm && p.bankChanged && !p.bankConfirmed ? `<button class="btn primary" data-action="confirm-bank" data-payee-id="${escapeHtml(p.id)}">Confirm</button>` : ``}
                  </div>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;

    return `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Company</div>
            <div class="card-sub">Payee directory and bank verification controls.</div>
          </div>
          <div class="muted">Role: <strong>${escapeHtml(ROLE_LABEL[ui.role] || ui.role)}</strong></div>
        </div>
        ${banner}
        <div class="sep"></div>
        ${(!canEdit && !canConfirm) ? `<div class="banner warn">This role can view payees but cannot edit or confirm bank details.</div><div class="sep"></div>` : ``}
        ${rows}
      </div>
    `;
  }

  function renderReports() {
    const canExport = perms().canExport;
    if (!canExport) {
      return `
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Reports</div>
              <div class="card-sub">CSV exports (restricted for this role).</div>
            </div>
          </div>
          <div class="banner warn">CSV export is not allowed for this role.</div>
        </div>
      `;
    }

    const btn = (label, key) => `<button class="btn primary" data-action="export-csv" data-csv="${escapeHtml(key)}">${escapeHtml(label)}</button>`;

    return `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Reports</div>
            <div class="card-sub">Export datasets as CSV for audit and accounting workflows.</div>
          </div>
        </div>

        <div class="grid cols-3">
          ${btn("Jobs CSV", "jobs")}
          ${btn("Invoices CSV", "invoices")}
          ${btn("Milestones CSV", "milestones")}
          ${btn("Releases CSV", "releases")}
          ${btn("Disputes CSV", "disputes")}
          ${btn("Messages CSV", "messages")}
          ${btn("Payees CSV", "payees")}
          ${btn("Audit log CSV", "auditLog")}
        </div>

        <div class="sep"></div>
        <div class="banner info">
          Tip: CSV export is generated in-browser and downloaded locally. No backend is used.
        </div>
      </div>
    `;
  }

  function renderSettings() {
    const p = perms();

    return `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Settings</div>
            <div class="card-sub">Theme, demo data tools, and role-restricted actions.</div>
          </div>
        </div>

        <div class="grid cols-2">
          <div class="card">
            <div class="card-title">Appearance</div>
            <div class="card-sub muted">System / light / dark</div>
            <div class="sep"></div>

            <div class="field" style="max-width:340px;">
              <label for="themeSelect">Theme</label>
              <select id="themeSelect" data-action="theme-select">
                <option value="system"${ui.theme==="system"?" selected":""}>System</option>
                <option value="light"${ui.theme==="light"?" selected":""}>Light</option>
                <option value="dark"${ui.theme==="dark"?" selected":""}>Dark</option>
              </select>
            </div>

            <div class="muted" style="margin-top:10px;">Theme button cycles system → light → dark.</div>
          </div>

          <div class="card">
            <div class="card-title">Data tools</div>
            <div class="card-sub muted">localStorage key: <code>approvehub_demo_db</code></div>
            <div class="sep"></div>

            <div class="hstack">
              ${p.canReset ? `<button class="btn danger" data-action="reset-demo">Reset demo</button>` : `<button class="btn danger" aria-disabled="true" disabled>Reset demo (not allowed)</button>`}
              ${p.canExport ? `<button class="btn" data-action="export-db">Export JSON</button>` : `<button class="btn" aria-disabled="true" disabled>Export JSON (not allowed)</button>`}
              ${p.canImport ? `<button class="btn" data-action="import-db">Import JSON</button>` : `<button class="btn" aria-disabled="true" disabled>Import JSON (not allowed)</button>`}
            </div>

            <div class="sep"></div>
            <div class="banner info">
              <strong>Tip:</strong> If something looks “stuck”, reset demo or clear the localStorage key.
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /* CONTINUES IN PART 6 */
// PART 5 END

 // PART 6 START
  /* ---------------------------
     DB Import
  --------------------------- */
  function importDb(parsed) {
    if (!parsed || typeof parsed !== "object") { toast("bad", "Import failed", "Invalid JSON object."); return; }
    if (parsed.schemaVersion !== SCHEMA_VERSION) { toast("bad", "Schema mismatch", "This JSON does not match the current demo schemaVersion."); return; }

    db = parsed;
    saveDb();
    closeModal();
    toast("ok", "Imported", "Demo JSON imported.");
    log("import_db", "db", "root", null, { note: "Imported" });

    ui.route = parseRoute();
    render();
  }

  /* ---------------------------
     PDF / Print (html2pdf with safe fallback)
  --------------------------- */
  function invoicePrintHtml(inv) {
    const job = getJob(inv.jobId);
    const t = invoiceTotals(inv);

    const items = (inv.lineItems || []).map(li => {
      const p = getPayee(li.payeeId);
      return `
        <tr>
          <td style="padding:8px 10px; border-bottom:1px solid #ddd;">
            <div style="font-weight:700;">${escapeHtml(li.description)}</div>
            <div style="opacity:.75; font-size:12px;">${escapeHtml(p ? p.name : li.payeeId)} • ${escapeHtml(li.category)}</div>
          </td>
          <td style="padding:8px 10px; border-bottom:1px solid #ddd; text-align:right;">${escapeHtml(formatGBP(li.amount))}</td>
        </tr>
      `;
    }).join("");

    return `
      <div style="font-family: Inter, Arial, sans-serif; color:#111; padding:24px;">
        <div style="display:flex; justify-content:space-between; gap:16px; align-items:flex-start;">
          <div>
            <div style="font-size:20px; font-weight:900; letter-spacing:-0.02em;">ApproveHub</div>
            <div style="opacity:.7; margin-top:4px;">Approvals & Project Payments (demo)</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:18px; font-weight:900;">${escapeHtml(inv.number || "Invoice")}</div>
            <div style="opacity:.7; margin-top:4px;">Created: ${escapeHtml(formatDate(inv.createdAt))}</div>
            <div style="opacity:.7;">Job: ${escapeHtml(job ? job.name : inv.jobId)}</div>
          </div>
        </div>

        <div style="margin-top:18px; border:1px solid #e5e7eb; border-radius:14px; padding:14px;">
          <div style="font-weight:800;">Summary</div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:10px;">
            <div style="opacity:.8;">Client payment before VAT</div>
            <div style="text-align:right; font-weight:800;">${escapeHtml(formatGBP(t.clientPaymentBeforeVat))}</div>

            <div style="opacity:.8;">Total to payees (trades + suppliers)</div>
            <div style="text-align:right; font-weight:800;">${escapeHtml(formatGBP(t.totalToPayees))}</div>

            <div style="opacity:.8;">Management fee pot (demo)</div>
            <div style="text-align:right; font-weight:800;">${escapeHtml(formatGBP(t.feePot))}</div>

            <div style="opacity:.8;">VAT on fee pot</div>
            <div style="text-align:right; font-weight:900;">${escapeHtml(formatGBP(t.vatOnFee))}</div>

            <div style="opacity:.8;">Grand total (client pays)</div>
            <div style="text-align:right; font-weight:900; font-size:16px;">${escapeHtml(formatGBP(t.grandTotal))}</div>
          </div>

          <div style="margin-top:12px; font-size:12px; opacity:.8; border-top:1px dashed #e5e7eb; padding-top:10px;">
            ${escapeHtml(VAT_DISCLAIMER)}
          </div>
        </div>

        <div style="margin-top:18px; border:1px solid #e5e7eb; border-radius:14px; overflow:hidden;">
          <div style="padding:12px 14px; font-weight:800; background:#f5f7fb;">Line items</div>
          <table style="width:100%; border-collapse:collapse;">
            <thead>
              <tr>
                <th style="text-align:left; padding:8px 10px; border-bottom:1px solid #ddd; font-size:12px; opacity:.7;">Description</th>
                <th style="text-align:right; padding:8px 10px; border-bottom:1px solid #ddd; font-size:12px; opacity:.7;">Amount</th>
              </tr>
            </thead>
            <tbody>${items}</tbody>
          </table>
        </div>

        <div style="margin-top:18px; font-size:12px; opacity:.8;">
          Funds statement: ${escapeHtml(FUNDS_STATEMENT)}
        </div>
      </div>
    `;
  }

  function printInvoice(inv) {
    const html = invoicePrintHtml(inv);
    const w = window.open("", "_blank", "noopener,noreferrer");
    if (!w) {
      toast("warn", "Popup blocked", "Allow popups to use print, or use Download PDF.");
      return;
    }
    w.document.open();
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(inv.number || "Invoice")} — Print</title></head><body>${html}<script>window.onload=()=>window.print();</script></body></html>`);
    w.document.close();
  }

  function downloadInvoicePdf(inv) {
    const html = invoicePrintHtml(inv);

    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.left = "-99999px";
    container.style.top = "0";
    container.style.width = "800px";
    container.innerHTML = html;
    document.body.appendChild(container);

    const filename = `${inv.number || "invoice"}.pdf`;

    try {
      if (window.html2pdf && typeof window.html2pdf === "function") {
        window.html2pdf()
          .from(container)
          .set({
            margin: 8,
            filename,
            html2canvas: { scale: 2 },
            jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          })
          .save()
          .then(() => {
            container.remove();
            toast("ok", "PDF created", "Downloaded invoice PDF.");
          })
          .catch(() => {
            container.remove();
            toast("warn", "PDF fallback", "PDF tool unavailable. Opening print dialog instead.");
            window.print();
          });
      } else {
        container.remove();
        toast("warn", "PDF fallback", "PDF library missing. Opening print dialog instead.");
        window.print();
      }
    } catch {
      container.remove();
      toast("warn", "PDF fallback", "Could not generate PDF. Opening print dialog instead.");
      window.print();
    }
  }

  /* ---------------------------
     Invoice snapshots (share + regenerate PDF)
  --------------------------- */
  function createInvoiceSnapshot(inv) {
    const t = invoiceTotals(inv);
    const snap = {
      id: uid("snap"),
      invoiceId: inv.id,
      jobId: inv.jobId,
      createdAt: nowIso(),
      payload: {
        number: inv.number,
        createdAt: inv.createdAt,
        clientPaymentBeforeVat: t.clientPaymentBeforeVat,
        vatRate: t.vatRate,
        vatOnFee: t.vatOnFee,
        grandTotal: t.grandTotal,
        lineItems: (inv.lineItems || []).map(li => ({ ...li })),
      },
    };
    db.snapshots.unshift(snap);
    saveDb();
    return snap.id;
  }

  function downloadSnapshotPdf(snapshot) {
    // Recreate a minimal invoice-like object for printing
    const pseudo = {
      id: snapshot.invoiceId,
      jobId: snapshot.jobId,
      number: snapshot.payload.number,
      createdAt: snapshot.payload.createdAt,
      updatedAt: snapshot.createdAt,
      clientPaymentBeforeVat: snapshot.payload.clientPaymentBeforeVat,
      feeVatRate: snapshot.payload.vatRate,
      lineItems: snapshot.payload.lineItems,
    };
    downloadInvoicePdf(pseudo);
  }

  function openShareInvoice(inv) {
    openModal({
      title: "Share invoice",
      ariaLabel: "Share invoice",
      bodyHtml: `
        <div class="banner info">
          This will post a message in the job thread with an <strong>invoice snapshot attachment</strong>.
        </div>
        <div class="sep"></div>
        <div class="field">
          <label for="shareNote">Message (optional)</label>
          <textarea id="shareNote" rows="3" placeholder="e.g., Please review this invoice summary before approvals."></textarea>
        </div>
      `,
      footerHtml: `
        <div class="muted">Snapshot supports “Regenerate PDF”.</div>
        <div class="hstack">
          <button class="btn" type="button" data-action="modal-close">Cancel</button>
          <button class="btn primary" type="button" data-action="confirm-share-invoice" data-invoice-id="${escapeHtml(inv.id)}">Share</button>
        </div>
      `
    });
  }

  /* ---------------------------
     Create release modal helper
  --------------------------- */
  function syncReleaseMilestones() {
    const jobSel = $("#crJob");
    const msSel = $("#crMilestone");
    if (!jobSel || !msSel) return;

    const job = getJob(jobSel.value);
    const ms = job ? jobMilestones(job) : [];

    msSel.innerHTML = ms.map(m => {
      const suffix = m.evidenceRequired ? (m.evidenceProvided ? " • evidence ✓" : " • evidence missing") : "";
      return `<option value="${escapeHtml(m.id)}">${escapeHtml(m.title)}${escapeHtml(suffix)}</option>`;
    }).join("");
  }

  /* ---------------------------
     View delegation + action handler
  --------------------------- */
  function bindViewDelegationOnce() {
    const view = $("#view");
    if (!view) return;

    view.addEventListener("click", (e) => {
      const el = e.target.closest("[data-action]");
      if (!el) return;
      e.preventDefault();
      handleAction(el.dataset.action, el.dataset);
    });

    view.addEventListener("change", (e) => {
      const el = e.target;
      if (!(el instanceof HTMLElement)) return;
      const action = el.getAttribute("data-action");
      if (!action) return;

      // pass value for selects
      const payload = { ...el.dataset };
      if (el instanceof HTMLSelectElement) payload.value = el.value;
      handleAction(action, payload);
    });
  }

  function handleAction(action, data) {
    // Filters
    if (action === "payments-filter") { routeTo(data.value ? `#/payments?job=${encodeURIComponent(data.value)}` : "#/payments"); return; }
    if (action === "disputes-filter") { routeTo(data.value ? `#/disputes?job=${encodeURIComponent(data.value)}` : "#/disputes"); return; }
    if (action === "messages-filter") { routeTo(data.value ? `#/messages?job=${encodeURIComponent(data.value)}` : "#/messages"); return; }

    // Theme
    if (action === "theme-select") {
      applyThemePref(data.value || "system");
      toast("info", "Theme", `Theme set to ${data.value || "system"}.`);
      log("set_theme", "ui", "theme", null, { theme: data.value || "system" });
      return;
    }

    // Data tools
    if (action === "reset-demo") {
      if (!perms().canReset) { toast("bad", "Not allowed", "This role cannot reset demo data."); return; }
      openModal({
        title: "Reset demo?",
        ariaLabel: "Reset demo confirmation",
        bodyHtml: `<div class="banner warn">This will overwrite current demo data stored in your browser.</div>`,
        footerHtml: `<div class="muted">localStorage will be replaced.</div>
          <div class="hstack">
            <button class="btn" data-action="modal-close" type="button">Cancel</button>
            <button class="btn danger" data-action="confirm-reset" type="button">Reset</button>
          </div>`
      });
      return;
    }

    if (action === "confirm-reset") { closeModal(); resetDb("User reset"); return; }

    if (action === "export-db") {
      if (!perms().canExport) { toast("bad", "Not allowed", "This role cannot export data."); return; }
      downloadText(`approvehub_demo_${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(db, null, 2), "application/json");
      toast("ok", "Exported", "Demo JSON exported.");
      log("export_db", "db", "root", null, { bytes: JSON.stringify(db).length });
      return;
    }

    if (action === "import-db") {
      if (!perms().canImport) { toast("bad", "Not allowed", "This role cannot import data."); return; }
      openModal({
        title: "Import demo JSON",
        ariaLabel: "Import demo JSON",
        bodyHtml: `
          <div class="banner warn">Import will replace the current demo data in your browser.</div>
          <div class="sep"></div>
          <div class="field">
            <label for="importFile">Choose JSON file</label>
            <input id="importFile" type="file" accept="application/json" data-action="import-file" />
            <div class="muted">schemaVersion expected: ${SCHEMA_VERSION}</div>
          </div>
        `,
        footerHtml: `<div class="muted">After import, the app will refresh.</div><button class="btn" type="button" data-action="modal-close">Close</button>`
      });
      return;
    }

    // Jobs
    if (action === "create-job") {
      if (!perms().canCreateJob) { toast("bad", "Not allowed", "This role cannot create jobs."); return; }

      openModal({
        title: "Create job",
        ariaLabel: "Create job",
        bodyHtml: `
          <div class="grid cols-2">
            <div class="field">
              <label for="cjName">Job name</label>
              <input id="cjName" type="text" placeholder="e.g., Loft Conversion — West Wickham" />
            </div>
            <div class="field">
              <label for="cjClient">Client name</label>
              <input id="cjClient" type="text" placeholder="e.g., A. Patel" />
            </div>
            <div class="field">
              <label for="cjAddress">Address (demo)</label>
              <input id="cjAddress" type="text" placeholder="e.g., BR4 (demo)" />
            </div>
            <div class="field">
              <label for="cjDesc">Short description</label>
              <input id="cjDesc" type="text" placeholder="Brief scope summary" />
            </div>
          </div>
        `,
        footerHtml: `
          <div class="muted">A starter thread will be created automatically.</div>
          <div class="hstack">
            <button class="btn" type="button" data-action="modal-close">Cancel</button>
            <button class="btn primary" type="button" data-action="confirm-create-job">Create</button>
          </div>
        `
      });
      return;
    }

    if (action === "confirm-create-job") {
      const name = String($("#cjName")?.value || "").trim();
      const clientName = String($("#cjClient")?.value || "").trim();
      const address = String($("#cjAddress")?.value || "").trim();
      const description = String($("#cjDesc")?.value || "").trim();

      if (!name || !clientName) { toast("warn", "Missing fields", "Please enter a job name and client name."); return; }

      const jobId = uid("job");
      const threadId = uid("thr");
      const msId = uid("ms");
      const invId = uid("inv");

      db.jobs.unshift({
        id: jobId,
        name,
        clientName,
        address: address || "(demo)",
        status: "open",
        archived: false,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        description,
        milestoneIds: [msId],
        invoiceIds: [invId],
        releaseIds: [],
        disputeIds: [],
        threadId,
      });

      db.milestones.unshift({ id: msId, jobId, title: "Kick-off", evidenceRequired: false, evidenceProvided: true, targetDate: nowIso() });

      db.invoices.unshift({
        id: invId,
        jobId,
        number: `INV-${String(Math.floor(Math.random()*90000)+10000)}`,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        clientPaymentBeforeVat: 5000,
        feeVatRate: 20,
        lineItems: [{ id: uid("li"), payeeId: "pay_oakbeam", category: "contractor", description: "Starter item", amount: 1200 }],
      });

      db.messages.push({ id: uid("msg"), threadId, jobId, ts: nowIso(), byRole: ui.role, text: "Job created (demo). Use this thread for updates and approvals.", attachments: [] });

      saveDb();
      closeModal();
      toast("ok", "Job created", "Job created with a starter milestone and invoice.");
      log("create_job", "job", jobId, jobId, { name });
      routeTo(`#/jobs/${jobId}`);
      return;
    }

    if (action === "edit-job") {
      const job = getJob(data.jobId);
      if (!job) return;

      openModal({
        title: "Edit job",
        ariaLabel: "Edit job",
        bodyHtml: `
          <div class="grid cols-2">
            <div class="field">
              <label for="ejName">Job name</label>
              <input id="ejName" type="text" value="${escapeHtml(job.name)}" />
            </div>
            <div class="field">
              <label for="ejClient">Client name</label>
              <input id="ejClient" type="text" value="${escapeHtml(job.clientName)}" />
            </div>
            <div class="field">
              <label for="ejAddress">Address</label>
              <input id="ejAddress" type="text" value="${escapeHtml(job.address)}" />
            </div>
            <div class="field">
              <label for="ejDesc">Description</label>
              <input id="ejDesc" type="text" value="${escapeHtml(job.description || "")}" />
            </div>
          </div>
        `,
        footerHtml: `
          <div class="muted">Updates local demo data only.</div>
          <div class="hstack">
            <button class="btn" type="button" data-action="modal-close">Cancel</button>
            <button class="btn primary" type="button" data-action="confirm-edit-job" data-job-id="${escapeHtml(job.id)}">Save</button>
          </div>
        `
      });
      return;
    }

    if (action === "confirm-edit-job") {
      const job = getJob(data.jobId);
      if (!job) return;

      job.name = String($("#ejName")?.value || job.name).trim();
      job.clientName = String($("#ejClient")?.value || job.clientName).trim();
      job.address = String($("#ejAddress")?.value || job.address).trim();
      job.description = String($("#ejDesc")?.value || job.description).trim();
      job.updatedAt = nowIso();

      saveDb();
      closeModal();
      toast("ok", "Job updated", "Job details saved.");
      log("edit_job", "job", job.id, job.id, { name: job.name });
      render();
      return;
    }

    if (action === "archive-job" || action === "unarchive-job") {
      const job = getJob(data.jobId);
      if (!job) return;
      job.archived = action === "archive-job";
      job.updatedAt = nowIso();
      saveDb();
      toast("ok", job.archived ? "Archived" : "Unarchived", `Job ${job.archived ? "archived" : "unarchived"}.`);
      log(job.archived ? "archive_job" : "unarchive_job", "job", job.id, job.id, {});
      render();
      return;
    }

    if (action === "export-job") {
      if (!perms().canExport) { toast("bad", "Not allowed", "This role cannot export job bundles."); return; }
      const job = getJob(data.jobId);
      if (!job) return;

      const bundle = { job, milestones: jobMilestones(job), invoices: jobInvoices(job), releases: jobReleases(job), disputes: jobDisputes(job), messages: jobThreadMessages(job) };
      downloadText(`approvehub_job_${job.id}.json`, JSON.stringify(bundle, null, 2), "application/json");
      toast("ok", "Exported", "Job bundle exported.");
      log("export_job_bundle", "job", job.id, job.id, { size: JSON.stringify(bundle).length });
      return;
    }

    if (action === "toggle-evidence") {
      const ms = getMilestone(data.msId);
      if (!ms) return;
      ms.evidenceProvided = !ms.evidenceProvided;
      saveDb();
      toast("ok", "Milestone updated", `Evidence marked as ${ms.evidenceProvided ? "provided" : "missing"}.`);
      log("toggle_evidence", "milestone", ms.id, ms.jobId, { evidenceProvided: ms.evidenceProvided });
      render();
      return;
    }

    // Invoice actions
    if (action === "save-invoice") {
      if (!perms().canEditInvoice) { toast("bad", "Not allowed", "This role cannot edit invoices."); return; }
      const inv = getInvoice(data.invoiceId);
      if (!inv) return;

      const beforeVat = Number($("#invBeforeVat")?.value || inv.clientPaymentBeforeVat || 0);
      const vatRate = Number($("#invVatRate")?.value || inv.feeVatRate || 20);

      inv.clientPaymentBeforeVat = Math.max(0, Math.round(beforeVat * 100) / 100);
      inv.feeVatRate = clamp(Math.round(vatRate), 0, 100);
      inv.updatedAt = nowIso();

      saveDb();
      toast("ok", "Saved", "Invoice updated.");
      log("edit_invoice", "invoice", inv.id, inv.jobId, { clientPaymentBeforeVat: inv.clientPaymentBeforeVat, feeVatRate: inv.feeVatRate });
      render();
      return;
    }

    if (action === "revert-invoice") { render(); toast("info", "Reverted", "Invoice inputs reverted to saved values."); return; }

    if (action === "print-invoice") {
      const inv = getInvoice(data.invoiceId);
      if (!inv) return;
      printInvoice(inv);
      log("print_invoice", "invoice", inv.id, inv.jobId, {});
      return;
    }

    if (action === "download-pdf") {
      const inv = getInvoice(data.invoiceId);
      if (!inv) return;
      downloadInvoicePdf(inv);
      log("download_pdf", "invoice", inv.id, inv.jobId, {});
      return;
    }

    if (action === "share-invoice") {
      const inv = getInvoice(data.invoiceId);
      if (!inv) return;
      openShareInvoice(inv);
      return;
    }

    if (action === "confirm-share-invoice") {
      const inv = getInvoice(data.invoiceId);
      if (!inv) return;

      const job = getJob(inv.jobId);
      if (!job) return;

      const note = String($("#shareNote")?.value || "").trim();
      const snapshotId = createInvoiceSnapshot(inv);

      db.messages.push({
        id: uid("msg"),
        threadId: job.threadId,
        jobId: job.id,
        ts: nowIso(),
        byRole: ui.role,
        text: note || `Shared invoice snapshot for ${inv.number}.`,
        attachments: [{ type: "invoice_snapshot", name: `${inv.number} snapshot`, invoiceId: inv.id, snapshotId }],
      });

      saveDb();
      closeModal();
      toast("ok", "Shared", "Invoice snapshot added to the job thread.");
      log("share_invoice", "invoice", inv.id, inv.jobId, { snapshotId });
      routeTo(`#/messages?job=${encodeURIComponent(job.id)}`);
      return;
    }

    if (action === "regen-pdf") {
      const snap = db.snapshots.find(s => s.id === data.snapshotId);
      if (!snap) { toast("bad", "Not found", "Snapshot not found."); return; }
      downloadSnapshotPdf(snap);
      log("regen_pdf", "snapshot", snap.id, snap.jobId, { invoiceId: snap.invoiceId });
      return;
    }

    // Releases / Payments
    if (action === "create-release") {
      openModal({
        title: "Create release request",
        ariaLabel: "Create release request",
        bodyHtml: `
          <div class="grid cols-2">
            <div class="field">
              <label for="crJob">Job</label>
              <select id="crJob">
                ${db.jobs.filter(j => !j.archived).map(j => `<option value="${escapeHtml(j.id)}"${(data.jobId && j.id===data.jobId)?" selected":""}>${escapeHtml(j.name)}</option>`).join("")}
              </select>
            </div>
            <div class="field">
              <label for="crMilestone">Milestone</label>
              <select id="crMilestone"></select>
              <div class="muted">Evidence requirements will apply to “Send to partner”.</div>
            </div>
            <div class="field">
              <label for="crTitle">Title</label>
              <input id="crTitle" type="text" placeholder="e.g., Release — First fix stage" />
            </div>
            <div class="field">
              <label for="crNotes">Notes</label>
              <input id="crNotes" type="text" placeholder="Short note" />
            </div>
          </div>

          <div class="sep"></div>
          <div class="card">
            <div class="card-title">Payee splits</div>
            <div class="card-sub">Add amounts to each payee.</div>
            <div class="sep"></div>
            ${db.payees.map(p => `
              <div class="split">
                <div>
                  <strong>${escapeHtml(p.name)}</strong>
                  <div class="muted">${escapeHtml(p.type)} • Sort ${escapeHtml(p.bank.sortCode)}</div>
                </div>
                <div class="field" style="max-width:220px;">
                  <label class="sr-only" for="cr_${escapeHtml(p.id)}">Amount</label>
                  <input id="cr_${escapeHtml(p.id)}" type="number" step="0.01" inputmode="decimal" placeholder="0.00" />
                </div>
              </div>
              <div class="sep"></div>
            `).join("")}
          </div>

          <div class="banner info"><strong>Flow:</strong> Draft → Submitted → Manager approved → Client approved → Sent to partner → Released</div>
        `,
        footerHtml: `
          <div class="muted">Created as Draft.</div>
          <div class="hstack">
            <button class="btn" type="button" data-action="modal-close">Cancel</button>
            <button class="btn primary" type="button" data-action="confirm-create-release">Create</button>
          </div>
        `
      });

      // populate milestones and bind change
      syncReleaseMilestones();
      const jobSel = $("#crJob");
      if (jobSel) jobSel.addEventListener("change", () => syncReleaseMilestones());
      return;
    }

    if (action === "confirm-create-release") {
      const jobId = String($("#crJob")?.value || "").trim();
      const msId = String($("#crMilestone")?.value || "").trim();
      const title = String($("#crTitle")?.value || "").trim() || "Release — Draft";
      const notes = String($("#crNotes")?.value || "").trim();

      const job = getJob(jobId);
      if (!job) { toast("bad", "Missing job", "Please select a job."); return; }

      const splits = [];
      for (const p of db.payees) {
        const val = Number($(`#cr_${p.id}`)?.value || 0);
        if (val > 0) splits.push({ payeeId: p.id, amount: Math.round(val * 100) / 100 });
      }

      const relId = uid("rel");
      const inv = job.invoiceIds?.[0] ? getInvoice(job.invoiceIds[0]) : null;

      const rel = {
        id: relId,
        jobId,
        invoiceId: inv ? inv.id : null,
        milestoneId: msId || (job.milestoneIds?.[0] || null),
        title,
        status: "Draft",
        approvals: { manager: false, client: false },
        sentToPartnerAt: null,
        releasedAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        payeeSplits: splits.length ? splits : [{ payeeId: "pay_oakbeam", amount: 1000 }],
        notes,
      };

      db.releases.unshift(rel);
      job.releaseIds = Array.from(new Set([...(job.releaseIds || []), relId]));
      job.updatedAt = nowIso();

      saveDb();
      closeModal();
      toast("ok", "Release created", "Created as Draft.");
      log("create_release", "release", relId, jobId, { title });
      routeTo(`#/payments?job=${encodeURIComponent(jobId)}`);
      return;
    }

    if (action === "view-release") {
      const rel = getRelease(data.releaseId);
      if (!rel) return;

      const job = getJob(rel.jobId);
      const ms = rel.milestoneId ? getMilestone(rel.milestoneId) : null;
      const amount = (rel.payeeSplits || []).reduce((s, x) => s + Number(x.amount || 0), 0);
      const blockers = releaseBlockers(rel);

      openModal({
        title: "Release details",
        ariaLabel: "Release details",
        bodyHtml: `
          <div class="banner info"><strong>${escapeHtml(rel.title)}</strong><div class="muted">${escapeHtml(job ? job.name : rel.jobId)}</div></div>
          <div class="sep"></div>
          <div class="grid cols-2">
            <div class="card">
              <div class="card-title">Status</div>
              <div class="card-sub muted">${escapeHtml(rel.status)}</div>
              <div class="sep"></div>
              <div class="muted">Mgr approval: <strong>${rel.approvals.manager ? "Yes" : "No"}</strong></div>
              <div class="muted">Client approval: <strong>${rel.approvals.client ? "Yes" : "No"}</strong></div>
              <div class="muted">Sent to partner: <strong>${rel.sentToPartnerAt ? "Yes" : "No"}</strong></div>
              <div class="muted">Released: <strong>${rel.releasedAt ? "Yes" : "No"}</strong></div>
            </div>
            <div class="card">
              <div class="card-title">Linked milestone</div>
              <div class="card-sub muted">${escapeHtml(ms ? ms.title : "—")}</div>
              <div class="sep"></div>
              ${ms ? `<div class="muted">Evidence required: <strong>${ms.evidenceRequired ? "Yes" : "No"}</strong></div>
                     <div class="muted">Evidence provided: <strong>${ms.evidenceProvided ? "Yes" : "No"}</strong></div>` : `<div class="muted">No milestone linked.</div>`}
            </div>
          </div>

          <div class="sep"></div>
          <div class="card">
            <div class="card-title">Payee splits</div>
            <div class="card-sub muted">Total: ${escapeHtml(formatGBP(amount))}</div>
            <div class="sep"></div>
            ${(rel.payeeSplits || []).map(s => {
              const p = getPayee(s.payeeId);
              return `<div class="split"><div>${escapeHtml(p ? p.name : s.payeeId)}</div><div><strong>${escapeHtml(formatGBP(s.amount))}</strong></div></div>`;
            }).join("")}
          </div>

          <div class="sep"></div>
          ${blockers.length ? `<div class="banner bad"><strong>Blockers (for sending):</strong><ul>${blockers.map(b => `<li>${escapeHtml(b)}</li>`).join("")}</ul></div>` : `<div class="banner info"><strong>No blockers</strong> for sending.</div>`}
          <div class="sep"></div>
          <div class="banner info"><strong>Funds statement:</strong> ${escapeHtml(FUNDS_STATEMENT)}</div>
        `,
        footerHtml: `
          <div class="muted">Actions are performed in the Payments page.</div>
          <div class="hstack">
            <a class="btn ghost" href="#/payments?job=${encodeURIComponent(rel.jobId)}">Open payments</a>
            <button class="btn" type="button" data-action="modal-close">Close</button>
          </div>
        `
      });
      return;
    }

    if (action === "submit-release") {
      const rel = getRelease(data.releaseId);
      if (!rel) return;
      if (rel.status !== "Draft") { toast("warn", "Not valid", "Only Draft releases can be submitted."); return; }
      rel.status = "Submitted";
      rel.updatedAt = nowIso();
      saveDb();
      toast("ok", "Submitted", "Release submitted for approvals.");
      log("submit_release", "release", rel.id, rel.jobId, {});
      render();
      return;
    }

    if (action === "approve-release-manager") {
      const rel = getRelease(data.releaseId);
      if (!rel) return;
      if (!perms().canApproveManager) { toast("bad", "Not allowed", "This role cannot manager-approve releases."); return; }
      if (rel.status !== "Submitted") { toast("warn", "Not valid", "Manager approval is available after submission."); return; }
      rel.approvals.manager = true;
      rel.status = "Manager approved";
      rel.updatedAt = nowIso();
      saveDb();
      toast("ok", "Approved", "Manager approval recorded.");
      log("approve_release_manager", "release", rel.id, rel.jobId, {});
      render();
      return;
    }

    if (action === "approve-release-client") {
      const rel = getRelease(data.releaseId);
      if (!rel) return;
      if (!perms().canApproveClient) { toast("bad", "Not allowed", "This role cannot client-approve releases."); return; }
      if (rel.status !== "Manager approved") { toast("warn", "Not valid", "Client approval is available after manager approval."); return; }
      rel.approvals.client = true;
      rel.status = "Client approved";
      rel.updatedAt = nowIso();
      saveDb();
      toast("ok", "Approved", "Client approval recorded.");
      log("approve_release_client", "release", rel.id, rel.jobId, {});
      render();
      return;
    }

    if (action === "send-to-partner") {
      const rel = getRelease(data.releaseId);
      if (!rel) return;
      if (!perms().canSendToPartner) { toast("bad", "Not allowed", "This role cannot send to partner."); return; }
      if (rel.status !== "Client approved") { toast("warn", "Not ready", "Release must be Client approved before sending."); return; }

      const blockers = releaseBlockers(rel);
      if (blockers.length) {
        toast("bad", "Blocked", blockers[0]);
        openModal({
          title: "Release blocked",
          ariaLabel: "Release blocked",
          bodyHtml: `
            <div class="banner bad"><strong>Cannot “Send to partner” yet.</strong></div>
            <div class="sep"></div>
            <div class="card">
              <div class="card-title">Block reasons</div>
              <div class="sep"></div>
              <ul>${blockers.map(b => `<li>${escapeHtml(b)}</li>`).join("")}</ul>
            </div>
            <div class="sep"></div>
            <div class="banner info"><strong>Funds statement:</strong> ${escapeHtml(FUNDS_STATEMENT)}</div>
          `,
          footerHtml: `<div class="muted">Fix blockers then try again.</div><button class="btn" type="button" data-action="modal-close">Close</button>`
        });
        log("send_to_partner_blocked", "release", rel.id, rel.jobId, { blockers });
        return;
      }

      rel.status = "Sent to partner";
      rel.sentToPartnerAt = nowIso();
      rel.updatedAt = nowIso();
      saveDb();
      toast("ok", "Sent", "Release sent to escrow/PBA partner (demo).");
      log("send_to_partner", "release", rel.id, rel.jobId, {});
      render();
      return;
    }

    if (action === "mark-released") {
      const rel = getRelease(data.releaseId);
      if (!rel) return;
      if (!perms().canMarkReleased) { toast("bad", "Not allowed", "This role cannot mark releases as released."); return; }
      if (rel.status !== "Sent to partner") { toast("warn", "Not valid", "Must be sent to partner first."); return; }
      rel.status = "Released";
      rel.releasedAt = nowIso();
      rel.updatedAt = nowIso();
      saveDb();
      toast("ok", "Released", "Release marked as released (demo).");
      log("mark_released", "release", rel.id, rel.jobId, {});
      render();
      return;
    }

    // Disputes
    if (action === "create-dispute") {
      const jobId = data.jobId || "";
      openModal({
        title: "Create dispute",
        ariaLabel: "Create dispute",
        bodyHtml: `
          <div class="grid cols-2">
            <div class="field">
              <label for="cdJob">Job</label>
              <select id="cdJob">
                ${db.jobs.filter(j => !j.archived).map(j => `<option value="${escapeHtml(j.id)}"${jobId && j.id===jobId?" selected":""}>${escapeHtml(j.name)}</option>`).join("")}
              </select>
            </div>
            <div class="field">
              <label for="cdTitle">Title</label>
              <input id="cdTitle" type="text" placeholder="e.g., Client query: scope clarification" />
            </div>
          </div>
          <div class="field">
            <label for="cdNote">Initial note</label>
            <input id="cdNote" type="text" placeholder="Short note" />
          </div>
          <div class="banner warn">If pauseRelease is ON, “Send to partner” will be blocked.</div>
          <div class="hstack">
            <label class="muted"><input type="checkbox" id="cdPause" checked /> Pause releases</label>
          </div>
        `,
        footerHtml: `
          <div class="muted">Creates an open dispute.</div>
          <div class="hstack">
            <button class="btn" type="button" data-action="modal-close">Cancel</button>
            <button class="btn primary" type="button" data-action="confirm-create-dispute">Create</button>
          </div>
        `
      });
      return;
    }

    if (action === "confirm-create-dispute") {
      const jobId = String($("#cdJob")?.value || "").trim();
      const title = String($("#cdTitle")?.value || "").trim() || "Dispute";
      const note = String($("#cdNote")?.value || "").trim();
      const pause = Boolean($("#cdPause")?.checked);

      const job = getJob(jobId);
      if (!job) { toast("bad", "Missing job", "Select a job first."); return; }

      const id = uid("dis");
      const d = {
        id,
        jobId,
        title,
        status: "open",
        pauseRelease: pause,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        timeline: [{ ts: nowIso(), byRole: ui.role, type: "opened", text: note || "Dispute opened (demo)." }],
      };

      db.disputes.unshift(d);
      job.disputeIds = Array.from(new Set([...(job.disputeIds || []), id]));
      job.updatedAt = nowIso();

      saveDb();
      closeModal();
      toast("ok", "Dispute created", "Dispute created and linked to job.");
      log("create_dispute", "dispute", id, jobId, { pauseRelease: pause });
      routeTo(`#/disputes?job=${encodeURIComponent(jobId)}`);
      return;
    }

    if (action === "toggle-pause") {
      const d = db.disputes.find(x => x.id === data.disputeId);
      if (!d) return;
      d.pauseRelease = !d.pauseRelease;
      d.updatedAt = nowIso();
      d.timeline.push({ ts: nowIso(), byRole: ui.role, type: "toggle_pause", text: `pauseRelease set to ${d.pauseRelease}` });
      saveDb();
      toast("ok", "Updated", `pauseRelease is now ${d.pauseRelease ? "ON" : "OFF"}.`);
      log("toggle_pause_release", "dispute", d.id, d.jobId, { pauseRelease: d.pauseRelease });
      render();
      return;
    }

    if (action === "toggle-dispute") {
      const d = db.disputes.find(x => x.id === data.disputeId);
      if (!d) return;
      d.status = d.status === "closed" ? "open" : "closed";
      d.updatedAt = nowIso();
      d.timeline.push({ ts: nowIso(), byRole: ui.role, type: "toggle_status", text: `status set to ${d.status}` });
      saveDb();
      toast("ok", "Updated", `Dispute is now ${d.status}.`);
      log("toggle_dispute_status", "dispute", d.id, d.jobId, { status: d.status });
      render();
      return;
    }

    if (action === "view-dispute") {
      const d = db.disputes.find(x => x.id === data.disputeId);
      if (!d) return;
      const job = getJob(d.jobId);

      openModal({
        title: "Dispute timeline",
        ariaLabel: "Dispute timeline",
        bodyHtml: `
          <div class="banner info">
            <strong>${escapeHtml(d.title)}</strong>
            <div class="muted">${escapeHtml(job ? job.name : d.jobId)} • <span class="pill ${d.status==="closed"?"ok":"warn"}">${escapeHtml(d.status)}</span></div>
          </div>
          <div class="sep"></div>
          <div class="card">
            <div class="card-title">Timeline</div>
            <div class="sep"></div>
            <div class="vstack">
              ${d.timeline.map(t => `
                <div class="banner ${t.type==="opened"?"warn":"info"}">
                  <div class="split">
                    <div>
                      <strong>${escapeHtml(ROLE_LABEL[t.byRole] || t.byRole)}</strong>
                      <div class="muted">${escapeHtml(formatDate(t.ts))} • ${escapeHtml(t.type)}</div>
                    </div>
                    <span class="pill ${d.pauseRelease?"bad":"ok"}">pauseRelease ${d.pauseRelease ? "ON" : "OFF"}</span>
                  </div>
                  <div class="sep"></div>
                  <div>${escapeHtml(t.text)}</div>
                </div>
              `).join("")}
            </div>
          </div>
        `,
        footerHtml: `
          <div class="muted">This dispute can block “Send to partner” if pauseRelease is ON.</div>
          <div class="hstack"><button class="btn" type="button" data-action="modal-close">Close</button></div>
        `
      });
      return;
    }

    // Company / bank
    if (action === "edit-bank") {
      const payee = getPayee(data.payeeId);
      if (!payee) return;
      if (!perms().canEditBank) { toast("bad", "Not allowed", "This role cannot edit bank details."); return; }

      openModal({
        title: "Edit bank details",
        ariaLabel: "Edit bank details",
        bodyHtml: `
          <div class="banner warn">Editing sets <strong>bankChanged</strong>. A Manager/Admin must confirm before sending releases.</div>
          <div class="sep"></div>
          <div class="grid cols-2">
            <div class="field"><label for="ebBankName">Bank name</label><input id="ebBankName" type="text" value="${escapeHtml(payee.bank.bankName)}" /></div>
            <div class="field"><label for="ebAcctName">Account name</label><input id="ebAcctName" type="text" value="${escapeHtml(payee.bank.accountName)}" /></div>
            <div class="field"><label for="ebSort">Sort code</label><input id="ebSort" type="text" value="${escapeHtml(payee.bank.sortCode)}" /></div>
            <div class="field"><label for="ebAcct">Account number</label><input id="ebAcct" type="text" value="${escapeHtml(payee.bank.accountNumber)}" /></div>
          </div>
        `,
        footerHtml: `
          <div class="muted">${escapeHtml(payee.name)}</div>
          <div class="hstack">
            <button class="btn" type="button" data-action="modal-close">Cancel</button>
            <button class="btn primary" type="button" data-action="confirm-edit-bank" data-payee-id="${escapeHtml(payee.id)}">Save</button>
          </div>
        `
      });
      return;
    }

    if (action === "confirm-edit-bank") {
      const payee = getPayee(data.payeeId);
      if (!payee) return;

      payee.bank.bankName = String($("#ebBankName")?.value || payee.bank.bankName).trim();
      payee.bank.accountName = String($("#ebAcctName")?.value || payee.bank.accountName).trim();
      payee.bank.sortCode = String($("#ebSort")?.value || payee.bank.sortCode).trim();
      payee.bank.accountNumber = String($("#ebAcct")?.value || payee.bank.accountNumber).trim();
      payee.bankChanged = true;
      payee.bankConfirmed = false;
      payee.updatedAt = nowIso();

      saveDb();
      closeModal();
      toast("ok", "Bank updated", "Bank details updated and marked as needing confirmation.");
      log("edit_bank", "payee", payee.id, null, { bankChanged: true });
      render();
      return;
    }

    if (action === "confirm-bank") {
      const payee = getPayee(data.payeeId);
      if (!payee) return;
      if (!perms().canConfirmBank) { toast("bad", "Not allowed", "This role cannot confirm bank details."); return; }

      payee.bankConfirmed = true;
      payee.bankChanged = false;
      payee.updatedAt = nowIso();

      saveDb();
      toast("ok", "Confirmed", "Bank details confirmed.");
      log("confirm_bank", "payee", payee.id, null, {});
      render();
      return;
    }

    // Messages
    if (action === "post-message") {
      const job = getJob(data.jobId);
      if (!job) return;

      const text = String($("#msgText")?.value || "").trim();
      if (!text) { toast("warn", "Empty", "Write a message first."); return; }

      db.messages.push({ id: uid("msg"), threadId: job.threadId, jobId: job.id, ts: nowIso(), byRole: ui.role, text, attachments: [] });
      saveDb();
      toast("ok", "Posted", "Message posted to thread.");
      log("post_message", "message", "thread", job.id, { length: text.length });
      render();
      return;
    }

    // Reports CSV
    if (action === "export-csv") {
      if (!perms().canExport) { toast("bad", "Not allowed", "This role cannot export CSV."); return; }
      const which = data.csv;

      const map = {
        jobs: () => db.jobs.map(j => ({ id: j.id, name: j.name, clientName: j.clientName, address: j.address, status: j.status, archived: j.archived, createdAt: j.createdAt, updatedAt: j.updatedAt })),
        invoices: () => db.invoices.map(i => ({ id: i.id, jobId: i.jobId, number: i.number, clientPaymentBeforeVat: i.clientPaymentBeforeVat, feeVatRate: i.feeVatRate, createdAt: i.createdAt, updatedAt: i.updatedAt })),
        milestones: () => db.milestones.map(m => ({ id: m.id, jobId: m.jobId, title: m.title, evidenceRequired: m.evidenceRequired, evidenceProvided: m.evidenceProvided, targetDate: m.targetDate })),
        releases: () => db.releases.map(r => ({ id: r.id, jobId: r.jobId, title: r.title, status: r.status, managerApproved: r.approvals.manager, clientApproved: r.approvals.client, sentToPartnerAt: r.sentToPartnerAt, releasedAt: r.releasedAt, createdAt: r.createdAt, updatedAt: r.updatedAt })),
        disputes: () => db.disputes.map(d => ({ id: d.id, jobId: d.jobId, title: d.title, status: d.status, pauseRelease: d.pauseRelease, createdAt: d.createdAt, updatedAt: d.updatedAt })),
        messages: () => db.messages.map(m => ({ id: m.id, jobId: m.jobId, threadId: m.threadId, ts: m.ts, byRole: m.byRole, text: m.text })),
        payees: () => db.payees.map(p => ({ id: p.id, name: p.name, type: p.type, vatRegistered: p.vatRegistered, vatNumber: p.vatNumber, bankName: p.bank.bankName, sortCode: p.bank.sortCode, accountNumber: p.bank.accountNumber, bankChanged: p.bankChanged, bankConfirmed: p.bankConfirmed, updatedAt: p.updatedAt })),
        auditLog: () => db.auditLog.map(a => ({ id: a.id, ts: a.ts, actorRole: a.actorRole, action: a.action, entityType: a.entityType, entityId: a.entityId, jobId: a.jobId, details: JSON.stringify(a.details || {}) })),
      };

      if (!map[which]) { toast("bad", "Unknown", "Unknown dataset."); return; }

      const rows = map[which]();
      const csv = toCsv(rows);
      downloadText(`approvehub_${which}_${new Date().toISOString().slice(0,10)}.csv`, csv, "text/csv");
      toast("ok", "Exported", `Exported ${which} CSV.`);
      log("export_csv", "report", which, null, { rows: rows.length });
      return;
    }

    toast("warn", "Unknown action", `No handler for: ${action}`);
  }

  /* ---------------------------
     Init (boot once)
  --------------------------- */
  function init() {
    applyThemePref(ui.theme);

    seedIfNeeded();
    ensureDefaultHash();
    ui.route = parseRoute();

    bindRouterOnce();
    bindHeaderOnce();
    bindViewDelegationOnce();
    bindModalDelegationOnce();
    bindToastDelegationOnce();

    updateNavVisibility();
    render();
  }

  // boot (script is defer, so DOM is ready)
  init();

})();
// PART 6 END
