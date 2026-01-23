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
     NAME NORMALIZER + PARSER
     Accepts:
       - "Last, First Middle"  (preferred for your Excel)
       - "First Middle Last"   (fallback)
     Normalizes capitalization:
       "pANTALEON" -> "Pantaleon"
       "DEL ROSARIO" -> "Del Rosario"
       "o’connor" -> "O’Connor"
  ================================= */

  const LOWER_PARTICLES = new Set([
    "de", "del", "dela", "da", "dos", "das", "la", "las", "los", "y",
    "van", "von", "bin", "binti", "ibn"
  ]);

  function smartCapWord(word) {
    const w = String(word ?? "").trim();
    if (!w) return "";

    // Keep all-caps abbreviations like "III", "IV", "Jr" is handled later
    if (/^[A-Z]{2,}$/.test(w)) return w;

    // Handle apostrophes / curly apostrophes: O'Connor, Dela Cruz etc.
    const parts = w.split(/([’'])/); // keep the apostrophe separators
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === "'" || parts[i] === "’") continue;
      const p = parts[i].toLowerCase();
      parts[i] = p.charAt(0).toUpperCase() + p.slice(1);
    }
    return parts.join("");
  }

  function normalizeNamePhrase(name) {
    const cleaned = String(name ?? "")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleaned) return "";

    // Split by spaces, but keep hyphenated parts and capitalize each side
    const tokens = cleaned.split(" ").filter(Boolean);

    const out = tokens.map((tok) => {
      const lower = tok.toLowerCase();

      // common suffixes
      if (["jr", "jr.", "sr", "sr.", "ii", "iii", "iv", "v"].includes(lower)) {
        return lower.toUpperCase().replace(".", "") === "JR" ? "Jr." :
               lower.toUpperCase().replace(".", "") === "SR" ? "Sr." :
               lower.toUpperCase(); // II, III, IV...
      }

      // particles stay lowercase
      if (LOWER_PARTICLES.has(lower)) return lower;

      // hyphenated names: "anna-marie" -> "Anna-Marie"
      if (tok.includes("-")) {
        return tok
          .split("-")
          .filter(Boolean)
          .map(smartCapWord)
          .join("-");
      }

      return smartCapWord(tok);
    });

    // Special-case: if first token is a lowercase particle but it's at the start, capitalize it
    if (out.length && LOWER_PARTICLES.has(out[0])) {
      out[0] = smartCapWord(out[0]);
    }

    return out.join(" ").replace(/\s+/g, " ").trim();
  }

  function parseStudentFullName(fullNameRaw) {
    const raw = String(fullNameRaw ?? "").trim();
    if (!raw) return { firstName: "", lastName: "" };

    // Preferred format: "Last, First Middle"
    // Example: "Pantaleon, Crizle" or "Del Rosario, Mark Anthony"
    if (raw.includes(",")) {
      const parts = raw.split(",").map(s => s.trim()).filter(Boolean);

      // If the cell has extra commas, treat the first part as last name, the rest as first name
      const lastPart = parts.shift() || "";
      const firstPart = parts.join(" ").trim(); // join remaining parts in case there are multiple commas

      const lastName = normalizeNamePhrase(lastPart);
      const firstName = normalizeNamePhrase(firstPart);

      return { firstName, lastName };
    }

    // Fallback: "First Middle Last" (space-separated)
    const pieces = raw.split(/\s+/).filter(Boolean);
    if (pieces.length === 1) {
      return { firstName: normalizeNamePhrase(pieces[0]), lastName: "" };
    }

    // Last name = last token (plus possible particles before it)
    const lastTokens = [pieces.pop()];
    while (pieces.length && LOWER_PARTICLES.has(pieces[pieces.length - 1].toLowerCase())) {
      lastTokens.unshift(pieces.pop());
    }

    const firstName = normalizeNamePhrase(pieces.join(" "));
    const lastName = normalizeNamePhrase(lastTokens.join(" "));
    return { firstName, lastName };
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

      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });

      if (!rows.length) {
        uiAlert("Excel file is empty.", "warning");
        return;
      }

      /* REQUIRED COLUMNS */
      const requiredCols = ["student_id", "student_fullname", "department_id"];
      const headers = Object.keys(rows[0] || {});
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

        if (!studentId || Number.isNaN(deptId) || !fullName) {
          console.warn(`[IMPORT] Skipping row ${i + 2}: missing student_id/department_id/student_fullname`, r);
          invalid++;
          return;
        }

        const { firstName, lastName } = parseStudentFullName(fullName);

        // Your DB expects firstname + lastname (lastname can be empty but firstname should exist)
        if (!firstName) {
          console.warn(`[IMPORT] Skipping row ${i + 2}: could not parse first name from "${fullName}"`, r);
          invalid++;
          return;
        }

        const courseIdRaw = r.course_id ?? null;
        const statusIdRaw = r.status_id ?? null;

        mapped.push({
          student_id: studentId,
          student_firstname: firstName,
          student_lastname: lastName,
          department_id: deptId,
          course_id: courseIdRaw !== null && String(courseIdRaw).trim() !== ""
            ? parseInt(courseIdRaw, 10)
            : null,
          year_semester_id: Number(window.CURRENT_YEAR_SEMESTER_ID),
          status_id: statusIdRaw !== null && String(statusIdRaw).trim() !== ""
            ? parseInt(statusIdRaw, 10)
            : 1,
          is_officer:
            String(r.is_officer ?? "").toLowerCase() === "true" ||
            r.is_officer === 1 ||
            r.is_officer === true
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

      // Safer parsing (prevents "Unexpected token <" when server returns HTML)
      const contentType = res.headers.get("content-type") || "";
      const raw = await res.text();

      console.log("[IMPORT] HTTP", res.status, "Content-Type:", contentType);
      console.log("[IMPORT] Raw response:", raw);

      let out = null;
      if (contentType.includes("application/json")) {
        out = raw ? JSON.parse(raw) : null;
      } else {
        uiAlert(
          `Import failed: server returned non-JSON (HTTP ${res.status}).\nCheck endpoint: ${API_BASE}/api/students/import`,
          "error",
          "Import Failed"
        );
        return;
      }

      if (!res.ok || !out?.success) {
        uiAlert(out?.message || `Import failed (HTTP ${res.status}).`, "error");
        return;
      }

      showImportResult(out.uploaded || 0, out.skipped || 0, invalid);

      if (window.loadStudents) await window.loadStudents();
    } catch (err) {
      console.error(err);
      uiAlert(err?.message || "Unexpected import error.", "error");
    }
  };

  reader.readAsArrayBuffer(file);
  event.target.value = "";
}



window.simulateExcelUpload = simulateExcelUpload;
