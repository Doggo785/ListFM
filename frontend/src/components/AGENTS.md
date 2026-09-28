# components/ — Reusable UI Components

## Overview

19 components across 4 subdirectories: design system primitives (`ui/`), decorative/utility elements (`elements/`), complex form builders (`builder/`), and the wizard step components.

## Directory Map

| Directory | Files | Role |
|-----------|-------|------|
| `ui/` | 8 | Design system: Button, Sidebar system, TiltedCard, BorderGlow, Grainient (WebGL), CustomSelect, PlaylistLogo (SVG generator) |
| `elements/` | 3 | ScrollToTop, Loader (styled-components radar spinner), CountUp (spring-animated counter) |
| `builder/` | 2 + 5 (steps) | FilterBuilder (580 lines), CronEditor + 5 wizard step components |
| root | 1 | AuthGuard — route protection wrapper |

## Key Patterns

- **Style composition**: `cn()` utility from `lib/utils.js` (clsx + tailwind-merge). Used by Button and Sidebar.
- **CVA**: Only in `button.jsx` — 6 variants × 8 sizes via `class-variance-authority`. Supports Radix `Slot.Root` for `asChild` polymorphic composition.
- **Animation**: `motion` (v12) in 11+ files. Key usages: Sidebar (hover-expand width, mobile slide-in), TiltedCard (3D parallax via `useSpring` + `useMotionValue`), CountUp (`useInView`-triggered spring counter), BorderGlow (custom RAF animation).
- **WebGL**: `Grainient.jsx` uses `ogl` library with inline GLSL fragment shader (noise, warp, grain, 25+ uniforms). Pauses via `IntersectionObserver` + `visibilitychange`.
- **Design tokens**: Brand `#ff530b` (orange), accent `#a855f7` (purple), backgrounds `#1c1c1c`/`#1a1a1a`/`#141414`, radius `rounded-lg`/`xl`/`2xl`. Hardcoded everywhere — not extracted to CSS variables.
- **Wizard steps** (`playlist-steps/`): Uniform named exports, `{ data, onChange }` interface, pure presentational (no `useState`/`useEffect`). Uses `@/` path alias exclusively.

## Hotspots

- **FilterBuilder.jsx (580 lines)**: `renderValueInput()` is a 209-line inner function with 5 branches. The tag search branch (106 lines) has its own state and should be `TagFilterInput.jsx`.
- **FilterRow (302 lines)**: Contains `renderValueInput()`, `fieldOptions`/`operatorOptions` recomputed every render, and a click-outside listener.
- **Grainient.jsx (281 lines)**: 18 uniform props, inline GLSL shaders, `WeakMap`-based instance tracking.
- **BorderGlow.jsx (245 lines)**: 4 animation states, 13-layer box-shadow, cursor proximity math, conic gradient masks.

## Anti-Patterns

- **`styled-components` in Loader.jsx** — only `styled-components` usage in the project; inconsistent with Tailwind everywhere else.
- **`"use client"` directive** in Sidebar.jsx — RSC marker has no effect in a Vite SPA (copy-paste artifact).
- **No re-export barrel files** — components imported by deep path (`@/components/ui/CustomSelect`) instead of `@/components`.
- **No shared form field component** — 4 identical input wrappers in Register.jsx, duplicated in Login.jsx.
- **Brand color `#ff530b` as magic string** — ~50+ occurrences across components. Not extracted to a CSS custom property.
