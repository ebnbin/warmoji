import type { WeaponSource } from '../src/data/weapons'

// 创作层（不进运行时 bundle）：武器数据行。生成 src/assets/weapons.json。
// 武器包装一个纯行为 Ability，自带升级路径（base + 两档，每档一张升级卡）。
// 能力以 id 引用能力表；gen 校验引用存在。

export const WEAPONS = {
  axe: {
    name: '巨斧横扫',
    emoji: '1fa93',
    base: 'axeSweep',
    upgrades: [
      { ability: 'axeSweep2', card: { icon: '1f300', name: '全周横扫', desc: '巨斧扫过整整一圈，攻击四面八方的敌人' } },
      { ability: 'axeSweep3', card: { icon: '1f976', name: '震慑余波', desc: '被横扫命中的敌人减速 45%，持续 1.2 秒' } },
    ],
  },
  pistolLeft: {
    name: '左轮水枪·左',
    emoji: '1f52b',
    base: 'pistolLeft',
    upgrades: [
      { ability: 'pistolLeft2', card: { icon: '1f3af', name: '贯穿弹', desc: '水弹贯穿敌人，沿途最多命中 3 名' } },
      { ability: 'pistolLeft3', card: { icon: '1f52b', name: '左轮风暴', desc: '每把枪每第 4 次射击变为 5 发扇形弹幕' } },
    ],
  },
  pistolRight: {
    name: '左轮水枪·右',
    emoji: '1f52b',
    base: 'pistolRight',
    upgrades: [
      { ability: 'pistolRight2', card: { icon: '1f3af', name: '贯穿弹', desc: '水弹贯穿敌人，沿途最多命中 3 名' } },
      { ability: 'pistolRight3', card: { icon: '1f52b', name: '左轮风暴', desc: '每把枪每第 4 次射击变为 5 发扇形弹幕' } },
    ],
  },
  boomerang: {
    name: '回旋镖',
    emoji: '1fa83',
    base: 'boomerang',
    upgrades: [
      { ability: 'boomerang2', card: { icon: '1fa83', name: '双子回旋', desc: '同时向相反方向掷出第二枚回旋镖' } },
      { ability: 'boomerang3', card: { icon: '1f9f2', name: '磁力巨镖', desc: '回旋镖增大 40%，并沿途吸取金币' } },
    ],
  },
  laserBeam: {
    name: '贯穿激光',
    emoji: '1f526',
    base: 'laserBeam',
    upgrades: [
      { ability: 'laserBeam2', card: { icon: '1f52d', name: '双联光束', desc: '开火时向正后方同步射出第二道光束' } },
      { ability: 'laserBeam3', card: { icon: '1f4e1', name: '全域扫射', desc: '光束改为绕自身一周的 8 向扫射，每束 60% 伤害' } },
    ],
  },
  dagger: {
    name: '影袭',
    emoji: '1f5e1',
    base: 'shadowStrike',
    upgrades: [
      { ability: 'shadowStrike2', card: { icon: '1f300', name: '连环刃', desc: '斩击同时命中目标周围一圈，波及 60% 伤害' } },
      { ability: 'shadowStrike3', card: { icon: '2620', name: '处决', desc: '目标血量低于 35% 时，斩击伤害翻倍' } },
    ],
  },
} as const satisfies Record<string, WeaponSource>
