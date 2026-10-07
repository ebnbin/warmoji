import Phaser from 'phaser'
import { browserStorage } from '../util/storage'
import type { MapId } from '../types/maps'
import { bossFor, MAP_IDS, MAPS } from '../data/maps'
import { BOX_MAPS } from '../data/boxMaps'
import { CHARACTERS } from '../data/characters'
import { fightCount, RUN_IDS, RUNS } from '../data/runs'
import { heatOf, MUTATOR_IDS, MUTATORS } from '../data/mutators'
import { EXPERIMENT_IDS, EXPERIMENTS } from '../data/experiments'
import type { ExperimentId, MutatorId, RunId, StageDef } from '../types/runs'
import { beginRun, beginSandbox, skipFilled } from '../run/state'
import { SANDBOX } from '../run/sandbox'
import { mutatorFits } from '../run/rules'
import { goStep } from './teamPage'
import { mapPlayLines } from './mapLines'
import { fightRuleLines, mutatorText, phaseLines, runRuleLines, runStepLines, starText, teamText } from './runLines'
import { loadMap, loadMutators, saveMap, saveMutators } from '../save/selection'
import { loadLabs } from '../save/labs'
import type { LabBests } from '../save/labs'
import { preloadEmojis } from '../emoji/hold'
import { beginPage, Button, Checkbox, EmojiGrid, Flow, Icon, Label, PageHeader, pageFrame, Panel, RichLabel, Row, ScrollView, Tabs, TileGrid } from '../ui'
import type { PageFrame, TabItem } from '../ui'
import { VIEWPORT_CHANGED } from '../util/apply'
import { SceneKey } from './keys'

const GROUP_ICONS = { theme: '1f5fa', decor: '1f33f', play: '1f579', note: '1f9ea', team: '1f465', rules: '2696', steps: '1f4dc', stars: '2b50', heat: '1f525' } as const
/** 预设队伍里随机挑的位置 */
const RANDOM_SLOT = '2753'

/** 冒险的每一章是一局，在冒险页签里按地图的顺序挑；实验单独试玩的那一局都在实验页签里挑 */
const isExperiment = (id: RunId): id is ExperimentId => EXPERIMENT_IDS.some((e) => e === id)
const CHAPTERS: readonly RunId[] = BOX_MAPS.flatMap((m) => RUN_IDS.filter((id) => RUNS[id].chapter === m))
const ADVENTURE_TAB = { key: 'adventure', emoji: '1f3d5', name: '冒险' } as const
const EXPERIMENT_TAB = { key: 'experiments', emoji: '2697', name: '实验' } as const
/** 沙盒排在最前：挑一张地图开一局沙盒 */
const BOX_TAB = { key: 'box', emoji: SANDBOX.emoji, name: SANDBOX.name } as const
/** 挑关卡的页签：冒险与实验，各列各的关卡、记各自选中的那一关 */
type PickTab = typeof ADVENTURE_TAB.key | typeof EXPERIMENT_TAB.key
type Mode = PickTab | typeof BOX_TAB.key
const PICKS: Readonly<Record<PickTab, readonly RunId[]>> = { [ADVENTURE_TAB.key]: CHAPTERS, [EXPERIMENT_TAB.key]: EXPERIMENT_IDS }
const isPick = (mode: Mode): mode is PickTab => mode !== BOX_TAB.key
/** 关卡打在哪张地图上：冒险那一章的，或实验那一场的 */
const labMap = (id: RunId): MapId | undefined => RUNS[id].chapter ?? (isExperiment(id) ? EXPERIMENTS[id].fight.map : undefined)
const CHAPTER_NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'] as const
const chapterName = (i: number, map: MapId): string => `第${CHAPTER_NUMS[i] ?? i + 1}章 · ${MAPS[map].name}`
/** 词缀一行：勾选框、图标、名字与热度、改了什么 */
const MUTATOR_ROW = { h: 68, gap: 8 } as const

