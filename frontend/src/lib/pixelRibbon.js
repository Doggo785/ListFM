/** The ember ribbon behind every page: one WebGL2 canvas that morphs instead of remounting. */

export const CELL = 4; // CSS pixels per ribbon pixel: rendering one fragment per cell keeps it cheap.
const MAX_QUIET = 12;
const COLUMNS = 12;
const OPENING_SECONDS = 0.42;
const LOADER_PULL = 0.9;

// shape: half-width along the ribbon. angle and offset: where it lives. heat: how hot its core burns.
const SCENES = {
  dashboard: { shape: [0.12, 0.17, 0.14, 0.2, 0.24, 0.18, 0.14, 0.19, 0.26, 0.21, 0.15, 0.12], angle: -0.38, offset: -0.2, heat: 0 },
  creator: { shape: [0.16, 0.16, 0.16, 0.16, 0.13, 0.13, 0.13, 0.13, 0.1, 0.1, 0.1, 0.1], angle: 0.1, offset: -0.33, heat: 1 },
  automations: { shape: [0.09, 0.09, 0.1, 0.1, 0.11, 0.12, 0.12, 0.13, 0.15, 0.16, 0.18, 0.2], angle: -0.22, offset: -0.2, heat: 2 },
  detail: { shape: [0.2, 0.19, 0.17, 0.15, 0.14, 0.13, 0.12, 0.11, 0.1, 0.1, 0.09, 0.09], angle: 1.2, offset: 0.42, heat: 2 },
  other: { shape: [0.12, 0.14, 0.16, 0.14, 0.12, 0.14, 0.16, 0.14, 0.12, 0.14, 0.16, 0.14], angle: -0.3, offset: -0.28, heat: 0 },
};

export function sceneFor(pathname) {
  if (pathname.startsWith("/dashboard")) return SCENES.dashboard;
  if (pathname === "/playlists/new") return SCENES.creator;
  if (pathname === "/playlists") return SCENES.automations;
  if (pathname.startsWith("/playlists/")) return SCENES.detail;
  return SCENES.other;
}

