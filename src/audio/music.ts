import type { MapId } from '../types/maps'

export type BgmId = 'lobby' | MapId

export interface BgmNote {
  /** 循环内起始秒 */
  t: number
  dur: number
  freq: number
  wave: 'square' | 'triangle' | 'sine' | 'sawtooth'
  vol: number
  attack: number
  release: number
  /** 无回声配置的曲子忽略 */
  echo?: boolean
}

type BgmHitKind = 'kick' | 'snare' | 'hat' | 'tom'

export interface BgmHit {
  t: number
  kind: BgmHitKind
  vol: number
}

export interface BgmScore {
  id: BgmId
  bpm: number
  loopSec: number
  notes: BgmNote[]
  hits: BgmHit[]
  echo?: { delaySec: number; feedback: number; level: number }
}

// ── 写谱工具 ────────────────────────────────────────────────

const MAJOR = [0, 2, 4, 5, 7, 9, 11] as const
const DORIAN = [0, 2, 3, 5, 7, 9, 10] as const
const AEOLIAN = [0, 2, 3, 5, 7, 8, 10] as const
const PHRYGIAN_DOM = [0, 1, 4, 5, 7, 8, 10] as const

interface Voice {
  wave: BgmNote['wave']
  vol: number
  attack: number
  release: number
  octave: number
  echo?: boolean
}

/** [小节, 步, 音阶度数（可越八度/为负）, 时值步数] */
type Line = readonly (readonly [number, number, number, number])[]

class Builder {
  notes: BgmNote[] = []
  hits: BgmHit[] = []
  constructor(
    private readonly rootMidi: number,
    private readonly scale: readonly number[],
    private readonly stepSec: number,
    private readonly stepsPerBar: number,
  ) {}

  /** 度数越界自动进出八度 */
  private freq(deg: number, octave: number): number {
    const n = this.scale.length
    const idx = ((deg % n) + n) % n
    const midi = this.rootMidi + this.scale[idx]! + (Math.floor(deg / n) + octave) * 12
    return 440 * Math.pow(2, (midi - 69) / 12)
  }

  note(v: Voice, bar: number, step: number, deg: number, durSteps: number, detune = 1): void {
    this.notes.push({
      t: (bar * this.stepsPerBar + step) * this.stepSec,
      // 0.92 留门隙，同度连音不粘连
      dur: durSteps * this.stepSec * 0.92,
      freq: this.freq(deg, v.octave) * detune,
      wave: v.wave,
      vol: v.vol,
      attack: v.attack,
      release: v.release,
      echo: v.echo,
    })
  }

  line(v: Voice, entries: Line): void {
    for (const [bar, step, deg, dur] of entries) this.note(v, bar, step, deg, dur)
  }

  /** 模式串：r=根音 t=三音 f=五音 o=高八度根音 .=休止 -=延长前音 */
  bass(v: Voice, chords: readonly number[], pattern: string): void {
    const tone: Record<string, number> = { r: 0, t: 2, f: 4, o: 7 }
    for (let bar = 0; bar < chords.length; bar++) {
      const root = chords[bar]!
      let last: BgmNote | undefined
      for (let s = 0; s < pattern.length; s++) {
        const ch = pattern[s]!
        if (ch === '-' && last) last.dur += this.stepSec
        else if (ch in tone) {
          this.note(v, bar, s, root + tone[ch]!, 1)
          last = this.notes[this.notes.length - 1]
        } else last = undefined
      }
    }
  }

  /** seq：0 根 1 三 2 五 3 高八度根 4 高八度三… */
  arp(v: Voice, chords: readonly number[], seq: readonly number[], fromBar = 0, toBar = chords.length): void {
    let i = 0
    for (let bar = fromBar; bar < toBar; bar++) {
      const root = chords[bar]!
      for (let s = 0; s < this.stepsPerBar; s++) {
        const tone = seq[i % seq.length]!
        this.note(v, bar, s, root + (tone % 3) * 2 + Math.floor(tone / 3) * 7, 1)
        i++
      }
    }
  }

  /** tones 为和弦音索引；detune>0 时每音叠一条微升影子音 */
  pad(v: Voice, chords: readonly number[], tones: readonly number[], detune = 0): void {
    for (let bar = 0; bar < chords.length; bar++) {
      for (const tone of tones) {
        const deg = chords[bar]! + (tone % 3) * 2 + Math.floor(tone / 3) * 7
        this.note(v, bar, 0, deg, this.stepsPerBar)
        if (detune > 0) this.note(v, bar, 0, deg, this.stepsPerBar, 1 + detune)
      }
    }
  }

