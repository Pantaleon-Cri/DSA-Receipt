// routes/payment.js
const express = require('express');
const router = express.Router();
const db = require('../db');

// Promisify pool.getConnection (mysql2 callback pool)
const getConnection = () =>
  new Promise((resolve, reject) => {
    db.getConnection((err, conn) => {
      if (err) return reject(err);
      resolve(conn);
    });
  });

// Promisify connection.query
const connQuery = (conn, sql, params = []) =>
  new Promise((resolve, reject) => {
    conn.query(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });

/**
 * RECOMMENDED DB SAFETY (run once) AFTER you add semester_id to payment table:
 *
 * 1) Add semester_id column:
 *    ALTER TABLE payment ADD COLUMN semester_id INT NOT NULL AFTER fee_id;
 *
 * 2) Prevent duplicates per term:
 *    ALTER TABLE payment ADD UNIQUE KEY uniq_student_fee_term (student_id, fee_id, semester_id);
 *
 * 3) Helpful index:
 *    CREATE INDEX idx_payment_student_term ON payment (student_id, semester_id);
 *
 * NOTE: If you already have rows, add semester_id as NULL first then backfill, then set NOT NULL.
 */

// -----------------------------------------------------------------------------
// GET /api/payments/student/:student_id?semester_id=123
// Returns payments for a student. If semester_id is provided, returns only that term's payments.
// -----------------------------------------------------------------------------
router.get('/payments/student/:student_id', async (req, res) => {
  const { student_id } = req.params;
  const semester_id = req.query.semester_id ? Number(req.query.semester_id) : null;

  if (!student_id) {
    return res.status(400).json({ success: false, message: 'student_id is required' });
  }

  if (req.query.semester_id && (!Number.isFinite(semester_id) || semester_id <= 0)) {
    return res.status(400).json({ success: false, message: 'semester_id must be a valid number' });
  }

  let conn;
  try {
    conn = await getConnection();

    const params = [student_id];
    let semesterFilterSql = '';
    if (Number.isFinite(semester_id) && semester_id > 0) {
      semesterFilterSql = 'AND p.semester_id = ?';
      params.push(semester_id);
    }

    const rows = await connQuery(
      conn,
      `
      SELECT 
        p.payment_id,
        p.student_id,
        p.semester_id,
        p.fee_id,
        p.amount_paid,
        p.payment_date,
        p.control_number,
        p.issued_by,
        f.fee_name
      FROM payment p
      LEFT JOIN fees f ON f.fee_id = p.fee_id
      WHERE p.student_id = ?
      ${semesterFilterSql}
      ORDER BY p.payment_date DESC, p.payment_id DESC
      `,
      params
    );

    return res.json({ success: true, payments: rows });
  } catch (err) {
    console.error('GET /api/payments/student/:student_id error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Server error' });
  } finally {
    if (conn) conn.release();
  }
});

// -----------------------------------------------------------------------------
// GET /api/payments/student/:student_id/transactions?semester_id=123
// Returns distinct receipts for a student. If semester_id provided, only receipts in that term.
// -----------------------------------------------------------------------------
router.get('/payments/student/:student_id/transactions', async (req, res) => {
  const { student_id } = req.params;
  const semester_id = req.query.semester_id ? Number(req.query.semester_id) : null;

  if (!student_id) {
    return res.status(400).json({ success: false, message: 'student_id is required' });
  }

  if (req.query.semester_id && (!Number.isFinite(semester_id) || semester_id <= 0)) {
    return res.status(400).json({ success: false, message: 'semester_id must be a valid number' });
  }

  let conn;
  try {
    conn = await getConnection();

    const params = [student_id];
    let semesterFilterSql = '';
    if (Number.isFinite(semester_id) && semester_id > 0) {
      semesterFilterSql = 'AND p.semester_id = ?';
      params.push(semester_id);
    }

    const rows = await connQuery(
      conn,
      `
      SELECT
        p.control_number,
        p.semester_id,
        MAX(p.payment_date) AS payment_date,
        SUM(p.amount_paid) AS total_amount
      FROM payment p
      WHERE p.student_id = ?
        ${semesterFilterSql}
        AND p.control_number IS NOT NULL
        AND p.control_number <> ''
      GROUP BY p.control_number, p.semester_id
      ORDER BY MAX(p.payment_date) DESC
      `,
      params
    );

    return res.json({ success: true, transactions: rows });
  } catch (err) {
    console.error('GET /api/payments/student/:student_id/transactions error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Server error' });
  } finally {
    if (conn) conn.release();
  }
});

