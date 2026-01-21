// render.js

export function renderDepartments(departmentMap, selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;

  select.innerHTML = '<option value="All">All Colleges</option>';
  Object.entries(departmentMap).forEach(([id, name]) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = name;
    select.appendChild(option);
  });
}

export function renderStudentsTable(
  studentDb,
  statusMap,
  departmentMap,
  tbodyId,
  toggleOfficerFn,
  openPaymentFn,
  removeStudentFn = 'removeStudent' // ✅ NEW (default keeps backward compatibility)
) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;

  // ✅ hide removed students: is_removed === 1 means "deleted"
  const visibleStudents = (studentDb || []).filter(s => Number(s.is_removed || 0) !== 1);

  tbody.innerHTML = '';

  if (!visibleStudents.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-20 text-center text-slate-400 italic">No records found</td></tr>`;
    return;
  }

  visibleStudents.forEach(s => {
    const statusName = statusMap[s.status_id] || 'Unknown';
    const statusColor =
      statusName === 'Paid' ? 'text-green-600 bg-green-50' :
      statusName === 'Exempt' ? 'text-blue-600 bg-blue-50' :
      'text-red-500 bg-red-50';

    const officerChecked = s.is_officer ? 'checked' : '';

    tbody.innerHTML += `
      <tr class="hover:bg-slate-50/50 transition-colors">
        <td class="px-6 py-4 font-mono text-xs font-bold text-blue-600">${s.student_id}</td>
        <td class="px-6 py-4 font-bold text-slate-800">${s.student_firstname} ${s.student_lastname}</td>
        <td class="px-6 py-4 text-xs font-bold text-slate-500 uppercase">${departmentMap[s.department_id] || 'N/A'}</td>

        <td class="px-6 py-4 text-center">
          <div class="flex justify-center items-center">
            <label class="switch m-0">
              <input type="checkbox" ${officerChecked} onchange="${toggleOfficerFn}('${s.student_id}', this.checked)">
              <span class="slider round"></span>
            </label>
          </div>
        </td>

        <td class="px-6 py-4">
          <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase ${statusColor}">${statusName}</span>
        </td>

        <td class="px-6 py-4 text-center">
          <div class="flex items-center justify-center gap-2">
            <!-- PROCESS -->
            <button
              onclick="${openPaymentFn}('${s.student_id}')"
              class="px-4 py-2 text-[10px] font-black uppercase rounded-lg bg-slate-900 text-white hover:bg-blue-600 transition-all"
              title="Process Payment"
            >
              PROCESS
            </button>

            <!-- ✅ DELETE ICON -->
            <button
              type="button"
              onclick="${removeStudentFn}('${s.student_id}')"
              class="p-2 rounded-lg border border-slate-200 text-red-500 hover:bg-red-50 hover:border-red-200 transition"
              title="Delete Student"
            >
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  });
}

export function populateDropdown(
  selectId,
  items,
  valueField,
  textField,
  selectedValue = null,
  defaultOption = null
) {
  const select = document.getElementById(selectId);
  if (!select) return;

  select.innerHTML = '';

  if (defaultOption) select.innerHTML = `<option value="">${defaultOption}</option>`;

  (items || []).forEach(item => {
    const option = document.createElement('option');
    option.value = item[valueField];
    option.textContent = item[textField];
    if (selectedValue && item[valueField] === selectedValue) option.selected = true;
    select.appendChild(option);
  });
}
