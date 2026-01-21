/**
 * settings.js (FULL, UPDATED — REMOVED STUDENTS + RESTORE CONFIRMATION MODAL via POST)
 *
 * ✅ Academic Structure pagination is LIMITED to 5 rows per page.
 * ✅ Staff role handling FIXED to match YOUR schema:
 *    - user table column is `role` (varchar) BUT you store the ROLE ID inside it (e.g. "1","2","3","4")
 *    - /api/users returns: { user_id, user_firstname, user_lastname, role }   (role = role_id)
 *    - /api/roles returns: { role_id, role_name }
 *    - UI shows role_name by mapping user.role (role_id) -> roles.role_name
 * ✅ Add Staff sends `role` (role_id) to backend (NOT role_name, NOT role_id field name)
 * ✅ Academic Structure: Edit button functional (uses PUT routes you added)
 *
 * ✅ Student Management (Soft Deleted / Removed Students)
 *    - Lists ONLY students with is_removed = 1
 *    - ✅ Bound to ACTIVE semester by backend route: GET /api/students/removed
 *    - ✅ Restore uses POST /api/students/restore (sets is_removed = 2)
 *    - ✅ NEW: Restore confirmation modal (uses #restore-student-modal in your HTML)
 *
 * REQUIRED ENDPOINTS:
 * - GET   /api/roles
 * - GET   /api/users
 * - POST  /api/users
 * - GET   /api/departments
 * - POST  /api/departments
 * - PUT   /api/departments/:id
 * - GET   /api/courses?department_id=#
 * - POST  /api/courses
 * - PUT   /api/courses/:id
 *
 * REMOVED STUDENTS ENDPOINTS (YOUR BACKEND):
 * - GET   /api/students/removed
 * - POST  /api/students/restore   (expects { student_id })
 */

let sidebarExpanded = true;
let selectedAcademicType = 'department';

/* =======================
   CONFIG (STUDENTS)
======================= */
const REMOVED_STUDENTS_GET_URL = '/api/students/removed';
const RESTORE_STUDENT_POST_URL = '/api/students/restore';

/* =======================
   API HELPERS
======================= */
async function apiGet(url) {
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  return res.json();
}

