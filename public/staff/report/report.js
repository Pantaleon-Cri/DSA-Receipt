// ===================== REPORT STATE =====================
let currentReportData = [];
let currentInterval = "day";
let currentSelection = "";

// IMPORTANT: must be let (not const) because we will overwrite it from API
let STUDENT_POPULATION = 1000;

// ✅ Logged in user name (for Excel "Received By")
let CURRENT_USER_NAME = "";

// Fallback fees (will be overwritten by API if /api/fees works)
// Only NON-OFFICER fees should appear in breakdown (role = "0")
let activeFees = [
  { name: "No Fees", price: 0, role: "0" },
];

// Active semester ID (will be fetched from /api/term/active)
let ACTIVE_SEMESTER_ID = 1;

// ===================== DATE PICKER =====================
function toggleDatePicker() {
  const range = document.getElementById("report-range").value;
  currentInterval = range;
  document.getElementById("date-picker-day").classList.toggle("hidden", range !== "day");
  document.getElementById("date-picker-week").classList.toggle("hidden", range !== "week");
  document.getElementById("date-picker-month").classList.toggle("hidden", range !== "month");
}

// ===================== API HELPERS =====================
async function fetchJSON(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error(data?.message || `Request failed: ${res.status}`);
  }
  return data;
}

// ✅ Read logged user from localStorage (matches your log_user.js)
function getLoggedUserFromLocalStorage() {
  try {
    const raw = localStorage.getItem("loggedUser");
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn("[USER] Failed to parse loggedUser from localStorage:", e);
    return null;
  }
}

// ✅ Build a display name from your stored user object
function buildUserDisplayName(user) {
  if (!user) return "";

  // Try common keys (based on your log_user.js)
  const first =
    user.user_firstName ??
    user.user_firstname ??
    user.first_name ??
    user.firstname ??
    "";

  const last =
    user.user_lastName ??
    user.user_lastname ??
    user.last_name ??
    user.lastname ??
    "";

  const full =
    user.fullname ??
    user.full_name ??
    user.name ??
    "";

  // Prefer first+last if present, else fallback to fullname/name
  const name = `${String(first).trim()} ${String(last).trim()}`.trim();
  return name || String(full).trim() || "";
}

// ✅ Optional fallback: fetch from API if you later add sessions
async function fetchCurrentUserFromApi() {
  // If you *do* have sessions later, this will work.
  // Right now, it returns 401 because you’re not using sessions.
  return await fetchJSON("/api/users/me");
}

// Active term: should return semester_id + student_population
async function fetchActiveTerm() {
  return await fetchJSON("/api/term/active");
}

// Pulls grouped transactions for reports (DATE ONLY).
// GET /api/payments/reports/transactions?interval=day|week|month&target=...
async function fetchReportTransactions({ interval, target }) {
  const qs = new URLSearchParams({ interval, target });
  return await fetchJSON(`/api/payments/reports/transactions?${qs.toString()}`);
}

// Pulls fees for expected breakdown (semester-bound).
// Filters OUT officer fees (role = "1"), includes only role = "0".
async function fetchFeesNonOfficer(semester_id) {
  const qs = new URLSearchParams(semester_id ? { semester_id: String(semester_id) } : {});
  const data = await fetchJSON(`/api/fees?${qs.toString()}`);
  const fees = Array.isArray(data.fees) ? data.fees : [];

  const nonOfficerFees = fees.filter(f => String(f.role) === "0");

  return nonOfficerFees.map(f => ({
    name: f.fee_name,
    price: Number(f.fee_amount || 0),
    role: String(f.role ?? "0")
  }));
}

