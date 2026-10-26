# nickygrey.com

Portfolio of **Vyacheslav Plotnikov**, a photographer and cinematographer based in Luxembourg. It shows three galleries (Portraits, Analog and Wedding) in English, French and German, with a contact form on the About page.

Live at **[nickygrey.com](https://nickygrey.com)**.

## How it's built

- **[Astro 7](https://astro.build)**, static output. Pages are plain HTML, with a little JavaScript for motion.
- **Plain CSS**, with design tokens in `src/styles/global.css`. There is no Tailwind and no UI framework.
- **Motion:** GSAP and Lenis for scroll reveals; the galleries are a drag-to-explore canvas. Every duration and easing comes from `src/motion/tokens.ts`.
- **WebGL** ([ogl](https://github.com/oframe/ogl)) adds the colour tint on hover and the bend while dragging, on a layer above the real images. Without WebGL, or with reduced motion turned on, the site works the same, just without the effects.
- **Images** go through `astro:assets` and are served as AVIF with a WebP fallback.
- **Contact form** posts to [Formspree](https://formspree.io), and still works without JavaScript.
- **Languages:** English at `/`, French at `/fr/`, German at `/de/`. All text is in `src/i18n/translations.ts`.

## Getting started

You need Node.js **22.23.4 or newer** (CI uses Node 24).

```sh
npm install
npm run dev -- --ignore-lock     # http://localhost:4321
```

If a coding agent is running, Astro 7 starts `dev` and `preview` in the background. `--ignore-lock` keeps the server in the foreground; without it, a stale background server can hold the port (`npx astro dev stop` clears it).

## Commands

| Command | What it does |
| :-- | :-- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serves the production build locally |
| `npm test` | Unit tests (Vitest) |
| `npm run test:build` | Checks the built HTML in `dist/`; run `npm run build` first |
| `npm run test:e2e` | Browser tests (Playwright) in Chrome, iPhone (WebKit) and Android, including WCAG 2.2 AA accessibility checks |
| `npm run test:prod` | Builds the site and checks that the Content Security Policy is enforced and has no violations |
| `npm run perf` | Measures Core Web Vitals against a preview on port 4340 |

The Playwright tests start their own server. Install the browsers once with `npx playwright install`.

## Project layout

```text
src/
  pages/            one thin wrapper per route and language
  views/            page markup: Home, Gallery, About, Privacy
  components/       Header, Footer, contact form, About sections
  content/galleries/
    <slug>/         the photographs of one gallery
    <slug>.yaml     alt text and cover choice for that gallery
  lib/              disciplines, SEO and JSON-LD, Content Security Policy
  gallery/          drag canvas and single-photo view
  motion/           the motion system (tokens, primitives, engine)
  webgl/            hover tint and drag-bend shaders
  i18n/             all translations
  styles/           global CSS and tokens
tests/
  unit/  build/  e2e/  prod/
docs/superpowers/   design spec and milestone plans
```

## Adding photographs

1. Prepare each photo: rotate it upright (bake in the EXIF rotation), **strip all metadata** (GPS, camera serials) and keep the long edge at **3200 px or less**. The repository is public, so this matters.
2. Put the files in `src/content/galleries/<slug>/`, for example `portrait`, `analog` or `wedding`. Photos appear in filename order.
3. Give each photo an entry in `src/content/galleries/<slug>.yaml` with descriptive `alt` text. Mark one entry `cover: true` to use it on the home page.
4. Run `npm run build && npm run test:build`, then look at the gallery with `npm run preview`. Nothing enforces alt text, so check that every new photo has some.

A new gallery also needs an entry in `src/lib/disciplines.ts` (colours and years) and a name in the translations. A gallery without photos builds no page and gets no strip on the home page.

Originals live in `FOR PORTFOLIO/`, which is git-ignored and never published.

## Deployment

Every push to `main` builds the site and deploys it to GitHub Pages (`.github/workflows/deploy.yml`). The custom domain comes from `CNAME`.

`main` is protected. Changes arrive by pull request, and the **Verify** workflow (unit tests, build and build checks) must pass before a merge. GitHub Actions are pinned to commit SHAs, and Dependabot keeps them and npm packages up to date every week.

## Security

- The Content Security Policy is built in `src/lib/csp.ts`. Scripts may only come from the site itself, and the one inline script is allowed by its hash. Adding a third-party service means adding its origin there; `npm run test:prod` catches anything missed.
- There are no secrets in the repository. The Formspree form ID is public by design.
- To report a security issue, use the contact form on the site rather than opening a public issue.

## Working on it with an AI assistant

`AGENTS.md` (also linked as `CLAUDE.md`) holds the conventions: motion architecture, design rules, testing and security. Read it before making changes.

## Rights

The code is shared for reference. **All photographs are © Vyacheslav Plotnikov, all rights reserved.** They may not be reused without permission.
