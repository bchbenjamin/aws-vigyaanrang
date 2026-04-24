# PUZZLE.md

Authoring and validation guide for the runtime puzzle dataset at data/puzzles.json.

## Scope

- Source of truth: data/puzzles.json
- Runtime-supported formats:
- output_prediction
- multiple_choice
- Required language variants:
- python
- java
- c

## Canonical puzzle shape

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
- id must be unique and follow the project id pattern.
- difficulty must be easy, medium, or hard.
- format must be output_prediction or multiple_choice.
- all three language versions must exist.

## Prompt authoring

Output prediction:
- Use prompt.code for the snippet.
- Keep code readable and multiline when needed.
- Do not leak answer text in code comments.

Multiple choice:
- Use prompt.question for natural-language prompt text.
- Use prompt.code for the code snippet.
- Use prompt.options for selectable answers only.
- Keep question and code logically separate.
- Multiline question and multiline options are supported.

## Multiline answers

Runtime and UI both support multiline answers:
- Players can type real multiline answers in the editor textarea.
- Client submission serializes newlines safely.
- Grading normalizes both real newlines and escaped \n sequences.
- Legacy whitespace-separated entries remain compatible.

## Evaluation fields

Required per language variant:
- evaluation.correctAnswer
- evaluation.expectedStdout
- evaluation.solutionCode

Optional:
- evaluation.acceptedAnswers

## Validation commands

```bash
npm run validate:puzzles
npm run validate:puzzles:runtime
npm test
```

## Release checklist

1. Confirm IDs are unique.
2. Confirm only output_prediction and multiple_choice formats are used.
3. Confirm all puzzles include python, java, and c versions.
4. Confirm multiline question/options render correctly in multiple-choice tasks.
5. Run validation and tests.
6. Run a secret scan and confirm no credentials are committed.
