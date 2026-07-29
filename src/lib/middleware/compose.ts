import { NextRequest, NextResponse } from 'next/server';

export function composeMiddleware(
  ...middlewares: Array<
    (
      handler: (req: NextRequest) => Promise<NextResponse>,
    ) => (req: NextRequest) => Promise<NextResponse>
  >
) {
  return (handler: (req: NextRequest) => Promise<NextResponse>) => {
    return middlewares.reduceRight((acc, middleware) => middleware(acc), handler);
  };
}
