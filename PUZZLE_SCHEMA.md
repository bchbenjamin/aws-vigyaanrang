# PUZZLE_SCHEMA.md

This is the authoritative schema for the root puzzle bank at `data/puzzles.json`.

## Scope

- Source of truth: `data/puzzles.json`
- Shape: top-level JSON array
- Total puzzles: `75`
- Difficulty distribution:
  - `easy`: `30`
  - `medium`: `30`
  - `hard`: `15`
- Required language variants per puzzle: `python`, `java`, `c`
- Allowed formats only:
  - `output_prediction`
  - `multiple_choice`

## Top-level object contract

Each puzzle must follow:

```json
{
  "id": "string",
  "difficulty": "easy | medium | hard",
  "format": "output_prediction | multiple_choice",
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
- `format` must be canonical and in the allowlist above.
- All three language versions must exist.

## ID policy (strict)

IDs encode difficulty and must be contiguous with no gaps.

- `easy`: `1001` to `1030`
- `medium`: `2001` to `2030`
- `hard`: `3001` to `3015`

Validation fails when:

- an ID is outside its difficulty range,
- any range has missing IDs,
- any range has duplicates,
- any range count is not exact.

## Version contract

Each language version is canonical:

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

### `output_prediction`

Prompt fields:

- `code`

Evaluation fields:

- `correctAnswer` (exact target output)
- `acceptedAnswers` (additional accepted forms)
- `expectedStdout` (explicit runtime output contract)
- `solutionCode` (compilable/executable reference implementation)

### `multiple_choice`

Prompt fields:

- `question`
- `code`
- `options`

Evaluation fields:

- `correctAnswer` (exact expected choice/output)
- `acceptedAnswers` (optional aliases)
- `expectedStdout`
- `solutionCode`

## Runtime validation expectations

In `--runtime` mode, validation compiles/runs every language variant:

- Python: `python`
- Java: `javac` + `java`
- C: `gcc`

Runtime checks assert:

- `solutionCode` exists for each language,
- solution compiles and executes successfully,
- when `expectedStdout` is present, it matches actual stdout.

## Path contract for backend utilities

The backend uses root path only:

- `server.js` reads `data/puzzles.json`
- `scripts/validate-puzzles.js` validates `data/puzzles.json`
- `scripts/clean-puzzles.js` reads/writes `data/puzzles.json`
- `scripts/strip-answers.js` reads `data/puzzles.json`

No `src/data/puzzles.json` source path is part of this contract.
