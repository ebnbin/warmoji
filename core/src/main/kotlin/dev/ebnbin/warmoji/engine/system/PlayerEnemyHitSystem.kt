package dev.ebnbin.warmoji.engine.system

import com.badlogic.ashley.core.Engine
import com.badlogic.ashley.core.Entity
import com.badlogic.ashley.core.EntitySystem
import com.badlogic.ashley.utils.ImmutableArray
import dev.ebnbin.kgdx.ashley.mapperRequire
import dev.ebnbin.warmoji.engine.EnemyComponent
import dev.ebnbin.warmoji.engine.HitSizeComponent
import dev.ebnbin.warmoji.engine.PositionComponent
import dev.ebnbin.warmoji.engine.warEngine
import ktx.ashley.allOf

class PlayerEnemyHitSystem : EntitySystem() {
    private lateinit var enemies: ImmutableArray<Entity>

    override fun addedToEngine(engine: Engine) {
        super.addedToEngine(engine)
        enemies = engine.getEntitiesFor(allOf(EnemyComponent::class).get())
    }

    override fun update(deltaTime: Float) {
        super.update(deltaTime)
        val player = warEngine.player
        val playerPosition = player.mapperRequire<PositionComponent>()
        val playerHitSize = player.mapperRequire<HitSizeComponent>()
        for (enemy in enemies) {
            val enemyPosition = enemy.mapperRequire<PositionComponent>()
            val enemyHitSize = enemy.mapperRequire<HitSizeComponent>()
            if (playerPosition.x - playerHitSize.width / 2f < enemyPosition.x + enemyHitSize.width / 2f &&
                playerPosition.x + playerHitSize.width / 2f > enemyPosition.x - enemyHitSize.width / 2f &&
                playerPosition.y - playerHitSize.height / 2f < enemyPosition.y + enemyHitSize.height / 2f &&
                playerPosition.y + playerHitSize.height / 2f > enemyPosition.y - enemyHitSize.height / 2f) {
                warEngine.removeEntity(enemy)
            }
        }
    }
}
