'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Play, GripVertical, ArrowUp, ArrowDown, Smartphone } from 'lucide-react';
import { type Language, type TaskDefinition } from '@/lib/tasks';

const LANGUAGE_PREF_KEY = 'bd_preferred_language';
const EMPTY_OPTIONS: string[] = [];

type Difficulty = 'easy' | 'medium' | 'hard';

type FillState = Record<number, string>;

type CodeEditorSubmit = {
  isHackTask: boolean;
  taskId: string;
  lang: Language;
  answer: string;
  dragOrder: number[];
  rearrangedLines?: string[];
  fillState: FillState;
};

interface CodeEditorProps {
  taskPayload: TaskDefinition | null;
  isHackTask?: boolean;
  difficultiesAllowed: Difficulty[];
  difficultyResetKey?: string | number;
  systemStatusHint?: string | null;
  disabledMsg?: string | null;
  onRequestTask: (difficulty: Difficulty) => void;
  onSubmit: (result: CodeEditorSubmit) => void;
}

function getStoredLanguage(): Language {
  if (typeof window === 'undefined') return 'python';
  const v = localStorage.getItem(LANGUAGE_PREF_KEY);
  if (v === 'python' || v === 'java' || v === 'c') return v;
  return 'python';
}

function shuffleArray<T>(items: T[]): T[] {
  const array = [...items];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export default function CodeEditor({
  taskPayload,
  isHackTask = false,
  difficultiesAllowed,
  difficultyResetKey,
  systemStatusHint,
  disabledMsg,
  onRequestTask,
  onSubmit,
}: CodeEditorProps) {
  const [activeLang, setActiveLang] = useState<Language>(() => getStoredLanguage());
  const [activeDifficulty, setActiveDifficulty] = useState<Difficulty>('medium');
  const [userAnswer, setUserAnswer] = useState('');
  const [dragOrder, setDragOrder] = useState<number[]>([]);
  const [fillState, setFillState] = useState<FillState>({});
  const [displayOptions, setDisplayOptions] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedToken, setSelectedToken] = useState<string | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  const task = taskPayload ?? null;
  const version = task?.versions?.[activeLang] ?? null;
  const prompt = useMemo<Record<string, any> | null>(() => {
    if (!version || typeof version !== 'object') return null;
    if (version.prompt && typeof version.prompt === 'object') {
      return version.prompt as Record<string, any>;
    }
    return version as Record<string, any>;
  }, [version]);

  const format = task?.format ?? 'fill_blank';
  const codeTemplate = prompt?.codeTemplate ?? prompt?.blankCode ?? '';
  const code = prompt?.code ?? '';
  const buggyCode = prompt?.buggyCode ?? '';
  const lines = useMemo<string[]>(() => {
    if (Array.isArray(prompt?.lines)) return prompt.lines;
    if (Array.isArray(prompt?.shuffledLines)) return prompt.shuffledLines;
    return EMPTY_OPTIONS;
  }, [prompt]);
  const question = useMemo(
    () => [prompt?.question, prompt?.code].filter(Boolean).join('\n\n'),
    [prompt]
  );
  const options = useMemo<string[]>(() => {
    const raw = format === 'drag_and_fill'
      ? (prompt?.tokens ?? prompt?.options)
      : (prompt?.options ?? prompt?.tokens);
    return Array.isArray(raw) ? raw : EMPTY_OPTIONS;
  }, [format, prompt]);
  const displayCode = format === 'output_prediction' ? (code || codeTemplate) : (codeTemplate || code);

  useEffect(() => {
    localStorage.setItem(LANGUAGE_PREF_KEY, activeLang);
  }, [activeLang]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(pointer: coarse)');
    const updateTouchMode = () => setIsTouchDevice(media.matches || window.innerWidth < 900);
    updateTouchMode();
    media.addEventListener?.('change', updateTouchMode);
    window.addEventListener('resize', updateTouchMode);
    return () => {
      media.removeEventListener?.('change', updateTouchMode);
      window.removeEventListener('resize', updateTouchMode);
    };
  }, []);

  useEffect(() => {
    setActiveDifficulty('medium');
  }, [difficultyResetKey]);

  useEffect(() => {
    const taskDifficulty = task?.difficulty;
    if (taskDifficulty !== 'easy' && taskDifficulty !== 'medium' && taskDifficulty !== 'hard') return;
    setActiveDifficulty(prev => (prev === taskDifficulty ? prev : taskDifficulty));
  }, [task?.id, task?.difficulty]);

  useEffect(() => {
    if (!task || !prompt) {
      setUserAnswer('');
      setDragOrder([]);
      setFillState({});
      setDisplayOptions([]);
      setIsSubmitting(false);
      setSelectedToken(null);
      return;
    }

    setIsSubmitting(false);
    setUserAnswer(format === 'debug' ? buggyCode : '');
    setFillState({});
    setSelectedToken(null);

    if (format === 'rearrange' && lines.length > 0) {
      const baseOrder = lines.map((_line, idx) => idx);
      const nextOrder = prompt.shuffleOnServe ? shuffleArray(baseOrder) : baseOrder;
      setDragOrder(nextOrder);
    } else {
      setDragOrder([]);
    }

    if (options.length > 0) {
      setDisplayOptions(shuffleArray(options));
    } else {
      setDisplayOptions([]);
    }
  }, [task, prompt, activeLang, format, buggyCode, lines, options]);

  const updateFillState = (idx: number, value: string | null) => {
    setFillState(prev => {
      const next = { ...prev };
      if (value === null) {
        delete next[idx];
      } else {
        next[idx] = value;
      }
      return next;
    });
  };

  const moveLine = useCallback((fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= dragOrder.length || fromIndex === toIndex) return;
    setDragOrder(prev => {
      const next = [...prev];
      const [removed] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, removed);
      return next;
    });
  }, [dragOrder.length]);

  const handleTokenClick = useCallback((token: string) => {
    setSelectedToken(prev => (prev === token ? null : token));
  }, []);

  const handleBlankClick = useCallback((idx: number) => {
    if (!selectedToken) return;
    updateFillState(idx, selectedToken);
    setSelectedToken(null);
  }, [selectedToken]);

  const handleSubmit = useCallback(() => {
    if (!task || !prompt) return;
    setIsSubmitting(true);
    const rearrangedLines = format === 'rearrange'
      ? dragOrder.map(idx => lines[idx]).filter(Boolean)
      : undefined;
    onSubmit({
      isHackTask,
      taskId: task.id,
      lang: activeLang,
      answer: userAnswer,
      dragOrder,
      rearrangedLines,
      fillState,
    });
  }, [task, prompt, format, dragOrder, lines, onSubmit, isHackTask, activeLang, userAnswer, fillState]);

  if (disabledMsg) {
    return (
      <div className="terminal-box" style={{ textAlign: 'center', padding: '48px 16px' }}>
        <h3 style={{ color: 'var(--text-warning)' }}>Task System Unavailable</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '8px' }}>{disabledMsg}</p>
      </div>
    );
  }

  if (!task || !prompt) {
    return (
      <div className="terminal-box" style={{ textAlign: 'center', padding: '48px 16px' }}>
        <p style={{ color: 'var(--text-muted)' }}>No active task loaded.</p>
        <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '8px' }}>
          Click "Load Task" to fetch a new puzzle.
        </p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '16px' }}>
          <select
            value={activeDifficulty}
            onChange={e => setActiveDifficulty(e.target.value as Difficulty)}
            style={{ width: 'auto', padding: '4px 8px', fontSize: '11px', background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)' }}
          >
            {difficultiesAllowed.map(d => (
              <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
            ))}
          </select>
          <select
            value={activeLang}
            onChange={e => setActiveLang(e.target.value as Language)}
            style={{ width: 'auto', padding: '4px 8px', fontSize: '11px' }}
          >
            <option value="python">Python</option>
            <option value="java">Java</option>
            <option value="c">C</option>
          </select>
          <button className="btn-accent" onClick={() => onRequestTask(activeDifficulty)}>
            Load Task
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0', height: '100%', minHeight: '400px' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 12px', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-primary)',
        flexWrap: 'wrap', gap: '8px'
      }}>
        <span style={{ color: 'var(--text-accent)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px' }}>
          {task.format.replace(/_/g, ' ')} - {task.difficulty}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {systemStatusHint && (
            <span style={{ fontSize: '10px', color: 'var(--text-warning)', textTransform: 'uppercase', letterSpacing: '1px' }}>
              {systemStatusHint}
            </span>
          )}
          <select
            value={activeDifficulty}
            onChange={e => {
              const next = e.target.value as Difficulty;
              setActiveDifficulty(next);
              onRequestTask(next);
            }}
            style={{ width: 'auto', padding: '4px 8px', fontSize: '11px', background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)' }}
          >
            {difficultiesAllowed.map(d => (
              <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
            ))}
          </select>
          <select
            value={activeLang}
            onChange={e => setActiveLang(e.target.value as Language)}
            style={{ width: 'auto', padding: '4px 8px', fontSize: '11px' }}
          >
            <option value="python">Python</option>
            <option value="java">Java</option>
            <option value="c">C</option>
          </select>
        </div>
      </div>

      {isTouchDevice && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 12px',
          borderBottom: '1px solid var(--border-primary)',
          background: 'rgba(255, 180, 0, 0.08)',
          color: 'var(--text-warning)',
          fontSize: '11px',
        }}>
          <Smartphone size={14} />
          <span>Mobile detected. Use Desktop mode for the best drag-and-drop experience. Tap controls are enabled here.</span>
        </div>
      )}

      <div className="split-pane">
        <div className="split-pane-desc">
          <h3 style={{ color: 'var(--text-primary)', fontSize: '14px', marginBottom: '12px' }}>{task.title}</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '12px', lineHeight: '1.8', marginBottom: '16px' }}>{task.description}</p>
          <div style={{
            padding: '8px 12px', background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-primary)', borderRadius: '4px',
            fontSize: '11px', color: 'var(--text-muted)'
          }}>
            <span style={{ color: 'var(--text-info)' }}>Format:</span>{' '}
            {task.format === 'debug' && 'Find and fix the bug in the code.'}
            {(task.format === 'fill_blank' || task.format === 'output_prediction') && 'Type the missing keyword or expression.'}
            {task.format === 'rearrange' && 'Drag and drop lines into the correct order.'}
            {task.format === 'multiple_choice' && 'Select the correct option.'}
            {task.format === 'drag_and_fill' && 'Drag options into the blanks to complete the code.'}
          </div>
        </div>

        <div className="split-pane-editor">
          {task.format === 'debug' && (
            <>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Edit the buggy code below:
              </label>
              <textarea
                className="code-area"
                value={userAnswer}
                onChange={e => setUserAnswer(e.target.value)}
                spellCheck={false}
              />
            </>
          )}

          {(task.format === 'fill_blank' || task.format === 'output_prediction') && (
            <>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Code with blank:
              </label>
              <pre style={{
                background: 'var(--bg-tertiary)', padding: '16px',
                border: '1px solid var(--border-primary)', borderRadius: '4px',
                color: 'var(--text-accent)', fontSize: '13px', lineHeight: '1.8',
                whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)',
              }}>
                {displayCode}
              </pre>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: '8px' }}>
                Your answer (replace the _____):
              </label>
              <input
                type="text"
                value={userAnswer}
                onChange={e => setUserAnswer(e.target.value)}
                placeholder="Type the missing code..."
                style={{ fontFamily: 'var(--font-mono)' }}
              />
            </>
          )}

          {task.format === 'rearrange' && lines.length > 0 && (
            <>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                {isTouchDevice ? 'Arrange lines in the correct order:' : 'Drag lines into correct order:'}
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto', flex: 1 }}>
                {dragOrder.map((lineIdx, visualIdx) => (
                  <div
                    key={`${task.id}-${visualIdx}`}
                    draggable
                    onDragStart={e => e.dataTransfer.setData('text/plain', visualIdx.toString())}
                    onDrop={e => {
                      e.preventDefault();
                      const dragIdx = parseInt(e.dataTransfer.getData('text/plain'));
                      const nextOrder = [...dragOrder];
                      const [removed] = nextOrder.splice(dragIdx, 1);
                      nextOrder.splice(visualIdx, 0, removed);
                      setDragOrder(nextOrder);
                    }}
                    onDragOver={e => e.preventDefault()}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '8px 12px', background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-primary)', borderRadius: '4px',
                      cursor: 'grab', fontSize: '12px', fontFamily: 'var(--font-mono)',
                      color: 'var(--text-accent)',
                    }}
                  >
                    <GripVertical size={14} color="var(--text-muted)" />
                    <span style={{ color: 'var(--text-muted)', minWidth: '20px' }}>{visualIdx + 1}.</span>
                    <code style={{ flex: 1 }}>{lines[lineIdx]}</code>
                    {isTouchDevice && (
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          type="button"
                          onClick={() => moveLine(visualIdx, visualIdx - 1)}
                          disabled={visualIdx === 0}
                          style={{ padding: '4px 6px', fontSize: '10px' }}
                        >
                          <ArrowUp size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveLine(visualIdx, visualIdx + 1)}
                          disabled={visualIdx === dragOrder.length - 1}
                          style={{ padding: '4px 6px', fontSize: '10px' }}
                        >
                          <ArrowDown size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {task.format === 'multiple_choice' && displayOptions.length > 0 && (
            <>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                {question || 'Select the correct option:'}
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                {displayOptions.map((opt, idx) => (
                  <div
                    key={`${task.id}-opt-${idx}`}
                    onClick={() => setUserAnswer(opt)}
                    style={{
                      padding: '12px',
                      background: userAnswer === opt ? 'var(--bg-elevated)' : 'var(--bg-tertiary)',
                      border: `1px solid ${userAnswer === opt ? 'var(--text-accent)' : 'var(--border-primary)'}`,
                      borderRadius: '4px', cursor: 'pointer',
                      fontSize: '13px', fontFamily: 'var(--font-mono)',
                      color: 'var(--text-primary)', transition: 'all 0.2s',
                    }}
                  >
                    <code>{opt}</code>
                  </div>
                ))}
              </div>
            </>
          )}

          {task.format === 'drag_and_fill' && displayCode && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                {isTouchDevice ? 'Tap a token, then tap a blank:' : 'Drag options to blanks:'}
              </label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {displayOptions.map((opt, i) => (
                  <div
                    key={`${task.id}-token-${i}`}
                    draggable
                    onDragStart={e => e.dataTransfer.setData('text/plain', opt)}
                    onClick={() => handleTokenClick(opt)}
                    style={{
                      padding: '4px 8px', background: 'var(--bg-tertiary)',
                      border: `1px solid ${selectedToken === opt ? 'var(--text-accent)' : 'var(--border-primary)'}`,
                      cursor: 'grab', fontSize: '12px', fontFamily: 'var(--font-mono)',
                      userSelect: 'none',
                      color: selectedToken === opt ? 'var(--text-accent)' : 'var(--text-primary)',
                    }}
                  >
                    {opt}
                  </div>
                ))}
              </div>
              <div style={{
                background: 'var(--bg-tertiary)', padding: '16px',
                border: '1px solid var(--border-primary)', borderRadius: '4px',
                color: 'var(--text-accent)', fontSize: '13px', lineHeight: '1.8',
                fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap',
              }}>
                {displayCode.split('_____').map((chunk: string, idx: number, arr: string[]) => (
                  <React.Fragment key={`${task.id}-blank-${idx}`}>
                    <span>{chunk}</span>
                    {idx < arr.length - 1 && (
                      <span
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => {
                          e.preventDefault();
                          updateFillState(idx, e.dataTransfer.getData('text/plain'));
                        }}
                        onClick={() => {
                          if (fillState[idx]) {
                            updateFillState(idx, null);
                            return;
                          }
                          handleBlankClick(idx);
                        }}
                        style={{
                          display: 'inline-block', minWidth: '60px', padding: '0 8px',
                          borderBottom: '2px solid var(--text-accent)',
                          cursor: 'pointer', color: 'var(--text-accent)',
                          textAlign: 'center', background: 'rgba(0,0,0,0.2)',
                        }}
                      >
                        {fillState[idx] || 'drop here'}
                      </span>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px' }}>
            <button
              className="btn-accent"
              onClick={handleSubmit}
              disabled={isSubmitting}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: isSubmitting ? 0.5 : 1 }}
            >
              <Play size={14} /> Submit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