async function apiPost(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`POST ${url} failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function apiPut(url, body) {
  const hasBody = body !== undefined;
  const res = await fetch(url, {
    method: 'PUT',
    headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
    body: hasBody ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`PUT ${url} failed: ${res.status} ${text}`);
  }
  return res.json();
}

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(str) {
  return String(str ?? '')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/* =======================
   STATE
======================= */
let rolesDb = [];        // from /api/roles -> [{role_id, role_name}]
let staffDb = [];        // from /api/users -> [{user_id,user_firstname,user_lastname,role}] where role=role_id
let departmentsDb = [];  // from /api/departments
let academicRowsDb = []; // rows for academic table (dept + course)

// Removed students
let removedStudentsDb = [];

/* =======================
   ROLE HELPERS
======================= */
function getRoleNameByUserRoleField(userRoleValue) {
  const idNum = Number(userRoleValue);
  if (!Number.isFinite(idNum)) return 'Unknown';

  const r = rolesDb.find(x => Number(x.role_id) === idNum);
  return r ? r.role_name : 'Unknown';
}

/* =======================
   LOGGED USER (LOCALSTORAGE)
======================= */
function getLoggedUser() {
  try {
    return JSON.parse(localStorage.getItem('loggedUser'));
  } catch {
    return null;
  }
}

function applyLoggedUserToUI() {
  const user = getLoggedUser();
  if (!user) return;

  const sidebarNameEl = document.getElementById('user-role');
  if (sidebarNameEl) {
    const fullName = `${user.user_firstName ?? ''} ${user.user_lastName ?? ''}`.trim();
    sidebarNameEl.textContent = fullName || '';
  }

  const sidebarRoleEl = document.getElementById('user-role-label');
  if (sidebarRoleEl) {
    const roleText = user.role_name ?? user.role ?? (user.role_id ?? '');
    sidebarRoleEl.textContent = String(roleText).trim();
  }

  const accName = document.getElementById('acc-name');
  if (accName) {
    accName.value = `${user.user_firstName ?? ''} ${user.user_lastName ?? ''}`.trim();
  }

  const accId = document.getElementById('acc-id');
  if (accId) {
    const idVal = user.user_id ?? user.userId ?? user.id ?? '';
    accId.value = idVal;
  }
}

/* =======================
   SIDEBAR
======================= */
function toggleSidebar() {
  sidebarExpanded = !sidebarExpanded;

  const sidebar = document.getElementById('sidebar');
  const icon = document.getElementById('sidebar-toggle-icon');

  if (!sidebar || !icon) return;

  sidebar.classList.toggle('sidebar-expanded', sidebarExpanded);
  sidebar.classList.toggle('sidebar-collapsed', !sidebarExpanded);

  document.querySelectorAll('.sidebar-text')
    .forEach(el => el.classList.toggle('hidden', !sidebarExpanded));

  icon.setAttribute('data-lucide', sidebarExpanded ? 'chevron-left' : 'menu');
  lucide.createIcons();
}

/* =======================
   ROLES (DYNAMIC SELECT)
======================= */
async function loadRoles() {
  const select = document.getElementById('staff-role');
  if (!select) return;

  select.innerHTML = `<option value="">Loading roles...</option>`;

  try {
    const data = await apiGet('/api/roles');
    rolesDb = (data.success && Array.isArray(data.roles)) ? data.roles : [];

    select.innerHTML = '';

    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = 'Select role';
    select.appendChild(ph);

    rolesDb.forEach(r => {
      const opt = document.createElement('option');
      opt.value = String(r.role_id);
      opt.textContent = r.role_name;
      select.appendChild(opt);
    });

    const user = getLoggedUser();
    if (user && (user.role_id || user.role)) {
      const sidebarRoleEl = document.getElementById('user-role-label');
      if (sidebarRoleEl) {
        const roleId = user.role_id ?? user.role;
        const roleName = getRoleNameByUserRoleField(roleId);
        sidebarRoleEl.textContent = roleName !== 'Unknown' ? roleName : String(roleId ?? '');
      }
    }
  } catch (err) {
    console.error('loadRoles error:', err);
    select.innerHTML = `<option value="">Failed to load roles</option>`;
  }
}

/* =======================
   STAFF MANAGEMENT
======================= */
async function loadStaff() {
  const tbody = document.getElementById('staff-table-body');
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="4" class="px-8 py-6 text-slate-400 text-sm">Loading staff...</td>
    </tr>
  `;

  try {
    const data = await apiGet('/api/users');
    staffDb = (data.success && Array.isArray(data.users)) ? data.users : [];
    renderStaff();
  } catch (err) {
    console.error('loadStaff error:', err);
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="px-8 py-6 text-red-400 text-sm">
          Failed to load staff. Check GET /api/users.
        </td>
      </tr>
    `;
  }
}

function renderStaff() {
  const tbody = document.getElementById('staff-table-body');
  if (!tbody) return;

  if (!staffDb.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="px-8 py-6 text-slate-400 text-sm">No staff records yet.</td>
      </tr>
    `;
    lucide.createIcons();
    return;
  }

  tbody.innerHTML = staffDb.map(u => {
    const fullName = `${u.user_firstname ?? ''} ${u.user_lastname ?? ''}`.trim();
    const roleName = getRoleNameByUserRoleField(u.role);

    return `
      <tr class="hover:bg-slate-50/50 transition-colors">
        <td class="px-8 py-4 font-bold text-slate-800">${escapeHtml(fullName)}</td>
        <td class="px-8 py-4 font-mono text-xs text-blue-600">${escapeHtml(u.user_id)}</td>
        <td class="px-8 py-4">
          <span class="px-3 py-1 bg-slate-100 text-slate-600 text-[10px] font-black uppercase rounded-full">
            ${escapeHtml(roleName)}
          </span>
        </td>
        <td class="px-8 py-4 text-right">
          <button disabled title="Add DELETE /api/users/:id to enable"
            class="text-slate-200 cursor-not-allowed">
            <i data-lucide="user-minus" class="w-4 h-4"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  lucide.createIcons();
}

async function saveStaff() {
  const fullname = document.getElementById('staff-name')?.value?.trim();
  const userIdRaw = document.getElementById('staff-id')?.value?.trim();
  const roleIdRaw = document.getElementById('staff-role')?.value;
  const password = document.getElementById('staff-pass')?.value;

  if (!fullname || !userIdRaw || !roleIdRaw || !password) {
    alert('Please complete all staff fields.');
    return;
  }

  if (!/^\d+$/.test(userIdRaw)) {
    alert('User ID must be numeric because user_id is INT in your database.');
    return;
  }

  if (!/^\d+$/.test(String(roleIdRaw))) {
    alert('Please select a valid role.');
    return;
  }

  try {
    await apiPost('/api/users', {
      user_id: Number(userIdRaw),
      fullname,
      password,
      role: String(roleIdRaw)
    });

    await loadStaff();
    toggleModal('staff-modal');

    document.getElementById('staff-name').value = '';
    document.getElementById('staff-id').value = '';
    document.getElementById('staff-pass').value = '';
    document.getElementById('staff-role').value = '';
  } catch (err) {
    console.error('saveStaff error:', err);
    alert(
      'Failed to create staff.\n\nMost common causes:\n' +
      '- POST /api/users field names mismatch (must be user_id, fullname, password, role)\n' +
      '- user_id already exists\n'
    );
  }
}

/* =======================
   STUDENT MANAGEMENT (REMOVED)
   ✅ UI columns: Student | Student ID | Department | Status | Actions
   ✅ Restore uses POST /api/students/restore
   ✅ NEW: confirmation modal
======================= */
async function loadRemovedStudents() {
  const tbody = document.getElementById('removed-students-table-body');
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="5" class="px-8 py-6 text-slate-400 text-sm">Loading removed students...</td>
    </tr>
  `;

  try {
    const data = await apiGet(REMOVED_STUDENTS_GET_URL);
    removedStudentsDb = (data.success && Array.isArray(data.students)) ? data.students : [];
    renderRemovedStudents();
  } catch (err) {
    console.error('loadRemovedStudents error:', err);
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="px-8 py-6 text-red-400 text-sm">
          Failed to load removed students. Check GET ${escapeHtml(REMOVED_STUDENTS_GET_URL)}.
        </td>
      </tr>
    `;
    lucide.createIcons();
  }
}

function getDeptAbbrById(department_id) {
  const idNum = Number(department_id);
  const d = departmentsDb.find(x => Number(x.department_id) === idNum);
  return d ? d.department_abbr : (department_id ?? '-');
}

function renderRemovedStudents() {
  const tbody = document.getElementById('removed-students-table-body');
  if (!tbody) return;

  const onlyRemoved = removedStudentsDb.filter(s => Number(s.is_removed) === 1);

  if (!onlyRemoved.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="px-8 py-6 text-slate-400 text-sm">
          No soft-deleted students found (active semester).
        </td>
      </tr>
    `;
    lucide.createIcons();
    return;
  }

  tbody.innerHTML = onlyRemoved.map(s => {
    const fullName = `${s.student_firstname ?? ''} ${s.student_lastname ?? ''}`.trim();
    const deptAbbr = getDeptAbbrById(s.department_id);

    return `
      <tr class="hover:bg-slate-50/50 transition-colors">
        <td class="px-8 py-4 font-bold text-slate-800">${escapeHtml(fullName)}</td>
        <td class="px-8 py-4 font-mono text-xs text-blue-600">${escapeHtml(s.student_id)}</td>
        <td class="px-8 py-4 text-xs font-black text-slate-500">${escapeHtml(deptAbbr)}</td>
        <td class="px-8 py-4">
          <span class="px-3 py-1 bg-red-50 text-red-600 text-[10px] font-black uppercase rounded-full">
            Removed
          </span>
        </td>
        <td class="px-8 py-4 text-right">
          <button
            class="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition"
            title="Restore student"
            onclick="openRestoreStudentModal('${escapeAttr(s.student_id)}')"
          >
            <i data-lucide="rotate-ccw" class="w-4 h-4"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  lucide.createIcons();
}

/* =======================
   RESTORE CONFIRMATION MODAL
   Requires HTML IDs:
   - restore-student-modal
   - restore-student-name
   - restore-student-id
   - restore-student-dept
======================= */
let pendingRestoreStudentId = null;

function openRestoreStudentModal(student_id) {
  pendingRestoreStudentId = String(student_id ?? '');

  const s = removedStudentsDb.find(x => String(x.student_id) === pendingRestoreStudentId);
  const name = s ? `${s.student_firstname ?? ''} ${s.student_lastname ?? ''}`.trim() : '';
  const dept = s ? getDeptAbbrById(s.department_id) : '-';

  const nameEl = document.getElementById('restore-student-name');
  const idEl = document.getElementById('restore-student-id');
  const deptEl = document.getElementById('restore-student-dept');

  if (nameEl) nameEl.textContent = name || '—';
  if (idEl) idEl.textContent = pendingRestoreStudentId || '—';
  if (deptEl) deptEl.textContent = dept || '—';

  const modal = document.getElementById('restore-student-modal');
  modal?.classList.remove('hidden');
  lucide.createIcons();
}

function closeRestoreStudentModal() {
  pendingRestoreStudentId = null;
  document.getElementById('restore-student-modal')?.classList.add('hidden');
}

async function confirmRestoreStudent() {
  if (!pendingRestoreStudentId) return;

  try {
    await restoreStudent(pendingRestoreStudentId);
  } finally {
    closeRestoreStudentModal();
  }
}

/* =======================
   RESTORE ACTION (POST)
======================= */
async function restoreStudent(student_id) {
  if (!student_id) return;

  try {
    await apiPost(RESTORE_STUDENT_POST_URL, { student_id });
    await loadRemovedStudents();
  } catch (err) {
    console.error('restoreStudent error:', err);
    alert(
      'Failed to restore student.\n\nCheck:\n' +
      '- POST /api/students/restore\n' +
      '- Body must be { student_id }\n'
    );
  }
}

/* =======================
   ACADEMIC MANAGEMENT
======================= */
async function loadDepartments() {
  const select = document.getElementById('acad-parent');
  if (select) select.innerHTML = `<option value="">Loading...</option>`;

  try {
    const data = await apiGet('/api/departments');
    departmentsDb = (data.success && Array.isArray(data.departments)) ? data.departments : [];
    renderDepartmentSelect();
    await loadAcademic();

    // load removed students after departments loaded (for dept mapping)
    await loadRemovedStudents();
  } catch (err) {
    console.error('loadDepartments error:', err);
    if (select) select.innerHTML = `<option value="">Failed to load departments</option>`;

    const tbody = document.getElementById('academic-table-body');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="px-8 py-6 text-red-400 text-sm">
            Failed to load departments. Check GET /api/departments.
          </td>
        </tr>
      `;
    }

    try { await loadRemovedStudents(); } catch {}
  }
}

function renderDepartmentSelect() {
  const select = document.getElementById('acad-parent');
  if (!select) return;

  select.innerHTML = '';

  if (!departmentsDb.length) {
    select.innerHTML = `<option value="">No departments</option>`;
    return;
  }

  departmentsDb.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.department_id;
    opt.textContent = `${d.department_abbr} — ${d.department_name}`;
    select.appendChild(opt);
  });
}

