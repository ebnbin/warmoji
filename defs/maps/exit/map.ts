import { hslToInt } from '../../../src/util/palette.ts'
import type { MapDef } from '../../../src/types/maps'

export default {
  emoji: '1f300',
  name: '出口',
  desc: '一座悬在虚空里的实验迷宫：方框里挤满了舱室，一般八到十一间，偶尔只有六七间、间间更大，舱与舱之间只隔一道望得见底的虚空的缝，只能靠门来往。每间舱室的地上漆着门牌号，墙边一个入口、两三扇门，每扇门开在朝它通往的那一间的墙上，门上写着那一间的门牌，箭头指着要飞去的方向；队长踏上一扇门，门充满能，整支队伍连同召唤物散成光块，顺着最近的路飞过虚空——往外飞，也只会从另一头飞回来——落到那一间的入口上。路是单向的：从哪扇门来，那一间都没有门通回去。每间都有一扇挂着绿色「出口」牌的门，顺着出口一直走，会走遍所有舱室，再回到原来那间。只有队伍那间和刚走过的两间亮着：所在的那间全亮，上一间暗一半，再上一间只剩一点光，别的舱室全黑，只隐约看得见地上一格格的瓷砖，门、东西和敌人都看不见。敌人只在这三间出，这三间里的敌人顺着门一间间追过来；黑着的舱室里敌人定在原地，等你绕回来、灯亮起来才接着动。亮着的舱室里，每扇门隔一阵发一趟车，台上站着的敌人一起送走。舱室按四季分成四片，颜色、出的敌人不同，每间的标本罐里泡着那一季的一件东西；角上的监控一直盯着你',
  kind: 'exit',
  stamina: { exertion: 0.4, regen: 1.1 },
  palette: {
    bgFrom: 'hsl(222 52% 14%)',
    bgTo: 'hsl(232 60% 4%)',
    map: hslToInt(192, 0.36, 0.86),
  },
  // 光从左上方的顶灯照下来，地砖与门又从下面把身体照亮，背光面泛着冷蓝；影子淡
  light: { sun: 0xf6fbff, shade: 0x7e93b8, shadow: { color: 0x07142a, alpha: 0.28, length: 0.55 } },
  // 标本罐里泡着的东西：草甸的小花、樱花图的樱花、沙漠的驼骨、深海的气泡、残垣的枫叶、紫水晶、火山、浮冰的冰块
  decor: {
    emojis: ['1f33c', '1f338', '1f9b4', '1fae7', '1f341', '1f48e', '1f30b', '1f9ca'],
    sizeU: [0.3, 0.5],
    alpha: [0, 0],
    density: [0, 0],
  },
  foes: ['smiley', 'commuter', 'stander', 'zipper', 'poster', 'upsideDown', 'mouthless', 'floatingSuit'],
  // 每间舱室的出怪板按那一季的配方只放出那几种：一季幽灵、一季肉盾、一季成群的小东西、一季什么都有；吸附半径盖满整张图，敌人按种类去配方接它的那几间。头目从队伍那间的天花板上落下来
  gates: {
    snapU: 60,
    fallback: 'rise',
    look: 'glow',
    boss: 'warden',
    kinds: {
      ghosts: { name: '幽灵舱', at: { kind: 'mark' }, enter: 'rise', look: 'glow', weight: 3, perSec: 1.5, only: ['ghost', 'chameleon', 'siren', 'stander', 'zipper', 'upsideDown', 'mouthless'] },
      tanks: { name: '重甲舱', at: { kind: 'mark' }, enter: 'rise', look: 'glow', weight: 3, perSec: 1.5, only: ['crab', 'gargoyle', 'turtle', 'poster', 'floatingSuit'] },
      swarm: { name: '虫群舱', at: { kind: 'mark' }, enter: 'rise', look: 'glow', weight: 3, perSec: 1.5, only: ['alien', 'locust', 'blob', 'hive', 'smiley', 'commuter'] },
      mixed: { name: '混编舱', at: { kind: 'mark' }, enter: 'rise', look: 'glow', weight: 1 },
      warden: { name: '看守', at: { kind: 'mark' }, enter: 'drop', look: 'glow', weight: 1, only: ['mecha', 'watcher', 'reactor'] },
    },
  },
  exit: {
    maze: {
      colU: [14, 18],
      rows: [
        { n: 2, u: [18, 30] },
        { n: 3, u: [12, 20] },
        { n: 4, u: [12, 12] },
      ],
      rooms: [8, 11],
      fewP: 0.15,
      few: [6, 7],
      gapU: 0.5,
      lipU: 0.5,
      extraP: 0.5,
    },
    neckU: 0.4,
    racks: { minU: 11, sizeU: 1, heightM: 2.2, stepU: 4, clearU: 1.2 },
    pit: { minU: 12, marginU: 4 },
    pad: { radiusU: 1.4, insetU: 0.2, cornerU: 4.5, chargeMs: 1300, drainMs: 700, transitMs: 650, shuttleMs: 4000, warnMs: 900, spillU: 3.5 },
    emitters: { plateU: 2, markU: 0.6, clearU: 3 },
    recipes: ['ghosts', 'tanks', 'swarm', 'mixed'],
    jar: { sizeU: 1.4 },
    hopU: 8,
    light: { levels: [1, 0.5, 0.25], wakeMs: 500, dimMs: 1600 },
    tiles: { teamFadeMs: 4500, foeFadeMs: 2600 },
  },
  bosses: ['watcher', 'reactor'],
} as const satisfies MapDef
