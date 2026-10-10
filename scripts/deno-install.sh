#!/usr/bin/env bash
set -euo pipefail
destination="${1:-/tmp/velora-deno}"
mkdir -p "$destination"
curl --fail --silent --show-error --location https://github.com/denoland/deno/releases/download/v2.5.5/deno-x86_64-unknown-linux-gnu.zip -o "$destination/deno.zip"
printf '%s  %s\n' '01f30a993f2ce7b7356a358160c3790be93ffaab5a177785e01b8ac483bfd45b' "$destination/deno.zip" | sha256sum --check
unzip -q -o "$destination/deno.zip" -d "$destination"
"$destination/deno" --version
