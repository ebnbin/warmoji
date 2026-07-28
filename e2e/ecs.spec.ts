import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// 致命失败守卫（之三）：**ECS 战斗打不打得起来**。
//
// 钉的是一个具体缺陷：gameplay.spec.ts 走的是 src/arcade/——设置默认 ecs:false，
// 开局流程进的是老场景。于是天天在改的 ECS 侧一条 e2e 也没有：白屏、建场抛异常、
// 流水线某步炸掉，单测与 typecheck 全绿，CI 也全绿。
//
// 顺带钉住出站信箱的积压：sim.out 的五个队列是「仿真只写、场景侧排空」，
// 漏排一条不会报错，只会一路涨到卡顿——帧末积压恒 0 是它唯一的外部可观测量。
//
// 还钉住「实体引用了图集里没有的 emoji 变体」：atlas.index 返回 -1，批绘当场 continue，
// 那颗实体就此隐形——照常移动、照常打人，只是永远画不出来，也不报错。清单（emoji ×
// 描边阵营）与建实体处各写一份，改一边漏一边就是这个下场。恒 0 是它唯一的外部可观测量。
// 它守不住带 idle 部件动画的那类（角色/敌人）：clip 是惰性烘焙的、不查静态清单，
// 漏登记也会被动画帧接上——这条主要守住静态贴图（拾取物、装饰、特效、预告标记）。
//
// 也钉住「自绘层没在参与 Phaser 的深度排序」：DisplayList 排的是 _depth，裸 GameObject
// 只写 depth 的话它恒为 undefined，比较得 NaN、排序原地不动，深度带整体失效。开局时
// 看不出来（地图视觉先建、批绘后建，正好该在上），视口一变、单屏图的视觉层整体重建，
// 那块不透明的地面就排到了末尾，把全场实体一次盖光——屏幕上只剩地图背景，且全程没有
// 任何异常与报错，实体数/击杀数一切正常。恒 0 是它唯一的外部可观测量。
//
// 软渲染下时钟偏慢，允许一次重试。

test.describe.configure({ retries: 1 })

/** 逻辑坐标 → canvas CSS 坐标后点击（canvas CSS 尺寸 = 窗口尺寸） */
async function click(page: Page, logical: { x: number; y: number }): Promise<void> {
  const pos = await page.evaluate(({ x, y }) => {
    const k = window.innerWidth / window.__warmoji!.viewW
    return { x: Math.round(x * k), y: Math.round(y * k) }
  }, logical)
  await page.locator('#game canvas').click({ position: pos })
}

// ECS 侧的探针是 window.__ecs（__warmoji 在 ECS 战斗期间是陈旧的，本场景不写它）。
// 页面内求值的闭包不能引用本文件的作用域，故各处内联展开
type Ecs = { elapsed: number; kills: number; enemies: number; outbox: number; unsortedLayers: number; blindSprites: number }
type WinEcs = Window & { __ecs?: Ecs }

test('试炼场：ECS 战斗跑得起来、有击杀、出站信箱不积压', async ({ page }) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))

  // 两个开关直接种进 localStorage（键名同 src/save/settings.ts）：本条守卫钉的是
  // 「ECS 战斗打不打得起来」，不是「设置页能不能点」。这两项都排在设置列表末尾、
  // 要先滚动才点得到，走 UI 只会让这条守卫依赖一堆与它无关的布局细节。
  await page.addInitScript(() => {
    localStorage.setItem('warmoji.settings.v1', JSON.stringify({ ecs: true, devMode: true }))
  })
  await page.goto('/')

  // 开局 → 地图页 → 打开试炼场 → 出发（ECS 路径最短的入口就是试炼场：免死无时限）
  await page.waitForFunction(() => window.__warmoji?.scene === 'menu' && !!window.__warmoji.menu)
  await click(page, await page.evaluate(() => window.__warmoji!.menu!.start))
  await page.waitForFunction(() => window.__warmoji?.scene === 'map' && !!window.__warmoji.map?.test)
  await click(page, await page.evaluate(() => window.__warmoji!.map!.test!))
  await page.waitForFunction(() => window.__warmoji?.map?.test?.on === true)
  await click(page, await page.evaluate(() => window.__warmoji!.map!.start))

  await page.waitForFunction(() => (window as WinEcs).__ecs !== undefined, undefined, { timeout: 30_000 })
  await page.waitForFunction(() => ((window as WinEcs).__ecs?.elapsed ?? 0) > 15_000, undefined, { timeout: 120_000 })

  const ecs = await page.evaluate(() => (window as WinEcs).__ecs!)
  expect(errors, `控制台报错：\n${errors.join('\n')}`).toEqual([])
  expect(ecs.enemies, '场上没敌人：这一局没打起来').toBeGreaterThan(0)
  expect(ecs.kills, '一个都没杀死：能力没在索敌/施伤').toBeGreaterThan(0)
  expect(ecs.outbox, '出站信箱帧末仍有积压：某条 drain 没清').toBe(0)
  expect(ecs.blindSprites, '有实体的贴图变体不在图集里（frame=-1）：它在场却永远画不出来，且不报错').toBe(0)
  expect(
    ecs.unsortedLayers,
    '有自绘层没在参与深度排序（_depth 不是数）：它的叠放次序退化成进显示列表的先后，转屏后会被地图视觉盖住',
  ).toBe(0)
})
