/**
 * settings.js (FULL, UPDATED — STAFF DELETE + CHANGE PASSWORD BOTH USE FANCY MODALS)
 *
 * ✅ Staff Delete:
 *    - user-minus button opens a fancy modal (auto-injected if missing)
 *    - Confirm triggers DELETE /api/users/:id
 *
 * ✅ Change Password:
 *    - Account form submit opens a fancy modal (auto-injected if missing)
 *    - Confirm triggers PATCH/PUT fallback endpoints
 *    - Shows inline loading/success/error (no alert/confirm needed)
 *
 * NOTE:
 * - Uses Lucide icons (lucide.createIcons()).
 * - Password is plaintext as per your database.
 */

let sidebarExpanded = true;
let selectedAcademicType = 'department';

/* =======================
   CONFIG (STUDENTS)
======================= */
const REMOVED_STUDENTS_GET_URL = '/api/students/removed';
const RESTORE_STUDENT_POST_URL = '/api/students/restore';

/* =======================
   CONFIG (STAFF DELETE)
======================= */
const DELETE_STAFF_ENDPOINTS = [
  (userId) => ({ method: 'DELETE', url: `/api/users/${encodeURIComponent(userId)}` }),
];

/* =======================
   CONFIG (ACCOUNT / PASSWORD)
======================= */
const CHANGE_PASSWORD_ENDPOINTS = [
  // Option A
  (userId) => ({
    method: 'PATCH',
    url: `/api/users/${encodeURIComponent(userId)}/password`,
    body: (pw) => ({ password: pw }),
  }),

  // Option B
  (userId) => ({
    method: 'PATCH',
    url: `/api/users/password`,
    body: (pw) => ({ user_id: Number(userId), password: pw }),
  }),

  // Option C
  (userId) => ({
    method: 'PUT',
    url: `/api/users/${encodeURIComponent(userId)}`,
    body: (pw) => ({ password: pw }),
  }),
];

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

