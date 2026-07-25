import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// 「统一绘制」的设计前提回归测试：全场实体应当一次批完，而不是每换一张图集页就切一刀。
// Phaser 4 的 BatchHandlerQuad 只认 renderOptions.multiTexturing，缺省即单纹理模式——
// 那会让跨页实体逐页切批（实测 3 页图集 / 400 实体：30 次/帧），且与核心 SubmitterQuad
// 恒传 true 的行为逐帧互相翻转、反复替换 shader addition。这里用 pushCurrentBatchEntry
// 的调用次数当「批次被切开几次」的代理指标，把这个前提钉死。

type EcsDbg = { ready: boolean; enemies: number; pages: number }

test('ECS 批绘制：数百实体跨多张图集页仍近似一次批完', async ({ page }) => {
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

  // 静止不死的虫巢铺场（近战单人清不动，测量期间实体数稳定）+ 两只走别的图集页的敌人
  await page.evaluate(() => window.__ecsStress!(400, 'hive'))
  await page.evaluate(() => window.__ecsSpawnEnemy!('snake', 4, 2))
  await page.evaluate(() => window.__ecsSpawnEnemy!('turtle', 4, -2))
  await page.waitForTimeout(1500)

  const stats = await page.evaluate(async () => {
    type Node = { pushCurrentBatchEntry: () => void }
    type G = { renderer: { renderNodes: { getNode(n: string): Node } } }
    const node = (window.__game as unknown as G).renderer.renderNodes.getNode('BatchHandlerQuad')
    let cuts = 0
    const orig = node.pushCurrentBatchEntry.bind(node)
    node.pushCurrentBatchEntry = (): void => {
      cuts++
      orig()
    }
    let frames = 0
    await new Promise<void>((res) => {
      const tick = (): void => {
        frames++
        if (frames >= 60) return res()
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    node.pushCurrentBatchEntry = orig
    const dbg = (window as unknown as { __ecs: EcsDbg }).__ecs
    return { cutsPerFrame: cuts / frames, entities: dbg.enemies, pages: dbg.pages }
  })

  // 场景确实铺开了（几百实体、图集确实不止一页，否则这测试没在测东西）
  expect(stats.entities).toBeGreaterThan(200)
  expect(stats.pages).toBeGreaterThan(1)
  // 关键断言：切批次数与实体数无关，只与「深度带数」相关（修复前 30，multiTexturing 修好后 2；
  // 后来按 SPRITE_BANDS 拆成 6 个批绘对象以复刻旧实现的分层，故上限放宽到带数的量级）
  expect(stats.cutsPerFrame).toBeLessThan(16)

  expect(errors).toEqual([])
})
