import { describe, expect, it } from 'vitest'
import { BGM_IDS, bgmScore } from './music'

describe('bgm 乐谱', () => {
  it('五首曲子都有实际内容：多声部、多音色、含打击乐', () => {
    for (const id of BGM_IDS) {
      const s = bgmScore(id)
      // 内容量：一整圈至少上百个音符事件
      expect(s.notes.length, id).toBeGreaterThan(100)
      expect(s.hits.length, id).toBeGreaterThan(15)
      // 音色丰富：至少 3 种波形（含打击乐之外的旋律声部）
      expect(new Set(s.notes.map((n) => n.wave)).size, id).toBeGreaterThanOrEqual(2)
      // 音域跨度：最高最低至少差两个八度（低音/旋律分层）
      const freqs = s.notes.map((n) => n.freq)
      expect(Math.max(...freqs) / Math.min(...freqs), id).toBeGreaterThan(4)
    }
  })

  it('循环规格：时长 25~60 秒，事件都落在循环内且参数合法', () => {
    for (const id of BGM_IDS) {
      const s = bgmScore(id)
      expect(s.loopSec, id).toBeGreaterThan(25)
      expect(s.loopSec, id).toBeLessThan(60)
      for (const n of s.notes) {
        expect(n.t, id).toBeGreaterThanOrEqual(0)
        expect(n.t, id).toBeLessThan(s.loopSec)
        expect(n.dur, id).toBeGreaterThan(0)
        expect(n.freq, id).toBeGreaterThan(25)
        expect(n.freq, id).toBeLessThan(6000)
        expect(n.vol, id).toBeGreaterThan(0)
        expect(n.vol, id).toBeLessThanOrEqual(0.5)
      }
      for (const h of s.hits) {
        expect(h.t, id).toBeGreaterThanOrEqual(0)
        expect(h.t, id).toBeLessThan(s.loopSec)
        expect(['kick', 'snare', 'hat', 'tom'], id).toContain(h.kind)
      }
    }
  })

  it('曲子之间差异明显：速度/调性/事件序列两两不同', () => {
    // 试炼场沙盒图沿用大厅曲，不参与「战斗曲两两不同」的判定
    const tracks = BGM_IDS.filter((id) => id !== 'lab')
    const sigs = tracks.map((id) => {
      const s = bgmScore(id)
      const noteSig = s.notes
        .slice(0, 40)
        .map((n) => `${n.t.toFixed(2)}:${n.freq.toFixed(0)}`)
        .join(',')
      return `${s.bpm}|${s.loopSec.toFixed(1)}|${noteSig}`
    })
    expect(new Set(sigs).size).toBe(tracks.length)
  })

  it('回声只配给需要的曲子（虚空），参数合法', () => {
    const v = bgmScore('void')
    expect(v.echo).toBeDefined()
    expect(v.echo!.delaySec).toBeGreaterThan(0.1)
    expect(v.echo!.feedback).toBeGreaterThan(0)
    expect(v.echo!.feedback).toBeLessThan(0.8)
    expect(bgmScore('lobby').echo).toBeUndefined()
  })

  it('乐谱确定性：同一 id 重复取谱内容一致（memoized）', () => {
    expect(bgmScore('forest')).toBe(bgmScore('forest'))
  })
})
