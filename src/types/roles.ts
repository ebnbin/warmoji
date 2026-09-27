import type rolesJson from '../assets/roles.json'
import type { StatMods } from './stats'

export type RoleId = keyof typeof rolesJson

/** 角色定位：一组有得有失的属性修正，同定位的角色共用 */
export interface RoleDef {
  readonly name: string
  readonly stats: StatMods
}