  /** [fromBar, toBar)；模式串：x=重击 o=轻击 .=休止 */
  drums(kind: BgmHitKind, pattern: string, fromBar: number, toBar: number, vol: number): void {
    for (let bar = fromBar; bar < toBar; bar++) {
      for (let s = 0; s < pattern.length; s++) {
        const ch = pattern[s]
        if (ch === 'x' || ch === 'o') {
          this.hits.push({
            t: (bar * this.stepsPerBar + s) * this.stepSec,
            kind,
            vol: ch === 'x' ? vol : vol * 0.55,
          })
        }
      }
    }
  }
}

function track(
  id: BgmId,
  opts: {
    bpm: number
    /** 每拍步数（8 分音符网格 = 2；6/8 曲直接以 8 分为拍 = 1） */
    stepsPerBeat: number
    stepsPerBar: number
    bars: number
    rootMidi: number
    scale: readonly number[]
    echo?: BgmScore['echo']
  },
  build: (b: Builder) => void,
): BgmScore {
  const stepSec = 60 / opts.bpm / opts.stepsPerBeat
  const b = new Builder(opts.rootMidi, opts.scale, stepSec, opts.stepsPerBar)
  build(b)
  return {
    id,
    bpm: opts.bpm,
    loopSec: opts.bars * opts.stepsPerBar * stepSec,
    notes: b.notes,
    hits: b.hits,
    echo: opts.echo,
  }
}

// ── 曲目 ────────────────────────────────────────────────

function buildLobby(): BgmScore {
  const chords = [0, 5, 3, 4, 0, 5, 3, 4, 3, 4, 2, 5, 1, 4, 0, 0]
  return track(
    'lobby',
    { bpm: 96, stepsPerBeat: 2, stepsPerBar: 8, bars: 16, rootMidi: 60, scale: MAJOR },
    (b) => {
      const bass: Voice = { wave: 'triangle', vol: 0.17, attack: 0.01, release: 0.06, octave: -2 }
      const pad: Voice = { wave: 'square', vol: 0.045, attack: 0.08, release: 0.35, octave: -1 }
      const lead: Voice = { wave: 'triangle', vol: 0.15, attack: 0.012, release: 0.08, octave: 0 }
      b.bass(bass, chords, 'r...f...')
      b.pad(pad, chords, [0, 1, 2])
      b.line(lead, [
        // A 段
        [0, 0, 2, 2], [0, 2, 1, 2], [0, 4, 0, 2], [0, 6, 1, 2],
        [1, 0, 2, 4], [1, 4, 4, 3],
        [2, 0, 5, 2], [2, 2, 4, 2], [2, 4, 2, 2], [2, 6, 4, 2],
        [3, 0, 2, 2], [3, 2, 1, 2], [3, 4, 1, 4],
        [4, 0, 2, 2], [4, 2, 1, 2], [4, 4, 0, 2], [4, 6, 1, 2],
        [5, 0, 2, 4], [5, 4, 4, 4],
        [6, 0, 5, 2], [6, 2, 6, 2], [6, 4, 7, 3],
        [7, 0, 4, 6],
        // B 段
        [8, 0, 7, 2], [8, 2, 6, 2], [8, 4, 5, 2], [8, 6, 6, 2],
        [9, 0, 4, 4], [9, 4, 6, 2], [9, 6, 7, 2],
        [10, 0, 6, 2], [10, 2, 5, 2], [10, 4, 4, 2], [10, 6, 2, 2],
        [11, 0, 5, 6],
        [12, 0, 1, 2], [12, 2, 3, 2], [12, 4, 5, 2], [12, 6, 3, 2],
        [13, 0, 4, 2], [13, 2, 2, 2], [13, 4, 1, 4],
        [14, 0, 0, 8],
        // 第 16 小节留白
      ])
      b.drums('hat', '..x...x.', 0, 16, 0.06)
      b.drums('kick', 'x.......', 8, 16, 0.14)
    },
  )
}

