package dev.ebnbin.warmoji.engine.system

import com.badlogic.ashley.core.Entity
import com.badlogic.ashley.systems.IteratingSystem
import dev.ebnbin.warmoji.engine.PositionComponent
import dev.ebnbin.warmoji.engine.VelocityComponent
import dev.ebnbin.warmoji.engine.mapperRequire
import dev.ebnbin.warmoji.engine.warEngine
import ktx.ashley.allOf

class MovementSystem : IteratingSystem(allOf(
    PositionComponent::class,
    VelocityComponent::class,
).get()) {
    override fun processEntity(entity: Entity, deltaTime: Float) {
        val position = entity.mapperRequire<PositionComponent>()
        val velocity = entity.mapperRequire<VelocityComponent>()
        position.x = (position.x + velocity.x * deltaTime).coerceIn(warEngine.minX, warEngine.maxX)
        position.y = (position.y + velocity.y * deltaTime).coerceIn(warEngine.minY, warEngine.maxY)
    }
}
