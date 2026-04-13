# Breach & Defend: Game Rules & Parameters

**Breach & Defend** is a real-time, local-LAN social deduction cybersecurity simulation designed for 30 concurrent players. 
This document serves as the strict, definitive rulebook detailing every mechanic, cooldown, timer, and configurable parameter in the server logic.

---

## 1. Roles & Objectives
Players spawn into the `Breakroom` as one of two roles assigned by the Admin. 

### Developers (The Core Team)
* **Objective:** Successfully complete tasks across multiple rooms until the Global Progress Bar reaches **100%**. If time runs out and the progress bar is >= 50%, the Developers win.
* **Secondary Objective:** Identify and eject all Hackers via Emergency Stand-Ups.

### Hackers (The Infiltrators)
* **Objective:** Prevent the Developers from completing the project. If time runs out and the progress bar is < 50%, the Hackers win.
* **Secondary Objective:** Hack Developers to eliminate them. If the number of alive Developers drops below or equals the number of alive Hackers, the Hackers achieve a majority and win instantly.

---

## 2. Core Mechanics

### Movement
* Players navigate between 6 rooms: `Frontend`, `Main Database`, `API Gateway`, `Server Room`, `QA Testing Lab`, and `The Log Room`.
* Moving rooms incurs a strict **3-second delay** (except for Firewalls, who instantly move).
* All movement emits a motion event to `The Log Room` in real-time.

### Task Completion
* Tasks are presented in C, Java, or Python and share a **global pool**.
* Players can switch languages mid-question — all three versions of every task are always available.
* Tasks must be requested via the ⚙ FAB (Floating Action Button) at the bottom-right.
* **Developers:** Completing an Easy or Medium task increments the Global Progress Bar.
* **Hackers:** Can perform "Cover Tasks" (fake tasks to look busy), or "Hard Tasks" (LeetCode algorithm problems). Solving a **Hard Task** instantly resets their hack cooldown.
* Progress is persisted in `sessionStorage` — so page reloads or tab switches won't lose code.

### Hacking Mechanics
* A Hacker can attempt to eliminate a Developer if they are in the same room by requesting a Hack Puzzle.
* **The Hack Puzzle:** The hacker must successfully solve a complex code puzzle.
* **Target Escaping:** If the target moves to another room before the Hacker solves the puzzle, the hack fails, but the Hacker still receives points for solving it.
* **Firewall Error:** If a Hacker attempts to hack another Hacker or a Developer protected by a Firewall Shield, the hack fails, and a global "FIREWALL ERROR" is logged to The Log Room.
* **Cooldown:** Hacking incurs a **3-minute cooldown**. (Unless bypassed by solving a Hard Task).

### The Firewall State (The Afterlife)
* Hacked Developers transition into a **Firewall**.
* Firewalls have instant movement speed and act primarily as Observers initially.
* **Firewall Shields:** Firewalls can target an unprotected alive Developer in their room and click the "PROTECT" button to request a task. Upon successfully solving it, the target receives a **Firewall Shield** which protects them from exactly one hack attempt.
* **Anomaly Alert:** A Firewall has a one-time-use `Radio Alert` (accessible via ⚙ FAB) that can broadcast a suspicious room warning to the entire team.

### The Log Room
* The Log Room tracks the last 15 room-entry events along with precise timestamps.
* **Live Feed:** The log is now updated in real-time regardless of which room the viewer is in — the data arrives via a global event.
* Hackers entering the Log Room can trigger a **Wipe Logs** command, replacing the history with `ERROR: LOGS CORRUPTED` for **60 seconds**.

### Emergency Stand-Up (Voting)
* Any alive player can call an Emergency Stand-Up from the ⚙ FAB (any room, any time during gameplay).
* A **confirmation dialog** appears before the stand-up is triggered.
* All alive players are instantly teleported to the `Breakroom`.
* A 90-second (default) discussion timer begins. The Admin can manually add **+30 seconds** incrementally.
* Players vote to eject a suspect or skip. Highest votes is ejected. Ties result in no ejection.