function buildForest(): BgmScore {
  const chords = [0, 2, 6, 3, 0, 2, 6, 3, 2, 3, 6, 0, 0, 2, 6, 3]
  return track(
    'forest',
    { bpm: 128, stepsPerBeat: 2, stepsPerBar: 8, bars: 16, rootMidi: 52, scale: DORIAN },
    (b) => {
      const bass: Voice = { wave: 'square', vol: 0.12, attack: 0.008, release: 0.04, octave: -1 }
      const arp: Voice = { wave: 'triangle', vol: 0.07, attack: 0.006, release: 0.05, octave: 1 }
      const lead: Voice = { wave: 'square', vol: 0.12, attack: 0.01, release: 0.06, octave: 1 }
      b.bass(bass, chords, 'r.r.r.ro')
      b.arp(arp, chords, [0, 1, 2, 3, 2, 1])
      b.line(lead, [
        // A 段
        [0, 0, 0, 1], [0, 1, 1, 1], [0, 2, 2, 2], [0, 4, 4, 2], [0, 6, 3, 2],
        [1, 0, 2, 2], [1, 2, 4, 2], [1, 4, 7, 3], [1, 7, 6, 1],
        [2, 0, 6, 2], [2, 2, 5, 2], [2, 4, 4, 4],
        [3, 0, 3, 6], [3, 6, 4, 1], [3, 7, 5, 1],
        [4, 0, 0, 1], [4, 1, 1, 1], [4, 2, 2, 2], [4, 4, 4, 2], [4, 6, 3, 2],
        [5, 0, 2, 2], [5, 2, 4, 2], [5, 4, 7, 4],
        [6, 0, 6, 2], [6, 2, 5, 2], [6, 4, 4, 4],
        [7, 0, 3, 4], [7, 4, 2, 2], [7, 6, 1, 2],
        // B 段
        [8, 0, 7, 2], [8, 2, 8, 2], [8, 4, 9, 4],
        [9, 0, 10, 2], [9, 2, 9, 2], [9, 4, 8, 4],
        [10, 0, 9, 2], [10, 2, 8, 2], [10, 4, 6, 2], [10, 6, 4, 2],
        [11, 0, 7, 6],
        // A' 段
        [12, 0, 0, 1], [12, 1, 1, 1], [12, 2, 2, 2], [12, 4, 4, 2], [12, 6, 3, 2],
        [13, 0, 2, 2], [13, 2, 4, 2], [13, 4, 7, 4],
        [14, 0, 6, 2], [14, 2, 5, 2], [14, 4, 4, 4],
        [15, 0, 3, 2], [15, 2, 2, 2], [15, 4, 0, 4],
      ])
      b.drums('kick', 'x...x...', 0, 16, 0.3)
      b.drums('snare', '....x...', 0, 16, 0.18)
      b.drums('hat', 'x.x.x.x.', 0, 16, 0.07)
      b.drums('snare', '......xx', 7, 8, 0.16)
      b.drums('snare', '....x.xx', 15, 16, 0.16)
    },
  )
}

function buildDesert(): BgmScore {
  const chords = [0, 0, 1, 0, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 0]
  return track(
    'desert',
    { bpm: 100, stepsPerBeat: 2, stepsPerBar: 8, bars: 16, rootMidi: 45, scale: PHRYGIAN_DOM },
    (b) => {
      const bass: Voice = { wave: 'triangle', vol: 0.18, attack: 0.012, release: 0.08, octave: 0 }
      const drone: Voice = { wave: 'square', vol: 0.038, attack: 0.12, release: 0.5, octave: 1 }
      const lead: Voice = { wave: 'sawtooth', vol: 0.1, attack: 0.015, release: 0.09, octave: 2 }
      b.bass(bass, chords, 'r..r..f.')
      b.pad(drone, chords, [0, 2])
      b.line(lead, [
        // A 段
        [0, 0, 4, 2], [0, 2, 3, 1], [0, 3, 2, 1], [0, 4, 3, 4],
        [1, 0, 2, 1], [1, 1, 1, 1], [1, 2, 0, 4],
        [2, 4, 5, 2], [2, 6, 4, 2],
        [3, 0, 3, 1], [3, 1, 2, 1], [3, 2, 1, 1], [3, 3, 2, 1], [3, 4, 0, 4],
        [4, 0, 4, 2], [4, 2, 3, 1], [4, 3, 2, 1], [4, 4, 3, 4],
        [5, 0, 7, 2], [5, 2, 6, 2], [5, 4, 5, 4],
        [6, 0, 4, 6],
        [7, 0, 3, 1], [7, 1, 4, 1], [7, 2, 3, 1], [7, 3, 2, 1], [7, 4, 1, 2], [7, 6, 0, 2],
        // B 段
        [8, 0, 7, 3], [8, 3, 8, 1], [8, 4, 9, 4],
        [9, 0, 9, 2], [9, 2, 8, 2], [9, 4, 7, 4],
        [10, 0, 5, 2], [10, 2, 6, 2], [10, 4, 7, 3], [10, 7, 5, 1],
        [11, 0, 4, 6],
        // A' 段
        [12, 0, 4, 2], [12, 2, 3, 1], [12, 3, 2, 1], [12, 4, 3, 4],
        [13, 0, 2, 1], [13, 1, 1, 1], [13, 2, 0, 4],
        [14, 0, 5, 2], [14, 2, 4, 2], [14, 4, 3, 4],
        [15, 0, 1, 1], [15, 1, 2, 1], [15, 2, 1, 1], [15, 3, 0, 5],
      ])
      b.drums('tom', 'x..x..x.', 0, 16, 0.28)
      b.drums('hat', '..x...x.', 0, 16, 0.045)
      b.drums('kick', 'x.......', 0, 16, 0.2)
    },
  )
}

