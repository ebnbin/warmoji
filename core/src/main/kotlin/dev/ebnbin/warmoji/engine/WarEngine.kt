package dev.ebnbin.warmoji.engine

import com.badlogic.ashley.core.Entity
import com.badlogic.ashley.core.EntitySystem
import com.badlogic.gdx.graphics.g2d.SpriteBatch
import com.badlogic.gdx.graphics.glutils.ShapeRenderer
import com.badlogic.gdx.utils.viewport.Viewport
import dev.ebnbin.kgdx.scene.LifecycleEngine
import dev.ebnbin.kgdx.scene.LifecycleSystem
import dev.ebnbin.warmoji.engine.system.BackgroundRenderSystem
import dev.ebnbin.warmoji.engine.system.CameraSystem
import dev.ebnbin.warmoji.engine.system.EnemySpawnSystem
import dev.ebnbin.warmoji.engine.system.EnemyTargetingSystem
import dev.ebnbin.warmoji.engine.system.InputSystem
import dev.ebnbin.warmoji.engine.system.MovementSystem
import dev.ebnbin.warmoji.engine.system.PlayerEnemyHitSystem
import dev.ebnbin.warmoji.engine.system.TextureRenderSystem

val EntitySystem.warEngine: WarEngine
    get() = engine as WarEngine

class WarEngine : LifecycleEngine() {
    override val viewport: Viewport = WarViewport(TILES_PER_SCREEN)

    val shapeRenderer: ShapeRenderer = ShapeRenderer()
    val batch: SpriteBatch = SpriteBatch()

    val rows: Int = ROWS
    val columns: Int = COLUMNS

    val player: Entity = entityPlayer()

    init {
        addSystem(object : EntitySystem(), LifecycleSystem {
            override fun dispose() {
                batch.dispose()
                shapeRenderer.dispose()
                super.dispose()
            }
        })
        addSystem(EnemySpawnSystem())
        addSystem(InputSystem())
        addSystem(EnemyTargetingSystem())
        addSystem(MovementSystem())
        addSystem(PlayerEnemyHitSystem())
        addSystem(CameraSystem())
        addSystem(BackgroundRenderSystem())
        addSystem(TextureRenderSystem())
    }

    companion object {
        private const val TILES_PER_SCREEN = 12f
        private const val ROWS = 25
        private const val COLUMNS = 25
    }
}
