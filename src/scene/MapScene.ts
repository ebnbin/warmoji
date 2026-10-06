import Phaser from 'phaser'
import { browserStorage, StorageKey } from '../util/storage'
import type { MapId } from '../types/maps'
import { bossFor, MAP_IDS, MAPS } from '../data/maps'
import { CHARACTERS } from '../data/characters'
import { chaptersOf, fightCount, fightsOf, RUN_IDS, RUNS } from '../data/runs'
import type { Chapter } from '../data/runs'
import { heatOf, MUTATOR_IDS, MUTATORS } from '../data/mutators'
import type { MutatorId, RunId } from '../types/runs'
import { beginRun, skipFilled } from '../run/state'
import { mutatorFits } from '../run/rules'
import { goStep } from './teamPage'
import { mapPlayLines } from './mapLines'
import { mutatorText, runRuleLines, runStepLines, starText, stepLines, teamText } from './runLines'
import { loadMap, loadMutators, saveMap, saveMutators } from '../save/selection'
import { loadLabs } from '../save/labs'
import type { LabBests } from '../save/labs'
import { preloadEmojis } from '../emoji/hold'
import { beginPage, Button, Checkbox, EmojiGrid, Flow, Icon, Label, PageHeader, pageFrame, Panel, RichLabel, Row, ScrollView, Tabs, TileGrid } from '../ui'
import type { PageFrame, TabItem } from '../ui'
import { VIEWPORT_CHANGED } from '../util/apply'
import { SceneKey } from './keys'

const GROUP_ICONS = { theme: '1f5fa', decor: '1f33f', play: '1f579', note: '1f9ea', team: '1f465', rules: '2696', steps: '1f4dc', stars: '2b50', heat: '1f525', fight: '2694' } as const
/** 预设队伍里随机挑的位置 */
const RANDOM_SLOT = '2753'

/** 一局固定一张地图的是关卡，都在实验关页签里挑；各场都写了地图的是远征，按章挑着看；其余的要玩家选地图；关卡以外的一种一个页签 */
const LABS: readonly RunId[] = RUN_IDS.filter((id) => RUNS[id].map !== undefined)
const JOURNEYS: readonly RunId[] = RUN_IDS.filter((id) => RUNS[id].map === undefined && fightsOf(RUNS[id]).every((f) => f.map !== undefined))
const TAB_RUNS: readonly RunId[] = RUN_IDS.filter((id) => !LABS.includes(id))
const LAB_TAB = { key: 'labs', emoji: '1f9ea', name: '实验关' } as const
/** 沙盒排在最前，按这个顺序列新画风的地图，开局同试炼场；其余要选地图的页签只列剩下的旧地图 */
const BOX_TAB = { key: 'box', emoji: '1f3d6', name: '沙盒', run: 'sandbox' } as const
const BOX_MAPS: readonly MapId[] = ['meadow', 'desert', 'sakura', 'maple', 'floe', 'volcano', 'ship', 'cave', 'ruins', 'circuit', 'nexus', 'nebula', 'deep', 'petri', 'dreamland', 'canyon']
const OLD_MAPS: readonly MapId[] = MAP_IDS.filter((id) => !BOX_MAPS.includes(id))
type Mode = RunId | typeof LAB_TAB.key | typeof BOX_TAB.key
const isJourney = (mode: Mode): mode is RunId => JOURNEYS.some((id) => id === mode)
const CHAPTER_NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'] as const
const chapterName = (i: number, c: Chapter): string => `第${CHAPTER_NUMS[i] ?? i + 1}章 · ${MAPS[c.map].name}`
/** 词缀一行：勾选框、图标、名字与热度、改了什么 */
const MUTATOR_ROW = { h: 68, gap: 8 } as const

