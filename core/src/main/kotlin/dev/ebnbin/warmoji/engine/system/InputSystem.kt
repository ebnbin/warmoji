package dev.ebnbin.warmoji.engine.system

import com.badlogic.ashley.core.EntitySystem
import com.badlogic.gdx.Gdx
import com.badlogic.gdx.Input
import dev.ebnbin.kgdx.ashley.mapperRequire
import dev.ebnbin.warmoji.engine.DirectionComponent
import dev.ebnbin.warmoji.engine.warEngine
import kotlin.math.sqrt

class InputSystem : EntitySystem() {
    override fun update(deltaTime: Float) {
        super.update(deltaTime)
        val isLeftPressed = Gdx.input.isKeyPressed(Input.Keys.A) && !Gdx.input.isKeyPressed(Input.Keys.D)
        val isRightPressed = Gdx.input.isKeyPressed(Input.Keys.D) && !Gdx.input.isKeyPressed(Input.Keys.A)
        val isBottomPressed = Gdx.input.isKeyPressed(Input.Keys.S) && !Gdx.input.isKeyPressed(Input.Keys.W)
        val isTopPressed = Gdx.input.isKeyPressed(Input.Keys.W) && !Gdx.input.isKeyPressed(Input.Keys.S)
        val isLeftTouched = Gdx.input.isTouched(0) && Gdx.input.getX(0) < Gdx.graphics.width / 3
        val isRightTouched = Gdx.input.isTouched(0) && Gdx.input.getX(0) > Gdx.graphics.width * 2 / 3
        val isBottomTouched = Gdx.input.isTouched(0) && Gdx.input.getY(0) > Gdx.graphics.height * 2 / 3
        val isTopTouched = Gdx.input.isTouched(0) && Gdx.input.getY(0) < Gdx.graphics.height / 3
        val directionX = when {
            isLeftPressed || isLeftTouched -> -1f
            isRightPressed || isRightTouched -> 1f
            else -> 0f
        }
        val directionY = when {
            isBottomPressed || isBottomTouched -> -1f
            isTopPressed || isTopTouched -> 1f
            else -> 0f
        }
        val playerDirection = warEngine.player.mapperRequire<DirectionComponent>()
        playerDirection.x = when {
            directionX == 0f -> 0f
            directionY == 0f -> directionX
            else -> directionX / sqrt(2f)
        }
        playerDirection.y = when {
            directionY == 0f -> 0f
            directionX == 0f -> directionY
            else -> directionY / sqrt(2f)
        }
    }
}