function buildRiver(): BgmScore {
  const chords = [0, 4, 5, 3, 0, 4, 5, 3, 5, 2, 3, 4, 0, 3, 4, 0]
  return track(
    'river',
    { bpm: 168, stepsPerBeat: 1, stepsPerBar: 6, bars: 16, rootMidi: 55, scale: MAJOR },
    (b) => {
      const bass: Voice = { wave: 'sine', vol: 0.17, attack: 0.015, release: 0.1, octave: -1 }
      const water: Voice = { wave: 'triangle', vol: 0.085, attack: 0.008, release: 0.06, octave: 0 }
      const sparkle: Voice = { wave: 'triangle', vol: 0.04, attack: 0.006, release: 0.05, octave: 2 }
      const lead: Voice = { wave: 'sine', vol: 0.14, attack: 0.02, release: 0.12, octave: 1 }
      b.bass(bass, chords, 'r..f..')
      b.arp(water, chords, [0, 1, 2, 3, 2, 1])
      b.arp(sparkle, chords, [3, 4, 5], 8, 16)
      b.line(lead, [
        [0, 0, 2, 3], [0, 3, 1, 3],
        [1, 0, 1, 2], [1, 2, 2, 2], [1, 4, 3, 2],
        [2, 0, 4, 6],
        [3, 0, 3, 3], [3, 3, 2, 3],
        [4, 0, 2, 3], [4, 3, 4, 3],
        [5, 0, 5, 4], [5, 4, 4, 2],
        [6, 0, 2, 3], [6, 3, 1, 3],
        [7, 0, 0, 6],
        [8, 0, 4, 3], [8, 3, 5, 3],
        [9, 0, 6, 4], [9, 4, 5, 2],
        [10, 0, 7, 3], [10, 3, 5, 3],
        [11, 0, 4, 3], [11, 3, 1, 3],
        [12, 0, 2, 3], [12, 3, 1, 3],
        [13, 0, 3, 3], [13, 3, 2, 3],
        [14, 0, 1, 4], [14, 4, 2, 2],
        [15, 0, 0, 6],
      ])
      b.drums('kick', 'x.....', 0, 16, 0.16)
      b.drums('hat', 'x.x.x.', 0, 16, 0.05)
    },
  )
}

function buildVoid(): BgmScore {
  const chords = [0, 5, 2, 6, 0, 5, 2, 6, 3, 5, 0, 6, 3, 5, 6, 6]
  return track(
    'void',
    {
      bpm: 76,
      stepsPerBeat: 2,
      stepsPerBar: 8,
      bars: 16,
      rootMidi: 45,
      scale: AEOLIAN,
      // 附点八分 = 0.75 拍
      echo: { delaySec: (60 / 76) * 0.75, feedback: 0.45, level: 0.5 },
    },
    (b) => {
      const bass: Voice = { wave: 'sine', vol: 0.22, attack: 0.02, release: 0.12, octave: -1 }
      const pad: Voice = { wave: 'square', vol: 0.03, attack: 0.3, release: 0.9, octave: 0 }
      const lead: Voice = { wave: 'square', vol: 0.09, attack: 0.01, release: 0.1, octave: 2, echo: true }
      b.bass(bass, chords, 'r......r')
      b.pad(pad, chords, [0, 1, 2], 0.006)
      b.line(lead, [
        [0, 0, 4, 3],
        [1, 4, 5, 2],
        [2, 0, 4, 2], [2, 4, 2, 2],
        [3, 0, 6, 4],
        [4, 0, 7, 3],
        [5, 4, 9, 2],
        [6, 0, 7, 2], [6, 4, 4, 2],
        [7, 2, 6, 4],
        [8, 0, 3, 3], [8, 6, 4, 1],
        [9, 4, 5, 3],
        [10, 0, 4, 6],
        [11, 0, 6, 2], [11, 4, 5, 2],
        [12, 0, 3, 4],
        [13, 0, 5, 4],
        [14, 0, 6, 6],
        // 第 16 小节全休止
      ])
      b.drums('kick', 'x.......', 0, 16, 0.3)
      b.drums('hat', '....x...', 0, 16, 0.04)
    },
  )
}

