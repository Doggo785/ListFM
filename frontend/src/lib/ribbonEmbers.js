/** Single ribbon pixels that leave the Dashboard's ribbon and climb, drawn on the same canvas and the same grid. */

const MAX = 320;
const FIELDS = 5; // x, y in cells, then r, g, b.
const CALM_LIFE = [1.6, 3.6];
const CALM_RISE = [26, 84];
const BURST_LIFE = [0.45, 1.25];
const BURST_RISE = [70, 250];
const BURST_DRIFT = 90;
const BURST_GRAVITY = 110;
const SWAY = 16;
const SPAWN_PER_FRAME = 2;

const VERTEX = `#version 300 es
in vec2 aCell;in vec3 aTone;uniform vec2 uRes;out vec3 vTone;
void main(){gl_Position=vec4((floor(aCell)+.5)/uRes*2.-1.,0.,1.);gl_PointSize=1.;vTone=aTone;}`;
const FRAGMENT = `#version 300 es
precision mediump float;in vec3 vTone;out vec4 o;void main(){o=vec4(vTone,1.);}`;

const between = ([low, high]) => low + Math.random() * (high - low);

export const inRect = (x, y, r) => x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height;

/** Inside a convex shape whose corners go clockwise on screen. */
export const inQuad = (x, y, corners) =>
  corners.every((corner, i) => {
    const next = corners[(i + 1) % corners.length];
    return (next.x - corner.x) * (y - corner.y) - (next.y - corner.y) * (x - corner.x) >= 0;
  });

const onSolid = (x, y, shapes) => shapes.some((shape) => (shape.corners ? inQuad(x, y, shape.corners) : inRect(x, y, shape)));

/** Moves the embers, drops the dead and those reaching content, and tops the calm ones up to `wanted`. A solid is a rect, or has `corners`. */
export function stepEmbers(embers, dt, wanted, spawn, solids, time) {
  const alive = [];
  let calm = 0;
  for (const ember of embers) {
    ember.age += dt;
    if (ember.age >= ember.life) continue;
    ember.vy += ember.gravity * dt;
    ember.x += (ember.vx + Math.sin(time * ember.rate + ember.phase) * SWAY) * dt;
    ember.y += ember.vy * dt;
    if (onSolid(ember.x, ember.y, solids)) continue;
    alive.push(ember);
    if (!ember.gravity) calm += 1;
  }
  for (let i = 0; i < SPAWN_PER_FRAME && calm < wanted && alive.length < MAX; i += 1) {
    const point = spawn();
    if (!point) break;
    if (onSolid(point.x, point.y, solids)) continue; // Born on a cover it would blink there for one frame.
    alive.push(newEmber(point.x, point.y, CALM_LIFE, -between(CALM_RISE), 0, 0));
    calm += 1;
  }
  return alive;
}

function newEmber(x, y, life, vy, vx, gravity) {
  return { x, y, vx, vy, gravity, age: 0, life: between(life), rate: 1 + Math.random() * 2, phase: Math.random() * 6.3 };
}

/** A hot spray, as when the forge catches. */
export function burstEmber(x, y) {
  return newEmber(x, y, BURST_LIFE, -between(BURST_RISE), (Math.random() - 0.5) * 2 * BURST_DRIFT, BURST_GRAVITY);
}

/** Hot when born, then down the ramp. Each ember skips frames toward its end, so it blinks out rather than vanishing. */
export function emberTone(ember, tones) {
  const share = ember.age / ember.life;
  if (share > 0.75 && Math.random() < (share - 0.75) * 3) return null;
  return tones[Math.min(tones.length - 1, Math.floor(share * tones.length))];
}

/** Compiles and links a shader pair. Throws what the driver says when a shader does not compile. */
export function linkProgram(gl, vertex, fragment) {
  const shader = (type, source) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const program = gl.createProgram();
  gl.attachShader(program, shader(gl.VERTEX_SHADER, vertex));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  return program;
}

export function createEmberLayer(gl, tones) {
  const program = linkProgram(gl, VERTEX, FRAGMENT);
  const res = gl.getUniformLocation(program, "uRes");
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const stride = FIELDS * 4;
  const cell = gl.getAttribLocation(program, "aCell");
  gl.enableVertexAttribArray(cell);
  gl.vertexAttribPointer(cell, 2, gl.FLOAT, false, stride, 0);
  const tone = gl.getAttribLocation(program, "aTone");
  gl.enableVertexAttribArray(tone);
  gl.vertexAttribPointer(tone, 3, gl.FLOAT, false, stride, 8);
  const data = new Float32Array(MAX * FIELDS);

  return {
    draw(embers, cellSize, viewportHeight, width, height) {
      let count = 0;
      for (const ember of embers) {
        if (count === MAX) break; // A burst on top of a full sky: the rest wait for the next frame.
        const rgb = emberTone(ember, tones);
        if (!rgb) continue;
        data.set([ember.x / cellSize, (viewportHeight - ember.y) / cellSize, ...rgb], count * FIELDS);
        count += 1;
      }
      if (!count) return;
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      gl.uniform2f(res, width, height);
      gl.drawArrays(gl.POINTS, 0, count);
    },
  };
}
