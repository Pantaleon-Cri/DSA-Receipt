// routes/term (log_user.js)

// ================================
// CONFIG
// ================================
const API_BASE = "http://localhost:3000"; // <-- make sure this matches your backend port

// ================================
// --------- SAFE USER NAME SETUP ----------
// ================================
window.addEventListener("DOMContentLoaded", () => {
  console.log("[INIT] DOMContentLoaded fired");

  try {
    const userRaw = localStorage.getItem("loggedUser");
    const user = userRaw ? JSON.parse(userRaw) : null;

    const userRoleEl = document.getElementById("user-role");
    if (userRoleEl && user) {
      const first = user.user_firstName ?? "";
      const last = user.user_lastName ?? "";
      const name = `${first} ${last}`.trim();
      userRoleEl.textContent = name || "USER";
    }
  } catch (e) {
    console.error("[INIT] Failed to load user from localStorage:", e);
  }

  // Load active term (and set CURRENT_YEAR_SEMESTER_ID if present)
  loadActiveTerm();

  // Auto-bind excel input change so simulateExcelUpload runs even if onchange is missing
  bindExcelImportInput();
});

// ================================
// --------- ACTIVE TERM ----------
// ================================
function loadActiveTerm() {
  console.log("[TERM] Loading active term...");

  fetch(`${API_BASE}/api/term/active`)
    .then((res) => {
      console.log("[TERM] Response status:", res.status);
      return res.json();
    })
    .then((data) => {
      console.log("[TERM] Active term payload:", data);

      // IMPORTANT: some pages don't have #active-term
      const activeTermEl = document.getElementById("active-term");
      if (activeTermEl) {
        if (data.success) {
          const semLabel = data.semester || data.semester_name || "Semester";
          const yearLabel = data.year || data.year_name || "Year";
          activeTermEl.textContent = `${semLabel} ${yearLabel}`;
        } else {
          activeTermEl.textContent = "No active term";
        }
      }

      // ✅ Set CURRENT_YEAR_SEMESTER_ID
      // Prefer year_semester_id if your backend uses that,
      // else fallback to semester_id (some APIs return only this).
      const possibleId =
        data.year_semester_id ??
        data.yearSemesterId ??
        data.year_semester?.id ??
        data.active_year_semester_id ??
        data.semester_id ?? // <-- IMPORTANT fallback
        data.id ??
        null;

      if (data.success && possibleId != null) {
        window.CURRENT_YEAR_SEMESTER_ID = Number(possibleId);
        console.log("[TERM] CURRENT_YEAR_SEMESTER_ID set to:", window.CURRENT_YEAR_SEMESTER_ID);
      } else {
        console.warn("[TERM] No usable term id found. CURRENT_YEAR_SEMESTER_ID remains:", window.CURRENT_YEAR_SEMESTER_ID);
      }
    })
    .catch((err) => {
      console.error("[TERM] Failed to load active term:", err);
      const activeTermEl = document.getElementById("active-term");
      if (activeTermEl) activeTermEl.textContent = "Error loading term";
    });
}

// ================================
// BIND INPUT (so the function runs)
// ================================
function bindExcelImportInput() {
  // ✅ include your real input id: excel-upload
  const candidates = ["excel-upload", "excel-file", "import-excel", "student-excel", "file-excel", "excelUpload"];
  let input = null;

  for (const id of candidates) {
    const el = document.getElementById(id);
    if (el && el.tagName === "INPUT" && el.type === "file") {
      input = el;
      break;
    }
  }

  if (!input) {
    console.warn("[BIND] No file input found to bind. If import doesn't run, set your input id to one of:", candidates);
    return;
  }

  // Avoid double binding
  if (input.dataset.bound === "1") return;
  input.dataset.bound = "1";

  input.addEventListener("change", (event) => {
    console.log("[BIND] File input change detected:", event.target?.files?.[0]?.name);
    // If your HTML already calls simulateExcelUpload(event), this still runs.
    // But we prevent duplicates by the bound flag above.
    simulateExcelUpload(event);
  });

  console.log("[BIND] Excel import input bound:", input.id);
}

