const express = require("express");
const router = express.Router();
const db = require("../db");

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
