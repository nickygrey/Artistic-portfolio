import { Program, Mesh, Plane, Texture } from 'ogl';
import { getScene } from './renderer';
import { computeMeshTransform, computeScissorBox, type Box, type ScissorBox } from './geometry';

export interface ShaderSpec {
  fragment: string;
  uniforms?: Record<string, unknown>;
}

export interface SurfaceOptions {
  /**
   * Run when this surface is destroyed — which is to say from
   * `teardownWebGL()`, the single place `destroy()` is ever called from, and
   * therefore from *every* route into it: a View Transition, a lost context,
   * and the fps guard deciding this device cannot hold the effect.
   *
   * That last route is why this exists. Anything a component sets running to
   * *feed* a surface — a `gsap.ticker` callback sampling scroll velocity, say
   * — is invisible to `teardownWebGL()`, and the motion system's own teardown
   * does not fire when the fps guard trips. Without a hook here, the device
   * that just failed the 50fps test would keep paying for a per-frame feed
   * into uniforms bound to no GPU program, for the rest of the page's life:
   * exactly the opposite of what the guard is for. Measured before this
   * existed: getBoundingClientRect on the hero <img> still running 0.99/frame
   * and getComputedStyle 0.19/frame after the guard had torn everything down.
   *
   * Register the callback against the feed that is live *at registration
   * time*, not whatever is live when it fires: `initMotion()` runs before
   * `initWebGL()` on every `astro:page-load`, so by the time the opening
   * `teardownWebGL()` destroys the previous page's surface, the next page's
   * feed already exists and must not be the thing that gets stopped.
   */
  onDestroy?: () => void;
}

const VERTEX = `
attribute vec2 uv;
attribute vec3 position;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/**
 * Every ancestor whose `overflow` clips this element, nearest first.
 *
 * `visible` is the only `overflow` value that does not clip — `hidden`,
 * `clip`, `auto` and `scroll` all do — and CSS forces a `visible` axis to
 * `auto` when the other axis clips, so testing both axes for `visible` is the
 * complete test. Read once, at registration: `overflow` is authored in a
 * stylesheet, not animated, whereas the *rects* these elements occupy change
 * every frame and are re-read every frame.
 *
 * `<body>` and `<html>` are deliberately skipped. An `overflow` declared on
 * either (this site has `body { overflow-x: hidden }`) is propagated by CSS to
 * the viewport rather than applied to the element's own box, so the element's
 * rect is not the clip — the viewport is, and `computeScissorBox` intersects
 * that unconditionally.
 *
 * The rect used per frame is the border box, while `overflow` clips to the
 * padding box. They differ only by border widths, and no clipping ancestor on
 * this site has a border; a bordered one would leak the border's own width,
 * which is a smaller error than the one this whole mechanism exists to fix.
 */
function clippingAncestors(el: Element): Element[] {
  const out: Element[] = [];
  for (
    let p = el.parentElement;
    p && p !== document.body && p !== document.documentElement;
    p = p.parentElement
  ) {
    const s = getComputedStyle(p);
    if (s.overflowX !== 'visible' || s.overflowY !== 'visible') out.push(p);
  }
  return out;
}

/**
 * Registers a mesh over `el`, and reports **whether it actually did**.
 *
 * The return value is not decoration. This function no-ops when no scene is
 * alive, and `onDestroy` is only ever reached through a surface's `destroy()`
 * — so a caller that registers *late* (after its image lazily decodes, as
 * SelectedWork.astro must) and does not check gets no `onDestroy` and no way
 * to know that. Measured before this returned anything: forcing a teardown
 * through the fps-guard/lost-context path and *then* scrolling to `#work` left
 * four `document` listeners orphaned and 26 forced layouts per 25 pointer
 * moves over a dead card — verbatim the leak `SurfaceOptions.onDestroy` exists
 * to prevent, on the same path, because the mechanism keys off a `destroy()`
 * that never existed.
 */
