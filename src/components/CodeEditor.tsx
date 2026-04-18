'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Play, GripVertical, Check } from 'lucide-react';
import {
  ALL_REAL_TASKS, ALL_HACK_TASKS,
  type TaskDefinition, type Language,
} from '@/lib/tasks';

const LANGUAGE_PREF_KEY = 'bd_preferred_language';
const DIFFICULTY_PREF_KEY = 'bd_preferred_difficulty';

function getStoredLanguage(): Language {
  if (typeof window === 'undefined') return 'python';
  const storedLanguage = localStorage.getItem(LANGUAGE_PREF_KEY);
  if (storedLanguage === 'python' || storedLanguage === 'java' || storedLanguage === 'c') {
    return storedLanguage;
  }
  return 'python';
}

function getStoredDifficulty(): 'easy' | 'medium' | 'hard' {
  if (typeof window === 'undefined') return 'easy';
  const storedDifficulty = localStorage.getItem(DIFFICULTY_PREF_KEY);
  if (storedDifficulty === 'easy' || storedDifficulty === 'medium' || storedDifficulty === 'hard') {
    return storedDifficulty;
  }
  return 'easy';
}

interface CodeEditorProps {
  taskId: string | null;
  hackTaskId?: string | null;
  isFirewall?: boolean;
  canRequestHard?: boolean;
  systemStatusHint?: string | null;
  selectedProtectTargetId?: string | null;
  selectedProtectTargetName?: string | null;
  onRequestTask: (difficulty: 'easy' | 'medium' | 'hard') => void;
  onSubmit: (result: { correct: boolean; isHackTask: boolean; taskId?: string; protectedTargetId?: string }) => void;
}

function findTask(id: string | null): TaskDefinition | null {
  if (!id) return null;
  return (
    ALL_REAL_TASKS.find(t => t.id === id) ||
    ALL_HACK_TASKS.find(t => t.id === id) ||
    null
  );
}

