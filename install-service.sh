#!/bin/bash
set -e

SERVICE_NAME="transient-musicserver"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_FILE="$HOME/.config/systemd/user/${SERVICE_NAME}.service"

uninstall() {
    echo "Stopping and disabling $SERVICE_NAME..."
    systemctl --user stop "$SERVICE_NAME.service" 2>/dev/null || true
    systemctl --user disable "$SERVICE_NAME.service" 2>/dev/null || true
    rm -f "$SERVICE_FILE"
    systemctl --user daemon-reload
    echo "Service uninstalled."
    exit 0
}

if [[ "$1" == "--uninstall" ]]; then
    uninstall
fi

mkdir -p "$(dirname "$SERVICE_FILE")"

cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Transient Music Server
After=network.target

[Service]
Type=simple
WorkingDirectory=$SCRIPT_DIR
ExecStart=$(command -v bun) start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF

echo "Created service file: $SERVICE_FILE"
systemctl --user daemon-reload
systemctl --user enable "$SERVICE_NAME.service"
systemctl --user start "$SERVICE_NAME.service"

echo "Service installed and started."
echo "Check status: systemctl --user status $SERVICE_NAME"
echo "View logs:    journalctl --user -u $SERVICE_NAME -f"
