// api.js
export async function fetchActiveTerm() {
    try {
        const res = await fetch('http://localhost:3000/api/term/active');
        return await res.json();
    } catch (err) {
        console.error('Failed to fetch active term', err);
        return { success: false, message: err.message };
    }
}

export async function fetchDepartments() {
    try {
        const res = await fetch('http://localhost:3000/api/departments');
        return await res.json();
    } catch (err) {
        console.error('Failed to fetch departments', err);
        return { success: false, message: err.message };
    }
}

export async function fetchStatuses() {
    try {
        const res = await fetch('http://localhost:3000/api/status');
        return await res.json();
    } catch (err) {
        console.error('Failed to fetch statuses', err);
        return { success: false, message: err.message };
    }
}

export async function fetchStudents() {
    try {
        const res = await fetch('http://localhost:3000/api/students/active-semester');
        return await res.json();
    } catch (err) {
        console.error('Failed to fetch students', err);
        return { success: false, message: err.message };
    }
}

export async function fetchCourses(departmentId) {
    try {
        const res = await fetch(`/api/courses?department_id=${departmentId}`);
        return await res.json();
    } catch (err) {
        console.error('Failed to fetch courses', err);
        return { success: false, courses: [] };
    }
}

export async function addStudent(payload) {
    try {
        const res = await fetch('/api/students/add', {   // relative path
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        // Only treat as error if HTTP status not 200
        if (!res.ok) {
            return { success: false, message: data.message || 'Failed to add student' };
        }

        return data;

    } catch (err) {
        console.error('Failed to add student', err);
        return { success: false, message: err.message };
    }
}



export async function toggleOfficerStatus(studentId, isOfficer) {
    try {
        const res = await fetch('http://localhost:3000/api/students/toggle-officer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ student_id: studentId, is_officer: isOfficer })
        });
        return await res.json();
    } catch (err) {
        console.error('Failed to toggle officer status', err);
        return { success: false, message: err.message };
    }
}

export async function updateTerm(payload) {
    try {
        const res = await fetch('http://localhost:3000/api/term/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return await res.json();
    } catch (err) {
        console.error('Failed to update term', err);
        return { success: false, message: err.message };
    }
}

