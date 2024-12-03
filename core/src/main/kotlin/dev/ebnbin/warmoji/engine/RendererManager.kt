package dev.ebnbin.warmoji.engine

import com.badlogic.gdx.Gdx
import com.badlogic.gdx.graphics.Color
import com.badlogic.gdx.graphics.GL20
import com.badlogic.gdx.graphics.g2d.SpriteBatch
import com.badlogic.gdx.graphics.glutils.ShapeRenderer
import com.badlogic.gdx.math.Rectangle
import com.badlogic.gdx.scenes.scene2d.utils.ScissorStack
import com.badlogic.gdx.utils.viewport.Viewport

class RendererManager(
    private val viewport: Viewport,
) {
    val shapeRenderer: ShapeRenderer = ShapeRenderer()

    val spriteBatch: SpriteBatch = SpriteBatch()

    private val clipScissor: Rectangle = Rectangle()

    fun useShape(
        type: ShapeRenderer.ShapeType,
        enableBlend: Boolean = true,
        action: ShapeRenderer.() -> Unit,
    ) {
        if (enableBlend) {
            Gdx.gl.glEnable(GL20.GL_BLEND)
        }
        shapeRenderer.projectionMatrix = viewport.camera.combined
        shapeRenderer.begin(type)
        shapeRenderer.color = Color.WHITE
        shapeRenderer.action()
        shapeRenderer.end()
        if (enableBlend) {
            Gdx.gl.glDisable(GL20.GL_BLEND)
        }
    }

    fun useBatch(
        clipArea: Rectangle? = null,
        action: SpriteBatch.() -> Unit,
    ) {
        spriteBatch.projectionMatrix = viewport.camera.combined
        spriteBatch.begin()
        if (clipArea != null) {
            ScissorStack.calculateScissors(viewport.camera, spriteBatch.transformMatrix, clipArea, clipScissor)
            spriteBatch.flush()
            if (ScissorStack.pushScissors(clipScissor)) {
                spriteBatch.color = Color.WHITE
                spriteBatch.action()
                spriteBatch.flush()
                ScissorStack.popScissors()
            }
        } else {
            spriteBatch.color = Color.WHITE
            spriteBatch.action()
        }
        spriteBatch.end()
    }

    fun dispose() {
        spriteBatch.dispose()
        shapeRenderer.dispose()
    }
}
