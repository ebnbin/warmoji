// 显式列出各平台 emoji 字体，保证 headless 测试环境（Noto）与真实设备都能渲染彩色 emoji。
export const EMOJI_FONT =
  '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", system-ui, sans-serif'

export const UI_FONT =
  'system-ui, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif'
