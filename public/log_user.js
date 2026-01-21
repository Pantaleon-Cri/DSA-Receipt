// routes/term (log_user.js)

// --------- SAFE USER NAME SETUP ----------
window.addEventListener("DOMContentLoaded", () => {
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
    console.error("Failed to load user from localStorage:", e);
  }

  loadActiveTerm(); // keep your behavior
});

// --------- ACTIVE TERM ----------
function loadActiveTerm() {
  fetch("http://localhost:3000/api/term/active")
    .then((res) => res.json())
    .then((data) => {
      // IMPORTANT: some pages don't have #active-term
      const activeTermEl = document.getElementById("active-term");
      if (!activeTermEl) return; // ✅ prevent crash

      if (data.success) {
        // your API returns year/semester_id; you are displaying semester+year
        const semLabel = data.semester || data.semester_name || "Semester";
        const yearLabel = data.year || data.year_name || "Year";
        activeTermEl.textContent = `${semLabel} ${yearLabel}`;
      } else {
        activeTermEl.textContent = "No active term";
      }
    })
    .catch((err) => {
      console.error("Failed to load active term:", err);
      const activeTermEl = document.getElementById("active-term");
      if (activeTermEl) activeTermEl.textContent = "Error loading term";
    });
}

// =====================================================
// EXCEL IMPORT (your code, unchanged except kept safe)
// =====================================================
function simulateExcelUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  // ---------- UI HELPERS (Tailwind modal if available) ----------
  const uiAlert = (message, type = "info", title = "Notice", subtitle = "") => {
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
   * Promise-based confirm modal
   * resolves true if confirmed, false if cancelled/closed
   */
  const uiConfirm = ({
    title = "Confirm",
    subtitle = "Please confirm your action.",
    message = "Continue?",
    okText = "Yes",
    okClass = "bg-blue-600 hover:bg-blue-700",
    cancelText = "Cancel"
  } = {}) => {
    if (typeof window.openConfirm === "function") {
      return new Promise(resolve => {
        let settled = false;
        const done = (val) => {
          if (settled) return;
          settled = true;
          resolve(val);
        };

        window.openConfirm({
          title,
          subtitle,
          message,
          okText,
          okClass,
          cancelText,
          onConfirm: () => done(true)
        });

        const originalClose = window.closeConfirm;
        if (typeof originalClose === "function") {
          window.closeConfirm = function () {
            try { originalClose(); } finally {
              done(false);
              window.closeConfirm = originalClose;
            }
          };
        }

        try { window.lucide?.createIcons?.(); } catch (_) {}
      });
    }

    return Promise.resolve(confirm(message));
  };

  const showImportResult = (uploaded, skippedDuplicates, skippedInvalid = 0) => {
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
    uiAlert(
      "No active semester found. Please set an active semester first.",
      "warning",
      "No Active Term"
    );
    event.target.value = "";
    return;
  }

  const reader = new FileReader();

  reader.onload = async function (e) {
    try {
      if (typeof XLSX === "undefined") {
        uiAlert(
          "SheetJS (XLSX) is not loaded. Please include the XLSX script.",
          "error",
          "Import Failed"
        );
        return;
      }

      const bytes = new Uint8Array(e.target.result);
      const workbook = XLSX.read(bytes, { type: "array" });

      const firstSheetName = workbook.SheetNames?.[0];
      if (!firstSheetName) {
        uiAlert("Excel file has no sheets.", "error", "Import Failed");
        return;
      }

      const worksheet = workbook.Sheets[firstSheetName];
      let rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

      if (!rows || rows.length === 0) {
        uiAlert("Excel file is empty.", "warning", "Import");
        return;
      }

      const requiredCols = ["student_id", "student_firstname", "student_lastname", "department_id"];
      const headerKeys = Object.keys(rows[0] || {});
      const missingCols = requiredCols.filter(c => !headerKeys.includes(c));

      if (missingCols.length > 0) {
        uiAlert(
          "Missing required columns: " + missingCols.join(", "),
          "error",
          "Import Failed"
        );
        return;
      }

      const mapped = [];
      let invalidSkipped = 0;

      rows.forEach((r, idx) => {
        const sid = String(r.student_id ?? "").trim();
        const dept = parseInt(r.department_id, 10);

        if (!sid || Number.isNaN(dept)) {
          console.warn(`Skipping row ${idx + 2}: Invalid student_id or department_id`);
          invalidSkipped++;
          return;
        }

        mapped.push({
          student_id: sid,
          student_firstname: String(r.student_firstname ?? "").trim(),
          student_lastname: String(r.student_lastname ?? "").trim(),
          department_id: dept,
          course_id: r.course_id ? parseInt(r.course_id, 10) : null,
          year_semester_id: Number(window.CURRENT_YEAR_SEMESTER_ID),
          status_id: r.status_id ? parseInt(r.status_id, 10) : 1,
          is_officer: r.is_officer ? Boolean(r.is_officer) : false
        });
      });

      if (mapped.length === 0) {
        uiAlert("No valid student rows to import.", "warning", "Import");
        return;
      }

      const ok = await uiConfirm({
        title: "Confirm Upload",
        subtitle: "Please review before uploading.",
        message:
          `Are you sure you want to upload this?\n\n` +
          `Click "Yes, Upload" to continue.`,
        okText: "Yes, Upload",
        okClass: "bg-green-600 hover:bg-green-700"
      });

      if (!ok) return;

      const res = await fetch("/api/students/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ students: mapped })
      });

      const text = await res.text();
      let out;
      try { out = text ? JSON.parse(text) : null; } catch (_) { out = null; }

      if (!out || typeof out !== "object") {
        uiAlert(
          `Import failed: server returned non-JSON response (HTTP ${res.status}).`,
          "error",
          "Import Failed"
        );
        return;
      }

      if (!res.ok || !out.success) {
        uiAlert(out.message || `Import failed (HTTP ${res.status}).`, "error", "Import Failed");
        return;
      }

      const uploaded = Number(out.uploaded ?? 0);
      const skippedDup = Number(out.skipped ?? out.skipped_duplicates ?? 0);

      showImportResult(uploaded, skippedDup, invalidSkipped);

      if (typeof window.loadStudents === "function") {
        await window.loadStudents();
      }

    } catch (err) {
      console.error("Error during student import:", err);
      uiAlert(
        err?.message || "An unexpected error occurred during Excel upload.",
        "error",
        "Import Error"
      );
    }
  };

  reader.readAsArrayBuffer(file);
  event.target.value = "";
}

window.simulateExcelUpload = simulateExcelUpload;
