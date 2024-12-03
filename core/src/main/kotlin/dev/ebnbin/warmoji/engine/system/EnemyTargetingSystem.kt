package dev.ebnbin.warmoji.engine.system

import com.badlogic.ashley.core.Entity
import com.badlogic.ashley.systems.IteratingSystem
import dev.ebnbin.kgdx.ashley.mapperRequire
import dev.ebnbin.warmoji.engine.DirectionComponent
import dev.ebnbin.warmoji.engine.EnemyComponent
import dev.ebnbin.warmoji.engine.PositionComponent
import dev.ebnbin.warmoji.engine.warEngine
import ktx.ashley.allOf
import kotlin.math.absoluteValue
import kotlin.math.sqrt

class EnemyTargetingSystem : IteratingSystem(allOf(
    EnemyComponent::class,
).get()) {
    override fun processEntity(entity: Entity, deltaTime: Float) {
        val playerPosition = warEngine.player.mapperRequire<PositionComponent>()
        val position = entity.mapperRequire<PositionComponent>()
        val direction = entity.mapperRequire<DirectionComponent>()
        val offsetX = playerPosition.x - position.x
        val offsetY = playerPosition.y - position.y
        val distance = sqrt(offsetX * offsetX + offsetY * offsetY)
        direction.x = if (distance < 0.01f || offsetX.absoluteValue < 0.01f) {
            0f
        } else {
            offsetX / distance
        }
        direction.y = if (distance < 0.01f || offsetY.absoluteValue < 0.01f) {
            0f
        } else {
            offsetY / distance
        }
    }
}
