# Breach & Defend - Deployment Guide

This guide covers two distinct deployment structures:
1. **Local LAN Network** (Primary target for 30 concurrent players on low bandwidth)
2. **Vercel** (Secondary target for external testing)

---

## 1. Local LAN Deployment (CSE Lab)

Because this game relies heavily on WebSockets (`socket.io`), the recommended production strategy is to run the custom Next.js Socket.io server locally on a single machine.

### Prerequisites (Central Server PC)
- **Node.js** (v18.17 or newer)
- Ensure the Windows Firewall allows incoming connections on port `3000`.

### Step-by-Step Execution

1. **Install Dependencies**
   Navigate to the project root and run:
   ```bash
   npm install
   ```

2. **Build the Production Application**
   Create an optimized production build of the Next.js React frontend:
   ```bash
   npm run build
   ```

3. **Start the Game Server**
   Start the custom backend, which hosts both the API and the WebSockets on port 3000:
   ```bash
   NODE_ENV=production node server.js
   ```

4. **Connect the 30 Players**
   - Open Command Prompt on the central PC and type `ipconfig`. 
   - Note the `IPv4 Address` (e.g., `192.168.1.50`).
   - On the remaining 30 lab computers, open the browser and navigate to `http://192.168.1.50:3000`.

---

## 2. Vercel Deployment (External Testing)

> [!WARNING]
> Vercel Serverless Functions will fall back from pure WebSockets to HTTP Long-Polling since they do not maintain persistent connections. The app will work, but latency will be slightly higher than the LAN deployment.

### Step-by-Step Execution

1. **Change the Build Command**
   When importing the Github repository to Vercel, ensure the build command is:
   ```bash
   npm run build
   ```

2. **Assets Initialization**
   The Java compilation framework (**CheerpJ 3**), **JSCPP**, and **Pyodide** are structurally placed inside the `/public` folder. Vercel's Edge Network will automatically compress and aggressively cache these assets globally upon deployment.

3. **Deploy**
   Click **Deploy**.

> [!TIP]
> If you require pure WebSocket performance over Vercel, consider transitioning the `socket.io` integration to **PartyKit** (a Cloudflare worker-based WebSocket platform) or **Pusher**.
