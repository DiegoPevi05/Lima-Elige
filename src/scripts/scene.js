// Escena WebGL: un único sistema de partículas que el scroll reordena.
// - En portada y comparación las partículas corren por un campo de vectores.
// - En cada candidatura se asientan como retrato punteado (densidad = sombra).
// - Entre secciones, un campo de rotacional (curl noise) las arrastra.
// Detrás, un shader dibuja el mismo campo como una rejilla de trazos.
import * as THREE from 'three';
import peru from '../data/peru.json';

// Relieve del retrato: rango de z en el que se codifica la sombra de cada punto.
const DEPTH = 0.22;

const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
// Campo sin divergencia en el plano: rotacional de un potencial escalar.
vec2 curl2(vec3 p){
  const float e=.12;
  float a=snoise(p+vec3(0.,e,0.));float b=snoise(p-vec3(0.,e,0.));
  float c=snoise(p+vec3(e,0.,0.));float d=snoise(p-vec3(e,0.,0.));
  return vec2(a-b,-(c-d))/(2.*e);
}
`;

const POINTS_VERT = /* glsl */ `
${NOISE}
attribute vec3 aA;
attribute vec3 aB;
attribute vec4 aRnd;
attribute float aTintA;
attribute float aTintB;
uniform float uTime,uMix,uLooseA,uLooseB,uSize,uDot,uVel,uTwist;
uniform vec2 uScaleA,uScaleB,uOffA,uOffB,uMouse,uTilt,uField;
uniform vec3 uInk,uAccent;
varying vec3 vColor;
varying float vAlpha;

// 0: tinta/acento del partido · 1: rojo de la bandera · 2: blanco
vec3 tintColor(float t,float accent){
  vec3 base=mix(uInk,uAccent,clamp(accent,0.,1.));
  return t<.5?base:(t<1.5?vec3(.694,.005,.017):vec3(1.));
}

vec3 place(vec3 p,vec2 scale,vec2 off,float loose){
  vec3 q=vec3(p.xy*scale,p.z);
  // El retrato se inclina hacia el cursor; el relieve viene de la luminancia.
  float tight=1.-loose;
  float cy=cos(uTilt.x*tight),sy=sin(uTilt.x*tight);
  q.xz=mat2(cy,-sy,sy,cy)*q.xz;
  float cx=cos(uTilt.y*tight),sx=sin(uTilt.y*tight);
  q.yz=mat2(cx,-sx,sx,cx)*q.yz;
  q.xy+=off;
  return q;
}

