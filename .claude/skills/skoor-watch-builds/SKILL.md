---
name: skoor-watch-builds
description: Build and check Skoor's watch apps in a cloud container - Garmin Connect IQ (garmin/, compile check with a stand-in device) and Wear OS (wearos/, Android SDK, Gradle, Robolectric screenshots). Use before changing or reporting on either watch app.
---

# Watch builds

Both apps talk to the same server (`functions/watch.js`); keep their behaviour the same: linking
with QR + key, LIVE/OFFLINE, Not counted (orange), Scoring paused (grey), interval/ends (green),
game won and match won as their own screens, the pace-based checks (`Pace.kt` =
`ScoreView.mc` pollMs = `functions/pace.js` for the list).

Tools go in the session scratchpad (`<scratchpad>/ciq`, `<scratchpad>/android`), never in the repo.

## Garmin (garmin/)

The SDK downloads without a Garmin login; **device files need a login, which we never use**. So
compile against a stand-in device.

1. SDK (once per container):
   `curl -sSL -o sdk.zip https://developer.garmin.com/downloads/connect-iq/sdks/connectiq-sdk-lin-9.2.0-2026-06-09-92a1605b2.zip`
   (newer versions: see `https://developer.garmin.com/downloads/connect-iq/sdks/sdks.json`), unzip to
   `<scratchpad>/ciq/sdk`.
2. Developer key (throwaway, scratchpad only):
   `openssl genrsa -out key.pem 4096 && openssl pkcs8 -topk8 -inform PEM -outform DER -in key.pem -out developer_key.der -nocrypt`
3. Stand-in device `~/.Garmin/ConnectIQ/Devices/skoortest/compiler.json`:
   ```json
   {"deviceId":"skoortest","displayName":"Skoor test (round 260)","deviceFamily":"round-260x260","deviceVersion":"1",
    "resolution":{"width":260,"height":260},"bitsPerPixel":16,"pixelFormat":"DEFAULT","outputColorSpace":"DEFAULT",
    "launcherIcon":{"width":60,"height":60},"imageFormats":["png"],
    "appTypes":[{"type":"watchApp","memoryLimit":786432,"prgLimit":1048576}],
    "partNumbers":[{"number":"006-B0000-00","connectIQVersion":"5.0.0","firmwareVersion":1000,"languages":[{"code":"eng","fontSet":"ww"}]}],
    "worldWidePartNumber":"006-B0000-00","codePageSize":4096,"orientation":"GFX_ORNTN_0"}
   ```
   The owner's watch is a Fenix 6X (`fenix6xpro`: 280×280, 64-colour MIP screen, buttons only,
   40×40 icon); the stand-in only proves the code compiles, not how it looks there.
4. Compile check with a temporary manifest that adds the stand-in (don't commit it):
   ```bash
   sed 's#<iq:product id="fr165"/>#<iq:product id="skoortest"/>\n            <iq:product id="fr165"/>#' garmin/manifest.xml > <scratchpad>/ciq/check-manifest.xml
   printf 'project.manifest = <scratchpad>/ciq/check-manifest.xml\nbase.sourcePath = %s/garmin/source\nbase.resourcePath = %s/garmin/resources\n' "$PWD" "$PWD" > <scratchpad>/ciq/check.jungle
   <scratchpad>/ciq/sdk/bin/monkeyc -f <scratchpad>/ciq/check.jungle -o <scratchpad>/ciq/skoor.prg -y <scratchpad>/ciq/developer_key.der -d skoortest -w -l 2
   ```
   Must end in `BUILD SUCCESSFUL` with no warnings (`-l 2`; `-l 3` complaints about missing type
   annotations are tolerated). The owner builds for his watch with `garmin/build.sh fenix6xpro`.

Monkey C pitfalls seen: `Look.text` takes Numeric; no `String.split` (use `find`/`substring`);
module `var`s need `as Number`; colours on MIP watches are swapped in `Look.setup()`.

## Wear OS (wearos/)

1. Android SDK (once per container), command-line tools from
   `https://dl.google.com/android/repository/repository2-3.xml` (latest
   `commandlinetools-linux-*_latest.zip`), unzip to `<scratchpad>/android/sdk/cmdline-tools/latest`, then
   `yes | sdkmanager --sdk_root=<scratchpad>/android/sdk "platforms;android-36" "build-tools;36.0.0" "platform-tools"`.
2. `wearos/local.properties`: `sdk.dir=<scratchpad>/android/sdk` (git-ignored, never commit).
3. Maven Central rate-limits this container (HTTP 429). Use Google's mirror via an init script
   (container only, not the repo), `~/.gradle/init.d/local-maven.gradle`:
   ```groovy
   beforeSettings { s ->
     s.dependencyResolutionManagement.repositories.mavenLocal()
     s.dependencyResolutionManagement.repositories.maven { url = 'https://maven-central.storage-download.googleapis.com/maven2/' }
   }
   ```
   Big jars that still fail (Robolectric's `android-all-instrumented`, `nativeruntime-dist-compat`)
   can be fetched with curl from that mirror into `~/.m2/repository/<group path>/<artifact>/<version>/`.
4. Build and test: `cd wearos && ./gradlew --no-daemon --max-workers=1 assembleDebug testDebugUnitTest`
   (output to a file; read the tail). The screenshots land in `app/build/screens/*.png`: look at
   them. No emulator (no KVM here); say the app wasn't run on a real watch.
5. Only JDK 21 is installed: don't set `jvmToolchain(17)`; the build targets Java 17 bytecode.
