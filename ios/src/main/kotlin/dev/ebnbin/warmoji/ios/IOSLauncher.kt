package dev.ebnbin.warmoji.ios

import com.badlogic.gdx.backends.iosrobovm.IOSApplication
import com.badlogic.gdx.backends.iosrobovm.IOSApplicationConfiguration
import com.badlogic.gdx.graphics.glutils.HdpiMode
import dev.ebnbin.warmoji.WarMoji
import org.robovm.apple.foundation.NSAutoreleasePool
import org.robovm.apple.uikit.UIApplication

class IOSLauncher : IOSApplication.Delegate() {
    override fun createApplication(): IOSApplication {
        val listener = WarMoji()
        val config = IOSApplicationConfiguration().also {
            it.hdpiMode = HdpiMode.Pixels
        }
        return IOSApplication(listener, config)
    }

    companion object {
        @JvmStatic
        fun main(args: Array<String>) {
            NSAutoreleasePool().use {
                val principalClass: Class<UIApplication>? = null
                val delegateClass = IOSLauncher::class.java
                UIApplication.main(args, principalClass, delegateClass)
            }
        }
    }
}
