# Render Deployment Guide

This project is ready for direct deployment on Render as a persistent Node web service.

## 1. Prerequisites

- A Render account
- This repository pushed to GitHub/GitLab
- A Postgres connection string (Neon is already supported)

## 2. Fastest Path (Blueprint)

The repo includes `render.yaml`, so Render can auto-create the service.

1. In Render, click **New +** -> **Blueprint**.
2. Select this repository.
3. Confirm service name `breach-defend`.
4. Add secret values when prompted:
   - `DATABASE_URL`
   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD`
5. Click **Apply**.

Render will use:
- Build command: `npm ci --include=dev && npm run build`
- Start command: `npm start`
- Health check: `/api/health`
- Node version: `22.11.0`

## 3. Manual Path (If You Prefer Web Service Setup)

Create a new **Web Service** with:

- Runtime: `Node`
- Build Command: `npm ci --include=dev && npm run build`
- Start Command: `npm start`
- Health Check Path: `/api/health`

Set the environment variables exactly as below:

- `NODE_ENV=production`
- `NPM_CONFIG_PRODUCTION=false`
- `HOST=0.0.0.0`
- `APP_BASE_URL=https://breach-defend.onrender.com`
- `ALLOWED_ORIGINS=https://breach-defend.onrender.com`
- `ALLOWED_DEV_ORIGINS=https://breach-defend.onrender.com`
- `DATABASE_URL=<your-neon-or-postgres-url>`
- `ADMIN_USERNAME=<admin-username>`
- `ADMIN_PASSWORD=<admin-password>`

Do not set `PORT` manually on Render. Render injects this automatically.

Do not hardcode secrets in source control.

## 4. URL Setup: breach-defend

Recommended Render URL:

- `https://breach-defend.onrender.com`

This repository is already configured to use that origin in environment templates and Render blueprint.

If `breach-defend` is unavailable in your Render account, pick another slug and update:

- `APP_BASE_URL`
- `ALLOWED_ORIGINS`
- `ALLOWED_DEV_ORIGINS`
- `render.yaml` values for those keys

## 5. Post-Deploy Validation

After deploy completes, verify:

1. Health endpoint returns OK:
   - `GET https://breach-defend.onrender.com/api/health`
2. Landing page loads.
3. Admin login works with your configured credentials.
4. Socket events work in game and admin pages.

## 6. Common Issues

- 503 from `/api/admin/state`
  - Make sure start command is `npm start` (custom `server.js` is required).
- WebSocket/connectivity issues
  - Ensure both `ALLOWED_ORIGINS` and `ALLOWED_DEV_ORIGINS` contain your exact `https://...onrender.com` origin.
- Database boot errors
  - Validate `DATABASE_URL` and SSL params.
- App fails to boot right after deploy
  - Confirm Node runtime is 20+ (blueprint sets 22.11.0). Older Node versions can fail Next 16 builds/startup.
- Build fails saying TypeScript packages are missing
  - Use `npm ci --include=dev` and set `NPM_CONFIG_PRODUCTION=false` so build-time devDependencies (like `typescript`) are installed.

## 7. Optional: Custom Domain

If you attach a custom domain, append it to `ALLOWED_DEV_ORIGINS` as a comma-separated URL.
