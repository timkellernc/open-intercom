#!/bin/bash
set -e

# Opus build script for iOS - Simplified approach
# Just build for simulator (x86_64 + arm64) since that's what we're testing on

OPUS_SRC="/tmp/opus-1.3.1"
OUTPUT_DIR="/Users/tim/Documents/Code/github.com/OpenIntercom/mobile/ios/opus-build"

# Clean previous builds
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# iOS SDK paths
XCODE_PATH=$(xcode-select -p)
SIM_SDK="$XCODE_PATH/Platforms/iPhoneSimulator.platform/Developer/SDKs/iPhoneSimulator.sdk"

echo "Building Opus for iOS Simulator..."

cd "$OPUS_SRC"
make distclean || true

# Configure for simulator with both architectures
CC="clang" \
CFLAGS="-O3 -arch x86_64 -arch arm64 -isysroot $SIM_SDK -mios-simulator-version-min=13.0" \
LDFLAGS="-arch x86_64 -arch arm64 -isysroot $SIM_SDK" \
./configure \
    --prefix="$OUTPUT_DIR" \
    --enable-static \
    --disable-shared \
    --disable-doc \
    --disable-extra-programs

make -j$(sysctl -n hw.ncpu)
make install

echo "✅ Build complete!"
echo "Library: $OUTPUT_DIR/lib/libopus.a"
echo "Headers: $OUTPUT_DIR/include/opus"
lipo -info "$OUTPUT_DIR/lib/libopus.a"
