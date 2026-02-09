import ipfshttpclient
import json

def upload_to_ipfs(student_data):
    try:
        client = ipfshttpclient.connect('/ip4/127.0.0.1/tcp/5001')
        
        json_data = json.dumps(student_data)
        
        res = client.add_str(json_data)
        
        return res
    except Exception as e:
        print(f"IPFS FAILURE: {e}")
        return None

full_record = {
    "section": "BSIT 3-7",
    "course": "Information Technology",
    "year": "2026",
    "address": "Valenzuela City, Philippines",
    "amount": "1500.00",
    "type": "Tuition Fee",
    "date": "2026-02-05"
}

ipfs_cid = upload_to_ipfs(full_record)
print(f"OFF-CHAIN RECEIPT: {ipfs_cid}")