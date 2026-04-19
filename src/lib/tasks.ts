// ============================================================
//  Breach & Defend — Shared Task Types
//  Task data is delivered over WebSockets from server-sanitized
//  payloads, never from a bundled answer file.
// ============================================================

export type TaskFormat =
  | 'fill_blank'
  | 'output_prediction'
  | 'drag_and_fill'
  | 'rearrange'
  | 'multiple_choice'
  | 'debug';

export type Language   = 'c' | 'java' | 'python';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface TaskPrompt {
  code?: string;
  codeTemplate?: string;
  buggyCode?: string;
  question?: string;
  options?: string[];
  tokens?: string[];
  lines?: string[];
  blankCount?: number;
  shuffleOnServe?: boolean;
}

export interface TaskVersion {
  prompt?: TaskPrompt;
}

export interface TaskDefinition {
  id:          string;
  title:       string;
  description: string;
  format:      TaskFormat;
  difficulty:  Difficulty;
  versions:    Partial<Record<Language, TaskVersion>>;
}
