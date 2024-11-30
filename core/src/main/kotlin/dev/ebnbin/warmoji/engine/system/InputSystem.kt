package dev.ebnbin.warmoji.engine.system

import com.badlogic.ashley.core.Engine
import com.badlogic.ashley.core.Entity
import com.badlogic.ashley.core.EntitySystem
import com.badlogic.gdx.Gdx
import com.badlogic.gdx.Input
import dev.ebnbin.warmoji.engine.PlayerComponent
import dev.ebnbin.warmoji.engine.VelocityComponent
import dev.ebnbin.warmoji.engine.mapperRequire
import ktx.ashley.allOf

class InputSystem : EntitySystem() {
    private lateinit var player: Entity

    override fun addedToEngine(engine: Engine) {
        super.addedToEngine(engine)
        val players = engine.getEntitiesFor(allOf(PlayerComponent::class).get())
        player = players.single()
    }

    override fun update(deltaTime: Float) {
        super.update(deltaTime)
        val directionX = when {
            Gdx.input.isKeyPressed(Input.Keys.A) && !Gdx.input.isKeyPressed(Input.Keys.D) -> -1
            Gdx.input.isKeyPressed(Input.Keys.D) && !Gdx.input.isKeyPressed(Input.Keys.A) -> 1
            else -> 0
        }
        val directionY = when {
            Gdx.input.isKeyPressed(Input.Keys.S) && !Gdx.input.isKeyPressed(Input.Keys.W) -> -1
            Gdx.input.isKeyPressed(Input.Keys.W) && !Gdx.input.isKeyPressed(Input.Keys.S) -> 1
            else -> 0
        }

        val playerVelocity = player.mapperRequire<VelocityComponent>()
        playerVelocity.x = directionX * PlayerComponent.SPEED
        playerVelocity.y = directionY * PlayerComponent.SPEED
    }
}
