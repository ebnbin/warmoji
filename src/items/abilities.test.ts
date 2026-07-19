import { describe, expect, it } from 'vitest'
import { ABILITIES } from './abilities'
import { CHARACTERS } from '../characters/registry'
import type { CharacterId } from '../characters/registry'

const IDS = Object.keys(CHARACTERS) as CharacterId[]

describe('特殊能力定义', () => {
  it('每个角色恰好两个能力（一阶/二阶卡），均有图标/名字/描述', () => {
    for (const id of IDS) {
      expect(ABILITIES[id]).toHaveLength(2)
      for (const a of ABILITIES[id]) {
        expect(a.icon.length).toBeGreaterThan(0)
        expect(a.name.length).toBeGreaterThan(0)
        expect(a.desc.length).toBeGreaterThan(0)
      }
    }
  })
})