async function loadCoursesByDepartmentId(department_id) {
  const data = await apiGet(`/api/courses?department_id=${encodeURIComponent(department_id)}`);
  if (!data.success || !Array.isArray(data.courses)) return [];
  return data.courses;
}

async function loadAcademic() {
  const tbody = document.getElementById('academic-table-body');
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="5" class="px-8 py-6 text-slate-400 text-sm">Loading academic structure...</td>
    </tr>
  `;

  try {
    const rows = [];

    for (const d of departmentsDb) {
      rows.push({
        id: `dept-${d.department_id}`,
        entity: 'department',
        department_id: d.department_id,
        course_id: null,
        name: d.department_name,
        abbr: d.department_abbr,
        type: 'Department',
        parent: '-',
        parent_department_id: null,
        parent_department_abbr: null,
      });
    }

    for (const d of departmentsDb) {
      const courses = await loadCoursesByDepartmentId(d.department_id);
      for (const c of courses) {
        rows.push({
          id: `course-${c.course_id}`,
          entity: 'course',
          department_id: d.department_id,
          course_id: c.course_id,
          name: c.course_name,
          abbr: c.course_abbr,
          type: 'Course',
          parent: d.department_abbr,
          parent_department_id: d.department_id,
          parent_department_abbr: d.department_abbr,
        });
      }
    }

    academicRowsDb = rows;
    academicPager.page = 1;
    renderAcademicPaginated();
  } catch (err) {
    console.error('loadAcademic error:', err);
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="px-8 py-6 text-red-400 text-sm">
          Failed to load academic structure. Check /api/courses.
        </td>
      </tr>
    `;
  }
}

