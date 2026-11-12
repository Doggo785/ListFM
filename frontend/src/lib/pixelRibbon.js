/** The ember ribbon behind every page: one WebGL2 canvas that morphs instead of remounting. */

import { burstEmber, createEmberLayer, linkProgram, stepEmbers } from "@/lib/ribbonEmbers";
import { frontAt } from "@/lib/backgroundWork";
import { drumAngle, monthAt, smoothstep } from "@/lib/ribbonTrack";

export const CELL = 4; // CSS pixels per ribbon pixel: rendering one fragment per cell keeps it cheap.
const MAX_QUIET = 12;
const COLUMNS = 12;
const OPENING_SECONDS = 0.42;
const LOADER_PULL = 0.9;
const SOFT_EDGE = 0.15;
const CHAIN_FILL = 0.85; // Of the band: the wavy edge stays inside it.
const CHAIN_FLOOR = 0.12;
const HOTTER = 2; // Steps up the ramp while a page holds data-ribbon-hot: warmer, never a siren.
const MAX_HEAT = 5;
const TRACK_HEAT = 3; // The Dashboard's wave: listens burning, hotter than any other page at rest.
const TRACK_CURVE = 0.012; // Of the viewport's height: how far the wave's centre line bends.
const TRACK_RISE_FROM = 0.6; // Of the width: left of it the wave keeps to its line, under the name.
const TRACK_RISE = 0.45; // Of the room above the line: how far it then sweeps up, like the ribbon of the other pages.
const TRACK_EDGE = 0.92; // Of its half-width: only the tallest days reach the core's colour.
const TRACK_QUIET_FADE = 44; // CSS pixels. It must fit between a poster's rows; other pages have room for the wide one.
const QUIET_FADE = 130;
const MAX_HOLES = 4;
const WORK_GLOW_MS = 2500; // A finished task's front stays this long, for its last flare, then the ribbon lets it go.
const FRONT_EASE = 2.5; // Per second: how fast the drawn front catches up with where it should be.
const IMPORT_TIP = 0.6; // Months: how long the wave's tip tapers while an import brings it in.
// CSS pixels: sparks leave from the flame just behind its head, on the side already burnt (track.trail), never past its tip.
const SPARK_BEHIND = 20;
const random = Math.random; // Where embers leave: noise for the eye, never a secret.

// shape: half-width along the ribbon. angle and offset: where it lives. heat: how hot its core burns.
const PHONE_WIDTH = 860; // Where the auth screens stack, and the free space moves under the form.

const SCENES = {
  // Near where its wave will lie, so the wave grows in place when the listens arrive.
  dashboard: { shape: [0.11, 0.1, 0.09, 0.11, 0.13, 0.1, 0.09, 0.11, 0.14, 0.12, 0.1, 0.09], angle: -0.04, offset: 0.08, heat: 0 },
  creator: { shape: [0.16, 0.16, 0.16, 0.16, 0.13, 0.13, 0.13, 0.13, 0.1, 0.1, 0.1, 0.1], angle: 0.1, offset: -0.33, heat: 1 },
  automations: { shape: [0.09, 0.09, 0.1, 0.1, 0.11, 0.12, 0.12, 0.13, 0.15, 0.16, 0.18, 0.2], angle: -0.22, offset: -0.2, heat: 2 },
  detail: { shape: [0.2, 0.19, 0.17, 0.15, 0.14, 0.13, 0.12, 0.11, 0.1, 0.1, 0.09, 0.09], angle: 1.2, offset: 0.42, heat: 2 },
  playlists: { shape: [0.1, 0.11, 0.12, 0.14, 0.16, 0.18, 0.18, 0.16, 0.14, 0.12, 0.11, 0.1], angle: -0.06, offset: -0.3, heat: 2 },
  playlist: { shape: [0.08, 0.09, 0.1, 0.12, 0.14, 0.17, 0.2, 0.22, 0.2, 0.17, 0.14, 0.12], angle: 1.45, offset: 0.46, heat: 3 },
  // Under the name, where the Dashboard's wave will lie, so logging in barely moves it.
  auth: { shape: [0.07, 0.08, 0.09, 0.1, 0.11, 0.12, 0.13, 0.14, 0.15, 0.14, 0.13, 0.12], angle: 0.05, offset: -0.24, phoneOffset: -0.36, heat: 2 },
  // Silent: the landing page draws its own thread. Lying where that thread lies, so leaving the page morphs from there.
  landing: { shape: [0.04, 0.04, 0.04, 0.05, 0.05, 0.06, 0.07, 0.09, 0.12, 0.14, 0.15, 0.15], angle: -0.14, offset: 0.1, heat: 3, silent: true },
  settings: { shape: [0.08, 0.09, 0.1, 0.11, 0.12, 0.12, 0.12, 0.13, 0.14, 0.15, 0.16, 0.18], angle: 1.45, offset: -0.42, heat: 0 },
  other: { shape: [0.12, 0.14, 0.16, 0.14, 0.12, 0.14, 0.16, 0.14, 0.12, 0.14, 0.16, 0.14], angle: -0.3, offset: -0.28, heat: 0 },
};

