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

function makeCanonicalTask(overrides = {}) {
  return {
    id: '1001',
    difficulty: 'easy',
    format: 'multiple_choice',
    title: 'Sample',
    description: 'Sample task',
    versions: {
      python: {
        prompt: {
          question: 'What is printed?',
          code: 'print(2 + 3)',
          options: ['4', '5', '6'],
        },
        evaluation: {
          correctAnswer: '5',
          acceptedAnswers: ['5'],
          solutionCode: 'print(2 + 3)',
          expectedStdout: '5',
        },
      },
      java: {
        prompt: {
          question: 'What is printed?',
          code: 'System.out.println(2 + 3);',
          options: ['4', '5', '6'],
        },
        evaluation: {
          correctAnswer: '5',
          acceptedAnswers: ['5'],
          solutionCode: 'public class Main { public static void main(String[] args) { System.out.println(2 + 3); } }',
          expectedStdout: '5',
        },
      },
      c: {
        prompt: {
          question: 'What is printed?',
          code: 'printf("%d\\n", 2 + 3);',
          options: ['4', '5', '6'],
        },
        evaluation: {
          correctAnswer: '5',
          acceptedAnswers: ['5'],
          solutionCode: '#include <stdio.h>\nint main(void){ printf("%d\\n", 2 + 3); return 0; }',
          expectedStdout: '5',
        },
      },
    },
    ...overrides,
  };
}

test('mapFormat normalizes canonical and legacy aliases', () => {
  assert.equal(mapFormat('multiple_choice'), 'multiple_choice');
  assert.equal(mapFormat('Parenthesis Matching'), 'multiple_choice');
  assert.equal(mapFormat('Logic Error Detection'), 'debug');
  assert.equal(mapFormat('Code Reordering'), 'rearrange');
});

test('normalizeDifficulty supports leetcode style mapping', () => {
  assert.equal(normalizeDifficulty('LEETCODE_EASY'), 'hard');
  assert.equal(normalizeDifficulty('medium'), 'medium');
  assert.equal(normalizeDifficulty('HARD'), 'hard');
});

test('buildSafeTask maps canonical prompt blocks into UI-safe shape', () => {
  const task = makeCanonicalTask();
  const safeTask = buildSafeTask(task, { shuffleRearrange: false });

  assert.equal(safeTask.id, '1001');
  assert.equal(safeTask.format, 'multiple_choice');
  assert.ok(Array.isArray(safeTask.versions.python.options));
  assert.equal(safeTask.versions.python.options.length, 3);
  assert.ok(typeof safeTask.versions.python.question === 'string');
  assert.ok(!('evaluation' in safeTask.versions.python));
});

test('verifyAnswer grades multiple choice canonical tasks', () => {
  const task = makeCanonicalTask();
  const correct = verifyAnswer(task, { activeLang: 'python', userAnswer: '5' });
  const incorrect = verifyAnswer(task, { activeLang: 'python', userAnswer: '4' });

  assert.equal(correct.status, 'correct');
  assert.equal(incorrect.status, 'incorrect');
});

test('verifyAnswer grades drag_and_fill by submitted token order', () => {
  const task = makeCanonicalTask({
    id: '1201',
    format: 'drag_and_fill',
    versions: {
      python: {
        prompt: {
          codeTemplate: 'if a _____ b:\n    print(a)',
          tokens: ['>', '<', '=='],
          blankCount: 1,
        },
        evaluation: {
          correctAnswer: 'a > b',
          correctOrder: ['>'],
          solutionCode: 'a = 3\nb = 1\nif a > b:\n    print(a)',
          expectedStdout: '3',
        },
      },
      java: {
        prompt: {
          codeTemplate: 'if (a _____ b) {\n  System.out.println(a);\n}',
          tokens: ['>', '<', '=='],
          blankCount: 1,
        },
        evaluation: {
          correctAnswer: 'a > b',
          correctOrder: ['>'],
          solutionCode: 'public class Main { public static void main(String[] args) { int a=3,b=1; if (a > b) { System.out.println(a); } } }',
          expectedStdout: '3',
        },
      },
      c: {
        prompt: {
          codeTemplate: 'if (a _____ b) {\n  printf("%d\\n", a);\n}',
          tokens: ['>', '<', '=='],
          blankCount: 1,
        },
        evaluation: {
          correctAnswer: 'a > b',
          correctOrder: ['>'],
          solutionCode: '#include <stdio.h>\nint main(void){ int a=3,b=1; if (a > b) printf("%d\\n", a); return 0; }',
          expectedStdout: '3',
        },
      },
    },
  });

  const correct = verifyAnswer(task, {
    activeLang: 'python',
    fillState: { 0: '>' },
    userAnswer: '',
  });
  const incorrect = verifyAnswer(task, {
    activeLang: 'python',
    fillState: { 0: '<' },
    userAnswer: '',
  });

  assert.equal(correct.status, 'correct');
  assert.equal(incorrect.status, 'incorrect');
});