---

## 3. The ⚙ FAB (Floating Action Button)

During gameplay, a gear icon appears fixed at the bottom-right. It contains:

| Feature | Who Can See |
|:---|:---|
| Role pill (Developer/Hacker) | Everyone |
| Personal score | Everyone |
| Hack cooldown timer | Hackers only |
| Difficulty selector | Developers only |
| Hard task request button | Hackers only |
| Anomaly Alert button | Firewalls only (one-time use) |
| Emergency Stand-Up button | All alive players |

---

## 4. Admin Panel (`/admin`)

### Authenticaton
* Secured via `ADMIN_USERNAME` and `ADMIN_PASSWORD` environment variables.

### User Registration
* Access codes are generated universally in **UPPERCASE**.
* Admins register players before the game starts — no self-registration.
* Codes are synced with the Neon PostgreSQL DB to persist through server restarts!

### Game Controls — Three Stop Modes

| Button | Behaviour |
|:---|:---|
| **🏆 Retain Points & Restart** | Saves this round's scores to the database (cumulative). Keeps registered users. |
| **🗑️ Discard Round & Restart** | Throws away this round's scores. Keeps registered users. |
| **💀 Full Reset (Nuke)** | Wipes everything — scores, DB history, registered users. All players disconnected. |

### Game Rules & Constraints Panel
* Dynamically modify all point values, timers, and cooldowns.
* Changes are **persisted to Neon PostgreSQL** so they survive server restarts.

---

## 5. Configurable Parameters & Timing

### Timing & Penalties
| Variable | Default | Description |
|:---|:---|:---|
| `gameDurationMs` | 30 min | Hard-coded maximum duration of a single match. |
| `moveDelayMs` | 3 sec | Delay time for walking from one room to another. |
| `hackCooldownMs` | 3 min | Hacker's global cooldown after eliminating a Developer. |
| `standupDurationMs` | 90 sec | Base discussion time. |
| `firewallBufferMs` | 5 min | Lockout penalty between a Firewall's task submissions. |
| `easySpeedLimitMs` | 2 min | Timeframe for 10-easy-task speed detection. |
| `easyCooldownMs` | 1 min | Penalty applied if speed threshold is violated. |

### Sabotage Limits
| Variable | Default | Description |
|:---|:---|:---|
| `TASKS_FOR_WIN` | 50 tasks | Tasks Developers must solve to reach 100%. |

### Game Point Rewards
| Act | Default Pts | Description |
|:---|:---|:---|
| Solve Easy Task | 1 | Basic trivia/fill-blank. |
| Solve Medium Task | 2 | Mid-tier logic questions. |
| Solve Hard Task | 3 | LeetCode algorithms (Hackers only). |
| Solve Hack Puzzle | 2 | Completing a hack attempt. |
| Eject Hacker | 2 | Awarded to every player who voted correctly. |
| Survive | 3 | Sole-surviving Developer clutch bonus. |
| Win | 3 | Flat bonus for every player on the winning faction. |

---

## 6. Database (Neon PostgreSQL)

Two base tables and a config mapping exist:
* `admin_config`: Persists all point/timer values.
* `cumulative_scores`: Tracks player scores across rounds.
* `registered_users`: Stores access codes.

---

## 7. Deployment

> **⚠️ CRITICAL ARCHITECTURE REQUIREMENT**: 
> This application uses a custom in-memory game state layer built directly around a long-living `Socket.io` server. 
> Because of this, it **cannot** be deployed to Serverless platforms like Vercel or Netlify. 
> Serverless functions spin up and rapidly spin down after finishing an HTTP response, which severs WebSockets and wipes the `gameState` object in RAM instantly.
> 
> You **MUST** run this project on an environment capable of persistent, long-running Node.js processes, such as:
> - **AWS EC2**
> - **Render Web Services**
> - **Railway**
> - **DigitalOcean App Platform**

### Running on persistent infrastructure (like AWS EC2)
```bash
npm install
npm run build
npm start
```
