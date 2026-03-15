# import tkinter as tk
# from tkinter import ttk, messagebox
# import requests
# import hashlib
# from datetime import datetime
# import threading

# API_URL = "http://localhost:3000/api"
# class BlockGoApp(tk.Tk):
#     def __init__(self):
#         super().__init__()
#         self.title("BlockGO Registrar Portal")
#         self.geometry("1280x720")
        
#         self.current_user = None
#         self.user_role = None

#         self.container = tk.Frame(self)
#         self.container.pack(fill="both", expand=True)

#         self.show_login()

#     def clear_screen(self):
#         for widget in self.container.winfo_children():
#             widget.destroy()

#     def show_login(self):
#         self.clear_screen()
        
#         frame = tk.Frame(self.container)
#         frame.place(relx=0.5, rely=0.5, anchor="center")

#         tk.Label(frame, text="Registrar Login", font=("Arial", 20, "bold")).pack(pady=20)

#         tk.Label(frame, text="Username:").pack(anchor="w")
#         self.entry_user = tk.Entry(frame, width=30)
#         self.entry_user.pack(pady=5)

#         tk.Label(frame, text="Password:").pack(anchor="w")
#         self.entry_pass = tk.Entry(frame, width=30, show="*")
#         self.entry_pass.pack(pady=5)

#         tk.Button(frame, text="Login", command=self.do_login, bg="#dddddd", width=20).pack(pady=20)

#     def do_login(self):
#         user = self.entry_user.get().strip()
#         pwd = self.entry_pass.get().strip()

#         if user:
#             self.current_user = user
#             self.user_role = 'admin' if user.lower() == 'admin' else 'user'
#             self.show_dashboard()
#         else:
#             messagebox.showerror("Error", "Please enter a username.")
            
#     def show_dashboard(self):
#         self.clear_screen()

#         header = tk.Frame(self.container, height=50, bg="#333333")
#         header.pack(fill="x")
#         tk.Label(header, text="BlockGO", fg="white", bg="#333333", font=("Arial", 14)).pack(side="left", padx=20, pady=10)
#         tk.Button(header, text="Logout", command=self.show_login).pack(side="right", padx=20, pady=10)

#         toolbar = tk.Frame(self.container, pady=10)
#         toolbar.pack(fill="x", padx=20)

#         tk.Button(toolbar, text="Refresh Data", command=self.load_data).pack(side="left", padx=5)
        
#         if self.user_role == "admin":
#             tk.Button(toolbar, text="+ New Transaction", command=self.open_add_form, bg="#d0f0c0").pack(side="left", padx=5)

#         self.search_var = tk.StringVar()
#         tk.Entry(toolbar, textvariable=self.search_var, width=30).pack(side="right", padx=5)
#         tk.Button(toolbar, text="Search ID", command=self.search_record).pack(side="right")

        
#         columns = ("ID", "Student", "Type", "Status", "Date")
#         self.tree = ttk.Treeview(self.container, columns=columns, show="headings")
        
#         for col in columns:
#             self.tree.heading(col, text=col)
#             self.tree.column(col, width=150, anchor="center")
        
#         scrollbar = ttk.Scrollbar(self.container, orient="vertical", command=self.tree.yview)
#         self.tree.configure(yscroll=scrollbar.set)
#         scrollbar.pack(side="right", fill="y")
#         self.tree.pack(fill="both", expand=True, padx=20, pady=10)

#         self.load_data()

#     def load_data(self):
#         for item in self.tree.get_children():
#             self.tree.delete(item)

#         def _fetch():
#             try:
#                 response = requests.get(f"{API_URL}/query/GetAllAssets")
#                 if response.status_code == 200:
#                     data = response.json()
#                     for record in data:
#                         rid = record.get('id', record.get('request_id', 'N/A'))
#                         rhash = record.get('student_hash', 'N/A')
#                         rtype = record.get('type', record.get('doc_type', 'N/A'))
#                         rstatus = record.get('status', 'N/A')
#                         rdate = record.get('date', 'N/A')
                        
#                         self.after(0, lambda: self.tree.insert("", "end", values=(rid, rhash[:20]+"...", rtype, rstatus, rdate)))
#             except Exception as e:
#                 pass 

#         threading.Thread(target=_fetch, daemon=True).start()

