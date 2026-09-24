import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// 守卫：正式局能不能打（出怪、索敌、时钟推进、暂停冻结、结束本局后再开一局、每张地图的视图）；帧末出站信箱积压、
// 图集缺变体的隐形实体、未参与深度排序的自绘层三者恒为 0，它们出错都不报错，只有这里能看见。软渲染下时钟偏慢，允许重试
test.describe.configure({ retries: 2 })

// 战斗期间 __warmoji 停在进战斗前的场景，探针是 window.__ecs；页面内求值的闭包不能引用本文件作用域，故各处内联
type Ecs = {
  ready: boolean
  elapsed: number
  kills: number
  enemies: number
  alive: number
  outbox: number
  unsortedLayers: number
  blindSprites: number
  stats: { damage: number[] }
}
type WinEcs = Window & { __ecs?: Ecs }

function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(String(err)))
  return errors
}

/** 逻辑坐标 → canvas CSS 坐标后点击（canvas CSS 尺寸 = 窗口尺寸） */
async function click(page: Page, logical: { x: number; y: number }): Promise<void> {
  const pos = await page.evaluate(({ x, y }) => {
    const k = window.innerWidth / window.__warmoji!.viewW
    return { x: Math.round(x * k), y: Math.round(y * k) }
  }, logical)
  await page.locator('#game canvas').click({ position: pos })
}

/** 从主菜单开一局打到战斗就绪；不给 mapId 则用地图页的默认选择 */
async function startRun(page: Page, mapId?: string): Promise<void> {
  await page.waitForFunction(() => window.__warmoji?.scene === 'menu' && !!window.__warmoji.menu)
  await click(page, await page.evaluate(() => window.__warmoji!.menu!.start))
  await page.waitForFunction(() => window.__warmoji?.scene === 'map' && !!window.__warmoji.map)
  if (mapId) {
    const r = await page.evaluate((k) => window.__warmoji!.map!.items.find((x) => x.id === k)!, mapId)
    await click(page, { x: r.x + r.w / 2, y: r.y + r.h / 2 })
    await page.waitForFunction((k) => window.__warmoji?.map?.selected === k, mapId)
  }
  await click(page, await page.evaluate(() => window.__warmoji!.map!.start))
  await page.waitForFunction(
    () => window.__warmoji?.scene === 'captain' && !!window.__warmoji.captain,
  )
  await click(page, await page.evaluate(() => window.__warmoji!.captain!.start))
  await page.waitForFunction(
    () =>
      (window.__warmoji?.scene === 'recruit' && !!window.__warmoji.recruit) ||
      (window.__warmoji?.scene === 'formation' && !!window.__warmoji.formation),
  )
  for (let step = 0; step < 40; step++) {
    const st = await page.evaluate(() => ({
      inBattle: (window as WinEcs).__ecs?.ready === true,
      scene: window.__warmoji!.scene,
      due: window.__warmoji!.recruit?.due ?? 0,
      picked: window.__warmoji!.recruit?.picked ?? [],
      items: (window.__warmoji!.recruit?.items ?? []).map((x) => ({ id: x.id, state: x.state })),
    }))
    if (st.inBattle) break
    if (st.scene === 'formation') {
      await click(page, await page.evaluate(() => window.__warmoji!.formation!.confirm))
      await page.waitForFunction(
        () => window.__warmoji?.scene !== 'formation' || (window as WinEcs).__ecs?.ready === true,
        undefined,
        { timeout: 30_000 },
      )
      break
    }
    if (st.scene !== 'recruit') break
    if (st.picked.length < st.due) {
      // 雪人初始只减速不伤害，单人开局必然零击杀
      const next = st.items.find((x) => x.state === 'open' && !st.picked.includes(x.id) && x.id !== 'snowman')
      if (!next) throw new Error('招募页：已解锁候选不足以点满名额')
      const r = await page.evaluate(
        (k) => window.__warmoji!.recruit!.items.find((x) => x.id === k)!,
        next.id,
      )
      await click(page, { x: r.x + r.w / 2, y: r.y + r.h / 2 })
      await page.waitForFunction((k) => window.__warmoji?.recruit?.selected === k, next.id)
      continue
    }
    await click(page, await page.evaluate(() => window.__warmoji!.recruit!.confirm))
    await page.waitForFunction(
      () => window.__warmoji?.scene !== 'recruit' || (window as WinEcs).__ecs?.ready === true,
      undefined,
      { timeout: 30_000 },
    )
  }
  // 首局要先建图集
  await page.waitForFunction(() => (window as WinEcs).__ecs?.ready === true, undefined, { timeout: 30_000 })
}

