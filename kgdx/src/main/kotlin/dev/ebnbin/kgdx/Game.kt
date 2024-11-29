package dev.ebnbin.kgdx

import com.badlogic.gdx.ApplicationListener
import com.badlogic.gdx.Gdx

val game: Game
    get() = Gdx.app.applicationListener as Game

abstract class Game : ApplicationListener {
    override fun create() {
    }

    override fun resize(width: Int, height: Int) {
    }

    override fun render() {
    }

    override fun pause() {
    }

    override fun resume() {
    }

    override fun dispose() {
    }
}
