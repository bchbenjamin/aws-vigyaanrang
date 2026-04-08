'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  Shield, Users, Play, RotateCcw, Activity,
  Wifi, MapPin, Skull, CheckCircle, XCircle,
} from 'lucide-react';

interface PlayerInfo {
  id: string;
  name: string;
  room: string;
  role: string;
  status: string;
}

interface GameState {
  phase: string;
  playerCount: number;
  players: PlayerInfo[];
  globalProgress: number;
  totalTasksSolved: number;
  totalSabotageDone: number;
  scores: Record<string, number>;
  roomCounts: Record<string, number>;
  winSide: string | null;
  gameStartTime: number | null;
}

let adminSocket: Socket | null = null;

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [regName, setRegName] = useState('');
  const [regCode, setRegCode] = useState('');

  // ── LOGIN ────────────────────────────────────────────────
  const handleLogin = async () => {
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data.success) {
        setAuthenticated(true);
        sessionStorage.setItem('adminToken', data.token);
      } else {
        setLoginError('Invalid credentials');
      }
    } catch {
      setLoginError('Connection failed');
    }
  };

  // ── POLL GAME STATE ──────────────────────────────────────
  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/state');
      if (res.ok) {
        const data = await res.json();
        setGameState(data);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!authenticated) return;

    // Connect admin socket for commands
    adminSocket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
    });

    adminSocket.on('connect', () => setSocketConnected(true));
    adminSocket.on('disconnect', () => setSocketConnected(false));

    // Poll state every 2 seconds
    fetchState();
    const interval = setInterval(fetchState, 2000);

    return () => {
      clearInterval(interval);
      adminSocket?.disconnect();
      adminSocket = null;
    };
  }, [authenticated, fetchState]);

  // ── ADMIN ACTIONS ────────────────────────────────────────
  const startGame = () => adminSocket?.emit('start_game');
  const resetGame = () => adminSocket?.emit('admin_reset');
  const registerUser = () => {
    if (regName && regCode) {
      adminSocket?.emit('admin_register_user', { name: regName, code: regCode });
      setRegName('');
      setRegCode('');
    }
  };
  const removeUser = (code: string) => {
    adminSocket?.emit('admin_remove_user', code);
  };

  // ── LOGIN SCREEN ─────────────────────────────────────────
  if (!authenticated) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', padding: '24px',
      }}>
        <div className="terminal-box" style={{ width: '100%', maxWidth: '380px', padding: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
            <Shield size={24} color="var(--text-danger)" />
            <h1 style={{ fontSize: '16px', letterSpacing: '2px', textTransform: 'uppercase' }}>
              Admin Access
            </h1>
          </div>

          <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
            Username
          </label>
          <input
            id="admin-username"
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            style={{ marginBottom: '12px' }}
          />

          <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
            Password
          </label>
          <input
            id="admin-password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            style={{ marginBottom: '16px' }}
          />

          {loginError && (
            <p style={{ color: 'var(--text-danger)', fontSize: '11px', marginBottom: '12px' }}>
              {loginError}
            </p>
          )}

          <button id="admin-login-btn" className="btn-accent" onClick={handleLogin} style={{ width: '100%' }}>
            Authenticate
          </button>
        </div>
      </div>
    );
  }

  // ── DASHBOARD ────────────────────────────────────────────
  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid var(--border-primary)', paddingBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Shield size={24} color="var(--text-danger)" />
          <h1 style={{ fontSize: '18px', letterSpacing: '2px', textTransform: 'uppercase' }}>
            Admin Panel
          </h1>
          <span className={`badge ${socketConnected ? 'badge-online' : 'badge-offline'}`}>
            {socketConnected ? 'CONNECTED' : 'OFFLINE'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn-accent" onClick={startGame} disabled={gameState?.phase !== 'lobby'}>
            <Play size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            Start Game
          </button>
          <button className="btn-danger" onClick={resetGame}>
            <RotateCcw size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            Reset
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Phase', value: gameState?.phase?.toUpperCase() || '—', icon: <Activity size={16} /> },
          { label: 'Players', value: gameState?.playerCount || 0, icon: <Users size={16} /> },
          { label: 'Progress', value: `${Math.round(gameState?.globalProgress || 0)}%`, icon: <CheckCircle size={16} /> },
          { label: 'Tasks Done', value: gameState?.totalTasksSolved || 0, icon: <Wifi size={16} /> },
          { label: 'Sabotaged', value: gameState?.totalSabotageDone || 0, icon: <Skull size={16} /> },
        ].map((stat, i) => (
          <div key={i} className="terminal-box" style={{ textAlign: 'center', padding: '16px' }}>
            <div style={{ color: 'var(--text-accent)', marginBottom: '8px', display: 'flex', justifyContent: 'center' }}>{stat.icon}</div>
            <div style={{ fontSize: '20px', fontWeight: '600', marginBottom: '4px' }}>{stat.value}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* User Registration */}
      <div className="terminal-box" style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
          Registered Access Codes
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
          <div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <input
                type="text"
                placeholder="Player Name"
                value={regName}
                onChange={e => setRegName(e.target.value)}
                style={{ flex: 1 }}
              />
              <input
                type="text"
                placeholder="Access Code (e.g. 1234)"
                value={regCode}
                onChange={e => setRegCode(e.target.value)}
                style={{ width: '150px' }}
              />
              <button className="btn-accent" onClick={registerUser} disabled={!regName || !regCode}>
                Register
              </button>
            </div>
            <p style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              Give players their access code to connect via the lobby.
            </p>
          </div>
          <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--border-primary)', padding: '8px', borderRadius: '4px' }}>
            {Object.entries((gameState as any)?.registeredUsers || {}).map(([code, name]) => (
              <div key={code} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                <span><span style={{ color: 'var(--text-accent)' }}>[{code}]</span> {name as string}</span>
                <button onClick={() => removeUser(code)} style={{ background: 'transparent', border: 'none', color: 'var(--text-danger)', fontSize: '10px', padding: 0 }}>
                  [x]
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Room Counts */}
      {gameState?.roomCounts && (
        <div className="terminal-box" style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
            Room Distribution
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px' }}>
            {Object.entries(gameState.roomCounts).map(([room, count]) => (
              <div key={room} style={{
                textAlign: 'center', padding: '8px',
                background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', borderRadius: '4px',
              }}>
                <div style={{ fontSize: '16px', color: 'var(--text-accent)', marginBottom: '4px' }}>{count as number}</div>
                <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{room}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Player Table */}
      <div className="terminal-box">
        <h3 style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
          All Players
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                {['Name', 'Room', 'Role', 'Status', 'Score'].map(h => (
                  <th key={h} style={{ padding: '8px', textAlign: 'left', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '1px' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(gameState?.players || []).map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid #0a0a0a' }}>
                  <td style={{ padding: '8px' }}>{p.name}</td>
                  <td style={{ padding: '8px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <MapPin size={10} color="var(--text-muted)" />{p.room}
                    </span>
                  </td>
                  <td style={{ padding: '8px' }}>
                    <span style={{ color: p.role === 'hacker' ? 'var(--text-danger)' : 'var(--text-accent)' }}>
                      {p.role.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '8px' }}>
                    <span className={`badge ${
                      p.status === 'alive' ? 'badge-online' :
                      p.status === 'firewall' ? 'badge-firewall' : 'badge-offline'
                    }`}>
                      {p.status}
                    </span>
                  </td>
                  <td style={{ padding: '8px', color: 'var(--text-accent)' }}>
                    {gameState?.scores[p.id] || 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
