'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  Shield, Users, Play, RotateCcw, Activity,
  Wifi, MapPin, Skull, CheckCircle, XCircle,
} from 'lucide-react';

import { GameState, PlayerInfo } from '@/lib/types';

let adminSocket: Socket | null = null;
type StopMode = 'retain' | 'discard' | 'fresh';

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [regName, setRegName] = useState('');
  const [regCode, setRegCode] = useState('');
  const [bulkNames, setBulkNames] = useState('');
  const [adminError, setAdminError] = useState('');
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [rolesMap, setRolesMap] = useState<Record<string, string>>({});
  const [standupDurationInput, setStandupDurationInput] = useState('90000');
  const [showEndStopPopup, setShowEndStopPopup] = useState(false);

  const CONFIG_LABELS: Record<string, string> = {
    pointsEasy: 'Points for Easy Tasks',
    pointsMedium: 'Points for Medium Tasks',
    pointsHard: 'Points for Hard Tasks',
    pointsSabotage: 'Points for Hack Puzzles',
    pointsEjectHacker: 'Points for Ejecting Hacker',
    pointsSurvive: 'Points for Win Survival',
    pointsWin: 'Base Game Win Points',
    standupDurationMs: 'Voting Discussion (ms)',
    firewallBufferMs: 'Firewall Task Shield Cooldown (ms)',
    easySpeedLimitMs: 'Speedrun Threshold (ms)',
    easyCooldownMs: 'Speedrun Penalty Cooldown (ms)'
  };
  const [showStopMenu, setShowStopMenu] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('adminToken')) {
      setAuthenticated(true);
    }
  }, []);

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



  useEffect(() => {
    if (!authenticated) return;

    // Connect admin socket for commands
    adminSocket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
    });

    adminSocket.on('connect', () => {
      setSocketConnected(true);
      adminSocket?.emit('admin_get_state');
    });
    
    adminSocket.on('disconnect', () => setSocketConnected(false));
    
    adminSocket.on('admin_state', (data: GameState) => {
      setGameState(data);
      if (data.adminConfig?.standupDurationMs !== undefined) {
        setStandupDurationInput(String(data.adminConfig.standupDurationMs));
      }
    });

    adminSocket.on('error_msg', (msg: string) => {
      setAdminError(msg);
      setTimeout(() => setAdminError(''), 5000);
    });

    // Poll state every 2 seconds quietly over WebSocket
    const interval = setInterval(() => {
      if (adminSocket && adminSocket.connected) {
        adminSocket.emit('admin_get_state');
      }
    }, 2000);

    return () => {
      clearInterval(interval);
      adminSocket?.disconnect();
      adminSocket = null;
    };
  }, [authenticated]);

  useEffect(() => {
    if (gameState?.phase === 'ended') {
      setShowEndStopPopup(true);
    } else if (gameState?.phase !== 'ended') {
      setShowEndStopPopup(false);
    }
  }, [gameState?.phase]);

  // ── ADMIN ACTIONS ────────────────────────────────────────
  const openRoleModal = () => {
    const players = gameState?.players || [];
    const activePlayers = players.filter(p => p.status !== 'disconnected' && p.status !== 'ejected');
    
    if (activePlayers.length < 1) {
      setAdminError('Start Aborted: 0 players hold active connections. Registered users must join using their Access Codes on their physical devices before starting the game.');
      setTimeout(() => setAdminError(''), 5000);
      return;
    }

    const newRolesMap: Record<string, string> = {};
    const hackerCount = Math.max(1, Math.floor(players.length / 6));
    const shuffledIds = players.map(p => p.id).sort(() => Math.random() - 0.5);
    const hackerIds = new Set(shuffledIds.slice(0, hackerCount));

    players.forEach(p => {
      newRolesMap[p.id] = hackerIds.has(p.id) ? 'hacker' : 'developer';
    });
    setRolesMap(newRolesMap);
    setShowRoleModal(true);
  };

  const confirmAndStartGame = () => {
    let hackerCount = 0;
    Object.values(rolesMap).forEach(role => {
      if (role === 'hacker') hackerCount++;
    });

    if (hackerCount < 1) {
      setAdminError('Cannot start game without at least 1 Hacker.');
      setTimeout(() => setAdminError(''), 5000);
      return;
    }

    adminSocket?.emit('admin_start_with_roles', rolesMap);
    setShowRoleModal(false);
  };

  const stopGame = (mode: StopMode) => {
    adminSocket?.emit('admin_stop_game', mode);
    setShowStopMenu(false);
    setShowEndStopPopup(false);
  };
  const resetGame = () => adminSocket?.emit('admin_reset');
  const registerUser = () => {
    if (regName && regCode) {
      adminSocket?.emit('admin_register_user', { name: regName, code: regCode });
      setRegName('');
      setRegCode('');
    }
  };
  const bulkRegister = () => {
    if (!bulkNames.trim()) return;
    const names = bulkNames.split('\n').map(n => n.trim()).filter(n => n);
    names.forEach(name => {
      const cleanName = name.replace(/[^a-zA-Z]/g, '') || 'XXX';
      const prefix = cleanName.substring(0, 3).toUpperCase().padEnd(3, 'X');
      const letter1 = cleanName[Math.floor(Math.random() * cleanName.length)].toUpperCase();
      const letter2 = cleanName[Math.floor(Math.random() * cleanName.length)].toUpperCase();
      const code = `${prefix}-${letter1}${letter2}`;
      adminSocket?.emit('admin_register_user', { name, code });
    });
    setBulkNames('');
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
            name="admin-pass"
            autoComplete="new-password"
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

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {adminError && (
            <span style={{ color: 'var(--text-danger)', fontSize: '12px', marginRight: '16px' }}>
              {adminError}
            </span>
          )}
          <button className="btn-accent" onClick={openRoleModal} disabled={gameState?.phase !== 'lobby'}>
            <Play size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            Start Game
          </button>
          <div style={{ position: 'relative' }}>
            <button className="btn-warning" onClick={() => setShowStopMenu(!showStopMenu)} disabled={gameState?.phase === 'lobby'}>
              <XCircle size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
              Stop Game ▾
            </button>
            {showStopMenu && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: '4px', zIndex: 100,
                background: 'var(--bg-primary)', border: '1px solid var(--border-primary)',
                borderRadius: '6px', padding: '8px', minWidth: '220px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              }}>
                <button onClick={() => stopGame('retain')} style={{ width: '100%', textAlign: 'left', padding: '8px', fontSize: '11px', background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
                  🏆 Retain Points & Restart
                  <br /><span style={{ color: 'var(--text-muted)', fontSize: '9px' }}>Cumulative scores saved to DB</span>
                </button>
                <button onClick={() => stopGame('discard')} style={{ width: '100%', textAlign: 'left', padding: '8px', fontSize: '11px', background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', borderTop: '1px solid var(--border-primary)' }}>
                  🗑️ Discard Round & Restart
                  <br /><span style={{ color: 'var(--text-muted)', fontSize: '9px' }}>Points from this round discarded</span>
                </button>
                <button onClick={() => stopGame('fresh')} style={{ width: '100%', textAlign: 'left', padding: '8px', fontSize: '11px', background: 'transparent', border: 'none', color: 'var(--text-danger)', cursor: 'pointer', borderTop: '1px solid var(--border-primary)' }}>
                  💀 Full Reset (Nuke)
                  <br /><span style={{ color: 'var(--text-muted)', fontSize: '9px' }}>Wipes everything including DB scores</span>
                </button>
              </div>
            )}
          </div>
          <button className="btn-danger" onClick={resetGame}>
            <RotateCcw size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            Reset
          </button>
        </div>
      </div>

      {/* Admin Actions mid-game */}
      {gameState?.phase === 'standup' && (
        <div className="terminal-box" style={{ marginBottom: '24px', borderColor: 'var(--text-warning)' }}>
          <h3 style={{ fontSize: '14px', color: 'var(--text-warning)', textTransform: 'uppercase', marginBottom: '12px' }}>
            Live Event: Emergency Stand-Up
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '16px' }}>
            Voting is currently active.
          </p>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Discussion Length (ms)
              </label>
              <input
                type="number"
                value={standupDurationInput}
                onChange={(e) => setStandupDurationInput(e.target.value)}
                style={{ width: '180px' }}
              />
            </div>
            <button
              className="btn-accent"
              onClick={() => {
                const nextValue = parseInt(standupDurationInput, 10);
                if (!Number.isNaN(nextValue)) {
                  adminSocket?.emit('admin_update_config', { standupDurationMs: nextValue });
                }
              }}
            >
              Apply Length
            </button>
            <button className="btn-warning" onClick={() => adminSocket?.emit('admin_extend_standup', { amount: 30000 })}>
              +30s Discussion
            </button>
          </div>
        </div>
      )}

      {/* Admin Config Override */}
      {gameState?.adminConfig && gameState.phase === 'lobby' && (
        <div className="terminal-box" style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>
            Game Rules & Constraints
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
            {Object.entries(gameState.adminConfig).map(([key, val]) => (
               <div key={key}>
                 <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{CONFIG_LABELS[key] || key}</label>
                 <input
                   type="number"
                   defaultValue={val}
                   style={{ width: '100%', marginTop: '4px' }}
                   onBlur={(e) => {
                     const num = parseInt(e.target.value);
                     if (!isNaN(num)) {
                       adminSocket?.emit('admin_update_config', { [key]: num });
                     }
                   }}
                 />
               </div>
            ))}
          </div>
          <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '12px' }}>* Settings can only be safely modified while in the lobby.</p>
        </div>
      )}

      {/* ── GAME OVER SCOREBOARD ──────────────────────────────── */}
      {gameState?.phase === 'ended' && (
        <div className="terminal-box" style={{ marginBottom: '24px', textAlign: 'center' }}>
          <h2 style={{
            fontSize: '20px', letterSpacing: '3px', textTransform: 'uppercase',
            color: gameState.winSide === 'developers' ? 'var(--text-accent)' : 'var(--text-danger)',
            marginBottom: '16px',
          }}>
            {gameState.winSide === 'developers' ? 'DEVELOPERS WIN' : 'HACKERS WIN'}
          </h2>

          <h3 style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px', textTransform: 'uppercase' }}>
            Top 3 MVP {gameState.winSide === 'developers' ? 'Developers' : 'Hackers'}
          </h3>
          <div style={{ textAlign: 'left', maxWidth: '400px', margin: '0 auto' }}>
            {(gameState.players || [])
              .filter(p => (gameState.winSide === 'developers' && p.role === 'developer') || (gameState.winSide === 'hackers' && p.role === 'hacker'))
              .map(p => ({ id: p.id, name: p.name, score: gameState.scores?.[p.id] || 0 }))
              .sort((a, b) => b.score - a.score)
              .slice(0, 3)
              .map((p, idx) => (
                <div key={p.id} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '8px 12px', borderBottom: '1px solid var(--border-primary)',
                  fontSize: '13px', background: idx === 0 ? 'var(--bg-tertiary)' : 'transparent',
                  alignItems: 'center'
                }}>
                  <span>{idx === 0 ? '👑 ' : ''}{p.name}</span>
                  <span style={{ color: 'var(--text-accent)', fontWeight: idx === 0 ? 'bold' : 'normal' }}>{p.score} pts</span>
                </div>
              ))}
          </div>
        </div>
      )}

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
                placeholder="Code (max 6)"
                value={regCode}
                onChange={e => setRegCode(e.target.value.substring(0, 6).toUpperCase())}
                maxLength={6}
                style={{ width: '150px', textTransform: 'uppercase' }}
              />
              <button className="btn-accent" onClick={registerUser} disabled={!regName || !regCode}>
                Register
              </button>
            </div>
            <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Access codes max 6 characters. Give players their code to connect.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>BULK REGISTRATION</div>
              <textarea
                placeholder="Paste names here (one per line)...&#10;Benjamin&#10;Yogeetha"
                value={bulkNames}
                onChange={e => setBulkNames(e.target.value)}
                style={{ width: '100%', height: '80px', padding: '8px', background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)', borderRadius: '4px', resize: 'vertical', fontSize: '12px' }}
              />
              <button className="btn-accent" onClick={bulkRegister} disabled={!bulkNames.trim()} style={{ alignSelf: 'flex-start' }}>
                Bulk Generate & Register
              </button>
            </div>
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
                {['Name', 'Room', 'Role', 'Status', 'Score', 'Action'].map(h => (
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
                  <td style={{ padding: '8px' }}>
                    {gameState?.phase === 'playing' && p.status !== 'disconnected' && p.status !== 'ejected' ? (
                      <button
                        className="btn-danger"
                        style={{ padding: '6px 10px', fontSize: '10px' }}
                        onClick={() => adminSocket?.emit('admin_kick_player', p.id)}
                      >
                        Kick
                      </button>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live Cumulative Scoreboard */}
      {(gameState as any)?.nameScores && Object.keys((gameState as any).nameScores).length > 0 && (
        <div className="terminal-box" style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
            Live Scoreboard (Cumulative)
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                  <th style={{ padding: '8px', textAlign: 'left', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '10px' }}>#</th>
                  <th style={{ padding: '8px', textAlign: 'left', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '10px' }}>Player</th>
                  <th style={{ padding: '8px', textAlign: 'right', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '10px' }}>Points</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries((gameState as any).nameScores)
                  .sort(([, a], [, b]) => (b as number) - (a as number))
                  .map(([name, score], idx) => (
                    <tr key={name} style={{ borderBottom: '1px solid #0a0a0a', background: idx === 0 ? 'var(--bg-tertiary)' : 'transparent' }}>
                      <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{idx + 1}</td>
                      <td style={{ padding: '8px' }}>{idx === 0 ? '\ud83d\udc51 ' : ''}{name}</td>
                      <td style={{ padding: '8px', textAlign: 'right', color: 'var(--text-accent)', fontWeight: idx < 3 ? 'bold' : 'normal' }}>{score as number} pts</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {showRoleModal && (
        <div className="overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="terminal-box" style={{ width: '400px', padding: '24px', background: 'var(--bg-primary)', position: 'relative' }}>
            <button onClick={() => setShowRoleModal(false)} style={{ position: 'absolute', top: '12px', right: '12px', background: 'transparent', border: 'none', color: 'var(--text-muted)' }}>
              [X]
            </button>
            <h3 style={{ fontSize: '16px', textTransform: 'uppercase', marginBottom: '16px', color: 'var(--text-accent)' }}>
              Assign Roles
            </h3>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Review and adjust the randomly suggested roles before starting the game. You must select at least 1 Hacker.
            </p>

            <div style={{ maxHeight: '250px', overflowY: 'auto', marginBottom: '16px', border: '1px solid var(--border-primary)', padding: '8px' }}>
              {(gameState?.players || []).map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--bg-tertiary)' }}>
                  <span style={{ fontSize: '12px' }}>{p.name}</span>
                  <select
                    value={rolesMap[p.id]}
                    onChange={(e) => setRolesMap({ ...rolesMap, [p.id]: e.target.value })}
                    style={{ padding: '4px', fontSize: '11px', background: 'var(--bg-secondary)', color: rolesMap[p.id] === 'hacker' ? 'var(--text-danger)' : 'var(--text-accent)', border: '1px solid var(--border-primary)' }}
                  >
                    <option value="developer">Developer</option>
                    <option value="hacker">Hacker</option>
                  </select>
                </div>
              ))}
            </div>

            <button className="btn-accent" onClick={confirmAndStartGame} style={{ width: '100%' }}>
              Confirm & Start Game
            </button>
          </div>
        </div>
      )}
      {showEndStopPopup && (
        <div className="overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div className="terminal-box" style={{ width: '420px', padding: '24px' }}>
            <h3 style={{ fontSize: '16px', textTransform: 'uppercase', marginBottom: '12px', color: 'var(--text-warning)' }}>
              Round Ended
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Choose how to stop and reset the game.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button className="btn-accent" onClick={() => stopGame('retain')}>
                Retain Points & Restart
              </button>
              <button className="btn-warning" onClick={() => stopGame('discard')}>
                Discard Round & Restart
              </button>
              <button className="btn-danger" onClick={() => stopGame('fresh')}>
                Full Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
