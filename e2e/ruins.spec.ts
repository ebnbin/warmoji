import { expect, test } from '@playwright/test'
import { enterLab, enterMap } from './helpers'

// 慢渲染环境下敌人刷新/寻路有抖动，允许重试
test.describe.configure({ retries: 2 })

// 残垣：断壁生成 + 流场绕墙寻路（敌人能穿过回廊摸到队伍）+ 无运行时错误
test('残垣：断壁成型，敌人绕墙寻路摸到队伍', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })

  await page.goto('/')
  await enterMap(page)
  await enterLab(page, 'ruins')
  await page.waitForFunction(() => window.__warmoji?.scene === 'arena' && window.__warmoji.mapId === 'ruins')
  await page.evaluate(() => {
    window.__ruins = () =>
      (window.__game as { scene: { getScene: (k: string) => Record<string, unknown> } }).scene.getScene('arenaRuins')
  })

  // 断壁确实生成了（有阻挡格）、且出生连通区非空
  const world = await page.evaluate(() => {
    const s = window.__ruins() as { wallGrid: { blocked: boolean[] }; spawnCells: number[] }
    return { walls: s.wallGrid.blocked.filter(Boolean).length, spawnCells: s.spawnCells.length }
  })
  expect(world.walls).toBeGreaterThan(10) // 铺了断壁
  expect(world.spawnCells).toBeGreaterThan(200) // 中心可达区宽敞（25×25=625 格）

  // 远处铺一批僵尸，它们应绕墙寻路摸到队伍（最近敌人距中心降到接触级）
  const UNIT = await page.evaluate(() => (window.__ruins() as { wallGrid: { cellPx: number } }).wallGrid.cellPx)
  for (let i = 0; i < 8; i++) await page.evaluate(() => window.__spawnEnemy!('zombie', 9, 0))
  const minDist = (): Promise<number> =>
    page.evaluate(() => {
      const s = window.__ruins() as {
        center: { x: number; y: number }
        enemies: { getChildren: () => { active: boolean; x: number; y: number }[] }
      }
      let m = Infinity
      for (const e of s.enemies.getChildren()) {
        if (!e.active) continue
        m = Math.min(m, Math.hypot(e.x - s.center.x, e.y - s.center.y))
      }
      return m
    })

  // 流场寻路成立：轮询到「有敌人摸到接触范围」（超时=寻路失败/卡墙）。
  // 阈值/超时给足余量——慢渲染下敌人绕墙靠近本就慢，机制成立即可，不追秒级
  const reach = 3 * UNIT
  await page.waitForFunction(
    (r) => {
      const s = window.__ruins() as {
        center: { x: number; y: number }
        enemies: { getChildren: () => { active: boolean; x: number; y: number }[] }
      }
      for (const e of s.enemies.getChildren()) {
        if (!e.active) continue
        if (Math.hypot(e.x - s.center.x, e.y - s.center.y) < r) return true
      }
      return false
    },
    reach,
    { timeout: 25_000 },
  )
  expect(await minDist()).toBeLessThan(reach)

  await page.screenshot({ path: 'test-results/ruins.png' })
  expect(errors, `控制台/页面错误：\n${errors.join('\n')}`).toHaveLength(0)
})

declare global {
  interface Window {
    __spawnEnemy?: (kind: string, dxU?: number, dyU?: number) => void
    __ruins: () => unknown
  }
}
