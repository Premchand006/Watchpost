#!/usr/bin/env bash
# Set up Watchpost on a Raspberry Pi 5 (Raspberry Pi OS Bookworm, 64-bit).
# Run from anywhere as the user the service should run as:  bash edge/deploy/install.sh
set -euo pipefail

EDGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_USER="${SUDO_USER:-$USER}"
cd "$EDGE_DIR"

echo "edge dir: $EDGE_DIR, user: $RUN_USER"

# picamera2 only ships as an apt package, so the venv needs system site-packages to see it.
sudo apt-get update
sudo apt-get install -y python3-venv python3-picamera2 v4l-utils

if [ ! -d .venv ]; then
    python3 -m venv --system-site-packages .venv
fi
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt

if [ ! -f .env ]; then
    cp .env.example .env
    chmod 600 .env
    echo "created edge/.env from the example, fill in SUPABASE_URL and SUPABASE_SERVICE_KEY"
fi

# NCNN export. On a Pi 4 this can die with "Illegal instruction (core dumped)" because
# of the 16K vs 4K kernel page size. The Pi 5 is fine. If it fails, export on a laptop
# or in the ultralytics/ultralytics:latest-arm64 Docker image and copy the folder here.
if [ ! -d yolo26n_ncnn_model ]; then
    echo "kernel page size: $(getconf PAGESIZE)"
    .venv/bin/yolo export model=yolo26n.pt format=ncnn imgsz=640 \
        || echo "NCNN export failed, see the note in this script; continuing without a model"
fi

sed -e "s#@USER@#${RUN_USER}#g" -e "s#@EDGE_DIR@#${EDGE_DIR}#g" \
    deploy/watchpost.service | sudo tee /etc/systemd/system/watchpost.service >/dev/null
sudo usermod -aG video "$RUN_USER"
sudo systemctl daemon-reload
sudo systemctl enable watchpost.service

echo "installed. Try a dry run first:  .venv/bin/python -m watchpost --dry-run"
echo "then: sudo systemctl start watchpost && journalctl -u watchpost -f"
