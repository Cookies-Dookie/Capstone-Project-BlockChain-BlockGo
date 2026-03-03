import React from 'react';

const StudentPortal = ({ studentData, onLogout }) => {
  // 1. Conversion Logic: Percentage to PLV Point Scale
  const getPLVPoint = (midterm, finals) => {
    const average = (midterm + finals) / 2;
    if (average >= 97) return 1.00;
    if (average >= 94) return 1.25;
    if (average >= 91) return 1.50;
    if (average >= 88) return 1.75;
    if (average >= 85) return 2.00;
    if (average >= 75) return 3.00;
    return 5.00;
  };

  // 2. Calculate Semester Totals
  const totalUnits = studentData.subjects.reduce((sum, sub) => sum + sub.units, 0);
  
  const totalWeight = studentData.subjects.reduce((sum, sub) => {
    const point = getPLVPoint(sub.midterm, sub.finals);
    return sum + (point * sub.units);
  }, 0);

  const calculatedGWA = totalUnits > 0 ? (totalWeight / totalUnits).toFixed(2) : "0.00";

  // 3. Status logic
  const isDeansLister = calculatedGWA <= 1.75 && studentData.subjects.every(s => getPLVPoint(s.midterm, s.finals) <= 2.25);

  return (
    <div className="portal-container">
      {/* 1. Header with Stats, Branding, & LOGOUT */}
      <header className="student-header">
        <div className="student-info">
          <h2>{studentData.name}</h2>
          <p>Student ID: 2024-10293-V</p>
          {isDeansLister && <span className="deans-lister-badge">🌟 DEAN'S LISTER</span>}
        </div>
        
        <div className="summary-section">
          <div className="stat-card">
            <span>TOTAL UNITS</span>
            <h3>{totalUnits}</h3>
          </div>
          <div className="stat-card gold">
            <span>SEMESTER GWA</span>
            <h3>{calculatedGWA}</h3>
          </div>
          
          {/* Added Logout Button */}
          <button className="logout-btn" onClick={onLogout}>
            LOGOUT
          </button>
        </div>
      </header>

      {/* 2. Grade Table */}
      <div className="table-container">
        <table className="plv-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Subject Title</th>
              <th>Units</th>
              <th>Midterm</th>
              <th>Finals</th>
              <th>Final Grade</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {studentData.subjects.map((sub, index) => {
              const finalPoint = getPLVPoint(sub.midterm, sub.finals);
              const passed = finalPoint <= 3.0;

              return (
                <tr key={index}>
                  <td className="sub-code">{sub.code || 'IT-XXX'}</td>
                  <td className="sub-title">{sub.name}</td>
                  <td className="units-count">{sub.units}</td>
                  <td>{sub.midterm}</td>
                  <td>{sub.finals}</td>
                  <td className="final-point">{finalPoint.toFixed(2)}</td>
                  <td>
                    <span className={`status-pill ${passed ? 'passed' : 'failed'}`}>
                      {passed ? "PASSED" : "FAILED"}
                    </span>
                  </td>
                  <td>
                    <button className="drop-btn-small">Drop</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default StudentPortal;