const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
    const { department_id } = req.query;
    if (!department_id) return res.json({ success: false, courses: [] });

    const sql = 'SELECT course_id, course_name, course_abbr FROM course WHERE department_id = ? ORDER BY course_name ASC';
    db.query(sql, [department_id], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, courses: results });
    });
});

module.exports = router;
