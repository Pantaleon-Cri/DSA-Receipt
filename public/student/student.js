// student.js
import {
  fetchActiveTerm, fetchDepartments, fetchStatuses, fetchStudents, fetchCourses,
  addStudent, toggleOfficerStatus, updateTerm
} from './api.js';
import { renderStudentsTable, renderDepartments } from './render.js';
import { calculateTotalFees, toggleSidebar, lockTotal, unlockTotal } from './utils.js';

// ----------------- GLOBAL VARIABLES -----------------
let studentDb = [];
let departmentMap = {};
let statusMap = {};
window.CURRENT_YEAR_SEMESTER_ID = null;
let activeStudent = null;

let feesDb = []; // store fees globally

// Cache (optional)
const paymentCacheByStudent = {}; // { [student_id]: { payments: [], paidFeeIds: Set } }

// Receipt locking & persistence for printing
let receiptLocked = false;

let lastReceipt = {
  controlNumber: null,
  dateISO: null,
  issuedBy: null,
  studentName: null,
  items: [] // [{ fee_id, fee_name, amount_paid }]
};

// UI mode (prevents PAY/PRINT overlapping with reprint controls)
let receiptMode = 'PAY'; // 'PAY' | 'REPRINT'

// ----------------- UI HELPERS (no-overlap controls) -----------------
function setReceiptMode(mode) {
  receiptMode = mode === 'REPRINT' ? 'REPRINT' : 'PAY';

  const payBtn = document.getElementById('btn-pay-now');
  const feesContainer = document.getElementById('fees-container');

  // When reprinting, you usually don't want the PAY button competing for space.
  if (payBtn) {
    if (receiptMode === 'REPRINT') {
      payBtn.classList.add('hidden');
    } else {
      payBtn.classList.remove('hidden');
    }
  }

  // Optional: disable fee interactions in REPRINT mode (prevents changes + keeps layout stable)
  if (feesContainer) {
    if (receiptMode === 'REPRINT') {
      feesContainer.classList.add('pointer-events-none', 'opacity-70');
    } else {
      feesContainer.classList.remove('pointer-events-none', 'opacity-70');
    }
  }

  // Make action row wrap so it won't overlap with dropdowns on small widths
  // (works even if you don't have these IDs; it's safe).
  const actions = document.getElementById('receipt-actions') || document.getElementById('payment-actions');
  if (actions) {
    actions.classList.add('flex', 'flex-wrap', 'gap-2', 'items-center');
  }

  // Make reprint wrapper take full width so it doesn't collide with buttons
  const reprintWrap = document.getElementById('reprint-wrap');
  if (reprintWrap) {
    reprintWrap.classList.add('w-full');
  }
}

function resetReprintUI() {
  const sel = document.getElementById('reprint-select');
  if (sel) sel.value = '';
  setReceiptMode('PAY');
}

// If you have a "Reprint" button in HTML, wire it here.
// (Safe if button not present.)
function setupReprintControls() {
  const sel = document.getElementById('reprint-select');
  if (sel && !sel.dataset.bound) {
    sel.addEventListener('change', () => {
      // If user selects a receipt, switch to REPRINT mode.
      // If they clear it, go back to PAY mode.
      if (sel.value) {
        setReceiptMode('REPRINT');
      } else {
        // allow paying again
        receiptLocked = false;
        unlockTotal();
        setReceiptMode('PAY');
      }
    });
    sel.dataset.bound = '1';
  }
}

window.updateSemester = async function updateSemester() {
  const yearInput = document.getElementById('input-ay')?.value.trim();
  const semesterInput = document.getElementById('input-sem-manual')?.value.trim();

  const yearSelect = document.getElementById('select-year');
  const semSelect = document.getElementById('select-sem');

  const year = yearInput || yearSelect?.options?.[yearSelect.selectedIndex]?.textContent;
  const semester = semesterInput || semSelect?.options?.[semSelect.selectedIndex]?.textContent;

  try {
    const data = await updateTerm({ year, semester });
    if (data.success) {
      alert('Term updated successfully!');

      // clear manual inputs
      if (document.getElementById('input-ay')) document.getElementById('input-ay').value = '';
      if (document.getElementById('input-sem-manual')) document.getElementById('input-sem-manual').value = '';

      // refresh UI
      await loadActiveTerm();
      await populateYearDropdown();
      await populateSemesterDropdown();

      toggleModal('modal-semester');
    } else {
      alert('Error: ' + data.message);
    }
  } catch (err) {
    console.error('Failed to update term:', err);
    alert('Failed to update term: ' + err.message);
  }
};

