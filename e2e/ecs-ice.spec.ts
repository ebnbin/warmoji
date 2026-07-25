import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// P5（浮冰）：ECS 版打滑世界——队伍与敌人的「行为速度」都过一道低通（不跟手/刹不住），
// 浮冰之外皆水：落水掉血（敌我通吃）+ 蓝渐晕提示 + 相机永远跟随（无边界）。
// 打滑用世界钩子探针定点校验（不依赖游戏时钟，软渲染容器里时钟偏慢），
// 落水用瞬移探针把队伍丢下水再看血掉没掉，与旧图 e2e 同口径。

type EcsDbg = {
  ready: boolean
  centerX: number
  centerY: number
  inWater: boolean
  memberHp: number[]
  enemies: number
}

test('ECS 浮冰图：打滑加速 + 松手仍滑行、落水掉血，战斗运转无报错', async ({ page }) => {
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
  await startTestBattle(page, 'ice')
  await page.waitForFunction(
    () => (window as unknown as { __ecs?: EcsDbg }).__ecs?.ready === true,
    undefined,
    { timeout: 20_000 },
  )

  // ① 打滑手感：满推向右若干帧 → 步长逐帧变大（加速起步，非瞬时满速）；
  //    松手后仍继续向右滑行（刹不住）
  const slide = await page.evaluate(() => {
    const step = window.__ecsStepTeam!
    const steps: number[] = []
    for (let i = 0; i < 24; i++) {
      const before = step(0, 0, 0).x // deltaMs=0 只读当前中心，不推进
      const after = step(400, 0, 16)
      steps.push(after.x - before)
    }
    const pushed = steps.reduce((a, b) => a + b, 0)
    const accelerated = steps[5]! > steps[0]!
    const beforeCoast = step(0, 0, 0).x
    let coastFrames = 0
    for (let i = 0; i < 24; i++) {
      const before = step(0, 0, 0).x
      const after = step(0, 0, 16) // 松手：输入位移为 0
      if (after.x - before > 0.01) coastFrames++
    }
    return { pushed, accelerated, coast: step(0, 0, 0).x - beforeCoast, coastFrames }
  })
  expect(slide.pushed).toBeGreaterThan(0)
  expect(slide.accelerated).toBe(true) // 加速起步 = 不跟手
  expect(slide.coast).toBeGreaterThan(0) // 松手仍滑 = 刹不住
  expect(slide.coastFrames).toBeGreaterThan(1)

  // ② 落水掉血：把队伍瞬移到浮冰外的水里，血量应随 waterTick 下降
  const hp0 = await page.evaluate(() => {
    window.__ecsTeleport!(-6, -6)
    return (window as unknown as { __ecs: EcsDbg }).__ecs.memberHp[0] ?? 0
  })
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.inWater === true)
  await page.waitForFunction(
    (h) => ((window as unknown as { __ecs: EcsDbg }).__ecs.memberHp[0] ?? 0) < h,
    hp0,
    { timeout: 20_000 },
  )

  // ③ 游回冰面即停止掉血（浮冰内安全）
  await page.evaluate(() => window.__ecsTeleport!(12, 12))
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.inWater === false)
  const back = await page.evaluate(() => (window as unknown as { __ecs: EcsDbg }).__ecs.memberHp[0] ?? 0)
  await page.waitForTimeout(1500)
  const still = await page.evaluate(() => (window as unknown as { __ecs: EcsDbg }).__ecs.memberHp[0] ?? 0)
  expect(still).toBe(back)

  // ④ 敌人落水也掉血：把一只乌龟丢到水里（相对中心 -20 格），它该自己淹死
  await page.evaluate(() => window.__ecsSpawnEnemy!('turtle', -20, -20))
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.enemies >= 1)
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.enemies === 0, undefined, {
    timeout: 30_000,
  })

  await page.screenshot({ path: 'test-results/ecs-ice.png' })
  expect(errors).toEqual([])
})
