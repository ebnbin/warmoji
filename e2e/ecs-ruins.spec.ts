import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// P5（残垣）：ECS 版断壁图——按种子铺断壁（挡移动/挡子弹/挡视线）+ 流场绕墙寻路
// （敌人穿过回廊摸到队伍）+ 只在从中心可达的通行格刷怪。慢渲染下寻路有抖动，允许重试。
test.describe.configure({ retries: 2 })

type EcsDbg = {
  ready: boolean
  centerX: number
  centerY: number
  walls: number
  spawnCells: number
  enemyPos: { x: number; y: number }[]
}

test('ECS 残垣图：断壁成型，敌人绕墙寻路摸到队伍', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.stack ?? String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

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
  await startTestBattle(page, 'ruins')
  await page.waitForFunction(
    () => (window as unknown as { __ecs?: EcsDbg }).__ecs?.ready === true,
    undefined,
    { timeout: 20_000 },
  )

  // ① 断壁确实铺了，且从中心可达的刷怪区宽敞（25×25 = 625 格）
  const world = await page.evaluate(() => (window as unknown as { __ecs: EcsDbg }).__ecs)
  expect(world.walls).toBeGreaterThan(10)
  expect(world.spawnCells).toBeGreaterThan(200)

  // ② 远处铺一批僵尸 → 它们应绕墙寻路摸到队伍（最近敌人距中心降到接触级）
  for (let i = 0; i < 8; i++) await page.evaluate(() => window.__ecsSpawnEnemy!('zombie', 9, 0))
  const REACH = 3 * 64
  await page.waitForFunction(
    (r) => {
      const d = (window as unknown as { __ecs: EcsDbg }).__ecs
      return d.enemyPos.some((e) => Math.hypot(e.x - d.centerX, e.y - d.centerY) < r)
    },
    REACH,
    { timeout: 40_000 },
  )

  await page.screenshot({ path: 'test-results/ecs-ruins.png' })
  expect(errors).toEqual([])
})
