/**
 * Environment variable type declarations
 * This helps with TypeScript intellisense and type checking
 */

declare namespace NodeJS {
  interface ProcessEnv {
    // Server-side only variables
    PAYCREST_API_KEY: string;
    PAYCREST_WEBHOOK_SECRET: string;
    BASE_PRIVATE_KEY: string;
    BASE_RETURN_ADDRESS: string;
    BASE_RPC_URL: string;
    STELLAR_SOROBAN_RPC_URL: string;
    STELLAR_HORIZON_URL: string;

    // Public variables (available in browser)
    NEXT_PUBLIC_BASE_RETURN_ADDRESS: string;
    NEXT_PUBLIC_STELLAR_USDC_ISSUER: string;
  }
}
