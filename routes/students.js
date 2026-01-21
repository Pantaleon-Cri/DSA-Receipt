const express = require('express');
const router = express.Router();
const db = require('../db');

/**
 * STUDENT ROUTES (UPDATED + CLEAN)
 *
 * ✅ Existing:
 * - GET  /active-semester          -> returns active semester students excluding removed=1
 * - POST /add                      -> insert student (is_removed=2)
 * - POST /toggle-officer
 * - POST /remove                   -> soft delete (is_removed=1)
 * - POST /restore                  -> restore (is_removed=2)
 *
 * ✅ NEW:
 * - GET  /removed                  -> returns ONLY removed students (is_removed=1) for active semester
 *
 * NOTE:
 * If you mount this router like:
 *   app.use('/api/students', router);
 * then the full endpoints become:
 *   GET  /api/students/active-semester
 *   GET  /api/students/removed
 *   POST /api/students/add
 *   POST /api/students/remove
 *   POST /api/students/restore
 */

// --- Helper: get active semester_id ---
function getActiveSemesterId(cb) {
  const sqlActive = 'SELECT semester_id FROM semester WHERE is_active = 1 LIMIT 1';
  db.query(sqlActive, (err, semResults) => {
    if (err) return cb(err, null);
    if (!semResults || semResults.length === 0) return cb(null, null);
    return cb(null, semResults[0].semester_id);
  });
}

/* =========================================================
   GET ACTIVE SEMESTER STUDENTS (EXCLUDING REMOVED = 1)
========================================================= */
router.get('/active-semester', (req, res) => {
  getActiveSemesterId((err, activeSemesterId) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (!activeSemesterId) {
      return res.json({ success: false, message: 'No active semester found', students: [] });
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
router.get('/removed', (req, res) => {
  getActiveSemesterId((err, activeSemesterId) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (!activeSemesterId) {
      return res.json({ success: false, message: 'No active semester found', students: [] });
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
router.post('/add', (req, res) => {
  const { student_id, student_firstname, student_lastname, department_id, course_id, status_id } = req.body;

  if (!student_id || !student_firstname || !student_lastname || !department_id || !course_id || !status_id) {
    return res.status(400).json({ success: false, message: 'Missing required student data' });
  }

  getActiveSemesterId((err, activeSemesterId) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (!activeSemesterId) {
      return res.status(400).json({ success: false, message: 'No active semester found' });
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
          if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: `Student ID ${student_id} already exists` });
          }
          return res.status(500).json({ success: false, message: err.message });
        }

        return res.json({ success: true, message: 'Student added successfully' });
      }
    );
  });
});

/* =========================================================
   TOGGLE OFFICER STATUS
========================================================= */
router.post('/toggle-officer', (req, res) => {
  const { student_id, is_officer } = req.body;

  if (!student_id || typeof is_officer !== 'boolean') {
    return res.status(400).json({ success: false, message: 'Invalid request body' });
  }

  const sql = 'UPDATE student SET is_officer = ? WHERE student_id = ?';
  db.query(sql, [is_officer ? 1 : 0, student_id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    return res.json({ success: true, message: 'Officer status updated successfully' });
  });
});

/* =========================================================
   SOFT DELETE (is_removed = 1)
========================================================= */
router.post('/remove', (req, res) => {
  const { student_id } = req.body;
  if (!student_id) return res.status(400).json({ success: false, message: 'student_id is required' });

  const sql = 'UPDATE student SET is_removed = 1 WHERE student_id = ?';
  db.query(sql, [student_id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    return res.json({ success: true, message: 'Student removed (soft deleted).' });
  });
});

/* =========================================================
   RESTORE (is_removed = 2)
========================================================= */
router.post('/restore', (req, res) => {
  const { student_id } = req.body;
  if (!student_id) return res.status(400).json({ success: false, message: 'student_id is required' });

  const sql = 'UPDATE student SET is_removed = 2 WHERE student_id = ?';
  db.query(sql, [student_id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    return res.json({ success: true, message: 'Student restored.' });
  });
});

module.exports = router;