/**
 * What a page asks of the ribbon, read at every frame. Only the Dashboard sets it:
 * track is the wave of listens (see drawTrack below), embers how many pixels climb from it.
 * work is the background task BackgroundTasks reports (see lib/backgroundWork.js); the ribbon adds the front
 * it draws, glided between two reads: shown (share done) and shownUntil (the date a history has reached).
 */
export const ribbonStage = { work: null, track: null, embers: 0, beforeDraw: null, alive: false, silent: false, burst() {} };

export function sceneFor(pathname) {
  if (pathname === "/") return SCENES.landing;
  if (pathname.startsWith("/dashboard")) return SCENES.dashboard;
  if (pathname === "/automations/new" || pathname.endsWith("/edit")) return SCENES.creator;
  if (pathname === "/automations") return SCENES.automations;
  if (pathname.startsWith("/automations/")) return SCENES.detail;
  if (pathname === "/playlists") return SCENES.playlists;
  if (pathname.startsWith("/playlists/")) return SCENES.playlist;
  if (["/login", "/register", "/link-lastfm", "/confirm-email", "/forgot-password", "/reset-password"].includes(pathname) || pathname.startsWith("/auth/")) return SCENES.auth;
  if (pathname === "/settings") return SCENES.settings;
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

/**
 * The ribbon's half-widths for an automation's chain, from 0 to 1, one equal stretch per stage.
 * Log scale, so 50 out of 8 000 still reads; nothing left means no ribbon, an empty run is visible.
 */
export function chainShape(counts) {
  const first = counts[0];
  if (!first) return Array(COLUMNS).fill(0.4 * CHAIN_FILL);
  const stage = (n) => (n > 0 ? CHAIN_FLOOR + (1 - CHAIN_FLOOR) * (Math.log1p(n) / Math.log1p(first)) : 0);
  return Array.from({ length: COLUMNS }, (_, i) => stage(counts[Math.floor((i * counts.length) / COLUMNS)]) * CHAIN_FILL);
}

const VERTEX = `#version 300 es
in vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uRes;uniform float uT,uWander,uAngle,uOff,uPull,uCalm,uEdge,uClip;uniform vec2 uPoint,uBand;
uniform float uCols[${COLUMNS}];uniform vec3 uRamp[4];uniform vec4 uQuiet[${MAX_QUIET}];uniform int uN;
uniform vec3 uHot[2];uniform vec4 uMap,uWave,uDrum,uDrumB;uniform sampler2D uSeries;
uniform vec3 uFront,uWork;
uniform vec4 uHoles[${MAX_HOLES}],uCut,uBurn;uniform vec3 uEdges[${MAX_HOLES * 4}],uInk;uniform float uFade;
out vec4 o;
float b2(vec2 a){a=floor(a);return fract(a.x/2.+a.y*a.y*.75);}
float b4(vec2 a){return b2(.5*a)*.25+b2(a);}
float b8(vec2 a){return b4(.5*a)*.25+b2(a);}
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y);}
float angleAt(float x){float R=uDrum.z,P=uDrum.w;return 2.*atan(P*x/(P*R+sqrt(max(0.,P*P*R*R-(P+2.*R)*P*x*x))));}
void main(){
  vec2 cell=floor(gl_FragCoord.xy);
  if(cell.y>uClip){o=vec4(0.);return;}
  vec2 uv=(cell+.5)/uRes;float asp=uRes.x/uRes.y;
  float loose=1.-uCalm;float th=uAngle+loose*.22*sin(uWander*.09);
  float cs=cos(th),sn=sin(th);mat2 R=mat2(cs,-sn,sn,cs);
  vec2 q=R*vec2((uv.x-.5)*asp,uv.y-.5);
  vec2 g=R*vec2((uPoint.x-.5)*asp,uPoint.y-.5);
  float s=clamp(q.x/asp+.5,0.,1.);
  float xs=s*${(COLUMNS - 1).toFixed(1)};int i=int(clamp(floor(xs),0.,${(COLUMNS - 2).toFixed(1)}));
  float hw=mix(uCols[i],uCols[i+1],smoothstep(0.,1.,xs-float(i)));
  hw+=loose*.012*(sin(s*9.+uT*.5)*.5+sin(s*17.-uT*.35+1.3)*.25);
  float c=uOff+loose*(.2*sin(uWander*.13)+.09*sin(q.x*3.+uWander*.21)+.045*sin(q.x*7.-uWander*.31));
  c=mix(c,g.y,uPull*exp(-pow((q.x-g.x)/.42,2.)));
  float heat=0.,tongue=0.;
  float track=uDrumB.w;
  if(track>.001){
    float px=(cell.x+.5)*${CELL.toFixed(1)};
    float th=angleAt(px-uDrum.y);
    float mo=mix((px-uMap.x)/uMap.y,uDrumB.x+.5+th/uDrumB.y,uDrum.x);
    // Held at the last listen beyond it: the days still to come must not read as a wall of silence.
    float amount=texture(uSeries,vec2(min(mo,uMap.z-.02)/uMap.w,.5)).r;
    // Past the year's ends the drum's fire keeps burning, low, so one side of the deck is never bare.
    float beyond=smoothstep(uMap.z-.2,uMap.z+.5,mo)+smoothstep(.2,-.5,mo);
    amount=max(amount,.5*uDrum.x*min(beyond,1.));
    float past=uDrum.x*1.8;
    // A first import reads newest first: the year's wave starts where the reading has reached, and its tip
    // thins out like a tongue instead of stopping on a wall.
    float from=uWork.x*max((uWork.y-uMap.x)/uMap.y,0.);
    float ends=smoothstep(from-past,from+.3+${IMPORT_TIP.toFixed(2)}*min(from,1.)-past*.5,mo)*smoothstep(uMap.z+past,uMap.z-.14+past*.5,mo);
    // Then it reads the years before the one shown: left of the year, a low line lit from the front on.
    float early=uWork.x*step(px,uMap.x);
    amount*=1.-early;
    ends=mix(ends,clamp((px-uWork.y)/8.,0.,1.),early);
    heat=track*uWork.z*exp(-pow((px-uWave.z)/90.,2.));
    amount=max(amount,.6*heat); // The playhead stands out even over a quiet day.
    float wave=uWave.y*(.17+.83*amount)*ends*(1.+.22*heat);
    wave+=.005*(sin(s*9.+uT*.5)*.5+sin(s*17.-uT*.35+1.3)*.25)*ends;
    float scale=uDrum.w/(uDrum.w+uDrum.z*(1.-cos(th)));
    hw=mix(hw,wave,track);
    // Upward only: the name leaves room on the right, and below the line there is text.
    float sweep=smoothstep(${TRACK_RISE_FROM.toFixed(2)},1.,(px-uMap.x)/(uMap.y*uMap.z))*max(.5-uWave.x,0.)*${TRACK_RISE.toFixed(2)}*(1.+.2*sin(q.x*3.+uWander*.21)+.1*sin(q.x*7.-uWander*.31));
    sweep*=1.-uWork.x; // The arriving year's end is not the year's end: it does not rise yet.
    float curve=(1.-uDrum.x)*(${TRACK_CURVE.toFixed(3)}*sin(q.x*2.+uWander*.1)+sweep); // The slow bend of the site's ribbon.
    c=mix(c,uWave.x+curve-uDrum.x*uDrumB.z*(1.-cos(th))*scale,track);
    // A flame climbs: its tongues reach upward from the core and barely below it.
    vec2 f=vec2(cell.x*.055,cell.y*.03-uT*1.7);
    tongue=vn(f)*.65+vn(f*2.1+9.)*.35;
    hw*=1.+uWave.w*track*(q.y>c?2.6+2.6*heat:.3)*tongue*tongue;
  }
  // Background work: a warm head walks the ribbon up to the share done, what it has passed stays warmer.
  float front=exp(-pow((s-uFront.x)/.015,2.));
  hw*=1.+.35*front*uFront.y;
  float workHeat=(max(.5*step(s,uFront.x),1.2*front)+1.2*uFront.z)*uFront.y;
  // On the track the flame's heat falls off all the way to its edge, instead of a flat band with a dithered rim.
  float v=clamp((hw-abs(q.y-c))/mix(uEdge,max(uEdge,hw*.82),track),0.,1.);
  float m=1.;
  for(int k=0;k<uN;k++){vec4 r=uQuiet[k];vec2 d=abs(cell+.5-r.xy)-r.zw;float e=length(max(d,0.))+min(max(d.x,d.y),0.);m=min(m,smoothstep(0.,uFade,e+(tongue-1.)*10.*track));}
  if(cell.y>=uBand.x&&cell.y<=uBand.y)m=1.;
  // A card opens the flame, and burns from its own edges: low at its foot, in tall tongues over its top. They come nearest first.
  float calm=m,edgeFire=0.,covered=0.,burnt=0.,rim=0.,charred=0.;
  float fl=vn(vec2(cell.x*.11,cell.y*.05-uT*2.4))*.6+vn(vec2(cell.x*.27+5.,cell.y*.12-uT*3.4))*.4;
  for(int k=0;k<${MAX_HOLES};k++){
    vec4 r=uHoles[k];float strength=uCut[k];
    if(strength<=0.)continue;
    float inside=-1e4;
    for(int side=0;side<4;side++){vec3 line=uEdges[k*4+side];inside=max(inside,dot(line.xy,cell+.5)-line.z);}
    // Far along the arc it is eaten from its outer side inward, foot first, and an arriving one comes out of the fire the same way.
    float burn=uBurn[k],front=1.;
    if(burn>0.){
      vec3 outer=uEdges[k*4+(r.x*${CELL.toFixed(1)}<uDrum.y?3:1)];
      front=clamp((outer.z-dot(outer.xy,cell+.5))/(2.*r.z),0.,1.)+(fl-.5)*.7+(cell.y-r.y)/r.w*.12-(burn*1.7-.35);
      if(inside<0.&&covered<=0.){
        float lit=strength*smoothstep(0.,.1,burn);
        rim=max(rim,lit*clamp(1.-abs(front)/(front>0.?.05:.14),0.,1.));
        if(front>0.)charred=max(charred,lit*clamp(1.-front/.2,0.,1.));
      }
    }
    if(front<0.){
      if(inside<1.)burnt=max(burnt,strength); // A cell's centre can be just off a card it still overlaps.
      continue;
    }
    float e=inside+tongue*4.; // It bites the card's edge like burning paper, and never leaves a gap beside it.
    m=min(m,1.-strength*(1.-smoothstep(0.,2.,e)));
    if(e<0.)covered=max(covered,strength);
    else{
      float up=(cell.y-r.y)/r.w; // -1 at the card's foot, 1 at its top.
      float high=clamp(up,0.,1.);
      float reach=1.5+high*high*(3.+70.*fl*fl*fl);
      // A crown over the top, separate tongues up the sides, and nothing at the foot: fire rises.
      float gate=mix(smoothstep(.36,.62,fl),1.,smoothstep(.75,1.,high))*smoothstep(-.1,.3,up);
      edgeFire=max(edgeFire,strength*smoothstep(0.,.06,front)*gate*clamp(1.-e/reach,0.,1.));
    }
  }
  v=max(max(v*m,edgeFire*uWave.w*track*calm*(1.-covered)),rim*track);
  float idx=floor(v*(4.+2.*(heat+workHeat))+b8(cell));
  // What has burnt is gone: the page's own ink over it, unless a card still whole lies there.
  if(idx<1.){o=(burnt>0.&&covered<=0.)||b8(cell)<charred?vec4(uInk,1.):vec4(0.);return;}
  int tone=int(min(idx,6.))-1;
  o=vec4(tone<4?uRamp[tone]:uHot[tone-4],1.);
}`;

const UNIFORMS = ["uRes", "uT", "uWander", "uAngle", "uOff", "uPull", "uCalm", "uEdge", "uClip", "uPoint", "uBand", "uCols", "uRamp", "uQuiet", "uN", "uHot", "uMap", "uWave", "uDrum", "uDrumB", "uSeries", "uHoles", "uCut", "uBurn", "uEdges", "uInk", "uFade", "uFront", "uWork"];

function compile(gl) {
  const program = linkProgram(gl, VERTEX, FRAGMENT);
  gl.useProgram(program);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "p");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.clearColor(0, 0, 0, 0);
  return { program, vao, uniforms: Object.fromEntries(UNIFORMS.map((n) => [n, gl.getUniformLocation(program, n)])) };
}

