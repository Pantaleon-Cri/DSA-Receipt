const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
    const sql = 'SELECT * FROM department ORDER BY department_name ASC';
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, departments: results });
    });
});

module.exports = router;
