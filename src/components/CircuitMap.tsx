'use client';

import React from 'react';
import styles from './CircuitMap.module.css';

// Room node positions on the SVG canvas (x, y)
const ROOM_NODES = [
  { id: 'Frontend',        x: 150, y: 60,  label: 'FRONTEND' },
  { id: 'API Gateway',     x: 450, y: 60,  label: 'API GATEWAY' },
  { id: 'Main Database',   x: 750, y: 60,  label: 'MAIN DB' },
  { id: 'Server Room',     x: 150, y: 220, label: 'SERVER ROOM' },
  { id: 'The Log Room',    x: 450, y: 220, label: 'THE LOG ROOM' },
  { id: 'QA Testing Lab',  x: 750, y: 220, label: 'QA LAB' },
  { id: 'Breakroom',       x: 450, y: 370, label: 'BREAKROOM' },
];

// Connection traces between rooms
const TRACES = [
  ['Frontend', 'API Gateway'],
  ['API Gateway', 'Main Database'],
  ['Frontend', 'Server Room'],
  ['API Gateway', 'The Log Room'],
  ['Main Database', 'QA Testing Lab'],
  ['Server Room', 'The Log Room'],
  ['The Log Room', 'QA Testing Lab'],
  ['Server Room', 'Breakroom'],
  ['The Log Room', 'Breakroom'],
  ['QA Testing Lab', 'Breakroom'],
];

interface CircuitMapProps {
  currentRoom: string;
  roomCounts: Record<string, number>;
  isMoving: boolean;
  movingTo: string | null;
  onNavigate: (room: string) => void;
  isFirewall?: boolean;
}

export default function CircuitMap({ currentRoom, roomCounts, isMoving, movingTo, onNavigate }: CircuitMapProps) {
  const getNode = (id: string) => ROOM_NODES.find(n => n.id === id);

  return (
    <div className={styles.circuitContainer}>
      {isMoving && (
        <div className={styles.movingIndicator}>
          Transiting to {movingTo}...
        </div>
      )}

      <svg viewBox="0 0 900 430" className={styles.circuitSvg}>
        {/* Background grid pattern */}
        <defs>
          <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
            <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#0d0d0d" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="900" height="430" fill="url(#grid)" />

        {/* Connection traces */}
        {TRACES.map(([from, to], i) => {
          const a = getNode(from);
          const b = getNode(to);
          if (!a || !b) return null;
          const isActive = currentRoom === from || currentRoom === to;
          return (
            <line
              key={i}
              x1={a.x} y1={a.y}
              x2={b.x} y2={b.y}
              className={`${styles.trace} ${isActive ? styles.traceActive : ''}`}
            />
          );
        })}

        {/* Room nodes */}
        {ROOM_NODES.map((node) => {
          const isActive = currentRoom === node.id;
          const count = roomCounts[node.id] || 0;
          const isTarget = movingTo === node.id;

          return (
            <g
              key={node.id}
              className={styles.nodeGroup}
              onClick={() => !isMoving && onNavigate(node.id)}
            >
              {/* Outer glow ring for active node */}
              {isActive && (
                <circle
                  cx={node.x} cy={node.y} r={42}
                  fill="none"
                  stroke="#00ff41"
                  strokeWidth="1"
                  opacity="0.3"
                  className={styles.playerDot}
                />
              )}

              {/* Target node pulse */}
              {isTarget && (
                <circle
                  cx={node.x} cy={node.y} r={46}
                  fill="none"
                  stroke="#ffaa00"
                  strokeWidth="1"
                  opacity="0.5"
                  className={styles.playerDot}
                />
              )}

              {/* Main node circle */}
              <circle
                cx={node.x} cy={node.y} r={36}
                className={`${styles.nodeCircle} ${isActive ? styles.nodeActive : ''}`}
              />

              {/* Hexagonal inner detail */}
              <circle
                cx={node.x} cy={node.y} r={20}
                fill="none"
                stroke={isActive ? '#003300' : '#111111'}
                strokeWidth="1"
              />

              {/* Room label */}
              <text
                x={node.x} y={node.y - 4}
                className={`${styles.nodeLabel} ${isActive ? styles.nodeLabelActive : ''}`}
              >
                {node.label}
              </text>

              {/* Player count */}
              <text
                x={node.x} y={node.y + 14}
                className={`${styles.nodeCount} ${isActive ? styles.nodeCountActive : ''}`}
              >
                [{count}]
              </text>

              {/* Small player dots around node */}
              {Array.from({ length: Math.min(count, 6) }).map((_, di) => {
                const angle = (di / Math.min(count, 6)) * Math.PI * 2 - Math.PI / 2;
                const dotR = 28;
                const dx = node.x + Math.cos(angle) * dotR;
                const dy = node.y + Math.sin(angle) * dotR;
                return (
                  <circle
                    key={di}
                    cx={dx} cy={dy} r={2}
                    className={styles.playerDot}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
