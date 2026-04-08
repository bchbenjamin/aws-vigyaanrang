'use client';

import React, { useState, useEffect } from 'react';
import { AlertTriangle, Clock, Vote } from 'lucide-react';

interface VotingOverlayProps {
  reportedBy: string;
  durationMs: number;
  alivePlayers: { id: string; name: string }[];
  onVote: (targetId: string) => void;
  hasVoted: boolean;
}

export default function VotingOverlay({ reportedBy, durationMs, alivePlayers, onVote, hasVoted }: VotingOverlayProps) {
  const [timeLeft, setTimeLeft] = useState(Math.ceil(durationMs / 1000));
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 0) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleVote = () => {
    if (selected) onVote(selected);
  };

  return (
    <div className="overlay">
      <div className="overlay-content">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <AlertTriangle size={28} color="var(--text-danger)" />
          <div>
            <h2 style={{ fontSize: '16px', color: 'var(--text-danger)', textTransform: 'uppercase', letterSpacing: '2px' }}>
              Emergency Stand-Up
            </h2>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Reported by: {reportedBy}
            </p>
          </div>
        </div>

        {/* Timer */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px',
          padding: '8px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)',
          borderRadius: '4px',
        }}>
          <Clock size={14} color="var(--text-warning)" />
          <span style={{ color: 'var(--text-warning)', fontSize: '12px' }}>
            Debate time remaining: {timeLeft}s
          </span>
        </div>

        <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '16px' }}>
          Discuss with your team out loud. Vote to eject a suspected hacker or skip.
        </p>

        {/* Player list for voting */}
        {!hasVoted ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '16px' }}>
              {alivePlayers.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelected(p.id)}
                  style={{
                    textAlign: 'left', fontSize: '12px',
                    background: selected === p.id ? '#1a0000' : 'var(--bg-elevated)',
                    borderColor: selected === p.id ? 'var(--text-danger)' : 'var(--border-primary)',
                    color: selected === p.id ? 'var(--text-danger)' : 'var(--text-primary)',
                  }}
                >
                  {selected === p.id ? '> ' : '  '}{p.name}
                </button>
              ))}
              <button
                onClick={() => setSelected('skip')}
                style={{
                  textAlign: 'left', fontSize: '12px', marginTop: '8px',
                  background: selected === 'skip' ? '#111100' : 'var(--bg-elevated)',
                  borderColor: selected === 'skip' ? 'var(--text-warning)' : 'var(--border-primary)',
                  color: selected === 'skip' ? 'var(--text-warning)' : 'var(--text-muted)',
                }}
              >
                {selected === 'skip' ? '> ' : '  '}SKIP VOTE
              </button>
            </div>

            <button className="btn-danger" onClick={handleVote} disabled={!selected}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%', justifyContent: 'center' }}>
              <Vote size={14} /> Cast Vote
            </button>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
            <p>Vote submitted. Waiting for other players...</p>
          </div>
        )}
      </div>
    </div>
  );
}
