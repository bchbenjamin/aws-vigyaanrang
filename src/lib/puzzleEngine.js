const SUPPORTED_LANGUAGES = ['python', 'java', 'c'];

function normalizeText(value) {
  return String(value ?? '').replace(/\r/g, '').trim();
}

function normalizeForCompare(value) {
  return normalizeText(value).replace(/\s+/g, ' ').toLowerCase();
}

function normalizeDifficulty(rawDifficulty) {
  const d = normalizeText(rawDifficulty).toLowerCase();
  if (d === 'easy' || d === 'medium' || d === 'hard') return d;
  if (d.includes('leetcode')) return 'hard';
  if (d.includes('easy')) return 'easy';
  if (d.includes('medium')) return 'medium';
  if (d.includes('hard')) return 'hard';
  return 'medium';
}

function mapFormat(rawFormat) {
  if (!rawFormat) return 'fill_blank';
  const c = String(rawFormat).toLowerCase();

  if (c.includes('multiple') || c.includes('choice') || c.includes('mcq') || c.includes('parenthesis')) {
    return 'multiple_choice';
  }
  if (c.includes('reorder') || c.includes('rearrange') || c.includes('ordering')) {
    return 'rearrange';
  }
  if (c.includes('predict') || c.includes('output')) {
    return 'output_prediction';
  }
  if (c.includes('completion') || c.includes('drag')) {
    return 'drag_and_fill';
  }
  if (c.includes('syntax') || c.includes('debug') || c.includes('error') || c.includes('logic')) {
    return 'debug';
  }
  if (c.includes('fill') || c.includes('blank')) {
    return 'fill_blank';
  }

  return 'fill_blank';
}

function normalizeBlanks(code) {
  return normalizeText(code).replace(/_{2,}/g, '_____');
}

function stripTokenHintLines(code) {
  return normalizeText(code)
    .split(/\n/)
    .filter(line => !/^\s*Tokens?\s*:/i.test(line))
    .join('\n')
    .trim();
}

