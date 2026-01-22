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

  // ---------- UI HELPERS ----------
  const uiAlert = (message, type = "info", title = "Notice", subtitle = "") => {
    console.log(`[ALERT:${type}] ${title} - ${subtitle}`, message);

    if (typeof window.openAlert === "function") {
      window.openAlert({
        type,
        title,
        subtitle,
        message: String(message ?? "")
      });
      try { window.lucide?.createIcons?.(); } catch (_) {}
    } else {
      alert(String(message ?? ""));
    }
  };

  /**
   * ✅ UPDATED: Promise-based confirm
   * Uses modal.js openConfirm() which returns Promise<boolean>.
   */
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
        const result = await window.openConfirm({
          title,
          subtitle,
          message,
          okText,
          okClass,
          cancelText
        });
        return Boolean(result);
      } catch (e) {
        console.warn("[CONFIRM] openConfirm failed, falling back to browser confirm:", e);
        return confirm(message);
      }
    }

    return confirm(message);
  };

  const showImportResult = (uploaded, skippedDuplicates, skippedInvalid = 0) => {
    console.log("[IMPORT] Result summary:", { uploaded, skippedDuplicates, skippedInvalid });

    if (typeof window.showImportResult === "function") {
      window.showImportResult(uploaded, skippedDuplicates, skippedInvalid);
      return;
    }

    const modal = document.getElementById("modal-import-result");
    const upEl = document.getElementById("import-uploaded");
    const skEl = document.getElementById("import-skipped");

    if (modal && upEl && skEl) {
      upEl.textContent = String(uploaded ?? 0);
      skEl.textContent = String(skippedDuplicates ?? 0);

      modal.classList.remove("hidden");
      try { window.lucide?.createIcons?.(); } catch (_) {}
      return;
    }

    uiAlert(
      `Import Summary:\nUploaded: ${uploaded}\nSkipped (Duplicates): ${skippedDuplicates}\nSkipped (Invalid Rows): ${skippedInvalid}`,
      "success",
      "Import Summary"
    );
  };

  // ---------- REQUIRE ACTIVE TERM ----------
  if (!window.CURRENT_YEAR_SEMESTER_ID) {
    console.warn("[IMPORT] CURRENT_YEAR_SEMESTER_ID is missing:", window.CURRENT_YEAR_SEMESTER_ID);

    uiAlert(
      "No active semester found. Please set an active semester first.",
      "warning",
      "No Active Term"
    );
    event.target.value = "";
    return;
  }

  // ---------- FILE READER ----------
  const reader = new FileReader();

  reader.onerror = function (e) {
    console.error("[IMPORT] FileReader error:", e);
    uiAlert("Failed to read the file.", "error", "Import Failed");
  };

  reader.onload = async function (e) {
    console.log("[IMPORT] FileReader onload fired");

    try {
      if (typeof XLSX === "undefined") {
        console.error("[IMPORT] XLSX is undefined. SheetJS not loaded.");
        uiAlert("SheetJS (XLSX) is not loaded. Please include the XLSX script.", "error", "Import Failed");
        return;
      }

      const bytes = new Uint8Array(e.target.result);
      console.log("[IMPORT] Read bytes length:", bytes.length);

      const workbook = XLSX.read(bytes, { type: "array" });
      console.log("[IMPORT] Workbook sheets:", workbook.SheetNames);

      const firstSheetName = workbook.SheetNames?.[0];
      if (!firstSheetName) {
        uiAlert("Excel file has no sheets.", "error", "Import Failed");
        return;
      }

      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

      console.log("[IMPORT] Parsed rows count:", rows?.length || 0);
      console.log("[IMPORT] First row keys:", Object.keys(rows?.[0] || {}));

      if (!rows || rows.length === 0) {
        uiAlert("Excel file is empty.", "warning", "Import");
        return;
      }

      const requiredCols = ["student_id", "student_firstname", "student_lastname", "department_id"];
      const headerKeys = Object.keys(rows[0] || {});
      const missingCols = requiredCols.filter((c) => !headerKeys.includes(c));

      if (missingCols.length > 0) {
        uiAlert("Missing required columns: " + missingCols.join(", "), "error", "Import Failed");
        return;
      }

      const mapped = [];
      let invalidSkipped = 0;

      rows.forEach((r, idx) => {
        const sid = String(r.student_id ?? "").trim();
        const dept = parseInt(r.department_id, 10);

        if (!sid || Number.isNaN(dept)) {
          console.warn(`[IMPORT] Skipping row ${idx + 2}: Invalid student_id or department_id`, r);
          invalidSkipped++;
          return;
        }

        const courseIdRaw = r.course_id ?? null;
        const statusIdRaw = r.status_id ?? null;

        mapped.push({
          student_id: sid,
          student_firstname: String(r.student_firstname ?? "").trim(),
          student_lastname: String(r.student_lastname ?? "").trim(),
          department_id: dept,
          course_id: courseIdRaw !== null && String(courseIdRaw).trim() !== "" ? parseInt(courseIdRaw, 10) : null,
          year_semester_id: Number(window.CURRENT_YEAR_SEMESTER_ID),
          status_id: statusIdRaw !== null && String(statusIdRaw).trim() !== "" ? parseInt(statusIdRaw, 10) : 1,
          is_officer:
            String(r.is_officer ?? "").toLowerCase() === "true" ||
            r.is_officer === 1 ||
            r.is_officer === true
        });
      });

      console.log("[IMPORT] Mapped valid rows:", mapped.length, "Invalid skipped:", invalidSkipped);

      if (mapped.length === 0) {
        uiAlert("No valid student rows to import.", "warning", "Import");
        return;
      }

      const ok = await uiConfirm({
        title: "Confirm Upload",
        subtitle: "Please review before uploading.",
        message: `Are you sure you want to upload this?\n\nRows to upload: ${mapped.length}\nInvalid skipped: ${invalidSkipped}`,
        okText: "Yes, Upload",
        okClass: "bg-green-600 hover:bg-green-700",
        cancelText: "Cancel"
      });

      if (!ok) {
        console.log("[IMPORT] User cancelled upload");
        return;
      }

      console.log("[IMPORT] Sending to API...");

      const res = await fetch(`${API_BASE}/api/students/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ students: mapped })
      });

      console.log("[IMPORT] Server response status:", res.status);

      const text = await res.text();
      console.log("[IMPORT] Raw response text:", text);

      let out;
      try {
        out = text ? JSON.parse(text) : null;
      } catch (parseErr) {
        console.error("[IMPORT] Response JSON parse failed:", parseErr);
        out = null;
      }

      if (!out || typeof out !== "object") {
        uiAlert(
          `Import failed: server returned non-JSON response (HTTP ${res.status}). Check Network tab.`,
          "error",
          "Import Failed"
        );
        return;
      }

      if (!res.ok || !out.success) {
        console.error("[IMPORT] Import failed payload:", out);
        uiAlert(out.message || `Import failed (HTTP ${res.status}).`, "error", "Import Failed");
        return;
      }

      const uploaded = Number(out.uploaded ?? 0);
      const skippedDup = Number(out.skipped ?? out.skipped_duplicates ?? 0);

      showImportResult(uploaded, skippedDup, invalidSkipped);

      if (typeof window.loadStudents === "function") {
        console.log("[IMPORT] Reloading students list...");
        await window.loadStudents();
      }
    } catch (err) {
      console.error("[IMPORT] Error during student import:", err);
      uiAlert(err?.message || "An unexpected error occurred during Excel upload.", "error", "Import Error");
    }
  };

  console.log("[IMPORT] Reading file as ArrayBuffer...");
  reader.readAsArrayBuffer(file);

  // reset input so selecting the same file again triggers change
  event.target.value = "";
}

window.simulateExcelUpload = simulateExcelUpload;
