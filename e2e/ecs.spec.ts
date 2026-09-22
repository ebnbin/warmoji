import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// 守卫：ECS 战斗打不打得起来（gameplay.spec 只走 arcade）；帧末出站信箱积压、图集缺变体的隐形实体、
// 未参与深度排序的自绘层三者恒为 0，它们出错都不报错，只有这里能看见。软渲染下时钟偏慢，允许一次重试

test.describe.configure({ retries: 1 })

/** 逻辑坐标 → canvas CSS 坐标后点击（canvas CSS 尺寸 = 窗口尺寸） */
async function click(page: Page, logical: { x: number; y: number }): Promise<void> {
  const pos = await page.evaluate(({ x, y }) => {
    const k = window.innerWidth / window.__warmoji!.viewW
    return { x: Math.round(x * k), y: Math.round(y * k) }
  }, logical)
  await page.locator('#game canvas').click({ position: pos })
}

// ECS 战斗期间 __warmoji 陈旧，探针是 window.__ecs；页面内求值的闭包不能引用本文件作用域，故各处内联
type Ecs = { elapsed: number; kills: number; enemies: number; outbox: number; unsortedLayers: number; blindSprites: number }
type WinEcs = Window & { __ecs?: Ecs }

test('试炼场：ECS 战斗跑得起来、有击杀、出站信箱不积压', async ({ page }) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))

  // 键名同 src/save/settings.ts
  await page.addInitScript(() => {
    localStorage.setItem('warmoji.settings.v1', JSON.stringify({ ecs: true, devMode: true }))
  })
  await page.goto('/')

  await page.waitForFunction(() => window.__warmoji?.scene === 'menu' && !!window.__warmoji.menu)
  await click(page, await page.evaluate(() => window.__warmoji!.menu!.start))
  await page.waitForFunction(() => window.__warmoji?.scene === 'map' && !!window.__warmoji.map?.test)
  await click(page, await page.evaluate(() => window.__warmoji!.map!.test!))
  await page.waitForFunction(() => window.__warmoji?.map?.test?.on === true)
  await click(page, await page.evaluate(() => window.__warmoji!.map!.start))

  await page.waitForFunction(() => (window as WinEcs).__ecs !== undefined, undefined, { timeout: 30_000 })
  await page.waitForFunction(() => ((window as WinEcs).__ecs?.elapsed ?? 0) > 15_000, undefined, { timeout: 120_000 })

  const ecs = await page.evaluate(() => (window as WinEcs).__ecs!)
  expect(errors, `控制台报错：\n${errors.join('\n')}`).toEqual([])
  expect(ecs.enemies, '场上没敌人：这一局没打起来').toBeGreaterThan(0)
  expect(ecs.kills, '一个都没杀死：能力没在索敌/施伤').toBeGreaterThan(0)
  expect(ecs.outbox, '出站信箱帧末仍有积压：某条 drain 没清').toBe(0)
  expect(ecs.blindSprites, '有实体的贴图变体不在图集里（frame=-1）：它在场却永远画不出来，且不报错').toBe(0)
  expect(
    ecs.unsortedLayers,
    '有自绘层没在参与深度排序（_depth 不是数）：它的叠放次序退化成进显示列表的先后，转屏后会被地图视觉盖住',
  ).toBe(0)
})
