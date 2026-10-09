import type { MapId } from '../types/maps'

export type BgmId = 'lobby' | MapId

export interface BgmNote {
  t: number
  dur: number
  freq: number
  wave: 'square' | 'triangle' | 'sine' | 'sawtooth'
  vol: number
  attack: number
  release: number
  echo?: boolean
}

type BgmHitKind = 'kick' | 'snare' | 'hat' | 'tom'

export interface BgmHit {
  t: number
  kind: BgmHitKind
  vol: number
}

export interface BgmScore {
  loopSec: number
  notes: BgmNote[]
  hits: BgmHit[]
  echo?: { delaySec: number; feedback: number; level: number }
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11] as const
const DORIAN = [0, 2, 3, 5, 7, 9, 10] as const
const AEOLIAN = [0, 2, 3, 5, 7, 8, 10] as const
const PHRYGIAN_DOM = [0, 1, 4, 5, 7, 8, 10] as const
const LYDIAN = [0, 2, 4, 6, 7, 9, 11] as const
/** 阳音阶：日本民谣里明亮的五声音阶 */
const YO = [0, 2, 5, 7, 9] as const

interface Voice {
  wave: BgmNote['wave']
  vol: number
  attack: number
  release: number
  octave: number
  echo?: boolean
}

type Line = readonly (readonly [number, number, number, number])[]

type Pattern<P extends string, Step extends string> = P extends `${Step}${infer Rest}`
  ? Pattern<Rest, Step>
  : P extends ''
    ? unknown
    : never

const BASS_TONE = { r: 0, t: 2, f: 4, o: 7 }

type BassStep = keyof typeof BASS_TONE | '.' | '-'

type DrumStep = 'x' | 'o' | '.'

class Builder {
  notes: BgmNote[] = []
  hits: BgmHit[] = []
  constructor(
    private readonly rootMidi: number,
    private readonly scale: readonly number[],
    private readonly stepSec: number,
    private readonly stepsPerBar: number,
  ) {}

  private freq(deg: number, octave: number): number {
    const n = this.scale.length
    const idx = ((deg % n) + n) % n
    const midi = this.rootMidi + this.scale[idx]! + (Math.floor(deg / n) + octave) * 12
    return 440 * Math.pow(2, (midi - 69) / 12)
  }

