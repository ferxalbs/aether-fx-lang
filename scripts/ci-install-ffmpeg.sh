#!/usr/bin/env bash
set -euo pipefail
# Ubuntu CI only. Source is pinned; system codec development packages come from Ubuntu 24.04.
test "$(uname -s)" = Linux
afx_build_dir=$(mktemp -d)
trap 'rm -rf "$afx_build_dir"' EXIT
sudo apt-get update
sudo apt-get install -y build-essential pkg-config nasm libvpx-dev libopus-dev zlib1g-dev
curl --fail --location --retry 3 https://ffmpeg.org/releases/ffmpeg-8.0.1.tar.xz -o "$afx_build_dir/ffmpeg.tar.xz"
printf '%s  %s\n' '05ee0b03119b45c0bdb4df654b96802e909e0a752f72e4fe3794f487229e5a41' "$afx_build_dir/ffmpeg.tar.xz" | sha256sum --check --strict
tar -xJf "$afx_build_dir/ffmpeg.tar.xz" -C "$afx_build_dir"
cd "$afx_build_dir/ffmpeg-8.0.1"
./configure --prefix="$afx_build_dir/install" --disable-autodetect --disable-doc --disable-ffplay --enable-libvpx --enable-libopus --enable-zlib
make -j2
make install
sudo install -m755 "$afx_build_dir/install/bin/ffmpeg" /usr/local/bin/ffmpeg
sudo install -m755 "$afx_build_dir/install/bin/ffprobe" /usr/local/bin/ffprobe
ffmpeg -version
ffmpeg -hide_banner -encoders | awk '/libvpx-vp9|libopus/{print; found++} END{exit found==2?0:1}'
