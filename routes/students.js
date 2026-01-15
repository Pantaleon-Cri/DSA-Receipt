const express = require('express');
const router = express.Router();
const db = require('../db');

// --- Get all students for the active semester ---
router.get('/active-semester', (req, res) => {
    const sqlActive = 'SELECT * FROM semester WHERE is_active = 1 LIMIT 1';
    db.query(sqlActive, (err, semResults) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        if (semResults.length === 0) return res.json({ success: false, message: 'No active semester found', students: [] });

        const activeSemesterId = semResults[0].semester_id;
        const sqlStudents = 'SELECT * FROM student WHERE year_semester_id = ? ORDER BY student_id ASC';

        db.query(sqlStudents, [activeSemesterId], (err, students) => {
            if (err) return res.status(500).json({ success: false, message: err.message });
            res.json({ success: true, students });
        });
    });
});

// --- Add a student ---
router.post('/add', (req, res) => {
    const { student_id, student_firstname, student_lastname, department_id, course_id, status_id } = req.body;

    if (!student_id || !student_firstname || !student_lastname || !department_id || !course_id || !status_id) {
        return res.status(400).json({ success: false, message: 'Missing required student data' });
    }

    // Get active semester
    const sqlActive = 'SELECT * FROM semester WHERE is_active = 1 LIMIT 1';
    db.query(sqlActive, (err, semResults) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        if (semResults.length === 0) return res.status(400).json({ success: false, message: 'No active semester found' });

        const activeSemesterId = semResults[0].semester_id;

        // Insert student
        const sqlInsert = `
            INSERT INTO student
            (student_id, year_semester_id, student_firstname, student_lastname, department_id, course_id, status_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
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
                res.json({ success: true, message: 'Student added successfully' });
            }
        );
    });
});


// --- Toggle officer status ---
router.post('/toggle-officer', (req, res) => {
    const { student_id, is_officer } = req.body;

    if (!student_id || typeof is_officer !== 'boolean') {
        return res.status(400).json({ success: false, message: 'Invalid request body' });
    }

    const sql = 'UPDATE student SET is_officer = ? WHERE student_id = ?';
    db.query(sql, [is_officer ? 1 : 0, student_id], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error' });
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Student not found' });

        res.json({ success: true, message: 'Officer status updated successfully' });
    });
});

module.exports = router;