export class MapScene extends Phaser.Scene {
  private preserveOnRestart = false
  private boxId: MapId = BOX_MAPS[0]!
  private oldId: MapId = OLD_MAPS[0]!
  private labId: RunId | undefined = LABS[0]
  private mode: Mode = BOX_TAB.key
  /** 远征页签里正在看的章 */
  private chapter = 0
  private frame!: PageFrame
  private mapGrid?: EmojiGrid<MapId>
  private labGrid?: TileGrid<RunId>
  private chapterGrid?: TileGrid<number>
  private detail!: ScrollView
  private confirm!: Button
  /** 勾选的词缀，按词缀表的顺序；对当前关卡没用的开局时不带 */
  private mutators: MutatorId[] = []
  private bests: LabBests = {}
  private heatLine?: Label

  constructor() {
    super(SceneKey.Map)
  }

  preload(): void {
    preloadEmojis(this, [
      ...Object.values(GROUP_ICONS).map((id) => ({ id })),
      { id: RANDOM_SLOT, outline: 'player' as const },
      { id: LAB_TAB.emoji },
      { id: BOX_TAB.emoji },
      ...MUTATOR_IDS.map((id) => ({ id: MUTATORS[id].emoji })),
      ...RUN_IDS.map((id) => ({ id: RUNS[id].emoji })),
      ...LABS.flatMap((id) => {
        const team = RUNS[id].team
        return team && team !== 'knobs' ? team.slots.flatMap((s) => (typeof s === 'string' ? [{ id: CHARACTERS[s].emoji, outline: 'player' as const }] : [])) : []
      }),
      ...MAP_IDS.flatMap((id) => [
        { id: MAPS[id].emoji },
        ...MAPS[id].decor.emojis.map((e) => ({ id: e, outline: 'player' as const })),
      ]),
    ])
  }

