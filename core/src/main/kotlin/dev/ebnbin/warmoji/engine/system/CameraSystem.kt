package dev.ebnbin.warmoji.engine.system

import com.badlogic.ashley.core.Engine
import com.badlogic.ashley.core.Entity
import com.badlogic.ashley.core.EntitySystem
import dev.ebnbin.kgdx.ashley.mapperRequire
import dev.ebnbin.kgdx.scene.LifecycleSystem
import dev.ebnbin.warmoji.engine.PlayerComponent
import dev.ebnbin.warmoji.engine.PositionComponent
import dev.ebnbin.warmoji.engine.warEngine
import ktx.ashley.allOf

class CameraSystem : EntitySystem(), LifecycleSystem {
    private lateinit var player: Entity

    private var defaultX: Float = 0f
    private var defaultY: Float = 0f

    private var minX: Float = 0f
    private var maxX: Float = 0f
    private var minY: Float = 0f
    private var maxY: Float = 0f

    override fun addedToEngine(engine: Engine) {
        super.addedToEngine(engine)
        val players = engine.getEntitiesFor(allOf(PlayerComponent::class).get())
        player = players.single()

        defaultX = warEngine.columns / 2f
        defaultY = (warEngine.rows - MARGIN_BOTTOM + MARGIN_TOP) / 2f

        minX = defaultX
        maxX = defaultX
        minY = defaultY
        maxY = defaultY

        warEngine.viewport.camera.position.x = defaultX
        warEngine.viewport.camera.position.y = defaultY
        warEngine.viewport.camera.update()
    }

    override fun resize(width: Float, height: Float) {
        super.resize(width, height)
        minX = width / 2f - MARGIN_HORIZONTAL
        maxX = warEngine.columns - width / 2f + MARGIN_HORIZONTAL
        minY = height / 2f - MARGIN_BOTTOM
        maxY = warEngine.rows - height / 2f + MARGIN_TOP
    }

    override fun update(deltaTime: Float) {
        super.update(deltaTime)
        val playerPosition = player.mapperRequire<PositionComponent>()
        warEngine.viewport.camera.position.x = if (minX > maxX) {
            defaultX
        } else {
            playerPosition.x.coerceIn(minX, maxX)
        }
        warEngine.viewport.camera.position.y = if (minY > maxY) {
            defaultY
        } else {
            playerPosition.y.coerceIn(minY, maxY)
        }
        warEngine.viewport.camera.update()
    }

    companion object {
        private const val MARGIN_HORIZONTAL = 1.5f
        private const val MARGIN_BOTTOM = 1f
        private const val MARGIN_TOP = 2f
    }
}
