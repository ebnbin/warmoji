plugins {
    kotlin("jvm")
    application
}

java.toolchain.languageVersion.set(JavaLanguageVersion.of(BuildConfig.JAVA_VERSION))

sourceSets.main.configure {
    resources.srcDirs(rootProject.file("assets"))
}

application.mainClass.set("${BuildConfig.ID}.tools.ToolsLauncher")

dependencies {
    implementation(project(":core"))
    implementation(Dependencies.GDX_BACKEND_LWJGL3)
    implementation(Dependencies.GDX_BACKEND_HEADLESS)
    implementation(Dependencies.GDX_PLATFORM_NATIVES_DESKTOP)
    implementation(Dependencies.GDX_FREETYPE_PLATFORM_NATIVES_DESKTOP)
    implementation(Dependencies.GDX_TOOLS)
}
