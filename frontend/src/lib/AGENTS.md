# lib/ — Frontend Utilities

## Overview

8 utility modules providing API client, constants, filter logic, animation, and styling helpers. The most cross-cutting code in the frontend.

## File Map

| File | Lines | Role | Imported By |
|------|-------|------|-------------|
| `automation-rules.js` | 184 | Constants (source types, periods, cron presets, filter fields), factory functions (`createGroup`, `createCondition`), validators (`isValidCron`), formatters (`describeCron`) | 9 modules |
| `api.js` | 166 | HTTP client with auto-refresh JWT, 13 typed endpoint functions, username cache | 6 modules |
| `filter-engine.js` | 96 | Client-side track filter evaluation: `applyFilters()`, `countActiveConditions()`, recursive AND/OR group logic | 3 modules |
| `utils.js` | 6 | `cn()` — clsx + tailwind-merge for conditional Tailwind classes | 2 modules |
| `animation.js` | 27 | Easing functions (`easeOutCubic`, `easeInCubic`), `animateValue()` RAF loop | 1 module (BorderGlow) |
| `boxShadow.js` | 35 | `buildBoxShadow()` — 13-layer HSL box-shadow generator | 1 module (BorderGlow) |
| `dashboard-helpers.js` | 42 | Greeting, relative time formatting, localStorage visit tracking | 1 module (Dashboard) |
| `color-extract.js` | 79 | Canvas-based palette extraction from images | 1 module (Dashboard) |

## Key Patterns

- **API client**: `request()` wraps `fetch` with `credentials: "include"`. On 401, deduplicates concurrent refresh via `isRefreshing` + `refreshPromise`. Retries original request once with `_retried` flag.
- **Filter engine**: Pure functions, no React dependency. Evaluates recursive filter trees (nested groups, AND/OR at each level). Supports 8 field types with 12 operators. **Known anti-pattern** — domain logic should be server-side.
- **Automation rules**: Single source of truth for all automation constants. `FILTER_FIELDS` defines 8 filterable fields with types and descriptions.
- **`cn()` utility**: Standard shadcn pattern — `clsx` for conditional classes + `tailwind-merge` for deduplication.

## Anti-Patterns

- **`animation.js` + `boxShadow.js`**: Single consumers only (BorderGlow) — over-engineered for a single-component use case.
- **`filter-engine.js` on frontend**: Scheduled automation runs cannot apply filters because the logic only exists in JS. Belongs in `backend/services/`.
- **Module-level mutable cache in `api.js`**: `_username` singleton is untestable and can stale.
