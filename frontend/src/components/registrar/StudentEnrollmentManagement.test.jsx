import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import StudentEnrollmentManagement from './StudentEnrollmentManagement';
import {
  assignStudent,
  fetchApprovedStudents,
  fetchCurriculums,
} from '../../services/api';

jest.mock('../../services/api', () => ({
  assignStudent: jest.fn(),
  fetchApprovedStudents: jest.fn(),
  fetchCurriculums: jest.fn(),
  registrarBulkEnrollStudents: jest.fn(),
  registrarBulkUpdateStudents: jest.fn(),
}));

const program = 'Bachelor of Science in Information Technology';

beforeEach(() => {
  jest.clearAllMocks();
  fetchApprovedStudents.mockResolvedValue({
    status: 'Success',
    students: [{
      id: 42,
      fullname: 'Juan Dela Cruz',
      studentno: '26-0001',
      department: program,
      yearLevel: '1',
      section: '1-1',
      schoolYear: '2026-2027',
      semester: 'FIRST',
      curriculumVersion: 'BSIT-2026',
      enrollmentStatus: 'ENROLLED',
    }],
  });
  fetchCurriculums.mockResolvedValue({
    status: 'Success',
    data: [{
      curriculumId: 7,
      curriculumName: 'BSIT Curriculum 2026',
      curriculumVersion: 'BSIT-2026',
      programName: program,
      programCode: 'BSIT',
    }],
  });
  assignStudent.mockResolvedValue({ status: 'Success', message: 'Student enrollment saved.' });
});

test('assigns an existing student to the selected academic period and curriculum', async () => {
  render(<StudentEnrollmentManagement programs={[program]} />);

  await screen.findByText('Juan Dela Cruz');
  await waitFor(() => expect(screen.getByLabelText(/curriculum version/i)).toHaveValue('7'));

  fireEvent.change(screen.getByLabelText(/school year/i), { target: { value: '2026-2027' } });
  fireEvent.change(screen.getByLabelText(/^semester/i), { target: { value: 'SECOND' } });
  fireEvent.change(screen.getByLabelText(/^year level/i), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText(/^section/i), { target: { value: '2-3' } });
  fireEvent.change(screen.getByLabelText(/student account/i), { target: { value: '42' } });
  fireEvent.click(screen.getByRole('button', { name: /save student enrollment/i }));

  await waitFor(() => expect(assignStudent).toHaveBeenCalledWith(42, {
    Department: program,
    Section: '2-3',
    YearLevel: '2',
    SchoolYear: '2026-2027',
    Semester: 'SECOND',
    CurriculumId: 7,
  }));
});
