import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { EnemyDef } from '../../../../legacy/types/enemies'
import { patch, shot } from '../../../kit.ts'
import SPIDERLING from './spiderling.ts'
import SPIDER_EGG from './spiderEgg.ts'

const VENOM = 0x9ccc65

const webShot = {
  trigger: 'auto',
  cooldownMs: 2200,
  firstDelayMs: 1000,
  aim: 'nearest',
  range: 9,
  damage: 8,
  fireSfx: 'shoot',
  shape: { kind: 'bolt', projectile: shot('1f578', 7, 0.6), lifeMs: 2500 },
  repeat: { count: 3, spreadDeg: 30 },
} satisfies AbilityDef

const eggSac = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 9000,
  firstDelayMs: 3000,
  aim: 'self',
  fireSfx: 'gulp',
  shape: { kind: 'world' },
  onHit: [
    { kind: 'summon', of: { unit: SPIDERLING, spread: 1.6 }, count: 3 },
    { kind: 'summon', of: { unit: SPIDER_EGG, spread: 5 }, count: 3 },
  ],
} satisfies AbilityDef

const webWarp = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 8000,
  firstDelayMs: 10_000,
  aim: 'self',
  fireSfx: 'warp',
  windup: { ms: 600, lockAt: 'start', telegraph: 'blink' },
  shape: { kind: 'world' },
  onHit: [
    {
      kind: 'teleport',
      of: 'spiderWeb',
      then: [
        { kind: 'to', who: { side: 'foes', radius: 2.8 }, then: [{ kind: 'root', durationMs: 1400 }, { kind: 'damage', amount: 12 }] },
        { kind: 'ground', def: patch(2.8, 5000, VENOM, undefined, 3, 500) },
      ],
    },
  ],
} satisfies AbilityDef

const webDrop = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 5000,
  firstDelayMs: 1500,
  aim: 'nearest',
  range: 8,
  damage: 5,
  fireSfx: 'flutter',
  shape: { kind: 'drop', targets: 3, look: { emoji: '1f578', size: 1.2 }, fromAbove: 3, dropMs: 700, staggerMs: 200 },
  onHit: [{ kind: 'root', durationMs: 800 }, { kind: 'ground', def: patch(1.4, 5000, VENOM, undefined, 3, 500) }],
} satisfies AbilityDef

const fangs = {
  trigger: 'auto',
  cooldownMs: 1600,
  firstDelayMs: 600,
  aim: 'nearest',
  range: 2.8,
  damage: 18,
  fireSfx: 'gulp',
  windup: { ms: 350, lockAt: 'end', telegraph: 'shake' },
  shape: { kind: 'segment', reach: 2.6, radius: 0.7, ms: 160 },
} satisfies AbilityDef

const SPIDER_QUEEN = {
  kind: 'spiderQueen',
  role: 'boss',
  emoji: '1f577',
  name: '蛛后',
  element: 'poison',
  desc: '盘踞林子深处的蛛后，本身是毒、毒不倒她，却怕火：远远吐出三道毒丝，打中一下叠一层中毒，中了毒什么回复都不管用；隔一阵在身边孵出 3 只小蜘蛛，再往四周产下 3 窝湿漉漉的蜘蛛卵，卵 6 秒内不打破就结成缠人的蜘蛛网，卵和网都是湿的，一电一片；隔一阵瞬移到离人最近的蜘蛛网旁，把 2.8 格内的人缠住 1.4 秒，脚下喷出一团 2.8 格的毒雾，留 5 秒；血少于六成往 3 个人头上吊下毒网，罩中的定身 0.8 秒，落处留下一团 1.4 格的毒雾；少于三成狂乱着贴身追咬，一口一层毒；毒雾里的人每半秒掉血、叠一层中毒，火打进毒雾就炸开，连她带小蜘蛛一起炸',
  size: 3.4,
  radius: 1.1,
  span: [0, 6],
  hp: 4000,
  stats: { armor: 3, exertion: 0 },
  speed: 1.15,
  damage: 18,
  xp: 60,
  coins: 60,
  traits: ['anchored', 'wary'],
  drive: { kind: 'standoff', standoffDist: 4 },
  abilities: [webShot, eggSac, webWarp],
  phases: [
    { below: 0.6, name: '织网', abilities: [webShot, eggSac, webWarp, webDrop] },
    { below: 0.3, name: '狂乱', abilities: [webShot, eggSac, webWarp, webDrop, fangs], drive: { kind: 'chase' }, stats: { mul: { moveSpeed: 1.25, cooldown: 0.7 } }, effects: [{ kind: 'unstoppable', durationMs: 2000 }] },
  ],
} satisfies EnemyDef

export default SPIDER_QUEEN
