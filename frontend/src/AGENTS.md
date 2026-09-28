# frontend/src/ — App Entry & Routing

## Overview

React 19 SPA entry point: `main.jsx` mounts with `BrowserRouter` + `AuthProvider`, `App.jsx` defines all routes with page transitions.

## Where to Look

| Concern | File | Lines |
|---------|------|-------|
| Entry point | `main.jsx` | 16 |
| Route definitions + page transitions | `App.jsx` | 96 |
| Data hooks (`useAutomations`, `useAutomation`) | `hooks/` | 68 + 42 |
| Tailwind 4 theme tokens + Geist font | `index.css` | — |
| Legacy layout CSS | `App.css` | — |

## Key Patterns

- **Routing**: 9 routes — landing, login, register, dashboard, playlist CRUD, OAuth callback, lastfm linking. Single-level, no nested routes. `<AuthGuard>` wrapper on protected views.
- **Page transitions**: `<AnimatePresence mode="wait">` with `motion.div` fade+slide (opacity 0→1, y: 8→0, 250ms easeInOut).
- **No code splitting**: All views eagerly imported — no `React.lazy()`, no `Suspense`.
- **State**: Single `AuthContext` provider. All other state is local `useState` in views. No Redux/Zustand/Jotai.
- **Sidebar**: Conditional rendering — hidden on public routes (`/`, `/login`, `/register`, `/auth/callback`, `/link-lastfm`).

## Anti-Patterns

- **No code splitting** — all 9 views in initial bundle.
- **No error boundaries** — any render crash takes down the entire app.
- **No custom data-fetching hooks outside automations** — only `hooks/useAutomations.js` + `hooks/useAutomation.js` exist (used by Playlists/PlaylistDetail). Every other view does raw `useEffect` + async. `api.js` has module-level `_username` singleton cache (untestable, stale data risk).
- **Module-level mutable state** in `api.js` — `_username` variable is a singleton.
