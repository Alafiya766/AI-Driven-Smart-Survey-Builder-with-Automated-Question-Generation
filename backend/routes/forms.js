const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authMiddleware, adminOnly, creatorOrAdmin } = require('../middleware/auth');

/* ─── Dashboard stats ─────────────────────────────────────── */
router.get('/dashboard-stats', authMiddleware, async (req, res) => {
  try {
    const role = req.user.role;

    if (role === 'admin') {
      const [s2] = await db.query(`
        SELECT
          (SELECT COALESCE(COUNT(*),0) FROM users WHERE role='creator')    AS total_creators,
          (SELECT COALESCE(COUNT(*),0) FROM users WHERE role='respondent') AS total_respondents,
          (SELECT COALESCE(COUNT(*),0) FROM forms WHERE is_template=0)     AS total_forms,
          (SELECT COALESCE(COUNT(*),0) FROM responses r
          WHERE EXISTS (SELECT 1 FROM form_assignments fa WHERE fa.form_id=r.form_id AND fa.user_id=r.user_id)) AS total_responses,
          (SELECT COALESCE(COUNT(*),0) FROM form_assignments WHERE status='completed') AS completed,
          (SELECT COALESCE(COUNT(*),0) FROM form_assignments WHERE status='review')    AS in_review,
          (SELECT COALESCE(COUNT(*),0) FROM form_assignments WHERE status='attention') AS attention`);
      const [recentActivity] = await db.query(`
        SELECT al.*,u.name AS user_name,f.title AS form_title
        FROM activity_logs al JOIN users u ON al.user_id=u.id LEFT JOIN forms f ON al.form_id=f.id
        ORDER BY al.created_at DESC LIMIT 20`);
      const [topForms] = await db.query(`
        SELECT f.id, f.title, u.name AS creator_name,
          COALESCE(COUNT(DISTINCT fa.user_id), 0) AS assigned,
          COALESCE((
            SELECT COUNT(DISTINCT r.id) FROM responses r
            WHERE r.form_id = f.id
            AND EXISTS (SELECT 1 FROM form_assignments fa2 WHERE fa2.form_id=r.form_id AND fa2.user_id=r.user_id)
          ), 0) AS responses,
          COALESCE(SUM(fa.status='completed'), 0) AS completed
        FROM forms f
        LEFT JOIN users u ON f.creator_id=u.id
        LEFT JOIN form_assignments fa ON f.id=fa.form_id
        WHERE f.is_template=0
        GROUP BY f.id, f.title, u.name
        ORDER BY responses DESC LIMIT 8`);
      return res.json({ stats: s2[0] || {}, recentActivity: recentActivity || [], topForms: topForms || [] });
    }

    if (role === 'creator') {
      const [stats] = await db.query(`
        SELECT
          COALESCE(SUM(fa.status='not_started'),0) AS not_started,
          COALESCE(SUM(fa.status='attention'),0)   AS attention,
          COALESCE(SUM(fa.status='in_progress'),0) AS in_progress,
          COALESCE(SUM(fa.status='review'),0)      AS review,
          COALESCE(SUM(fa.status='completed'),0)   AS completed
        FROM forms f JOIN form_assignments fa ON f.id=fa.form_id
        WHERE f.creator_id=? AND f.is_template=0`, [req.user.id]);
      const [deadlines] = await db.query(`
        SELECT DISTINCT f.id,f.title,f.due_date,fa.status,u.name AS assignee_name
        FROM forms f JOIN form_assignments fa ON f.id=fa.form_id JOIN users u ON fa.user_id=u.id
        WHERE f.creator_id=? AND fa.status!='completed' AND f.is_template=0
        ORDER BY f.due_date ASC LIMIT 8`, [req.user.id]);
      /* Revisions: forms sent back to respondents — query by response status 'returned' */
      const [revisions] = await db.query(`
        SELECT f.id, f.title, r.id AS response_id, u.name AS user_name
        FROM responses r
        JOIN forms f ON r.form_id=f.id
        JOIN users u ON r.user_id=u.id
        WHERE f.creator_id=? AND r.status='returned'
        ORDER BY r.updated_at DESC`, [req.user.id]);
      const [logs] = await db.query(`
        SELECT al.*,u.name AS user_name,f.title AS form_title
        FROM activity_logs al JOIN users u ON al.user_id=u.id LEFT JOIN forms f ON al.form_id=f.id
        WHERE f.creator_id=? ORDER BY al.created_at DESC LIMIT 15`, [req.user.id]);
      return res.json({ stats: stats[0] || {}, deadlines: deadlines || [], revisions: revisions || [], logs: logs || [] });
    }

    // respondent — stats based on actual response status, not just assignment status
    // This handles the case where due_date was extended after filling
    const [stats] = await db.query(`
      SELECT
        COALESCE(SUM(CASE WHEN fa.status='not_started' THEN 1 ELSE 0 END),0) AS not_started,
        COALESCE(SUM(CASE WHEN fa.status='attention'   THEN 1 ELSE 0 END),0) AS attention,
        COALESCE(SUM(CASE WHEN fa.status='in_progress' THEN 1 ELSE 0 END),0) AS in_progress,
        COALESCE(SUM(CASE WHEN fa.status='review'      THEN 1 ELSE 0 END),0) AS review,
        COALESCE(SUM(CASE WHEN fa.status='completed'   THEN 1 ELSE 0 END),0) AS completed
      FROM form_assignments fa
      JOIN forms f ON fa.form_id = f.id
      WHERE fa.user_id=? AND f.is_template=0`, [req.user.id]);
    const [deadlines] = await db.query(`
      SELECT f.id,f.title,f.due_date,fa.status
      FROM forms f JOIN form_assignments fa ON f.id=fa.form_id
      WHERE fa.user_id=? AND fa.status NOT IN ('completed')
      ORDER BY f.due_date ASC LIMIT 8`, [req.user.id]);
    /* Revisions for respondent: their responses that were sent back */
    const [revisions] = await db.query(`
      SELECT f.id, f.title, r.id AS response_id
      FROM responses r
      JOIN forms f ON r.form_id=f.id
      WHERE r.user_id=? AND r.status='returned'
      ORDER BY r.updated_at DESC`, [req.user.id]);
    const [logs] = await db.query(`
      SELECT al.*,u.name AS user_name,f.title AS form_title
      FROM activity_logs al JOIN users u ON al.user_id=u.id LEFT JOIN forms f ON al.form_id=f.id
      WHERE al.user_id=? ORDER BY al.created_at DESC LIMIT 15`, [req.user.id]);
    res.json({ stats: stats[0] || {}, deadlines: deadlines || [], revisions: revisions || [], logs: logs || [] });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

/* ─── Drafts list (creator only) ─────────────────────────── */
router.get('/drafts', authMiddleware, creatorOrAdmin, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT f.*,
        COALESCE(COUNT(DISTINCT fa.user_id),0) AS assigned_count,
        COALESCE(COUNT(DISTINCT r.id),0)       AS response_count
      FROM forms f
      LEFT JOIN form_assignments fa ON f.id=fa.form_id
      LEFT JOIN responses r ON f.id=r.form_id
      WHERE f.creator_id=? AND f.status='draft' AND f.is_template=0
      GROUP BY f.id ORDER BY f.updated_at DESC`, [req.user.id]);
    res.json(rows || []);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

/* ─── Action-required (respondent) — excludes expired forms ── */
router.get('/action-required', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT f.*,u.name AS creator_name,fa.status AS assignment_status
      FROM forms f JOIN form_assignments fa ON f.id=fa.form_id JOIN users u ON f.creator_id=u.id
      WHERE fa.user_id=? AND fa.status IN ('not_started','attention') AND f.is_template=0
      ORDER BY f.due_date ASC`, [req.user.id]);
    res.json(rows || []);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

/* ─── List forms ──────────────────────────────────────────── */
router.get('/', authMiddleware, async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      const [rows] = await db.query(`
        SELECT f.*, u.name AS creator_name,
          COALESCE(COUNT(DISTINCT fa.user_id), 0) AS assigned_count,
          COALESCE((
            SELECT COUNT(DISTINCT r.id) FROM responses r
            WHERE r.form_id = f.id
            AND EXISTS (SELECT 1 FROM form_assignments fa2 WHERE fa2.form_id=r.form_id AND fa2.user_id=r.user_id)
          ), 0) AS response_count
        FROM forms f
        LEFT JOIN users u ON f.creator_id=u.id
        LEFT JOIN form_assignments fa ON f.id=fa.form_id
        WHERE f.is_template=0
        GROUP BY f.id ORDER BY f.created_at DESC`);
      return res.json(rows || []);
    }
    if (req.user.role === 'creator') {
      /* FIX: response_count now only counts responses from currently assigned users.
         Previously used a plain LEFT JOIN responses which included responses from
         users who were later removed as assignees, showing stale counts. */
      const [rows] = await db.query(`
        SELECT f.*, u.name AS creator_name,
          COALESCE(COUNT(DISTINCT fa.user_id), 0) AS assigned_count,
          COALESCE((
            SELECT COUNT(DISTINCT r.id) FROM responses r
            WHERE r.form_id = f.id
            AND EXISTS (SELECT 1 FROM form_assignments fa2 WHERE fa2.form_id=r.form_id AND fa2.user_id=r.user_id)
          ), 0) AS response_count
        FROM forms f
        LEFT JOIN users u ON f.creator_id=u.id
        LEFT JOIN form_assignments fa ON f.id=fa.form_id
        WHERE f.creator_id=? AND f.is_template=0 AND f.status='active'
        GROUP BY f.id ORDER BY f.created_at DESC`, [req.user.id]);
      return res.json(rows || []);
    }
    // respondent — show all assigned forms regardless of due date
    const [rows] = await db.query(`
      SELECT f.*,u.name AS creator_name,fa.status AS assignment_status
      FROM forms f JOIN form_assignments fa ON f.id=fa.form_id JOIN users u ON f.creator_id=u.id
      WHERE fa.user_id=? AND f.is_template=0 ORDER BY f.created_at DESC`, [req.user.id]);
    res.json(rows || []);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

/* ─── Single form ─────────────────────────────────────────── */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const [forms] = await db.query(
      'SELECT f.*,u.name AS creator_name FROM forms f JOIN users u ON f.creator_id=u.id WHERE f.id=?',
      [req.params.id]);
    if (!forms.length) return res.status(404).json({ message: 'Form not found' });
    const form = forms[0];
    const [sections] = await db.query('SELECT * FROM sections WHERE form_id=? ORDER BY position', [form.id]);
    for (const sec of sections) {
      const [qs] = await db.query('SELECT * FROM questions WHERE section_id=? ORDER BY position', [sec.id]);
      sec.questions = qs;
    }
    form.sections = sections;
    const [asgn] = await db.query(
      'SELECT fa.*,u.name AS user_name,u.email FROM form_assignments fa JOIN users u ON fa.user_id=u.id WHERE fa.form_id=?',
      [form.id]);
    form.assignments = asgn;
    res.json(form);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

/* ─── Create form ─────────────────────────────────────────── */
router.post('/', authMiddleware, creatorOrAdmin, async (req, res) => {
  const { title, description, due_date, assignees, sections, is_template, status } = req.body;
  if (!title) return res.status(400).json({ message: 'Title required' });
  const formStatus = status || 'draft';
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const cleanDueDate = due_date ? due_date.split('T')[0] : null;
    const [r] = await conn.query(
      'INSERT INTO forms (title,description,creator_id,due_date,is_template,status) VALUES (?,?,?,?,?,?)',
      [title, description || '', req.user.id, cleanDueDate, is_template ? 1 : 0, formStatus]);
    const formId = r.insertId;
    if (sections?.length) {
      for (let si = 0; si < sections.length; si++) {
        const s = sections[si];
        const [sr] = await conn.query(
          'INSERT INTO sections (form_id,title,description,position) VALUES (?,?,?,?)',
          [formId, s.title, s.description || '', si]);
        if (s.questions?.length) {
          for (let qi = 0; qi < s.questions.length; qi++) {
            const q = s.questions[qi];
            const opts = Array.isArray(q.options) ? q.options : (typeof q.options === 'string' ? JSON.parse(q.options || '[]') : []);
            await conn.query(
              'INSERT INTO questions (section_id,question_text,question_type,options,is_required,position) VALUES (?,?,?,?,?,?)',
              [sr.insertId, q.question_text, q.question_type, JSON.stringify(opts), q.is_required ? 1 : 0, qi]);
          }
        }
      }
    }
    if (!is_template && formStatus === 'active' && assignees?.length) {
      for (const uid of assignees)
        await conn.query('INSERT IGNORE INTO form_assignments (form_id,user_id) VALUES (?,?)', [formId, uid]);
      await conn.query(
        'INSERT INTO activity_logs (form_id,user_id,action,note) VALUES (?,?,?,?)',
        [formId, req.user.id, 'Form created and assigned', `Assigned to ${assignees.length} user(s)`]);
    } else if (!is_template && formStatus === 'draft') {
      await conn.query(
        'INSERT INTO activity_logs (form_id,user_id,action,note) VALUES (?,?,?,?)',
        [formId, req.user.id, 'Form saved as draft', null]);
    }
    await conn.commit();
    res.status(201).json({ message: 'Form created', id: formId, status: formStatus });
  } catch (err) {
    await conn.rollback(); console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally { conn.release(); }
});

/* ─── Update form ─────────────────────────────────────────── */
router.put('/:id', authMiddleware, creatorOrAdmin, async (req, res) => {
  const { title, description, due_date, assignees, sections, status } = req.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const checkWhere = req.user.role === 'admin' ? 'WHERE id=?' : 'WHERE id=? AND creator_id=?';
    const checkArgs = req.user.role === 'admin' ? [req.params.id] : [req.params.id, req.user.id];
    const [existing] = await conn.query(`SELECT id, status FROM forms ${checkWhere}`, checkArgs);
    if (!existing.length) {
      await conn.rollback();
      return res.status(404).json({ message: 'Form not found or access denied' });
    }
    const cleanDueDate = due_date ? due_date.split('T')[0] : null;
    if (status) {
      await conn.query(
        `UPDATE forms SET title=?,description=?,due_date=?,status=?,updated_at=NOW() WHERE id=?`,
        [title, description || '', cleanDueDate, status, req.params.id]);
    } else {
      await conn.query(
        `UPDATE forms SET title=?,description=?,due_date=?,updated_at=NOW() WHERE id=?`,
        [title, description || '', cleanDueDate, req.params.id]);
    }

    if (sections !== undefined) {
      await conn.query('DELETE FROM sections WHERE form_id=?', [req.params.id]);
      if (sections?.length) {
        for (let si = 0; si < sections.length; si++) {
          const s = sections[si];
          const [sr] = await conn.query(
            'INSERT INTO sections (form_id,title,description,position) VALUES (?,?,?,?)',
            [req.params.id, s.title, s.description || '', si]);
          if (s.questions?.length) {
            for (let qi = 0; qi < s.questions.length; qi++) {
              const q = s.questions[qi];
              const opts = Array.isArray(q.options) ? q.options : (typeof q.options === 'string' ? JSON.parse(q.options || '[]') : []);
              await conn.query(
                'INSERT INTO questions (section_id,question_text,question_type,options,is_required,position) VALUES (?,?,?,?,?,?)',
                [sr.insertId, q.question_text, q.question_type, JSON.stringify(opts), q.is_required ? 1 : 0, qi]);
            }
          }
        }
      }
    }

    if (assignees !== undefined) {
      // Get current assignees to detect additions and removals
      const [currentAssignees] = await conn.query(
        'SELECT user_id FROM form_assignments WHERE form_id=?', [req.params.id]);
      const currentIds = currentAssignees.map(r => r.user_id);
      const newIds = assignees.map(id => Number(id));

      // Remove assignees that were de-listed
      const toRemove = currentIds.filter(id => !newIds.includes(id));
      for (const uid of toRemove) {
        const [respRows] = await conn.query(
          'SELECT id FROM responses WHERE form_id=? AND user_id=?', [req.params.id, uid]);
        for (const resp of respRows)
          await conn.query('DELETE FROM answers WHERE response_id=?', [resp.id]);
        await conn.query('DELETE FROM responses WHERE form_id=? AND user_id=?', [req.params.id, uid]);
        await conn.query('DELETE FROM form_assignments WHERE form_id=? AND user_id=?', [req.params.id, uid]);
      }

      // Add only NEW assignees — preserve status of existing ones
      const toAdd = newIds.filter(id => !currentIds.includes(id));
      for (const uid of toAdd)
        await conn.query('INSERT IGNORE INTO form_assignments (form_id,user_id) VALUES (?,?)', [req.params.id, uid]);

      if (status === 'active' && existing[0].status === 'draft') {
        await conn.query(
          'INSERT INTO activity_logs (form_id,user_id,action,note) VALUES (?,?,?,?)',
          [req.params.id, req.user.id, 'Draft published and assigned', `Assigned to ${assignees.length} user(s)`]);
      } else if (toAdd.length > 0) {
        await conn.query(
          'INSERT INTO activity_logs (form_id,user_id,action,note) VALUES (?,?,?,?)',
          [req.params.id, req.user.id, 'Assignees updated', `Added ${toAdd.length} new user(s)`]);
      }
    } else if (!assignees && !sections && cleanDueDate) {
      // Pure due_date extension — log it
      await conn.query(
        'INSERT INTO activity_logs (form_id,user_id,action,note) VALUES (?,?,?,?)',
        [req.params.id, req.user.id, 'Due date updated', `New deadline: ${cleanDueDate}`]);
    }

    await conn.commit();
    res.json({ message: 'Form updated', status: status || existing[0].status });
  } catch (err) {
    await conn.rollback(); console.error('Form update error:', err);
    res.status(500).json({ message: 'Server error', detail: err.message });
  } finally { conn.release(); }
});

/* ─── Delete form ─────────────────────────────────────────── */
router.delete('/:id', authMiddleware, creatorOrAdmin, async (req, res) => {
  try {
    const where = req.user.role === 'admin' ? 'WHERE id=?' : 'WHERE id=? AND creator_id=?';
    const args = req.user.role === 'admin' ? [req.params.id] : [req.params.id, req.user.id];
    await db.query(`DELETE FROM forms ${where}`, args);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;