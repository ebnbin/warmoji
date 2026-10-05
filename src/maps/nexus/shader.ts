import { FRAME_U, UNIT } from '../../util/units'

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
 * 玻璃外往下看的夜城：从远到近四层——地面上一片灯海（大小错落的街区里一栋栋楼的窗光、路灯连成的光网、亮白的大街、斜穿的高架与一条河），
 * 一层高楼，楼间穿梭的飞行器，隔壁几栋更高的楼；越深越雾、越蓝，整片罩着灯光映出的暖雾。
 * 镜头在地板上方 uCam.z 格：深 D 格的一层，地板上 p 处看到的是它上面 c + (p − c)·(H + D) / H 处，c 是镜头的正下方，越深的层跟着镜头移得越慢；
 * 高楼看得到楼顶和朝着镜头的那几面楼身，楼身往下隐进雾里。线多细、光点多大都按画面上的像素定，层再深也看得清。
 * 离幕墙内侧超过 uCut.y 格的地方是不透光的瓷砖地面，不画
 */
export const CITY_FRAG = `${HEADER}
uniform vec4 uRect;
uniform vec3 uCam;
uniform float uTime;
uniform float uSeed;
uniform vec4 uHall;
uniform vec2 uCut;
${NOISE}
const float PX = ${UNIT.toFixed(1)};
const vec3 DUSK = vec3(0.03, 0.045, 0.12);
const vec3 HAZE = vec3(0.1, 0.13, 0.3);
const vec3 SMOG = vec3(0.3, 0.15, 0.2);
const vec3 SODIUM = vec3(1.0, 0.6, 0.24);
const vec3 LED = vec3(0.8, 0.92, 1.0);
const vec3 HEAD = vec3(1.0, 0.97, 0.88);
const vec3 TAIL = vec3(1.0, 0.14, 0.1);
const vec3 WARM = vec3(1.0, 0.78, 0.5);
const vec3 COOL = vec3(0.6, 0.86, 1.0);
const vec3 NEON_A = vec3(1.0, 0.2, 0.7);
const vec3 NEON_B = vec3(0.15, 0.92, 1.0);
const vec3 GLASS = vec3(0.07, 0.1, 0.2);
const vec3 WATER = vec3(0.012, 0.02, 0.06);
/** 地面那一层多深，格；楼身往下看得见多深，格 */
const float GROUND_D = 120.0;
const float FACADE_D = 15.0;

float sq(float x) {
  return x * x;
}

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

/** 一道车流：离车道 across 像素，沿路走到 along 像素；车距 gap、车速 speed 都按像素算 */
float stream(float across, float along, float gap, float speed, float seed) {
  float w = exp(-across * across / 0.8);
  if (w < 0.01) return 0.0;
  float s = fract((along - uTime * speed) / gap + seed);
  float x = (s - 0.5) * gap;
  return w * exp(-x * x / 3.0);
}

/** 一条大街：白亮的街心，两边各一道车流，一道是白的车头灯、一道是红的车尾灯；across、along 都是像素 */
vec3 avenue(float across, float along, float id) {
  vec3 col = LED * (0.75 * exp(-across * across / 2.5) + 0.2 * exp(-abs(across) / 9.0));
  float v = 28.0 + 26.0 * hash1(vec2(id, uSeed));
  col += HEAD * 1.3 * stream(across - 2.6, along, 17.0, v, hash1(vec2(id, 3.0)));
  col += TAIL * 1.3 * stream(across + 2.6, along, 19.0, -v * 0.9, hash1(vec2(id, 5.0)));
  return col;
}

/** 一个方向上的街：第 n 条街的街心在 n·B 附近按 n 打散。返回 (离较近那条街心多远（带正负）, 左边那条街的编号, 在两条街之间走到几成, 两条街隔多远) */
vec4 grid1(float x, float B, float s) {
  float n = floor(x / B);
  float a = (n + 0.36 * (hash1(vec2(n, s)) - 0.5)) * B;
  float b = (n + 1.0 + 0.36 * (hash1(vec2(n + 1.0, s)) - 0.5)) * B;
  if (x < a) {
    b = a;
    n -= 1.0;
    a = (n + 0.36 * (hash1(vec2(n, s)) - 0.5)) * B;
  } else if (x > b) {
    n += 1.0;
    a = b;
    b = (n + 1.0 + 0.36 * (hash1(vec2(n + 1.0, s)) - 0.5)) * B;
  }
  float t = (x - a) / (b - a);
  return vec4(t < 0.5 ? x - a : x - b, n, t, b - a);
}

/**
 * 地面：大小错落的街区，每个街区分成几块地，一块地一栋楼，楼里的窗光一栋暖、一栋冷，有的楼黑着，偶尔一盏霓虹；少数街区是公园。
 * 路灯连成一张橙黄的光网，每三条街一条亮白的大街，每隔很远一条斜穿的高架；一条河弯弯曲曲穿城而过，河面映着两岸的灯，大街过河就是桥。
 * u 是画面上一个像素合这一层多少格
 */
vec3 ground(vec2 q, float u) {
  float district = smoothstep(0.15, 0.85, vnoise(q / 42.0 + uSeed));
  float dense = 0.5 + 0.5 * district;
  vec3 col = DUSK + SMOG * (0.14 + 0.3 * district);
  vec4 gx = grid1(q.x, 6.5, uSeed + 1.0);
  vec4 gy = grid1(q.y, 5.5, uSeed + 2.0);
  float sd = min(abs(gx.x), abs(gy.x)) / u;
  vec2 blk = vec2(gx.y, gy.y);
  vec2 bt = vec2(gx.z, gy.z);
  vec2 bs = vec2(gx.w, gy.w);
  // 河：中线随 x 弯，河面宽 riverW 格
  float bend = q.y - (sin(q.x / 37.0 + uSeed) * 14.0 + (vnoise(vec2(q.x / 61.0, uSeed)) - 0.5) * 40.0);
  float rv = abs(mod(bend + 90.0, 180.0) - 90.0) / u;
  float riverW = 7.0 / u;
  float wet = 1.0 - smoothstep(riverW - 1.0, riverW + 1.0, rv);
  // 一块地一栋楼：块与块之间留一条窄巷，楼按它自己的亮法亮
  float park = step(0.9, hash1(blk + 17.0 + uSeed)) * (1.0 - district * 0.6);
  vec2 cuts = vec2(1.0 + floor(hash1(blk + 3.3) * 2.99), 1.0 + floor(hash1(blk + 4.4) * 1.99));
  vec2 lot = floor(bt * cuts);
  vec2 lt = fract(bt * cuts);
  vec2 edgePx = min(lt, 1.0 - lt) * bs / cuts / u;
  float inside = smoothstep(1.5, 3.0, min(edgePx.x, edgePx.y)) * smoothstep(3.0, 5.0, sd) * (1.0 - park);
  vec2 lid = blk * 4.0 + lot;
  float lh = hash1(lid + uSeed);
  float lightOn = step(0.22, lh) * inside;
  vec3 lc = mix(WARM, COOL, step(0.7, hash1(lid + 5.3)));
  lc = mix(lc, mix(NEON_A, NEON_B, step(0.5, hash1(lid + 2.2))), step(0.93, hash1(lid + 9.9)) * district);
  col += lc * lightOn * (0.03 + 0.07 * dense);
  // 窗光：楼里一格一盏，亮的多少看这栋楼
  float cs = 0.42;
  vec2 c = floor(q / cs);
  vec2 dv = ((fract(q / cs) - 0.5) * cs - (hash2(c + uSeed) - 0.5) * cs * 0.5) / u;
  float h = hash1(c + 3.1);
  float on = step(1.0 - (0.35 + 0.6 * lh) * dense, h) * lightOn;
  float tw = 0.78 + 0.22 * sin(uTime * (0.4 + 2.0 * h) + h * 31.0);
  vec3 wc = mix(lc, mix(WARM, COOL, step(0.8, hash1(c + 5.3))), 0.35);
  col += wc * on * exp(-dot(dv, dv) / (0.8 + 1.8 * hash1(c + 7.7))) * (0.45 + 0.8 * hash1(c + 1.1)) * tw;
  // 公园：几盏小路灯
  vec2 pc = floor(q / 1.3);
  vec2 pv = ((fract(q / 1.3) - 0.5) * 1.3) / u;
  col += SODIUM * park * step(3.0, sd) * step(0.72, hash1(pc + 2.0)) * exp(-dot(pv, pv) / 1.5) * 0.6;
  col = mix(col, DUSK * 0.6 + SMOG * 0.05, park * smoothstep(3.0, 5.0, sd) * 0.6);
  // 路灯网与晕开的光
  col += SODIUM * (0.8 * exp(-sd * sd / 1.1) + 0.22 * exp(-sd / 7.0)) * (0.4 + 0.6 * dense) * (1.0 - wet);
  // 河面：黑沉沉的水上浮着粼粼的碎光，近岸映着暖光；两岸一溜路灯
  if (wet > 0.0) {
    float glint = pow(vnoise(q / u * vec2(0.08, 0.35) + vec2(uTime * 0.6, uSeed)), 7.0);
    vec3 water = WATER + HAZE * 0.12 + (WARM * 0.5 + COOL * 0.3) * glint + SODIUM * 0.18 * exp(-max(riverW - rv, 0.0) / 6.0);
    col = mix(col, water, wet);
  }
  float bank = exp(-sq(rv - riverW - 2.0) / 2.0);
  float lamp = exp(-sq((fract(q.x / u / 12.0) - 0.5) * 12.0) / 1.5);
  col += SODIUM * bank * lamp * 1.1;
  // 大街：过河就是桥
  vec2 nb = blk + step(0.5, bt);
  vec2 ave = step(mod(nb + floor(uSeed), 3.0), vec2(0.5));
  if (ave.x > 0.5) col += avenue(gx.x / u, q.y / u, nb.x) * (0.6 + 0.4 * dense);
  if (ave.y > 0.5) col += avenue(gy.x / u, q.x / u, nb.y + 71.0) * (0.6 + 0.4 * dense) * (1.0 - wet);
  // 高架：路面一层冷光，两边一串路灯，四道车流
  vec2 dir = normalize(vec2(1.0, 0.45 + 0.5 * hash1(vec2(uSeed, 3.0))));
  vec2 nrm = vec2(-dir.y, dir.x);
  float across = dot(q, nrm) + 50.0;
  float way = floor(across / 100.0);
  float hd = (across - way * 100.0 - 50.0) / u;
  if (abs(hd) < 40.0) {
    float along = dot(q, dir) / u;
    float deck = sq(sq(sq(hd / 9.0)));
    col *= 1.0 - 0.7 * exp(-deck);
    col += vec3(0.15, 0.19, 0.3) * exp(-deck * 1.9) + LED * 0.1 * exp(-abs(hd) / 16.0);
    float post = exp(-sq((fract(along / 14.0) - 0.5) * 14.0) / 2.0);
    col += SODIUM * post * exp(-sq(abs(hd) - 9.0) / 1.2) * 1.2;
    float v = 60.0 + 30.0 * hash1(vec2(way, uSeed));
    col += HEAD * 1.4 * (stream(hd - 2.2, along, 11.0, v, 0.1) + stream(hd - 5.4, along, 13.0, v * 1.2, 0.6));
    col += TAIL * 1.4 * (stream(hd + 2.2, along, 12.0, -v, 0.3) + stream(hd + 5.4, along, 14.0, -v * 1.15, 0.8));
  }
  return col;
}

/** cell 格一格里的那栋楼：(左上角, 右下角)，这一格没有楼时右下角比左上角小；楼的大小与位置都从一个随机数里拆出来 */
vec4 towerBox(vec2 cc, float cell, float fill) {
  vec2 h = hash2(cc + uSeed * 1.7);
  if (h.x > fill) return vec4(1.0, 1.0, 0.0, 0.0);
  vec2 size = cell * (0.3 + 0.36 * fract(h.y * vec2(13.13, 7.77)));
  vec2 lo = cc * cell + (cell - size) * (0.15 + 0.7 * fract(h.y * vec2(31.71, 19.37)));
  return vec4(lo, lo + size);
}

/**
 * 一层高楼：楼顶在深 D 格处，cell 格一格，fill 那么多的格里有一栋楼。从镜头那里看过去，视线先碰上哪栋楼的楼顶或楼身就画哪里：
 * 楼顶是映着天光的深蓝玻璃，楼沿一道亮线、往里一圈细线，顶上几排小灯，有的是停机坪，有的楼沿亮着霓虹，楼角一盏一闪一闪的红灯；
 * 楼身一层层的窗，越往下越隐进雾里；没碰上楼的地方，楼身的窗光从楼沿往外晕开一圈。haze 是这一层罩着多少雾
 */
vec3 towers(vec3 col, vec2 p, float D, float cell, float fill, float haze) {
  float H = uCam.z;
  float sr = (H + D) / H;
  float smax = (H + D + FACADE_D) / H;
  float u = sr / PX;
  vec2 r = p - uCam.xy;
  vec2 qr = uCam.xy + r * sr;
  vec2 c0 = floor(qr / cell);
  vec2 side = vec2(r.x >= 0.0 ? 1.0 : -1.0, r.y >= 0.0 ? 1.0 : -1.0);
  float best = 1e9;
  vec4 box = vec4(0.0);
  vec4 own = vec4(1.0, 1.0, 0.0, 0.0);
  vec2 cell0 = vec2(0.0);
  float face = 0.0;
  // 视线在看得见楼身的那一段里扫过的格：没扫进隔壁格就不用看隔壁的楼
  vec2 reach = floor((uCam.xy + r * smax) / cell) - c0;
  vec2 more = vec2(reach.x != 0.0 ? 1.0 : 0.0, reach.y != 0.0 ? 1.0 : 0.0);
  vec2 inv = side / (abs(r) + 1e-6);
  for (int k = 0; k < 4; k++) {
    vec2 hop = vec2(k == 1 || k == 3 ? 1.0 : 0.0, k >= 2 ? 1.0 : 0.0);
    if (hop.x > more.x || hop.y > more.y) continue;
    vec2 cc = c0 + hop * side;
    vec4 b = towerBox(cc, cell, fill);
    if (k == 0) own = b;
    if (b.z < b.x) continue;
    // 视线 c + r·s 穿进楼的那一刻：s 从楼顶的 sr 往深里走
    vec2 t1 = (b.xy - uCam.xy) * inv;
    vec2 t2 = (b.zw - uCam.xy) * inv;
    vec2 tn = min(t1, t2);
    vec2 tf = max(t1, t2);
    float enter = max(max(tn.x, tn.y), sr);
    float leave = min(tf.x, tf.y);
    if (enter > leave || enter > smax || enter >= best) continue;
    best = enter;
    box = b;
    cell0 = cc;
    face = tn.x > tn.y ? 0.0 : 1.0;
    if (best <= sr) break;
  }
  if (best > 1e8) {
    // 没碰上楼：这一格的楼的窗光晕到这里
    if (own.z < own.x) return col;
    vec2 a = abs(qr - (own.xy + own.zw) * 0.5) - (own.zw - own.xy) * 0.5;
    float sdf = length(max(a, 0.0)) / u;
    float neon = step(0.72, hash1(c0 + 5.5));
    vec3 nc = mix(NEON_A, NEON_B, step(0.5, hash1(c0 + 6.6)));
    return col + (mix(WARM * 0.2, nc * 0.26, neon) * exp(-sdf / 12.0)) * (1.0 - haze);
  }
  vec2 ctr = (box.xy + box.zw) * 0.5;
  vec2 size = box.zw - box.xy;
  float neon = step(0.72, hash1(cell0 + 5.5));
  vec3 nc = mix(NEON_A, NEON_B, step(0.5, hash1(cell0 + 6.6)));
  vec3 rim = mix(COOL, nc, neon);
  vec2 h = hash2(cell0 + uSeed * 1.7);
  if (best <= sr + 1e-4) {
    vec2 f = qr - ctr;
    vec2 a = abs(f) - size * 0.5;
    float d = -max(a.x, a.y) / u;
    vec2 g = (f + size * 0.5) / size;
    vec3 roof = GLASS * (0.75 + 0.5 * (1.0 - g.y)) + 0.025 * hash1(cell0 + 1.3);
    roof += COOL * 0.1 * exp(-sq((g.x + g.y - 0.6 - 0.25 * sin(uTime * 0.1 + h.y * 6.0)) / 0.12));
    roof += rim * (1.0 * exp(-d / 1.1) + 0.12 * exp(-d / 7.0));
    roof += COOL * 0.3 * exp(-abs(d - 6.0) / 0.6);
    // 顶上几排小灯
    vec2 lg = (fract(f / u / 13.0) - 0.5) * 13.0;
    roof += WARM * 0.55 * step(10.0, d) * step(0.45, hash1(floor(f / u / 13.0) + cell0 * 3.3)) * exp(-dot(lg, lg) / 1.2);
    // 停机坪：一圈一盏盏的灯，中间漆着一个黄色的 H
    float pad = step(0.68, hash1(cell0 + 4.4));
    float pr = 0.2 * min(size.x, size.y) / u;
    vec2 fp = f / u;
    float ring = exp(-sq(length(fp) - pr) / 1.2) * (0.35 + 0.65 * step(0.5, fract(atan(fp.y, fp.x) / 6.2832 * 20.0)));
    vec2 hp = abs(fp) / (pr * 0.45);
    float hh = step(hp.x, 1.0) * step(hp.y, 1.0) * (step(0.66, hp.x) + step(hp.y, 0.12));
    roof += pad * (mix(WARM, vec3(1.0), 0.5) * ring + vec3(0.95, 0.78, 0.3) * 0.45 * min(hh, 1.0));
    // 航空障碍灯
    vec2 corner = abs(f) / u - (size * 0.5 / u - 4.0);
    float blink = step(0.75, fract(uTime * 0.45 + h.y));
    roof += TAIL * 2.0 * blink * exp(-dot(corner, corner) / 3.0);
    return mix(roof, HAZE, haze);
  }
  // 楼身：一层层的窗，越往下越隐进雾里
  vec2 q = uCam.xy + r * best;
  float down = (best - sr) * H;
  float along = face < 0.5 ? q.y - box.y : q.x - box.x;
  float floorAt = down / 0.95;
  float colAt = along / 0.7;
  float fl = fract(floorAt);
  float cl = fract(colAt);
  float win = smoothstep(0.1, 0.22, fl) * (1.0 - smoothstep(0.66, 0.78, fl)) * smoothstep(0.12, 0.25, cl) * (1.0 - smoothstep(0.75, 0.88, cl));
  float wh = hash1(vec2(floor(floorAt), floor(colAt)) + cell0 * 7.7);
  float lit = step(0.45, wh) * (0.55 + 0.45 * hash1(vec2(floor(colAt), floor(floorAt)) + 3.3));
  vec3 wcol = mix(WARM, COOL, step(0.65, hash1(cell0 + 8.1)));
  vec3 wall = GLASS * (face < 0.5 ? 0.75 : 1.05) + wcol * win * lit * 0.75 + wcol * 0.04;
  wall += rim * 0.5 * exp(-down / u / 1.2);
  wall = mix(wall, HAZE, smoothstep(0.0, FACADE_D, down) * 0.6);
  wall = mix(wall, col, smoothstep(FACADE_D * 0.45, FACADE_D, down));
  return mix(wall, HAZE, haze);
}

/** 楼间的空中航道：一串串亮点顺着航道飞，身后拖着短短的尾迹；u 是一个像素合这一层多少格 */
vec3 traffic(vec2 q, float u) {
  vec3 col = vec3(0.0);
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    vec2 dir = normalize(vec2(cos(fk * 2.1 + uSeed), sin(fk * 2.1 + uSeed)));
    vec2 n = vec2(-dir.y, dir.x);
    float off = dot(q, n) - (fk - 1.0) * 29.0;
    float lane = (mod(off + 20.0, 40.0) - 20.0) / u;
    float w = exp(-lane * lane / 2.0);
    if (w < 0.01) continue;
    float along = dot(q, dir) / u - uTime * (110.0 + fk * 30.0);
    float s = fract(along / 160.0 + hash1(vec2(floor((off + 20.0) / 40.0), fk)));
    float x = (s - 0.5) * 160.0;
    float body = exp(-x * x / 4.0);
    float trail = smoothstep(-26.0, 0.0, x) * step(x, 0.0) * 0.35;
    col += mix(HEAD, NEON_B, fk * 0.4) * w * (body * 2.2 + trail);
  }
  return col;
}

/** p 离幕墙内侧多远，厅里为正：uHall 是外接方形，uCut.x 是切角 */
float hallRoom(vec2 p) {
  float w = p.x - uHall.x;
  float e = uHall.z - p.x;
  float n = p.y - uHall.y;
  float s = uHall.w - p.y;
  float c = uCut.x;
  float side = min(min(w, e), min(n, s));
  float corner = min(min(w + n, e + n), min(w + s, e + s)) - c;
  return min(side, corner * 0.70710678);
}

vec2 deep(vec2 p, float d) {
  return uCam.xy + (p - uCam.xy) * (uCam.z + d) / uCam.z;
}

void main ()
{
  vec2 tc = outTexCoord;
  vec2 p = uRect.xy + vec2(tc.x, 1.0 - tc.y) * uRect.zw;
  // 瓷砖地面不透光，底下的城市不用画
  if (hallRoom(p) > uCut.y) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec3 col = ground(deep(p, GROUND_D), (uCam.z + GROUND_D) / uCam.z / PX);
  col = mix(col, HAZE, 0.14);
  col = towers(col, p, 62.0, 8.0, 0.32, 0.16);
  col += traffic(deep(p, 32.0), (uCam.z + 32.0) / uCam.z / PX) * 0.9;
  col = towers(col, p, 14.0, 20.0, 0.22, 0.0);
  col = vec3(1.0) - exp(-col * 1.5);
  gl_FragColor = vec4(col, 1.0);
}
`