export function registerSurface(
  el: HTMLImageElement,
  shader: ShaderSpec,
  options: SurfaceOptions = {}
): boolean {
  const { renderer, scene, camera, surfaces } = getScene();
  if (!renderer || !scene || !camera) return false;
  const gl = renderer.gl;

  const texture = new Texture(gl);
  /**
   * `needsUpdate` matters as much as the assignment. OGL's `Texture.update()`
   * short-circuits on `this.image === this.store.image && !this.needsUpdate`
   * (ogl/src/core/Texture.js), so re-decoding the SAME element with a new
   * bitmap — which is exactly what a `srcset` swap does — never re-uploads
   * without it. Both `Hero.astro` and `SelectedWork.astro` use `widths`/
   * `sizes`, and measured on a card taken from 390px up to 1280px: the mesh
   * kept painting the 400w bitmap upscaled and measured 30% softer in
   * high-frequency energy than the DOM <img> beside it.
   *
   * The listener is therefore NOT `{ once: true }` — the first decode is not
   * the last one. `destroy()` removes it.
   */
  const load = () => {
    texture.image = el;
    texture.needsUpdate = true;
  };
  if (el.complete && el.naturalWidth > 0) load();
  el.addEventListener('load', load);

  const program = new Program(gl, {
    vertex: VERTEX,
    fragment: shader.fragment,
    uniforms: {
      tMap: { value: texture },
      uTime: { value: 0 },
      uHover: { value: 0 },
      uVelocity: { value: 0 },
      ...(shader.uniforms ?? {}),
    },
    transparent: true,
  });

  const mesh = new Mesh(gl, { geometry: new Plane(gl, { widthSegments: 32, heightSegments: 32 }), program });
  mesh.setParent(scene);

  const clips = clippingAncestors(el);
  let scissor: ScissorBox = { x: 0, y: 0, width: 0, height: 0, visible: false };

  /**
   * Match the mesh to the element's LIVE rect, which includes any GSAP
   * transform applied this frame. Converting CSS pixels to world units at the
   * camera's z keeps the mesh exactly over the element at any viewport size.
   * The conversion itself is pure — see geometry.ts's computeMeshTransform —
   * this closure's only job is to supply the live inputs and apply the
   * result to the mesh, which is the part that genuinely needs a browser
   * and a live OGL mesh to exercise.
   *
   * The transform is only half of what the browser does with this element,
   * though: an `overflow` ancestor also clips it, and a mesh honouring one
   * without the other paints outside the box CSS confines the element to.
   * The clip is computed here too (also pure — computeScissorBox) and applied
   * as a scissor rectangle at draw time, below.
   */
  function update() {
    const r = el.getBoundingClientRect();
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const t = computeMeshTransform(r, viewport, camera!.fov, camera!.position.z);
    scissor = computeScissorBox(
      r,
      clips.map(c => c.getBoundingClientRect() as Box),
      viewport,
      renderer!.dpr
    );
    mesh.scale.x = t.sx;
    mesh.scale.y = t.sy;
    mesh.position.x = t.x;
    mesh.position.y = t.y;
    mesh.visible = t.visible && scissor.visible;
    program.uniforms.uTime.value = performance.now() / 1000;
  }

  /**
   * The scissor test is scoped to this one mesh: enabled immediately before
   * its draw and disabled immediately after, so it constrains nothing else in
   * the scene and, in particular, never reaches the frame's `gl.clear()` —
   * which OGL issues before any mesh draws, and which must keep clearing the
   * whole buffer or the previous frame's pixels would survive outside every
   * surface's clip.
   */
  mesh.onBeforeRender(() => {
    renderer!.enable(gl.SCISSOR_TEST);
    renderer!.setScissor(scissor.width, scissor.height, scissor.x, scissor.y);
  });
  mesh.onAfterRender(() => {
    renderer!.disable(gl.SCISSOR_TEST);
  });

  surfaces.push({
    update,
    destroy: () => {
      // First, so whatever was feeding this surface stops before the objects
      // it feeds are freed rather than after. See SurfaceOptions.onDestroy.
      options.onDestroy?.();
      el.removeEventListener('load', load);
      mesh.setParent(null);
      // Release every GPU-side object this surface owns. Harmless overkill
      // today — destroy() only ever runs from teardownWebGL(), which follows
      // with WEBGL_lose_context and frees the whole context anyway — but it
      // stops being harmless the moment a single surface can be torn down
      // without a full teardown (e.g. a component unmounting while WebGL
      // keeps running for the rest of the page), which a later task may
      // well need. OGL's own Geometry has a remove() that frees its VAOs
      // and buffers; Program.remove() frees the compiled program; Texture
      // has no equivalent (see ogl/src/core/Texture.js's own "TODO: delete
      // texture"), so its underlying WebGLTexture is freed directly.
      mesh.geometry.remove();
      program.remove();
      gl.deleteTexture(texture.texture);
      texture.image = undefined;
    },
    /** Exposed so a test can assert the mesh actually tracks its element. */
    debug: () => ({
      el: el.className,
      rect: el.getBoundingClientRect(),
      mesh: { x: mesh.position.x, y: mesh.position.y, sx: mesh.scale.x, sy: mesh.scale.y },
      scissor,
      // Scalar uniforms only, and by value: this crosses a Playwright
      // serialisation boundary, where the Texture behind `tMap` is neither
      // serialisable nor interesting. Reading them from the live Program is
      // what makes an assertion about `uVelocity` an assertion about the
      // value the GPU is actually handed, rather than about a module the test
      // imported separately and may not share an instance with.
      uniforms: Object.fromEntries(
        Object.entries(program.uniforms)
          .filter(([, u]) => typeof (u as { value: unknown }).value === 'number')
          .map(([k, u]) => [k, (u as { value: number }).value])
      ) as Record<string, number>,
      /**
       * The vec2s, separately, for the same reason and with the same
       * constraint: numbers only, copied by value, nothing that cannot cross
       * a Playwright serialisation boundary. `uOrigin` in particular is
       * otherwise unobservable — it is set once, at activation, and decides
       * where a re-form converges, so "a caption click does not put the iris
       * on the frame's bottom edge" is only checkable in a real browser
       * through this.
       */
      vectors: Object.fromEntries(
        Object.entries(program.uniforms)
          .filter(([, u]) => {
            const v = (u as { value: unknown }).value;
            return Array.isArray(v) && v.every(n => typeof n === 'number');
          })
          .map(([k, u]) => [k, [...(u as { value: number[] }).value]])
      ) as Record<string, number[]>,
      visible: mesh.visible,
    }),
  });
  return true;
}
