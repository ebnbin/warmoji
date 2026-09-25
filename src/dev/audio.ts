import type { DevProvider } from '../devtools'
import { bgmStatus, playBgm } from '../audio/bgm'
import { playSfx, sfxStats } from '../audio/sfx'
import { MAP_IDS, MAPS } from '../data/maps'
import { SFX } from '../data/sfx'
import { keysOf } from '../util/record'

/** 游戏级：音频状态、音效试听与 BGM 切换 */
export function audioProvider(): DevProvider {
  return {
    id: 'audio',
    title: '音频',
    sections: [
      {
        id: 'audio',
        title: '音频',
        items: () => [
          {
            kind: 'text',
            mono: true,
            read: (): string => {
              const s = sfxStats()
              const b = bgmStatus()
              return [
                `音效 ${s.enabled ? '开' : '关'} · AudioContext ${s.state} · 已烘焙 ${s.baked} · 已播放 ${s.played} · 声部 ${s.active}/${s.max}`,
                `BGM ${b.enabled ? '开' : '关'} · 播放中 ${b.playing ?? '无'} · 期望 ${b.desired ?? '无'}`,
              ].join('\n')
            },
          },
          { kind: 'buttons', label: '试听音效', buttons: keysOf(SFX).map((id) => ({ label: id, run: () => playSfx(id) })) },
          {
            kind: 'buttons',
            label: '切换 BGM',
            buttons: [{ label: 'lobby', run: () => playBgm('lobby') }, ...MAP_IDS.map((id) => ({ label: MAPS[id].name, run: (): void => playBgm(id) }))],
          },
        ],
      },
    ],
  }
}
