const fs = require('fs');
const path = require('path');
const { isTaskPlayable, verifyAnswer, mapFormat, normalizeDifficulty } = require('../src/lib/puzzleEngine');

const LANGUAGES = ['python', 'java', 'c'];
const PUZZLE_PATH = path.join(__dirname, '..', 'data', 'puzzles.json');

function validatePuzzles() {
  if (!fs.existsSync(PUZZLE_PATH)) {
    console.error('[validate-puzzles] Missing data/puzzles.json');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(PUZZLE_PATH, 'utf8'));
  if (!Array.isArray(raw)) {
    console.error('[validate-puzzles] data/puzzles.json must contain an array.');
    process.exit(1);
  }

  const issues = [];
  const seen = new Set();

  raw.forEach((task, index) => {
    const ref = task?.id || `index:${index}`;

    if (!task || typeof task !== 'object') {
      issues.push({ ref, issue: 'task_not_object' });
      return;
    }

    if (!task.id) issues.push({ ref, issue: 'missing_id' });
    if (seen.has(task.id)) issues.push({ ref, issue: 'duplicate_id' });
    seen.add(task.id);

    if (normalizeDifficulty(task.difficulty) !== task.difficulty) {
      issues.push({ ref, issue: `non_canonical_difficulty:${task.difficulty}` });
    }

    if (mapFormat(task.format) !== task.format) {
      issues.push({ ref, issue: `non_canonical_format:${task.format}` });
    }

    if (!isTaskPlayable(task)) {
      issues.push({ ref, issue: 'not_playable' });
    }

    LANGUAGES.forEach((lang) => {
      if (!task.versions?.[lang]) return;

      const result = verifyAnswer(task, {
        activeLang: lang,
        userAnswer: '',
        fillState: {},
        dragOrder: [],
      });

      if (result.status === 'unparseable') {
        issues.push({ ref, issue: `unparseable_${lang}:${result.reason || 'unknown'}` });
      }
    });
  });

  const counts = raw.reduce((acc, task) => {
    const key = task.difficulty;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, { easy: 0, medium: 0, hard: 0 });

  console.log(`[validate-puzzles] File: ${path.relative(process.cwd(), PUZZLE_PATH)}`);
  console.log(`[validate-puzzles] Total: ${raw.length}`);
  console.log(`[validate-puzzles] Difficulty counts: easy=${counts.easy}, medium=${counts.medium}, hard=${counts.hard}`);

  if (issues.length > 0) {
    console.error(`[validate-puzzles] Found ${issues.length} issue(s).`);
    console.error('[validate-puzzles] Sample:', issues.slice(0, 30));
    process.exit(1);
  }

  console.log('[validate-puzzles] OK');
}

validatePuzzles();