/* =======================
   ACADEMIC PAGINATION (5 ROWS)
======================= */
const academicPager = { page: 1, pageSize: 5 };

function getAcademicTotalPages() {
  return Math.max(1, Math.ceil(academicRowsDb.length / academicPager.pageSize));
}

function getAcademicPageRows() {
  const start = (academicPager.page - 1) * academicPager.pageSize;
  return academicRowsDb.slice(start, start + academicPager.pageSize);
}

function buildPageButtons(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages = new Set([1, total, current - 1, current, current + 1]);
  const valid = [...pages].filter(p => p >= 1 && p <= total).sort((a, b) => a - b);

  const out = [];
  for (let i = 0; i < valid.length; i++) {
    out.push(valid[i]);
    if (i < valid.length - 1 && valid[i + 1] - valid[i] > 1) out.push('...');
  }
  return out;
}

function renderAcademicPaginationUI() {
  const totalPages = getAcademicTotalPages();

  academicPager.page = Math.min(Math.max(1, academicPager.page), totalPages);

  const info = document.getElementById('academic-page-info');
  const prevBtn = document.getElementById('academic-prev');
  const nextBtn = document.getElementById('academic-next');
  const numbers = document.getElementById('academic-page-numbers');

  const total = academicRowsDb.length;
  const startIndex = total === 0 ? 0 : (academicPager.page - 1) * academicPager.pageSize + 1;
  const endIndex = Math.min(academicPager.page * academicPager.pageSize, total);

  if (info) info.textContent = `Showing ${startIndex}-${endIndex} of ${total}`;

  if (prevBtn) prevBtn.disabled = academicPager.page <= 1;
  if (nextBtn) nextBtn.disabled = academicPager.page >= totalPages;

  if (numbers) {
    numbers.innerHTML = buildPageButtons(academicPager.page, totalPages).map(p => {
      if (p === '...') return `<span class="px-2 text-xs font-black text-slate-400">…</span>`;
      const isActive = p === academicPager.page;
      return `
        <button
          class="px-3 py-2 rounded-xl text-xs font-black border
            ${isActive ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}"
          onclick="setAcademicPage(${p})"
        >${p}</button>
      `;
    }).join('');
  }
}