// ----------------- INIT -----------------
document.addEventListener('DOMContentLoaded', async () => {
  lucide.createIcons();

  await loadActiveTerm();
  await loadDepartments();
  await loadStatuses();
  await loadStudents();
  await loadFees();

  setupPayButton();
  setupReprintControls();

  // Event listeners
  document.getElementById('select-department')?.addEventListener('change', e => loadCourses(e.target.value));
  const addStudentForm = document.getElementById('form-add-student');
  if (addStudentForm) addStudentForm.addEventListener('submit', handleManualAdd);
});

// ----------------- REPRINT HELPERS (require backend routes) -----------------
async function fetchStudentTransactions(student_id) {
  const termId = Number(window.CURRENT_YEAR_SEMESTER_ID);
  const url = Number.isFinite(termId) && termId > 0
    ? `http://localhost:3000/api/payments/student/${student_id}/transactions?semester_id=${termId}`
    : `http://localhost:3000/api/payments/student/${student_id}/transactions`;

  const res = await fetch(url);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error(`Transactions route not returning JSON (HTTP ${res.status}).`); }
  if (!res.ok || !data.success) throw new Error(data.message || 'Failed to fetch transactions');
  return data.transactions || [];
}

async function fetchReceiptByControlNumber(controlNumber) {
  const res = await fetch(`http://localhost:3000/api/payments/receipt/${encodeURIComponent(controlNumber)}`);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error(`Receipt route not returning JSON (HTTP ${res.status}).`); }
  if (!res.ok || !data.success) throw new Error(data.message || 'Failed to fetch receipt');
  return data.receipt;
}

