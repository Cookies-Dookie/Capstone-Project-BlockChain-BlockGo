import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import SystemLogs from './SystemLogs';
import { fetchAcademicPrograms, fetchSystemLogs } from '../../services/api';

jest.mock('../../services/api', () => ({
  fetchAcademicPrograms: jest.fn(),
  fetchSystemLogs: jest.fn(),
}));

beforeEach(() => {
  fetchAcademicPrograms.mockResolvedValue({ status: 'Success', data: [] });
  fetchSystemLogs.mockResolvedValue({
    status: 'Success',
    data: Array.from({ length: 12 }, (_, index) => ({
      id: index + 1,
      recordId: `record-${index + 1}`,
      oldGrade: null,
      newGrade: String(80 + index),
      reason: 'GRADE_RECORDED: Pagination test transaction.',
      approvedBy: `user-${index + 1}`,
      timestamp: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    })),
  });
});

test('opens registrar transactions on the last page and supports numbered navigation', async () => {
  render(<SystemLogs grades={[]} />);

  expect(await screen.findByText('record-2')).toBeInTheDocument();
  expect(screen.getByText('record-1')).toBeInTheDocument();
  expect(screen.queryByText('record-12')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Go to page 2' })).toHaveAttribute('aria-current', 'page');
  expect(screen.queryByText(/transactions per page/i)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Go to page 1' }));

  expect(await screen.findByText('record-12')).toBeInTheDocument();
  expect(screen.getByText('record-3')).toBeInTheDocument();
  expect(screen.queryByText('record-2')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Go to page 1' })).toHaveAttribute('aria-current', 'page');
});

test('changes numbered pagination in groups of five pages', async () => {
  fetchSystemLogs.mockResolvedValueOnce({
    status: 'Success',
    data: Array.from({ length: 120 }, (_, index) => ({
      id: index + 1,
      recordId: `large-record-${index + 1}`,
      oldGrade: null,
      newGrade: String(80 + index),
      reason: 'GRADE_RECORDED: Pagination test transaction.',
      approvedBy: `user-${index + 1}`,
      timestamp: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    })),
  });

  render(<SystemLogs grades={[]} />);

  expect(await screen.findByText('large-record-1')).toBeInTheDocument();
  [8, 9, 10, 11, 12].forEach((page) => {
    expect(screen.getByRole('button', { name: `Go to page ${page}` })).toBeInTheDocument();
  });
  expect(screen.getByRole('button', { name: 'Go to page 12' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('button', { name: 'Go to first page' })).toHaveTextContent('…');

  fireEvent.click(screen.getByRole('button', { name: 'Go to first page' }));
  [1, 2, 3, 4, 5].forEach((page) => {
    expect(screen.getByRole('button', { name: `Go to page ${page}` })).toBeInTheDocument();
  });
  expect(screen.getByRole('button', { name: 'Go to last page' })).toHaveTextContent('…');

  fireEvent.click(screen.getByRole('button', { name: 'Go to page 5' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));

  [6, 7, 8, 9, 10].forEach((page) => {
    expect(screen.getByRole('button', { name: `Go to page ${page}` })).toBeInTheDocument();
  });
  expect(screen.queryByRole('button', { name: 'Go to page 2' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Go to page 6' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('button', { name: 'Go to last page' })).toBeInTheDocument();
});
