# PUZZLE.md

UI-first puzzle authoring guide for the root dataset at `data/puzzles.json`.

This file defines strict content instructions so puzzles render clearly in the in-game task panel.
For schema-level contract details, also see `PUZZLE_SCHEMA.md`.

## 1) Dataset Scope

- Source of truth: `data/puzzles.json`
- Total puzzles: `450`
- Difficulty split:
	- `easy`: `200`
	- `medium`: `200`
	- `hard`: `50`
- Supported formats:
	- `output_prediction`
	- `multiple_choice`
	- `drag_and_drop`
	- `fill_in_the_blanks`
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
	 - Question text block (from `prompt.question`)
	 - Code block (from `prompt.code`)
	 - Options list (for `multiple_choice`, from `prompt.options`)
	 - Blank fields (for `fill_in_the_blanks`, from `prompt.blanks`)
	 - Draggable items (for `drag_and_drop`, from `prompt.items`)

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

### 3.4 `drag_and_drop` prompt rules

- `prompt.question` should clearly state what items need to be arranged.
- `prompt.code` can contain context or a target code block with drop zones.
- `prompt.items` must list the items to drag.

### 3.5 `fill_in_the_blanks` prompt rules

- `prompt.question` must be a short natural-language prompt.
- `prompt.code` should contain the snippet with blanks clearly marked.
- `prompt.blanks` should list the available options for each blank.

`prompt.question` must NOT:
- include code fragments,
- include long token streams,
- include semicolon/braces-heavy pseudo code,
- include embedded line-broken source.

Recommended question text:
- `What is printed to stdout?`
- `Arrange the blocks to complete the code.`
- `Fill in the blanks to make the code compile.`

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

## 6) Unified Schema Info

This is the authoritative schema for the root puzzle bank at `data/puzzles.json`.

### Top-level object contract

Each puzzle must follow:

```json
{
  "id": "string",
  "difficulty": "easy | medium | hard",
  "format": "output_prediction | multiple_choice | drag_and_drop | fill_in_the_blanks",
  "title": "string",
  "description": "string",
  "versions": {
    "python": { "prompt": {}, "evaluation": {} },
    "java": { "prompt": {}, "evaluation": {} },
    "c": { "prompt": {}, "evaluation": {} }
  }
}
```

Rules:

- `id` is required, unique, and numeric-string only.
- `difficulty` must be canonical (`easy`, `medium`, `hard`).
- `format` must be canonical.
- All three language versions must exist.

### Evaluation and Prompt fields by format

#### `output_prediction`

Prompt fields:
- `code`

Evaluation fields:
- `correctAnswer` (exact target output)
- `acceptedAnswers` (additional accepted forms)
- `expectedStdout` (explicit runtime output contract)
- `solutionCode` (compilable/executable reference implementation)

#### `multiple_choice`

Prompt fields:
- `question`
- `code`
- `options`

Evaluation fields:
- `correctAnswer` (exact expected choice/output)
- `acceptedAnswers` (optional aliases)
- `expectedStdout`

#### `drag_and_drop`

Prompt fields:
- `question`
- `code`
- `items`

Evaluation fields:
- `correctOrder` (array of items in correct order)

#### `fill_in_the_blanks`

Prompt fields:
- `question`
- `code`
- `blanks`

Evaluation fields:
- `correctAnswers` (map or array of correct entries for each blank)

## 7) Team Checklist Before Merge

1. Confirm IDs are unique.
2. Confirm only canonical formats are used.
3. Confirm all puzzles include `python`, `java`, and `c` versions.
4. For `multiple_choice`, `drag_and_drop`, and `fill_in_the_blanks`, verify question is plain language and code represents snippets accurately.
5. Run `npm run validate:puzzles`.
6. Run `npm run validate:puzzles:runtime` on a machine with Python, Java, and GCC available.

## 7) Operational Notes

- Runtime loader: `server.js` reads `data/puzzles.json`.
- Cleaner: `scripts/clean-puzzles.js` normalizes and removes malformed multiple-choice question text.
- Validator: `scripts/validate-puzzles.js` enforces schema and runtime compilation checks.

This guide is intentionally UI-oriented so authored content remains readable and visually clean in-game.
