// routes/courses.js (FULL, UPDATED)
// Adds:
// - GET  /api/courses?department_id=#
/*   (keeps your existing behavior) */
// - POST /api/courses
// - PUT  /api/courses/:id   (for EDIT in settings.js)

const express = require('express');
const router = express.Router();
const db = require('../db');

/**
 * GET /api/courses?department_id=#
 * Returns courses under a department
 */
router.get('/', (req, res) => {
  const { department_id } = req.query;
  if (!department_id) return res.json({ success: false, courses: [] });

  const sql =
    'SELECT course_id, course_name, course_abbr, department_id FROM course WHERE department_id = ? ORDER BY course_name ASC';

  db.query(sql, [department_id], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, courses: results });
  });
});

/**
 * POST /api/courses
 * Body: { department_id, course_name, course_abbr }
 */
router.post('/', (req, res) => {
  const { department_id, course_name, course_abbr } = req.body;

  if (!department_id || !course_name || !course_abbr) {
    return res.status(400).json({
      success: false,
      message: 'department_id, course_name, and course_abbr are required',
    });
  }

  const sql =
    'INSERT INTO course (department_id, course_name, course_abbr) VALUES (?, ?, ?)';

  db.query(sql, [department_id, course_name, course_abbr], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });

    res.json({
      success: true,
      course: {
        course_id: result.insertId,
        department_id,
        course_name,
        course_abbr,
      },
    });
  });
});

/**
 * PUT /api/courses/:id
 * For editing course
 * Body: { department_id, course_name, course_abbr }
 */
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { department_id, course_name, course_abbr } = req.body;

  if (!id) {
    return res.status(400).json({ success: false, message: 'course id is required' });
  }

  if (!department_id || !course_name || !course_abbr) {
    return res.status(400).json({
      success: false,
      message: 'department_id, course_name, and course_abbr are required',
    });
  }

  const sql =
    'UPDATE course SET department_id = ?, course_name = ?, course_abbr = ? WHERE course_id = ?';

  db.query(sql, [department_id, course_name, course_abbr, id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    res.json({
      success: true,
      course: {
        course_id: Number(id),
        department_id,
        course_name,
        course_abbr,
      },
    });
  });
});

module.exports = router;
