#!/usr/bin/env bash
# Builds the Skoor watch app for one Garmin watch, ready to copy onto it over USB.
#   ./build.sh fenix6xpro       → build/skoor-fenix6xpro.prg
#   ./build.sh fenix6xpro run   → also starts it in the Connect IQ simulator
# Needs the Connect IQ SDK from the SDK Manager (found by itself; or set CIQ_SDK to its folder),
# the watch downloaded there, and a developer key (DEV_KEY, default ~/.garmin/developer_key.der).
# See README.md.
set -euo pipefail
cd "$(dirname "$0")"

device="${1:?Which watch? For example: ./build.sh fenix6xpro (the ids are in manifest.xml)}"
key="${DEV_KEY:-$HOME/.garmin/developer_key.der}"

# Where the SDK is: CIQ_SDK if set, else monkeyc on the PATH, else the SDK the SDK Manager marked
# as current (it writes its folder in current-sdk.cfg), else the newest one it downloaded.
find_sdk() {
  if [ -n "${CIQ_SDK:-}" ]; then echo "$CIQ_SDK"; return; fi
  if command -v monkeyc >/dev/null 2>&1; then dirname "$(dirname "$(command -v monkeyc)")"; return; fi
  local dir
  for dir in "$HOME/Library/Application Support/Garmin/ConnectIQ" "${APPDATA:-$HOME/AppData/Roaming}/Garmin/ConnectIQ" "$HOME/.Garmin/ConnectIQ"; do
    [ -d "$dir" ] || continue
    if [ -f "$dir/current-sdk.cfg" ]; then
      local current
      current="$(tr -d '\r\n' < "$dir/current-sdk.cfg")"
      current="${current%/}"
      if command -v cygpath >/dev/null 2>&1; then current="$(cygpath -u "$current")"; fi
      if [ -d "$current/bin" ]; then echo "$current"; return; fi
    fi
    local newest
    newest="$(ls -d "$dir"/Sdks/connectiq-sdk-* 2>/dev/null | sort | tail -1)"
    if [ -n "$newest" ]; then echo "$newest"; return; fi
  done
}
sdk="$(find_sdk)"
if [ -z "$sdk" ]; then
  echo "Can't find the Connect IQ SDK. Open the SDK Manager, download an SDK and click 'Use this SDK',"
  echo "or say where it is: CIQ_SDK=/path/to/connectiq-sdk-... ./build.sh $device"
  exit 1
fi
bin="$sdk/bin/"
# On Windows (Git Bash) the tools are .bat files.
if [ ! -e "${bin}monkeyc" ] && [ -e "${bin}monkeyc.bat" ]; then ext=.bat; else ext=; fi
echo "Using the SDK in $sdk"

# The watch itself must be downloaded in the SDK Manager (Devices), next to the SDKs.
for dir in "$HOME/Library/Application Support/Garmin/ConnectIQ" "${APPDATA:-$HOME/AppData/Roaming}/Garmin/ConnectIQ" "$HOME/.Garmin/ConnectIQ"; do
  if [ -d "$dir/Devices" ] && [ ! -d "$dir/Devices/$device" ]; then
    echo "The watch '$device' isn't downloaded yet: open the SDK Manager, go to Devices and download it"
    echo "(for the Fenix 6X: 'fenix 6X Pro / Sapphire / Solar'). Then run this again."
    exit 1
  fi
done

if [ ! -f "$key" ]; then
  echo "No developer key at $key. Make one once with:"
  echo "  mkdir -p ~/.garmin && openssl genrsa -out /tmp/k.pem 4096 && openssl pkcs8 -topk8 -inform PEM -outform DER -in /tmp/k.pem -out $key -nocrypt && rm /tmp/k.pem"
  exit 1
fi

mkdir -p build
# Built from a copy of the manifest with only this watch in it: the SDK warns about every watch in
# the list it doesn't have, and this build needs none of them.
grep -v '<iq:product ' manifest.xml | sed "s#<iq:products>#<iq:products>\\
            <iq:product id=\"$device\"/>#" > build/manifest.xml
{ echo 'project.manifest = manifest.xml'; echo 'base.sourcePath = ../source'; echo 'base.resourcePath = ../resources'
  # The Fenix 6 series shows 40×40 app icons (the others 60–70, scaled from the default).
  case "$device" in fenix6*) echo "$device.resourcePath = \$(base.resourcePath);../resources-icon40" ;; esac
} > build/monkey.jungle
"${bin}monkeyc$ext" -f build/monkey.jungle -d "$device" -y "$key" -o "build/skoor-$device.prg" -w -l 2
echo "Built build/skoor-$device.prg"

if [ "${2:-}" = run ]; then
  ("${bin}connectiq$ext" &) && sleep 4
  "${bin}monkeydo$ext" "build/skoor-$device.prg" "$device"
fi
