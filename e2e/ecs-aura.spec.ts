import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// P6（寒气光环）：雪人的 slowAura 每帧把一圈减速区登记进 sim.frameSlowZones，
// 圈内敌人叠乘减速并染冷蓝。此前 ECS 侧 applySlow 是空实现——光环画得出来但不减速。

type EcsDbg = { ready: boolean; slowZones: number; enemies: number; enemyPos: { x: number; y: number }[]; centerX: number; centerY: number }

test('ECS 寒气光环：减速区逐帧登记，圈内敌人被拖慢', async ({ page }) => {
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
  await page.evaluate(() => window.__ecsLabRoster!(['snowman']))
  await enterMap(page)
  await startTestBattle(page, 'forest')
  await page.waitForFunction(
    () => (window as unknown as { __ecs?: EcsDbg }).__ecs?.ready === true,
    undefined,
    { timeout: 20_000 },
  )

  // 光环逐帧登记减速区
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.slowZones > 0, undefined, {
    timeout: 15_000,
  })

  // 圈内（半径 3 格）投一只僵尸：被拖慢后逼近速度显著低于常速
  await page.evaluate(() => window.__ecsSpawnEnemy!('zombie', 2, 0))
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.enemies >= 1)
  const dist = (): Promise<number> =>
    page.evaluate(() => {
      const d = (window as unknown as { __ecs: EcsDbg }).__ecs
      const e = d.enemyPos[0]
      return e ? Math.hypot(e.x - d.centerX, e.y - d.centerY) : -1
    })
  const d0 = await dist()
  await page.waitForTimeout(1200)
  const d1 = await dist()
  // 被减速的僵尸仍在逼近，但 1.2s 内推进不多（常速 zombie 约 2 格/秒 = 128px）
  expect(d1).toBeLessThanOrEqual(d0)
  expect(d0 - d1).toBeLessThan(128)

  expect(errors).toEqual([])
})
