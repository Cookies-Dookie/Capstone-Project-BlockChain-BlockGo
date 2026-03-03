import React, { useState } from "react";
import "./style.css"; 
import "./App.css";   
import Login from "./Login";
import StudentPortal from './StudentPortal';
import FacultyPortal from './FacultyPortal';

// Mock Student Data
const TEST_STUDENT = {
  name: "Mayumi",
  role: "student",
  subjects: [
    { code: "IT-221", name: "Object Oriented Programming", units: 3, midterm: 85, finals: 95 },
    { code: "IT-222", name: "Data Structures", units: 3, midterm: 88, finals: 90 },
    { code: "IT-223", name: "Web Development", units: 3, midterm: 94, finals: 96 },
    { code: "GE-101", name: "Discrete Math", units: 3, midterm: 78, finals: 82 }
  ]
};

// Mock Faculty Data
const TEST_FACULTY = {
  name: "Juan Rodriguez",
  role: "faculty",
  department: "College of Information Technology",
  status: "Full-Time",
  assignedClass: "IT-221: Object Oriented Programming"
};

function App() {
  const [user, setUser] = useState(null);

  const handleLoginSuccess = (email) => {
    // Logic to separate roles based on email
    if (email.includes("faculty")) {
      setUser(TEST_FACULTY);
    } else if (email.includes("student")) {
      setUser(TEST_STUDENT);
    } else {
      alert("Invalid email domain. Please use @faculty or @student.");
    }
  };

  const handleLogout = () => {
    setUser(null);
  };

  return (
    <div className="main-app-wrapper">
      {!user ? (
        <Login onLogin={handleLoginSuccess} />
      ) : (
        // Conditional Rendering based on the user's role
        <>
          {user.role === "student" ? (
            <StudentPortal studentData={user} onLogout={handleLogout} />
          ) : (
            <FacultyPortal facultyData={user} onLogout={handleLogout} />
          )}
        </>
      )}
    </div>
  );
}

export default App;