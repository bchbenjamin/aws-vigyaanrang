# PUZZLE.md

This document is the data contract for `data/puzzles.json`.

It is written for teams that generate, review, or transform puzzle data.
All constraints here are derived from current runtime + validator behavior in:

- `src/lib/puzzleEngine.js`
- `scripts/clean-puzzles.js`
- `scripts/validate-puzzles.js`
- `scripts/strip-answers.js`

## 1) File Overview

- Source of truth: `data/puzzles.json`
- Shape: top-level JSON array
- Current expected count: `750`
- Expected difficulty distribution:
  - `easy`: `300`
  - `medium`: `300`
  - `hard`: `150`
- Supported languages in each puzzle: `python`, `java`, `c`

## 2) Top-Level Puzzle Schema

Each puzzle object must follow:

```json
{
  "id": "string",
  "difficulty": "easy | medium | hard",
  "format": "debug | drag_and_fill | fill_blank | multiple_choice | output_prediction | rearrange",
  "title": "string",
  "description": "string",
  "versions": {
    "python": { "prompt": {}, "evaluation": {} },
    "java": { "prompt": {}, "evaluation": {} },
    "c": { "prompt": {}, "evaluation": {} }
  }
}
```

Required behavior-level rules:

- `id` must be present and unique across all puzzles.
- `difficulty` must be canonical (`easy`, `medium`, `hard`).
- `format` must be canonical (`debug`, `drag_and_fill`, `fill_blank`, `multiple_choice`, `output_prediction`, `rearrange`).
- All three language versions must exist and be playable (renderable + gradable): `python`, `java`, `c`.

### 2.1 ID Logic (Authoritative)

IDs are not arbitrary. They encode difficulty buckets and sequence.

- `easy`: `1001` to `1300` (300 puzzles)
- `medium`: `2001` to `2300` (300 puzzles)
- `hard`: `3001` to `3150` (150 puzzles)

Rules:

- `id` must be a numeric string.
- It must fall in the correct range for its `difficulty`.
- IDs must be contiguous within each difficulty range (no gaps).

## 3) Canonical Values and Normalization

Runtime can map non-canonical values, but production data should still be canonical.

### 3.1 Difficulty normalization

`normalizeDifficulty(...)` maps these patterns:

- Any value containing `easy` -> `easy`
- Any value containing `medium` -> `medium`
- Any value containing `hard` or `leetcode` -> `hard`
- Unknown values default to `medium`

Validator rule: canonical value must already match normalized value.

### 3.2 Format normalization

`mapFormat(...)` maps aliases to canonical format.

Canonical formats:

- `multiple_choice`
- `fill_blank`
- `drag_and_fill`
- `rearrange`
- `debug`
- `output_prediction`

Alias examples that are mapped:

- contains `multiple`, `choice`, `mcq`, `parenthesis` -> `multiple_choice`
- contains `reorder`, `rearrange`, `ordering` -> `rearrange`
- contains `predict`, `output` -> `output_prediction`
- contains `completion`, `drag` -> `drag_and_fill`
- contains `syntax`, `debug`, `error`, `logic` -> `debug`
- contains `fill`, `blank` -> `fill_blank`

Validator rule: canonical value must already match mapped value.

## 4) Version Object Contract

Each language version is expected in canonical shape:

```json
{
  "prompt": {
    "...format-specific fields...": "..."
  },
  "evaluation": {
    "...grading fields...": "..."
  }
}
```

`clean-puzzles.js` retains only these prompt fields:

- `code`
- `codeTemplate`
- `buggyCode`
- `question`
- `options`
- `tokens`
- `lines`
- `blankCount`
- `shuffleOnServe`

`clean-puzzles.js` retains only these evaluation fields:

- `correctAnswer`
- `acceptedAnswers`
- `correctOrder`
- `expectedStdout`
- `solutionCode`

## 5) Per-Format Prompt and Evaluation Fields

Observed usage in current dataset:

### 5.1 output_prediction

Prompt fields:

- `code`

Evaluation fields:

- `correctAnswer`
- `acceptedAnswers`
- `expectedStdout`
- `solutionCode`

