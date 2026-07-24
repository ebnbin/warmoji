import { describe, expect, it } from 'vitest'
import type { StringStorage } from '../core/storage'
import { DEFAULT_SETTINGS, loadSettings, sanitizeSettings, saveSettings, SETTING_DEFS } from './settings'

function memStorage(): StringStorage {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  }
}

describe('settings', () => {
  it('默认值（肤色默认关，其余开）；无存储/损坏数据回退默认', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      damageNumbers: true,
      hitShake: true,
      sound: true,
      bgm: true,
      showSkinTone: false,
    })
    expect(loadSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    const s = memStorage()
    s.setItem('warmoji.settings.v1', '{oops')
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS)
  })

  it('逐字段容错：未知字段忽略、缺失字段回退、非布尔回退', () => {
    expect(sanitizeSettings({ damageNumbers: false, legacy: 1 })).toEqual({
      damageNumbers: false,
      hitShake: true,
      sound: true,
      bgm: true,
      showSkinTone: false,
    })
    expect(sanitizeSettings({ hitShake: 'yes' })).toEqual(DEFAULT_SETTINGS)
  })

  it('保存后可读回', () => {
    const s = memStorage()
    // showSkinTone 取非默认值（true），验证新字段确实被持久化并读回
    const saved = { damageNumbers: false, hitShake: false, sound: false, bgm: false, showSkinTone: true }
    saveSettings(s, saved)
    expect(loadSettings(s)).toEqual(saved)
  })

  it('定义表覆盖全部设置项且不重复（页面按此渲染）', () => {
    const keys = SETTING_DEFS.map((d) => d.key)
    expect([...keys].sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort())
    expect(new Set(keys).size).toBe(keys.length)
    for (const d of SETTING_DEFS) {
      expect(d.icon.length).toBeGreaterThan(0)
      expect(d.label.length).toBeGreaterThan(0)
      expect(d.desc.length).toBeGreaterThan(0)
    }
  })
})
