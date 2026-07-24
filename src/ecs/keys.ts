// ECS 实验路径的场景键（与旧竞技场场景键并列、独立注册；A/B 路由用）。
// 单独成文件避免 route ↔ scene ↔ main 的循环引用。
export const ECS_SCENE_KEY = 'ecsArena' as const
export type EcsSceneKey = typeof ECS_SCENE_KEY
