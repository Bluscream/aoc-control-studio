#!/usr/bin/env bash
# AOC Control Studio — preparação do Linux
#
#   sudo ./scripts/setup-linux.sh            # dependências de build + acesso I2C
#   sudo ./scripts/setup-linux.sh --no-deps  # apenas acesso I2C (para quem só vai usar o app)
#
# Testado em Pop!_OS / Ubuntu 24.04 (apt). Em Fedora/Arch instale os pacotes
# equivalentes manualmente (ver README) e use --no-deps.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_DEPS=1
for arg in "$@"; do
    case "$arg" in
        --no-deps) INSTALL_DEPS=0 ;;
        -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
        *) echo "Opção desconhecida: $arg" >&2; exit 1 ;;
    esac
done

if [[ $EUID -ne 0 ]]; then
    exec sudo -- "$0" "$@"
fi

if [[ $INSTALL_DEPS -eq 1 ]]; then
    if command -v apt-get >/dev/null 2>&1; then
        echo ">>> [1/3] Instalando dependências do Tauri (WebKitGTK, GTK, AppIndicator)..."
        apt-get update
        apt-get install -y \
            build-essential curl wget file pkg-config \
            libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev \
            libayatana-appindicator3-dev librsvg2-dev libxdo-dev libssl-dev
    else
        echo "!!! apt-get não encontrado — instale as dependências do Tauri v2 manualmente." >&2
    fi
else
    echo ">>> [1/3] Pulando dependências de build (--no-deps)"
fi

echo ">>> [2/3] Ativando o módulo i2c-dev (agora e no boot)..."
modprobe i2c-dev
install -Dm644 "$ROOT_DIR/src-tauri/linux/i2c-dev.conf" /etc/modules-load.d/aoc-control-studio-i2c.conf

echo ">>> [3/3] Instalando regra udev de acesso ao DDC/CI..."
install -Dm644 "$ROOT_DIR/src-tauri/linux/60-aoc-control-studio-i2c.rules" \
    /etc/udev/rules.d/60-aoc-control-studio-i2c.rules
udevadm control --reload-rules
udevadm trigger --subsystem-match=i2c-dev --action=change
udevadm settle || true

echo
echo "Barramentos I2C da placa de vídeo:"
for d in /sys/class/drm/card*-*; do
    [[ -f "$d/status" ]] || continue
    bus=$(ls "$d" 2>/dev/null | grep -m1 '^i2c-' || true)
    [[ -z "$bus" && -L "$d/ddc" ]] && bus=$(basename "$(readlink "$d/ddc")")
    printf "  %-22s %-13s %s\n" "$(basename "$d")" "$(cat "$d/status")" "${bus:+/dev/$bus}"
done
echo
echo "[OK] Pronto! O usuário da sessão gráfica já pode controlar o monitor sem sudo."
echo "     Se o app ainda mostrar 'DDC Offline', faça logout/login uma vez."
