# AGENTS.md — Workspace Conventions

## Active Systems & Frameworks

- **Framework:** Astro 5 (static output) with zero-JS default hydration
- **Routing:** i18n — `en` (default, unprefixed), `fr`, `de`. Six built pages: index and privacy in each locale.
- **Styling:** Plain CSS. Design tokens and shared rules in `src/styles/global.css`; component-specific rules in scoped `<style>` blocks inside each `.astro` file.
  - **No Tailwind. No CSS Modules.** Neither is installed. Do not reach for utility classes or `.module.css` imports — they will not resolve.
- **Motion & Scroll:** Lenis + GSAP with ScrollTrigger and SplitText
- **Testing:** Vitest (`npm test`, unit) and Playwright (`npm run test:e2e`, integration)
- **Harnesses:** Superpowers (execution & TDD), Impeccable (design rules)

Full dependency set is deliberately small: `astro`, `gsap`, `lenis`, `vitest`, `@playwright/test`. Adding a dependency is a decision, not a convenience — the site shipped 5.06 kB gzip of JS before the motion system.

## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

Ports 4321–4324 are frequently occupied by stale dev servers from unrelated projects on this machine. Always confirm which port your server actually bound to before trusting what you see in a browser.

## UI & Design Principles (Impeccable Alignment)

- Avoid generic "AI-generated" aesthetics — no raw default grays, generic cards, or abrupt transitions.
- Use intentional typography scaling and subtle, fluid micro-interactions.
- Execute visual audits via `/impeccable critique` before finalizing layout changes.
- What reads as generic is usually *inconsistent* motion: effects that do not share timing, easing, or intent. Draw every duration and easing from `src/motion/tokens.ts` rather than inventing values inline.

## Motion Architecture

Motion is a single system, not per-component animations. Four files under `src/motion/`:

| file | responsibility |
| --- | --- |
| `tokens.ts` | easing, duration, distance, stagger scales; data-attribute parsers `num()` / `flag()`. No dependencies. |
| `primitives.ts` | pure builders turning element attributes into GSAP tween config. No GSAP calls, so unit-testable. |
| `engine.ts` | Lenis + ScrollTrigger wiring, DOM scan, View Transition lifecycle. |
| `index.ts` | public API: `initMotion()`, `registerMotion()`, `teardownMotion()`. |

### Declarative usage

Animate by attribute, not by writing a timeline:

```html
<h2 data-animation="split" data-stagger>Heading</h2>
<div data-animation="moveUp" data-delay="0.2">…</div>
<img data-animation="scale" data-from="1.15" data-to="1" data-scrub>
```

Primitives: `moveUp`, `split`, `parallax`, `fade`, `scale`, `marquee`.
Modifiers: `data-delay`, `data-stagger`, `data-start`, `data-end`, `data-scrub`, `data-speed`, `data-from`, `data-to`.

`data-stagger` is presence-as-true — bare uses the base token, an explicit number overrides, absent means no stagger. When present, the engine targets the element's *children*.

For anything the primitives cannot express, register a custom handler rather than bypassing the system:

```ts
import { registerMotion } from '../motion';

registerMotion('hero', (el, { gsap, ScrollTrigger }) => { /* … */ });
```

Custom handlers take priority over same-named primitives.

### Smooth scroll integration

All scroll-triggered animation syncs to the central Lenis loop. This is already implemented in `engine.ts` — do not construct a second Lenis instance or a second RAF loop:

```ts
import Lenis from 'lenis';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';

const lenis = new Lenis({ autoRaf: false });

lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add(tick);          // named, so it can be removed on teardown
gsap.ticker.lagSmoothing(0);
```

Two things the canonical snippet omits that matter here:

1. **`gsap.ticker.lagSmoothing(0)` is global page state**, not a Lenis setting. It sets `_lagThreshold = Infinity` for every GSAP animation on the page. Tearing Lenis down must restore it with `gsap.ticker.lagSmoothing(500, 33)` (GSAP's documented defaults).
2. **The ticker callback must be a named function.** An inline arrow cannot be passed to `gsap.ticker.remove()` and is therefore unremovable for the life of the page.

### Lifecycle rules

Astro's `ClientRouter` swaps the DOM underneath the engine. Leaked ScrollTriggers accumulate silently across navigations and progressively degrade scrolling.

- `initMotion()` on `astro:page-load`, `teardownMotion()` on `astro:before-swap`. Both are required.
- `Layout.astro` calls `initMotion()` **twice** — synchronously and again on `astro:page-load`. This is deliberate and load-bearing: `astro:page-load` is guaranteed to fire only after every module script has run, so it is what guarantees late-registering `registerMotion()` handlers are seen regardless of script emission order. Do not "clean up" either call.
- Anything a custom handler creates that is *not* attached to a ScrollTrigger — repeating timelines, DOM event listeners — is not tracked by teardown and must be cleaned up by the handler itself. The e2e leak test counts ScrollTriggers only and will not catch these.

### Accessibility and mobile

- All motion is declared inside `gsap.matchMedia()` gated on `(prefers-reduced-motion: no-preference)`. Under reduced motion nothing animates and Lenis is never constructed.
- **An element's resting DOM state must be its fully-revealed state.** Never author `opacity: 0` in CSS to hide something you intend to reveal with JS — if the engine does not run, that content is invisible forever.
- Lenis is disabled on touch devices, where it degrades native scrolling. Reveals still run.

## Engineering & Component Conventions (Satūs/Darkroom Inspired)

1. **Isolated UI Development:** keep UI primitives modular; test isolated components before placing them in pages.
2. **Pure logic separates from effects:** the pattern in `src/motion/` — pure config builders unit-tested in isolation, integration verified in a real browser — generalises. Prefer it over mocking a runtime.
3. **Verify in the real app.** Motion, layout, and contrast claims need a browser and a screenshot, not a passing unit test. Read computed styles when asserting an effect actually applies.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
