const express = require("express");
const router = express.Router();
const db = require("../db");

/**
 * STUDENT ROUTES (UPDATED + CLEAN + IMPORT SUPPORT + FIX 404)
 *
 * ✅ Existing (from your version):
 * - GET  /active-semester          -> returns active semester students excluding removed=1
 * - GET  /removed                  -> returns ONLY removed students (is_removed=1) for active semester
 * - POST /add                      -> insert student (is_removed=2)
 * - POST /toggle-officer
 * - POST /remove                   -> soft delete (is_removed=1)
 * - POST /restore                  -> restore (is_removed=2)
 * - POST /import                   -> bulk import students for active semester
 *
 * ✅ NEW (to fix your error):
 * - GET  /                         -> supports /api/students?year_semester_id=2 (prevents 404)
 * - GET  /active                   -> returns active semester_id (handy for frontend)
 *
 * NOTE:
 * If you mount this router like:
 *   app.use("/api/students", router);
 * then the full endpoints become:
 *   GET  /api/students
 *   GET  /api/students/active
 *   GET  /api/students/active-semester
 *   GET  /api/students/removed
 *   POST /api/students/add
 *   POST /api/students/import
 *   POST /api/students/remove
 *   POST /api/students/restore
 */

// -----------------------------------------------------
// Helper: get active "year_semester_id" (your table name is semester)
// -----------------------------------------------------
function getActiveSemesterId(cb) {
  const sqlActive = "SELECT semester_id FROM semester WHERE is_active = 1 LIMIT 1";
  db.query(sqlActive, (err, semResults) => {
    if (err) return cb(err, null);
    if (!semResults || semResults.length === 0) return cb(null, null);
    return cb(null, semResults[0].semester_id);
  });
}

// -----------------------------------------------------
// Helper: safe int
// -----------------------------------------------------
function toInt(v) {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

// -----------------------------------------------------
// Helper: normalize boolean to 0/1 (accepts boolean/number/string)
// -----------------------------------------------------
function toTinyIntBool(v) {
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return v ? 1 : 0;
  const s = String(v ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(s)) return 1;
  if (["false", "0", "no", "n", "off", ""].includes(s)) return 0;
  return 0;
}

/* =========================================================
   ✅ NEW: GET STUDENTS BY QUERY (FIXES 404)
   Supports: /api/students?year_semester_id=2
   - excludes removed=1
========================================================= */
router.get("/", (req, res) => {
  const yearSemesterId = toInt(req.query.year_semester_id);

  if (!yearSemesterId) {
    return res.status(400).json({
      success: false,
      message: "year_semester_id query param is required",
      students: []
    });
  }

  const sql = `
    SELECT *
    FROM student
    WHERE year_semester_id = ?
      AND IFNULL(is_removed, 2) <> 1
    ORDER BY student_id ASC
  `;

  db.query(sql, [yearSemesterId], (err, students) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    return res.json({ success: true, students });
  });
});

/* =========================================================
   ✅ NEW: GET ACTIVE SEMESTER ID
   Returns: { success, year_semester_id }
========================================================= */
router.get("/active", (req, res) => {
  getActiveSemesterId((err, activeSemesterId) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (!activeSemesterId) return res.json({ success: false, message: "No active semester found" });
    return res.json({ success: true, year_semester_id: activeSemesterId });
  });
});

/* =========================================================
   GET ACTIVE SEMESTER STUDENTS (EXCLUDING REMOVED = 1)
========================================================= */
router.get("/active-semester", (req, res) => {
  getActiveSemesterId((err, activeSemesterId) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (!activeSemesterId) {
      return res.json({ success: false, message: "No active semester found", students: [] });
    }

    // ✅ hide deleted students: is_removed = 1
    // ✅ treat NULL as 2 (active/restored)
    const sqlStudents = `
      SELECT *
      FROM student
      WHERE year_semester_id = ?
        AND IFNULL(is_removed, 2) <> 1
      ORDER BY student_id ASC
    `;

    db.query(sqlStudents, [activeSemesterId], (err, students) => {
      if (err) return res.status(500).json({ success: false, message: err.message });
      return res.json({ success: true, students });
    });
  });
});

/* =========================================================
   GET REMOVED STUDENTS ONLY (REMOVED = 1)
========================================================= */
router.get("/removed", (req, res) => {
  getActiveSemesterId((err, activeSemesterId) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (!activeSemesterId) {
      return res.json({ success: false, message: "No active semester found", students: [] });
    }

    const sqlRemoved = `
      SELECT *
      FROM student
      WHERE year_semester_id = ?
        AND IFNULL(is_removed, 2) = 1
      ORDER BY student_id ASC
    `;

    db.query(sqlRemoved, [activeSemesterId], (err, students) => {
      if (err) return res.status(500).json({ success: false, message: err.message });
      return res.json({ success: true, students });
    });
  });
});

