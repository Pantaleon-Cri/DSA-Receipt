let sidebarExpanded = true;
let selectedAcademicType = 'department';

/* =======================
   DATABASE (TEMP / MOCK)
======================= */
let staffDb = [
    { name: 'Sarah Miller', id: 'STA-2025-01', role: 'Staff' },
    { name: 'James Wilson', id: 'OFF-2025-01', role: 'Officer' }
];

let academicDb = [
    { name: 'College of Arts and Sciences', abbr: 'CAS', type: 'Department', parent: '-' },
    { name: 'Bachelor of Science in CS', abbr: 'BSCS', type: 'Course', parent: 'CAS' }
];

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
   STAFF MANAGEMENT
======================= */
function renderStaff() {
    const tbody = document.getElementById('staff-table-body');
    if (!tbody) return;

    tbody.innerHTML = staffDb.map((s, idx) => `
        <tr class="hover:bg-slate-50/50 transition-colors">
            <td class="px-8 py-4 font-bold text-slate-800">${s.name}</td>
            <td class="px-8 py-4 font-mono text-xs text-blue-600">${s.id}</td>
            <td class="px-8 py-4">
                <span class="px-3 py-1 bg-slate-100 text-slate-600 text-[10px] font-black uppercase rounded-full">
                    ${s.role}
                </span>
            </td>
            <td class="px-8 py-4 text-right">
                <button onclick="deleteStaff(${idx})"
                    class="text-slate-300 hover:text-red-500 transition-colors">
                    <i data-lucide="user-minus" class="w-4 h-4"></i>
                </button>
            </td>
        </tr>
    `).join('');

    lucide.createIcons();
}

function saveStaff() {
    const name = document.getElementById('staff-name')?.value;
    const id = document.getElementById('staff-id')?.value;
    const role = document.getElementById('staff-role')?.value;

    if (!name || !id) return;

    staffDb.push({ name, id, role });
    renderStaff();
    toggleModal('staff-modal');

    document.getElementById('staff-name').value = '';
    document.getElementById('staff-id').value = '';
}

function deleteStaff(idx) {
    if (confirm('Remove staff access?')) {
        staffDb.splice(idx, 1);
        renderStaff();
    }
}

/* =======================
   ACADEMIC MANAGEMENT
======================= */
function renderAcademic() {
    const tbody = document.getElementById('academic-table-body');
    if (!tbody) return;

    tbody.innerHTML = academicDb.map((a, idx) => `
        <tr class="hover:bg-slate-50/50 transition-colors">
            <td class="px-8 py-4 font-bold text-slate-800">${a.name}</td>
            <td class="px-8 py-4 font-mono text-xs text-slate-500">${a.abbr}</td>
            <td class="px-8 py-4">
                <span class="px-3 py-1 ${
                    a.type === 'Course'
                        ? 'bg-blue-50 text-blue-600'
                        : 'bg-purple-50 text-purple-600'
                } text-[10px] font-black uppercase rounded-full">
                    ${a.type}
                </span>
            </td>
            <td class="px-8 py-4 font-black text-slate-400 text-[10px]">
                ${a.parent}
            </td>
            <td class="px-8 py-4 text-right">
                <button onclick="deleteAcademic(${idx})"
                    class="text-slate-300 hover:text-red-500 transition-colors">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </td>
        </tr>
    `).join('');

    lucide.createIcons();
}

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

function saveAcademicUnit() {
    const name = document.getElementById('acad-name')?.value;
    const abbr = document.getElementById('acad-abbr')?.value;
    const parent = selectedAcademicType === 'course'
        ? document.getElementById('acad-parent')?.value
        : '-';

    if (!name || !abbr) return;

    academicDb.push({
        name,
        abbr,
        type: selectedAcademicType === 'course' ? 'Course' : 'Department',
        parent
    });

    renderAcademic();
    toggleModal('academic-modal');

    document.getElementById('acad-name').value = '';
    document.getElementById('acad-abbr').value = '';
}

/* =======================
   UTILITIES
======================= */
function deleteAcademic(idx) {
    if (confirm('Permanently remove this unit?')) {
        academicDb.splice(idx, 1);
        renderAcademic();
    }
}

function toggleModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.toggle('hidden');
}

function updateAccount(e) {
    e.preventDefault();
    alert('Account details updated successfully!');
}

/* =======================
   INIT (SAFE FOR ALL PAGES)
======================= */
window.addEventListener('load', () => {
    renderStaff();
    renderAcademic();
    lucide.createIcons();
});
