package dev.ebnbin.kgdx

import com.badlogic.gdx.ApplicationListener
import com.badlogic.gdx.Gdx
import com.badlogic.gdx.graphics.Color
import com.badlogic.gdx.utils.ScreenUtils
import dev.ebnbin.kgdx.scene.LifecycleStage
import dev.ebnbin.kgdx.scene.LifecycleStage.Companion.act
import dev.ebnbin.kgdx.scene.LifecycleStage.Companion.dispose
import dev.ebnbin.kgdx.scene.LifecycleStage.Companion.draw
import dev.ebnbin.kgdx.scene.LifecycleStage.Companion.pause
import dev.ebnbin.kgdx.scene.LifecycleStage.Companion.resize
import dev.ebnbin.kgdx.scene.LifecycleStage.Companion.resume

val game: Game
    get() = Gdx.app.applicationListener as Game

abstract class Game : ApplicationListener {
    private var canRender: Boolean = false
    private var resumed: Boolean = false

    var stageList: List<LifecycleStage>? = null
        set(value) {
            val resumed = resumed
            if (resumed) {
                field?.pause()
            }
            field?.dispose()
            field = value
            field?.resize(Gdx.graphics.width, Gdx.graphics.height)
            if (resumed) {
                field?.resume()
            }
        }

    override fun create() {
        canRender = true
    }

    override fun resize(width: Int, height: Int) {
        stageList?.resize(width, height)
    }

    override fun resume() {
        canRender = true
    }

    override fun render() {
        if (!canRender) return
        if (!resumed) {
            resumed = true
            stageList?.resume()
        }
        stageList?.act(Gdx.graphics.deltaTime)
        ScreenUtils.clear(Color.CLEAR)
        stageList?.draw()
    }

    override fun pause() {
        if (resumed) {
            stageList?.pause()
            resumed = false
        }
        canRender = false
    }

    override fun dispose() {
        stageList = null
    }
}
