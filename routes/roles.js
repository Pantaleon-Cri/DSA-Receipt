const express = require('express');
const router = express.Router();
const db = require('../db');

/*
|--------------------------------------------------------------------------
| GET ALL ROLES
| Endpoint: /api/roles
|--------------------------------------------------------------------------
*/
router.get('/', (req, res) => {
    const sql = 'SELECT role_id, role_name FROM role ORDER BY role_name ASC';

    db.query(sql, (err, results) => {
        if (err) {
            console.error('Error fetching roles:', err);
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch roles'
            });
        }

        res.json({
            success: true,
            roles: results
        });
    });
});

module.exports = router;
