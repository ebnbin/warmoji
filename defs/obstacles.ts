import type { ObstacleTuning } from '../src/types/obstacles'

export const OBSTACLES = {
  body: { refRadiusU: 0.45, heightM: 1.7, layers: 3, step: 0.35 },
  blastM: 0.6,
  materials: {
    // 溶洞的洞壁、石柱与大石笋
    rock: { name: '岩体', phase: true, opaque: true, pierce: null, strength: null },
    // 旧残垣的断墙：一格一格的，破坏力碰上就碎
    wall: { name: '断墙', phase: true, opaque: true, pierce: null, strength: 1 },
    // 残垣的石墙与石柱
    masonry: { name: '砌石', phase: true, opaque: true, pierce: null, strength: 1 },
    // 残垣里封门窗的木板
    timber: { name: '木板', phase: true, opaque: true, pierce: 1, strength: 0.25 },
    // 塌墙扬起的尘雾：只挡视线
    dust: { name: '尘雾', phase: true, opaque: true, pierce: 0, strength: null },
    // 沙漠的标志物：只挡身体，弹体与视线从上面过去
    landmark: { name: '标志物', phase: true, opaque: false, pierce: 0, strength: null },
    // 技能立的墙：看得穿，挡身体与弹体按它自己的规则
    barrier: { name: '技能墙', phase: true, opaque: false, pierce: null, strength: null },
  },
} as const satisfies ObstacleTuning