function parseTokenOptionsFromCode(code) {
  const text = normalizeText(code);
  if (!text) return [];
  const match = text.match(/Tokens?\s*:\s*\[([^\]]+)\]/i);
  if (!match || !match[1]) return [];

  return match[1]
    .split(',')
    .map(part => part.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function parseChoiceOptionsFromCode(code) {
  const lines = normalizeText(code)
    .split(/\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const labeled = lines.filter(line => /^[A-Z]\s*[:.)-]/.test(line));
  if (labeled.length >= 2) return labeled;
  return [];
}

function getChoiceOptions(rawVersion) {
  if (!rawVersion) return [];

  if (Array.isArray(rawVersion.options) && rawVersion.options.length > 0) {
    return rawVersion.options.map(opt => normalizeText(opt)).filter(Boolean);
  }

  const tokenOptions = parseTokenOptionsFromCode(rawVersion.code);
  if (tokenOptions.length > 0) return tokenOptions;

  return parseChoiceOptionsFromCode(rawVersion.code);
}

function parseRearrangeLines(rawCode) {
  const code = normalizeText(rawCode);
  if (!code) return [];

  const hasLinesPrefix = /^\s*lines\s*:/i.test(code);
  if (hasLinesPrefix) {
    const start = code.indexOf('[');
    const end = code.lastIndexOf(']');
    if (start >= 0 && end > start) {
      const candidateArray = code.slice(start, end + 1);
      try {
        const parsed = JSON.parse(candidateArray);
        if (Array.isArray(parsed)) {
          return parsed.map(item => normalizeText(item)).filter(Boolean);
        }
      } catch {
        // Fall back to plain line splitting below.
      }
    }

    const encodedLines = code.match(/Lines:\s*\[([\s\S]+)\]$/i);
    if (encodedLines && encodedLines[1]) {
      return encodedLines[1]
        .split(',')
        .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    }
  }

  return code
    .split(/\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

function shuffleInPlace(values) {
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

function chooseEffectiveFormat(taskDef) {
  let baseFormat = mapFormat(taskDef?.format);

  if (baseFormat === 'drag_and_fill') {
    const hasOptions = SUPPORTED_LANGUAGES.some(lang => {
      const version = taskDef?.versions?.[lang];
      return getChoiceOptions(version).length > 0;
    });
    if (!hasOptions) baseFormat = 'fill_blank';
  }

  if (baseFormat === 'multiple_choice') {
    const hasOptions = SUPPORTED_LANGUAGES.some(lang => {
      const version = taskDef?.versions?.[lang];
      return getChoiceOptions(version).length > 0;
    });
    if (!hasOptions) baseFormat = 'fill_blank';
  }

  if (baseFormat === 'fill_blank') {
    const hasPromptCode = SUPPORTED_LANGUAGES.some(lang => {
      const code = normalizeText(taskDef?.versions?.[lang]?.code);
      return code.length > 0;
    });
    const hasAnswerKey = SUPPORTED_LANGUAGES.some(lang => {
      const version = taskDef?.versions?.[lang];
      return extractExpectedCandidates(version).length > 0;
    });

    // Some completion-style tasks provide only an answer snippet and no starter code.
    // Treat these as open-response debug tasks rather than unparseable fill-blank tasks.
    if (!hasPromptCode && hasAnswerKey) {
      baseFormat = 'debug';
    }
  }

  return baseFormat;
}

function getEmptyPromptPlaceholder(lang) {
  if (lang === 'python') return '# Write your answer below';
  return '// Write your answer below';
}

function buildSafeVersion(rawVersion, format, options = {}, lang = 'python') {
  if (!rawVersion) return undefined;

  if (format === 'fill_blank' || format === 'output_prediction') {
    return {
      blankCode: normalizeBlanks(stripTokenHintLines(rawVersion.code || '')),
    };
  }

  if (format === 'drag_and_fill') {
    return {
      blankCode: normalizeBlanks(stripTokenHintLines(rawVersion.code || '')),
      options: getChoiceOptions(rawVersion),
    };
  }

  if (format === 'multiple_choice') {
    return {
      question: normalizeText(rawVersion.question || rawVersion.code || ''),
      options: getChoiceOptions(rawVersion),
    };
  }

  if (format === 'rearrange') {
    const lines = parseRearrangeLines(rawVersion.code || '');
    const shuffled = options.shuffleRearrange ? shuffleInPlace([...lines]) : lines;
    return { shuffledLines: shuffled };
  }

  return {
    buggyCode: normalizeText(rawVersion.code || '') || getEmptyPromptPlaceholder(lang),
  };
}

function buildSafeTask(taskDef, options = {}) {
  if (!taskDef || !taskDef.id) return null;

  const format = chooseEffectiveFormat(taskDef);
  const safe = {
    id: taskDef.id,
    title: taskDef.title || 'Task',
    description: taskDef.description || '',
    format,
    difficulty: normalizeDifficulty(taskDef.difficulty),
    versions: {},
  };

  SUPPORTED_LANGUAGES.forEach(lang => {
    const rawVersion = taskDef.versions?.[lang];
    const safeVersion = buildSafeVersion(rawVersion, format, options, lang);
    if (safeVersion) {
      safe.versions[lang] = safeVersion;
    }
  });

  return safe;
}

function extractExpectedCandidates(rawVersion) {
  const values = [];
  const push = (v) => {
    const text = normalizeText(v);
    if (text) values.push(text);
  };

  if (!rawVersion) return values;

  push(rawVersion.fixed);
  push(rawVersion.expected_output);
  push(rawVersion.correctAnswer);
  push(rawVersion.answer);

  const baseAnswer = normalizeText(rawVersion.answer);
  if (baseAnswer) {
    const fullMatch = baseAnswer.match(/\bfull\s*:\s*(.+)$/i);
    if (fullMatch && fullMatch[1]) push(fullMatch[1]);

    const shouldBeMatch = baseAnswer.match(/\bshould\s+be\s+([^.;\n]+)/i);
    if (shouldBeMatch && shouldBeMatch[1]) push(shouldBeMatch[1]);

    const changeToMatch = baseAnswer.match(/\bchange\b.+?\bto\b\s+([^.;\n]+)/i);
    if (changeToMatch && changeToMatch[1]) push(changeToMatch[1]);

    const addMatch = baseAnswer.match(/\badd\b\s*:?\s*([^.;\n]+)/i);
    if (addMatch && addMatch[1]) push(addMatch[1]);

    const inlineCode = [...baseAnswer.matchAll(/`([^`]+)`/g)];
    inlineCode.forEach(match => push(match[1]));
  }

  const deduped = [];
  const seen = new Set();
  values.forEach(value => {
    const key = normalizeForCompare(value);
    if (!key || seen.has(key)) return;
    seen.add(key);
    deduped.push(value);
  });

  return deduped;
}

function isRenderableVersion(version, format) {
  if (!version) return false;

  if (format === 'fill_blank' || format === 'output_prediction') {
    return normalizeText(version.blankCode).length > 0;
  }

  if (format === 'drag_and_fill') {
    return normalizeText(version.blankCode).includes('_____') && Array.isArray(version.options) && version.options.length > 0;
  }

  if (format === 'multiple_choice') {
    return Array.isArray(version.options) && version.options.length >= 2;
  }

  if (format === 'rearrange') {
    return Array.isArray(version.shuffledLines) && version.shuffledLines.length >= 2;
  }

  return normalizeText(version.buggyCode).length > 0;
}

function hasGradableAnswer(rawVersion, format) {
  if (!rawVersion) return false;

  if (format === 'rearrange') {
    return parseRearrangeLines(rawVersion.code || '').length >= 2;
  }

  return extractExpectedCandidates(rawVersion).length > 0;
}

function isTaskPlayable(taskDef) {
  const safeTask = buildSafeTask(taskDef, { shuffleRearrange: false });
  if (!safeTask) return false;

  return SUPPORTED_LANGUAGES.some(lang => {
    const rawVersion = taskDef.versions?.[lang];
    const safeVersion = safeTask.versions?.[lang];
    return isRenderableVersion(safeVersion, safeTask.format) && hasGradableAnswer(rawVersion, safeTask.format);
  });
}

function extractChoiceLabels(text) {
  const labels = normalizeText(text)
    .toUpperCase()
    .match(/\b[A-Z]\b/g);

  if (!labels || labels.length === 0) return [];

  const unique = [];
  labels.forEach(label => {
    if (!unique.includes(label)) unique.push(label);
  });

  return unique;
}

function matchesByCandidates(actual, candidates) {
  const actualNorm = normalizeForCompare(actual);
  if (!actualNorm) return false;

  return candidates.some(candidate => {
    const expectedNorm = normalizeForCompare(candidate);
    if (!expectedNorm) return false;

    if (actualNorm === expectedNorm) return true;

    // Allow short corrected snippets to match explanatory answers.
    if (actualNorm.length >= 3 && expectedNorm.includes(actualNorm)) return true;
    if (expectedNorm.length >= 3 && actualNorm.includes(expectedNorm)) return true;

    return false;
  });
}

function matchesMultipleChoice(userAnswer, rawVersion, candidates) {
  const actual = normalizeText(userAnswer);
  if (!actual) return false;

  if (matchesByCandidates(actual, candidates)) return true;

  const expectedLabels = extractChoiceLabels(candidates.join(' '));
  const selectedLabels = extractChoiceLabels(actual);

  if (expectedLabels.length > 0 && selectedLabels.length > 0) {
    if (expectedLabels.length === selectedLabels.length) {
      const expectedSorted = [...expectedLabels].sort().join(',');
      const actualSorted = [...selectedLabels].sort().join(',');
      if (expectedSorted === actualSorted) return true;
    }

    if (selectedLabels.length === 1 && expectedLabels.length === 1 && selectedLabels[0] === expectedLabels[0]) {
      return true;
    }
  }

  const options = getChoiceOptions(rawVersion);
  const selectedOption = options.find(opt => normalizeForCompare(opt) === normalizeForCompare(actual));
  if (selectedOption) {
    const optionLabel = extractChoiceLabels(selectedOption)[0];
    if (!optionLabel) return false;
    if (expectedLabels.length === 1 && expectedLabels[0] === optionLabel) return true;
    if (expectedLabels.length > 1 && expectedLabels.includes(optionLabel)) {
      return normalizeForCompare(candidates.join(' ')).includes(optionLabel.toLowerCase());
    }
  }

  return false;
}

function fillCodeBlanks(blankCode, fillState) {
  const code = normalizeText(blankCode);
  if (!code.includes('_____')) return '';

  let index = 0;
  return code.replace(/_{5}/g, () => {
    const value = fillState && Object.prototype.hasOwnProperty.call(fillState, index)
      ? normalizeText(fillState[index])
      : '';
    index += 1;
    return value;
  });
}

function compareLineArrays(expectedLines, actualLines) {
  if (!Array.isArray(expectedLines) || !Array.isArray(actualLines)) return false;
  if (expectedLines.length !== actualLines.length) return false;

  for (let i = 0; i < expectedLines.length; i += 1) {
    if (normalizeForCompare(expectedLines[i]) !== normalizeForCompare(actualLines[i])) return false;
  }

  return true;
}

function verifyAnswer(taskDef, payload = {}) {
  if (!taskDef) return { status: 'unparseable', reason: 'task_missing' };

  const activeLang = payload.activeLang;
  const rawVersion = taskDef.versions?.[activeLang];
  if (!rawVersion) return { status: 'unparseable', reason: 'language_missing' };

  const format = chooseEffectiveFormat(taskDef);
  const safeVersion = buildSafeVersion(rawVersion, format, { shuffleRearrange: false }, activeLang);
  if (!isRenderableVersion(safeVersion, format)) {
    return { status: 'unparseable', reason: 'unsupported_shape' };
  }

  const expectedCandidates = extractExpectedCandidates(rawVersion);

  if (format === 'rearrange') {
    const expectedLines = parseRearrangeLines(rawVersion.code || '');
    if (expectedLines.length < 2) return { status: 'unparseable', reason: 'missing_rearrange_source' };

    if (Array.isArray(payload.rearrangedLines) && payload.rearrangedLines.length > 0) {
      return compareLineArrays(expectedLines, payload.rearrangedLines)
        ? { status: 'correct' }
        : { status: 'incorrect' };
    }

    // Backward compatibility with legacy client payloads.
    if (Array.isArray(payload.dragOrder) && payload.dragOrder.length > 0) {
      const isIdentity = payload.dragOrder.every((value, idx) => value === idx);
      return isIdentity ? { status: 'correct' } : { status: 'incorrect' };
    }

    return { status: 'incorrect' };
  }

  if (expectedCandidates.length === 0) {
    return { status: 'unparseable', reason: 'missing_answer_key' };
  }

  if (format === 'multiple_choice') {
    return matchesMultipleChoice(payload.userAnswer, rawVersion, expectedCandidates)
      ? { status: 'correct' }
      : { status: 'incorrect' };
  }

  if (format === 'drag_and_fill') {
    const combined = fillCodeBlanks(safeVersion.blankCode, payload.fillState || {});
    if (combined && matchesByCandidates(combined, expectedCandidates)) {
      return { status: 'correct' };
    }

    return matchesByCandidates(payload.userAnswer, expectedCandidates)
      ? { status: 'correct' }
      : { status: 'incorrect' };
  }

  return matchesByCandidates(payload.userAnswer, expectedCandidates)
    ? { status: 'correct' }
    : { status: 'incorrect' };
}

module.exports = {
  SUPPORTED_LANGUAGES,
  mapFormat,
  normalizeDifficulty,
  chooseEffectiveFormat,
  buildSafeTask,
  isTaskPlayable,
  verifyAnswer,
  parseRearrangeLines,
  getChoiceOptions,
};
