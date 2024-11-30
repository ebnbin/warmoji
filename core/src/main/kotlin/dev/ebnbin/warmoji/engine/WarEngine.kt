package dev.ebnbin.warmoji.engine

import com.badlogic.ashley.core.Component
import com.badlogic.ashley.core.Entity
import com.badlogic.ashley.core.EntitySystem
import com.badlogic.ashley.core.PooledEngine
import com.badlogic.gdx.graphics.g2d.SpriteBatch
import com.badlogic.gdx.graphics.glutils.ShapeRenderer
import dev.ebnbin.kgdx.scene.Scene
import dev.ebnbin.warmoji.engine.system.BackgroundDrawingSystem
import dev.ebnbin.warmoji.engine.system.CameraSystem
import dev.ebnbin.warmoji.engine.system.TextureDrawingSystem
import dev.ebnbin.warmoji.engine.system.InputSystem
import dev.ebnbin.warmoji.engine.system.MovementSystem
import dev.ebnbin.warmoji.warMoji
import ktx.ashley.addComponent
import ktx.ashley.mapperFor

class WarEngine : PooledEngine(), Scene {
    val viewport: WarViewport = WarViewport(TILES_PER_SCREEN)

    val shapeRenderer: ShapeRenderer = ShapeRenderer()

    val batch: SpriteBatch = SpriteBatch()

    val rows: Int = ROWS
    val columns: Int = COLUMNS

    val minX: Float = 0.5f
    val maxX: Float = columns - 0.5f
    val minY: Float = 0.5f
    val maxY: Float = rows - 0.5f

    interface ResizeListener {
        fun resize(width: Float, height: Float)
    }

    private val resizeListenerList: MutableList<ResizeListener> = mutableListOf()

    fun addResizeListener(listener: ResizeListener) {
        resizeListenerList.add(listener)
    }

    fun removeResizeListener(listener: ResizeListener) {
        resizeListenerList.remove(listener)
    }

    private var resized: Boolean = false

    override fun resize(width: Int, height: Int) {
        diffSize {
            viewport.update(width, height)
        }
    }

    private fun resize(width: Float, height: Float) {
        resizeListenerList.forEach { listener ->
            listener.resize(width, height)
        }
    }

    private fun diffSize(updateViewport: () -> Unit) {
        val oldWidth = viewport.worldWidth
        val oldHeight = viewport.worldHeight
        updateViewport()
        val newWidth = viewport.worldWidth
        val newHeight = viewport.worldHeight
        if (resized && oldWidth == newWidth && oldHeight == newHeight) return
        if (!resized) {
            resized = true
        }
        resize(newWidth, newHeight)
    }

    override fun resume() {
    }

    override fun render(deltaTime: Float) {
        update(deltaTime)
    }

    override fun pause() {
    }

    override fun dispose() {
        batch.dispose()
        shapeRenderer.dispose()
    }

    init {
        val player = createEntity().also {
            it.addComponent<PlayerComponent>(this)
            it.addComponent<PositionComponent>(this) {
                x = columns / 2f
                y = rows / 2f
            }
            it.addComponent<VelocityComponent>(this)
            it.addComponent<TextureComponent>(this) {
                lateinitTexture = warMoji.emojiManager.textureList.random()
            }
        }
        addEntity(player)

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
