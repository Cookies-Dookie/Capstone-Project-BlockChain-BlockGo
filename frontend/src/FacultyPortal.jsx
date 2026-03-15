import React, { useState } from 'react';

const FacultyPortal = ({ facultyData, onLogout }) => {
  // 1. Data restructured by Section
  const [sections, setSections] = useState({
    "BSIT 2-1": [
      { id: '2023-001', name: 'Juan Dela Cruz', midterm: 85, finals: 90 },
      { id: '2023-002', name: 'Maria Santos', midterm: 70, finals: 75 },
    ],
    "BSIT 2-2": [
      { id: '2023-101', name: 'Ricardo Dalisay', midterm: 88, finals: 82 },
      { id: '2023-102', name: 'Liza Soberano', midterm: 95, finals: 91 },
    ],
    "BSIT 3-1": [
      { id: '2023-201', name: 'Boni Facio', midterm: 75, finals: 80 },
    ]
  });

  const [activeSection, setActiveSection] = useState(null);

  const calculatePLVPoint = (m, f) => {
    const avg = (parseFloat(m) + parseFloat(f)) / 2;
    if (avg >= 97) return 1.00;
    if (avg >= 75) return 3.00;
    return 5.00; // Simplified for brevity
  };

  const handleGradeChange = (sectionName, index, field, value) => {
    const updatedSections = { ...sections };
    updatedSections[sectionName][index][field] = parseFloat(value) || 0;
    setSections(updatedSections);
  };

  const sectionNames = Object.keys(sections);

  return (
    <div className="portal-container">
    <header className="student-header">
    <div>
        <h1 style={{ margin: 0 }}>Faculty Portal</h1>
        <h2 style={{ fontSize: '1.2rem', opacity: 0.9 }}>{facultyData.name}</h2>
        <p style={{ margin: '5px 0 0 0' }}>{facultyData.department}</p>
    </div>

    <div className="summary-section">
    {/* Section Count Box */}
        <div className="stat-card">
                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase' }}>Sections</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{Object.keys(sections).length}</div>
        </div>

    {/* Employment Status Box (GWA Style) */}
        <div className="stat-card gold">
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase' }}>Classification</div>
            <div style={{ fontSize: '1.1rem' }}>{facultyData.status}</div>
        </div>

    <button className="logout-btn" onClick={onLogout}>
      LOGOUT
    </button>
  </div>
    </header>

      {/* 2. Section Selector Cards */}
      {!activeSection ? (
        <div className="section-grid">
          {sectionNames.map((name) => (
            <div key={name} className="stat-card section-card">
              <h3>{name}</h3>
              <p>{sections[name].length} Students</p>
              <div className="section-actions">
                <button className="sign-in-btn" onClick={() => setActiveSection(name)}>
                  View Grades
                </button>
                <label className="upload-label">
                  Upload Grading Sheet
                  <input type="file" style={{ display: 'none' }} onChange={() => alert(`Sheet uploaded for ${name}`)} />
                </label>
                 <button className="upload-btn" onClick={() => setActiveSection(name)}>
                  Upload to Registrar
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* 3. Grading Table View */
        <div>
          <button className="drop-btn-small" onClick={() => setActiveSection(null)} style={{ marginBottom: '15px' }}>
            ← Back to Sections
          </button>
          <div className="table-container">
            <div className="table-header-custom">
              <h3 style={{ padding: '20px', margin: 0 }}>Section: {activeSection}</h3>
            </div>
            <table className="plv-table">
              <thead>
                <tr>
                  <th>Student ID</th>
                  <th>Student Name</th>
                  <th>Midterm</th>
                  <th>Finals</th>
                  <th>Final Grade</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sections[activeSection].map((stu, index) => {
                  const finalPoint = calculatePLVPoint(stu.midterm, stu.finals);
                  const isPassed = finalPoint <= 3.0;
                  return (
                    <tr key={stu.id}>
                      <td className="sub-code">{stu.id}</td>
                      <td className="sub-title">{stu.name}</td>
                      <td><input type="number" className="grade-input" value={stu.midterm} onChange={(e) => handleGradeChange(activeSection, index, 'midterm', e.target.value)} /></td>
                      <td><input type="number" className="grade-input" value={stu.finals} onChange={(e) => handleGradeChange(activeSection, index, 'finals', e.target.value)} /></td>
                      <td className="final-point">{finalPoint.toFixed(2)}</td>
                      <td><span className={`status-pill ${isPassed ? 'passed' : 'failed'}`}>{isPassed ? "PASSED" : "FAILED"}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default FacultyPortal;