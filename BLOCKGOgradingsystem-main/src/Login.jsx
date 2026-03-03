// src/Login.jsx
import React, { useState } from 'react'; // Added useState
import './App.css';
import plvbg from './plvbg.png';
import plvlogo from './plvlogo.png';

const Login = ({ onLogin }) => { // Accept onLogin prop from App.js
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e) => {
  e.preventDefault();
  
  // Validation check
  if (!email.includes("faculty") && !email.includes("student")) {
    alert("Unauthorized email address. Please use your school email.");
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
          

          <h2 className="welcome-text">Welcome</h2>
          
          {/* Added onSubmit handler */}
          <form className="login-form" onSubmit={handleSubmit}>
            <div className="input-group">
              <label>Email</label>
              <input 
              type="email" 
              placeholder="e.g. student@gmail.com or faculty@gmail.com" // More descriptive placeholder
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

            <button type="submit" className="sign-in-btn">Sign In</button>
          </form>

          <p className="forgot-password">Forgot Password?</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
