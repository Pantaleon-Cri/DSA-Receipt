const express = require('express');
const router = express.Router();
const db = require('../db');

/**
 * NOTE:
 * This file is intended to work with settings.js:
 * - GET    /api/users
 * - POST   /api/users
 * - DELETE /api/users/:id
 * - PATCH  /api/users/:id/password
 * - PATCH  /api/users/password   (optional fallback)
 * - GET    /api/users/me
 */

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
      message: 'Not logged in',
    });
  }

  const sql = `
    SELECT user_id, user_firstname, user_lastname, role
    FROM \`user\`
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
        message: 'User not found',
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
        name,
      },
    });
  });
});

/* ==========================
   GET ALL USERS
   ========================== */
router.get('/', (req, res) => {
  const sql = `
    SELECT user_id, user_firstname, user_lastname, role
    FROM \`user\`
    ORDER BY user_lastname ASC, user_firstname ASC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error('GET /api/users error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }

    res.json({
      success: true,
      users: results,
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
      message: 'Missing required fields',
    });
  }

  const id = Number(user_id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({
      success: false,
      message: 'User ID must be a number',
    });
  }

  // Split full name (IMPROVED: avoids blank firstname when only 1 word)
  const parts = fullname.trim().split(' ').filter(Boolean);

  let first = '';
  let last = '';

  if (parts.length === 1) {
    first = parts[0];
    last = '';
  } else {
    last = parts.pop();
    first = parts.join(' ') || '';
  }

  // Check if user already exists
  db.query('SELECT user_id FROM `user` WHERE user_id = ?', [id], (err, result) => {
    if (err) {
      console.error('POST /api/users check existing error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }

    if (result.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'User ID already exists',
      });
    }

    // Insert user (NO HASHING)
    const sql = `
      INSERT INTO \`user\` (user_id, password, user_firstname, user_lastname, role)
      VALUES (?, ?, ?, ?, ?)
    `;

    db.query(sql, [id, password, first, last, String(role)], (err2) => {
      if (err2) {
        console.error('POST /api/users insert error:', err2);
        return res.status(500).json({ success: false, message: err2.message });
      }

      res.json({
        success: true,
        message: 'Staff created successfully',
      });
    });
  });
});

/* ==========================
   DELETE USER (STAFF REMOVE)
   ========================== */
/**
 * REQUIRED for settings.js staff remove icon:
 * DELETE /api/users/:id
 *
 * Deletes the user row from the `user` table by user_id.
 */
router.delete('/:id', (req, res) => {
  // Helpful log so you can verify the route is being hit in terminal
  // (remove later if you want)
  console.log('✅ DELETE /api/users/:id hit:', req.params.id);

  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid user_id',
    });
  }

  const sql = `
    DELETE FROM \`user\`
    WHERE user_id = ?
    LIMIT 1
  `;

  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error('DELETE /api/users/:id error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }

    if (!result || result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    return res.json({
      success: true,
      message: 'Staff deleted successfully',
    });
  });
});

/* ==========================
   CHANGE PASSWORD (PLAIN TEXT)
   ========================== */
/**
 * OPTION A (recommended for your frontend):
 * PATCH /api/users/:id/password
 * body: { password: "newPlainTextPassword" }
 *
 * Notes:
 * - This updates ONLY the password column
 * - No bcrypt/hashing (plaintext)
 */
router.patch('/:id/password', (req, res) => {
  const id = Number(req.params.id);
  const { password } = req.body;

  if (!Number.isInteger(id)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid user_id',
    });
  }

  if (!password || typeof password !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Password is required',
    });
  }

  const sql = `
    UPDATE \`user\`
    SET password = ?
    WHERE user_id = ?
    LIMIT 1
  `;

  db.query(sql, [password, id], (err, result) => {
    if (err) {
      console.error('PATCH /api/users/:id/password error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }

    if (!result || result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    return res.json({
      success: true,
      message: 'Password updated successfully',
    });
  });
});

/**
 * OPTION B (extra fallback, optional)
 * PATCH /api/users/password
 * body: { user_id: 123, password: "newPlainTextPassword" }
 */
router.patch('/password', (req, res) => {
  const { user_id, password } = req.body;
  const id = Number(user_id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid user_id',
    });
  }

  if (!password || typeof password !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Password is required',
    });
  }

  const sql = `
    UPDATE \`user\`
    SET password = ?
    WHERE user_id = ?
    LIMIT 1
  `;

  db.query(sql, [password, id], (err, result) => {
    if (err) {
      console.error('PATCH /api/users/password error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }

    if (!result || result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    return res.json({
      success: true,
      message: 'Password updated successfully',
    });
  });
});

module.exports = router;