function setAcademicPage(p) {
  academicPager.page = p;
  renderAcademicPaginated();
}

function bindAcademicPaginationEvents() {
  const sizeSel = document.getElementById('academic-page-size');
  if (sizeSel) {
    sizeSel.value = '5';
    sizeSel.disabled = true;
    sizeSel.classList.add('opacity-60', 'cursor-not-allowed');
  }

  const prevBtn = document.getElementById('academic-prev');
  const nextBtn = document.getElementById('academic-next');

  if (prevBtn) prevBtn.addEventListener('click', () => setAcademicPage(academicPager.page - 1));
  if (nextBtn) nextBtn.addEventListener('click', () => setAcademicPage(academicPager.page + 1));
}

function renderAcademicPaginated() {
  const tbody = document.getElementById('academic-table-body');
  if (!tbody) return;

  if (!academicRowsDb.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="px-8 py-6 text-slate-400 text-sm">No academic units yet.</td>
      </tr>
    `;
    renderAcademicPaginationUI();
    lucide.createIcons();
    return;
  }

  const pageRows = getAcademicPageRows();

  tbody.innerHTML = pageRows.map(a => `
    <tr class="hover:bg-slate-50/50 transition-colors">
      <td class="px-8 py-4 font-bold text-slate-800">${escapeHtml(a.name)}</td>
      <td class="px-8 py-4 font-mono text-xs text-slate-500">${escapeHtml(a.abbr)}</td>
      <td class="px-8 py-4">
        <span class="px-3 py-1 ${a.type === 'Course' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'} text-[10px] font-black uppercase rounded-full">
          ${escapeHtml(a.type)}
        </span>
      </td>
      <td class="px-8 py-4 font-black text-slate-400 text-[10px]">${escapeHtml(a.parent)}</td>
      <td class="px-8 py-4 text-right">
        <button
          onclick="openEditAcademic('${escapeAttr(a.id)}')"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase hover:bg-blue-600 transition-all"
          title="Edit"
        >
          <i data-lucide="pencil" class="w-4 h-4"></i>
          Edit
        </button>
      </td>
    </tr>
  `).join('');

  renderAcademicPaginationUI();
  lucide.createIcons();
}

/* =======================
   EDIT ACADEMIC
======================= */
let editingAcademic = null;

function openEditAcademic(rowId) {
  const row = academicRowsDb.find(r => String(r.id) === String(rowId));
  if (!row) return;

  editingAcademic = row;

  toggleModal('academic-modal');

  if (row.entity === 'department') toggleAcademicType('department');
  else toggleAcademicType('course');

  const nameEl = document.getElementById('acad-name');
  const abbrEl = document.getElementById('acad-abbr');
  if (nameEl) nameEl.value = row.name || '';
  if (abbrEl) abbrEl.value = row.abbr || '';

  if (row.entity === 'course') {
    const parentSel = document.getElementById('acad-parent');
    if (parentSel) parentSel.value = String(row.parent_department_id ?? row.department_id ?? '');
  }
}

async function saveAcademicUnit() {
  const name = document.getElementById('acad-name')?.value?.trim();
  const abbr = document.getElementById('acad-abbr')?.value?.trim();

  if (!name || !abbr) {
    alert('Please enter unit name and abbreviation.');
    return;
  }

  try {
    if (editingAcademic) {
      if (editingAcademic.entity === 'department') {
        await apiPut(`/api/departments/${encodeURIComponent(editingAcademic.department_id)}`, {
          department_name: name,
          department_abbr: abbr
        });

        editingAcademic = null;
        toggleModal('academic-modal');
        await loadDepartments();
        return;
      }

      if (editingAcademic.entity === 'course') {
        const deptId = document.getElementById('acad-parent')?.value;
        if (!deptId) {
          alert('Please select a parent department.');
          return;
        }

        await apiPut(`/api/courses/${encodeURIComponent(editingAcademic.course_id)}`, {
          department_id: Number(deptId),
          course_name: name,
          course_abbr: abbr
        });

        editingAcademic = null;
        toggleModal('academic-modal');
        await loadDepartments();
        return;
      }
    }

    if (selectedAcademicType === 'department') {
      await apiPost('/api/departments', { department_name: name, department_abbr: abbr });
      await loadDepartments();
      toggleModal('academic-modal');
    } else {
      const deptId = document.getElementById('acad-parent')?.value;
      if (!deptId) {
        alert('Please select a parent department.');
        return;
      }

      await apiPost('/api/courses', {
        department_id: Number(deptId),
        course_name: name,
        course_abbr: abbr
      });

      await loadAcademic();
      toggleModal('academic-modal');
    }

    document.getElementById('acad-name').value = '';
    document.getElementById('acad-abbr').value = '';
  } catch (err) {
    console.error('saveAcademicUnit error:', err);
    alert(
      'Failed to save academic unit.\n\nIf editing, ensure these exist:\n' +
      '- PUT /api/departments/:id\n' +
      '- PUT /api/courses/:id\n'
    );
  }
}

/* =======================
   ACADEMIC TYPE TOGGLE
======================= */
function toggleAcademicType(type) {
  selectedAcademicType = type;

  const btnDept = document.getElementById('btn-type-dept');
  const btnCourse = document.getElementById('btn-type-course');
  const parentContainer = document.getElementById('acad-dept-select-container');

  if (!btnDept || !btnCourse || !parentContainer) return;

  if (type === 'department') {
    btnDept.classList.add('bg-white', 'shadow-sm', 'text-blue-600');
    btnDept.classList.remove('text-slate-400');

    btnCourse.classList.remove('bg-white', 'shadow-sm', 'text-blue-600');
    btnCourse.classList.add('text-slate-400');

    parentContainer.classList.add('hidden');
  } else {
    btnCourse.classList.add('bg-white', 'shadow-sm', 'text-blue-600');
    btnCourse.classList.remove('text-slate-400');

    btnDept.classList.remove('bg-white', 'shadow-sm', 'text-blue-600');
    btnDept.classList.add('text-slate-400');

    parentContainer.classList.remove('hidden');
  }
}

/* =======================
   UTILITIES
======================= */
function toggleModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.toggle('hidden');

  const isNowHidden = modal?.classList?.contains('hidden');
  if (id === 'academic-modal' && isNowHidden) {
    editingAcademic = null;
    const nameEl = document.getElementById('acad-name');
    const abbrEl = document.getElementById('acad-abbr');
    if (nameEl) nameEl.value = '';
    if (abbrEl) abbrEl.value = '';
  }
}

function updateAccount(e) {
  e.preventDefault();
  alert('Account update is not connected yet. Add a backend PATCH route to save changes.');
}

/* =======================
   INIT
======================= */
window.addEventListener('load', async () => {
  try {
    applyLoggedUserToUI();
    bindAcademicPaginationEvents();

    await loadRoles();
    await loadStaff();
    await loadDepartments(); // loads academic + removed students
  } catch (e) {
    console.error('INIT error:', e);
  } finally {
    lucide.createIcons();
  }
});
