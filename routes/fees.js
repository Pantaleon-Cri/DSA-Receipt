// routes/fees.js
const express = require('express');
const router = express.Router();
const db = require('../db'); // your MySQL connection

// ----------------------------
// GET ALL FEES
// ----------------------------
router.get('/', (req, res) => {
    const sql = 'SELECT * FROM fees ORDER BY created_at DESC';
    db.query(sql, (err, results) => {
        if (err) {
            console.error("GET /api/fees failed:", err);
            return res.status(500).json({ success: false, message: "Failed to fetch fees from database" });
        }
        res.json({
            success: true,
            fees: Array.isArray(results) ? results : []
        });
    });
});

// ----------------------------
// ADD NEW FEE
// ----------------------------
router.post('/', (req, res) => {
    const { fee_name, fee_amount, role } = req.body;

    // Validate inputs
    if (!fee_name || fee_amount === undefined || isNaN(fee_amount) || (role !== "0" && role !== "1")) {
        return res.status(400).json({ success: false, message: "Invalid fee_name, fee_amount, or role" });
    }

    // Insert into fees table
    const sql = 'INSERT INTO fees (fee_name, fee_amount, role) VALUES (?, ?, ?)';
    db.query(sql, [fee_name, fee_amount, role], (err, result) => {
        if (err) {
            console.error("POST /api/fees failed:", err);
            return res.status(500).json({ success: false, message: "Failed to add fee to database" });
        }

        const feeId = result.insertId;

        // Get the active semester
        const semSql = 'SELECT semester_id FROM semester WHERE is_active = 1 LIMIT 1';
        db.query(semSql, (err2, semRows) => {
            if (err2 || !semRows.length) {
                console.error("Fetching active semester failed:", err2);
                return res.status(500).json({ success: false, message: "Could not find active semester" });
            }

            const semesterId = semRows[0].semester_id;

            // Insert into history_fee
            const histSql = `
                INSERT INTO history_fee (history_fee_id, history_fee_name, history_fee_amount, semester_id)
                VALUES (?, ?, ?, ?)
            `;
            db.query(histSql, [feeId, fee_name, fee_amount, semesterId], (err3) => {
                if (err3) {
                    console.error("Inserting into history_fee failed:", err3);
                    return res.status(500).json({ success: false, message: "Failed to save fee history" });
                }

                // Return the newly added fee
                const selectSql = 'SELECT * FROM fees WHERE fee_id = ?';
                db.query(selectSql, [feeId], (err4, rows) => {
                    if (err4) {
                        console.error("Fetching new fee failed:", err4);
                        return res.status(500).json({ success: false, message: "Failed to fetch newly added fee" });
                    }
                    res.json({ success: true, fee: rows[0] });
                });
            });
        });
    });
});

// ----------------------------
// UPDATE FEE
// ----------------------------
router.put('/', (req, res) => {
    const { fee_id, fee_name, fee_amount, role } = req.body;

    if (!fee_id || !fee_name || fee_amount === undefined || isNaN(fee_amount) || (role !== "0" && role !== "1")) {
        return res.status(400).json({ success: false, message: "Invalid or missing data" });
    }

    const sql = 'UPDATE fees SET fee_name = ?, fee_amount = ?, role = ? WHERE fee_id = ?';
    db.query(sql, [fee_name, fee_amount, role, fee_id], (err, result) => {
        if (err) {
            console.error("PUT /api/fees failed:", err);
            return res.status(500).json({ success: false, message: "Failed to update fee in database" });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "Fee not found" });
        }

        // Update history_fee only for active semester
        const semSql = 'SELECT semester_id FROM semester WHERE is_active = 1 LIMIT 1';
        db.query(semSql, (err2, semRows) => {
            if (err2 || !semRows.length) {
                console.error("Fetching active semester failed:", err2);
                return res.status(500).json({ success: false, message: "Could not find active semester" });
            }

            const semesterId = semRows[0].semester_id;
            const histSql = `
                UPDATE history_fee
                SET history_fee_name = ?, history_fee_amount = ?
                WHERE history_fee_id = ? AND semester_id = ?
            `;
            db.query(histSql, [fee_name, fee_amount, fee_id, semesterId], (err3) => {
                if (err3) {
                    console.error("Updating history_fee failed:", err3);
                    return res.status(500).json({ success: false, message: "Failed to update fee history" });
                }

                res.json({ success: true, message: "Fee updated successfully" });
            });
        });
    });
});

// ----------------------------
// DELETE FEE
// ----------------------------
router.delete('/:fee_id', (req, res) => {
    const { fee_id } = req.params;

    if (!fee_id) {
        return res.status(400).json({ success: false, message: "Missing fee_id" });
    }

    const sql = 'DELETE FROM fees WHERE fee_id = ?';
    db.query(sql, [fee_id], (err, result) => {
        if (err) {
            console.error("DELETE /api/fees/:fee_id failed:", err);
            return res.status(500).json({ success: false, message: "Failed to delete fee from database" });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "Fee not found" });
        }

        // Do NOT delete from history_fee
        res.json({ success: true, message: "Fee deleted successfully (history remains intact)" });
    });
});

module.exports = router;
