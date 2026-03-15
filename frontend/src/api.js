const BASE_URL = 'http://localhost:5000/api';

// Fetch all grades from the blockchain
export const fetchAllGrades = async (invokerId) => {
    const response = await fetch(`${BASE_URL}/Grades/all?invokerId=${encodeURIComponent(invokerId)}`);
    if (!response.ok) throw new Error('Failed to fetch grades');
    return await response.json();
};

// Faculty issues a new grade
export const issueGrade = async (gradeData, invokerId) => {
    const response = await fetch(`${BASE_URL}/Grades/record?invokerId=${encodeURIComponent(invokerId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gradeData)
    });
    if (!response.ok) throw new Error('Failed to issue grade');
    return await response.json();
};

// Department Admin (Dean) approves the grade
export const approveGrade = async (recordId, invokerId) => {
    const response = await fetch(`${BASE_URL}/Grades/approve/${encodeURIComponent(recordId)}?invokerId=${encodeURIComponent(invokerId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    });
    if (!response.ok) throw new Error('Failed to approve grade');
    return await response.json();
};

// Registrar finalizes the grade
export const finalizeGrade = async (recordId, invokerId) => {
    const response = await fetch(`${BASE_URL}/Grades/finalize/${encodeURIComponent(recordId)}?invokerId=${encodeURIComponent(invokerId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    });
    if (!response.ok) throw new Error('Failed to finalize grade');
    return await response.json();
};

// Submit a registration request to the waitlist (PostgreSQL)
export const submitRegistrationRequest = async (userData) => {
    const response = await fetch(`${BASE_URL}/Auth/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
    });
    if (!response.ok) throw new Error('Failed to submit request');
    return await response.json();
};