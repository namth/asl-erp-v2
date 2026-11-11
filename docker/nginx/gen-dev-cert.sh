#!/usr/bin/env bash
set -euo pipefail

CERT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/certs"
mkdir -p "${CERT_DIR}"

if [[ -f "${CERT_DIR}/server.key" && -f "${CERT_DIR}/server.crt" ]]; then
    echo "Chứng chỉ SSL dev đã tồn tại tại ${CERT_DIR}"
    exit 0
fi

echo "Tạo chứng chỉ SSL tự ký cho dev..."
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "${CERT_DIR}/server.key" \
    -out "${CERT_DIR}/server.crt" \
    -subj "/C=VN/ST=Hanoi/L=Hanoi/O=ASL LAW/OU=IT/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,DNS:erp.asllaw.vn,IP:127.0.0.1"

chmod 600 "${CERT_DIR}/server.key"
chmod 644 "${CERT_DIR}/server.crt"
echo "Đã tạo chứng chỉ SSL dev thành công tại ${CERT_DIR}"
