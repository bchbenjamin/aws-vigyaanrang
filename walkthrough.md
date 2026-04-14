# Current Project Walkthrough

This file documents the current state of the application rather than the original scaffold.

## Architecture

- Next.js app-router frontend
- Custom `server.js` process hosting both HTTP and Socket.io
- In-memory live round state with database-backed persistence for config, registered users, and cumulative scores
- Puzzle content sourced from `src/data/puzzles.json`

## Player flow

### Lobby
- Players enter an admin-issued access code.
- The code is persisted locally until logout.
- Duplicate active joins for the same code are rejected.
- Invalid codes produce an immediate visible error.

### Match start
- Admin registers users, assigns roles, and starts the round.
- The server broadcasts a shared round end timestamp so every client renders the same remaining time.

### During play
- Developers solve global-difficulty tasks to advance progress.
- Hackers select a target in the same room to enter the hack flow.
- Hard tasks are gated behind an active selected target for hackers.
- Firewalls select a living developer to protect, then solve any difficulty task to apply one protection charge.
- The log room shows motion history and still allows active hack flow when a hacker and target are both there.

### Stand-up
- Any alive player can trigger an emergency stand-up.
- The admin can extend discussion time in `+30s` increments.
- Voting resolves to an ejection or no-ejection result.

### Round end
- Players see the end screen.
- Admin sees an automatic popup with the three stop/reset actions.

## Major recent changes

- Replaced server-side task loading from `src/lib/tasks` with direct JSON parsing from `src/data/puzzles.json`
- Removed Vercel-specific deployment assumptions from the runtime model
- Switched task assignment to global `easy` / `medium` / `hard` pools
- Added active firewall protection flow and removed firewall anomaly alerts
- Removed hacker log wiping
- Removed self-hack behavior
- Removed the large player disconnect popup
- Added logout while keeping access-code persistence until logout
- Added duplicate-session prevention
- Added admin kick control
- Added synchronized match timer across tabs
- Added shared completion visuals for tasks and hack resolution
- Fixed FAB behavior so it closes on outside click and no longer duplicates task difficulty controls
- Fixed the lobby hydration mismatch by loading saved code after mount instead of during SSR markup generation

## Files to know

- `server.js`: live game engine, sockets, round state, timers, admin actions
- `src/app/page.tsx`: lobby and code persistence entry point
- `src/app/game/page.tsx`: player runtime UI and socket event handling
- `src/app/admin/page.tsx`: admin control surface
- `src/components/CodeEditor.tsx`: task and difficulty interaction
- `src/components/FirewallOverlay.tsx`: firewall target selection and instant movement UI
- `src/data/puzzles.json`: canonical puzzle data source
