#!/usr/bin/env bash
# AOC Control Studio — build para Linux (equivalente ao build.ps1)
#
#   ./build.sh                # binário portátil + .deb + .AppImage + .rpm
#   ./build.sh portable       # apenas o binário release (./AOC-Control-Studio)
#   ./build.sh deb|appimage|rpm
set -euo pipefail

TYPE="${1:-all}"
cd "$(dirname "${BASH_SOURCE[0]}")"
ROOT_DIR="$(pwd)"
DIST_DIR="$ROOT_DIR/Distribuicao"
# Target fora do projeto: evita problemas de ferramentas (linuxdeploy) com espaços no caminho
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/aoc_target}"

mkdir -p "$DIST_DIR"

echo ">>> [1/3] Instalando dependências e compilando o frontend..."
pnpm install --frozen-lockfile || pnpm install
pnpm build

build_portable() {
    echo ">>> [2/3] Compilando binário portátil..."
    cargo build --release --manifest-path src-tauri/Cargo.toml --bin app
    install -m755 "$CARGO_TARGET_DIR/release/app" "$ROOT_DIR/AOC-Control-Studio"
    tar -C "$ROOT_DIR" -czf "$DIST_DIR/AOC-Control-Studio-Linux-x86_64.tar.gz" AOC-Control-Studio
    echo " [OK] Binário: ./AOC-Control-Studio  |  Pacote: $DIST_DIR/AOC-Control-Studio-Linux-x86_64.tar.gz"
}

bundle() {
    local kind="$1" pattern="$2"
    echo ">>> [3/3] Gerando pacote $kind..."
    pnpm tauri build --bundles "$kind"
    find "$CARGO_TARGET_DIR/release/bundle/$kind" -maxdepth 1 -name "$pattern" -exec cp -f {} "$DIST_DIR/" \;
    echo " [OK] Pacote $kind copiado para $DIST_DIR"
}

case "$TYPE" in
    portable) build_portable ;;
    deb)      bundle deb '*.deb' ;;
    appimage) bundle appimage '*.AppImage' ;;
    rpm)      bundle rpm '*.rpm' ;;
    all)
        build_portable
        bundle deb '*.deb'
        bundle appimage '*.AppImage'
        bundle rpm '*.rpm'
        ;;
    *) echo "Tipo inválido: $TYPE (use portable|deb|appimage|rpm|all)" >&2; exit 1 ;;
esac

echo ">>> Pacotes gerados em ./Distribuicao"