// ===================== UI HELPERS =====================
function setLoadingState(isLoading) {
  const tbody = document.getElementById("transaction-table-body");
  const statsGrid = document.getElementById("dynamic-stats-grid");

  if (isLoading) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="py-12 text-center text-slate-400 text-sm italic">
          Loading report data...
        </td>
      </tr>
    `;
    statsGrid.innerHTML = `
      <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm col-span-full text-center py-12 text-slate-400 italic">
        Loading financial insights...
      </div>
    `;
  }
}

function normalizeTransactions(rows) {
  // expected from backend:
  // { id, studentId, student, fee, amount, status }
  return (Array.isArray(rows) ? rows : []).map(r => ({
    id: r.id ?? r.control_number ?? "",
    studentId: r.studentId ?? r.student_id ?? "",
    student: r.student ?? r.student_name ?? "",
    fee: r.fee ?? r.allocated_fees ?? "",
    amount: Number(r.amount ?? r.total_amount ?? 0),
    status: r.status ?? "Paid"
  }));
}

// ===================== REPORT SEARCH (NEW) =====================
// This filters CURRENT table rows only (client-side).
// It searches: Reference ID, Student ID, Student Name, Allocated Fees, Status
window.filterReportTable = function filterReportTable() {
  const input = document.getElementById("report-search");
  const q = (input?.value || "").toLowerCase().trim();

  // If no data loaded yet, do nothing
  if (!Array.isArray(currentReportData)) return;

  const filtered = !q
    ? currentReportData
    : currentReportData.filter(t => {
        const hay = [
          t.id,
          t.studentId,
          t.student,
          t.fee,
          t.status
        ].join(" ").toLowerCase();
        return hay.includes(q);
      });

  // Re-render table only (stats remain based on full report period)
  const tbody = document.getElementById("transaction-table-body");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="py-12 text-center text-slate-400 text-sm italic">
          No matching transactions.
        </td>
      </tr>
    `;
  } else {
    filtered.forEach(txn => {
      tbody.innerHTML += `
        <tr class="hover:bg-slate-50/50">
          <td class="px-6 py-4 font-mono text-[10px] text-blue-600 font-bold">${txn.id}</td>
          <td class="px-6 py-4 font-mono text-[10px] text-slate-500 font-bold">${txn.studentId}</td>
          <td class="px-6 py-4 font-bold text-slate-800">${txn.student}</td>
          <td class="px-6 py-4 text-[11px] font-medium text-slate-500">${txn.fee}</td>
          <td class="px-6 py-4 font-bold text-slate-900 text-right">
            ${Number(txn.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </td>
          <td class="px-6 py-4 text-center">
            <span class="px-2 py-1 bg-blue-50 text-blue-600 text-[10px] font-black uppercase rounded">${txn.status}</span>
          </td>
        </tr>
      `;
    });
  }

  lucide.createIcons();
};

