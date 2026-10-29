/* ============================================================
   Ledger — personal finance tracker
   Vanilla JS, no dependencies. State lives in localStorage.
   ============================================================ */
(() => {
  "use strict";

  const STORAGE_KEY = "ledger.transactions.v1";
  const SEED_FLAG   = "ledger.seeded.v1";
  const THEME_KEY   = "ledger.theme.v1";

  const CATEGORIES = {
    expense: ["Food", "Transport", "Shopping", "Bills", "Housing", "Health", "Other"],
    income:  ["Salary", "Freelance", "Interest", "Other"]
  };

  /* ---------- DOM ---------- */
  const $ = (sel) => document.querySelector(sel);
  const el = {
    sidebar: $("#sidebar"), scrim: $("#scrim"), menuBtn: $("#menuBtn"),
    navItems: [...document.querySelectorAll(".nav__item")],
    pageTitle: $("#pageTitle"), periodEyebrow: $("#periodEyebrow"),
    views: {
      overview: $("#view-overview"),
      transactions: $("#view-transactions"),
      monthly: $("#view-monthly")
    },
    sumBalance: $("#sumBalance"), sumIncome: $("#sumIncome"), sumExpense: $("#sumExpense"),
    sumBalanceMeta: $("#sumBalanceMeta"), sumIncomeMeta: $("#sumIncomeMeta"), sumExpenseMeta: $("#sumExpenseMeta"),
    chart: $("#chart"), chartEmpty: $("#chartEmpty"), chartTable: $("#chartTable"), chartTableDesc: $("#chartTableDesc"),
    breakdown: $("#breakdown"), breakdownHint: $("#breakdownHint"),
    recentBody: $("#recentBody"), recentEmpty: $("#recentEmpty"),
    search: $("#search"), filterCategory: $("#filterCategory"), filterType: $("#filterType"), sortBy: $("#sortBy"),
    txBody: $("#txBody"), txEmpty: $("#txEmpty"), txEmptyText: $("#txEmptyText"), txCount: $("#txCount"),
    clearFilters: $("#clearFilters"), exportCsv: $("#exportCsv"),
    monthPicker: $("#monthPicker"), monthNote: $("#monthNote"),
    monthNet: $("#monthNet"), monthIncome: $("#monthIncome"), monthExpense: $("#monthExpense"),
    monthBody: $("#monthBody"), monthEmpty: $("#monthEmpty"), monthTableTitle: $("#monthTableTitle"),
    openAdd: $("#openAdd"), resetSample: $("#resetSample"), toast: $("#toast"),
    themeToggle: $("#themeToggle"), themeLabel: $("#themeLabel"),
    entryDialog: $("#entryDialog"), entryForm: $("#entryForm"), entryId: $("#entryId"),
    entryDesc: $("#entryDesc"), entryAmount: $("#entryAmount"), entryDate: $("#entryDate"),
    entryCategory: $("#entryCategory"), dialogTitle: $("#dialogTitle"),
    closeDialog: $("#closeDialog"), cancelDialog: $("#cancelDialog"), saveEntry: $("#saveEntry"),
    errDesc: $("#errDesc"), errAmount: $("#errAmount"), errDate: $("#errDate"), errCategory: $("#errCategory"),
    formError: $("#formError"),
    confirmDialog: $("#confirmDialog"), confirmBody: $("#confirmBody"),
    cancelDelete: $("#cancelDelete"), confirmDelete: $("#confirmDelete")
  };

  /* ---------- State ---------- */
  let transactions = [];
  let currentView = "overview";
  let pendingDeleteId = null;
  let storageBroken = false;

  /* ---------- Utilities ---------- */
  const money = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2 });
  const fmt = (n) => money.format(n);
  const fmtCompact = (n) => {
    if (Math.abs(n) >= 1000) return "$" + (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + "k";
    return "$" + Math.round(n);
  };
  const uid = () => "t_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const todayISO = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local
  const monthKey = (iso) => iso.slice(0, 7);
  const monthName = (key) => {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" });
  };
  const shortMonth = (key) => {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short" });
  };
  const dateLabel = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };
  const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.toast.hidden = true; }, 2600);
  }

  /* ---------- Storage ---------- */
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) {
        // first launch: seed sample data
        if (!localStorage.getItem(SEED_FLAG)) {
          transactions = sampleData();
          save();
          localStorage.setItem(SEED_FLAG, "1");
          return;
        }
        transactions = [];
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error("Corrupt store");
      transactions = parsed.filter(isValidTx).map(normaliseTx);
    } catch (e) {
      storageBroken = true;
      transactions = [];
      console.error("Ledger: failed to read storage", e);
      setTimeout(() => toast("Saved data could not be read. Starting with an empty ledger."), 0);
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
      storageBroken = false;
      return true;
    } catch (e) {
      storageBroken = true;
      console.error("Ledger: failed to write storage", e);
      toast("Could not save. Storage may be full or blocked.");
      return false;
    }
  }

  const isValidTx = (t) =>
    t && typeof t === "object" &&
    typeof t.id === "string" &&
    (t.type === "income" || t.type === "expense") &&
    typeof t.desc === "string" &&
    typeof t.category === "string" &&
    typeof t.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.date) &&
    Number.isFinite(Number(t.amount)) && Number(t.amount) > 0;

  const normaliseTx = (t) => ({
    id: t.id, type: t.type, desc: t.desc.trim(),
    category: t.category, date: t.date,
    amount: Math.round(Number(t.amount) * 100) / 100
  });

  function sampleData() {
    const y = new Date().getFullYear();
    const m = new Date().getMonth();
    const at = (monthOffset, day) => {
      const d = new Date(y, m - monthOffset, day);
      return d.toLocaleDateString("en-CA");
    };
    return [
      { id: uid(), type: "income",  desc: "Monthly salary",        category: "Salary",    date: at(0, 1),  amount: 4200 },
      { id: uid(), type: "expense", desc: "Apartment rent",        category: "Housing",   date: at(0, 2),  amount: 1450 },
      { id: uid(), type: "expense", desc: "Weekly groceries",      category: "Food",      date: at(0, 4),  amount: 96.4 },
      { id: uid(), type: "expense", desc: "Metro pass",            category: "Transport", date: at(0, 5),  amount: 62 },
      { id: uid(), type: "expense", desc: "Electricity bill",      category: "Bills",     date: at(0, 8),  amount: 74.2 },
      { id: uid(), type: "expense", desc: "Running shoes",         category: "Shopping",  date: at(0, 10), amount: 128 },
      { id: uid(), type: "income",  desc: "Monthly salary",        category: "Salary",    date: at(1, 1),  amount: 4200 },
      { id: uid(), type: "expense", desc: "Apartment rent",        category: "Housing",   date: at(1, 2),  amount: 1450 },
      { id: uid(), type: "expense", desc: "Dinner with friends",   category: "Food",      date: at(1, 12), amount: 84.5 },
      { id: uid(), type: "expense", desc: "Phone plan",            category: "Bills",     date: at(1, 14), amount: 45 },
      { id: uid(), type: "income",  desc: "Freelance invoice",     category: "Freelance", date: at(1, 18), amount: 850 },
      { id: uid(), type: "expense", desc: "Apartment rent",        category: "Housing",   date: at(2, 2),  amount: 1450 },
      { id: uid(), type: "income",  desc: "Monthly salary",        category: "Salary",    date: at(2, 1),  amount: 4200 },
      { id: uid(), type: "expense", desc: "Train tickets",         category: "Transport", date: at(2, 9),  amount: 112.8 },
      { id: uid(), type: "expense", desc: "Pharmacy",             category: "Health",    date: at(2, 20), amount: 34.6 }
    ];
  }

  /* ---------- Selectors / computations ---------- */
  const totalsFor = (list) => {
    let income = 0, expense = 0;
    for (const t of list) {
      if (t.type === "income") income += t.amount;
      else expense += t.amount;
    }
    return { income, expense, balance: income - expense };
  };

  function totalsByMonth(list) {
    const map = new Map();
    for (const t of list) {
      const k = monthKey(t.date);
      if (!map.has(k)) map.set(k, { income: 0, expense: 0 });
      const agg = map.get(k);
      if (t.type === "income") agg.income += t.amount;
      else agg.expense += t.amount;
    }
    return map;
  }

  function categoryBreakdown(list) {
    const map = new Map();
    let total = 0;
    for (const t of list) {
      if (t.type !== "expense") continue;
      map.set(t.category, (map.get(t.category) || 0) + t.amount);
      total += t.amount;
    }
    return { rows: [...map.entries()].sort((a, b) => b[1] - a[1]), total };
  }

  const filteredSorted = () => {
    const q = el.search.value.trim().toLowerCase();
    const cat = el.filterCategory.value;
    const type = el.filterType.value;
    let list = transactions.filter((t) => {
      if (cat !== "all" && t.category !== cat) return false;
      if (type !== "all" && t.type !== type) return false;
      if (q && !t.desc.toLowerCase().includes(q) && !t.category.toLowerCase().includes(q)) return false;
      return true;
    });
    const sort = el.sortBy.value;
    list.sort((a, b) => {
      switch (sort) {
        case "date-asc":    return a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
        case "amount-desc": return b.amount - a.amount;
        case "amount-asc":  return a.amount - b.amount;
        default:            return b.date.localeCompare(a.date) || b.id.localeCompare(a.id);
      }
    });
    return list;
  };

  /* ---------- Rendering ---------- */
  function renderAll() {
    renderSummary();
    renderChart();
    renderBreakdown();
    renderRecent();
    renderTransactions();
    renderMonthly();
  }

  function renderSummary() {
    const t = totalsFor(transactions);
    el.sumBalance.textContent = fmt(t.balance);
    el.sumIncome.textContent = fmt(t.income);
    el.sumExpense.textContent = fmt(t.expense);
    el.sumBalance.classList.toggle("is-debit", t.balance < 0);
    el.sumBalance.classList.toggle("is-credit", false);

    const months = totalsByMonth(transactions);
    const active = [...months.keys()].sort();
    el.sumBalanceMeta.textContent = transactions.length
      ? `Across ${active.length} month${active.length === 1 ? "" : "s"}, ${transactions.length} entr${transactions.length === 1 ? "y" : "ies"}`
      : "No entries yet";
    el.sumIncomeMeta.textContent = t.income > 0 ? `Average ${fmt(t.income / Math.max(active.length, 1))} per active month` : "No income recorded";
    el.sumExpenseMeta.textContent = t.expense > 0 ? `Average ${fmt(t.expense / Math.max(active.length, 1))} per active month` : "No expenses recorded";
  }

  function renderChart() {
    const byMonth = totalsByMonth(transactions);
    const keys = [...byMonth.keys()].sort();
    const recent = keys.slice(-6);

    el.chartTable.innerHTML = "";
    el.chartTableDesc.textContent = "";

    const hasExpense = recent.some((k) => byMonth.get(k).expense > 0);
    el.chartEmpty.hidden = recent.length > 0 && hasExpense;
    el.chart.innerHTML = "";
    if (recent.length === 0) return;

    const W = 640, H = 260;
    const pad = { top: 22, right: 12, bottom: 34, left: 46 };
    const innerW = W - pad.left - pad.right;
    const innerH = H - pad.top - pad.bottom;

    const values = recent.map((k) => byMonth.get(k).expense);
    const maxVal = Math.max(...values, 1);
    // round the ceiling to a friendly step so gridlines read cleanly
    const step = maxVal <= 100 ? 25 : maxVal <= 500 ? 100 : maxVal <= 2000 ? 500 : 1000;
    const ceiling = Math.ceil(maxVal / step) * step;

    const svgNS = "http://www.w3.org/2000/svg";
    const mk = (tag, attrs) => {
      const node = document.createElementNS(svgNS, tag);
      for (const k in attrs) node.setAttribute(k, attrs[k]);
      return node;
    };

    el.chart.setAttribute("viewBox", `0 0 ${W} ${H}`);
    el.chart.setAttribute("aria-label", `Monthly expenses, ${monthName(recent[0])} to ${monthName(recent[recent.length - 1])}`);

    // gridlines + y ticks
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const v = (ceiling / ticks) * i;
      const y = pad.top + innerH - (v / ceiling) * innerH;
      el.chart.appendChild(mk("line", { x1: pad.left, x2: W - pad.right, y1: y, y2: y, class: i === 0 ? "axis-line" : "grid-line" }));
      const label = mk("text", { x: pad.left - 8, y: y + 3.5, "text-anchor": "end", class: "tick-label" });
      label.textContent = v === 0 ? "$0" : fmtCompact(v);
      el.chart.appendChild(label);
    }

    const slot = innerW / recent.length;
    const barW = Math.min(46, slot * 0.52);

    recent.forEach((k, i) => {
      const agg = byMonth.get(k);
      const v = agg.expense;
      const h = (v / ceiling) * innerH;
      const x = pad.left + slot * i + (slot - barW) / 2;
      const y = pad.top + innerH - h;

      const bar = mk("rect", {
        x, y: v === 0 ? pad.top + innerH - 2 : y,
        width: barW, height: v === 0 ? 2 : h,
        rx: 1.5,
        class: v === 0 ? "bar bar--zero" : "bar",
        tabindex: "0",
        role: "img",
        "aria-label": `${monthName(k)}: expenses ${fmt(v)}, income ${fmt(agg.income)}`
      });
      const title = document.createElementNS(svgNS, "title");
      title.textContent = `${monthName(k)} · expenses ${fmt(v)} · income ${fmt(agg.income)}`;
      bar.appendChild(title);
      el.chart.appendChild(bar);

      if (v > 0 && slot > 52) {
        const vl = mk("text", { x: x + barW / 2, y: y - 6, "text-anchor": "middle", class: "value-label" });
        vl.textContent = fmtCompact(v);
        el.chart.appendChild(vl);
      }

      const ml = mk("text", { x: pad.left + slot * i + slot / 2, y: H - pad.bottom + 18, "text-anchor": "middle", class: "month-label" });
      ml.textContent = shortMonth(k);
      el.chart.appendChild(ml);

      if (i === recent.length - 1) {
        const yl = mk("text", { x: pad.left + slot * i + slot / 2, y: H - pad.bottom + 30, "text-anchor": "middle", class: "tick-label" });
        yl.textContent = k.slice(0, 4);
        el.chart.appendChild(yl);
      }
    });

    // accessible table mirror
    const thead = document.createElement("thead");
    thead.innerHTML = "<tr><th>Month</th><th>Income</th><th>Expenses</th></tr>";
    const tbody = document.createElement("tbody");
    recent.forEach((k) => {
      const a = byMonth.get(k);
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${monthName(k)}</td><td>${fmt(a.income)}</td><td>${fmt(a.expense)}</td>`;
      tbody.appendChild(tr);
    });
    el.chartTable.append(thead, tbody);
    el.chartTableDesc.textContent = "Same data as a table is available below the chart for screen readers.";
  }

  function renderBreakdown() {
    const { rows, total } = categoryBreakdown(transactions);
    el.breakdown.innerHTML = "";
    el.breakdownHint.textContent = total > 0
      ? `Expenses, all time · ${fmt(total)} total`
      : "Expenses, all time";

    if (rows.length === 0) {
      const li = document.createElement("li");
      li.className = "breakdown__empty";
      li.textContent = "No expenses recorded yet.";
      el.breakdown.appendChild(li);
      return;
    }
    for (const [cat, amt] of rows) {
      const pct = total > 0 ? (amt / total) * 100 : 0;
      const li = document.createElement("li");
      li.className = "breakdown__row";
      li.innerHTML = `
        <span class="breakdown__name">${escapeHtml(cat)}</span>
        <span class="breakdown__amt">${escapeHtml(fmt(amt))}</span>
        <span class="breakdown__bar"><span class="breakdown__fill" style="width:${pct.toFixed(1)}%"></span></span>
      `;
      el.breakdown.appendChild(li);
    }
  }

  function renderRecent() {
    const list = [...transactions]
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
      .slice(0, 6);
    el.recentBody.innerHTML = "";
    el.recentEmpty.hidden = list.length > 0;
    for (const t of list) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="date-cell">${dateLabel(t.date)}</td>
        <td class="desc-cell"><span>${escapeHtml(t.desc)}</span></td>
        <td><span class="tag ${t.type === "income" ? "tag--income" : ""}">${escapeHtml(t.category)}</span></td>
        <td class="num ${t.type === "income" ? "is-credit" : "is-debit"}">${t.type === "income" ? "+" : "-"}${escapeHtml(fmt(t.amount))}</td>
      `;
      el.recentBody.appendChild(tr);
    }
  }

  function renderTransactions() {
    const list = filteredSorted();
    el.txBody.innerHTML = "";
    el.txEmpty.hidden = list.length > 0;

    const anyFilter = el.search.value.trim() || el.filterCategory.value !== "all" || el.filterType.value !== "all";
    el.txEmptyText.textContent = transactions.length === 0
      ? "Your ledger is empty. Record the first entry to get started."
      : anyFilter
        ? "No entries match these filters."
        : "Nothing to show.";
    el.clearFilters.hidden = !anyFilter;

    for (const t of list) {
      const tr = document.createElement("tr");
      tr.dataset.id = t.id;
      tr.innerHTML = `
        <td class="date-cell">${t.date}</td>
        <td class="desc-cell"><span title="${escapeHtml(t.desc)}">${escapeHtml(t.desc)}</span></td>
        <td><span class="tag ${t.type === "income" ? "tag--income" : ""}">${escapeHtml(t.category)}</span></td>
        <td class="num ${t.type === "income" ? "is-credit" : "is-debit"}">${t.type === "income" ? "+" : "-"}${escapeHtml(fmt(t.amount))}</td>
        <td class="actions-col">
          <div class="row-actions">
            <button class="row-btn" type="button" data-act="edit" data-id="${t.id}" aria-label="Edit ${escapeHtml(t.desc)}">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M11 2.5l2.5 2.5L5 13.5H2.5V11z"/></svg>
            </button>
            <button class="row-btn row-btn--del" type="button" data-act="delete" data-id="${t.id}" aria-label="Delete ${escapeHtml(t.desc)}">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M2.5 4h11M6 4V2.5h4V4M4.5 4l.7 9h5.6l.7-9"/></svg>
            </button>
          </div>
        </td>
      `;
      el.txBody.appendChild(tr);
    }

    const t = totalsFor(list);
    el.txCount.textContent = list.length === 0
      ? "Showing 0 entries"
      : `Showing ${list.length} of ${transactions.length} · in view: ${fmt(t.income)} in, ${fmt(t.expense)} out, net ${fmt(t.balance)}`;
  }

  function renderMonthly() {
    const key = el.monthPicker.value;
    if (!key) return;
    const list = transactions.filter((t) => monthKey(t.date) === key)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    const t = totalsFor(list);

    el.monthNet.textContent = fmt(t.balance);
    el.monthNet.classList.toggle("is-debit", t.balance < 0);
    el.monthNet.classList.toggle("is-credit", t.balance > 0);
    el.monthIncome.textContent = fmt(t.income);
    el.monthExpense.textContent = fmt(t.expense);

    el.monthTableTitle.textContent = `Entries · ${monthName(key)}`;
    el.monthBody.innerHTML = "";
    el.monthEmpty.hidden = list.length > 0;
    for (const tx of list) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="date-cell">${dateLabel(tx.date)}</td>
        <td class="desc-cell"><span title="${escapeHtml(tx.desc)}">${escapeHtml(tx.desc)}</span></td>
        <td><span class="tag ${tx.type === "income" ? "tag--income" : ""}">${escapeHtml(tx.category)}</span></td>
        <td class="num ${tx.type === "income" ? "is-credit" : "is-debit"}">${tx.type === "income" ? "+" : "-"}${escapeHtml(fmt(tx.amount))}</td>
      `;
      el.monthBody.appendChild(tr);
    }

    const allMonths = [...totalsByMonth(transactions).keys()].sort();
    const idx = allMonths.indexOf(key);
    if (idx === -1 || allMonths.length < 2) {
      el
