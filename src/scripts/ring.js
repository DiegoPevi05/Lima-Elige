// Selector de candidaturas: las siete fotos en un anillo 3D que se gira
// arrastrando. Las tarjetas se curvan sobre el cilindro y ondean con la
// velocidad del giro; la del frente recupera el color.
import * as THREE from 'three';

const R = 2.6;

const VERT = /* glsl */ `
uniform float uVel;
varying vec2 vUv;
varying float vDepth;
void main(){
  vUv=uv;
  vec3 p=position;
  p.z-=p.x*p.x/(2.*${R.toFixed(1)});
  p.z+=sin(uv.y*3.1416)*uVel*.5;
  p.x+=sin(uv.y*6.2832)*uVel*.12;
  vec4 w=modelMatrix*vec4(p,1.);
  vDepth=w.z;
  gl_Position=projectionMatrix*viewMatrix*w;
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uMap;
uniform float uActive;
uniform vec3 uFog,uAccent;
varying vec2 vUv;
varying float vDepth;
void main(){
  vec3 t=texture2D(uMap,vUv).rgb;
  float g=dot(t,vec3(.299,.587,.114));
  vec3 col=mix(vec3(g),t,uActive);
  // Marco del color del partido en la tarjeta activa.
  vec2 e=min(vUv,1.-vUv)*vec2(1.5,2.1);
  float frame=1.-smoothstep(.028,.034,min(e.x,e.y));
  col=mix(col,uAccent,frame*uActive);
  // Las tarjetas del fondo se pierden en la neblina.
  float fade=smoothstep(${(R * 0.95).toFixed(2)},${(-R * 0.4).toFixed(2)},vDepth);
  col=mix(col,uFog,fade*.8);
  gl_FragColor=vec4(col,1.);
  #include <colorspace_fragment>
}
`;

export function initRing(root, items, onChange) {
  const canvas = root.querySelector('canvas');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  const fog = new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--neblina').trim());

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
  camera.position.set(0, 0, R + 5.2);
  const group = new THREE.Group();
  scene.add(group);

  const n = items.length;
  const step = (Math.PI * 2) / n;
  const loader = new THREE.TextureLoader();
  const geometry = new THREE.PlaneGeometry(1.5, 2.1, 24, 12);
  const cards = items.map((item, i) => {
    const map = loader.load(item.foto);
    map.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: map }, uActive: { value: 0 }, uVel: { value: 0 }, uFog: { value: fog }, uAccent: { value: new THREE.Color(item.color) } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(Math.sin(i * step) * R, 0, Math.cos(i * step) * R);
    mesh.rotation.y = i * step;
    group.add(mesh);
    return material;
  });

  // `k` es el índice sin acotar: permite dar vueltas completas sin saltos.
  let k = 0;
  let rot = 0;
  let vel = 0;
  let drag = null;
  const active = () => ((k % n) + n) % n;
  const select = (next) => {
    k = next;
    onChange(active());
  };

  function resize() {
    const { width, height } = canvas.getBoundingClientRect();
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // En pantallas angostas se aleja la cámara para que quepa la tarjeta central.
    camera.position.z = R + (camera.aspect < 1 ? 5.2 / Math.max(camera.aspect, 0.6) : 5.2);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, rot, moved: 0 };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    drag.moved = Math.max(drag.moved, Math.abs(dx));
    rot = drag.rot + (dx / canvas.clientWidth) * 2.4;
  });
  const release = (e) => {
    if (!drag) return;
    const { moved } = drag;
    drag = null;
    if (moved > 6) return select(Math.round(-rot / step));
    // Toque sin arrastre: los lados giran, el centro abre la hoja de vida.
    const x = (e.clientX - canvas.getBoundingClientRect().left) / canvas.clientWidth;
    if (x < 0.4) select(k - 1);
    else if (x > 0.6) select(k + 1);
    else root.querySelector('[data-anillo-ir]')?.click();
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', () => (drag = null));
  root.querySelector('[data-anillo-prev]')?.addEventListener('click', () => select(k - 1));
  root.querySelector('[data-anillo-next]')?.addEventListener('click', () => select(k + 1));

  let visible = false;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(canvas);

  const timer = new THREE.Timer();
  function frame() {
    requestAnimationFrame(frame);
    timer.update();
    if (!visible) return;
    const dt = Math.min(timer.getDelta(), 0.05);
    const before = rot;
    if (!drag) rot += (-k * step - rot) * (1 - Math.exp(-dt * 7));
    vel += ((rot - before) / Math.max(dt, 1e-3) - vel) * (1 - Math.exp(-dt * 10));
    group.rotation.y = rot;
    const front = (((Math.round(-rot / step) % n) + n) % n);
    cards.forEach((m, i) => {
      m.uniforms.uActive.value += ((i === front ? 1 : 0) - m.uniforms.uActive.value) * (1 - Math.exp(-dt * 8));
      m.uniforms.uVel.value = THREE.MathUtils.clamp(vel * 0.25, -1, 1);
    });
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
  onChange(0);
  return { select: (i) => select(k + (i - active())) };
}
