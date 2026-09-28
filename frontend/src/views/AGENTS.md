# Views — Page-Level React Components

Page-level views for the ListFM SPA. Each file maps to a route in `App.jsx`.

## FILE MAP

| File | Route | Lines | Role |
|------|-------|-------|------|
| `Landing.jsx` | `/` | 84 | Marketing splash with animated gradient hero, CTA to login/register |
| `Login.jsx` | `/login` | 218 | Email/password form + OAuth buttons (Google, Discord) |
| `Register.jsx` | `/register` | 367 | Registration form with password strength meter, OAuth options |
| `Dashboard.jsx` | `/dashboard` | 306 | Stats dashboard: recent tracks, top artists, automation list |
| `Playlists.jsx` | `/playlists` | 165 | Automation cards list via `TiltedCard` + `useAutomations` hook |
| `PlaylistNew.jsx` | `/playlists/new` | 155 | Multi-step automation creation wizard |
| `PlaylistDetail.jsx` | `/playlists/:id` | 863 | Automation editor — **#1 complexity hotspot** |
| `AuthCallback.jsx` | `/auth/callback` | 203 | OAuth callback handler (Google/Discord) |
| `LinkLastfm.jsx` | `/link-lastfm` | 162 | Last.fm username linking page |

## HOTSPOTS

- **PlaylistDetail.jsx (863 lines)**: The entire "edit automation" experience. Contains 2 inline components (`SectionCard`, `FieldRow`), ~20 `useState` hooks, 5 `useEffect`, 5 `useCallback`, inline confirmation modals, deeply nested JSX (6+ levels). Handles source type selection, period config, filter editing, cron scheduling, preview generation, save/delete, run history + manual re-run. The filter engine runs client-side via `applyFilters()` from `@/lib/filter-engine` (local `applyFilterGroups` wrapper). Touches `FilterBuilder`, `CronEditor`, and `BorderGlow` subcomponents.

- **Dashboard.jsx (306 lines)**: Stats dashboard. Fetches user info, recent tracks, top artists, and automations on mount. Renders `CountUp` stat cards, a recent tracks list, and automation cards via `TiltedCard`. Uses `useMemo` for derived stats.

- **Playlists.jsx (165 lines)**: Automation cards list. Uses the `useAutomations` hook (no raw `useEffect`), renders `TiltedCard` per automation plus `NewPlaylistCard` entry. Card copy built via `@/lib/playlist-cards`.

- **PlaylistNew.jsx (155 lines)**: Multi-step wizard for creating automations. Steps: source type, period, filters, schedule. Uses inline step state, delegates filter config to `FilterBuilder`.

- **Login.jsx (218 lines)**: Email/password form with show/hide toggle, OAuth redirect buttons (Google, Discord). Redirects to `/dashboard` on success. Uses `Grainient` background.

- **Register.jsx (367 lines)**: Registration form with password strength meter, confirm password, OAuth options. Animated step transitions via `AnimatePresence`.

- **AuthCallback.jsx (203 lines)**: OAuth callback. Reads `code` and `provider` from URL params, POSTs to backend, redirects to `/link-lastfm` or `/dashboard`. Shows error state on failure.

- **LinkLastfm.jsx (162 lines)**: Last.fm username form. Validates via backend API, shows error/success states. Redirects to `/dashboard` on completion.

- **Landing.jsx (84 lines)**: Marketing splash. Animated gradient hero, feature highlights, CTA buttons. Sets `document.title`.

## NOTES

- All views use `motion` for page entrance animations. `AnimatePresence` is configured in `App.jsx` for route transitions.
- Protected views are wrapped in `<AuthGuard>` which redirects unauthenticated users to `/login`.
- Views access auth state via `useAuth()` from `AuthContext`.
- `Login`/`Register` redirect authenticated users away. `AuthCallback` redirects to `/link-lastfm` (new OAuth users) or `/dashboard` (existing).
- `LinkLastfm` is the post-registration step for OAuth users who haven't linked a Last.fm account.
- `PlaylistNew` uses a multi-step wizard pattern (step state, no nested router). Delegates filter config to `FilterBuilder`.
- `Landing` is static (no data fetching). Sets `document.title` on mount.
