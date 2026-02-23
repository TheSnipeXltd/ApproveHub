// PART 1 START
(() => {
  "use strict";

  /* =========================================================
     ApproveHub — Static Demo (single-file JS)
     - Hash routing only (GitHub Pages)
     - localStorage persistence + schema migration/reset
     - Event delegation: #view + #modalRoot
     ========================================================= */

  const LS_KEY = "approvehub_demo_db";
  const SCHEMA_VERSION = 2;

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
    manager: {
      nav: ["dashboard","jobs","payments","approvals","disputes","messages","company","reports","settings"],
      canReset: true, canExport: true, canImport: true,
      canApproveManager: true, canApproveClient: false,
      canConfirmBank: true,
      canSendToPartner: true,
      canMarkReleased: false,
      canEditBank: true,
      canEditInvoice: true,
      canCreateJob: true,
      canToggleTestMode: false,
    },
    client: {
      nav: ["dashboard","jobs","payments","approvals","disputes","messages","company","settings"],
      canReset: false, canExport: true, canImport: true,
      canApproveManager: false, canApproveClient: true,
      canConfirmBank: false,
      canSendToPartner: false,
      canMarkReleased: false,
      canEditBank: false,
      canEditInvoice: true,
      canCreateJob: false,
      canToggleTestMode: false,
    },
    payee: {
      nav: ["dashboard","payments","messages","company","settings"],
      canReset: false, canExport: false, canImport: false,
      canApproveManager: false, canApproveClient: false,
      canConfirmBank: false,
      canSendToPartner: false,
      canMarkReleased: false,
      canEditBank: true,
      canEditInvoice: false,
      canCreateJob: false,
      canToggleTestMode: false,
    },
    accountant: {
      nav: ["dashboard","jobs","reports","settings"],
      canReset: false, canExport: true, canImport: true,
      canApproveManager: false, canApproveClient: false,
      canConfirmBank: false,
      canSendToPartner: false,
      canMarkReleased: false,
      canEditBank: false,
      canEditInvoice: false,
      canCreateJob: false,
      canToggleTestMode: false,
    },
    admin: {
      nav: ["dashboard","jobs","payments","approvals","disputes","messages","company","reports","settings"],
      canReset: true, canExport: true, canImport: true,
      canApproveManager: true, canApproveClient: true,
      canConfirmBank: true,
      canSendToPartner: true,
      canMarkReleased: true,
      canEditBank: true,
      canEditInvoice: true,
      canCreateJob: true,
      canToggleTestMode: true,
    },
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
    try {
      return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(num);
    } catch {
      return `£${num.toFixed(2)}`;
    }
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
     UI State
  --------------------------- */
  const ui = {
    role: localStorage.getItem("approvehub_role") || "manager",
    theme: localStorage.getItem("approvehub_theme") || "system", // system|light|dark
    route: { path: "/dashboard", params: {}, query: {} },
  };

  function perms() { return ROLE_PERMS[ui.role] || ROLE_PERMS.manager; }

  /* ---------------------------
     Storage + migration
  --------------------------- */
  let db = null;

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

  function normalizeDb() {
    // arrays
    db.payees = Array.isArray(db.payees) ? db.payees : [];
    db.jobs = Array.isArray(db.jobs) ? db.jobs : [];
    db.milestones = Array.isArray(db.milestones) ? db.milestones : [];
    db.invoices = Array.isArray(db.invoices) ? db.invoices : [];
    db.releases = Array.isArray(db.releases) ? db.releases : [];
    db.disputes = Array.isArray(db.disputes) ? db.disputes : [];
    db.messages = Array.isArray(db.messages) ? db.messages : [];
    db.snapshots = Array.isArray(db.snapshots) ? db.snapshots : [];
    db.auditLog = Array.isArray(db.auditLog) ? db.auditLog : [];

    // meta + company
    db.meta = db.meta && typeof db.meta === "object" ? db.meta : {};
    if (typeof db.meta.testMode !== "boolean") db.meta.testMode = false;

    db.company = db.company && typeof db.company === "object" ? db.company : {};
    const c = db.company;
    if (!c.companyName) c.companyName = "ApproveHub Demo Co Ltd";
    if (!c.vatNumber) c.vatNumber = "GB 000 0000 00";
    if (!c.companyRegNumber) c.companyRegNumber = "00000000";
    if (!c.utrNumber) c.utrNumber = "00000 00000";
    if (!c.nationalInsuranceNumber) c.nationalInsuranceNumber = "QQ 12 34 56 C";
    if (!c.companyAddress) c.companyAddress = "123 Oak Street, Central City";
    if (!c.billingAddress) c.billingAddress = "123 Oak Street, Central City";
    if (!c.phoneNumber) c.phoneNumber = "(020) 1234 5678";

    // releases approvals
    for (const r of db.releases) {
      if (!r.approvals) r.approvals = { manager: false, client: false };
      if (!Array.isArray(r.payeeSplits)) r.payeeSplits = [];
    }

    // invoices: main contractor + status
    for (const inv of db.invoices) {
      if (typeof inv.mainContractorAmount !== "number") inv.mainContractorAmount = 0;
      if (!inv.status) inv.status = "draft";
      if (!Array.isArray(inv.lineItems)) inv.lineItems = [];
    }
  }

  function seedIfNeeded() {
    const loaded = migrate(loadDb());
    if (!loaded) {
      db = defaultDb(); // defined in PART 2
      saveDb();
      return;
    }
    db = loaded;
    normalizeDb();
    saveDb();
  }

  /* ---------------------------
     Finders + derived collections
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

  /* ---------------------------
     Invoice totals (includes main contractor)
  --------------------------- */
  function invoiceTotals(inv) {
    const clientPaymentBeforeVat = Number(inv.clientPaymentBeforeVat || 0);

    const totalToTrades = (inv.lineItems || [])
      .filter(li => li.category === "contractor")
      .reduce((s, li) => s + Number(li.amount || 0), 0);

    const totalToSuppliers = (inv.lineItems || [])
      .filter(li => li.category === "supplier")
      .reduce((s, li) => s + Number(li.amount || 0), 0);

    const mainContractorAmount = Number(inv.mainContractorAmount || 0);
    const totalOutgoings = totalToTrades + totalToSuppliers + mainContractorAmount;

    const feePot = Math.max(0, clientPaymentBeforeVat - totalOutgoings);
    const vatRate = clamp(Number(inv.feeVatRate ?? 20), 0, 100);
    const vatOnFee = Math.round((feePot * vatRate / 100) * 100) / 100;
    const grandTotal = Math.round((clientPaymentBeforeVat + vatOnFee) * 100) / 100;

    // Illustrative example ONLY
    const exampleWholeVat = Math.round((clientPaymentBeforeVat * 0.2) * 100) / 100;
    const illustrativeDiff = Math.max(0, Math.round((exampleWholeVat - vatOnFee) * 100) / 100);

    return {
      clientPaymentBeforeVat,
      totalToTrades,
      totalToSuppliers,
      mainContractorAmount,
      totalOutgoings,
      feePot,
      vatRate,
      vatOnFee,
      grandTotal,
      exampleWholeVat,
      illustrativeDiff,
    };
  }

  /* CONTINUES IN PART 2 */
// PART 1 END

 // PART 2 START
  /* ---------------------------
     Default DB (seed) — schema v2
     - Adds: company, meta.testMode, invoice.status, invoice.mainContractorAmount
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

    const company = {
      companyName: "My Construction Ltd",
      vatNumber: "GB 000 0000 00",
      companyRegNumber: "00000000",
      utrNumber: "00000 00000",
      nationalInsuranceNumber: "QQ 12 34 56 C",
      companyAddress: "123 Oak Street, Central City",
      billingAddress: "123 Oak Street, Central City",
      phoneNumber: "(020) 1234 5678",
    };

    const jobs = [
      {
        id: "job_hilltop",
        name: "Hilltop Apartments",
        location: "Central City",
        clientName: "A. Patel",
        address: "Central City (demo)",
        status: "open",
        archived: false,
        createdAt: dayIso(26),
        updatedAt: dayIso(1),
        description: "Multi-trade approvals with staged invoice releases.",
        milestoneIds: ["ms_h1","ms_h2","ms_h3","ms_h4"],
        invoiceIds: ["inv_h_1","inv_h_2","inv_h_3","inv_h_4","inv_h_5","inv_h_6","inv_h_7","inv_h_8"],
        releaseIds: ["rel_h_1","rel_h_2","rel_h_3"],
        disputeIds: ["dis_h_1"],
        threadId: "thr_job_hilltop",
      },
      {
        id: "job_oakwood",
        name: "Oakwood Office Park",
        location: "Oakwood",
        clientName: "J. Morris",
        address: "Oakwood (demo)",
        status: "open",
        archived: false,
        createdAt: dayIso(40),
        updatedAt: dayIso(3),
        description: "Office park refurb with invoice tile workflow.",
        milestoneIds: ["ms_o1","ms_o2","ms_o3"],
        invoiceIds: ["inv_o_1","inv_o_2","inv_o_3","inv_o_4","inv_o_5","inv_o_6","inv_o_7"],
        releaseIds: ["rel_o_1"],
        disputeIds: [],
        threadId: "thr_job_oakwood",
      },
      {
        id: "job_lakeside",
        name: "Lakeside Shopping Center",
        location: "Riverside",
        clientName: "S. Green",
        address: "Riverside (demo)",
        status: "open",
        archived: false,
        createdAt: dayIso(14),
        updatedAt: dayIso(2),
        description: "Supplier-heavy project with approvals.",
        milestoneIds: ["ms_l1"],
        invoiceIds: ["inv_l_1"],
        releaseIds: ["rel_l_1"],
        disputeIds: [],
        threadId: "thr_job_lakeside",
      },
      {
        id: "job_downtown",
        name: "Downtown Tower",
        location: "Metroville",
        clientName: "K. Singh",
        address: "Metroville (demo)",
        status: "open",
        archived: false,
        createdAt: dayIso(20),
        updatedAt: dayIso(7),
        description: "Progress-based releases with evidence.",
        milestoneIds: ["ms_dt_1"],
        invoiceIds: ["inv_dt_1"],
        releaseIds: [],
        disputeIds: [],
        threadId: "thr_job_downtown",
      },
      {
        id: "job_greenfield",
        name: "Greenfield Housing",
        location: "Greenfield",
        clientName: "D. Clark",
        address: "Greenfield (demo)",
        status: "open",
        archived: false,
        createdAt: dayIso(9),
        updatedAt: dayIso(1),
        description: "Milestone evidence demo blockers.",
        milestoneIds: ["ms_g_1"],
        invoiceIds: ["inv_g_1"],
        releaseIds: ["rel_g_1"],
        disputeIds: [],
        threadId: "thr_job_greenfield",
      },
      {
        id: "job_seaview",
        name: "Seaview Condos",
        location: "Coastal Town",
        clientName: "R. Evans",
        address: "Coastal Town (demo)",
        status: "completed",
        archived: false,
        createdAt: dayIso(80),
        updatedAt: dayIso(50),
        description: "Completed job (demo).",
        milestoneIds: ["ms_s_1"],
        invoiceIds: ["inv_s_1"],
        releaseIds: ["rel_s_1"],
        disputeIds: [],
        threadId: "thr_job_seaview",
      },
    ];

    const milestones = [
      { id: "ms_h1", jobId: "job_hilltop", title: "Deposit & Pre-start", evidenceRequired: false, evidenceProvided: true, targetDate: dayIso(30) },
      { id: "ms_h2", jobId: "job_hilltop", title: "Structure Complete", evidenceRequired: true, evidenceProvided: true, targetDate: dayIso(18) },
      { id: "ms_h3", jobId: "job_hilltop", title: "First Fix", evidenceRequired: true, evidenceProvided: false, targetDate: dayIso(10) },
      { id: "ms_h4", jobId: "job_hilltop", title: "Second Fix", evidenceRequired: true, evidenceProvided: false, targetDate: dayIso(5) },

      { id: "ms_o1", jobId: "job_oakwood", title: "Kick-off", evidenceRequired: false, evidenceProvided: true, targetDate: dayIso(28) },
      { id: "ms_o2", jobId: "job_oakwood", title: "Fit-out", evidenceRequired: true, evidenceProvided: true, targetDate: dayIso(12) },
      { id: "ms_o3", jobId: "job_oakwood", title: "Handover", evidenceRequired: true, evidenceProvided: false, targetDate: dayIso(2) },

      { id: "ms_l1", jobId: "job_lakeside", title: "Materials Delivered", evidenceRequired: true, evidenceProvided: true, targetDate: dayIso(3) },

      { id: "ms_dt_1", jobId: "job_downtown", title: "First Fix", evidenceRequired: true, evidenceProvided: true, targetDate: dayIso(8) },

      { id: "ms_g_1", jobId: "job_greenfield", title: "Evidence Required (Demo)", evidenceRequired: true, evidenceProvided: false, targetDate: dayIso(1) },

      { id: "ms_s_1", jobId: "job_seaview", title: "Practical Completion", evidenceRequired: true, evidenceProvided: true, targetDate: dayIso(60) },
    ];

    function invoiceTemplate(id, jobId, number, daysAgo, status, beforeVat, mainContractorAmount, lineItems) {
      return {
        id, jobId, number,
        status, // draft|ready|approved
        createdAt: dayIso(daysAgo),
        updatedAt: dayIso(Math.max(0, daysAgo - 1)),
        clientPaymentBeforeVat: beforeVat,
        feeVatRate: 20,
        mainContractorAmount: mainContractorAmount || 0,
        lineItems: lineItems || [],
      };
    }

    const invoices = [
      // Hilltop (8 invoices for tile grid)
      invoiceTemplate("inv_h_1","job_hilltop","INV-00101",8,"approved",15290, 2800, [
        { id: "li_h1_1", payeeId: "pay_oakbeam", category: "contractor", description: "Carpentry (phase 1)", amount: 6200 },
        { id: "li_h1_2", payeeId: "pay_electrics", category: "contractor", description: "Electrical first fix", amount: 3100 },
        { id: "li_h1_3", payeeId: "pay_supplies", category: "supplier", description: "Timber + fixings", amount: 1450 },
      ]),
      invoiceTemplate("inv_h_2","job_hilltop","INV-00102",7,"ready",9800, 1900, [
        { id: "li_h2_1", payeeId: "pay_oakbeam", category: "contractor", description: "Carpentry (phase 2)", amount: 2400 },
        { id: "li_h2_2", payeeId: "pay_supplies", category: "supplier", description: "Plasterboard + sundries", amount: 760 },
      ]),
      invoiceTemplate("inv_h_3","job_hilltop","INV-00103",6,"draft",6200, 1100, [
        { id: "li_h3_1", payeeId: "pay_electrics", category: "contractor", description: "Second fix allowance", amount: 900 },
      ]),
      invoiceTemplate("inv_h_4","job_hilltop","INV-00104",5,"draft",5400, 900, [
        { id: "li_h4_1", payeeId: "pay_supplies", category: "supplier", description: "Insulation", amount: 880 },
      ]),
      invoiceTemplate("inv_h_5","job_hilltop","INV-00105",4,"draft",4100, 650, []),
      invoiceTemplate("inv_h_6","job_hilltop","INV-00106",3,"draft",3800, 600, []),
      invoiceTemplate("inv_h_7","job_hilltop","INV-00107",2,"draft",4600, 750, []),
      invoiceTemplate("inv_h_8","job_hilltop","INV-00108",1,"draft",5200, 820, []),

      // Oakwood (7 invoices)
      invoiceTemplate("inv_o_1","job_oakwood","INV-00201",10,"approved",11800, 2100, [
        { id: "li_o1_1", payeeId: "pay_supplies", category: "supplier", description: "Materials bundle", amount: 3200 },
        { id: "li_o1_2", payeeId: "pay_oakbeam", category: "contractor", description: "Install crew", amount: 4100 },
      ]),
      invoiceTemplate("inv_o_2","job_oakwood","INV-00202",9,"ready",7600, 1400, []),
      invoiceTemplate("inv_o_3","job_oakwood","INV-00203",8,"draft",6900, 1200, []),
      invoiceTemplate("inv_o_4","job_oakwood","INV-00204",7,"draft",8300, 1500, []),
      invoiceTemplate("inv_o_5","job_oakwood","INV-00205",6,"draft",5200, 900, []),
      invoiceTemplate("inv_o_6","job_oakwood","INV-00206",5,"draft",6100, 1000, []),
      invoiceTemplate("inv_o_7","job_oakwood","INV-00207",4,"draft",4800, 800, []),

      invoiceTemplate("inv_l_1","job_lakeside","INV-00301",5,"ready",9200, 1800, [
        { id: "li_l1_1", payeeId: "pay_supplies", category: "supplier", description: "Fixtures shipment", amount: 2600 },
      ]),
      invoiceTemplate("inv_dt_1","job_downtown","INV-00401",7,"draft",5400, 900, [
        { id: "li_dt_1", payeeId: "pay_oakbeam", category: "contractor", description: "Labour", amount: 1600 },
      ]),
      invoiceTemplate("inv_g_1","job_greenfield","INV-00501",2,"draft",7600, 1500, [
        { id: "li_g1_1", payeeId: "pay_supplies", category: "supplier", description: "Aggregate + binder", amount: 2100 },
      ]),
      invoiceTemplate("inv_s_1","job_seaview","INV-00012",60,"approved",9200, 1800, [
        { id: "li_s1_1", payeeId: "pay_oakbeam", category: "contractor", description: "Joinery", amount: 3000 },
        { id: "li_s1_2", payeeId: "pay_supplies", category: "supplier", description: "Paint + consumables", amount: 450 },
      ]),
    ];

    const releases = [
      {
        id: "rel_h_1",
        jobId: "job_hilltop",
        invoiceId: "inv_h_1",
        milestoneId: "ms_h2",
        title: "Release — Structure stage",
        status: "Client approved",
        approvals: { manager: true, client: true },
        sentToPartnerAt: null,
        releasedAt: null,
        createdAt: dayIso(8),
        updatedAt: dayIso(7),
        payeeSplits: [
          { payeeId: "pay_oakbeam", amount: 3000 },
          { payeeId: "pay_electrics", amount: 1400 },
          { payeeId: "pay_supplies", amount: 900 },
        ],
        notes: "Ready to send (demo).",
      },
      {
        id: "rel_h_2",
        jobId: "job_hilltop",
        invoiceId: "inv_h_2",
        milestoneId: "ms_h3",
        title: "Release — First fix stage",
        status: "Submitted",
        approvals: { manager: false, client: false },
        sentToPartnerAt: null,
        releasedAt: null,
        createdAt: dayIso(3),
        updatedAt: dayIso(2),
        payeeSplits: [
          { payeeId: "pay_oakbeam", amount: 2200 },
          { payeeId: "pay_electrics", amount: 900 },
        ],
        notes: "Submitted for approvals.",
      },
      {
        id: "rel_h_3",
        jobId: "job_hilltop",
        invoiceId: "inv_h_3",
        milestoneId: "ms_h3",
        title: "Release — Electrical works",
        status: "Manager approved",
        approvals: { manager: true, client: false },
        sentToPartnerAt: null,
        releasedAt: null,
        createdAt: dayIso(2),
        updatedAt: dayIso(1),
        payeeSplits: [
          { payeeId: "pay_electrics", amount: 700 },
        ],
        notes: "Awaiting client approval.",
      },
      {
        id: "rel_o_1",
        jobId: "job_oakwood",
        invoiceId: "inv_o_2",
        milestoneId: "ms_o2",
        title: "Release — Fit-out stage",
        status: "Sent to partner",
        approvals: { manager: true, client: true },
        sentToPartnerAt: dayIso(6),
        releasedAt: null,
        createdAt: dayIso(7),
        updatedAt: dayIso(6),
        payeeSplits: [
          { payeeId: "pay_supplies", amount: 1200 },
          { payeeId: "pay_oakbeam", amount: 1600 },
        ],
        notes: "Sent to partner (demo).",
      },
      {
        id: "rel_l_1",
        jobId: "job_lakeside",
        invoiceId: "inv_l_1",
        milestoneId: "ms_l1",
        title: "Release — Materials",
        status: "Released",
        approvals: { manager: true, client: true },
        sentToPartnerAt: dayIso(4),
        releasedAt: dayIso(4),
        createdAt: dayIso(5),
        updatedAt: dayIso(4),
        payeeSplits: [
          { payeeId: "pay_supplies", amount: 1000 },
        ],
        notes: "Released (demo).",
      },
      {
        id: "rel_g_1",
        jobId: "job_greenfield",
        invoiceId: "inv_g_1",
        milestoneId: "ms_g_1",
        title: "Release — Blocked by evidence",
        status: "Client approved",
        approvals: { manager: true, client: true },
        sentToPartnerAt: null,
        releasedAt: null,
        createdAt: dayIso(2),
        updatedAt: dayIso(1),
        payeeSplits: [
          { payeeId: "pay_supplies", amount: 1200 },
        ],
        notes: "Evidence missing on milestone (demo blocker).",
      },
      {
        id: "rel_s_1",
        jobId: "job_seaview",
        invoiceId: "inv_s_1",
        milestoneId: "ms_s_1",
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
        notes: "Completed (demo).",
      },
    ];

    const disputes = [
      {
        id: "dis_h_1",
        jobId: "job_hilltop",
        title: "Client query: scope clarification",
        status: "open",
        pauseRelease: true,
        createdAt: dayIso(6),
        updatedAt: dayIso(2),
        timeline: [
          { ts: dayIso(6), byRole: "client", type: "opened", text: "Query on scope for second fix and extras." },
          { ts: dayIso(4), byRole: "manager", type: "comment", text: "Provided allowance details. Awaiting confirmation." },
        ],
      },
    ];

    const messages = [
      { id: "msg_h_1", threadId: "thr_job_hilltop", jobId: "job_hilltop", ts: dayIso(7), byRole: "manager", text: "Welcome — approvals and invoices will be tracked here.", attachments: [] },
      { id: "msg_h_2", threadId: "thr_job_hilltop", jobId: "job_hilltop", ts: dayIso(6), byRole: "client", text: "Thanks — please notify me before sending releases.", attachments: [] },
      { id: "msg_o_1", threadId: "thr_job_oakwood", jobId: "job_oakwood", ts: dayIso(8), byRole: "manager", text: "Invoice tiles are ready for this job (demo).", attachments: [] },
    ];

    const auditLog = [
      { id: uid("aud"), ts: dayIso(2), actorRole: "manager", action: "seed_demo", entityType: "db", entityId: "root", jobId: null, details: { schemaVersion: SCHEMA_VERSION } },
    ];

    return {
      schemaVersion: SCHEMA_VERSION,
      meta: { seededAt: nowIso(), lastResetReason: "", testMode: false },
      company,
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
    if (!db) return;
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

    root.insertAdjacentHTML("afterbegin", `
      <div class="toast" data-toast-id="${id}">
        <div>
          <div class="t-title"><span class="pill ${pill}">${escapeHtml(kind.toUpperCase())}</span> ${escapeHtml(title)}</div>
          <div class="t-msg">${escapeHtml(message)}</div>
        </div>
        <button class="icon-btn" type="button" data-action="toast-close" data-toast-id="${id}" aria-label="Dismiss">✕</button>
      </div>
    `);

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
  function routeTo(hash) { window.location.hash = hash; }

  function ensureDefaultHash() {
    if (!window.location.hash || window.location.hash === "#") {
      window.location.hash = "#/dashboard";
    }
  }

  function parseRoute() {
    let h = window.location.hash || "";
    if (!h || h === "#") return { path: "/dashboard", params: {}, query: {} };

    if (h.startsWith("#")) h = h.slice(1);
    const [rawPath, rawQs] = h.split("?");
    const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
    const query = parseQuery(rawQs ? `?${rawQs}` : "");
    return matchRoute(path, query);
  }

  function matchRoute(path, query) {
    const seg = path.split("/").filter(Boolean);
    const out = { path, params: {}, query: query || {} };

    if (seg.length === 1 && seg[0] === "dashboard") return out;
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
    const next = ui.theme === "system" ? "light" : (ui.theme === "light" ? "dark" : "system");
    applyThemePref(next);
    toast("info", "Theme", `Theme set to ${next}.`);
    log("set_theme", "ui", "theme", null, { theme: next });
  }

  function setRole(role) {
    if (!ROLE_PERMS[role]) role = "manager";
    ui.role = role;
    localStorage.setItem("approvehub_role", role);
    toast("info", "Role switched", `Now viewing as ${ROLE_LABEL[role] || role}.`);
    log("set_role", "ui", "role", null, { role });

    updateNavVisibility();
    updateNavCounts();
    render();
  }

  function setTestMode(on) {
    if (!perms().canToggleTestMode) {
      toast("bad", "Not allowed", "Only Admin can toggle Test Mode.");
      return;
    }
    db.meta.testMode = !!on;
    saveDb();
    toast("ok", "Test Mode", db.meta.testMode ? "Test Mode is ON." : "Test Mode is OFF.");
    log("toggle_test_mode", "meta", "testMode", null, { testMode: db.meta.testMode });
    render();
  }

  /* ---------------------------
     Approvals inbox items
  --------------------------- */
  function approvalsInboxItems() {
    const items = [];

    for (const p of (db?.payees || [])) {
      if (p && p.bankChanged && !p.bankConfirmed) {
        items.push({ type: "bank", id: p.id, label: `Confirm bank details: ${p.name}` });
      }
    }

    for (const r of (db?.releases || [])) {
      if (!r) continue;
      const a = r.approvals || { manager: false, client: false };

      if (r.status === "Submitted" && !a.manager) items.push({ type: "release_mgr", id: r.id, label: `Approve release (Manager): ${r.title}` });
      if (r.status === "Manager approved" && !a.client) items.push({ type: "release_client", id: r.id, label: `Approve release (Client): ${r.title}` });
      if (r.status === "Client approved") items.push({ type: "release_ready", id: r.id, label: `Ready to send: ${r.title}` });
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
    ` : `<div class="card"><div class="card-title">All caught up</div><div class="card-sub">No items needing action for this role.</div></div>`;

    openModal({
      title: "Notifications",
      ariaLabel: "Notifications",
      bodyHtml: rows,
      footerHtml: `<div class="muted">Tip: switch roles to preview different inboxes.</div><button class="btn" type="button" data-action="modal-close">Close</button>`
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
      const name = (j.name || "").toLowerCase();
      const loc = (j.location || "").toLowerCase();
      if (name.includes(query) || loc.includes(query) || j.id.toLowerCase().includes(query)) {
        hits.push({ type: "Job", tag: j.location || "", label: j.name, href: `#/jobs/${j.id}` });
      }
    }

    for (const inv of db.invoices) {
      const num = (inv.number || "").toLowerCase();
      if (num.includes(query) || inv.id.toLowerCase().includes(query)) {
        const job = getJob(inv.jobId);
        hits.push({ type: "Invoice", tag: inv.number, label: job ? job.name : inv.jobId, href: `#/invoices/${inv.id}` });
      }
    }

    for (const p of db.payees) {
      const nm = (p.name || "").toLowerCase();
      if (nm.includes(query) || p.id.toLowerCase().includes(query)) {
        hits.push({ type: "Payee", tag: p.type, label: p.name, href: `#/company?payee=${encodeURIComponent(p.id)}` });
      }
    }

    const sliced = hits.slice(0, 8);
    if (!sliced.length) {
      pop.innerHTML = `<div class="pop-item"><div><div class="card-title">No results</div><div class="muted">Try “Oakwood”, “INV-”, or a payee name.</div></div></div>`;
      pop.hidden = false;
      return;
    }

    pop.innerHTML = sliced.map(h => `
      <a class="pop-item" href="${escapeHtml(h.href)}">
        <div style="min-width:82px"><span class="pill info">${escapeHtml(h.type)}</span></div>
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

  /* CONTINUES IN PART 4 */
// PART 3 END
 // PART 4 START
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

      // hard hide so it works even if CSS changes
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

  function setNavActive() {
    const nav = $("#sideNav");
    if (!nav) return;
    const seg = (ui.route.path.split("/").filter(Boolean)[0] || "dashboard");
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

  function updateHeaderBadges() {
    const badge = $("#notifBadge");
    if (!badge) return;
    const n = countApprovalsForRole(ui.role);
    badge.textContent = String(n);
    badge.hidden = n <= 0;
  }

  function updateNavCounts() {
    const openJobs = db.jobs.filter(j => !j.archived && j.status !== "completed").length;
    setCount("#navCountJobs", openJobs);

    const activeReleases = db.releases.filter(r => r.status !== "Released").length;
    setCount("#navCountPayments", activeReleases);

    const appr = countApprovalsForRole(ui.role);
    setCount("#navCountApprovals", appr);

    const openDisputes = db.disputes.filter(d => d.status === "open").length;
    setCount("#navCountDisputes", openDisputes);

    const recentOtherMsgs = db.messages.filter(m => new Date(m.ts).getTime() > Date.now() - 3*86400000)
      .filter(m => m.byRole !== ui.role).length;
    setCount("#navCountMessages", recentOtherMsgs);

    updateHeaderBadges();
  }

  function renderTestModeBadge() {
    // we render a small badge in header-right by toggling a class on body
    document.body.classList.toggle("test-mode", !!db.meta.testMode);
  }

  /* ---------------------------
     Release blockers
  --------------------------- */
  function releaseBlockers(release) {
    const reasons = [];

    if (!release?.approvals?.manager) reasons.push("Manager approval is required.");
    if (!release?.approvals?.client) reasons.push("Client approval is required.");

    const payeeIds = (release.payeeSplits || []).map(s => s.payeeId);
    const affected = db.payees.filter(p => payeeIds.includes(p.id) && p.bankChanged && !p.bankConfirmed);
    if (affected.length) reasons.push(`Bank details changed and not confirmed: ${affected.map(p => p.name).join(", ")}.`);

    const activePause = db.disputes.some(d => d.jobId === release.jobId && d.pauseRelease && d.status !== "closed");
    if (activePause) reasons.push("A dispute is pausing releases for this job.");

    if (release.milestoneId) {
      const ms = getMilestone(release.milestoneId);
      if (ms && ms.evidenceRequired && !ms.evidenceProvided) reasons.push(`Evidence missing for milestone: ${ms.title}.`);
    }

    return reasons;
  }

  /* ---------------------------
     Rendering (router -> #view)
  --------------------------- */
  function render() {
    updateNavVisibility();
    setNavActive();
    updateNavCounts();
    renderTestModeBadge();

    const view = $("#view");
    if (!view) return;

    const { path, params, query } = ui.route;

    let html = "";
    if (path === "/dashboard") html = renderDashboard(query);
    else if (path === "/jobs") html = renderJobs(query);
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
          <a class="btn primary" href="#/dashboard">Go to Dashboard</a>
        </div>
      </div>
    `;
  }

  /* ---------------------------
     Helpers for dashboard metrics
  --------------------------- */
  function releaseCountsForJob(job) {
    const rels = jobReleases(job);
    const approved = rels.filter(r => ["Client approved","Sent to partner","Released"].includes(r.status)).length;
    const pending = rels.filter(r => ["Submitted","Manager approved"].includes(r.status)).length;
    return { approved, pending };
  }

  function milestoneProgress(job) {
    const ms = jobMilestones(job);
    const required = ms.filter(m => m.evidenceRequired);
    if (!required.length) return 100;
    const done = required.filter(m => m.evidenceProvided).length;
    return Math.round((done / required.length) * 100);
  }

  function approvedInvoicesCount(job) {
    const invs = jobInvoices(job);
    return invs.filter(i => i.status === "approved").length;
  }

  function savingsTotalsAllJobs() {
    let total = 0;
    const byJob = {};

    for (const inv of db.invoices) {
      const t = invoiceTotals(inv);
      const diff = t.illustrativeDiff;
      total += diff;

      byJob[inv.jobId] = byJob[inv.jobId] || [];
      byJob[inv.jobId].push({ invoiceId: inv.id, number: inv.number, diff });
    }

    return { total: Math.round(total * 100) / 100, byJob };
  }

  /* CONTINUES IN PART 5 */
// PART 4 END

 // PART 5 START
  /* ---------------------------
     Pages — Dashboard / Jobs / Job Detail (Invoices Grid + Payment Plan)
  --------------------------- */
  function renderDashboard(query) {
    const tab = (query.tab || "all").toLowerCase(); // all | open | archived
    const jobsAll = db.jobs.slice().sort((a,b) => (a.updatedAt > b.updatedAt ? -1 : 1));
    const jobsOpen = jobsAll.filter(j => !j.archived && j.status !== "completed");
    const jobsArchived = jobsAll.filter(j => j.archived);
    const jobsCompleted = jobsAll.filter(j => !j.archived && j.status === "completed");

    const list = tab === "open" ? jobsOpen : (tab === "archived" ? jobsArchived : jobsAll.filter(j => j.status !== "completed"));

    const testBanner = db.meta.testMode ? `
      <div class="card" style="border-color: rgba(240,207,99,.55); background: rgba(240,207,99,.14);">
        <div class="split">
          <div>
            <div class="card-title">TEST MODE is ON</div>
            <div class="card-sub">All actions are simulated. No funds move in this demo.</div>
          </div>
          <span class="pill warn">TEST MODE</span>
        </div>
      </div>
    ` : "";

    const tabs = `
      <div class="tabs" role="tablist" aria-label="Dashboard job tabs">
        <a class="tab ${tab==="all"?"active":""}" role="tab" href="#/dashboard?tab=all">All Jobs</a>
        <a class="tab ${tab==="open"?"active":""}" role="tab" href="#/dashboard?tab=open">Open Jobs</a>
        <a class="tab ${tab==="archived"?"active":""}" role="tab" href="#/dashboard?tab=archived">Archived</a>
      </div>
    `;

    const actions = `
      <div class="hstack">
        <button class="btn" data-action="open-savings">Savings</button>
        <button class="btn primary" data-action="create-job">+ New Job</button>
      </div>
    `;

    const jobCards = list.length ? `
      <div class="job-grid" aria-label="Jobs grid">
        ${list.map(j => {
          const rc = releaseCountsForJob(j);
          const prog = milestoneProgress(j);
          const progW = clamp(prog,0,100);
          return `
            <a class="job-card" href="#/jobs/${escapeHtml(j.id)}?tab=invoices" aria-label="Open job ${escapeHtml(j.name)}">
              <div class="job-name">${escapeHtml(j.name)}</div>
              <div class="job-loc">${escapeHtml(j.location || j.address || "")}</div>

              <div class="job-stats">
                <span class="chip ok">Approved ${rc.approved}</span>
                <span class="chip warn">Pending ${rc.pending}</span>
              </div>

              <div class="progress" aria-label="Progress">
                <span style="width:${progW}%;"></span>
              </div>

              <div class="muted" style="margin-top:10px; font-size:12px;">
                Evidence progress: <strong>${progW}%</strong>
              </div>
            </a>
          `;
        }).join("")}
      </div>
    ` : `<div class="card"><div class="card-title">No jobs</div><div class="card-sub">Try another tab.</div></div>`;

    const completedList = jobsCompleted.length ? `
      <div class="vstack">
        ${jobsCompleted.slice(0,3).map(j => `
          <div class="card">
            <div class="split">
              <div>
                <div class="card-title">${escapeHtml(j.name)}</div>
                <div class="card-sub">${escapeHtml(j.location || "")}</div>
              </div>
              <span class="pill ok">Completed</span>
            </div>
          </div>
        `).join("")}
      </div>
    ` : `<div class="card"><div class="card-title">No completed projects</div><div class="card-sub">Completed jobs will appear here.</div></div>`;

    const companyWidget = `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Company Details</div>
            <div class="card-sub">Quick view (edit in Company page)</div>
          </div>
          <a class="btn" href="#/company">Edit</a>
        </div>

        <div class="grid cols-2">
          <div class="card" style="box-shadow:none;">
            <div class="muted">Company</div>
            <div style="font-weight:800; margin-top:6px;">${escapeHtml(db.company.companyName)}</div>
            <div class="muted" style="margin-top:6px;">VAT: ${escapeHtml(db.company.vatNumber)}</div>
          </div>
          <div class="card" style="box-shadow:none;">
            <div class="muted">Contact</div>
            <div style="font-weight:800; margin-top:6px;">${escapeHtml(db.company.phoneNumber)}</div>
            <div class="muted" style="margin-top:6px;">${escapeHtml(db.company.companyAddress)}</div>
          </div>
        </div>
      </div>
    `;

    return `
      <div class="vstack">
        ${testBanner}

        <div class="split">
          <div>
            <div class="page-title">Dashboard</div>
            <div class="muted">Quick overview of jobs, invoices, approvals and company details.</div>
          </div>
          ${actions}
        </div>

        <div class="card">
          <div class="split">
            <div class="section-title">Your Jobs</div>
            ${tabs}
          </div>
          <div class="sep"></div>
          ${jobCards}
        </div>

        <div class="grid cols-2">
          <div class="card">
            <div class="card-header">
              <div>
                <div class="card-title">Completed Projects</div>
                <div class="card-sub">Drag zone is visual only (demo).</div>
              </div>
            </div>

            <div class="grid cols-2">
              <div>${completedList}</div>
              <div class="dropzone" aria-label="Completed projects dropzone">Drag jobs here…</div>
            </div>
          </div>

          ${companyWidget}
        </div>
      </div>
    `;
  }

  function renderJobs(query) {
    const tab = (query.tab || "open").toLowerCase(); // open | archived | completed
    const canCreate = perms().canCreateJob;
    const canExport = perms().canExport;

    const open = db.jobs.filter(j => !j.archived && j.status !== "completed");
    const archived = db.jobs.filter(j => j.archived);
    const completed = db.jobs.filter(j => !j.archived && j.status === "completed");
    const list = tab === "archived" ? archived : (tab === "completed" ? completed : open);

    const tabs = `
      <div class="tabs" role="tablist" aria-label="Jobs tabs">
        <a class="tab ${tab==="open"?"active":""}" role="tab" href="#/jobs?tab=open">Open</a>
        <a class="tab ${tab==="completed"?"active":""}" role="tab" href="#/jobs?tab=completed">Completed</a>
        <a class="tab ${tab==="archived"?"active":""}" role="tab" href="#/jobs?tab=archived">Archived</a>
      </div>
    `;

    const actions = `
      <div class="hstack">
        ${canCreate ? `<button class="btn primary" data-action="create-job">+ New Job</button>` : ``}
        ${canExport ? `<button class="btn" data-action="export-db">Export JSON</button>` : ``}
        ${perms().canImport ? `<button class="btn" data-action="import-db">Import JSON</button>` : ``}
      </div>
    `;

    const cards = list.length ? `
      <div class="grid cols-2">
        ${list.map(j => {
          const rc = releaseCountsForJob(j);
          const prog = milestoneProgress(j);
          return `
            <a class="card" href="#/jobs/${escapeHtml(j.id)}?tab=invoices" style="display:block; text-decoration:none;">
              <div class="split">
                <div>
                  <div class="card-title">${escapeHtml(j.name)}</div>
                  <div class="card-sub">${escapeHtml(j.location || j.address || "")}</div>
                </div>
                <span class="pill ${j.status==="completed"?"ok":(j.archived?"warn":"info")}">${escapeHtml(j.archived?"Archived":j.status)}</span>
              </div>
              <div class="sep"></div>
              <div class="hstack">
                <span class="pill ok">Approved ${rc.approved}</span>
                <span class="pill warn">Pending ${rc.pending}</span>
                <span class="pill info">${approvedInvoicesCount(j)} Approved invoices</span>
              </div>
              <div class="progress" aria-label="Evidence progress">
                <span style="width:${clamp(prog,0,100)}%;"></span>
              </div>
              <div class="muted" style="margin-top:10px;">Updated ${escapeHtml(formatDate(j.updatedAt))}</div>
            </a>
          `;
        }).join("")}
      </div>
    ` : `<div class="card"><div class="card-title">No jobs</div><div class="card-sub">Nothing to show in this tab.</div></div>`;

    return `
      <div class="vstack">
        <div class="split">
          <div>
            <div class="page-title">Jobs</div>
            <div class="muted">Open a job to view invoices, payment plan, milestones and releases.</div>
          </div>
          ${actions}
        </div>

        <div class="card">
          <div class="split">
            <div class="section-title">Your Jobs</div>
            ${tabs}
          </div>
          <div class="sep"></div>
          ${cards}
        </div>
      </div>
    `;
  }

  function renderJobDetail(jobId, query) {
    const job = getJob(jobId);
    if (!job) return renderNotFound();

    const tab = (query.tab || "invoices").toLowerCase(); // invoices | payment | milestones | releases | disputes
    const canExport = perms().canExport;

    const header = `
      <div class="muted" style="margin-bottom:10px;">
        <a href="#/jobs">Your Jobs</a> <span aria-hidden="true">›</span> ${escapeHtml(job.name)}
      </div>

      <div class="split">
        <div>
          <div class="page-title">${escapeHtml(job.name)}</div>
          <div class="muted">${escapeHtml(job.location || job.address || "")}</div>
        </div>

        <div class="hstack">
          <button class="btn" data-action="open-savings" data-job-id="${escapeHtml(job.id)}">Savings</button>
          <button class="btn" data-action="edit-job" data-job-id="${escapeHtml(job.id)}">Edit</button>
          <button class="btn" data-action="${job.archived ? "unarchive-job" : "archive-job"}" data-job-id="${escapeHtml(job.id)}">${job.archived ? "Unarchive" : "Archive"}</button>
          ${canExport ? `<button class="btn" data-action="export-job" data-job-id="${escapeHtml(job.id)}">Export</button>` : ``}
        </div>
      </div>
    `;

    const tabs = `
      <div class="tabs" role="tablist" aria-label="Job tabs" style="margin-top:14px;">
        <a class="tab ${tab==="invoices"?"active":""}" role="tab" href="#/jobs/${escapeHtml(job.id)}?tab=invoices">Invoices</a>
        <a class="tab ${tab==="payment"?"active":""}" role="tab" href="#/jobs/${escapeHtml(job.id)}?tab=payment">Payment Plan</a>
        <a class="tab ${tab==="milestones"?"active":""}" role="tab" href="#/jobs/${escapeHtml(job.id)}?tab=milestones">Milestones</a>
        <a class="tab ${tab==="releases"?"active":""}" role="tab" href="#/jobs/${escapeHtml(job.id)}?tab=releases">Releases</a>
        <a class="tab ${tab==="disputes"?"active":""}" role="tab" href="#/jobs/${escapeHtml(job.id)}?tab=disputes">Disputes</a>
      </div>
    `;

    const invs = jobInvoices(job).slice().sort((a,b) => (a.createdAt > b.createdAt ? 1 : -1));

    let body = "";
    if (tab === "invoices") {
      const approvedCount = invs.filter(i => i.status === "approved").length;

      const grid = invs.length ? `
        <div class="invoice-grid" aria-label="Invoice tiles">
          ${invs.map((inv, idx) => {
            const st = (inv.status || "draft");
            const cls = st === "approved" ? "approved" : (st === "ready" ? "ready" : "draft");
            return `
              <a class="inv-tile ${cls}" href="#/invoices/${escapeHtml(inv.id)}" aria-label="Open invoice ${escapeHtml(inv.number)}">
                <div class="inv-num">${idx + 1}</div>
                <div class="inv-sub">Fill out invoice</div>
              </a>
            `;
          }).join("")}
        </div>
      ` : `<div class="card"><div class="card-title">No invoices yet</div><div class="card-sub">Add your first invoice for this job.</div></div>`;

      body = `
        <div class="card">
          <div class="split">
            <div class="section-title">Invoices</div>
            <span class="pill ok">${approvedCount} Approved</span>
          </div>
          <div class="sep"></div>
          ${grid}
          <div class="inv-cta-wrap">
            <button class="btn primary" data-action="add-invoice" data-job-id="${escapeHtml(job.id)}">+ Add Invoice</button>
          </div>
        </div>
      `;
    } else if (tab === "payment") {
      // simplest: choose latest invoice (or first)
      const selectedId = query.invoice || (invs[invs.length-1]?.id || (invs[0]?.id || ""));
      const selectedInv = selectedId ? getInvoice(selectedId) : null;

      const selector = `
        <div class="field" style="max-width:420px;">
          <label for="ppInvoiceSelect">Invoice</label>
          <select id="ppInvoiceSelect" data-action="pp-select" data-job-id="${escapeHtml(job.id)}">
            ${invs.map(i => `<option value="${escapeHtml(i.id)}"${i.id===selectedId?" selected":""}>${escapeHtml(i.number)} (${escapeHtml(i.status)})</option>`).join("")}
          </select>
        </div>
      `;

      if (!selectedInv) {
        body = `
          <div class="card">
            <div class="card-title">Payment Plan</div>
            <div class="card-sub">Add an invoice to see the payment plan breakdown.</div>
            <div class="sep"></div>
            <button class="btn primary" data-action="add-invoice" data-job-id="${escapeHtml(job.id)}">+ Add Invoice</button>
          </div>
        `;
      } else {
        const t = invoiceTotals(selectedInv);

        body = `
          <div class="card">
            <div class="card-header">
              <div>
                <div class="card-title">Payment Plan</div>
                <div class="card-sub">Based on ${escapeHtml(selectedInv.number)} (demo). Includes Main Contractor money.</div>
              </div>
              ${selector}
            </div>

            <div class="grid cols-2">
              <div class="card" style="box-shadow:none;">
                <div class="muted">Client payment before VAT</div>
                <div style="font-size:24px;font-weight:900;margin-top:6px;">${escapeHtml(formatGBP(t.clientPaymentBeforeVat))}</div>
                <div class="sep"></div>

                <div class="split"><div class="muted">Trades total</div><div><strong>${escapeHtml(formatGBP(t.totalToTrades))}</strong></div></div>
                <div class="split"><div class="muted">Suppliers total</div><div><strong>${escapeHtml(formatGBP(t.totalToSuppliers))}</strong></div></div>
                <div class="split"><div class="muted">Main contractor</div><div><strong>${escapeHtml(formatGBP(t.mainContractorAmount))}</strong></div></div>

                <div class="sep"></div>
                <div class="split"><div class="muted">Management fee pot</div><div><strong>${escapeHtml(formatGBP(t.feePot))}</strong></div></div>
                <div class="split"><div class="muted">VAT on fee pot</div><div><strong>${escapeHtml(formatGBP(t.vatOnFee))}</strong></div></div>
              </div>

              <div class="card" style="box-shadow:none;">
                <div class="muted">Grand total (client pays)</div>
                <div style="font-size:28px;font-weight:900;letter-spacing:-0.02em;margin-top:6px;">${escapeHtml(formatGBP(t.grandTotal))}</div>

                <div class="sep"></div>
                <div class="banner" style="border:1px solid rgba(240,207,99,.55); background: rgba(240,207,99,.14); border-radius:14px; padding:12px;">
                  <div style="font-weight:800;">VAT disclaimer</div>
                  <div class="muted" style="margin-top:6px;">${escapeHtml(VAT_DISCLAIMER)}</div>
                </div>

                <div class="sep"></div>
                <div class="muted">
                  Illustrative difference (example only): <strong>${escapeHtml(formatGBP(t.illustrativeDiff))}</strong>
                </div>
              </div>
            </div>

            <div class="sep"></div>
            <div class="hstack">
              <a class="btn" href="#/invoices/${escapeHtml(selectedInv.id)}">Open invoice</a>
              <a class="btn ghost" href="#/payments?job=${encodeURIComponent(job.id)}">Open payments</a>
            </div>
          </div>
        `;
      }
    } else if (tab === "milestones") {
      const ms = jobMilestones(job);
      body = `
        <div class="card">
          <div class="card-title">Milestones</div>
          <div class="card-sub">Evidence progress is used in dashboard progress and release blockers.</div>
          <div class="sep"></div>

          <table class="table">
            <thead><tr><th>Milestone</th><th>Target</th><th>Evidence</th><th></th></tr></thead>
            <tbody>
              ${ms.map(m => `
                <tr>
                  <td><strong>${escapeHtml(m.title)}</strong><div class="muted">Required: ${m.evidenceRequired ? "Yes" : "No"}</div></td>
                  <td>${escapeHtml(formatDate(m.targetDate))}</td>
                  <td><span class="pill ${!m.evidenceRequired ? "info" : (m.evidenceProvided ? "ok" : "warn")}">
                    ${!m.evidenceRequired ? "Not required" : (m.evidenceProvided ? "Provided" : "Missing")}
                  </span></td>
                  <td>${m.evidenceRequired ? `<button class="btn" data-action="toggle-evidence" data-ms-id="${escapeHtml(m.id)}">${m.evidenceProvided ? "Mark missing" : "Mark provided"}</button>` : `<span class="muted">—</span>`}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
    } else if (tab === "releases") {
      const rels = jobReleases(job);
      body = rels.length ? `
        <div class="card">
          <div class="card-title">Releases</div>
          <div class="card-sub">Open Payments to manage approvals and sending.</div>
          <div class="sep"></div>
          <table class="table">
            <thead><tr><th>Release</th><th>Status</th><th>Approvals</th><th></th></tr></thead>
            <tbody>
              ${rels.map(r => {
                const a = r.approvals || { manager:false, client:false };
                const pill = r.status === "Released" ? "ok" : (["Submitted","Manager approved"].includes(r.status) ? "warn" : "info");
                return `
                  <tr>
                    <td><strong>${escapeHtml(r.title)}</strong><div class="muted">${escapeHtml(getMilestone(r.milestoneId)?.title || "—")}</div></td>
                    <td><span class="pill ${pill}">${escapeHtml(r.status)}</span></td>
                    <td class="muted">Mgr: ${a.manager ? "✓" : "—"} • Client: ${a.client ? "✓" : "—"}</td>
                    <td><a class="btn primary" href="#/payments?job=${encodeURIComponent(job.id)}">Open Payments</a></td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      ` : `<div class="card"><div class="card-title">No releases</div><div class="card-sub">Create releases in Payments.</div></div>`;
    } else if (tab === "disputes") {
      const ds = jobDisputes(job);
      body = ds.length ? `
        <div class="vstack">
          ${ds.map(d => `
            <div class="card">
              <div class="split">
                <div>
                  <div class="card-title">${escapeHtml(d.title)}</div>
                  <div class="card-sub">
                    <span class="pill ${d.status==="closed"?"ok":"warn"}">${escapeHtml(d.status)}</span>
                    <span class="pill ${d.pauseRelease?"bad":"ok"}">pauseRelease ${d.pauseRelease ? "ON" : "OFF"}</span>
                  </div>
                </div>
                <a class="btn primary" href="#/disputes?job=${encodeURIComponent(job.id)}">Open Disputes</a>
              </div>
            </div>
          `).join("")}
        </div>
      ` : `<div class="card"><div class="card-title">No disputes</div><div class="card-sub">Disputes can pause releases as a blocker.</div></div>`;
    }

    return `
      <div class="vstack">
        ${header}
        ${tabs}
        <div class="sep"></div>
        ${body}
      </div>
    `;
  }

  /* CONTINUES IN PART 6 */
// PART 5 END

 // PART 6 START
  function renderInvoiceDetail(invoiceId) {
    const inv = getInvoice(invoiceId);
    if (!inv) return renderNotFound();
    const job = getJob(inv.jobId);
    const t = invoiceTotals(inv);

    const canEdit = perms().canEditInvoice;

    const statusPill = inv.status === "approved" ? "ok" : (inv.status === "ready" ? "info" : "warn");

    const lineRows = (inv.lineItems || []).map(li => {
      const p = getPayee(li.payeeId);
      return `
        <tr>
          <td>
            <div><strong>${escapeHtml(li.description)}</strong></div>
            <div class="muted">${escapeHtml(p ? p.name : li.payeeId)} • ${escapeHtml(li.category)}</div>
          </td>
          <td><strong>${escapeHtml(formatGBP(li.amount))}</strong></td>
          <td style="text-align:right;">
            ${canEdit ? `<button class="btn danger" data-action="remove-line-item" data-invoice-id="${escapeHtml(inv.id)}" data-li-id="${escapeHtml(li.id)}">Remove</button>` : `<span class="muted">—</span>`}
          </td>
        </tr>
      `;
    }).join("");

    const editBlock = canEdit ? `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Invoice inputs</div>
            <div class="card-sub">Edit values, then Save.</div>
          </div>
          <span class="pill ${statusPill}">${escapeHtml(inv.status)}</span>
        </div>

        <div class="grid cols-3">
          <div class="field">
            <label for="invBeforeVat">Client payment before VAT</label>
            <input id="invBeforeVat" type="number" inputmode="decimal" step="0.01" value="${escapeHtml(String(t.clientPaymentBeforeVat))}" />
          </div>

          <div class="field">
            <label for="invVatRate">VAT rate on fee pot (%)</label>
            <input id="invVatRate" type="number" inputmode="numeric" step="1" value="${escapeHtml(String(t.vatRate))}" />
          </div>

          <div class="field">
            <label for="invMainContractor">Main contractor amount</label>
            <input id="invMainContractor" type="number" inputmode="decimal" step="0.01" value="${escapeHtml(String(t.mainContractorAmount))}" />
          </div>
        </div>

        <div class="grid cols-2" style="margin-top:14px;">
          <div class="field">
            <label for="invStatus">Invoice status</label>
            <select id="invStatus">
              <option value="draft"${inv.status==="draft"?" selected":""}>draft</option>
              <option value="ready"${inv.status==="ready"?" selected":""}>ready</option>
              <option value="approved"${inv.status==="approved"?" selected":""}>approved</option>
            </select>
          </div>

          <div class="hstack" style="align-self:end; justify-content:flex-end;">
            <button class="btn" data-action="revert-invoice" data-invoice-id="${escapeHtml(inv.id)}">Cancel</button>
            <button class="btn primary" data-action="save-invoice" data-invoice-id="${escapeHtml(inv.id)}">Save</button>
          </div>
        </div>
      </div>
    ` : `
      <div class="card">
        <div class="split">
          <div>
            <div class="card-title">Invoice</div>
            <div class="card-sub">Viewing as <strong>${escapeHtml(ROLE_LABEL[ui.role] || ui.role)}</strong> (editing disabled).</div>
          </div>
          <span class="pill ${statusPill}">${escapeHtml(inv.status)}</span>
        </div>
      </div>
    `;

    const summary = `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Payment Plan summary</div>
            <div class="card-sub">Trades + suppliers + main contractor + fee pot VAT</div>
          </div>
          <a class="btn" href="#/jobs/${escapeHtml(inv.jobId)}?tab=payment&invoice=${encodeURIComponent(inv.id)}">Open Payment Plan</a>
        </div>

        <div class="grid cols-3">
          <div class="card" style="box-shadow:none;">
            <div class="muted">Trades total</div>
            <div style="font-size:18px;font-weight:900;margin-top:6px;">${escapeHtml(formatGBP(t.totalToTrades))}</div>
          </div>
          <div class="card" style="box-shadow:none;">
            <div class="muted">Suppliers total</div>
            <div style="font-size:18px;font-weight:900;margin-top:6px;">${escapeHtml(formatGBP(t.totalToSuppliers))}</div>
          </div>
          <div class="card" style="box-shadow:none;">
            <div class="muted">Main contractor</div>
            <div style="font-size:18px;font-weight:900;margin-top:6px;">${escapeHtml(formatGBP(t.mainContractorAmount))}</div>
          </div>
        </div>

        <div class="sep"></div>

        <div class="grid cols-3">
          <div class="card" style="box-shadow:none;">
            <div class="muted">Fee pot</div>
            <div style="font-size:18px;font-weight:900;margin-top:6px;">${escapeHtml(formatGBP(t.feePot))}</div>
          </div>
          <div class="card" style="box-shadow:none;">
            <div class="muted">VAT on fee pot</div>
            <div style="font-size:18px;font-weight:900;margin-top:6px;">${escapeHtml(formatGBP(t.vatOnFee))}</div>
          </div>
          <div class="card" style="box-shadow:none;">
            <div class="muted">Grand total</div>
            <div style="font-size:20px;font-weight:900;margin-top:6px;">${escapeHtml(formatGBP(t.grandTotal))}</div>
          </div>
        </div>

        <div class="sep"></div>

        <div class="card" style="box-shadow:none; border-color: rgba(240,207,99,.55); background: rgba(240,207,99,.14);">
          <div style="font-weight:800;">VAT disclaimer</div>
          <div class="muted" style="margin-top:6px;">${escapeHtml(VAT_DISCLAIMER)}</div>
        </div>

        <div class="muted" style="margin-top:10px;">
          Illustrative difference (example only): <strong>${escapeHtml(formatGBP(t.illustrativeDiff))}</strong>
        </div>
      </div>
    `;

    const tools = `
      <div class="hstack">
        <button class="btn" data-action="download-pdf" data-invoice-id="${escapeHtml(inv.id)}">Download PDF</button>
        <button class="btn" data-action="print-invoice" data-invoice-id="${escapeHtml(inv.id)}">Print</button>
        <button class="btn primary" data-action="share-invoice" data-invoice-id="${escapeHtml(inv.id)}">Share</button>
        <a class="btn ghost" href="#/jobs/${escapeHtml(inv.jobId)}?tab=invoices">Back</a>
      </div>
    `;

    return `
      <div class="vstack" id="invoiceView" data-invoice-id="${escapeHtml(inv.id)}">
        <div class="muted">
          <a href="#/jobs">Your Jobs</a> <span aria-hidden="true">›</span>
          <a href="#/jobs/${escapeHtml(inv.jobId)}?tab=invoices">${escapeHtml(job ? job.name : inv.jobId)}</a>
          <span aria-hidden="true">›</span> ${escapeHtml(inv.number)}
        </div>

        <div class="split">
          <div>
            <div class="page-title">${escapeHtml(inv.number)}</div>
            <div class="muted">${escapeHtml(job ? job.name : inv.jobId)} • Updated ${escapeHtml(formatDate(inv.updatedAt))}</div>
          </div>
          ${tools}
        </div>

        ${editBlock}

        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Line items (trades + suppliers)</div>
              <div class="card-sub">These contribute to Trades/Suppliers totals.</div>
            </div>
            ${canEdit ? `<button class="btn primary" data-action="add-line-item" data-invoice-id="${escapeHtml(inv.id)}">+ Add line</button>` : ``}
          </div>

          <table class="table">
            <thead><tr><th>Description</th><th>Amount</th><th></th></tr></thead>
            <tbody>
              ${lineRows || `<tr><td class="muted">No line items</td><td class="muted">—</td><td class="muted">—</td></tr>`}
            </tbody>
          </table>
        </div>

        ${summary}
      </div>
    `;
  }

  function renderPayments(query) {
    const jobId = query.job || "";
    const filterJob = jobId ? getJob(jobId) : null;

    const can = perms();
    const list = filterJob ? jobReleases(filterJob) : db.releases.slice().sort((a,b)=> (a.updatedAt>b.updatedAt?-1:1));

    const testBanner = db.meta.testMode ? `
      <div class="card" style="border-color: rgba(240,207,99,.55); background: rgba(240,207,99,.14);">
        <div class="split">
          <div>
            <div class="card-title">TEST MODE is ON</div>
            <div class="card-sub">Sending is simulated. No funds move.</div>
          </div>
          <span class="pill warn">TEST MODE</span>
        </div>
      </div>
    ` : "";

    const filter = `
      <div class="field" style="max-width:420px;">
        <label for="payJobFilter">Filter by job</label>
        <select id="payJobFilter" data-action="payments-filter">
          <option value="">All jobs</option>
          ${db.jobs.map(j => `<option value="${escapeHtml(j.id)}"${j.id===jobId?" selected":""}>${escapeHtml(j.name)}</option>`).join("")}
        </select>
      </div>
    `;

    const rows = list.length ? `
      <table class="table">
        <thead><tr><th>Release</th><th>Status</th><th>Approvals</th><th>Amount</th><th>Actions</th></tr></thead>
        <tbody>
          ${list.map(r => {
            const job = getJob(r.jobId);
            const amount = (r.payeeSplits || []).reduce((s,x)=> s+Number(x.amount||0),0);
            const a = r.approvals || { manager:false, client:false };

            const actions = [];
            if (r.status === "Draft") actions.push(`<button class="btn primary" data-action="submit-release" data-release-id="${escapeHtml(r.id)}">Submit</button>`);
            if (r.status === "Submitted" && can.canApproveManager) actions.push(`<button class="btn primary" data-action="approve-release-manager" data-release-id="${escapeHtml(r.id)}">Mgr approve</button>`);
            if (r.status === "Manager approved" && can.canApproveClient) actions.push(`<button class="btn primary" data-action="approve-release-client" data-release-id="${escapeHtml(r.id)}">Client approve</button>`);
            if (r.status === "Client approved" && can.canSendToPartner) actions.push(`<button class="btn primary" data-action="send-to-partner" data-release-id="${escapeHtml(r.id)}">Send to partner</button>`);
            if (r.status === "Sent to partner" && can.canMarkReleased) actions.push(`<button class="btn primary" data-action="mark-released" data-release-id="${escapeHtml(r.id)}">Mark released</button>`);
            actions.push(`<button class="btn" data-action="view-release" data-release-id="${escapeHtml(r.id)}">View</button>`);

            const pill = r.status === "Released" ? "ok" : (["Submitted","Manager approved"].includes(r.status) ? "warn" : "info");

            return `
              <tr>
                <td><strong>${escapeHtml(r.title)}</strong><div class="muted">${escapeHtml(job ? job.name : r.jobId)}</div></td>
                <td><span class="pill ${pill}">${escapeHtml(r.status)}</span></td>
                <td class="muted">Mgr: ${a.manager?"✓":"—"} • Client: ${a.client?"✓":"—"}</td>
                <td><strong>${escapeHtml(formatGBP(amount))}</strong></td>
                <td><div class="hstack">${actions.join("")}</div></td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    ` : `<div class="card"><div class="card-title">No releases</div><div class="card-sub">Create a release request for a job.</div></div>`;

    return `
      <div class="vstack">
        ${testBanner}

        <div class="split">
          <div>
            <div class="page-title">Payments</div>
            <div class="muted">Draft → Submitted → Manager approved → Client approved → Sent to partner → Released</div>
          </div>
          <button class="btn primary" data-action="create-release"${filterJob ? ` data-job-id="${escapeHtml(filterJob.id)}"` : ""}>Create release request</button>
        </div>

        <div class="card" style="border-color: rgba(77,131,255,.22); background: rgba(77,131,255,.06);">
          <div><strong>Funds statement:</strong> ${escapeHtml(FUNDS_STATEMENT)}</div>
        </div>

        ${filter}
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
                    <div class="card-title">Confirm bank details</div>
                    <div class="card-sub">${escapeHtml(payee ? payee.name : it.id)}</div>
                  </div>
                  <div class="hstack">
                    <button class="btn primary" data-action="confirm-bank" data-payee-id="${escapeHtml(it.id)}">Confirm</button>
                    <a class="btn" href="#/company?payee=${encodeURIComponent(it.id)}">View</a>
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
                  <div class="card-sub">${escapeHtml(job ? job.name : "—")} • ${escapeHtml(it.type)}</div>
                </div>
                <div class="hstack">
                  ${it.type === "release_mgr" ? `<button class="btn primary" data-action="approve-release-manager" data-release-id="${escapeHtml(it.id)}">Approve</button>` : ``}
                  ${it.type === "release_client" ? `<button class="btn primary" data-action="approve-release-client" data-release-id="${escapeHtml(it.id)}">Approve</button>` : ``}
                  ${it.type === "release_ready" ? `<button class="btn primary" data-action="send-to-partner" data-release-id="${escapeHtml(it.id)}">Send</button>` : ``}
                  ${rel ? `<a class="btn" href="#/payments?job=${encodeURIComponent(rel.jobId)}">Payments</a>` : ``}
                </div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    ` : `<div class="card"><div class="card-title">All caught up</div><div class="card-sub">No approvals required for this role.</div></div>`;

    return `
      <div class="vstack">
        <div class="split">
          <div>
            <div class="page-title">Approvals</div>
            <div class="muted">Your inbox for releases, bank confirms, and send-ready items.</div>
          </div>
          <span class="pill info">Role: ${escapeHtml(ROLE_LABEL[ui.role] || ui.role)}</span>
        </div>
        ${rows}
      </div>
    `;
  }

  /* CONTINUES IN PART 7 */
// PART 6 END

 // PART 7 START
  function renderDisputes(query) {
    const jobId = query.job || "";
    const job = jobId ? getJob(jobId) : null;
    const list = job ? jobDisputes(job) : db.disputes.slice();

    const filter = `
      <div class="field" style="max-width:420px;">
        <label for="disJobFilter">Filter by job</label>
        <select id="disJobFilter" data-action="disputes-filter">
          <option value="">All jobs</option>
          ${db.jobs.map(j => `<option value="${escapeHtml(j.id)}"${j.id===jobId?" selected":""}>${escapeHtml(j.name)}</option>`).join("")}
        </select>
      </div>
    `;

    return `
      <div class="vstack">
        <div class="split">
          <div>
            <div class="page-title">Disputes</div>
            <div class="muted">If pauseRelease is ON, “Send to partner” is blocked.</div>
          </div>
          <button class="btn primary" data-action="create-dispute"${job ? ` data-job-id="${escapeHtml(job.id)}"` : ""}>Create dispute</button>
        </div>
        ${filter}

        <div class="vstack">
          ${(list.length ? list : []).map(d => {
            const j = getJob(d.jobId);
            return `
              <div class="card">
                <div class="split">
                  <div>
                    <div class="card-title">${escapeHtml(d.title)}</div>
                    <div class="card-sub">${escapeHtml(j ? j.name : d.jobId)}</div>
                    <div class="hstack" style="margin-top:10px;">
                      <span class="pill ${d.status==="closed"?"ok":"warn"}">${escapeHtml(d.status)}</span>
                      <span class="pill ${d.pauseRelease?"bad":"ok"}">pauseRelease ${d.pauseRelease?"ON":"OFF"}</span>
                    </div>
                  </div>
                  <div class="hstack">
                    <button class="btn" data-action="toggle-pause" data-dispute-id="${escapeHtml(d.id)}">${d.pauseRelease?"Unpause":"Pause"} releases</button>
                    <button class="btn" data-action="toggle-dispute" data-dispute-id="${escapeHtml(d.id)}">${d.status==="closed"?"Reopen":"Close"}</button>
                    <button class="btn primary" data-action="view-dispute" data-dispute-id="${escapeHtml(d.id)}">View</button>
                  </div>
                </div>
              </div>
            `;
          }).join("") || `<div class="card"><div class="card-title">No disputes</div><div class="card-sub">Create one to test blockers.</div></div>`}
        </div>
      </div>
    `;
  }

  function renderMessages(query) {
    const jobId = query.job || "";
    const job = jobId ? getJob(jobId) : null;

    const picker = `
      <div class="field" style="max-width:420px;">
        <label for="msgJobPick">Job</label>
        <select id="msgJobPick" data-action="messages-filter">
          <option value="">Select a job…</option>
          ${db.jobs.map(j => `<option value="${escapeHtml(j.id)}"${j.id===jobId?" selected":""}>${escapeHtml(j.name)}</option>`).join("")}
        </select>
      </div>
    `;

    if (!job) {
      return `
        <div class="vstack">
          <div class="split">
            <div>
              <div class="page-title">Messages</div>
              <div class="muted">Select a job thread.</div>
            </div>
            ${picker}
          </div>
          <div class="card"><div class="card-title">Pick a job</div><div class="card-sub">Threads and invoice snapshots appear here.</div></div>
        </div>
      `;
    }

    const msgs = jobThreadMessages(job);
    const thread = `
      <div class="vstack">
        ${msgs.map(m => {
          const atts = (m.attachments || []).map(a => {
            if (a.type === "invoice_snapshot") {
              return `
                <div class="card" style="border-color: rgba(77,131,255,.22); background: rgba(77,131,255,.06);">
                  <div class="split">
                    <div>
                      <div style="font-weight:800;">Invoice snapshot</div>
                      <div class="muted">${escapeHtml(a.name || a.snapshotId)}</div>
                    </div>
                    <button class="btn primary" data-action="regen-pdf" data-snapshot-id="${escapeHtml(a.snapshotId)}">Regenerate PDF</button>
                  </div>
                </div>
              `;
            }
            return `<div class="card"><div class="muted">Attachment:</div><div>${escapeHtml(a.name || "File")}</div></div>`;
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
              ${atts ? `<div class="sep"></div>${atts}` : ``}
            </div>
          `;
        }).join("")}
      </div>
    `;

    const composer = `
      <div class="card">
        <div class="card-title">Post a message</div>
        <div class="card-sub">Stored in localStorage (demo).</div>
        <div class="sep"></div>
        <div class="field">
          <label for="msgText">Message</label>
          <textarea id="msgText" rows="3" placeholder="Write an update…"></textarea>
        </div>
        <div class="hstack">
          <button class="btn primary" data-action="post-message" data-job-id="${escapeHtml(job.id)}">Post</button>
          <a class="btn" href="#/jobs/${escapeHtml(job.id)}?tab=invoices">Back to job</a>
        </div>
      </div>
    `;

    return `
      <div class="vstack">
        <div class="split">
          <div>
            <div class="page-title">Messages</div>
            <div class="muted">${escapeHtml(job.name)}</div>
          </div>
          ${picker}
        </div>
        ${composer}
        ${thread}
      </div>
    `;
  }

  function renderCompany(query) {
    const payeeFocus = query.payee || "";

    const companyForm = `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Company Details</div>
            <div class="card-sub">Edit and save (demo). Cancel reverts to saved values.</div>
          </div>
          <div class="hstack">
            <button class="btn" data-action="company-cancel">Cancel</button>
            <button class="btn primary" data-action="company-save">Save Changes</button>
          </div>
        </div>

        <div class="grid cols-2">
          <div class="vstack">
            <div class="field"><label for="coName">Company Name</label><input id="coName" value="${escapeHtml(db.company.companyName)}"></div>
            <div class="field"><label for="coVat">VAT Number</label><input id="coVat" value="${escapeHtml(db.company.vatNumber)}"></div>
            <div class="field"><label for="coReg">Company Reg Number</label><input id="coReg" value="${escapeHtml(db.company.companyRegNumber)}"></div>
            <div class="field"><label for="coUtr">UTR Number</label><input id="coUtr" value="${escapeHtml(db.company.utrNumber)}"></div>
            <div class="field"><label for="coNi">National Ins. Number</label><input id="coNi" value="${escapeHtml(db.company.nationalInsuranceNumber)}"></div>
          </div>

          <div class="vstack">
            <div class="field"><label for="coAddr">Company Address</label><textarea id="coAddr" rows="3">${escapeHtml(db.company.companyAddress)}</textarea></div>
            <div class="field"><label for="coBill">Billing Address</label><textarea id="coBill" rows="3">${escapeHtml(db.company.billingAddress)}</textarea></div>
            <div class="field"><label for="coPhone">Phone Number</label><input id="coPhone" value="${escapeHtml(db.company.phoneNumber)}"></div>
          </div>
        </div>
      </div>
    `;

    const payees = `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Payees</div>
            <div class="card-sub">Edit bank details; Manager/Admin can confirm if changed.</div>
          </div>
        </div>

        <table class="table">
          <thead><tr><th>Payee</th><th>Bank</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${db.payees.map(p => {
              const needs = p.bankChanged && !p.bankConfirmed;
              const status = needs ? "warn" : (p.bankConfirmed ? "ok" : "info");
              const highlight = (payeeFocus && payeeFocus === p.id) ? ` style="outline:2px solid rgba(77,131,255,.30); outline-offset:2px;"` : "";
              return `
                <tr${highlight}>
                  <td><strong>${escapeHtml(p.name)}</strong><div class="muted">${escapeHtml(p.type)} • ${escapeHtml(p.id)}</div></td>
                  <td class="muted">${escapeHtml(p.bank.bankName)} • ${escapeHtml(p.bank.sortCode)} • ${escapeHtml(p.bank.accountNumber)}</td>
                  <td><span class="pill ${status}">${needs ? "Needs confirm" : (p.bankConfirmed ? "Confirmed" : "Unconfirmed")}</span></td>
                  <td>
                    <div class="hstack">
                      ${perms().canEditBank ? `<button class="btn" data-action="edit-bank" data-payee-id="${escapeHtml(p.id)}">Edit bank</button>` : ``}
                      ${(perms().canConfirmBank && needs) ? `<button class="btn primary" data-action="confirm-bank" data-payee-id="${escapeHtml(p.id)}">Confirm</button>` : ``}
                    </div>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;

    return `<div class="vstack"><div class="page-title">Company</div>${companyForm}${payees}</div>`;
  }

  function renderReports() {
    if (!perms().canExport) {
      return `<div class="card"><div class="card-title">Reports</div><div class="card-sub">CSV export is not allowed for this role.</div></div>`;
    }
    const btn = (label, key) => `<button class="btn primary" data-action="export-csv" data-csv="${escapeHtml(key)}">${escapeHtml(label)}</button>`;
    return `
      <div class="vstack">
        <div class="split">
          <div>
            <div class="page-title">Reports</div>
            <div class="muted">Export CSV datasets (downloaded in-browser).</div>
          </div>
        </div>

        <div class="card">
          <div class="grid cols-3">
            ${btn("Jobs CSV","jobs")}
            ${btn("Invoices CSV","invoices")}
            ${btn("Milestones CSV","milestones")}
            ${btn("Releases CSV","releases")}
            ${btn("Disputes CSV","disputes")}
            ${btn("Messages CSV","messages")}
            ${btn("Payees CSV","payees")}
            ${btn("Audit Log CSV","auditLog")}
          </div>
        </div>
      </div>
    `;
  }

  function renderSettings() {
    const p = perms();
    const testMode = !!db.meta.testMode;

    const testModeBlock = `
      <div class="card">
        <div class="card-title">Test Mode</div>
        <div class="card-sub">Planned real-app feature. Only Admin can toggle.</div>
        <div class="sep"></div>
        <div class="split">
          <div class="muted">Status: <strong>${testMode ? "ON" : "OFF"}</strong></div>
          ${p.canToggleTestMode
            ? `<button class="btn primary" data-action="toggle-test-mode" data-on="${testMode ? "0" : "1"}">${testMode ? "Turn OFF" : "Turn ON"}</button>`
            : `<button class="btn" disabled aria-disabled="true">Admin only</button>`}
        </div>
      </div>
    `;

    return `
      <div class="vstack">
        <div class="page-title">Settings</div>

        <div class="grid cols-2">
          <div class="card">
            <div class="card-title">Appearance</div>
            <div class="card-sub">System / light / dark</div>
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
            <div class="card-sub">localStorage key: <code>approvehub_demo_db</code></div>
            <div class="sep"></div>
            <div class="hstack">
              ${p.canReset ? `<button class="btn danger" data-action="reset-demo">Reset demo</button>` : `<button class="btn danger" disabled aria-disabled="true">Reset (not allowed)</button>`}
              ${p.canExport ? `<button class="btn" data-action="export-db">Export JSON</button>` : `<button class="btn" disabled aria-disabled="true">Export (not allowed)</button>`}
              ${p.canImport ? `<button class="btn" data-action="import-db">Import JSON</button>` : `<button class="btn" disabled aria-disabled="true">Import (not allowed)</button>`}
            </div>
          </div>
        </div>

        ${testModeBlock}
      </div>
    `;
  }

  /* ---------------------------
     Import / reset / export
  --------------------------- */
  function resetDb(reason="Reset demo") {
    db = defaultDb();
    db.meta.lastResetReason = reason;
    normalizeDb();
    saveDb();
    toast("ok","Demo reset","Demo data has been reset.");
    log("reset_demo","db","root",null,{reason});
    routeTo("#/dashboard");
  }

  function importDb(parsed) {
    if (!parsed || typeof parsed !== "object") { toast("bad","Import failed","Invalid JSON object."); return; }
    if (parsed.schemaVersion !== SCHEMA_VERSION) { toast("bad","Schema mismatch","schemaVersion does not match this demo."); return; }
    db = parsed;
    normalizeDb();
    saveDb();
    closeModal();
    toast("ok","Imported","Demo JSON imported.");
    log("import_db","db","root",null,{});
    ui.route = parseRoute();
    render();
  }

  /* ---------------------------
     Savings modal
  --------------------------- */
  function openSavings(jobId=null) {
    const { total, byJob } = savingsTotalsAllJobs();
    const jobs = jobId ? [getJob(jobId)].filter(Boolean) : db.jobs.filter(j => j.status !== "completed");
    const rows = jobs.map(j => {
      const entries = (byJob[j.id] || []).map(e => {
        const inv = getInvoice(e.invoiceId);
        return `<div class="split"><div class="muted">${escapeHtml(inv ? inv.number : e.invoiceId)}</div><div><strong>${escapeHtml(formatGBP(e.diff))}</strong></div></div>`;
      }).join("") || `<div class="muted">No invoices</div>`;
      const jobTotal = (byJob[j.id] || []).reduce((s,x)=> s + Number(x.diff||0),0);
      return `
        <div class="card">
          <div class="split">
            <div><div class="card-title">${escapeHtml(j.name)}</div><div class="card-sub">${escapeHtml(j.location||"")}</div></div>
            <span class="pill info">${escapeHtml(formatGBP(jobTotal))}</span>
          </div>
          <div class="sep"></div>
          ${entries}
        </div>
      `;
    }).join("");

    openModal({
      title: "Savings (Illustrative)",
      ariaLabel: "Savings modal",
      bodyHtml: `
        <div class="card" style="border-color: rgba(240,207,99,.55); background: rgba(240,207,99,.14);">
          <div class="split">
            <div>
              <div class="card-title">Estimated VAT difference (illustrative only)</div>
              <div class="card-sub">Compares 20% VAT on full client payment vs VAT on fee pot only (illustration).</div>
            </div>
            <div style="font-size:22px;font-weight:900;">${escapeHtml(formatGBP(total))}</div>
          </div>
        </div>

        <div class="sep"></div>
        ${rows}

        <div class="sep"></div>
        <div class="card" style="border-color: rgba(240,207,99,.55); background: rgba(240,207,99,.14);">
          <div style="font-weight:800;">VAT disclaimer</div>
          <div class="muted" style="margin-top:6px;">${escapeHtml(VAT_DISCLAIMER)}</div>
        </div>
      `,
      footerHtml: `<button class="btn" type="button" data-action="modal-close">Close</button>`
    });
  }

  /* ---------------------------
     PDF / Print (safe fallback)
  --------------------------- */
  function invoicePrintHtml(inv) {
    const job = getJob(inv.jobId);
    const t = invoiceTotals(inv);

    const items = (inv.lineItems || []).map(li => {
      const p = getPayee(li.payeeId);
      return `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid #ddd;">
            <div style="font-weight:700;">${escapeHtml(li.description)}</div>
            <div style="opacity:.75;font-size:12px;">${escapeHtml(p ? p.name : li.payeeId)} • ${escapeHtml(li.category)}</div>
          </td>
          <td style="padding:8px 10px;border-bottom:1px solid #ddd;text-align:right;">${escapeHtml(formatGBP(li.amount))}</td>
        </tr>
      `;
    }).join("");

    return `
      <div style="font-family: Inter, Arial, sans-serif; padding:24px; color:#111;">
        <div style="display:flex;justify-content:space-between;gap:16px;">
          <div>
            <div style="font-size:20px;font-weight:900;">ApproveHub</div>
            <div style="opacity:.75;">Approvals & Project Payments (demo)</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:18px;font-weight:900;">${escapeHtml(inv.number)}</div>
            <div style="opacity:.75;">Job: ${escapeHtml(job ? job.name : inv.jobId)}</div>
            <div style="opacity:.75;">Updated: ${escapeHtml(formatDate(inv.updatedAt))}</div>
          </div>
        </div>

        <div style="margin-top:14px;border:1px solid #e5e7eb;border-radius:14px;padding:14px;">
          <div style="font-weight:800;">Summary</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;">
            <div style="opacity:.8;">Client payment before VAT</div><div style="text-align:right;font-weight:800;">${escapeHtml(formatGBP(t.clientPaymentBeforeVat))}</div>
            <div style="opacity:.8;">Trades total</div><div style="text-align:right;font-weight:800;">${escapeHtml(formatGBP(t.totalToTrades))}</div>
            <div style="opacity:.8;">Suppliers total</div><div style="text-align:right;font-weight:800;">${escapeHtml(formatGBP(t.totalToSuppliers))}</div>
            <div style="opacity:.8;">Main contractor</div><div style="text-align:right;font-weight:800;">${escapeHtml(formatGBP(t.mainContractorAmount))}</div>
            <div style="opacity:.8;">Fee pot</div><div style="text-align:right;font-weight:800;">${escapeHtml(formatGBP(t.feePot))}</div>
            <div style="opacity:.8;">VAT on fee pot</div><div style="text-align:right;font-weight:900;">${escapeHtml(formatGBP(t.vatOnFee))}</div>
            <div style="opacity:.8;">Grand total</div><div style="text-align:right;font-weight:900;">${escapeHtml(formatGBP(t.grandTotal))}</div>
          </div>

          <div style="margin-top:10px;font-size:12px;opacity:.8;border-top:1px dashed #e5e7eb;padding-top:10px;">
            ${escapeHtml(VAT_DISCLAIMER)}
          </div>
        </div>

        <div style="margin-top:14px;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
          <div style="padding:12px 14px;font-weight:800;background:#f5f7fb;">Line items</div>
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr>
                <th style="text-align:left;padding:8px 10px;border-bottom:1px solid #ddd;font-size:12px;opacity:.7;">Description</th>
                <th style="text-align:right;padding:8px 10px;border-bottom:1px solid #ddd;font-size:12px;opacity:.7;">Amount</th>
              </tr>
            </thead>
            <tbody>${items || ""}</tbody>
          </table>
        </div>

        <div style="margin-top:14px;font-size:12px;opacity:.8;">
          Funds statement: ${escapeHtml(FUNDS_STATEMENT)}
        </div>
      </div>
    `;
  }

  function printInvoice(inv) {
    const html = invoicePrintHtml(inv);
    const w = window.open("", "_blank", "noopener,noreferrer");
    if (!w) { toast("warn","Popup blocked","Allow popups to print."); return; }
    w.document.open();
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(inv.number)} — Print</title></head><body>${html}<script>window.onload=()=>window.print();</script></body></html>`);
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
          .set({ margin: 8, filename, html2canvas: { scale: 2 }, jsPDF: { unit: "mm", format: "a4", orientation: "portrait" } })
          .save()
          .then(() => { container.remove(); toast("ok","PDF created","Downloaded invoice PDF."); })
          .catch(() => { container.remove(); toast("warn","PDF fallback","PDF tool unavailable. Opening print."); window.print(); });
      } else {
        container.remove();
        toast("warn","PDF fallback","PDF library missing. Opening print.");
        window.print();
      }
    } catch {
      container.remove();
      toast("warn","PDF fallback","Could not generate PDF. Opening print.");
      window.print();
    }
  }

  /* ---------------------------
     Snapshots (share + regen)
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
        updatedAt: inv.updatedAt,
        clientPaymentBeforeVat: t.clientPaymentBeforeVat,
        vatRate: t.vatRate,
        mainContractorAmount: t.mainContractorAmount,
        lineItems: (inv.lineItems || []).map(li => ({ ...li })),
      }
    };
    db.snapshots.unshift(snap);
    saveDb();
    return snap.id;
  }

  function downloadSnapshotPdf(snapshot) {
    const pseudo = {
      id: snapshot.invoiceId,
      jobId: snapshot.jobId,
      number: snapshot.payload.number,
      createdAt: snapshot.payload.createdAt,
      updatedAt: snapshot.createdAt,
      clientPaymentBeforeVat: snapshot.payload.clientPaymentBeforeVat,
      feeVatRate: snapshot.payload.vatRate,
      mainContractorAmount: snapshot.payload.mainContractorAmount,
      lineItems: snapshot.payload.lineItems,
      status: "approved",
    };
    downloadInvoicePdf(pseudo);
  }

  function openShareInvoice(inv) {
    openModal({
      title: "Share invoice",
      ariaLabel: "Share invoice",
      bodyHtml: `
        <div class="card" style="border-color: rgba(77,131,255,.22); background: rgba(77,131,255,.06);">
          This posts a message with an <strong>invoice snapshot attachment</strong>.
        </div>
        <div class="sep"></div>
        <div class="field">
          <label for="shareNote">Message (optional)</label>
          <textarea id="shareNote" rows="3" placeholder="e.g., Please review this invoice before approvals."></textarea>
        </div>
      `,
      footerHtml: `
        <div class="hstack" style="justify-content:flex-end;">
          <button class="btn" type="button" data-action="modal-close">Cancel</button>
          <button class="btn primary" type="button" data-action="confirm-share-invoice" data-invoice-id="${escapeHtml(inv.id)}">Share</button>
        </div>
      `
    });
  }

  /* ---------------------------
     View delegation
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

      const payload = { ...el.dataset };
      if (el instanceof HTMLSelectElement) payload.value = el.value;
      handleAction(action, payload);
    });
  }

  /* ---------------------------
     Actions
  --------------------------- */
  function handleAction(action, data) {
    // filters
    if (action === "payments-filter") { routeTo(data.value ? `#/payments?job=${encodeURIComponent(data.value)}` : "#/payments"); return; }
    if (action === "disputes-filter") { routeTo(data.value ? `#/disputes?job=${encodeURIComponent(data.value)}` : "#/disputes"); return; }
    if (action === "messages-filter") { routeTo(data.value ? `#/messages?job=${encodeURIComponent(data.value)}` : "#/messages"); return; }
    if (action === "pp-select") {
      routeTo(`#/jobs/${encodeURIComponent(data.jobId)}?tab=payment&invoice=${encodeURIComponent(data.value||"")}`);
      return;
    }

    // theme
    if (action === "theme-select") {
      applyThemePref(data.value || "system");
      toast("info", "Theme", `Theme set to ${data.value || "system"}.`);
      log("set_theme","ui","theme",null,{theme:data.value||"system"});
      return;
    }

    // test mode
    if (action === "toggle-test-mode") {
      setTestMode(data.on === "1");
      return;
    }

    // savings
    if (action === "open-savings") {
      openSavings(data.jobId || null);
      return;
    }

    // data tools
    if (action === "reset-demo") {
      if (!perms().canReset) { toast("bad","Not allowed","This role cannot reset."); return; }
      openModal({
        title:"Reset demo?",
        ariaLabel:"Reset demo",
        bodyHtml:`<div class="card" style="border-color: rgba(225,96,91,.28); background: rgba(225,96,91,.10);">This overwrites demo data stored in your browser.</div>`,
        footerHtml:`<div class="hstack" style="justify-content:flex-end;">
          <button class="btn" data-action="modal-close" type="button">Cancel</button>
          <button class="btn danger" data-action="confirm-reset" type="button">Reset</button>
        </div>`
      });
      return;
    }
    if (action === "confirm-reset") { closeModal(); resetDb("User reset"); return; }

    if (action === "export-db") {
      if (!perms().canExport) { toast("bad","Not allowed","This role cannot export."); return; }
      downloadText(`approvehub_demo_${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(db,null,2), "application/json");
      toast("ok","Exported","Demo JSON exported.");
      log("export_db","db","root",null,{bytes:JSON.stringify(db).length});
      return;
    }

    if (action === "import-db") {
      if (!perms().canImport) { toast("bad","Not allowed","This role cannot import."); return; }
      openModal({
        title:"Import demo JSON",
        ariaLabel:"Import demo JSON",
        bodyHtml:`
          <div class="card" style="border-color: rgba(240,207,99,.55); background: rgba(240,207,99,.14);">
            Import will replace current demo data in your browser.
          </div>
          <div class="sep"></div>
          <div class="field">
            <label for="importFile">Choose JSON file</label>
            <input id="importFile" type="file" accept="application/json" data-action="import-file" />
            <div class="muted">schemaVersion expected: ${SCHEMA_VERSION}</div>
          </div>
        `,
        footerHtml:`<button class="btn" type="button" data-action="modal-close">Close</button>`
      });
      return;
    }

    // company save/cancel
    if (action === "company-cancel") { render(); toast("info","Cancelled","Reverted to saved values."); return; }
    if (action === "company-save") {
      db.company.companyName = String($("#coName")?.value || "").trim() || db.company.companyName;
      db.company.vatNumber = String($("#coVat")?.value || "").trim() || db.company.vatNumber;
      db.company.companyRegNumber = String($("#coReg")?.value || "").trim() || db.company.companyRegNumber;
      db.company.utrNumber = String($("#coUtr")?.value || "").trim() || db.company.utrNumber;
      db.company.nationalInsuranceNumber = String($("#coNi")?.value || "").trim() || db.company.nationalInsuranceNumber;
      db.company.companyAddress = String($("#coAddr")?.value || "").trim() || db.company.companyAddress;
      db.company.billingAddress = String($("#coBill")?.value || "").trim() || db.company.billingAddress;
      db.company.phoneNumber = String($("#coPhone")?.value || "").trim() || db.company.phoneNumber;
      saveDb();
      toast("ok","Saved","Company details updated.");
      log("save_company","company","root",null,{});
      render();
      return;
    }

    // create job
    if (action === "create-job") {
      if (!perms().canCreateJob) { toast("bad","Not allowed","This role cannot create jobs."); return; }
      openModal({
        title:"Create job",
        ariaLabel:"Create job",
        bodyHtml:`
          <div class="grid cols-2">
            <div class="field"><label for="cjName">Job name</label><input id="cjName" placeholder="e.g., Riverside Apartments" /></div>
            <div class="field"><label for="cjLoc">Location</label><input id="cjLoc" placeholder="e.g., Central City" /></div>
            <div class="field"><label for="cjClient">Client name</label><input id="cjClient" placeholder="e.g., A. Patel" /></div>
            <div class="field"><label for="cjDesc">Short description</label><input id="cjDesc" placeholder="Brief scope summary" /></div>
          </div>
        `,
        footerHtml:`
          <div class="hstack" style="justify-content:flex-end;">
            <button class="btn" data-action="modal-close" type="button">Cancel</button>
            <button class="btn primary" data-action="confirm-create-job" type="button">Create</button>
          </div>
        `
      });
      return;
    }
    if (action === "confirm-create-job") {
      const name = String($("#cjName")?.value || "").trim();
      const location = String($("#cjLoc")?.value || "").trim();
      const clientName = String($("#cjClient")?.value || "").trim();
      const description = String($("#cjDesc")?.value || "").trim();
      if (!name) { toast("warn","Missing","Enter a job name."); return; }

      const jobId = uid("job");
      const threadId = uid("thr");
      const msId = uid("ms");
      const invId = uid("inv");

      db.jobs.unshift({
        id: jobId,
        name,
        location: location || "Demo location",
        clientName: clientName || "Client (demo)",
        address: location || "Demo address",
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
        status: "draft",
        createdAt: nowIso(),
        updatedAt: nowIso(),
        clientPaymentBeforeVat: 5000,
        feeVatRate: 20,
        mainContractorAmount: 1000,
        lineItems: [
          { id: uid("li"), payeeId: "pay_oakbeam", category: "contractor", description: "Starter trade", amount: 1200 }
        ],
      });

      db.messages.push({ id: uid("msg"), threadId, jobId, ts: nowIso(), byRole: ui.role, text: "Job created (demo).", attachments: [] });

      saveDb();
      closeModal();
      toast("ok","Job created","Created with a starter invoice.");
      log("create_job","job",jobId,jobId,{name});
      routeTo(`#/jobs/${jobId}?tab=invoices`);
      return;
    }

    // edit job / archive
    if (action === "edit-job") {
      const job = getJob(data.jobId);
      if (!job) return;
      openModal({
        title:"Edit job",
        ariaLabel:"Edit job",
        bodyHtml:`
          <div class="grid cols-2">
            <div class="field"><label for="ejName">Job name</label><input id="ejName" value="${escapeHtml(job.name)}" /></div>
            <div class="field"><label for="ejLoc">Location</label><input id="ejLoc" value="${escapeHtml(job.location||"")}" /></div>
            <div class="field"><label for="ejClient">Client</label><input id="ejClient" value="${escapeHtml(job.clientName||"")}" /></div>
            <div class="field"><label for="ejDesc">Description</label><input id="ejDesc" value="${escapeHtml(job.description||"")}" /></div>
          </div>
        `,
        footerHtml:`
          <div class="hstack" style="justify-content:flex-end;">
            <button class="btn" data-action="modal-close" type="button">Cancel</button>
            <button class="btn primary" data-action="confirm-edit-job" data-job-id="${escapeHtml(job.id)}" type="button">Save</button>
          </div>
        `
      });
      return;
    }
    if (action === "confirm-edit-job") {
      const job = getJob(data.jobId);
      if (!job) return;
      job.name = String($("#ejName")?.value || job.name).trim();
      job.location = String($("#ejLoc")?.value || job.location).trim();
      job.clientName = String($("#ejClient")?.value || job.clientName).trim();
      job.description = String($("#ejDesc")?.value || job.description).trim();
      job.updatedAt = nowIso();
      saveDb();
      closeModal();
      toast("ok","Saved","Job updated.");
      log("edit_job","job",job.id,job.id,{});
      render();
      return;
    }

    if (action === "archive-job" || action === "unarchive-job") {
      const job = getJob(data.jobId);
      if (!job) return;
      job.archived = action === "archive-job";
      job.updatedAt = nowIso();
      saveDb();
      toast("ok", job.archived ? "Archived" : "Unarchived", "Job updated.");
      log(job.archived ? "archive_job" : "unarchive_job","job",job.id,job.id,{});
      render();
      return;
    }

    if (action === "export-job") {
      if (!perms().canExport) { toast("bad","Not allowed","This role cannot export."); return; }
      const job = getJob(data.jobId);
      if (!job) return;
      const bundle = { job, milestones: jobMilestones(job), invoices: jobInvoices(job), releases: jobReleases(job), disputes: jobDisputes(job), messages: jobThreadMessages(job) };
      downloadText(`approvehub_job_${job.id}.json`, JSON.stringify(bundle,null,2), "application/json");
      toast("ok","Exported","Job bundle exported.");
      log("export_job_bundle","job",job.id,job.id,{size:JSON.stringify(bundle).length});
      return;
    }

    // milestones evidence
    if (action === "toggle-evidence") {
      const ms = getMilestone(data.msId);
      if (!ms) return;
      ms.evidenceProvided = !ms.evidenceProvided;
      saveDb();
      toast("ok","Milestone updated", `Evidence marked ${ms.evidenceProvided ? "provided" : "missing"}.`);
      log("toggle_evidence","milestone",ms.id,ms.jobId,{evidenceProvided: ms.evidenceProvided});
      render();
      return;
    }

    // add invoice (tile CTA)
    if (action === "add-invoice") {
      const job = getJob(data.jobId);
      if (!job) return;
      const invId = uid("inv");
      const invNum = `INV-${String(Math.floor(Math.random()*90000)+10000)}`;
      db.invoices.unshift({
        id: invId,
        jobId: job.id,
        number: invNum,
        status: "draft",
        createdAt: nowIso(),
        updatedAt: nowIso(),
        clientPaymentBeforeVat: 5000,
        feeVatRate: 20,
        mainContractorAmount: 1000,
        lineItems: [],
      });
      job.invoiceIds = Array.from(new Set([...(job.invoiceIds||[]), invId]));
      job.updatedAt = nowIso();
      saveDb();
      toast("ok","Invoice added", invNum);
      log("add_invoice","invoice",invId,job.id,{});
      routeTo(`#/invoices/${invId}`);
      return;
    }

    // invoice save / revert
    if (action === "save-invoice") {
      if (!perms().canEditInvoice) { toast("bad","Not allowed","This role cannot edit invoices."); return; }
      const inv = getInvoice(data.invoiceId);
      if (!inv) return;

      const beforeVat = Number($("#invBeforeVat")?.value || inv.clientPaymentBeforeVat || 0);
      const vatRate = Number($("#invVatRate")?.value || inv.feeVatRate || 20);
      const mc = Number($("#invMainContractor")?.value || inv.mainContractorAmount || 0);
      const st = String($("#invStatus")?.value || inv.status || "draft");

      inv.clientPaymentBeforeVat = Math.max(0, Math.round(beforeVat * 100) / 100);
      inv.feeVatRate = clamp(Math.round(vatRate), 0, 100);
      inv.mainContractorAmount = Math.max(0, Math.round(mc * 100) / 100);
      inv.status = ["draft","ready","approved"].includes(st) ? st : "draft";
      inv.updatedAt = nowIso();

      saveDb();
      toast("ok","Saved","Invoice updated.");
      log("edit_invoice","invoice",inv.id,inv.jobId,{});
      render();
      return;
    }
    if (action === "revert-invoice") { render(); toast("info","Cancelled","Reverted to saved values."); return; }

    // line items add/remove
    if (action === "add-line-item") {
      if (!perms().canEditInvoice) { toast("bad","Not allowed","This role cannot edit invoices."); return; }
      const inv = getInvoice(data.invoiceId);
      if (!inv) return;

      openModal({
        title:"Add line item",
        ariaLabel:"Add line item",
        bodyHtml:`
          <div class="grid cols-2">
            <div class="field">
              <label for="liPayee">Payee</label>
              <select id="liPayee">
                ${db.payees.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} (${escapeHtml(p.type)})</option>`).join("")}
              </select>
            </div>
            <div class="field">
              <label for="liCat">Category</label>
              <select id="liCat">
                <option value="contractor">contractor</option>
                <option value="supplier">supplier</option>
              </select>
            </div>
            <div class="field">
              <label for="liDesc">Description</label>
              <input id="liDesc" placeholder="e.g., Electrical works" />
            </div>
            <div class="field">
              <label for="liAmt">Amount</label>
              <input id="liAmt" type="number" step="0.01" inputmode="decimal" placeholder="0.00" />
            </div>
          </div>
        `,
        footerHtml:`
          <div class="hstack" style="justify-content:flex-end;">
            <button class="btn" data-action="modal-close" type="button">Cancel</button>
            <button class="btn primary" data-action="confirm-add-line-item" data-invoice-id="${escapeHtml(inv.id)}" type="button">Add</button>
          </div>
        `
      });
      return;
    }

    if (action === "confirm-add-line-item") {
      const inv = getInvoice(data.invoiceId);
      if (!inv) return;
      const payeeId = String($("#liPayee")?.value || "").trim();
      const category = String($("#liCat")?.value || "contractor").trim();
      const description = String($("#liDesc")?.value || "").trim() || "Line item";
      const amount = Math.max(0, Number($("#liAmt")?.value || 0));

      inv.lineItems.push({ id: uid("li"), payeeId, category, description, amount: Math.round(amount*100)/100 });
      inv.updatedAt = nowIso();
      saveDb();
      closeModal();
      toast("ok","Added","Line item added.");
      log("add_line_item","invoice",inv.id,inv.jobId,{});
      render();
      return;
    }

    if (action === "remove-line-item") {
      if (!perms().canEditInvoice) { toast("bad","Not allowed","This role cannot edit invoices."); return; }
      const inv = getInvoice(data.invoiceId);
      if (!inv) return;
      inv.lineItems = (inv.lineItems||[]).filter(li => li.id !== data.liId);
      inv.updatedAt = nowIso();
      saveDb();
      toast("ok","Removed","Line item removed.");
      log("remove_line_item","invoice",inv.id,inv.jobId,{liId:data.liId});
      render();
      return;
    }

    // pdf/print/share
    if (action === "print-invoice") { const inv = getInvoice(data.invoiceId); if (!inv) return; printInvoice(inv); log("print_invoice","invoice",inv.id,inv.jobId,{}); return; }
    if (action === "download-pdf") { const inv = getInvoice(data.invoiceId); if (!inv) return; downloadInvoicePdf(inv); log("download_pdf","invoice",inv.id,inv.jobId,{}); return; }
    if (action === "share-invoice") { const inv = getInvoice(data.invoiceId); if (!inv) return; openShareInvoice(inv); return; }

    if (action === "confirm-share-invoice") {
      const inv = getInvoice(data.invoiceId);
      if (!inv) return;
      const job = getJob(inv.jobId);
      if (!job) return;
      const note = String($("#shareNote")?.value || "").trim();
      const snapId = createInvoiceSnapshot(inv);

      db.messages.push({
        id: uid("msg"),
        threadId: job.threadId,
        jobId: job.id,
        ts: nowIso(),
        byRole: ui.role,
        text: note || `Shared invoice snapshot for ${inv.number}.`,
        attachments: [{ type:"invoice_snapshot", name:`${inv.number} snapshot`, invoiceId: inv.id, snapshotId: snapId }],
      });

      saveDb();
      closeModal();
      toast("ok","Shared","Invoice snapshot posted to thread.");
      log("share_invoice","invoice",inv.id,inv.jobId,{snapshotId:snapId});
      routeTo(`#/messages?job=${encodeURIComponent(job.id)}`);
      return;
    }

    if (action === "regen-pdf") {
      const snap = db.snapshots.find(s => s.id === data.snapshotId);
      if (!snap) { toast("bad","Not found","Snapshot not found."); return; }
      downloadSnapshotPdf(snap);
      log("regen_pdf","snapshot",snap.id,snap.jobId,{});
      return;
    }

    // messages post
    if (action === "post-message") {
      const job = getJob(data.jobId);
      if (!job) return;
      const text = String($("#msgText")?.value || "").trim();
      if (!text) { toast("warn","Empty","Write a message first."); return; }
      db.messages.push({ id: uid("msg"), threadId: job.threadId, jobId: job.id, ts: nowIso(), byRole: ui.role, text, attachments: [] });
      saveDb();
      toast("ok","Posted","Message posted.");
      log("post_message","message","thread",job.id,{length:text.length});
      render();
      return;
    }

    // disputes
    if (action === "create-dispute") {
      const jobId = data.jobId || "";
      openModal({
        title:"Create dispute",
        ariaLabel:"Create dispute",
        bodyHtml:`
          <div class="field"><label for="cdJob">Job</label>
            <select id="cdJob">${db.jobs.filter(j=>!j.archived).map(j=>`<option value="${escapeHtml(j.id)}"${jobId&&j.id===jobId?" selected":""}>${escapeHtml(j.name)}</option>`).join("")}</select>
          </div>
          <div class="field"><label for="cdTitle">Title</label><input id="cdTitle" placeholder="Dispute title" /></div>
          <div class="field"><label for="cdNote">Initial note</label><input id="cdNote" placeholder="Short note" /></div>
          <div class="hstack"><label class="muted"><input type="checkbox" id="cdPause" checked /> Pause releases</label></div>
        `,
        footerHtml:`
          <div class="hstack" style="justify-content:flex-end;">
            <button class="btn" data-action="modal-close" type="button">Cancel</button>
            <button class="btn primary" data-action="confirm-create-dispute" type="button">Create</button>
          </div>
        `
      });
      return;
    }
    if (action === "confirm-create-dispute") {
      const jobId = String($("#cdJob")?.value || "").trim();
      const title = String($("#cdTitle")?.value || "").trim() || "Dispute";
      const note = String($("#cdNote")?.value || "").trim();
      const pause = !!$("#cdPause")?.checked;

      const job = getJob(jobId);
      if (!job) { toast("bad","Missing job","Select a job first."); return; }

      const id = uid("dis");
      const d = {
        id, jobId, title,
        status: "open",
        pauseRelease: pause,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        timeline: [{ ts: nowIso(), byRole: ui.role, type:"opened", text: note || "Dispute opened (demo)." }],
      };
      db.disputes.unshift(d);
      job.disputeIds = Array.from(new Set([...(job.disputeIds||[]), id]));
      job.updatedAt = nowIso();
      saveDb();
      closeModal();
      toast("ok","Created","Dispute created.");
      log("create_dispute","dispute",id,jobId,{pauseRelease:pause});
      routeTo(`#/disputes?job=${encodeURIComponent(jobId)}`);
      return;
    }
    if (action === "toggle-pause") {
      const d = db.disputes.find(x => x.id === data.disputeId);
      if (!d) return;
      d.pauseRelease = !d.pauseRelease;
      d.updatedAt = nowIso();
      d.timeline.push({ ts: nowIso(), byRole: ui.role, type:"toggle_pause", text:`pauseRelease set to ${d.pauseRelease}` });
      saveDb();
      toast("ok","Updated",`pauseRelease ${d.pauseRelease ? "ON" : "OFF"}.`);
      log("toggle_pause_release","dispute",d.id,d.jobId,{pauseRelease:d.pauseRelease});
      render();
      return;
    }
    if (action === "toggle-dispute") {
      const d = db.disputes.find(x => x.id === data.disputeId);
      if (!d) return;
      d.status = d.status === "closed" ? "open" : "closed";
      d.updatedAt = nowIso();
      d.timeline.push({ ts: nowIso(), byRole: ui.role, type:"toggle_status", text:`status set to ${d.status}` });
      saveDb();
      toast("ok","Updated",`Dispute is now ${d.status}.`);
      log("toggle_dispute_status","dispute",d.id,d.jobId,{status:d.status});
      render();
      return;
    }
    if (action === "view-dispute") {
      const d = db.disputes.find(x => x.id === data.disputeId);
      if (!d) return;
      const job = getJob(d.jobId);
      openModal({
        title:"Dispute timeline",
        ariaLabel:"Dispute timeline",
        bodyHtml:`
          <div class="card">
            <div class="card-title">${escapeHtml(d.title)}</div>
            <div class="card-sub">${escapeHtml(job ? job.name : d.jobId)}</div>
            <div class="sep"></div>
            ${(d.timeline||[]).map(t => `
              <div class="card" style="box-shadow:none;">
                <div class="split">
                  <div><strong>${escapeHtml(ROLE_LABEL[t.byRole] || t.byRole)}</strong><div class="muted">${escapeHtml(formatDate(t.ts))} • ${escapeHtml(t.type)}</div></div>
                  <span class="pill ${d.pauseRelease?"bad":"ok"}">pauseRelease ${d.pauseRelease?"ON":"OFF"}</span>
                </div>
                <div class="sep"></div>
                <div>${escapeHtml(t.text)}</div>
              </div>
            `).join("")}
          </div>
        `,
        footerHtml:`<button class="btn" type="button" data-action="modal-close">Close</button>`
      });
      return;
    }

    // company / bank
    if (action === "edit-bank") {
      const payee = getPayee(data.payeeId);
      if (!payee) return;
      if (!perms().canEditBank) { toast("bad","Not allowed","This role cannot edit bank details."); return; }

      openModal({
        title:"Edit bank details",
        ariaLabel:"Edit bank details",
        bodyHtml:`
          <div class="card" style="border-color: rgba(240,207,99,.55); background: rgba(240,207,99,.14);">
            Editing sets <strong>bankChanged</strong>. Manager/Admin must confirm before sending releases.
          </div>
          <div class="sep"></div>
          <div class="grid cols-2">
            <div class="field"><label for="ebBankName">Bank name</label><input id="ebBankName" value="${escapeHtml(payee.bank.bankName)}" /></div>
            <div class="field"><label for="ebAcctName">Account name</label><input id="ebAcctName" value="${escapeHtml(payee.bank.accountName)}" /></div>
            <div class="field"><label for="ebSort">Sort code</label><input id="ebSort" value="${escapeHtml(payee.bank.sortCode)}" /></div>
            <div class="field"><label for="ebAcct">Account number</label><input id="ebAcct" value="${escapeHtml(payee.bank.accountNumber)}" /></div>
          </div>
        `,
        footerHtml:`
          <div class="hstack" style="justify-content:flex-end;">
            <button class="btn" data-action="modal-close" type="button">Cancel</button>
            <button class="btn primary" data-action="confirm-edit-bank" data-payee-id="${escapeHtml(payee.id)}" type="button">Save</button>
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
      toast("ok","Updated","Bank details updated and marked for confirmation.");
      log("edit_bank","payee",payee.id,null,{bankChanged:true});
      render();
      return;
    }
    if (action === "confirm-bank") {
      const payee = getPayee(data.payeeId);
      if (!payee) return;
      if (!perms().canConfirmBank) { toast("bad","Not allowed","This role cannot confirm bank details."); return; }
      payee.bankConfirmed = true;
      payee.bankChanged = false;
      payee.updatedAt = nowIso();
      saveDb();
      toast("ok","Confirmed","Bank details confirmed.");
      log("confirm_bank","payee",payee.id,null,{});
      render();
      return;
    }

    // releases (minimal create/view + flow)
    if (action === "create-release") {
      openModal({
        title:"Create release request",
        ariaLabel:"Create release request",
        bodyHtml:`
          <div class="grid cols-2">
            <div class="field">
              <label for="crJob">Job</label>
              <select id="crJob">${db.jobs.filter(j=>!j.archived).map(j=>`<option value="${escapeHtml(j.id)}"${(data.jobId&&j.id===data.jobId)?" selected":""}>${escapeHtml(j.name)}</option>`).join("")}</select>
            </div>
            <div class="field">
              <label for="crTitle">Title</label>
              <input id="crTitle" placeholder="e.g., Release — First fix stage" />
            </div>
          </div>
          <div class="sep"></div>
          <div class="card" style="box-shadow:none;">
            <div class="card-title">Payee splits</div>
            <div class="card-sub">Enter amounts for each payee (demo).</div>
            <div class="sep"></div>
            ${db.payees.map(p=>`
              <div class="split">
                <div><strong>${escapeHtml(p.name)}</strong><div class="muted">${escapeHtml(p.type)}</div></div>
                <div class="field" style="max-width:220px;"><label class="sr-only" for="cr_${escapeHtml(p.id)}">Amount</label><input id="cr_${escapeHtml(p.id)}" type="number" step="0.01" inputmode="decimal" placeholder="0.00" /></div>
              </div>
              <div class="sep"></div>
            `).join("")}
          </div>
        `,
        footerHtml:`
          <div class="hstack" style="justify-content:flex-end;">
            <button class="btn" data-action="modal-close" type="button">Cancel</button>
            <button class="btn primary" data-action="confirm-create-release" type="button">Create</button>
          </div>
        `
      });
      return;
    }

    if (action === "confirm-create-release") {
      const jobId = String($("#crJob")?.value || "").trim();
      const title = String($("#crTitle")?.value || "").trim() || "Release — Draft";
      const job = getJob(jobId);
      if (!job) { toast("bad","Missing job","Select a job."); return; }

      const splits = [];
      for (const p of db.payees) {
        const val = Number($(`#cr_${p.id}`)?.value || 0);
        if (val > 0) splits.push({ payeeId: p.id, amount: Math.round(val*100)/100 });
      }

      const relId = uid("rel");
      const inv = job.invoiceIds?.[0] ? getInvoice(job.invoiceIds[0]) : null;

      db.releases.unshift({
        id: relId,
        jobId,
        invoiceId: inv ? inv.id : null,
        milestoneId: job.milestoneIds?.[0] || null,
        title,
        status: "Draft",
        approvals: { manager:false, client:false },
        sentToPartnerAt: null,
        releasedAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        payeeSplits: splits.length ? splits : [{ payeeId:"pay_oakbeam", amount: 1000 }],
        notes: "",
      });

      job.releaseIds = Array.from(new Set([...(job.releaseIds||[]), relId]));
      job.updatedAt = nowIso();
      saveDb();
      closeModal();
      toast("ok","Created","Release created as Draft.");
      log("create_release","release",relId,jobId,{title});
      routeTo(`#/payments?job=${encodeURIComponent(jobId)}`);
      return;
    }

    if (action === "view-release") {
      const rel = getRelease(data.releaseId);
      if (!rel) return;
      const job = getJob(rel.jobId);
      const blockers = releaseBlockers(rel);

      openModal({
        title:"Release details",
        ariaLabel:"Release details",
        bodyHtml:`
          <div class="card">
            <div class="card-title">${escapeHtml(rel.title)}</div>
            <div class="card-sub">${escapeHtml(job ? job.name : rel.jobId)}</div>
            <div class="sep"></div>
            <div class="split"><div class="muted">Status</div><div><span class="pill info">${escapeHtml(rel.status)}</span></div></div>
            <div class="split"><div class="muted">Mgr approved</div><div><strong>${rel.approvals?.manager?"Yes":"No"}</strong></div></div>
            <div class="split"><div class="muted">Client approved</div><div><strong>${rel.approvals?.client?"Yes":"No"}</strong></div></div>
            <div class="sep"></div>
            <div class="card" style="box-shadow:none;">
              <div class="card-title">Splits</div>
              <div class="sep"></div>
              ${(rel.payeeSplits||[]).map(s=>{
                const p = getPayee(s.payeeId);
                return `<div class="split"><div>${escapeHtml(p?p.name:s.payeeId)}</div><div><strong>${escapeHtml(formatGBP(s.amount))}</strong></div></div>`;
              }).join("")}
            </div>
            <div class="sep"></div>
            ${blockers.length ? `<div class="card" style="border-color: rgba(225,96,91,.28); background: rgba(225,96,91,.10);">
              <div style="font-weight:800;">Blockers</div>
              <ul>${blockers.map(b=>`<li>${escapeHtml(b)}</li>`).join("")}</ul>
            </div>` : `<div class="card" style="border-color: rgba(88,182,106,.30); background: rgba(88,182,106,.10);"><div style="font-weight:800;">No blockers</div></div>`}
            <div class="sep"></div>
            <div class="card" style="border-color: rgba(77,131,255,.22); background: rgba(77,131,255,.06);"><strong>Funds statement:</strong> ${escapeHtml(FUNDS_STATEMENT)}</div>
          </div>
        `,
        footerHtml:`<a class="btn primary" href="#/payments?job=${encodeURIComponent(rel.jobId)}">Open payments</a><button class="btn" type="button" data-action="modal-close">Close</button>`
      });
      return;
    }

    if (action === "submit-release") {
      const rel = getRelease(data.releaseId);
      if (!rel) return;
      if (rel.status !== "Draft") { toast("warn","Not valid","Only Draft can be submitted."); return; }
      rel.status = "Submitted";
      rel.updatedAt = nowIso();
      saveDb();
      toast("ok","Submitted","Release submitted for approvals.");
      log("submit_release","release",rel.id,rel.jobId,{});
      render();
      return;
    }

    if (action === "approve-release-manager") {
      const rel = getRelease(data.releaseId);
      if (!rel) return;
      if (!perms().canApproveManager) { toast("bad","Not allowed","This role cannot manager-approve."); return; }
      if (rel.status !== "Submitted") { toast("warn","Not valid","Manager approval is after submission."); return; }
      rel.approvals.manager = true;
      rel.status = "Manager approved";
      rel.updatedAt = nowIso();
      saveDb();
      toast("ok","Approved","Manager approval recorded.");
      log("approve_release_manager","release",rel.id,rel.jobId,{});
      render();
      return;
    }

    if (action === "approve-release-client") {
      const rel = getRelease(data.releaseId);
      if (!rel) return;
      if (!perms().canApproveClient) { toast("bad","Not allowed","This role cannot client-approve."); return; }
      if (rel.status !== "Manager approved") { toast("warn","Not valid","Client approval is after manager approval."); return; }
      rel.approvals.client = true;
      rel.status = "Client approved";
      rel.updatedAt = nowIso();
      saveDb();
      toast("ok","Approved","Client approval recorded.");
      log("approve_release_client","release",rel.id,rel.jobId,{});
      render();
      return;
    }

    if (action === "send-to-partner") {
      const rel = getRelease(data.releaseId);
      if (!rel) return;
      if (!perms().canSendToPartner) { toast("bad","Not allowed","This role cannot send to partner."); return; }
      if (rel.status !== "Client approved") { toast("warn","Not ready","Must be Client approved first."); return; }

      const blockers = releaseBlockers(rel);
      if (blockers.length) {
        toast("bad","Blocked", blockers[0]);
        openModal({
          title:"Release blocked",
          ariaLabel:"Release blocked",
          bodyHtml:`<div class="card" style="border-color: rgba(225,96,91,.28); background: rgba(225,96,91,.10);">
            <div style="font-weight:800;">Cannot “Send to partner” yet</div>
            <ul>${blockers.map(b=>`<li>${escapeHtml(b)}</li>`).join("")}</ul>
          </div>
          <div class="sep"></div>
          <div class="card" style="border-color: rgba(77,131,255,.22); background: rgba(77,131,255,.06);"><strong>Funds statement:</strong> ${escapeHtml(FUNDS_STATEMENT)}</div>`,
          footerHtml:`<button class="btn" type="button" data-action="modal-close">Close</button>`
        });
        log("send_to_partner_blocked","release",rel.id,rel.jobId,{blockers});
        return;
      }

      rel.status = "Sent to partner";
      rel.sentToPartnerAt = nowIso();
      rel.updatedAt = nowIso();
      saveDb();
      toast("ok","Sent","Release sent to escrow/PBA partner (demo).");
      log("send_to_partner","release",rel.id,rel.jobId,{});
      render();
      return;
    }

    if (action === "mark-released") {
      const rel = getRelease(data.releaseId);
      if (!rel) return;
      if (!perms().canMarkReleased) { toast("bad","Not allowed","Only Admin can mark released."); return; }
      if (rel.status !== "Sent to partner") { toast("warn","Not valid","Must be sent to partner first."); return; }
      rel.status = "Released";
      rel.releasedAt = nowIso();
      rel.updatedAt = nowIso();
      saveDb();
      toast("ok","Released","Release marked as released (demo).");
      log("mark_released","release",rel.id,rel.jobId,{});
      render();
      return;
    }

    // CSV export
    if (action === "export-csv") {
      if (!perms().canExport) { toast("bad","Not allowed","This role cannot export CSV."); return; }
      const which = data.csv;

      const map = {
        jobs: () => db.jobs.map(j => ({ id:j.id, name:j.name, location:j.location, clientName:j.clientName, status:j.status, archived:j.archived, createdAt:j.createdAt, updatedAt:j.updatedAt })),
        invoices: () => db.invoices.map(i => ({ id:i.id, jobId:i.jobId, number:i.number, status:i.status, clientPaymentBeforeVat:i.clientPaymentBeforeVat, feeVatRate:i.feeVatRate, mainContractorAmount:i.mainContractorAmount, createdAt:i.createdAt, updatedAt:i.updatedAt })),
        milestones: () => db.milestones.map(m => ({ id:m.id, jobId:m.jobId, title:m.title, evidenceRequired:m.evidenceRequired, evidenceProvided:m.evidenceProvided, targetDate:m.targetDate })),
        releases: () => db.releases.map(r => ({ id:r.id, jobId:r.jobId, title:r.title, status:r.status, managerApproved:r.approvals?.manager, clientApproved:r.approvals?.client, sentToPartnerAt:r.sentToPartnerAt, releasedAt:r.releasedAt, createdAt:r.createdAt, updatedAt:r.updatedAt })),
        disputes: () => db.disputes.map(d => ({ id:d.id, jobId:d.jobId, title:d.title, status:d.status, pauseRelease:d.pauseRelease, createdAt:d.createdAt, updatedAt:d.updatedAt })),
        messages: () => db.messages.map(m => ({ id:m.id, jobId:m.jobId, threadId:m.threadId, ts:m.ts, byRole:m.byRole, text:m.text })),
        payees: () => db.payees.map(p => ({ id:p.id, name:p.name, type:p.type, vatRegistered:p.vatRegistered, vatNumber:p.vatNumber, bankName:p.bank.bankName, sortCode:p.bank.sortCode, accountNumber:p.bank.accountNumber, bankChanged:p.bankChanged, bankConfirmed:p.bankConfirmed, updatedAt:p.updatedAt })),
        auditLog: () => db.auditLog.map(a => ({ id:a.id, ts:a.ts, actorRole:a.actorRole, action:a.action, entityType:a.entityType, entityId:a.entityId, jobId:a.jobId, details: JSON.stringify(a.details||{}) })),
      };

      if (!map[which]) { toast("bad","Unknown","Unknown dataset."); return; }
      const rows = map[which]();
      const csv = toCsv(rows);
      downloadText(`approvehub_${which}_${new Date().toISOString().slice(0,10)}.csv`, csv, "text/csv");
      toast("ok","Exported",`Exported ${which} CSV.`);
      log("export_csv","report",which,null,{rows:rows.length});
      return;
    }

    // toast close (if triggered in view somehow)
    if (action === "toast-close") return;

    toast("warn","Unknown action",`No handler for: ${action}`);
  }

  /* ---------------------------
     Init
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

  init();
})();
// PART 7 END
