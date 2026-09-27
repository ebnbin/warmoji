import Phaser from 'phaser'
import { browserStorage } from '../util/storage'
import type { MapId } from '../types/maps'
import { bossFor, MAP_IDS, MAPS } from '../data/maps'
import { RUN_IDS, RUNS } from '../data/runs'
import type { RunId } from '../types/runs'
import { beginRun, skipFilled } from '../run/state'
import { goStep } from './teamPage'
import { mapPlayLines } from './mapLines'
import { loadMap, saveMap } from '../save/selection'
import { preloadEmojis } from '../emoji/hold'
import { beginPage, Button, EmojiGrid, Flow, PageHeader, pageFrame, Panel, RichLabel, ScrollView, Tabs } from '../ui'
import type { PageFrame } from '../ui'
import { VIEWPORT_CHANGED } from '../util/apply'
import { SceneKey } from './keys'

const GROUP_ICONS = { theme: '1f5fa', decor: '1f33f', play: '1f579' } as const

/** 选地图的玩法，一种一个页签 */
const MODES: readonly RunId[] = RUN_IDS

export class MapScene extends Phaser.Scene {
  private preserveOnRestart = false
  private selectedId: MapId = MAP_IDS[0]!
  private mode: RunId = MODES[0]!
  private frame!: PageFrame
  private grid!: EmojiGrid<MapId>
  private detail!: ScrollView
  private confirm!: Button

  constructor() {
    super(SceneKey.Map)
  }

  preload(): void {
    preloadEmojis(this, [
      ...Object.values(GROUP_ICONS).map((id) => ({ id })),
      ...MODES.map((id) => ({ id: RUNS[id].emoji })),
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
    if (!preserved) this.selectedId = loadMap(browserStorage())

    const f = (this.frame = pageFrame({ sub: true, footer: true }))
    new PageHeader(this, f, { title: '选择地图', back: () => this.scene.start(SceneKey.Menu) })
    new Tabs(this, { x: f.left, y: f.subY, w: f.right - f.left }, {
      items: MODES.map((id) => ({ key: id, label: `{${RUNS[id].emoji}} ${RUNS[id].name}` })),
      selected: this.mode,
      size: 'sm',
      onSelect: (id) => {
        this.mode = id
        this.refresh()
      },
    })

    new Panel(this, f.detail.x, f.detail.y, f.detail.w, f.detail.h)
    this.detail = new ScrollView(this, { x: f.detail.x, y: f.detail.y + 8, w: f.detail.w, h: f.detail.h - 16 })

    this.grid = new EmojiGrid(this, f.list)
    this.grid.onTap = (key): void => {
      this.selectedId = key
      saveMap(browserStorage(), this.selectedId)
      this.refresh()
    }
    this.grid.setItems(MAP_IDS.map((id) => ({ key: id, emoji: MAPS[id].emoji })))

    this.confirm = new Button(this, f.centerX, f.footerY, { label: '', keys: ['ENTER', 'SPACE'], onTap: () => this.start() })

    this.refresh()

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
    })
  }

  private start(): void {
    const run = beginRun(this.mode, this.selectedId)
    skipFilled(run)
    goStep(this, run)
  }

  private renderDetail(): void {
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
    const run = RUNS[this.mode]
    flow.gap(10).heading(run.name, run.emoji).text(run.desc)
    flow.finish()
  }

  private refresh(): void {
    this.grid.setSelected(this.selectedId)
    const run = RUNS[this.mode]
    this.confirm.setLabel(run.steps[0]?.kind === 'recruit' ? '招募首发' : `进入${run.name}`)
    this.renderDetail()
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart()
  }
}