export class MapScene extends Phaser.Scene {
  private preserveOnRestart = false
  private boxId: MapId = BOX_MAPS[0]!
  private picked: Record<PickTab, RunId | undefined> = { [ADVENTURE_TAB.key]: CHAPTERS[0], [EXPERIMENT_TAB.key]: EXPERIMENT_IDS[0] }
  private mode: Mode = BOX_TAB.key
  private frame!: PageFrame
  private mapGrid?: EmojiGrid<MapId>
  private labGrid?: TileGrid<RunId>
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
      { id: ADVENTURE_TAB.emoji },
      { id: EXPERIMENT_TAB.emoji },
      { id: BOX_TAB.emoji },
      ...MUTATOR_IDS.map((id) => ({ id: MUTATORS[id].emoji })),
      ...RUN_IDS.map((id) => ({ id: RUNS[id].emoji })),
      ...RUN_IDS.flatMap((id) => {
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
      this.boxId = loadMap(browserStorage(), BOX_MAPS)
      this.mutators = loadMutators(browserStorage())
    }
    this.bests = loadLabs(browserStorage())
    this.heatLine = undefined
    const mode = this.mode

    const f = (this.frame = pageFrame({ sub: true, footer: true }))
    const title = mode === ADVENTURE_TAB.key ? '选择章节' : mode === EXPERIMENT_TAB.key ? '选择实验' : '选择地图'
    new PageHeader(this, f, { title, back: () => this.scene.start(SceneKey.Menu) })
    const pickTab = (t: { readonly key: PickTab; readonly emoji: string; readonly name: string }): TabItem<Mode>[] => (PICKS[t.key].length > 0 ? [{ key: t.key, label: `{${t.emoji}} ${t.name}` }] : [])
    const tabs: TabItem<Mode>[] = [
      { key: BOX_TAB.key, label: `{${BOX_TAB.emoji}} ${BOX_TAB.name}` },
      ...pickTab(ADVENTURE_TAB),
      ...pickTab(EXPERIMENT_TAB),
    ]
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
    if (isPick(mode)) {
      const grid = (this.labGrid = new TileGrid<RunId>(this, f.list, { minWidth: 150, height: 132 }))
      grid.onTap = (id): void => {
        this.picked[mode] = id
        this.refresh()
      }
      grid.setItems(
        PICKS[mode].map((id) => {
          const map = labMap(id)
          const chapter = RUNS[id].chapter
          const best = this.bests[id]
          const stars = Array.from({ length: best?.stars ?? 0 }, () => GROUP_ICONS.stars)
          const badge = best && best.heat > 0 ? GROUP_ICONS.heat : undefined
          if (chapter !== undefined) return { key: id, emoji: MAPS[chapter].emoji, title: chapterName(BOX_MAPS.indexOf(chapter), chapter), icons: stars, badge }
          return { key: id, emoji: RUNS[id].emoji, title: RUNS[id].name, icons: [...(map ? [MAPS[map].emoji] : []), ...stars], badge }
        }),
      )
    } else {
      const grid = (this.mapGrid = new EmojiGrid<MapId>(this, f.list))
      grid.onTap = (key): void => {
        this.boxId = key
        saveMap(browserStorage(), key)
        this.refresh()
      }
      grid.setItems(BOX_MAPS.map((id) => ({ key: id, emoji: MAPS[id].emoji })))
    }

    this.confirm = new Button(this, f.centerX, f.footerY, { label: '', keys: ['ENTER', 'SPACE'], onTap: () => this.start() })

    this.refresh()
    const pick = isPick(mode) ? this.picked[mode] : undefined
    if (pick) this.labGrid?.reveal(pick)

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
    })
  }

  private start(): void {
    const mode = this.mode
    if (!isPick(mode)) {
      goStep(this, beginSandbox(this.boxId))
      return
    }
    const id = this.picked[mode]
    if (!id) return
    const run = beginRun(id, this.applied(id))
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
    const mode = this.mode
    const id = isPick(mode) ? this.picked[mode] : undefined
    if (id) this.showHeat(id)
  }

  /** 开始键上的字：冒险写玩法的名字，实验是开始挑战 */
  private goLabel(): string {
    return this.mode === ADVENTURE_TAB.key ? `开始${ADVENTURE_TAB.name}` : '开始挑战'
  }

  /** 热度的一行与开始键跟着勾选变 */
  private showHeat(id: RunId): void {
    const heat = heatOf(this.applied(id))
    const go = this.goLabel()
    this.heatLine?.setText(heat > 0 ? `这一局热度 ${heat}` : '没有勾选词缀，热度 0').setInk(heat > 0 ? 'warn' : 'muted')
    this.confirm.setLabel(heat > 0 ? `${go} · 热度 ${heat}` : go)
  }

  /** 沙盒：挑中的这张图，连同这一局沙盒的说明 */
  private renderMap(): void {
    const view = this.detail.clear()
    const def = MAPS[this.boxId]
    const width = this.frame.detail.w - 48
    const flow = new Flow(this, view, { x: 24, y: 12, width })
    flow.put(new RichLabel(this, 24, 42, `{${def.emoji}} ${def.name}`, { kind: 'lead', iconSize: 76, gap: 14, originX: 0, maxWidth: width }), 90)
    flow.heading('主题', GROUP_ICONS.theme).text(def.desc).gap(10)
    flow.heading('地面装饰', GROUP_ICONS.decor).icons(def.decor.emojis, { outline: 'player' }).gap(4)
    flow.heading('玩法', GROUP_ICONS.play)
    for (const line of mapPlayLines(def)) flow.text(line)
    flow.text(`头目 ${bossFor(this.boxId).name}`, { color: 'muted' })
    flow.gap(10).heading(SANDBOX.name, SANDBOX.emoji).text(SANDBOX.desc)
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
    const map = MAPS[labMap(id) ?? this.boxId]
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
    if (isExperiment(id)) this.flowExperiment(flow, EXPERIMENTS[id].fight)
    else {
      flow.heading('流程', GROUP_ICONS.steps)
      for (const line of runStepLines(run)) flow.text(line)
    }
    this.flowStars(flow, id)
    this.flowMutators(flow, id)
    flow.finish()
  }

  /** 实验那一场：这一场的规则，各个阶段怎么达成 */
  private flowExperiment(flow: Flow, fight: StageDef): void {
    const rules = fightRuleLines(fight)
    if (rules.length > 0) {
      flow.heading('规则', GROUP_ICONS.rules)
      for (const line of rules) flow.text(line)
      flow.gap(6)
    }
    const lines = phaseLines(fight)
    flow.heading(lines.length > 1 ? '阶段' : '目标', GROUP_ICONS.steps)
    lines.forEach((line, i) => flow.text(lines.length > 1 ? `${i + 1}. ${line}` : line))
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
    if (isPick(mode)) {
      const id = this.picked[mode]
      this.labGrid?.setSelected(id ?? null)
      this.confirm.setLabel(id ? this.goLabel() : '开始挑战').setEnabled(id !== undefined)
      this.heatLine = undefined
      if (id) this.renderLab(id)
      return
    }
    this.mapGrid?.setSelected(this.boxId)
    this.confirm.setLabel(`进入${BOX_TAB.name}`)
    this.renderMap()
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart()
  }
}
