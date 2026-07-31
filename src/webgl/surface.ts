import { Program, Mesh, Plane, Texture } from 'ogl';
import { getScene } from './renderer';

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
   */
  function update() {
    const r = el.getBoundingClientRect();
    const h = 2 * Math.tan((camera!.fov * Math.PI) / 360) * camera!.position.z;
    const w = h * (window.innerWidth / window.innerHeight);
    mesh.scale.x = (r.width / window.innerWidth) * w;
    mesh.scale.y = (r.height / window.innerHeight) * h;
    mesh.position.x = ((r.left + r.width / 2) / window.innerWidth - 0.5) * w;
    mesh.position.y = -((r.top + r.height / 2) / window.innerHeight - 0.5) * h;
    mesh.visible = r.bottom > 0 && r.top < window.innerHeight;
    program.uniforms.uTime.value = performance.now() / 1000;
  }

  surfaces.push({
    update,
    destroy: () => {
      el.removeEventListener('load', load);
      mesh.setParent(null);
      program.remove();
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
