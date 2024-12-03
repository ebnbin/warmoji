package dev.ebnbin.warmoji.engine.system

import com.badlogic.ashley.core.EntitySystem
import dev.ebnbin.warmoji.engine.EnemyComponent
import dev.ebnbin.warmoji.engine.HitSizeComponent
import dev.ebnbin.warmoji.engine.PositionComponent
import dev.ebnbin.warmoji.engine.RenderSizeComponent
import dev.ebnbin.warmoji.engine.SpeedComponent
import dev.ebnbin.warmoji.engine.TextureComponent
import dev.ebnbin.warmoji.engine.VelocityComponent
import dev.ebnbin.warmoji.engine.warEngine
import dev.ebnbin.warmoji.warMoji
import ktx.ashley.addComponent
import ktx.ashley.entity
import kotlin.random.Random

class EnemySpawnSystem : EntitySystem() {
    override fun update(deltaTime: Float) {
        super.update(deltaTime)
        if (Random.nextFloat() < deltaTime) {
            createEnemy()
        }
    }

    private fun createEnemy() {
        warEngine.entity {
            entity.addComponent<EnemyComponent>(engine)
            val hitWidth = 0.6f
            val hitHeight = 0.6f
            entity.addComponent<PositionComponent>(engine) {
                x = Random.nextFloat() * (warEngine.columns - hitWidth) + hitWidth / 2f
                y = Random.nextFloat() * (warEngine.rows - hitHeight) + hitHeight / 2f
            }
            entity.addComponent<RenderSizeComponent>(engine) {
                width = 1f
                height = 1f
            }
            entity.addComponent<HitSizeComponent>(engine) {
                width = hitWidth
                height = hitHeight
            }
            entity.addComponent<SpeedComponent>(engine) {
                value = 2f
            }
            entity.addComponent<VelocityComponent>(engine)
            entity.addComponent<TextureComponent>(engine) {
                value = warMoji.emojiManager.textureList.random()
            }
        }
    }
}
