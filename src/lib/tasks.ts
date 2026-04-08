// ============================================================
//  Breach & Defend — Task Bank
//  3 Formats: Debugging, Fill-in-the-Blank, Rearrange Lines
//  Dynamic Language Toggling: C, Java, Python mid-question
// ============================================================

export type TaskFormat = 'debug' | 'fill_blank' | 'rearrange';
export type Language = 'c' | 'java' | 'python';

export interface TaskVersion {
  buggyCode?: string;
  blankCode?: string;
  shuffledLines?: string[];
  correctAnswer: string;
  correctOrder?: number[];
}

export interface TaskDefinition {
  id: string;
  room: string;
  format: TaskFormat;
  title: string;
  description: string;
  versions: Record<Language, TaskVersion>;
  isSabotage?: boolean;
}

// ─── FRONTEND ROOM TASKS ───────────────────────────────────
const frontendTasks: TaskDefinition[] = [
  {
    id: 'fe-debug-1',
    room: 'Frontend',
    format: 'debug',
    title: 'Fix the Loop Counter',
    description: 'This loop should run exactly 5 times printing 1 to 5, but it has a bug. Fix the single error.',
    versions: {
      python: {
        buggyCode: `for i in range(1, 5):\n    print(i)`,
        correctAnswer: `for i in range(1, 6):\n    print(i)`,
      },
      java: {
        buggyCode: `for (int i = 1; i < 5; i++) {\n    System.out.println(i);\n}`,
        correctAnswer: `for (int i = 1; i <= 5; i++) {\n    System.out.println(i);\n}`,
      },
      c: {
        buggyCode: `for (int i = 1; i < 5; i++) {\n    printf("%d", i);\n}`,
        correctAnswer: `for (int i = 1; i <= 5; i++) {\n    printf("%d", i);\n}`,
      }
    }
  },
  {
    id: 'fe-fill-1',
    room: 'Frontend',
    format: 'fill_blank',
    title: 'Print a String',
    description: 'Fill in the blank to print "Hello" to the standard output.',
    versions: {
      python: { blankCode: `_____("Hello")`, correctAnswer: `print` },
      java: { blankCode: `System.out._____("Hello");`, correctAnswer: `println` },
      c: { blankCode: `_____("Hello");`, correctAnswer: `printf` }
    }
  }
];

// ─── MAIN DATABASE ROOM TASKS ──────────────────────────────
const databaseTasks: TaskDefinition[] = [
  {
    id: 'db-fill-1',
    room: 'Main Database',
    format: 'fill_blank',
    title: 'Array Initialization',
    description: 'Fill in the blank to declare an array/list of size 10 (or with 10 elements).',
    versions: {
      python: { blankCode: `arr = [0] * _____`, correctAnswer: `10` },
      java: { blankCode: `int[] arr = new int[_____];`, correctAnswer: `10` },
      c: { blankCode: `int arr[_____];`, correctAnswer: `10` }
    }
  },
  {
    id: 'db-rearrange-1',
    room: 'Main Database',
    format: 'rearrange',
    title: 'Return the Sum',
    description: 'Arrange the lines to create a valid function/method that returns the sum of two integers.',
    versions: {
      python: {
        shuffledLines: ['    return a + b', 'def add(a, b):'],
        correctOrder: [1, 0],
        correctAnswer: `def add(a, b):\n    return a + b`
      },
      java: {
        shuffledLines: ['    return a + b;', 'public int add(int a, int b) {', '}'],
        correctOrder: [1, 0, 2],
        correctAnswer: `public int add(int a, int b) {\n    return a + b;\n}`
      },
      c: {
        shuffledLines: ['    return a + b;', '}', 'int add(int a, int b) {'],
        correctOrder: [2, 0, 1],
        correctAnswer: `int add(int a, int b) {\n    return a + b;\n}`
      }
    }
  }
];

// ─── API GATEWAY ROOM TASKS ────────────────────────────────
const apiTasks: TaskDefinition[] = [
  {
    id: 'api-debug-1',
    room: 'API Gateway',
    format: 'debug',
    title: 'Fix the Return Type',
    description: 'This function should return an integer, but the signature or statement is flawed.',
    versions: {
      python: {
        buggyCode: `def get_value():\n    print(42)`,
        correctAnswer: `def get_value():\n    return 42`
      },
      java: {
        buggyCode: `public void getValue() {\n    return 42;\n}`,
        correctAnswer: `public int getValue() {\n    return 42;\n}`
      },
      c: {
        buggyCode: `void get_value() {\n    return 42;\n}`,
        correctAnswer: `int get_value() {\n    return 42;\n}`
      }
    }
  }
];

