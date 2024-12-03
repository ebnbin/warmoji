package dev.ebnbin.warmoji.engine

import com.badlogic.ashley.core.Component
import com.badlogic.ashley.core.Entity
import dev.ebnbin.warmoji.warMoji
import kotlin.random.Random

private fun WarEngine.entity(configure: Pair<WarEngine, Entity>.(WarEngine) -> Unit = {}): Entity {
    val entity = createEntity()
    val pair = this to entity
    pair.configure(this)
    addEntity(entity)
    return entity
}

private inline fun <reified T : Component> Pair<WarEngine, Entity>.component(configure: T.() -> Unit = {}): T {
    val (engine, entity) = this
    val component = engine.createComponent(T::class.java)
    component.configure()
    entity.add(component)
    return component
}

fun WarEngine.entityPlayer(): Entity {
    return entity {
        component<PlayerComponent>()
        component<PositionComponent> {
            x = columns / 2f
            y = rows / 2f
        }
        component<RenderSizeComponent> {
            width = 1f
            height = 1f
        }
        component<HitSizeComponent> {
            width = 0.6f
            height = 0.6f
        }
        component<SpeedComponent> {
            value = 3f
        }
        component<VelocityComponent>()
        component<TextureComponent> {
            value = warMoji.emojiManager.textureList.random()
        }
    }
}

fun WarEngine.entityEnemy(): Entity {
    return entity { engine ->
        component<EnemyComponent>()
        val hitWidth = 0.6f
        val hitHeight = 0.6f
        component<PositionComponent> {
            x = Random.nextFloat() * (engine.columns - hitWidth) + hitWidth / 2f
            y = Random.nextFloat() * (engine.rows - hitHeight) + hitHeight / 2f
        }
        component<RenderSizeComponent> {
            width = 1f
            height = 1f
        }
        component<HitSizeComponent> {
            width = hitWidth
            height = hitHeight
        }
        component<SpeedComponent> {
            value = 2f
        }
        component<VelocityComponent>()
        component<TextureComponent> {
            value = warMoji.emojiManager.textureList.random()
        }
    }
}
