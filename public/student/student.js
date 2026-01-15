// student.js
import { 
    fetchActiveTerm, fetchDepartments, fetchStatuses, fetchStudents, fetchCourses, 
    addStudent, toggleOfficerStatus, updateTerm 
} from './api.js';
import { renderStudentsTable, renderDepartments } from './render.js';
import { calculateTotalFees, toggleSidebar } from './utils.js';

// ----------------- GLOBAL VARIABLES -----------------
let studentDb = [];
let departmentMap = {};
let statusMap = {};
window.CURRENT_YEAR_SEMESTER_ID = null;
let activeStudent = null;

// ----------------- INIT -----------------
document.addEventListener('DOMContentLoaded', async () => {
    lucide.createIcons();

    await loadActiveTerm();
    await loadDepartments();
    await loadStatuses();
    await loadStudents();
       await loadFees();

    // Event listeners
    document.getElementById('select-department')?.addEventListener('change', e => loadCourses(e.target.value));
    const addStudentForm = document.getElementById('form-add-student');
    if (addStudentForm) addStudentForm.addEventListener('submit', handleManualAdd);
});


let feesDb = []; // store fees globally

async function loadFees() {
    try {
        const res = await fetch('http://localhost:3000/api/fees');
        const data = await res.json();
        if (data.success && Array.isArray(data.fees)) {
            feesDb = data.fees; // save globally
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
            data.departments.forEach(d => departmentMap[d.department_id] = d.department_abbr);
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
            select.innerHTML = '<option value="All">All Statuses</option>';
            data.statuses.forEach(s => {
                statusMap[s.status_id] = s.status_name;
                const opt = document.createElement('option');
                opt.value = s.status_name;
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
    if (!departmentId) return select.innerHTML = '<option value="">Select Course</option>';

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
        status_id: parseInt(form.status_id.value)
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
            if (!data.message.includes('already exists')) {
                alert('Error: ' + data.message);
            }
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

// ----------------- POPULATE YEAR DROPDOWN -----------------
async function populateYearDropdown(selectedYearId = null) {
    const select = document.getElementById('select-year');
    if (!select) return;

    select.innerHTML = '<option>Loading...</option>';

    try {
        const res = await fetch('http://localhost:3000/api/term/years');
        const data = await res.json();

        if (!data.success || !Array.isArray(data.years) || data.years.length === 0) {
            select.innerHTML = '<option disabled>No years found</option>';
            return;
        }

        select.innerHTML = '';
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

// ----------------- POPULATE SEMESTER DROPDOWN -----------------
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

// ----------------- PAYMENTS -----------------
async function openPayment(studentId) {
    activeStudent = studentDb.find(s => s.student_id === studentId);
    if (!activeStudent) return;

    document.getElementById('pay-student-name').innerText = `${activeStudent.student_firstname} ${activeStudent.student_lastname} (${activeStudent.student_id})`;
    document.getElementById('rec-student').innerText = `${activeStudent.student_firstname} ${activeStudent.student_lastname}`;

    const issuerName = document.getElementById('user-role')?.innerText || 'Cashier';
    document.getElementById('rec-issuer-name').innerText = issuerName;

    if (!feesDb || !Array.isArray(feesDb) || feesDb.length === 0) {
        return alert('No fees available.');
    }

    // Filter fees based on student officer role
    const studentRole = activeStudent.is_officer ? '1' : '0';
    const availableFees = feesDb.filter(fee => fee.role === studentRole);

    const feesContainer = document.getElementById('fees-container');
    if (!feesContainer) return console.error('Fees container not found in DOM!');
    feesContainer.innerHTML = ''; // clear old fees

    if (availableFees.length === 0) {
        feesContainer.innerHTML = `<p class="text-slate-400 italic text-xs">No applicable fees for this student</p>`;
    } else {
        availableFees.forEach(fee => {
            const priceFormatted = parseFloat(fee.fee_amount).toLocaleString(undefined, { minimumFractionDigits: 2 });
            const label = document.createElement('label');
            label.className = 'flex items-center justify-between p-3 bg-white rounded-lg border border-slate-100 cursor-pointer hover:border-blue-300';
            label.innerHTML = `
                <div class="flex items-center gap-3">
                    <input type="checkbox" class="fee-checkbox w-5 h-5 rounded text-blue-600" 
                           data-fee="${fee.fee_name}" data-price="${fee.fee_amount}" onchange="calculateTotalFees()">
                    <span class="font-bold text-sm">${fee.fee_name}</span>
                </div>
                <span class="font-mono text-xs font-bold">₱${priceFormatted}</span>
            `;
            feesContainer.appendChild(label);
        });
    }

    // Reset total
    calculateTotalFees();

    document.getElementById('payment-modal')?.classList.remove('hidden');
}




function closePayment() {
    document.getElementById('payment-modal')?.classList.add('hidden');
    activeStudent = null;
}

// ----------------- ISSUE & PRINT RECEIPT -----------------
function issueAndPrint() {
    const totalText = document.getElementById('total-display')?.innerText || '₱0';
    const total = parseFloat(totalText.replace(/[₱,]/g, ''));
    

    if (activeStudent) activeStudent.status = 'Paid';

    document.getElementById('rec-tid').innerText = 'TXN-' + Math.random().toString(36).substr(2, 9).toUpperCase();
    document.getElementById('rec-date').innerText = new Date().toLocaleString('en-US', {year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit'});

    const receiptData = document.getElementById('receipt-data-content')?.innerHTML || '';
    const printContainer = document.getElementById('print-container');
    printContainer.innerHTML = `
        <div class="print-page-layout">
            <div class="receipt-copy">
                <div class="text-center mb-6">
                    <div style="display:flex;justify-content:center;gap:8px;margin-bottom:8px;">
                        <img src="/assets/right-logo.jpg" alt="Left Logo" style="height:50px;width:50px;object-fit:contain;">
                        <img src="/assets/left-logo.png" alt="Right Logo" style="height:50px;width:50px;object-fit:contain;">
                    </div>
                    <h4 class="text-lg font-black tracking-tighter text-blue-800" style="margin:0;">ACKNOWLEDGEMENT RECEIPT</h4>
                    <p class="text-[10px] font-bold text-slate-400 uppercase" style="margin:0;">
                        Notre Dame of Marbel University<br>
                        Supreme Student Government<br>
                        City of Koronadal South Cotabato
                    </p>
                </div>
                ${receiptData}
            </div>
        </div>
    `;

    document.body.classList.add('printing');
    setTimeout(() => {
        window.print();
        setTimeout(() => {
            document.body.classList.remove('printing');
            printContainer.innerHTML = '';
            closePayment();
        }, 500);
    }, 100);
}

// ----------------- SEMESTER MODAL -----------------
window.updateSemester = async function updateSemester() {
    const year = document.getElementById('input-ay')?.value || document.getElementById('select-year')?.value;
    const semester = document.getElementById('input-sem-manual')?.value || document.getElementById('select-sem')?.value;

    try {
        const data = await updateTerm({ year, semester });
        if (data.success) {
            alert('Term updated successfully!');
            document.getElementById('input-ay').value = '';
            document.getElementById('input-sem-manual').value = '';
            await loadActiveTerm();
            await loadStudents();
            toggleModal('modal-year');
            toggleModal('modal-semester');
        } else alert('Error: ' + data.message);
    } catch (err) {
        console.error('Failed to update term:', err);
        alert('Failed to update term: ' + err.message);
    }
};

// ----------------- FILTER STUDENTS -----------------
window.filterStudents = function filterStudents() {
    const search = document.getElementById('search-id')?.value.toLowerCase() || '';
    const status = document.getElementById('filter-status')?.value || 'All';
    const department = document.getElementById('filter-college')?.value || 'All';

    const filtered = studentDb.filter(s => {
        const studentIdStr = String(s.student_id).toLowerCase();
        const matchesSearch = studentIdStr.includes(search) ||
                              s.student_firstname.toLowerCase().includes(search) ||
                              s.student_lastname.toLowerCase().includes(search);
        const matchesStatus = status === 'All' || s.status_id === status;
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
