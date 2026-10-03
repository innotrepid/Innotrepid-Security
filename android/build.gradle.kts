group = "com.innotrepid.security"

plugins {
    id("com.android.library") version "8.11.1"
    id("org.jetbrains.kotlin.android") version "2.2.20"
}

android {
    namespace = "com.innotrepid.security"
    compileSdk = 36

    defaultConfig {
        minSdk = 23
    }
}

dependencies {
    implementation("com.google.android.play:integrity:1.6.0")
}
