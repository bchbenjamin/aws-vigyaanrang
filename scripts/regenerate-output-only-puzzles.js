const fs = require('fs');
const path = require('path');

const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'puzzles.json');

function runCase(kind, p) {
  if (kind === 'arith') return p.a + p.b * p.c - p.d;
  if (kind === 'conditional') return ((p.a + p.b) % 2 === 0) ? p.a * p.b : p.a + p.b + p.c;
  if (kind === 'sum_mod') {
    let s = 0;
    for (let i = 0; i <= p.n; i += 1) s += i % p.m;
    return s;
  }
  if (kind === 'nested_pairs') {
    let c = 0;
    for (let i = 0; i < p.n; i += 1) {
      for (let j = 0; j < i; j += 1) c += (i + j) % 2;
    }
    return c;
  }
  if (kind === 'fib') {
    let a = 0;
    let b = 1;
    for (let i = 0; i < p.n; i += 1) {
      const t = a + b;
      a = b;
      b = t;
    }
    return a;
  }
  if (kind === 'array_mix') return p.a0 + p.a2 * p.a3 - p.a1;
  if (kind === 'poly') {
    const f = (x) => x * x - 2 * x + 3;
    return f(p.x) + f(p.y);
  }
  if (kind === 'mod_square') return ((p.a * p.a) + (p.b * p.b)) % p.m;
  throw new Error(`Unsupported kind: ${kind}`);
}

