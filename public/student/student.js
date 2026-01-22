// student.js
import {
  fetchActiveTerm,
  fetchDepartments,
  fetchStatuses,
  fetchStudents,
  fetchCourses,
  addStudent,
  toggleOfficerStatus,
  updateTerm
} from "./api.js";

import { renderStudentsTable, renderDepartments } from "./render.js";
import { calculateTotalFees, toggleSidebar, lockTotal, unlockTotal } from "./utils.js";

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
let receiptMode = "PAY"; // 'PAY' | 'REPRINT'

// ----------------- MODAL-FIRST HELPERS (NO BROWSER DEFAULT) -----------------
function hasModalAlert() {
  return typeof window.openAlert === "function";
}

function hasModalConfirm() {
  return typeof window.openConfirm === "function";
}

function uiAlert(message, type = "info", title = "Notice", subtitle = "") {
  if (hasModalAlert()) {
    window.openAlert({ type, title, subtitle, message: String(message ?? "") });
  } else {
    alert(String(message ?? ""));
  }
}

/**
 * Promise-based confirm.
 * Supports two modal implementations:
 * 1) openConfirm returns Promise<boolean>  ✅ (recommended)
 * 2) openConfirm uses callback onConfirm + closeConfirm  (legacy)
 */
function uiConfirm({
  title = "Confirm",
  subtitle = "Please confirm your action.",
  message = "Are you sure you want to continue?",
  okText = "Yes, Continue",
  okClass = "bg-slate-900 hover:bg-slate-800",
  cancelText = "Cancel"
} = {}) {
  if (hasModalConfirm()) {
    // ✅ If your openConfirm already returns a promise, use it
    try {
      const maybePromise = window.openConfirm({
        title,
        subtitle,
        message,
        okText,
        okClass,
        cancelText
      });

      if (maybePromise && typeof maybePromise.then === "function") {
        return maybePromise;
      }
    } catch (e) {
      console.warn("openConfirm threw, falling back to legacy wrapper:", e);
    }

    // ✅ Legacy wrapper (onConfirm + closeConfirm override)
    return new Promise((resolve) => {
      window.openConfirm({
        title,
        subtitle,
        message,
        okText,
        okClass,
        cancelText,
        onConfirm: () => resolve(true)
      });

      const originalClose = window.closeConfirm;
      if (typeof originalClose === "function") {
        window.closeConfirm = function () {
          try {
            originalClose();
          } finally {
            resolve(false);
            window.closeConfirm = originalClose;
          }
        };
      }
    });
  }

  return Promise.resolve(confirm(message));
}

// ----------------- HELPERS -----------------
function getStudentRoleString(student) {
  return student?.is_officer ? "1" : "0";
}

function money(n) {
  const v = Number(n || 0);
  return v.toLocaleString(undefined, { minimumFractionDigits: 2 });
}

// ----------------- UI HELPERS (no-overlap controls) -----------------
function setReceiptMode(mode) {
  receiptMode = mode === "REPRINT" ? "REPRINT" : "PAY";

  const payBtn = document.getElementById("btn-pay-now");
  const feesContainer = document.getElementById("fees-container");

  if (payBtn) {
    if (receiptMode === "REPRINT") payBtn.classList.add("hidden");
    else payBtn.classList.remove("hidden");
  }

  if (feesContainer) {
    if (receiptMode === "REPRINT") feesContainer.classList.add("pointer-events-none", "opacity-70");
    else feesContainer.classList.remove("pointer-events-none", "opacity-70");
  }

  const actions = document.getElementById("receipt-actions") || document.getElementById("payment-actions");
  if (actions) actions.classList.add("flex", "flex-wrap", "gap-2", "items-center");

  const reprintWrap = document.getElementById("reprint-wrap");
  if (reprintWrap) reprintWrap.classList.add("w-full");
}

function resetReprintUI() {
  const sel = document.getElementById("reprint-select");
  if (sel) sel.value = "";
  setReceiptMode("PAY");
}

function setupReprintControls() {
  const sel = document.getElementById("reprint-select");
  if (sel && !sel.dataset.bound) {
    sel.addEventListener("change", () => {
      if (sel.value) {
        setReceiptMode("REPRINT");
      } else {
        receiptLocked = false;
        unlockTotal();
        setReceiptMode("PAY");
      }
    });
    sel.dataset.bound = "1";
  }
}

