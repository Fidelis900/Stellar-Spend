/**
 * The design-system Button is the single cva-driven Button primitive
 * (see issue #761). It is re-exported here so existing
 * `@/components/design-system` consumers keep working while there is only
 * one Button implementation in the codebase.
 */
export { Button, buttonVariants } from '@/components/ui/Button';
export type { ButtonProps } from '@/components/ui/Button';
