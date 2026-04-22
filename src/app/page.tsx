'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert, Terminal, Zap, Users } from 'lucide-react';

export default function LobbyPage() {
  const [code, setCode] = useState('');
  const router = useRouter();

  useEffect(() => {
    const storedCode = localStorage.getItem('playerCode') || sessionStorage.getItem('playerCode') || '';
    if (storedCode) {
      localStorage.setItem('playerCode', storedCode);
      sessionStorage.setItem('playerCode', storedCode);
    }
    setCode(storedCode);
  }, []);

  const handleJoin = () => {
    if (code.trim().length < 1) return;
    localStorage.setItem('playerCode', code.trim());
    sessionStorage.setItem('playerCode', code.trim());
    router.push('/game');
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh', padding: '24px',
    }}>
      {/* Logo / Title */}
      <div style={{ textAlign: 'center', marginBottom: '48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '16px' }}>
          <ShieldAlert size={48} color="var(--text-danger)" />
          <h1 style={{ fontSize: '32px', letterSpacing: '4px', textTransform: 'uppercase' }}>
            Breach & Defend
          </h1>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '12px', letterSpacing: '2px', textTransform: 'uppercase' }}>
          A Game of Trial, Trust, and Treason
        </p>

        {/* Animated scan line */}
        <div style={{
          width: '300px', height: '1px', margin: '24px auto 0',
          background: 'linear-gradient(90deg, transparent, var(--text-accent), transparent)',
          animation: 'pulseGlow 2s ease-in-out infinite',
        }} />
      </div>

      {/* Join Card */}
      <div className="terminal-box" style={{ width: '100%', maxWidth: '420px', padding: '32px' }}>
        {/* Features display */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px',
          marginBottom: '32px', textAlign: 'center',
        }}>
          {[
            { icon: <Users size={18} />, label: '30 Players' },
            { icon: <Terminal size={18} />, label: 'Code Tasks' },
            { icon: <Zap size={18} />, label: '30 Min' },
          ].map((f, i) => (
            <div key={i} style={{
              padding: '12px 8px', background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-primary)', borderRadius: '4px',
            }}>
              <div style={{ color: 'var(--text-accent)', marginBottom: '6px', display: 'flex', justifyContent: 'center' }}>
                {f.icon}
              </div>
              <span style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase' }}>
                {f.label}
              </span>
            </div>
          ))}
        </div>

        {/* Access Code input */}
        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
          Enter Access Code
        </label>
        <input
          id="player-code-input"
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
          placeholder="e.g. 1234"
          maxLength={10}
          autoFocus
          style={{ marginBottom: '16px' }}
        />

        <button
          id="join-game-btn"
          className="btn-accent"
          onClick={handleJoin}
          disabled={code.trim().length < 1}
          style={{ width: '100%', padding: '12px', fontSize: '13px', letterSpacing: '2px' }}
        >
          [ CONNECT TO SERVER ]
        </button>

        <p style={{ color: 'var(--text-muted)', fontSize: '10px', textAlign: 'center', marginTop: '16px' }}>
          You will be assigned a role after the admin starts the game.
        </p>
      </div>

      {/* Admin link */}
      <a href="/admin" style={{ color: 'var(--text-muted)', fontSize: '10px', marginTop: '24px', textTransform: 'uppercase', letterSpacing: '1px' }}>
        Admin Panel
      </a>
    </div>
  );
}
