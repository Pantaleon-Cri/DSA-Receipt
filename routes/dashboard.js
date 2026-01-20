// routes/dashboard.js
const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  const department_id = req.query.department_id ? Number(req.query.department_id) : null;
  const status_id = req.query.status_id ? Number(req.query.status_id) : null;
  const semester_id_raw = req.query.semester_id ? Number(req.query.semester_id) : null;

  // 1) Get active semester if semester_id is not provided
  db.query('SELECT semester_id FROM semester WHERE is_active = 1 LIMIT 1', (err, semRows) => {
    if (err) return res.status(500).json({ success: false, message: err.message });

    const activeSemesterId = semRows.length ? semRows[0].semester_id : null;
    const semester_id = semester_id_raw || activeSemesterId;

    if (!semester_id) {
      return res.json({ success: true, stats: { total: 0, byStatus: {} }, students: [], debug: { semester_id, activeSemesterId } });
    }

    // 2) Build WHERE
    let where = 'WHERE s.year_semester_id = ?';
    const params = [semester_id];

    if (department_id) {
      where += ' AND s.department_id = ?';
      params.push(department_id);
    }

    if (status_id) {
      where += ' AND s.status_id = ?';
      params.push(status_id);
    }

    const studentsSql = `
      SELECT
        s.student_id,
        s.student_firstname,
        s.student_lastname,
        s.department_id,
        d.department_name,
        d.department_abbr,
        s.status_id,
        st.status_name,
        s.year_semester_id
      FROM student s
      LEFT JOIN department d ON d.department_id = s.department_id
      LEFT JOIN status st ON st.status_id = s.status_id
      ${where}
      ORDER BY s.student_lastname ASC, s.student_firstname ASC, s.student_id ASC
    `;

    const statsSql = `
      SELECT s.status_id, COUNT(*) AS cnt
      FROM student s
      ${where}
      GROUP BY s.status_id
    `;

    // 3) Query students
    db.query(studentsSql, params, (err2, students) => {
      if (err2) return res.status(500).json({ success: false, message: err2.message });

      // 4) Query stats
      db.query(statsSql, params, (err3, statRows) => {
        if (err3) return res.status(500).json({ success: false, message: err3.message });

        const byStatus = {};
        let total = 0;

        statRows.forEach(r => {
          const sid = r.status_id == null ? 'null' : String(r.status_id);
          const cnt = Number(r.cnt || 0);
          byStatus[sid] = cnt;
          total += cnt;
        });

        return res.json({
          success: true,
          stats: { total, byStatus },
          students,
          debug: { semester_id, activeSemesterId, department_id, status_id } // ✅ helps you see what it filtered
        });
      });
    });
  });
});

module.exports = router;
