// ============================================================
//  Breach & Defend — Task Bank
//  Driven by JSON database puzzle definitions
// ============================================================

import puzzlesData from '../data/puzzles.json';

export type TaskFormat = 'fill_blank' | 'drag_and_fill' | 'rearrange' | 'multiple_choice' | 'debug';
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

// Ensure the JSON matches our defined types
const allPuzzles = puzzlesData as TaskDefinition[];

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