### 5.2 fill_blank

Prompt fields:

- `codeTemplate`
- `blankCount`

Evaluation fields:

- `correctAnswer`
- `acceptedAnswers`
- `expectedStdout`
- `solutionCode`

### 5.3 debug

Prompt fields:

- `buggyCode`

Evaluation fields:

- `correctAnswer`
- `acceptedAnswers`
- `expectedStdout`
- `solutionCode`

### 5.4 rearrange

Prompt fields:

- `lines`
- `shuffleOnServe`

Evaluation fields:

- `correctAnswer`
- `correctOrder`
- `expectedStdout`
- `solutionCode`

### 5.5 multiple_choice

Prompt fields:

- `code`
- `question`
- `options`

Evaluation fields:

- `correctAnswer`
- `acceptedAnswers`
- `expectedStdout`
- `solutionCode`

### 5.6 drag_and_fill

Prompt fields:

- `codeTemplate`
- `tokens`
- `blankCount`

Evaluation fields:

- `correctAnswer`
- `correctOrder`
- `expectedStdout`
- `solutionCode`

## 6) Playability and Renderability Constraints

A puzzle is considered valid only when all three languages are renderable and gradable.

Renderability rules (runtime):

- `fill_blank` / `output_prediction`: non-empty code block must exist.
- `drag_and_fill`: code contains one or more `_____` blanks and has at least one option/token.
- `multiple_choice`: at least 2 options.
- `rearrange`: at least 2 lines.
- `debug`: non-empty buggy code.

Gradability rules (runtime):

- Most formats require at least one extractable expected answer candidate.
- `rearrange` requires at least 2 expected lines (`correctOrder` preferred, fallback to prompt lines).

Runtime strict mode also requires each language version to have:

- `evaluation.solutionCode`

`evaluation.expectedStdout` is still strongly recommended because it makes the contract explicit, but runtime can infer the expected stdout by compiling and running `solutionCode` when that field is absent.

These are required for local compile+execute verification.

## 7) Grading Behavior Details (Important)

### 7.1 String comparison

- Case-insensitive after normalization.
- Collapses extra whitespace.
- Substring tolerance is allowed for short-answer matching in some cases.

### 7.2 multiple_choice

- Matches direct answer text.
- Can match option labels (`A`, `B`, etc.) if labels are present.
- Can match selected option text when labels are used.

### 7.3 drag_and_fill

- Prefers `evaluation.correctOrder` token-by-token comparison against submitted blank order.
- Fallback compares reconstructed code with expected candidates.

### 7.4 rearrange

- Prefers submitted `rearrangedLines` when present.
- Fallback uses `dragOrder` against server-provided shuffled lines.
- Requires line-by-line order equality after normalization.

## 8) Security and Client Payload Rules

- Runtime sanitizes tasks before sending to clients.
- `evaluation` block is never sent to gameplay clients.
- `scripts/strip-answers.js` builds `data/puzzles-safe.json` from sanitized tasks.

## 9) Generation/Cleaning/Validation Workflow

### 9.1 Regenerate and clean

```bash
npm run generate:puzzles
```

This runs normalization and cleaning (`clean-puzzles.js`), including:

- canonicalizing difficulty + format
- dropping unsupported fields
- removing duplicate IDs
- removing unplayable or illogical puzzles
- sorting by numeric `id`

### 9.2 Validate dataset

```bash
npm run validate:puzzles
```

Validator checks:

- file exists and top-level array
- ID presence and uniqueness
- numeric ID schema and contiguous ID logic by difficulty range
- canonical difficulty/format
- puzzle playability for all three language versions
- parseability check per available language (`verifyAnswer` must not return `unparseable`)

### 9.3 Strict runtime checks

```bash
npm run validate:puzzles:runtime
```

Use this for stricter parseability/playability checks across language variants.

In runtime mode, the validator compiles/runs locally and compares stdout:

- Python: `python main.py`
- Java: `javac Main.java` then `java -cp <dir> Main`
- C: `gcc main.c -O2 -o main` then execute binary

Runtime mode fails if local compiler/interpreter is missing.

