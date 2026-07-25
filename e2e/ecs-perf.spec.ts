import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// P7（性能护栏）：ECS 实验的立论就是「实体数与开销解绑」。这里量的是**仿真+簿记的 CPU 自耗**
// （preupdate→postupdate 窗口），不含光栅化——容器是软渲染，填充率会淹没一切，量不出渲染侧的差别。
// 同口径实测（本容器）：1000 敌人时 旧 median 2.4ms / ECS median 1.1ms。
// 这里只守一条宽松上界，防的是将来退化成 O(n²) 之类的量级事故，不是跑分。

const MEDIAN_CEILING_MS = 8

test('ECS 性能护栏：1000 敌人时单帧仿真自耗仍在量级内', async ({ page }) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.stack ?? String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        'warmoji.settings.v1',
        JSON.stringify({ damageNumbers: false, hitShake: false, sound: false, bgm: false, showSkinTone: false, ecs: true }),
      )
    } catch {
      /* ignore */
    }
  })
  await page.goto('/')
  await page.evaluate(() => window.__ecsLabRoster!(['juggler'], []))
  await enterMap(page)
  await startTestBattle(page, 'forest')
  await page.waitForFunction(
    () => (window as unknown as { __ecs?: { ready: boolean } }).__ecs?.ready === true,
    undefined,
    { timeout: 20_000 },
  )

  // 逐帧记 preupdate→postupdate 的耗时
  await page.evaluate(() => {
    type Ev = { on(n: string, f: () => void): void }
    const g = window.__game as { scene: { getScene(k: string): { events: Ev } } }
    const sc = g.scene.getScene('ecsArena') as unknown as { events: Ev; __us?: number[] }
    sc.__us = []
    let t0 = 0
    sc.events.on('preupdate', () => {
      t0 = performance.now()
    })
    sc.events.on('postupdate', () => {
      if (t0 > 0) sc.__us!.push(performance.now() - t0)
    })
  })

  await page.evaluate(() => window.__ecsStress!(1000, 'zombie'))
  await page.waitForFunction(() => (window as unknown as { __ecs: { enemies: number } }).__ecs.enemies >= 900)
  // 丢掉铺场那几帧，再采样
  await page.waitForTimeout(2000)
  await page.evaluate(() => {
    const g = window.__game as { scene: { getScene(k: string): { __us?: number[] } } }
    g.scene.getScene('ecsArena').__us!.length = 0
  })
  await page.waitForTimeout(6000)

  const stat = await page.evaluate(() => {
    const g = window.__game as { scene: { getScene(k: string): { __us?: number[] } } }
    const us = (g.scene.getScene('ecsArena').__us ?? []).slice().sort((a, b) => a - b)
    return { n: us.length, median: us[Math.floor(us.length / 2)] ?? -1 }
  })
  expect(stat.n).toBeGreaterThan(5)
  expect(stat.median, `median=${stat.median}ms over ${stat.n} frames`).toBeLessThan(MEDIAN_CEILING_MS)

  expect(errors).toEqual([])
})