  note(v: Voice, bar: number, step: number, deg: number, durSteps: number, detune = 1): void {
    this.notes.push({
      t: (bar * this.stepsPerBar + step) * this.stepSec,
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

  bass<P extends string>(v: Voice, chords: readonly number[], pattern: P & Pattern<P, BassStep>): void {
    const tones: Readonly<Record<string, number>> = BASS_TONE
    for (let bar = 0; bar < chords.length; bar++) {
      const root = chords[bar]!
      let last: BgmNote | undefined
      for (let s = 0; s < pattern.length; s++) {
        const ch = pattern[s]!
        const tone = tones[ch]
        if (ch === '-' && last) last.dur += this.stepSec
        else if (tone !== undefined) {
          this.note(v, bar, s, root + tone, 1)
          last = this.notes[this.notes.length - 1]
        } else last = undefined
      }
    }
  }

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

  pad(v: Voice, chords: readonly number[], tones: readonly number[], detune = 0): void {
    for (let bar = 0; bar < chords.length; bar++) {
      for (const tone of tones) {
        const deg = chords[bar]! + (tone % 3) * 2 + Math.floor(tone / 3) * 7
        this.note(v, bar, 0, deg, this.stepsPerBar)
        if (detune > 0) this.note(v, bar, 0, deg, this.stepsPerBar, 1 + detune)
      }
    }
  }

  drums<P extends string>(kind: BgmHitKind, pattern: P & Pattern<P, DrumStep>, fromBar: number, toBar: number, vol: number): void {
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
  opts: {
    bpm: number
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
    loopSec: opts.bars * opts.stepsPerBar * stepSec,
    notes: b.notes,
    hits: b.hits,
    echo: opts.echo,
  }
}

function buildLobby(): BgmScore {
  const chords = [0, 5, 3, 4, 0, 5, 3, 4, 3, 4, 2, 5, 1, 4, 0, 0]
  return track(
    { bpm: 96, stepsPerBeat: 2, stepsPerBar: 8, bars: 16, rootMidi: 60, scale: MAJOR },
    (b) => {
      const bass: Voice = { wave: 'triangle', vol: 0.17, attack: 0.01, release: 0.06, octave: -2 }
      const pad: Voice = { wave: 'square', vol: 0.045, attack: 0.08, release: 0.35, octave: -1 }
      const lead: Voice = { wave: 'triangle', vol: 0.15, attack: 0.012, release: 0.08, octave: 0 }
      b.bass(bass, chords, 'r...f...')
      b.pad(pad, chords, [0, 1, 2])
      b.line(lead, [
        [0, 0, 2, 2], [0, 2, 1, 2], [0, 4, 0, 2], [0, 6, 1, 2],
        [1, 0, 2, 4], [1, 4, 4, 3],
        [2, 0, 5, 2], [2, 2, 4, 2], [2, 4, 2, 2], [2, 6, 4, 2],
        [3, 0, 2, 2], [3, 2, 1, 2], [3, 4, 1, 4],
        [4, 0, 2, 2], [4, 2, 1, 2], [4, 4, 0, 2], [4, 6, 1, 2],
        [5, 0, 2, 4], [5, 4, 4, 4],
        [6, 0, 5, 2], [6, 2, 6, 2], [6, 4, 7, 3],
        [7, 0, 4, 6],
        [8, 0, 7, 2], [8, 2, 6, 2], [8, 4, 5, 2], [8, 6, 6, 2],
        [9, 0, 4, 4], [9, 4, 6, 2], [9, 6, 7, 2],
        [10, 0, 6, 2], [10, 2, 5, 2], [10, 4, 4, 2], [10, 6, 2, 2],
        [11, 0, 5, 6],
        [12, 0, 1, 2], [12, 2, 3, 2], [12, 4, 5, 2], [12, 6, 3, 2],
        [13, 0, 4, 2], [13, 2, 2, 2], [13, 4, 1, 4],
        [14, 0, 0, 8],
      ])
      b.drums('hat', '..x...x.', 0, 16, 0.06)
      b.drums('kick', 'x.......', 8, 16, 0.14)
    },
  )
}

function buildRuins(): BgmScore {
  const chords = [0, 0, 3, 3, 6, 6, 4, 4, 0, 0, 5, 3, 6, 4, 0, 0]
  return track(
    {
      bpm: 72,
      stepsPerBeat: 2,
      stepsPerBar: 8,
      bars: 16,
      rootMidi: 50,
      scale: DORIAN,
      echo: { delaySec: (60 / 72) * 0.75, feedback: 0.38, level: 0.36 },
    },
    (b) => {
      const bass: Voice = { wave: 'sine', vol: 0.16, attack: 0.03, release: 0.4, octave: -1 }
      const drone: Voice = { wave: 'sine', vol: 0.035, attack: 0.9, release: 1.6, octave: 0 }
      const lute: Voice = { wave: 'triangle', vol: 0.05, attack: 0.003, release: 0.18, octave: 0 }
      const pipe: Voice = { wave: 'sine', vol: 0.085, attack: 0.06, release: 0.3, octave: 1, echo: true }
      const bell: Voice = { wave: 'sine', vol: 0.035, attack: 0.002, release: 1.2, octave: 2, echo: true }
      b.bass(bass, chords, 'r---o---')
      b.pad(drone, chords, [0, 4], 0.004)
      b.arp(lute, chords, [0, 1, 2, 1, 3, 1, 2, 1], 2, 14)
      b.line(pipe, [
        [0, 4, 4, 4],
        [1, 0, 3, 2], [1, 2, 2, 2], [1, 4, 0, 4],
        [2, 0, 3, 6], [2, 6, 4, 2],
        [3, 0, 5, 4], [3, 4, 3, 4],
        [4, 0, 6, 4], [4, 4, 5, 2], [4, 6, 4, 2],
        [5, 0, 3, 8],
        [6, 0, 4, 3], [6, 3, 5, 1], [6, 4, 6, 4],
        [7, 0, 4, 8],
        [8, 4, 7, 4],
        [9, 0, 6, 2], [9, 2, 5, 2], [9, 4, 4, 4],
        [10, 0, 5, 6], [10, 6, 3, 2],
        [11, 0, 2, 4], [11, 4, 3, 4],
        [12, 0, 1, 4], [12, 4, 2, 4],
        [13, 0, 4, 6],
        [14, 0, 0, 8],
      ])
      b.line(bell, [
        [0, 0, 7, 4], [4, 0, 9, 4], [8, 0, 7, 4], [12, 0, 6, 4], [15, 4, 7, 4],
      ])
      b.drums('tom', 'o.......', 0, 16, 0.08)
      b.drums('kick', '....x...', 4, 14, 0.07)
      b.drums('hat', '......o.', 8, 14, 0.03)
    },
  )
}

function buildVolcano(): BgmScore {
  const chords = [0, 0, 1, 0, 5, 5, 1, 0, 0, 0, 1, 0, 5, 1, 6, 0]
  return track(
    {
      bpm: 84,
      stepsPerBeat: 2,
      stepsPerBar: 8,
      bars: 16,
      rootMidi: 40,
      scale: PHRYGIAN_DOM,
      echo: { delaySec: (60 / 84) * 0.75, feedback: 0.34, level: 0.3 },
    },
    (b) => {
      const bass: Voice = { wave: 'sawtooth', vol: 0.13, attack: 0.01, release: 0.12, octave: -1 }
      const drone: Voice = { wave: 'square', vol: 0.035, attack: 0.3, release: 0.9, octave: 0 }
      const lead: Voice = { wave: 'sawtooth', vol: 0.085, attack: 0.02, release: 0.14, octave: 1, echo: true }
      b.bass(bass, chords, 'r.r...ro')
      b.pad(drone, chords, [0, 2], 0.004)
      b.line(lead, [
        [0, 0, 0, 3], [0, 3, 1, 1], [0, 4, 0, 4],
        [1, 0, 4, 2], [1, 2, 3, 2], [1, 4, 1, 4],
        [2, 0, 1, 3], [2, 3, 2, 1], [2, 4, 1, 4],
        [3, 0, 0, 8],
        [4, 0, 5, 3], [4, 3, 4, 1], [4, 4, 5, 4],
        [5, 0, 7, 2], [5, 2, 6, 2], [5, 4, 5, 4],
        [6, 0, 4, 3], [6, 3, 2, 1], [6, 4, 1, 4],
        [7, 0, 0, 8],
        [8, 0, 7, 3], [8, 3, 8, 1], [8, 4, 7, 4],
        [9, 0, 5, 2], [9, 2, 4, 2], [9, 4, 1, 4],
        [10, 0, 1, 3], [10, 3, 2, 1], [10, 4, 4, 4],
        [11, 0, 0, 8],
        [12, 0, 5, 2], [12, 2, 7, 2], [12, 4, 8, 4],
        [13, 0, 7, 2], [13, 2, 5, 2], [13, 4, 4, 4],
        [14, 0, 2, 4], [14, 4, 1, 4],
        [15, 0, 0, 8],
      ])
      b.drums('tom', 'x..x..x.', 0, 16, 0.22)
      b.drums('kick', 'x.......', 0, 16, 0.2)
      b.drums('snare', '....x...', 4, 16, 0.12)
      b.drums('hat', '..x...x.', 8, 16, 0.04)
      b.drums('tom', 'x.x.xxx.', 15, 16, 0.24)
    },
  )
}

/** 浮冰：利底亚调式的慢三拍，像冰随浪起伏；正弦低音一小节一下，三角波铺底如风，三角波领一支孤单的调子，冰铃似的高音零星地响，回声拖得很长 */
function buildFloe(): BgmScore {
  const chords = [0, 1, 0, 1, 5, 2, 4, 4, 0, 1, 0, 1, 5, 6, 4, 0]
  return track(
    {
      bpm: 66,
      stepsPerBeat: 2,
      stepsPerBar: 6,
      bars: 16,
      rootMidi: 52,
      scale: LYDIAN,
      echo: { delaySec: (60 / 66) * 0.75, feedback: 0.5, level: 0.42 },
    },
    (b) => {
      const bass: Voice = { wave: 'sine', vol: 0.18, attack: 0.08, release: 0.5, octave: -1 }
      const wind: Voice = { wave: 'triangle', vol: 0.028, attack: 0.9, release: 1.6, octave: 0 }
      const lead: Voice = { wave: 'triangle', vol: 0.07, attack: 0.04, release: 0.35, octave: 1, echo: true }
      const bell: Voice = { wave: 'sine', vol: 0.03, attack: 0.003, release: 0.25, octave: 2, echo: true }
      b.bass(bass, chords, 'r.....')
      b.pad(wind, chords, [0, 2, 4], 0.007)
      b.line(lead, [
        [0, 0, 4, 3], [0, 3, 2, 3],
        [1, 0, 3, 4], [1, 4, 1, 2],
        [2, 0, 4, 2], [2, 2, 6, 2], [2, 4, 7, 2],
        [3, 0, 8, 6],
        [4, 0, 9, 3], [4, 3, 7, 3],
        [5, 0, 6, 4], [5, 4, 4, 2],
        [6, 0, 5, 3], [6, 3, 4, 3],
        [7, 0, 4, 6],
        [8, 0, 7, 3], [8, 3, 9, 3],
        [9, 0, 10, 4], [9, 4, 8, 2],
        [10, 0, 9, 2], [10, 2, 7, 2], [10, 4, 6, 2],
        [11, 0, 8, 6],
        [12, 0, 9, 3], [12, 3, 5, 3],
        [13, 0, 6, 3], [13, 3, 3, 3],
        [14, 0, 4, 4], [14, 4, 1, 2],
        [15, 0, 0, 6],
      ])
      for (let bar = 0; bar < chords.length; bar++) {
        b.note(bell, bar, 1, chords[bar]! + 4, 1)
        if (bar % 2 === 1) b.note(bell, bar, 4, chords[bar]! + 2, 1)
      }
      b.drums('kick', 'x.....', 0, 16, 0.12)
      b.drums('hat', '...o..', 4, 16, 0.025)
      b.drums('tom', '....x.', 7, 8, 0.1)
      b.drums('tom', '...x.x', 15, 16, 0.12)
    },
  )
}

/** 视界：利底亚调式的深空，正弦低音像引力一样慢慢拖着走，三角波长音铺底，钟声似的琶音带着长回声，底鼓像隔着很远的心跳 */
function buildNebula(): BgmScore {
  const chords = [0, 0, 1, 1, 5, 5, 4, 3, 0, 0, 1, 1, 2, 4, 5, 0]
  return track(
    {
      bpm: 60,
      stepsPerBeat: 2,
      stepsPerBar: 8,
      bars: 16,
      rootMidi: 38,
      scale: LYDIAN,
      echo: { delaySec: 0.75, feedback: 0.52, level: 0.46 },
    },
    (b) => {
      const bass: Voice = { wave: 'sine', vol: 0.22, attack: 0.25, release: 0.9, octave: -1 }
      const pad: Voice = { wave: 'triangle', vol: 0.028, attack: 0.9, release: 1.8, octave: 0 }
      const bell: Voice = { wave: 'sine', vol: 0.03, attack: 0.003, release: 0.6, octave: 2, echo: true }
      const lead: Voice = { wave: 'triangle', vol: 0.06, attack: 0.08, release: 0.5, octave: 1, echo: true }
      b.bass(bass, chords, 'r---o---')
      b.pad(pad, chords, [0, 2, 4], 0.004)
      b.arp(bell, chords, [4, 2, 0, 5, 3, 1], 4, 16)
      b.line(lead, [
        [0, 0, 4, 6], [0, 6, 3, 2],
        [1, 0, 4, 8],
        [2, 0, 7, 4], [2, 4, 6, 4],
        [3, 0, 4, 8],
        [4, 0, 9, 6], [4, 6, 8, 2],
        [5, 0, 7, 8],
        [6, 0, 6, 4], [6, 4, 4, 4],
        [7, 0, 3, 8],
        [8, 0, 4, 4], [8, 4, 6, 4],
        [9, 0, 7, 8],
        [10, 0, 9, 4], [10, 4, 11, 4],
        [11, 0, 10, 8],
        [12, 0, 9, 4], [12, 4, 7, 4],
        [13, 0, 6, 8],
        [14, 0, 4, 6], [14, 6, 3, 2],
        [15, 0, 4, 8],
      ])
      b.drums('kick', 'x..x....', 0, 16, 0.14)
      b.drums('tom', '......x.', 8, 16, 0.06)
    },
  )
}

/** 紫晶洞：多利亚调式的三拍子，正弦波的琶音像晶体一串串地响，回声拖得长；三角波的长音慢慢唱，低音踏着根音与五音，高处偶尔一声清脆的晶鸣 */
function buildAmethyst(): BgmScore {
  const chords = [0, 3, 0, 6, 5, 3, 4, 0, 0, 3, 0, 6, 2, 3, 4, 4]
  return track(
    {
      bpm: 84,
      stepsPerBeat: 2,
      stepsPerBar: 6,
      bars: 16,
      rootMidi: 52,
      scale: DORIAN,
      echo: { delaySec: (60 / 84) * 0.5, feedback: 0.45, level: 0.35 },
    },
    (b) => {
      const bass: Voice = { wave: 'sine', vol: 0.15, attack: 0.03, release: 0.4, octave: -1 }
      const pad: Voice = { wave: 'triangle', vol: 0.026, attack: 0.6, release: 1.2, octave: 0 }
      const glass: Voice = { wave: 'sine', vol: 0.04, attack: 0.003, release: 0.3, octave: 2, echo: true }
      const lead: Voice = { wave: 'triangle', vol: 0.07, attack: 0.04, release: 0.35, octave: 1, echo: true }
      const chime: Voice = { wave: 'sine', vol: 0.03, attack: 0.002, release: 0.5, octave: 3, echo: true }
      b.bass(bass, chords, 'r--o--')
      b.pad(pad, chords, [0, 1, 2], 0.004)
      b.arp(glass, chords, [0, 1, 2, 3, 2, 1])
      b.line(lead, [
        [0, 0, 4, 4], [0, 4, 5, 2],
        [1, 0, 6, 6],
        [2, 0, 4, 3], [2, 3, 2, 3],
        [3, 0, 1, 6],
        [4, 0, 2, 4], [4, 4, 4, 2],
        [5, 0, 5, 6],
        [6, 0, 4, 3], [6, 3, 3, 3],
        [7, 0, 2, 6],
        [8, 0, 7, 4], [8, 4, 6, 2],
        [9, 0, 8, 6],
        [10, 0, 7, 3], [10, 3, 5, 3],
        [11, 0, 4, 6],
        [12, 0, 4, 2], [12, 2, 5, 2], [12, 4, 6, 2],
        [13, 0, 7, 6],
        [14, 0, 6, 3], [14, 3, 4, 3],
        [15, 0, 4, 6],
      ])
      b.line(chime, [
        [0, 5, 11, 1], [2, 1, 12, 1], [3, 4, 9, 1], [5, 2, 13, 1], [7, 5, 11, 1],
        [9, 1, 12, 1], [10, 4, 14, 1], [12, 2, 11, 1], [13, 5, 13, 1], [15, 3, 12, 1],
      ])
      b.drums('kick', 'x.....', 0, 16, 0.1)
      b.drums('hat', '...o..', 4, 16, 0.02)
    },
  )
}

/** 草甸：明快的大调三拍子，三角波的笛声领着唱，拨弦似的琶音一路流下去，低音踏着根音与五音，轻轻的鼓点像在草地上走 */
function buildMeadow(): BgmScore {
  const chords = [0, 3, 4, 0, 5, 3, 1, 4, 0, 3, 4, 5, 3, 4, 1, 0]
  return track(
    {
      bpm: 100,
      stepsPerBeat: 2,
      stepsPerBar: 6,
      bars: 16,
      rootMidi: 55,
      scale: MAJOR,
      echo: { delaySec: (60 / 100) * 0.75, feedback: 0.28, level: 0.22 },
    },
    (b) => {
      const bass: Voice = { wave: 'triangle', vol: 0.16, attack: 0.01, release: 0.12, octave: -1 }
      const pluck: Voice = { wave: 'triangle', vol: 0.06, attack: 0.004, release: 0.08, octave: 0 }
      const flute: Voice = { wave: 'sine', vol: 0.13, attack: 0.03, release: 0.16, octave: 1, echo: true }
      const bell: Voice = { wave: 'sine', vol: 0.035, attack: 0.003, release: 0.2, octave: 2, echo: true }
      b.bass(bass, chords, 'r...o.')
      b.arp(pluck, chords, [0, 1, 2, 3, 2, 1])
      b.line(flute, [
        [0, 0, 4, 2], [0, 2, 5, 1], [0, 3, 4, 1], [0, 4, 2, 2],
        [1, 0, 3, 3], [1, 3, 5, 3],
        [2, 0, 6, 2], [2, 2, 5, 2], [2, 4, 4, 2],
        [3, 0, 2, 6],
        [4, 0, 5, 2], [4, 2, 7, 2], [4, 4, 6, 2],
        [5, 0, 5, 3], [5, 3, 3, 3],
        [6, 0, 4, 2], [6, 2, 3, 2], [6, 4, 1, 2],
        [7, 0, 4, 6],
        [8, 0, 7, 2], [8, 2, 8, 1], [8, 3, 7, 1], [8, 4, 6, 2],
        [9, 0, 5, 3], [9, 3, 7, 3],
        [10, 0, 8, 2], [10, 2, 9, 2], [10, 4, 8, 2],
        [11, 0, 7, 6],
        [12, 0, 5, 2], [12, 2, 6, 2], [12, 4, 5, 2],
        [13, 0, 4, 3], [13, 3, 6, 3],
        [14, 0, 5, 2], [14, 2, 3, 2], [14, 4, 1, 2],
        [15, 0, 0, 6],
      ])
      for (let bar = 0; bar < chords.length; bar += 2) b.note(bell, bar, 3, chords[bar]! + 7, 1)
      b.drums('kick', 'x.....', 0, 16, 0.16)
      b.drums('hat', '..o.o.', 0, 16, 0.035)
      b.drums('snare', '...x..', 4, 16, 0.06)
      b.drums('tom', '....xx', 7, 8, 0.08)
      b.drums('tom', '...x.x', 15, 16, 0.09)
    },
  )
}

/** 沙漠：一圈一圈走不出去——低音持续不断，琶音绕着同一个音型打转，旋律走了一大圈又落回开头那个音 */
function buildDunes(): BgmScore {
  const chords = [0, 0, 1, 1, 0, 0, 6, 6, 5, 5, 6, 6, 1, 1, 0, 0]
  return track(
    {
      bpm: 84,
      stepsPerBeat: 2,
      stepsPerBar: 8,
      bars: 16,
      rootMidi: 50,
      scale: PHRYGIAN_DOM,
      echo: { delaySec: (60 / 84) * 0.75, feedback: 0.42, level: 0.42 },
    },
    (b) => {
      const drone: Voice = { wave: 'sine', vol: 0.11, attack: 0.5, release: 1.4, octave: -1 }
      const bass: Voice = { wave: 'triangle', vol: 0.15, attack: 0.015, release: 0.12, octave: -2 }
      const sand: Voice = { wave: 'triangle', vol: 0.045, attack: 0.01, release: 0.08, octave: 0 }
      const lead: Voice = { wave: 'sawtooth', vol: 0.07, attack: 0.05, release: 0.22, octave: 1, echo: true }
      b.pad(drone, chords, [0, 2])
      b.bass(bass, chords, 'r.....o.')
      b.arp(sand, chords, [0, 1, 2, 1, 0, 1, 3, 1])
      b.line(lead, [
        [0, 0, 4, 4], [0, 4, 3, 2], [0, 6, 2, 2],
        [1, 0, 1, 6], [1, 6, 2, 2],
        [2, 0, 4, 3], [2, 3, 5, 1], [2, 4, 4, 4],
        [3, 0, 3, 2], [3, 2, 2, 2], [3, 4, 1, 4],
        [4, 0, 0, 8],
        [5, 4, 4, 2], [5, 6, 5, 2],
        [6, 0, 6, 4], [6, 4, 5, 2], [6, 6, 4, 2],
        [7, 0, 5, 8],
        [8, 0, 7, 3], [8, 3, 8, 1], [8, 4, 7, 4],
        [9, 0, 6, 2], [9, 2, 5, 2], [9, 4, 4, 4],
        [10, 0, 5, 4], [10, 4, 6, 4],
        [11, 0, 4, 8],
        [12, 0, 2, 2], [12, 2, 1, 2], [12, 4, 2, 4],
        [13, 0, 3, 4], [13, 4, 2, 2], [13, 6, 1, 2],
        [14, 0, 1, 4], [14, 4, 0, 4],
        [15, 0, 0, 6],
      ])
      b.drums('tom', 'x.....x.', 0, 16, 0.2)
      b.drums('hat', '....x...', 4, 16, 0.035)
      b.drums('kick', 'x.......', 8, 16, 0.12)
    },
  )
}

/** 樱花：慢一点的阳音阶，筝拨着五声的分解和弦，尺八似的笛子吹着长音，隔两小节一声铃，鼓点轻得几乎听不见 */
function buildSakura(): BgmScore {
  const roots = [0, 3, 2, 1, 0, 3, 4, 2, 3, 2, 1, 0, 3, 4, 2, 0]
  const pluck = [0, 2, 3, 5, 3, 2, 5, 7]
  return track(
    {
      bpm: 88,
      stepsPerBeat: 2,
      stepsPerBar: 8,
      bars: 16,
      rootMidi: 62,
      scale: YO,
      echo: { delaySec: (60 / 88) * 0.75, feedback: 0.3, level: 0.3 },
    },
    (b) => {
      const koto: Voice = { wave: 'triangle', vol: 0.075, attack: 0.003, release: 0.12, octave: 0, echo: true }
      const bass: Voice = { wave: 'sine', vol: 0.15, attack: 0.01, release: 0.2, octave: -1 }
      const flute: Voice = { wave: 'sine', vol: 0.12, attack: 0.05, release: 0.22, octave: 1, echo: true }
      const bell: Voice = { wave: 'sine', vol: 0.03, attack: 0.003, release: 0.3, octave: 2, echo: true }
      roots.forEach((r, bar) => {
        pluck.forEach((d, s) => b.note(koto, bar, s, r + d, 1))
        b.note(bass, bar, 0, r, 3)
        b.note(bass, bar, 4, r + 3, 3)
        if (bar % 2 === 0) b.note(bell, bar, 6, r + 5, 2)
      })
      b.line(flute, [
        [0, 0, 4, 3], [0, 3, 3, 1], [0, 4, 2, 4],
        [1, 0, 3, 2], [1, 2, 4, 2], [1, 4, 5, 4],
        [2, 0, 4, 3], [2, 3, 3, 1], [2, 4, 2, 2], [2, 6, 1, 2],
        [3, 0, 2, 8],
        [4, 0, 5, 3], [4, 3, 4, 1], [4, 4, 3, 2], [4, 6, 4, 2],
        [5, 0, 5, 4], [5, 4, 7, 4],
        [6, 0, 6, 2], [6, 2, 5, 2], [6, 4, 4, 2], [6, 6, 3, 2],
        [7, 0, 4, 8],
        [8, 0, 7, 3], [8, 3, 6, 1], [8, 4, 5, 4],
        [9, 0, 6, 2], [9, 2, 7, 2], [9, 4, 8, 4],
        [10, 0, 7, 3], [10, 3, 6, 1], [10, 4, 5, 2], [10, 6, 4, 2],
        [11, 0, 5, 8],
        [12, 0, 3, 2], [12, 2, 4, 2], [12, 4, 5, 2], [12, 6, 4, 2],
        [13, 0, 3, 3], [13, 3, 2, 1], [13, 4, 1, 4],
        [14, 0, 2, 4], [14, 4, 1, 2], [14, 6, 0, 2],
        [15, 0, 0, 8],
      ])
      b.drums('tom', 'x.......', 0, 16, 0.06)
      b.drums('hat', '..x...x.', 0, 16, 0.02)
    },
  )
}

/** 深海：很慢的小调，低沉的正弦贴着根音一拖一整小节，长长的铺底慢慢起落；声呐似的一声高音隔两小节响一下、回声一圈圈荡开，远处像鲸在叫，偶尔几点冷光似的亮音；心跳一样的轻鼓 */
function buildDeep(): BgmScore {
  const chords = [0, 0, 5, 5, 3, 3, 4, 4, 0, 0, 5, 5, 6, 4, 0, 0]
  return track(
    {
      bpm: 52,
      stepsPerBeat: 2,
      stepsPerBar: 8,
      bars: 16,
      rootMidi: 38,
      scale: AEOLIAN,
      echo: { delaySec: (60 / 52) * 1.5, feedback: 0.55, level: 0.45 },
    },
    (b) => {
      const bass: Voice = { wave: 'sine', vol: 0.16, attack: 0.3, release: 1.2, octave: -1 }
      const drone: Voice = { wave: 'triangle', vol: 0.028, attack: 1.2, release: 2, octave: 0 }
      const ping: Voice = { wave: 'sine', vol: 0.05, attack: 0.002, release: 0.6, octave: 2, echo: true }
      const whale: Voice = { wave: 'triangle', vol: 0.045, attack: 0.45, release: 1.1, octave: 1, echo: true }
      const glint: Voice = { wave: 'sine', vol: 0.022, attack: 0.003, release: 0.3, octave: 3, echo: true }
      b.bass(bass, chords, 'r-------')
      b.pad(drone, chords, [0, 2], 0.004)
      for (let bar = 0; bar < chords.length; bar += 2) b.note(ping, bar, 0, chords[bar]! + 4, 1)
      b.line(whale, [
        [1, 2, 4, 6],
        [3, 0, 3, 4], [3, 4, 2, 4],
        [5, 2, 5, 6],
        [6, 4, 4, 4],
        [7, 0, 2, 8],
        [9, 2, 7, 6],
        [11, 0, 6, 4], [11, 4, 4, 4],
        [12, 2, 5, 6],
        [13, 0, 4, 8],
        [15, 0, 0, 8],
      ])
      b.line(glint, [
        [2, 5, 11, 1], [4, 3, 9, 1], [6, 6, 12, 1], [8, 2, 11, 1],
        [10, 7, 9, 1], [12, 4, 13, 1], [14, 1, 10, 1], [15, 6, 9, 1],
      ])
      b.drums('kick', 'x...o...', 0, 16, 0.07)
      b.drums('tom', '......o.', 4, 16, 0.04)
    },
  )
}

/** 培养皿：利底亚调式的正弦与三角波，琶音像气泡一颗颗往上冒，低音按拍子轻轻涨落，隔一小节高处一声玻璃的叮 */
function buildPetri(): BgmScore {
  const chords = [0, 0, 4, 4, 1, 1, 5, 4, 0, 0, 4, 4, 1, 5, 3, 4]
  return track(
    {
      bpm: 92,
      stepsPerBeat: 2,
      stepsPerBar: 8,
      bars: 16,
      rootMidi: 57,
      scale: LYDIAN,
      echo: { delaySec: (60 / 92) * 0.75, feedback: 0.35, level: 0.28 },
    },
    (b) => {
      const bass: Voice = { wave: 'sine', vol: 0.15, attack: 0.02, release: 0.25, octave: -1 }
      const bubble: Voice = { wave: 'sine', vol: 0.05, attack: 0.002, release: 0.08, octave: 1, echo: true }
      const pad: Voice = { wave: 'triangle', vol: 0.025, attack: 0.4, release: 0.6, octave: 0 }
      const lead: Voice = { wave: 'triangle', vol: 0.1, attack: 0.03, release: 0.2, octave: 1 }
      const glass: Voice = { wave: 'sine', vol: 0.03, attack: 0.002, release: 0.4, octave: 3, echo: true }
      b.bass(bass, chords, 'r...o...')
      b.arp(bubble, chords, [0, 2, 4, 1, 3, 5, 2, 4])
      b.pad(pad, chords, [0, 1, 2])
      b.line(lead, [
        [0, 0, 4, 3], [0, 3, 5, 1], [0, 4, 6, 4],
        [1, 0, 7, 6], [1, 6, 6, 2],
        [2, 0, 4, 3], [2, 3, 3, 1], [2, 4, 4, 4],
        [3, 0, 2, 8],
        [4, 0, 4, 3], [4, 3, 5, 1], [4, 4, 6, 2], [4, 6, 7, 2],
        [5, 0, 8, 6], [5, 6, 7, 2],
        [6, 0, 6, 4], [6, 4, 5, 4],
        [7, 0, 4, 8],
        [8, 0, 7, 3], [8, 3, 8, 1], [8, 4, 9, 4],
        [9, 0, 10, 6], [9, 6, 9, 2],
        [10, 0, 8, 3], [10, 3, 7, 1], [10, 4, 6, 4],
        [11, 0, 5, 8],
        [12, 0, 3, 4], [12, 4, 4, 4],
        [13, 0, 5, 4], [13, 4, 6, 4],
        [14, 0, 4, 3], [14, 3, 3, 1], [14, 4, 2, 4],
        [15, 0, 0, 8],
      ])
      for (let bar = 1; bar < chords.length; bar += 2) b.note(glass, bar, 5, chords[bar]! + 9, 1)
      b.drums('hat', '..o...o.', 0, 16, 0.018)
      b.drums('tom', 'x.......', 4, 16, 0.05)
    },
  )
}

/** 舞台：八音盒似的六八拍摇篮曲，大调；竖琴分解和弦一路拨着，钢片琴领奏、带着回声，低音管只踩每小节头，长笛在乐句里垫一口气，一小节换一个和弦 */
function buildTheater(): BgmScore {
  const chords = [0, 0, 5, 3, 0, 4, 1, 4, 5, 5, 3, 0, 1, 4, 0, 0]
  return track(
    {
      bpm: 58 * 3,
      stepsPerBeat: 1,
      stepsPerBar: 6,
      bars: 16,
      rootMidi: 62,
      scale: MAJOR,
      echo: { delaySec: (60 / 58) * 0.5, feedback: 0.3, level: 0.24 },
    },
    (b) => {
      const bass: Voice = { wave: 'triangle', vol: 0.13, attack: 0.02, release: 0.3, octave: -2 }
      const harp: Voice = { wave: 'triangle', vol: 0.05, attack: 0.003, release: 0.35, octave: 0, echo: true }
      const flute: Voice = { wave: 'sine', vol: 0.03, attack: 0.25, release: 0.5, octave: 1 }
      const celesta: Voice = { wave: 'sine', vol: 0.085, attack: 0.004, release: 0.55, octave: 2, echo: true }
      b.bass(bass, chords, 'r--f--')
      b.arp(harp, chords, [0, 1, 2, 3, 2, 1])
      b.pad(flute, chords, [1, 2])
      b.line(celesta, [
        [0, 0, 4, 3], [0, 3, 2, 2], [0, 5, 4, 1],
        [1, 0, 7, 4], [1, 4, 6, 1], [1, 5, 4, 1],
        [2, 0, 5, 3], [2, 3, 7, 2], [2, 5, 5, 1],
        [3, 0, 3, 6],
        [4, 0, 4, 3], [4, 3, 2, 2], [4, 5, 4, 1],
        [5, 0, 8, 4], [5, 4, 7, 1], [5, 5, 6, 1],
        [6, 0, 5, 3], [6, 3, 3, 2], [6, 5, 2, 1],
        [7, 0, 1, 6],
        [8, 0, 7, 3], [8, 3, 9, 2], [8, 5, 7, 1],
        [9, 0, 5, 4], [9, 4, 4, 1], [9, 5, 5, 1],
        [10, 0, 6, 3], [10, 3, 5, 2], [10, 5, 3, 1],
        [11, 0, 4, 6],
        [12, 0, 3, 3], [12, 3, 5, 2], [12, 5, 6, 1],
        [13, 0, 8, 3], [13, 3, 7, 2], [13, 5, 6, 1],
        [14, 0, 4, 3], [14, 3, 2, 3],
        [15, 0, 0, 6],
      ])
      b.drums('tom', 'x.....', 0, 16, 0.04)
      b.drums('hat', '...o..', 4, 16, 0.016)
    },
  )
}

/** 出口：多利亚调式的电子乐，八分音符的八度低音一路往前推；方波琶音一级级往上爬、到小节末尾冲上去，像充能；铺底带一点失谐，三角波的主旋律隔着回声在虚空里回荡 */
function buildExit(): BgmScore {
  const chords = [0, 0, 3, 3, 4, 4, 2, 6, 0, 0, 3, 3, 5, 4, 6, 6]
  return track(
    {
      bpm: 118,
      stepsPerBeat: 4,
      stepsPerBar: 16,
      bars: 16,
      rootMidi: 50,
      scale: DORIAN,
      echo: { delaySec: (60 / 118) * 0.75, feedback: 0.38, level: 0.26 },
    },
    (b) => {
      const bass: Voice = { wave: 'sawtooth', vol: 0.07, attack: 0.004, release: 0.06, octave: -1 }
      const pad: Voice = { wave: 'triangle', vol: 0.03, attack: 0.5, release: 1, octave: 0 }
      const arp: Voice = { wave: 'square', vol: 0.03, attack: 0.002, release: 0.04, octave: 1, echo: true }
      const lead: Voice = { wave: 'triangle', vol: 0.1, attack: 0.02, release: 0.18, octave: 1, echo: true }
      const rise: Voice = { wave: 'sine', vol: 0.035, attack: 0.002, release: 0.05, octave: 2 }
      b.bass(bass, chords, 'r.o.r.o.r.o.r.o.')
      b.pad(pad, chords, [0, 1, 2], 0.008)
      b.arp(arp, chords, [0, 1, 2, 3, 1, 2, 3, 4])
      for (let bar = 1; bar < chords.length; bar += 2) for (let k = 0; k < 4; k++) b.note(rise, bar, 12 + k, chords[bar]! + k * 2, 1)
      b.line(lead, [
        [0, 0, 4, 6], [0, 6, 3, 2], [0, 8, 4, 8],
        [1, 0, 6, 4], [1, 4, 7, 4], [1, 8, 4, 8],
        [2, 0, 3, 6], [2, 6, 2, 2], [2, 8, 3, 4], [2, 12, 5, 4],
        [3, 0, 4, 16],
        [4, 0, 7, 4], [4, 4, 8, 4], [4, 8, 9, 8],
        [5, 0, 8, 6], [5, 6, 7, 2], [5, 8, 6, 8],
        [6, 0, 5, 4], [6, 4, 4, 4], [6, 8, 6, 8],
        [7, 0, 7, 12], [7, 12, 6, 4],
        [8, 0, 4, 6], [8, 6, 5, 2], [8, 8, 7, 8],
        [9, 0, 9, 4], [9, 4, 8, 4], [9, 8, 7, 8],
        [10, 0, 6, 6], [10, 6, 5, 2], [10, 8, 6, 4], [10, 12, 8, 4],
        [11, 0, 7, 16],
        [12, 0, 9, 4], [12, 4, 10, 4], [12, 8, 11, 8],
        [13, 0, 10, 6], [13, 6, 9, 2], [13, 8, 8, 8],
        [14, 0, 7, 4], [14, 4, 6, 4], [14, 8, 5, 4], [14, 12, 4, 4],
        [15, 0, 4, 16],
      ])
      b.drums('kick', 'x.....x...x.....', 0, 16, 0.14)
      b.drums('snare', '....x.......x...', 4, 16, 0.06)
      b.drums('hat', '..o...o...o...o.', 0, 16, 0.035)
      b.drums('tom', '..............o.', 8, 16, 0.04)
    },
  )
}

const BUILDERS: Record<BgmId, () => BgmScore> = {
  lobby: buildLobby,
  ruins: buildRuins,
  nebula: buildNebula,
  volcano: buildVolcano,
  floe: buildFloe,
  amethyst: buildAmethyst,
  meadow: buildMeadow,
  sakura: buildSakura,
  desert: buildDunes,
  deep: buildDeep,
  petri: buildPetri,
  theater: buildTheater,
  exit: buildExit,
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
