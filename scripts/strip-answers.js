/**
 * strip-answers.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads data/puzzles.json (which contains correct answers),
 * strips all answer-related fields, and writes the result to
 * data/puzzles-safe.json for optional client-side usage.
 *
 * Run automatically via `prebuild` and `predev` npm scripts.
 */

const fs   = require('fs');
const path = require('path');
const { buildSafeTask } = require('../src/lib/puzzleEngine');

const SRC  = path.join(__dirname, '../data/puzzles.json');
const DEST = path.join(__dirname, '../data/puzzles-safe.json');

const raw   = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const puzzles = Array.isArray(raw) ? raw : (raw.puzzles || raw.tasks || Object.values(raw)[0] || []);
const safe  = puzzles
  .map(p => buildSafeTask(p, { shuffleRearrange: true }))
  .filter(Boolean);

fs.writeFileSync(DEST, JSON.stringify(safe, null, 2), 'utf8');
console.log(`[strip-answers] Wrote ${safe.length} puzzles -> ${path.relative(process.cwd(), DEST)}`);