// ----------------- TERM / SEMESTER UPDATE -----------------
window.requestUpdateTerm = async function requestUpdateTerm() {
  const yearInput = document.getElementById("input-ay")?.value.trim();
  const semInput = document.getElementById("input-sem-manual")?.value.trim();

  const yearSelect = document.getElementById("select-year");
  const semSelect = document.getElementById("select-sem");

  const yearName = yearInput || yearSelect?.selectedOptions?.[0]?.textContent?.trim();
  const semName = semInput || semSelect?.selectedOptions?.[0]?.textContent?.trim();

  if (!yearName || !semName) {
    uiAlert("Please select or enter both Academic Year and Semester.", "warning", "Missing Fields");
    return;
  }

  try {
    const data = await updateTerm({ year: yearName, semester: semName });

    if (!data.success) {
      uiAlert(data.message || "Failed to update term.", "error", "Update Failed");
      return;
    }

    uiAlert("Term updated successfully!", "success", "Updated");

    // clear manual inputs
    const ay = document.getElementById("input-ay");
    const sm = document.getElementById("input-sem-manual");
    if (ay) ay.value = "";
    if (sm) sm.value = "";

    // refresh active term label (and CURRENT_YEAR_SEMESTER_ID)
    await loadActiveTerm();

    // refresh dropdowns to reflect active
    try {
      const active = await fetchActiveTerm();
      if (active?.success) {
        await populateYearDropdown(active.year_id);
        await populateSemesterDropdown(active.year_id, active.semester_id);
      } else {
        await populateYearDropdown();
        await populateSemesterDropdown();
      }
    } catch {
      await populateYearDropdown();
      await populateSemesterDropdown();
    }

    // reload students for the new term
    await loadStudents();

    // close modal
    toggleModal("modal-semester");
  } catch (err) {
    console.error("Failed to update term:", err);
    uiAlert("Failed to update term: " + (err.message || String(err)), "error", "Update Failed");
  }
};

// ----------------- INIT -----------------
document.addEventListener("DOMContentLoaded", async () => {
  lucide.createIcons();

  await loadActiveTerm();
  await loadDepartments();
  await loadStatuses();
  await loadStudents();
  await loadFees();

  setupPayButton();
  setupReprintControls();

  document.getElementById("select-department")?.addEventListener("change", (e) => loadCourses(e.target.value));

  const addStudentForm = document.getElementById("form-add-student");
  if (addStudentForm) addStudentForm.addEventListener("submit", handleManualAdd);
});

// ----------------- REPRINT HELPERS -----------------
async function fetchStudentTransactions(student_id) {
  const termId = Number(window.CURRENT_YEAR_SEMESTER_ID);
  const url =
    Number.isFinite(termId) && termId > 0
      ? `http://localhost:3000/api/payments/student/${student_id}/transactions?semester_id=${termId}`
      : `http://localhost:3000/api/payments/student/${student_id}/transactions`;

  const res = await fetch(url);
  const text = await res.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Transactions route not returning JSON (HTTP ${res.status}).`);
  }

  if (!res.ok || !data.success) throw new Error(data.message || "Failed to fetch transactions");
  return data.transactions || [];
}

async function fetchReceiptByControlNumber(controlNumber) {
  const res = await fetch(`http://localhost:3000/api/payments/receipt/${encodeURIComponent(controlNumber)}`);
  const text = await res.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Receipt route not returning JSON (HTTP ${res.status}).`);
  }

  if (!res.ok || !data.success) throw new Error(data.message || "Failed to fetch receipt");
  return data.receipt;
}

function renderReceiptFromDbReceipt(receipt) {
  const tidEl = document.getElementById("rec-tid");
  const dateEl = document.getElementById("rec-date");
  const issuerEl = document.getElementById("rec-issuer-name");
  const listEl = document.getElementById("rec-fees-list");
  const totalEl = document.getElementById("rec-total");

  if (!tidEl || !dateEl || !issuerEl || !listEl || !totalEl) return;

  tidEl.innerText = receipt.control_number || "---";
  dateEl.innerText = receipt.payment_date
    ? new Date(receipt.payment_date).toLocaleString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })
    : "---";
  issuerEl.innerText = receipt.issued_by || "Cashier";

  listEl.innerHTML = (receipt.items || [])
    .map((it) => {
      const amt = Number(it.amount_paid || 0);
      return `
        <div class="flex justify-between">
          <span class="font-bold">${it.fee_name || `Fee #${it.fee_id}`}</span>
          <span class="font-mono font-bold">₱${money(amt)}</span>
        </div>
      `;
    })
    .join("");

  const total = Number(receipt.total_amount || 0);
  totalEl.innerText = "₱" + money(total);
}

async function handleReprintReceipt() {
  if (!activeStudent) return uiAlert("No student selected.", "warning", "Reprint");

  const sel = document.getElementById("reprint-select");
  const cn = sel?.value;
  if (!cn) return uiAlert("Please select a receipt to reprint.", "warning", "Reprint");

  try {
    setReceiptMode("REPRINT");
    lockTotal();
    receiptLocked = true;

    const receipt = await fetchReceiptByControlNumber(cn);
    renderReceiptFromDbReceipt(receipt);
  } catch (err) {
    console.error(err);
    uiAlert(err.message || "Failed to reprint receipt.", "error", "Reprint Failed");
  }
}
window.handleReprintReceipt = handleReprintReceipt;

// ----------------- REMOVE STUDENT -----------------
async function removeStudent(studentId) {
  const student = (studentDb || []).find((s) => String(s.student_id) === String(studentId));

  if (student && Number(student.status_id) === 2) {
    uiAlert("Cannot delete this student because the status is PAID.", "warning", "Delete Blocked");
    return;
  }

  const ok = await uiConfirm({
    title: "Delete Student",
    subtitle: "This will perform a soft delete.",
    message: `Delete/Remove student ${studentId}?`,
    okText: "Yes, Delete",
    okClass: "bg-red-600 hover:bg-red-700"
  });
  if (!ok) return;

  try {
    const res = await fetch("http://localhost:3000/api/students/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ student_id: studentId })
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Remove route not returning JSON (HTTP ${res.status}).`);
    }

    if (!res.ok || !data.success) throw new Error(data.message || "Failed to delete student.");

    studentDb = studentDb.filter((s) => String(s.student_id) !== String(studentId));

    renderStudentsTable(studentDb, statusMap, departmentMap, "student-table-body", "toggleOfficer", "openPayment", "removeStudent");
    lucide.createIcons();

    if (activeStudent && String(activeStudent.student_id) === String(studentId)) {
      closePayment();
    }

    uiAlert("Student deleted (soft delete).", "success", "Deleted");
  } catch (err) {
    console.error(err);
    uiAlert(err.message || "Delete failed.", "error", "Delete Failed");
  }
}

