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
const rolesRouter = require('./routes/roles');
const usersRouter = require('./routes/users');
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
app.use('/api/users', usersRouter);

app.use('/api/roles', rolesRouter);




// --- Start server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}/login/login.html`);
});
