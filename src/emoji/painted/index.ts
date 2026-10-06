import { render } from './design.ts'
import type { Design, Drawn, Rig } from './design.ts'
import { COWBOY, FIREFIGHTER, JUGGLER, UNICORN } from './cast.ts'
import { BOMB, CROC, EYE, GHOST, PUFFER, RAT, SKULL, VILLAIN, ZOMBIE } from './foes.ts'
import { BUFFALO, ELEPHANT, GIRAFFE, RHINO, ZEBRA } from './beasts.ts'
import { AXE, BLUE_ORB, DROP, PISTOL, TOMATO, VIOLET_ORB, WAVE } from './gear.ts'
import type { AnimClipId } from '../../types/anim'

/** 新画风画了的 emoji，按码位；没画的一律用 Twemoji */
export const PAINTED: Readonly<Record<string, Design>> = {
  '1f939': JUGGLER,
  '1f984': UNICORN,
  '1f9d1_200d_1f692': FIREFIGHTER,
  '1f920': COWBOY,
  '1f9df': ZOMBIE,
  '1f480': SKULL,
  '1f400': RAT,
  '1f47b': GHOST,
  '1f421': PUFFER,
  '1f441': EYE,
  '1f4a3': BOMB,
  '1f9b9': VILLAIN,
  '1f40a': CROC,
  '1fa93': AXE,
  '1f52b': PISTOL,
  '1f345': TOMATO,
  '1f4a7': DROP,
  '1f7e3': VIOLET_ORB,
  '1f535': BLUE_ORB,
  '1f30a': WAVE,
  '1f418': ELEPHANT,
  '1f98f': RHINO,
  '1f403': BUFFALO,
  '1f993': ZEBRA,
  '1f992': GIRAFFE,
}

const drawn = new Map<string, Drawn>()

/** 画好的一张：defs 在前，之后每层一个顶层元素；没画过返回 undefined */
export function paintedDrawn(id: string): Drawn | undefined {
  const d = PAINTED[id]
  if (!d) return undefined
  let hit = drawn.get(id)
  if (!hit) {
    hit = render(id, d)
    drawn.set(id, hit)
  }
  return hit
}

/** 这张图的一段动画怎么绑；图里要动的部件没绑时返回 undefined */
export function paintedRig(id: string, clip: AnimClipId): Rig | undefined {
  return PAINTED[id]?.rig?.[clip]
}