// ----------------- FEES -----------------
async function loadFees() {
  try {
    const res = await fetch("http://localhost:3000/api/fees");
    const data = await res.json();
    if (data.success && Array.isArray(data.fees)) {
      feesDb = data.fees;
    } else {
      feesDb = [];
      console.warn("No fees returned from server");
    }
  } catch (err) {
    console.error("Failed to fetch fees:", err);
    feesDb = [];
  }
}

// ----------------- LOAD ACTIVE TERM -----------------
async function loadActiveTerm() {
  try {
    const data = await fetchActiveTerm();
    if (data.success) {
      window.CURRENT_YEAR_SEMESTER_ID = data.semester_id;
      const el = document.getElementById("active-term");
      if (el) el.textContent = `${data.semester} ${data.year}`;
    } else {
      window.CURRENT_YEAR_SEMESTER_ID = null;
      const el = document.getElementById("active-term");
      if (el) el.textContent = "No active term";
    }
  } catch (err) {
    console.error("Failed to load active term:", err);
    window.CURRENT_YEAR_SEMESTER_ID = null;
    const el = document.getElementById("active-term");
    if (el) el.textContent = "Error loading term";
  }
}

// ----------------- LOAD DEPARTMENTS -----------------
async function loadDepartments() {
  try {
    const data = await fetchDepartments();
    if (data.success) {
      departmentMap = {};
      data.departments.forEach((d) => (departmentMap[d.department_id] = d.department_abbr));
      renderDepartments(departmentMap, "filter-college");
    }
  } catch (err) {
    console.error("Failed to load departments:", err);
  }
}

// ----------------- LOAD STATUSES -----------------
async function loadStatuses() {
  try {
    const data = await fetchStatuses();
    if (data.success) {
      statusMap = {};
      const select = document.getElementById("filter-status");
      if (!select) return;

      select.innerHTML = '<option value="All">All Status</option>';
      data.statuses.forEach((s) => {
        statusMap[s.status_id] = s.status_name;
        const opt = document.createElement("option");
        opt.value = s.status_id;
        opt.textContent = s.status_name;
        select.appendChild(opt);
      });
    }
  } catch (err) {
    console.error("Failed to load statuses:", err);
  }
}

// ----------------- LOAD STUDENTS -----------------
async function loadStudents() {
  if (!window.CURRENT_YEAR_SEMESTER_ID) return;

  try {
    const data = await fetchStudents();
    if (data.success) {
      studentDb = data.students;

      renderStudentsTable(studentDb, statusMap, departmentMap, "student-table-body", "toggleOfficer", "openPayment", "removeStudent");
      lucide.createIcons();
    }
  } catch (err) {
    console.error("Failed to load students:", err);
  }
}

