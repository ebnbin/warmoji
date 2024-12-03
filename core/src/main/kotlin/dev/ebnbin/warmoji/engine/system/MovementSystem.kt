package dev.ebnbin.warmoji.engine.system

import com.badlogic.ashley.core.Entity
import com.badlogic.ashley.systems.IteratingSystem
import dev.ebnbin.kgdx.ashley.mapperGet
import dev.ebnbin.kgdx.ashley.mapperRequire
import dev.ebnbin.warmoji.engine.DirectionComponent
import dev.ebnbin.warmoji.engine.HitSizeComponent
import dev.ebnbin.warmoji.engine.PositionComponent
import dev.ebnbin.warmoji.engine.SpeedComponent
import dev.ebnbin.warmoji.engine.warEngine
import ktx.ashley.allOf

class MovementSystem : IteratingSystem(allOf(
    PositionComponent::class,
    SpeedComponent::class,
    DirectionComponent::class,
).get()) {
    override fun processEntity(entity: Entity, deltaTime: Float) {
        val position = entity.mapperRequire<PositionComponent>()
        val speed = entity.mapperRequire<SpeedComponent>()
        val direction = entity.mapperRequire<DirectionComponent>()
        val hitSize = entity.mapperGet<HitSizeComponent>()
        val hitHalfWidth = (hitSize?.width ?: 0f) / 2f
        val hitHalfHeight = (hitSize?.height ?: 0f) / 2f
        position.x = (position.x + speed.value * direction.x * deltaTime)
            .coerceIn(hitHalfWidth, warEngine.columns - hitHalfWidth)
        position.y = (position.y + speed.value * direction.y * deltaTime)
            .coerceIn(hitHalfHeight, warEngine.rows - hitHalfHeight)
    }
}
