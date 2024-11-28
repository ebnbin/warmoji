buildscript {
    repositories {
        mavenCentral()
        gradlePluginPortal()
        google()
    }
    dependencies {
        classpath(Dependencies.KOTLIN_GRADLE_PLUGIN)
        classpath(Dependencies.CONSTRUO)
        classpath(Dependencies.GRADLE)
        classpath(Dependencies.ROBOVM_GRADLE_PLUGIN)
    }
}

subprojects {
    repositories {
        mavenCentral()
        google()
    }
}