// ===================== MAIN REPORT =====================
async function generateReport() {
  const range = document.getElementById("report-range").value;
  const selectionEl = document.getElementById(`date-picker-${range}`);
  const selection = selectionEl ? selectionEl.value : "";

  if (!selection) {
    alert("Please select a date first.");
    return;
  }

  currentSelection = selection;
  setLoadingState(true);

  try {
    // 0) Ensure we have CURRENT_USER_NAME
    // ✅ Primary source: localStorage (because that’s what your system uses)
    if (!CURRENT_USER_NAME) {
      const user = getLoggedUserFromLocalStorage();
      CURRENT_USER_NAME = buildUserDisplayName(user);
    }

    // Optional fallback: try API (won’t break export if it fails)
    if (!CURRENT_USER_NAME) {
      try {
        const me = await fetchCurrentUserFromApi();
        CURRENT_USER_NAME =
          me?.user?.name ||
          (me?.user?.user_firstname || me?.user?.user_lastname
            ? `${me.user.user_firstname || ""} ${me.user.user_lastname || ""}`.trim()
            : "") ||
          me?.name ||
          "";
      } catch (e) {
        console.warn("User fetch failed, continuing without name:", e?.message || e);
      }
    }

    // 1) Get active semester + population
    const active = await fetchActiveTerm();
    ACTIVE_SEMESTER_ID = Number(active.semester_id || 1);

    const pop = Number(active.student_population);
    if (!Number.isNaN(pop)) STUDENT_POPULATION = pop;

    // 2) Load NON-OFFICER fees
    try {
      const feesFromApi = await fetchFeesNonOfficer(ACTIVE_SEMESTER_ID);
      if (feesFromApi.length > 0) {
        activeFees = feesFromApi;
      } else {
        console.warn("No non-officer fees found for this semester. Using fallback fees.");
      }
    } catch (e) {
      console.warn("Fees fetch failed, using fallback activeFees:", e?.message || e);
    }

    // 3) Fetch transactions report
    const api = await fetchReportTransactions({
      interval: range,
      target: selection
    });

    currentReportData = normalizeTransactions(api.transactions);

    document.getElementById("log-date-display").innerText = `Period: ${selection.toUpperCase()}`;

    document.getElementById("download-btn")?.classList.remove("hidden");
    document.getElementById("report-search-wrap")?.classList.remove("hidden");

    const searchInput = document.getElementById("report-search");
    if (searchInput) searchInput.value = "";

    const tbody = document.getElementById("transaction-table-body");
    tbody.innerHTML = "";

    if (currentReportData.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="py-12 text-center text-slate-400 text-sm italic">
            No transactions found for this period.
          </td>
        </tr>
      `;
    } else {
      currentReportData.forEach(txn => {
        tbody.innerHTML += `
          <tr class="hover:bg-slate-50/50">
            <td class="px-6 py-4 font-mono text-[10px] text-blue-600 font-bold">${txn.id}</td>
            <td class="px-6 py-4 font-mono text-[10px] text-slate-500 font-bold">${txn.studentId}</td>
            <td class="px-6 py-4 font-bold text-slate-800">${txn.student}</td>
            <td class="px-6 py-4 text-[11px] font-medium text-slate-500">${txn.fee}</td>
            <td class="px-6 py-4 font-bold text-slate-900 text-right">
              ${Number(txn.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </td>
            <td class="px-6 py-4 text-center">
              <span class="px-2 py-1 bg-blue-50 text-blue-600 text-[10px] font-black uppercase rounded">${txn.status}</span>
            </td>
          </tr>
        `;
      });
    }

    const statsGrid = document.getElementById("dynamic-stats-grid");
    statsGrid.innerHTML = "";

    const totalExpected = activeFees.reduce(
      (sum, f) => sum + (Number(f.price || 0) * STUDENT_POPULATION),
      0
    );
    const actualValue = currentReportData.reduce((sum, txn) => sum + Number(txn.amount || 0), 0);

    statsGrid.innerHTML += `
      <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div class="flex items-center justify-between mb-4">
          <div class="bg-blue-100 p-2 rounded-lg text-blue-600">
            <i data-lucide="wallet" class="w-4 h-4"></i>
          </div>
        </div>
        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
          Actual Total Collection
        </p>
        <h3 class="text-3xl font-black text-slate-900">
          Php ${Number(actualValue).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </h3>
      </div>
    `;

    statsGrid.innerHTML += `
      <div onclick="openBreakdown()" class="bg-white p-6 rounded-2xl border-2 border-slate-200 border-dashed shadow-sm cursor-pointer hover:border-blue-500 hover:bg-blue-50/30 transition-all group">
        <div class="flex items-center justify-between mb-4">
          <div class="bg-emerald-100 p-2 rounded-lg text-emerald-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
            <i data-lucide="calculator" class="w-4 h-4"></i>
          </div>
          <span class="text-[9px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded group-hover:bg-blue-600 group-hover:text-white transition-all">
            VIEW BREAKDOWN
          </span>
        </div>
        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
          Expected Total Collection (Non-Officer Fees)
        </p>
        <h3 class="text-3xl font-black text-slate-900">
          Php ${Number(totalExpected).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </h3>
      </div>
    `;

    lucide.createIcons();
  } catch (e) {
    console.error(e);
    alert(e?.message || "Failed to compile report.");
    document.getElementById("download-btn")?.classList.add("hidden");
    document.getElementById("report-search-wrap")?.classList.add("hidden");
  }
}

// ===================== BREAKDOWN MODAL =====================
function openBreakdown() {
  const modal = document.getElementById("breakdown-modal");
  const content = document.getElementById("modal-content");
  const subtitle = document.getElementById("modal-subtitle");

  subtitle.innerText = `Calculation: Student Population (${Number(STUDENT_POPULATION).toLocaleString()}) x Price`;
  content.innerHTML = "";

  activeFees.forEach(fee => {
    const total = Number(fee.price || 0) * STUDENT_POPULATION;
    content.innerHTML += `
      <div class="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
        <div>
          <p class="text-[10px] font-black text-slate-400 uppercase">Expected ${fee.name}</p>
          <p class="text-xs font-bold text-slate-600">Php ${Number(fee.price || 0)} x ${Number(STUDENT_POPULATION).toLocaleString()} students</p>
        </div>
        <p class="font-black text-slate-900 text-base">
          Php ${Number(total).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </p>
      </div>
    `;
  });

  modal.classList.remove("hidden");
  lucide.createIcons();
}

function closeModal() {
  document.getElementById("breakdown-modal").classList.add("hidden");
}

// ===================== EXCEL STYLES + HELPERS (DEFINE ONCE) =====================
const borderThin = {
  top: { style: "thin", color: { rgb: "94A3B8" } },
  bottom: { style: "thin", color: { rgb: "94A3B8" } },
  left: { style: "thin", color: { rgb: "94A3B8" } },
  right: { style: "thin", color: { rgb: "94A3B8" } }
};

const titleStyle = {
  font: { bold: true, color: { rgb: "FFFFFF" } },
  fill: { fgColor: { rgb: "0F172A" } },
  alignment: { horizontal: "center", vertical: "center" },
  border: borderThin
};

const headerStyle = {
  font: { bold: true, color: { rgb: "FFFFFF" } },
  fill: { fgColor: { rgb: "1E293B" } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: borderThin
};

const denomTitleStyle = {
  font: { bold: true, color: { rgb: "1F2937" } },
  fill: { fgColor: { rgb: "CFE2F3" } },
  alignment: { horizontal: "center", vertical: "center" },
  border: borderThin
};

const denomHeaderStyle = {
  font: { bold: true, color: { rgb: "1F2937" } },
  fill: { fgColor: { rgb: "B6D7F2" } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: borderThin
};

function setStyle(ws, addr, style) {
  if (!ws[addr]) ws[addr] = { t: "s", v: "" };
  ws[addr].s = { ...(ws[addr].s || {}), ...style };
}

function borderRange(ws, rangeA1) {
  const r = XLSX.utils.decode_range(rangeA1);
  for (let R = r.s.r; R <= r.e.r; R++) {
    for (let C = r.s.c; C <= r.e.c; C++) {
      const a = XLSX.utils.encode_cell({ r: R, c: C });
      ws[a] = ws[a] || { t: "s", v: "" };
      ws[a].s = ws[a].s || {};
      ws[a].s.border = borderThin;
      ws[a].s.alignment = ws[a].s.alignment || { vertical: "center" };
    }
  }
}

// ===================== EXCEL EXPORT =====================
function downloadExcel() {
  if (currentReportData.length === 0) return;

  const range = document.getElementById("report-range").value;
  const selection = document.getElementById(`date-picker-${range}`).value;

  const feeTotals = new Map();
  activeFees.forEach(f => feeTotals.set(f.name, 0));

  currentReportData.forEach(t => {
    const feeNames = String(t.fee || "")
      .split(",")
      .map(x => x.trim())
      .filter(Boolean);

    feeNames.forEach(name => {
      const feeObj = activeFees.find(f => f.name === name);
      if (feeObj) {
        feeTotals.set(name, (feeTotals.get(name) || 0) + Number(feeObj.price || 0));
      }
    });
  });

  const totalActual = [...feeTotals.values()].reduce((a, b) => a + Number(b || 0), 0);
  const denoms = [1000, 500, 200, 100, 50, 20, 10, 5, 1];

  // ===================== SHEET 1: TRANSACTION LOG =====================
  const logRows = [];
  logRows.push(["TRANSACTION LOG", "", "", "", "", ""]);
  logRows.push(["Reference ID", "Student ID", "Student Name", "Allocated Fees", "Total Amount", "Status"]);

  currentReportData.forEach(t => {
    logRows.push([t.id, t.studentId, t.student, t.fee, Number(t.amount || 0), t.status]);
  });

  const wsLog = XLSX.utils.aoa_to_sheet(logRows);

  wsLog["!cols"] = [
    { wch: 16 }, { wch: 14 }, { wch: 22 }, { wch: 30 }, { wch: 14 }, { wch: 12 }
  ];

  wsLog["!merges"] = wsLog["!merges"] || [];
  wsLog["!merges"].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } });

  setStyle(wsLog, "A1", titleStyle);
  ["A2", "B2", "C2", "D2", "E2", "F2"].forEach(a => setStyle(wsLog, a, headerStyle));
  borderRange(wsLog, `A2:F${1 + logRows.length}`);

  for (let r = 3; r <= logRows.length; r++) {
    const e = `E${r}`;
    if (wsLog[e]) wsLog[e].z = "#,##0.00";
  }

  // ===================== SHEET 2: BREAKDOWNS + ACKNOWLEDGEMENT =====================
  const bRows = [];

  bRows.push(["AMOUNT BREAKDOWN", "", "", "", "DENOMINATION BREAKDOWN", "", ""]);
  bRows.push(["Metric", "Value", "", "", "Denomination", "No. of Pieces", "Amount"]);

  bRows.push(["Report Period", selection, "", "", "", "", ""]);
  bRows.push(["Population", `${Number(STUDENT_POPULATION).toLocaleString()} Students`, "", "", "", "", ""]);
  bRows.push(["", "", "", "", "", "", ""]);

  activeFees.forEach(fee => {
    const v = Number(feeTotals.get(fee.name) || 0);
    bRows.push([`${fee.name} (Total)`, v, "", "", "", "", ""]);
  });

  bRows.push(["TOTAL COLLECTION", totalActual, "", "", "", "", ""]);
  bRows.push(["", "", "", "", "", "", ""]);

  const denomStartExcelRow = 3;
  denoms.forEach((d, i) => {
    const excelRow = denomStartExcelRow + i;
    const targetIdx = excelRow - 1;
    while (bRows.length <= targetIdx) bRows.push(["", "", "", "", "", "", ""]);

    bRows[targetIdx][4] = d;
    bRows[targetIdx][5] = "";
    bRows[targetIdx][6] = { f: `E${excelRow}*F${excelRow}` };
  });

  const denomTotalExcelRow = denomStartExcelRow + denoms.length;
  while (bRows.length < denomTotalExcelRow) bRows.push(["", "", "", "", "", "", ""]);
  bRows[denomTotalExcelRow - 1][4] = "TOTAL CASH COLLECTED";
  bRows[denomTotalExcelRow - 1][6] = { f: `SUM(G${denomStartExcelRow}:G${denomTotalExcelRow - 1})` };

  bRows.push(["", "", "", "", "", "", ""]);
  bRows.push(["", "", "", "", "", "", ""]);

  const ackTitleRow = bRows.length + 1;

  bRows.push(["Received By:", "", "", "", "", "", ""]);
  bRows.push([CURRENT_USER_NAME || "", "", "", "", "", "", ""]);
  bRows.push(["", "", "", "", "", "", ""]);

  bRows.push(["COLLECTION STAFF", "", "", "", "", "", ""]);
  bRows.push(["OSAD STAFF", "", "", "", "", "", ""]);
  bRows.push(["", "", "", "", "", "", ""]);

  bRows.push(["Certified By:", "", "", "", "", "", ""]);
  bRows.push(["", "", "", "", "", "", ""]);
  bRows.push(["ADMINISTRATIVE ASST.", "", "", "", "", "", ""]);
  bRows.push(["OSAD SSG MODERATOR", "", "", "", "", "", ""]);

  bRows.push(["Received by BUSINESS OFFICE:", "", "", "", "", "", ""]);
  bRows.push(["", "", "", "", "", "", ""]);
 

  const wsB = XLSX.utils.aoa_to_sheet(bRows);

  wsB["!cols"] = [
    { wch: 26 }, { wch: 22 }, { wch: 2 }, { wch: 2 },
    { wch: 16 }, { wch: 16 }, { wch: 18 }
  ];

  wsB["!merges"] = wsB["!merges"] || [];
 wsB["!merges"].push({
  s: { r: 0, c: 0 }, // A1
  e: { r: 0, c: 1 }  // B1
});

  wsB["!merges"].push({ s: { r: 0, c: 4 }, e: { r: 0, c: 6 } });
  wsB["!merges"].push({ s: { r: ackTitleRow - 1, c: 0 }, e: { r: ackTitleRow - 1, c: 2 } });

setStyle(wsB, "A1", titleStyle);
setStyle(wsB, "B1", titleStyle);
  setStyle(wsB, "E1", denomTitleStyle);

  setStyle(wsB, "A2", headerStyle);
  setStyle(wsB, "B2", headerStyle);
  setStyle(wsB, "E2", denomHeaderStyle);
  setStyle(wsB, "F2", denomHeaderStyle);
  setStyle(wsB, "G2", denomHeaderStyle);

  const leftEndRow = 2 + 1 + 1 + 1 + activeFees.length + 1;
  borderRange(wsB, `A2:B${leftEndRow}`);
  borderRange(wsB, `E2:G${denomTotalExcelRow}`);

  const pesoFmt = '"₱" #,##0.00';
  for (let r = 3; r <= leftEndRow; r++) {
    const cell = `B${r}`;
    if (wsB[cell] && typeof wsB[cell].v !== "string") wsB[cell].z = pesoFmt;
  }
  for (let r = denomStartExcelRow; r <= denomTotalExcelRow; r++) {
    const cell = `G${r}`;
    if (wsB[cell]) wsB[cell].z = pesoFmt;
  }

  const receivedLineRow = ackTitleRow + 2;
  const certifiedLineRow = ackTitleRow + 7;

  ["A", "B"].forEach(col => {
    const addr1 = `${col}${receivedLineRow}`;
    const addr2 = `${col}${certifiedLineRow}`;
    setStyle(wsB, addr1, { border: { bottom: { style: "thin", color: { rgb: "94A3B8" } } } });
    setStyle(wsB, addr2, { border: { bottom: { style: "thin", color: { rgb: "94A3B8" } } } });
  });

  const receivedNameRow = ackTitleRow + 1;
  ["A", "B", "C"].forEach(col => {
    const addr = `${col}${receivedNameRow}`;
    setStyle(wsB, addr, { font: { bold: true }, alignment: { horizontal: "center", vertical: "center" } });
  });

  if (wsLog["A1"]) {
    wsLog["A1"].s = {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "0F172A" } },
      alignment: { horizontal: "center", vertical: "center" }
    };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsLog, "Transaction Log");
  XLSX.utils.book_append_sheet(wb, wsB, "Breakdowns");

  XLSX.writeFile(wb, `DocuMint_Financial_Report_${selection}.xlsx`);
}

// ===================== MISC =====================
function handleLogout() {
  location.reload();
}

window.onload = async () => {
  lucide.createIcons();

  const searchInput = document.getElementById("report-search");
  if (searchInput) searchInput.value = "";

  // ✅ preload from localStorage
  const user = getLoggedUserFromLocalStorage();
  CURRENT_USER_NAME = buildUserDisplayName(user);

  // Optional fallback to API
  if (!CURRENT_USER_NAME) {
    try {
      const me = await fetchCurrentUserFromApi();
      CURRENT_USER_NAME =
        me?.user?.name ||
        (me?.user?.user_firstname || me?.user?.user_lastname
          ? `${me.user.user_firstname || ""} ${me.user.user_lastname || ""}`.trim()
          : "") ||
        "";
    } catch (e) {
      console.warn("Could not preload current user name:", e?.message || e);
    }
  }
};

// --- Sidebar State ---
let sidebarExpanded = true;

function toggleSidebar() {
  sidebarExpanded = !sidebarExpanded;

  const sidebar = document.getElementById("sidebar");
  const icon = document.getElementById("sidebar-toggle-icon");

  sidebar.classList.toggle("sidebar-expanded", sidebarExpanded);
  sidebar.classList.toggle("sidebar-collapsed", !sidebarExpanded);

  document.querySelectorAll(".sidebar-text")
    .forEach(el => el.classList.toggle("hidden", !sidebarExpanded));

  icon.setAttribute("data-lucide", sidebarExpanded ? "chevron-left" : "menu");
  lucide.createIcons();
}
