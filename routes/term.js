const express = require('express');
const router = express.Router();
const db = require('../db');

// -------------------------
// Helper functions
// -------------------------

// Deactivate all other rows in a table except the given ID
const deactivateOthers = (table, idColumn, id, callback) => {
    const sql = `UPDATE ${table} SET is_active = 0 WHERE ${idColumn} != ?`;
    db.query(sql, [id], callback);
};

// Activate a row in a table
const activateRow = (table, idColumn, id, callback) => {
    const sql = `UPDATE ${table} SET is_active = 1 WHERE ${idColumn} = ?`;
    db.query(sql, [id], callback);
};

// -------------------------
// GET all years (for dropdown)
// -------------------------
router.get('/years', (req, res) => {
    const sql = 'SELECT year_id, year_name, is_active FROM year ORDER BY year_name DESC';
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        const years = results.map(y => ({
            year_id: y.year_id,
            year_name: y.year_name,
            is_active: !!y.is_active  // ensure boolean
        }));
        res.json({ success: true, years });
    });
});


// -------------------------
// GET semesters (optionally by year_id)
// -------------------------
router.get('/semesters', (req, res) => {
    const { year_id } = req.query;
    let sql = 'SELECT * FROM semester';
    const params = [];
    if (year_id) {
        sql += ' WHERE year_id = ?';
        params.push(year_id);
    }
    db.query(sql, params, (err, results) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, semesters: results });
    });
});


// -------------------------
// GET active term (active year + semester)
// -------------------------
router.get('/active', (req, res) => {
    const sql = `
        SELECT s.semester_id, s.semester_name, y.year_id, y.year_name
        FROM semester s
        JOIN year y ON s.year_id = y.year_id
        WHERE s.is_active = 1 AND y.is_active = 1
        LIMIT 1
    `;

    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ success: false, message: err.message });

        if (results.length === 0) {
            return res.json({ success: false, message: 'No active term found' });
        }

        const active = results[0];
        res.json({
            success: true,
            semester_id: active.semester_id,
            semester: active.semester_name,
            year_id: active.year_id,       // <-- added year_id
            year: active.year_name
        });
    });
});


// -------------------------
// POST update academic year and semester
// -------------------------
router.post('/update', (req, res) => {
    const { year, semester } = req.body;
    if (!year || !semester) return res.status(400).json({ success: false, message: 'Year and Semester are required' });

    let yearId;

    // Find or insert year
    db.query('SELECT year_id FROM year WHERE year_name = ?', [year], (err, yearResult) => {
        if (err) return res.status(500).json({ success: false, message: err.message });

        const processSemester = (yearId, semesterName) => {
            // Find or insert semester
            db.query(
                'SELECT semester_id FROM semester WHERE semester_name = ? AND year_id = ?',
                [semesterName, yearId],
                (err, semResult) => {
                    if (err) return res.status(500).json({ success: false, message: err.message });

                    const finalizeSemester = (semester_id) => {
                        deactivateOthers('semester', 'semester_id', semester_id, (err) => {
                            if (err) return res.status(500).json({ success: false, message: err.message });
                            activateRow('semester', 'semester_id', semester_id, (err) => {
                                if (err) return res.status(500).json({ success: false, message: err.message });

                                res.json({
                                    success: true,
                                    message: 'Year and Semester updated successfully',
                                    semester_id
                                });
                            });
                        });
                    };

                    if (semResult.length === 0) {
                        db.query(
                            'INSERT INTO semester (semester_name, year_id, is_active) VALUES (?, ?, 1)',
                            [semesterName, yearId],
                            (err, insertSem) => {
                                if (err) return res.status(500).json({ success: false, message: err.message });
                                finalizeSemester(insertSem.insertId);
                            }
                        );
                    } else {
                        finalizeSemester(semResult[0].semester_id);
                    }
                }
            );
        };

        if (yearResult.length === 0) {
            // Insert new year
            db.query('INSERT INTO year (year_name, is_active) VALUES (?, 1)', [year], (err, insertYear) => {
                if (err) return res.status(500).json({ success: false, message: err.message });
                yearId = insertYear.insertId;

                deactivateOthers('year', 'year_id', yearId, (err) => {
                    if (err) return res.status(500).json({ success: false, message: err.message });
                    processSemester(yearId, semester);
                });
            });
        } else {
            // Activate existing year
            yearId = yearResult[0].year_id;
            deactivateOthers('year', 'year_id', yearId, (err) => {
                if (err) return res.status(500).json({ success: false, message: err.message });
                activateRow('year', 'year_id', yearId, (err) => {
                    if (err) return res.status(500).json({ success: false, message: err.message });
                    processSemester(yearId, semester);
                });
            });
        }
    });
});

module.exports = router;
