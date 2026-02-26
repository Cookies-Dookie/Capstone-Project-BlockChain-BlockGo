#!/usr/bin/env python3
import json
import tarfile
import os

os.chdir('/tmp')

# Create metadata.json
metadata = {"type": "ccaas", "label": "registrar-chaincode_1.0"}
with open('metadata.json', 'w') as f:
    json.dump(metadata, f)

# Create connection.json
connection = {
    "address": "registrar-chaincode:9999",
    "dial_timeout": "10s",
    "tls_required": False
}
with open('connection.json', 'w') as f:
    json.dump(connection, f)

# Create code.tar.gz with connection.json inside
with tarfile.open('code.tar.gz', 'w:gz') as tar:
    tar.add('connection.json', arcname='connection.json')

# Create final package: metadata.json + code.tar.gz
with tarfile.open('registrar-chaincode.tar.gz', 'w:gz') as tar:
    tar.add('metadata.json', arcname='metadata.json')
    tar.add('code.tar.gz', arcname='code.tar.gz')

# Verify
print("=== Package structure ===")
with tarfile.open('registrar-chaincode.tar.gz', 'r:gz') as tar:
    for member in tar.getmembers():
        print(f"  {member.name} ({member.size} bytes)")

print(f"\nFinal package: {os.path.getsize('registrar-chaincode.tar.gz')} bytes")
print("✓ Package created successfully")
