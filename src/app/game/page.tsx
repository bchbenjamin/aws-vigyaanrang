'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import {
  ShieldAlert, Skull, Clock,
  Siren, WifiOff, Trash2,
} from 'lucide-react';
import CircuitMap from '@/components/CircuitMap';
import CodeEditor from '@/components/CodeEditor';
import VotingOverlay from '@/components/VotingOverlay';
import FirewallOverlay from '@/components/FirewallOverlay';
import styles from './page.module.css';

const ALL_ROOMS = ['Frontend', 'Main Database', 'API Gateway', 'Server Room', 'QA Testing Lab', 'The Log Room', 'Breakroom'];
const TASK_ROOMS = ['Frontend', 'Main Database', 'API Gateway', 'Server Room', 'QA Testing Lab'];

let socket: Socket | null = null;

export default function GamePage() {
  const router = useRouter();

  // ── Core State ──────────────────────────────────────────
  const [connected, setConnected] = useState(false);
  const [phase, setPhase] = useState<'lobby' | 'playing' | 'standup' | 'ended'>('lobby');
  const [role, setRole] = useState<'developer' | 'hacker'>('developer');
  const [status, setStatus] = useState<'alive' | 'firewall' | 'ejected'>('alive');
  const [room, setRoom] = useState('Breakroom');
  const [isMoving, setIsMoving] = useState(false);
  const [movingTo, setMovingTo] = useState<string | null>(null);
  const [globalProgress, setGlobalProgress] = useState(0);
  const [roomPlayers, setRoomPlayers] = useState<{ id: string; name: string; status: string }[]>([]);
  const [roomCounts, setRoomCounts] = useState<Record<string, number>>({});
  const [playerName, setPlayerName] = useState('');
  
  // Mobile Tab State
  const [mobileTab, setMobileTab] = useState<'map' | 'task'>('map');

  // ── Task State ──────────────────────────────────────────
  const [taskId, setTaskId] = useState<string | null>(null);
  const [sabotageTaskId, setSabotageTaskId] = useState<string | null>(null);
  const [fakeTaskId, setFakeTaskId] = useState<string | null>(null);

  // ── Motion Log (The Log Room) ───────────────────────────
  const [motionLog, setMotionLog] = useState<{ time: string; message: string }[]>([]);
  const [logsCorrupted, setLogsCorrupted] = useState(false);

  // ── Alerts ──────────────────────────────────────────────
  const [alertBanner, setAlertBanner] = useState<{ type: string; message: string } | null>(null);
  const [hackCooldownUntil, setHackCooldownUntil] = useState(0);
  const [anomalyUsed, setAnomalyUsed] = useState(false);

  // ── Voting ──────────────────────────────────────────────
  const [standupData, setStandupData] = useState<{
    reportedBy: string;
    durationMs: number;
    alivePlayers: { id: string; name: string }[];
  } | null>(null);
  const [hasVoted, setHasVoted] = useState(false);

  // ── End Game ────────────────────────────────────────────
  const [endData, setEndData] = useState<{
    winSide: string;
    reason: string;
    scores: Record<string, number>;
    players: Record<string, any>;
  } | null>(null);

  // ── Timer ───────────────────────────────────────────────
  const [gameTime, setGameTime] = useState(0);

  // ── Connect to Socket.io ────────────────────────────────
  useEffect(() => {
    const code = sessionStorage.getItem('playerCode');
    if (!code) {
      router.push('/');
      return;
    }
    setPlayerName(`[${code}]`);

    socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      setConnected(true);
      socket?.emit('join_game', { code });
    });

    socket.on('disconnect', () => setConnected(false));
    socket.on('force_disconnect', () => router.push('/'));

    // ── STATE SYNC (initial) ──────────────────────────
    socket.on('state_sync', (data) => {
      setPhase(data.phase);
      setPlayerName(data.you?.name || 'Anon');
      setRoom(data.you?.room || 'Breakroom');
      if (data.roomPlayers) setRoomPlayers(data.roomPlayers);
      setGlobalProgress(data.globalProgress);
      if (data.motionLog) setMotionLog(data.motionLog);
      setLogsCorrupted(data.logsCorrupted);
    });

    // ── GAME STARTED ──────────────────────────────────
    socket.on('game_started', (data) => {
      setPhase('playing');
      setRole(data.role);
      setStatus('alive');
    });

    socket.on('phase_change', (data) => setPhase(data.phase));

    // ── ROOM EVENTS ───────────────────────────────────
    socket.on('moving', (data) => {
      setIsMoving(true);
      setMovingTo(data.to);
    });

    socket.on('entered_room', (data) => {
      setIsMoving(false);
      setMovingTo(null);
      setRoom(data.room);
      setTaskId(data.taskId || null);
      setSabotageTaskId(data.sabotageTaskId || null);
      setFakeTaskId(data.fakeTaskId || null);
      if (data.motionLog !== undefined) setMotionLog(data.motionLog || []);
      if (data.logsCorrupted !== undefined) setLogsCorrupted(data.logsCorrupted);
      // Auto switch to task tab on entering task room natively
      if (TASK_ROOMS.includes(data.room)) setMobileTab('task');
    });

    socket.on('room_update', (data) => {
      setRoomPlayers(data.players);
    });

    socket.on('room_counts', (data) => setRoomCounts(data));

    // ── PROGRESS ──────────────────────────────────────
    socket.on('progress_update', (data) => setGlobalProgress(data.globalProgress));

    // ── TASK ASSIGNMENTS ──────────────────────────────
    socket.on('task_assigned', (data) => {
      if (data.taskId) setTaskId(data.taskId);
      if (data.sabotageTaskId) setSabotageTaskId(data.sabotageTaskId);
      if (data.fakeTaskId) setFakeTaskId(data.fakeTaskId);
    });

    // ── HACK EVENTS ───────────────────────────────────
    socket.on('connection_lost', (data) => {
      showAlert('danger', `CONNECTION LOST: ${data.victimName} has been eliminated in ${data.room}`);
    });

    socket.on('you_were_hacked', () => {
      setStatus('firewall');
      showAlert('danger', 'YOU HAVE BEEN HACKED. Transitioning to Firewall mode...');
    });

    socket.on('hack_success', (data) => {
      setHackCooldownUntil(data.cooldownUntil);
    });

    // ── ANOMALY ALERT ─────────────────────────────────
    socket.on('anomaly_alert_broadcast', (data) => {
      showAlert('warning', data.message);
    });

    // ── LOG ROOM EVENTS ───────────────────────────────
    socket.on('logs_corrupted', () => {
      setLogsCorrupted(true);
    });

    socket.on('logs_restored', (data) => {
      setLogsCorrupted(false);
      setMotionLog(data.motionLog || []);
    });

    // ── STANDUP (VOTING) ──────────────────────────────
    socket.on('standup_started', (data) => {
      setPhase('standup');
      setRoom('Breakroom');
      setHasVoted(false);
      setStandupData({
        reportedBy: data.reportedBy,
        durationMs: data.duration,
        alivePlayers: data.alivePlayers,
      });
    });

    socket.on('standup_resolved', (data) => {
      setPhase('playing');
      setStandupData(null);
      if (data.ejected) {
        const roleText = data.ejected.role === 'hacker' ? 'HACKER' : 'DEVELOPER';
        showAlert(
          data.ejected.role === 'hacker' ? 'warning' : 'danger',
          `${data.ejected.name} was ejected. They were a ${roleText}.`
        );
      } else {
        showAlert('warning', data.tie ? 'Vote was tied. No one was ejected.' : 'No majority. No one was ejected.');
      }
    });

    // ── GAME END ──────────────────────────────────────
    socket.on('game_ended', (data) => {
      setPhase('ended');
      setEndData({
        winSide: data.winSide,
        reason: data.reason,
        scores: data.scores,
        players: data.players,
      });
    });

    socket.on('game_reset', () => {
      setPhase('lobby');
      setRole('developer');
      setStatus('alive');
      setRoom('Breakroom');
      setGlobalProgress(0);
      setEndData(null);
      setAnomalyUsed(false);
    });

    socket.on('error_msg', (msg) => {
      showAlert('danger', msg);
    });

    // Timer
    const timer = setInterval(() => setGameTime(prev => prev + 1), 1000);

    return () => {
      clearInterval(timer);
      socket?.disconnect();
      socket = null;
    };
  }, [router]);

  // ── HELPERS ─────────────────────────────────────────────
  function showAlert(type: string, message: string) {
    setAlertBanner({ type, message });
    setTimeout(() => setAlertBanner(null), 5000);
  }

  const handleNavigate = useCallback((targetRoom: string) => {
    if (!socket || isMoving || room === targetRoom) return;
    if (phase === 'standup') return;
    socket.emit('move_room', targetRoom);
  }, [isMoving, room, phase]);

  const handleTaskSubmit = useCallback((result: { correct: boolean; isSabotage: boolean; taskId?: string }) => {
    if (!socket || !result.correct) return;
    socket.emit('task_complete', { isSabotage: result.isSabotage, taskId: result.taskId });
  }, []);

  const handleHack = useCallback((targetId: string) => {
    if (!socket) return;
    if (Date.now() < hackCooldownUntil) {
      const secs = Math.ceil((hackCooldownUntil - Date.now()) / 1000);
      showAlert('danger', `Hack on cooldown: ${secs}s remaining`);
      return;
    }
    socket.emit('hack_player', targetId);
  }, [hackCooldownUntil]);

  const handleCallStandup = useCallback(() => {
    if (!socket) return;
    socket.emit('call_standup');
  }, []);

  const handleVote = useCallback((targetId: string) => {
    if (!socket) return;
    socket.emit('cast_vote', targetId);
    setHasVoted(true);
  }, []);

  const handleAnomalyAlert = useCallback((alertRoom: string) => {
    if (!socket) return;
    socket.emit('anomaly_alert', { room: alertRoom });
    setAnomalyUsed(true);
  }, []);

  const handleWipeLogs = useCallback(() => {
    if (!socket) return;
    socket.emit('wipe_logs');
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  // ── RENDER ──────────────────────────────────────────────

  // Waiting for game start overlay
  if (phase === 'lobby') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '16px' }}>
        <ShieldAlert size={48} color="var(--text-accent)" className="pulse" />
        <h2 style={{ fontSize: '18px', letterSpacing: '2px' }}>WAITING FOR ADMIN</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
          Connected as: <span style={{ color: 'var(--text-accent)' }}>{playerName}</span>
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
          Status: {connected ? 'Connected' : 'Connecting...'}
        </p>
      </div>
    );
  }

  // Game ended overlay
  if (phase === 'ended' && endData) {
    return (
      <div className="overlay">
        <div className="overlay-content" style={{ textAlign: 'center' }}>
          <h2 style={{
            fontSize: '20px', letterSpacing: '3px', textTransform: 'uppercase',
            color: endData.winSide === 'developers' ? 'var(--text-accent)' : 'var(--text-danger)',
            marginBottom: '16px',
          }}>
            {endData.winSide === 'developers' ? 'DEVELOPERS WIN' : 'HACKERS WIN'}
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '24px' }}>
            {endData.reason}
          </p>

          <button className="btn-accent" onClick={() => window.location.href = '/'} style={{ marginTop: '24px', width: '100%' }}>
            Return to Lobby
          </button>
        </div>
      </div>
    );
  }

  const isInTaskRoom = TASK_ROOMS.includes(room) && !isMoving;
  const isInLogRoom = room === 'The Log Room' && !isMoving;

  return (
    <div className={styles.gameContainer}>
      {/* ── ALERT BANNER ──────────────────────────── */}
      {alertBanner && (
        <div className={`alert-banner ${alertBanner.type === 'danger' ? 'alert-danger' : 'alert-warning'}`}>
          {alertBanner.type === 'danger' ? <WifiOff size={16} style={{ verticalAlign: 'middle', marginRight: '8px' }} /> : null}
          {alertBanner.message}
        </div>
      )}

      {/* ── HEADER ────────────────────────────────── */}
      <header className={styles.gameHeader}>
        <div className={styles.headerLeft}>
          <ShieldAlert size={20} color="var(--text-danger)" />
          <span style={{ fontSize: '14px', letterSpacing: '2px', textTransform: 'uppercase' }}>B&D</span>
          <span className={`badge ${connected ? 'badge-online' : 'badge-offline'}`}>
            {connected ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>

        <div className={styles.headerCenter}>
          <span style={{ color: 'var(--text-muted)', fontSize: '10px', minWidth: '30px' }}>
            {Math.round(globalProgress)}%
          </span>
          <div className="progress-bar-container" style={{ flex: 1 }}>
            <div className="progress-bar-fill" style={{ width: `${globalProgress}%` }} />
          </div>
          <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>100%</span>
        </div>

        <div className={styles.headerRight}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={12} color="var(--text-muted)" />
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{formatTime(gameTime)}</span>
          </div>
        </div>
      </header>

      {/* ── MOBILE TABS UI ────────────────────────── */}
      <div className={styles.mobileTabsContainer}>
        <button 
          className={styles.mobileTabBtn} 
          data-active={mobileTab === 'map'} 
          onClick={() => setMobileTab('map')}
        >
          CIRCUIT MAP
        </button>
        <button 
          className={styles.mobileTabBtn} 
          data-active={mobileTab === 'task'} 
          onClick={() => setMobileTab('task')}
        >
          TERMINAL
        </button>
      </div>

      {/* ── MAIN CONTENT ──────────────────────────── */}
      <main className={styles.gameMain} data-mobile-tab={mobileTab}>
        {/* LEFT: Map + Room Info */}
        <div className={styles.mapSection}>
          <CircuitMap
            currentRoom={room}
            roomCounts={roomCounts}
            isMoving={isMoving}
            movingTo={movingTo}
            onNavigate={handleNavigate}
            isFirewall={status === 'firewall'}
          />

          {/* Room players panel */}
          <div className={styles.roomPlayersPanel}>
            <h4 style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
              Players in {room} ({roomPlayers.length})
            </h4>
            {roomPlayers.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '11px' }}>No other players here.</p>
            ) : (
              roomPlayers.map(p => (
                <div key={p.id} className={styles.playerListItem}>
                  <span style={{ color: p.status === 'firewall' ? 'var(--text-warning)' : 'var(--text-primary)' }}>
                    {p.name}
                    {p.status === 'firewall' && (
                      <span className="badge badge-firewall" style={{ marginLeft: '8px' }}>FW</span>
                    )}
                  </span>
                  {/* Hack button — visible to everyone but only functional for hackers */}
                  {role === 'hacker' && status === 'alive' && p.status === 'alive' && (
                    <button className={styles.hackBtn} onClick={() => handleHack(p.id)}>
                      <Skull size={10} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                      HACK
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* The Log Room: Motion Feed */}
          {isInLogRoom && (
            <div className={styles.logPanel}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h4 style={{ fontSize: '11px', color: 'var(--text-info)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  Security Motion Log
                </h4>
                {role === 'hacker' && !logsCorrupted && (
                  <button
                    onClick={handleWipeLogs}
                    style={{ fontSize: '9px', padding: '2px 8px', color: 'var(--text-danger)', borderColor: 'var(--border-danger)', background: 'transparent' }}
                  >
                    <Trash2 size={10} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                    WIPE
                  </button>
                )}
              </div>

              {logsCorrupted ? (
                <div className="log-corrupted">ERROR: LOGS CORRUPTED BY MALWARE</div>
              ) : motionLog.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '11px' }}>No recent activity logged.</p>
              ) : (
                motionLog.map((entry, i) => (
                  <div key={i} className="log-entry">
                    <span className="log-time">[{entry.time}]</span>
                    {entry.message}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* RIGHT: Task / Code Editor */}
        <div className={styles.taskSection}>
          {isInTaskRoom ? (
            <CodeEditor
              taskId={taskId}
              sabotageTaskId={sabotageTaskId}
              fakeTaskId={fakeTaskId}
              isHacker={role === 'hacker'}
              onSubmit={handleTaskSubmit}
            />
          ) : isInLogRoom ? (
            <div className="terminal-box" style={{ margin: '16px', flex: 1 }}>
              <h3 style={{ fontSize: '14px', color: 'var(--text-info)', marginBottom: '8px' }}>
                Security & Auth — The Log Room
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                This room monitors network activity. No coding tasks available.
                Review the motion log on the left panel for suspicious patterns.
              </p>
            </div>
          ) : room === 'Breakroom' ? (
            <div className="terminal-box" style={{ margin: '16px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '16px' }}>
              <h3 style={{ fontSize: '14px', marginBottom: '8px' }}>The Breakroom</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '12px', textAlign: 'center' }}>
                Safe zone. No tasks here. Use this space to discuss with your team.
              </p>
              {status === 'alive' && (
                <button className="btn-danger" onClick={handleCallStandup}>
                  <Siren size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                  Emergency Stand-Up
                </button>
              )}
            </div>
          ) : (
            <div className="terminal-box" style={{ margin: '16px', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Loading room data...</p>
            </div>
          )}
        </div>
      </main>

      {/* ── FOOTER ────────────────────────────────── */}
      <footer className={styles.gameFooter}>
        <span style={{ color: 'var(--text-muted)' }}>
          {playerName} | {room}
        </span>
        <span style={{ color: 'var(--text-muted)' }}>
          Role: <span style={{ color: role === 'hacker' ? 'var(--text-danger)' : 'var(--text-accent)' }}>
            {role.toUpperCase()}
          </span>
        </span>
        <span style={{ color: 'var(--text-muted)' }}>
          Progress: {Math.round(globalProgress)}%
        </span>
      </footer>

      {/* ── OVERLAYS ──────────────────────────────── */}
      {phase === 'standup' && standupData && status === 'alive' && (
        <VotingOverlay
          reportedBy={standupData.reportedBy}
          durationMs={standupData.durationMs}
          alivePlayers={standupData.alivePlayers}
          onVote={handleVote}
          hasVoted={hasVoted}
        />
      )}

      {status === 'firewall' && (
        <FirewallOverlay
          rooms={ALL_ROOMS}
          currentRoom={room}
          onAnomalyAlert={handleAnomalyAlert}
          anomalyUsed={anomalyUsed}
          onNavigate={handleNavigate}
        />
      )}
    </div>
  );
}
