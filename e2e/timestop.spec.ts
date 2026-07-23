import { expect, test } from '@playwright/test'
import { enterLab, enterMap } from './helpers'

// 慢渲染环境下敌人刷新有抖动，允许重试
test.describe.configure({ retries: 2 })

// 时停技能的引擎侧：enemyTimeScale 开关 + 生效期敌人几乎不动（任意地图通用，此处走测试模式）
test('时停：敌方时标凝固，敌人近乎静止', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto('/')
  await enterMap(page)
  await enterLab(page, 'forest')
  await page.waitForFunction(() => window.__warmoji?.scene === 'arena')

  const timeScale = (): Promise<number> =>
    page.evaluate(() => (window.__arena() as { enemyTimeScale: () => number }).enemyTimeScale())
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

  // 暴露活跃竞技场句柄（测试模式为有界图 'arena'）
  await page.evaluate(() => {
    window.__arena = () => (window.__game as { scene: { getScene: (k: string) => unknown } }).scene.getScene('arena')
  })

  // 铺一些会追人的敌人
  for (let i = 0; i < 5; i++) await page.evaluate(() => window.__spawnEnemy!('zombie', 8, 0))
  await page.waitForTimeout(600)

  // 基线：未时停，敌人追人会移动
  expect(await timeScale()).toBe(1)
  const b0 = await snap()
  await page.waitForTimeout(1000)
  const baseMove = avgMove(b0, await snap())

  // 时停：开关立刻落到 freezeScale，敌人几乎不动
  await page.evaluate(() => (window.__arena() as { startTimeStop: (ms: number) => void }).startTimeStop(60_000))
  expect(await timeScale()).toBeLessThan(0.2)
  const f0 = await snap()
  await page.waitForTimeout(1000)
  const frozenMove = avgMove(f0, await snap())

  // 时停期位移远小于基线，且绝对值很小（近乎凝固）
  expect(frozenMove).toBeLessThan(baseMove * 0.34)
  expect(frozenMove).toBeLessThan(6)
  expect(errors, `控制台/页面错误：\n${errors.join('\n')}`).toHaveLength(0)
})

declare global {
  interface Window {
    __spawnEnemy?: (kind: string, dxU?: number, dyU?: number) => void
    __arena: () => unknown
  }
}
