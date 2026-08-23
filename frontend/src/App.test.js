import { render, screen } from '@testing-library/react';
import App from './App';

test('renders managed-account login without public registration', () => {
  render(<App />);
  expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  expect(screen.getByText(/forgot password/i)).toBeInTheDocument();
  expect(screen.queryByText(/sign up|register|create account/i)).not.toBeInTheDocument();
});