// =====================================================
// EXCEL IMPORT
// =====================================================
async function simulateExcelUpload(event) {
  console.log("[IMPORT] simulateExcelUpload called");

  const file = event?.target?.files?.[0];
  if (!file) {
    console.warn("[IMPORT] No file selected");
    return;
  }

  console.log("[IMPORT] Selected file:", {
    name: file.name,
    size: file.size,
    type: file.type
  });

  /* ================================
     UI HELPERS
  ================================= */
  const uiAlert = (message, type = "info", title = "Notice", subtitle = "") => {
    console.log(`[ALERT:${type}] ${title} - ${subtitle}`, message);

    if (typeof window.openAlert === "function") {
      window.openAlert({ type, title, subtitle, message: String(message ?? "") });
      try { window.lucide?.createIcons?.(); } catch (_) {}
    } else {
      alert(String(message ?? ""));
    }
  };

  const uiConfirm = async ({
    title = "Confirm",
    subtitle = "Please confirm your action.",
    message = "Continue?",
    okText = "Yes",
    okClass = "bg-blue-600 hover:bg-blue-700",
    cancelText = "Cancel"
  } = {}) => {
    if (typeof window.openConfirm === "function") {
      try {
        return Boolean(await window.openConfirm({
          title, subtitle, message, okText, okClass, cancelText
        }));
      } catch {
        return confirm(message);
      }
    }
    return confirm(message);
  };

  const showImportResult = (uploaded, skipped, invalid) => {
    if (typeof window.showImportResult === "function") {
      window.showImportResult(uploaded, skipped, invalid);
      return;
    }

    alert(
      `Import Summary\n\nUploaded: ${uploaded}\nSkipped (duplicates): ${skipped}\nInvalid rows: ${invalid}`
    );
  };

  /* ================================
     REQUIRED ACTIVE TERM
  ================================= */
  if (!window.CURRENT_YEAR_SEMESTER_ID) {
    uiAlert("No active semester found.", "warning", "No Active Term");
    event.target.value = "";
    return;
  }

  /* ================================
     NAME SPLITTER
  ================================= */
  function splitFullName(fullName) {
    const parts = String(fullName ?? "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (parts.length === 0) return { firstName: "", lastName: "" };
    if (parts.length === 1) return { firstName: parts[0], lastName: "" };

    const particles = new Set([
      "de", "del", "dela", "da", "dos", "das",
      "van", "von", "bin", "binti", "ibn"
    ]);

    const last = [parts.pop()];
    while (parts.length && particles.has(parts[parts.length - 1].toLowerCase())) {
      last.unshift(parts.pop());
    }

    return {
      firstName: parts.join(" "),
      lastName: last.join(" ")
    };
  }

  /* ================================
     FILE READER
  ================================= */
  const reader = new FileReader();

  reader.onerror = () => {
    uiAlert("Failed to read file.", "error", "Import Failed");
  };

  reader.onload = async function (e) {
    try {
      if (typeof XLSX === "undefined") {
        uiAlert("SheetJS not loaded.", "error", "Import Failed");
        return;
      }

      const bytes = new Uint8Array(e.target.result);
      const workbook = XLSX.read(bytes, { type: "array" });

      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        uiAlert("Excel file has no sheets.", "error");
        return;
      }

      const rows = XLSX.utils.sheet_to_json(
        workbook.Sheets[sheetName],
        { defval: "" }
      );

      if (!rows.length) {
        uiAlert("Excel file is empty.", "warning");
        return;
      }

      /* REQUIRED COLUMNS */
      const requiredCols = ["student_id", "student_fullname", "department_id"];
      const headers = Object.keys(rows[0]);
      const missing = requiredCols.filter(c => !headers.includes(c));

      if (missing.length) {
        uiAlert("Missing columns: " + missing.join(", "), "error");
        return;
      }

      const mapped = [];
      let invalid = 0;

      rows.forEach((r, i) => {
        const studentId = String(r.student_id ?? "").trim();
        const deptId = parseInt(r.department_id, 10);
        const fullName = String(r.student_fullname ?? "").trim();

        if (!studentId || !deptId || !fullName) {
          invalid++;
          return;
        }

        const { firstName, lastName } = splitFullName(fullName);

        if (!firstName) {
          invalid++;
          return;
        }

        mapped.push({
          student_id: studentId,
          student_firstname: firstName,
          student_lastname: lastName,
          department_id: deptId,
          course_id: r.course_id ? parseInt(r.course_id, 10) : null,
          year_semester_id: Number(window.CURRENT_YEAR_SEMESTER_ID),
          status_id: r.status_id ? parseInt(r.status_id, 10) : 1,
          is_officer:
            String(r.is_officer).toLowerCase() === "true" ||
            r.is_officer === 1
        });
      });

      if (!mapped.length) {
        uiAlert("No valid rows found.", "warning");
        return;
      }

      const ok = await uiConfirm({
        title: "Confirm Upload",
        message: `Upload ${mapped.length} students?\nInvalid skipped: ${invalid}`,
        okText: "Upload"
      });

      if (!ok) return;

      const res = await fetch(`${API_BASE}/api/students/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ students: mapped })
      });

      const text = await res.text();
      const out = JSON.parse(text);

      if (!res.ok || !out.success) {
        uiAlert(out.message || "Import failed", "error");
        return;
      }

      showImportResult(out.uploaded || 0, out.skipped || 0, invalid);

      if (window.loadStudents) await window.loadStudents();
    } catch (err) {
      console.error(err);
      uiAlert("Unexpected import error.", "error");
    }
  };

  reader.readAsArrayBuffer(file);
  event.target.value = "";
}


window.simulateExcelUpload = simulateExcelUpload;
