# Breach & Defend — Deployment Guide

## Prerequisites
- **Node.js** v18.17+ installed
- A running **Neon PostgreSQL** database (free tier at [neon.tech](https://neon.tech))

## Environment Variables

Create a `.env` file in the project root:
```env
DATABASE_URL=postgresql://...your-neon-string...
ADMIN_USERNAME=your-admin-username
ADMIN_PASSWORD=your-admin-password
```

---

## Option A: Local LAN Deployment (CSE Lab — Production)

This is the primary deployment target. The custom `server.js` hosts both the Next.js frontend and the Socket.io WebSocket game engine on the same port.

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Build the Production Application
```bash
npm run build
```

### Step 3: Start the Game Server
```bash
# On Windows (Command Prompt):
set NODE_ENV=production && node server.js

# On Windows (PowerShell):
$env:NODE_ENV="production"; node server.js

# On Linux/Mac:
NODE_ENV=production node server.js
```
The server starts on **port 3000**.

### Step 4: Open the Firewall
Ensure Windows Firewall allows incoming connections on port 3000:
```powershell
New-NetFirewallRule -DisplayName "Breach and Defend" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

### Step 5: Find the Server IP
```bash
ipconfig
```
Look for `IPv4 Address` (e.g., `192.168.1.50`).

### Step 6: Connect 30 Players
On each lab PC, open a browser and navigate to:
```
http://192.168.1.50:3000
```

### Step 7: Admin Panel
The game admin navigates to:
```
http://192.168.1.50:3000/admin
```
- Log in with the credentials from `.env`.
- Click **Start Game** once all players have joined.

---

## Option B: Vercel Deployment (External Testing)

> **Warning:** Vercel does not support persistent WebSockets. Socket.io will fall back to HTTP long-polling. Performance will be lower than the LAN deployment.

### Step 1: Push to GitHub
Ensure your repository is pushed to GitHub with all source code.

### Step 2: Import to Vercel
1. Log into [vercel.com](https://vercel.com).
2. Click **Add New... > Project** and import the repository.
3. Add environment variables: `DATABASE_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`.
4. Set build command: `npm run build`.
5. Click **Deploy**.

> **Note:** On Vercel, the custom `server.js` does not run. The Socket.io integration must be replaced with a serverless-compatible provider (Pusher, Ably, or PartyKit) for production-quality WebSocket performance. The LAN deployment is highly recommended for the actual event.

---

## Development Mode

```bash
npm run dev
```
This runs the custom `server.js` in development mode with Next.js hot-reloading.

---

## Scoring Reference

| Action                          | Points |
|---------------------------------|--------|
| Your side wins the round        | +3     |
| Completing a task               | +1     |
| Successfully hacking a player   | +2     |
| Last surviving Developer        | +2     |
| Correctly voting out a Hacker   | +1     |
