const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { isTaskPlayable, mapFormat, normalizeDifficulty, verifyAnswer } = require('../src/lib/puzzleEngine');

const LANGUAGES = ['python', 'java', 'c'];
const PUZZLE_PATH = path.join(__dirname, '..', 'data', 'puzzles.json');
const RUNTIME_TIMEOUT_MS = 5000;

const ID_RULES = {
  easy: { start: 1001, count: 300 },
  medium: { start: 2001, count: 300 },
  hard: { start: 3001, count: 150 },
};

function parseRuntimeFlag() {
  return process.argv.includes('--runtime');
}

function runCmd(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    timeout: options.timeout || RUNTIME_TIMEOUT_MS,
    cwd: options.cwd || process.cwd(),
    windowsHide: true,
  });
}

function hasCommand(command, args = ['--version']) {
  try {
    return runCmd(command, args, { timeout: 3000 }).status === 0;
  } catch {
    return false;
  }
}

function normalizeStdout(value) {
  return String(value || '').replace(/\r/g, '').trim();
}

function writeTempFile(baseDir, filename, content) {
  const target = path.join(baseDir, filename);
  fs.writeFileSync(target, content, 'utf8');
  return target;
}

function cleanupTempDir(tempDir) {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  } catch {
    // Best-effort cleanup on Windows. Validation should not fail because a temp folder was briefly locked.
  }
}

function executeSolutionCode(lang, solutionCode, issues, ref) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `puzzle-${lang}-`));

  try {
    if (lang === 'python') {
      const scriptPath = writeTempFile(tempDir, 'main.py', solutionCode);
      const run = runCmd('python', [scriptPath], { cwd: tempDir });
      if (run.status !== 0) {
        issues.push({ ref, issue: `runtime_python_exec_failed:${normalizeStdout(run.stderr).slice(0, 200)}` });
        return null;
      }
      return normalizeStdout(run.stdout);
    }

    if (lang === 'java') {
      const javaPath = writeTempFile(tempDir, 'Main.java', solutionCode);
      const compile = runCmd('javac', [javaPath], { cwd: tempDir });
      if (compile.status !== 0) {
        issues.push({ ref, issue: `runtime_java_compile_failed:${normalizeStdout(compile.stderr).slice(0, 200)}` });
        return null;
      }

      const run = runCmd('java', ['-cp', tempDir, 'Main'], { cwd: tempDir });
      if (run.status !== 0) {
        issues.push({ ref, issue: `runtime_java_exec_failed:${normalizeStdout(run.stderr).slice(0, 200)}` });
        return null;
      }
      return normalizeStdout(run.stdout);
    }

    if (lang === 'c') {
      const cPath = writeTempFile(tempDir, 'main.c', solutionCode);
      const exePath = process.platform === 'win32'
        ? path.join(tempDir, 'main.exe')
        : path.join(tempDir, 'main');
      const compile = runCmd('gcc', [cPath, '-O2', '-o', exePath], { cwd: tempDir });
      if (compile.status !== 0) {
        issues.push({ ref, issue: `runtime_c_compile_failed:${normalizeStdout(compile.stderr).slice(0, 200)}` });
        return null;
      }

      const run = runCmd(exePath, [], { cwd: tempDir });
      if (run.status !== 0) {
        issues.push({ ref, issue: `runtime_c_exec_failed:${normalizeStdout(run.stderr).slice(0, 200)}` });
        return null;
      }
      return normalizeStdout(run.stdout);
    }

    issues.push({ ref, issue: `runtime_unsupported_language:${lang}` });
    return null;
  } finally {
    cleanupTempDir(tempDir);
  }
}

