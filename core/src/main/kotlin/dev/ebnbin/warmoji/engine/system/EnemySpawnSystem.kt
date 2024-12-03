package dev.ebnbin.warmoji.engine.system

import com.badlogic.ashley.core.EntitySystem
import dev.ebnbin.warmoji.engine.entityEnemy
import dev.ebnbin.warmoji.engine.warEngine
import kotlin.random.Random

class EnemySpawnSystem : EntitySystem() {
    override fun update(deltaTime: Float) {
        super.update(deltaTime)
        if (Random.nextFloat() < deltaTime) {
            warEngine.entityEnemy()
        }
    }
}
