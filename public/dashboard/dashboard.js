// ============================================
// dashboard.js (Dynamic, works with your server)
// Colors update: UNPAID = RED, PAID = GREEN
// Mounts used in your server.js:
//  - /api/term/years
//  - /api/term/semesters
//  - /api/term/active
//  - /api/departments
//  - /api/status
//  - /api/dashboard
// ============================================

// ---------- State ----------
let selectedDepartmentId = 'ALL';
let currentStatusId = 'ALL';
let selectedYearId = null;
let selectedSemesterId = null;

let chartInstance = null;
let sidebarExpanded = true;

// ---------- Reference data (from DB) ----------
let years = [];        // [{year_id, year_name, is_active}]
let semesters = [];    // [{semester_id, semester_name, year_id?, is_active?}]
let departments = [];  // [{department_id, department_name, department_abbr}]
let statuses = [];     // [{status_id, status_name}]

// Remember active term so we can prefer it when switching years
let activeTermCache = null; // {year_id, semester_id, year}

// ---------- API endpoints (MATCH YOUR SERVER) ----------
const API = {
  activeTerm: '/api/term/active',
  years: '/api/term/years',
  semesters: '/api/term/semesters',
  departments: '/api/departments',
  statuses: '/api/status',
  dashboard: '/api/dashboard'
};

// ---------- Utilities ----------
function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function titleCase(s) {
  const x = String(s || '');
  return x.length ? x.charAt(0).toUpperCase() + x.slice(1) : x;
}

async function fetchJSON(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  return res.json();
}

function getDeptLabelById(id) {
  if (id === 'ALL') return 'ALL';
  const d = departments.find(x => String(x.department_id) === String(id));
  return d ? (d.department_abbr || d.department_name || 'DEPT') : 'DEPT';
}

function getStatusLabelById(id) {
  if (id === 'ALL') return 'All Statuses';
  const s = statuses.find(x => String(x.status_id) === String(id));
  return s ? titleCase(s.status_name) : 'Status';
}

function getYearLabelById(id) {
  const y = years.find(x => String(x.year_id) === String(id));
  return y ? y.year_name : 'Loading...';
}

// Normalize year id (some APIs return year_id, others might use id)
function getYearId(y) {
  return y?.year_id ?? y?.id ?? y;
}

// Filter semesters by selected year if semester rows include year_id
function getSemestersForYear(yearId) {
  const yid = String(yearId ?? '');
  if (!yid) return [];

  // If your semesters table includes year_id, filter properly.
  // If it doesn't, fallback to all semesters.
  const hasYearId = semesters.some(s => s.year_id != null);
  const list = hasYearId
    ? semesters.filter(s => String(s.year_id) === yid)
    : semesters.slice();

  // Deduplicate by semester_id (fixes duplicates from backend joins)
  const seen = new Map();
  for (const s of list) {
    const key = String(s.semester_id);
    if (!seen.has(key)) seen.set(key, s);
  }
  return Array.from(seen.values());
}

// Choose the best semester for the currently selected year
function chooseDefaultSemesterForYear(yearId) {
  const list = getSemestersForYear(yearId);

  if (!list.length) return null;

  // 1) If active term semester belongs to this year, use it
  if (
    activeTermCache?.semester_id != null &&
    String(activeTermCache?.year_id) === String(yearId)
  ) {
    const found = list.find(s => String(s.semester_id) === String(activeTermCache.semester_id));
    if (found) return found.semester_id;
  }

  // 2) If any semester row has is_active, prefer it
  const activeSem = list.find(s => !!s.is_active);
  if (activeSem) return activeSem.semester_id;

  // 3) Otherwise pick first
  return list[0].semester_id;
}

// =======================
// COLOR LOGIC (UPDATED)
// =======================
// We detect status by name so it stays dynamic even if you add more status_id values later.
// - Paid => GREEN
// - Unpaid => RED
function isPaidStatus(statusName) {
  const name = String(statusName || '').toLowerCase().trim();
  // "paid" must be matched carefully so "unpaid" doesn't count as paid
  if (name.includes('unpaid')) return false;
  return name.includes('paid');
}

function isUnpaidStatus(statusName) {
  const name = String(statusName || '').toLowerCase().trim();
  return name.includes('unpaid');
}

// Badge classes in the table / modal
function statusBadgeClass(statusName) {
  const name = String(statusName || '').toLowerCase().trim();

  if (isPaidStatus(name)) return 'bg-green-100 text-green-700';
  if (isUnpaidStatus(name)) return 'bg-red-100 text-red-700';

  // fallback for other statuses you may add later
  return 'bg-slate-100 text-slate-700';
}

