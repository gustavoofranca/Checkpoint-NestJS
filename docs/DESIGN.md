# Web UI design

The UI exists to show the API working. It should look like a current, well-made SaaS product:
calm, dense enough to be useful, and quiet. Small scope, high finish.

## Principles

- Content first. Game art is the only loud element on the screen.
- One accent colour, used for primary actions and focus only
- Borders and spacing create hierarchy. Shadows are rare and soft.
- Every state is designed: loading, empty, error, and success

## Avoid

These make a project look generated:

- Purple-to-blue gradient heroes, glowing blobs, glassmorphism everywhere
- Emoji as icons or in headings
- A marketing landing page with invented testimonials or statistics
- Centered everything, oversized rounded cards, heavy drop shadows
- Five font sizes on one screen, rainbow badges
- Spinners for whole pages

## Tokens

Define as CSS variables and expose through the Tailwind theme. Dark is the default; a light
theme is optional and only if it is finished.

| Token | Value |
|---|---|
| Background | `#0b0b0c` |
| Surface | `#141416` |
| Surface raised | `#1b1b1f` |
| Border | `#26262b` |
| Text | `#ededef` |
| Text muted | `#9a9aa3` |
| Accent | one colour chosen once, with a hover and a subtle tint variant |
| Danger | `#e5484d` |
| Radius | 6 px controls, 10 px cards |
| Spacing | 4 px grid: 4, 8, 12, 16, 24, 32, 48, 64 |
| Content width | 1200 px max, 24 px gutters |

Typography: Inter or Geist, self-hosted, with a system fallback stack. Sizes 13, 14, 16, 20,
28. Weights 400, 500, 600. Line height 1.5 for text, 1.2 for headings. Tabular numbers for
ratings and counts.

Icons: `lucide-react`, 16 or 20 px, stroke 1.5.

Motion: 120–180 ms ease-out on hover, focus and menu transitions. Nothing moves on page load.
Respect `prefers-reduced-motion`.

## Screens

**Catalog (`/`)**: top bar with wordmark, search field and account menu. Below it, a row of
genre chips and a sort select. A responsive grid of game cards (header image at its native
aspect ratio, title, genres, rating). Infinite scroll through the cursor, with a visible
"Load more" fallback. Search is debounced and reflected in the URL.

**Game (`/games/:slug`)**: header image, title, developers, release date, price, genres,
rating summary. A library status control and a review form for signed-in users. Reviews list
with cursor loading.

**Sign in and sign up**: one centered card, two fields or three, inline validation, a generic
error message for failed login.

**Profile (`/u/:username`)**: username, join date, review count, recent reviews. On your own
profile, library tabs by status.

Also: a 404 page and an error boundary with a retry action.

## Behaviour

- Skeletons shaped like the content while loading. No layout shift when data arrives.
- Empty states say what is empty and offer the next action
- Errors show a human message and the request id from the Problem Details response
- Optimistic update for the library status, rolled back on failure
- Fully usable by keyboard, visible focus ring, WCAG AA contrast, labelled inputs, `alt` text
- Works from 360 px wide. Grid goes 1, 2, 3, 4 columns.
- Images lazy-loaded with explicit dimensions

## Front-end security

- Access token lives in memory only. On load, the app calls the refresh endpoint to restore
  the session. Nothing sensitive in `localStorage` or `sessionStorage`.
- No `dangerouslySetInnerHTML`. All API text is rendered as text.
- The only environment variable is the API base URL
- A Content-Security-Policy that allows scripts from self only and images from self and the
  Steam CDN hosts

## Stack

Vite, React, TypeScript strict, Tailwind CSS, TanStack Query for server state, React Router.
Small headless primitives (Radix) only where accessibility is hard to get right: menu, select,
dialog. No component kit with its own visual identity. The API client is generated from or
typed against the OpenAPI document.
