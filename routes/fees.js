const express = require('express');
const router = express.Router();
const db = require('../db');

// ----------------------------
// GET ALL FEES (OPTIONAL FILTER BY semester_id)
// GET /api/fees
// GET /api/fees?semester_id=3
// ----------------------------
router.get('/', (req, res) => {
  const { semester_id } = req.query;

  let sql = 'SELECT * FROM fees';
  const params = [];

  if (semester_id) {
    sql += ' WHERE semester_id = ?';
    params.push(semester_id);
  }

  sql += ' ORDER BY created_at DESC';

  db.query(sql, params, (err, results) => {
    if (err) {
      console.error("GET /api/fees failed:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch fees",
        error: err.message
      });
    }

    res.json({
      success: true,
      fees: Array.isArray(results) ? results : []
    });
  });
});

// ----------------------------
// ADD NEW FEE
// - Inserts into fees with semester_id (FK)
// - Inserts into history_fee (INSERT ONLY) tied to active semester
// ----------------------------
router.post('/', (req, res) => {
  const { fee_name, fee_amount, role, semester_id } = req.body;

  if (!fee_name || isNaN(fee_amount) || (role !== "0" && role !== "1")) {
    return res.status(400).json({
      success: false,
      message: "Invalid input"
    });
  }

  db.getConnection((err, conn) => {
    if (err) {
      console.error("Get connection failed:", err);
      return res.status(500).json({
        success: false,
        message: "DB connection failed",
        error: err.message
      });
    }

    conn.beginTransaction(err0 => {
      if (err0) {
        conn.release();
        return res.status(500).json({
          success: false,
          message: "Failed to start transaction",
          error: err0.message
        });
      }

      // 1) Determine semester (prefer request semester_id, fallback to active semester)
      const getActiveSemSql =
        'SELECT semester_id FROM semester WHERE is_active = 1 LIMIT 1';

      const resolveSemesterId = (cb) => {
        if (semester_id) return cb(null, Number(semester_id));

        conn.query(getActiveSemSql, (errA, rowsA) => {
          if (errA) return cb(errA);
          if (!rowsA || rowsA.length === 0) return cb(new Error("No active semester found"));
          cb(null, rowsA[0].semester_id);
        });
      };

      resolveSemesterId((errSem, semId) => {
        if (errSem) {
          return conn.rollback(() => {
            conn.release();
            console.error("Resolve semester failed:", errSem);
            res.status(400).json({
              success: false,
              message: "No active semester set (or invalid semester_id provided).",
              error: errSem.message
            });
          });
        }

        // 2) Insert into fees (NOW includes semester_id FK)
        const feeSql =
          'INSERT INTO fees (semester_id, fee_name, fee_amount, role) VALUES (?, ?, ?, ?)';

        conn.query(feeSql, [semId, fee_name, fee_amount, role], (err1, result) => {
          if (err1) {
            return conn.rollback(() => {
              conn.release();
              console.error("Insert fee failed:", err1);
              res.status(500).json({
                success: false,
                message: "Failed to add fee",
                error: err1.message
              });
            });
          }

          const feeId = result.insertId;

          // 3) Insert into history_fee (INSERT ONLY)
          // ✅ IMPORTANT FIX:
          // If history_fee_id is AUTO_INCREMENT (common), DO NOT insert it manually.
          // We'll insert only the other columns.
          const histSql = `
            INSERT INTO history_fee
              (history_fee_name, history_fee_amount, semester_id)
            VALUES (?, ?, ?)
          `;

          conn.query(histSql, [fee_name, fee_amount, semId], (err3) => {
            if (err3) {
              return conn.rollback(() => {
                conn.release();
                console.error("Insert history_fee failed:", err3);
                res.status(500).json({
                  success: false,
                  message: "Failed to insert fee history",
                  error: err3.message
                });
              });
            }

            // 4) Commit
            conn.commit(err4 => {
              if (err4) {
                return conn.rollback(() => {
                  conn.release();
                  console.error("Commit failed:", err4);
                  res.status(500).json({
                    success: false,
                    message: "Failed to commit transaction",
                    error: err4.message
                  });
                });
              }

              conn.release();
              res.json({
                success: true,
                message: "Fee added successfully",
                fee_id: feeId,
                semester_id: semId
              });
            });
          });
        });
      });
    });
  });
});

// ----------------------------
// UPDATE FEE (NO HISTORY)
// ----------------------------
router.put('/', (req, res) => {
  const { fee_id, fee_name, fee_amount, role } = req.body;

  if (!fee_id || !fee_name || isNaN(fee_amount) || (role !== "0" && role !== "1")) {
    return res.status(400).json({
      success: false,
      message: "Invalid data"
    });
  }

  const sql =
    'UPDATE fees SET fee_name = ?, fee_amount = ?, role = ? WHERE fee_id = ?';

  db.query(sql, [fee_name, fee_amount, role, fee_id], (err, result) => {
    if (err) {
      console.error("UPDATE fee failed:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to update fee",
        error: err.message
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Fee not found"
      });
    }

    res.json({
      success: true,
      message: "Fee updated successfully"
    });
  });
});

// ----------------------------
// DELETE FEE (HISTORY REMAINS)
// ----------------------------
router.delete('/:fee_id', (req, res) => {
  const { fee_id } = req.params;

  const sql = 'DELETE FROM fees WHERE fee_id = ?';

  db.query(sql, [fee_id], (err, result) => {
    if (err) {
      console.error("DELETE fee failed:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to delete fee",
        error: err.message
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Fee not found"
      });
    }

    res.json({
      success: true,
      message: "Fee deleted (history preserved)"
    });
  });
});

module.exports = router;
