const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const db = require('./db'); // MySQL connection

// Routers
const authRouter = require('./routes/auth');
const departmentRouter = require('./routes/departments');
const studentRouter = require('./routes/students');
const courseRouter = require('./routes/courses');
const statusRouter = require('./routes/status');
const termRouter = require('./routes/term');

const feesRouter = require('./routes/fees');
const paymentRouter = require('./routes/payment');
const dashboardRouter = require('./routes/dashboard');
const app = express();

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// --- API Routes ---
app.use('/api/login', authRouter);
app.use('/api/departments', departmentRouter);
app.use('/api/students', studentRouter);
app.use('/api/courses', courseRouter);
app.use('/api/status', statusRouter);
app.use('/api/term', termRouter);
app.use('/api/fees', feesRouter);
app.use('/api', paymentRouter);
app.use('/api/dashboard', dashboardRouter);

// server.js (or your route handler)
app.post('/api/students/import', async (req, res) => {
    try {
        const { students } = req.body;

        if (!students || !Array.isArray(students) || students.length === 0) {
            return res.json({ success: false, message: 'No students provided' });
        }

        // Map to array of arrays for bulk insert
        const values = students.map(s => [
            s.student_id,
            s.student_firstname,
            s.student_lastname,
            s.department_id,
            s.course_id || null,
            s.year_semester_id,      // active semester id
            s.status_id || 1,        // default status
            s.is_officer !== undefined ? s.is_officer : null
        ]);

        // Insert ignoring duplicates
        const insertSql = `
            INSERT IGNORE INTO student
            (student_id, student_firstname, student_lastname, department_id, course_id, year_semester_id, status_id, is_officer)
            VALUES ?
        `;
        const [insertResult] = await db.promise().query(insertSql, [values]);

        // Fetch the updated list of students for the active semester
        const [studentsList] = await db.promise().query(
            `SELECT * FROM student WHERE year_semester_id = ? ORDER BY student_id`,
            [students[0].year_semester_id]
        );

        res.json({ 
            success: true, 
            message: `${insertResult.affectedRows} student(s) imported. Duplicates were skipped.`,
            students: studentsList   // ✅ send updated students back
        });

    } catch (err) {
        console.error('Error importing students:', err);
        res.json({ success: false, message: 'Failed to import students', error: err.message });
    }
});




// --- Start server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}/login/login.html`);
});
