@file:JvmName("DesktopLauncher")

package dev.ebnbin.warmoji.desktop

import com.badlogic.gdx.backends.lwjgl3.Lwjgl3Application
import com.badlogic.gdx.backends.lwjgl3.Lwjgl3ApplicationConfiguration
import com.badlogic.gdx.graphics.glutils.HdpiMode
import dev.ebnbin.warmoji.WarMoji

fun main() {
    if (StartupHelper.startNewJvmIfRequired()) return
    val listener = WarMoji()
    val config = Lwjgl3ApplicationConfiguration().also {
        it.setWindowedMode(1280, 800)
        it.setHdpiMode(HdpiMode.Pixels)
    }
    Lwjgl3Application(listener, config)
}
