import { Program, Mesh, Plane, Texture } from 'ogl';
import { getScene } from './renderer';
import { computeMeshTransform } from './geometry';

export interface ShaderSpec {
  fragment: string;
  uniforms?: Record<string, unknown>;
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

export function registerSurface(el: HTMLImageElement, shader: ShaderSpec): void {
  const { renderer, scene, camera, surfaces } = getScene();
  if (!renderer || !scene || !camera) return;
  const gl = renderer.gl;

  const texture = new Texture(gl);
  const load = () => { texture.image = el; };
  if (el.complete && el.naturalWidth > 0) load();
  else el.addEventListener('load', load, { once: true });

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

  /**
   * Match the mesh to the element's LIVE rect, which includes any GSAP
   * transform applied this frame. Converting CSS pixels to world units at the
   * camera's z keeps the mesh exactly over the element at any viewport size.
   * The conversion itself is pure — see geometry.ts's computeMeshTransform —
   * this closure's only job is to supply the live inputs and apply the
   * result to the mesh, which is the part that genuinely needs a browser
   * and a live OGL mesh to exercise.
   */
  function update() {
    const r = el.getBoundingClientRect();
    const t = computeMeshTransform(
      r,
      { width: window.innerWidth, height: window.innerHeight },
      camera!.fov,
      camera!.position.z
    );
    mesh.scale.x = t.sx;
    mesh.scale.y = t.sy;
    mesh.position.x = t.x;
    mesh.position.y = t.y;
    mesh.visible = t.visible;
    program.uniforms.uTime.value = performance.now() / 1000;
  }

  surfaces.push({
    update,
    destroy: () => {
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
      visible: mesh.visible,
    }),
  });
}
