import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

beforeAll(() => {
  if (!existsSync('dist/index.html')) throw new Error('dist/ missing — run `npm run build` first');
});

const en = () => readFileSync('dist/about/index.html', 'utf8');
const fr = () => readFileSync('dist/fr/about/index.html', 'utf8');

describe('about page', () => {
  it('leads with the name and links the disciplines in their accent colours', () => {
    expect(en()).toMatch(/<h1[^>]*>Vyacheslav Plotnikov<\/h1>/);
    expect(en()).toMatch(/<a[^>]*href="\/work\/portrait\/"[^>]*style="--link: #9fc3d6"/);
    expect(en()).toMatch(/<a[^>]*href="\/work\/analog\/"[^>]*style="--link: #e8a57a"/);
    expect(fr()).toMatch(/<a[^>]*href="\/fr\/work\/analog\/"/);
  });

  it('frames the portrait in four corner brackets', () => {
    expect(en()).toMatch(/<img[^>]*alt="Portrait of Vyacheslav Plotnikov"/);
    expect(en().match(/class="frame__corner/g)).toHaveLength(4);
  });

  it('says what the work is and where, with no testimonial or client list', () => {
    expect(en()).toContain('What I do');
    expect(en().match(/class="details__item"/g)).toHaveLength(4);
    expect(en()).toContain('Available across Europe');
    expect(en()).not.toMatch(/Worked with|Kind words|essence of a moment/);
  });

  it('has a contact form that works without JavaScript', () => {
    const html = en();
    expect(html).toMatch(/<section[^>]*id="contact"/);
    expect(html).toMatch(/<form[^>]*id="contact-form"[^>]*action="https:\/\/formspree\.io\/f\/xwvgojzz"[^>]*method="post"/);
    for (const name of ['name', 'email', 'message']) expect(html).toMatch(new RegExp(`name="${name}"[^>]*required`));
    expect(html).toMatch(/type="email"[^>]*name="email"|name="email"[^>]*type="email"/);
    expect(html).toMatch(/name="_gotcha"/);
    expect(html).toMatch(/<form[\s\S]*href="\/privacy\/"[\s\S]*<\/form>/);
    expect(html).toMatch(/data-form-status[^>]*aria-live="polite"|aria-live="polite"[^>]*data-form-status/);
  });

  it('does not spell-check or translate the email address', () => {
    expect(en()).toMatch(/name="email"[^>]*spellcheck="false"|spellcheck="false"[^>]*name="email"/);
    expect(en()).toMatch(/<a href="mailto:pv@nickygrey\.com"[^>]*translate="no"/);
  });

  it('gives the home strips fetch priority as the page\'s main images', () => {
    expect(readFileSync('dist/index.html', 'utf8').match(/<img[^>]*fetchpriority="high"/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

describe('privacy policy matches the form', () => {
  it('lists exactly what the contact form collects', () => {
    const privacy = readFileSync('dist/privacy/index.html', 'utf8');
    expect(privacy).toContain('Your name, email address and message.');
    expect(privacy).not.toMatch(/project type/i);
    const form = readFileSync('dist/about/index.html', 'utf8').match(/<form[\s\S]*?<\/form>/)![0];
    const fields = [...form.matchAll(/<(?:input|textarea)[^>]*name="([^"]+)"/g)].map((m) => m[1]).filter((n) => n !== '_gotcha');
    expect(fields).toEqual(['name', 'email', 'message']);
  });
});
