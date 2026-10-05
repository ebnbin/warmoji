import { FRAME_U } from '../../util/units'

/** 着色器用的噪声：格点哈希 */
const NOISE = `
float hash1(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
`

const HEADER = `
#pragma phaserTemplate(shaderName)
#pragma phaserTemplate(extensions)
#pragma phaserTemplate(features)
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
#pragma phaserTemplate(fragmentDefine)
varying vec2 outTexCoord;
#pragma phaserTemplate(outVariables)
#pragma phaserTemplate(fragmentHeader)
`

/**
 * 玻璃外往下看的夜城：从远到近四层——地面的街区与车流、楼顶、楼间穿梭的飞行器、隔壁几栋高楼的楼顶，层越深越暗、越蓝。
 * 镜头在地板上方 uCam.z 格：深 D 格的一层，地板上 p 处看到的是它上面 c + (p − c)·(H + D) / H 处，c 是镜头的正下方，越深的层跟着镜头移得越慢
 */
export const CITY_FRAG = `${HEADER}
uniform vec4 uRect;
uniform vec3 uCam;
uniform float uTime;
uniform float uSeed;
${NOISE}
const vec3 NIGHT = vec3(0.01, 0.018, 0.05);
const vec3 HAZE = vec3(0.06, 0.08, 0.2);
const vec3 SODIUM = vec3(1.0, 0.58, 0.22);
const vec3 HEAD = vec3(0.95, 0.97, 1.0);
const vec3 TAIL = vec3(1.0, 0.18, 0.12);
const vec3 WARM = vec3(1.0, 0.78, 0.45);
const vec3 COOL = vec3(0.62, 0.84, 1.0);
const vec3 NEON_A = vec3(1.0, 0.22, 0.72);
const vec3 NEON_B = vec3(0.2, 0.9, 1.0);

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash1(i);
  float b = hash1(i + vec2(1.0, 0.0));
  float c = hash1(i + vec2(0.0, 1.0));
  float d = hash1(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

vec2 deep(vec2 p, float d) {
  return uCam.xy + (p - uCam.xy) * (uCam.z + d) / uCam.z;
}

/** 一条大街上两道车流：离街心 across、沿街走到 along，都按这一层的格算；k 是这一层的一格在画面上缩小成几分之一，光点按画面上的大小定 */
vec3 cars(float across, float along, float id, float k) {
  vec3 col = vec3(0.0);
  for (int n = 0; n < 2; n++) {
    float lane = n == 0 ? 1.0 : -1.0;
    float off = (across - lane * 0.03 * k) / k;
    float w = exp(-off * off / 0.0004);
    if (w < 0.01) continue;
    float speed = (3.0 + 2.5 * hash1(vec2(id, lane + uSeed))) * lane;
    float gap = 1.6;
    float s = fract((along - uTime * speed) / gap + hash1(vec2(id, 4.0 + lane)));
    float car = exp(-pow((s - 0.5) * gap / (0.035 * k), 2.0));
    col += (lane > 0.0 ? HEAD : TAIL) * car * w * 1.6;
  }
  return col;
}

/**
 * 地面：一格格街区，街区里一块块楼，楼里的窗光暖的多、冷的少，疏密不一、慢慢闪；少数街区是公园，黑黢黢的只有几盏路灯；
 * 街上的路灯连成一张昏黄的网，每四条街一条大街，更亮，车流不断；越靠市中心越亮、越密，光在雾里晕开。
 * k 是这一层的一格在画面上缩小成几分之一：线有多细、光点多大、光晕多宽都按画面上的大小定
 */
vec3 ground(vec2 q, float k) {
  float block = 5.0;
  vec2 b = floor(q / block);
  vec2 f = q - b * block;
  vec2 d = min(f, block - f);
  float street = min(d.x, d.y) / k;
  float district = smoothstep(0.15, 0.85, vnoise(q / 45.0 + uSeed)) * 0.75 + 0.25 * vnoise(q / 11.0 + uSeed * 3.0);
  vec3 col = NIGHT + vec3(0.08, 0.05, 0.075) * district;
  float park = step(0.88, hash1(b + 17.0 + uSeed));
  // 一个街区分四块地，多半盖着楼
  vec2 lot = floor(f / 2.5);
  vec2 lf = f - lot * 2.5;
  vec2 lh = hash2(b * 2.0 + lot + uSeed);
  vec2 size = vec2(1.3) + 0.9 * lh;
  vec2 lo = (vec2(2.5) - size) * hash2(b + lot * 3.1 + 0.7);
  vec2 bd = min(lf - lo, lo + size - lf);
  float house = step(0.0, min(bd.x, bd.y)) * (1.0 - park) * step(lh.y, 0.92);
  col += WARM * 0.06 * house * (0.3 + district);
  // 窗光：一格一盏，位置、大小、亮度都有出入
  vec2 wc = floor(q / 0.32);
  vec2 jit = (hash2(wc + 5.0) - 0.5) * 0.12;
  vec2 wf = ((fract(q / 0.32) - 0.5) * 0.32 - jit) / k;
  float h = hash1(wc + uSeed);
  float lit = step(0.5 - 0.3 * district, h) * house;
  float glint = exp(-dot(wf, wf) / (0.00025 + 0.0004 * hash1(wc + 9.0)));
  float twinkle = 0.75 + 0.25 * sin(uTime * (0.3 + 1.7 * h) + h * 40.0);
  vec3 wcol = mix(WARM, COOL, step(0.8, hash1(wc + 3.0)));
  wcol = mix(wcol, mix(NEON_A, NEON_B, step(0.5, hash1(wc + 4.0))), step(0.985, hash1(wc + 6.0)) * district);
  col += wcol * lit * glint * (0.4 + 0.9 * district) * (0.5 + 0.5 * hash1(wc + 8.0)) * twinkle;
  // 公园：几盏路灯
  vec2 pc = floor(q / 1.25);
  vec2 pf = ((fract(q / 1.25) - 0.5) * 1.25) / k;
  col += SODIUM * park * step(0.7, hash1(pc + 2.0)) * exp(-dot(pf, pf) / 0.0003) * 0.6;
  // 路灯网与它晕开的光
  col += SODIUM * (0.42 * exp(-street / 0.016) + 0.15 * exp(-street / 0.15)) * (0.45 + 0.8 * district);
  // 大街：每四条街一条，更亮，车流不断
  vec2 nb = floor((q + block * 0.5) / block);
  vec2 big = step(mod(nb, 4.0), vec2(0.5));
  float ax = q.x - nb.x * block;
  float ay = q.y - nb.y * block;
  if (big.x > 0.5) col += (HEAD * 0.28 * exp(-abs(ax) / k / 0.03) + SODIUM * 0.16 * exp(-abs(ax) / k / 0.2)) * (0.6 + district) + cars(ax, q.y, nb.x, k);
  if (big.y > 0.5) col += (HEAD * 0.28 * exp(-abs(ay) / k / 0.03) + SODIUM * 0.16 * exp(-abs(ay) / k / 0.2)) * (0.6 + district) + cars(ay, q.x, nb.y + 50.0, k);
  return col;
}

/** 一层楼顶：格子里多半有一栋楼，楼顶深色，边上一道细光；有的楼沿亮着霓虹，有的楼角一盏红色的航空障碍灯一闪一闪 */
vec4 roofs(vec2 q, float cell, float fill, float big) {
  vec2 c = floor(q / cell);
  vec2 f = q - c * cell;
  vec2 h = hash2(c + uSeed * 1.7);
  if (h.x > fill) return vec4(0.0);
  vec2 size = cell * (0.42 + big * 0.36 * hash2(c + 9.3));
  vec2 lo = (cell - size) * hash2(c + 2.7);
  vec2 d = min(f - lo, lo + size - f);
  float edge = min(d.x, d.y);
  if (edge < 0.0) return vec4(0.0);
  vec2 g = (f - lo) / size;
  vec3 roof = vec3(0.04, 0.052, 0.08) + 0.025 * hash1(c + 1.3) + vec3(0.02, 0.025, 0.04) * (1.0 - g.y);
  roof += COOL * 0.22 * exp(-edge / 0.05);
  float neon = step(0.78, hash1(c + 5.5));
  roof += mix(NEON_A, NEON_B, step(0.5, hash1(c + 6.6))) * neon * exp(-edge / 0.08) * 0.8;
  float beacon = step(0.55, hash1(c + 8.8));
  float blink = step(0.8, fract(uTime * 0.5 + h.y));
  roof += TAIL * 1.4 * beacon * blink * exp(-length(f - lo - vec2(0.3)) / 0.08);
  // 楼顶边上一圈亮着的窗
  vec2 w = floor((f - lo) / 0.5);
  float rim = step(edge, 0.45) * step(0.55, hash1(w + c * 7.1));
  roof += WARM * 0.45 * rim * exp(-edge / 0.25);
  return vec4(roof, 1.0);
}

/** 楼间的空中航道：一串串亮点顺着航道飞，身后拖着短短的尾迹 */
vec3 traffic(vec2 q) {
  vec3 col = vec3(0.0);
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    vec2 dir = normalize(vec2(cos(fk * 2.1 + uSeed), sin(fk * 2.1 + uSeed)));
    vec2 n = vec2(-dir.y, dir.x);
    float off = dot(q, n) - (fk - 1.0) * 29.0;
    float lane = mod(off + 20.0, 40.0) - 20.0;
    float w = exp(-lane * lane / 0.02);
    if (w < 0.01) continue;
    float along = dot(q, dir) - uTime * (7.0 + fk * 2.0);
    float s = fract(along / 9.0 + hash1(vec2(floor((off + 20.0) / 40.0), fk)));
    float body = exp(-pow((s - 0.5) * 9.0 / 0.2, 2.0));
    float trail = smoothstep(0.3, 0.5, s) * step(s, 0.5) * 0.2;
    col += mix(HEAD, NEON_B, fk * 0.4) * w * (body * 1.8 + trail);
  }
  return col;
}

void main ()
{
  vec2 tc = outTexCoord;
  vec2 p = uRect.xy + vec2(tc.x, 1.0 - tc.y) * uRect.zw;
  vec3 col = ground(deep(p, 110.0), (uCam.z + 110.0) / uCam.z);
  col = mix(col, HAZE, 0.22);
  vec4 mid = roofs(deep(p, 62.0), 8.0, 0.45, 0.4);
  col = mix(col, mix(mid.rgb, HAZE, 0.2), mid.a);
  col += traffic(deep(p, 34.0)) * 0.8;
  vec4 near = roofs(deep(p, 16.0), 16.0, 0.38, 1.0);
  col = mix(col, near.rgb, near.a);
  gl_FragColor = vec4(col, 1.0);
}
`