#     def search_record(self):
#         term = self.search_var.get().strip()
#         if not term: return
        
#         for item in self.tree.get_children():
#             self.tree.delete(item)
            
#         try:
#             res = requests.get(f"{API_URL}/query/ReadAsset?args={term}")
#             if res.status_code == 200:
#                 rec = res.json()
#                 rid = rec.get('id', rec.get('request_id'))
#                 rhash = rec.get('student_hash')
#                 rtype = rec.get('type', rec.get('doc_type'))
#                 rstatus = rec.get('status')
#                 rdate = rec.get('date')
#                 self.tree.insert("", "end", values=(rid, rhash, rtype, rstatus, rdate))
#             else:
#                 messagebox.showinfo("Not Found", "No record found.")
#         except: pass

#     def open_add_form(self):
#         TransactionForm(self)
# class TransactionForm(tk.Toplevel):
#     def __init__(self, parent):
#         super().__init__(parent)
#         self.title("New Transaction")
#         self.geometry("450x500")
#         self.parent = parent

#         tk.Label(self, text="Create New Record", font=("Arial", 14, "bold")).pack(pady=15)

#         self.entries = {}
        
#         tk.Label(self, text="ID (Student/Request ID):").pack(anchor="w", padx=20)
#         self.entries["ID"] = tk.Entry(self, width=40)
#         self.entries["ID"].pack(padx=20, pady=5)

#         tk.Label(self, text="Name Will be Hashed:").pack(anchor="w", padx=20)
#         self.entries["Name"] = tk.Entry(self, width=40)
#         self.entries["Name"].pack(padx=20, pady=5)
        
#         tk.Label(self, text="Name will be hashed.", fg="blue", font=("Arial", 8)).pack(padx=20, anchor="w")

#         tk.Label(self, text=" Year-Course:").pack(anchor="w", padx=20)
#         self.entries["Details"] = tk.Entry(self, width=40)
#         self.entries["Details"].pack(padx=20, pady=5)

#         tk.Label(self, text="Amount Paid:").pack(anchor="w", padx=20)
#         self.entries["Amount"] = tk.Entry(self, width=40)
#         self.entries["Amount"].pack(padx=20, pady=5)

#         tk.Label(self, text="Transaction Type").pack(anchor="w", padx=20)
#         self.type_combo = ttk.Combobox(self, values=["Diploma Request", "COR Replacement", "Good Moral", "ID Replacement"], state="readonly")
#         self.type_combo.current(0)
#         self.type_combo.pack(padx=20, pady=5, fill="x")

#         tk.Button(self, text="Confirm", command=self.submit, bg="#4CAF50", fg="white", height=2).pack(fill="x", padx=20, pady=20)

#     def submit(self):
#         id_val = self.entries["ID"].get().strip()
#         name_val = self.entries["Name"].get().strip()
#         details_val = self.entries["Details"].get().strip()
#         amount_val = self.entries["Amount"].get().strip()
#         type_val = self.type_combo.get()

#         if not id_val or not name_val:
#             messagebox.showwarning("Missing Data", "ID and Name are required.")
#             return

#         current_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

#         student_hash = hashlib.sha256(name_val.encode()).hexdigest()

#         fake_ipfs = "QmHash" + id_val
        
#         try:
#             if type_val == "Diploma Request":
#                 fcn = "IssueDegree"
#                 args = [id_val, student_hash, "N/A", details_val, "2026", fake_ipfs, amount_val, "Diploma", current_date]
#             else:
#                 fcn = "IssueGeneralDocument"
#                 args = [id_val, student_hash, type_val, details_val, fake_ipfs, amount_val, current_date]

#             res = requests.post(f"{API_URL}/invoke", json={"fcn": fcn, "args": args})
            
#             if res.status_code == 200:
#                 messagebox.showinfo("Success", f"Transaction Mined!\nDate: {current_date}\nHash: {student_hash[:10]}...")
#                 self.parent.load_data()
#                 self.destroy()
#             else:
#                 messagebox.showerror("Blockchain Error", f"Smart Contract Rejected:\n{res.text}")
#         except Exception as e:
#             messagebox.showerror("Network Error", f"Middleware Unreachable:\n{e}")

# if __name__ == "__main__":
#     app = BlockGoApp()
#     app.mainloop()