# import customtkinter as ctk
# import hashlib
# import requests
# import json

# # 1. Security Logic: Hash the PII
# def secure_submit():
#     name = entry_name.get()
#     degree_id = entry_id.get()
    
#     # Create SHA-256 Hash
#     name_hash = hashlib.sha256(name.encode()).hexdigest()
#     print(f"Securing Data: {name} -> {name_hash}")

#     # 2. Send ONLY the Hash to the Middleware
#     payload = {
#         "degree_id": degree_id,
#         "student_hash": name_hash
#     }
    
#     try:
#         response = requests.post("http://localhost:3000/api/issue", json=payload)
#         if response.status_code == 200:
#             lbl_status.configure(text="Success: Data on Blockchain!", text_color="green")
#         else:
#             lbl_status.configure(text="Blockchain Error", text_color="red")
#     except:
#         lbl_status.configure(text="Middleware Offline", text_color="red")

# # UI Setup
# app = ctk.CTk()
# app.geometry("400x300")
# app.title("PLV Registrar Secure Client")

# entry_id = ctk.CTkEntry(app, placeholder_text="Degree ID (DEG-001)")
# entry_id.pack(pady=10)

# entry_name = ctk.CTkEntry(app, placeholder_text="Student Name (Sensitive)")
# entry_name.pack(pady=10)

# btn_submit = ctk.CTkButton(app, text="Issue Degree", command=secure_submit)
# btn_submit.pack(pady=20)

# lbl_status = ctk.CTkLabel(app, text="Ready")
# lbl_status.pack()

# app.mainloop()