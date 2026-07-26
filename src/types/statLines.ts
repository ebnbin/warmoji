// 角色属性面板的展示模型：把异构的角色/能力参数组织成统一的「属性组」。
// 距离统一换算为「格」（1 格 = 1 单位 = 地图网格边长），时间换算为秒。
// 未来道具系统在此挂修正器：groups 由 def + 已购道具共同计算。
export interface StatGroup {
  readonly icon: string
  readonly title: string
  readonly lines: readonly string[]
}