function buildRuins(): BgmScore {
  const chords = [0, 6, 3, 5, 0, 6, 4, 5, 3, 6, 0, 5, 4, 6, 3, 0]
  return track(
    'ruins',
    {
      bpm: 84,
      stepsPerBeat: 2,
      stepsPerBar: 8,
      bars: 16,
      rootMidi: 47,
      scale: PHRYGIAN_DOM,
      echo: { delaySec: (60 / 84) * 0.75, feedback: 0.4, level: 0.4 },
    },
    (b) => {
      const bass: Voice = { wave: 'sine', vol: 0.2, attack: 0.02, release: 0.14, octave: -1 }
      const pad: Voice = { wave: 'square', vol: 0.028, attack: 0.3, release: 0.9, octave: 0 }
      const lead: Voice = { wave: 'triangle', vol: 0.1, attack: 0.01, release: 0.12, octave: 1, echo: true }
      const drip: Voice = { wave: 'sine', vol: 0.03, attack: 0.004, release: 0.07, octave: 2 }
      b.bass(bass, chords, 'r.......')
      b.pad(pad, chords, [0, 1, 2], 0.006)
      b.arp(drip, chords, [0, 4, 2, 4], 0, 16)
      b.line(lead, [
        [0, 0, 0, 4],
        [1, 4, 1, 2],
        [2, 0, 3, 3],
        [3, 2, 4, 4],
        [4, 0, 3, 2], [4, 4, 1, 2],
        [5, 0, 0, 4],
        [6, 4, 6, 3],
        [7, 0, 4, 4],
        [8, 0, 3, 2], [8, 6, 4, 1],
        [9, 4, 6, 3],
        [10, 0, 5, 4],
        [11, 0, 4, 2], [11, 4, 3, 2],
        [12, 0, 1, 4],
        [13, 0, 3, 4],
        [14, 0, 0, 6],
        // 第 16 小节全休止
      ])
      b.drums('kick', 'x.......', 0, 16, 0.22)
      b.drums('hat', '....x...', 0, 16, 0.04)
      b.drums('tom', '......x.', 8, 16, 0.1)
    },
  )
}

function buildDayNight(): BgmScore {
  const chords = [0, 4, 5, 3, 0, 4, 1, 5, 6, 3, 4, 5, 0, 4, 5, 0]
  return track(
    'daynight',
    {
      bpm: 108,
      stepsPerBeat: 2,
      stepsPerBar: 8,
      bars: 16,
      rootMidi: 50,
      scale: MAJOR,
      echo: { delaySec: (60 / 108) * 0.5, feedback: 0.3, level: 0.3 },
    },
    (b) => {
      const bass: Voice = { wave: 'triangle', vol: 0.14, attack: 0.01, release: 0.08, octave: -1 }
      const pad: Voice = { wave: 'sine', vol: 0.03, attack: 0.25, release: 0.8, octave: 0 }
      const arp: Voice = { wave: 'triangle', vol: 0.06, attack: 0.006, release: 0.06, octave: 1 }
      const lead: Voice = { wave: 'square', vol: 0.1, attack: 0.01, release: 0.08, octave: 1, echo: true }
      b.bass(bass, chords, 'r...r...')
      b.pad(pad, chords, [0, 2, 4], 0.005)
      b.arp(arp, chords, [0, 2, 4, 2])
      b.line(lead, [
        // A 段
        [0, 0, 0, 2], [0, 2, 2, 2], [0, 4, 4, 4],
        [1, 0, 4, 2], [1, 2, 5, 2], [1, 4, 7, 4],
        [2, 0, 7, 2], [2, 2, 6, 2], [2, 4, 4, 4],
        [3, 0, 5, 4], [3, 4, 2, 4],
        [4, 0, 0, 2], [4, 2, 2, 2], [4, 4, 4, 4],
        [5, 0, 4, 2], [5, 2, 7, 2], [5, 4, 9, 4],
        [6, 0, 7, 2], [6, 2, 6, 2], [6, 4, 5, 4],
        [7, 0, 4, 6], [7, 6, 5, 2],
        // B 段
        [8, 0, 7, 2], [8, 2, 6, 2], [8, 4, 4, 4],
        [9, 0, 5, 2], [9, 2, 4, 2], [9, 4, 2, 4],
        [10, 0, 4, 2], [10, 2, 2, 2], [10, 4, 0, 4],
        [11, 0, 2, 6],
        // A' 段
        [12, 0, 0, 2], [12, 2, 2, 2], [12, 4, 4, 4],
        [13, 0, 4, 2], [13, 2, 5, 2], [13, 4, 7, 4],
        [14, 0, 7, 2], [14, 2, 5, 2], [14, 4, 4, 4],
        [15, 0, 2, 2], [15, 2, 0, 6],
      ])
      b.drums('kick', 'x...x...', 0, 16, 0.26)
      b.drums('snare', '....x...', 0, 16, 0.16)
      b.drums('hat', 'x.x.x.x.', 0, 16, 0.05)
      b.drums('snare', '....x.xx', 15, 16, 0.15)
    },
  )
}

