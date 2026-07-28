import { setupServer } from 'msw/node';
import { paycrestHandlers, allbridgeHandlers, stellarHandlers, offrampHandlers } from './handlers';

export const server = setupServer(
  ...paycrestHandlers,
  ...allbridgeHandlers,
  ...stellarHandlers,
  ...offrampHandlers,
);

// Enable API mocking before all tests
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

// Reset handlers after each test
afterEach(() => server.resetHandlers());

// Clean up after all tests
afterAll(() => server.close());