// ============================================
// Year Dropdown (Dynamic)
// ============================================
function toggleYearDropdown() {
  const dd = document.getElementById('year-dropdown');
  if (dd) dd.classList.toggle('show');
}

function initYearGrid() {
  const grid = document.getElementById('year-grid');
  if (!grid) return;

  grid.innerHTML = '';

  years.forEach(y => {
    const item = document.createElement('div');
    const selected = String(getYearId(y)) === String(selectedYearId);
    item.className = `year-grid-item ${selected ? 'selected' : ''}`;
    item.innerText = y.year_name;
    item.onclick = (e) => {
      e.stopPropagation();
      selectYear(getYearId(y));
    };
    grid.appendChild(item);
  });
}

// IMPORTANT FIX:
// - When you select a year, rebuild semester dropdown for that year
// - Ensure selectedSemesterId becomes valid for that year
// - Then updateDashboard() so the student list reflects year + semester
function selectYear(yearId) {
  selectedYearId = yearId;

  const display = document.getElementById('current-ay-display');
  if (display) display.innerText = getYearLabelById(yearId);

  const dd = document.getElementById('year-dropdown');
  if (dd) dd.classList.remove('show');

  // Rebuild year grid highlight
  initYearGrid();

  // Rebuild semester options based on new year
  buildSemesterSelect();

  // Reset status filter on year change (optional but usually expected)
  currentStatusId = 'ALL';

  // Refresh dashboard data now that both year+semester are synced
  updateDashboard();
}

// ============================================
// Sidebar
// ============================================
function toggleSidebar() {
  sidebarExpanded = !sidebarExpanded;
  const sb = document.getElementById('sidebar');
  const icon = document.getElementById('sidebar-toggle-icon');

  if (!sb || !icon) return;

  sb.classList.toggle('sidebar-expanded', sidebarExpanded);
  sb.classList.toggle('sidebar-collapsed', !sidebarExpanded);

  icon.setAttribute('data-lucide', sidebarExpanded ? 'chevron-left' : 'menu');
  document.querySelectorAll('.sidebar-text').forEach(t => t.classList.toggle('hidden', !sidebarExpanded));
  lucide.createIcons();
}

// ============================================
// Build dynamic UI (departments, semesters, status cards)
// ============================================
function buildDepartmentButtons() {
  const grid = document.getElementById('college-unit-grid');
  if (!grid) return;
  grid.innerHTML = '';

  // ALL
  const allBtn = document.createElement('button');
  allBtn.onclick = () => selectDepartment('ALL');
  allBtn.id = 'college-ALL';
  allBtn.className = `college-card ${selectedDepartmentId === 'ALL' ? 'active' : ''} bg-white border border-slate-200 p-4 rounded-xl transition-all text-center`;
  allBtn.innerHTML = `<p class="text-xs font-black text-slate-900">ALL</p>`;
  grid.appendChild(allBtn);

  // Departments from DB
  departments.forEach(d => {
    const id = String(d.department_id);
    const label = d.department_abbr || d.department_name || `DEPT-${id}`;

    const btn = document.createElement('button');
    btn.onclick = () => selectDepartment(id);
    btn.id = `college-${id}`;
    btn.className = `college-card ${String(selectedDepartmentId) === id ? 'active' : ''} bg-white border border-slate-200 p-4 rounded-xl transition-all text-center`;
    btn.innerHTML = `<p class="text-xs font-black text-slate-900">${escapeHtml(label)}</p>`;
    grid.appendChild(btn);
  });
}

function buildSemesterSelect() {
  const sel = document.getElementById('semester-select');
  if (!sel) return;

  // Always clear to prevent duplicates
  sel.innerHTML = '';

  const list = getSemestersForYear(selectedYearId);

  // If currently selected semester does not belong to selected year, choose a valid default
  const stillValid = list.some(s => String(s.semester_id) === String(selectedSemesterId));
  if (!stillValid) {
    selectedSemesterId = chooseDefaultSemesterForYear(selectedYearId);
  }

  // Build options (deduped already)
  list.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.semester_id;
    opt.textContent = s.semester_name;
    sel.appendChild(opt);
  });

  // If nothing available, keep null
  if (!list.length) {
    selectedSemesterId = null;
    return;
  }

  // Ensure UI reflects selectedSemesterId
  if (selectedSemesterId != null) {
    sel.value = String(selectedSemesterId);
  } else {
    // fallback
    selectedSemesterId = list[0].semester_id;
    sel.value = String(selectedSemesterId);
  }

  // Optional: ensure change updates state + dashboard (HTML onchange also calls updateDashboard)
  sel.onchange = () => {
    selectedSemesterId = sel.value;
    updateDashboard();
  };
}