function validateIdSchema(raw, issues) {
  const idsByDifficulty = {
    easy: [],
    medium: [],
    hard: [],
  };

  raw.forEach((task) => {
    const ref = task?.id || 'unknown';
    const idText = String(task?.id || '');
    if (!/^\d+$/.test(idText)) {
      issues.push({ ref, issue: 'id_not_numeric_string' });
      return;
    }

    const normalizedDifficulty = normalizeDifficulty(task?.difficulty);
    const numericId = Number(idText);
    if (idsByDifficulty[normalizedDifficulty]) {
      idsByDifficulty[normalizedDifficulty].push(numericId);
    }

    const rule = ID_RULES[normalizedDifficulty];
    if (rule) {
      const min = rule.start;
      const max = rule.start + rule.count - 1;
      if (numericId < min || numericId > max) {
        issues.push({ ref, issue: `id_out_of_range_for_${normalizedDifficulty}:${numericId}` });
      }
    }
  });

  Object.entries(ID_RULES).forEach(([difficulty, rule]) => {
    const ids = (idsByDifficulty[difficulty] || []).sort((a, b) => a - b);
    if (ids.length !== rule.count) {
      issues.push({ ref: difficulty, issue: `id_count_mismatch:${ids.length}` });
      return;
    }

    for (let i = 0; i < ids.length; i += 1) {
      const expected = rule.start + i;
      if (ids[i] !== expected) {
        issues.push({ ref: difficulty, issue: `id_sequence_gap_or_mismatch:expected_${expected}_got_${ids[i]}` });
        break;
      }
    }
  });
}

function validateRuntimeLanguage(task, lang, issues) {
  const ref = task.id;
  const evaluation = task.versions?.[lang]?.evaluation || {};
  const solutionCode = String(evaluation.solutionCode || '').trim();
  if (!solutionCode) {
    issues.push({ ref, issue: `runtime_missing_solutionCode_${lang}` });
    return;
  }

  const actualStdout = executeSolutionCode(lang, solutionCode, issues, ref);
  if (actualStdout === null) {
    return;
  }

  const explicitExpected = normalizeStdout(evaluation.expectedStdout);
  if (explicitExpected && actualStdout !== explicitExpected) {
    issues.push({ ref, issue: `runtime_${lang}_stdout_mismatch` });
  }
}

function validatePuzzles() {
  const runtimeMode = parseRuntimeFlag();

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

  if (runtimeMode) {
    const available = {
      python: hasCommand('python', ['--version']),
      java: hasCommand('javac', ['-version']) && hasCommand('java', ['-version']),
      c: hasCommand('gcc', ['--version']),
    };

    const missing = Object.entries(available)
      .filter(([, ok]) => !ok)
      .map(([name]) => name);

    if (missing.length > 0) {
      console.error(`[validate-puzzles] Runtime mode requires local compilers/interpreters. Missing: ${missing.join(', ')}`);
      process.exit(1);
    }
  }

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

    if (!task.versions) {
      issues.push({ ref, issue: 'missing_versions' });
      return;
    }

    LANGUAGES.forEach((lang) => {
      if (!task.versions?.[lang]) {
        issues.push({ ref, issue: `missing_language_version:${lang}` });
        return;
      }

      const result = verifyAnswer(task, {
        activeLang: lang,
        userAnswer: '',
        fillState: {},
        dragOrder: [],
      });

      if (result.status === 'unparseable') {
        issues.push({ ref, issue: `unparseable_${lang}:${result.reason || 'unknown'}` });
      }

      if (runtimeMode) {
        validateRuntimeLanguage(task, lang, issues);
      }
    });

    if (!isTaskPlayable(task)) {
      issues.push({ ref, issue: 'not_playable' });
    }
  });

  validateIdSchema(raw, issues);

  const counts = raw.reduce((acc, task) => {
    const key = task.difficulty;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, { easy: 0, medium: 0, hard: 0 });

  console.log(`[validate-puzzles] File: ${path.relative(process.cwd(), PUZZLE_PATH)}`);
  console.log(`[validate-puzzles] Mode: ${runtimeMode ? 'runtime (local compile + execute)' : 'schema (fast)'}`);
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
