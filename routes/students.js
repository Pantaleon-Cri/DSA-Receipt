const express = require("express");
const router = express.Router();
const db = require("../db");


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
   HELPERS
========================================================= */

function getActiveSemesterId(cb) {
  const sql = "SELECT semester_id FROM semester WHERE is_active = 1 LIMIT 1";
  db.query(sql, (err, rows) => {
    if (err) return cb(err, null);
    if (!rows.length) return cb(null, null);
    return cb(null, rows[0].semester_id);
  });
}

function toInt(v) {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

function toTinyIntBool(v) {
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return v ? 1 : 0;
  const s = String(v ?? "").toLowerCase();
  return ["1", "true", "yes", "on"].includes(s) ? 1 : 0;
}

/* =========================================================
   GET STUDENTS BY SEMESTER
========================================================= */
router.get("/", (req, res) => {
  const yearSemesterId = toInt(req.query.year_semester_id);
  if (!yearSemesterId) {
    return res.status(400).json({
      success: false,
      message: "year_semester_id is required",
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

  db.query(sql, [yearSemesterId], (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, students: rows });
  });
});

/* =========================================================
   GET REMOVED STUDENTS
   GET /api/students/removed?year_semester_id=123
   - If year_semester_id is not provided, uses active semester.
========================================================= */
router.get("/removed", (req, res) => {
  const yearSemesterId = toInt(req.query.year_semester_id);

  const run = (semId) => {
    if (!semId) {
      return res.status(400).json({
        success: false,
        message: "year_semester_id is required (or set an active semester)",
        students: []
      });
    }

    const sql = `
      SELECT *
      FROM student
      WHERE year_semester_id = ?
        AND IFNULL(is_removed, 2) = 1
      ORDER BY student_id ASC
    `;

    db.query(sql, [semId], (err, rows) => {
      if (err) return res.status(500).json({ success: false, message: err.message });
      res.json({ success: true, students: rows });
    });
  };

  // If caller passed year_semester_id, use it
  if (yearSemesterId) return run(yearSemesterId);

  // Otherwise fallback to active semester
  getActiveSemesterId((err, semId) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    return run(semId);
  });
});

/* =========================================================
   GET ACTIVE SEMESTER
========================================================= */
router.get("/active", (req, res) => {
  getActiveSemesterId((err, semId) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (!semId) return res.json({ success: false, message: "No active semester" });
    res.json({ success: true, year_semester_id: semId });
  });
});

/* =========================================================
   GET ACTIVE SEMESTER STUDENTS
========================================================= */
router.get("/active-semester", (req, res) => {
  getActiveSemesterId((err, semId) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (!semId) return res.json({ success: false, students: [] });

    const sql = `
      SELECT *
      FROM student
      WHERE year_semester_id = ?
        AND IFNULL(is_removed, 2) <> 1
    `;

    db.query(sql, [semId], (err, rows) => {
      if (err) return res.status(500).json({ success: false, message: err.message });
      res.json({ success: true, students: rows });
    });
  });
});

/* =========================================================
   ADD STUDENT
========================================================= */
router.post("/add", (req, res) => {
  const {
    student_id,
    student_firstname,
    student_lastname,
    department_id,
    course_id,
    status_id
  } = req.body;

  if (!student_id || !student_firstname || !student_lastname || !department_id) {
    return res.status(400).json({ success: false, message: "Missing required fields" });
  }

  getActiveSemesterId((err, semId) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (!semId) return res.status(400).json({ success: false, message: "No active semester" });

    const sql = `
      INSERT INTO student
      (student_id, year_semester_id, student_firstname, student_lastname, department_id, course_id, status_id, is_removed)
      VALUES (?, ?, ?, ?, ?, ?, ?, 2)
    `;

    db.query(
      sql,
      [student_id, semId, student_firstname, student_lastname, department_id, course_id, status_id],
      (err) => {
        if (err) {
          if (err.code === "ER_DUP_ENTRY") {
            return res.status(400).json({ success: false, message: "Student already exists" });
          }
          return res.status(500).json({ success: false, message: err.message });
        }
        res.json({ success: true });
      }
    );
  });
});

/* =========================================================
   TOGGLE OFFICER (FIXED ✅)
========================================================= */
router.post("/toggle-officer", (req, res) => {
  const { student_id, year_semester_id, is_officer } = req.body;

  if (!student_id || !year_semester_id) {
    return res.status(400).json({
      success: false,
      message: "student_id and year_semester_id are required"
    });
  }

  const sql = `
    UPDATE student
    SET is_officer = ?
    WHERE student_id = ?
      AND year_semester_id = ?
  `;

  db.query(sql, [toTinyIntBool(is_officer), student_id, year_semester_id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: "Student not found for this semester" });
    }

    res.json({ success: true, message: "Officer status updated" });
  });
});

/* =========================================================
   SOFT DELETE (PER SEMESTER)
========================================================= */
router.post("/remove", (req, res) => {
  const { student_id, year_semester_id } = req.body;

  if (!student_id || !year_semester_id) {
    return res.status(400).json({
      success: false,
      message: "student_id and year_semester_id are required"
    });
  }

  const sql = `
    UPDATE student
    SET is_removed = 1
    WHERE student_id = ?
      AND year_semester_id = ?
  `;

  db.query(sql, [student_id, year_semester_id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }
    res.json({ success: true, message: "Student removed for this semester" });
  });
});

/* =========================================================
   RESTORE STUDENT
========================================================= */
router.post("/restore", (req, res) => {
  const { student_id, year_semester_id } = req.body;

  if (!student_id || !year_semester_id) {
    return res.status(400).json({
      success: false,
      message: "student_id and year_semester_id required"
    });
  }

  const sql = `
    UPDATE student
    SET is_removed = 2
    WHERE student_id = ?
      AND year_semester_id = ?
  `;

  db.query(sql, [student_id, year_semester_id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }
    res.json({ success: true, message: "Student restored" });
  });
});

module.exports = router;
