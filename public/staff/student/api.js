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
    const res = await fetch(`/api/courses?department_id=${encodeURIComponent(departmentId)}`);
    return await res.json();
  } catch (err) {
    console.error('Failed to fetch courses', err);
    return { success: false, courses: [], message: err.message };
  }
}

/**
 * ✅ IMPORTANT UPDATE:
 * - Handles BOTH success and error bodies safely.
 * - Some backends return HTTP 400 with JSON { success:false, message:"Student ID ... already exists" }
 * - If response is not JSON, it still returns a usable message.
 * - NEVER throws for HTTP errors; it returns {success:false,...} so your student.js can show the correct modal.
 */
export async function addStudent(payload) {
  try {
    const res = await fetch('/api/students/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    // Always read text first (works for 200 + 400)
    const text = await res.text();

    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {
      data = null;
    }

    // If backend didn't return JSON, still return something useful
    if (!data || typeof data !== 'object') {
      return {
        success: false,
        message: `Server returned ${res.status} but response was not JSON.`
      };
    }

    // If HTTP status is not OK, force success=false
    if (!res.ok) {
      return {
        success: false,
        message: data.message || `Failed to add student (HTTP ${res.status})`
      };
    }

    // Normal success path
    return data;

  } catch (err) {
    console.error('Failed to add student', err);
    return { success: false, message: err.message };
  }
}

export async function toggleOfficerStatus(studentId, isOfficer, yearSemesterId = window.CURRENT_YEAR_SEMESTER_ID) {
  try {
    const res = await fetch("http://localhost:3000/api/students/toggle-officer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: studentId,
        year_semester_id: Number(yearSemesterId), // ✅ scope to current semester
        is_officer: isOfficer
      })
    });

    const text = await res.text();

    // safer: catches non-JSON responses
    try {
      return JSON.parse(text);
    } catch {
      return {
        success: false,
        message: `Toggle officer route not returning JSON (HTTP ${res.status}). Response: ${text?.slice(0, 200) || ""}`
      };
    }
  } catch (err) {
    console.error("Failed to toggle officer status", err);
    return { success: false, message: err.message || String(err) };
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
