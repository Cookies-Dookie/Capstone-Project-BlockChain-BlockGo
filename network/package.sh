#!/bin/bash

mkdir -p /tmp/ccaas-build
cd /tmp/ccaas-build

cat <<EOF > connection.json
{
    "address": "registrar-chaincode:9999",
    "dial_timeout": "10s",
    "tls_required": false,
    "client_auth_required": false,
    "client_auth_type": "NoClientCert"
}
EOF

tar -czf code.tar.gz connection.json

cat <<EOF > metadata.json
{
    "type": "ccaas",
    "label": "registrar-chaincode_1.0"
}
EOF

tar -czf /opt/fabric-config/network/registrar-ccaas-final.tar.gz metadata.json code.tar.gz

echo "[SUCCESS] Created perfectly formatted Fabric CCaaS package!"