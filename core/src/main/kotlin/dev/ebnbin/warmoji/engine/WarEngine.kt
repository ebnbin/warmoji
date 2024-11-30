package dev.ebnbin.warmoji.engine

import com.badlogic.ashley.core.Component
import com.badlogic.ashley.core.Entity
import com.badlogic.ashley.core.EntitySystem
import com.badlogic.gdx.graphics.g2d.SpriteBatch
import com.badlogic.gdx.graphics.glutils.ShapeRenderer
import com.badlogic.gdx.utils.viewport.Viewport
import dev.ebnbin.kgdx.scene.LifecycleEngine
import dev.ebnbin.kgdx.scene.LifecycleSystem
import dev.ebnbin.warmoji.engine.system.BackgroundDrawingSystem
import dev.ebnbin.warmoji.engine.system.CameraSystem
import dev.ebnbin.warmoji.engine.system.InputSystem
import dev.ebnbin.warmoji.engine.system.MovementSystem
import dev.ebnbin.warmoji.engine.system.TextureDrawingSystem
import dev.ebnbin.warmoji.warMoji
import ktx.ashley.addComponent
import ktx.ashley.mapperFor

class WarEngine : LifecycleEngine() {
    override val viewport: Viewport = WarViewport(TILES_PER_SCREEN)

    val shapeRenderer: ShapeRenderer = ShapeRenderer()

    val batch: SpriteBatch = SpriteBatch()

    val rows: Int = ROWS
    val columns: Int = COLUMNS

    init {
        val player = createEntity().also {
            it.addComponent<PlayerComponent>(this)
            it.addComponent<PositionComponent>(this) {
                x = columns / 2f
                y = rows / 2f
            }
            it.addComponent<RenderSizeComponent>(this) {
                width = 1f
                height = 1f
            }
            it.addComponent<HitSizeComponent>(this) {
                width = 0f
                height = 0f
            }
            it.addComponent<SpeedComponent>(this) {
                value = 3f
            }
            it.addComponent<VelocityComponent>(this)
            it.addComponent<TextureComponent>(this) {
                value = warMoji.emojiManager.textureList.random()
            }
        }
        addEntity(player)

        addSystem(object : EntitySystem(), LifecycleSystem {
            override fun dispose() {
                batch.dispose()
                shapeRenderer.dispose()
                super.dispose()
            }
        })
        addSystem(InputSystem())
        addSystem(MovementSystem())
        addSystem(CameraSystem())
        addSystem(BackgroundDrawingSystem())
        addSystem(TextureDrawingSystem())
    }

    companion object {
        private const val TILES_PER_SCREEN = 12f
        private const val ROWS = 25
        private const val COLUMNS = 25
    }
}

val EntitySystem.warEngine: WarEngine
    get() = engine as WarEngine

inline fun <reified T : Component> Entity.mapperGet(): T? {
    return mapperFor<T>().get(this)
}

inline fun <reified T : Component> Entity.mapperRequire(): T {
    return requireNotNull(mapperGet())
}
