import { render, screen, fireEvent } from '@testing-library/react';
import SettingsError from '../error';

describe('Settings Error Boundary', () => {
  const mockReset = jest.fn();

  beforeEach(() => {
    mockReset.mockClear();
  });

  it('displays settings error title', () => {
    const error = new Error('Settings not found');
    render(<SettingsError error={error} reset={mockReset} />);

    expect(screen.getByText('Settings Error')).toBeInTheDocument();
  });

  it('displays error message', () => {
    const error = new Error('Failed to load user preferences');
    render(<SettingsError error={error} reset={mockReset} />);

    expect(screen.getByText('Failed to load user preferences')).toBeInTheDocument();
  });

  it('calls reset on try again button click', () => {
    const error = new Error('Settings error');
    render(<SettingsError error={error} reset={mockReset} />);

    const tryAgainButton = screen.getByText('Try again');
    fireEvent.click(tryAgainButton);

    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it('renders navigation links', () => {
    const error = new Error('Settings error');
    render(<SettingsError error={error} reset={mockReset} />);

    expect(screen.getByText('Go home')).toBeInTheDocument();
  });

  it('logs error to console', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    const error = new Error('Settings error');

    render(<SettingsError error={error} reset={mockReset} />);

    expect(consoleSpy).toHaveBeenCalledWith('Settings error:', error);
    consoleSpy.mockRestore();
  });
});
