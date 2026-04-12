# Breach & Defend: Game Rules & Parameters

**Breach & Defend** is a real-time, local-LAN social deduction cybersecurity simulation designed for 30 concurrent players. 
This document serves as the strict, definitive rulebook detailing every mechanic, cooldown, timer, and configurable parameter in the server logic.

---

## 1. Roles & Objectives
Players spawn into the `Breakroom` as one of two roles assigned by the Admin. 

### Developers (The Core Team)
* **Objective:** Successfully complete tasks across multiple rooms until the Global Progress Bar reaches **100%**. If time runs out and the progress bar is $\ge$ 50%, the Developers win.
* **Secondary Objective:** Identify and eject all Hackers via Emergency Stand-Ups.

### Hackers (The Infiltrators)
* **Objective:** Prevent the Developers from completing the project. If time runs out and the progress bar is < 50%, the Hackers win.
* **Secondary Objective:** Hack Developers to eliminate them. If the number of alive Developers drops below or equals the number of alive Hackers, the Hackers achieve a majority and win instantly.
* **Tertiary Objective:** Successfully plant corrupted code (Sabotage Tasks). Reaching the *Sabotage Threshold* instantly wins the game for Hackers.

---

## 2. Core Mechanics

### Movement
* Players navigate between 6 rooms: `Frontend`, `Main Database`, `API Gateway`, `Server Room`, `QA Testing Lab`, and `The Log Room`.
* Moving rooms incurs a strict **3-second delay** (except for Firewalls, who instantly move).
* All movement emits a motion event to `The Log Room`.

### Task Completion
* Tasks are presented in C, Java, or Python and share a global pool (they are no longer room-specific).
* **Developers:** Completing an Easy or Medium task increments the Global Progress Bar.
* **Hackers:** Can perform "Cover Tasks" (fake tasks to look busy), "Sabotage Tasks" (corruption), or "Hard Tasks" (LeetCode algorithm problems). Solving a **Hard Task** instantly resets their hack cooldown.

### Hacking
* A Hacker can eliminate a Developer if they are in the same room.
* **Cooldown:** Hacking incurs a **3-minute cooldown**. (Unless bypassed by solving a Hard Task).
* Hacked Developers transition into a **Firewall**.

### The Firewall State (The Afterlife)
* Firewalls have instant movement speed and act primarily as Observers.
* **Firewall Tasks:** Firewalls can still contribute to the Global Progress Bar by solving tasks, but they suffer a strict **5-minute cooldown** between assignments.
* **Anomaly Alert:** A Firewall has a one-time-use `Radio Alert` that can broadcast a suspicious room warning to the entire team.

### The Log Room
* The Log Room tracks the last 15 room entering events along with precise timestamps.
* Hackers entering the Log Room can trigger a **Wipe Logs** command, replacing the history with `ERROR: LOGS CORRUPTED` for **60 seconds**.

### Emergency Stand-Up (Voting)
* Any alive player can call an Emergency Stand-Up from their UI.
* All alive players are instantly teleported to the `Breakroom`.
* A 90-second (default) discussion timer begins. The Admin can manually add **+30 seconds** incrementally from the Admin Panel.
* Players vote to eject a suspect or skip. The player with the highest votes is ejected (eliminated). Ties result in no ejection.

---

## 3. Configurable Parameters & Timing

All of the following constraints are dynamic and can be tweaked by the Admin via the `/admin` Panel prior to clicking "Start Game". 
Modifying these values while the game is running is unsafe and therefore restricted.

### Timing & Penalties
| Variable | Default Runtime | Description |
| :--- | :--- | :--- |
| `gameDurationMs` | 30 minutes | The hard-coded maximum duration of a single match. |
| `moveDelayMs` | 3 seconds | The strict delay time for walking from one room to another. |
| `hackCooldownMs` | 3 minutes | Hacker's global cooldown after successfully eliminating a Developer. |
| `standupDurationMs` | 90 seconds | Base discussion time. Can be extended mid-vote by Admin. |
| `firewallBufferMs` | 5 minutes | The lockout penalty duration between a Firewall's ability to submit tasks. |
| `easySpeedLimitMs` | 2 minutes | The timeframe in which solving 10 easy questions flags a user for spamming. |
| `easyCooldownMs` | 1 minute | The global penalty applied if the `easySpeedLimitMs` threshold is violated. |

### Sabotage Limits
| Variable | Default Threshold | Description |
| :--- | :--- | :--- |
| `TASKS_FOR_WIN` | 50 tasks | The exact amount of tasks the Developers must solve to reach 100%. |
| `SABOTAGE_WIN_THRESHOLD`| 20 tasks | The exact amount of Sabotage tasks Hackers must plant to win instantly. |

### Game Point Rewards
The system rewards players with points to crown the top 3 MVPs at the end of the round. 

| Act | Default Points | Description |
| :--- | :--- | :--- |
| **Solve Easy Task** | 1 pt | Points awarded to user for completing a basic trivia/fill-blank. |
| **Solve Medium Task**| 2 pts | Points awarded to user for mid-tier logic questions. |
| **Solve Hard Task** | 3 pts | Points awarded to Hackers for solving Leetcode algorithms. |
| **Sabotage** | 2 pts | Points awarded to Hackers for planting corrupted code. |
| **Eject Hacker** | 2 pts | Points awarded to *every player* who voted correctly to eject a Hacker. |
| **Survive** | 3 pts | Points awarded to the sole-surviving Developer if they clutch the game. |
| **Win** | 3 pts | Flat bonus awarded to every player on the winning faction. |

> **Note on Deployment**: Due to Vercel's use of ephemeral Serverless Functions, standard deployments using `socket.io` will instantly crash with `503 Service Unavailable` errors. This application must be hosted on persistent Node.js environments (AWS EC2, Render Web Services, Railway, DigitalOcean). To start the game manually, use `npm run dev` or `node server.js`.