/**
 * 地砖：每块瓷砖按数据图亮起谁的颜色——四边的光最亮、往里淡，刚踩上的那一下从中心往外扩一圈方框；亮着的瓷砖把光渗到相邻那一边。
 * 一道扫描线隔一阵扫过地面，扫到的瓷砖闪一下。只画瓷砖地面；输出按预乘透明度：亮起的颜色盖在瓷砖上，最亮的那一点往上加
 */
export const TILES_FRAG = `${HEADER}
uniform sampler2D uData;
uniform sampler2D uMask;
uniform float uTime;
uniform vec4 uScan;
uniform vec3 uTeam;
uniform vec3 uFoe;
${NOISE}
const float N = ${FRAME_U.toFixed(1)};

vec2 texel(vec2 cell) {
  return vec2((cell.x + 0.5) / N, 1.0 - (cell.y + 0.5) / N);
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
  vec3 d = texture2D(uData, texel(cell)).rgb;
  vec2 side = f.x < 0.5 ? vec2(-1.0, 0.0) : vec2(1.0, 0.0);
  vec2 side2 = f.y < 0.5 ? vec2(0.0, -1.0) : vec2(0.0, 1.0);
  vec3 nx = texture2D(uData, texel(cell + side)).rgb;
  vec3 ny = texture2D(uData, texel(cell + side2)).rgb;
  float h = hash1(cell);
  float wake = pow(max(0.0, sin(uTime * 0.45 + h * 6.2832)), 60.0);
  // 扫描线：x 是位置（格），y 是横扫（0）还是竖扫（1），z 是亮度
  float scanAt = uScan.y < 0.5 ? p.y : p.x;
  float scanCell = uScan.y < 0.5 ? cell.y + 0.5 : cell.x + 0.5;
  float scanNear = uScan.z * step(abs(scanCell - uScan.x), 4.0);
  // 这一块与挨着的两块都没亮、没在闪、扫描线也不在附近：什么都不画
  if (max(max(d.r, d.g), max(max(nx.r, nx.g), max(ny.r, ny.g))) + d.b + wake + scanNear < 0.004) {
    gl_FragColor = vec4(0.0);
    return;
  }
  float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
  float rim = exp(-edge / 0.05);
  // 亮起的瓷砖：四边一道亮线，往里一点再一道细线，中间只淡淡地染一层
  float seam = exp(-edge / 0.022);
  float inset = exp(-abs(edge - 0.11) / 0.012);
  float lit = 0.07 + 0.6 * seam + 0.4 * inset;
  float glow = max(d.r, d.g);
  vec3 tint = (uTeam * d.r + uFoe * d.g) / max(d.r + d.g, 0.001);
  // 隔壁亮着的瓷砖把光渗过缝来
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
  float idle = wake * 0.12 * rim;
  col += uTeam * idle;
  a += idle;
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