export default function CodeEditor({
  taskId,
  hackTaskId,
  isFirewall,
  canRequestHard,
  systemStatusHint,
  selectedProtectTargetId,
  selectedProtectTargetName,
  onRequestTask,
  onSubmit,
}: CodeEditorProps) {
  const [userAnswer, setUserAnswer] = useState('');
  const [dragOrder, setDragOrder] = useState<number[]>([]);
  const [fillState, setFillState] = useState<Record<number, string>>({});
  const [feedback, setFeedback] = useState<{ correct: boolean; msg: string } | null>(null);
  const [activeLang, setActiveLang] = useState<Language>(() => getStoredLanguage());
  const [activeDifficulty, setActiveDifficulty] = useState<'easy' | 'medium' | 'hard'>(() => getStoredDifficulty());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [displayOptions, setDisplayOptions] = useState<string[]>([]);
  const [reloadPopupMessage, setReloadPopupMessage] = useState<string | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Determine which task to show
  const activeTaskId = hackTaskId || taskId;

  const task = findTask(activeTaskId || null);
  const isHackTaskActive = Boolean(hackTaskId && task && task.id === hackTaskId);
  const version = task ? task.versions[activeLang] : null;

  useEffect(() => {
    localStorage.setItem(LANGUAGE_PREF_KEY, activeLang);
  }, [activeLang]);

  useEffect(() => {
    localStorage.setItem(DIFFICULTY_PREF_KEY, activeDifficulty);
  }, [activeDifficulty]);

  // Load from session storage when task/language changes
  useEffect(() => {
    if (!task || !version) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUserAnswer('');
      setDragOrder([]);
      setFillState({});
      setFeedback(null);
      setIsSubmitting(false);
      setDisplayOptions([]);
      return;
    }

    const cacheKeyText = `ans_${task.id}_${activeLang}`;
    const cacheKeyArr = `drag_${task.id}_${activeLang}`;

    if (task.format === 'rearrange' && version.shuffledLines) {
      const stored = sessionStorage.getItem(cacheKeyArr);
      if (stored) {
        setDragOrder(JSON.parse(stored));
      } else {
        setDragOrder(version.shuffledLines.map((_, i) => i));
      }
    } else if (task.format === 'drag_and_fill') {
      const stored = sessionStorage.getItem(cacheKeyArr);
      if (stored) setFillState(JSON.parse(stored));
      else setFillState({});
    } else {
      const stored = sessionStorage.getItem(cacheKeyText);
      if (stored !== null) {
        setUserAnswer(stored);
      } else {
        setUserAnswer(version.buggyCode || '');
      }
    }
    setFeedback(null);
    setIsSubmitting(false);
    if (version?.options) {
      const optionsCacheKey = `opts_${task.id}_${activeLang}`;
      const cachedOptions = sessionStorage.getItem(optionsCacheKey);
      if (cachedOptions) {
        setDisplayOptions(JSON.parse(cachedOptions));
      } else {
        const shuffledOptions = [...version.options].sort(() => Math.random() - 0.5);
        setDisplayOptions(shuffledOptions);
        sessionStorage.setItem(optionsCacheKey, JSON.stringify(shuffledOptions));
      }
    } else {
      setDisplayOptions([]);
    }
  }, [task, activeLang, version]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, []);

  const updateAnswer = (val: string) => {
    setUserAnswer(val);
    if (!task) return;
    sessionStorage.setItem(`ans_${task.id}_${activeLang}`, val);
  };

  const updateDragOrder = (newOrder: number[]) => {
    setDragOrder(newOrder);
    if (!task) return;
    sessionStorage.setItem(`drag_${task.id}_${activeLang}`, JSON.stringify(newOrder));
  };

  const updateFillState = (idx: number, val: string | null) => {
    setFillState(prev => {
      const copy = { ...prev };
      if (val === null) delete copy[idx];
      else copy[idx] = val;
      if (task) sessionStorage.setItem(`drag_${task.id}_${activeLang}`, JSON.stringify(copy));
      return copy;
    });
  };

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    e.dataTransfer.setData('text/plain', idx.toString());
  };

  const handleDrop = (e: React.DragEvent, dropIdx: number) => {
    e.preventDefault();
    const dragIdx = parseInt(e.dataTransfer.getData('text/plain'));
    const newOrder = [...dragOrder];
    const [removed] = newOrder.splice(dragIdx, 1);
    newOrder.splice(dropIdx, 0, removed);
    updateDragOrder(newOrder);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleSubmit = useCallback(() => {
    if (!task || !version) return;
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    let correct = false;

    if (task.format === 'debug') {
      const normalized = userAnswer.trim().replace(/\s+/g, ' ');
      const expected = (version.correctAnswer || '').replace(/\s+/g, ' ');
      correct = normalized === expected;
    } else if (task.format === 'fill_blank') {
      correct = userAnswer.trim() === (version.correctAnswer || '').trim();
    } else if (task.format === 'multiple_choice') {
      correct = userAnswer === version.correctAnswer;
    } else if (task.format === 'rearrange') {
      if (version.correctOrder) {
        correct = dragOrder.every((val, idx) => val === version.correctOrder![idx]);
      }
    } else if (task.format === 'drag_and_fill') {
      if (version.correctOrder) {
        let isCorrect = true;
        version.correctOrder.forEach((ans, idx) => {
          if (fillState[idx] !== ans) isCorrect = false;
        });
        correct = isCorrect;
      }
    }

    const isHackTask = isHackTaskActive;

    if (correct) {
      setFeedback({
        correct: true,
        msg: isHackTask ? 'Submitting task...' : 'Checking solution...',
      });
      setIsSubmitting(true);
      onSubmit({
        correct: true,
        isHackTask,
        taskId: task.id,
        protectedTargetId: selectedProtectTargetId || undefined,
      });
    } else {
      setFeedback(null);
      setReloadPopupMessage('Incorrect. Loading a new question...');
      retryTimerRef.current = setTimeout(() => {
        setReloadPopupMessage(null);
        setFeedback(null);
        setUserAnswer('');
        setDragOrder([]);
        setFillState({});
        setIsSubmitting(false);
        onRequestTask(task.difficulty);
      }, 3000);
    }
  }, [task, version, userAnswer, dragOrder, fillState, onSubmit, selectedProtectTargetId, isHackTaskActive, onRequestTask]);

  if (isFirewall && !selectedProtectTargetId) {
    return (
      <div className="terminal-box" style={{ textAlign: 'center', padding: '48px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <h3 style={{ color: 'var(--text-warning)' }}>Protection Target Required</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '8px', maxWidth: '300px' }}>
          Select an active player in the firewall panel before requesting a task.
        </p>
      </div>
    )
  }

  if (!task || !version) {
    return (
      <div className="terminal-box" style={{ textAlign: 'center', padding: '48px 16px' }}>
        <p style={{ color: 'var(--text-muted)' }}>No active task loaded.</p>
        <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '8px' }}>
          {isFirewall ? 'Select a target and load a task.' : 'Load a task to continue coding.'}
        </p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '16px' }}>
          <select
            value={activeDifficulty}
            onChange={(e) => setActiveDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}
            style={{ width: 'auto', padding: '4px 8px', fontSize: '11px', background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)' }}
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            {canRequestHard && <option value="hard">Hard</option>}
          </select>
          <select
            value={activeLang}
            onChange={(e) => setActiveLang(e.target.value as Language)}
            style={{ width: 'auto', padding: '4px 8px', fontSize: '11px' }}
          >
            <option value="python">Python</option>
            <option value="java">Java</option>
            <option value="c">C</option>
          </select>
          <button
            className="btn-accent"
            disabled={Boolean(isFirewall && !selectedProtectTargetId)}
            onClick={() => onRequestTask(activeDifficulty)}
          >
            Load Task
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0', height: '100%', minHeight: '400px', position: 'relative' }}>
      {/* ── HEADER BAR ────────────────────────────── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 12px', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-primary)',
        flexWrap: 'wrap', gap: '8px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: 'var(--text-accent)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px' }}>
            {task.format.replace('_', ' ')} — {task.difficulty}
          </span>
        </div>

        {/* Language, Difficulty, & Hacker toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {systemStatusHint && (
            <span style={{ fontSize: '10px', color: 'var(--text-warning)', textTransform: 'uppercase', letterSpacing: '1px' }}>
              {systemStatusHint}
            </span>
          )}
          <select
            value={activeDifficulty}
            onChange={(e) => {
              const diff = e.target.value as 'easy' | 'medium' | 'hard';
              setActiveDifficulty(diff);
              onRequestTask(diff);
            }}
            style={{ width: 'auto', padding: '4px 8px', fontSize: '11px', background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)' }}
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            {canRequestHard && <option value="hard">Hard</option>}
          </select>

          <select
            value={activeLang}
            onChange={(e) => setActiveLang(e.target.value as Language)}
            style={{ width: 'auto', padding: '4px 8px', fontSize: '11px' }}
          >
            <option value="python">Python</option>
            <option value="java">Java</option>
            <option value="c">C</option>
          </select>

          {isFirewall && selectedProtectTargetName && (
            <span style={{ fontSize: '10px', color: 'var(--text-warning)', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Protecting {selectedProtectTargetName}
            </span>
          )}
        </div>
      </div>

      {/* ── SPLIT PANE ────────────────────────────── */}
      <div className="split-pane">
        {/* LEFT/TOP: Problem Description */}
        <div className="split-pane-desc">
          {false && isHackTaskActive && (
            <div style={{
              marginBottom: '16px', padding: '12px', background: 'rgba(255, 70, 70, 0.1)',
              borderLeft: '4px solid var(--text-danger)', color: 'var(--text-danger)',
              fontSize: '12px', animation: 'pulse 2s infinite'
            }}>
              <strong>⚠️ SABOTAGE INITIATED:</strong> Solve this algorithm quickly before the firewall detects your intrusion!
            </div>
          )}
          <h3 style={{ color: 'var(--text-primary)', fontSize: '14px', marginBottom: '12px' }}>
            {task.title}
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '12px', lineHeight: '1.8', marginBottom: '16px' }}>
            {task.description}
          </p>

          <div style={{
            padding: '8px 12px', background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-primary)', borderRadius: '4px',
            fontSize: '11px', color: 'var(--text-muted)'
          }}>
            <span style={{ color: 'var(--text-info)' }}>Format:</span>{' '}
            {task.format === 'debug' && 'Find and fix the bug in the code.'}
            {task.format === 'fill_blank' && 'Type the missing keyword or expression.'}
            {task.format === 'rearrange' && 'Drag and drop lines into the correct order.'}
            {task.format === 'multiple_choice' && 'Select the correct option.'}
            {task.format === 'drag_and_fill' && 'Drag options into the blanks to complete the code.'}
          </div>
        </div>

        {/* RIGHT/BOTTOM: Code Editor Area */}
        <div className="split-pane-editor">
          {/* ── DEBUG FORMAT ────────────────────── */}
          {task.format === 'debug' && (
            <>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Edit the buggy code below:
              </label>
              <textarea
                className="code-area"
                value={userAnswer}
                onChange={(e) => updateAnswer(e.target.value)}
                spellCheck={false}
              />
            </>
          )}

          {/* ── FILL IN THE BLANK FORMAT ───────── */}
          {task.format === 'fill_blank' && (
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
                {version.blankCode}
              </pre>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: '8px' }}>
                Your answer (replace the _____):
              </label>
              <input
                type="text"
                value={userAnswer}
                onChange={(e) => updateAnswer(e.target.value)}
                placeholder="Type the missing code..."
                style={{ fontFamily: 'var(--font-mono)' }}
              />
            </>
          )}

          {/* ── REARRANGE FORMAT ────────────────── */}
          {task.format === 'rearrange' && version.shuffledLines && (
            <>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Drag lines into correct order:
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto', flex: 1 }}>
                {dragOrder.map((lineIdx, visualIdx) => (
                  <div
                    key={visualIdx}
                    draggable
                    onDragStart={(e) => handleDragStart(e, visualIdx)}
                    onDrop={(e) => handleDrop(e, visualIdx)}
                    onDragOver={handleDragOver}
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
                    <code>{version.shuffledLines![lineIdx as number]}</code>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── MULTIPLE CHOICE ─────────────────── */}
          {task.format === 'multiple_choice' && version.options && (
            <>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                {version.question || 'Select the correct option:'}
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                {displayOptions.map((opt, idx) => (
                  <div
                    key={idx}
                    onClick={() => updateAnswer(opt)}
                    style={{
                      padding: '12px',
                      background: userAnswer === opt ? 'var(--bg-elevated)' : 'var(--bg-tertiary)',
                      border: `1px solid ${userAnswer === opt ? 'var(--text-accent)' : 'var(--border-primary)'}`,
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-primary)',
                      transition: 'all 0.2s',
                    }}
                  >
                    <code>{opt}</code>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── DRAG AND FILL ───────────────────── */}
          {task.format === 'drag_and_fill' && version.blankCode && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Drag options to blanks:
              </label>
              
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {displayOptions.map((opt, i) => (
                  <div
                    key={i}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', opt)}
                    style={{
                      padding: '4px 8px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)',
                      cursor: 'grab', fontSize: '12px', fontFamily: 'var(--font-mono)',
                      userSelect: 'none'
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
                fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap'
              }}>
                {version.blankCode.split('_____').map((chunk, idx, arr) => (
                   <React.Fragment key={idx}>
                     <span>{chunk}</span>
                     {idx < arr.length - 1 && (
                        <span
                           onDragOver={e => e.preventDefault()}
                           onDrop={(e) => { e.preventDefault(); updateFillState(idx, e.dataTransfer.getData('text/plain')); }}
                           onClick={() => updateFillState(idx, null)}
                           style={{ 
                              display: 'inline-block', minWidth: '60px', padding: '0 8px', 
                              borderBottom: '2px solid var(--text-accent)', 
                              cursor: 'pointer', color: 'var(--text-accent)',
                              textAlign: 'center', background: 'rgba(0,0,0,0.2)'
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

          {/* ── SUBMIT + FEEDBACK ──────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px' }}>
            <button
               className="btn-accent"
               onClick={handleSubmit} 
               disabled={isSubmitting}
               style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: isSubmitting ? 0.5 : 1 }}
            >
              <Play size={14} /> Submit
            </button>

            {feedback && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                color: feedback.correct ? 'var(--text-accent)' : 'var(--text-danger)',
                fontSize: '12px',
              }}>
                <Check size={14} />
                {feedback.msg}
              </div>
            )}
          </div>
        </div>
      </div>

      {reloadPopupMessage && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.55)',
            zIndex: 5,
            pointerEvents: 'none',
          }}
        >
          <div
            className="terminal-box"
            style={{
              padding: '18px 22px',
              minWidth: '260px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--text-warning)', marginBottom: '8px' }}>
              Refreshing Task
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{reloadPopupMessage}</div>
          </div>
        </div>
      )}
    </div>
  );
}
