// routes/term.js
const express = require("express");
const router = express.Router();
const db = require("../db");

// -------------------------
// GET all years (for dropdown)
// -------------------------
router.get("/years", (req, res) => {
  const sql = "SELECT year_id, year_name, is_active FROM year ORDER BY year_name DESC";
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });

    const years = (results || []).map((y) => ({
      year_id: y.year_id,
      year_name: y.year_name,
      is_active: !!y.is_active
    }));

    res.json({ success: true, years });
  });
});

// -------------------------
// GET semesters (optionally by year_id)
// -------------------------
router.get("/semesters", (req, res) => {
  const { year_id } = req.query;

  let sql = "SELECT * FROM semester";
  const params = [];

  if (year_id) {
    sql += " WHERE year_id = ?";
    params.push(year_id);
  }

  db.query(sql, params, (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, semesters: results || [] });
  });
});

// -------------------------
// GET active term
// RULE: only ONE active semester globally
//
// ✅ IMPORTANT UPDATE (NON-BREAKING):
// - keep existing response keys (semester_id, semester, year_id, year, student_population)
// - ADD extra aliases that some frontends may look for (year_semester_id, semester_name, year_name)
//   so nothing breaks and new code can rely on term id safely.
// -------------------------
router.get("/active", (req, res) => {
  const sql = `
    SELECT 
      s.semester_id,
      s.semester_name,
      y.year_id,
      y.year_name,
      (
        SELECT COUNT(*)
        FROM student st
        WHERE st.year_semester_id = s.semester_id
      ) AS student_population
    FROM semester s
    JOIN year y ON s.year_id = y.year_id
    WHERE s.is_active = 1
    ORDER BY s.semester_id DESC
    LIMIT 1
  `;

  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });

    if (!results || results.length === 0) {
      return res.json({ success: false, message: "No active term found" });
    }

    const active = results[0];

    // ✅ Preserve old keys + add new alias keys
    res.json({
      success: true,

      // existing keys (do NOT change)
      semester_id: active.semester_id,
      semester: active.semester_name,
      year_id: active.year_id,
      year: active.year_name,
      student_population: Number(active.student_population || 0),

      // extra aliases (safe additions)
      year_semester_id: active.semester_id,
      semester_name: active.semester_name,
      year_name: active.year_name
    });
  });
});

// -------------------------
// PUT rename year by ID
// -------------------------
router.put("/years/:id", (req, res) => {
  const { id } = req.params;
  const { year_name } = req.body;

  if (!year_name) {
    return res.status(400).json({ success: false, message: "year_name is required" });
  }

  db.query("UPDATE year SET year_name = ? WHERE year_id = ?", [year_name, id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Year not found" });
    }
    res.json({ success: true, message: "Year renamed" });
  });
});

// -------------------------
// PUT rename semester by ID
// -------------------------
router.put("/semesters/:id", (req, res) => {
  const { id } = req.params;
  const { semester_name } = req.body;

  if (!semester_name) {
    return res.status(400).json({ success: false, message: "semester_name is required" });
  }

  db.query(
    "UPDATE semester SET semester_name = ? WHERE semester_id = ?",
    [semester_name, id],
    (err, result) => {
      if (err) return res.status(500).json({ success: false, message: err.message });
      if (!result || result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: "Semester not found" });
      }
      res.json({ success: true, message: "Semester renamed" });
    }
  );
});

// -------------------------
// POST update academic year and semester
// RULES:
//   - only ONE active year
//   - only ONE active semester (GLOBAL)
// -------------------------
router.post("/update", (req, res) => {
  const { year, semester } = req.body;

  if (!year || !semester) {
    return res.status(400).json({ success: false, message: "Year and Semester are required" });
  }

  const findOrCreateYear = (conn, yearName, cb) => {
    conn.query("SELECT year_id FROM year WHERE year_name = ? LIMIT 1", [yearName], (err, yearResult) => {
      if (err) return cb(err);

      if (!yearResult || yearResult.length === 0) {
        conn.query("INSERT INTO year (year_name, is_active) VALUES (?, 0)", [yearName], (err, insertYear) => {
          if (err) return cb(err);
          cb(null, insertYear.insertId);
        });
      } else {
        cb(null, yearResult[0].year_id);
      }
    });
  };

  const findOrCreateSemester = (conn, yearId, semesterName, cb) => {
    conn.query(
      "SELECT semester_id FROM semester WHERE semester_name = ? AND year_id = ? LIMIT 1",
      [semesterName, yearId],
      (err, semResult) => {
        if (err) return cb(err);

        if (!semResult || semResult.length === 0) {
          conn.query(
            "INSERT INTO semester (semester_name, year_id, is_active) VALUES (?, ?, 0)",
            [semesterName, yearId],
            (err, insertSem) => {
              if (err) return cb(err);
              cb(null, insertSem.insertId);
            }
          );
        } else {
          cb(null, semResult[0].semester_id);
        }
      }
    );
  };

  db.getConnection((err, conn) => {
    if (err) return res.status(500).json({ success: false, message: err.message });

    const fail = (status, message) => {
      try {
        conn.release();
      } catch {}
      return res.status(status).json({ success: false, message });
    };

    conn.beginTransaction((err) => {
      if (err) return fail(500, err.message);

      const rollbackFail = (message) =>
        conn.rollback(() => {
          try {
            conn.release();
          } catch {}
          return res.status(500).json({ success: false, message });
        });

      findOrCreateYear(conn, year, (err, yearId) => {
        if (err) return rollbackFail(err.message);

        findOrCreateSemester(conn, yearId, semester, (err, semesterId) => {
          if (err) return rollbackFail(err.message);

          // ✅ ONE ACTIVE YEAR (GLOBAL)
          conn.query("UPDATE year SET is_active = 0", (err) => {
            if (err) return rollbackFail(err.message);

            conn.query("UPDATE year SET is_active = 1 WHERE year_id = ?", [yearId], (err) => {
              if (err) return rollbackFail(err.message);

              // ✅ ONE ACTIVE SEMESTER (GLOBAL, not by year)
              conn.query("UPDATE semester SET is_active = 0", (err) => {
                if (err) return rollbackFail(err.message);

                conn.query("UPDATE semester SET is_active = 1 WHERE semester_id = ?", [semesterId], (err) => {
                  if (err) return rollbackFail(err.message);

                  conn.commit((err) => {
                    if (err) return rollbackFail(err.message);

                    try {
                      conn.release();
                    } catch {}

                    return res.json({
                      success: true,
                      message: "Year and Semester updated successfully",
                      year_id: yearId,
                      semester_id: semesterId,

                      // ✅ safe aliases (won't break old clients)
                      year_semester_id: semesterId
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
});

module.exports = router;
