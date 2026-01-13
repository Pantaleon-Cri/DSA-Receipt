const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const db = require('./db');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Login API
app.post('/api/login', (req, res) => {
  const { userId, password } = req.body;

  const sql = "SELECT * FROM user WHERE user_id = ? AND password = ?";
  db.query(sql, [userId, password], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });

    if (results.length > 0) {
      // Login successful: send back user info
      const user = results[0]; // user_firstname, user_lastname, user_id
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



app.listen(process.env.PORT, () => {
  console.log(`🚀 Server running at http://localhost:${process.env.PORT}`);
});
