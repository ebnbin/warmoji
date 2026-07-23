import { expect, test } from '@playwright/test'
import { enterLab, enterMap } from './helpers'

// 慢渲染环境下敌人刷新有抖动，允许重试
test.describe.configure({ retries: 2 })

// 时停技能引擎侧：worldTimeScale 开关 + 全世界近乎凝固（敌人/倒计时冻结），唯玩家走位如常
test('时停：整个世界近乎静止（敌人+倒计时冻结），玩家仍能走位', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto('/')
  await enterMap(page)
  await enterLab(page, 'forest')
  await page.waitForFunction(() => window.__warmoji?.scene === 'arena')
  await page.evaluate(() => {
    window.__arena = () => (window.__game as { scene: { getScene: (k: string) => unknown } }).scene.getScene('arena')
  })

  const scale = (): Promise<number> =>
    page.evaluate(() => (window.__arena() as { worldTimeScale: () => number }).worldTimeScale())
  const elapsed = (): Promise<number> => page.evaluate(() => window.__warmoji!.elapsed)
  const snap = (): Promise<{ x: number; y: number }[]> =>
    page.evaluate(() =>
      (window.__arena() as { enemies: { getChildren: () => { active: boolean; x: number; y: number }[] } })
        .enemies.getChildren()
        .filter((e) => e.active)
        .map((e) => ({ x: e.x, y: e.y })),
    )
  const avgMove = (a: { x: number; y: number }[], b: { x: number; y: number }[]): number => {
    if (b.length === 0) return 0
    let sum = 0
    for (const p of b) {
      let best = Infinity
      for (const q of a) best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y))
      sum += best
    }
    return sum / b.length
  }

  for (let i = 0; i < 5; i++) await page.evaluate(() => window.__spawnEnemy!('zombie', 8, 0))
  await page.waitForTimeout(600)

  // 基线（未时停）：敌人追人会动，倒计时正常推进
  expect(await scale()).toBe(1)
  const be0 = await elapsed()
  const bs0 = await snap()
  await page.waitForTimeout(1000)
  const baseElapsed = (await elapsed()) - be0
  const baseMove = avgMove(bs0, await snap())

  // 时停：世界时标立刻落到 freezeScale
  await page.evaluate(() => (window.__arena() as { startTimeStop: (ms: number) => void }).startTimeStop(60_000))
  expect(await scale()).toBeLessThan(0.2)
  const fe0 = await elapsed()
  const fs0 = await snap()
  await page.waitForTimeout(1000)
  const frozenElapsed = (await elapsed()) - fe0
  const frozenMove = avgMove(fs0, await snap())

  // 敌人几乎不动 + 倒计时几乎不走（世界时间凝固）
  expect(frozenMove).toBeLessThan(baseMove * 0.34)
  expect(frozenMove).toBeLessThan(6)
  expect(frozenElapsed).toBeLessThan(baseElapsed * 0.34)

  // 但玩家仍能在冻结的时间里走位：按住方向键，队伍中心位移明显
  const px0 = await page.evaluate(() => window.__warmoji!.playerX)
  await page.keyboard.down('ArrowRight')
  await page.waitForTimeout(700)
  await page.keyboard.up('ArrowRight')
  const px1 = await page.evaluate(() => window.__warmoji!.playerX)
  expect(px1 - px0).toBeGreaterThan(20)

  expect(errors, `控制台/页面错误：\n${errors.join('\n')}`).toHaveLength(0)
})

declare global {
  interface Window {
    __spawnEnemy?: (kind: string, dxU?: number, dyU?: number) => void
    __arena: () => unknown
  }
}
