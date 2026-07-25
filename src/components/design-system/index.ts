/**
 * Design-system public API.
 *
 * Conventions (see issue #760):
 * - Every component is a **named** export (no default exports).
 * - This is the single barrel for the design system. Consumers should import
 *   from `@/components/design-system`, not from individual component files.
 * - Exports are **explicit** — no `export *` — so the public surface is
 *   auditable and tree-shaking stays predictable.
 */

export { Button } from './Button';
export type { ButtonProps } from './Button';

export { Card, CardHeader, CardContent, CardFooter } from './Card';
export type { CardProps } from './Card';

export { Badge } from './Badge';
export type { BadgeProps } from './Badge';

export { Alert } from './Alert';
export type { AlertProps } from './Alert';