// ----------------- LOAD COURSES -----------------
async function loadCourses(departmentId) {
  const select = document.getElementById("select-course");
  if (!select) return;

  select.innerHTML = "<option value=''>Loading...</option>";
  if (!departmentId) return (select.innerHTML = "<option value=''>Select Course</option>");

  try {
    const data = await fetchCourses(departmentId);
    if (data.success && Array.isArray(data.courses) && data.courses.length > 0) {
      select.innerHTML = data.courses.map((c) => `<option value="${c.course_id}">${c.course_name}</option>`).join("");
    } else {
      select.innerHTML = "<option value=''>No courses available</option>";
    }
  } catch (err) {
    console.error("Failed to load courses:", err);
    select.innerHTML = "<option value=''>Error loading courses</option>";
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
    status_id: 1,
    year_semester_id: Number(window.CURRENT_YEAR_SEMESTER_ID)
  };

  if (!payload.student_id || !payload.student_firstname || !payload.student_lastname || !payload.department_id || !payload.course_id) {
    uiAlert("Please fill in all required fields.", "warning", "Missing Fields");
    return;
  }

  try {
    const data = await addStudent(payload);
    if (data.success) {
      if (typeof window.showStudentAddedSuccess === "function") {
        window.showStudentAddedSuccess(payload.student_id);
      } else {
        uiAlert("Student added successfully", "success", "Student Added");
      }

      form.reset();
      toggleModal("modal-add-student");
      await loadStudents();
    } else {
      console.warn("Add student failed:", data.message);

      const msg = String(data.message || "");
      if (msg.toLowerCase().includes("already exists") || msg.toLowerCase().includes("duplicate")) {
        if (typeof window.showStudentDuplicateError === "function") {
          window.showStudentDuplicateError(payload.student_id);
        } else {
          uiAlert(`Duplicate: ${payload.student_id} already exists.`, "error", "Duplicate Student");
        }
        return;
      }

      uiAlert("Error: " + (data.message || "Failed to add student"), "error", "Add Failed");
    }
  } catch (err) {
    console.error("Error adding student:", err);
    uiAlert("Error adding student: " + err.message, "error", "Add Failed");
  }
}

// ----------------- TOGGLE OFFICER -----------------
async function toggleOfficer(studentId, isChecked) {
  try {
    const data = await toggleOfficerStatus(studentId, isChecked);
    if (!data.success) uiAlert("Failed to update officer status: " + data.message, "error", "Update Failed");
    await loadStudents();
  } catch (err) {
    console.error("Error toggling officer:", err);
    uiAlert("Error toggling officer: " + err.message, "error", "Update Failed");
  }
}

// ----------------- SEMESTER DROPDOWNS -----------------
async function populateYearDropdown(selectedYearId = null) {
  const select = document.getElementById("select-year");
  if (!select) return;

  try {
    const res = await fetch("http://localhost:3000/api/term/years");
    const data = await res.json();

    select.innerHTML = "";

    if (!data.success || !Array.isArray(data.years) || data.years.length === 0) {
      select.innerHTML = "<option disabled>No years found</option>";
      return;
    }

    data.years.forEach((y) => {
      const option = document.createElement("option");
      option.value = y.year_id;
      option.textContent = y.year_name;
      if (selectedYearId ? String(y.year_id) === String(selectedYearId) : y.is_active) option.selected = true;
      select.appendChild(option);
    });
  } catch (err) {
    console.error("Failed to load years:", err);
    select.innerHTML = "<option disabled>Error loading years</option>";
  }
}

async function populateSemesterDropdown(yearId = null, selectedSemesterId = null) {
  const select = document.getElementById("select-sem");
  if (!select) return;

  select.innerHTML = "<option value=''>Loading...</option>";

  try {
    const url = yearId
      ? `http://localhost:3000/api/term/semesters?year_id=${encodeURIComponent(yearId)}`
      : `http://localhost:3000/api/term/semesters`;

    const res = await fetch(url);
    const data = await res.json();

    select.innerHTML = "";

    if (!data.success || !Array.isArray(data.semesters) || data.semesters.length === 0) {
      select.innerHTML = "<option value='' disabled>No semesters found</option>";
      return;
    }

    data.semesters.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.semester_id;
      opt.textContent = s.semester_name;

      if (selectedSemesterId && String(s.semester_id) === String(selectedSemesterId)) {
        opt.selected = true;
      } else if (!selectedSemesterId && s.is_active) {
        opt.selected = true;
      }

      select.appendChild(opt);
    });
  } catch (err) {
    console.error("Failed to load semesters:", err);
    select.innerHTML = "<option value='' disabled>Error loading semesters</option>";
  }
}

