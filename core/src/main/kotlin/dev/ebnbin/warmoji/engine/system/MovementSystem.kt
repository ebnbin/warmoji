package dev.ebnbin.warmoji.engine.system

import com.badlogic.ashley.core.Entity
import com.badlogic.ashley.systems.IteratingSystem
import dev.ebnbin.kgdx.ashley.mapperGet
import dev.ebnbin.kgdx.ashley.mapperRequire
import dev.ebnbin.warmoji.engine.HitSizeComponent
import dev.ebnbin.warmoji.engine.PositionComponent
import dev.ebnbin.warmoji.engine.VelocityComponent
import dev.ebnbin.warmoji.engine.warEngine
import ktx.ashley.allOf

class MovementSystem : IteratingSystem(allOf(
    PositionComponent::class,
    VelocityComponent::class,
).get()) {
    override fun processEntity(entity: Entity, deltaTime: Float) {
        val position = entity.mapperRequire<PositionComponent>()
        val velocity = entity.mapperRequire<VelocityComponent>()
        val hitSize = entity.mapperGet<HitSizeComponent>()
        position.x = (position.x + velocity.x * deltaTime).coerceIn(
            (hitSize?.width ?: 0f) / 2f,
            warEngine.columns - (hitSize?.width ?: 0f) / 2f,
        )
        position.y = (position.y + velocity.y * deltaTime).coerceIn(
            (hitSize?.height ?: 0f) / 2f,
            warEngine.rows - (hitSize?.height ?: 0f) / 2f,
        )
    }
}