function snippetFor(lang, kind, p) {
  if (lang === 'python') {
    if (kind === 'arith') return `a = ${p.a}\nb = ${p.b}\nc = ${p.c}\nd = ${p.d}\nprint(a + b * c - d)`;
    if (kind === 'conditional') return `a = ${p.a}\nb = ${p.b}\nc = ${p.c}\nif (a + b) % 2 == 0:\n    print(a * b)\nelse:\n    print(a + b + c)`;
    if (kind === 'sum_mod') return `n = ${p.n}\nm = ${p.m}\ns = 0\nfor i in range(n + 1):\n    s += i % m\nprint(s)`;
    if (kind === 'nested_pairs') return `n = ${p.n}\ncount = 0\nfor i in range(n):\n    for j in range(i):\n        count += (i + j) % 2\nprint(count)`;
    if (kind === 'fib') return `n = ${p.n}\na, b = 0, 1\nfor _ in range(n):\n    a, b = b, a + b\nprint(a)`;
    if (kind === 'array_mix') return `arr = [${p.a0}, ${p.a1}, ${p.a2}, ${p.a3}]\nprint(arr[0] + arr[2] * arr[3] - arr[1])`;
    if (kind === 'poly') return `def f(x):\n    return x * x - 2 * x + 3\nprint(f(${p.x}) + f(${p.y}))`;
    if (kind === 'mod_square') return `a = ${p.a}\nb = ${p.b}\nm = ${p.m}\nprint((a * a + b * b) % m)`;
  }

  if (lang === 'java') {
    if (kind === 'arith') return `int a = ${p.a};\nint b = ${p.b};\nint c = ${p.c};\nint d = ${p.d};\nSystem.out.println(a + b * c - d);`;
    if (kind === 'conditional') return `int a = ${p.a};\nint b = ${p.b};\nint c = ${p.c};\nif ((a + b) % 2 == 0) {\n    System.out.println(a * b);\n} else {\n    System.out.println(a + b + c);\n}`;
    if (kind === 'sum_mod') return `int n = ${p.n};\nint m = ${p.m};\nint s = 0;\nfor (int i = 0; i <= n; i++) {\n    s += i % m;\n}\nSystem.out.println(s);`;
    if (kind === 'nested_pairs') return `int n = ${p.n};\nint count = 0;\nfor (int i = 0; i < n; i++) {\n    for (int j = 0; j < i; j++) {\n        count += (i + j) % 2;\n    }\n}\nSystem.out.println(count);`;
    if (kind === 'fib') return `int n = ${p.n};\nint a = 0;\nint b = 1;\nfor (int i = 0; i < n; i++) {\n    int t = a + b;\n    a = b;\n    b = t;\n}\nSystem.out.println(a);`;
    if (kind === 'array_mix') return `int[] arr = {${p.a0}, ${p.a1}, ${p.a2}, ${p.a3}};\nSystem.out.println(arr[0] + arr[2] * arr[3] - arr[1]);`;
    if (kind === 'poly') return `int x = ${p.x};\nint y = ${p.y};\nint fx = x * x - 2 * x + 3;\nint fy = y * y - 2 * y + 3;\nSystem.out.println(fx + fy);`;
    if (kind === 'mod_square') return `int a = ${p.a};\nint b = ${p.b};\nint m = ${p.m};\nSystem.out.println((a * a + b * b) % m);`;
  }

  if (lang === 'c') {
    if (kind === 'arith') return `int a = ${p.a};\nint b = ${p.b};\nint c = ${p.c};\nint d = ${p.d};\nprintf("%d\\n", a + b * c - d);`;
    if (kind === 'conditional') return `int a = ${p.a};\nint b = ${p.b};\nint c = ${p.c};\nif ((a + b) % 2 == 0) {\n    printf("%d\\n", a * b);\n} else {\n    printf("%d\\n", a + b + c);\n}`;
    if (kind === 'sum_mod') return `int n = ${p.n};\nint m = ${p.m};\nint s = 0;\nfor (int i = 0; i <= n; i++) {\n    s += i % m;\n}\nprintf("%d\\n", s);`;
    if (kind === 'nested_pairs') return `int n = ${p.n};\nint count = 0;\nfor (int i = 0; i < n; i++) {\n    for (int j = 0; j < i; j++) {\n        count += (i + j) % 2;\n    }\n}\nprintf("%d\\n", count);`;
    if (kind === 'fib') return `int n = ${p.n};\nint a = 0;\nint b = 1;\nfor (int i = 0; i < n; i++) {\n    int t = a + b;\n    a = b;\n    b = t;\n}\nprintf("%d\\n", a);`;
    if (kind === 'array_mix') return `int arr[] = {${p.a0}, ${p.a1}, ${p.a2}, ${p.a3}};\nprintf("%d\\n", arr[0] + arr[2] * arr[3] - arr[1]);`;
    if (kind === 'poly') return `int x = ${p.x};\nint y = ${p.y};\nint fx = x * x - 2 * x + 3;\nint fy = y * y - 2 * y + 3;\nprintf("%d\\n", fx + fy);`;
    if (kind === 'mod_square') return `int a = ${p.a};\nint b = ${p.b};\nint m = ${p.m};\nprintf("%d\\n", (a * a + b * b) % m);`;
  }

  throw new Error(`Unsupported language: ${lang}`);
}

function wrapSolution(lang, snippet) {
  if (lang === 'python') return snippet;
  if (lang === 'java') {
    return [
      'public class Main {',
      '  public static void main(String[] args) {',
      snippet.split('\n').map((line) => `    ${line}`).join('\n'),
      '  }',
      '}',
    ].join('\n');
  }
  if (lang === 'c') {
    return [
      '#include <stdio.h>',
      '',
      'int main(void) {',
      snippet.split('\n').map((line) => `  ${line}`).join('\n'),
      '  return 0;',
      '}',
    ].join('\n');
  }
  throw new Error(`Unsupported language: ${lang}`);
}

function makeOptions(correct) {
  const base = Number(correct);
  const candidates = [
    String(base),
    String(base + 1),
    String(base - 1),
    String(base + 2),
    String(base - 2),
    String(base + 3),
  ];

  const unique = [];
  candidates.forEach((c) => {
    if (!unique.includes(c)) unique.push(c);
  });

  const selected = [unique[0], unique[1], unique[2], unique[3]];
  return [selected[2], selected[0], selected[3], selected[1]];
}