/* =========================================================
   ADD STUDENT (DEFAULT is_removed = 2)
========================================================= */
router.post("/add", (req, res) => {
  const { student_id, student_firstname, student_lastname, department_id, course_id, status_id } = req.body;

  // ✅ Keep this strict for manual add
  if (!student_id || !student_firstname || !student_lastname || !department_id || !course_id || !status_id) {
    return res.status(400).json({ success: false, message: "Missing required student data" });
  }

  getActiveSemesterId((err, activeSemesterId) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (!activeSemesterId) {
      return res.status(400).json({ success: false, message: "No active semester found" });
    }

    // ✅ is_removed: 1=deleted, 2=restored/active
    const sqlInsert = `
      INSERT INTO student
        (student_id, year_semester_id, student_firstname, student_lastname, department_id, course_id, status_id, is_removed)
      VALUES (?, ?, ?, ?, ?, ?, ?, 2)
    `;

    db.query(
      sqlInsert,
      [student_id, activeSemesterId, student_firstname, student_lastname, department_id, course_id, status_id],
      (err) => {
        if (err) {
          if (err.code === "ER_DUP_ENTRY") {
            return res.status(400).json({ success: false, message: `Student ID ${student_id} already exists` });
          }
          return res.status(500).json({ success: false, message: err.message });
        }

        return res.json({ success: true, message: "Student added successfully" });
      }
    );
  });
});

/* =========================================================
   IMPORT STUDENTS (BULK)
   - Accepts: { students: [...] }
   - Inserts into active semester_id (year_semester_id)
   - Skips duplicates (counts them)
   - Restores if exists but is_removed=1 for same active term
========================================================= */
router.post("/import", (req, res) => {
  const students = Array.isArray(req.body?.students) ? req.body.students : null;
  if (!students || students.length === 0) {
    return res.status(400).json({ success: false, message: "No students provided", uploaded: 0, skipped: 0 });
  }

  getActiveSemesterId((err, activeSemesterId) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (!activeSemesterId) {
      return res.status(400).json({ success: false, message: "No active semester found", uploaded: 0, skipped: 0 });
    }

    const rows = [];
    const invalid = [];

    for (const s of students) {
      const sid = String(s.student_id ?? "").trim();
      const fn = String(s.student_firstname ?? "").trim();
      const ln = String(s.student_lastname ?? "").trim();
      const dept = toInt(s.department_id);

      // allow optional fields in import
      const course = toInt(s.course_id); // keep NULL if blank
      const status = toInt(s.status_id) ?? 1;
      const isOfficer = toTinyIntBool(s.is_officer);

      if (!sid || !fn || !ln || dept === null) {
        invalid.push(sid || "(missing id)");
        continue;
      }

      rows.push({
        student_id: sid,
        year_semester_id: activeSemesterId,
        student_firstname: fn,
        student_lastname: ln,
        department_id: dept,
        course_id: course, // may be null (depends on DB schema)
        status_id: status,
        is_officer: isOfficer
      });
    }

    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid student rows to import",
        uploaded: 0,
        skipped: 0,
        invalid_rows: invalid.length
      });
    }

    const insertSql = `
      INSERT IGNORE INTO student
        (student_id, year_semester_id, student_firstname, student_lastname, department_id, course_id, status_id, is_removed, is_officer)
      VALUES ?
    `;

    const values = rows.map((r) => [
      r.student_id,
      r.year_semester_id,
      r.student_firstname,
      r.student_lastname,
      r.department_id,
      r.course_id,
      r.status_id,
      2, // active/restored
      r.is_officer
    ]);

    db.query(insertSql, [values], (err, result) => {
      if (err) return res.status(500).json({ success: false, message: err.message });

      const inserted = result?.affectedRows ?? 0;
      const attempted = values.length;
      const skipped = Math.max(0, attempted - inserted);

      const ids = rows.map((r) => r.student_id);

      const restoreSql = `
        UPDATE student
        SET is_removed = 2
        WHERE year_semester_id = ?
          AND student_id IN (?)
          AND IFNULL(is_removed, 2) = 1
      `;

      db.query(restoreSql, [activeSemesterId, ids], (err2, restoreResult) => {
        if (err2) {
          return res.json({
            success: true,
            message: "Import completed, but restore step failed.",
            uploaded: inserted,
            skipped,
            restored: 0,
            invalid_rows: invalid.length,
            restore_error: err2.message
          });
        }

        const restored = restoreResult?.affectedRows ?? 0;

        return res.json({
          success: true,
          message: "Students imported successfully",
          uploaded: inserted,
          skipped,
          restored,
          invalid_rows: invalid.length
        });
      });
    });
  });
});

/* =========================================================
   TOGGLE OFFICER STATUS
========================================================= */
router.post("/toggle-officer", (req, res) => {
  const { student_id, is_officer } = req.body;

  if (!student_id || typeof is_officer !== "boolean") {
    return res.status(400).json({ success: false, message: "Invalid request body" });
  }

  const sql = "UPDATE student SET is_officer = ? WHERE student_id = ?";
  db.query(sql, [is_officer ? 1 : 0, student_id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    return res.json({ success: true, message: "Officer status updated successfully" });
  });
});

/* =========================================================
   SOFT DELETE (is_removed = 1)
========================================================= */
router.post("/remove", (req, res) => {
  const { student_id } = req.body;
  if (!student_id) return res.status(400).json({ success: false, message: "student_id is required" });

  const sql = "UPDATE student SET is_removed = 1 WHERE student_id = ?";
  db.query(sql, [student_id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    return res.json({ success: true, message: "Student removed (soft deleted)." });
  });
});

/* =========================================================
   RESTORE (is_removed = 2)
========================================================= */
router.post("/restore", (req, res) => {
  const { student_id } = req.body;
  if (!student_id) return res.status(400).json({ success: false, message: "student_id is required" });

  const sql = "UPDATE student SET is_removed = 2 WHERE student_id = ?";
  db.query(sql, [student_id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    return res.json({ success: true, message: "Student restored." });
  });
});

module.exports = router;
