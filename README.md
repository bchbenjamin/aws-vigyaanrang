# Breach & Defend

`Breach & Defend` is a LAN-hosted, real-time social deduction coding game built on a custom Next.js + Socket.io server. The game is designed for a persistent Node runtime and should be treated as a local/LAN deployment project, not a serverless app.

## Documentation

- Agent notes: `docs/AGENTS.md`
- Puzzle authoring and schema: `docs/PUZZLE.md`

## Current gameplay model

### Roles
- `Developer`: advances the shared progress bar by solving coding puzzles.
- `Hacker`: hacks developers in the same room and tries to force a hacker win.
- `Firewall`: a hacked developer who still moves and now actively protects living developers.

### Rooms
- Task rooms: `Frontend`, `Main Database`, `API Gateway`, `Server Room`, `QA Testing Lab`
- Non-task rooms: `The Log Room`, `Breakroom`
- Normal movement has a `3s` delay.
- Firewalls move instantly.
- Every move writes to the live log feed.

### Win conditions
- Developers win at `100%` progress.
- Developers also win if all hackers are gone.
- Hackers win if alive hackers are greater than or equal to alive developers.
- On timeout, developers win only if progress is at least `50%`; otherwise hackers win.
- The winner announcement includes an explicit victory reason.
- Hacker identities are exposed at the end of every round, regardless of winner.

## Tasks and difficulty

- Tasks are loaded from server-only `data/puzzles.json`.
- Tasks are no longer tied to individual rooms. They come from a global difficulty pool: `easy`, `medium`, `hard`.
- The in-editor difficulty selector is the source of truth for requesting new tasks.
- Task answers and in-progress work are cached in browser storage so a refresh does not wipe a player's current task state.

### Parser and grading resilience
- The server normalizes and sanitizes puzzle payloads at assignment time before sending over WebSocket, so evaluation blocks never reach the client.
- The active puzzle bank is restricted to canonical `output_prediction` and `multiple_choice` formats.
- Difficulty aliases are normalized (`leetcode_easy` and similar labels map into `hard`).
- If a task shape cannot be parsed or graded safely, the task is skipped/replaced without penalizing the player.
- Multiple-choice prompt text, options, and answer keys support multiline content.
- Output/fill answers support both real multiline input and escaped `\\n` forms during grading.

### Difficulty rules
- Developers can request `easy` and `medium`.
- Hackers can request `easy` and `medium` as normal coding tasks.
- Hackers can request `hard` only after selecting a live target to hack.
- Solving a `hard` task clears hack cooldown only when the hard task is tied to an active selected hack target.
- Firewalls can solve any difficulty, but only after selecting a live developer to protect.

## Hacking and firewall protection

- A hacker can hack only a living developer in the same room.
- Self-hacking is blocked on both client and server.
- Hack attempts work in every room, including `Breakroom`.
- If the target escapes before submission resolves, the hacker still keeps puzzle points but the target is not converted.
- If the target is protected, the hack bounces, the target loses the protection flag, and the hacker receives cooldown without a conversion.
- Hack reveal notifications are delayed by `Hack Reveal Delay`; when the delay expires, all players are notified with the hacked player's identity.
- Hackers begin each round with active cooldown, so immediate opening hacks are blocked.

### Firewall behavior
- Firewalls do not self-protect and cannot protect each other.
- Firewalls no longer have an anomaly alert action.
- A firewall must select a living developer from the firewall overlay before solving a task.
- Completing any firewall task grants the same one-time protection effect. Harder tasks only affect scoring.

## UI and session behavior

- Player codes persist in `localStorage`, so refreshes do not require re-entering the code.
- Players also have an explicit logout action that clears the stored code.
- Invalid access codes show an immediate visible error.
- The same access code cannot be active in multiple live tabs or devices at once.
- The large player-facing disconnect popup has been removed.
- The FAB contains role, score, cooldown state, logout, and stand-up controls. The old FAB task selector has been removed.
- The FAB closes when the user clicks outside it.
- Successful task completion and successful hack resolution use the same completion-effect pattern.
- Match time is synchronized from the server, so all player tabs render the same remaining time.

## Admin features

- Register and remove users from the admin panel.
- Start a round with assigned roles.
- Extend stand-up discussion time in `+30s` increments.
- Kick a player out of the active round.
- Live game timer is visible in the admin stats grid.
- When a round ends, the admin gets a popup with the three stop/reset modes:
  - `Retain Points & Restart`
  - `Discard Round & Restart`
  - `Full Reset`
- End-of-round admin view includes both victory reason and revealed hacker identities.

## Configuration and persistence

Runtime configuration is stored through `admin_config`.

Important defaults:
- Match duration: `30 minutes`
- Move delay: `3 seconds`
- Hack cooldown: `3 minutes`
- Stand-up duration: `90 seconds`
- Firewall task buffer: `5 minutes`
- Easy-task anti-speedrun window: `10 easy solves inside 2 minutes`
- Easy-task penalty cooldown: `1 minute`

Database-backed data:
- `registered_users`
- `admin_config`
- `cumulative_scores`

## Runtime notes

- Local and LAN execution use the custom `server.js` entrypoint.
- The runtime reads puzzle data from JSON directly. It no longer relies on Node loading `src/lib/tasks` for server-side task assignment.
- The app is intended for persistent Node hosting and LAN play. Serverless hosting assumptions should be treated as unsupported.

## Security hygiene

- Never commit real credentials. Keep only placeholder values in `.env.example`.
- Use a local untracked `.env` for secrets.
- Before release, run a repository-wide secret scan and rotate any credential that was ever committed.

## Development

```bash
npm install
npm run dev
```

Puzzle dataset workflow:

```bash
npm run generate:puzzles
npm run validate:puzzles
# optional strict parseability/playability checks across task variants
npm run validate:puzzles:runtime
```

Production-style run:

```bash
npm install
npm run build
npm start
```