// -----------------------------------------------------------------------------
// GET /api/payments/receipt/:control_number
// Returns fees + total for that receipt (reprint)
// -----------------------------------------------------------------------------
router.get('/payments/receipt/:control_number', async (req, res) => {
  const { control_number } = req.params;

  let conn;
  try {
    conn = await getConnection();

    const rows = await connQuery(
      conn,
      `
      SELECT
        p.payment_id,
        p.student_id,
        p.semester_id,
        p.fee_id,
        p.amount_paid,
        p.payment_date,
        p.control_number,
        p.issued_by,
        f.fee_name
      FROM payment p
      LEFT JOIN fees f ON f.fee_id = p.fee_id
      WHERE p.control_number = ?
      ORDER BY p.payment_id ASC
      `,
      [control_number]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Receipt not found' });
    }

    const total = rows.reduce((sum, r) => sum + Number(r.amount_paid || 0), 0);

    return res.json({
      success: true,
      receipt: {
        control_number,
        student_id: rows[0].student_id,
        semester_id: rows[0].semester_id,
        issued_by: rows[0].issued_by,
        payment_date: rows[0].payment_date,
        items: rows.map(r => ({
          fee_id: r.fee_id,
          fee_name: r.fee_name || `Fee #${r.fee_id}`,
          amount_paid: r.amount_paid
        })),
        total_amount: total
      }
    });
  } catch (err) {
    console.error('GET receipt error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Server error' });
  } finally {
    if (conn) conn.release();
  }
});

