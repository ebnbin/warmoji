/** 商店进度条数据：当前等级、本级内进度、是否满级 */
export interface LevelProgress {
  level: number
  maxed: boolean
  /** 本级已攒 / 升下一级所需（满级时均为 0） */
  cur: number
  need: number
  ratio: number
}
