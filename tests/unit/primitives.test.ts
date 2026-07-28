import { describe, it, expect } from 'vitest';
import {
  buildMoveUp, buildFade, buildScale, buildParallax, buildSplit,
  buildScrollTriggerVars, isMotionName,
} from '../../src/motion/primitives';
import { DISTANCE, DURATION, EASE, STAGGER } from '../../src/motion/tokens';

/** Minimal Element stand-in driven by a plain attribute map. */
function el(attrs: Record<string, string> = {}): Element {
  return {
    getAttribute: (n: string) => (n in attrs ? attrs[n] : null),
    hasAttribute: (n: string) => n in attrs,
  } as unknown as Element;
}

describe('isMotionName', () => {
  it('accepts the six primitives', () => {
    for (const n of ['moveUp', 'split', 'parallax', 'fade', 'scale', 'marquee']) {
      expect(isMotionName(n)).toBe(true);
    }
  });

  it('rejects unknown names and null', () => {
    expect(isMotionName('wobble')).toBe(false);
    expect(isMotionName(null)).toBe(false);
  });
});

describe('buildMoveUp', () => {
  it('travels DISTANCE.md and fades in with token timing', () => {
    const spec = buildMoveUp(el());
    expect(spec.from).toEqual({ y: DISTANCE.md, opacity: 0 });
    expect(spec.to.y).toBe(0);
    expect(spec.to.opacity).toBe(1);
    expect(spec.to.duration).toBe(DURATION.base);
    expect(spec.to.ease).toBe(EASE.out);
  });

  it('defaults delay to 0 and stagger to 0', () => {
    const spec = buildMoveUp(el());
    expect(spec.to.delay).toBe(0);
    expect(spec.to.stagger).toBe(0);
  });

  it('reads data-delay', () => {
    expect(buildMoveUp(el({ 'data-delay': '0.2' })).to.delay).toBe(0.2);
  });

  it('applies base stagger when data-stagger is present but empty', () => {
    expect(buildMoveUp(el({ 'data-stagger': '' })).to.stagger).toBe(STAGGER.base);
  });

  it('honours an explicit numeric stagger', () => {
    expect(buildMoveUp(el({ 'data-stagger': '0.25' })).to.stagger).toBe(0.25);
  });
});

describe('buildFade', () => {
  it('animates opacity only, leaving transform untouched', () => {
    const spec = buildFade(el());
    expect(spec.from).toEqual({ opacity: 0 });
    expect(spec.to.opacity).toBe(1);
    expect(spec.from).not.toHaveProperty('y');
  });
});

describe('buildScale', () => {
  it('defaults 1.08 -> 1', () => {
    const spec = buildScale(el());
    expect(spec.from.scale).toBe(1.08);
    expect(spec.to.scale).toBe(1);
  });

  it('reads data-from and data-to', () => {
    const spec = buildScale(el({ 'data-from': '1.15', 'data-to': '1' }));
    expect(spec.from.scale).toBe(1.15);
    expect(spec.to.scale).toBe(1);
  });
});

describe('buildParallax', () => {
  it('uses linear easing so scrubbing tracks scroll exactly', () => {
    expect(buildParallax(el()).to.ease).toBe(EASE.none);
  });

  it('scales travel by data-speed', () => {
    const slow = buildParallax(el({ 'data-speed': '0.5' }));
    const fast = buildParallax(el({ 'data-speed': '2' }));
    expect(Math.abs(Number(fast.to.y))).toBeGreaterThan(Math.abs(Number(slow.to.y)));
  });

  it('defaults to speed 1 when data-speed is absent', () => {
    const spec = buildParallax(el());
    expect(Number(spec.to.y)).not.toBeNaN();
  });
});

describe('buildSplit', () => {
  it('rises a full line height from below the mask', () => {
    const spec = buildSplit(el());
    expect(spec.from.yPercent).toBe(100);
    expect(spec.to.yPercent).toBe(0);
  });

  it('staggers lines by default', () => {
    expect(buildSplit(el()).to.stagger).toBe(STAGGER.tight);
  });
});

describe('buildScrollTriggerVars', () => {
  it('omits scrub when data-scrub is absent', () => {
    expect(buildScrollTriggerVars(el()).scrub).toBeUndefined();
  });

  it('enables smoothed scrub when data-scrub is present but empty', () => {
    expect(buildScrollTriggerVars(el({ 'data-scrub': '' })).scrub).toBe(true);
  });

  it('uses a numeric scrub value when given', () => {
    expect(buildScrollTriggerVars(el({ 'data-scrub': '1.5' })).scrub).toBe(1.5);
  });

  it('reads data-start and data-end verbatim', () => {
    const vars = buildScrollTriggerVars(el({
      'data-start': 'top bottom+=100',
      'data-end': '+=100%',
    }));
    expect(vars.start).toBe('top bottom+=100');
    expect(vars.end).toBe('+=100%');
  });
});
