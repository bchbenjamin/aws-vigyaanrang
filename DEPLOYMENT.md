# Deployment Guide

## Supported deployment model

This project is built around a long-lived custom `server.js` process that owns both Next.js and Socket.io state. The supported target is a persistent Node.js host on a local network or LAN-accessible machine.

Unsupported assumption:
- Vercel-style serverless deployment for the live game loop

## Environment variables

Create a `.env` file in the project root:

```env
DATABASE_URL=postgresql://...your-neon-string...
ADMIN_USERNAME=your-admin-username
ADMIN_PASSWORD=your-admin-password
PORT=3000
```

## Local development

```bash
npm install
npm run dev
```

The development command runs the custom `server.js` entrypoint, not plain `next dev`.

## LAN production run

### 1. Install dependencies

```bash
npm install
```

### 2. Build the app

```bash
npm run build
```

### 3. Start the server

Windows PowerShell:

```powershell
$env:NODE_ENV="production"
node server.js
```

Windows Command Prompt:

```bat
set NODE_ENV=production
node server.js
```

Linux/macOS:

```bash
NODE_ENV=production node server.js
```

### 4. Open port `3000`

Example PowerShell command:

```powershell
New-NetFirewallRule -DisplayName "Breach and Defend" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

### 5. Find the LAN IP

```bash
ipconfig
```

Use the machine's IPv4 address, for example `192.168.1.50`.

### 6. Player and admin URLs

Players:

```text
http://192.168.1.50:3000
```

Admin:

```text
http://192.168.1.50:3000/admin
```

## Current operational behavior

- Player codes persist locally until the player logs out.
- Duplicate live joins for the same access code are blocked.
- Invalid access codes are rejected with immediate client feedback.
- The match timer is server-synchronized across tabs.
- Admins can extend stand-up time and kick players from the active round.
- End-of-round admin handling uses the three stop modes already exposed in the UI.

## Data and persistence

Database-backed tables/config:
- `registered_users`
- `admin_config`
- `cumulative_scores`

Puzzle source:
- `src/data/puzzles.json`

## Troubleshooting

### Hydration warning on the lobby page

The lobby now reads saved access codes after mount, so server and client markup stay aligned. If you still see a hydration mismatch, clear stale browser extensions or cached dev bundles and retry.

### Dev server does not stop on its own

`npm run dev` keeps the custom server running until you terminate it. Stop it manually with `Ctrl+C` or by ending the spawned `node` process.