// ----------------- MODALS -----------------
function toggleModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.toggle("hidden");

  if (!modal.classList.contains("hidden")) {
    if (modalId === "modal-semester") {
      fetch("http://localhost:3000/api/term/active")
        .then((res) => res.json())
        .then(async (data) => {
          if (data.success && data.year_id) {
            await populateYearDropdown(data.year_id);
            await populateSemesterDropdown(data.year_id, data.semester_id);
          } else {
            await populateYearDropdown();
            const yearSel = document.getElementById("select-year");
            await populateSemesterDropdown(yearSel?.value || null, null);
          }

          // bind once: changing year reloads semester dropdown
          const yearSel = document.getElementById("select-year");
          if (yearSel && !yearSel.dataset.bound) {
            yearSel.addEventListener("change", async () => {
              await populateSemesterDropdown(yearSel.value, null);
            });
            yearSel.dataset.bound = "1";
          }
        })
        .catch(async (err) => {
          console.error("Failed to fetch active term:", err);
          await populateYearDropdown();
          const yearSel = document.getElementById("select-year");
          await populateSemesterDropdown(yearSel?.value || null, null);
        });
    }

    if (modalId === "modal-year-edit") {
      populateYearDropdown();
    }
  }
}

// ----------------- PAYMENT HELPERS -----------------
function generateControlNumber() {
  return "TXN-" + Math.random().toString(36).substr(2, 9).toUpperCase();
}

function getVisibleFeeCheckboxes() {
  const all = [...document.querySelectorAll("#fees-container .fee-checkbox")];
  return all.filter((cb) => cb.offsetParent !== null);
}

async function fetchStudentPayments(student_id) {
  const termId = Number(window.CURRENT_YEAR_SEMESTER_ID);
  const url =
    Number.isFinite(termId) && termId > 0
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

  if (!res.ok || !data.success) throw new Error(data.message || "Failed to fetch payments");
  return data.payments || [];
}

// Receipt renderer: already paid vs current transaction
function renderReceiptWithAlreadyPaid({
  availableFees,
  paidFeeIdsBefore,
  currentTxnFeeIds = [],
  controlNumber = null,
  paymentDate = null
}) {
  const recFeesList = document.getElementById("rec-fees-list");
  const recTotal = document.getElementById("rec-total");
  const recTid = document.getElementById("rec-tid");
  const recDate = document.getElementById("rec-date");

  if (!recFeesList || !recTotal || !recTid || !recDate) return;

  if (controlNumber) recTid.innerText = controlNumber;
  if (paymentDate) {
    recDate.innerText = new Date(paymentDate).toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  const currentSet = new Set(currentTxnFeeIds.map(Number).filter((n) => Number.isFinite(n)));
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
      lines.push(`
        <div class="flex justify-between">
          <span class="font-bold">${feeName}</span>
          <span class="font-mono font-bold">₱${money(price)}</span>
        </div>
      `);
    }
  }

  if (lines.length === 0) {
    recFeesList.innerHTML = `<p class="text-slate-400 italic">No fees selected</p>`;
    recTotal.innerText = "₱0.00";
    if (!controlNumber) recTid.innerText = "---";
    if (!paymentDate) recDate.innerText = "---";
    return;
  }

  recFeesList.innerHTML = lines.join("");
  recTotal.innerText = "₱" + money(total);
}

// Render receipt using the saved lastReceipt snapshot
function renderReceiptFromLastReceipt({ paidFeeIdsBefore, availableFees }) {
  const recFeesList = document.getElementById("rec-fees-list");
  const recTotal = document.getElementById("rec-total");
  const recTid = document.getElementById("rec-tid");
  const recDate = document.getElementById("rec-date");
  const issuerEl = document.getElementById("rec-issuer-name");
  const studentEl = document.getElementById("rec-student");

  if (!recFeesList || !recTotal || !recTid || !recDate) return;

  recTid.innerText = lastReceipt.controlNumber || "---";
  recDate.innerText = lastReceipt.dateISO
    ? new Date(lastReceipt.dateISO).toLocaleString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })
    : "---";

  if (issuerEl) issuerEl.innerText = lastReceipt.issuedBy || issuerEl.innerText || "Cashier";
  if (studentEl) studentEl.innerText = lastReceipt.studentName || studentEl.innerText || "";

  const paidBeforeSet = new Set([...paidFeeIdsBefore].map(Number));
  const feeMap = new Map((availableFees || []).map((f) => [Number(f.fee_id), f]));

  const lines = [];
  let total = 0;

  if (Array.isArray(availableFees) && availableFees.length) {
    for (const fee of availableFees) {
      const feeId = Number(fee.fee_id);
      const wasInLastReceipt = (lastReceipt.items || []).some((x) => Number(x.fee_id) === feeId);

      if (paidBeforeSet.has(feeId) && !wasInLastReceipt) {
        lines.push(`
          <div class="flex justify-between items-center">
            <span class="font-bold">${fee.fee_name}</span>
            <span class="text-[10px] font-black text-emerald-600 uppercase">Already Paid</span>
          </div>
        `);
      }
    }
  }

  for (const it of lastReceipt.items || []) {
    const feeId = Number(it.fee_id);
    const amt = Number(it.amount_paid || 0);
    total += amt;

    const displayName = it.fee_name || feeMap.get(feeId)?.fee_name || `Fee #${feeId}`;

    lines.push(`
      <div class="flex justify-between">
        <span class="font-bold">${displayName}</span>
        <span class="font-mono font-bold">₱${money(amt)}</span>
      </div>
    `);
  }

  recFeesList.innerHTML = lines.length ? lines.join("") : `<p class="text-slate-400 italic">No fees selected</p>`;
  recTotal.innerText = "₱" + money(total);
}

