import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// P4（时停）：窗口内世界时标随队伍移动量放缩——静则近乎凝固、动则恢复常速；窗口外恒常速。
// 时停即「世界侧 wdelta 变慢而玩家侧 delta 照常」，故用敌人是否还在推进来验证。

type EcsDbg = { ready: boolean; enemies: number; enemyPos: { x: number; y: number }[] }

test('ECS 时停：窗口内静则冻结、动则恢复；窗口外常速', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.stack ?? String(e)))

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
  await page.evaluate(() => window.__ecsLabRoster!(['troll']))
  await enterMap(page)
  await startTestBattle(page, 'forest')
  await page.waitForFunction(() => (window as unknown as { __ecs?: EcsDbg }).__ecs?.ready === true, undefined, {
    timeout: 20_000,
  })

  // 远处投一只 chase 僵尸当「世界还在不在走」的探针
  await page.evaluate(() => window.__ecsSpawnEnemy!('zombie', 8, 0))
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.enemies >= 1)

  // 窗口外：时标恒 1
  expect(await page.evaluate(() => window.__ecsWorldTimeScale!())).toBeCloseTo(1, 5)

  // 开时停后静止：时标掉到接近 floor，敌人几乎不动
  await page.evaluate(() => window.__ecsTimeStop!(20_000))
  await page.waitForTimeout(1200) // 等 chrono 低通平滑收敛到静止
  const scaleStill = await page.evaluate(() => window.__ecsWorldTimeScale!())
  expect(scaleStill).toBeLessThan(0.3)

  const p0 = (await page.evaluate(() => (window as unknown as { __ecs: EcsDbg }).__ecs.enemyPos[0]))!
  await page.waitForTimeout(1500)
  const p1 = (await page.evaluate(() => (window as unknown as { __ecs: EcsDbg }).__ecs.enemyPos[0]))!
  const frozenMove = Math.hypot(p1.x - p0.x, p1.y - p0.y)
  expect(frozenMove).toBeLessThan(30) // 近乎凝固（常速下这段时间会走上百 px）

  // 时停窗口内推着走：时标回升（动则时行）
  await page.locator('#game canvas').click()
  await page.keyboard.down('ArrowRight')
  await page.waitForFunction(() => window.__ecsWorldTimeScale!() > 0.8, undefined, { timeout: 8000 })
  await page.keyboard.up('ArrowRight')

  expect(errors).toEqual([])
})
