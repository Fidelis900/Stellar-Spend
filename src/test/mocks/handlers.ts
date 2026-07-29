import { http, HttpResponse } from 'msw';
import { createQuoteFactory, createApiResponseFactory } from '../test-helpers';

const quoteFactory = createQuoteFactory();
const apiFactory = createApiResponseFactory();

// ============================================================================
// PAYCREST API MOCKS (backed by fixtures)
// ============================================================================

import paycrestCurrencies from '../fixtures/paycrest/currencies.json';
import paycrestInstitutions from '../fixtures/paycrest/institutions.json';
import paycrestRate from '../fixtures/paycrest/rate.json';
import paycrestOrder from '../fixtures/paycrest/order.json';
import paycrestErrors from '../fixtures/paycrest/error-responses.json';
import allbridgeErrorsData from '../fixtures/allbridge/error-responses.json';

export const paycrestHandlers = [
  http.get('https://api.paycrest.io/v1/sender/currencies', () => {
    return HttpResponse.json(paycrestCurrencies);
  }),

  http.get('https://api.paycrest.io/v1/sender/institutions/:currency', () => {
    return HttpResponse.json(paycrestInstitutions);
  }),

  http.get('https://api.paycrest.io/v1/rates/:token/:amount/:currency', () => {
    return HttpResponse.json(paycrestRate);
  }),

  http.get('https://api.paycrest.io/v1/sender/orders/:orderId', () => {
    return HttpResponse.json(paycrestOrder);
  }),

  http.post('https://api.paycrest.io/v1/sender/orders', () => {
    return HttpResponse.json(paycrestOrder);
  }),

  http.post('https://api.paycrest.io/v1/sender/verify-account', () => {
    return HttpResponse.json({
      data: {
        accountName: 'Test User',
        accountNumber: '1234567890',
        institution: 'GTB',
        status: 'verified',
      },
    });
  }),
];

// ============================================================================
// ALLBRIDGE SDK MOCKS (backed by fixtures)
// ============================================================================

export const allbridgeHandlers = [
  http.get('https://api.allbridge.io/v1/chains', () => {
    return HttpResponse.json({
      chains: [
        { id: 'stellar', name: 'Stellar', rpcUrl: 'https://soroban-testnet.stellar.org' },
        { id: 'base', name: 'Base', rpcUrl: 'https://mainnet.base.org' },
      ],
    });
  }),

  http.post('https://api.allbridge.io/v1/bridge-quote', () => {
    return HttpResponse.json({
      sourceAmount: '100',
      destinationAmount: '99.5',
      fee: '0.5',
      estimatedTime: 300,
    });
  }),

  http.post('https://api.allbridge.io/v1/build-tx', () => {
    return HttpResponse.json({
      xdr: 'AAAAAgAAAAB...',
      sourceToken: {
        symbol: 'USDC',
        decimals: 7,
        contract: 'GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ75XABZEYYWRB6HP',
        chain: 'STELLAR',
      },
      destinationToken: {
        symbol: 'USDC',
        decimals: 6,
        contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        chain: 'BASE',
      },
    });
  }),
];

// ============================================================================
// STELLAR HORIZON MOCKS
// ============================================================================

export const stellarHandlers = [
  http.get('https://horizon.stellar.org/accounts/:address', ({ params }) => {
    return HttpResponse.json({
      id: params.address,
      account_id: params.address,
      balances: [
        { balance: '1000.0000000', asset_type: 'native' },
        {
          balance: '500.0000000',
          asset_code: 'USDC',
          asset_issuer: 'GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ75XABZEYYWRB6HP',
        },
      ],
    });
  }),

  http.get('https://horizon.stellar.org/transactions/:hash', ({ params }) => {
    return HttpResponse.json({
      id: params.hash,
      hash: params.hash,
      status: 'success',
      created_at: new Date().toISOString(),
    });
  }),

  http.post('https://soroban-testnet.stellar.org/soroban/rpc', () => {
    return HttpResponse.json({
      jsonrpc: '2.0',
      id: 1,
      result: { status: 'SUCCESS', ledger: 12345 },
    });
  }),
];

