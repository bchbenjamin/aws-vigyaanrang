/**
 * strip-answers.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads src/data/puzzles.json (which contains correct answers),
 * strips all answer-related fields, and writes the result to
 * src/data/puzzles-safe.json which is safe to bundle with the React client.
 *
 * Run automatically via `prebuild` and `predev` npm scripts.
 */

const fs   = require('fs');
const path = require('path');
const { buildSafeTask } = require('../src/lib/puzzleEngine');

const SRC  = path.join(__dirname, '../src/data/puzzles.json');
const DEST = path.join(__dirname, '../src/data/puzzles-safe.json');

const raw   = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const puzzles = Array.isArray(raw) ? raw : (raw.puzzles || raw.tasks || Object.values(raw)[0] || []);
const safe  = puzzles
  .map(p => buildSafeTask(p, { shuffleRearrange: true }))
  .filter(Boolean);

fs.writeFileSync(DEST, JSON.stringify(safe, null, 2), 'utf8');
console.log(`[strip-answers] Wrote ${safe.length} puzzles -> ${path.relative(process.cwd(), DEST)}`);
