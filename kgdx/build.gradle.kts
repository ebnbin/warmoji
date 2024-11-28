plugins {
    kotlin("jvm")
}

java.toolchain.languageVersion.set(JavaLanguageVersion.of(BuildConfig.JAVA_VERSION))

dependencies {
    api(Dependencies.GDX)
    api(Dependencies.GDX_FREETYPE)
}
