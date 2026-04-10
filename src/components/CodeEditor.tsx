'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Play, GripVertical, Check, X } from 'lucide-react';
import {
  ALL_REAL_TASKS, ALL_SABOTAGE_TASKS, ALL_FAKE_TASKS,
  type TaskDefinition, type Language,
} from '@/lib/tasks';

interface CodeEditorProps {
  taskId: string | null;
  sabotageTaskId?: string | null;
  fakeTaskId?: string | null;
  isHacker: boolean;
  onSubmit: (result: { correct: boolean; isSabotage: boolean; taskId?: string }) => void;
}

function findTask(id: string | null): TaskDefinition | null {
  if (!id) return null;
  return (
    ALL_REAL_TASKS.find(t => t.id === id) ||
    ALL_SABOTAGE_TASKS.find(t => t.id === id) ||
    ALL_FAKE_TASKS.find(t => t.id === id) ||
    null
  );
}

export default function CodeEditor({ taskId, sabotageTaskId, fakeTaskId, isHacker, onSubmit }: CodeEditorProps) {
  const [showSabotage, setShowSabotage] = useState(false);
  const [userAnswer, setUserAnswer] = useState('');
  const [dragOrder, setDragOrder] = useState<number[]>([]);
  const [fillState, setFillState] = useState<Record<number, string>>({});
  const [feedback, setFeedback] = useState<{ correct: boolean; msg: string } | null>(null);
  const [activeLang, setActiveLang] = useState<Language>('python');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Determine which task to show
  const activeTaskId = isHacker
    ? (showSabotage ? sabotageTaskId : fakeTaskId)
    : taskId;

  const task = findTask(activeTaskId || null);
  const version = task ? task.versions[activeLang] : null;

  // Load from session storage when task/language changes
  useEffect(() => {
    if (!task || !version) {
      setUserAnswer('');
      setDragOrder([]);
      setFillState({});
      setFeedback(null);
      setIsSubmitting(false);
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
  }, [task?.id, activeLang, version]);

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

    const isSabotage = task.isSabotage || false;

    setFeedback({
      correct,
      msg: correct
        ? (isSabotage ? 'Sabotage deployed.' : 'Task passed all tests.')
        : 'Incorrect. Try again.',
    });

    if (correct) {
      setIsSubmitting(true);
      onSubmit({ correct: true, isSabotage, taskId: task.id });
    }
  }, [task, version, userAnswer, dragOrder, fillState, onSubmit]);

  if (!task || !version) {
    return (
      <div className="terminal-box" style={{ textAlign: 'center', padding: '48px 16px' }}>
        <p style={{ color: 'var(--text-muted)' }}>No tasks available in this room.</p>
        <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '8px' }}>
          Navigate to a task room to begin coding.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0', height: '100%', minHeight: '400px' }}>
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

        {/* Language & Hacker toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <select
            value={activeLang}
            onChange={(e) => setActiveLang(e.target.value as Language)}
            style={{ width: 'auto', padding: '4px 8px', fontSize: '11px' }}
          >
            <option value="python">Python</option>
            <option value="java">Java</option>
            <option value="c">C</option>
          </select>

          {isHacker && (
            <button
              onClick={() => setShowSabotage(!showSabotage)}
              className={showSabotage ? 'btn-danger' : 'btn-accent'}
              style={{ fontSize: '10px', padding: '4px 10px' }}
            >
              {showSabotage ? 'SABOTAGE MODE' : 'COVER MODE'}
            </button>
          )}
        </div>
      </div>

      {/* ── SPLIT PANE ────────────────────────────── */}
      <div className="split-pane">
        {/* LEFT/TOP: Problem Description */}
        <div className="split-pane-desc">
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
                {version.options.map((opt, idx) => (
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
                {version.options?.map((opt, i) => (
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
                {feedback.correct ? <Check size={14} /> : <X size={14} />}
                {feedback.msg}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
