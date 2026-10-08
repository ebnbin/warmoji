import { hslToInt } from '../../../src/util/palette.ts'
import type { MapDef } from '../../../src/types/maps'

export default {
  emoji: '1f3ad',
  name: '舞台',
  desc: '一座剧场的舞台，小小的旅人们就是台上演戏的角色，台面就是战场：顶上挂着红丝绒帷幔，两边垂着红丝绒大幕、一直垂到台边，台口一排脚灯，台下是乐池和一排排空椅子，台后挂着画好的天幕。台上铺着画好的地布：草地、小溪、沙滩、海水、晶砂、落叶、岩浆、冻海与浮冰都只是画，哪里都能走。台上立着布景片：花篱、栅栏、倒木、石灯笼、珊瑚、小晶丛、硫气孔、冰脊、雪堆齐腰，挡人不挡子弹，头目跨得过；樱花树、寺院、仙人掌、潜艇、残墙、塔楼、枫树、晶簇、巨晶、火山、冰山比人高，挡人也挡子弹和视线。隔一阵就换一幕：台上暗下来，每个角色头上一束追光、只照亮自己周围（队长的大一点），光圈里白花花的；角色被吊绳吊起来，吊着时不能动、不能打、也不会受伤；旧布景挂着吊绳一件件吊上去，地布与天幕从右边大幕后面推出新的一幅、把旧的推进左边大幕，台上的怪物和金币跟着地布一起被推进大幕、就此退场，没捡的金币也没了；新布景再一件件吊下来，角色原地放下，灯亮回来。一幕是故事的一章，春夏秋冬轮着来，每一幕是两处风景连在一起：春天小溪从有两层的草甸流进落满樱花的院子，夏天沙漠走到海滩、再到深海，秋天红叶落满的残垣边上是一口紫晶洞，冬天海岸一边是雪火山，熔岩一直淌进另一边漂着一块块浮冰的冻海。怪物从台上的活门里升上来，从台边爬上来，也从布景后面走出来',
  kind: 'theater',
  stamina: { exertion: 0.45, regen: 1 },
  palette: {
    bgFrom: 'hsl(356 40% 26%)',
    bgTo: 'hsl(350 40% 8%)',
    map: hslToInt(38, 0.45, 0.84),
  },
  // 台上的灯从左上方照下来，地布反光，背光面不暗；影子落在台上，暖褐色
  light: { sun: 0xfffaf0, shade: 0xd2c4b2, shadow: { color: 0x3b2614, alpha: 0.32, length: 0.7 } },
  decor: {
    emojis: ['1f3ad'],
    sizeU: [0.3, 0.5],
    alpha: [0, 0],
    density: [0, 0],
  },
  foes: ['comedyMask', 'tragedyMask', 'madClown', 'spadeGuard', 'usher', 'flirt', 'matryoshka', 'cheshire'],
  // 从台上的活门里升上来、从台边爬上来、从布景后面走出来、从地布底下钻出来；提线之手与鬼牌从活门里升上来
  gates: {
    snapU: 3,
    fallback: 'rise',
    look: 'paper',
    boss: 'trap',
    kinds: {
      trap: { name: '活门', at: { kind: 'mark' }, enter: 'rise', look: 'paper', snapU: 1, weight: 3, perSec: 1.5 },
      edge: { name: '台边', at: { kind: 'rim', segU: 3 }, enter: 'climb', look: 'paper', weight: 3, perSec: 1.5, only: ['zombie', 'rat', 'skeleton', 'knight', 'mushroom', 'raccoon', 'elf', 'comedyMask', 'tragedyMask', 'madClown', 'spadeGuard'] },
      wings: { name: '布景后', at: { kind: 'mark' }, enter: 'walk', look: 'paper', snapU: 5, weight: 3, perSec: 1, only: ['zombie', 'skeleton', 'knight', 'rat', 'raccoon', 'elf', 'gargoyle', 'mushroom', 'comedyMask', 'tragedyMask', 'spadeGuard', 'usher', 'flirt', 'cheshire'] },
      print: { name: '地布下', at: { kind: 'ground' }, enter: 'rise', look: 'paper', weight: 1 },
    },
  },
  theater: {
    size: { wU: 36, hU: 27 },
    plazaU: 4.5,
    margin: { tall: 2.6, low: 1.7, aisle: 1.2 },
    gapU: { tall: 2.7, low: 1.7 },
    lowM: 1,
    pieces: [14, 19],
    turn: { firstMs: 20000, intervalMs: 20000, jitterMs: 0, lightMs: 700, staggerMs: 900, flyMs: 900, slideMs: 1600 },
    reflowMs: 300,
  },
  bosses: ['puppeteer', 'joker'],
} as const satisfies MapDef
