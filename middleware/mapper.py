import pandas as pd
import hashlib
import json
import requests
import ipfshttpclient 

class DegreeMapper:
    # Default to localhost for running on host machine. Use /dns/ipfs0... if running inside docker network
    def __init__(self, ipfs_api_url='/ip4/127.0.0.1/tcp/5001/http'):
        self.ipfs_url = ipfs_api_url
        self.university = "PLV"

    def hash_student_id(self, student_id):
        return hashlib.sha256(student_id.encode()).hexdigest()

    def upload_to_ipfs(self, file_path):
        """Uploads the Grade Evidence PDF to Registrar"""
        try:
            with ipfshttpclient.connect(self.ipfs_url) as client:
                res = client.add(file_path)
                return res['Hash'] 
        except Exception as e:
            print(f"IPFS Upload Error: {e}")
            return "UPLOAD_FAILED"

    def process_excel(self, excel_path, pdf_evidence_path):
        df = pd.read_excel(excel_path)
        
        section_cid = self.upload_to_ipfs(pdf_evidence_path)
        
        batch_records = []

        for index, row in df.iterrows():
            record_id = f"{row['course']}-{row['section']}-{row['student_id']}"
            
            degree_record = {
                "id": record_id,
                "student_hash": self.hash_student_id(str(row['student_id'])),
                "section": row['section'],
                "course": row['course'],
                "subject_code": row['subject_code'],
                "grade": str(row['grade']),
                "semester": row['semester'],
                "school_year": str(row['school_year']),
                "ipfs_cid": section_cid,
                "university": self.university,
                "date": row['date'],
                "status": "Verified"
            }
            batch_records.append(degree_record)

        return batch_records

mapper = DegreeMapper()
processed_data = mapper.process_excel("", "")
print(json.dumps(processed_data, indent=2))