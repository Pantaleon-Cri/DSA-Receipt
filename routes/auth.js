const express = require('express');
const router = express.Router();
const db = require('../db');

router.post('/', (req, res) => {
    const { userId, password } = req.body;
    const sql = "SELECT * FROM user WHERE user_id = ? AND password = ?";
    db.query(sql, [userId, password], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });

        if (results.length > 0) {
            const user = results[0];
            res.json({
                success: true,
                user: {
                    user_id: user.user_id,
                    user_firstName: user.user_firstname,
                    user_lastName: user.user_lastname
                }
            });
        } else {
            res.json({ success: false, message: "Invalid ID or Password" });
        }
    });
});

module.exports = router;
