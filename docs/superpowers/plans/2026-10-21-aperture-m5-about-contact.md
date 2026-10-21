# Aperture Redesign — Milestone 5: About and Contact — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The About page in the reference's language:
- **First screen:** the name in large serif, short prose in which the discipline names are links in their accent colors, and the portrait in corner brackets.
- **Below it, a quiet sales layer:** what I do, and where I'm based and available.
- **Then the contact form:** four underline fields posting to Formspree, with inline success and error states that also work without JS.

**Owner decisions (2026-10-21):**
- no "Worked with" column;
- no testimonial;
- "Available across Europe" is true.

**Architecture:**
- **Pure rich-text helper.** `src/lib/rich.ts` splits a translated string with `{portrait}` / `{analog}` placeholders into text and link segments, so translators keep control of word order. It's unit-tested.
- **Components.** The view is composed from `AboutIntro.astro`, `AboutDetails.astro` and `ContactForm.astro`, per spec §3.
- **Form script.** `src/contact/form.ts` enhances the native POST form with `fetch`. Its mount and teardown follow the gallery script's pattern.
- **Motion.** It uses the existing primitives: `data-animation="moveUp"` with `data-stagger` on the prose, and a custom `brackets` handler that draws the corners in.

**Spec:** §1 About, §3 Components, §6 privacy text.

## Global Constraints

- No new dependencies. Plain CSS. Motion only through `src/motion`.
- **The form works without JS:**
  - `action="https://formspree.io/f/xwvgojzz"` and `method="POST"`;
  - required `name`, `email` (type email) and `message`;
  - a hidden `_gotcha` honeypot;
  - a privacy note linking to `/privacy/` beside the submit button (GDPR notice at the point of collection).
- **With JS,** it submits via `fetch` with `Accept: application/json`:
  - the button reads "Sending…" while it waits;
  - on success, a live-region message appears and the form resets;
  - on error, a message appears with the email address as a fallback, and the typed fields are kept.
- The resting DOM is fully revealed. Brackets and prose animate only through the motion engine, which does nothing under reduced motion.
- All suites stay green after each task. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: `rich.ts`

`richText(text: string, links: Record<string, { href: string; label: string; accent: string }>): Array<{ text: string } | { link: { href: string; label: string; accent: string } }>`

Tests (`tests/unit/rich.test.ts`):
- plain text gives one text segment;
- two placeholders give text, link, text, link and text in order;
- a placeholder at the start or end produces no empty text segments;
- an unknown placeholder throws an error naming it, so a translation typo fails the build.

Commit: `feat(m5): rich text segments for translated prose with links`.

### Task 2: About page (intro, details, form markup) and translations

Build tests in `tests/build/about.test.ts` check `dist/about/index.html` and `dist/fr/about/index.html`:
- `h1` "Vyacheslav Plotnikov";
- prose links to `/work/portrait/` and `/work/analog/`, each with `style="--link: <accent>"` (for fr, `/fr/work/...`);
- a portrait `img` with alt text, and four `.frame__corner` elements;
- the details list "What I do" with 4 items, plus the availability line;
- no testimonial text, and no "Worked with";
- `form#contact-form` with the Formspree action, `method="post"`, required inputs `name`, `email` and `message`, a `_gotcha` honeypot, a privacy link, and `[data-form-status][aria-live="polite"]`;
- `section#contact` present.

New translation keys, with en / fr / de values:

| Key | en | fr | de |
| --- | --- | --- | --- |
| `about.story` | The work began with film photography: light, patience and a limited frame. Today it spans {portrait} and {analog}, alongside cinematography and editing for brands, agencies and productions. | Le travail a commencé avec la photographie argentique : la lumière, la patience et un cadre limité. Il couvre aujourd'hui le {portrait} et l'{analog}, ainsi que la cinématographie et le montage pour des marques, des agences et des productions. | Die Arbeit begann mit analoger Fotografie: Licht, Geduld und ein begrenzter Bildausschnitt. Heute umfasst sie {portrait} und {analog}, dazu Kameraarbeit und Schnitt für Marken, Agenturen und Produktionen. |
| `about.link.portrait` | portraits | portrait | Porträts |
| `about.link.analog` | analog photography | argentique | analoge Fotografie |
| `about.do` | What I do | Ce que je fais | Was ich mache |
| `about.do.1` | Portraits | Portraits | Porträts |
| `about.do.2` | Analog photography | Photographie argentique | Analoge Fotografie |
| `about.do.3` | Cinematography | Cinématographie | Kameraarbeit |
| `about.do.4` | Editing & colour | Montage & étalonnage | Schnitt & Farbkorrektur |
| `about.based` | Based in | Basé à | Ansässig in |
| `contact.privacy` | Your details are used only to reply. {privacy} | Vos données servent uniquement à vous répondre. {privacy} | Ihre Angaben werden nur für die Antwort verwendet. {privacy} |
| `contact.privacy.link` | Privacy | Confidentialité | Datenschutz |

Also:
- `contact.message.placeholder` becomes "Portraits, analog, film — timing and location", translated.
- `contact.success` and `contact.error` are reworded calmly.
- `contact.error` gets the email appended by the view.

Commit: `feat(m5): About page with linked prose, bracketed portrait, details and contact form`.

### Task 3: Form enhancement, motion, and browser tests

`src/contact/form.ts` exports `mountContactForm(form: HTMLFormElement): () => void`.

`tests/e2e/about.spec.ts` covers:
1. A successful submit (Formspree route mocked to 200) shows the success message in the live region, resets the fields, and re-enables the button.
2. A failed submit (mocked 500) shows the error with a mailto link and keeps the typed values.
3. Submitting empty is blocked natively, and no request is made.
4. While sending, the button is disabled and reads "Sending…".
5. The prose links take their accent color, the Analog link apricot (`rgb(232, 165, 122)`).
6. After the reveal, the prose and brackets are fully visible. Under reduced motion they're visible at once.
7. At 375px, the portrait stacks above the text without overflow (the existing eyebrow-collision and overflow tests already cover `/about/`).

Then do a single round of screenshots at 1440 and 375px, and fix what it shows.

Commit: `feat(m5): contact form submits in place, with prose and bracket reveals`.
