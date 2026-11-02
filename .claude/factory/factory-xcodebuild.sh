#!/bin/bash
# xcodebuild for the factory's sandbox (apple toolchain opt-in: node "toolchain": "apple" or the
# base factory.json "appleToolchain": true). Takes -project/-scheme/-destination and the action
# (build, test, ...) as arguments and keeps every output in $TMPDIR, the per-run tmp dir.
#   .claude/factory/factory-xcodebuild.sh -project X.xcodeproj -scheme S -destination 'generic/platform=iOS Simulator' build
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: factory-xcodebuild.sh -project <p> -scheme <s> -destination <d> <action>" >&2
  exit 64
fi
if [ -z "${TMPDIR:-}" ] || [ ! -d "$TMPDIR" ]; then
  echo "factory-xcodebuild.sh: TMPDIR must be the run's tmp dir" >&2
  exit 64
fi
for a in "$@"; do
  case "$a" in
    -derivedDataPath|-clonedSourcePackagesDirPath|-resultBundlePath|-packageCachePath)
      echo "factory-xcodebuild.sh sets $a itself (under \$TMPDIR); do not pass it" >&2
      exit 64 ;;
  esac
done

T="${TMPDIR%/}"
# A worker cannot redirect HOME itself, so the wrapper does, as the runner does for its own commands.
mkdir -p "$T/home/Library/Preferences"
export HOME="$T/home" CFFIXED_USER_HOME="$T/home"
rm -rf "$T/r.xcresult"
exec xcodebuild "$@" \
  -derivedDataPath "$T/DD" \
  -clonedSourcePackagesDirPath "$T/SP" \
  -resultBundlePath "$T/r.xcresult" \
  -packageCachePath "$T/pkgcache" \
  -IDEPackageSupportDisableManifestSandbox=YES \
  OTHER_SWIFT_FLAGS='$(inherited) -disable-sandbox' \
  CODE_SIGNING_ALLOWED=NO
