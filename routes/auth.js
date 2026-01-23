// routes/auth.js (FULL UPDATED — role-based login, plain text password)
// ✅ Keeps your existing structure (Express router + db.query callback)
// ✅ Accepts BOTH { userId, password } (your current frontend) AND { user_id, password } (if you switch later)
// ✅ Returns role (role_id stored in varchar) so frontend can redirect
// ✅ Does NOT break existing code expecting user_firstName/user_lastName in response
// ⚠️ Make sure your table name is correct:
//    - If your table is really named `user`, keep it as \`user\` (reserved word, use backticks)
//    - If your table is `users`, change the SQL FROM clause accordingly

const express = require('express');
const router = express.Router();
const db = require('../db');

router.post('/', (req, res) => {
  // Support both payload styles:
  // - old: { userId, password }
  // - new: { user_id, password }
  const userId = req.body.userId ?? req.body.user_id;
  const password = req.body.password;

  if (userId == null || password == null) {
    return res.status(400).json({
      success: false,
      message: "Missing userId/user_id or password"
    });
  }

  // NOTE: `user` is a reserved keyword in MySQL; safest is to wrap in backticks.
  // If your actual table is `users`, change FROM `user` -> FROM `users`
  const sql = `
    SELECT user_id, user_firstname, user_lastname, role
    FROM \`user\`
    WHERE user_id = ? AND password = ?
    LIMIT 1
  `;

  db.query(sql, [userId, password], (err, results) => {
    if (err) {
      return res.status(500).json({
        success: false,
        error: err.message
      });
    }

    if (results && results.length > 0) {
      const user = results[0];

      return res.json({
        success: true,
        user: {
          user_id: user.user_id,

          // Keep your existing response keys (so nothing breaks)
          user_firstName: user.user_firstname,
          user_lastName: user.user_lastname,

          // Add these too (useful for other pages like settings.js)
          user_firstname: user.user_firstname,
          user_lastname: user.user_lastname,

          // ✅ IMPORTANT: role is stored as role_id string in your DB column `role`
          role: String(user.role ?? "")
        }
      });
    }

    return res.json({
      success: false,
      message: "Invalid ID or Password"
    });
  });
});

module.exports = router;
