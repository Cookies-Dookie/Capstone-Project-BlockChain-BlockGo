import React, { useState, useEffect } from 'react';
import { fetchAllGrades, approveGrade, finalizeGrade, issueGrade } from './api';

const GradesDashboard = ({ loggedInEmail, loggedInName }) => {
    const [grades, setGrades] = useState([]);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState(null); // Replaces the annoying alert
    
    // Form State
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({
        recordId: '',
        studentHash: '',
        subjectCode: '',
        course: '',
        grade: ''
    });

    const loadGrades = async () => {
        setLoading(true);
        setErrorMsg(null);
        try {
            const response = await fetchAllGrades(loggedInEmail);
            if (response.status === 'Success') {
                setGrades(response.data || []);
            }
        } catch (error) {
            console.error('Error loading grades:', error);
            setErrorMsg(`Could not fetch latest blockchain data for ${loggedInEmail}. Showing cached ledger data if available.`);
        }
        setLoading(false);
    };

    useEffect(() => {
        loadGrades();
    }, [loggedInEmail]);

    const handleApprove = async (recordId) => {
        try {
            // Force the Dean's email for the approval test
            await approveGrade(recordId, 'dean@cs.plv.edu.ph');
            alert(`Record ${recordId} Successfully Approved by Department!`);
            loadGrades(); // Refresh the data
        } catch (error) {
            alert(`Failed to approve record: ${error.message}`);
        }
    };

    const handleFinalize = async (recordId) => {
        try {
            // Force the Registrar's email for the finalize test
            await finalizeGrade(recordId, 'registrar@plv.edu.ph');
            alert(`Record ${recordId} Successfully Finalized!`);
            loadGrades(); // Refresh the data
        } catch (error) {
            alert(`Failed to finalize record: ${error.message}`);
        }
    };

    const handleIssueGrade = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                id: formData.recordId,
                studentHash: formData.studentHash,
                studentId: formData.studentHash.split('@')[0], // Derived mock ID
                course: formData.course,
                subjectCode: formData.subjectCode,
                section: "A", // Default for testing
                grade: formData.grade,
                semester: "2nd Semester",
                schoolYear: "2024",
                university: "PLV",
                facultyId: loggedInEmail // Required by middleware ABAC
            };
            
            await issueGrade(payload, loggedInEmail);
            alert("✅ Grade successfully issued to the Blockchain!");
            setShowForm(false);
            setFormData({ recordId: '', studentHash: '', subjectCode: '', course: '', grade: '' });
            loadGrades(); // Refresh table
        } catch (error) {
            alert(`❌ Error issuing grade: ${error.message}`);
        }
    };

    const filteredGrades = grades.filter(grade => {
        if (loggedInEmail.includes('registrar')) return true;
        
        // 1. Student only sees their OWN records
        if (loggedInEmail.includes('student')) {
            return grade.student_hash === loggedInEmail || grade.studentId === loggedInEmail;
        }

        const isCS_IT = grade.subject_code?.includes('CS') || grade.subject_code?.includes('IT') || grade.course?.includes('CS');
        const isEngineering = grade.subject_code?.includes('ENGR') || grade.subject_code?.includes('CE') || grade.course?.includes('Eng');

        if (loggedInEmail.includes('dean') || loggedInEmail.includes('prof.alden')) {
            return isCS_IT;
        }
        
        if (loggedInEmail.includes('prof.engineering') || loggedInEmail.includes('faculty')) {
            return isEngineering;
        }

        return grade.faculty_id === loggedInEmail;
    });

    const getStatusStyle = (status) => {
        switch(status) {
            case 'Finalized': return { backgroundColor: '#e6f4ea', color: '#1e8e3e', padding: '6px 12px', borderRadius: '20px', fontSize: '0.85em', fontWeight: 'bold' };
            case 'DepartmentApproved': return { backgroundColor: '#e8f0fe', color: '#1967d2', padding: '6px 12px', borderRadius: '20px', fontSize: '0.85em', fontWeight: 'bold' };
            case 'Issued': return { backgroundColor: '#fef7e0', color: '#b08d00', padding: '6px 12px', borderRadius: '20px', fontSize: '0.85em', fontWeight: 'bold' };
            default: return { backgroundColor: '#f1f3f4', color: '#5f6368', padding: '6px 12px', borderRadius: '20px', fontSize: '0.85em', fontWeight: 'bold' };
        }
    };

    const formatHash = (hash) => {
        if (!hash) return '';
        if (hash.length <= 16) return hash;
        return `${hash.substring(0, 8)}...${hash.substring(hash.length - 8)}`;
    };

    const inputStyle = { padding: '10px', borderRadius: '4px', border: '1px solid #ccc', width: '100%', boxSizing: 'border-box' };

    return (
        <div style={{ padding: '40px 20px', fontFamily: "'Inter', 'Segoe UI', sans-serif", maxWidth: '1200px', margin: '0 auto' }}>
            <h2 style={{ color: '#003366', borderBottom: '2px solid #e0e0e0', paddingBottom: '10px' }}> University Blockchain Ledger</h2>
            
            {/* Controls Section */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0', backgroundColor: 'white', padding: '15px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                <div>
                    <span style={{ marginRight: '15px', color: '#003366', fontWeight: 'bold', fontSize: '1.1em' }}>
                        👤 Logged in as: {loggedInName ? `${loggedInName} (${loggedInEmail})` : loggedInEmail}
                    </span>
                </div>
                <div>
                    <button onClick={loadGrades} style={{ padding: '10px 20px', backgroundColor: '#003366', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', transition: 'background 0.2s' }}>
                        {loading ? 'Syncing blocks...' : 'Refresh Ledger'}
                    </button>
                    {/* Only Faculty can see the Issue Grade button */}
                    {(loggedInEmail.includes('prof') || loggedInEmail.includes('faculty')) && (
                        <button onClick={() => setShowForm(!showForm)} style={{ marginLeft: '10px', padding: '10px 20px', backgroundColor: showForm ? '#dc3545' : '#34a853', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                            {showForm ? 'Cancel' : '+ Issue New Grade'}
                        </button>
                    )}
                </div>
            </div>

            {/* Issue Grade Form */}
            {showForm && (
                <div style={{ backgroundColor: '#f8f9fa', padding: '25px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #ddd', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                    <h3 style={{ marginTop: 0, color: '#003366', marginBottom: '15px' }}>📝 Issue New Blockchain Grade</h3>
                    <form onSubmit={handleIssueGrade} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                        <input required placeholder="Record ID (e.g. 10-CS202)" value={formData.recordId} onChange={e => setFormData({...formData, recordId: e.target.value})} style={inputStyle} />
                        <input required placeholder="Student Email (e.g. student.mayumi@plv.edu.ph)" value={formData.studentHash} onChange={e => setFormData({...formData, studentHash: e.target.value})} style={inputStyle} />
                        <input required placeholder="Subject Code (e.g. CS202)" value={formData.subjectCode} onChange={e => setFormData({...formData, subjectCode: e.target.value})} style={inputStyle} />
                        <input required placeholder="Course (e.g. BSCS)" value={formData.course} onChange={e => setFormData({...formData, course: e.target.value})} style={inputStyle} />
                        <input required placeholder="Grade (e.g. 1.25)" value={formData.grade} onChange={e => setFormData({...formData, grade: e.target.value})} style={inputStyle} />
                        <button type="submit" style={{ backgroundColor: '#003366', color: 'white', border: 'none', padding: '10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1em' }}>Secure on Ledger</button>
                    </form>
                </div>
            )}

            {/* Clean Inline Error Message */}
            {errorMsg && (
                <div style={{ backgroundColor: '#ffebee', color: '#d32f2f', padding: '12px', borderRadius: '4px', marginBottom: '20px', borderLeft: '4px solid #d32f2f' }}>
                     {errorMsg}
                </div>
            )}

            {loading ? <p>Loading blocks...</p> : (
                <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#003366', color: 'white' }}>
                                <th style={{ padding: '15px' }}>Record ID</th>
                                <th style={{ padding: '15px' }}>Student</th>
                                <th style={{ padding: '15px' }}>Subject</th>
                                <th style={{ padding: '15px' }}>Grade</th>
                                <th style={{ padding: '15px' }}>Faculty ID</th>
                                <th style={{ padding: '15px' }}>Blockchain Status</th>
                                <th style={{ padding: '15px' }}>Smart Contract Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredGrades.length === 0 ? (
                                <tr>
                                    <td colSpan="7" style={{ padding: '20px', textAlign: 'center', color: '#777' }}>No ledger records found for this department/user.</td>
                                </tr>
                            ) : (
                                filteredGrades.map((grade, index) => (
                                    <tr key={grade.id} style={{ backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8f9fa', borderBottom: '1px solid #eee' }}>
                                        <td style={{ padding: '15px', color: '#555', fontFamily: 'monospace' }}>{grade.id}</td>
                                        <td style={{ padding: '15px', color: '#666', fontFamily: 'monospace' }} title={grade.student_hash || grade.studentId || 'Unknown'}>
                                            {/* Privacy Rule: Only show full PII if the logged-in user is the student who owns the record. */}
                                            {loggedInEmail.includes('student') && (grade.student_hash === loggedInEmail || grade.studentId === loggedInEmail)
                                                ? (grade.student_hash || grade.studentId)
                                                : formatHash(grade.student_hash || grade.studentId || 'Unknown')
                                            }
                                        </td>
                                        <td style={{ padding: '15px', fontWeight: 'bold', color: '#333' }}>{grade.subject_code}</td>
                                        <td style={{ padding: '15px', fontSize: '1.1em', fontWeight: '900', color: '#000' }}>{grade.grade}</td>
                                        <td style={{ padding: '15px', color: '#666', fontFamily: 'monospace' }} title={grade.faculty_id}>
                                            {formatHash(grade.faculty_id)}
                                        </td>
                                        <td style={{ padding: '15px' }}>
                                            <span style={getStatusStyle(grade.status)}>{grade.status}</span>
                                        </td>
                                        <td style={{ padding: '15px' }}>
                                            {grade.status === 'Issued' && loggedInEmail.includes('dean') && (
                                                <button onClick={() => handleApprove(grade.id)} style={{ backgroundColor: '#fbbc04', color: '#333', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>Verify & Approve (Dean)</button>
                                            )}
                                            {grade.status === 'DepartmentApproved' && loggedInEmail.includes('registrar') && (
                                                <button onClick={() => handleFinalize(grade.id)} style={{ backgroundColor: '#34a853', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>Finalize to Ledger (Registrar)</button>
                                            )}
                                            {grade.status === 'Finalized' && <span style={{ color: '#1e8e3e', fontWeight: 'bold' }}>Encrypted & Locked</span>}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default GradesDashboard;