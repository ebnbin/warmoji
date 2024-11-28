# WarMoji

A [libGDX](https://libgdx.com/) project generated with [gdx-liftoff](https://github.com/libgdx/gdx-liftoff).

This project was generated with a template that includes Kotlin application launchers and draws the libGDX logo within the application listener.

## Platforms

- `core`: Main module with the application logic shared by all platforms.
- `desktop`: Primary desktop platform using LWJGL3.
- `android`: Android mobile platform. Needs Android SDK.
- `ios`: iOS mobile platform using RoboVM.
- `tools`: Desktop platform without a graphical interface.
- `kgdx`: A common module shared by `core` and `server` platforms.

## Gradle

This project uses [Gradle](https://gradle.org/) to manage dependencies.
The Gradle wrapper was included, so you can run Gradle tasks using `gradlew.bat` or `./gradlew` commands.
Useful Gradle tasks and flags:

- `--continue`: when using this flag, errors will not stop the tasks from running.
- `--daemon`: thanks to this flag, Gradle daemon will be used to run chosen tasks.
- `--offline`: when using this flag, cached dependency archives will be used.
- `--refresh-dependencies`: this flag forces validation of all dependencies. Useful for snapshot versions.
- `android:lint`: performs Android project validation.
- `build`: builds sources and archives of every project.
- `clean`: removes `build` folders, which store compiled classes and built archives.
- `tools:run`: starts the headless application. Note: if headless sources were not modified - and the application still creates `ApplicationListener` from `core` project - this task might fail due to no graphics support.
- `desktop:jar`: builds application's runnable jar, which can be found at `desktop/build/libs`.
- `desktop:run`: starts the application.
- `test`: runs unit tests (if any).

Note that most tasks that are not specific to a single project can be run with `name:` prefix, where the `name` should be replaced with the ID of a specific project.
For example, `core:clean` removes `build` folder only from the `core` project.