void main(){
  float stagger=aRnd.x*.35;
  float m=smoothstep(stagger,stagger+.65,uMix);
  float loose=mix(uLooseA,uLooseB,m);
  vec3 p=mix(place(aA,uScaleA,uOffA,uLooseA),place(aB,uScaleB,uOffB,uLooseB),m);
  float darkA=mix(clamp(.5-aA.z/${DEPTH},0.,1.),.4,uLooseA);
  float darkB=mix(clamp(.5-aB.z/${DEPTH},0.,1.),.4,uLooseB);
  float dark=mix(darkA,darkB,m);

  // Corriente: las partículas sueltas viajan por líneas de flujo.
  float speed=.05+.11*aRnd.y;
  vec3 f=p;
  f.x=mod(p.x+uTime*speed+uField.x*.5,uField.x)-uField.x*.5;
  f.y+=.42*snoise(vec3(f.x*.42,p.y*.5,uTime*.05+aRnd.z))+.08*sin(f.x*3.+aRnd.w*6.28);
  p=mix(p,f,loose);

  // Rotacional: máximo a mitad de la transición y cuando se hace scroll rápido.
  float storm=sin(3.14159*m);
  vec2 c=curl2(vec3(p.xy*.85,uTime*.12+aRnd.z*.3*storm));
  float amp=.006+storm*.75+min(abs(uVel),1.5)*.05*(1.-loose);
  p.xy+=c*amp*(.5+aRnd.y);
  p.z+=storm*(aRnd.w-.5)*1.6;
  p.y-=uVel*.06*aRnd.x*(1.-loose);

  // Vórtice alrededor del cursor.
  vec2 d=p.xy-uMouse;
  float r=length(d)+1e-4;
  float infl=exp(-r*r*9.);
  p.xy+=vec2(-d.y,d.x)/r*infl*.1*uTwist+(d/r)*infl*.012;

  vec4 mv=modelViewMatrix*vec4(p,1.);
  gl_Position=projectionMatrix*mv;
  float tightSize=uDot*(.25+1.9*pow(dark,.85))*step(.03,dark);
  float looseSize=uSize*(.55+.9*aRnd.y)/-mv.z;
  gl_PointSize=mix(tightSize,looseSize,max(loose,storm))*(1.+storm*.4);
  float accent=step(.8,aRnd.w)+infl*.6;
  vColor=mix(tintColor(aTintA,accent),tintColor(aTintB,accent),m);
  float flag=mix(step(.5,aTintA),step(.5,aTintB),m);
  vAlpha=mix(mix(.92,1.,flag),.34,max(loose,storm*.7));
}
`;

const POINTS_FRAG = /* glsl */ `
precision highp float;
varying vec3 vColor;
varying float vAlpha;
void main(){
  float d=length(gl_PointCoord-.5);
  float a=smoothstep(.5,.18,d)*vAlpha;
  if(a<.01)discard;
  gl_FragColor=vec4(vColor,a);
  #include <colorspace_fragment>
}
`;

const FIELD_FRAG = /* glsl */ `
precision highp float;
${NOISE}
uniform vec2 uRes,uMousePx;
uniform float uTime,uDpr,uVel,uScroll;
uniform vec3 uFog,uInk,uAccent;
void main(){
  vec2 p=gl_FragCoord.xy/uDpr;
  vec2 res=uRes/uDpr;
  float cell=clamp(res.x/42.,22.,34.);
  vec2 c=(floor(p/cell)+.5)*cell;
  vec2 q=c/res.y;
  vec2 dir=curl2(vec3(q*1.25,uTime*.05+uScroll*2.2));
  float mag=length(dir);
  dir/=max(mag,1e-4);
  vec2 dm=c-uMousePx;
  float infl=exp(-dot(dm,dm)/(170.*170.));
  dir=normalize(mix(dir,normalize(vec2(-dm.y,dm.x)+1e-4),infl));
  float v=clamp(abs(uVel)*.7,0.,.9);
  dir=normalize(mix(dir,vec2(0.,sign(uVel+1e-4)),v));
  float len=cell*(.12+.22*clamp(mag*.6,0.,1.)+.14*infl+.16*v);
  vec2 d=p-c;
  float t=clamp(dot(d,dir),-len,len);
  float line=smoothstep(1.,.25,length(d-dir*t));
  // Punta: un punto más marcado en el extremo hacia donde apunta el vector.
  float tip=smoothstep(2.1,.9,length(d-dir*len));
  float strength=.085+.3*infl+.05*v;
  vec3 col=mix(uFog,mix(uInk,uAccent,.25+infl*.75),max(line,tip*1.4)*strength);
  gl_FragColor=vec4(col,1.);
  #include <colorspace_fragment>
}
`;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Convierte una foto en una trama de N puntos: cada punto ocupa una celda fija
// y guarda en z cuánta sombra hay ahí (el shader lo usa como tamaño y relieve).
async function samplePortrait(src, n) {
  const img = await loadImage(src);
  const aspect = img.naturalWidth / img.naturalHeight;
  const cols = Math.floor(Math.sqrt(n * aspect));
  const rows = Math.floor(n / cols);
  const cv = document.createElement('canvas');
  cv.width = cols;
  cv.height = rows;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, cols, rows);
  const px = ctx.getImageData(0, 0, cols, rows).data;
  const lum = new Float32Array(cols * rows);
  for (let i = 0; i < lum.length; i++) lum[i] = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
  // Percentiles: el fondo claro queda vacío y la piel conserva medios tonos.
  const sorted = Float32Array.from(lum).sort();
  const lo = sorted[(sorted.length * 0.02) | 0];
  const hi = sorted[(sorted.length * 0.9) | 0];
  const out = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    if (k >= cols * rows) {
      out[k * 3 + 2] = DEPTH * 0.5; // sobrantes: sombra 0, invisibles
      continue;
    }
    const gx = k % cols;
    const gy = (k / cols) | 0;
    // El umbral descarta el fondo de estudio (blanco o gris claro).
    const raw = 1 - (lum[k] - lo) / (hi - lo + 1e-5);
    const dark = Math.min(1, Math.max(0, (raw - 0.14) / 0.86));
    out[k * 3] = ((gx + (gy % 2 ? 0.75 : 0.25)) / cols - 0.5) * aspect;
    out[k * 3 + 1] = 0.5 - (gy + 0.5) / rows;
    out[k * 3 + 2] = (0.5 - dark) * DEPTH;
  }
  return { points: out, rows, tint: new Float32Array(n) };
}

// Mapa del Perú: partículas repartidas dentro del contorno y teñidas en tres
// franjas verticales (rojo, blanco, rojo); una parte dibuja el borde en tinta.
function mapTargets(n) {
  const H = 520;
  const W = Math.ceil(H * peru.aspect);
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  for (const ring of peru.rings) {
    ctx.beginPath();
    ring.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo']((x / peru.aspect + 0.5) * W, (0.5 - y) * H));
    ctx.closePath();
    ctx.fill();
  }
  const mask = ctx.getImageData(0, 0, W, H).data;
  const points = new Float32Array(n * 3);
  const tint = new Float32Array(n);
  const z = (0.5 - 0.44) * DEPTH;

  // Borde: puntos repartidos a lo largo del contorno.
  const ring = peru.rings[0];
  const seg = ring.map((p, i) => Math.hypot(ring[(i + 1) % ring.length][0] - p[0], ring[(i + 1) % ring.length][1] - p[1]));
  const total = seg.reduce((a, b) => a + b, 0);
  const nEdge = Math.floor(n * 0.07);
  let k = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const count = Math.round((seg[i] / total) * nEdge);
    for (let j = 0; j < count && k < nEdge; j++, k++) {
      const t = Math.random();
      points[k * 3] = a[0] + (b[0] - a[0]) * t + (Math.random() - 0.5) * 0.004;
      points[k * 3 + 1] = a[1] + (b[1] - a[1]) * t + (Math.random() - 0.5) * 0.004;
      points[k * 3 + 2] = (0.5 - 0.3) * DEPTH;
    }
  }
  // Relleno.
  while (k < n) {
    const u = Math.random();
    const v = Math.random();
    if (mask[(((v * H) | 0) * W + ((u * W) | 0)) * 4 + 3] < 128) continue;
    points[k * 3] = (u - 0.5) * peru.aspect;
    points[k * 3 + 1] = 0.5 - v;
    tint[k] = u < 1 / 3 || u > 2 / 3 ? 1 : 2;
    // El rojo lleva puntos más gruesos para que la franja quede saturada.
    points[k * 3 + 2] = tint[k] === 1 ? (0.5 - 0.8) * DEPTH : z;
    k++;
  }
  return { points, tint };
}

function flowTargets(n) {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    out[i * 3] = Math.random() - 0.5;
    out[i * 3 + 1] = Math.random() - 0.5;
    out[i * 3 + 2] = (Math.random() - 0.5) * 1.2;
  }
  return out;
}

export function initScene(canvas, sections) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  const css = getComputedStyle(document.documentElement);
  const fog = new THREE.Color(css.getPropertyValue('--neblina').trim());
  const ink = new THREE.Color(css.getPropertyValue('--tinta').trim());
  renderer.setClearColor(fog, 1);

  const small = () => innerWidth < 860;
  const N = small() ? 36000 : 80000;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  camera.position.z = 6;

  // Fondo: rejilla de vectores.
  const fieldU = {
    uRes: { value: new THREE.Vector2() },
    uMousePx: { value: new THREE.Vector2(-9999, -9999) },
    uTime: { value: 0 },
    uDpr: { value: 1 },
    uVel: { value: 0 },
    uScroll: { value: 0 },
    uFog: { value: fog },
    uInk: { value: ink },
    uAccent: { value: new THREE.Color(ink) },
  };
  const field = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: fieldU,
      vertexShader: 'void main(){gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader: FIELD_FRAG,
      depthTest: false,
      depthWrite: false,
    }),
  );
  field.frustumCulled = false;
  field.renderOrder = -1;
  scene.add(field);

  // Partículas.
  const flow = flowTargets(N);
  const noTint = new Float32Array(N);
  const targets = sections.map((s) => (s.type === 'map' ? mapTargets(N) : { points: flow, tint: noTint, loose: true }));
  const geo = new THREE.BufferGeometry();
  const rnd = new Float32Array(N * 4);
  for (let i = 0; i < rnd.length; i++) rnd[i] = Math.random();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  geo.setAttribute('aA', new THREE.BufferAttribute(new Float32Array(flow), 3));
  geo.setAttribute('aB', new THREE.BufferAttribute(new Float32Array(flow), 3));
  geo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 4));
  geo.setAttribute('aTintA', new THREE.BufferAttribute(new Float32Array(N), 1));
  geo.setAttribute('aTintB', new THREE.BufferAttribute(new Float32Array(N), 1));
  const U = {
    uTime: { value: 0 },
    uMix: { value: 0 },
    uLooseA: { value: 1 },
    uLooseB: { value: 1 },
    uSize: { value: 10 },
    uDot: { value: 2 },
    uVel: { value: 0 },
    uTwist: { value: 1 },
    uScaleA: { value: new THREE.Vector2(1, 1) },
    uScaleB: { value: new THREE.Vector2(1, 1) },
    uOffA: { value: new THREE.Vector2() },
    uOffB: { value: new THREE.Vector2() },
    uMouse: { value: new THREE.Vector2(99, 99) },
    uTilt: { value: new THREE.Vector2() },
    uField: { value: new THREE.Vector2(1, 1) },
    uInk: { value: ink },
    uAccent: { value: new THREE.Color(ink) },
  };
  const points = new THREE.Points(
    geo,
    new THREE.ShaderMaterial({ uniforms: U, vertexShader: POINTS_VERT, fragmentShader: POINTS_FRAG, transparent: true, depthTest: false, depthWrite: false }),
  );
  points.frustumCulled = false;
  scene.add(points);

  const accents = sections.map((s) => new THREE.Color(s.accent || ink));
  let current = -1;
  let rows = 300;
  let visW = 1;
  let visH = 1;
  let dpr = 1;

  function setPair(i) {
    current = i;
    const j = Math.min(i + 1, sections.length - 1);
    geo.attributes.aA.array.set(targets[i].points);
    geo.attributes.aB.array.set(targets[j].points);
    geo.attributes.aTintA.array.set(targets[i].tint);
    geo.attributes.aTintB.array.set(targets[j].tint);
    geo.attributes.aTintA.needsUpdate = true;
    geo.attributes.aTintB.needsUpdate = true;
    geo.attributes.aA.needsUpdate = true;
    geo.attributes.aB.needsUpdate = true;
    layout(i, U.uLooseA, U.uScaleA.value, U.uOffA.value);
    layout(j, U.uLooseB, U.uScaleB.value, U.uOffB.value);
  }

  function layout(i, loose, scale, off) {
    if (!targets[i].loose) {
      loose.value = 0;
      const s = small() ? visH * 0.5 : Math.min(visH * 0.74, visW * 0.5);
      scale.set(s, s);
      U.uDot.value = ((s / visH) * innerHeight * dpr) / rows;
      if (small()) off.set(0, visH * 0.17);
      else off.set(visW * 0.23, 0);
    } else {
      loose.value = 1;
      scale.set(visW * 1.3, visH * 1.15);
      off.set(0, 0);
    }
  }

  sections.forEach((s, i) => {
    if (s.type !== 'portrait') return;
    samplePortrait(s.src, N).then(
      (t) => {
        targets[i] = t;
        rows = t.rows;
        if (current === i || current === i - 1) setPair(current);
      },
      () => {},
    );
  });

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    visH = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    visW = visH * camera.aspect;
    U.uField.value.set(visW * 1.3, visH);
    U.uSize.value = (small() ? 9.5 : 11) * dpr * (innerHeight / 900);
    fieldU.uRes.value.set(innerWidth * dpr, innerHeight * dpr);
    fieldU.uDpr.value = dpr;
    if (current >= 0) setPair(current);
  }
  addEventListener('resize', resize);
  resize();

  // Cursor.
  const mouse = { x: 99, y: 99, tx: 99, ty: 99, px: -9999, py: -9999, nx: 0, ny: 0 };
  addEventListener('pointermove', (e) => {
    mouse.nx = (e.clientX / innerWidth) * 2 - 1;
    mouse.ny = -((e.clientY / innerHeight) * 2 - 1);
    mouse.tx = (mouse.nx * visW) / 2;
    mouse.ty = (mouse.ny * visH) / 2;
    mouse.px = e.clientX;
    mouse.py = innerHeight - e.clientY;
    if (mouse.x === 99) {
      mouse.x = mouse.tx;
      mouse.y = mouse.ty;
    }
  });

  // Estado de scroll: sección bajo el centro de la pantalla y avance hacia la siguiente.
  let lastY = scrollY;
  let vel = 0;
  const accent = new THREE.Color(ink);
  const state = { index: 0, mix: 0 };

  function readScroll() {
    const mid = scrollY + innerHeight * 0.5;
    let idx = 0;
    for (let i = 0; i < sections.length; i++) {
      if (sections[i].el.offsetTop <= mid) idx = i;
    }
    const el = sections[idx].el;
    const bottom = el.offsetTop + el.offsetHeight;
    const span = innerHeight * 0.7;
    let m = idx === sections.length - 1 ? 0 : THREE.MathUtils.clamp((mid - (bottom - span)) / span, 0, 1);
    state.index = idx;
    state.mix = m;
  }

  const timer = new THREE.Timer();
  let listeners = [];
  function frame() {
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.05);
    readScroll();
    if (state.index !== current) setPair(state.index);

    const dy = scrollY - lastY;
    lastY = scrollY;
    // Velocidad de scroll acotada y amortiguada en tiempo real (no por fotograma).
    const target = THREE.MathUtils.clamp((dy / innerHeight) * 14, -2, 2);
    vel += (target - vel) * (1 - Math.exp(-dt * 9));

    if (!reduce) {
      U.uTime.value += dt;
      fieldU.uTime.value += dt;
    }
    U.uMix.value = state.mix;
    U.uVel.value = reduce ? 0 : vel;
    fieldU.uVel.value = reduce ? 0 : vel;
    fieldU.uScroll.value = scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight);

    mouse.x += (mouse.tx - mouse.x) * 0.12;
    mouse.y += (mouse.ty - mouse.y) * 0.12;
    U.uMouse.value.set(mouse.x, mouse.y);
    fieldU.uMousePx.value.set(mouse.px, mouse.py);
    U.uTilt.value.x += (mouse.nx * 0.2 - U.uTilt.value.x) * 0.06;
    U.uTilt.value.y += (-mouse.ny * 0.12 - U.uTilt.value.y) * 0.06;

    const j = Math.min(state.index + 1, sections.length - 1);
    accent.copy(accents[state.index]).lerp(accents[j], state.mix);
    U.uAccent.value.copy(accent);
    fieldU.uAccent.value.copy(accent);

    renderer.render(scene, camera);
    for (const fn of listeners) fn(state);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return { onFrame: (fn) => listeners.push(fn) };
}
