@file:JvmName("ToolsLauncher")

package dev.ebnbin.warmoji.tools

import com.badlogic.gdx.ApplicationListener
import com.badlogic.gdx.backends.headless.HeadlessApplication
import com.badlogic.gdx.backends.headless.HeadlessApplicationConfiguration

fun main() {
    if (StartupHelper.startNewJvmIfRequired()) return
    runHeadlessApplication {
    }
}

private fun runHeadlessApplication(block: ApplicationListener.() -> Unit) {
    val listener = object : ApplicationListener {
        override fun create() {
            block()
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
    val config = HeadlessApplicationConfiguration().also {
        it.updatesPerSecond = -1
    }
    HeadlessApplication(listener, config)
}
