const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  buildSafeTask,
  isTaskPlayable,
  mapFormat,
  normalizeDifficulty,
  verifyAnswer,
} = require('../src/lib/puzzleEngine');

test('mapFormat normalizes common aliases', () => {
  assert.equal(mapFormat('Parenthesis Matching'), 'multiple_choice');
  assert.equal(mapFormat('Logic Error Detection'), 'debug');
  assert.equal(mapFormat('Code Completion'), 'drag_and_fill');
});

test('normalizeDifficulty supports variant labels', () => {
  assert.equal(normalizeDifficulty('LEETCODE_EASY'), 'hard');
  assert.equal(normalizeDifficulty('medium'), 'medium');
  assert.equal(normalizeDifficulty('HARD'), 'hard');
});

test('buildSafeTask derives options for parenthesis-style multiple choice', () => {
  const rawTask = {
    id: 't_parenthesis',
    title: 'Parenthesis',
    description: 'Pick the wrong line',
    format: 'Parenthesis Matching',
    difficulty: 'easy',
    versions: {
      python: {
        code: 'A: print((1+2)\nB: print((1+2))\nC: print(1+2)',
        answer: 'A',
      },
    },
  };

  const safeTask = buildSafeTask(rawTask, { shuffleRearrange: false });
  assert.equal(safeTask.format, 'multiple_choice');
  assert.equal(safeTask.versions.python.options.length, 3);
});

test('buildSafeTask falls back drag_and_fill to fill_blank when options are missing', () => {
  const rawTask = {
    id: 't_completion',
    title: 'Completion',
    description: 'Complete code',
    format: 'Code Completion',
    difficulty: 'easy',
    versions: {
      python: {
        code: 'x = __',
        answer: '1',
      },
    },
  };

  const safeTask = buildSafeTask(rawTask, { shuffleRearrange: false });
  assert.equal(safeTask.format, 'fill_blank');
  assert.equal(safeTask.versions.python.blankCode, 'x = _____');
});

test('verifyAnswer accepts label and option-text submissions for multiple choice', () => {
  const rawTask = {
    id: 't_mcq',
    title: 'MCQ',
    description: 'Choose one',
    format: 'Parenthesis Matching',
    difficulty: 'easy',
    versions: {
      python: {
        code: 'A: bad\nB: good\nC: also good',
        answer: 'A',
      },
    },
  };

  const byLabel = verifyAnswer(rawTask, {
    activeLang: 'python',
    userAnswer: 'A',
  });
  const byOptionText = verifyAnswer(rawTask, {
    activeLang: 'python',
    userAnswer: 'A: bad',
  });

  assert.equal(byLabel.status, 'correct');
  assert.equal(byOptionText.status, 'correct');
});

test('verifyAnswer grades rearrange using submitted ordered lines', () => {
  const rawTask = {
    id: 't_rearrange',
    title: 'Rearrange',
    description: 'Order lines',
    format: 'Code Reordering',
    difficulty: 'easy',
    versions: {
      python: {
        code: 'line 1\nline 2\nline 3',
        answer: 'line 1, line 2, line 3',
      },
    },
  };

  const correct = verifyAnswer(rawTask, {
    activeLang: 'python',
    rearrangedLines: ['line 1', 'line 2', 'line 3'],
  });
  const incorrect = verifyAnswer(rawTask, {
    activeLang: 'python',
    rearrangedLines: ['line 3', 'line 2', 'line 1'],
  });

  assert.equal(correct.status, 'correct');
  assert.equal(incorrect.status, 'incorrect');
});

test('verifyAnswer handles extracted debug snippets from explanatory answers', () => {
  const rawTask = {
    id: 't_debug',
    title: 'Debug',
    description: 'Fix bug',
    format: 'Logic Error Detection',
    difficulty: 'easy',
    versions: {
      python: {
        code: 'for i in range(0, 5):\n  print(i)',
        answer: 'Should be range(1, 6) to print 1..5.',
      },
    },
  };

  const result = verifyAnswer(rawTask, {
    activeLang: 'python',
    userAnswer: 'range(1, 6)',
  });

  assert.equal(result.status, 'correct');
});

test('verifyAnswer reports unparseable task shapes', () => {
  const rawTask = {
    id: 't_unparseable',
    title: 'Broken task',
    description: 'No answer key',
    format: 'Code Completion',
    difficulty: 'easy',
    versions: {
      python: {
        code: '',
      },
    },
  };

  const result = verifyAnswer(rawTask, {
    activeLang: 'python',
    userAnswer: 'something',
  });

  assert.equal(result.status, 'unparseable');
});

test('project puzzle bank still has playable tasks for all runtime difficulty buckets', () => {
  const puzzlePath = path.join(__dirname, '..', 'src', 'data', 'puzzles.json');
  const raw = JSON.parse(fs.readFileSync(puzzlePath, 'utf8'));
  const playable = raw.filter(isTaskPlayable);

  const bucketCounts = { easy: 0, medium: 0, hard: 0 };
  playable.forEach(task => {
    bucketCounts[normalizeDifficulty(task.difficulty)] += 1;
  });

  assert.ok(playable.length > 0, 'Expected at least one playable task');
  assert.ok(bucketCounts.easy === 0, 'Expected easy bucket to be empty because leetcode_easy normalizes to hard');
  assert.ok(bucketCounts.medium > 0, 'Expected at least one medium task');
  assert.ok(bucketCounts.hard > 0, 'Expected at least one hard task');
});

test('all puzzle-language variants are parseable by verifier', () => {
  const puzzlePath = path.join(__dirname, '..', 'src', 'data', 'puzzles.json');
  const raw = JSON.parse(fs.readFileSync(puzzlePath, 'utf8'));

  const unparseable = [];
  for (const task of raw) {
    for (const lang of ['python', 'java', 'c']) {
      if (!task.versions?.[lang]) continue;

      const result = verifyAnswer(task, {
        activeLang: lang,
        userAnswer: '',
        fillState: {},
        dragOrder: [],
      });

      if (result.status === 'unparseable') {
        unparseable.push({ id: task.id, lang, reason: result.reason || 'unknown' });
      }
    }
  }

  assert.equal(
    unparseable.length,
    0,
    `Expected all puzzle-language variants to be parseable, found: ${JSON.stringify(unparseable)}`,
  );
});
