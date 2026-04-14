'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import {
  ShieldAlert, Skull, Clock, Settings,
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
  const [myId, setMyId] = useState('');
  const [room, setRoom] = useState('Breakroom');
  const [isMoving, setIsMoving] = useState(false);
  const [movingTo, setMovingTo] = useState<string | null>(null);
  const [globalProgress, setGlobalProgress] = useState(0);
  const [roomPlayers, setRoomPlayers] = useState<{ id: string; name: string; status: string; role?: string; isProtected?: boolean }[]>([]);
  const [roomCounts, setRoomCounts] = useState<Record<string, number>>({});
  const [playerName, setPlayerName] = useState('');
  
  // Mobile Tab State
  const [mobileTab, setMobileTab] = useState<'map' | 'task'>('map');

  // ── Task State ──────────────────────────────────────────
  const [taskId, setTaskId] = useState<string | null>(null);
  const [hackTaskId, setHackTaskId] = useState<string | null>(null);
  const [hackTargetId, setHackTargetId] = useState<string | null>(null);
  const [protectTargetId, setProtectTargetId] = useState<string | null>(null);

  // ── Motion Log (The Log Room) ───────────────────────────
  const [motionLog, setMotionLog] = useState<{ time: string; message: string }[]>([]);
  const [logsCorrupted, setLogsCorrupted] = useState(false);

  // ── Alerts ──────────────────────────────────────────────
  const [alertBanner, setAlertBanner] = useState<{ type: string; message: string } | null>(null);
  const [hackCooldownUntil, setHackCooldownUntil] = useState(0);

  // ── Voting ──────────────────────────────────────────────
  const [standupData, setStandupData] = useState<{
    reportedBy: string;
    durationMs: number;
    alivePlayers: { id: string; name: string }[];
  } | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [aliveDevelopers, setAliveDevelopers] = useState<{id: string, name: string}[]>([]);

  // ── End Game ────────────────────────────────────────────
  const [endData, setEndData] = useState<{
    winSide: string;
    reason: string;
    scores: Record<string, number>;
    players: Record<string, any>;
  } | null>(null);

  // ── Timer ───────────────────────────────────────────────
  const [gameEndTime, setGameEndTime] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // ── FAB & Confirmation ─────────────────────────────────
  const [fabOpen, setFabOpen] = useState(false);
  const [showStandupConfirm, setShowStandupConfirm] = useState(false);
  const [myScore, setMyScore] = useState(0);
  const [completionFx, setCompletionFx] = useState<{ message: string; tone: 'task' | 'hack' } | null>(null);
  const fabButtonRef = useRef<HTMLButtonElement | null>(null);
  const fabPanelRef = useRef<HTMLDivElement | null>(null);
  const showAlert = useCallback((type: string, message: string) => {
    setAlertBanner({ type, message });
    setTimeout(() => setAlertBanner(null), 5000);
  }, []);
  const triggerCompletionFx = useCallback((message: string, tone: 'task' | 'hack') => {
    setCompletionFx({ message, tone });
    setTimeout(() => setCompletionFx(null), 1800);
  }, []);

  // ── Connect to Socket.io ────────────────────────────────
  useEffect(() => {
    const code = localStorage.getItem('playerCode') || sessionStorage.getItem('playerCode');
    if (!code) {
      router.push('/');
      return;
    }
    setPlayerName(`[${code}]`);

    socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
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
      setMyId(data.you?.id || '');
      setPlayerName(data.you?.name || 'Anon');
      setRole(data.you?.role || 'developer');
      setStatus(data.you?.status || 'alive');
      setRoom(data.you?.room || 'Breakroom');
      setHackCooldownUntil(data.you?.hackCooldownUntil || 0);
      setGameEndTime(data.gameEndTime || null);
      if (data.roomPlayers) setRoomPlayers(data.roomPlayers);
      if (data.aliveDevelopers) setAliveDevelopers(data.aliveDevelopers);
      setGlobalProgress(data.globalProgress);
      if (data.motionLog) setMotionLog(data.motionLog);
      setLogsCorrupted(data.logsCorrupted);
    });

    // ── GAME STARTED ──────────────────────────────────
    socket.on('game_started', (data) => {
      setPhase('playing');
      setRole(data.role);
      setStatus('alive');
      setProtectTargetId(null);
      setGameEndTime(data.gameEndTime || null);
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
      setHackTaskId(data.hackTaskId || null);
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
      if (data.taskId !== undefined) setTaskId(data.taskId);
      if (data.hackTaskId !== undefined) setHackTaskId(data.hackTaskId);
    });

    socket.on('task_result', (data) => {
      if (data?.success) {
        triggerCompletionFx(data.message || 'Task completed.', 'task');
      }
    });

    socket.on('task_cooldown', (data) => {
       showAlert('warning', data.msg || `Tasks on cooldown. Please wait ${data.remaining}s.`);
    });

    socket.on('your_score', (data) => {
      setMyScore(data.score || 0);
    });

    // ── HACK EVENTS ───────────────────────────────────
    socket.on('you_were_hacked', () => {
      setStatus('firewall');
      setProtectTargetId(null);
      showAlert('danger', 'YOU HAVE BEEN HACKED. Transitioning to Firewall mode...');
    });

    socket.on('alive_developers_update', (devs) => {
      setAliveDevelopers(devs);
    });

    socket.on('hack_success', (data) => {
      setHackCooldownUntil(data.cooldownUntil);
      triggerCompletionFx(data.message || `Hack executed on ${data.target}.`, 'hack');
    });

    socket.on('hack_cooldown_reset', (data) => {
      setHackCooldownUntil(0);
      showAlert('warning', data.message);
    });

    // ── ANOMALY ALERT ─────────────────────────────────
    // ── LOG ROOM EVENTS ───────────────────────────────
    socket.on('logs_corrupted', () => {
      setLogsCorrupted(true);
    });

    socket.on('logs_restored', (data) => {
      setLogsCorrupted(false);
      setMotionLog(data.motionLog || []);
    });

    // Live log update — received from ANY room for real-time Log Room
    socket.on('motion_log_update', (data) => {
      if (data.logsCorrupted) {
        setLogsCorrupted(true);
      } else {
        setLogsCorrupted(false);
        if (data.motionLog) setMotionLog(data.motionLog);
      }
    });

    // ── STANDUP (VOTING) ──────────────────────────────
    socket.on('standup_started', (data) => {
      setPhase('standup');
      setRoom('Breakroom');
      setHasVoted(false);
      setTaskId(null);
      setHackTaskId(null);
      setStandupData({
        reportedBy: data.reportedBy,
        durationMs: data.duration,
        alivePlayers: data.alivePlayers,
      });
    });

    socket.on('extend_timer_update', (data) => {
      setStandupData(prev => prev ? { ...prev, durationMs: data.durationMs } : null);
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
      setHackTargetId(null);
      setProtectTargetId(null);
      setGameEndTime(null);
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
      setTaskId(null);
      setHackTaskId(null);
      setHackTargetId(null);
      setProtectTargetId(null);
      setHackCooldownUntil(0);
      setGameEndTime(null);
      setEndData(null);
    });

    socket.on('error_msg', (msg) => {
      showAlert('danger', msg);
    });

    // Timer
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      clearInterval(timer);
      socket?.disconnect();
      socket = null;
    };
  }, [router, triggerCompletionFx]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        fabOpen &&
        fabPanelRef.current &&
        fabButtonRef.current &&
        !fabPanelRef.current.contains(target) &&
        !fabButtonRef.current.contains(target)
      ) {
        setFabOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [fabOpen]);

  // ── HELPERS ─────────────────────────────────────────────
  const handleNavigate = useCallback((targetRoom: string) => {
    if (!socket || isMoving || room === targetRoom) return;
    if (phase === 'standup') return;
    socket.emit('move_room', targetRoom);
  }, [isMoving, room, phase]);

  const handleTaskSubmit = useCallback((result: { correct: boolean; isHackTask: boolean; taskId?: string; protectedTargetId?: string }) => {
    if (!socket || !result.correct) return;
    if (result.isHackTask) {
       socket.emit('submit_hack', { taskId: result.taskId, targetId: hackTargetId });
       setHackTargetId(null);
       setHackTaskId(null);
    } else {
       socket.emit('task_complete', { taskId: result.taskId, protectedTargetId: result.protectedTargetId });
       setTaskId(null);
    }
  }, [hackTargetId]);

  const handleHack = useCallback((targetId: string) => {
    if (!socket) return;
    if (targetId === myId) return;
    if (Date.now() < hackCooldownUntil) {
      const secs = Math.ceil((hackCooldownUntil - Date.now()) / 1000);
      showAlert('danger', `Hack on cooldown: ${secs}s remaining`);
      return;
    }
    setHackTargetId(targetId);
    socket.emit('start_hack', targetId);
  }, [hackCooldownUntil, myId]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('playerCode');
    sessionStorage.removeItem('playerCode');
    socket?.disconnect();
    router.push('/');
  }, [router]);

  const handleCallStandup = useCallback(() => {
    setShowStandupConfirm(true);
  }, []);

  const confirmStandup = useCallback(() => {
    if (!socket) return;
    socket.emit('call_standup');
    setShowStandupConfirm(false);
  }, []);

  const handleVote = useCallback((targetId: string) => {
    if (!socket) return;
    socket.emit('cast_vote', targetId);
    setHasVoted(true);
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const remainingGameSeconds = gameEndTime ? Math.max(0, Math.ceil((gameEndTime - nowMs) / 1000)) : 0;

  useEffect(() => {
    if (protectTargetId && !aliveDevelopers.some(player => player.id === protectTargetId)) {
      setProtectTargetId(aliveDevelopers[0]?.id || null);
    }
  }, [aliveDevelopers, protectTargetId]);

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

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '24px' }}>
            <button className="btn-accent" onClick={() => router.push('/')} style={{ width: '100%' }}>
              Return to Lobby
            </button>
            <button onClick={handleLogout} style={{ width: '100%', background: 'transparent', border: '1px solid var(--border-primary)', color: 'var(--text-muted)', padding: '10px 16px', borderRadius: '4px', cursor: 'pointer' }}>
              Log Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isInTaskRoom = TASK_ROOMS.includes(room) && !isMoving;
  const isInLogRoom = room === 'The Log Room' && !isMoving;
  const selectedProtectTarget = aliveDevelopers.find(player => player.id === protectTargetId) || null;
  const canUseCodeEditor = status === 'firewall' || isInTaskRoom || !!hackTaskId;

  return (
    <div className={styles.gameContainer}>
      {/* ── ALERT BANNER ──────────────────────────── */}
      {alertBanner && (
        <div className={`alert-banner ${alertBanner.type === 'danger' ? 'alert-danger' : 'alert-warning'}`}>
          {alertBanner.type === 'danger' ? <WifiOff size={16} style={{ verticalAlign: 'middle', marginRight: '8px' }} /> : null}
          {alertBanner.message}
        </div>
      )}

      {completionFx && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9997,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: completionFx.tone === 'hack' ? 'radial-gradient(circle, rgba(255,70,70,0.22), transparent 65%)' : 'radial-gradient(circle, rgba(0,255,136,0.2), transparent 65%)',
          }}
        >
          <div
            className="terminal-box"
            style={{
              minWidth: '280px',
              textAlign: 'center',
              padding: '24px 28px',
              borderColor: completionFx.tone === 'hack' ? 'var(--text-danger)' : 'var(--text-accent)',
              boxShadow: completionFx.tone === 'hack' ? '0 0 32px rgba(255,70,70,0.22)' : '0 0 32px rgba(0,255,136,0.2)',
            }}
          >
            <div style={{ fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: completionFx.tone === 'hack' ? 'var(--text-danger)' : 'var(--text-accent)', marginBottom: '8px' }}>
              {completionFx.tone === 'hack' ? 'Hack Executed' : 'Task Completed'}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{completionFx.message}</div>
          </div>
        </div>
      )}

      {/* Reconnecting banner */}
      {!connected && phase !== 'lobby' && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
          background: 'var(--text-warning)', color: '#000', padding: '6px',
          textAlign: 'center', fontSize: '12px', fontWeight: 'bold',
        }}>
          ⚠️ CONNECTION LOST — Attempting to reconnect...
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
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{formatTime(remainingGameSeconds)}</span>
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
                  {/* Protect button — visible and functional for firewalls to protect devs */}
                  {false && status === 'firewall' && p.status === 'alive' && p.role === 'developer' && !p.isProtected && (
                    <button className={styles.hackBtn} style={{ background: 'var(--text-info)' }} onClick={() => undefined}>
                      <ShieldAlert size={10} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                      PROTECT
                    </button>
                  )}
                  {/* Hack button — function for hackers */}
                  {role === 'hacker' && status === 'alive' && p.status === 'alive' && p.id !== myId && p.role === 'developer' && (
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
                {false && role === 'hacker' && !logsCorrupted && (
                  <button
                    onClick={() => undefined}
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
        </div> {/* end mapSection */}

        {/* RIGHT: Task / Code Editor */}
        <div className={styles.taskSection}>
          {canUseCodeEditor ? (
            <CodeEditor
              taskId={taskId}
              hackTaskId={hackTaskId}
              isHacker={role === 'hacker' && status === 'alive'}
              isFirewall={status === 'firewall'}
              canRequestHard={(role === 'hacker' && status === 'alive') || status === 'firewall'}
              selectedProtectTargetId={selectedProtectTarget?.id || null}
              selectedProtectTargetName={selectedProtectTarget?.name || null}
              onRequestTask={(diff) => {
                if (diff !== 'hard') {
                  setHackTaskId(null);
                }
                if (socket) {
                  socket.emit('request_task', { difficulty: diff, protectTargetId: selectedProtectTarget?.id || null });
                }
              }}
              onSubmit={handleTaskSubmit}
            />
          ) : isInLogRoom ? (
            <div className="terminal-box" style={{ margin: '16px', flex: 1 }}>
              <h3 style={{ fontSize: '14px', color: 'var(--text-info)', marginBottom: '8px' }}>
                Security &amp; Auth — The Log Room
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
                No coding tasks here. Players can still gather, move through, call a stand-up, and remain vulnerable to hacks.
              </p>
            </div>
          ) : (
            <div className="terminal-box" style={{ margin: '16px', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Loading room data...</p>
            </div>
          )}
        </div> {/* end taskSection */}
      </main>

      {/* ── FOOTER ────────────────────────────────── */}
      <footer className={styles.gameFooter}>
        <span style={{ color: 'var(--text-muted)' }}>
          {playerName} | {room}
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
          aliveDevelopers={aliveDevelopers}
          selectedProtectTargetId={protectTargetId}
          onSelectProtectTarget={setProtectTargetId}
          onNavigate={handleNavigate}
        />
      )}

      {/* ── STANDUP CONFIRMATION DIALOG ─────────── */}
      {showStandupConfirm && (
        <div className="overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9998 }}>
          <div className="terminal-box" style={{ padding: '24px', maxWidth: '360px', textAlign: 'center' }}>
            <Siren size={32} color="var(--text-danger)" style={{ marginBottom: '12px' }} />
            <h3 style={{ fontSize: '14px', marginBottom: '8px', textTransform: 'uppercase' }}>Call Emergency Stand-Up?</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '20px' }}>
              This will pause all tasks and teleport every alive player to the Breakroom for a vote.
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <button className="btn-danger" onClick={confirmStandup}>Confirm</button>
              <button onClick={() => setShowStandupConfirm(false)} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', color: 'var(--text-muted)', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── FAB (Floating Action Button) ────────── */}
      {phase === 'playing' && (
        <>
          <button
            ref={fabButtonRef}
            onClick={() => setFabOpen(!fabOpen)}
            style={{
              position: 'fixed', bottom: '20px', right: '20px', zIndex: 9990,
              width: '48px', height: '48px', borderRadius: '50%',
              background: 'var(--bg-elevated)', border: '1px solid var(--border-primary)',
              color: 'var(--text-accent)', cursor: 'pointer', fontSize: '18px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              transition: 'transform 0.2s',
              transform: fabOpen ? 'rotate(45deg)' : 'none',
            }}
          >
            <Settings size={20} />
          </button>

          {fabOpen && (
            <div ref={fabPanelRef} style={{
              position: 'fixed', bottom: '80px', right: '20px', zIndex: 9989,
              background: 'var(--bg-primary)', border: '1px solid var(--border-primary)',
              borderRadius: '8px', padding: '16px', width: '220px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}>
              {/* Role Pill */}
              <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{
                  fontSize: '11px', padding: '4px 10px', borderRadius: '12px',
                  background: role === 'hacker' ? 'rgba(255,50,50,0.15)' : 'rgba(0,255,136,0.15)',
                  color: role === 'hacker' ? 'var(--text-danger)' : 'var(--text-accent)',
                  textTransform: 'uppercase', letterSpacing: '1px',
                }}>
                  {role}
                </span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>#{myScore} pts</span>
              </div>

              {/* Hack cooldown (Hacker only) */}
              {role === 'hacker' && status === 'alive' && (
                <div style={{ marginBottom: '10px', fontSize: '11px', color: 'var(--text-muted)' }}>
                  <Skull size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                  {nowMs < hackCooldownUntil
                    ? `Hack CD: ${Math.ceil((hackCooldownUntil - nowMs) / 1000)}s`
                    : 'Hack Ready'}
                </div>
              )}

              <button
                onClick={handleLogout}
                style={{ width: '100%', padding: '8px', fontSize: '11px', marginBottom: '8px', background: 'transparent', border: '1px solid var(--border-primary)', color: 'var(--text-muted)', cursor: 'pointer', borderRadius: '4px' }}
              >
                Log Out
              </button>

              {/* Emergency Stand-Up (any alive player, any room) */}
              {status === 'alive' && phase === 'playing' && (
                <button
                  className="btn-danger"
                  onClick={() => { handleCallStandup(); setFabOpen(false); }}
                  style={{ width: '100%', padding: '8px', fontSize: '11px' }}
                >
                  <Siren size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Emergency Stand-Up
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