/** 出怪、队伍已施伤后，三项探针须为 0 */
async function expectFighting(page: Page, label: string): Promise<void> {
  await page.waitForFunction(() => ((window as WinEcs).__ecs?.enemies ?? 0) > 0, undefined, { timeout: 30_000 })
  await page.waitForFunction(
    () => ((window as WinEcs).__ecs?.stats.damage ?? []).reduce((a, b) => a + b, 0) > 0,
    undefined,
    { timeout: 60_000 },
  )
  const ecs = await page.evaluate(() => {
    const e = (window as WinEcs).__ecs!
    return { outbox: e.outbox, unsortedLayers: e.unsortedLayers, blindSprites: e.blindSprites }
  })
  expect(ecs.outbox, `${label}：出站信箱帧末仍有积压，某条 drain 没清`).toBe(0)
  expect(ecs.blindSprites, `${label}：有实体的贴图变体不在图集里（frame=-1），它在场却永远画不出来，且不报错`).toBe(0)
  expect(
    ecs.unsortedLayers,
    `${label}：有自绘层没在参与深度排序（_depth 不是数），叠放次序退化成进显示列表的先后，转屏后会被地图视觉盖住`,
  ).toBe(0)
}

test('正式局战斗：出怪、自动击杀、计时推进、暂停冻结、结束本局后再开一局、无控制台错误', async ({ page }) => {
  test.setTimeout(240_000)
  const errors = collectErrors(page)

  await page.goto('/')
  await startRun(page)
  await expectFighting(page, '第一局')
  await page.waitForFunction(() => ((window as WinEcs).__ecs?.kills ?? 0) >= 1, undefined, {
    timeout: 120_000,
  })
  await page.waitForFunction(() => ((window as WinEcs).__ecs?.elapsed ?? 0) > 6_000, undefined, {
    timeout: 45_000,
  })
  expect(await page.evaluate(() => (window as WinEcs).__ecs!.alive), '队伍已全灭').toBeGreaterThan(0)

  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  const t1 = await page.evaluate(() => (window as WinEcs).__ecs!.elapsed)
  await page.waitForTimeout(700)
  const t2 = await page.evaluate(() => (window as WinEcs).__ecs!.elapsed)
  expect(t2, '暂停后世界时钟仍在走').toBe(t1)
  await page.keyboard.press('Escape')
  await page.waitForFunction((t) => ((window as WinEcs).__ecs?.elapsed ?? 0) > t, t2, { timeout: 10_000 })

  // 暂停菜单「结束本局」在屏幕中心下方 100
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await click(page, await page.evaluate(() => ({ x: window.__warmoji!.viewW / 2, y: window.__warmoji!.viewH / 2 + 100 })))
  await startRun(page)
  await expectFighting(page, '结束本局后的新局')

  expect(errors, `控制台报错：\n${errors.join('\n')}`).toEqual([])
})

test('每张地图都能进战斗：出怪、施伤、无控制台错误', async ({ page }) => {
  test.setTimeout(600_000)
  const errors = collectErrors(page)
  await page.goto('/')
  await page.waitForFunction(() => window.__warmoji?.scene === 'menu' && !!window.__warmoji.menu)
  await click(page, await page.evaluate(() => window.__warmoji!.menu!.start))
  await page.waitForFunction(() => window.__warmoji?.scene === 'map' && !!window.__warmoji.map)
  const ids = await page.evaluate(() => window.__warmoji!.map!.items.map((x) => x.id))
  expect(ids.length, '地图页没有列出地图').toBeGreaterThan(1)
  for (const id of ids) {
    await page.goto('/')
    await startRun(page, id)
    await expectFighting(page, id)
    expect(errors, `${id}：控制台报错：\n${errors.join('\n')}`).toEqual([])
  }
})
