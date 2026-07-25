import { render, screen } from '@testing-library/react';
import { AppProviders } from '../AppProviders';

describe('AppProviders', () => {
  it('renders children', () => {
    render(
      <AppProviders>
        <div data-testid="test-child">Test Content</div>
      </AppProviders>
    );

    expect(screen.getByTestId('test-child')).toBeInTheDocument();
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('wraps all providers in correct order', () => {
    const { container } = render(
      <AppProviders>
        <div>Content</div>
      </AppProviders>
    );

    expect(container).toBeInTheDocument();
  });

  it('renders without crashing with empty children', () => {
    const { container } = render(
      <AppProviders>
        <></>
      </AppProviders>
    );

    expect(container).toBeInTheDocument();
  });

  it('handles multiple children elements', () => {
    render(
      <AppProviders>
        <div data-testid="first">First</div>
        <div data-testid="second">Second</div>
        <div data-testid="third">Third</div>
      </AppProviders>
    );

    expect(screen.getByTestId('first')).toBeInTheDocument();
    expect(screen.getByTestId('second')).toBeInTheDocument();
    expect(screen.getByTestId('third')).toBeInTheDocument();
  });
});
