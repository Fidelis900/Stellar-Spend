import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  AsyncBoundary,
  ListLoadingState,
  ListEmptyState,
  ListErrorState,
} from '../AsyncBoundary';

describe('AsyncBoundary', () => {
  it('renders children when loaded and not empty', () => {
    render(
      <AsyncBoundary
        isLoading={false}
        isEmpty={false}
      >
        <div>Content</div>
      </AsyncBoundary>
    );
    expect(screen.getByText('Content')).toBeTruthy();
  });

  it('renders loading content when isLoading is true', () => {
    render(
      <AsyncBoundary
        isLoading={true}
        isEmpty={false}
        loadingContent={<div>Loading...</div>}
      >
        <div>Content</div>
      </AsyncBoundary>
    );
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('renders empty content when isEmpty is true', () => {
    render(
      <AsyncBoundary
        isLoading={false}
        isEmpty={true}
        emptyContent={<div>Empty</div>}
      >
        <div>Content</div>
      </AsyncBoundary>
    );
    expect(screen.getByText('Empty')).toBeTruthy();
  });

  it('renders error content when error is provided', () => {
    render(
      <AsyncBoundary
        isLoading={false}
        isEmpty={false}
        error="Something went wrong"
        errorContent={(err) => <div>Error: {err}</div>}
      >
        <div>Content</div>
      </AsyncBoundary>
    );
    expect(screen.getByText('Error: Something went wrong')).toBeTruthy();
  });

  it('prioritizes error state over empty state', () => {
    render(
      <AsyncBoundary
        isLoading={false}
        isEmpty={true}
        error="Error"
        emptyContent={<div>Empty</div>}
        errorContent={(err) => <div>{err}</div>}
      >
        <div>Content</div>
      </AsyncBoundary>
    );
    expect(screen.getByText('Error')).toBeTruthy();
    expect(screen.queryByText('Empty')).toBeNull();
  });

  it('prioritizes loading state over other states', () => {
    render(
      <AsyncBoundary
        isLoading={true}
        isEmpty={true}
        error="Error"
        loadingContent={<div>Loading</div>}
        emptyContent={<div>Empty</div>}
        errorContent={(err) => <div>{err}</div>}
      >
        <div>Content</div>
      </AsyncBoundary>
    );
    expect(screen.getByText('Loading')).toBeTruthy();
  });

  it('applies custom className to loading wrapper', () => {
    const { container } = render(
      <AsyncBoundary
        isLoading={true}
        isEmpty={false}
        className="custom-class"
        loadingContent={<div>Loading</div>}
      >
        <div>Content</div>
      </AsyncBoundary>
    );
    expect(container.querySelector('.custom-class')).toBeTruthy();
  });
});

describe('ListLoadingState', () => {
  it('renders skeleton rows', () => {
    const { container } = render(<ListLoadingState rows={3} />);
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBe(3);
  });

  it('renders 5 rows by default', () => {
    const { container } = render(<ListLoadingState />);
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBe(5);
  });
});

describe('ListEmptyState', () => {
  it('renders default empty state', () => {
    render(<ListEmptyState />);
    expect(screen.getByText('No items')).toBeTruthy();
    expect(screen.getByText('Nothing to show here yet')).toBeTruthy();
  });

  it('renders custom title and description', () => {
    render(
      <ListEmptyState
        title="Custom title"
        description="Custom description"
      />
    );
    expect(screen.getByText('Custom title')).toBeTruthy();
    expect(screen.getByText('Custom description')).toBeTruthy();
  });

  it('renders icon when provided', () => {
    render(
      <ListEmptyState
        icon={<svg data-testid="icon" />}
      />
    );
    expect(screen.getByTestId('icon')).toBeTruthy();
  });

  it('renders action when provided', () => {
    render(
      <ListEmptyState
        action={<button>Action</button>}
      />
    );
    expect(screen.getByRole('button', { name: 'Action' })).toBeTruthy();
  });
});

describe('ListErrorState', () => {
  it('renders error message', () => {
    render(<ListErrorState error="Custom error message" />);
    expect(screen.getByText('Custom error message')).toBeTruthy();
  });

  it('renders retry button when onRetry is provided', () => {
    render(<ListErrorState error="Failed" onRetry={() => {}} />);
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy();
  });

  it('does not render retry button when onRetry is not provided', () => {
    render(<ListErrorState error="Error occurred" />);
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });
});
