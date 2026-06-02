const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const { authMiddleware, creatorOrAdmin } = require('../middleware/auth');

/* ─── Get all system templates ────────────────────────────── */
router.get('/system', authMiddleware, creatorOrAdmin, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id,title,description,category,icon,created_at FROM system_templates ORDER BY category,title');
    res.json(rows);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

/* ─── Get single system template (with sections) ─────────── */
router.get('/system/:id', authMiddleware, creatorOrAdmin, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM system_templates WHERE id=?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

/* ─── Get creator's own saved templates ───────────────────── */
router.get('/mine', authMiddleware, creatorOrAdmin, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT f.*,u.name AS creator_name FROM forms f LEFT JOIN users u ON f.creator_id=u.id WHERE f.is_template=1 AND f.creator_id=? ORDER BY f.created_at DESC',
      [req.user.id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

/* ─── Instantiate system template → new form ──────────────── */
router.post('/system/:id/instantiate', authMiddleware, creatorOrAdmin, async (req, res) => {
  const { title, description, due_date, assignees } = req.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [tmpl] = await conn.query('SELECT * FROM system_templates WHERE id=?', [req.params.id]);
    if (!tmpl.length) return res.status(404).json({ message: 'Template not found' });
    const t = tmpl[0];
    const sections = typeof t.sections === 'string' ? JSON.parse(t.sections) : t.sections;

    // Save as 'active' if assignees provided, otherwise 'draft'
    const formStatus = 'draft'; // always save as draft first, publish separately

    const [fr] = await conn.query(
      'INSERT INTO forms (title,description,creator_id,due_date,is_template,status) VALUES (?,?,?,?,0,?)',
      [title || t.title, description || t.description || '', req.user.id, due_date || null, formStatus]);
    const formId = fr.insertId;

    for (let si = 0; si < sections.length; si++) {
      const s = sections[si];
      const [sr] = await conn.query(
        'INSERT INTO sections (form_id,title,description,position) VALUES (?,?,?,?)',
        [formId, s.title, s.description || '', si]);
      if (s.questions?.length) {
        for (let qi = 0; qi < s.questions.length; qi++) {
          const q = s.questions[qi];
          await conn.query(
            'INSERT INTO questions (section_id,question_text,question_type,options,is_required,position) VALUES (?,?,?,?,?,?)',
            [sr.insertId, q.question_text, q.question_type, JSON.stringify(q.options || []), q.is_required ? 1 : 0, qi]);
        }
      }
    }

    if (assignees?.length) {
      for (const uid of assignees)
        await conn.query('INSERT IGNORE INTO form_assignments (form_id,user_id) VALUES (?,?)', [formId, uid]);
      await conn.query(
        'INSERT INTO activity_logs (form_id,user_id,action,note) VALUES (?,?,?,?)',
        [formId, req.user.id, 'Form created from template and assigned', `${t.title} → assigned to ${assignees.length} user(s)`]);
    } else {
      await conn.query(
        'INSERT INTO activity_logs (form_id,user_id,action,note) VALUES (?,?,?,?)',
        [formId, req.user.id, 'Form created from template', t.title]);
    }

    await conn.commit();
    res.status(201).json({ message: 'Form created from template', id: formId, status: formStatus });
  } catch (err) {
    await conn.rollback(); console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally { conn.release(); }
});

/* ─── Instantiate own template → new form ─────────────────── */
router.post('/mine/:id/instantiate', authMiddleware, creatorOrAdmin, async (req, res) => {
  const { title, description, due_date, assignees } = req.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [tmpl] = await conn.query('SELECT * FROM forms WHERE id=? AND is_template=1', [req.params.id]);
    if (!tmpl.length) return res.status(404).json({ message: 'Template not found' });
    const t = tmpl[0];

    // Save as 'active' if assignees provided, otherwise 'draft'
    const formStatus = 'draft'; // always save as draft first, publish separately

    const [fr] = await conn.query(
      'INSERT INTO forms (title,description,creator_id,due_date,is_template,status) VALUES (?,?,?,?,0,?)',
      [title || `${t.title} (Copy)`, description || t.description || '', req.user.id, due_date || null, formStatus]);
    const formId = fr.insertId;

    const [secs] = await conn.query('SELECT * FROM sections WHERE form_id=? ORDER BY position', [t.id]);
    for (const s of secs) {
      const [sr] = await conn.query(
        'INSERT INTO sections (form_id,title,description,position) VALUES (?,?,?,?)',
        [formId, s.title, s.description || '', s.position]);
      const [qs] = await conn.query('SELECT * FROM questions WHERE section_id=? ORDER BY position', [s.id]);
      for (const q of qs)
        await conn.query(
          'INSERT INTO questions (section_id,question_text,question_type,options,is_required,position) VALUES (?,?,?,?,?,?)',
          [sr.insertId, q.question_text, q.question_type, q.options, q.is_required, q.position]);
    }

    if (assignees?.length)
      for (const uid of assignees)
        await conn.query('INSERT IGNORE INTO form_assignments (form_id,user_id) VALUES (?,?)', [formId, uid]);

    await conn.commit();
    res.status(201).json({ message: 'Created', id: formId, status: formStatus });
  } catch (err) {
    await conn.rollback(); res.status(500).json({ message: 'Server error' });
  } finally { conn.release(); }
});

module.exports = router;
