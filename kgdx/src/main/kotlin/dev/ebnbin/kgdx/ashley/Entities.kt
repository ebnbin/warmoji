package dev.ebnbin.kgdx.ashley

import com.badlogic.ashley.core.Component
import com.badlogic.ashley.core.Entity
import ktx.ashley.mapperFor

inline fun <reified T : Component> Entity.mapperGet(): T? {
    return mapperFor<T>().get(this)
}

inline fun <reified T : Component> Entity.mapperRequire(): T {
    return requireNotNull(mapperGet())
}
