# AI Evaluation Scheduler -- Frontend

React (Vite + TanStack Start/Router) single-page workspace for the AI
Evaluation Scheduler (SPJIMR PGDM programme): upload timetable and course
outline PDFs, confirm ambiguous identity mappings, ask the assistant to
schedule an assessment, review ranked candidates with reasons, approve one,
and see it land on the timetable grid.

This is a pure client -- all scheduling logic, parsing, and chat live in a
separate backend ([ai-evaluation-scheduler-backend](https://github.com/)),
called cross-origin.

## Running locally

Needs Node.js and npm.

```bash
npm i
npm run dev
```

Opens on `http://localhost:8080` by default. With no `VITE_API_BASE_URL`
set, `vite.config.ts`'s dev proxy forwards `/api/*` calls to
`http://localhost:7860`, so run the backend locally on that port
alongside this for a fully local setup.

```bash
npm run build       # production build (vite build)
npx tsc --noEmit     # real type-check -- vite build alone does not type-check
npm run lint
```

## Configuration

Copy `.env.example` to `.env.local` and set `VITE_API_BASE_URL` to point at
a deployed backend instead of the local proxy, e.g.:

```
VITE_API_BASE_URL=https://your-backend.up.railway.app
```

## Deploying to Vercel

1. Push this repo to GitHub.
2. In the Vercel dashboard, Add New → Project, and import this repository.
   Vercel auto-detects the Vite/TanStack Start project; no framework
   settings need to change.
3. Set the `VITE_API_BASE_URL` environment variable to your deployed
   backend's URL (Railway).
4. Deploy. On the backend side, add this Vercel deployment's origin(s) to
   the backend's `CORS_ORIGINS` variable (Vercel gives you a production
   domain and a per-branch preview domain; include both if you need
   preview deployments to work).

If a build ever fails with an error inside TanStack Start's own
build-time prerender step, disable it explicitly in `vite.config.ts` under
`tanstackStart: { prerender: { enabled: false } }` -- this app has exactly
one client-rendered route and doesn't rely on prerendering, so disabling
it is always safe here.
