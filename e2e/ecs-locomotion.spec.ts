import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// P3d：locomotion 分发——static 原地不动 / wander 游荡（不 beeline 追人）。

type EcsDbg = { ready: boolean; centerX: number; centerY: number; enemies: number; enemyPos: { x: number; y: number }[] }
const dbg = () => (window as unknown as { __ecs: EcsDbg }).__ecs

async function boot(page: import('@playwright/test').Page): Promise<void> {
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
  // 单人队，避免队员开火秒掉探测目标
  await page.evaluate(() => window.__ecsLabRoster!(['troll']))
  await enterMap(page)
  await startTestBattle(page, 'forest')
  await page.waitForFunction(() => (window as unknown as { __ecs?: EcsDbg }).__ecs?.ready === true, undefined, {
    timeout: 20_000,
  })
}

test('ECS locomotion：虫巢(static)原地不动', async ({ page }) => {
  await boot(page)
  await page.evaluate(() => window.__ecsSpawnEnemy!('hive', 6, 0))
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.enemies === 1)
  const p0 = (await page.evaluate(dbg)).enemyPos[0]!
  await page.waitForTimeout(2000)
  const p1 = (await page.evaluate(dbg)).enemyPos[0]!
  expect(Math.hypot(p1.x - p0.x, p1.y - p0.y)).toBeLessThan(1)
})

test('ECS locomotion：外星怪(wander)游荡、不 beeline 追人', async ({ page }) => {
  await boot(page)
  await page.evaluate(() => window.__ecsSpawnEnemy!('invader', 6, 0))
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.enemies === 1)
  const d = await page.evaluate(dbg)
  const start = d.enemyPos[0]!
  const startDist = Math.hypot(start.x - d.centerX, start.y - d.centerY)
  // 游荡：位置会变（会动），但不会像 chase 那样把距离快速拉到贴脸
  await page.waitForFunction(
    (sx) => {
      const e = (window as unknown as { __ecs: EcsDbg }).__ecs.enemyPos[0]!
      return Math.hypot(e.x - sx.x, e.y - sx.y) > 20
    },
    start,
    { timeout: 8000 },
  )
  const now = await page.evaluate(dbg)
  const nowDist = Math.hypot(now.enemyPos[0]!.x - now.centerX, now.enemyPos[0]!.y - now.centerY)
  // 未 beeline：仍与出生距离同量级（chase 会显著缩短）
  expect(nowDist).toBeGreaterThan(startDist * 0.5)
})

test('ECS locomotion：毒蛇(standoff)定距风筝——贴近到站位距离后不再逼近', async ({ page }) => {
  await boot(page)
  // 探测范围外投放（8 格）：会贴近到 standoffDist≈5 格(320px) 后停手，不会贴脸
  await page.evaluate(() => window.__ecsSpawnEnemy!('snake', 8, 0))
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.enemies === 1)
  // 贴近：距离下降到 400px 以内
  await page.waitForFunction(
    () => {
      const d = (window as unknown as { __ecs: EcsDbg }).__ecs
      const e = d.enemyPos[0]!
      return Math.hypot(e.x - d.centerX, e.y - d.centerY) < 400
    },
    undefined,
    { timeout: 12_000 },
  )
  // 定距：不会像 chase 那样贴脸（保持在站位距离附近，远大于接触半径）
  await page.waitForTimeout(2000)
  const d = await page.evaluate(dbg)
  const dist = Math.hypot(d.enemyPos[0]!.x - d.centerX, d.enemyPos[0]!.y - d.centerY)
  expect(dist).toBeGreaterThan(220)
})
