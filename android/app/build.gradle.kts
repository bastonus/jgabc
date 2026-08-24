import java.io.File

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.chanttools.divinumofficium"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.chanttools.divinumofficium"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "beta-0.0.1"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }
    }

    signingConfigs {
        create("release") {
            val keystoreFile = file("release.keystore")
            if (keystoreFile.exists()) {
                storeFile = keystoreFile
                storePassword = project.findProperty("RELEASE_KEYSTORE_PASSWORD") as? String ?: "android"
                keyAlias = project.findProperty("RELEASE_KEY_ALIAS") as? String ?: "androidreleasekey"
                keyPassword = project.findProperty("RELEASE_KEY_PASSWORD") as? String ?: "android"
            } else {
                val debugKeystore = file("${System.getProperty("user.home")}/.android/debug.keystore")
                if (debugKeystore.exists()) {
                    storeFile = debugKeystore
                    storePassword = "android"
                    keyAlias = "androiddebugkey"
                    keyPassword = "android"
                }
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            val releaseSigning = signingConfigs.getByName("release")
            if (releaseSigning.storeFile != null && releaseSigning.storeFile!!.exists()) {
                signingConfig = releaseSigning
            }
        }
        debug {
            applicationIdSuffix = ".debug"
            isDebuggable = true
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

val copyWebAssets = tasks.register<Copy>("copyWebAssets") {
    val projectRoot = rootProject.projectDir.parentFile
    into(file("src/main/assets"))

    from(projectRoot) {
        include("divinum-officium.html")
        include("*.js")
        include("css/**")
        include("js/**")
        include("fonts/**")
        include("icon/**")
        include("do_data/**")
        include("vulgate/**")
        include("aelf/**")
        include("douay-rheims/**")
        include("matos-soares/**")
        include("patterns/**")
        include("psalms/**")
        include("gabc/**")
        exclude("android/**")
        exclude(".git/**")
        exclude(".github/**")
        exclude("do_source/**")
        exclude("node_modules/**")
        exclude("temporary scripts/**")
    }
}

tasks.named("preBuild") {
    dependsOn(copyWebAssets)
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.activity:activity-ktx:1.9.1")
    implementation("androidx.webkit:webkit:1.11.0")
}
