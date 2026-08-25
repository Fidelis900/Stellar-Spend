const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const rootDir = path.resolve(__dirname, '..');
const specPath = path.join(rootDir, 'openapi.yaml');
const publicYamlPath = path.join(rootDir, 'public', 'openapi.yaml');
const publicJsonPath = path.join(rootDir, 'public', 'openapi.json');

console.log('--- Generating OpenAPI Documentation & Syncing Routes ---');

// 1. Load existing openapi.yaml
let doc = yaml.load(fs.readFileSync(specPath, 'utf8'));

// 2. Ensure all Tags are present
const existingTagNames = new Set(doc.tags.map(t => t.name));
const requiredTags = [
  { name: 'health', description: 'Service health, readiness, liveness, and SLO status' },
  { name: 'offramp', description: 'Off-ramp operations: quotes, rates, execution, fees, and orders' },
  { name: 'onramp', description: 'On-ramp operations: fiat to crypto conversion and provider orders' },
  { name: 'bridge', description: 'Soroban bridge operations: build, submit, gas fees, and tracking' },
  { name: 'paycrest', description: 'Paycrest payout orders and settlement interactions' },
  { name: 'transactions', description: 'Transaction history, analytics, disputes, sharing, and splits' },
  { name: 'merchant', description: 'Merchant accounts, statistics, and payout management' },
  { name: 'api-keys', description: 'API key provisioning, rotation, usage, and scopes' },
  { name: 'auth', description: 'Two-factor authentication, recovery, and session management' },
  { name: 'security', description: 'Security audit logs, signatures, IP whitelist, and session controls' },
  { name: 'admin', description: 'Admin operations, dispute resolution, database, and vulnerabilities' },
  { name: 'webhooks', description: 'Webhook subscriptions, event deliveries, DLQ, and replays' },
  { name: 'sync', description: 'Client transaction history and settings cloud synchronization' },
  { name: 'monitoring', description: 'System telemetry, cache metrics, and web vitals' },
  { name: 'cron', description: 'Scheduled jobs, stall scanning, and recurring execution' },
  { name: 'fx-rates', description: 'Foreign exchange rate feeds and pricing quotes' },
  { name: 'notifications', description: 'User notification preferences and delivery logs' },
  { name: 'versions', description: 'API version discovery and compatibility metadata' }
];

requiredTags.forEach(t => {
  if (!existingTagNames.has(t.name)) {
    doc.tags.push(t);
    existingTagNames.add(t.name);
  }
});

// 3. Ensure components.schemas has all needed schema definitions
if (!doc.components) doc.components = {};
if (!doc.components.schemas) doc.components.schemas = {};

