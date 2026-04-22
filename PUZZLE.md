# PUZZLE.md

UI-first puzzle authoring guide for the root dataset at `data/puzzles.json`.

This file defines strict content instructions so puzzles render clearly in the in-game task panel.
For schema-level contract details, also see `PUZZLE_SCHEMA.md`.

## 1) Dataset Scope

- Source of truth: `data/puzzles.json`
- Total puzzles: `75`
- Difficulty split:
	- `easy`: `30` (IDs `1001` to `1030`)
	- `medium`: `30` (IDs `2001` to `2030`)
	- `hard`: `15` (IDs `3001` to `3015`)
- Supported formats only:
	- `output_prediction`
	- `multiple_choice`
- Every puzzle must contain all three language versions:
	- `python`
	- `java`
	- `c`

## 2) How The UI Renders These Fields

The task UI has two separate text regions:

1. Header/description area:
	 - `title`
	 - `description`

2. Prompt area:
	 - Question text block (for `multiple_choice`, from `prompt.question`)
	 - Code block (from `prompt.code`)
	 - Options list (from `prompt.options`)

Important: `question` and `code` are rendered as separate blocks.
Do not combine code-like content into `question`.

## 3) Strict Authoring Rules (UI-safe)

### 3.1 Title and description

- `title` must be short and readable.
- Do not rely on ID suffixes for meaning.
- `description` should state the player objective clearly in one sentence.

### 3.2 `output_prediction` prompt rules

- Use `prompt.code` only.
- Code must be multiline where appropriate and human-readable.
- Do not include answer text inside `prompt.code` comments.

### 3.3 `multiple_choice` prompt rules

- `prompt.question` must be a short natural-language prompt.
- `prompt.code` must contain the actual snippet being evaluated.
- `prompt.options` must contain clean answer options only (no explanatory prose).

`prompt.question` must NOT:
- include code fragments,
- include long token streams,
- include semicolon/braces-heavy pseudo code,
- include embedded line-broken source.

Recommended question text:
- `What is printed to stdout?`

## 4) Malformed Question Handling Policy

If `multiple_choice.prompt.question` violates UI-safe rules, it is considered malformed.

Malformed question examples:
- Question includes code tokens like `for`, `if`, `print`, `System.out.println`, `printf`, `def`.
- Question is excessively long and looks like compressed source.
- Question includes symbols typical of code blobs (`{}`, `;`) instead of plain prompt text.

Pipeline behavior (enforced in cleaner):
- Malformed `question` is removed.
- Puzzle remains valid if `prompt.code` and `prompt.options` are valid.
- UI falls back to default prompt text instead of showing broken content.

In short: if the question violates format, ignore/remove it.

## 5) Evaluation Rules (authoring)

Each language version must include:
- `evaluation.correctAnswer`
- `evaluation.expectedStdout`
- `evaluation.solutionCode`

`acceptedAnswers` may be used for equivalent textual forms.

## 6) Team Checklist Before Merge

1. Confirm IDs are in the exact allowed ranges and contiguous.
2. Confirm only `output_prediction` and `multiple_choice` are used.
3. Confirm all puzzles include `python`, `java`, and `c` versions.
4. For `multiple_choice`, verify question is plain language and code is in `prompt.code`.
5. Run `npm run validate:puzzles`.
6. Run `npm run validate:puzzles:runtime` on a machine with Python, Java, and GCC available.

## 7) Operational Notes

- Runtime loader: `server.js` reads `data/puzzles.json`.
- Cleaner: `scripts/clean-puzzles.js` normalizes and removes malformed multiple-choice question text.
- Validator: `scripts/validate-puzzles.js` enforces schema and runtime compilation checks.

This guide is intentionally UI-oriented so authored content remains readable and visually clean in-game.
