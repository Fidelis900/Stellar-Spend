import { render, screen, fireEvent } from '@testing-library/react';
import Error from '../error';

describe('Root Error Boundary', () => {
  const mockReset = jest.fn();

  beforeEach(() => {
    mockReset.mockClear();
    jest.clearAllMocks();
  });

  it('displays error page with title', () => {
    const error = new Error('Test error');
    render(<Error error={error} reset={mockReset} />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('displays error message', () => {
    const error = new Error('Network connection failed');
    render(<Error error={error} reset={mockReset} />);

    expect(screen.getByText('Network connection failed')).toBeInTheDocument();
  });

  it('displays error digest when available', () => {
    const error = new Error('Test error');
    error.digest = 'abc123digest';
    render(<Error error={error} reset={mockReset} />);

    expect(screen.getByText(/Error ID: abc123digest/)).toBeInTheDocument();
  });

  it('calls reset callback when try again button clicked', () => {
    const error = new Error('Test error');
    render(<Error error={error} reset={mockReset} />);

    const tryAgainButton = screen.getByText('Try again');
    fireEvent.click(tryAgainButton);

    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it('renders go home button', () => {
    const error = new Error('Test error');
    render(<Error error={error} reset={mockReset} />);

    const homeButton = screen.getByText('Go home');
    expect(homeButton).toBeInTheDocument();
  });

  it('logs error to console', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    const error = new Error('Test error');

    render(<Error error={error} reset={mockReset} />);

    expect(consoleSpy).toHaveBeenCalledWith('Root error:', error);
    consoleSpy.mockRestore();
  });
});
