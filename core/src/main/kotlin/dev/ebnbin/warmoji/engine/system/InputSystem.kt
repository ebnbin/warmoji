package dev.ebnbin.warmoji.engine.system

import com.badlogic.ashley.core.EntitySystem
import com.badlogic.gdx.Gdx
import com.badlogic.gdx.Input
import dev.ebnbin.kgdx.ashley.mapperRequire
import dev.ebnbin.warmoji.engine.SpeedComponent
import dev.ebnbin.warmoji.engine.VelocityComponent
import dev.ebnbin.warmoji.engine.warEngine

class InputSystem : EntitySystem() {
    override fun update(deltaTime: Float) {
        super.update(deltaTime)
        val directionX = when {
            Gdx.input.isKeyPressed(Input.Keys.A) && !Gdx.input.isKeyPressed(Input.Keys.D) -> -1f
            Gdx.input.isKeyPressed(Input.Keys.D) && !Gdx.input.isKeyPressed(Input.Keys.A) -> 1f
            else -> 0f
        }
        val directionY = when {
            Gdx.input.isKeyPressed(Input.Keys.S) && !Gdx.input.isKeyPressed(Input.Keys.W) -> -1f
            Gdx.input.isKeyPressed(Input.Keys.W) && !Gdx.input.isKeyPressed(Input.Keys.S) -> 1f
            else -> 0f
        }

        val playerSpeed = warEngine.player.mapperRequire<SpeedComponent>()
        val playerVelocity = warEngine.player.mapperRequire<VelocityComponent>()
        playerVelocity.x = playerSpeed.value * directionX
        playerVelocity.y = playerSpeed.value * directionY
    }
}
