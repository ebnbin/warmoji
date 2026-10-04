import type { End, Spawn } from './draft'

/** 导航与参数里用到的图标 */
export const ICON = {
  team: '1f46a',
  rules: '1f4dc',
  curve: '1f4c8',
  recruit: '1f91d',
  shop: '1f6d2',
  legacy: '2694',
  repeat: '1f504',
  phase: '1f4d1',
  squad: '1f465',
  random: '1f3b2',
  remove: '274c',
  leader: '1f451',
  near: '1f440',
  far: '1f52d',
  ring: '2b55',
  behind: '1f519',
  point: '1f4cd',
  gate: '1f6aa',
} as const

interface Kind<T> {
  readonly icon: string
  readonly name: string
  /** 新加一条时的样子 */
  readonly make: () => T
}

/** 刷怪的几种写法 */
export const SPAWN_KINDS: { readonly [K in Spawn['kind']]: Kind<Extract<Spawn, { kind: K }>> } = {
  stream: { icon: '1f30a', name: '连续刷怪', make: () => ({ kind: 'stream' }) },
  batch: { icon: '1f6a8', name: '一队敌人', make: () => ({ kind: 'batch', atMs: 10_000, squad: { count: 6 } }) },
  waves: { icon: '1f501', name: '成组敌人', make: () => ({ kind: 'waves', atMs: 0, gapMs: 3_000, squads: [{ count: 6 }, { count: 10 }] }) },
}

/** 结束规则的几种写法 */
export const END_KINDS: { readonly [K in End['kind']]: Kind<Extract<End, { kind: K }>> } = {
  time: { icon: '23f1', name: '时限', make: () => ({ kind: 'time', ms: 60_000 }) },
  kills: { icon: '1f480', name: '击杀数', make: () => ({ kind: 'kills', count: 50 }) },
  cleared: { icon: '1f9f9', name: '清场', make: () => ({ kind: 'cleared' }) },
  boss: { icon: '1f451', name: '打倒头目', make: () => ({ kind: 'boss' }) },
  bossHp: { icon: '1fa78', name: '头目血量', make: () => ({ kind: 'bossHp', below: 0.5 }) },
  bounty: { icon: '1f3af', name: '悬赏目标', make: () => ({ kind: 'bounty' }) },
  hold: { icon: '1f6a9', name: '据点', make: () => ({ kind: 'hold', ms: 12_000, radius: 2, points: [{ dx: 0, dy: 0 }] }) },
  coins: { icon: '1fa99', name: '金币', make: () => ({ kind: 'coins', count: 30 }) },
  downs: { icon: '1f915', name: '倒下就输', make: () => ({ kind: 'downs', count: 3 }) },
}
