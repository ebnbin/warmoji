import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// P3（状态效果）：限时减速/冻结——slowTarget(factor=0) 冻住敌人。

type EcsDbg = { ready: boolean; enemies: number; enemyPos: { x: number; y: number }[] }
const dbg = () => (window as unknown as { __ecs: EcsDbg }).__ecs

test('ECS 状态：减速冻结（factor=0）令敌人定住', async ({ page }) => {
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
  await page.evaluate(() => window.__ecsLabRoster!(['troll'])) // 单人近战，远处敌人不会被秒
  await enterMap(page)
  await startTestBattle(page, 'forest')
  await page.waitForFunction(() => (window as unknown as { __ecs?: EcsDbg }).__ecs?.ready === true, undefined, {
    timeout: 20_000,
  })

  await page.evaluate(() => window.__ecsSpawnEnemy!('zombie', 6, 0))
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.enemies === 1)
  // 冻结
  await page.evaluate(() => window.__ecsSlowEnemy!(0, 6000))
  await page.waitForTimeout(200)
  const p0 = dbg && (await page.evaluate(dbg)).enemyPos[0]!
  await page.waitForTimeout(2200)
  const p1 = (await page.evaluate(dbg)).enemyPos[0]!
  // 冻结期间几乎不动
  expect(Math.hypot(p1.x - p0.x, p1.y - p0.y)).toBeLessThan(4)
})
