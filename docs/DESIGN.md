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

## Identity

Concept: **progress, saved**. A checkpoint is where a game records your progress, which is
what the product does: you log what you played, where you stopped and what you thought. Rings,
segmented bars and a diamond marker come from that idea. Personality: precise, calm, a touch of
arcade. Copy may borrow game vocabulary sparingly ("Progress saved", "No save data here yet").

**Mark** (provisional): a progress ring shaped like a C, with a diamond, the checkpoint, in its
gap. 32 × 32 grid, ring radius 10, stroke 4, from 40° to 320°; diamond 7.6 across, centred on
x = 27. Volt on the background; the inverse (background colour on a volt square) for app icons.
Wordmark: "checkpoint" in lowercase, Archivo expanded, weight 800. Below 640 px the header
shows the mark alone. Source: `web/src/components/LogoMark.tsx`, `web/public/favicon.svg`.

## Tokens

Define as CSS variables and expose through the Tailwind theme (`web/src/styles.css`). Dark is
the only theme. Grey is the rule and colour the exception.

| Token | Value | Use |
|---|---|---|
| Background | `#0b0b0f` | Slightly blue-tinted near-black |
| Surface | `#131318` | Cards, panels |
| Surface raised | `#1b1b22` | Hover, menus, inputs |
| Border | `#26262f` | 1 px borders |
| Text | `#ededf2` | 16.8:1 on the background |
| Text muted | `#9a9aab` | 7.1:1 on the background, 6.2:1 on raised |
| Accent ("volt") | `#c8f031`, hover `#d6f75e`, tint at 12% | Primary actions, focus, ratings, the mark. Text on it is the background colour (14.9:1); white would be 1.3:1 |
| Danger | `#f2555a` | Errors, destructive actions |
| Status: Playing | `#4cc9f0` | With the `gamepad-2` icon |
| Status: Backlog | `#ffb547` | With the `layers` icon |
| Status: Completed | `#c8f031` | With the `flag` icon: the final checkpoint |
| Status: Dropped | `#f2667a` | With the `circle-slash` icon |
| Radius | 6 px controls, 10 px cards | |
| Spacing | 4 px grid: 4, 8, 12, 16, 24, 32, 48, 64 | |
| Content width | 1200 px max, 24 px gutters | |

Volt appears in at most one area per screen besides buttons. Status colours appear only next to
their status, never as decoration.

Typography: Inter for text and interface; **Archivo**, widened (`font-stretch` 118%), for
headings, the wordmark and large numbers. Both self-hosted, with a system fallback stack. Sizes
13, 14, 16, 20, 28, and 40 for the game title and the profile name only. Weights 400, 500, 600
for text, 700 and 800 for display. Line height 1.5 for text, 1.2 for headings. Tabular numbers
for ratings and counts.

Icons: `lucide-react`, 16 or 20 px, stroke 1.5.

Motion answers the user; nothing moves on its own. 100–250 ms, `transform` and `opacity` only:

| Where | Trigger | Motion |
|---|---|---|
| Game card | Hover, focus | Art scales to 1.04 inside its frame, border lightens (200 ms) |
| Buttons | Press | Scale 0.98 |
| Rating input | Hover, select | Segments light up in sequence, 20 ms apart |
| Library status | Select | Icon pops (0.9 → 1.08 → 1, 220 ms) |
| Profile tabs | Select | The underline grows from the centre (200 ms) |
| Any save | Completion | Autosave toast: a turning diamond, then "Progress saved" with the mark's diamond travelling once round the ring (600 ms) |
| Opening a game | Navigation | The card art morphs into the page header (View Transitions, 250 ms) |
| Skeletons | Loading past 150 ms | Low-contrast sheen |

`prefers-reduced-motion` turns all of it off, view transitions included.

Signature elements: the five-segment rating bar (display fills to the fraction of the average;
input is a radio group drawn as segments), the autosave toast, the game page header lit by the
game's own art (blurred and faded into the background), and a faint dot grid ("level map") behind
the sign-in card, empty states and the profile header.

## Screens

**Catalog (`/`)**: top bar with the mark and wordmark, search field (`/` focuses it) and account
menu. With no search or genre filter, a horizontally scrolling "Top rated" row of the eight
best-rated games. Below it, a row of genre chips and a sort select. A responsive grid of game cards (header image at its native
aspect ratio, title, genres, rating). Infinite scroll through the cursor, with a visible
"Load more" fallback. Search is debounced and reflected in the URL.

**Game (`/games/:slug`)**: header image over a blurred copy of itself, title at 40 px,
developers, release date, price, genres, rating summary. For signed-in users, four status
buttons (colour and icon per status) and a review form with the segmented rating input. Reviews list
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
