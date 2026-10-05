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
 * 玻璃外往下看的夜城：从远到近四层——地面的街网与车流、楼顶、楼间穿梭的飞行器、隔壁几栋高楼的楼顶，层越深越暗、越蓝。
 * 镜头在地板上方 uCam.z 格：深 D 格的一层，地板上 p 处看到的是它上面 c + (p − c)·(H + D) / H 处，c 是镜头的正下方，越深的层跟着镜头移得越慢
 */
export const CITY_FRAG = `${HEADER}
uniform vec4 uRect;
uniform vec3 uCam;
uniform float uTime;
uniform float uSeed;
${NOISE}
const vec3 NIGHT = vec3(0.012, 0.022, 0.06);
const vec3 HAZE = vec3(0.05, 0.07, 0.17);
const vec3 SODIUM = vec3(1.0, 0.6, 0.24);
const vec3 HEAD = vec3(0.92, 0.95, 1.0);
const vec3 TAIL = vec3(1.0, 0.16, 0.1);
const vec3 WARM = vec3(1.0, 0.78, 0.45);
const vec3 COOL = vec3(0.62, 0.84, 1.0);
const vec3 NEON_A = vec3(1.0, 0.22, 0.72);
const vec3 NEON_B = vec3(0.2, 0.9, 1.0);

vec2 deep(vec2 p, float d) {
  return uCam.xy + (p - uCam.xy) * (uCam.z + d) / uCam.z;
}

/** 地面：街区里密密的窗光，街上两道车流，大街每三个街区一条、宽一些 */
vec3 streets(vec2 q) {
  float block = 9.0;
  vec2 b = floor(q / block);
  vec2 f = q - b * block;
  vec2 avenue = step(mod(b, 3.0), vec2(0.5));
  vec2 width = vec2(0.55) + avenue * 0.35;
  vec2 dist = min(f, block - f);
  vec3 col = NIGHT;
  // 街区里的楼：一小格一小格的窗光
  vec2 w = floor(q / 0.55);
  float lit = step(0.72, hash1(w + uSeed));
  float warm = step(0.35, hash1(w + uSeed + 7.0));
  col += mix(COOL, WARM, warm) * lit * (0.18 + 0.2 * hash1(w + 3.1));
  // 横街与竖街：路面昏黄，两条车道上的车灯一串串流过去
  for (int k = 0; k < 2; k++) {
    float across = k == 0 ? dist.y : dist.x;
    float along = k == 0 ? q.x : q.y;
    float wide = k == 0 ? width.y : width.x;
    float big = k == 0 ? avenue.y : avenue.x;
    if (across < wide) {
      col = mix(col, SODIUM * 0.18, 0.8);
      float lane = (k == 0 ? f.y : f.x) < block * 0.5 ? 1.0 : -1.0;
      float id = k == 0 ? b.y : b.x;
      float speed = (2.5 + 2.0 * hash1(vec2(id, lane + uSeed))) * lane;
      float s = fract((along - uTime * speed) / 1.7 + hash1(vec2(id, 4.0 + lane)));
      float car = smoothstep(0.75, 0.82, s) * (1.0 - smoothstep(0.9, 0.97, s));
      col += (lane > 0.0 ? HEAD : TAIL) * car * (0.9 + big);
    }
  }
  return col;
}

/** 一层楼顶：格子里多半有一栋楼，楼顶深色，边上一道细光，有的楼沿亮着霓虹，楼角一盏红色的航空障碍灯一闪一闪 */
vec4 roofs(vec2 q, float cell, float fill, float big) {
  vec2 c = floor(q / cell);
  vec2 f = q - c * cell;
  vec2 h = hash2(c + uSeed * 1.7);
  if (h.x > fill) return vec4(0.0);
  vec2 size = cell * (0.42 + big * 0.36 * hash2(c + 9.3));
  vec2 lo = (cell - size) * hash2(c + 2.7);
  vec2 d = min(f - lo, lo + size - f);
  float inside = step(0.0, min(d.x, d.y));
  if (inside < 0.5) return vec4(0.0);
  float edge = min(d.x, d.y);
  vec3 roof = vec3(0.045, 0.06, 0.09) + 0.03 * hash1(c + 1.3);
  // 楼顶的设备：几块方的
  vec2 g = floor((f - lo) / (cell * 0.12));
  roof += vec3(0.025) * step(0.8, hash1(g + c * 3.1));
  roof += COOL * 0.25 * exp(-edge / 0.06);
  float neon = step(0.7, hash1(c + 5.5));
  roof += mix(NEON_A, NEON_B, step(0.5, hash1(c + 6.6))) * neon * exp(-edge / 0.1) * 0.9;
  vec2 corner = lo + vec2(0.18);
  float blink = step(0.75, fract(uTime * 0.6 + h.y));
  roof += TAIL * 1.6 * blink * exp(-length(f - corner) / 0.07);
  return vec4(roof, 1.0);
}

/** 楼间的空中航道：一串串亮点顺着航道飞，身后拖着短短的尾迹 */
vec3 traffic(vec2 q) {
  vec3 col = vec3(0.0);
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    vec2 dir = normalize(vec2(cos(fk * 2.1 + uSeed), sin(fk * 2.1 + uSeed)));
    vec2 n = vec2(-dir.y, dir.x);
    float off = dot(q, n) - (fk - 1.0) * 23.0;
    float lane = mod(off + 6.0, 12.0) - 6.0;
    float w = exp(-abs(lane) / 0.08);
    if (w < 0.01) continue;
    float along = dot(q, dir) - uTime * (6.0 + fk * 2.0);
    float s = fract(along / 5.0 + hash1(vec2(floor((off + 6.0) / 12.0), fk)));
    float body = exp(-abs(s - 0.5) * 5.0 / 0.06);
    float trail = smoothstep(0.1, 0.5, s) * step(s, 0.5) * 0.35;
    col += mix(HEAD, NEON_B, fk * 0.4) * w * (body * 2.0 + trail);
  }
  return col;
}

void main ()
{
  vec2 tc = outTexCoord;
  vec2 p = uRect.xy + vec2(tc.x, 1.0 - tc.y) * uRect.zw;
  vec3 col = streets(deep(p, 150.0));
  col = mix(col, HAZE, 0.35);
  vec4 mid = roofs(deep(p, 62.0), 7.0, 0.72, 0.4);
  col = mix(col, mix(mid.rgb, HAZE, 0.25), mid.a);
  col += traffic(deep(p, 34.0)) * 0.8;
  vec4 near = roofs(deep(p, 16.0), 15.0, 0.42, 1.0);
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
  vec3 d = texture2D(uData, texel(cell)).rgb;
  float glow = max(d.r, d.g);
  vec3 tint = (uTeam * d.r + uFoe * d.g) / max(d.r + d.g, 0.001);
  // 隔壁亮着的瓷砖把光渗过缝来
  vec2 side = f.x < 0.5 ? vec2(-1.0, 0.0) : vec2(1.0, 0.0);
  vec2 side2 = f.y < 0.5 ? vec2(0.0, -1.0) : vec2(0.0, 1.0);
  vec3 nx = texture2D(uData, texel(cell + side)).rgb;
  vec3 ny = texture2D(uData, texel(cell + side2)).rgb;
  float bx = max(nx.r, nx.g) * exp(-min(f.x, 1.0 - f.x) / 0.08) * texture2D(uMask, texel(cell + side)).r;
  float by = max(ny.r, ny.g) * exp(-min(f.y, 1.0 - f.y) / 0.08) * texture2D(uMask, texel(cell + side2)).r;
  float a = glow * (0.18 + 0.6 * rim) + 0.35 * (bx + by);
  vec3 col = tint * glow * (0.18 + 0.6 * rim) + (uTeam * (nx.r * bx + ny.r * by) + uFoe * (nx.g * bx + ny.g * by)) * 0.35 / max(glow + 0.001, 0.35);
  // 刚踩上的一脚：一圈方框从中心扩到四边
  float cheb = max(abs(f.x - 0.5), abs(f.y - 0.5));
  float ring = exp(-abs(cheb - (1.0 - d.b) * 0.5) / 0.03) * d.b;
  vec3 add = mix(tint, vec3(1.0), 0.35) * ring * 0.9;
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
      // 正在搭：虚线的框与扫过的亮线
      float dash = step(0.5, fract((f.x + f.y) * 6.0 - uTime * 3.0));
      lay = rim * dash * 0.7;
      arrow = 0.0;
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
