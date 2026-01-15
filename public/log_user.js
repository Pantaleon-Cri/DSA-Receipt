//the import excel is here and the text
const user = JSON.parse(localStorage.getItem('loggedUser'));
document.getElementById('user-role').textContent = `${user.user_firstName} ${user.user_lastName}`;
window.addEventListener('DOMContentLoaded', loadActiveTerm);
function loadActiveTerm() {
  fetch('http://localhost:3000/api/term/active')
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        document.getElementById('active-term').textContent = `${data.semester} ${data.year}`;
      } else {
        document.getElementById('active-term').textContent = 'No active term';
      }
    })
    .catch(err => {
      console.error('Failed to load active term:', err);
      document.getElementById('active-term').textContent = 'Error loading term';
    });
}

function simulateExcelUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!window.CURRENT_YEAR_SEMESTER_ID) {
        return alert("No active semester found. Please set an active semester first.");
    }

    const reader = new FileReader();

    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        // Get the first sheet
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        // Convert sheet to JSON
        let students = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

        if (students.length === 0) return alert('Excel file is empty');

        // Validate required columns
        const requiredCols = ['student_id', 'student_firstname', 'student_lastname', 'department_id'];
        const missingCols = requiredCols.filter(c => !Object.keys(students[0]).includes(c));
        if (missingCols.length > 0) {
            return alert('Missing required columns: ' + missingCols.join(', '));
        }

        // Map students and assign current active semester
        students = students.map((s, index) => {
            const sid = parseInt(s.student_id);
            const dept = parseInt(s.department_id);
            if (isNaN(sid) || isNaN(dept)) {
                console.warn(`Skipping row ${index + 2}: Invalid student_id or department_id`);
                return null; // skip invalid row
            }

            return {
                student_id: sid,
                student_firstname: s.student_firstname || "",
                student_lastname: s.student_lastname || "",
                department_id: dept,
                course_id: s.course_id ? parseInt(s.course_id) : null,
                year_semester_id: window.CURRENT_YEAR_SEMESTER_ID, // ✅ current active semester
                status_id: s.status_id ? parseInt(s.status_id) : 1, // default to 1 (Unpaid)
                is_officer: s.is_officer ? Boolean(s.is_officer) : false
            };
        }).filter(Boolean); // remove nulls

        if (students.length === 0) return alert('No valid student rows to import.');

        // Send to backend
        fetch('/api/students/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ students })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                alert(data.message || 'Students imported successfully!');
                if (typeof loadStudents === 'function') loadStudents();
            } else {
                alert('Error: ' + (data.message || 'Unknown error'));
            }
        })
        .catch(err => {
            console.error('Error during student import:', err);
            alert('An unexpected error occurred during Excel upload.');
        });
    };

    reader.readAsArrayBuffer(file);

    // Reset file input so user can upload the same file again if needed
    event.target.value = "";
}


