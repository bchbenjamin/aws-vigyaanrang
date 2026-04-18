// ============================================================
//  Breach & Defend — Task Bank
//  Driven by JSON database puzzle definitions
// ============================================================

import puzzlesData from '../data/puzzles.json';

export type TaskFormat = 'fill_blank' | 'drag_and_fill' | 'rearrange' | 'multiple_choice' | 'debug' | 'code_completion' | 'output_prediction';
export type Language = 'c' | 'java' | 'python';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface TaskVersion {
  // Common
  correctAnswer?: string;
  // Fill Blank
  blankCode?: string;
  // Drag and Fill
  options?: string[];
  correctOrder?: string[] | number[];
  // Rearrange
  shuffledLines?: string[];
  // Multiple Choice
  question?: string;
  // Debug
  buggyCode?: string;
}

export interface TaskDefinition {
  id: string;
  room: string;
  format: TaskFormat;
  difficulty: Difficulty;
  title: string;
  description: string;
  versions: Record<Language, TaskVersion>;
  isHack?: boolean;
  isFake?: boolean;
}

// Convert puzzles.json into our internal types
const allPuzzles: TaskDefinition[] = (puzzlesData as any[]).map(puzzle => {
  const mapFormat = (fmt: string): TaskFormat => {
    switch (fmt) {
      case 'Output Prediction': return 'output_prediction';
      case 'Multiple Choice Question': return 'multiple_choice';
      case 'Parenthesis Matching': return 'multiple_choice';
      case 'Fill in the Blank': return 'fill_blank';
      case 'Code Completion': return 'code_completion';
      case 'Code Reordering': return 'rearrange';
      default: return 'debug'; // Error Identification, Syntax Error, Debug & Fix, Logic Error
    }
  };

  const format = mapFormat(puzzle.format);
  const diff = String(puzzle.difficulty || 'medium').toLowerCase() as Difficulty;
  const versions: Record<string, TaskVersion> = {};

  ['python', 'java', 'c'].forEach(lang => {
    const rawVersion = puzzle.versions?.[lang];
    if (!rawVersion) return;

    let res: TaskVersion = {
      correctAnswer: String(rawVersion.answer || '').trim()
    };

    if (puzzle.format === 'Output Prediction' || puzzle.format === 'Fill in the Blank' || puzzle.format === 'Code Completion') {
      res.blankCode = rawVersion.code;
    } else if (puzzle.format === 'Multiple Choice Question') {
      res.question = rawVersion.code;
      res.options = rawVersion.options || [];
      res.correctAnswer = rawVersion.answer;
    } else if (puzzle.format === 'Parenthesis Matching') {
      res.question = rawVersion.code;
      res.options = ['A', 'B', 'C']; // Simple fallback
      res.correctAnswer = rawVersion.answer?.charAt(0) || 'A';
    } else if (puzzle.format === 'Code Reordering') {
      // Parse Lines array from the string if needed, or use code directly
      const match = rawVersion.code.match(/Lines: \[([^\]]+)\]/);
      let lines: string[] = [];
      if (match && match[1]) {
        lines = match[1].split(',').map((s: string) => s.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, ''));
      } else {
        lines = rawVersion.code.split('\n');
      }
      res.shuffledLines = lines;
      res.correctOrder = Array.from({length: lines.length}, (_, i) => i); // just a dummy, UI checking relies on exact match or we map it
      res.correctAnswer = rawVersion.answer;
    } else {
      res.buggyCode = rawVersion.code;
      // Use fixed if available, else just match answer text roughly
      res.correctAnswer = rawVersion.fixed || rawVersion.expected_output || rawVersion.answer;
    }
    versions[lang] = res;
  });

  return {
    id: puzzle.id,
    room: 'Any',
    format,
    difficulty: diff,
    title: puzzle.title,
    description: puzzle.description,
    versions: versions as Record<Language, TaskVersion>,
    isHack: diff === 'hard',
    isFake: false
  };
});

export const ALL_REAL_TASKS = allPuzzles;
export const ALL_HACK_TASKS = allPuzzles.filter(p => p.difficulty === 'hard');
export const ALL_FAKE_TASKS: TaskDefinition[] = [];

export const ALL_ROOMS = ['Frontend', 'Main Database', 'API Gateway', 'Server Room', 'QA Testing Lab', 'The Log Room', 'Breakroom'];
export const ROOMS_WITH_TASKS = ['Frontend', 'Main Database', 'API Gateway', 'Server Room', 'QA Testing Lab'];

export function getTasksForRoom(room: string): TaskDefinition[] {
  void room;
  return ALL_REAL_TASKS;
}

export function getRandomTask(room: string): TaskDefinition | null {
  const tasks = getTasksForRoom(room);
  if (tasks.length === 0) return null;
  return tasks[Math.floor(Math.random() * tasks.length)];
}

export function getRandomHackTask(): TaskDefinition {
  return ALL_HACK_TASKS[Math.floor(Math.random() * ALL_HACK_TASKS.length)];
}

export function getRandomFakeTask(): TaskDefinition {
  return ALL_FAKE_TASKS[Math.floor(Math.random() * ALL_FAKE_TASKS.length)];
}
