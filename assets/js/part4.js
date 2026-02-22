/* =========================================================
   ApproveHub — PART 4 (external file)
   Payments + Approvals + Disputes + Messages + Reports
   + release blocking rules + initCore()
   ---------------------------------------------------------
   Requires: app.js sets window.__APP__ with core exports.
   ========================================================= */

(() => {
  "use strict";

  const CORE = window.__APP__;
  if (!CORE) {
    console.error("ApproveHub PART 4: window.__APP__ not found. Ensure app.js loads first and exposes window.__APP__.");
    return;
  }

  // ---------- Safe access helpers ----------
  const noop = () => {};
  const has = (k) => Object.prototype.hasOwnProperty.call(CORE, k);

  const state = CORE.state || { role: "viewer", db: { jobs: [], payees: [], invoices: [], milestones: [], releases: [], disputes: [], messages: [], reports: [] } };
  const ROUTES = CORE.ROUTES || [];
  const h = CORE.h || ((tag, attrs, kids) => ({ tag, attrs, kids })); // placeholder if missing (won't render well, but won't crash)
  const $ = CORE.$ || ((sel) => document.querySelector(sel));
  const $$ = CORE.$$ || ((sel) => Array.from(document.querySelectorAll(sel)));
  const on = CORE.on || ((el, ev, fn) => el && el.addEventListener(ev, fn));
  const toast = CORE.toast || ((msg) => alert(msg));
  const esc = CORE.esc || ((s) => String(s ?? ""));
  const money = CORE.money || ((n) => `£${Number(n || 0).toFixed(2)}`);
  const fmtDateTime = CORE.fmtDateTime || ((t) => (t ? new Date(t).toLocaleString() : "—"));
  const uid = CORE.uid || (() => Math.random().toString(16).slice(2) + Date.now().toString(16));
  const clamp = CORE.clamp || ((n, a, b) => Math.max(a, Math.min(b, n)));
  const safeFile = CORE.safeFile || ((name) => String(name || "export").replace(/[^\w.-]+/g, "_"));
  const downloadText =
    CORE.downloadText ||
    ((filename, text) => {
      const blob = new Blob([text], { type: "application/json;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 250);
    });

  const getJob = CORE.getJob || ((id) => state.db.jobs.find((x) => x.id === id) || null);
  const getPayee = CORE.getPayee || ((id) => state.db.payees.find((x) => x.id === id) || null);
  const getInvoice = CORE.getInvoice || ((id) => state.db.invoices.find((x) => x.id === id) || null);
  const getMilestone = CORE.getMilestone || ((id) => state.db.milestones.find((x) => x.id === id) || null);

  const jobInvoices = CORE.jobInvoices || ((jobId) => state.db.invoices.filter((x) => x.jobId === jobId));
  const jobMilestones = CORE.jobMilestones || ((jobId) => state.db.milestones.filter((x) => x.jobId === jobId));
  const jobReleases = CORE.jobReleases || ((jobId) => state.db.releases.filter((x) => x.jobId === jobId));
  const jobDisputes = CORE.jobDisputes || ((jobId) => state.db.disputes.filter((x) => x.jobId === jobId));

  const perms =
    CORE.perms ||
    (() => {
      const r = state.role;
      return {
        canCreateRelease: ["manager", "payee", "admin"].includes(r),
        canApproveStep1: ["manager", "admin"].includes(r),
        canApproveStep2: ["client", "admin"].includes(r),
        canSendToPartner: ["manager", "admin"].includes(r),
        canRaiseDispute: ["manager", "client", "payee", "admin"].includes(r),
        canCloseDispute: ["manager", "admin"].includes(r),
        canMessage: ["manager", "client", "payee", "admin"].includes(r),
        canViewReports: ["manager", "admin"].includes(r),
      };
    });

  const openModal = CORE.openModal || null;
  const saveDb = CORE.saveDb || noop;
  const initCore = CORE.initCore || noop;

  const COMPLIANCE = CORE.COMPLIANCE || {
    FUNDS_STATEMENT:
      "Demo only: ApproveHub does not hold funds. It simulates payment approvals and release instructions; any real payments happen outside the app.",
  };

  // In case core wiring exists:
  const wireAfterRender = CORE.wireAfterRender || ((/*routeKey*/) => {});

  // ---------- Utilities ----------
  function now() {
    return Date.now();
  }

  function pillClassForStatus(status) {
    if (status === "Released") return "ok";
    if (status === "Sent to partner") return "info";
    if (status === "Client approved") return "info";
    if (status === "Manager approved") return "warn";
    if (status === "Submitted") return "warn";
    if (status === "Rejected") return "bad";
    return "";
  }

  function firstOrNull(arr) {
    return Array.isArray(arr) && arr.length ? arr[0] : null;
  }

  function findRoute(key) {
    return ROUTES.find((r) => r.key === key) || null;
  }

  function ensureCollections() {
    state.db.jobs ||= [];
    state.db.payees ||= [];
    state.db.invoices ||= [];
    state.db.milestones ||= [];
    state.db.releases ||= [];
    state.db.disputes ||= [];
    state.db.messages ||= [];
    state.db.reports ||= [];
  }

  ensureCollections();

  // =========================================================
  // BLOCKING RULES (Release → Send to partner)
  // =========================================================
  function disputeForLinked(jobId, linkedType, linkedId) {
    const t = linkedType === "invoice" ? "invoice" : "milestone";
    return state.db.disputes.find((d) => d.jobId === jobId && d.targetType === t && d.targetId === linkedId) || null;
  }

  function isChangeRequestApproved(jobId, changeRequestId) {
    if (!changeRequestId) return true;
    const job = getJob(jobId);
    const cr = (job?.changeRequests || []).find((x) => x.id === changeRequestId);
    if (!cr) return true;
    return !!(cr.managerApproved && cr.clientApproved);
  }

  function milestoneEvidenceOk(msId) {
    if (!msId) return true;
    const ms = getMilestone(msId);
    if (!ms) return true;
    if (!ms.evidenceRequired) return true;
    return ms.evidenceStatus === "Provided";
  }

  function canSendToPartner(release) {
    const reasons = [];

    // 1) Dispute not closed OR pause enabled
    const disp = disputeForLinked(release.jobId, release.linkedType, release.linkedId);
    if (disp && (disp.status !== "Closed" || disp.pauseRelease)) {
      reasons.push("Dispute is not Closed or release is paused.");
    }

    // 2) Payee bank details changed and not confirmed
    const payee = getPayee(release.payeeId);
    if (payee?.bankChanged && !payee?.bankConfirmed) {
      reasons.push("Payee bank details changed and not confirmed by Manager.");
    }

    // 3) Linked change request not approved by both (milestone or invoice-linked milestone)
    if (release.linkedType === "milestone") {
      const ms = getMilestone(release.linkedId);
      if (ms?.changeRequestId && !isChangeRequestApproved(release.jobId, ms.changeRequestId)) {
        reasons.push("Linked change request is not approved by both Manager and Client.");
      }
    } else if (release.linkedType === "invoice") {
      const inv = getInvoice(release.linkedId);
      const ms = inv?.linkedMilestoneId ? getMilestone(inv.linkedMilestoneId) : null;
      if (ms?.changeRequestId && !isChangeRequestApproved(release.jobId, ms.changeRequestId)) {
        reasons.push("Linked change request is not approved by both Manager and Client.");
      }
    }

    // 4) Evidence required and not Provided
    if (release.linkedType === "milestone") {
      if (!milestoneEvidenceOk(release.linkedId)) {
        reasons.push("Milestone requires evidence and evidenceStatus is not Provided.");
      }
    } else if (release.linkedType === "invoice") {
      const inv = getInvoice(release.linkedId);
      if (inv?.linkedMilestoneId && !milestoneEvidenceOk(inv.linkedMilestoneId)) {
        reasons.push("Linked milestone requires evidence and evidenceStatus is not Provided.");
      }
    }

    return { ok: reasons.length === 0, reasons };
  }

  // =========================================================
  // DATA MUTATORS
  // =========================================================
  function touchRelease(r) {
    r.updatedAt = now();
    saveDb();
  }

  function setReleaseStatus(id, status, note) {
    const r = state.db.releases.find((x) => x.id === id);
    if (!r) return toast("Release not found.");
    r.status = status;
    r.history ||= [];
    r.history.push({ at: now(), by: state.role, status, note: note || "" });
    touchRelease(r);
    toast(`Release → ${status}`);
  }

  function createRelease(jobId, opts = {}) {
    const job = getJob(jobId) || firstOrNull(state.db.jobs);
    if (!job) return toast("No job found to attach a release.");

    // Choose a payee + link target safely
    const payee = getPayee(opts.payeeId) || firstOrNull(state.db.payees) || null;
    const inv = opts.linkedType === "invoice" ? getInvoice(opts.linkedId) : firstOrNull(jobInvoices(job.id));
    const ms = opts.linkedType === "milestone" ? getMilestone(opts.linkedId) : firstOrNull(jobMilestones(job.id));

    let linkedType = opts.linkedType || (inv ? "invoice" : ms ? "milestone" : "milestone");
    let linkedId = opts.linkedId || (linkedType === "invoice" ? inv?.id : ms?.id);

    // Amount default
    let amount = Number(opts.amount || 0);
    if (!amount) {
      if (linkedType === "invoice" && inv) amount = Number(inv.amount || inv.total || 0);
      if (linkedType === "milestone" && ms) amount = Number(ms.amount || 0);
      amount = amount || 500; // demo fallback
    }

    const r = {
      id: uid(),
      jobId: job.id,
      payeeId: payee?.id || null,
      linkedType,
      linkedId: linkedId || null,
      amount: clamp(amount, 0, 999999999),
      status: "Draft",
      createdAt: now(),
      updatedAt: now(),
      notes: "",
      history: [{ at: now(), by: state.role, status: "Draft", note: "Created" }],
    };

    state.db.releases.push(r);
    saveDb();
    toast("Release request created (Draft).");
    return r;
  }

  function createDispute(jobId, targetType, targetId, reason) {
    const job = getJob(jobId);
    if (!job) return toast("Job not found.");

    const d = {
      id: uid(),
      jobId,
      targetType, // "invoice" | "milestone"
      targetId,
      status: "Open",
      pauseRelease: true,
      reason: reason || "Issue raised in demo.",
      createdAt: now(),
      updatedAt: now(),
      history: [{ at: now(), by: state.role, status: "Open", note: reason || "" }],
    };
    state.db.disputes.push(d);
    saveDb();
    toast("Dispute opened (release paused).");
    return d;
  }

  function setDisputeStatus(disputeId, status, pauseRelease, note) {
    const d = state.db.disputes.find((x) => x.id === disputeId);
    if (!d) return toast("Dispute not found.");
    d.status = status;
    if (typeof pauseRelease === "boolean") d.pauseRelease = pauseRelease;
    d.updatedAt = now();
    d.history ||= [];
    d.history.push({ at: now(), by: state.role, status, note: note || "" });
    saveDb();
    toast(`Dispute → ${status}`);
  }

  function postMessage(jobId, text) {
    const job = getJob(jobId);
    if (!job) return toast("Job not found.");
    const m = {
      id: uid(),
      jobId,
      byRole: state.role,
      text: String(text || "").trim(),
      createdAt: now(),
    };
    if (!m.text) return toast("Message is empty.");
    state.db.messages.push(m);
    saveDb();
    return m;
  }

  // =========================================================
  // UI: Modals (fallbacks)
  // =========================================================
  function promptText(title, label, placeholder = "", defaultValue = "") {
    // If your core has a real modal, use it; otherwise use prompt().
    if (typeof openModal === "function") {
      // Generic modal schema if your openModal supports it; if not, it still won't crash.
      return new Promise((resolve) => {
        openModal({
          title,
          body: h("div", { class: "stack" }, [
            h("label", { class: "label" }, label),
            h("input", { class: "input", id: "ah-modal-input", placeholder, value: defaultValue }),
          ]),
          actions: [
            { label: "Cancel", kind: "ghost", onClick: () => resolve(null) },
            {
              label: "OK",
              kind: "primary",
              onClick: () => {
                const v = $("#ah-modal-input")?.value ?? "";
                resolve(String(v));
              },
            },
          ],
        });
      });
    }
    const v = window.prompt(`${title}\n\n${label}`, defaultValue);
    return Promise.resolve(v === null ? null : String(v));
  }

  function alertBlock(title, body) {
    if (typeof openModal === "function") {
      openModal({
        title,
        body: h("div", { class: "stack" }, [h("div", { class: "muted" }, body)]),
        actions: [{ label: "OK", kind: "primary", onClick: noop }],
      });
      return;
    }
    window.alert(`${title}\n\n${body}`);
  }

  // =========================================================
  // PAGES
  // =========================================================

  function renderReleaseActions(r) {
    const p = perms();
    const check = r.status === "Client approved" ? canSendToPartner(r) : { ok: true, reasons: [] };
    const btn = (cls, label, action, disabled = false) =>
      h("button", { class: `btn ${cls || ""}`.trim(), type: "button", "data-rel-action": action, "data-rel": r.id, disabled: disabled ? "disabled" : null }, label);

    const actions = [];

    if (r.status === "Draft" && p.canCreateRelease) {
      actions.push(btn("", "Submit", "submit"));
    }

    if (r.status === "Submitted" && p.canApproveStep1) {
      actions.push(btn("primary", "Approve", "approve1"));
      actions.push(btn("", "Request changes", "requestChanges"));
      actions.push(btn("danger", "Reject", "reject"));
    }

    if (r.status === "Manager approved" && p.canApproveStep2) {
      actions.push(btn("primary", "Approve", "approve2"));
      actions.push(btn("", "Request changes", "requestChanges"));
      actions.push(btn("danger", "Reject", "reject"));
    }

    if (r.status === "Client approved" && p.canSendToPartner) {
      actions.push(btn("primary", "Send to partner", "sendToPartner", !check.ok));
      actions.push(btn("", "Why blocked?", "whyBlocked"));
    }

    if (r.status === "Sent to partner" && (state.role === "manager" || state.role === "admin")) {
      actions.push(btn("primary", "Mark released", "markReleased"));
    }

    actions.push(btn("", "Details", "details"));
    return actions;
  }

  function renderPayments() {
    const p = perms();
    const jobs = state.db.jobs.filter((j) => j.status !== "archived");

    const cards = jobs.map((j) => {
      const releases = jobReleases(j.id).slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

      const rows = releases.length
        ? h("table", { class: "table" }, [
            h("thead", {}, [
              h("tr", {}, [h("th", {}, "Status"), h("th", {}, "Payee"), h("th", {}, "Linked"), h("th", {}, "Amount"), h("th", {}, "Updated"), h("th", { style: "width:320px" }, "Actions")]),
            ]),
            h(
              "tbody",
              {},
              releases.flatMap((r) => {
                const payee = getPayee(r.payeeId);
                const linkedLabel =
                  r.linkedType === "invoice" ? getInvoice(r.linkedId)?.title || "Invoice" : getMilestone(r.linkedId)?.title || "Milestone";

                const check = r.status === "Client approved" ? canSendToPartner(r) : { ok: true, reasons: [] };
                const blockedRow = !check.ok
                  ? h("tr", {}, [
                      h("td", { colspan: "6" }, [
                        h("div", { class: "banner bad" }, [h("div", { class: "title" }, "Blocked"), h("div", { class: "body" }, check.reasons.join(" "))]),
                      ]),
                    ])
                  : null;

                return [
                  h("tr", {}, [
                    h("td", {}, [h("span", { class: `pill ${pillClassForStatus(r.status)}` }, r.status)]),
                    h("td", {}, payee?.name || "—"),
                    h("td", {}, linkedLabel),
                    h("td", {}, h("b", {}, money(r.amount))),
                    h("td", { class: "muted" }, fmtDateTime(r.updatedAt)),
                    h("td", {}, [h("div", { class: "hstack", style: "flex-wrap:wrap" }, renderReleaseActions(r))]),
                  ]),
                  ...(blockedRow ? [blockedRow] : []),
                ];
              })
            ),
          ])
        : h("div", { class: "muted" }, "No releases yet for this job.");

      return h("div", { class: "card pad", style: "margin-bottom:12px" }, [
        h("div", { class: "split" }, [
          h("div", {}, [
            h("div", { style: "font-weight:950;font-size:16px" }, j.name),
            h("div", { class: "muted", style: "margin-top:4px" }, `${j.location || "—"} • Ring-fenced balance: ${money(j.ringfencedBalance || 0)}`),
          ]),
          h("div", { class: "hstack" }, [
            h("a", { class: "btn", href: `#/jobs/${j.id}` }, "Open job"),
            ...(p.canCreateRelease ? [h("button", { class: "btn primary", type: "button", "data-action": "createRelease", "data-job": j.id }, "+ Release request")] : []),
          ]),
        ]),
        h("hr", { class: "sep" }),
        rows,
      ]);
    });

    return h("div", { class: "card" }, [
      h("div", { class: "card-header" }, [
        h("div", {}, [h("div", { class: "card-title" }, "Payments"), h("div", { class: "card-sub" }, "Ring-fenced approval flow with blockers: disputes, bank changes, change requests, evidence.")]),
        h("div", { class: "hstack" }, [
          ...(p.canCreateRelease ? [h("button", { class: "btn primary", type: "button", "data-action": "createRelease" }, "+ New release request")] : []),
        ]),
      ]),
      h("div", { class: "card pad" }, [
        h("div", { class: "banner info" }, [h("div", { class: "title" }, "Important"), h("div", { class: "body" }, COMPLIANCE.FUNDS_STATEMENT)]),
        h("hr", { class: "sep" }),
        ...cards,
        h("div", { class: "banner info", style: "margin-top:12px" }, [
          h("div", { class: "title" }, "Partner flow (demo)"),
          h("div", { class: "body" }, "Draft → Submitted → Manager approved → Client approved → Sent to partner → Released (demo)."),
        ]),
      ]),
    ]);
  }

  function renderApprovals() {
    const p = perms();
    const releases = state.db.releases.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const awaitingYou = releases.filter((r) => (r.status === "Submitted" && p.canApproveStep1) || (r.status === "Manager approved" && p.canApproveStep2));
    const others = releases.filter((r) => !awaitingYou.includes(r));

    const tableFor = (title, list) =>
      h("div", { class: "card pad", style: "margin-bottom:12px" }, [
        h("div", { style: "font-weight:950;margin-bottom:8px" }, title),
        list.length
          ? h("table", { class: "table" }, [
              h("thead", {}, [h("tr", {}, [h("th", {}, "Job"), h("th", {}, "Status"), h("th", {}, "Amount"), h("th", {}, "Updated"), h("th", { style: "width:320px" }, "Actions")])]),
              h(
                "tbody",
                {},
                list.map((r) => {
                  const job = getJob(r.jobId);
                  return h("tr", {}, [
                    h("td", {}, job?.name || "—"),
                    h("td", {}, [h("span", { class: `pill ${pillClassForStatus(r.status)}` }, r.status)]),
                    h("td", {}, money(r.amount)),
                    h("td", { class: "muted" }, fmtDateTime(r.updatedAt)),
                    h("td", {}, [h("div", { class: "hstack", style: "flex-wrap:wrap" }, renderReleaseActions(r))]),
                  ]);
                })
              ),
            ])
          : h("div", { class: "muted" }, "Nothing here."),
      ]);

    return h("div", { class: "card" }, [
      h("div", { class: "card-header" }, [
        h("div", {}, [h("div", { class: "card-title" }, "Approvals"), h("div", { class: "card-sub" }, "Your pending approvals and the wider queue.")]),
      ]),
      h("div", { class: "card pad" }, [tableFor("Awaiting you", awaitingYou), tableFor("All requests", others)]),
    ]);
  }

  function renderDisputes() {
    const p = perms();
    const jobs = state.db.jobs.filter((j) => j.status !== "archived");
    const all = state.db.disputes.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    const card = (d) => {
      const job = getJob(d.jobId);
      const targetLabel = d.targetType === "invoice" ? getInvoice(d.targetId)?.title || "Invoice" : getMilestone(d.targetId)?.title || "Milestone";
      const statusPill = d.status === "Closed" ? "ok" : d.status === "Open" ? "warn" : "info";

      return h("div", { class: "card pad", style: "margin-bottom:12px" }, [
        h("div", { class: "split" }, [
          h("div", {}, [
            h("div", { style: "font-weight:950" }, `${job?.name || "Job"} • ${targetLabel}`),
            h("div", { class: "muted", style: "margin-top:4px" }, `Updated: ${fmtDateTime(d.updatedAt)} • Pause release: ${d.pauseRelease ? "Yes" : "No"}`),
          ]),
          h("div", { class: "hstack" }, [
            h("span", { class: `pill ${statusPill}` }, d.status),
            ...(p.canCloseDispute
              ? [
                  h("button", { class: "btn", type: "button", "data-dispute-action": "togglePause", "data-dispute": d.id }, d.pauseRelease ? "Unpause" : "Pause"),
                  h("button", { class: "btn primary", type: "button", "data-dispute-action": "close", "data-dispute": d.id }, "Close"),
                ]
              : []),
            h("button", { class: "btn", type: "button", "data-dispute-action": "details", "data-dispute": d.id }, "Details"),
          ]),
        ]),
        h("hr", { class: "sep" }),
        h("div", {}, [h("div", { class: "muted" }, "Reason"), h("div", {}, esc(d.reason || "—"))]),
      ]);
    };

    const createBar =
      p.canRaiseDispute && jobs.length
        ? h("div", { class: "banner info", style: "margin-bottom:12px" }, [
            h("div", { class: "title" }, "Raise a dispute (demo)"),
            h("div", { class: "body" }, "Pick a job, then a milestone/invoice. Disputes pause releases by default."),
            h("div", { class: "hstack", style: "margin-top:10px;flex-wrap:wrap" }, [
              h("select", { class: "select", id: "ah-dispute-job" }, [
                ...jobs.map((j) => h("option", { value: j.id }, j.name)),
              ]),
              h("select", { class: "select", id: "ah-dispute-targetType" }, [
                h("option", { value: "milestone" }, "Milestone"),
                h("option", { value: "invoice" }, "Invoice"),
              ]),
              h("button", { class: "btn primary", type: "button", "data-action": "raiseDispute" }, "Raise dispute"),
            ]),
          ])
        : null;

    return h("div", { class: "card" }, [
      h("div", { class: "card-header" }, [
        h("div", {}, [h("div", { class: "card-title" }, "Disputes"), h("div", { class: "card-sub" }, "Open/closed issues that can pause release requests.")]),
      ]),
      h("div", { class: "card pad" }, [
        ...(createBar ? [createBar] : []),
        ...(all.length ? all.map(card) : [h("div", { class: "muted" }, "No disputes in this demo yet.")]),
      ]),
    ]);
  }

  function renderMessages() {
    const p = perms();
    const jobs = state.db.jobs.filter((j) => j.status !== "archived");

    const jobId = (location.hash.match(/messages\/([^/?#]+)/) || [])[1] || (jobs[0]?.id || "");
    const job = getJob(jobId);
    const msgs = state.db.messages.filter((m) => m.jobId === jobId).slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    return h("div", { class: "card" }, [
      h("div", { class: "card-header" }, [
        h("div", {}, [h("div", { class: "card-title" }, "Messages"), h("div", { class: "card-sub" }, "Lightweight job chat (stored in localStorage).")]),
        h("div", { class: "hstack" }, [
          h(
            "select",
            { class: "select", id: "ah-msg-job" },
            jobs.map((j) => h("option", { value: j.id, selected: j.id === jobId ? "selected" : null }, j.name))
          ),
          ...(jobId ? [h("a", { class: "btn", href: `#/jobs/${jobId}` }, "Open job")] : []),
        ]),
      ]),
      h("div", { class: "card pad" }, [
        job
          ? h("div", { class: "banner info" }, [
              h("div", { class: "title" }, job.name),
              h("div", { class: "body" }, "Use this thread to record approvals, issues and notes."),
            ])
          : h("div", { class: "muted" }, "No job selected."),
        h("hr", { class: "sep" }),
        h(
          "div",
          { class: "stack", style: "gap:10px" },
          msgs.length
            ? msgs.map((m) =>
                h("div", { class: "card pad" }, [
                  h("div", { class: "split" }, [
                    h("div", { style: "font-weight:900" }, (m.byRole || "user").toUpperCase()),
                    h("div", { class: "muted" }, fmtDateTime(m.createdAt)),
                  ]),
                  h("div", { style: "margin-top:6px;white-space:pre-wrap" }, esc(m.text)),
                ])
              )
            : [h("div", { class: "muted" }, "No messages yet.")]
        ),
        h("hr", { class: "sep" }),
        p.canMessage
          ? h("div", { class: "stack" }, [
              h("textarea", { class: "textarea", id: "ah-msg-text", rows: "3", placeholder: "Write a message…" }),
              h("div", { class: "hstack" }, [
                h("button", { class: "btn primary", type: "button", "data-action": "sendMessage", disabled: !jobId ? "disabled" : null }, "Send"),
                h("div", { class: "muted", style: "font-size:12px" }, "Tip: Keep notes short; include evidence links if needed."),
              ]),
            ])
          : h("div", { class: "muted" }, "Your role cannot post messages in this demo."),
      ]),
    ]);
  }

  function renderReports() {
    const p = perms();
    const releases = state.db.releases || [];
    const disputes = state.db.disputes || [];
    const invoices = state.db.invoices || [];
    const milestones = state.db.milestones || [];

    const totalReleased = releases.filter((r) => r.status === "Released").reduce((a, r) => a + Number(r.amount || 0), 0);
    const totalQueued = releases
      .filter((r) => ["Submitted", "Manager approved", "Client approved", "Sent to partner"].includes(r.status))
      .reduce((a, r) => a + Number(r.amount || 0), 0);

    const openDisputes = disputes.filter((d) => d.status !== "Closed").length;

    return h("div", { class: "card" }, [
      h("div", { class: "card-header" }, [
        h("div", {}, [h("div", { class: "card-title" }, "Reports"), h("div", { class: "card-sub" }, "Snapshot metrics + export (demo).")]),
        h("div", { class: "hstack" }, [
          ...(p.canViewReports ? [h("button", { class: "btn primary", type: "button", "data-action": "exportReport" }, "Export JSON")] : []),
        ]),
      ]),
      h("div", { class: "card pad" }, [
        h("div", { class: "grid", style: "grid-template-columns:repeat(3,minmax(0,1fr));gap:12px" }, [
          h("div", { class: "card pad" }, [h("div", { class: "muted" }, "Total released"), h("div", { style: "font-size:22px;font-weight:950" }, money(totalReleased))]),
          h("div", { class: "card pad" }, [h("div", { class: "muted" }, "Queued / in-flight"), h("div", { style: "font-size:22px;font-weight:950" }, money(totalQueued))]),
          h("div", { class: "card pad" }, [h("div", { class: "muted" }, "Open disputes"), h("div", { style: "font-size:22px;font-weight:950" }, String(openDisputes))]),
        ]),
        h("hr", { class: "sep" }),
        h("div", { class: "banner info" }, [
          h("div", { class: "title" }, "What’s inside the export"),
          h("div", { class: "body" }, "Jobs, payees, invoices, milestones, release requests, disputes and messages — all from localStorage."),
        ]),
        h("div", { class: "muted", style: "margin-top:10px;font-size:12px" }, COMPLIANCE.FUNDS_STATEMENT),
        h("hr", { class: "sep" }),
        h("div", { class: "muted" }, `Jobs: ${state.db.jobs.length} • Payees: ${state.db.payees.length} • Invoices: ${invoices.length} • Milestones: ${milestones.length} • Releases: ${releases.length} • Disputes: ${disputes.length}`),
      ]),
    ]);
  }

  // =========================================================
  // WIRING
  // =========================================================

  async function wirePayments() {
    // Create release
    $$("#view [data-action='createRelease']").forEach((btn) => {
      on(btn, "click", async () => {
        const jobId = btn.getAttribute("data-job") || null;
        // ask for amount quickly
        const amtRaw = await promptText("New release request", "Amount (£)", "e.g. 1250", "500");
        if (amtRaw === null) return;
        const amount = Number(String(amtRaw).replace(/[^0-9.]+/g, "")) || 0;

        const r = createRelease(jobId, { amount });
        if (r && CORE.route) CORE.route(); // rerender current
      });
    });

    // Release actions
    $$("#view [data-rel-action]").forEach((btn) => {
      on(btn, "click", async () => {
        const id = btn.getAttribute("data-rel");
        const action = btn.getAttribute("data-rel-action");
        const r = state.db.releases.find((x) => x.id === id);
        if (!r) return toast("Release not found.");

        if (action === "submit") return setReleaseStatus(id, "Submitted", "Submitted by requestor.");
        if (action === "approve1") return setReleaseStatus(id, "Manager approved", "Manager approved.");
        if (action === "approve2") return setReleaseStatus(id, "Client approved", "Client approved.");

        if (action === "requestChanges") {
          const note = await promptText("Request changes", "What needs changing?", "e.g. add evidence / confirm bank details", "");
          if (note === null) return;
          return setReleaseStatus(id, "Draft", `Changes requested: ${note}`);
        }

        if (action === "reject") {
          const note = await promptText("Reject release", "Reason for rejection", "e.g. incorrect amount", "");
          if (note === null) return;
          return setReleaseStatus(id, "Rejected", note);
        }

        if (action === "whyBlocked") {
          const check = canSendToPartner(r);
          if (check.ok) return alertBlock("Not blocked", "This release can be sent to partner.");
          return alertBlock("Blocked reasons", check.reasons.join("\n"));
        }

        if (action === "sendToPartner") {
          const check = canSendToPartner(r);
          if (!check.ok) return alertBlock("Cannot send", check.reasons.join("\n"));
          return setReleaseStatus(id, "Sent to partner", "Sent to partner (demo).");
        }

        if (action === "markReleased") return setReleaseStatus(id, "Released", "Marked released (demo).");

        if (action === "details") {
          const payee = getPayee(r.payeeId);
          const linkedLabel =
            r.linkedType === "invoice" ? getInvoice(r.linkedId)?.title || "Invoice" : getMilestone(r.linkedId)?.title || "Milestone";
          return alertBlock(
            "Release details",
            [
              `Status: ${r.status}`,
              `Amount: ${money(r.amount)}`,
              `Payee: ${payee?.name || "—"}`,
              `Linked: ${linkedLabel}`,
              `Updated: ${fmtDateTime(r.updatedAt)}`,
              "",
              "History:",
              ...(r.history || []).slice(-12).map((x) => `- ${new Date(x.at).toLocaleString()} • ${x.by} • ${x.status}${x.note ? ` — ${x.note}` : ""}`),
            ].join("\n")
          );
        }
      });
    });
  }

  async function wireDisputes() {
    // Raise dispute
    const raiseBtn = $("#view [data-action='raiseDispute']");
    if (raiseBtn) {
      on(raiseBtn, "click", async () => {
        const jobId = $("#ah-dispute-job")?.value;
        const targetType = $("#ah-dispute-targetType")?.value || "milestone";

        if (!jobId) return toast("Pick a job first.");

        const list = targetType === "invoice" ? jobInvoices(jobId) : jobMilestones(jobId);
        const first = firstOrNull(list);
        if (!first) return toast(`No ${targetType}s found on that job.`);

        const reason = await promptText("Raise dispute", "Reason", "e.g. evidence missing / variation not approved", "");
        if (reason === null) return;

        createDispute(jobId, targetType, first.id, reason);
        if (CORE.route) CORE.route();
      });
    }

    // Dispute actions
    $$("#view [data-dispute-action]").forEach((btn) => {
      on(btn, "click", async () => {
        const id = btn.getAttribute("data-dispute");
        const action = btn.getAttribute("data-dispute-action");
        const d = state.db.disputes.find((x) => x.id === id);
        if (!d) return toast("Dispute not found.");

        if (action === "togglePause") {
          return setDisputeStatus(id, d.status, !d.pauseRelease, d.pauseRelease ? "Unpaused" : "Paused");
        }

        if (action === "close") {
          const note = await promptText("Close dispute", "Resolution note", "e.g. evidence provided / amount corrected", "");
          if (note === null) return;
          return setDisputeStatus(id, "Closed", false, note);
        }

        if (action === "details") {
          const job = getJob(d.jobId);
          const targetLabel = d.targetType === "invoice" ? getInvoice(d.targetId)?.title || "Invoice" : getMilestone(d.targetId)?.title || "Milestone";
          return alertBlock(
            "Dispute details",
            [
              `Job: ${job?.name || "—"}`,
              `Target: ${targetLabel}`,
              `Status: ${d.status}`,
              `Pause release: ${d.pauseRelease ? "Yes" : "No"}`,
              `Reason: ${d.reason || "—"}`,
              "",
              "History:",
              ...(d.history || []).slice(-12).map((x) => `- ${new Date(x.at).toLocaleString()} • ${x.by} • ${x.status}${x.note ? ` — ${x.note}` : ""}`),
            ].join("\n")
          );
        }
      });
    });
  }

  async function wireMessages() {
    // Switch job dropdown navigates
    const sel = $("#ah-msg-job");
    if (sel) {
      on(sel, "change", () => {
        const jobId = sel.value;
        location.hash = `#/messages/${jobId}`;
      });
    }

    const sendBtn = $("#view [data-action='sendMessage']");
    if (sendBtn) {
      on(sendBtn, "click", () => {
        const jobId = $("#ah-msg-job")?.value;
        const text = $("#ah-msg-text")?.value || "";
        const m = postMessage(jobId, text);
        if (!m) return;
        const ta = $("#ah-msg-text");
        if (ta) ta.value = "";
        if (CORE.route) CORE.route();
      });
    }
  }

  async function wireReports() {
    const exportBtn = $("#view [data-action='exportReport']");
    if (!exportBtn) return;
    on(exportBtn, "click", () => {
      const payload = {
        exportedAt: new Date().toISOString(),
        role: state.role,
        db: state.db,
      };
      downloadText(safeFile(`approvehub-report-${new Date().toISOString().slice(0, 10)}.json`), JSON.stringify(payload, null, 2));
      toast("Exported report JSON.");
    });
  }

  // =========================================================
  // ROUTE PATCH + WIRE PATCH
  // =========================================================
  function patchRoutes() {
    const rPayments = findRoute("payments");
    const rApprovals = findRoute("approvals");
    const rDisputes = findRoute("disputes");
    const rMessages = findRoute("messages");
    const rReports = findRoute("reports");

    if (rPayments) rPayments.render = renderPayments;
    if (rApprovals) rApprovals.render = renderApprovals;
    if (rDisputes) rDisputes.render = renderDisputes;
    if (rMessages) rMessages.render = renderMessages;
    if (rReports) rReports.render = renderReports;

    // If core doesn't have these routes at all, we don't create them here,
    // because your router likely depends on its own registry format.
  }

  function patchWireAfterRender() {
    // Respect existing
    const prev = CORE.wireAfterRender || wireAfterRender || noop;

    CORE.wireAfterRender = function (routeKey, params, query) {
      try {
        prev(routeKey, params, query);
      } catch (e) {
        console.warn("Base wireAfterRender error:", e);
      }

      // routeKey strings depend on your router; we use common ones.
      if (routeKey === "payments") wirePayments();
      if (routeKey === "approvals") wirePayments(); // approvals reuses release buttons
      if (routeKey === "disputes") wireDisputes();
      if (routeKey === "messages") wireMessages();
      if (routeKey === "reports") wireReports();
    };
  }

  patchRoutes();
  patchWireAfterRender();

  // =========================================================
  // BOOT
  // =========================================================
  initCore();
})();
