import rolesJson from '../assets/roles.json'
import { fromJson } from './json'
import type { InstinctDef, RoleDef, RoleId } from '../types/roles'

export const ROLES = fromJson<Record<RoleId, RoleDef>>(rolesJson)

export const INSTINCT_LABEL: Record<InstinctDef['kind'], string> = {
  engage: '贴身打',
  guard: '护住队长',
  dive: '扑残血',
  kite: '保持距离',
  tend: '靠近伤员',
}
