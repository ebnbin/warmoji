import Phaser from 'phaser'
import { CHARACTERS, ROSTER_IDS, TEAM } from '../data/characters'
import { ROLES } from '../data/roles'
import { modTexts } from '../data/stats'
import { DUTY_TAGS, TAG_IDS, TAGS, tagsOf } from '../data/tags'
import { playSfx } from '../audio/sfx'
import { claimRecruit } from '../run/levelUp'
import { memberLook } from '../run/members'
import { getRun, recruitCandidates, recruitDueCount, recruitMember } from '../run/state'
import { fought } from '../run/flow'
import type { RunState } from '../run/state'
import type { CharacterId, CharacterTag } from '../types/characters'
import { AvatarSlot, beginPage, Button, Chip, Divider, Flow, hasModal, Icon, Label, PageHeader, pageFrame, Panel, RichLabel, Scrim, ScrollView, TagChip, TileGrid } from '../ui'
import type { PageFrame, Rect, TileItem } from '../ui'
import { applyCamera, VIEWPORT_CHANGED } from '../util/apply'
import type { LevelUpWake } from './levelUp'
import { characterStatGroups } from './statLines'
import { finishStep, flowStatGroups, isLeaving, runExit } from './teamPage'
import { SceneKey } from './keys'
import type { DevProvider, DevProviderHost } from '../devtools'

/** 详情区顶上的队伍栏高度 */
const STRIP_H = 84
/** 队伍栏里的头像与间距 */
const STRIP_AVATAR = 40
const STRIP_PITCH = 54
/** 名单与详情之间的空隙 */
const GAP = 18
/** 筛选标签之间与行间的空隙 */
const CHIP_GAP = 8
const CHIP_ROW = 54
/** 标签行比副标题行低一点，离页头的按钮远些 */
const CHIP_DROP = 8

function tagLabel(t: CharacterTag): string {
  return `{${TAGS[t].icon}} ${TAGS[t].name}`
}

/** 招募页：全部角色都能招；按标签筛选，点一名看详情，确认后招进队伍。升级时来招人的盖在停住的战斗上，招一人就回去 */
export class RecruitScene extends Phaser.Scene implements DevProviderHost {
  /** 升级时来招人 */
  private readonly forLevelUp: boolean
  private preserveOnRestart = false
  private leaving = false
  private run!: RunState
  private frame!: PageFrame
  /** 正在看的角色；为空时详情区是队伍概况 */
  private focus: CharacterId | null = null
  /** 选中的标签：只列出同时带着这些标签的角色 */
  private filters = new Set<CharacterTag>()
  private gridScroll = 0
  private allChip!: TagChip
  private chips = new Map<CharacterTag, TagChip>()
  private grid!: TileGrid<CharacterId>
  private panel!: Rect
  private strip: Phaser.GameObjects.GameObject[] = []
  private detail!: ScrollView
  private confirmBtn!: Button

  constructor(key: SceneKey.Recruit | SceneKey.LevelUpRecruit = SceneKey.Recruit) {
    super(key)
    this.forLevelUp = key === SceneKey.LevelUpRecruit
  }