export function hexToRgb(hex) {
  const h = hex.trim().replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

/** Four tones: the edge stays dark on every page, only the core heats up. */
export function rampFor(heat, palette) {
  return [palette[0], palette[1], palette[2 + heat], palette[3 + heat]].flatMap(hexToRgb);
}

/** Content rectangles, in cells, flipped to WebGL's bottom-left origin. Off-screen ones are dropped. */
export function quietRects(rects, viewportHeight) {
  const data = new Float32Array(MAX_QUIET * 4);
  let count = 0;
  for (const r of rects) {
    if (count === MAX_QUIET) break;
    if (r.width === 0 || r.bottom < -130 || r.top > viewportHeight + 130) continue;
    data.set(
      [
        (r.left + r.width / 2) / CELL,
        (viewportHeight - r.top - r.height / 2) / CELL,
        r.width / 2 / CELL,
        r.height / 2 / CELL,
      ],
      count * 4,
    );
    count += 1;
  }
  return { data, count };
}

/** A quiet area part-way through opening: k runs from 0 at `from` to 1 at `to`. */
export function openingRect(from, to, k) {
  const mix = (a, b) => a + (b - a) * k;
  const left = mix(from.left, to.left);
  const top = mix(from.top, to.top);
  const width = mix(from.width, to.width);
  const height = mix(from.height, to.height);
  return { left, top, width, height, bottom: top + height };
}

const VERTEX = `#version 300 es
in vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uRes;uniform float uT,uWander,uAngle,uOff,uPull;uniform vec2 uPoint;
uniform float uCols[${COLUMNS}];uniform vec3 uRamp[4];uniform vec4 uQuiet[${MAX_QUIET}];uniform int uN;
out vec4 o;
float b2(vec2 a){a=floor(a);return fract(a.x/2.+a.y*a.y*.75);}
float b4(vec2 a){return b2(.5*a)*.25+b2(a);}
float b8(vec2 a){return b4(.5*a)*.25+b2(a);}
void main(){
  vec2 cell=floor(gl_FragCoord.xy);
  vec2 uv=(cell+.5)/uRes;float asp=uRes.x/uRes.y;
  float th=uAngle+.22*sin(uWander*.09);
  float cs=cos(th),sn=sin(th);mat2 R=mat2(cs,-sn,sn,cs);
  vec2 q=R*vec2((uv.x-.5)*asp,uv.y-.5);
  vec2 g=R*vec2((uPoint.x-.5)*asp,uPoint.y-.5);
  float s=clamp(q.x/asp+.5,0.,1.);
  float xs=s*${(COLUMNS - 1).toFixed(1)};int i=int(clamp(floor(xs),0.,${(COLUMNS - 2).toFixed(1)}));
  float hw=mix(uCols[i],uCols[i+1],smoothstep(0.,1.,xs-float(i)));
  hw+=.012*(sin(s*9.+uT*.5)*.5+sin(s*17.-uT*.35+1.3)*.25);
  float c=uOff+.2*sin(uWander*.13)+.09*sin(q.x*3.+uWander*.21)+.045*sin(q.x*7.-uWander*.31);
  c=mix(c,g.y,uPull*exp(-pow((q.x-g.x)/.42,2.)));
  float v=clamp((hw-abs(q.y-c))/.15,0.,1.);
  float m=1.;
  for(int k=0;k<uN;k++){vec4 r=uQuiet[k];vec2 d=abs(cell+.5-r.xy)-r.zw;float e=length(max(d,0.))+min(max(d.x,d.y),0.);m=min(m,smoothstep(0.,${(130 / CELL).toFixed(1)},e));}
  v*=m;
  float idx=floor(v*4.+b8(cell));
  if(idx<1.){o=vec4(0.);return;}
  o=vec4(uRamp[int(min(idx,4.))-1],1.);
}`;

const UNIFORMS = ["uRes", "uT", "uWander", "uAngle", "uOff", "uPull", "uPoint", "uCols", "uRamp", "uQuiet", "uN"];

function compile(gl) {
  const shader = (type, source) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const program = gl.createProgram();
  gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "p");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.clearColor(0, 0, 0, 0);
  return Object.fromEntries(UNIFORMS.map((n) => [n, gl.getUniformLocation(program, n)]));
}

const INERT = { setScene() {}, destroy() {} };

/**
 * Starts the ribbon on a canvas and returns its controls. Without WebGL2 the page simply has no
 * ribbon: nothing depends on it.
 * shortcut: a lost GL context stays blank until the next page load, rebuild it if that shows up.
 */
