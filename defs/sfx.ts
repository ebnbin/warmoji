import type { SfxDef } from '../src/data/sfx'

// 程序化音效参数表（创作层·游戏内容）：迷你 sfxr 风格合成器的逐条声音定义。
// 合成/播放/节流逻辑在 src/audio/sfx.ts，这里只放声音参数——经 gen 校验产出 sfx.json。
export const SFX = {
  /** 投掷/射击（子弹类能力出手） */
  shoot: { wave: 'square', freq: 900, freqEnd: 430, duration: 0.07, volume: 0.16, decayPow: 1.4, throttleMs: 45, jitter: 0.12 },
  /** 激光 */
  zap: { wave: 'sawtooth', freq: 1500, freqEnd: 280, duration: 0.12, volume: 0.15, throttleMs: 70, jitter: 0.08 },
  /** 突刺/横扫/回旋镖挥出 */
  whoosh: { wave: 'noise', freq: 1400, freqEnd: 240, duration: 0.12, volume: 0.3, throttleMs: 60, jitter: 0.15 },
  /** 轰炸爆炸 */
  boom: { wave: 'noise', freq: 420, freqEnd: 45, duration: 0.34, volume: 0.55, decayPow: 2, throttleMs: 90, jitter: 0.1 },
  /** 敌人受击 */
  hit: { wave: 'square', freq: 320, freqEnd: 160, duration: 0.045, volume: 0.12, throttleMs: 50, jitter: 0.2 },
  /** 敌人死亡（碎裂 pop） */
  kill: { wave: 'triangle', freq: 560, freqEnd: 70, duration: 0.16, volume: 0.3, throttleMs: 40, jitter: 0.15 },
  /** 金币拾取（双音 ding） */
  coin: { wave: 'square', freq: 988, duration: 0.09, volume: 0.14, steps: [1, 1.498], throttleMs: 35, jitter: 0.06 },
  /** 队员受伤 */
  hurt: { wave: 'square', freq: 200, freqEnd: 90, duration: 0.2, volume: 0.32, throttleMs: 150 },
  /** 队员复活（上行扫频） */
  revive: { wave: 'sine', freq: 280, freqEnd: 880, duration: 0.28, volume: 0.3, attack: 0.05 },
  /** 队伍升级（上行琶音） */
  levelup: { wave: 'square', freq: 523, duration: 0.34, volume: 0.22, steps: [1, 1.26, 1.5, 2], throttleMs: 200 },
  /** 波次完成小号角 */
  wave: { wave: 'square', freq: 392, duration: 0.5, volume: 0.24, steps: [1, 1.26, 1.5, 2, 1.5, 2] },
  /** 游戏结束（下行） */
  over: { wave: 'sawtooth', freq: 392, freqEnd: 80, duration: 0.7, volume: 0.26, decayPow: 1.2 },
  /** 购买道具 */
  buy: { wave: 'square', freq: 660, duration: 0.11, volume: 0.2, steps: [1, 1.33], throttleMs: 80 },
  /** 角色升级 */
  upgrade: { wave: 'square', freq: 523, duration: 0.16, volume: 0.2, steps: [1, 1.5], throttleMs: 80 },
  /** 招募入队 */
  recruit: { wave: 'square', freq: 440, duration: 0.24, volume: 0.22, steps: [1, 1.26, 1.6], throttleMs: 120 },
  /** 通用 UI 点击 */
  click: { wave: 'square', freq: 760, freqEnd: 660, duration: 0.035, volume: 0.12, throttleMs: 40 },
} as const satisfies Record<string, SfxDef>
