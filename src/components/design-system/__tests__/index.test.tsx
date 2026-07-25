import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import * as ds from '../index';
import { Button, Card, CardHeader, CardContent, CardFooter, Badge, Alert } from '../index';

/**
 * Guards the design-system public API (issue #760):
 * every component ships as a named export from the single barrel.
 */
describe('design-system barrel', () => {
  it('exposes exactly the expected named exports', () => {
    expect(Object.keys(ds).sort()).toEqual(
      ['Alert', 'Badge', 'Button', 'Card', 'CardContent', 'CardFooter', 'CardHeader'].sort()
    );
  });

  it('has no default export', () => {
    expect((ds as Record<string, unknown>).default).toBeUndefined();
  });

  it('every named export is a renderable component', () => {
    for (const Component of [Button, Card, CardHeader, CardContent, CardFooter, Badge, Alert]) {
      expect(typeof Component === 'function' || typeof Component === 'object').toBe(true);
    }
  });

  it('renders each primitive from the barrel without crashing', () => {
    const { getByRole, getByText } = render(
      <Card>
        <CardHeader>Header</CardHeader>
        <CardContent>
          <Button>Click</Button>
          <Badge>New</Badge>
          <Alert title="Heads up">Body</Alert>
        </CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>
    );
    expect(getByRole('button')).toHaveTextContent('Click');
    expect(getByText('New')).toBeInTheDocument();
    expect(getByText('Heads up')).toBeInTheDocument();
  });
});
