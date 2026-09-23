import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// 守卫：默认设置下的正式局能不能打（出怪、索敌、时钟推进、暂停冻结）；帧末出站信箱积压、图集缺变体的隐形实体、
// 未参与深度排序的自绘层三者恒为 0，它们出错都不报错，只有这里能看见。软渲染下时钟偏慢，允许重试
test.describe.configure({ retries: 2 })

// ECS 战斗期间 __warmoji 停在进战斗前的场景，探针是 window.__ecs；页面内求值的闭包不能引用本文件作用域，故各处内联
type Ecs = {
  ready: boolean
  elapsed: number
  kills: number
  enemies: number
  alive: number
  outbox: number
  unsortedLayers: number
  blindSprites: number
}
type WinEcs = Window & { __ecs?: Ecs }

/** 逻辑坐标 → canvas CSS 坐标后点击（canvas CSS 尺寸 = 窗口尺寸） */
async function click(page: Page, logical: { x: number; y: number }): Promise<void> {
  const pos = await page.evaluate(({ x, y }) => {
    const k = window.innerWidth / window.__warmoji!.viewW
    return { x: Math.round(x * k), y: Math.round(y * k) }
  }, logical)
  await page.locator('#game canvas').click({ position: pos })
}

async function startRun(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__warmoji?.scene === 'menu' && !!window.__warmoji.menu)
  await click(page, await page.evaluate(() => window.__warmoji!.menu!.start))
  await page.waitForFunction(() => window.__warmoji?.scene === 'map' && !!window.__warmoji.map)
  await click(page, await page.evaluate(() => window.__warmoji!.map!.start))
  await page.waitForFunction(
    () => window.__warmoji?.scene === 'captain' && !!window.__warmoji.captain,
  )
  await click(page, await page.evaluate(() => window.__warmoji!.captain!.start))
  await page.waitForFunction(
    () => window.__warmoji?.scene === 'promote' && !!window.__warmoji.promote,
  )
  const confirm = async (): Promise<void> =>
    click(page, await page.evaluate(() => window.__warmoji!.promote!.confirm))
  for (let step = 0; step < 40; step++) {
    const st = await page.evaluate(() => ({
      inBattle: (window as WinEcs).__ecs !== undefined,
      scene: window.__warmoji!.scene,
      mode: window.__warmoji!.promote?.mode,
      due: window.__warmoji!.promote?.due ?? 0,
      picked: window.__warmoji!.promote?.picked ?? [],
      items: (window.__warmoji!.promote?.items ?? []).map((x) => ({ id: x.id, state: x.state })),
    }))
    if (st.inBattle || st.scene !== 'promote') break
    if (st.mode === 'formation') {
      await confirm()
      await page.waitForFunction(
        () => window.__warmoji?.scene !== 'promote' || (window as WinEcs).__ecs !== undefined,
        undefined,
        { timeout: 30_000 },
      )
      break
    }
    if (st.picked.length < st.due) {
      // 雪人初始只减速不伤害，单人开局必然零击杀
      const next = st.items.find(
        (x) => (x.state ?? 'open') === 'open' && !st.picked.includes(x.id) && x.id !== 'snowman',
      )
      if (!next) throw new Error('整编页：已解锁候选不足以点满名额')
      const r = await page.evaluate(
        (k) => window.__warmoji!.promote!.items.find((x) => x.id === k)!,
        next.id,
      )
      await click(page, { x: r.x + r.w / 2, y: r.y + r.h / 2 })
      await page.waitForFunction((k) => window.__warmoji?.promote?.selected === k, next.id)
      continue
    }
    await confirm()
    await page.waitForFunction(
      () =>
        window.__warmoji?.scene !== 'promote' ||
        window.__warmoji.promote?.mode === 'formation' ||
        (window as WinEcs).__ecs !== undefined,
      undefined,
      { timeout: 30_000 },
    )
  }
  // 默认设置须进 ECS 战斗；首局要先建图集
  await page.waitForFunction(() => (window as WinEcs).__ecs?.ready === true, undefined, { timeout: 30_000 })
}

test('正式局 ECS 战斗：出怪、自动击杀、计时推进、暂停冻结、无控制台错误', async ({ page }) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(String(err)))

  await page.goto('/')
  await startRun(page)

  await page.waitForFunction(() => ((window as WinEcs).__ecs?.enemies ?? 0) > 0, undefined, {
    timeout: 30_000,
  })
  await page.waitForFunction(() => ((window as WinEcs).__ecs?.kills ?? 0) >= 1, undefined, {
    timeout: 120_000,
  })
  await page.waitForFunction(() => ((window as WinEcs).__ecs?.elapsed ?? 0) > 6_000, undefined, {
    timeout: 45_000,
  })

  const ecs = await page.evaluate(() => {
    const e = (window as WinEcs).__ecs!
    return {
      kills: e.kills,
      alive: e.alive,
      outbox: e.outbox,
      unsortedLayers: e.unsortedLayers,
      blindSprites: e.blindSprites,
    }
  })
  expect(ecs.kills, '一个都没杀死：能力没在索敌/施伤').toBeGreaterThanOrEqual(1)
  expect(ecs.alive, '队伍已全灭').toBeGreaterThan(0)
  expect(ecs.outbox, '出站信箱帧末仍有积压：某条 drain 没清').toBe(0)
  expect(ecs.blindSprites, '有实体的贴图变体不在图集里（frame=-1）：它在场却永远画不出来，且不报错').toBe(0)
  expect(
    ecs.unsortedLayers,
    '有自绘层没在参与深度排序（_depth 不是数）：它的叠放次序退化成进显示列表的先后，转屏后会被地图视觉盖住',
  ).toBe(0)

  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  const t1 = await page.evaluate(() => (window as WinEcs).__ecs!.elapsed)
  await page.waitForTimeout(700)
  const t2 = await page.evaluate(() => (window as WinEcs).__ecs!.elapsed)
  expect(t2, '暂停后世界时钟仍在走').toBe(t1)
  await page.keyboard.press('Escape')
  await page.waitForFunction((t) => ((window as WinEcs).__ecs?.elapsed ?? 0) > t, t2, { timeout: 10_000 })

  expect(errors, `控制台报错：\n${errors.join('\n')}`).toEqual([])
})