const additionalSchemas = {
  Transaction: {
    type: 'object',
    required: ['id', 'amount', 'currency', 'status', 'createdAt'],
    properties: {
      id: { type: 'string', example: 'tx_1234567890' },
      userAddress: { type: 'string', example: 'GCFX...ABCD' },
      amount: { type: 'string', example: '100.00' },
      currency: { type: 'string', example: 'NGN' },
      status: {
        type: 'string',
        enum: ['pending', 'building', 'signed', 'submitted', 'bridging', 'payout_pending', 'completed', 'failed', 'refunded'],
        example: 'completed'
      },
      stellarTxHash: { type: 'string', example: '5d1e...' },
      baseTxHash: { type: 'string', example: '0x12...' },
      recipient: { '$ref': '#/components/schemas/Recipient' },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' }
    }
  },
  Dispute: {
    type: 'object',
    required: ['id', 'transactionId', 'status', 'reason', 'createdAt'],
    properties: {
      id: { type: 'string', example: 'disp_12345' },
      transactionId: { type: 'string', example: 'tx_1234567890' },
      status: { type: 'string', enum: ['open', 'under_review', 'resolved', 'rejected'], example: 'open' },
      reason: { type: 'string', example: 'Bank account not credited after 24h' },
      evidenceUrl: { type: 'string', format: 'uri' },
      createdAt: { type: 'string', format: 'date-time' },
      resolvedAt: { type: 'string', format: 'date-time' }
    }
  },
  WebhookSubscription: {
    type: 'object',
    required: ['id', 'targetUrl', 'events', 'active', 'createdAt'],
    properties: {
      id: { type: 'string', example: 'sub_12345' },
      targetUrl: { type: 'string', format: 'uri', example: 'https://example.com/webhooks' },
      events: { type: 'array', items: { type: 'string' }, example: ['order.completed', 'order.failed'] },
      active: { type: 'boolean', example: true },
      createdAt: { type: 'string', format: 'date-time' }
    }
  },
  WebhookDelivery: {
    type: 'object',
    required: ['id', 'subscriptionId', 'event', 'statusCode', 'success', 'timestamp'],
    properties: {
      id: { type: 'string', example: 'deliv_123' },
      subscriptionId: { type: 'string', example: 'sub_12345' },
      event: { type: 'string', example: 'order.completed' },
      statusCode: { type: 'integer', example: 200 },
      success: { type: 'boolean', example: true },
      attemptCount: { type: 'integer', example: 1 },
      durationMs: { type: 'integer', example: 145 },
      timestamp: { type: 'string', format: 'date-time' }
    }
  },
  MerchantProfile: {
    type: 'object',
    required: ['id', 'businessName', 'email', 'status'],
    properties: {
      id: { type: 'string', example: 'merch_123' },
      businessName: { type: 'string', example: 'Acme Corp' },
      email: { type: 'string', format: 'email', example: 'finance@acme.com' },
      status: { type: 'string', enum: ['active', 'suspended', 'pending_kyc'], example: 'active' },
      webhookUrl: { type: 'string', format: 'uri' },
      createdAt: { type: 'string', format: 'date-time' }
    }
  },
  SloMetrics: {
    type: 'object',
    required: ['uptime', 'p99LatencyMs', 'errorRate'],
    properties: {
      uptime: { type: 'number', example: 99.98 },
      p99LatencyMs: { type: 'number', example: 120 },
      errorRate: { type: 'number', example: 0.001 }
    }
  },
  OfframpStatusResponse: {
    type: 'object',
    required: ['orderId', 'status'],
    properties: {
      orderId: { type: 'string', example: 'ord_1234567890' },
      status: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed', 'refunded'], example: 'completed' },
      amount: { type: 'string', example: '100.00' },
      currency: { type: 'string', example: 'NGN' },
      stellarTxHash: { type: 'string', example: '5d1e...' },
      payoutTxHash: { type: 'string', example: '0x12...' },
      updatedAt: { type: 'string', format: 'date-time' }
    }
  }
};

for (const [schemaName, schemaObj] of Object.entries(additionalSchemas)) {
  if (!doc.components.schemas[schemaName]) {
    doc.components.schemas[schemaName] = schemaObj;
  }
}

// Helper for standard response with $ref or object
function jsonResponse(description, schemaRef, statusCode = '200') {
  const schema = typeof schemaRef === 'string' ? { '$ref': schemaRef } : schemaRef;
  return {
    description,
    content: {
      'application/json': {
        schema
      }
    }
  };
}

function errorResponses() {
  return {
    '400': jsonResponse('Bad Request — validation failed or missing parameter', '#/components/schemas/Error', '400'),
    '401': jsonResponse('Unauthorized — invalid or missing credentials', '#/components/schemas/Error', '401'),
    '500': jsonResponse('Internal Server Error', '#/components/schemas/Error', '500')
  };
}