export function createRibbon(canvas, { palette, reducedMotion = false }) {
  const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false });
  if (!gl) return INERT;
  let uniforms;
  try {
    uniforms = compile(gl);
  } catch (error) {
    console.error("Ribbon shader failed to compile", error);
    return INERT;
  }

  const target = { cols: Array(COLUMNS).fill(0.08), ramp: rampFor(0, palette), angle: 0, off: -0.3, px: 0.5, py: 0.5, pull: 0 };
  const now = { ...target, cols: [...target.cols], ramp: [...target.ramp] };
  let started = false;

  const resize = () => {
    canvas.width = Math.ceil(window.innerWidth / CELL);
    canvas.height = Math.ceil(window.innerHeight / CELL);
    // Sized to whole cells so every ribbon pixel lands exactly on the grid.
    canvas.style.width = `${canvas.width * CELL}px`;
    canvas.style.height = `${canvas.height * CELL}px`;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uniforms.uRes, canvas.width, canvas.height);
  };
  resize();

  const aim = (x, y, pull) => {
    target.px = x / window.innerWidth;
    target.py = 1 - y / window.innerHeight;
    target.pull = pull;
  };
  const onPointer = (e) => aim(e.clientX, e.clientY, e.target?.closest?.("a,button,[data-guide]") ? 0.42 : 0.16);
  const onFocus = (e) => {
    const r = e.target?.closest?.("a,button,[data-guide]")?.getBoundingClientRect();
    if (r) aim(r.left + r.width / 2, r.top + r.height / 2, 0.42);
  };
  window.addEventListener("resize", resize);
  if (!reducedMotion) {
    document.addEventListener("pointermove", onPointer);
    document.addEventListener("focusin", onFocus);
  }

  let frameId = 0;
  let last = performance.now();
  let t = 0;
  let wander = 0;
  let clock = 0;
  let drawn = false;
  let loaderRect;
  const opening = new WeakMap();
  const frame = (time) => {
    // A frame's timestamp can precede the last one: a negative step would make the easing diverge.
    const dt = Math.max(0, Math.min((time - last) / 1000, 0.05));
    last = time;
    if (!reducedMotion) {
      t += dt;
      wander += dt;
    }
    const ease = (rate) => (reducedMotion ? 1 : 1 - Math.exp(-dt * rate));
    const shape = ease(4.5);
    const glow = ease(3);
    now.cols = now.cols.map((v, i) => v + (target.cols[i] - v) * shape);
    now.ramp = now.ramp.map((v, i) => v + (target.ramp[i] - v) * glow);
    now.angle += (target.angle - now.angle) * shape;
    now.off += (target.off - now.off) * shape;
    now.px += (target.px - now.px) * glow;
    now.py += (target.py - now.py) * glow;
    now.pull += (target.pull - now.pull) * glow;

    clock += dt;
    const loader = document.querySelector("[data-loader]")?.getBoundingClientRect();
    if (loader) aim(loader.left + loader.width / 2, loader.top + loader.height / 2, reducedMotion ? 0 : LOADER_PULL);
    else if (loaderRect) target.pull = 0;

    const rects = [...document.querySelectorAll("[data-quiet]")].map((el) => {
      const rect = el.getBoundingClientRect();
      // A new quiet area opens out of the loader it replaces, so the wave parts instead of jumping.
      if (!opening.has(el)) opening.set(el, { born: clock, from: loaderRect ?? { left: rect.left + rect.width / 2, top: rect.top + rect.height / 2, width: 0, height: 0 } });
      const { born, from } = opening.get(el);
      const k = reducedMotion || !drawn ? 1 : Math.min((clock - born) / OPENING_SECONDS, 1);
      return k === 1 ? rect : openingRect(from, rect, 1 - (1 - k) ** 3);
    });
    loaderRect = loader;
    drawn = true;
    const quiet = quietRects(rects, window.innerHeight);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(uniforms.uT, t);
    gl.uniform1f(uniforms.uWander, wander);
    gl.uniform1f(uniforms.uAngle, now.angle);
    gl.uniform1f(uniforms.uOff, now.off);
    gl.uniform1f(uniforms.uPull, now.pull);
    gl.uniform2f(uniforms.uPoint, now.px, now.py);
    gl.uniform1fv(uniforms.uCols, now.cols);
    gl.uniform3fv(uniforms.uRamp, now.ramp);
    gl.uniform4fv(uniforms.uQuiet, quiet.data);
    gl.uniform1i(uniforms.uN, quiet.count);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    frameId = window.requestAnimationFrame(frame);
  };
  frameId = window.requestAnimationFrame(frame);

  return {
    setScene(scene) {
      target.cols = scene.shape;
      target.ramp = rampFor(scene.heat, palette);
      target.angle = scene.angle;
      target.off = scene.offset;
      // The first scene appears in place; only later ones travel.
      if (!started) {
        Object.assign(now, { cols: [...target.cols], ramp: [...target.ramp], angle: target.angle, off: target.off });
        started = true;
      }
    },
    destroy() {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      document.removeEventListener("pointermove", onPointer);
      document.removeEventListener("focusin", onFocus);
    },
  };
}
