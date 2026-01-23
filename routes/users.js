const express = require('express');
const router = express.Router();
const db = require('../db');

/* ==========================
   GET CURRENT LOGGED-IN USER ("ME")
   ========================== */
/**
 * GET /api/users/me
 *
 * This endpoint returns the currently logged-in user's basic info.
 * It relies on a session value being set at login.
 *
 * Expected session examples:
 *   req.session.user_id = 123
 *   OR
 *   req.session.user = { user_id: 123, ... }
 */
router.get('/me', (req, res) => {
  const sessionUserId =
    req.session?.user_id ??
    req.session?.user?.user_id ??
    req.user?.user_id; // in case you use passport later

  if (!sessionUserId) {
    return res.status(401).json({
      success: false,
      message: 'Not logged in'
    });
  }

  const sql = `
    SELECT user_id, user_firstname, user_lastname, role
    FROM user
    WHERE user_id = ?
    LIMIT 1
  `;

  db.query(sql, [sessionUserId], (err, results) => {
    if (err) {
      console.error('GET /api/users/me error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }

    if (!results || results.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const u = results[0];
    const name = `${u.user_firstname || ''} ${u.user_lastname || ''}`.trim();

    return res.json({
      success: true,
      user: {
        user_id: u.user_id,
        user_firstname: u.user_firstname,
        user_lastname: u.user_lastname,
        role: u.role,
        name
      }
    });
  });
});

/* ==========================
   GET ALL USERS
   ========================== */
router.get('/', (req, res) => {
  const sql = `
    SELECT user_id, user_firstname, user_lastname, role
    FROM user
    ORDER BY user_lastname ASC, user_firstname ASC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error('GET /api/users error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }

    res.json({
      success: true,
      users: results
    });
  });
});

/* ==========================
   CREATE USER (PLAIN TEXT)
   ========================== */
router.post('/', (req, res) => {
  const { user_id, fullname, password, role } = req.body;

  if (!user_id || !fullname || !password || !role) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields'
    });
  }

  const id = Number(user_id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({
      success: false,
      message: 'User ID must be a number'
    });
  }

  // Split full name
  const parts = fullname.trim().split(' ');
  const last = parts.pop();
  const first = parts.join(' ');

  // Check if user already exists
  db.query(
    'SELECT user_id FROM user WHERE user_id = ?',
    [id],
    (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: err.message });
      }

      if (result.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'User ID already exists'
        });
      }

      // Insert user (NO HASHING)
      const sql = `
        INSERT INTO user (user_id, password, user_firstname, user_lastname, role)
        VALUES (?, ?, ?, ?, ?)
      `;

      db.query(sql, [id, password, first, last, role], (err2) => {
        if (err2) {
          console.error(err2);
          return res.status(500).json({ success: false, message: err2.message });
        }

        res.json({
          success: true,
          message: 'Staff created successfully'
        });
      });
    }
  );
});

module.exports = router;
