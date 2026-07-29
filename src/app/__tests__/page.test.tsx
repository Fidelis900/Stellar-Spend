import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Mock child components to avoid complex dependency chains
vi.mock('@/components/FormCard', () => ({ default: () => <div data-testid="FormCard-mock" /> }));
vi.mock('@/components/RightPanel', () => ({
  default: () => <div data-testid="RightPanel-mock" />,
}));
vi.mock('@/components/RecentOfframpsTable', () => ({
  default: () => <div data-testid="RecentOfframpsTable-mock" />,
}));
vi.mock('@/components/ProgressSteps', () => ({
  default: () => <div data-testid="ProgressSteps-mock" />,
}));
vi.mock('@/components/Header', () => ({ Header: () => <div data-testid="Header-mock" /> }));

import Home from '../page';

describe('Dashboard Layout', () => {
  it('E3: outer main has min-h-screen and p-4', () => {
    const { container } = render(<Home />);
    const main = container.querySelector('main');
    expect(main?.className).toContain('min-h-screen');
    expect(main?.className).toContain('p-4');
  });

  it('E4: inner section has border, px-[2.6rem], py-8, max-[1100px]:p-4', () => {
    const { container } = render(<Home />);
    const section = container.querySelector('section');
    expect(section?.className).toContain('border');
    expect(section?.className).toContain('px-[2.6rem]');
    expect(section?.className).toContain('py-8');
    expect(section?.className).toContain('max-[1100px]:p-4');
  });

  it('E1: grid container has grid-cols-[1fr_370px] and max-[1100px]:grid-cols-1', () => {
    const { container } = render(<Home />);
    const grid = container.querySelector('section > div');
    expect(grid?.className).toContain('grid-cols-[1fr_370px]');
    expect(grid?.className).toContain('max-[1100px]:grid-cols-1');
  });

  it('E2: RightPanel wrapper has col-start-2 row-start-1 row-span-2', () => {
    const { container } = render(<Home />);
    const rpWrapper = container.querySelector('[data-testid="RightPanel"]');
    expect(rpWrapper?.className).toContain('col-start-2');
    expect(rpWrapper?.className).toContain('row-start-1');
    expect(rpWrapper?.className).toContain('row-span-2');
  });

  it('E5: grid container has overflow-hidden and w-full', () => {
    const { container } = render(<Home />);
    const grid = container.querySelector('section > div');
    expect(grid?.className).toContain('overflow-hidden');
    expect(grid?.className).toContain('w-full');
  });
});