This is the speed/reliability setup for local validation: direct local execution, short process timeouts, and isolated temp directories.

## 10) Hard Constraints Checklist (Authoring)

When adding/editing a puzzle, enforce all items below:

- `id` is a numeric string and follows strict difficulty-range sequence.
- `difficulty` is exactly one of: `easy`, `medium`, `hard`.
- `format` is exactly one of canonical format names.
- `title` and `description` are non-empty useful text.
- All of `python`, `java`, `c` must exist with valid prompt + evaluation.
- Prompt fields follow the format contract.
- Evaluation contains enough signal for grading (answer candidates or `correctOrder`).
- Evaluation includes `solutionCode` for each language.
- Add `expectedStdout` when you want the output contract to be explicit, but it is no longer required for validation if `solutionCode` is present and executable.
- `rearrange` has at least 2 lines and a valid correct order.
- `multiple_choice` has at least 2 options.
- `drag_and_fill` uses `_____` placeholders and aligned token/correctOrder data.
- Dataset still passes `npm run validate:puzzles`.
- Dataset also passes `npm run validate:puzzles:runtime` on a machine with local compilers.

## 11) Full Sample Puzzle (Canonical)

```json
{
  "id": "1201",
  "difficulty": "easy",
  "format": "drag_and_fill",
  "title": "Easy Drag Compare 1",
  "description": "Drag the correct comparator into the blank.",
  "versions": {
    "python": {
      "prompt": {
        "codeTemplate": "a = 9\nb = 3\nif a _____ b:\n    print(a)\nelse:\n    print(b)",
        "tokens": [">", "<", "==", ">=", "<="],
        "blankCount": 1
      },
      "evaluation": {
        "correctAnswer": "a > b",
        "correctOrder": [">"],
        "expectedStdout": "9",
        "solutionCode": "def max_val(a, b):\n    return a if a > b else b\n\nprint(max_val(9, 3))"
      }
    },
    "java": {
      "prompt": {
        "codeTemplate": "int a = 9;\nint b = 3;\nif (a _____ b) {\n  System.out.println(a);\n} else {\n  System.out.println(b);\n}",
        "tokens": [">", "<", "==", ">=", "<="],
        "blankCount": 1
      },
      "evaluation": {
        "correctAnswer": "a > b",
        "correctOrder": [">"],
        "expectedStdout": "9",
        "solutionCode": "public class Main {\n  public static void main(String[] args) {\n    int a = 9;\n    int b = 3;\n    int ans = (a > b) ? a : b;\n    System.out.println(ans);\n  }\n}"
      }
    },
    "c": {
      "prompt": {
        "codeTemplate": "int a = 9;\nint b = 3;\nif (a _____ b) {\n  printf(\"%d\\n\", a);\n} else {\n  printf(\"%d\\n\", b);\n}",
        "tokens": [">", "<", "==", ">=", "<="],
        "blankCount": 1
      },
      "evaluation": {
        "correctAnswer": "a > b",
        "correctOrder": [">"],
        "expectedStdout": "9",
        "solutionCode": "#include <stdio.h>\n\nint main(void) {\n  int a = 9;\n  int b = 3;\n  int ans = (a > b) ? a : b;\n  printf(\"%d\\n\", ans);\n  return 0;\n}"
      }
    }
  }
}
```

## 12) Notes for Downstream Teams

- Treat `data/puzzles.json` as server-private authoritative data.
- If you need client-visible data, consume `data/puzzles-safe.json` instead of raw source.
- Keep this contract updated whenever `puzzleEngine.js` normalization or grading logic changes.

## 13) Current Implementation Snapshot

Current grading and validation implementation:

- Gameplay grading (`verifyAnswer`) is deterministic and format-aware (fast, non-sandboxed string/structure matching).
- Runtime local compilation is enforced by `scripts/validate-puzzles.js --runtime`.
- Compile+run validation checks solution code and expected stdout for all three languages.
- The runtime validator uses local toolchain binaries for speed and reliability.

Observed local toolchain (this workspace machine):

- Python: available
- Java (`javac`/`java`): available
- C (`gcc`): available
