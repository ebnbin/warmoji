package dev.ebnbin.warmoji.emojigrid

import com.badlogic.gdx.graphics.Color
import com.badlogic.gdx.graphics.OrthographicCamera
import com.badlogic.gdx.utils.ScreenUtils
import com.badlogic.gdx.utils.viewport.ScreenViewport
import dev.ebnbin.kgdx.scene.LifecycleStage

class EmojiGridStage : LifecycleStage(object : ScreenViewport() {
    override fun update(screenWidth: Int, screenHeight: Int, centerCamera: Boolean) {
        (camera as OrthographicCamera).setToOrtho(true, screenWidth.toFloat(), screenHeight.toFloat())
        super.update(screenWidth, screenHeight, centerCamera)
    }
}) {
    private val emojiGridActor: EmojiGridActor = EmojiGridActor().also {
        addActor(it)
    }

    override fun resize(width: Float, height: Float) {
        super.resize(width, height)
        emojiGridActor.setSize(width, height)
    }

    override fun draw() {
        ScreenUtils.clear(Color.WHITE)
        super.draw()
    }
}
