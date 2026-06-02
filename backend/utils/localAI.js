/**
 * QueryCraft Local AI Model
 * TF-IDF + Keyword Phrase Matching — no API calls, ~100ms startup
 */

const path = require('path');
const fs   = require('fs');

// ── Stop Words ────────────────────────────────────────────────────────────────
const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'by','from','is','are','was','were','be','been','being','have','has',
  'had','do','does','did','will','would','could','should','may','might',
  'i','we','you','he','she','it','they','this','that','these','those',
  'my','our','your','his','her','its','their','about','how','what','which',
  'who','when','where','why','not','no','can','if','as','its','some'
]);

// ── TF-IDF Engine ─────────────────────────────────────────────────────────────
class TFIDFModel {
  constructor() {
    this.categories  = [];
    this.vocabulary  = new Map();
    this.idfScores   = [];
    this.tfidfMatrix = [];
    this.trained     = false;
  }

  tokenize(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1 && !STOP_WORDS.has(w));
  }

  termFreq(tokens) {
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    for (const [w, c] of tf) tf.set(w, c / tokens.length);
    return tf;
  }

  train(dataset) {
    this.categories = dataset.categories;
    const N = this.categories.length;

    const docs = this.categories.map(cat => {
      const words = [
        ...cat.keywords,
        cat.survey.title,
        cat.survey.description,
        ...cat.survey.sections.map(s => s.title + ' ' + s.description)
      ].join(' ');
      return this.tokenize(words);
    });

    const vocabSet = new Set();
    for (const doc of docs) doc.forEach(w => vocabSet.add(w));
    let idx = 0;
    for (const word of vocabSet) this.vocabulary.set(word, idx++);

    this.idfScores = new Array(this.vocabulary.size).fill(0);
    for (const [word, widx] of this.vocabulary) {
      const df = docs.filter(doc => doc.includes(word)).length;
      this.idfScores[widx] = df > 0 ? Math.log((N + 1) / (df + 1)) + 1 : 1;
    }

    this.tfidfMatrix = docs.map(doc => {
      const tf  = this.termFreq(doc);
      const vec = new Float32Array(this.vocabulary.size);
      for (const [word, tfVal] of tf) {
        const widx = this.vocabulary.get(word);
        if (widx !== undefined) vec[widx] = tfVal * this.idfScores[widx];
      }
      return vec;
    });

    this.trained = true;
    console.log(`✅ Local AI model trained: ${N} categories, ${this.vocabulary.size} vocab terms`);
  }

  cosineSim(vecA, vecB) {
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot  += vecA[i] * vecB[i];
      magA += vecA[i] * vecA[i];
      magB += vecB[i] * vecB[i];
    }
    if (magA === 0 || magB === 0) return 0;
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
  }

  /**
   * Keyword phrase matching — scores each category by how many of its
   * keyword phrases appear in the query. Longer phrases score higher.
   * Returns { bestIdx, bestScore } or null if no match.
   */
  keywordMatch(topicLower) {
    let bestScore = 0;
    let bestIdx   = -1;

    for (let i = 0; i < this.categories.length; i++) {
      let score = 0;
      for (const kw of this.categories[i].keywords) {
        if (topicLower.includes(kw.toLowerCase())) {
          // Longer keyword phrase = higher confidence score
          score += kw.split(' ').length * 2;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestIdx   = i;
      }
    }

    if (bestIdx === -1 || bestScore === 0) return null;
    return { idx: bestIdx, score: bestScore };
  }

  match(topic) {
    if (!this.trained) throw new Error('Model not trained');
    const topicLower = topic.toLowerCase().trim();
    if (!topicLower) return null;

    // ── Step 1: Keyword phrase matching (most accurate) ────────────────────
    const kwResult = this.keywordMatch(topicLower);
    if (kwResult) {
      return {
        category: this.categories[kwResult.idx],
        score:    1.0,
        matched:  'keyword'
      };
    }

    // ── Step 2: TF-IDF cosine similarity (semantic fallback) ──────────────
    const tokens = this.tokenize(topic);
    if (tokens.length === 0) return null;

    const tf   = this.termFreq(tokens);
    const qVec = new Float32Array(this.vocabulary.size);
    for (const [word, tfVal] of tf) {
      const widx = this.vocabulary.get(word);
      if (widx !== undefined) qVec[widx] = tfVal * this.idfScores[widx];
    }

    let bestScore = -1, bestIdx = -1;
    for (let i = 0; i < this.tfidfMatrix.length; i++) {
      const s = this.cosineSim(qVec, this.tfidfMatrix[i]);
      if (s > bestScore) { bestScore = s; bestIdx = i; }
    }

    const THRESHOLD = 0.05;
    if (bestScore < THRESHOLD || bestIdx === -1) return null;

    return {
      category: this.categories[bestIdx],
      score:    bestScore,
      matched:  'tfidf'
    };
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────
const model   = new TFIDFModel();
let   dataset = null;

function loadAndTrain() {
  const dataPath = path.join(__dirname, '../data/survey_dataset.json');
  dataset        = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  model.train(dataset);
}

const startMs = Date.now();
loadAndTrain();
console.log(`⚡ Local AI ready in ${Date.now() - startMs}ms`);

// ── Public API ────────────────────────────────────────────────────────────────
function generateSurvey(topic) {
  const result = model.match(topic);

  if (!result) {
    const def       = JSON.parse(JSON.stringify(dataset.default_survey));
    def.title       = `${capitalize(topic)} Survey`;
    def.description = `Share your thoughts and feedback about ${topic}.`;
    return { ...def, _model: 'local-default', _confidence: 0 };
  }

  const survey = JSON.parse(JSON.stringify(result.category.survey));
  return {
    ...survey,
    _model:      'local-tfidf',
    _confidence: Math.round(result.score * 100),
    _matched:    result.matched,
    _category:   result.category.id
  };
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

module.exports = { generateSurvey };
