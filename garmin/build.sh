#!/usr/bin/env bash
# Builds the Skoor watch app for one Garmin watch, ready to copy onto it over USB.
#   ./build.sh fr265            → build/skoor-fr265.prg
#   ./build.sh fr265 run        → also starts it in the Connect IQ simulator
# Needs the Connect IQ SDK (monkeyc on the PATH, or CIQ_SDK pointing at the SDK folder) and a
# developer key (DEV_KEY, default ~/.garmin/developer_key.der). See README.md.
set -euo pipefail
cd "$(dirname "$0")"

device="${1:?Which watch? For example: ./build.sh fr265 (the ids are in manifest.xml)}"
key="${DEV_KEY:-$HOME/.garmin/developer_key.der}"
bin="${CIQ_SDK:+$CIQ_SDK/bin/}"

if [ ! -f "$key" ]; then
  echo "No developer key at $key. Make one once with:"
  echo "  mkdir -p ~/.garmin && openssl genrsa -out /tmp/k.pem 4096 && openssl pkcs8 -topk8 -inform PEM -outform DER -in /tmp/k.pem -out $key -nocrypt && rm /tmp/k.pem"
  exit 1
fi

mkdir -p build
"${bin}monkeyc" -f monkey.jungle -d "$device" -y "$key" -o "build/skoor-$device.prg" -w -l 2
echo "Built build/skoor-$device.prg"

if [ "${2:-}" = run ]; then
  ("${bin}connectiq" &) && sleep 4
  "${bin}monkeydo" "build/skoor-$device.prg" "$device"
fi
