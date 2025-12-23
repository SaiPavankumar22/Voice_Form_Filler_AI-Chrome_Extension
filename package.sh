#!/bin/bash

# Package script for Voice Form Filler Chrome Extension
# This script packages the extension for distribution

set -e

echo "🎤 Voice Form Filler Extension Packager"
echo "========================================"

# Check if we're in the right directory
if [ ! -f "extension/manifest.json" ]; then
    echo "❌ Error: manifest.json not found in extension directory"
    exit 1
fi

# Create output directory
mkdir -p dist

# Get version from manifest
VERSION=$(grep '"version"' extension/manifest.json | sed -E 's/.*"version": "([^"]+)".*/\1/')
echo "📦 Packaging version: $VERSION"

# Create zip file for Chrome Web Store
ZIP_NAME="voice-form-filler-v${VERSION}.zip"
echo "📁 Creating package: $ZIP_NAME"

# Clean previous builds
rm -f "dist/$ZIP_NAME"

# Create zip file
cd extension
zip -r "../dist/$ZIP_NAME" . -x "*.DS_Store" "*/.git/*" "*__pycache__*"
cd ..

# Create unpacked version for local testing
echo "📂 Creating unpacked version for local testing"
rm -rf "dist/voice-form-filler-v${VERSION}-unpacked"
cp -r extension "dist/voice-form-filler-v${VERSION}-unpacked"

# Create manifest for development (if needed)
if [ -f "extension/manifest.dev.json" ]; then
    cp extension/manifest.dev.json "dist/voice-form-filler-v${VERSION}-unpacked/manifest.json"
fi

# Generate checksums
echo "🔐 Generating checksums..."
cd dist
if command -v sha256sum &> /dev/null; then
    sha256sum "$ZIP_NAME" > "${ZIP_NAME}.sha256"
    echo "✅ SHA256 checksum saved to ${ZIP_NAME}.sha256"
elif command -v shasum &> /dev/null; then
    shasum -a 256 "$ZIP_NAME" > "${ZIP_NAME}.sha256"
    echo "✅ SHA256 checksum saved to ${ZIP_NAME}.sha256"
else
    echo "⚠️  Could not generate checksum (sha256sum/shasum not available)"
fi
cd ..

# Display package info
echo ""
echo "✅ Packaging complete!"
echo "======================"
echo "📦 Chrome Web Store: dist/$ZIP_NAME"
echo "📁 Local Testing:    dist/voice-form-filler-v${VERSION}-unpacked/"
echo "📊 File size:        $(ls -lh "dist/$ZIP_NAME" | awk '{print $5}')"

echo ""
echo "🔧 Next steps:"
echo "1. Upload $ZIP_NAME to Chrome Web Store"
echo "2. Or load unpacked version for local testing:"
echo "   Chrome → Extensions → Load unpacked → dist/voice-form-filler-v${VERSION}-unpacked/"

echo ""
echo "🚀 Ready to deploy!"