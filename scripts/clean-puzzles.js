const fs = require('fs');
const path = require('path');
const { mapFormat, normalizeDifficulty, isTaskPlayable } = require('../src/lib/puzzleEngine');

const LANGUAGES = ['python', 'java', 'c'];
const ALLOWED_FORMATS = new Set(['output_prediction', 'multiple_choice']);
const PROMPT_FIELDS = ['code', 'codeTemplate', 'buggyCode', 'question', 'options', 'tokens', 'lines', 'blankCount', 'shuffleOnServe'];
const EVAL_FIELDS = ['correctAnswer', 'acceptedAnswers', 'correctOrder', 'expectedStdout', 'solutionCode'];

function pickFields(source, fields) {
  const out = {};
  fields.forEach((field) => {
    if (source && source[field] !== undefined) out[field] = source[field];
  });
  return out;
}

function selectInputPath() {
  const source = path.join(__dirname, '..', 'data', 'puzzles.json');
  if (!fs.existsSync(source)) {
    throw new Error('No puzzle source found (expected data/puzzles.json).');
  }
  return source;
}

function normalizeVersion(rawVersion) {
  if (!rawVersion || typeof rawVersion !== 'object') return null;

  const prompt = rawVersion.prompt && typeof rawVersion.prompt === 'object'
    ? pickFields(rawVersion.prompt, PROMPT_FIELDS)
    : pickFields(rawVersion, PROMPT_FIELDS);

  const evaluation = rawVersion.evaluation && typeof rawVersion.evaluation === 'object'
    ? pickFields(rawVersion.evaluation, EVAL_FIELDS)
    : pickFields(rawVersion, EVAL_FIELDS);

  return {
    prompt,
    evaluation,
  };
}

function normalizeTask(rawTask) {
  if (!rawTask || typeof rawTask !== 'object') return null;

  const versions = {};
  LANGUAGES.forEach((lang) => {
    const normalized = normalizeVersion(rawTask.versions?.[lang]);
    if (normalized) versions[lang] = normalized;
  });

  if (Object.keys(versions).length === 0) return null;

  const id = String(rawTask.id || '').trim();
  if (!id) return null;

  return {
    id,
    difficulty: normalizeDifficulty(rawTask.difficulty),
    format: mapFormat(rawTask.format),
    title: String(rawTask.title || 'Task').trim(),
    description: String(rawTask.description || '').trim(),
    versions,
  };
}

function cleanPuzzles(options = {}) {
  const inputPath = options.inputPath || selectInputPath();
  const outputPath = options.outputPath || path.join(__dirname, '..', 'data', 'puzzles.json');

  const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const source = Array.isArray(raw) ? raw : [];

  const cleaned = [];
  const removed = [];
  const seenIds = new Set();

  source.forEach((task, index) => {
    const normalized = normalizeTask(task);

    if (!normalized) {
      removed.push({ id: task?.id || `index:${index}`, reason: 'invalid_structure' });
      return;
    }

    if (seenIds.has(normalized.id)) {
      removed.push({ id: normalized.id, reason: 'duplicate_id' });
      return;
    }
    seenIds.add(normalized.id);

    if (!ALLOWED_FORMATS.has(normalized.format)) {
      removed.push({ id: normalized.id, reason: `unsupported_format:${normalized.format}` });
      return;
    }

    if (!isTaskPlayable(normalized)) {
      removed.push({ id: normalized.id, reason: 'unplayable_or_illogical' });
      return;
    }

    cleaned.push(normalized);
  });

  cleaned.sort((a, b) => Number(a.id) - Number(b.id));

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(cleaned, null, 2), 'utf8');

  const counts = cleaned.reduce((acc, task) => {
    acc[task.difficulty] = (acc[task.difficulty] || 0) + 1;
    return acc;
  }, { easy: 0, medium: 0, hard: 0 });

  console.log(`[clean-puzzles] Source: ${path.relative(process.cwd(), inputPath)}`);
  console.log(`[clean-puzzles] Output: ${path.relative(process.cwd(), outputPath)}`);
  console.log(`[clean-puzzles] Kept: ${cleaned.length}, Removed: ${removed.length}`);
  console.log(`[clean-puzzles] Difficulty counts: easy=${counts.easy}, medium=${counts.medium}, hard=${counts.hard}`);

  if (removed.length > 0) {
    console.log('[clean-puzzles] Removed sample:', removed.slice(0, 20));
  }

  return { cleaned, removed, counts };
}

if (require.main === module) {
  cleanPuzzles();
}

module.exports = {
  cleanPuzzles,
};
