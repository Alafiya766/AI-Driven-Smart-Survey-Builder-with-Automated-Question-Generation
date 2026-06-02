/**
 * QueryCraft AI Route — Local TF-IDF Model (no external API)
 * Replaces external API with instant local model inference.
 */

const express        = require('express');
const router         = express.Router();
const { authMiddleware, creatorOrAdmin } = require('../middleware/auth');
const { generateSurvey } = require('../utils/localAI');

// ── POST /api/ai/generate ─────────────────────────────────────────────────────
router.post('/generate', authMiddleware, creatorOrAdmin, (req, res) => {
  const { topic } = req.body;

  if (!topic || !topic.trim()) {
    return res.status(400).json({ message: 'Topic is required' });
  }

  try {
    const survey = generateSurvey(topic.trim());

    if (!survey.title || !survey.sections || !Array.isArray(survey.sections)) {
      return res.status(500).json({ message: 'Survey generation failed — invalid structure' });
    }

    console.log(`⚡ Survey generated locally for topic: "${topic}" | category: ${survey._category || 'default'} | confidence: ${survey._confidence}%`);
    return res.json(survey);

  } catch (err) {
    console.error('❌ Local AI error:', err.message);
    return res.status(500).json({ message: 'Survey generation failed', error: err.message });
  }
});

// ── GET /api/ai/status ────────────────────────────────────────────────────────
router.get('/status', authMiddleware, (_req, res) => {
  res.json({ model: 'local-tfidf', status: 'ready', message: 'Local AI model is running — no API key needed' });
});

module.exports = router;
