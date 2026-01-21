// routes/departments.js (FULL, UPDATED)
// Adds:
// - GET  /api/departments         (keeps your existing behavior)
// - POST /api/departments
// - PUT  /api/departments/:id     (for EDIT in settings.js)

const express = require('express');
const router = express.Router();
const db = require('../db');

/**
 * GET /api/departments
 * Returns all departments
 */
router.get('/', (req, res) => {
  const sql = 'SELECT * FROM department ORDER BY department_name ASC';
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, departments: results });
  });
});

/**
 * POST /api/departments
 * Body: { department_name, department_abbr }
 */
router.post('/', (req, res) => {
  const { department_name, department_abbr } = req.body;

  if (!department_name || !department_abbr) {
    return res.status(400).json({
      success: false,
      message: 'department_name and department_abbr are required',
    });
  }

  const sql = 'INSERT INTO department (department_name, department_abbr) VALUES (?, ?)';

  db.query(sql, [department_name, department_abbr], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });

    res.json({
      success: true,
      department: {
        department_id: result.insertId,
        department_name,
        department_abbr,
      },
    });
  });
});

/**
 * PUT /api/departments/:id
 * Body: { department_name, department_abbr }
 */
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { department_name, department_abbr } = req.body;

  if (!id) {
    return res.status(400).json({ success: false, message: 'department id is required' });
  }

  if (!department_name || !department_abbr) {
    return res.status(400).json({
      success: false,
      message: 'department_name and department_abbr are required',
    });
  }

  const sql =
    'UPDATE department SET department_name = ?, department_abbr = ? WHERE department_id = ?';

  db.query(sql, [department_name, department_abbr, id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Department not found' });
    }

    res.json({
      success: true,
      department: {
        department_id: Number(id),
        department_name,
        department_abbr,
      },
    });
  });
});

module.exports = router;