// 4. Add missing endpoints with accurate schemas
const additionalPaths = {
  // Health & SLO
  '/api/health/liveness': {
    get: {
      tags: ['health'],
      summary: 'Liveness probe',
      description: 'Kubernetes/load-balancer liveness check. Returns 200 if the process is alive.',
      operationId: 'getLiveness',
      responses: {
        '200': jsonResponse('Service is alive', {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', example: 'ok' },
            timestamp: { type: 'string', format: 'date-time' }
          }
        })
      }
    }
  },
  '/api/health/readiness': {
    get: {
      tags: ['health'],
      summary: 'Readiness probe',
      description: 'Checks database and upstream RPC connectivity before accepting traffic.',
      operationId: 'getReadiness',
      responses: {
        '200': jsonResponse('Service is ready', {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', example: 'ok' },
            database: { type: 'string', example: 'connected' },
            stellarRpc: { type: 'string', example: 'reachable' }
          }
        }),
        '503': jsonResponse('Service unavailable / dependencies failing', '#/components/schemas/Error', '503')
      }
    }
  },
  '/api/slo/status': {
    get: {
      tags: ['health'],
      summary: 'SLO and availability status',
      description: 'Reports current uptime, latency percentiles, and error budget consumption.',
      operationId: 'getSloStatus',
      responses: {
        '200': jsonResponse('SLO metrics report', '#/components/schemas/SloMetrics'),
        ...errorResponses()
      }
    }
  },

  // Offramp additional
  '/api/offramp/quote-aggregate': {
    post: {
      tags: ['offramp'],
      summary: 'Aggregate conversion quote',
      description: 'Returns quotes across multiple bridge and payment providers for rate comparison.',
      operationId: 'getAggregateQuote',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { '$ref': '#/components/schemas/QuoteRequest' }
          }
        }
      },
      responses: {
        '200': jsonResponse('Aggregate quotes', {
          type: 'object',
          required: ['quotes'],
          properties: {
            quotes: {
              type: 'array',
              items: { '$ref': '#/components/schemas/QuoteResponse' }
            }
          }
        }),
        ...errorResponses()
      }
    }
  },
  '/api/offramp/fees': {
    post: {
      tags: ['offramp'],
      summary: 'Calculate off-ramp fees',
      description: 'Calculates breakdown of network gas, bridge fee, and fiat payout fee.',
      operationId: 'calculateOfframpFees',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['amount', 'currency'],
              properties: {
                amount: { type: 'string', example: '100' },
                currency: { type: 'string', example: 'NGN' },
                feeMethod: { type: 'string', enum: ['USDC', 'XLM', 'stablecoin', 'native'], example: 'USDC' }
              }
            }
          }
        }
      },
      responses: {
        '200': jsonResponse('Fee breakdown', {
          type: 'object',
          required: ['bridgeFee', 'payoutFee', 'totalFee'],
          properties: {
            bridgeFee: { type: 'string', example: '0.50' },
            payoutFee: { type: 'string', example: '0.00' },
            totalFee: { type: 'string', example: '0.50' }
          }
        }),
        ...errorResponses()
      }
    }
  },
  '/api/offramp/execute-payout': {
    post: {
      tags: ['offramp'],
      summary: 'Trigger payout execution',
      description: 'Executes the Base USDC transfer to Paycrest settlement address for an active order.',
      operationId: 'executePayout',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['orderId'],
              properties: {
                orderId: { type: 'string', example: 'ord_1234567890' }
              }
            }
          }
        }
      },
      responses: {
        '200': jsonResponse('Payout execution result', {
          type: 'object',
          required: ['status', 'txHash'],
          properties: {
            status: { type: 'string', example: 'submitted' },
            txHash: { type: 'string', example: '0x1234567890abcdef' }
          }
        }),
        ...errorResponses()
      }
    }
  },
  '/api/offramp/tokens': {
    get: {
      tags: ['offramp'],
      summary: 'Supported tokens',
      description: 'Lists all supported tokens and assets on Stellar and destination chains.',
      operationId: 'getSupportedTokens',
      responses: {
        '200': jsonResponse('List of supported tokens', {
          type: 'object',
          required: ['tokens'],
          properties: {
            tokens: {
              type: 'array',
              items: {
                type: 'object',
                required: ['symbol', 'name', 'decimals', 'chain'],
                properties: {
                  symbol: { type: 'string', example: 'USDC' },
                  name: { type: 'string', example: 'USD Coin' },
                  decimals: { type: 'integer', example: 7 },
                  chain: { type: 'string', example: 'STELLAR' }
                }
              }
            }
          }
        })
      }
    }
  },

  // Onramp
  '/api/onramp/quote': {
    post: {
      tags: ['onramp'],
      summary: 'Get on-ramp quote',
      description: 'Calculates the estimated crypto to receive for a fiat deposit.',
      operationId: 'getOnrampQuote',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['fiatAmount', 'fiatCurrency'],
              properties: {
                fiatAmount: { type: 'string', example: '50000' },
                fiatCurrency: { type: 'string', example: 'NGN' },
                cryptoAsset: { type: 'string', example: 'USDC' }
              }
            }
          }
        }
      },
      responses: {
        '200': jsonResponse('Onramp quote', {
          type: 'object',
          required: ['cryptoAmount', 'rate', 'fiatAmount', 'fiatCurrency'],
          properties: {
            cryptoAmount: { type: 'string', example: '31.25' },
            rate: { type: 'number', example: 1600 },
            fiatAmount: { type: 'string', example: '50000' },
            fiatCurrency: { type: 'string', example: 'NGN' },
            fee: { type: 'string', example: '200' }
          }
        }),
        ...errorResponses()
      }
    }
  },
  '/api/onramp/order': {
    post: {
      tags: ['onramp'],
      summary: 'Create on-ramp order',
      description: 'Creates a new fiat on-ramp order with bank account deposit instructions.',
      operationId: 'createOnrampOrder',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['fiatAmount', 'fiatCurrency', 'destinationAddress'],
              properties: {
                fiatAmount: { type: 'string', example: '50000' },
                fiatCurrency: { type: 'string', example: 'NGN' },
                destinationAddress: { type: 'string', example: 'GCFX...ABCD' }
              }
            }
          }
        }
      },
      responses: {
        '201': jsonResponse('Onramp order created', {
          type: 'object',
          required: ['orderId', 'depositInstructions', 'status'],
          properties: {
            orderId: { type: 'string', example: 'onramp_12345' },
            status: { type: 'string', example: 'pending_payment' },
            depositInstructions: {
              type: 'object',
              properties: {
                bankName: { type: 'string', example: 'Wema Bank' },
                accountNumber: { type: 'string', example: '9988776655' },
                accountName: { type: 'string', example: 'Paycrest Settlement' }
              }
            }
          }
        }),
        ...errorResponses()
      }
    }
  },
  '/api/onramp/order/{orderId}': {
    get: {
      tags: ['onramp'],
      summary: 'Get on-ramp order status',
      description: 'Polls the status of an ongoing on-ramp order.',
      operationId: 'getOnrampOrderStatus',
      parameters: [
        {
          name: 'orderId',
          in: 'path',
          required: true,
          schema: { type: 'string' }
        }
      ],
      responses: {
        '200': jsonResponse('Onramp order status', {
          type: 'object',
          required: ['orderId', 'status'],
          properties: {
            orderId: { type: 'string', example: 'onramp_12345' },
            status: { type: 'string', enum: ['pending_payment', 'processing', 'completed', 'failed'] },
            txHash: { type: 'string' }
          }
        }),
        ...errorResponses()
      }
    }
  },

  // Merchant
  '/api/merchant': {
    get: {
      tags: ['merchant'],
      summary: 'Get merchant profile',
      description: 'Fetches merchant profile and business details.',
      operationId: 'getMerchantProfile',
      responses: {
        '200': jsonResponse('Merchant profile', '#/components/schemas/MerchantProfile'),
        ...errorResponses()
      }
    },
    post: {
      tags: ['merchant'],
      summary: 'Create/update merchant profile',
      description: 'Registers or updates a merchant profile.',
      operationId: 'createMerchantProfile',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['businessName', 'email'],
              properties: {
                businessName: { type: 'string', example: 'Acme Corp' },
                email: { type: 'string', format: 'email', example: 'finance@acme.com' }
              }
            }
          }
        }
      },
      responses: {
        '200': jsonResponse('Merchant saved', {
          type: 'object',
          required: ['id', 'status'],
          properties: {
            id: { type: 'string', example: 'merch_123' },
            status: { type: 'string', example: 'active' }
          }
        }),
        ...errorResponses()
      }
    }
  },
  '/api/merchant/payouts': {
    get: {
      tags: ['merchant'],
      summary: 'List merchant payouts',
      description: 'Returns historical merchant payouts and bulk settlement batches.',
      operationId: 'listMerchantPayouts',
      responses: {
        '200': jsonResponse('Payouts list', {
          type: 'object',
          required: ['payouts'],
          properties: {
            payouts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  amount: { type: 'string' },
                  currency: { type: 'string' },
                  status: { type: 'string' }
                }
              }
            }
          }
        }),
        ...errorResponses()
      }
    },
    post: {
      tags: ['merchant'],
      summary: 'Initiate bulk merchant payout',
      description: 'Triggers a batch payout to multiple recipient bank accounts.',
      operationId: 'createMerchantPayout',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['recipients'],
              properties: {
                recipients: {
                  type: 'array',
                  items: { '$ref': '#/components/schemas/Recipient' }
                }
              }
            }
          }
        }
      },
      responses: {
        '200': jsonResponse('Batch created', {
          type: 'object',
          required: ['batchId', 'totalAmount', 'count'],
          properties: {
            batchId: { type: 'string' },
            totalAmount: { type: 'string' },
            count: { type: 'integer' }
          }
        }),
        ...errorResponses()
      }
    }
  },
  '/api/merchant/stats': {
    get: {
      tags: ['merchant'],
      summary: 'Merchant volume statistics',
      description: 'Returns aggregated volume, completed orders, and fee metrics.',
      operationId: 'getMerchantStats',
      responses: {
        '200': jsonResponse('Merchant statistics', {
          type: 'object',
          required: ['totalVolumeUsd', 'totalOrders', 'settledCount'],
          properties: {
            totalVolumeUsd: { type: 'number', example: 125000 },
            totalOrders: { type: 'integer', example: 450 },
            settledCount: { type: 'integer', example: 448 }
          }
        }),
        ...errorResponses()
      }
    }
  },

  // API Keys Scope management
  '/api/api-keys/{id}/scopes': {
    get: {
      tags: ['api-keys'],
      summary: 'Get API key scopes',
      description: 'Returns the permission scopes attached to a specific API key.',
      operationId: 'getApiKeyScopes',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        '200': jsonResponse('API key scopes', {
          type: 'object',
          required: ['keyId', 'scopes'],
          properties: {
            keyId: { type: 'string' },
            scopes: { type: 'array', items: { type: 'string' } }
          }
        }),
        ...errorResponses()
      }
    },
    put: {
      tags: ['api-keys'],
      summary: 'Update API key scopes',
      description: 'Updates allowed permission scopes for the specified API key.',
      operationId: 'updateApiKeyScopes',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['scopes'],
              properties: {
                scopes: { type: 'array', items: { type: 'string' } }
              }
            }
          }
        }
      },
      responses: {
        '200': jsonResponse('Scopes updated', {
          type: 'object',
          required: ['keyId', 'scopes'],
          properties: {
            keyId: { type: 'string' },
            scopes: { type: 'array', items: { type: 'string' } }
          }
        }),
        ...errorResponses()
      }
    }
  },

  // Transactions analytics and disputes
  '/api/transactions/analytics': {
    get: {
      tags: ['transactions'],
      summary: 'Transaction analytics',
      description: 'Returns historical transaction velocity, currency distribution, and success rates.',
      operationId: 'getTransactionAnalytics',
      responses: {
        '200': jsonResponse('Analytics data', {
          type: 'object',
          required: ['totalVolume', 'successRate', 'averageSettlementSeconds'],
          properties: {
            totalVolume: { type: 'number' },
            successRate: { type: 'number' },
            averageSettlementSeconds: { type: 'number' }
          }
        }),
        ...errorResponses()
      }
    }
  },
  '/api/transactions/search': {
    get: {
      tags: ['transactions'],
      summary: 'Search transactions',
      description: 'Performs multi-field search across transactions by hash, recipient, or date.',
      operationId: 'searchTransactions',
      parameters: [
        { name: 'q', in: 'query', schema: { type: 'string' } },
        { name: 'currency', in: 'query', schema: { type: 'string' } },
        { name: 'status', in: 'query', schema: { type: 'string' } }
      ],
      responses: {
        '200': jsonResponse('Search results', {
          type: 'object',
          required: ['results', 'count'],
          properties: {
            results: { type: 'array', items: { '$ref': '#/components/schemas/Transaction' } },
            count: { type: 'integer' }
          }
        }),
        ...errorResponses()
      }
    }
  },
  '/api/transactions/disputes': {
    get: {
      tags: ['transactions'],
      summary: 'List transaction disputes',
      description: 'Returns all open and resolved transaction disputes.',
      operationId: 'listDisputes',
      responses: {
        '200': jsonResponse('Dispute list', {
          type: 'object',
          required: ['disputes'],
          properties: {
            disputes: {
              type: 'array',
              items: { '$ref': '#/components/schemas/Dispute' }
            }
          }
        }),
        ...errorResponses()
      }
    },
    post: {
      tags: ['transactions'],
      summary: 'Create dispute',
      description: 'Opens a dispute on an unfulfilled or delayed transaction.',
      operationId: 'createDispute',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['transactionId', 'reason'],
              properties: {
                transactionId: { type: 'string' },
                reason: { type: 'string' },
                evidenceUrl: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        '201': jsonResponse('Dispute opened', {
          type: 'object',
          required: ['disputeId', 'status'],
          properties: {
            disputeId: { type: 'string' },
            status: { type: 'string', example: 'open' }
          }
        }),
        ...errorResponses()
      }
    }
  },

  // Webhook management
  '/api/webhooks/subscriptions': {
    get: {
      tags: ['webhooks'],
      summary: 'List webhook subscriptions',
      description: 'Returns active webhook event listener endpoints registered for the account.',
      operationId: 'listWebhookSubscriptions',
      responses: {
        '200': jsonResponse('Subscription list', {
          type: 'object',
          required: ['subscriptions'],
          properties: {
            subscriptions: {
              type: 'array',
              items: { '$ref': '#/components/schemas/WebhookSubscription' }
            }
          }
        }),
        ...errorResponses()
      }
    },
    post: {
      tags: ['webhooks'],
      summary: 'Create webhook subscription',
      description: 'Registers a new HTTPS endpoint to receive asynchronous transaction events.',
      operationId: 'createWebhookSubscription',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['targetUrl', 'events'],
              properties: {
                targetUrl: { type: 'string', format: 'uri' },
                events: { type: 'array', items: { type: 'string' } }
              }
            }
          }
        }
      },
      responses: {
        '201': jsonResponse('Subscription registered', {
          type: 'object',
          required: ['id', 'secret'],
          properties: {
            id: { type: 'string' },
            secret: { type: 'string', description: 'HMAC secret used to verify webhook signatures' }
          }
        }),
        ...errorResponses()
      }
    }
  },
  '/api/webhooks/delivery-log': {
    get: {
      tags: ['webhooks'],
      summary: 'Webhook delivery logs',
      description: 'Returns recent webhook delivery attempts, HTTP status codes, and latencies.',
      operationId: 'getWebhookDeliveryLogs',
      responses: {
        '200': jsonResponse('Delivery log entries', {
          type: 'object',
          required: ['deliveries'],
          properties: {
            deliveries: {
              type: 'array',
              items: { '$ref': '#/components/schemas/WebhookDelivery' }
            }
          }
        }),
        ...errorResponses()
      }
    }
  },

  // Sync routes
  '/api/v1/sync/history': {
    get: {
      tags: ['sync'],
      summary: 'Retrieve synced history',
      description: 'Fetches encrypted client transaction records for backup/recovery.',
      operationId: 'getSyncHistory',
      responses: {
        '200': jsonResponse('Synced transaction history', {
          type: 'object',
          required: ['transactions'],
          properties: {
            transactions: { type: 'array', items: { '$ref': '#/components/schemas/Transaction' } }
          }
        }),
        ...errorResponses()
      }
    },
    post: {
      tags: ['sync'],
      summary: 'Push sync history',
      description: 'Syncs locally recorded client transactions to cloud storage.',
      operationId: 'pushSyncHistory',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['transactions'],
              properties: {
                transactions: { type: 'array', items: { '$ref': '#/components/schemas/Transaction' } }
              }
            }
          }
        }
      },
      responses: {
        '200': jsonResponse('Sync confirmed', {
          type: 'object',
          required: ['syncedCount'],
          properties: {
            syncedCount: { type: 'integer' }
          }
        }),
        ...errorResponses()
      }
    }
  },
  '/api/v1/sync/settings': {
    get: {
      tags: ['sync'],
      summary: 'Get user preferences',
      description: 'Fetches cloud-synced user configuration, default currencies, and theme.',
      operationId: 'getSyncSettings',
      responses: {
        '200': jsonResponse('Settings configuration', {
          type: 'object',
          required: ['settings'],
          properties: {
            settings: { type: 'object' }
          }
        }),
        ...errorResponses()
      }
    },
    post: {
      tags: ['sync'],
      summary: 'Save user preferences',
      description: 'Saves user preferences to cloud storage.',
      operationId: 'saveSyncSettings',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['settings'],
              properties: {
                settings: { type: 'object' }
              }
            }
          }
        }
      },
      responses: {
        '200': jsonResponse('Settings saved', {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', example: 'saved' }
          }
        }),
        ...errorResponses()
      }
    }
  },

  // Versioned v1 parity
  '/api/v1/offramp/quote-aggregate': {
    post: {
      tags: ['offramp'],
      summary: 'Aggregate conversion quote (v1)',
      description: 'Returns quotes across multiple providers under versioned /v1/ route.',
      operationId: 'getAggregateQuoteV1',
      security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { '$ref': '#/components/schemas/QuoteRequest' }
          }
        }
      },
      responses: {
        '200': jsonResponse('Aggregate quotes', {
          type: 'object',
          required: ['quotes'],
          properties: {
            quotes: { type: 'array', items: { '$ref': '#/components/schemas/QuoteResponse' } }
          }
        }),
        ...errorResponses()
      }
    }
  },
  '/api/v1/offramp/fees': {
    post: {
      tags: ['offramp'],
      summary: 'Calculate off-ramp fees (v1)',
      description: 'Calculates offramp fee breakdown under /v1/ route.',
      operationId: 'calculateOfframpFeesV1',
      security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['amount', 'currency'],
              properties: {
                amount: { type: 'string', example: '100' },
                currency: { type: 'string', example: 'NGN' }
              }
            }
          }
        }
      },
      responses: {
        '200': jsonResponse('Fee breakdown', {
          type: 'object',
          required: ['bridgeFee', 'payoutFee', 'totalFee'],
          properties: {
            bridgeFee: { type: 'string' },
            payoutFee: { type: 'string' },
            totalFee: { type: 'string' }
          }
        }),
        ...errorResponses()
      }
    }
  },
  '/api/v1/offramp/rate': {
    get: {
      tags: ['offramp'],
      summary: 'Get live spot rate (v1)',
      description: 'Returns spot FX conversion rate under /v1/ route.',
      operationId: 'getSpotRateV1',
      security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
      responses: {
        '200': jsonResponse('Spot rate', {
          type: 'object',
          required: ['rate', 'pair'],
          properties: {
            rate: { type: 'number', example: 1598 },
            pair: { type: 'string', example: 'USDC/NGN' }
          }
        }),
        ...errorResponses()
      }
    }
  },
  '/api/v1/offramp/paycrest/order': {
    post: {
      tags: ['paycrest'],
      summary: 'Create Paycrest payout order (v1)',
      description: 'Creates payout order under /v1/ route.',
      operationId: 'createPaycrestOrderV1',
      security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { '$ref': '#/components/schemas/CreateOrderRequest' }
          }
        }
      },
      responses: {
        '201': jsonResponse('Order created', { '$ref': '#/components/schemas/CreateOrderResponse' }, '201'),
        ...errorResponses()
      }
    }
  },
  '/api/v1/offramp/paycrest/order/{orderId}': {
    get: {
      tags: ['paycrest'],
      summary: 'Get Paycrest order status (v1)',
      description: 'Polls status of payout order under /v1/ route.',
      operationId: 'getPaycrestOrderStatusV1',
      security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
      parameters: [{ name: 'orderId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        '200': jsonResponse('Order status', { '$ref': '#/components/schemas/OrderStatusResponse' }),
        ...errorResponses()
      }
    }
  },
  '/api/v1/offramp/status/{orderId}': {
    get: {
      tags: ['offramp'],
      summary: 'Get off-ramp order status (v1)',
      description: 'Polls complete status under /v1/ route.',
      operationId: 'getOfframpOrderStatusV1',
      security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
      parameters: [{ name: 'orderId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        '200': jsonResponse('Off-ramp status', { '$ref': '#/components/schemas/OfframpStatusResponse' }),
        ...errorResponses()
      }
    }
  },
  '/api/v1/offramp/bridge/status/{txHash}': {
    get: {
      tags: ['bridge'],
      summary: 'Poll Allbridge bridge status (v1)',
      description: 'Polls cross-chain bridge transfer status under /v1/ route.',
      operationId: 'getBridgeStatusV1',
      security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
      parameters: [{ name: 'txHash', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        '200': jsonResponse('Bridge status', { '$ref': '#/components/schemas/BridgeStatusResponse' }),
        ...errorResponses()
      }
    }
  },
  '/api/v1/offramp/bridge/tx-status/{hash}': {
    get: {
      tags: ['bridge'],
      summary: 'Poll Stellar on-chain status (v1)',
      description: 'Polls on-chain Soroban submission status under /v1/ route.',
      operationId: 'getStellarTxStatusV1',
      security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
      parameters: [{ name: 'hash', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        '200': jsonResponse('Stellar tx status', { '$ref': '#/components/schemas/TxStatusResponse' }),
        ...errorResponses()
      }
    }
  }
};

// Merge additional paths
for (const [pathKey, pathObj] of Object.entries(additionalPaths)) {
  if (!doc.paths[pathKey]) {
    doc.paths[pathKey] = pathObj;
  } else {
    for (const [method, op] of Object.entries(pathObj)) {
      if (!doc.paths[pathKey][method]) {
        doc.paths[pathKey][method] = op;
      }
    }
  }
}

// 5. Validate all $refs
function validateRefs(node, location = '') {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((item, i) => validateRefs(item, `${location}[${i}]`));
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === '$ref') {
      if (typeof value === 'string' && value.startsWith('#/')) {
        const parts = value.replace(/^#\//, '').split('/');
        let cur = doc;
        for (const p of parts) {
          cur = cur?.[p];
        }
        if (cur === undefined) {
          throw new Error(`Unresolved $ref: ${value} at ${location}`);
        }
      }
    } else {
      validateRefs(value, `${location}.${key}`);
    }
  }
}

validateRefs(doc);

// 6. Serialize and write outputs
const yamlOutput = yaml.dump(doc, {
  lineWidth: 120,
  noRefs: true,
  sortKeys: false
});

fs.writeFileSync(specPath, yamlOutput, 'utf8');
console.log(`Saved formatted OpenAPI spec to: ${specPath}`);

// Ensure public directory exists
const publicDir = path.join(rootDir, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Sync public/openapi.yaml
fs.writeFileSync(publicYamlPath, yamlOutput, 'utf8');
console.log(`Published static YAML to: ${publicYamlPath}`);

// Sync public/openapi.json
const jsonOutput = JSON.stringify(doc, null, 2);
fs.writeFileSync(publicJsonPath, jsonOutput, 'utf8');
console.log(`Published static JSON to: ${publicJsonPath}`);

console.log(`Total documented OpenAPI endpoints: ${Object.keys(doc.paths).length}`);
console.log('OpenAPI sync complete!');
