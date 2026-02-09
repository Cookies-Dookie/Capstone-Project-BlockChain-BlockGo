import tkinter as tk
from tkinter import ttk, messagebox
import requests
import openpyxl
from datetime import datetime

# Configuration matching your Node.js/Go Middleware
API_URL = "http://localhost:3000/api"

class App:
    def __init__(self, master):
        self.master = master
        self.master.title("BlockGO - Secure Registrar Ledger")
        self.master.geometry("1350x720")
        self.role = None
        self.user = None
        self.search_var = tk.StringVar()
        self.create_login_ui()

    def clear_ui(self):
        for w in self.master.winfo_children(): w.destroy()

    def create_login_ui(self):
        self.clear_ui()
        f = ttk.Frame(self.master, padding=30)
        f.pack(expand=True)
        ttk.Label(f, text="Username", font=('Arial', 10, 'bold')).grid(row=0, column=0, pady=6)
        self.e_user = ttk.Entry(f, width=30)
        self.e_user.grid(row=0, column=1, pady=6)
        ttk.Label(f, text="Password", font=('Arial', 10, 'bold')).grid(row=1, column=0, pady=6)
        self.e_pass = ttk.Entry(f, width=30, show='*')
        self.e_pass.grid(row=1, column=1, pady=6)
        ttk.Button(f, text="Login", command=self.login).grid(row=2, column=0, columnspan=2, pady=15)

    def login(self):
        u = self.e_user.get().strip()
        if u:
            self.user = u
            self.role = 'admin' if u.lower() == 'admin' else 'user'
            self.create_dashboard()

    def create_dashboard(self):
        self.clear_ui()
        top = ttk.Frame(self.master)
        top.pack(fill='x', padx=12, pady=6)
        
        ttk.Label(top, text="Search ID:").pack(side='left')
        ttk.Entry(top, textvariable=self.search_var).pack(side='left', padx=4)
        ttk.Button(top, text="Search", command=self.do_search).pack(side='left', padx=2)
        ttk.Button(top, text="Refresh", command=self.load_all).pack(side='left', padx=2)
        
        if self.role == 'admin':
            ttk.Button(top, text="Add Record", command=self.add_dialog).pack(side='right', padx=5)

        cols = ("ID", "Name", "Section", "Course", "Year", "Amount", "Type", "University", "Date")
        self.tree = ttk.Treeview(self.master, columns=cols, show='headings')
        for c in cols:
            self.tree.heading(c, text=c)
            self.tree.column(c, width=130, anchor='center')
        self.tree.pack(fill='both', expand=True, padx=12, pady=6)
        self.load_all()

    def load_all(self):
        try:
            res = requests.get(f"{API_URL}/query/GetAllAssets")
            if res.status_code == 200: self._populate_tree(res.json())
        except: pass

    def do_search(self):
        term = self.search_var.get().strip()
        if not term: return
        try:
            res = requests.get(f"{API_URL}/query/ReadDegree?args={term}")
            if res.status_code == 200: self._populate_tree([res.json()])
        except: pass

    def _populate_tree(self, data):
        self.tree.delete(*self.tree.get_children())
        if not isinstance(data, list): return
        for rec in data:
            self.tree.insert('', 'end', values=(
                rec.get('id', ''), rec.get('student_name', ''), rec.get('section', ''),
                rec.get('course', ''), rec.get('year', ''), rec.get('amount', ''),
                rec.get('type', ''), rec.get('university', ''), rec.get('date', '')
            ))

    def add_dialog(self):
        dlg = AddTransactionDialog(self.master)
        self.master.wait_window(dlg)
        if dlg.result: self.load_all()

class AddTransactionDialog(tk.Toplevel):
    def __init__(self, parent):
        super().__init__(parent)
        self.title("Issue New Record")
        self.geometry("500x650")
        self.result = False
        
        self.fields = ["ID", "Name", "Section", "Course", "Year", "Address", "Amount", "Type"]
        self.entries = {}
        self.transaction_list = [
            "ID Replacement",
            "Diploma Request",
            "Transcript of Records (TOR)",
            "Certificate of Registration",
            "Graduation Fee",
            "Other Support Services"
        ]

        for i, f in enumerate(self.fields):
            lbl = ttk.Label(self, text=f"{f}:", font=('Arial', 10))
            lbl.grid(row=i, column=0, sticky='e', padx=15, pady=10)
            
            if f == "Type":
                self.entries[f] = ttk.Combobox(self, values=self.transaction_list, width=35, state="readonly")
                self.entries[f].set("Tuition Fee Payment")
                self.entries[f].grid(row=i, column=1, padx=15, pady=10)
                
                help_lbl = ttk.Label(self, text="ℹ️ Select valid transaction type", font=('Arial', 8, 'italic'), foreground="gray")
                help_lbl.grid(row=i+1, column=1, sticky='w', padx=15)
            else:
                e = ttk.Entry(self, width=38)
                e.grid(row=i, column=1, padx=15, pady=10)
                self.entries[f] = e

        ttk.Button(self, text="Commit to Blockchain", command=self.save).grid(row=len(self.fields)+1, column=1, pady=30)

    def save(self):
        data_args = []
        for f in self.fields:
            val = self.entries[f].get().strip()
            if not val:
                messagebox.showwarning("Validation Error", f"{f} cannot be empty.")
                return
            data_args.append(val)
        
        data_args.append(datetime.now().strftime("%Y-%m-%d"))

        try:
            res = requests.post(f"{API_URL}/invoke", json={"fcn": "IssueDegree", "args": data_args})
            if res.status_code == 200:
                messagebox.showinfo("Success", "Transaction successfully committed to the blockchain!")
                self.result = True
                self.destroy()
            else:
                messagebox.showerror("Blockchain Error", f"Failed to commit: {res.text}")
        except Exception as e: 
            messagebox.showerror("Connection Error", f"Middleware unreachable: {e}")

if __name__ == "__main__":
    root = tk.Tk()
    App(root)
    root.mainloop()