// ============================================================================
// OFFRAMP API MOCKS
// ============================================================================

export const offrampHandlers = [
  http.post('/api/offramp/quote', () => {
    return HttpResponse.json(quoteFactory.create());
  }),

  http.get('/api/offramp/currencies', () => {
    return HttpResponse.json({ currencies: ['NGN', 'KES', 'GHS', 'UGX'] });
  }),

  http.get('/api/offramp/institutions/:currency', () => {
    return HttpResponse.json({
      institutions: [
        { id: 'bank_1', name: 'Test Bank 1', code: 'TB1' },
        { id: 'bank_2', name: 'Test Bank 2', code: 'TB2' },
      ],
    });
  }),

  http.post('/api/offramp/verify-account', () => {
    return HttpResponse.json({ valid: true, accountName: 'Test User' });
  }),

  http.get('/api/offramp/rate', () => {
    return HttpResponse.json({ rate: 1598, currency: 'NGN', timestamp: Date.now() });
  }),

  http.post('/api/offramp/bridge/build-tx', () => {
    return HttpResponse.json({
      xdr: 'AAAAAgAAAAB...',
      sourceToken: { symbol: 'USDC', decimals: 7, chain: 'STELLAR' },
      destinationToken: { symbol: 'USDC', decimals: 6, chain: 'BASE' },
    });
  }),

  http.post('/api/offramp/bridge/submit-soroban', () => {
    return HttpResponse.json({ txHash: `tx_${Date.now()}`, status: 'submitted' });
  }),

  http.get('/api/offramp/bridge/status/:txHash', () => {
    return HttpResponse.json({ status: 'completed', bridgeAmount: '99.5' });
  }),

  http.post('/api/offramp/paycrest/order', () => {
    return HttpResponse.json({ orderId: `order_${Date.now()}`, status: 'pending' });
  }),

  http.get('/api/offramp/status/:orderId', () => {
    return HttpResponse.json({ status: 'completed', orderId: `order_${Date.now()}` });
  }),
];

// ============================================================================
// ERROR SCENARIO MOCKS (backed by fixtures)
// ============================================================================

export const errorHandlers = {
  paycrestError: http.post('https://api.paycrest.io/v1/sender/orders', () => {
    return HttpResponse.json(paycrestErrors.invalid_amount.body, {
      status: paycrestErrors.invalid_amount.status,
    });
  }),

  allbridgeTimeout: http.post('https://api.allbridge.io/v1/build-tx', () => {
    return HttpResponse.json(allbridgeErrorsData.timeout.body, {
      status: allbridgeErrorsData.timeout.status,
    });
  }),

  stellarNotFound: http.get('https://horizon.stellar.org/accounts/:address', () => {
    return HttpResponse.json({ error: 'Account not found' }, { status: 404 });
  }),

  offrampValidationError: http.post('/api/offramp/quote', () => {
    return HttpResponse.json({ error: 'Invalid amount' }, { status: 400 });
  }),
};

// ============================================================================
// MOCK DATA GENERATORS
// ============================================================================

export function generateMockPaycrestOrder(overrides?: Record<string, unknown>) {
  return { ...paycrestOrder, ...overrides };
}

export function generateMockBridgeQuote(overrides?: Record<string, unknown>) {
  return {
    sourceAmount: '100',
    destinationAmount: '99.5',
    fee: '0.5',
    estimatedTime: 300,
    ...overrides,
  };
}

export function generateMockStellarAccount(address: string, overrides?: Record<string, unknown>) {
  return {
    id: address,
    account_id: address,
    balances: [{ balance: '1000.0000000', asset_type: 'native' }],
    ...overrides,
  };
}

// ============================================================================
// MOCK VALIDATION
// ============================================================================

export function validateMockRequest(
  request: Request,
  expectedMethod: string,
  expectedPath: string,
): boolean {
  return request.method === expectedMethod && request.url.includes(expectedPath);
}

export function validateMockResponse(response: unknown, expectedFields: string[]): boolean {
  if (typeof response !== 'object' || response === null) return false;
  return expectedFields.every((field) => field in response);
}