async function apiRequest(method, url, body) {
  const hasBody = body !== undefined;
  const res = await fetch(url, {
    method,
    headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
    body: hasBody ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${method} ${url} failed: ${res.status} ${text}`);
  }

  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return { success: true };
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
let rolesDb = [];
let staffDb = [];
let departmentsDb = [];
let academicRowsDb = [];
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

function getLoggedUserId() {
  const user = getLoggedUser();
  const idVal = user?.user_id ?? user?.userId ?? user?.id ?? user?.userID ?? '';
  return String(idVal ?? '').trim();
}

function applyLoggedUserToUI() {
  const user = getLoggedUser();
  if (!user) return;

  const sidebarNameEl = document.getElementById('user-role');
  if (sidebarNameEl) {
    const fn = user.user_firstname ?? user.user_firstName ?? user.first_name ?? '';
    const ln = user.user_lastname ?? user.user_lastName ?? user.last_name ?? '';
    sidebarNameEl.textContent = `${fn} ${ln}`.trim();
  }

  const sidebarRoleEl = document.getElementById('user-role-label');
  if (sidebarRoleEl) {
    const roleText = user.role_name ?? user.role ?? (user.role_id ?? '');
    sidebarRoleEl.textContent = String(roleText).trim();
  }

  const accName = document.getElementById('acc-name');
  if (accName) {
    const fn = user.user_firstname ?? user.user_firstName ?? user.first_name ?? '';
    const ln = user.user_lastname ?? user.user_lastName ?? user.last_name ?? '';
    accName.value = `${fn} ${ln}`.trim();
  }

  const accId = document.getElementById('acc-id');
  if (accId) {
    accId.value = getLoggedUserId();
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
   ROLES
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

/* ---------- STAFF DELETE MODAL ---------- */
let pendingDeleteStaffId = null;

function ensureDeleteStaffModal() {
  if (document.getElementById('delete-staff-modal')) return;

  if (!document.getElementById('delete-staff-modal-styles')) {
    const style = document.createElement('style');
    style.id = 'delete-staff-modal-styles';
    style.textContent = `
      .delstaff-overlay{
        position:fixed; inset:0; display:none; align-items:center; justify-content:center;
        background:rgba(2,6,23,.55); backdrop-filter:blur(4px);
        z-index:9999; padding:16px;
      }
      .delstaff-overlay.delstaff-open{display:flex;}
      .delstaff-card{
        width:min(520px,92vw); border-radius:18px; background:#fff;
        box-shadow:0 20px 60px rgba(2,6,23,.35); overflow:hidden;
        transform:translateY(6px) scale(.98); opacity:0;
        animation:delstaff-pop .18s ease-out forwards;
      }
      @keyframes delstaff-pop{to{transform:translateY(0) scale(1); opacity:1;}}
      .delstaff-head{display:flex; gap:12px; align-items:flex-start; padding:18px 18px 10px;
        background:linear-gradient(180deg, rgba(239,68,68,.10), rgba(239,68,68,0));
      }
      .delstaff-icon{width:44px; height:44px; border-radius:14px; display:grid; place-items:center;
        background:rgba(239,68,68,.12); color:rgb(220,38,38); flex:0 0 auto;
      }
      .delstaff-title{font-weight:900; font-size:16px; color:#0f172a; margin:0; line-height:1.2;}
      .delstaff-sub{margin:6px 0 0; font-size:12px; color:#475569; line-height:1.5;}
      .delstaff-body{padding:0 18px 16px;}
      .delstaff-meta{margin-top:10px; border:1px solid #e2e8f0; background:#f8fafc;
        border-radius:14px; padding:12px; display:grid; gap:6px;
      }
      .delstaff-row{display:flex; justify-content:space-between; gap:12px; font-size:12px;}
      .delstaff-label{color:#64748b; font-weight:800; text-transform:uppercase; font-size:10px; letter-spacing:.06em;}
      .delstaff-value{color:#0f172a; font-weight:800;}
      .delstaff-actions{padding:14px 18px 18px; display:flex; justify-content:flex-end; gap:10px;}
      .delstaff-btn{border:0; cursor:pointer; border-radius:14px; padding:10px 14px; font-size:12px; font-weight:900; letter-spacing:.02em;}
      .delstaff-cancel{background:#e2e8f0; color:#0f172a;}
      .delstaff-cancel:hover{background:#cbd5e1;}
      .delstaff-danger{background:#ef4444; color:#fff;}
      .delstaff-danger:hover{filter:brightness(.95);}
      .delstaff-danger:disabled{opacity:.6; cursor:not-allowed;}
      .delstaff-x{margin-left:auto; border:0; background:transparent; cursor:pointer; padding:8px; border-radius:12px; color:#475569;}
      .delstaff-x:hover{background:rgba(15,23,42,.06);}
    `;
    document.head.appendChild(style);
  }

  const overlay = document.createElement('div');
  overlay.id = 'delete-staff-modal';
  overlay.className = 'delstaff-overlay hidden';
  overlay.innerHTML = `
    <div class="delstaff-card" role="dialog" aria-modal="true" aria-labelledby="delstaff-title">
      <div class="delstaff-head">
        <div class="delstaff-icon">
          <i data-lucide="user-minus" class="w-5 h-5"></i>
        </div>
        <div>
          <h3 id="delstaff-title" class="delstaff-title">Remove staff/user?</h3>
          <p class="delstaff-sub">This action will permanently delete the staff/user record.</p>
        </div>
        <button class="delstaff-x" type="button" aria-label="Close" id="delete-staff-close-btn">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <div class="delstaff-body">
        <div class="delstaff-meta">
          <div class="delstaff-row">
            <span class="delstaff-label">Name</span>
            <span class="delstaff-value" id="delete-staff-name">—</span>
          </div>
          <div class="delstaff-row">
            <span class="delstaff-label">User ID</span>
            <span class="delstaff-value" id="delete-staff-id">—</span>
          </div>
        </div>
      </div>

      <div class="delstaff-actions">
        <button class="delstaff-btn delstaff-cancel" type="button" id="delete-staff-cancel-btn">Cancel</button>
        <button class="delstaff-btn delstaff-danger" type="button" id="delete-staff-confirm-btn">Delete</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => closeDeleteStaffModal();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.getElementById('delete-staff-close-btn')?.addEventListener('click', close);
  document.getElementById('delete-staff-cancel-btn')?.addEventListener('click', close);
  document.getElementById('delete-staff-confirm-btn')?.addEventListener('click', () => {
    confirmDeleteStaff().catch(() => {});
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const m = document.getElementById('delete-staff-modal');
      if (m && !m.classList.contains('hidden')) close();
    }
  });

  lucide.createIcons();
}

function openDeleteStaffModal(user_id) {
  pendingDeleteStaffId = String(user_id ?? '').trim();
  if (!pendingDeleteStaffId) return;

  ensureDeleteStaffModal();

  const u = staffDb.find(x => String(x.user_id) === pendingDeleteStaffId);
  const name = u ? `${u.user_firstname ?? ''} ${u.user_lastname ?? ''}`.trim() : pendingDeleteStaffId;

  document.getElementById('delete-staff-name') && (document.getElementById('delete-staff-name').textContent = name || '—');
  document.getElementById('delete-staff-id') && (document.getElementById('delete-staff-id').textContent = pendingDeleteStaffId || '—');

  const modal = document.getElementById('delete-staff-modal');
  if (!modal) return;

  modal.classList.remove('hidden');
  modal.classList.add('delstaff-open');
  lucide.createIcons();
}

function closeDeleteStaffModal() {
  pendingDeleteStaffId = null;
  const modal = document.getElementById('delete-staff-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('delstaff-open');
}

async function confirmDeleteStaff() {
  if (!pendingDeleteStaffId) return;

  const btn = document.getElementById('delete-staff-confirm-btn');
  if (btn) btn.disabled = true;

  try {
    await deleteStaffById(pendingDeleteStaffId);
    await loadStaff();
  } catch (err) {
    console.error('confirmDeleteStaff error:', err);
    // minimal fallback
    alert(
      'Failed to delete staff.\n\n' +
      'Make sure your backend has:\n' +
      'DELETE /api/users/:id\n'
    );
  } finally {
    if (btn) btn.disabled = false;
    closeDeleteStaffModal();
  }
}

async function deleteStaffById(userId) {
  let lastErr = null;

  for (const make of DELETE_STAFF_ENDPOINTS) {
    const ep = make(userId);
    try {
      const resp = await apiRequest(ep.method, ep.url);
      if (resp && typeof resp === 'object' && resp.success === false) {
        throw new Error(resp.message || 'Delete failed');
      }
      return resp;
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr || new Error('Delete failed');
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
          <button
            class="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition"
            title="Remove staff"
            onclick="openDeleteStaffModal('${escapeAttr(u.user_id)}')"
          >
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
      role: String(roleIdRaw),
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
   RESTORE CONFIRMATION MODAL (YOUR EXISTING)
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
    await loadRemovedStudents();
  } finally {
    closeRestoreStudentModal();
  }
}

async function restoreStudent(studentId) {
  if (!window.CURRENT_YEAR_SEMESTER_ID) {
    throw new Error("No active semester selected.");
  }

  await apiPost(RESTORE_STUDENT_POST_URL, {
    student_id: studentId,
    year_semester_id: window.CURRENT_YEAR_SEMESTER_ID,
  });
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
   ACADEMIC PAGINATION
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
          department_abbr: abbr,
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
          course_abbr: abbr,
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
        course_abbr: abbr,
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
   ACCOUNT (CHANGE PASSWORD) — INPUTS
======================= */
function getAccountPasswordInputs() {
  const accIdEl = document.getElementById('acc-id');

  const currentEl =
    document.getElementById('acc-current-pass') ||
    document.getElementById('current-password') ||
    document.getElementById('acc-old-pass') ||
    document.getElementById('old-password');

  const newEl =
    document.getElementById('acc-new-pass') ||
    document.getElementById('new-password') ||
    document.getElementById('acc-pass') ||
    document.getElementById('password');

  const confirmEl =
    document.getElementById('acc-confirm-pass') ||
    document.getElementById('confirm-password') ||
    document.getElementById('acc-pass-confirm') ||
    document.getElementById('password-confirm');

  const userIdRaw = (accIdEl?.value ?? '').trim() || getLoggedUserId();

  return {
    userIdRaw,
    currentPassword: (currentEl?.value ?? '').trim(),
    newPassword: (newEl?.value ?? '').trim(),
    confirmPassword: (confirmEl?.value ?? '').trim(),
    currentEl,
    newEl,
    confirmEl,
  };
}

/* =======================
   CHANGE PASSWORD MODAL (NEW)
======================= */
let pendingChangePassword = { userId: null, newPassword: null, refs: null };

function ensureChangePasswordModal() {
  if (document.getElementById('change-pass-modal')) return;

  if (!document.getElementById('change-pass-modal-styles')) {
    const style = document.createElement('style');
    style.id = 'change-pass-modal-styles';
    style.textContent = `
      .chgpw-overlay{
        position:fixed; inset:0; display:none; align-items:center; justify-content:center;
        background:rgba(2,6,23,.55); backdrop-filter:blur(4px);
        z-index:9999; padding:16px;
      }
      .chgpw-overlay.chgpw-open{display:flex;}
      .chgpw-card{
        width:min(560px,92vw); border-radius:18px; background:#fff;
        box-shadow:0 20px 60px rgba(2,6,23,.35); overflow:hidden;
        transform:translateY(6px) scale(.98); opacity:0;
        animation:chgpw-pop .18s ease-out forwards;
      }
      @keyframes chgpw-pop{to{transform:translateY(0) scale(1); opacity:1;}}
      .chgpw-head{
        display:flex; gap:12px; align-items:flex-start; padding:18px 18px 10px;
        background:linear-gradient(180deg, rgba(59,130,246,.10), rgba(59,130,246,0));
      }
      .chgpw-icon{
        width:44px; height:44px; border-radius:14px; display:grid; place-items:center;
        background:rgba(59,130,246,.12); color:rgb(37,99,235); flex:0 0 auto;
      }
      .chgpw-title{font-weight:900; font-size:16px; color:#0f172a; margin:0; line-height:1.2;}
      .chgpw-sub{margin:6px 0 0; font-size:12px; color:#475569; line-height:1.5;}
      .chgpw-x{
        margin-left:auto; border:0; background:transparent; cursor:pointer;
        padding:8px; border-radius:12px; color:#475569;
      }
      .chgpw-x:hover{background:rgba(15,23,42,.06);}
      .chgpw-body{padding:0 18px 16px;}
      .chgpw-meta{
        margin-top:10px; border:1px solid #e2e8f0; background:#f8fafc;
        border-radius:14px; padding:12px; display:grid; gap:10px;
      }
      .chgpw-row{display:flex; justify-content:space-between; gap:12px; font-size:12px; align-items:center;}
      .chgpw-label{color:#64748b; font-weight:800; text-transform:uppercase; font-size:10px; letter-spacing:.06em;}
      .chgpw-value{color:#0f172a; font-weight:900;}
      .chgpw-pill{
        padding:6px 10px; border-radius:999px; font-size:10px; font-weight:900;
        background:#e2e8f0; color:#0f172a; letter-spacing:.06em; text-transform:uppercase;
      }
      .chgpw-status{
        margin-top:10px;
        border-radius:14px;
        padding:10px 12px;
        font-size:12px;
        display:none;
        border:1px solid #e2e8f0;
        background:#fff;
        color:#0f172a;
        line-height:1.4;
      }
      .chgpw-status.chgpw-show{display:block;}
      .chgpw-actions{padding:14px 18px 18px; display:flex; justify-content:flex-end; gap:10px;}
      .chgpw-btn{border:0; cursor:pointer; border-radius:14px; padding:10px 14px; font-size:12px; font-weight:900; letter-spacing:.02em;}
      .chgpw-cancel{background:#e2e8f0; color:#0f172a;}
      .chgpw-cancel:hover{background:#cbd5e1;}
      .chgpw-primary{background:#2563eb; color:#fff;}
      .chgpw-primary:hover{filter:brightness(.95);}
      .chgpw-primary:disabled{opacity:.6; cursor:not-allowed;}
      .chgpw-ok{background:#16a34a; color:#fff;}
      .chgpw-ok:hover{filter:brightness(.95);}
    `;
    document.head.appendChild(style);
  }

  const overlay = document.createElement('div');
  overlay.id = 'change-pass-modal';
  overlay.className = 'chgpw-overlay hidden';
  overlay.innerHTML = `
    <div class="chgpw-card" role="dialog" aria-modal="true" aria-labelledby="chgpw-title">
      <div class="chgpw-head">
        <div class="chgpw-icon">
          <i data-lucide="key-round" class="w-4 h-4"></i>
        </div>

        <div>
          <h3 id="chgpw-title" class="chgpw-title">Update password</h3>
          <p class="chgpw-sub">
            Please confirm you want to update the account password.
          </p>
        </div>

        <button class="chgpw-x" type="button" aria-label="Close" id="chgpw-close-btn">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <div class="chgpw-body">
        <div class="chgpw-meta">
          <div class="chgpw-row">
            <span class="chgpw-label">User ID</span>
            <span class="chgpw-value" id="chgpw-user-id">—</span>
          </div>
          <div class="chgpw-row">
            <span class="chgpw-label">New password</span>
            <span class="chgpw-pill" id="chgpw-pw-mask">••••••</span>
          </div>
          <div class="chgpw-row">


        <div class="chgpw-status" id="chgpw-status"></div>
      </div>

      <div class="chgpw-actions">
        <button class="chgpw-btn chgpw-cancel" type="button" id="chgpw-cancel-btn">Cancel</button>
        <button class="chgpw-btn chgpw-primary" type="button" id="chgpw-confirm-btn">Confirm</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => closeChangePasswordModal();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.getElementById('chgpw-close-btn')?.addEventListener('click', close);
  document.getElementById('chgpw-cancel-btn')?.addEventListener('click', close);
  document.getElementById('chgpw-confirm-btn')?.addEventListener('click', () => {
    confirmChangePasswordModal().catch(() => {});
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const m = document.getElementById('change-pass-modal');
      if (m && !m.classList.contains('hidden')) close();
    }
  });

  lucide.createIcons();
}

function setChangePasswordStatus(message, kind = 'info') {
  const box = document.getElementById('chgpw-status');
  if (!box) return;

  box.textContent = message ?? '';
  box.classList.add('chgpw-show');

  // subtle border hints per kind
  if (kind === 'error') {
    box.style.borderColor = 'rgba(239,68,68,.35)';
    box.style.background = 'rgba(239,68,68,.06)';
  } else if (kind === 'success') {
    box.style.borderColor = 'rgba(22,163,74,.35)';
    box.style.background = 'rgba(22,163,74,.06)';
  } else if (kind === 'loading') {
    box.style.borderColor = 'rgba(37,99,235,.25)';
    box.style.background = 'rgba(37,99,235,.05)';
  } else {
    box.style.borderColor = '#e2e8f0';
    box.style.background = '#fff';
  }
}

function clearChangePasswordStatus() {
  const box = document.getElementById('chgpw-status');
  if (!box) return;
  box.textContent = '';
  box.classList.remove('chgpw-show');
  box.style.borderColor = '#e2e8f0';
  box.style.background = '#fff';
}

function openChangePasswordModal({ userId, newPassword, refs }) {
  ensureChangePasswordModal();

  pendingChangePassword = {
    userId: String(userId ?? '').trim(),
    newPassword: String(newPassword ?? ''),
    refs: refs || null,
  };

  const idEl = document.getElementById('chgpw-user-id');
  const maskEl = document.getElementById('chgpw-pw-mask');
  if (idEl) idEl.textContent = pendingChangePassword.userId || '—';
  if (maskEl) {
    const len = Math.max(4, Math.min(12, pendingChangePassword.newPassword.length || 6));
    maskEl.textContent = '•'.repeat(len);
  }

  // reset UI
  clearChangePasswordStatus();

  const confirmBtn = document.getElementById('chgpw-confirm-btn');
  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Confirm';
    confirmBtn.classList.remove('chgpw-ok');
    confirmBtn.classList.add('chgpw-primary');
  }

  const modal = document.getElementById('change-pass-modal');
  if (!modal) return;

  modal.classList.remove('hidden');
  modal.classList.add('chgpw-open');
  lucide.createIcons();
}

function closeChangePasswordModal() {
  pendingChangePassword = { userId: null, newPassword: null, refs: null };

  const modal = document.getElementById('change-pass-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('chgpw-open');
}

async function confirmChangePasswordModal() {
  const userIdRaw = pendingChangePassword.userId;
  const newPassword = pendingChangePassword.newPassword;

  if (!userIdRaw || !/^\d+$/.test(String(userIdRaw))) {
    setChangePasswordStatus('Invalid user_id. Please check your Account ID field.', 'error');
    return;
  }
  if (!newPassword) {
    setChangePasswordStatus('New password is empty. Please type a new password first.', 'error');
    return;
  }

  const btn = document.getElementById('chgpw-confirm-btn');
  if (btn) btn.disabled = true;

  try {
    setChangePasswordStatus('Updating password…', 'loading');

    await changePasswordPlaintext(Number(userIdRaw), newPassword);

    setChangePasswordStatus('Password updated successfully.', 'success');

    // change button to "Done"
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Done';
      btn.classList.remove('chgpw-primary');
      btn.classList.add('chgpw-ok');
      btn.onclick = () => closeChangePasswordModal();
    }

    // clear inputs
    const refs = pendingChangePassword.refs;
    if (refs?.currentEl) refs.currentEl.value = '';
    if (refs?.newEl) refs.newEl.value = '';
    if (refs?.confirmEl) refs.confirmEl.value = '';
  } catch (err) {
    console.error('confirmChangePasswordModal error:', err);
    setChangePasswordStatus(
      'Failed to change password.\n' +
        'Make sure your backend has one of these:\n' +
        '1) PATCH /api/users/:id/password\n' +
        '2) PATCH /api/users/password\n' +
        '3) PUT /api/users/:id\n',
      'error'
    );
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Confirm';
    }
  }
}

async function changePasswordPlaintext(userId, newPassword) {
  let lastErr = null;

  for (const make of CHANGE_PASSWORD_ENDPOINTS) {
    const ep = make(userId);
    try {
      const payload = ep.body(newPassword);
      const resp = await apiRequest(ep.method, ep.url, payload);

      if (resp && typeof resp === 'object' && resp.success === false) {
        throw new Error(resp.message || 'Password update failed');
      }

      return resp;
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr || new Error('Password update failed');
}

/* =======================
   ACCOUNT SUBMIT HANDLER — NOW OPENS MODAL
======================= */
async function updateAccount(e) {
  e.preventDefault();

  const {
    userIdRaw,
    newPassword,
    confirmPassword,
    currentEl,
    newEl,
    confirmEl
  } = getAccountPasswordInputs();

  // validations (no alert for success flow)
  if (!userIdRaw) {
    openChangePasswordModal({
      userId: '',
      newPassword: '',
      refs: { currentEl, newEl, confirmEl },
    });
    setChangePasswordStatus('Missing user_id. Please make sure #acc-id is filled.', 'error');
    return;
  }

  if (!/^\d+$/.test(String(userIdRaw))) {
    openChangePasswordModal({
      userId: userIdRaw,
      newPassword: '',
      refs: { currentEl, newEl, confirmEl },
    });
    setChangePasswordStatus('user_id must be numeric (INT in your database).', 'error');
    return;
  }

  if (!newPassword) {
    openChangePasswordModal({
      userId: userIdRaw,
      newPassword: '',
      refs: { currentEl, newEl, confirmEl },
    });
    setChangePasswordStatus('Please enter your new password.', 'error');
    newEl?.focus?.();
    return;
  }

  if (confirmEl && confirmPassword !== newPassword) {
    openChangePasswordModal({
      userId: userIdRaw,
      newPassword,
      refs: { currentEl, newEl, confirmEl },
    });
    setChangePasswordStatus('New password and confirm password do not match.', 'error');
    confirmEl?.focus?.();
    return;
  }

  // ✅ Open modal for confirmation (this is what you asked)
  openChangePasswordModal({
    userId: userIdRaw,
    newPassword,
    refs: { currentEl, newEl, confirmEl },
  });
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

/* =======================
   INIT
======================= */
window.addEventListener('load', async () => {
  try {
    applyLoggedUserToUI();
    bindAcademicPaginationEvents();

    // Inject modals early
    ensureDeleteStaffModal();
    ensureChangePasswordModal();

    await loadRoles();
    await loadStaff();
    await loadDepartments();

    // bind account form
    const accForm =
      document.getElementById('account-form') ||
      document.querySelector('form[data-account-form="true"]') ||
      document.querySelector('form#account');

    if (accForm && !accForm.__bound_updateAccount) {
      accForm.addEventListener('submit', updateAccount);
      accForm.__bound_updateAccount = true;
    }
  } catch (e) {
    console.error('INIT error:', e);
  } finally {
    lucide.createIcons();
  }
});