function makeTask(id, difficulty, format, kind, params) {
  const out = String(runCase(kind, params));
  const accepted = [out, `${out}.0`, `${out}.00`];

  const versions = {};
  ['python', 'java', 'c'].forEach((lang) => {
    const code = snippetFor(lang, kind, params);
    const solutionCode = wrapSolution(lang, code);
    if (format === 'multiple_choice') {
      versions[lang] = {
        prompt: {
          question: 'What is printed to stdout?',
          code,
          options: makeOptions(out),
        },
        evaluation: {
          correctAnswer: out,
          acceptedAnswers: [out],
          expectedStdout: out,
          solutionCode,
        },
      };
      return;
    }

    versions[lang] = {
      prompt: {
        code,
      },
      evaluation: {
        correctAnswer: out,
        acceptedAnswers: accepted,
        expectedStdout: out,
        solutionCode,
      },
    };
  });

  return {
    id: String(id),
    title: `Predict Output ${id}`,
    description: 'Predict the exact stdout produced by the code.',
    difficulty,
    format,
    versions,
  };
}

function kindFor(difficulty, i) {
  if (difficulty === 'easy') {
    const kinds = ['arith', 'conditional', 'sum_mod', 'array_mix', 'mod_square'];
    return kinds[i % kinds.length];
  }
  if (difficulty === 'medium') {
    const kinds = ['sum_mod', 'nested_pairs', 'poly', 'fib', 'array_mix'];
    return kinds[i % kinds.length];
  }
  const kinds = ['nested_pairs', 'fib', 'poly', 'mod_square', 'sum_mod'];
  return kinds[i % kinds.length];
}

function paramsFor(difficulty, i) {
  if (difficulty === 'easy') {
    return {
      a: 2 + (i % 9),
      b: 3 + (i % 7),
      c: 2 + (i % 5),
      d: 1 + (i % 4),
      n: 5 + (i % 6),
      m: 2 + (i % 4),
      a0: 1 + (i % 5),
      a1: 2 + (i % 6),
      a2: 3 + (i % 5),
      a3: 2 + (i % 4),
      x: 2 + (i % 6),
      y: 3 + (i % 5),
    };
  }

  if (difficulty === 'medium') {
    return {
      a: 10 + (i % 13),
      b: 6 + (i % 9),
      c: 4 + (i % 7),
      d: 3 + (i % 6),
      n: 8 + (i % 8),
      m: 3 + (i % 5),
      a0: 4 + (i % 7),
      a1: 5 + (i % 7),
      a2: 6 + (i % 8),
      a3: 3 + (i % 6),
      x: 5 + (i % 9),
      y: 4 + (i % 8),
    };
  }

  return {
    a: 20 + (i % 19),
    b: 14 + (i % 13),
    c: 8 + (i % 9),
    d: 5 + (i % 8),
    n: 12 + (i % 10),
    m: 5 + (i % 6),
    a0: 9 + (i % 11),
    a1: 7 + (i % 9),
    a2: 8 + (i % 10),
    a3: 5 + (i % 7),
    x: 8 + (i % 10),
    y: 9 + (i % 10),
  };
}

function generateBand(start, count, difficulty) {
  const tasks = [];
  for (let i = 0; i < count; i += 1) {
    const id = start + i;
    const format = i % 2 === 0 ? 'output_prediction' : 'multiple_choice';
    const kind = kindFor(difficulty, i);
    const params = paramsFor(difficulty, i);
    tasks.push(makeTask(id, difficulty, format, kind, params));
  }
  return tasks;
}

function main() {
  const puzzles = [
    ...generateBand(1001, 30, 'easy'),
    ...generateBand(2001, 30, 'medium'),
    ...generateBand(3001, 15, 'hard'),
  ];

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(puzzles, null, 2)}\n`, 'utf8');
  console.log(`[regenerate-output-only-puzzles] Wrote ${puzzles.length} tasks to ${OUTPUT_PATH}`);
}

main();
