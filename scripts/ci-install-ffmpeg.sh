#!/usr/bin/env bash
set -euo pipefail
# Ubuntu CI only. Source is pinned; system codec development packages come from Ubuntu 24.04.
test "$(uname -s)" = Linux
afx_evidence_dir="$PWD/artifacts/ci-environment"
afx_build_dir=$(mktemp -d)
trap 'rm -rf "$afx_build_dir"' EXIT
sudo apt-get update
sudo apt-get install -y build-essential pkg-config nasm libvpx-dev libopus-dev libx264-dev zlib1g-dev
curl --fail --location --retry 3 https://ffmpeg.org/releases/ffmpeg-8.0.1.tar.xz -o "$afx_build_dir/ffmpeg.tar.xz"
printf '%s  %s\n' '05ee0b03119b45c0bdb4df654b96802e909e0a752f72e4fe3794f487229e5a41' "$afx_build_dir/ffmpeg.tar.xz" | sha256sum --check --strict
tar -xJf "$afx_build_dir/ffmpeg.tar.xz" -C "$afx_build_dir"
cd "$afx_build_dir/ffmpeg-8.0.1"
./configure --prefix="$afx_build_dir/install" --disable-autodetect --disable-doc --disable-ffplay --enable-gpl --enable-libx264 --enable-libvpx --enable-libopus --enable-zlib
make -j2
make install
sudo install -m755 "$afx_build_dir/install/bin/ffmpeg" /usr/local/bin/ffmpeg
sudo install -m755 "$afx_build_dir/install/bin/ffprobe" /usr/local/bin/ffprobe
ffmpeg -version
# This GPL-enabled executable is provisioned only in the disposable CI runner.
# Never copy it or its linked libraries into package dist/ or uploaded artifacts.
mkdir -p "$afx_evidence_dir"
ffmpeg -version > "$afx_evidence_dir"/ffmpeg-version.txt
ffmpeg -buildconf > "$afx_evidence_dir"/ffmpeg-buildconf.txt 2>&1
ffmpeg -hide_banner -encoders > "$afx_evidence_dir"/encoders.txt
for encoder in libvpx-vp9 libopus libx264 aac; do
  awk -v encoder="$encoder" '$2==encoder{found=1} END{exit !found}' "$afx_evidence_dir"/encoders.txt
done
dpkg-query -W libvpx-dev libopus-dev libx264-dev > "$afx_evidence_dir"/codec-packages.txt
lscpu > "$afx_evidence_dir"/cpu.txt
free -b > "$afx_evidence_dir"/memory.txt
# Prove H.264/AAC can encode together before the MP4 tests, not just list names.
ffmpeg -hide_banner -loglevel error -f lavfi -i color=c=black:s=16x16:r=24:d=0.125 -f lavfi -i anullsrc=r=48000:cl=stereo -frames:v 3 -t 0.125 -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -c:a aac -b:a 128k -f mp4 "$afx_build_dir/mp4-probe.mp4"
ffprobe -v error -show_streams -of json "$afx_build_dir/mp4-probe.mp4" > "$afx_evidence_dir"/mp4-probe.json
