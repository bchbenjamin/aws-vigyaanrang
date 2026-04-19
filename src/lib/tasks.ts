// ============================================================
//  Breach & Defend — Task Types & Client-Side Task Bank
//  answers are NEVER present here — stripped at build time
//  by scripts/strip-answers.js → puzzles-safe.json
// ============================================================

import rawPuzzles from '@/data/puzzles-safe.json';

// ── Types ────────────────────────────────────────────────────

export type TaskFormat =
  | 'fill_blank'
  | 'output_prediction'
  | 'drag_and_fill'
  | 'rearrange'
  | 'multiple_choice'
  | 'debug';

export type Language   = 'c' | 'java' | 'python';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface TaskVersion {
  // fill_blank / output_prediction
  blankCode?:    string;
  // multiple_choice
  question?:     string;
  options?:      string[];
  // rearrange
  shuffledLines?: string[];
  // debug
  buggyCode?:    string;
}

export interface TaskDefinition {
  id:          string;
  title:       string;
  description: string;
  format:      TaskFormat;
  difficulty:  Difficulty;
  versions:    Partial<Record<Language, TaskVersion>>;
}

// ── Build the lookup map ─────────────────────────────────────

export const ALL_TASKS: TaskDefinition[] = rawPuzzles as TaskDefinition[];

export const TASK_MAP: Map<string, TaskDefinition> = new Map(
  ALL_TASKS.map(t => [t.id, t])
);

export function getTask(id: string | null | undefined): TaskDefinition | null {
  if (!id) return null;
  return TASK_MAP.get(id) ?? null;
}

// ── Room constants ───────────────────────────────────────────

export const ALL_ROOMS       = ['Frontend', 'Main Database', 'API Gateway', 'Server Room', 'QA Testing Lab', 'The Log Room', 'Breakroom'];
export const ROOMS_WITH_TASKS = ['Frontend', 'Main Database', 'API Gateway', 'Server Room', 'QA Testing Lab'];
