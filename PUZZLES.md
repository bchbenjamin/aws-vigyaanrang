# Breach & Defend Puzzle Guide

All task and puzzle configurations in Breach & Defend are stored in `src/data/puzzles.json`.

With the **Zero-Trust Validation Architecture**, the server securely grades all submissions, meaning `puzzles.json` is **never sent to the client**. All answers are removed from the payload before routing via WebSocket, completely eliminating cheating.

## Puzzle Formats

You can define puzzles across 6 different formats. Each format corresponds to a different UI control in the `CodeEditor`.

## Compatibility and graceful fallback

- The parser now normalizes several human labels to internal formats.
  - `Logic Error Detection`, `Error Identification`, `Syntax Error Detection`, and `Debug & Fix` map to `debug`.
  - `Parenthesis Matching` maps to `multiple_choice`.
  - `Code Completion` and `Drag and Fill` map to `drag_and_fill` when options are available; otherwise they gracefully fall back to `fill_blank`.
- Completion tasks that provide an answer key but no starter code are converted to open-response `debug` prompts so they remain playable.
- Difficulty labels are normalized into `easy`, `medium`, and `hard` (for example `leetcode_easy` is treated as `hard`).
- If a task cannot be safely rendered or graded, the runtime skips/replaces it and does not penalize the player.

### 1. Debug
The user is provided with buggy code and a plain text editor to correct the mistakes.
- `format`: `"Syntax Error"`, `"Error Identification"`, `"Debug & Fix"`, `"Logic Error"`
- `versions[lang].code`: The buggy code.
- `versions[lang].answer`: The corrected code to be checked against. 

### 2. Fill in the Blank
The user is given code with a single `_____` blank and types the missing keyword.
- `format`: `"Fill in the Blank"`
- `versions[lang].code`: Code with one or more `_____` instances.
- `versions[lang].answer`: The exact string to replace the blank.

### 3. Drag and Fill
The user drags draggable chips into multiple blanks `_____` within code blocks.
- `format`: `"Code Completion"`
- `versions[lang].code`: Code with ordered `_____` blanks.
- `versions[lang].options`: An array of draggable choices.
- If `options` is omitted, the parser will try to derive choices from a token bank inside `code`, e.g. `Tokens: [if, >, else]`.
- `versions[lang].answer`: The canonical solved output/snippet used by server-side grading.

### 4. Code Reordering
The user is given blocks of code (lines) that are shuffled, and must drag them into the correct logical sequence.
- `format`: `"Code Reordering"`
- `versions[lang].code`: The lines of correct code, either separated by `\n` or as a stringified array `Lines: ["Line 1", "Line 2"]`.

### 5. Multiple Choice Question
The user selects a single correct choice from a set of options.
- `format`: `"Multiple Choice Question"`
- `versions[lang].code`: The instruction string or snippet.
- `versions[lang].options`: An array of strings representing the choices.
- `versions[lang].answer`: The correct option string.

For parenthesis-style questions, labeled lines like `A: ...`, `B: ...`, `C: ...` in `code` are also recognized as options.

### 6. Output Prediction
The user is presented with a functioning code block, and types the evaluated output.
- `format`: `"Output Prediction"`
- `versions[lang].code`: The executable snippet.
- `versions[lang].answer`: The exact console output expected.

### Adding New Tasks
You must wrap new tasks in an object holding the generic metadata, and versions nested by language `python`, `java`, `c`.

```json
{
  "id": "t_uniqueid",
  "title": "Title Here",
  "description": "Flavor text lore...",
  "format": "Multiple Choice Question",
  "difficulty": "easy",
  "versions": {
    "python": {
      "code": "print(1 + 1)",
      "options": ["1", "2", "3"],
      "answer": "2"
    }
  }
}
```
