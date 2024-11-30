package dev.ebnbin.kgdx

import com.badlogic.gdx.ApplicationListener
import com.badlogic.gdx.Gdx
import com.badlogic.gdx.graphics.Color
import com.badlogic.gdx.utils.ScreenUtils
import dev.ebnbin.kgdx.scene.Scene
import dev.ebnbin.kgdx.scene.Scene.Companion.dispose
import dev.ebnbin.kgdx.scene.Scene.Companion.pause
import dev.ebnbin.kgdx.scene.Scene.Companion.render
import dev.ebnbin.kgdx.scene.Scene.Companion.resize
import dev.ebnbin.kgdx.scene.Scene.Companion.resume

val game: Game
    get() = Gdx.app.applicationListener as Game

abstract class Game : ApplicationListener {
    private var canRender: Boolean = false
    private var resumed: Boolean = false

    var sceneList: List<Scene>? = null
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
        sceneList?.resize(width, height)
    }

    override fun resume() {
        canRender = true
    }

    override fun render() {
        if (!canRender) return
        if (!resumed) {
            resumed = true
            sceneList?.resume()
        }
        ScreenUtils.clear(Color.CLEAR)
        val deltaTime = Gdx.graphics.deltaTime
        sceneList?.render(deltaTime)
    }

    override fun pause() {
        if (resumed) {
            sceneList?.pause()
            resumed = false
        }
        canRender = false
    }

    override fun dispose() {
        sceneList = null
    }
}