const INERT = { setScene() {}, destroy() {} };

/** One side of a card, walked clockwise, as (outward normal, offset) in cells from the bottom-left corner. */
function cardEdge(from, to, height) {
  const ax = from.x / CELL;
  const ay = (height - from.y) / CELL;
  const dx = to.x / CELL - ax;
  const dy = (height - to.y) / CELL - ay;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  return [nx, ny, nx * ax + ny * ay];
}

/** Sets the wave's numbers for this frame. Without a track yet there is nothing to show: its weight is 0. */
function drawTrack(gl, uniforms, track, weight) {
  if (!track) {
    gl.uniform4f(uniforms.uDrumB, 0, 1, 0, 0);
    return;
  }
  const height = window.innerHeight;
  gl.uniform4f(uniforms.uMap, track.x0, track.perMonth, track.end, track.count);
  gl.uniform4f(uniforms.uWave, 0.5 - track.y / height, track.half / height, track.head, track.flame);
  gl.uniform4f(uniforms.uDrum, track.zoom, track.cx, track.layout.radius, track.layout.perspective);
  gl.uniform4f(uniforms.uDrumB, track.focus, track.layout.step, track.layout.bow / height, weight);
  const holes = new Float32Array(MAX_HOLES * 4);
  const edges = new Float32Array(MAX_HOLES * 4 * 3);
  const strengths = [0, 0, 0, 0];
  const burns = [0, 0, 0, 0];
  track.holes.slice(0, MAX_HOLES).forEach(({ rect, corners, strength, burn }, i) => {
    holes.set([(rect.left + rect.width / 2) / CELL, (height - rect.top - rect.height / 2) / CELL, rect.width / 2 / CELL, rect.height / 2 / CELL], i * 4);
    corners.forEach((corner, side) => edges.set(cardEdge(corner, corners[(side + 1) % 4], height), (i * 4 + side) * 3));
    strengths[i] = strength * weight;
    burns[i] = burn;
  });
  gl.uniform4fv(uniforms.uHoles, holes);
  gl.uniform3fv(uniforms.uEdges, edges);
  gl.uniform4f(uniforms.uCut, ...strengths);
  gl.uniform4f(uniforms.uBurn, ...burns);
}