// -----------------------------------------------------------------------------
// POST /api/payments
// Inserts 1 row per fee for a student (skips duplicates), updates student.status_id for THAT TERM
//
// Expected body:
// {
//   student_id,
//   semester_id,
//   issued_by,
//   control_number,
//   fees: [{fee_id, amount_paid}],
//   fees_to_consider: [fee_id, ...]
// }
// -----------------------------------------------------------------------------
router.post('/payments', async (req, res) => {
  const { student_id, semester_id, issued_by, control_number, fees, fees_to_consider } = req.body;

  // ---- Basic validation ----
  if (!student_id || !issued_by || !control_number) {
    return res.status(400).json({
      success: false,
      message: 'student_id, issued_by, and control_number are required'
    });
  }

  const semIdNum = Number(semester_id);
  if (!Number.isFinite(semIdNum) || semIdNum <= 0) {
    return res.status(400).json({
      success: false,
      message: 'semester_id is required and must be a valid number'
    });
  }

  // issued_by is VARCHAR in schema
  if (typeof issued_by !== 'string' || issued_by.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'issued_by must be a non-empty string (issuer name).'
    });
  }

  if (!Array.isArray(fees) || fees.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'fees must be a non-empty array'
    });
  }

  if (!Array.isArray(fees_to_consider) || fees_to_consider.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'fees_to_consider must be a non-empty array (visible/filtered fees)'
    });
  }

  // sanitize fees_to_consider (unique + numeric)
  const feesToConsider = [
    ...new Set(fees_to_consider.map(Number).filter(n => Number.isFinite(n) && n > 0))
  ];

  if (feesToConsider.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'fees_to_consider has no valid fee_id values'
    });
  }

  // sanitize incoming fees (unique by fee_id, numeric)
  const normalizedFeesMap = new Map(); // fee_id -> amount_paid
  for (const item of fees) {
    const fee_id = Number(item?.fee_id);
    const amount_paid = Number(item?.amount_paid);
    if (!Number.isFinite(fee_id) || fee_id <= 0) continue;
    if (!Number.isFinite(amount_paid) || amount_paid < 0) continue;

    // if duplicates come from frontend, keep latest
    normalizedFeesMap.set(fee_id, amount_paid);
  }

  const normalizedFees = [...normalizedFeesMap.entries()].map(([fee_id, amount_paid]) => ({
    fee_id,
    amount_paid
  }));

  if (normalizedFees.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No valid fee items to process'
    });
  }

  let conn;
  try {
    conn = await getConnection();

    await connQuery(conn, 'START TRANSACTION');

    // (Optional but recommended) Ensure the fee_ids being paid belong to THIS semester_id
    // This prevents paying a fee from another term by accident.
    const feeIdsIncoming = normalizedFees.map(x => x.fee_id);
    const validFees = await connQuery(
      conn,
      `
      SELECT fee_id
      FROM fees
      WHERE semester_id = ?
        AND fee_id IN (?)
      `,
      [semIdNum, feeIdsIncoming]
    );
    const validFeeSet = new Set(validFees.map(r => Number(r.fee_id)));
    const filteredFees = normalizedFees.filter(x => validFeeSet.has(Number(x.fee_id)));

    if (filteredFees.length === 0) {
      await connQuery(conn, 'ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'No valid fees for this semester. Please refresh and try again.'
      });
    }

    // 1) Fetch already-paid fees for this student IN THIS SEMESTER
    const existingRows = await connQuery(
      conn,
      `
      SELECT fee_id
      FROM payment
      WHERE student_id = ?
        AND semester_id = ?
        AND fee_id IN (?)
      `,
      [student_id, semIdNum, filteredFees.map(x => x.fee_id)]
    );

    const existingFeeSet = new Set(existingRows.map(r => Number(r.fee_id)));

    // 2) Filter out duplicates (already paid)
    const toInsert = filteredFees.filter(x => !existingFeeSet.has(Number(x.fee_id)));

    let insertedRows = 0;
    const insertedFeeIds = [];

    // 3) Insert remaining fees (include semester_id)
    for (const item of toInsert) {
      await connQuery(
        conn,
        `
        INSERT INTO payment (student_id, fee_id, semester_id, amount_paid, control_number, issued_by)
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [student_id, item.fee_id, semIdNum, item.amount_paid, control_number, issued_by.trim()]
      );

      insertedRows++;
      insertedFeeIds.push(item.fee_id);
    }

    // 4) Status check (ONLY visible/filtered fees) IN THIS SEMESTER
    // NOTE: feesToConsider should already be term-filtered by frontend,
    // but we also lock by semester_id to be safe.
    const paidCountRows = await connQuery(
      conn,
      `
      SELECT COUNT(DISTINCT fee_id) AS paidCount
      FROM payment
      WHERE student_id = ?
        AND semester_id = ?
        AND fee_id IN (?)
      `,
      [student_id, semIdNum, feesToConsider]
    );

    const paidCount = Number(paidCountRows?.[0]?.paidCount || 0);
    const totalToConsider = feesToConsider.length;
    const status_id = paidCount >= totalToConsider ? 2 : 1;

    // 5) Update student status for THIS TERM row
    // Your student table has year_semester_id, so we update that row only.
    await connQuery(
      conn,
      `
      UPDATE student
      SET status_id = ?
      WHERE student_id = ?
        AND year_semester_id = ?
      `,
      [status_id, student_id, semIdNum]
    );

    await connQuery(conn, 'COMMIT');

    return res.json({
      success: true,
      message: 'Payment processed successfully',
      inserted_rows: insertedRows,
      inserted_fee_ids: insertedFeeIds,
      skipped_duplicates: filteredFees.length - toInsert.length,
      status_id,
      paid_count: paidCount,
      total_to_consider: totalToConsider,
      control_number,
      semester_id: semIdNum
    });
  } catch (err) {
    console.error('POST /api/payments error:', err);

    if (conn) {
      try {
        await connQuery(conn, 'ROLLBACK');
      } catch (_) {}
    }

    return res.status(500).json({
      success: false,
      message: err.message || 'Server error processing payment'
    });
  } finally {
    if (conn) conn.release();
  }
});


// -----------------------------------------------------------------------------
// GET /api/payments/reports/transactions?interval=day|week|month&target=...
// Report is based on payment_date only (NOT semester bound)
// Groups rows by (control_number + student_id) to merge multiple fee_id rows.
// Also resolves Student Name from student_firstname + student_lastname.
// IMPORTANT: student table has composite key (student_id, year_semester_id),
// so we pick the latest year_semester_id per student to avoid duplicates.
// -----------------------------------------------------------------------------
router.get('/payments/reports/transactions', async (req, res) => {
  const interval = String(req.query.interval || 'day');
  const target = String(req.query.target || '');

  if (!target) {
    return res.status(400).json({ success: false, message: 'target is required' });
  }

  // ---- Build [start, end) range from target ----
  function getRange(interval, target) {
    if (interval === 'day') {
      const start = new Date(`${target}T00:00:00`);
      if (Number.isNaN(start.getTime())) throw new Error('Invalid day target');
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      return { start, end };
    }

    if (interval === 'month') {
      const [y, m] = target.split('-').map(Number);
      if (!y || !m) throw new Error('Invalid month target');
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 1);
      return { start, end };
    }

    if (interval === 'week') {
      const [yStr, wStr] = target.split('-W');
      const y = Number(yStr);
      const w = Number(wStr);
      if (!y || !w) throw new Error('Invalid week target');

      // ISO week Monday start (UTC)
      const simple = new Date(Date.UTC(y, 0, 1 + (w - 1) * 7));
      const dow = simple.getUTCDay();
      const start = new Date(simple);
      start.setUTCDate(simple.getUTCDate() - ((dow + 6) % 7));
      start.setUTCHours(0, 0, 0, 0);

      const end = new Date(start);
      end.setUTCDate(start.getUTCDate() + 7);
      return { start, end };
    }

    throw new Error('Invalid interval');
  }

  const pad2 = n => String(n).padStart(2, '0');
  const toMysql = d =>
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;

  let conn;
  try {
    const { start, end } = getRange(interval, target);
    const startStr = toMysql(start);
    const endStr = toMysql(end);

    conn = await getConnection();
    await connQuery(conn, 'SET SESSION group_concat_max_len = 8192');

    const rows = await connQuery(
      conn,
      `
      SELECT
        p.control_number AS id,
        p.student_id     AS studentId,

        -- Build student full name (fallback to ID-xxxx)
        COALESCE(
          CONCAT_WS(' ', s.student_firstname, s.student_lastname),
          CONCAT('ID-', p.student_id)
        ) AS student,

        -- Comma-separated allocated fees for the receipt
        GROUP_CONCAT(DISTINCT f.fee_name ORDER BY f.fee_name SEPARATOR ', ') AS fee,

        -- Total amount for the receipt
        SUM(p.amount_paid) AS amount,

        'Paid' AS status,
        MAX(p.payment_date) AS payment_date

      FROM payment p
      LEFT JOIN fees f ON f.fee_id = p.fee_id

      -- Student table has multiple rows per student_id across terms.
      -- Pick ONE row per student_id (latest year_semester_id) to avoid duplicates.
      LEFT JOIN (
        SELECT s1.*
        FROM student s1
        JOIN (
          SELECT student_id, MAX(year_semester_id) AS max_term
          FROM student
          GROUP BY student_id
        ) latest
          ON latest.student_id = s1.student_id
         AND latest.max_term = s1.year_semester_id
      ) s ON s.student_id = p.student_id

      WHERE p.payment_date >= ? AND p.payment_date < ?
        AND p.control_number IS NOT NULL AND p.control_number <> ''

      GROUP BY p.control_number, p.student_id
      ORDER BY MAX(p.payment_date) DESC
      `,
      [startStr, endStr]
    );

    return res.json({ success: true, transactions: rows });
  } catch (err) {
    console.error('GET /api/payments/reports/transactions error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Server error' });
  } finally {
    if (conn) conn.release();
  }
});



module.exports = router;