function buildStatusCards(byStatus) {
  const grid = document.getElementById('status-stat-grid');
  if (!grid) return;

  grid.innerHTML = '';

  statuses.forEach(st => {
    const sid = String(st.status_id);
    const name = titleCase(st.status_name);
    const count = Number(byStatus?.[sid] ?? 0);

    const rawName = String(st.status_name || '').toLowerCase().trim();

    // Paid => GREEN card, Unpaid => RED card
    const isPaid = isPaidStatus(rawName);
    const isUnpaid = isUnpaidStatus(rawName);

    const cardBase = isPaid
      ? 'p-5 bg-green-50 rounded-2xl border border-green-100 cursor-pointer hover:bg-green-100 transition-all text-center'
      : isUnpaid
        ? 'p-5 bg-red-50 rounded-2xl border border-red-100 cursor-pointer hover:bg-red-100 transition-all text-center'
        : 'p-5 bg-slate-50 rounded-2xl border border-slate-200 cursor-pointer hover:bg-slate-100 transition-all text-center';

    const labelBase = isPaid
      ? 'text-[10px] font-bold text-green-600 uppercase tracking-wider mb-1'
      : isUnpaid
        ? 'text-[10px] font-bold text-red-600 uppercase tracking-wider mb-1'
        : 'text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1';

    const valueBase = isPaid
      ? 'text-3xl font-black text-green-700'
      : isUnpaid
        ? 'text-3xl font-black text-red-700'
        : 'text-3xl font-black text-slate-700';

    const card = document.createElement('div');
    card.className = cardBase;
    card.onclick = () => filterListByStatusId(sid);

    card.innerHTML = `
      <p class="${labelBase}">${escapeHtml(name)} Students</p>
      <p class="${valueBase}">${count}</p>
    `;
    grid.appendChild(card);
  });
}

// ============================================
// Core Logic (department + status filtering)
// ============================================
function selectDepartment(departmentId) {
  selectedDepartmentId = departmentId;
  currentStatusId = 'ALL';

  document.querySelectorAll('.college-card').forEach(c => c.classList.remove('active'));
  const el = document.getElementById(`college-${departmentId}`);
  if (el) el.classList.add('active');

  updateDashboard();
}

function filterListByStatusId(statusId) {
  currentStatusId = statusId;
  updateDashboard();
}

// ============================================
// Dashboard data loading + rendering
// ============================================
async function updateDashboard() {
  const collegeLabel = document.getElementById('preview-college-label');
  const statusLabel = document.getElementById('preview-status-label');
  if (collegeLabel) collegeLabel.innerText = getDeptLabelById(selectedDepartmentId);
  if (statusLabel) statusLabel.innerText = getStatusLabelById(currentStatusId);

  const semSel = document.getElementById('semester-select');
  if (semSel && semSel.value) selectedSemesterId = semSel.value;

  try {
    // 1) UNFILTERED request (for Status Cards + Chart)
    const qsAll = new URLSearchParams({
      year_id: selectedYearId ?? '',
      semester_id: selectedSemesterId ?? '',
      department_id: selectedDepartmentId === 'ALL' ? '' : String(selectedDepartmentId),
      status_id: '' // IMPORTANT: no status filter here
    });

    // 2) FILTERED request (for Preview Table)
    const qsFiltered = new URLSearchParams({
      year_id: selectedYearId ?? '',
      semester_id: selectedSemesterId ?? '',
      department_id: selectedDepartmentId === 'ALL' ? '' : String(selectedDepartmentId),
      status_id: currentStatusId === 'ALL' ? '' : String(currentStatusId)
    });

    const [respAll, respFiltered] = await Promise.all([
      fetchJSON(`${API.dashboard}?${qsAll.toString()}`),
      fetchJSON(`${API.dashboard}?${qsFiltered.toString()}`)
    ]);

    // If unfiltered fails, fallback everything to empty
    if (!respAll?.success) {
      console.error('Dashboard API (unfiltered) error:', respAll?.message);
      buildStatusCards({});
      renderChart(0, 0, null);
      renderTable([]);
      return;
    }

    // Use unfiltered stats for cards + chart
    const studentsAll = Array.isArray(respAll.students) ? respAll.students : [];
    const byStatusAll = respAll.stats?.byStatus || {};
    const totalAll = Number(respAll.stats?.total ?? studentsAll.length ?? 0);

    buildStatusCards(byStatusAll);

    // Find PAID status id (not "unpaid")
    let paidLikeId = null;
    for (const st of statuses) {
      const n = String(st.status_name || '').toLowerCase().trim();
      if (isPaidStatus(n)) {
        paidLikeId = String(st.status_id);
        break;
      }
    }

    const paidCountAll = paidLikeId ? Number(byStatusAll[paidLikeId] ?? 0) : 0;
    const otherCountAll = Math.max(0, totalAll - paidCountAll);

    renderChart(paidCountAll, otherCountAll, paidLikeId);

    // Use filtered response ONLY for the preview table
    if (!respFiltered?.success) {
      console.error('Dashboard API (filtered) error:', respFiltered?.message);
      renderTable([]);
      return;
    }

    const studentsFiltered = Array.isArray(respFiltered.students) ? respFiltered.students : [];
    renderTable(studentsFiltered);

  } catch (err) {
    console.error(err);
    buildStatusCards({});
    renderChart(0, 0, null);
    renderTable([]);
  }
}