function buildSpace(): BgmScore {
  const chords = [0, 5, 3, 6, 0, 4, 5, 3, 6, 2, 5, 3, 0, 5, 6, 4]
  return track(
    'space',
    {
      bpm: 72,
      stepsPerBeat: 2,
      stepsPerBar: 8,
      bars: 16,
      rootMidi: 45,
      scale: AEOLIAN,
      echo: { delaySec: (60 / 72) * 0.75, feedback: 0.46, level: 0.44 },
    },
    (b) => {
      const bass: Voice = { wave: 'sine', vol: 0.2, attack: 0.06, release: 0.3, octave: -1 }
      const pad: Voice = { wave: 'triangle', vol: 0.03, attack: 0.5, release: 1.2, octave: 0 }
      const star: Voice = { wave: 'sine', vol: 0.035, attack: 0.004, release: 0.1, octave: 2, echo: true }
      const lead: Voice = { wave: 'triangle', vol: 0.075, attack: 0.02, release: 0.2, octave: 1, echo: true }
      b.bass(bass, chords, 'r.......')
      b.pad(pad, chords, [0, 2, 4], 0.006)
      b.arp(star, chords, [0, 4, 2, 4, 0, 5], 0, 16)
      b.line(lead, [
        // A 段
        [0, 0, 0, 4], [0, 4, 4, 4],
        [1, 0, 5, 6], [1, 6, 4, 2],
        [2, 0, 3, 4], [2, 4, 2, 4],
        [3, 0, 5, 8],
        [4, 0, 0, 4], [4, 4, 3, 4],
        [5, 0, 4, 6], [5, 6, 5, 2],
        [6, 0, 7, 4], [6, 4, 6, 4],
        [7, 0, 4, 8],
        // B 段
        [8, 0, 9, 4], [8, 4, 7, 4],
        [9, 0, 8, 6], [9, 6, 6, 2],
        [10, 0, 7, 4], [10, 4, 5, 4],
        [11, 0, 6, 8],
        // A' 段
        [12, 0, 4, 4], [12, 4, 2, 4],
        [13, 0, 3, 6], [13, 6, 2, 2],
        [14, 0, 4, 4], [14, 4, 5, 4],
        [15, 0, 0, 8],
      ])
      b.drums('kick', 'x.......', 0, 16, 0.16)
      b.drums('hat', '....x...', 0, 16, 0.03)
    },
  )
}

const BUILDERS: Record<BgmId, () => BgmScore> = {
  lobby: buildLobby,
  forest: buildForest,
  desert: buildDesert,
  river: buildRiver,
  void: buildVoid,
  ruins: buildRuins,
  daynight: buildDayNight,
  space: buildSpace,
  // 暂借深空曲
  ice: buildSpace,
}

const cache = new Map<BgmId, BgmScore>()

export function bgmScore(id: BgmId): BgmScore {
  let score = cache.get(id)
  if (!score) {
    score = BUILDERS[id]()
    cache.set(id, score)
  }
  return score
}