// Bind PAY button once
function setupPayButton() {
  const payBtn = document.getElementById("btn-pay-now");
  if (!payBtn) return;
  if (payBtn.dataset.bound === "1") return;

  payBtn.addEventListener("click", handlePayNow);
  payBtn.dataset.bound = "1";
}

// ----------------- OPEN PAYMENT -----------------
async function openPayment(studentId) {
  unlockTotal();

  activeStudent = studentDb.find((s) => s.student_id === studentId);
  if (!activeStudent) return;

  setupPayButton();
  setupReprintControls();

  receiptLocked = false;
  lastReceipt = { controlNumber: null, dateISO: null, issuedBy: null, studentName: null, items: [] };

  resetReprintUI();

  const studentName = `${activeStudent.student_firstname} ${activeStudent.student_lastname}`;
  document.getElementById("pay-student-name").innerText = `${studentName} (${activeStudent.student_id})`;
  document.getElementById("rec-student").innerText = studentName;

  const issuerName = document.getElementById("user-role")?.innerText || "Cashier";
  document.getElementById("rec-issuer-name").innerText = issuerName;

  if (!Array.isArray(feesDb) || feesDb.length === 0) {
    uiAlert("No fees available.", "warning", "Fees");
    return;
  }

  const studentRole = getStudentRoleString(activeStudent);
  const termId = Number(window.CURRENT_YEAR_SEMESTER_ID);

  const availableFees = (feesDb || [])
    .filter((fee) => Number(fee.semester_id) === termId)
    .filter((fee) => String(fee.role) === String(studentRole));

  let payments = [];
  try {
    payments = await fetchStudentPayments(activeStudent.student_id);
  } catch (e) {
    console.warn("fetchStudentPayments failed:", e.message);
    payments = [];
  }

  const paidFeeIds = new Set(payments.map((p) => Number(p.fee_id)).filter((n) => Number.isFinite(n)));
  paymentCacheByStudent[activeStudent.student_id] = { payments, paidFeeIds };

  const reprintSelect = document.getElementById("reprint-select");
  if (reprintSelect) {
    try {
      const txns = await fetchStudentTransactions(activeStudent.student_id);
      reprintSelect.innerHTML = "";
      if (!txns.length) {
        reprintSelect.innerHTML = `<option value="">No previous receipts</option>`;
      } else {
        reprintSelect.innerHTML =
          `<option value="">Select a receipt...</option>` +
          txns
            .map((t) => {
              const dt = t.payment_date ? new Date(t.payment_date) : null;
              const label = `${t.control_number} — ${dt ? dt.toLocaleString() : ""} — ₱${money(t.total_amount)}`;
              return `<option value="${t.control_number}">${label}</option>`;
            })
            .join("");
      }
    } catch (e) {
      console.warn("fetchStudentTransactions failed:", e.message);
      reprintSelect.innerHTML = `<option value="">No previous receipts</option>`;
    }
  }

  const feesContainer = document.getElementById("fees-container");
  if (!feesContainer) return console.error("Fees container not found!");
  feesContainer.innerHTML = "";

  const getPaidFeeIdsNow = () => paymentCacheByStudent[activeStudent.student_id]?.paidFeeIds || paidFeeIds;

  const startNewSelectionSessionIfNeeded = () => {
    if (!receiptLocked) return;

    receiptLocked = false;
    unlockTotal();

    lastReceipt = { controlNumber: null, dateISO: null, issuedBy: null, studentName: null, items: [] };

    const recTid = document.getElementById("rec-tid");
    const recDate = document.getElementById("rec-date");
    if (recTid) recTid.innerText = "---";
    if (recDate) recDate.innerText = "---";
  };

  if (availableFees.length === 0) {
    feesContainer.innerHTML = `<p class="text-slate-400 italic text-xs">No applicable fees for this student (this semester)</p>`;
  } else {
    availableFees.forEach((fee) => {
      const priceFormatted = money(fee.fee_amount);
      const isPaid = getPaidFeeIdsNow().has(Number(fee.fee_id));

      const label = document.createElement("label");
      label.className =
        "flex items-center justify-between p-3 bg-white rounded-lg border border-slate-100 cursor-pointer hover:border-blue-300";

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

      const cb = label.querySelector("input.fee-checkbox");

      if (isPaid) {
        cb.checked = false;
        cb.disabled = true;
        label.classList.add("opacity-60", "cursor-not-allowed");
        label.classList.remove("cursor-pointer", "hover:border-blue-300");
      } else {
        cb.addEventListener("change", () => {
          startNewSelectionSessionIfNeeded();

          calculateTotalFees();

          const selectedIds = [...document.querySelectorAll("#fees-container .fee-checkbox:checked")]
            .filter((x) => !x.disabled)
            .map((x) => Number(x.getAttribute("data-fee-id")))
            .filter((n) => Number.isFinite(n));

          const paidNow = getPaidFeeIdsNow();

          renderReceiptWithAlreadyPaid({
            availableFees,
            paidFeeIdsBefore: paidNow,
            currentTxnFeeIds: selectedIds,
            controlNumber: null,
            paymentDate: null
          });
        });
      }

      feesContainer.appendChild(label);
    });
  }

  calculateTotalFees();

  renderReceiptWithAlreadyPaid({
    availableFees,
    paidFeeIdsBefore: getPaidFeeIdsNow(),
    currentTxnFeeIds: [],
    controlNumber: null,
    paymentDate: null
  });

  const recTid = document.getElementById("rec-tid");
  const recDate = document.getElementById("rec-date");
  if (recTid) recTid.innerText = "---";
  if (recDate) recDate.innerText = "---";

  document.getElementById("payment-modal")?.classList.remove("hidden");
}