/**
 * 地砖：每块瓷砖按数据图亮起谁的颜色——四边的光最亮、往里淡，刚踩上的那一下从中心往外扩一圈方框；亮着的瓷砖把光渗到相邻那一边。
 * 传送门两侧的瓷砖铺着那一对的颜色，箭头一步步朝门线走；挪走前闪烁、挪来前一格格搭起来。一道扫描线隔一阵扫过地面，扫到的瓷砖闪一下。
 * 只画瓷砖地面；输出按预乘透明度：亮起的颜色盖在瓷砖上，最亮的那一点往上加
 */
export const TILES_FRAG = `${HEADER}
uniform sampler2D uData;
uniform sampler2D uWarp;
uniform sampler2D uMask;
uniform float uTime;
uniform vec4 uScan;
uniform vec3 uTeam;
uniform vec3 uFoe;
uniform vec3 uPair0;
uniform vec3 uPair1;
uniform vec3 uPair2;
${NOISE}
const float N = ${FRAME_U.toFixed(1)};

vec2 texel(vec2 cell) {
  return vec2((cell.x + 0.5) / N, 1.0 - (cell.y + 0.5) / N);
}

vec3 pairColor(float k) {
  return k < 1.5 ? uPair0 : k < 2.5 ? uPair1 : uPair2;
}

/** 朝 dir 的箭头：一格里两道人字纹，随时间往前走 */
float chevron(vec2 f, vec2 dir, float t) {
  vec2 c = f - 0.5;
  float a = dot(c, dir);
  float b = abs(dot(c, vec2(-dir.y, dir.x)));
  float s = fract((a - b * 0.9) * 2.2 - t);
  return smoothstep(0.0, 0.08, s) * (1.0 - smoothstep(0.18, 0.28, s)) * step(b, 0.34);
}

void main ()
{
  vec2 tc = outTexCoord;
  vec2 p = vec2(tc.x, 1.0 - tc.y) * N;
  vec2 cell = floor(p);
  vec2 f = p - cell;
  if (texture2D(uMask, texel(cell)).r < 0.5) {
    gl_FragColor = vec4(0.0);
    return;
  }
  float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
  float rim = exp(-edge / 0.05);
  // 亮起的瓷砖：四边一道亮线，往里一点再一道细线，中间只淡淡地染一层
  float seam = exp(-edge / 0.022);
  float inset = exp(-abs(edge - 0.11) / 0.012);
  float lit = 0.07 + 0.6 * seam + 0.4 * inset;
  vec3 d = texture2D(uData, texel(cell)).rgb;
  float glow = max(d.r, d.g);
  vec3 tint = (uTeam * d.r + uFoe * d.g) / max(d.r + d.g, 0.001);
  // 隔壁亮着的瓷砖把光渗过缝来
  vec2 side = f.x < 0.5 ? vec2(-1.0, 0.0) : vec2(1.0, 0.0);
  vec2 side2 = f.y < 0.5 ? vec2(0.0, -1.0) : vec2(0.0, 1.0);
  vec3 nx = texture2D(uData, texel(cell + side)).rgb;
  vec3 ny = texture2D(uData, texel(cell + side2)).rgb;
  float fx = exp(-min(f.x, 1.0 - f.x) / 0.06) * texture2D(uMask, texel(cell + side)).r;
  float fy = exp(-min(f.y, 1.0 - f.y) / 0.06) * texture2D(uMask, texel(cell + side2)).r;
  float a = glow * lit + 0.22 * (max(nx.r, nx.g) * fx + max(ny.r, ny.g) * fy);
  vec3 col = tint * glow * lit + 0.22 * ((uTeam * nx.r + uFoe * nx.g) * fx + (uTeam * ny.r + uFoe * ny.g) * fy);
  vec3 add = vec3(1.0) * glow * seam * 0.22;
  // 刚踩上的一脚：一圈方框从中心扩到四边
  float cheb = max(abs(f.x - 0.5), abs(f.y - 0.5));
  float ring = exp(-abs(cheb - (1.0 - d.b) * 0.5) / 0.03) * d.b;
  add += mix(tint, vec3(1.0), 0.35) * ring * 0.9;
  a += ring * 0.25;
  // 闲着的地面：零星几块瓷砖的四边微微亮一下
  float h = hash1(cell);
  float idle = pow(max(0.0, sin(uTime * 0.45 + h * 6.2832)), 60.0) * 0.12 * rim;
  col += uTeam * idle;
  a += idle;
  // 传送门两侧：那一对的颜色铺开，箭头朝门线走；挪走前一闪一闪，挪来前从门线往外一格格亮起来
  vec3 w = texture2D(uWarp, texel(cell)).rgb;
  float pair = floor(w.r * 255.0 + 0.5);
  if (pair > 0.5) {
    vec3 pc = pairColor(pair);
    float k = w.g;
    float code = floor(w.b * 255.0 + 0.5);
    float style = floor(code / 8.0);
    float dirc = code - style * 8.0;
    vec2 dir = dirc < 1.5 ? vec2(1.0, 0.0) : dirc < 2.5 ? vec2(-1.0, 0.0) : dirc < 3.5 ? vec2(0.0, 1.0) : vec2(0.0, -1.0);
    float arrow = chevron(f, dir, uTime * 1.4);
    float lay = 0.12 + 0.5 * rim;
    if (style > 1.5) {
      // 正在搭：虚线的框，一道亮线一遍遍朝门线扫过去
      float dash = step(0.5, fract((f.x + f.y) * 6.0 - uTime * 3.0));
      float along = dot(f - 0.5, dir) + 0.5;
      float sweep = exp(-abs(along - fract(uTime * 1.3)) / 0.04);
      lay = rim * dash * 0.8 + sweep * 0.6;
      arrow = 0.0;
    } else if (style > 0.5) {
      // 要挪走：铺上斜的警示条纹，箭头暗下去
      float stripe = step(0.5, fract((f.x - f.y) * 4.0 + uTime * 2.0));
      lay = lay * 0.6 + stripe * 0.3;
      arrow *= 0.5;
    }
    float on = k * (lay + arrow * 0.55);
    col += pc * on;
    a += on;
    add += pc * arrow * k * 0.35;
  }
  // 扫描线：x 是位置（格），y 是横扫（0）还是竖扫（1），z 是亮度
  float scanAt = uScan.y < 0.5 ? p.y : p.x;
  float scanCell = uScan.y < 0.5 ? cell.y + 0.5 : cell.x + 0.5;
  float line = exp(-abs(scanAt - uScan.x) / 0.03) * uScan.z;
  float swept = exp(-abs(scanCell - uScan.x) / 0.6) * uScan.z * (0.1 + 0.5 * rim);
  add += vec3(0.75, 0.95, 1.0) * line;
  col += uTeam * swept;
  a += swept + line * 0.4;
  a = clamp(a, 0.0, 0.85);
  gl_FragColor = vec4(col + add, a);
}
`

/**
 * 地砖的数据图，每格一个像素、不透明（画布会按透明度预乘，数据必须满 alpha）：
 * R 队伍踩亮的余光，G 敌人踩亮的余光，B 刚踩上那一脚还剩多少（都在 0 到 1）
 */
export function encodeTiles(out: Uint8ClampedArray, team: Float32Array, foe: Float32Array, teamFrom: Float32Array, foeFrom: Float32Array, now: number, fadeMs: number, flashMs: number): void {
  for (let i = 0; i < team.length; i++) {
    const o = i * 4
    const t = Math.exp(-(now - team[i]!) / fadeMs)
    const e = Math.exp(-(now - foe[i]!) / fadeMs)
    const fl = Math.max(Math.exp(-(now - teamFrom[i]!) / flashMs), Math.exp(-(now - foeFrom[i]!) / flashMs))
    out[o] = t * 255
    out[o + 1] = e * 255
    out[o + 2] = fl * 255
    out[o + 3] = 255
  }
}