  create(): void {
    beginPage(this)
    const preserved = this.preserveOnRestart
    this.preserveOnRestart = false
    if (!preserved) {
      this.boxId = loadMap(browserStorage(), StorageKey.BoxMap, BOX_MAPS)
      this.oldId = loadMap(browserStorage(), StorageKey.Map, OLD_MAPS)
      this.mutators = loadMutators(browserStorage())
    }
    this.bests = loadLabs(browserStorage())
    this.heatLine = undefined
    const mode = this.mode
    const labs = mode === LAB_TAB.key
    const journey = isJourney(mode)

    const f = (this.frame = pageFrame({ sub: true, footer: true }))
    new PageHeader(this, f, { title: labs ? '选择关卡' : journey ? `${RUNS[mode].name}路线` : '选择地图', back: () => this.scene.start(SceneKey.Menu) })
    const tabs: TabItem<Mode>[] = [{ key: BOX_TAB.key, label: `{${BOX_TAB.emoji}} ${BOX_TAB.name}` }, ...TAB_RUNS.map((id) => ({ key: id, label: `{${RUNS[id].emoji}} ${RUNS[id].name}` }))]
    if (LABS.length > 0) tabs.push({ key: LAB_TAB.key, label: `{${LAB_TAB.emoji}} ${LAB_TAB.name}` })
    new Tabs<Mode>(this, { x: f.left, y: f.subY, w: f.right - f.left }, {
      items: tabs,
      selected: this.mode,
      size: 'sm',
      onSelect: (mode) => {
        if (mode === this.mode) return
        this.mode = mode
        this.preserveOnRestart = true
        this.scene.restart()
      },
    })

    new Panel(this, f.detail.x, f.detail.y, f.detail.w, f.detail.h)
    this.detail = new ScrollView(this, { x: f.detail.x, y: f.detail.y + 8, w: f.detail.w, h: f.detail.h - 16 })

    this.mapGrid = undefined
    this.labGrid = undefined
    this.chapterGrid = undefined
    if (journey) {
      const chapters = chaptersOf(RUNS[mode])
      this.chapter = Math.min(this.chapter, chapters.length - 1)
      const grid = (this.chapterGrid = new TileGrid<number>(this, f.list, { minWidth: 150, height: 132 }))
      grid.onTap = (i): void => {
        this.chapter = i
        this.refresh()
      }
      grid.setItems(
        chapters.map((c, i) => {
          const fights = c.steps.filter((s) => s.step.kind === 'fight' || s.step.kind === 'repeat').length
          return { key: i, emoji: MAPS[c.map].emoji, title: chapterName(i, c), icons: Array.from({ length: fights }, () => GROUP_ICONS.fight) }
        }),
      )
    } else if (labs) {
      const grid = (this.labGrid = new TileGrid<RunId>(this, f.list, { minWidth: 150, height: 132 }))
      grid.onTap = (id): void => {
        this.labId = id
        this.refresh()
      }
      grid.setItems(
        LABS.map((id) => {
          const map = RUNS[id].map
          const best = this.bests[id]
          const stars = Array.from({ length: best?.stars ?? 0 }, () => GROUP_ICONS.stars)
          return { key: id, emoji: RUNS[id].emoji, title: RUNS[id].name, icons: [...(map ? [MAPS[map].emoji] : []), ...stars], badge: best && best.heat > 0 ? GROUP_ICONS.heat : undefined }
        }),
      )
    } else {
      const box = mode === BOX_TAB.key
      const grid = (this.mapGrid = new EmojiGrid<MapId>(this, f.list))
      grid.onTap = (key): void => {
        if (box) this.boxId = key
        else this.oldId = key
        saveMap(browserStorage(), box ? StorageKey.BoxMap : StorageKey.Map, key)
        this.refresh()
      }
      grid.setItems((box ? BOX_MAPS : OLD_MAPS).map((id) => ({ key: id, emoji: MAPS[id].emoji })))
    }

    this.confirm = new Button(this, f.centerX, f.footerY, { label: '', keys: ['ENTER', 'SPACE'], onTap: () => this.start() })

    this.refresh()
    if (labs && this.labId) this.labGrid?.reveal(this.labId)
    if (journey) this.chapterGrid?.reveal(this.chapter)

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
    })
  }

  private get selectedId(): MapId {
    return this.mode === BOX_TAB.key ? this.boxId : this.oldId
  }

  private runId(): RunId | undefined {
    const mode = this.mode
    return mode === LAB_TAB.key ? this.labId : mode === BOX_TAB.key ? BOX_TAB.run : mode
  }

  private start(): void {
    const mode = this.mode
    const id = this.runId()
    if (!id) return
    const run = beginRun(id, this.selectedId, mode === LAB_TAB.key || isJourney(mode) ? this.applied(id) : [])
    skipFilled(run)
    goStep(this, run)
  }

  /** 这一关开局会带上的词缀：勾了又对它有用的 */
  private applied(id: RunId): MutatorId[] {
    return this.mutators.filter((m) => mutatorFits(RUNS[id], MUTATORS[m]))
  }

  private toggleMutator(mutator: MutatorId, on: boolean): void {
    const chosen = new Set(this.mutators)
    if (on) chosen.add(mutator)
    else chosen.delete(mutator)
    this.mutators = MUTATOR_IDS.filter((m) => chosen.has(m))
    saveMutators(browserStorage(), this.mutators)
    const id = this.runId()
    if (id) this.showHeat(id)
  }

  /** 热度的一行与开始键跟着勾选变 */
  private showHeat(id: RunId): void {
    const heat = heatOf(this.applied(id))
    const go = isJourney(this.mode) ? `开始${RUNS[id].name}` : '开始挑战'
    this.heatLine?.setText(heat > 0 ? `这一局热度 ${heat}` : '没有勾选词缀，热度 0').setInk(heat > 0 ? 'warn' : 'muted')
    this.confirm.setLabel(heat > 0 ? `${go} · 热度 ${heat}` : go)
  }

  private renderMap(mode: RunId, tab: { readonly name: string; readonly emoji: string } = RUNS[mode]): void {
    const view = this.detail.clear()
    const def = MAPS[this.selectedId]
    const width = this.frame.detail.w - 48
    const flow = new Flow(this, view, { x: 24, y: 12, width })
    flow.put(new RichLabel(this, 24, 42, `{${def.emoji}} ${def.name}`, { kind: 'lead', iconSize: 76, gap: 14, originX: 0, maxWidth: width }), 90)
    flow.heading('主题', GROUP_ICONS.theme).text(def.desc).gap(10)
    flow.heading('地面装饰', GROUP_ICONS.decor).icons(def.decor.emojis, { outline: 'player' }).gap(4)
    flow.heading('玩法', GROUP_ICONS.play)
    for (const line of mapPlayLines(def)) flow.text(line)
    flow.text(`终波头目 ${bossFor(this.selectedId).name}`, { color: 'muted' })
    flow.gap(10).heading(tab.name, tab.emoji).text(RUNS[mode].desc)
    flow.finish()
  }

  /** 关卡：玩法、在试什么、地图、队伍与每一步 */
  private renderLab(id: RunId): void {
    const view = this.detail.clear()
    const run = RUNS[id]
    const width = this.frame.detail.w - 48
    const flow = new Flow(this, view, { x: 24, y: 12, width })
    flow.put(new RichLabel(this, 24, 42, `{${run.emoji}} ${run.name}`, { kind: 'lead', iconSize: 76, gap: 14, originX: 0, maxWidth: width }), 90)
    flow.text(run.desc, { color: 'ink', indent: false }).gap(6)
    if (run.note) flow.heading('在试什么', GROUP_ICONS.note).text(run.note, { color: 'muted' }).gap(6)
    const map = MAPS[run.map ?? this.selectedId]
    flow.heading(`地图 · ${map.name}`, map.emoji).text(mapPlayLines(map)[0]!).gap(6)
    const team = run.team
    if (team && team !== 'knobs') {
      flow.heading('队伍', GROUP_ICONS.team)
      flow.icons(team.slots.map((s) => (typeof s === 'string' ? CHARACTERS[s].emoji : RANDOM_SLOT)), { size: 40, outline: 'player' })
      flow.text(teamText(team)).gap(6)
    }
    const rules = runRuleLines(run)
    if (rules.length > 0) {
      flow.heading('队伍规则', GROUP_ICONS.rules)
      for (const line of rules) flow.text(line)
      flow.gap(6)
    }
    flow.heading('流程', GROUP_ICONS.steps)
    for (const line of runStepLines(run)) flow.text(line)
    this.flowStars(flow, id)
    this.flowMutators(flow, id)
    flow.finish()
  }

  /** 远征：说明、这一章的每一步，外加整局的规则、星级与词缀 */
  private renderJourney(id: RunId): void {
    const view = this.detail.clear()
    const run = RUNS[id]
    const chapters = chaptersOf(run)
    const c = chapters[this.chapter]!
    const map = MAPS[c.map]
    const width = this.frame.detail.w - 48
    const flow = new Flow(this, view, { x: 24, y: 12, width })
    flow.put(new RichLabel(this, 24, 42, `{${run.emoji}} ${run.name}`, { kind: 'lead', iconSize: 76, gap: 14, originX: 0, maxWidth: width }), 90)
    flow.text(run.desc, { color: 'ink', indent: false }).gap(6)
    flow.heading(chapterName(this.chapter, c), map.emoji).text(mapPlayLines(map)[0]!, { color: 'muted' })
    for (const { step, index } of c.steps) stepLines(step).forEach((line, k) => flow.text(k === 0 ? `${index + 1}. ${line}` : line))
    flow.gap(6)
    const rules = runRuleLines(run)
    if (rules.length > 0) {
      flow.heading('队伍规则', GROUP_ICONS.rules)
      for (const line of rules) flow.text(line)
      flow.gap(6)
    }
    this.flowStars(flow, id)
    this.flowMutators(flow, id)
    flow.finish()
  }

  /** 星级条件与最好成绩：赢过的写星数与最高热度，没赢过的写最远打过了几场 */
  private flowStars(flow: Flow, id: RunId): void {
    const run = RUNS[id]
    if (!run.stars) return
    const best = this.bests[id]
    const won = best !== undefined && best.stars > 0
    const fights = fightCount(run)
    flow.gap(6).heading('星级', GROUP_ICONS.stars)
    flow.text(`过关得一星，下面每做到一条再得一星：${run.stars.map(starText).join('；')}`)
    const tried = best && best.reached > 0 && fights > 1 ? `还没有通关，最远打过了 ${best.reached}/${fights} 场` : '还没有过关'
    flow.text(won ? `最好成绩 ${best.stars}/${1 + run.stars.length} 星${best.heat > 0 ? ` · 最高热度 ${best.heat}` : ''}` : tried, { color: won ? 'accent' : 'muted' })
  }

  /** 词缀：对这一关有用的一个一行，勾上就在开局时带上 */
  private flowMutators(flow: Flow, id: RunId): void {
    const fits = MUTATOR_IDS.filter((m) => mutatorFits(RUNS[id], MUTATORS[m]))
    if (fits.length === 0) return
    flow.gap(6).heading('词缀', GROUP_ICONS.heat)
    flow.text('开局前自选，叠得越多越难；赢下时记下最高热度', { color: 'muted' })
    const x = flow.indent
    const w = 24 + this.frame.detail.w - 48 - x
    for (const mid of fits) {
      const m = MUTATORS[mid]
      const box = new Checkbox(this, 30, MUTATOR_ROW.h / 2, { value: this.mutators.includes(mid), onChange: (on) => this.toggleMutator(mid, on) })
      const row = new Row(this, x, flow.y, w, MUTATOR_ROW.h, { onTap: () => box.toggle() })
      row.add([
        box,
        new Icon(this, 80, MUTATOR_ROW.h / 2, m.emoji, 38),
        new Label(this, 110, 20, m.name, { kind: 'label', bold: true }).setOrigin(0, 0.5),
        new Label(this, w - 14, 20, `热度 +${m.heat}`, { kind: 'caption', bold: true, color: 'warn' }).setOrigin(1, 0.5),
        new Label(this, 110, 48, mutatorText(m), { kind: 'caption', color: 'muted' }).setOrigin(0, 0.5).fit(w - 124),
      ])
      flow.put(row, MUTATOR_ROW.h + MUTATOR_ROW.gap)
    }
    const line = (this.heatLine = new Label(this, x, flow.y + 4, '', { kind: 'body', bold: true }))
    flow.put(line, 40)
    this.showHeat(id)
  }

  private refresh(): void {
    const mode = this.mode
    if (isJourney(mode)) {
      this.chapterGrid?.setSelected(this.chapter)
      this.heatLine = undefined
      this.confirm.setLabel(`开始${RUNS[mode].name}`).setEnabled(true)
      this.renderJourney(mode)
      return
    }
    if (this.mode === LAB_TAB.key) {
      const id = this.labId
      this.labGrid?.setSelected(id ?? null)
      this.confirm.setLabel('开始挑战').setEnabled(id !== undefined)
      this.heatLine = undefined
      if (id) this.renderLab(id)
      return
    }
    this.mapGrid?.setSelected(this.selectedId)
    if (this.mode === BOX_TAB.key) {
      this.confirm.setLabel(`进入${BOX_TAB.name}`)
      this.renderMap(BOX_TAB.run, BOX_TAB)
      return
    }
    const run = RUNS[this.mode]
    this.confirm.setLabel(run.steps[0]?.kind === 'recruit' ? '招募首发' : `进入${run.name}`)
    this.renderMap(this.mode)
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart()
  }
}
