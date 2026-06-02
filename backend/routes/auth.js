const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const db      = require('../config/db');
const { authMiddleware, adminOnly, creatorOrAdmin } = require('../middleware/auth');
const { sendWelcomeEmail, sendPasswordResetEmail }  = require('../utils/mailer');
require('dotenv').config();

/* ─── Register (creator or respondent only) ─────────────────── */
router.post('/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ message: 'Name, email and password are required' });
  const allowed  = ['creator', 'respondent'];
  const userRole = allowed.includes(role) ? role : 'respondent';
  try {
    const [ex] = await db.query('SELECT id FROM users WHERE email=?', [email]);
    if (ex.length) return res.status(409).json({ message: 'Email already registered' });
    const hash = await bcrypt.hash(password, 10);
    const [r]  = await db.query(
      'INSERT INTO users (name,email,password,role) VALUES (?,?,?,?)',
      [name, email, hash, userRole]
    );
    sendWelcomeEmail({ name, email, role: userRole }).catch(err =>
      console.error('Welcome email failed:', err.message)
    );
    res.status(201).json({ message: 'Registered successfully', id: r.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ─── Login ─────────────────────────────────────────────────── */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: 'Email and password required' });
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE email=?', [email]);
    if (!rows.length) return res.status(401).json({ message: 'Invalid credentials' });
    const user  = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match)  return res.status(401).json({ message: 'Invalid credentials' });
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ─── Forgot Password ───────────────────────────────────────── */
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email is required' });
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE email=?', [email]);
    if (!rows.length)
      return res.json({ message: 'If that email is registered, a reset link has been sent.' });
    const user    = rows[0];
    const token   = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000);
    await db.query(
      'INSERT INTO password_resets (user_id,token,expires_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE token=?,expires_at=?',
      [user.id, token, expires, token, expires]
    );
    await sendPasswordResetEmail(user, token);
    res.json({ message: 'If that email is registered, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ─── Reset Password ────────────────────────────────────────── */
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password)
    return res.status(400).json({ message: 'Token and new password are required' });
  try {
    const [rows] = await db.query(
      'SELECT * FROM password_resets WHERE token=? AND expires_at > NOW()', [token]
    );
    if (!rows.length)
      return res.status(400).json({ message: 'Invalid or expired reset link.' });
    const hash = await bcrypt.hash(password, 10);
    await db.query('UPDATE users SET password=? WHERE id=?', [hash, rows[0].user_id]);
    await db.query('DELETE FROM password_resets WHERE user_id=?', [rows[0].user_id]);
    res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ─── Admin: change own password ───────────────────────────── */
router.put('/admin/change-password', authMiddleware, adminOnly, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword)
    return res.status(400).json({ message: 'Current and new password are required' });
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE id=?', [req.user.id]);
    if (!rows.length) return res.status(404).json({ message: 'User not found' });
    const match = await bcrypt.compare(currentPassword, rows[0].password);
    if (!match) return res.status(401).json({ message: 'Current password is incorrect' });
    const hash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password=? WHERE id=?', [hash, req.user.id]);
    res.json({ message: 'Admin password updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ─── Current user ──────────────────────────────────────────── */
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id,name,email,role,created_at FROM users WHERE id=?', [req.user.id]);
    if (!rows.length) return res.status(404).json({ message: 'User not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

/* ─── List users ────────────────────────────────────────────── */
router.get('/users', authMiddleware, creatorOrAdmin, async (req, res) => {
  try {
    let rows;
    if (req.user.role === 'admin') {
      [rows] = await db.query('SELECT id,name,email,role,created_at FROM users ORDER BY role,name');
    } else {
      [rows] = await db.query("SELECT id,name,email,role,created_at FROM users WHERE role='respondent' ORDER BY name");
    }
    res.json(rows);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

/* ─── Admin: all users with stats ──────────────────────────── */
router.get('/admin/users', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT u.id, u.name, u.email, u.role, u.created_at,
        COUNT(DISTINCT CASE WHEN u.role='creator' THEN f.id END) AS forms_created,
        COUNT(DISTINCT CASE WHEN u.role='respondent' THEN fa.form_id END) AS forms_assigned,
        COUNT(DISTINCT CASE WHEN u.role='respondent' THEN r.id END) AS responses_submitted
      FROM users u
      LEFT JOIN forms f ON f.creator_id = u.id
      LEFT JOIN form_assignments fa ON fa.user_id = u.id
      LEFT JOIN responses r ON r.user_id = u.id
      GROUP BY u.id ORDER BY u.role, u.name`);
    res.json(rows);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

/* ─── Admin: update user role ───────────────────────────────── */
router.put('/admin/users/:id/role', authMiddleware, adminOnly, async (req, res) => {
  const { role } = req.body;
  const allowed = ['creator','respondent'];
  if (!allowed.includes(role)) return res.status(400).json({ message: 'Invalid role' });
  try {
    await db.query('UPDATE users SET role=? WHERE id=?', [role, req.params.id]);
    res.json({ message: 'Role updated' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

/* ─── Admin: delete user ─────────────────────────────────────── */
router.delete('/admin/users/:id', authMiddleware, adminOnly, async (req, res) => {
  if (parseInt(req.params.id) === req.user.id)
    return res.status(400).json({ message: 'Cannot delete yourself' });
  try {
    await db.query('DELETE FROM users WHERE id=?', [req.params.id]);
    res.json({ message: 'User deleted' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
