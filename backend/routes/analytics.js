const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const { authMiddleware, adminOnly, creatorOrAdmin } = require('../middleware/auth');

// Admin global analytics
router.get('/admin', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [userStats] = await db.query(`
      SELECT
        COUNT(*) AS total_users,
        COALESCE(SUM(role='admin'), 0)      AS admins,
        COALESCE(SUM(role='creator'), 0)    AS creators,
        COALESCE(SUM(role='respondent'), 0) AS respondents
      FROM users`);
    const [formStats] = await db.query(`
      SELECT
        COALESCE(COUNT(*), 0)                                                         AS total_forms,
        COALESCE(SUM(CASE WHEN is_template=0 THEN 1 ELSE 0 END), 0)                  AS active_forms,
        COALESCE(SUM(CASE WHEN is_template=1 THEN 1 ELSE 0 END), 0)                  AS templates,
        (SELECT COALESCE(COUNT(*), 0) FROM responses r
         WHERE EXISTS (SELECT 1 FROM form_assignments fa WHERE fa.form_id=r.form_id AND fa.user_id=r.user_id)) AS total_responses,
        (SELECT COALESCE(COUNT(*), 0) FROM form_assignments WHERE status='completed') AS completed_assignments
      FROM forms`);
    const [creators] = await db.query(`
      SELECT u.id, u.name, u.email,
        COALESCE(COUNT(DISTINCT f.id), 0)  AS forms_created,
        COALESCE(COUNT(DISTINCT r.id), 0)  AS responses_received
      FROM users u
      LEFT JOIN forms f ON f.creator_id=u.id AND f.is_template=0
      LEFT JOIN responses r ON r.form_id=f.id
        AND EXISTS (SELECT 1 FROM form_assignments fa2 WHERE fa2.form_id=r.form_id AND fa2.user_id=r.user_id)
      WHERE u.role='creator'
      GROUP BY u.id, u.name, u.email ORDER BY forms_created DESC`);
    const [respondents] = await db.query(`
      SELECT u.id, u.name, u.email,
        COALESCE(COUNT(DISTINCT fa.form_id), 0) AS forms_assigned,
        COALESCE(COUNT(DISTINCT r.id), 0)       AS responses_submitted,
        COALESCE(SUM(fa.status='completed'), 0) AS completed
      FROM users u
      LEFT JOIN form_assignments fa ON fa.user_id=u.id
      LEFT JOIN responses r ON r.user_id=u.id AND r.form_id=fa.form_id
      WHERE u.role='respondent'
      GROUP BY u.id, u.name, u.email ORDER BY u.name`);
    const [logs] = await db.query(`
      SELECT al.*, u.name AS user_name, f.title AS form_title
      FROM activity_logs al
      JOIN users u ON al.user_id=u.id
      LEFT JOIN forms f ON al.form_id=f.id
      ORDER BY al.created_at DESC LIMIT 60`);
    res.json({
      userStats:   userStats[0]  || { total_users:0, admins:0, creators:0, respondents:0 },
      formStats:   formStats[0]  || { total_forms:0, active_forms:0, templates:0, total_responses:0, completed_assignments:0 },
      creators:    creators  || [],
      respondents: respondents || [],
      logs:        logs || []
    });
  } catch (err) {
    console.error('Admin analytics error:', err);
    res.status(500).json({ message: 'Server error', detail: err.message });
  }
});

// Creator analytics — uses form_assignments.status which reflects actual work state
// After due_date extension, status stays as-is (which is correct — it reflects work done)
router.get('/overview', authMiddleware, creatorOrAdmin, async (req, res) => {
  try {
    const cid = req.user.id;

    // Use separate subqueries to avoid Cartesian product between fa and r joins
    const [stats] = await db.query(`
      SELECT
        COALESCE(COUNT(DISTINCT f.id), 0)                                           AS total_forms,
        COALESCE(COUNT(DISTINCT fa.id), 0)                                          AS total_assignees,
        (SELECT COALESCE(COUNT(DISTINCT r.id),0) FROM responses r
         JOIN forms f2 ON r.form_id=f2.id
         WHERE f2.creator_id=? AND f2.is_template=0
         AND EXISTS (SELECT 1 FROM form_assignments fa2 WHERE fa2.form_id=r.form_id AND fa2.user_id=r.user_id)) AS total_responses,
        COALESCE(SUM(fa.status='completed'), 0)                                     AS completed,
        COALESCE(SUM(fa.status='review'), 0)                                        AS in_review,
        COALESCE(SUM(fa.status='attention'), 0)                                     AS needs_attention
      FROM forms f
      LEFT JOIN form_assignments fa ON f.id=fa.form_id
      WHERE f.creator_id=? AND f.is_template=0`, [cid, cid]);

    // Per-form breakdown — keep responses count separate to avoid cross-join inflation
    const [forms] = await db.query(`
      SELECT f.id, f.title, f.status, f.due_date, f.created_at,
        COALESCE(COUNT(DISTINCT fa.id), 0)             AS assigned,
        COALESCE(SUM(fa.status='completed'), 0)        AS completed,
        COALESCE(SUM(fa.status='review'), 0)           AS in_review,
        COALESCE(SUM(fa.status='not_started'), 0)      AS not_started,
        COALESCE(SUM(fa.status='attention'), 0)        AS attention,
        (SELECT COALESCE(COUNT(DISTINCT r.id),0) FROM responses r
         WHERE r.form_id=f.id
         AND EXISTS (SELECT 1 FROM form_assignments fa2 WHERE fa2.form_id=r.form_id AND fa2.user_id=r.user_id)) AS responses
      FROM forms f
      LEFT JOIN form_assignments fa ON f.id=fa.form_id
      WHERE f.creator_id=? AND f.is_template=0
      GROUP BY f.id, f.title, f.status, f.due_date, f.created_at
      ORDER BY f.created_at DESC LIMIT 20`, [cid]);

    const [logs] = await db.query(`
      SELECT al.*, u.name AS user_name, f.title AS form_title
      FROM activity_logs al JOIN users u ON al.user_id=u.id LEFT JOIN forms f ON al.form_id=f.id
      WHERE f.creator_id=?
      ORDER BY al.created_at DESC LIMIT 50`, [cid]);

    res.json({
      stats:     stats[0] || { total_forms:0, total_assignees:0, total_responses:0, completed:0, in_review:0, needs_attention:0 },
      forms:     forms || [],
      auditLogs: logs || []
    });
  } catch (err) {
    console.error('Creator analytics error:', err);
    res.status(500).json({ message: 'Server error', detail: err.message });
  }
});

module.exports = router;