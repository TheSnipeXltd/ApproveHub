  /* =========================
     Render: Invoice Summary
  ========================= */
  function computeInvoiceSummary(inv) {
    const clientPaymentBeforeVat = Number(inv.clientPaymentBeforeVat || 0);
    const totalToPayees = Number(inv.totalToPayees || 0);
    const feePot = Math.max(0, clientPaymentBeforeVat - totalToPayees);
    const vatRate = clamp(inv.feeVatRate ?? 20, 0, 100);
    const vatOnFee = Math.round(((feePot * vatRate) / 100) * 100) / 100;
    const grandTotal = clientPaymentBeforeVat + vatOnFee;

    // Illustrative example ONLY
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

    const shareBtn = perms().canMessage ? h("button", { class: "btn", type: "button", "data-action": "invoiceShare", "data-id": inv.id }, "Share") : null;

    return h("div", { class: "card" }, [
      h("div", { class: "card-header" }, [
        h("div", {}, [
          h("div", { class: "card-title" }, `${inv.title} — Summary`),
          h("div", { class: "card-sub" }, `${job?.name || "Job"} • Payee: ${payee?.name || "—"}`),
        ]),
        h("div", { class: "hstack", style: "flex-wrap:wrap" }, [
          shareBtn,
          h("button", { class: "btn primary", type: "button", "data-action": "invoicePdf", "data-id": inv.id }, "Download"),
          h("button", { class: "btn", type: "button", "data-action": "print" }, "Print"),
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
                h("input", { id: "clientPaymentInput", type: "number", min: "0", step: "10", value: String(s.clientPaymentBeforeVat), "data-inv": inv.id }),
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
              h("div", { class: "hstack", style: "flex-wrap:wrap" }, [
                h("span", { class: "pill" }, inv.status),
                h("span", { class: "pill" }, ["Updated: ", h("b", {}, fmtDateTime(inv.updatedAt))]),
              ]),
            ]),
          ]),
        ]),
        h("div", { class: "muted", style: "margin-top:14px;font-size:12px" }, "Tip: “Download” generates a PDF via html2pdf.js. “Print” is the fallback."),
      ]),
    ]);
  }

  async function generatePdfFromElement(element, filename) {
    const hasLib = typeof window.html2pdf !== "undefined";
    if (!hasLib) {
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
          h("div", { class: "body" }, "In Messages, the attachment is saved as a snapshot (not a stored PDF). You can regenerate the PDF anytime."),
        ]),
      ]),
      footer: h("div", { class: "hstack" }, [
        h("button", { class: "btn", type: "button", "data-action": "copyShare" }, "Copy"),
        h("button", { class: "btn", type: "button", "data-action": "sendShare", "data-id": inv.id }, "Send to Messages thread"),
        h("button", { class: "btn primary", type: "button", "data-action": "closeModal" }, "Done"),
      ]),
      onReady: ({ root, close }) => {
        const ta = $("#shareText", root);

        on($("[data-action='copyShare']", root), "click", async () => {
          try {
            await navigator.clipboard.writeText(ta.value);
            toast("Copied", "Summary copied to clipboard.");
          } catch {
            toast("Copy failed", "Select and copy manually.");
          }
        });

        on($("[data-action='closeModal']", root), "click", close);
      },
    });
  }

  /* =========================
     Render: Company
  ========================= */
  function renderCompany(params, query) {
    const canConfirm = perms().canConfirmBank || state.role === "admin";
    const list = state.role === "payee" ? [state.db.payees[0]].filter(Boolean) : state.db.payees;

    const cards = list.map((p) => {
      const banner = p.bankChanged && !p.bankConfirmed
        ? h("div", { class: "banner warn", style: "margin-top:10px" }, [
            h("div", { class: "title" }, "Bank details changed"),
            h("div", { class: "body" }, "Releases are blocked until confirmed by Manager."),
          ])
        : null;

      return h("div", { class: "card pad", style: "margin-bottom:12px" }, [
        h("div", { class: "split" }, [
          h("div", {}, [
            h("div", { style: "font-weight:950;font-size:16px" }, p.name),
            h("div", { class: "muted", style: "margin-top:4px" }, `${p.type} • ${p.email}`),
            h("div", { class: "hstack", style: "margin-top:10px;flex-wrap:wrap" }, [
              h("span", { class: `pill ${p.bankChanged && !p.bankConfirmed ? "warn" : "ok"}` }, ["Bank confirmed: ", h("b", {}, p.bankConfirmed ? "Yes" : "No")]),
              h("span", { class: "pill" }, ["Last change: ", h("b", {}, p.bankChangedAt ? fmtDateTime(p.bankChangedAt) : "—")]),
            ]),
          ]),
          h("div", { class: "hstack", style: "flex-wrap:wrap" }, [
            h("button", { class: "btn", type: "button", "data-action": "bankEdit", "data-id": p.id }, "Edit bank"),
            ...(canConfirm && p.bankChanged && !p.bankConfirmed
              ? [h("button", { class: "btn primary", type: "button", "data-action": "bankConfirm", "data-id": p.id }, "Confirm")]
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
      ]),
    ]);
  }

  /* =========================
     Render: Payments
  ========================= */
  function renderPayments() {
    const p = perms();
    const jobs = state.db.jobs.filter((j) => j.status !== "archived");

    const cards = jobs.map((j) => {
      const releases = jobReleases(j.id).slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

      const rows = releases.length
        ? h("table", { class: "table" }, [
            h("thead", {}, [
              h("tr", {}, [
                h("th", {}, "Status"),
                h("th", {}, "Payee"),
                h("th", {}, "Linked"),
                h("th", {}, "Amount"),
                h("th", {}, "Updated"),
                h("th", { style: "width:320px" }, "Actions"),
              ]),
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
                        h("div", { class: "banner bad" }, [
                          h("div", { class: "title" }, "Blocked"),
                          h("div", { class: "body" }, check.reasons.join(" ")),
                        ]),
                      ]),
                    ])
                  : null;

                const actions = [];
                if (r.status === "Draft" && (state.role === "manager" || state.role === "payee" || state.role === "admin")) {
                  actions.push(h("button", { class: "btn", type: "button", "data-action": "relSubmit", "data-id": r.id }, "Submit"));
                }
                if (r.status === "Submitted" && (perms().canApproveStep1 || state.role === "admin")) {
                  actions.push(h("button", { class: "btn primary", type: "button", "data-action": "relApprove1", "data-id": r.id }, "Approve"));
                  actions.push(h("button", { class: "btn danger", type: "button", "data-action": "relReject", "data-id": r.id }, "Reject"));
                }
                if (r.status === "Manager approved" && (perms().canApproveStep2 || state.role === "admin")) {
                  actions.push(h("button", { class: "btn primary", type: "button", "data-action": "relApprove2", "data-id": r.id }, "Approve"));
                  actions.push(h("button", { class: "btn danger", type: "button", "data-action": "relReject", "data-id": r.id }, "Reject"));
                }
                if (r.status === "Client approved" && (perms().canSendToPartner || state.role === "admin")) {
                  actions.push(h("button", { class: "btn primary", type: "button", "data-action": "relSend", "data-id": r.id, disabled: !check.ok ? "disabled" : null }, "Send to partner"));
                  actions.push(h("button", { class: "btn", type: "button", "data-action": "relWhy", "data-id": r.id }, "Why blocked?"));
                }
                if (r.status === "Sent to partner" && (state.role === "manager" || state.role === "admin")) {
                  actions.push(h("button", { class: "btn primary", type: "button", "data-action": "relReleased", "data-id": r.id }, "Mark released"));
                }
                actions.push(h("button", { class: "btn", type: "button", "data-action": "relDetails", "data-id": r.id }, "Details"));

                return [
                  h("tr", {}, [
                    h("td", {}, [h("span", { class: `pill ${pillClassForStatus(r.status)}` }, r.status)]),
                    h("td", {}, payee?.name || "—"),
                    h("td", {}, linkedLabel),
                    h("td", {}, h("b", {}, money(r.amount))),
                    h("td", { class: "muted" }, fmtDateTime(r.updatedAt)),
                    h("td", {}, [h("div", { class: "hstack", style: "flex-wrap:wrap" }, actions)]),
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
          h("div", { class: "hstack", style: "flex-wrap:wrap" }, [
            h("a", { class: "btn", href: `#/jobs/${j.id}` }, "Open job"),
            ...(state.role === "manager" || state.role === "payee" || state.role === "admin"
              ? [h("button", { class: "btn primary", type: "button", "data-action": "relCreate", "data-job": j.id }, "+ Release request")]
              : []),
          ]),
        ]),
        h("hr", { class: "sep" }),
        rows,
      ]);
    });

    return h("div", { class: "card" }, [
      h("div", { class: "card-header" }, [
        h("div", {}, [
          h("div", { class: "card-title" }, "Payments"),
          h("div", { class: "card-sub" }, "Ring-fenced approval flow with blockers: disputes, bank changes, change requests, evidence."),
        ]),
        h("div", { class: "hstack" }, [
          ...(state.role === "manager" || state.role === "payee" || state.role === "admin"
            ? [h("button", { class: "btn primary", type: "button", "data-action": "relCreate" }, "+ New release request")]
            : []),
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

  /* =========================
     Render: Approvals
  ========================= */
  function renderApprovals() {
    const role = state.role;

    const bankItems = (role === "manager" || role === "admin")
      ? state.db.payees.filter((p) => p.bankChanged && !p.bankConfirmed).map((p) => ({
          type: "bank",
          id: p.id,
          title: `Confirm bank: ${p.name}`,
          meta: `Last change: ${p.bankChangedAt ? fmtDateTime(p.bankChangedAt) : "—"}`,
        }))
      : [];

    const crItems = [];
    for (const j of state.db.jobs) {
      for (const cr of j.changeRequests || []) {
        if ((role === "manager" || role === "admin") && !cr.managerApproved) {
          crItems.push({ type: "cr_mgr", jobId: j.id, id: cr.id, title: `Approve (Manager): ${cr.title}`, meta: j.name });
        }
        if ((role === "client" || role === "admin") && !cr.clientApproved) {
          crItems.push({ type: "cr_cli", jobId: j.id, id: cr.id, title: `Approve (Client): ${cr.title}`, meta: j.name });
        }
      }
    }

    const relItems = state.db.releases
      .filter((r) => (role === "manager" && r.status === "Submitted") || (role === "client" && r.status === "Manager approved") || (role === "admin" && (r.status === "Submitted" || r.status === "Manager approved")))
      .map((r) => {
        const job = getJob(r.jobId);
        const payee = getPayee(r.payeeId);
        return {
          type: "release",
          id: r.id,
          title: `${job?.name || "Job"} • ${payee?.name || "Payee"}`,
          meta: `${r.status} • ${money(r.amount)}`,
        };
      });

    const items = [...relItems, ...bankItems, ...crItems];

    const list = items.length
      ? h("div", { class: "vstack" }, items.map((it) => {
          const actions = [];
          if (it.type === "bank") actions.push(h("button", { class: "btn primary", type: "button", "data-action": "bankConfirm", "data-id": it.id }, "Confirm"));
          if (it.type === "cr_mgr") actions.push(h("button", { class: "btn primary", type: "button", "data-action": "crApproveMgr", "data-job": it.jobId, "data-id": it.id }, "Approve"));
          if (it.type === "cr_cli") actions.push(h("button", { class: "btn primary", type: "button", "data-action": "crApproveCli", "data-job": it.jobId, "data-id": it.id }, "Approve"));
          if (it.type === "release") {
            const r = getRelease(it.id);
            if (r?.status === "Submitted") actions.push(h("button", { class: "btn primary", type: "button", "data-action": "relApprove1", "data-id": r.id }, "Approve"));
            if (r?.status === "Manager approved") actions.push(h("button", { class: "btn primary", type: "button", "data-action": "relApprove2", "data-id": r.id }, "Approve"));
            actions.push(h("button", { class: "btn danger", type: "button", "data-action": "relReject", "data-id": r.id }, "Reject"));
          }

          return h("div", { class: "card pad" }, [
            h("div", { class: "split" }, [
              h("div", {}, [
                h("div", { style: "font-weight:950" }, it.title),
                h("div", { class: "muted", style: "margin-top:6px" }, it.meta),
              ]),
              h("div", { class: "hstack", style: "flex-wrap:wrap" }, actions),
            ]),
          ]);
        }))
      : h("div", { class: "muted" }, "No approvals waiting for you.");

    return h("div", { class: "card" }, [
      h("div", { class: "card-header" }, [
        h("div", {}, [h("div", { class: "card-title" }, "Approvals"), h("div", { class: "card-sub" }, "Releases, bank confirmations and change requests that require action.")]),
      ]),
      h("div", { class: "card pad" }, [list]),
    ]);
  }

  /* =========================
     Render: Disputes
  ========================= */
  function renderDisputes() {
    const canAct = perms().canDispute;
    const list = state.db.disputes.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    const cards = list.length
      ? list.map((d) => {
          const job = getJob(d.jobId);
          const targetLabel = d.targetType === "invoice" ? getInvoice(d.targetId)?.title || "Invoice" : getMilestone(d.targetId)?.title || "Milestone";
          const statusPill = d.status === "Closed" ? "ok" : d.status === "Open" ? "warn" : "info";

          return h("div", { class: "card pad", style: "margin-bottom:12px" }, [
            h("div", { class: "split" }, [
              h("div", {}, [
                h("div", { style: "font-weight:950" }, `${job?.name || "Job"} • ${targetLabel}`),
                h("div", { class: "muted", style: "margin-top:4px" }, `Updated: ${fmtDateTime(d.updatedAt)} • Pause release: ${d.pauseRelease ? "Yes" : "No"}`),
              ]),
              h("div", { class: "hstack", style: "flex-wrap:wrap" }, [
                h("span", { class: `pill ${statusPill}` }, d.status),
                ...(canAct
                  ? [
                      h("button", { class: "btn", type: "button", "data-action": "dispTogglePause", "data-id": d.id }, d.pauseRelease ? "Unpause" : "Pause"),
                      h("button", { class: "btn primary", type: "button", "data-action": "dispClose", "data-id": d.id }, "Close"),
                    ]
                  : []),
                h("button", { class: "btn", type: "button", "data-action": "dispDetails", "data-id": d.id }, "Details"),
              ]),
            ]),
            h("hr", { class: "sep" }),
            h("div", {}, [h("div", { class: "muted" }, "Reason"), h("div", {}, esc(d.reason || "—"))]),
          ]);
        })
      : [h("div", { class: "muted" }, "No disputes in this demo yet.")];

    return h("div", { class: "card" }, [
      h("div", { class: "card-header" }, [
        h("div", {}, [h("div", { class: "card-title" }, "Disputes"), h("div", { class: "card-sub" }, "Open/closed issues that can pause release requests.")]),
      ]),
      h("div", { class: "card pad" }, cards),
    ]);
  }

  /* =========================
     Render: Messages
  ========================= */
  function renderMessages(params, query) {
    const jobs = state.db.jobs.filter((j) => j.status !== "archived");
    const jobId = query.get("job") || jobs[0]?.id || "";
    const job = getJob(jobId);

    const msgs = state.db.messages
      .filter((m) => m.jobId === jobId)
      .slice()
      .sort((a, b) => (a.at || 0) - (b.at || 0));

    return h("div", { class: "card" }, [
      h("div", { class: "card-header" }, [
        h("div", {}, [h("div", { class: "card-title" }, "Messages"), h("div", { class: "card-sub" }, "Job thread notes stored in localStorage.")]),
        h("div", { class: "hstack", style: "flex-wrap:wrap" }, [
          h(
            "select",
            { id: "msgJob", "data-action": "msgJobChange" },
            jobs.map((j) => h("option", { value: j.id, selected: j.id === jobId ? "selected" : null }, j.name))
          ),
          jobId ? h("a", { class: "btn", href: `#/jobs/${jobId}` }, "Open job") : null,
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
          { class: "vstack", style: "gap:10px" },
          msgs.length
            ? msgs.map((m) => {
                const atts = (m.attachments || []).map((a) => {
                  if (a.type !== "invoiceSummary") return null;
                  return h("div", { class: "banner info", style: "margin-top:10px" }, [
                    h("div", { class: "title" }, "Invoice summary snapshot"),
                    h("div", { class: "body" }, "This is a saved snapshot. You can regenerate a PDF from it."),
                    h("div", { class: "hstack", style: "margin-top:10px;flex-wrap:wrap" }, [
                      h("button", { class: "btn primary", type: "button", "data-action": "snapPdf", "data-msg": m.id, "data-att": a.id }, "Regenerate PDF"),
                      a.invoiceId ? h("a", { class: "btn", href: `#/invoices/${a.invoiceId}` }, "Open invoice") : null,
                    ]),
                  ]);
                }).filter(Boolean);

                return h("div", { class: "card pad" }, [
                  h("div", { class: "split" }, [
                    h("div", { style: "font-weight:900" }, (m.actorRole || "user").toUpperCase()),
                    h("div", { class: "muted" }, fmtDateTime(m.at)),
                  ]),
                  h("div", { style: "margin-top:6px;white-space:pre-wrap" }, esc(m.text || "")),
                  ...(atts.length ? [h("div", { style: "margin-top:10px" }, atts)] : []),
                ]);
              })
            : [h("div", { class: "muted" }, "No messages yet.")]
        ),
        h("hr", { class: "sep" }),
        perms().canMessage
          ? h("div", { class: "vstack" }, [
              h("textarea", { id: "msgText", rows: "3", placeholder: "Write a message…" }),
              h("div", { class: "hstack", style: "flex-wrap:wrap" }, [
                h("button", { class: "btn primary", type: "button", "data-action": "msgSend", "data-job": jobId }, "Send"),
                h("div", { class: "muted", style: "font-size:12px" }, "Tip: Keep notes short; include evidence details if needed."),
              ]),
            ])
          : h("div", { class: "muted" }, "Your role cannot post messages in this demo."),
      ]),
    ]);
  }

  /* =========================
     Render: Reports + CSV export
  ========================= */
  function renderReports() {
    if (!perms().canViewReports) {
      return h("div", { class: "card pad" }, [
        h("div", { class: "card-title" }, "Reports"),
        h("div", { class: "card-sub" }, "Your role cannot access Reports."),
      ]);
    }

    return h("div", { class: "card" }, [
      h("div", { class: "card-header" }, [
        h("div", {}, [h("div", { class: "card-title" }, "Reports"), h("div", { class: "card-sub" }, "CSV exports from demo data (localStorage).")]),
        h("div", { class: "hstack", style: "flex-wrap:wrap" }, [
          h("button", { class: "btn primary", type: "button", "data-action": "csv", "data-type": "jobs" }, "Jobs CSV"),
          h("button", { class: "btn primary", type: "button", "data-action": "csv", "data-type": "invoices" }, "Invoices CSV"),
          h("button", { class: "btn primary", type: "button", "data-action": "csv", "data-type": "milestones" }, "Milestones CSV"),
          h("button", { class: "btn primary", type: "button", "data-action": "csv", "data-type": "releases" }, "Releases CSV"),
          h("button", { class: "btn primary", type: "button", "data-action": "csv", "data-type": "disputes" }, "Disputes CSV"),
          h("button", { class: "btn primary", type: "button", "data-action": "csv", "data-type": "messages" }, "Messages CSV"),
          h("button", { class: "btn primary", type: "button", "data-action": "csv", "data-type": "payees" }, "Payees CSV"),
          h("button", { class: "btn primary", type: "button", "data-action": "csv", "data-type": "audit" }, "Audit CSV"),
        ]),
      ]),
      h("div", { class: "card pad" }, [
        h("div", { class: "banner info" }, [
          h("div", { class: "title" }, "What this is"),
          h("div", { class: "body" }, "These exports are just a snapshot of what’s stored in your browser (localStorage)."),
        ]),
        h("div", { class: "muted", style: "margin-top:10px;font-size:12px" }, COMPLIANCE.FUNDS_STATEMENT),
      ]),
    ]);
  }

  /* =========================
     Render: Settings
  ========================= */
  function renderSettings() {
    const theme = localStorage.getItem(APP.themeKey) || "system";
    const isPayee = state.role === "payee";

    return h("div", { class: "card" }, [
      h("div", { class: "card-header" }, [
        h("div", {}, [
          h("div", { class: "card-title" }, "Settings"),
          h("div", { class: "card-sub" }, "Reset demo, export/import data, theme mode, schema version."),
        ]),
        h("div", { class: "hstack", style: "flex-wrap:wrap" }, [
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
                ["system", "light", "dark"].forEach((v) =>
                  sel.appendChild(h("option", { value: v, selected: theme === v ? "selected" : null }, v))
                );
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
              h("button", { class: "btn primary", type: "button", "data-action": "reset", disabled: isPayee ? "disabled" : null }, "Reset demo"),
              h("button", { class: "btn", type: "button", "data-action": "exportDb", disabled: isPayee ? "disabled" : null }, "Export demo JSON"),
              h("label", { class: "btn", style: `cursor:${isPayee ? "not-allowed" : "pointer"};opacity:${isPayee ? ".55" : "1"}` }, [
                "Import demo JSON",
                h("input", { id: "importFile", type: "file", accept: "application/json", style: "display:none", disabled: isPayee ? "disabled" : null }),
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

  /* =========================
     Routes
  ========================= */
  addRoute({ key: "jobs", pattern: /^\/jobs$/, roles: ["client", "manager", "accountant", "admin"], render: renderJobsDashboard });
  addRoute({ key: "jobs", pattern: /^\/jobs\/(?<jobId>[^/]+)$/, roles: ["client", "manager", "accountant", "admin"], render: renderJobDetail });
  addRoute({ key: "jobs", pattern: /^\/invoices\/(?<invoiceId>[^/]+)$/, roles: ["client", "manager", "accountant", "admin"], render: renderInvoiceDetail });

  addRoute({ key: "payments", pattern: /^\/payments$/, roles: ["client", "manager", "payee", "accountant", "admin"], render: renderPayments });
  addRoute({ key: "approvals", pattern: /^\/approvals$/, roles: ["client", "manager", "accountant", "admin"], render: renderApprovals });
  addRoute({ key: "disputes", pattern: /^\/disputes$/, roles: ["client", "manager", "accountant", "admin"], render: renderDisputes });
  addRoute({ key: "messages", pattern: /^\/messages$/, roles: ["client", "manager", "admin"], render: renderMessages });
  addRoute({ key: "company", pattern: /^\/company$/, roles: ["client", "manager", "payee", "accountant", "admin"], render: renderCompany });
  addRoute({ key: "reports", pattern: /^\/reports$/, roles: ["client", "manager", "accountant", "admin"], render: renderReports });
  addRoute({ key: "settings", pattern: /^\/settings$/, roles: ["client", "manager", "payee", "accountant", "admin"], render: renderSettings });

  /* =========================
     Global header wiring
  ========================= */
  function initHeader() {
    // Role select
    const sel = $("#roleSelect");
    if (sel) {
      sel.value = state.role;
      on(sel, "change", () => setRole(sel.value));
    }

    // Theme toggle
    on($("#themeToggle"), "click", toggleTheme);

    // Notifications modal
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
        footer: h("div", { class: "hstack" }, [h("button", { class: "btn primary", type: "button", "data-action": "closeModal" }, "Close")]),
        onReady: ({ root, close }) => on($("[data-action='closeModal']", root), "click", close),
      });
    });

    // Search
    const input = $("#globalSearch");
    const pop = $("#searchPopover");
    if (input && pop) {
      on(input, "input", () => renderSearchPopover(buildSearchResults(input.value)));
      on(input, "focus", () => renderSearchPopover(buildSearchResults(input.value)));

      delegate(pop, "click", ".pop-item", (e, el) => {
        const href = el.getAttribute("data-href");
        if (href) location.hash = href;
        pop.hidden = true;
        pop.innerHTML = "";
        input.value = "";
      });

      delegate(pop, "keydown", ".pop-item", (e, el) => {
        if (e.key !== "Enter") return;
        const href = el.getAttribute("data-href");
        if (href) location.hash = href;
        pop.hidden = true;
        pop.innerHTML = "";
        input.value = "";
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
     One-time global wiring (buttons)
  ========================= */
  function initGlobalActions() {
    const view = $("#view");
    if (!view) return;

    // Clicks
    delegate(view, "click", "[data-action]", async (e, el) => {
      const act = el.getAttribute("data-action");

      // Simple navigation cards
      if (act === null) return;

      // Jobs
      if (act === "jobNew") {
        if (!perms().canEdit) return toast("Not allowed", "Only Manager/Admin can create jobs.");

        openModal({
          title: "Create job",
          body: h("div", { class: "vstack" }, [
            h("div", { class: "grid cols-2" }, [
              h("div", { class: "field" }, [h("label", {}, "Job name"), h("input", { id: "jobName", placeholder: "e.g. South London Refurb" })]),
              h("div", { class: "field" }, [h("label", {}, "Location"), h("input", { id: "jobLoc", placeholder: "e.g. Croydon, London" })]),
            ]),
            h("div", { class: "field" }, [h("label", {}, "Ring-fenced balance (demo)"), h("input", { id: "jobBal", type: "number", min: "0", step: "50", placeholder: "e.g. 20000" })]),
          ]),
          footer: h("div", { class: "hstack" }, [
            h("button", { class: "btn", type: "button", "data-action": "closeModal" }, "Cancel"),
            h("button", { class: "btn primary", type: "button", "data-action": "jobCreateConfirm" }, "Create"),
          ]),
          onReady: ({ root, close }) => {
            on($("[data-action='closeModal']", root), "click", close);
            on($("[data-action='jobCreateConfirm']", root), "click", () => {
              const name = ($("#jobName", root).value || "").trim();
              const loc = ($("#jobLoc", root).value || "").trim();
              const bal = Number($("#jobBal", root).value || 0);
              if (!name) return toast("Missing field", "Please enter a job name.");

              const job = { id: uid("job"), name, location: loc || "London, United Kingdom", status: "open", ringfencedBalance: Math.max(0, bal), createdAt: Date.now(), updatedAt: Date.now(), changeRequests: [] };
              state.db.jobs.unshift(job);
              audit("jobCreated", "job", job.id, job.id, { name: job.name });
              saveDb();
              close();
              toast("Created", "Job added.");
              location.hash = `#/jobs/${job.id}`;
            });
          },
        });
        return;
      }

      if (act === "jobEdit") {
        if (!perms().canEdit) return;
        const id = el.getAttribute("data-id");
        const job = getJob(id);
        if (!job) return;

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
              h("div", { class: "field" }, [h("label", {}, "Ring-fenced balance"), h("input", { id: "jobBal", type: "number", min: "0", step: "50", value: String(job.ringfencedBalance || 0) })]),
            ]),
          ]),
          footer: h("div", { class: "hstack" }, [
            h("button", { class: "btn", type: "button", "data-action": "closeModal" }, "Cancel"),
            h("button", { class: "btn primary", type: "button", "data-action": "jobEditConfirm", "data-id": job.id }, "Save"),
          ]),
          onReady: ({ root, close }) => {
            on($("[data-action='closeModal']", root), "click", close);
            on($("[data-action='jobEditConfirm']", root), "click", () => {
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
        return;
      }

      if (act === "jobArchive" || act === "jobUnarchive") {
        if (!perms().canEdit) return;
        const id = el.getAttribute("data-id");
        const job = getJob(id);
        if (!job) return;
        job.status = act === "jobArchive" ? "archived" : "open";
        job.updatedAt = Date.now();
        audit(act === "jobArchive" ? "jobArchived" : "jobUnarchived", "job", job.id, job.id, {});
        saveDb();
        toast(act === "jobArchive" ? "Archived" : "Unarchived", act === "jobArchive" ? "Job archived." : "Job restored to Open.");
        route();
        return;
      }

      if (act === "exportDb") {
        if (state.role === "payee") return toast("Not allowed", "Payee role cannot export demo data.");
        state.db.meta.lastBackupAt = Date.now();
        saveDb();
        downloadText("approvehub-demo-export.json", JSON.stringify(state.db, null, 2), "application/json");
        toast("Exported", "Demo JSON downloaded.");
        return;
      }

      if (act === "exportJobBundle") {
        if (!perms().canExport) return;
        const id = el.getAttribute("data-id");
        const job = getJob(id);
        if (!job) return;
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
        return;
      }

      if (act === "print") {
        window.print();
        return;
      }

      // Invoice actions
      if (act === "invoicePdf") {
        const inv = getInvoice(el.getAttribute("data-id"));
        if (!inv) return;
        const node = $("#invoiceSummary");
        if (!node) return;
        await generatePdfFromElement(node, `${safeFile(inv.title)}_summary.pdf`);
        return;
      }

      if (act === "invoiceShare") {
        const inv = getInvoice(el.getAttribute("data-id"));
        if (!inv) return;
        openShareModal(inv);
        return;
      }

      if (act === "sendShare") {
        const inv = getInvoice(el.getAttribute("data-id"));
        if (!inv) return;
        if (!perms().canMessage) return toast("Not allowed", "Only Client/Manager/Admin can send messages.");

        const s = computeInvoiceSummary(inv);
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
            generatedAt: Date.now(),
          },
        };

        const text = $("#shareText")?.value || "";
        state.db.messages.push({
          id: uid("msg"),
          jobId: inv.jobId,
          at: Date.now(),
          actorRole: state.role,
          text,
          attachments: [attachment],
        });

        audit("sharedInvoiceSummaryToMessages", "invoice", inv.id, inv.jobId, { attachmentId: attachment.id });
        saveDb();
        toast("Sent", "Summary posted into the Messages thread.");
        location.hash = `#/messages?job=${encodeURIComponent(inv.jobId)}`;
        return;
      }

      // Company: bank
      if (act === "bankEdit") {
        const id = el.getAttribute("data-id");
        const p = getPayee(id);
        if (!p) return;

        const allowed = state.role === "payee" || state.role === "manager" || state.role === "admin";
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
            h("button", { class: "btn", type: "button", "data-action": "closeModal" }, "Cancel"),
            h("button", { class: "btn primary", type: "button", "data-action": "bankSave", "data-id": p.id }, "Save"),
          ]),
          onReady: ({ root, close }) => {
            on($("[data-action='closeModal']", root), "click", close);
            on($("[data-action='bankSave']", root), "click", () => {
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
        return;
      }

      if (act === "bankConfirm") {
        if (!perms().canConfirmBank && state.role !== "admin") return toast("Not allowed", "Only Manager/Admin can confirm bank details.");
        const id = el.getAttribute("data-id");
        const p = getPayee(id);
        if (!p) return;

        p.bankConfirmed = true;
        p.bankChanged = false;
        p.bankChangedAt = null;

        audit("bankDetailsConfirmed", "payee", p.id, null, { payeeName: p.name });
        saveDb();
        toast("Confirmed", "Bank details confirmed by Manager.");
        route();
        return;
      }

      // Change requests approvals
      if (act === "crApproveMgr" || act === "crApproveCli") {
        const jobId = el.getAttribute("data-job");
        const crId = el.getAttribute("data-id");
        const job = getJob(jobId);
        const cr = (job?.changeRequests || []).find((x) => x.id === crId);
        if (!job || !cr) return;

        if (act === "crApproveMgr" && !(state.role === "manager" || state.role === "admin")) return toast("Not allowed", "Manager/Admin only.");
        if (act === "crApproveCli" && !(state.role === "client" || state.role === "admin")) return toast("Not allowed", "Client/Admin only.");

        if (act === "crApproveMgr") cr.managerApproved = true;
        if (act === "crApproveCli") cr.clientApproved = true;
        job.updatedAt = Date.now();

        audit("changeRequestApproved", "changeRequest", cr.id, job.id, { managerApproved: cr.managerApproved, clientApproved: cr.clientApproved });
        saveDb();
        toast("Approved", "Change request updated.");
        route();
        return;
      }

      // Payments: releases
      if (act === "relCreate") {
        if (!(state.role === "manager" || state.role === "payee" || state.role === "admin")) return toast("Not allowed", "Only Manager/Payee/Admin can create release requests.");
        const jobId = el.getAttribute("data-job") || state.db.jobs[0]?.id;
        const job = getJob(jobId);
        if (!job) return toast("No job", "No job found for this release.");

        const amt = await promptModal({ title: "New release request", label: "Amount (£)", placeholder: "e.g. 1250", value: "500" });
        if (amt === null) return;

        const amount = Number(String(amt).replace(/[^0-9.]+/g, "")) || 0;
        const payee = state.db.payees[0];
        const inv = jobInvoices(job.id)[0];
        const ms = jobMilestones(job.id)[0];

        const linkedType = inv ? "invoice" : "milestone";
        const linkedId = linkedType === "invoice" ? inv?.id : ms?.id;

        const r = {
          id: uid("rel"),
          jobId: job.id,
          payeeId: payee?.id || null,
          linkedType,
          linkedId: linkedId || null,
          amount: clamp(amount, 0, 999999999),
          status: "Draft",
          notes: "",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          history: [{ at: Date.now(), by: state.role, status: "Draft", note: "Created" }],
        };

        state.db.releases.push(r);
        audit("releaseCreated", "release", r.id, r.jobId, { amount: r.amount, linkedType: r.linkedType, linkedId: r.linkedId });
        saveDb();
        toast("Created", "Release request created (Draft).");
        route();
        return;
      }

      function setReleaseStatus(relId, status, note = "") {
        const r = getRelease(relId);
        if (!r) return toast("Not found", "Release not found.");
        r.status = status;
        r.updatedAt = Date.now();
        r.history ||= [];
        r.history.push({ at: Date.now(), by: state.role, status, note });
        audit("releaseStatusChanged", "release", r.id, r.jobId, { status, note });
        saveDb();
        toast("Release", `Set to ${status}`);
        route();
      }

      if (act === "relSubmit") return setReleaseStatus(el.getAttribute("data-id"), "Submitted", "Submitted by requestor.");
      if (act === "relApprove1") return setReleaseStatus(el.getAttribute("data-id"), "Manager approved", "Manager approved.");
      if (act === "relApprove2") return setReleaseStatus(el.getAttribute("data-id"), "Client approved", "Client approved.");
      if (act === "relReject") return setReleaseStatus(el.getAttribute("data-id"), "Rejected", "Rejected.");

      if (act === "relWhy") {
        const r = getRelease(el.getAttribute("data-id"));
        if (!r) return;
        const check = canSendToPartner(r);
        if (check.ok) return toast("Not blocked", "This release can be sent to the partner.");
        openModal({
          title: "Why blocked?",
          body: h("div", { class: "vstack" }, [
            h("div", { class: "banner bad" }, [h("div", { class: "title" }, "Blocked reasons"), h("div", { class: "body" }, check.reasons.join("\n"))]),
          ]),
          footer: h("div", { class: "hstack" }, [h("button", { class: "btn primary", type: "button", "data-action": "closeModal" }, "OK")]),
          onReady: ({ root, close }) => on($("[data-action='closeModal']", root), "click", close),
        });
        return;
      }

      if (act === "relSend") {
        const r = getRelease(el.getAttribute("data-id"));
        if (!r) return;
        const check = canSendToPartner(r);
        if (!check.ok) {
          toast("Blocked", check.reasons[0] || "This release is blocked.");
          return;
        }
        return setReleaseStatus(r.id, "Sent to partner", "Sent to partner (demo).");
      }

      if (act === "relReleased") return setReleaseStatus(el.getAttribute("data-id"), "Released", "Marked released (demo).");

      if (act === "relDetails") {
        const r = getRelease(el.getAttribute("data-id"));
        if (!r) return;
        const payee = getPayee(r.payeeId);
        const linkedLabel = r.linkedType === "invoice" ? getInvoice(r.linkedId)?.title || "Invoice" : getMilestone(r.linkedId)?.title || "Milestone";
        openModal({
          title: "Release details",
          body: h("div", { class: "vstack" }, [
            h("div", { class: "card pad" }, [
              h("div", { class: "split" }, [h("div", { class: "muted" }, "Status"), h("div", { style: "font-weight:950" }, r.status)]),
              h("div", { class: "split", style: "margin-top:8px" }, [h("div", { class: "muted" }, "Amount"), h("div", { style: "font-weight:950" }, money(r.amount))]),
              h("div", { class: "split", style: "margin-top:8px" }, [h("div", { class: "muted" }, "Payee"), h("div", { style: "font-weight:950" }, payee?.name || "—")]),
              h("div", { class: "split", style: "margin-top:8px" }, [h("div", { class: "muted" }, "Linked"), h("div", { style: "font-weight:950" }, linkedLabel)]),
              h("div", { class: "split", style: "margin-top:8px" }, [h("div", { class: "muted" }, "Updated"), h("div", { style: "font-weight:950" }, fmtDateTime(r.updatedAt))]),
            ]),
            h("div", { class: "card pad" }, [
              h("div", { style: "font-weight:950" }, "History"),
              h("div", { class: "muted", style: "margin-top:8px;white-space:pre-wrap" }, (r.history || []).slice(-12).map((x) => `• ${fmtDateTime(x.at)} — ${x.by} — ${x.status}${x.note ? ` (${x.note})` : ""}`).join("\n") || "—"),
            ]),
          ]),
          footer: h("div", { class: "hstack" }, [h("button", { class: "btn primary", type: "button", "data-action": "closeModal" }, "Close")]),
          onReady: ({ root, close }) => on($("[data-action='closeModal']", root), "click", close),
        });
        return;
      }

      // Disputes
      if (act === "disputeOpenFromMilestone") {
        const jobId = el.getAttribute("data-job");
        const msId = el.getAttribute("data-ms");
        if (!perms().canDispute) return toast("Not allowed", "Your role cannot open disputes.");
        const reason = await promptModal({ title: "Open dispute", label: "Reason", placeholder: "e.g. evidence missing / variation not approved", value: "" });
        if (reason === null) return;
        const d = { id: uid("disp"), jobId, targetType: "milestone", targetId: msId, status: "Open", pauseRelease: true, reason, createdAt: Date.now(), updatedAt: Date.now(), timeline: [{ id: uid("dmsg"), at: Date.now(), actorRole: state.role, type: "Opened", text: reason }] };
        state.db.disputes.push(d);
        audit("openedDispute", "dispute", d.id, jobId, { targetType: d.targetType, targetId: d.targetId });
        saveDb();
        toast("Dispute opened", "Release will be paused until resolved.");
        location.hash = "#/disputes";
        return;
      }

      if (act === "dispTogglePause") {
        const d = getDispute(el.getAttribute("data-id"));
        if (!d) return;
        d.pauseRelease = !d.pauseRelease;
        d.updatedAt = Date.now();
        d.timeline ||= [];
        d.timeline.push({ id: uid("dmsg"), at: Date.now(), actorRole: state.role, type: "Pause", text: d.pauseRelease ? "Paused release" : "Unpaused release" });
        audit("disputePauseToggled", "dispute", d.id, d.jobId, { pauseRelease: d.pauseRelease });
        saveDb();
        toast("Updated", d.pauseRelease ? "Release paused." : "Release unpaused.");
        route();
        return;
      }

      if (act === "dispClose") {
        const d = getDispute(el.getAttribute("data-id"));
        if (!d) return;
        const note = await promptModal({ title: "Close dispute", label: "Resolution note", placeholder: "e.g. evidence provided / amount corrected", value: "" });
        if (note === null) return;
        d.status = "Closed";
        d.pauseRelease = false;
        d.updatedAt = Date.now();
        d.timeline ||= [];
        d.timeline.push({ id: uid("dmsg"), at: Date.now(), actorRole: state.role, type: "Closed", text: note });
        audit("disputeClosed", "dispute", d.id, d.jobId, { note });
        saveDb();
        toast("Closed", "Dispute closed and release unpaused.");
        route();
        return;
      }

      if (act === "dispDetails") {
        const d = getDispute(el.getAttribute("data-id"));
        if (!d) return;
        openModal({
          title: "Dispute details",
          body: h("div", { class: "vstack" }, [
            h("div", { class: "card pad" }, [
              h("div", { style: "font-weight:950" }, "Timeline"),
              h("div", { class: "muted", style: "margin-top:10px;white-space:pre-wrap" }, (d.timeline || []).map((x) => `• ${fmtDateTime(x.at)} — ${x.actorRole} — ${x.type}: ${x.text}`).join("\n") || "—"),
            ]),
          ]),
          footer: h("div", { class: "hstack" }, [h("button", { class: "btn primary", type: "button", "data-action": "closeModal" }, "Close")]),
          onReady: ({ root, close }) => on($("[data-action='closeModal']", root), "click", close),
        });
        return;
      }

      // Messages
      if (act === "msgJobChange") {
        const v = $("#msgJob")?.value;
        if (v) location.hash = `#/messages?job=${encodeURIComponent(v)}`;
        return;
      }

      if (act === "msgSend") {
        const jobId = el.getAttribute("data-job");
        const text = ($("#msgText")?.value || "").trim();
        if (!text) return toast("Empty", "Type a message first.");
        state.db.messages.push({ id: uid("msg"), jobId, at: Date.now(), actorRole: state.role, text, attachments: [] });
        audit("messagePosted", "message", "msg", jobId, {});
        saveDb();
        $("#msgText").value = "";
        route();
        return;
      }

      if (act === "snapPdf") {
        const msgId = el.getAttribute("data-msg");
        const attId = el.getAttribute("data-att");
        const msg = state.db.messages.find((m) => m.id === msgId);
        const att = (msg?.attachments || []).find((a) => a.id === attId);
        if (!att?.snapshot) return;

        // Build a tiny printable element from snapshot
        const snap = att.snapshot;
        const node = document.createElement("div");
        node.innerHTML = `
          <div style="font-family:Inter,Arial,sans-serif">
            <h2 style="margin:0 0 10px 0">${esc(APP.name)} — Invoice Summary (Snapshot)</h2>
            <div style="font-size:12px;color:#444;margin-bottom:10px">${esc(COMPLIANCE.VAT_DISCLAIMER)}</div>
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="padding:8px;border:1px solid #ddd">Invoice</td><td style="padding:8px;border:1px solid #ddd">${esc(snap.invoiceTitle || "")}</td></tr>
              <tr><td style="padding:8px;border:1px solid #ddd">Client payment before VAT</td><td style="padding:8px;border:1px solid #ddd">${money(snap.clientPaymentBeforeVat)}</td></tr>
              <tr><td style="padding:8px;border:1px solid #ddd">Total to payees</td><td style="padding:8px;border:1px solid #ddd">${money(snap.totalToPayees)}</td></tr>
              <tr><td style="padding:8px;border:1px solid #ddd">VAT rate (fee)</td><td style="padding:8px;border:1px solid #ddd">${esc(String(snap.feeVatRate))}%</td></tr>
            </table>
          </div>
        `;
        await generatePdfFromElement(node, `${safeFile(snap.invoiceTitle || "invoice")}_snapshot.pdf`);
        return;
      }

      // Reports CSV
      if (act === "csv") {
        const type = el.getAttribute("data-type");
        const d = state.db;

        const maps = {
          jobs: () => [["id","name","location","status","ringfencedBalance","createdAt","updatedAt"]].concat(d.jobs.map(j => [j.id,j.name,j.location,j.status,j.ringfencedBalance,j.createdAt,j.updatedAt])),
          invoices: () => [["id","jobId","title","payeeId","status","totalToPayees","clientPaymentBeforeVat","feeVatRate","createdAt","updatedAt"]].concat(d.invoices.map(i => [i.id,i.jobId,i.title,i.payeeId,i.status,i.totalToPayees,i.clientPaymentBeforeVat,i.feeVatRate,i.createdAt,i.updatedAt])),
          milestones: () => [["id","jobId","title","amount","evidenceRequired","evidenceStatus","approvalStatus","releaseStatus","payeeId","changeRequestId","createdAt","updatedAt"]].concat(d.milestones.map(m => [m.id,m.jobId,m.title,m.amount,m.evidenceRequired,m.evidenceStatus,m.approvalStatus,m.releaseStatus,m.payeeId,m.changeRequestId||"",m.createdAt,m.updatedAt])),
          releases: () => [["id","jobId","payeeId","linkedType","linkedId","amount","status","createdAt","updatedAt"]].concat(d.releases.map(r => [r.id,r.jobId,r.payeeId,r.linkedType,r.linkedId,r.amount,r.status,r.createdAt,r.updatedAt])),
          disputes: () => [["id","jobId","targetType","targetId","status","pauseRelease","createdAt","updatedAt","reason"]].concat(d.disputes.map(x => [x.id,x.jobId,x.targetType,x.targetId,x.status,x.pauseRelease,x.createdAt,x.updatedAt,x.reason||""])),
          messages: () => [["id","jobId","at","actorRole","text"]].concat(d.messages.map(m => [m.id,m.jobId,m.at,m.actorRole,m.text])),
          payees: () => [["id","name","type","email","phone","bankConfirmed","bankChanged","bankChangedAt","sortCode","accountNumber"]].concat(d.payees.map(p => [p.id,p.name,p.type,p.email,p.phone,p.bankConfirmed,p.bankChanged,p.bankChangedAt||"",p.bank.sortCode,p.bank.accountNumber])),
          audit: () => [["id","at","actorRole","action","entityType","entityId","jobId"]].concat(d.auditLog.map(a => [a.id,a.at,a.actorRole,a.action,a.entityType,a.entityId,a.jobId||""])),
        };

        if (!maps[type]) return;
        const rows = maps[type]();
        downloadText(`approvehub_${type}.csv`, toCsv(rows), "text/csv");
        toast("Exported", `${type.toUpperCase()} CSV downloaded.`);
        return;
      }

      // Settings
      if (act === "toggleTheme") return toggleTheme();

      if (act === "reset") {
        if (state.role === "payee") return toast("Not allowed", "Payee role cannot reset demo data.");
        openModal({
          title: "Reset demo",
          body: h("div", { class: "banner warn" }, [
            h("div", { class: "title" }, "This will clear all local demo data"),
            h("div", { class: "body" }, "One-click reset will wipe localStorage for this demo and restore seed data."),
          ]),
          footer: h("div", { class: "hstack" }, [
            h("button", { class: "btn", type: "button", "data-action": "closeModal" }, "Cancel"),
            h("button", { class: "btn danger", type: "button", "data-action": "resetConfirm" }, "Reset"),
          ]),
          onReady: ({ root, close }) => {
            on($("[data-action='closeModal']", root), "click", close);
            on($("[data-action='resetConfirm']", root), "click", () => {
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
        return;
      }
    });

    // Keyboard “enter to open card”
    delegate(view, "keydown", "[data-nav]", (e, el) => {
      if (e.key !== "Enter") return;
      const href = el.getAttribute("data-nav");
      if (href) location.hash = href;
    });

    // Click navigation cards
    delegate(view, "click", "[data-nav]", (e, el) => {
      const href = el.getAttribute("data-nav");
      if (href) location.hash = href;
    });

    // Invoice live inputs
    delegate(view, "change", "#clientPaymentInput", (e, el) => {
      const inv = getInvoice(el.getAttribute("data-inv"));
      if (!inv) return;
      inv.clientPaymentBeforeVat = Math.max(0, Number(el.value || 0));
      inv.updatedAt = Date.now();
      audit("invoiceClientPaymentUpdated", "invoice", inv.id, inv.jobId, { clientPaymentBeforeVat: inv.clientPaymentBeforeVat });
      saveDb();
      route();
    });

    delegate(view, "change", "#vatRateSelect", (e, el) => {
      const invId = parseHash().path.match(/^\/invoices\/(?<invoiceId>[^/]+)$/)?.groups?.invoiceId;
      const inv = invId ? getInvoice(invId) : null;
      if (!inv) return;
      const custom = $("#vatRateCustom");
      if (custom) custom.disabled = el.value !== "custom";
      inv.feeVatRate = el.value === "custom" ? clamp(custom?.value, 0, 100) : clamp(el.value, 0, 100);
      inv.updatedAt = Date.now();
      audit("invoiceVatRateUpdated", "invoice", inv.id, inv.jobId, { feeVatRate: inv.feeVatRate });
      saveDb();
      route();
    });

    delegate(view, "change", "#vatRateCustom", (e, el) => {
      const invId = parseHash().path.match(/^\/invoices\/(?<invoiceId>[^/]+)$/)?.groups?.invoiceId;
      const inv = invId ? getInvoice(invId) : null;
      if (!inv) return;
      const sel = $("#vatRateSelect");
      if (sel && sel.value !== "custom") return;
      inv.feeVatRate = clamp(el.value, 0, 100);
      inv.updatedAt = Date.now();
      audit("invoiceVatRateUpdated", "invoice", inv.id, inv.jobId, { feeVatRate: inv.feeVatRate });
      saveDb();
      route();
    });
  }

  /* =========================
     Init / Boot
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
        seedIfNeeded();
        saveDb();
      }
    }

    updateNavVisibility();
    updateNavCounters();
    initHeader();
    initGlobalActions();

    on(window, "hashchange", route);
    if (!location.hash || location.hash === "#") location.hash = "#/jobs";
    route();
  }

  // Theme dropdown + import file input are in Settings page, so handle them globally by watching hash changes
  on(window, "hashchange", () => {
    // Settings page hooks
    if (location.hash.startsWith("#/settings")) {
      const sel = $("#themeMode");
      if (sel) {
        sel.value = localStorage.getItem(APP.themeKey) || "system";
        on(sel, "change", () => {
          localStorage.setItem(APP.themeKey, sel.value);
          applyThemeFromStorage();
          toast("Theme", `Set to ${sel.value}`);
        });
      }

      const file = $("#importFile");
      if (file) {
        on(file, "change", async () => {
          if (state.role === "payee") {
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
      }
    }
  });

  // Boot
  initCore();
})();