// ============================================
// Preview table (first 5)
// ============================================
function renderTable(data) {
  const tbody = document.getElementById('student-preview-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  (data || []).slice(0, 5).forEach(s => {
    const fullName = `${s.student_firstname ?? ''} ${s.student_lastname ?? ''}`.trim() || '—';
    const dept = s.department_abbr || s.department_name || getDeptLabelById(s.department_id);
    const statusName = titleCase(s.status_name || getStatusLabelById(s.status_id));
    const badge = statusBadgeClass(statusName);

    tbody.innerHTML += `
      <tr class="border-b border-slate-50 hover:bg-slate-50 transition-colors">
        <td class="py-5 font-bold text-slate-700">${escapeHtml(fullName)}</td>
        <td class="py-5 text-slate-500 font-mono text-xs">${escapeHtml(dept)}</td>
        <td class="py-5 text-right">
          <span class="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${badge}">
            ${escapeHtml(statusName)}
          </span>
        </td>
      </tr>
    `;
  });

  const showAllBtn = document.getElementById('show-all-btn');
  if (showAllBtn) showAllBtn.classList.toggle('hidden', (data || []).length <= 5);
}

// ============================================
// Chart (Paid = GREEN, Other = RED-ish gray)
// ============================================
function renderChart(paidCount, otherCount, paidLikeId) {
  const canvas = document.getElementById('paymentChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (chartInstance) chartInstance.destroy();

  const total = paidCount + otherCount;
  const pct = total > 0 ? Math.round((paidCount / total) * 100) : 0;

  chartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [paidCount, otherCount],
        // Paid slice GREEN, remaining slice LIGHT RED/GRAY
        backgroundColor: ['#16a34a', '#fee2e2'],
        borderWidth: 0,
        cutout: '82%'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          enabled: true,
          callbacks: {
            label: (context) => {
              return context.dataIndex === 0 ? 'Paid' : 'Unpaid';
            }
          }
        }
      },
      onClick: (_, el) => {
        if (!el.length) return;
        // click green slice filters Paid status, click other clears filter
        if (el[0].index === 0 && paidLikeId) {
          filterListByStatusId(paidLikeId);
        } else {
          currentStatusId = 'ALL';
          updateDashboard();
        }
      }
    },
    plugins: [{
      id: 'text',
      afterDraw: (c) => {
        const { ctx, width, height } = c;
        ctx.save();
        ctx.font = 'bold 24px Inter';
        ctx.fillStyle = '#1e293b';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${pct}%`, width / 2, height / 2);
        ctx.restore();
      }
    }]
  });
}

// ============================================
// Modal (Show All)
// ============================================
async function openFullListModal() {
  try {
    const qs = new URLSearchParams({
      year_id: selectedYearId ?? '',
      semester_id: selectedSemesterId ?? '',
      department_id: selectedDepartmentId === 'ALL' ? '' : String(selectedDepartmentId),
      status_id: currentStatusId === 'ALL' ? '' : String(currentStatusId)
    });

    const resp = await fetchJSON(`${API.dashboard}?${qs.toString()}`);

    const deptLabel = getDeptLabelById(selectedDepartmentId);
    const statusLabel = getStatusLabelById(currentStatusId);

    const subtitle = document.getElementById('modal-subtitle');
    if (subtitle) subtitle.innerText = `${deptLabel} Unit | ${statusLabel}`;

    const tbody = document.getElementById('modal-table-body');
    if (!tbody) return;

    const students = resp?.success && Array.isArray(resp.students) ? resp.students : [];

    tbody.innerHTML = students.map(s => {
      const fullName = `${s.student_firstname ?? ''} ${s.student_lastname ?? ''}`.trim() || '—';
      const dept = s.department_abbr || s.department_name || getDeptLabelById(s.department_id);
      const statusName = titleCase(s.status_name || getStatusLabelById(s.status_id));
      const badge = statusBadgeClass(statusName);

      return `
        <tr class="bg-slate-50/50 hover:bg-white border border-transparent hover:border-slate-200 transition-all rounded-lg">
          <td class="p-5 font-mono text-xs text-sky-600 font-bold">${escapeHtml(s.student_id ?? '—')}</td>
          <td class="p-5 font-bold text-slate-800">${escapeHtml(fullName)}</td>
          <td class="p-5 text-slate-500 font-semibold uppercase text-xs">${escapeHtml(dept)}</td>
          <td class="p-5 text-right">
            <span class="px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider ${badge}">
              ${escapeHtml(statusName)}
            </span>
          </td>
        </tr>
      `;
    }).join('');

    const modal = document.getElementById('full-list-modal');
    if (modal) modal.classList.remove('hidden');

  } catch (err) {
    console.error(err);
    const modal = document.getElementById('full-list-modal');
    if (modal) modal.classList.remove('hidden');
  }
}

function closeFullListModal() {
  const modal = document.getElementById('full-list-modal');
  if (modal) modal.classList.add('hidden');
}

// ============================================
// Load reference data from your existing routes
// ============================================
async function loadReferenceData() {
  const [activeTerm, y, sem, dept, st] = await Promise.all([
    fetchJSON(API.activeTerm),
    fetchJSON(API.years),
    fetchJSON(API.semesters),
    fetchJSON(API.departments),
    fetchJSON(API.statuses)
  ]);

  years = y?.success ? (y.years || []) : [];
  semesters = sem?.success ? (sem.semesters || []) : [];
  departments = dept?.success ? (dept.departments || []) : [];
  statuses = st?.success ? (st.statuses || []) : [];

  // Cache active term for smarter defaults when changing years
  activeTermCache = activeTerm?.success
    ? {
        year_id: activeTerm.year_id,
        semester_id: activeTerm.semester_id,
        year: activeTerm.year
      }
    : null;

  if (activeTerm?.success) {
    selectedYearId = activeTerm.year_id;
    selectedSemesterId = activeTerm.semester_id;

    const ayDisplay = document.getElementById('current-ay-display');
    if (ayDisplay) ayDisplay.innerText = activeTerm.year || getYearLabelById(selectedYearId);
  } else {
    const activeYear = years.find(x => !!x.is_active) || years[0];
    selectedYearId = activeYear ? activeYear.year_id : null;

    const ayDisplay = document.getElementById('current-ay-display');
    if (ayDisplay) ayDisplay.innerText = selectedYearId ? getYearLabelById(selectedYearId) : 'No Year Found';

    selectedSemesterId = chooseDefaultSemesterForYear(selectedYearId);
  }

  initYearGrid();
  buildSemesterSelect();      // now filters & dedupes, and syncs selectedSemesterId
  buildDepartmentButtons();
  lucide.createIcons();
}

// ============================================
// Close year dropdown when clicking outside
// ============================================
window.onclick = (e) => {
  // Keep your logic, but make sure it doesn't accidentally close when clicking inside dropdown controls
  // The dropdown container is inside the ".relative" wrapper in your HTML.
  if (!e.target.closest('.relative')) {
    const dd = document.getElementById('year-dropdown');
    if (dd) dd.classList.remove('show');
  }
};

// ============================================
// Init
// ============================================
window.onload = async () => {
  try {
    lucide.createIcons();
    await loadReferenceData();
    await updateDashboard();
  } catch (err) {
    console.error('Dashboard init error:', err);

    initYearGrid();
    buildSemesterSelect();
    buildDepartmentButtons();
    buildStatusCards({});
    renderChart(0, 0, null);
    renderTable([]);

    lucide.createIcons();
  }
};