function closePayment() {
  unlockTotal();
  document.getElementById("payment-modal")?.classList.add("hidden");
  activeStudent = null;
}

// ----------------- PAY NOW -----------------
async function handlePayNow() {
  const payBtn = document.getElementById("btn-pay-now");
  if (payBtn?.disabled) return;

  if (!activeStudent) {
    uiAlert("No active student selected.", "warning", "Payment");
    return;
  }

  if (receiptMode === "REPRINT") {
    uiAlert("Currently viewing a previous receipt. Clear the reprint selection to continue paying.", "warning", "Payment");
    return;
  }

  const termId = Number(window.CURRENT_YEAR_SEMESTER_ID);
  if (!Number.isFinite(termId) || termId <= 0) {
    uiAlert("No active term found.", "warning", "Payment");
    return;
  }

  const studentRole = getStudentRoleString(activeStudent);

  const availableFees = (feesDb || [])
    .filter((fee) => Number(fee.semester_id) === termId)
    .filter((fee) => String(fee.role) === String(studentRole));

  const paidFeeIdsBefore = paymentCacheByStudent[activeStudent.student_id]?.paidFeeIds || new Set();

  const checked = [...document.querySelectorAll("#fees-container .fee-checkbox:checked")].filter((cb) => !cb.disabled);

  if (checked.length === 0) {
    uiAlert("Please select at least one unpaid fee to pay.", "warning", "Payment");
    return;
  }

  const selectedItems = checked
    .map((cb) => ({
      fee_id: Number(cb.getAttribute("data-fee-id")),
      fee_name: cb.getAttribute("data-fee") || cb.dataset.fee || "Fee",
      amount_paid: Number(cb.getAttribute("data-price"))
    }))
    .filter((x) => Number.isFinite(x.fee_id) && x.fee_id > 0 && Number.isFinite(x.amount_paid));

  const feesToPay = selectedItems.map((x) => ({ fee_id: x.fee_id, amount_paid: x.amount_paid }));
  if (feesToPay.length === 0) {
    uiAlert("Could not read selected fees (missing data-fee-id).", "error", "Payment Failed");
    return;
  }

  const visibleFeeIds = getVisibleFeeCheckboxes()
    .map((cb) => Number(cb.getAttribute("data-fee-id")))
    .filter((n) => Number.isFinite(n) && n > 0);

  const controlNumber = generateControlNumber();
  const issuedBy = document.getElementById("user-role")?.innerText || "Cashier";
  const studentName = `${activeStudent.student_firstname} ${activeStudent.student_lastname}`;

  payBtn.disabled = true;
  payBtn.classList.add("opacity-60", "cursor-not-allowed");
  payBtn.textContent = "PROCESSING...";

  try {
    const res = await fetch("http://localhost:3000/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: activeStudent.student_id,
        semester_id: termId,
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

    if (!res.ok || !data.success) throw new Error(data.message || "Payment failed.");

    const now = new Date();

    lastReceipt = {
      controlNumber,
      dateISO: now.toISOString(),
      issuedBy,
      studentName,
      items: selectedItems
    };

    receiptLocked = true;

    renderReceiptFromLastReceipt({ paidFeeIdsBefore, availableFees });

    lockTotal(selectedItems.reduce((s, i) => s + Number(i.amount_paid || 0), 0));

    let payments = [];
    try {
      payments = await fetchStudentPayments(activeStudent.student_id);
    } catch (e) {
      console.warn("fetchStudentPayments after pay failed:", e.message);
      payments = [];
    }

    const paidFeeIdsAfter = new Set(payments.map((p) => Number(p.fee_id)).filter((n) => Number.isFinite(n)));
    paymentCacheByStudent[activeStudent.student_id] = { payments, paidFeeIds: paidFeeIdsAfter };

    document.querySelectorAll("#fees-container .fee-checkbox").forEach((cb) => {
      const feeId = Number(cb.getAttribute("data-fee-id"));
      if (paidFeeIdsAfter.has(feeId)) {
        cb.checked = false;
        cb.disabled = true;
        cb.closest("label")?.classList.add("opacity-60", "cursor-not-allowed");
        cb.closest("label")?.classList.remove("cursor-pointer", "hover:border-blue-300");
      }
    });

    calculateTotalFees();

    activeStudent.status_id = data.status_id;
    const idx = studentDb.findIndex((s) => s.student_id === activeStudent.student_id);
    if (idx !== -1) studentDb[idx].status_id = data.status_id;

    renderStudentsTable(studentDb, statusMap, departmentMap, "student-table-body", "toggleOfficer", "openPayment", "removeStudent");

    uiAlert("Payment processed successfully.", "success", "Payment Successful");
  } catch (err) {
    console.error(err);
    uiAlert(err.message || "Payment failed.", "error", "Payment Failed");
  } finally {
    payBtn.disabled = false;
    payBtn.classList.remove("opacity-60", "cursor-not-allowed");
    payBtn.textContent = "PAY";
  }
}

// ----------------- ISSUE & PRINT RECEIPT -----------------
function issueAndPrint() {
  const tidEl = document.getElementById("rec-tid");
  const currentTid = (tidEl?.innerText || "---").trim();

  if (!currentTid || currentTid === "---") {
    uiAlert("No saved transaction yet. Please click PAY first before printing.", "warning", "Print Receipt");
    return;
  }

  const receiptNode = document.getElementById("receipt-paper") || document.getElementById("receipt-body-template");

  const receiptHTML = receiptNode?.outerHTML || "";
  const printContainer = document.getElementById("print-container");
  if (!printContainer) {
    uiAlert("Print container not found.", "error", "Print Receipt");
    return;
  }

  printContainer.classList.remove("hidden");
  printContainer.innerHTML = `
    <div class="print-page-layout">
      <div class="receipt-copy">
        ${receiptHTML}
      </div>
    </div>
  `;

  document.body.classList.add("printing");
  setTimeout(() => {
    window.print();
    setTimeout(() => {
      document.body.classList.remove("printing");
      printContainer.innerHTML = "";
      printContainer.classList.add("hidden");
      closePayment();
    }, 500);
  }, 100);
}

// ----------------- FILTER STUDENTS -----------------
window.filterStudents = function filterStudents() {
  const search = (document.getElementById("search-id")?.value || "").toLowerCase().trim();
  const status = document.getElementById("filter-status")?.value || "All";
  const department = document.getElementById("filter-college")?.value || "All";

  const filtered = (studentDb || []).filter((s) => {
    const studentIdStr = String(s.student_id ?? "").toLowerCase();
    const first = String(s.student_firstname ?? "").toLowerCase();
    const last = String(s.student_lastname ?? "").toLowerCase();

    const matchesSearch = !search || studentIdStr.includes(search) || first.includes(search) || last.includes(search);
    const matchesStatus = status === "All" || String(s.status_id) === String(status);
    const matchesDept = department === "All" || String(s.department_id) === String(department);

    return matchesSearch && matchesStatus && matchesDept;
  });

  renderStudentsTable(filtered, statusMap, departmentMap, "student-table-body", "toggleOfficer", "openPayment", "removeStudent");
  lucide.createIcons();
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
window.removeStudent = removeStudent;