  create(): void {
    if (this.forLevelUp) {
      applyCamera(this)
      new Scrim(this, { depth: -1, alpha: 0.92, block: false })
    } else {
      beginPage(this)
    }
    const preserved = this.preserveOnRestart
    this.preserveOnRestart = false
    this.leaving = false
    this.run = getRun()
    if (!preserved) {
      this.focus = null
      this.filters = new Set()
      this.gridScroll = 0
    }
    this.strip = []
    this.chips = new Map()

    const f = (this.frame = pageFrame({ sub: true, footer: true }))
    new PageHeader(this, f, {
      title: this.forLevelUp || fought(this.run) ? '招募新队员' : '组建队伍',
      ...(this.forLevelUp ? { back: () => this.backToLevelUp(false) } : runExit(this, this.run, () => ({ from: SceneKey.Recruit }))),
    })
    const { roster, panel } = this.bodyRects(this.createChips())
    this.grid = new TileGrid<CharacterId>(this, roster, { minWidth: 118, height: 140, initialScroll: this.gridScroll, onScroll: (pos) => (this.gridScroll = pos) })
    this.grid.onTap = (id): void => this.setFocus(id)
    this.panel = panel
    new Panel(this, panel.x, panel.y, panel.w, panel.h)
    new Divider(this, panel.x + 16, panel.y + STRIP_H, panel.w - 32)
    this.detail = new ScrollView(this, { x: panel.x, y: panel.y + STRIP_H + 6, w: panel.w, h: panel.h - STRIP_H - 14 })
    this.confirmBtn = new Button(this, f.centerX, f.footerY, { label: '', keys: ['ENTER', 'SPACE'], sfx: null, onTap: () => this.confirm() })

    this.renderGrid()
    this.renderFocus()
    const keyboard = this.input.keyboard
    if (keyboard) {
      const moves: readonly (readonly [string, () => number])[] = [
        ['LEFT', () => -1],
        ['RIGHT', () => 1],
        ['UP', () => -this.grid.columns],
        ['DOWN', () => this.grid.columns],
      ]
      for (const [key, by] of moves) keyboard.on(`keydown-${key}`, () => this.step(by()))
    }

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
    })
  }

  /** 筛选标签排在标题下，一行放不下就折行、每行居中；返回最下一行的底 */
  private createChips(): number {
    const f = this.frame
    const B = f.body
    this.allChip = new TagChip(this, 0, 0, { label: '全部', tone: 'accent', onTap: () => this.setFilters([]) })
    for (const t of TAG_IDS) this.chips.set(t, new TagChip(this, 0, 0, { label: tagLabel(t), tone: TAGS[t].tone, onTap: () => this.toggle(t) }))
    const rows: TagChip[][] = [[]]
    let used = 0
    for (const chip of [this.allChip, ...this.chips.values()]) {
      const row = rows[rows.length - 1]!
      if (row.length > 0 && used + CHIP_GAP + chip.chipWidth > B.w) {
        rows.push([chip])
        used = chip.chipWidth
      } else {
        used += (row.length > 0 ? CHIP_GAP : 0) + chip.chipWidth
        row.push(chip)
      }
    }
    rows.forEach((row, r) => {
      const span = row.reduce((s, c) => s + c.chipWidth, 0) + CHIP_GAP * (row.length - 1)
      let x = B.x + (B.w - span) / 2
      for (const chip of row) {
        chip.setPosition(x + chip.chipWidth / 2, f.subY + CHIP_DROP + r * CHIP_ROW)
        x += chip.chipWidth + CHIP_GAP
      }
    })
    return f.subY + CHIP_DROP + (rows.length - 1) * CHIP_ROW + 25
  }

  /** 横屏左名单右详情，竖屏上名单下详情 */
  private bodyRects(chipsBottom: number): { roster: Rect; panel: Rect } {
    const f = this.frame
    const B = f.body
    const y = Math.max(B.y, chipsBottom + 16)
    const h = B.y + B.h - y
    if (f.portrait) {
      const rh = Math.round(h * 0.46)
      return { roster: { x: B.x, y, w: B.w, h: rh }, panel: { x: B.x, y: y + rh + GAP, w: B.w, h: h - rh - GAP } }
    }
    const rw = 720
    return { roster: { x: B.x, y, w: rw, h }, panel: { x: B.x + rw + GAP, y, w: B.w - rw - GAP, h } }
  }

  /** 同时带着这些标签的角色 */
  private matching(tags: readonly CharacterTag[]): CharacterId[] {
    return ROSTER_IDS.filter((id) => tags.every((t) => CHARACTERS[id].tags.includes(t)))
  }

  private toggle(t: CharacterTag): void {
    const next = new Set(this.filters)
    if (next.has(t)) next.delete(t)
    else next.add(t)
    this.setFilters([...next])
  }

  private setFilters(tags: readonly CharacterTag[]): void {
    this.filters = new Set(tags)
    this.renderGrid()
    this.grid.scrollTo(0)
  }

  /** 方向键在列出的角色里挪动焦点 */
  private step(by: number): void {
    const list = this.matching([...this.filters])
    if (list.length === 0 || hasModal(this)) return
    const at = this.focus === null ? -1 : list.indexOf(this.focus)
    this.setFocus(list[at < 0 ? 0 : Phaser.Math.Clamp(at + by, 0, list.length - 1)]!)
  }

  private setFocus(id: CharacterId | null): void {
    this.focus = id
    this.grid.setSelected(id)
    if (id) this.grid.reveal(id)
    this.renderFocus()
  }

  /** 名单按筛选列出；加上哪个标签会一个都不剩，那个标签就压暗 */
  private renderGrid(): void {
    const tags = [...this.filters]
    this.allChip.setOn(tags.length === 0)
    for (const [t, chip] of this.chips) {
      const on = this.filters.has(t)
      chip.setOn(on).setDim(!on && this.matching([...tags, t]).length === 0)
    }
    const roster = this.run.roster
    this.grid.setItems(
      this.matching(tags).map((id): TileItem<CharacterId> => {
        const def = CHARACTERS[id]
        const joined = roster.includes(id)
        return { key: id, emoji: def.emoji, outline: 'player', title: def.name, icons: tagsOf(def).map((t) => TAGS[t].icon), badge: joined ? '1f396' : undefined, dim: joined }
      }),
    )
    this.grid.setSelected(this.focus)
  }

  private renderFocus(): void {
    this.renderStrip()
    const view = this.detail.clear()
    if (this.focus) this.flowCharacter(view, this.focus)
    else this.flowOverview(view)
    this.renderConfirm()
  }

  /** 队伍栏：现有队员与待补的空位；正在看的角色能招，就先摆进第一个空位 */
  private renderStrip(): void {
    this.tweens.killTweensOf(this.strip)
    for (const o of this.strip) o.destroy()
    this.strip = []
    const P = this.panel
    const cy = P.y + STRIP_H / 2
    const roster = this.run.roster
    const due = this.due()
    const title = new Label(this, P.x + 20, cy, '队伍', { kind: 'label', bold: true, color: 'soft' }).setOrigin(0, 0.5)
    const count = new Label(this, P.x + P.w - 20, cy, due > 0 ? `${roster.length} → ${roster.length + due} 人` : `${roster.length} 人`, { kind: 'label', color: 'info' }).setOrigin(1, 0.5)
    this.strip.push(title, count)
    let x = title.x + title.width + 16 + STRIP_AVATAR / 2
    roster.forEach((id, slot) => {
      this.strip.push(new AvatarSlot(this, x, cy, STRIP_AVATAR, { mode: 'member', emoji: memberLook(this.run, slot), outline: 'player', onTap: () => this.setFocus(id) }))
      x += STRIP_PITCH
    })
    const candidate = this.focus !== null && !roster.includes(this.focus) ? this.focus : null
    for (let i = 0; i < due; i++) {
      const id = i === 0 ? candidate : null
      const slot = id ? new AvatarSlot(this, x, cy, STRIP_AVATAR, { mode: 'picked', emoji: CHARACTERS[id].emoji, outline: 'player' }) : new AvatarSlot(this, x, cy, STRIP_AVATAR, { mode: 'empty' })
      if (id) {
        slot.setScale(0.6)
        this.tweens.add({ targets: slot, scale: 1, duration: 180, ease: 'Back.easeOut' })
      }
      this.strip.push(slot)
      x += STRIP_PITCH
    }
  }

  /** 角色详情：头像、名字、定位与标签，其后是属性、技能、普攻与升级路径 */
  private flowCharacter(view: ScrollView, id: CharacterId): void {
    const def = CHARACTERS[id]
    const w = view.viewport.w
    const x = 118
    view.add(new Icon(this, 62, 54, def.emoji, 84, 'player'))
    const name = new Label(this, x, 30, def.name, { kind: 'lead' }).setOrigin(0, 0.5)
    view.add([name, new Chip(this, name.x + name.width + 12, 30, ROLES[def.role].name, { tone: 'steel', originX: 0 })])
    const desc = new Label(this, x, 54, def.desc, { kind: 'label', color: 'muted', wrap: w - x - 20 })
    view.add(desc)
    let y = Math.max(114, desc.y + desc.height + 14)
    let tx = 24
    for (const t of tagsOf(def)) {
      const chip = new TagChip(this, 0, 0, { label: tagLabel(t), tone: TAGS[t].tone, on: true, size: 'sm', originX: 0 })
      if (tx > 24 && tx + chip.chipWidth > w - 20) {
        tx = 24
        y += 40
      }
      view.add(chip.setPosition(tx, y + 15))
      tx += chip.chipWidth + 8
    }
    const flow = new Flow(this, view, { x: 24, y: y + 46, width: w - 48 })
    const mods = modTexts(ROLES[def.role].stats)
    flow.text(`定位「${ROLES[def.role].name}」：${mods.length > 0 ? mods.join('、') : '没有额外的属性修正'}`, { kind: 'label', color: 'muted', indent: false })
    flow.gap(6)
    flowStatGroups(flow, characterStatGroups(id))
    flow.finish()
  }

  /** 还没点角色时：队伍还缺什么职责、怎么挑、各个标签指什么 */
  private flowOverview(view: ScrollView): void {
    const w = view.viewport.w
    const roster = this.run.roster
    const flow = new Flow(this, view, { x: 24, y: 16, width: w - 48 })
    flow.put(new Label(this, 24, 16, roster.length === 0 ? '挑一名首发队员' : '给队伍补一名新队员', { kind: 'heading' }), 46)
    if (roster.length > 0) {
      const count = (t: CharacterTag): number => roster.filter((id) => CHARACTERS[id].tags.includes(t)).length
      const lack = DUTY_TAGS.filter((t) => count(t) === 0)
      const have = DUTY_TAGS.filter((t) => count(t) > 0).map((t) => `${TAGS[t].name} ×${count(t)}`)
      flow.text(`现有职责：${have.join(' · ')}`, { kind: 'label', indent: false })
      if (lack.length === 0) {
        flow.text('四种职责都齐了', { kind: 'label', color: 'good', indent: false })
      } else {
        flow.text('还缺这些职责，点一下只看这一类：', { kind: 'label', color: 'muted', indent: false })
        let x = 24
        for (const t of lack) {
          const chip = new TagChip(this, x, flow.y + 16, { label: tagLabel(t), tone: TAGS[t].tone, size: 'sm', originX: 0, onTap: () => this.setFilters([t]) })
          flow.put(chip)
          x += chip.chipWidth + 10
        }
        flow.gap(42)
      }
      flow.gap(8)
    }
    flow.text('点角色看详情，满意就按下方按钮招进队伍；上方的标签可以筛选，选了几个就只列出同时带着它们的角色', { kind: 'label', color: 'muted', indent: false })
    flow.gap(10).heading('标签说明', '1f4d6')
    for (const t of TAG_IDS) {
      flow.put(new RichLabel(this, flow.indent, flow.y + 16, [{ icon: TAGS[t].icon, size: 26 }, { text: TAGS[t].name, color: TAGS[t].tone, bold: true }, { text: TAGS[t].desc, color: 'soft' }], { kind: 'label', originX: 0, gap: 10, maxWidth: w - 24 - flow.indent }), 38)
    }
    flow.finish()
  }

  private renderConfirm(): void {
    const btn = this.confirmBtn
    const id = this.focus
    if (this.due() === 0) btn.setLabel('继续').setEnabled(true)
    else if (id === null) btn.setLabel('先挑一名角色').setEnabled(false)
    else if (this.run.roster.includes(id)) btn.setLabel(`${CHARACTERS[id].name} 已在队中`).setEnabled(false)
    else btn.setLabel(`招募 ${CHARACTERS[id].name}`).setEnabled(true)
  }

  /** 还要招几人：升级时来招的就一人 */
  private due(): number {
    if (!this.forLevelUp) return recruitDueCount(this.run)
    return Math.min(1, TEAM.maxSize - this.run.roster.length, recruitCandidates(this.run).length)
  }

  /** 招进队伍；还有空位就留在这页接着挑，升级时来招的招到就回去 */
  private confirm(): void {
    if (isLeaving(this) || this.leaving) return
    if (this.due() === 0) {
      this.proceed()
      return
    }
    const id = this.focus
    if (id === null) return
    if (this.forLevelUp) {
      if (claimRecruit(this.run, id) < 0) return
      playSfx('recruit')
      this.backToLevelUp(true)
      return
    }
    if (recruitMember(this.run, id) < 0) return
    playSfx('recruit')
    if (recruitDueCount(this.run) === 0) {
      this.proceed()
      return
    }
    this.focus = null
    this.renderGrid()
    this.renderFocus()
  }

  /** 招够了：走到下一步；升级时来招的回到升级弹窗 */
  private proceed(): void {
    if (this.forLevelUp) this.backToLevelUp(false)
    else finishStep(this, this.run)
  }

  /** 回到升级弹窗，带上招到人没有 */
  private backToLevelUp(recruited: boolean): void {
    if (this.leaving) return
    this.leaving = true
    const wake: LevelUpWake = { recruited }
    this.scene.wake(SceneKey.LevelUp, wake)
    this.scene.stop()
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart()
  }

  devProvider(): DevProvider {
    return {
      id: this.forLevelUp ? 'levelUpRecruit' : 'recruit',
      title: '招募页',
      sections: [
        {
          id: 'recruit',
          title: '招募页',
          items: () => [
            {
              kind: 'action',
              label: '自动补齐并入队',
              desc: '按名单顺序把空位招满后直接继续，省去逐个点选',
              run: (): void => {
                if (this.forLevelUp) {
                  this.focus = recruitCandidates(this.run)[0] ?? null
                  this.confirm()
                  return
                }
                for (const id of ROSTER_IDS) {
                  if (recruitDueCount(this.run) === 0) break
                  recruitMember(this.run, id)
                }
                this.proceed()
              },
            },
          ],
        },
      ],
    }
  }
}

/** 升级时来招人的招募页 */
export class LevelUpRecruitScene extends RecruitScene {
  constructor() {
    super(SceneKey.LevelUpRecruit)
  }
}
