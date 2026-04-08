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
  onSubmit: (result: { correct: boolean; isSabotage: boolean }) => void;
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
  const [feedback, setFeedback] = useState<{ correct: boolean; msg: string } | null>(null);
  const [activeLang, setActiveLang] = useState<Language>('python');

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
      setFeedback(null);
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
    } else {
      const stored = sessionStorage.getItem(cacheKeyText);
      if (stored !== null) {
        setUserAnswer(stored);
      } else {
        setUserAnswer(version.buggyCode || '');
      }
    }
    setFeedback(null);
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
      const expected = version.correctAnswer.replace(/\s+/g, ' ');
      correct = normalized === expected;
    } else if (task.format === 'fill_blank') {
      correct = userAnswer.trim() === version.correctAnswer.trim();
    } else if (task.format === 'rearrange') {
      if (version.correctOrder) {
        correct = dragOrder.every((val, idx) => val === version.correctOrder![idx]);
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
      onSubmit({ correct: true, isSabotage });
    }
  }, [task, version, userAnswer, dragOrder, onSubmit]);

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
            {task.format === 'debug' ? 'DEBUG' : task.format === 'fill_blank' ? 'FILL BLANK' : 'REARRANGE'}
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
                    <code>{version.shuffledLines![lineIdx]}</code>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── SUBMIT + FEEDBACK ──────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px' }}>
            <button className="btn-accent" onClick={handleSubmit} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