// ─── SERVER ROOM TASKS ─────────────────────────────────────
const serverTasks: TaskDefinition[] = [
  {
    id: 'srv-debug-1',
    room: 'Server Room',
    format: 'debug',
    title: 'Syntax Fix',
    description: 'Find and fix the syntax error causing compilation/execution failure.',
    versions: {
      python: {
        buggyCode: `def greet(name)\n    return "Hi, " + name`,
        correctAnswer: `def greet(name):\n    return "Hi, " + name`
      },
      java: {
        buggyCode: `int x = 10\nSystem.out.println(x);`,
        correctAnswer: `int x = 10;\nSystem.out.println(x);`
      },
      c: {
        buggyCode: `int x = 10\nprintf("%d", x);`,
        correctAnswer: `int x = 10;\nprintf("%d", x);`
      }
    }
  }
];

// ─── QA TESTING LAB TASKS ──────────────────────────────────
const qaTasks: TaskDefinition[] = [
  {
    id: 'qa-fill-1',
    room: 'QA Testing Lab',
    format: 'fill_blank',
    title: 'Equality Check',
    description: 'Fill in the blank to check if two variables are equal.',
    versions: {
      python: { blankCode: `if a _____ b:\n    print("Equal")`, correctAnswer: `==` },
      java: { blankCode: `if (a _____ b) {\n    System.out.print("Equal");\n}`, correctAnswer: `==` },
      c: { blankCode: `if (a _____ b) {\n    printf("Equal");\n}`, correctAnswer: `==` }
    }
  }
];

// ─── SABOTAGE TASKS (for Hackers) ──────────────────────────
const sabotageTasks: TaskDefinition[] = [
  {
    id: 'sab-debug-1',
    room: '*',
    format: 'debug',
    title: '[SABOTAGE] Break the Logic Gate',
    description: 'Modify this function so it ALWAYS evaluates to true, overriding security.',
    isSabotage: true,
    versions: {
      python: {
        buggyCode: `def is_valid():\n    return False`,
        correctAnswer: `def is_valid():\n    return True`
      },
      java: {
        buggyCode: `public boolean isValid() {\n    return false;\n}`,
        correctAnswer: `public boolean isValid() {\n    return true;\n}`
      },
      c: {
        buggyCode: `int is_valid() {\n    return 0;\n}`,
        correctAnswer: `int is_valid() {\n    return 1;\n}`
      }
    }
  }
];

// ─── FAKE TASKS (Hackers see these as cover) ──────────────
const fakeTasks: TaskDefinition[] = [
  {
    id: 'fake-fill-1',
    room: '*',
    format: 'fill_blank',
    title: 'Equality Check',
    description: 'Fill in the blank to check if two variables are equal.',
    versions: {
      python: { blankCode: `if a _____ b:\n    print("Equal")`, correctAnswer: `==` },
      java: { blankCode: `if (a _____ b) {\n    System.out.print("Equal");\n}`, correctAnswer: `==` },
      c: { blankCode: `if (a _____ b) {\n    printf("Equal");\n}`, correctAnswer: `==` }
    }
  }
];

// ─── MASTER EXPORT ────────────────────────────────────────
export const ALL_REAL_TASKS: TaskDefinition[] = [
  ...frontendTasks,
  ...databaseTasks,
  ...apiTasks,
  ...serverTasks,
  ...qaTasks,
];

export const ALL_SABOTAGE_TASKS: TaskDefinition[] = sabotageTasks;
export const ALL_FAKE_TASKS: TaskDefinition[] = fakeTasks;

export const ROOMS_WITH_TASKS = ['Frontend', 'Main Database', 'API Gateway', 'Server Room', 'QA Testing Lab'];
export const ALL_ROOMS = ['Frontend', 'Main Database', 'API Gateway', 'Server Room', 'QA Testing Lab', 'The Log Room', 'Breakroom'];

export function getTasksForRoom(room: string): TaskDefinition[] {
  return ALL_REAL_TASKS.filter((t) => t.room === room);
}

export function getRandomTask(room: string): TaskDefinition | null {
  const tasks = getTasksForRoom(room);
  if (tasks.length === 0) return null;
  return tasks[Math.floor(Math.random() * tasks.length)];
}

export function getRandomSabotageTask(): TaskDefinition {
  return ALL_SABOTAGE_TASKS[Math.floor(Math.random() * ALL_SABOTAGE_TASKS.length)];
}

export function getRandomFakeTask(): TaskDefinition {
  return ALL_FAKE_TASKS[Math.floor(Math.random() * ALL_FAKE_TASKS.length)];
}
