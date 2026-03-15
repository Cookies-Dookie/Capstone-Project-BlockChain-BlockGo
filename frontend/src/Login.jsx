// src/Login.jsx
import React, { useState } from 'react'; // Added useState
import './App.css';
import plvbg from './plvbg.png';
import plvlogo from './plvlogo.png';
import { submitRegistrationRequest } from './api';

const Login = ({ onLogin }) => { // Accept onLogin prop from App.js
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignup, setIsSignup] = useState(false);
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("student");
  const [department, setDepartment] = useState("CS");

  const handleSubmit = async (e) => {
  e.preventDefault();
  
  if (isSignup) {
    try {
        await submitRegistrationRequest({ fullName, email, password, role, department });
        alert("Registration request sent! Please wait for administrative approval.");
        setIsSignup(false);
    } catch (error) {
        alert("Failed to send registration request: " + error.message);
    }
    return;
  }
  const lowerEmail = email.toLowerCase();
  if (!lowerEmail.includes("faculty") && !lowerEmail.includes("student") && !lowerEmail.includes("registrar") && !lowerEmail.includes("dean") && !lowerEmail.includes("prof")) {
    alert("Unauthorized email address. Please use your valid PLV school email.");
    return;
  }

  onLogin(email); 
};

  return (
    <div className="login-container">
      <div 
        className="login-image-section" 
        style={{ backgroundImage: `url(${plvbg})` }}
      >
        
      </div>

      <div className="login-form-section">
        <div className="login-card">
          <img src={plvlogo} alt="PLV Logo" className="plv-logo" />
          

          <h2 className="welcome-text">{isSignup ? "Request System Access" : "Welcome"}</h2>
          
          {/* Added onSubmit handler */}
          <form className="login-form" onSubmit={handleSubmit}>
            
            {/* Conditionally show Signup Fields */}
            {isSignup && (
              <>
                <div className="input-group">
                  <label>Full Name</label>
                  <input type="text" placeholder="e.g. Juan Dela Cruz" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </div>
                <div className="input-group">
                  <label>Role</label>
                  <select value={role} onChange={(e) => setRole(e.target.value)} style={{ width: '100%', padding: '12px', border: '1px solid #ddd', borderRadius: '8px', boxSizing: 'border-box' }}>
                    <option value="student">Student</option>
                    <option value="faculty">Faculty / Professor</option>
                  </select>
                </div>
                <div className="input-group">
                  <label>Department / College</label>
                  <select value={department} onChange={(e) => setDepartment(e.target.value)} style={{ width: '100%', padding: '12px', border: '1px solid #ddd', borderRadius: '8px', boxSizing: 'border-box' }}>
                    <option value="CS">Computer Science</option>
                    <option value="IT">Information Technology</option>
                    <option value="CE">Civil Engineering</option>
                  </select>
                </div>
              </>
            )}

            <div className="input-group">
              <label>Email</label>
              <input 
              type="email" 
              placeholder="e.g. registrar@plv.edu.ph"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required 
              />
            </div>
            
            <div className="input-group">
              <label>Password</label>
              <input 
                type="password" 
                placeholder="Password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)} // Update password state
                required 
              />
            </div>

            <button type="submit" className="sign-in-btn">{isSignup ? "Submit Request" : "Sign In"}</button>
          </form>

          <p className="forgot-password" onClick={() => setIsSignup(!isSignup)} style={{ cursor: 'pointer', color: '#003366', fontWeight: 'bold', marginTop: '15px' }}>
            {isSignup ? "Already have an account? Sign In" : "Don't have an account? Request Access"}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
