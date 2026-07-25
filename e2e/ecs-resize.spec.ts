import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// P6（视口变化）：旋转/拉窗口时战斗照常。跟随式相机只需重设缩放；
// 单屏图（奔流/工厂）的世界尺寸由视口推出，须整体重映射——队伍不能被甩出世界。

type EcsDbg = { ready: boolean; centerX: number; centerY: number; mapW: number; mapH: number; logicalW: number; logicalH: number }

/** 等视口重算落到指定朝向（软渲染下 resize→重算有延迟，用条件等待而非定时等待） */
const settled = (page: import('@playwright/test').Page, landscape: boolean): Promise<unknown> =>
  page.waitForFunction(
    (want) => {
      const d = (window as unknown as { __ecs?: EcsDbg }).__ecs
      return d !== undefined && d.logicalW >= d.logicalH === want
    },
    landscape,
    { timeout: 20_000 },
  )

const boot = async (page: import('@playwright/test').Page, map: string): Promise<void> => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        'warmoji.settings.v1',
        JSON.stringify({ damageNumbers: true, hitShake: true, sound: false, bgm: false, showSkinTone: false, ecs: true }),
      )
    } catch {
      /* ignore */
    }
  })
  await page.goto('/')
  await page.evaluate(() => window.__ecsLabRoster!(['juggler']))
  await enterMap(page)
  await startTestBattle(page, map)
  await page.waitForFunction(
    () => (window as unknown as { __ecs?: EcsDbg }).__ecs?.ready === true,
    undefined,
    { timeout: 20_000 },
  )
}

for (const map of ['forest', 'river', 'void']) {
  test(`ECS 视口变化（${map}）：横竖切换后队伍仍在世界内、战斗无报错`, async ({ page }) => {
    test.setTimeout(120_000)
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.stack ?? String(e)))
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

    await boot(page, map)
    const before = await page.evaluate(() => (window as unknown as { __ecs: EcsDbg }).__ecs)

    // 横 → 竖
    await page.setViewportSize({ width: 720, height: 1280 })
    await settled(page, false)
    await page.waitForTimeout(300)
    const portrait = await page.evaluate(() => (window as unknown as { __ecs: EcsDbg }).__ecs)
    expect(portrait.centerX).toBeGreaterThanOrEqual(0)
    expect(portrait.centerX).toBeLessThanOrEqual(portrait.mapW)
    expect(portrait.centerY).toBeGreaterThanOrEqual(0)
    expect(portrait.centerY).toBeLessThanOrEqual(portrait.mapH)

    // 竖 → 横（回到原朝向）
    await page.setViewportSize({ width: 1280, height: 720 })
    await settled(page, true)
    await page.waitForTimeout(300)
    const back = await page.evaluate(() => (window as unknown as { __ecs: EcsDbg }).__ecs)
    expect(back.mapW).toBeCloseTo(before.mapW, 0)
    expect(back.centerX).toBeGreaterThanOrEqual(0)
    expect(back.centerX).toBeLessThanOrEqual(back.mapW)

    // 战斗仍在跑（时钟推进）
    const t = await page.evaluate(() => (window as unknown as { __ecs: { elapsed: number } }).__ecs.elapsed)
    await page.waitForFunction(
      (t0) => (window as unknown as { __ecs?: { elapsed: number } }).__ecs!.elapsed > t0,
      t,
      { timeout: 15_000 },
    )

    expect(errors).toEqual([])
  })
}
