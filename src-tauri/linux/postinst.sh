#!/bin/sh
# Pós-instalação (.deb / .rpm): ativa o i2c-dev e reaplica as regras udev
modprobe i2c-dev 2>/dev/null || true
if command -v udevadm >/dev/null 2>&1; then
    udevadm control --reload-rules 2>/dev/null || true
    udevadm trigger --subsystem-match=i2c-dev --action=change 2>/dev/null || true
fi
exit 0
