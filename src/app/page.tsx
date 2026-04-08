'use client';

import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Terminal, ShieldAlert } from 'lucide-react';

let socket: Socket;

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);
  const [room, setRoom] = useState('Breakroom');
  const [tasksCompleted, setTasksCompleted] = useState(0);

  useEffect(() => {
    // Only connect once
    if (!socket) {
      socket = io();
      
      socket.on('connect', () => {
        setIsConnected(true);
        socket.emit('join_game', { name: 'Player' + Math.floor(Math.random() * 1000) });
      });

      socket.on('disconnect', () => {
        setIsConnected(false);
      });

      socket.on('player_joined', (playerData) => {
        console.log('Player Joined:', playerData);
      });
    }

    return () => {
      if (socket) socket.disconnect();
    };
  }, []);

  const moveRoom = (newRoom: string) => {
    setRoom('Moving...');
    // Simulate the 3-second mandatory delay
    setTimeout(() => {
      socket.emit('move_room', newRoom);
      setRoom(newRoom);
    }, 3000);
  };

  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <ShieldAlert color="var(--text-danger)" size={32} />
          <h1>Breach & Defend</h1>
        </div>
        <div style={{ color: isConnected ? 'var(--text-accent)' : 'var(--text-danger)' }}>
          {isConnected ? 'SYSTEM ONLINE' : 'CONNECTION LOST'}
        </div>
      </header>

      <main style={{ display: 'grid', gridTemplateColumns: '1fr 3fr', gap: '2rem' }}>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h3>Navigation</h3>
          {['Frontend', 'Main Database', 'API Gateway', 'Server Room', 'QA Testing Lab', 'The Log Room', 'Breakroom'].map((r) => (
            <button key={r} onClick={() => moveRoom(r)} disabled={room === 'Moving...'} style={{ textAlign: 'left', opacity: room === r ? 1 : 0.6 }}>
              {r === room ? '> ' : ''}{r}
            </button>
          ))}
        </nav>

        <section className="terminal-box">
          <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Terminal size={20} />
            <h2>Current Location: {room}</h2>
          </div>
          
          <div style={{ minHeight: '300px' }}>
            {room === 'Moving...' ? (
              <p style={{ color: 'var(--text-secondary)' }}>Transiting network layers... (3s delay)</p>
            ) : room === 'Breakroom' ? (
              <p>Safe zone. No tasks here. Emergency Stand-Up can be called from here.</p>
            ) : (
              <div>
                <p>Accessing vulnerable node...</p>
                <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: 'var(--bg-tertiary)', border: '1px dashed var(--border-color)' }}>
                  <code>
                    // Task: Fix the connection string<br/>
                    const db = connect(___________);
                  </code>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
