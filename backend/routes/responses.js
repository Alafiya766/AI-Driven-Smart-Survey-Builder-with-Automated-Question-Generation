const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const { authMiddleware, adminOnly, creatorOrAdmin } = require('../middleware/auth');

/* ─── Submit / Resubmit ───────────────────────────────────── */
router.post('/', authMiddleware, async (req, res) => {
  const { form_id, answers } = req.body;
  if (!form_id || !answers) return res.status(400).json({ message: 'form_id and answers required' });
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [ex] = await conn.query(
      'SELECT id,status FROM responses WHERE form_id=? AND user_id=?', [form_id, req.user.id]);
    let responseId;
    let action = 'Response submitted';
    let note   = null;
    if (ex.length) {
      responseId = ex[0].id;
      await conn.query(
        'UPDATE responses SET status="resubmitted",updated_at=NOW() WHERE id=?', [responseId]);
      await conn.query('DELETE FROM answers WHERE response_id=?', [responseId]);
      action = 'Response updated'; note = 'Resubmitted after updates';
    } else {
      const [r] = await conn.query(
        'INSERT INTO responses (form_id,user_id,status) VALUES (?,?,"submitted")', [form_id, req.user.id]);
      responseId = r.insertId;
    }
    for (const a of answers)
      await conn.query(
        'INSERT INTO answers (response_id,question_id,answer_value) VALUES (?,?,?)',
        [responseId, a.question_id, JSON.stringify(a.value)]);
    await conn.query(
      'UPDATE form_assignments SET status="review" WHERE form_id=? AND user_id=?', [form_id, req.user.id]);
    await conn.query(
      'INSERT INTO activity_logs (form_id,response_id,user_id,action,note) VALUES (?,?,?,?,?)',
      [form_id, responseId, req.user.id, action, note]);
    await conn.commit();
    res.status(201).json({ message: 'Submitted', id: responseId });
  } catch (err) {
    await conn.rollback(); console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally { conn.release(); }
});

/* ─── Get all responses for a form (admin) ────────────────── */
router.get('/form/:formId', authMiddleware, creatorOrAdmin, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT r.*,u.name AS user_name,u.email
      FROM responses r JOIN users u ON r.user_id=u.id
      WHERE r.form_id=? ORDER BY r.updated_at DESC`, [req.params.formId]);
    res.json(rows);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

/* ─── User's own response for a form ─────────────────────── */
router.get('/my/:formId', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM responses WHERE form_id=? AND user_id=?', [req.params.formId, req.user.id]);
    if (!rows.length) return res.json(null);
    const resp = rows[0];
    const [ans] = await db.query(`
      SELECT a.*,q.question_text,q.question_type,q.options
      FROM answers a JOIN questions q ON a.question_id=q.id
      WHERE a.response_id=?`, [resp.id]);
    resp.answers = ans;
    const [logs] = await db.query(`
      SELECT al.*,u.name AS user_name FROM activity_logs al
      JOIN users u ON al.user_id=u.id
      WHERE al.response_id=? ORDER BY al.created_at DESC`, [resp.id]);
    resp.activity_logs = logs;
    res.json(resp);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

/* ─── Single response with answers ───────────────────────── */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT r.*,u.name AS user_name,f.title AS form_title,fc.name AS creator_name,f.id AS form_id_ref
      FROM responses r
      JOIN users u  ON r.user_id=u.id
      JOIN forms f  ON r.form_id=f.id
      JOIN users fc ON f.creator_id=fc.id
      WHERE r.id=?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Not found' });
    const resp = rows[0];
    const [ans] = await db.query(`
      SELECT a.*,q.question_text,q.question_type,q.options
      FROM answers a JOIN questions q ON a.question_id=q.id
      WHERE a.response_id=?`, [resp.id]);
    resp.answers = ans;
    const [logs] = await db.query(`
      SELECT al.*,u.name AS user_name FROM activity_logs al
      JOIN users u ON al.user_id=u.id
      WHERE al.response_id=? OR (al.form_id=? AND al.user_id=?)
      ORDER BY al.created_at DESC`, [resp.id, resp.form_id, resp.user_id]);
    resp.activity_logs = logs;
    res.json(resp);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

/* ─── Send back ───────────────────────────────────────────── */
router.post('/:id/send-back', authMiddleware, creatorOrAdmin, async (req, res) => {
  const { note } = req.body;
  try {
    const [rows] = await db.query('SELECT * FROM responses WHERE id=?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Not found' });
    const r = rows[0];
    await db.query('UPDATE responses SET status="returned",updated_at=NOW() WHERE id=?', [req.params.id]);
    await db.query(
      'UPDATE form_assignments SET status="attention" WHERE form_id=? AND user_id=?', [r.form_id, r.user_id]);
    await db.query(
      'INSERT INTO activity_logs (form_id,response_id,user_id,action,note) VALUES (?,?,?,?,?)',
      [r.form_id, req.params.id, req.user.id, 'Sent back for changes', note||'Send back']);
    res.json({ message: 'Sent back' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

/* ─── Complete review ─────────────────────────────────────── */
router.post('/:id/complete', authMiddleware, creatorOrAdmin, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM responses WHERE id=?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Not found' });
    const r = rows[0];
    await db.query('UPDATE responses SET status="reviewed",updated_at=NOW() WHERE id=?', [req.params.id]);
    await db.query(
      'UPDATE form_assignments SET status="completed" WHERE form_id=? AND user_id=?', [r.form_id, r.user_id]);
    await db.query(
      'INSERT INTO activity_logs (form_id,response_id,user_id,action) VALUES (?,?,?,?)',
      [r.form_id, req.params.id, req.user.id, 'Review completed']);
    res.json({ message: 'Completed' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