test('verifyAnswer grades rearrange using submitted ordered lines', () => {
  const task = makeCanonicalTask({
    id: '2002',
    format: 'rearrange',
    versions: {
      python: {
        prompt: {
          lines: ['x = 1', 'y = 2', 'print(x + y)'],
          shuffleOnServe: true,
        },
        evaluation: {
          correctAnswer: '3',
          correctOrder: ['x = 1', 'y = 2', 'print(x + y)'],
          solutionCode: 'x = 1\ny = 2\nprint(x + y)',
          expectedStdout: '3',
        },
      },
      java: {
        prompt: {
          lines: ['int x = 1;', 'int y = 2;', 'System.out.println(x + y);'],
          shuffleOnServe: true,
        },
        evaluation: {
          correctAnswer: '3',
          correctOrder: ['int x = 1;', 'int y = 2;', 'System.out.println(x + y);'],
          solutionCode: 'public class Main { public static void main(String[] args) { int x = 1; int y = 2; System.out.println(x + y); } }',
          expectedStdout: '3',
        },
      },
      c: {
        prompt: {
          lines: ['int x = 1;', 'int y = 2;', 'printf("%d\\n", x + y);'],
          shuffleOnServe: true,
        },
        evaluation: {
          correctAnswer: '3',
          correctOrder: ['int x = 1;', 'int y = 2;', 'printf("%d\\n", x + y);'],
          solutionCode: '#include <stdio.h>\nint main(void){ int x=1; int y=2; printf("%d\\n", x + y); return 0; }',
          expectedStdout: '3',
        },
      },
    },
  });

  const correct = verifyAnswer(task, {
    activeLang: 'python',
    rearrangedLines: ['x = 1', 'y = 2', 'print(x + y)'],
  });
  const incorrect = verifyAnswer(task, {
    activeLang: 'python',
    rearrangedLines: ['print(x + y)', 'y = 2', 'x = 1'],
  });

  assert.equal(correct.status, 'correct');
  assert.equal(incorrect.status, 'incorrect');
});

test('canonical tasks are playable when prompt and evaluation blocks exist', () => {
  const task = makeCanonicalTask();
  assert.equal(isTaskPlayable(task), true);
});

test('project puzzle bank has exact approved counts and valid ids', () => {
  const puzzlePath = path.join(__dirname, '..', 'src', 'data', 'puzzles.json');
  const raw = JSON.parse(fs.readFileSync(puzzlePath, 'utf8'));

  assert.equal(raw.length, 750);

  const counts = { easy: 0, medium: 0, hard: 0 };
  const seen = new Set();

  raw.forEach(task => {
    assert.match(task.id, /^[123][0-9]{3}$/);
    assert.equal(seen.has(task.id), false, `Duplicate id detected: ${task.id}`);
    seen.add(task.id);

    counts[task.difficulty] += 1;

    if (task.difficulty === 'easy') assert.equal(task.id.startsWith('1'), true);
    if (task.difficulty === 'medium') assert.equal(task.id.startsWith('2'), true);
    if (task.difficulty === 'hard') assert.equal(task.id.startsWith('3'), true);
  });

  assert.deepEqual(counts, { easy: 300, medium: 300, hard: 150 });
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
    `Expected all puzzle-language variants to be parseable, found: ${JSON.stringify(unparseable.slice(0, 25))}`,
  );
});