function renderReceiptFromDbReceipt(receipt) {
  const tidEl = document.getElementById('rec-tid');
  const dateEl = document.getElementById('rec-date');
  const issuerEl = document.getElementById('rec-issuer-name');
  const listEl = document.getElementById('rec-fees-list');
  const totalEl = document.getElementById('rec-total');

  if (!tidEl || !dateEl || !issuerEl || !listEl || !totalEl) return;

  tidEl.innerText = receipt.control_number || '---';
  dateEl.innerText = receipt.payment_date
    ? new Date(receipt.payment_date).toLocaleString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
      })
    : '---';
  issuerEl.innerText = receipt.issued_by || 'Cashier';

  listEl.innerHTML = (receipt.items || []).map(it => {
    const amt = Number(it.amount_paid || 0);
    return `
      <div class="flex justify-between">
        <span class="font-bold">${it.fee_name || `Fee #${it.fee_id}`}</span>
        <span class="font-mono font-bold">₱${amt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
      </div>
    `;
  }).join('');

  const total = Number(receipt.total_amount || 0);
  totalEl.innerText = '₱' + total.toLocaleString(undefined, { minimumFractionDigits: 2 });
}

// Optional: reprint UI hook (if you added the dropdown/button)
async function handleReprintReceipt() {
  if (!activeStudent) return alert('No student selected.');

  const sel = document.getElementById('reprint-select');
  const cn = sel?.value;
  if (!cn) return alert('Please select a receipt to reprint.');

  try {
    // Switch UI mode to prevent overlapping (hide PAY button, wrap actions, etc.)
    setReceiptMode('REPRINT');

    // lock selection totals so receipt does not get overwritten
    lockTotal();
    receiptLocked = true;

    const receipt = await fetchReceiptByControlNumber(cn);
    renderReceiptFromDbReceipt(receipt);
  } catch (err) {
    console.error(err);
    alert(err.message || 'Failed to reprint receipt.');
  }
}
window.handleReprintReceipt = handleReprintReceipt;

// ----------------- FEES -----------------
async function loadFees() {
  try {
    const res = await fetch('http://localhost:3000/api/fees');
    const data = await res.json();
    if (data.success && Array.isArray(data.fees)) {
      feesDb = data.fees;
    } else {
      feesDb = [];
      console.warn('No fees returned from server');
    }
  } catch (err) {
    console.error('Failed to fetch fees:', err);
    feesDb = [];
  }
}

// ----------------- LOAD ACTIVE TERM -----------------
async function loadActiveTerm() {
  try {
    const data = await fetchActiveTerm();
    if (data.success) {
      window.CURRENT_YEAR_SEMESTER_ID = data.semester_id;
      document.getElementById('active-term').textContent = `${data.semester} ${data.year}`;
    } else {
      window.CURRENT_YEAR_SEMESTER_ID = null;
      document.getElementById('active-term').textContent = 'No active term';
    }
  } catch (err) {
    console.error('Failed to load active term:', err);
    window.CURRENT_YEAR_SEMESTER_ID = null;
    document.getElementById('active-term').textContent = 'Error loading term';
  }
}

// ----------------- LOAD DEPARTMENTS -----------------
async function loadDepartments() {
  try {
    const data = await fetchDepartments();
    if (data.success) {
      departmentMap = {};
      data.departments.forEach(d => (departmentMap[d.department_id] = d.department_abbr));
      renderDepartments(departmentMap, 'filter-college');
    }
  } catch (err) {
    console.error('Failed to load departments:', err);
  }
}

// ----------------- LOAD STATUSES -----------------
async function loadStatuses() {
  try {
    const data = await fetchStatuses();
    if (data.success) {
      statusMap = {};
      const select = document.getElementById('filter-status');
      select.innerHTML = '<option value="All">All Status</option>';
      data.statuses.forEach(s => {
        statusMap[s.status_id] = s.status_name;
        const opt = document.createElement('option');
        opt.value = s.status_id;
        opt.textContent = s.status_name;
        select.appendChild(opt);
      });
    }
  } catch (err) {
    console.error('Failed to load statuses:', err);
  }
}

// ----------------- LOAD STUDENTS -----------------
async function loadStudents() {
  if (!window.CURRENT_YEAR_SEMESTER_ID) return;

  try {
    const data = await fetchStudents();
    if (data.success) {
      studentDb = data.students;
      renderStudentsTable(studentDb, statusMap, departmentMap, 'student-table-body', 'toggleOfficer', 'openPayment');
    }
  } catch (err) {
    console.error('Failed to load students:', err);
  }
}

// ----------------- LOAD COURSES -----------------
async function loadCourses(departmentId) {
  const select = document.getElementById('select-course');
  if (!select) return;

  select.innerHTML = '<option value="">Loading...</option>';
  if (!departmentId) return (select.innerHTML = '<option value="">Select Course</option>');

  try {
    const data = await fetchCourses(departmentId);
    if (data.success && Array.isArray(data.courses) && data.courses.length > 0) {
      select.innerHTML = data.courses.map(c => `<option value="${c.course_id}">${c.course_name}</option>`).join('');
    } else {
      select.innerHTML = '<option value="">No courses available</option>';
    }
  } catch (err) {
    console.error('Failed to load courses:', err);
    select.innerHTML = '<option value="">Error loading courses</option>';
  }
}

// ----------------- ADD STUDENT -----------------
async function handleManualAdd(e) {
  e.preventDefault();
  const form = e.target;

  const payload = {
    student_id: form.sid.value.trim(),
    student_firstname: form.fname.value.trim(),
    student_lastname: form.lname.value.trim(),
    department_id: parseInt(form.department_id.value),
    course_id: parseInt(form.course_id.value),
    status_id: parseInt(form.status_id.value),
    year_semester_id: Number(window.CURRENT_YEAR_SEMESTER_ID) // ✅ ensure added to current term
  };

  if (!payload.student_id || !payload.student_firstname || !payload.student_lastname || !payload.department_id || !payload.course_id) {
    return alert('Please fill in all required fields.');
  }

  try {
    const data = await addStudent(payload);
    if (data.success) {
      alert('Student added successfully');
      form.reset();
      toggleModal('modal-add-student');
      await loadStudents();
    } else {
      console.warn('Add student failed:', data.message);
      if (!data.message.includes('already exists')) alert('Error: ' + data.message);
    }
  } catch (err) {
    console.error('Error adding student:', err);
    alert('Error adding student: ' + err.message);
  }
}

// ----------------- TOGGLE OFFICER -----------------
async function toggleOfficer(studentId, isChecked) {
  try {
    const data = await toggleOfficerStatus(studentId, isChecked);
    if (!data.success) alert('Failed to update officer status: ' + data.message);
    await loadStudents();
  } catch (err) {
    console.error('Error toggling officer:', err);
    alert('Error toggling officer: ' + err.message);
  }
}

// ----------------- SEMESTER DROPDOWNS -----------------
async function populateYearDropdown(selectedYearId = null) {
  const select = document.getElementById('select-year');
  if (!select) return;

  try {
    const res = await fetch('http://localhost:3000/api/term/years');
    const data = await res.json();

    select.innerHTML = '';

    if (!data.success || !Array.isArray(data.years) || data.years.length === 0) {
      select.innerHTML = '<option disabled>No years found</option>';
      return;
    }

    data.years.forEach(y => {
      const option = document.createElement('option');
      option.value = y.year_id;
      option.textContent = y.year_name;
      if (selectedYearId ? y.year_id === selectedYearId : y.is_active) option.selected = true;
      select.appendChild(option);
    });
  } catch (err) {
    console.error('Failed to load years:', err);
    select.innerHTML = '<option disabled>Error loading years</option>';
  }
}

async function populateSemesterDropdown(selectedSemester = null) {
  const select = document.getElementById('select-sem');
  if (!select) return;
  select.innerHTML = '';

  try {
    const res = await fetch('http://localhost:3000/api/term/semesters');
    const data = await res.json();

    if (data.success && Array.isArray(data.semesters) && data.semesters.length > 0) {
      const uniqueSem = [...new Set(data.semesters.map(s => s.semester_name))];
      uniqueSem.forEach(s => {
        const option = document.createElement('option');
        option.value = s;
        option.textContent = s;
        if (selectedSemester && s === selectedSemester) option.selected = true;
        select.appendChild(option);
      });
    } else {
      select.innerHTML = '<option disabled>No semesters found</option>';
    }
  } catch (err) {
    console.error('Failed to load semesters:', err);
    select.innerHTML = '<option disabled>Error loading semesters</option>';
  }
}

// ----------------- MODALS -----------------
function toggleModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.toggle('hidden');

  if (!modal.classList.contains('hidden')) {
    if (modalId === 'modal-semester') {
      populateSemesterDropdown();
      fetch('http://localhost:3000/api/term/active')
        .then(res => res.json())
        .then(data => {
          if (data.success && data.year_id) populateYearDropdown(data.year_id);
          else populateYearDropdown();
        })
        .catch(err => {
          console.error('Failed to fetch active term:', err);
          populateYearDropdown();
        });
    }

    if (modalId === 'modal-year-edit') {
      populateYearDropdown();
    }
  }
}

// ----------------- PAYMENTS HELPERS -----------------
function generateControlNumber() {
  return 'TXN-' + Math.random().toString(36).substr(2, 9).toUpperCase();
}

function getVisibleFeeCheckboxes() {
  const all = [...document.querySelectorAll('#fees-container .fee-checkbox')];
  return all.filter(cb => cb.offsetParent !== null);
}

// ✅ UPDATED: fetch payments only for current semester (backend supports ?semester_id=)
async function fetchStudentPayments(student_id) {
  const termId = Number(window.CURRENT_YEAR_SEMESTER_ID);
  const url = Number.isFinite(termId) && termId > 0
    ? `http://localhost:3000/api/payments/student/${student_id}?semester_id=${termId}`
    : `http://localhost:3000/api/payments/student/${student_id}`;

  const res = await fetch(url);

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (_) {
    throw new Error(`Payment fetch route not found or not returning JSON. Check GET /api/payments/student/:student_id (HTTP ${res.status})`);
  }

  if (!res.ok || !data.success) throw new Error(data.message || 'Failed to fetch payments');
  return data.payments || [];
}

// ✅ Receipt renderer: already paid vs current transaction, total only current txn (selection preview)
function renderReceiptWithAlreadyPaid({
  availableFees,
  paidFeeIdsBefore,
  currentTxnFeeIds = [],
  controlNumber = null,
  paymentDate = null
}) {
  const recFeesList = document.getElementById('rec-fees-list');
  const recTotal = document.getElementById('rec-total');
  const recTid = document.getElementById('rec-tid');
  const recDate = document.getElementById('rec-date');

  if (!recFeesList || !recTotal || !recTid || !recDate) return;

  if (controlNumber) recTid.innerText = controlNumber;
  if (paymentDate) {
    recDate.innerText = new Date(paymentDate).toLocaleString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  const currentSet = new Set(currentTxnFeeIds.map(Number).filter(n => Number.isFinite(n)));
  const paidBeforeSet = new Set([...paidFeeIdsBefore].map(Number));

  let total = 0;
  const lines = [];

  for (const fee of availableFees) {
    const feeId = Number(fee.fee_id);
    const feeName = fee.fee_name;
    const price = Number(fee.fee_amount || 0);

    if (paidBeforeSet.has(feeId) && !currentSet.has(feeId)) {
      lines.push(`
        <div class="flex justify-between items-center">
          <span class="font-bold">${feeName}</span>
          <span class="text-[10px] font-black text-emerald-600 uppercase">Already Paid</span>
        </div>
      `);
      continue;
    }

    if (currentSet.has(feeId)) {
      total += price;
      const priceFmt = price.toLocaleString(undefined, { minimumFractionDigits: 2 });
      lines.push(`
        <div class="flex justify-between">
          <span class="font-bold">${feeName}</span>
          <span class="font-mono font-bold">₱${priceFmt}</span>
        </div>
      `);
    }
  }

  if (lines.length === 0) {
    recFeesList.innerHTML = `<p class="text-slate-400 italic">No fees selected</p>`;
    recTotal.innerText = '₱0.00';
    if (!controlNumber) recTid.innerText = '---';
    if (!paymentDate) recDate.innerText = '---';
    return;
  }

  recFeesList.innerHTML = lines.join('');
  recTotal.innerText = '₱' + total.toLocaleString(undefined, { minimumFractionDigits: 2 });
}

// ✅ Render receipt using the saved lastReceipt (so it won’t disappear after you uncheck/disable)
function renderReceiptFromLastReceipt({ paidFeeIdsBefore, availableFees }) {
  const recFeesList = document.getElementById('rec-fees-list');
  const recTotal = document.getElementById('rec-total');
  const recTid = document.getElementById('rec-tid');
  const recDate = document.getElementById('rec-date');
  const issuerEl = document.getElementById('rec-issuer-name');
  const studentEl = document.getElementById('rec-student');

  if (!recFeesList || !recTotal || !recTid || !recDate) return;

  recTid.innerText = lastReceipt.controlNumber || '---';
  recDate.innerText = lastReceipt.dateISO
    ? new Date(lastReceipt.dateISO).toLocaleString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
      })
    : '---';

  if (issuerEl && lastReceipt.issuedBy) issuerEl.innerText = lastReceipt.issuedBy;
  if (studentEl && lastReceipt.studentName) studentEl.innerText = lastReceipt.studentName;

  const paidBeforeSet = new Set([...paidFeeIdsBefore].map(Number));
  const currentSet = new Set(lastReceipt.items.map(x => Number(x.fee_id)));

  let total = 0;
  const lines = [];

  for (const fee of availableFees) {
    const feeId = Number(fee.fee_id);
    const feeName = fee.fee_name;
    const price = Number(fee.fee_amount || 0);

    if (paidBeforeSet.has(feeId) && !currentSet.has(feeId)) {
      lines.push(`
        <div class="flex justify-between items-center">
          <span class="font-bold">${feeName}</span>
          <span class="text-[10px] font-black text-emerald-600 uppercase">Already Paid</span>
        </div>
      `);
      continue;
    }

    if (currentSet.has(feeId)) {
      total += price;
      lines.push(`
        <div class="flex justify-between">
          <span class="font-bold">${feeName}</span>
          <span class="font-mono font-bold">₱${price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
        </div>
      `);
    }
  }

  recFeesList.innerHTML = lines.length
    ? lines.join('')
    : `<p class="text-slate-400 italic">No fees selected</p>`;

  recTotal.innerText = '₱' + total.toLocaleString(undefined, { minimumFractionDigits: 2 });
}

// Bind PAY button once
function setupPayButton() {
  const payBtn = document.getElementById('btn-pay-now');
  if (!payBtn) return;
  if (payBtn.dataset.bound === '1') return;

  payBtn.addEventListener('click', handlePayNow);
  payBtn.dataset.bound = '1';
}

// ----------------- OPEN PAYMENT -----------------
async function openPayment(studentId) {
  unlockTotal();

  activeStudent = studentDb.find(s => s.student_id === studentId);
  if (!activeStudent) return;

  setupPayButton();
  setupReprintControls();

  // reset receipt state for this open
  receiptLocked = false;
  lastReceipt = { controlNumber: null, dateISO: null, issuedBy: null, studentName: null, items: [] };

  // IMPORTANT: reset reprint selection + go back to PAY mode (prevents overlap right away)
  resetReprintUI();

  const studentName = `${activeStudent.student_firstname} ${activeStudent.student_lastname}`;
  document.getElementById('pay-student-name').innerText = `${studentName} (${activeStudent.student_id})`;
  document.getElementById('rec-student').innerText = studentName;

  const issuerName = document.getElementById('user-role')?.innerText || 'Cashier';
  document.getElementById('rec-issuer-name').innerText = issuerName;

  if (!Array.isArray(feesDb) || feesDb.length === 0) return alert('No fees available.');

  // ✅ FILTER FEES BY ACTIVE SEMESTER + ROLE
  const studentRole = activeStudent.is_officer ? '0' : '1';
  const termId = Number(window.CURRENT_YEAR_SEMESTER_ID);

  const availableFees = (feesDb || [])
    .filter(fee => Number(fee.semester_id) === termId)
    .filter(fee => String(fee.role) === String(studentRole));

  // Fetch DB payments (✅ now semester-aware via querystring)
  let payments = [];
  try {
    payments = await fetchStudentPayments(activeStudent.student_id);
  } catch (e) {
    console.warn('fetchStudentPayments failed:', e.message);
    payments = [];
  }

  const paidFeeIds = new Set(payments.map(p => Number(p.fee_id)).filter(n => Number.isFinite(n)));
  paymentCacheByStudent[activeStudent.student_id] = { payments, paidFeeIds };

  // Optional: populate reprint dropdown if exists (✅ term-aware)
  const reprintSelect = document.getElementById('reprint-select');
  if (reprintSelect) {
    try {
      const txns = await fetchStudentTransactions(activeStudent.student_id);
      reprintSelect.innerHTML = '';
      if (!txns.length) {
        reprintSelect.innerHTML = `<option value="">No previous receipts</option>`;
      } else {
        reprintSelect.innerHTML =
          `<option value="">Select a receipt...</option>` +
          txns.map(t => {
            const dt = t.payment_date ? new Date(t.payment_date) : null;
            const label =
              `${t.control_number} — ${dt ? dt.toLocaleString() : ''} — ₱${Number(t.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
            return `<option value="${t.control_number}">${label}</option>`;
          }).join('');
      }
    } catch (e) {
      console.warn('fetchStudentTransactions failed:', e.message);
      reprintSelect.innerHTML = `<option value="">No previous receipts</option>`;
    }
  }

  // Build fee list UI
  const feesContainer = document.getElementById('fees-container');
  if (!feesContainer) return console.error('Fees container not found!');
  feesContainer.innerHTML = '';

  if (availableFees.length === 0) {
    feesContainer.innerHTML = `<p class="text-slate-400 italic text-xs">No applicable fees for this student (this semester)</p>`;
  } else {
    availableFees.forEach(fee => {
      const priceFormatted = parseFloat(fee.fee_amount).toLocaleString(undefined, { minimumFractionDigits: 2 });
      const isPaid = paidFeeIds.has(Number(fee.fee_id));

      const label = document.createElement('label');
      label.className =
        'flex items-center justify-between p-3 bg-white rounded-lg border border-slate-100 cursor-pointer hover:border-blue-300';

      label.innerHTML = `
        <div class="flex items-center gap-3">
          <input
            type="checkbox"
            class="fee-checkbox w-5 h-5 rounded text-blue-600"
            data-fee-id="${fee.fee_id}"
            data-fee="${fee.fee_name}"
            data-price="${fee.fee_amount}"
          >
          <span class="font-bold text-sm">${fee.fee_name}</span>
        </div>
        <span class="font-mono text-xs font-bold">₱${priceFormatted}</span>
      `;

      const cb = label.querySelector('input.fee-checkbox');

      if (isPaid) {
        cb.checked = false;
        cb.disabled = true;
        label.classList.add('opacity-60', 'cursor-not-allowed');
        label.classList.remove('cursor-pointer', 'hover:border-blue-300');
      } else {
        cb.addEventListener('change', () => {
          if (receiptLocked) return;

          // updates selection total only (utils.js must not write into receipt)
          calculateTotalFees();

          const selectedIds = [...document.querySelectorAll('#fees-container .fee-checkbox:checked')]
            .filter(x => !x.disabled)
            .map(x => Number(x.getAttribute('data-fee-id')))
            .filter(n => Number.isFinite(n));

          // live preview while selecting
          renderReceiptWithAlreadyPaid({
            availableFees,
            paidFeeIdsBefore: paidFeeIds,
            currentTxnFeeIds: selectedIds,
            controlNumber: null,
            paymentDate: null
          });
        });
      }

      feesContainer.appendChild(label);
    });
  }

  // selection total
  calculateTotalFees();

  // initial receipt: show Already Paid only, total 0
  renderReceiptWithAlreadyPaid({
    availableFees,
    paidFeeIdsBefore: paidFeeIds,
    currentTxnFeeIds: [],
    controlNumber: null,
    paymentDate: null
  });

  // clear meta
  const recTid = document.getElementById('rec-tid');
  const recDate = document.getElementById('rec-date');
  if (recTid) recTid.innerText = '---';
  if (recDate) recDate.innerText = '---';

  document.getElementById('payment-modal')?.classList.remove('hidden');
}

function closePayment() {
  unlockTotal();
  document.getElementById('payment-modal')?.classList.add('hidden');
  activeStudent = null;
}

// ----------------- PAY NOW -----------------
async function handlePayNow() {
  const payBtn = document.getElementById('btn-pay-now');
  if (payBtn?.disabled) return;

  if (!activeStudent) return alert('No active student selected.');

  // If user is in REPRINT mode, don't allow PAY (prevents UI weirdness and overlap).
  if (receiptMode === 'REPRINT') {
    alert('Currently viewing a previous receipt. Clear the reprint selection to continue paying.');
    return;
  }

  // ✅ role + term aware available fees (used for receipt renderer)
  const studentRole = activeStudent.is_officer ? '0' : '1';
  const termId = Number(window.CURRENT_YEAR_SEMESTER_ID);

  const availableFees = (feesDb || [])
    .filter(fee => Number(fee.semester_id) === termId)
    .filter(fee => String(fee.role) === String(studentRole));

  const paidFeeIdsBefore =
    paymentCacheByStudent[activeStudent.student_id]?.paidFeeIds || new Set();

  const checked = [...document.querySelectorAll('#fees-container .fee-checkbox:checked')]
    .filter(cb => !cb.disabled);

  if (checked.length === 0) return alert('Please select at least one unpaid fee to pay.');

  // snapshot selected items BEFORE unchecking/disable
  const selectedItems = checked.map(cb => ({
    fee_id: Number(cb.getAttribute('data-fee-id')),
    fee_name: cb.getAttribute('data-fee') || cb.dataset.fee || 'Fee',
    amount_paid: Number(cb.getAttribute('data-price'))
  })).filter(x =>
    Number.isFinite(x.fee_id) && x.fee_id > 0 && Number.isFinite(x.amount_paid)
  );

  const feesToPay = selectedItems.map(x => ({ fee_id: x.fee_id, amount_paid: x.amount_paid }));
  if (feesToPay.length === 0) return alert('Could not read selected fees (missing data-fee-id).');

  // ✅ visible fees = for status evaluation; must be term-filtered too
  const visibleFeeIds = getVisibleFeeCheckboxes()
    .map(cb => Number(cb.getAttribute('data-fee-id')))
    .filter(n => Number.isFinite(n) && n > 0);

  if (visibleFeeIds.length === 0) return alert('No visible fees found for status evaluation.');

  const controlNumber = generateControlNumber();
  const issuedBy = document.getElementById('user-role')?.innerText || 'Cashier';
  const studentName = `${activeStudent.student_firstname} ${activeStudent.student_lastname}`;

  payBtn.disabled = true;
  payBtn.classList.add('opacity-60', 'cursor-not-allowed');
  payBtn.textContent = 'PROCESSING...';

  try {
    const res = await fetch('http://localhost:3000/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: activeStudent.student_id,
        semester_id: termId, // ✅ IMPORTANT: send term id
        issued_by: issuedBy,
        control_number: controlNumber,
        fees: feesToPay,
        fees_to_consider: visibleFeeIds
      })
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      throw new Error(`POST /api/payments did not return JSON (HTTP ${res.status}).`);
    }

    if (!res.ok || !data.success) throw new Error(data.message || 'Payment failed.');

    const now = new Date();

    // save last receipt for printing (persist UI even after disabling/unchecking)
    lastReceipt = {
      controlNumber,
      dateISO: now.toISOString(),
      issuedBy,
      studentName,
      items: selectedItems
    };

    // lock total display (selection)
    lockTotal();

    // lock receipt (prevents checkbox changes from overwriting it)
    receiptLocked = true;

    // render receipt from saved snapshot (NOT from checkboxes)
    renderReceiptFromLastReceipt({ paidFeeIdsBefore, availableFees });

    // refresh DB truth (✅ semester-aware)
    let payments = [];
    try {
      payments = await fetchStudentPayments(activeStudent.student_id);
    } catch (e) {
      console.warn('fetchStudentPayments after pay failed:', e.message);
      payments = [];
    }

    const paidFeeIdsAfter = new Set(payments.map(p => Number(p.fee_id)).filter(n => Number.isFinite(n)));
    paymentCacheByStudent[activeStudent.student_id] = { payments, paidFeeIds: paidFeeIdsAfter };

    // disable newly paid fees (unchecked so selection totals remain correct)
    document.querySelectorAll('#fees-container .fee-checkbox').forEach(cb => {
      const feeId = Number(cb.getAttribute('data-fee-id'));
      if (paidFeeIdsAfter.has(feeId)) {
        cb.checked = false;
        cb.disabled = true;
        cb.closest('label')?.classList.add('opacity-60', 'cursor-not-allowed');
        cb.closest('label')?.classList.remove('cursor-pointer', 'hover:border-blue-300');
      }
    });

    // DO NOT overwrite receipt; this only updates selection area
    calculateTotalFees();

    // update student status locally
    activeStudent.status_id = data.status_id;
    const idx = studentDb.findIndex(s => s.student_id === activeStudent.student_id);
    if (idx !== -1) studentDb[idx].status_id = data.status_id;

    renderStudentsTable(studentDb, statusMap, departmentMap, 'student-table-body', 'toggleOfficer', 'openPayment');

  } catch (err) {
    console.error(err);
    alert(err.message || 'Payment failed.');
  } finally {
    payBtn.disabled = false;
    payBtn.classList.remove('opacity-60', 'cursor-not-allowed');
    payBtn.textContent = 'PAY';
  }
}

// ----------------- ISSUE & PRINT RECEIPT -----------------
function issueAndPrint() {
  const tidEl = document.getElementById('rec-tid');
  const currentTid = (tidEl?.innerText || '---').trim();

  if (!currentTid || currentTid === '---') {
    alert('No saved transaction yet. Please click PAY first before printing.');
    return;
  }

  // Prefer printing a receipt-only container if you have one.
  // If not, fallback to receipt-body-template.
  const receiptNode =
    document.getElementById('receipt-paper') ||
    document.getElementById('receipt-body-template');

  const receiptHTML = receiptNode?.outerHTML || '';
  const printContainer = document.getElementById('print-container');
  if (!printContainer) return alert('Print container not found.');

  printContainer.classList.remove('hidden');
  printContainer.innerHTML = `
    <div class="print-page-layout">
      <div class="receipt-copy">
        ${receiptHTML}
      </div>
    </div>
  `;

  document.body.classList.add('printing');
  setTimeout(() => {
    window.print();
    setTimeout(() => {
      document.body.classList.remove('printing');
      printContainer.innerHTML = '';
      printContainer.classList.add('hidden');
      closePayment();
    }, 500);
  }, 100);
}

// ----------------- FILTER STUDENTS -----------------
window.filterStudents = function filterStudents() {
  const search = document.getElementById('search-id')?.value.toLowerCase() || '';
  const status = document.getElementById('filter-status')?.value || 'All';
  const department = document.getElementById('filter-college')?.value || 'All';

  const filtered = studentDb.filter(s => {
    const studentIdStr = String(s.student_id).toLowerCase();
    const matchesSearch =
      studentIdStr.includes(search) ||
      s.student_firstname.toLowerCase().includes(search) ||
      s.student_lastname.toLowerCase().includes(search);

    const matchesStatus = status === 'All' || s.status_id == status;
    const matchesDept = department === 'All' || s.department_id == department;

    return matchesSearch && matchesStatus && matchesDept;
  });

  renderStudentsTable(filtered, statusMap, departmentMap, 'student-table-body', 'toggleOfficer', 'openPayment');
};

// ----------------- EXPORT FUNCTIONS FOR HTML -----------------
window.toggleOfficer = toggleOfficer;
window.openPayment = openPayment;
window.calculateTotalFees = calculateTotalFees;
window.toggleSidebar = toggleSidebar;
window.toggleModal = toggleModal;
window.closePayment = closePayment;
window.issueAndPrint = issueAndPrint;
window.handleManualAdd = handleManualAdd;
window.handlePayNow = handlePayNow;
