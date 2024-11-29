package dev.ebnbin.warmoji.war

import com.badlogic.gdx.Gdx
import com.badlogic.gdx.Input
import com.badlogic.gdx.graphics.g2d.Batch
import com.badlogic.gdx.scenes.scene2d.Actor

class WarActor(rows: Int, columns: Int) : Actor() {
    private val engine: WarEngine = WarEngine(
        rows = rows,
        columns = columns,
    )

    fun getPlayerPosition(): Pair<Float, Float> {
        return engine.getPlayerPosition()
    }

    override fun act(delta: Float) {
        super.act(delta)
        val inputDirectionX = when {
            Gdx.input.isKeyPressed(Input.Keys.A) && !Gdx.input.isKeyPressed(Input.Keys.D) -> -1
            Gdx.input.isKeyPressed(Input.Keys.D) && !Gdx.input.isKeyPressed(Input.Keys.A) -> 1
            else -> 0
        }
        val inputDirectionY = when {
            Gdx.input.isKeyPressed(Input.Keys.S) && !Gdx.input.isKeyPressed(Input.Keys.W) -> -1
            Gdx.input.isKeyPressed(Input.Keys.W) && !Gdx.input.isKeyPressed(Input.Keys.S) -> 1
            else -> 0
        }
        engine.inputDirectionX = inputDirectionX
        engine.inputDirectionY = inputDirectionY

        engine.systemState = SystemState.ACT
        engine.update(delta)
    }

    override fun draw(batch: Batch, parentAlpha: Float) {
        super.draw(batch, parentAlpha)
        engine.systemState = SystemState.DRAW
        engine.batch = batch
        engine.parentAlpha = parentAlpha
        engine.update(0f)
    }
}
