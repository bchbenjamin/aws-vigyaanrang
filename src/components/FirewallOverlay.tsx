'use client';

import React from 'react';
import { Eye, ShieldOff } from 'lucide-react';

interface FirewallOverlayProps {
  rooms: string[];
  currentRoom: string;
  protectablePlayers: { id: string; name: string }[];
  selectedProtectTargetId: string | null;
  cooldownSeconds: number;
  onSelectProtectTarget: (targetId: string) => void;
  onNavigate: (room: string) => void;
}

export default function FirewallOverlay({
  rooms,
  currentRoom,
  protectablePlayers,
  selectedProtectTargetId,
  cooldownSeconds,
  onSelectProtectTarget,
  onNavigate,
}: FirewallOverlayProps) {
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: 'linear-gradient(0deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.8) 100%)',
      borderTop: '1px solid #332200',
      padding: '16px 24px',
      zIndex: 900,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ShieldOff size={20} color="var(--text-warning)" />
          <div>
            <p style={{ color: 'var(--text-warning)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Firewall Mode
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
              Select a live player, solve tasks, apply protection, no voting, instant movement
            </p>
          </div>
        </div>

        <div style={{ minWidth: '120px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
            Cooldown
          </p>
          <p style={{ color: cooldownSeconds > 0 ? 'var(--text-warning)' : 'var(--text-accent)', fontSize: '14px', fontWeight: 700 }}>
            {cooldownSeconds > 0 ? `${cooldownSeconds}s` : 'Ready'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Eye size={14} color="var(--text-muted)" style={{ marginRight: '8px' }} />
          {rooms.map(room => (
            <button
              key={room}
              onClick={() => {
                onNavigate(room);
              }}
              style={{
                fontSize: '9px', padding: '4px 8px',
                background: currentRoom === room ? '#1a1100' : 'var(--bg-elevated)',
                borderColor: currentRoom === room ? 'var(--text-warning)' : 'var(--border-primary)',
                color: currentRoom === room ? 'var(--text-warning)' : 'var(--text-muted)',
              }}
            >
              {room.substring(0, 8)}
            </button>
          ))}
        </div>

        <select
          value={selectedProtectTargetId || ''}
          onChange={(event) => onSelectProtectTarget(event.target.value)}
          style={{
            minWidth: '190px',
            padding: '6px 8px',
            fontSize: '11px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-primary)',
            color: 'var(--text-primary)',
          }}
        >
          <option value="">Select Player</option>
          {protectablePlayers.map(player => (
            <option key={player.id} value={player.id}>
              {player.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
