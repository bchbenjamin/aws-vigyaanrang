'use client';

import React, { useState } from 'react';
import { Eye, Radio, ShieldOff } from 'lucide-react';

interface FirewallOverlayProps {
  rooms: string[];
  currentRoom: string;
  onAnomalyAlert: (room: string) => void;
  anomalyUsed: boolean;
  onNavigate: (room: string) => void;
}

export default function FirewallOverlay({ rooms, currentRoom, onAnomalyAlert, anomalyUsed, onNavigate }: FirewallOverlayProps) {
  const [selectedRoom, setSelectedRoom] = useState(currentRoom);

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: 'linear-gradient(0deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.8) 100%)',
      borderTop: '1px solid #332200',
      padding: '16px 24px',
      zIndex: 900,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: '1200px', margin: '0 auto' }}>
        {/* Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ShieldOff size={20} color="var(--text-warning)" />
          <div>
            <p style={{ color: 'var(--text-warning)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Firewall Mode
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
              Observer state — no tasks, no voting, instant movement
            </p>
          </div>
        </div>

        {/* Quick room nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Eye size={14} color="var(--text-muted)" style={{ marginRight: '8px' }} />
          {rooms.map(room => (
            <button
              key={room}
              onClick={() => onNavigate(room)}
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

        {/* Anomaly Alert button */}
        <button
          className="btn-warning"
          disabled={anomalyUsed}
          onClick={() => onAnomalyAlert(selectedRoom)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}
        >
          <Radio size={14} />
          {anomalyUsed ? 'ALERT USED' : 'ISSUE ANOMALY ALERT'}
        </button>
      </div>
    </div>
  );
}