/**
 * The wave's centre line at `x`, in CSS pixels from the top: the shader's own sums for a settled track,
 * so what leaves the flame leaves from where it is drawn.
 */
export function waveCentre(x, track, wander, width = window.innerWidth, height = window.innerHeight) {
  const qx = (x - width / 2) / height;
  const reach = (x - track.x0) / Math.max(Number.EPSILON, track.perMonth * track.end);
  const sweep = smoothstep(TRACK_RISE_FROM, 1, reach) * Math.max(track.y / height, 0) * TRACK_RISE
    * (1 + 0.2 * Math.sin(qx * 3 + wander * 0.21) + 0.1 * Math.sin(qx * 7 - wander * 0.31)) * (1 - (track.importing ?? 0));
  const curve = (1 - track.zoom) * (TRACK_CURVE * Math.sin(qx * 2 + wander * 0.1) + sweep);
  const angle = drumAngle(x - track.cx, track.layout);
  const { radius, perspective, bow } = track.layout;
  const drum = track.zoom * (bow / height) * (1 - Math.cos(angle)) * (perspective / (perspective + radius * (1 - Math.cos(angle))));
  return track.y - (curve - drum) * height;
}

/** A place on the wave where an ember can leave: above the core, along what is on screen. */
function emberOrigin(track, wander) {
  const x = random() * window.innerWidth;
  const months = monthAt(x, track);
  // Wrapped on the drum the flame carries on past both ends of the year, and so do its embers.
  if (track.zoom < 0.5 && (months < 0 || months > track.end)) return null;
  // During a first import, nothing is drawn yet left of where the reading has reached.
  if (track.importing > 0.5 && x < track.lineStart) return null;
  return { x, y: waveCentre(x, track, wander) - random() * track.half * 0.7 };
}

