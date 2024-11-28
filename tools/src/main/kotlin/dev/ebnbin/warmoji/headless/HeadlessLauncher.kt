@file:JvmName("HeadlessLauncher")

package dev.ebnbin.warmoji.headless

import com.badlogic.gdx.backends.headless.HeadlessApplication
import com.badlogic.gdx.backends.headless.HeadlessApplicationConfiguration
import dev.ebnbin.warmoji.WarMoji

/** Launches the headless application. Can be converted into a server application or a scripting utility. */
fun main() {
    HeadlessApplication(WarMoji(), HeadlessApplicationConfiguration().apply {
        // When this value is negative, WarMoji#render() is never called:
        updatesPerSecond = -1
    })
}
