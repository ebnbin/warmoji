export const UI_FONT =
  'system-ui, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif'

// 统一字号（逻辑 px）。手机上 fitScale ≈ 0.5~0.57（保底 720 逻辑宽 → 360~390 CSS px 屏幕），
// 实际 CSS px ≈ 逻辑字号 × fitScale：body 26 → ~14 CSS px，是手机可读下限，勿再调小。
export const FONT = {
  /** 注脚：许可行、×N 角标、卡片小字 */
  caption: '20px',
  /** 次要说明：副标题、描述、徽标 */
  small: '22px',
  /** 正文：属性行、详情描述 */
  body: '26px',
  /** 强调正文：列表主行、分组标题 */
  strong: '28px',
  /** 行标题：开关标签、HUD 数字、次级按钮 */
  head: '30px',
  /** 主按钮、详情标题、HUD 计时 */
  lead: '34px',
  /** 页面标题 */
  title: '38px',
  /** 暂停等全屏浮层标题 */
  big: '48px',
  /** 波次横幅 / 游戏结束 */
  banner: '56px',
  /** 主菜单 logo */
  display: '76px',
} as const