/**
 * Starts the ribbon on a canvas and returns its controls. Without WebGL2 the page simply has no
 * ribbon: nothing depends on it. A lost GL context (a phone switching apps) is rebuilt when the
 * browser hands it back.
 */
export function createRibbon(canvas, { palette, ink = palette[0], reducedMotion = false }) {
  const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false });
  if (!gl) return INERT;
  let main;
  let emberLayer;
  let uniforms;
  let seriesTexture;
  let shownSeries = null;
  // Every GL object, made again from nothing: a restored context keeps none of the old ones.
  const build = () => {
    main = compile(gl);
    emberLayer = createEmberLayer(gl, [8, 7, 6, 4, 2, 1].map((i) => hexToRgb(palette[i])));
    gl.useProgram(main.program);
    gl.bindVertexArray(main.vao);
    ({ uniforms } = main);
    gl.uniform3fv(uniforms.uHot, [...hexToRgb(palette[7]), ...hexToRgb(palette[8])]);
    gl.uniform3fv(uniforms.uInk, hexToRgb(ink));
    seriesTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, seriesTexture);
    gl.uniform1i(uniforms.uSeries, 0);
    shownSeries = null;
  };
  try {
    build();
  } catch (error) {
    console.error("Ribbon shader failed to compile", error);
    return INERT;
  }
  let embers = [];
  let lastTrack = null;

  const target = { cols: Array(COLUMNS).fill(0.08), ramp: rampFor(0, palette), angle: 0, off: -0.3, px: 0.5, py: 0.5, pull: 0, calm: 0, edge: SOFT_EDGE, track: 0 };
  const now = { ...target, cols: [...target.cols], ramp: [...target.ramp] };
  let started = false;
  let scene = { cols: target.cols, angle: target.angle, off: target.off };
  let sceneHeat = 0;
  let heat = 0;

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
  let frontStrength = 0;
  let sparkDebt = 0;
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
    const work = ribbonStage.work;
    if (work?.doneAt != null && time - work.doneAt > WORK_GLOW_MS) ribbonStage.work = null;
    else if (work) {
      // Read before the page draws: the Dashboard's flame puts the same front on its wave.
      const wanted = frontAt(work, time);
      const fresh = work.shownKind !== work.kind;
      // Forward only: a read behind the guess holds the front until the work catches up, it never walks back.
      // A history is read newest first: its reach only goes back in time.
      work.shown = fresh ? wanted.share : work.shown + Math.max(0, wanted.share - work.shown) * ease(FRONT_EASE);
      // The reading starts from today, at the right end: its first page glides in like the others.
      const from = work.shownReached ?? Date.now();
      work.shownReached = wanted.reached == null ? null : from - Math.max(0, from - wanted.reached) * ease(FRONT_EASE);
      // Another task starts elsewhere on the ribbon: its head lights up there, it does not leap.
      if (fresh && work.shownKind) frontStrength = 0;
      work.shownKind = work.kind;
    }
    ribbonStage.beforeDraw?.();
    const track = ribbonStage.track;
    if (track) lastTrack = track;
    if (track && track.series !== shownSeries) {
      shownSeries = track.series;
      gl.bindTexture(gl.TEXTURE_2D, seriesTexture);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, shownSeries.length, 1, 0, gl.RED, gl.UNSIGNED_BYTE, shownSeries);
      for (const filter of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, filter, gl.LINEAR);
      for (const wrap of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, wrap, gl.CLAMP_TO_EDGE);
    }
    // A chain on the page pulls the ribbon straight into its band, and its counts set the width.
    const chain = document.querySelector("[data-chain]");
    const band = chain?.getBoundingClientRect();
    if (band) {
      const half = band.height / 2 / window.innerHeight;
      const counts = chain.dataset.chain.split(",").filter(Boolean).map(Number);
      Object.assign(target, {
        cols: chainShape(counts).map((w) => w * half),
        angle: 0,
        off: 0.5 - (band.top + band.height / 2) / window.innerHeight,
        calm: 1,
        edge: half,
      });
    } else if (track) {
      Object.assign(target, scene, { angle: 0, calm: 1, edge: (track.half / window.innerHeight) * TRACK_EDGE });
    } else {
      Object.assign(target, scene, { calm: 0, edge: SOFT_EDGE });
    }
    target.track = track ? 1 : 0;
    const baseHeat = track ? TRACK_HEAT : sceneHeat;
    const wantedHeat = document.querySelector("[data-ribbon-hot]") ? Math.min(baseHeat + HOTTER, MAX_HEAT) : baseHeat;
    if (wantedHeat !== heat) {
      heat = wantedHeat;
      target.ramp = rampFor(heat, palette);
    }
    const shape = ease(4.5);
    const glow = ease(3);
    now.cols = now.cols.map((v, i) => v + (target.cols[i] - v) * shape);
    now.ramp = now.ramp.map((v, i) => v + (target.ramp[i] - v) * glow);
    now.angle += (target.angle - now.angle) * shape;
    now.off += (target.off - now.off) * shape;
    now.calm += (target.calm - now.calm) * shape;
    now.edge += (target.edge - now.edge) * shape;
    now.track += (target.track - now.track) * shape;
    now.px += (target.px - now.px) * glow;
    now.py += (target.py - now.py) * glow;
    now.pull += (target.pull - now.pull) * glow;
    if (ribbonStage.silent) {
      gl.clear(gl.COLOR_BUFFER_BIT);
      frameId = window.requestAnimationFrame(frame);
      return;
    }

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
    gl.useProgram(main.program);
    gl.bindVertexArray(main.vao);
    gl.clear(gl.COLOR_BUFFER_BIT);
    drawTrack(gl, uniforms, lastTrack, now.track);
    gl.uniform1f(uniforms.uT, t);
    // On the Dashboard the flame shows the work its own way (YearDeck): the head here is for the site's ribbon.
    const shown = ribbonStage.work;
    frontStrength += ((shown && !track ? 1 : 0) - frontStrength) * ease(3);
    const flare = shown?.doneAt != null ? Math.exp(-(time - shown.doneAt) / 700) : 0;
    gl.uniform3f(uniforms.uFront, shown?.shown ?? 0, frontStrength, flare);
    gl.uniform3f(uniforms.uWork, track?.importing ?? 0, track?.lineStart ?? 0, track?.glow ?? 1);
    gl.uniform1f(uniforms.uFade, (track ? TRACK_QUIET_FADE : QUIET_FADE) / CELL);
    gl.uniform1f(uniforms.uWander, wander);
    gl.uniform1f(uniforms.uAngle, now.angle);
    gl.uniform1f(uniforms.uOff, now.off);
    gl.uniform1f(uniforms.uCalm, now.calm);
    gl.uniform1f(uniforms.uEdge, now.edge);
    // A band scrolled out of its page leaves with the page, instead of crossing what sits above it.
    const page = (chain ?? (track && canvas.ownerDocument.querySelector("main")))?.closest("main")?.getBoundingClientRect();
    gl.uniform1f(uniforms.uClip, page ? (window.innerHeight - page.top) / CELL : window.innerHeight);
    gl.uniform1f(uniforms.uPull, now.pull * (1 - now.calm));
    const bandRect = band ?? (track ? { top: track.bandTop, bottom: track.bandBottom } : null);
    gl.uniform2f(
      uniforms.uBand,
      bandRect ? (window.innerHeight - bandRect.bottom) / CELL : -1,
      bandRect ? (window.innerHeight - bandRect.top) / CELL : -1,
    );
    gl.uniform2f(uniforms.uPoint, now.px, now.py);
    gl.uniform1fv(uniforms.uCols, now.cols);
    gl.uniform3fv(uniforms.uRamp, now.ramp);
    gl.uniform4fv(uniforms.uQuiet, quiet.data);
    gl.uniform1i(uniforms.uN, quiet.count);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!reducedMotion) {
      // Embers stop at content, and at the covers' faces: they are never specks on the art.
      const solid = track ? [...rects, ...track.holes] : rects;
      embers = stepEmbers(embers, dt, track ? ribbonStage.embers : 0, () => (track ? emberOrigin(track, wander) : null), solid, clock);
      // The head of the work spits sparks, so many a second whatever the frame rate, from inside its flame.
      sparkDebt = track?.sparks ? sparkDebt + dt * track.sparks : 0;
      for (; sparkDebt >= 1; sparkDebt -= 1) {
        const x = track.head + (track.trail ?? -1) * random() * SPARK_BEHIND;
        embers.push(burstEmber(x, waveCentre(x, track, wander) - random() * track.half * 0.6));
      }
      emberLayer.draw(embers, CELL, window.innerHeight, canvas.width, canvas.height);
    }
    frameId = window.requestAnimationFrame(frame);
  };
  frameId = window.requestAnimationFrame(frame);
  // Without preventDefault the browser never hands the context back.
  const onLost = (e) => {
    e.preventDefault();
    window.cancelAnimationFrame(frameId);
  };
  const onRestored = () => {
    try {
      build();
    } catch (error) {
      console.error("Ribbon shader failed to compile", error);
      return;
    }
    resize();
    last = performance.now();
    frameId = window.requestAnimationFrame(frame);
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  ribbonStage.alive = true;
  ribbonStage.burst = (x, y) => {
    if (!reducedMotion) embers.push(burstEmber(x, y));
  };

  return {
    setScene(next) {
      ribbonStage.silent = Boolean(next.silent) && !reducedMotion;
      scene = { cols: next.shape, angle: next.angle, off: (window.innerWidth <= PHONE_WIDTH && next.phoneOffset) || next.offset };
      sceneHeat = heat = next.heat;
      Object.assign(target, scene, { ramp: rampFor(next.heat, palette) });
      // The first scene appears in place; only later ones travel.
      if (!started) {
        Object.assign(now, { cols: [...target.cols], ramp: [...target.ramp], angle: target.angle, off: target.off });
        started = true;
      }
    },
    destroy() {
      ribbonStage.alive = false;
      ribbonStage.silent = false;
      ribbonStage.burst = () => {};
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      document.removeEventListener("pointermove", onPointer);
      document.removeEventListener("focusin", onFocus);
    },
  };
}
