#467 [Backend] Implement GraphQL API layer
Repo Avatar
Lex-Studios/Stellar-Spend
Description:
Add GraphQL API alongside REST for more flexible data fetching.

Tasks:

Install and configure Apollo Server
Create GraphQL schema for transactions
Implement resolvers for queries
Add mutations for transaction operations
Implement subscriptions for real-time updates
Add GraphQL playground
Document GraphQL API
Add authentication to GraphQL endpoints

#468 [Backend] Add Redis caching layer
Repo Avatar
Lex-Studios/Stellar-Spend
Description:
Implement Redis caching to improve API performance and reduce external API calls.

Tasks:

Set up Redis client configuration
Implement cache for Paycrest rates
Add cache for Allbridge quotes
Cache currency and institution lists
Implement cache invalidation strategy
Add cache hit/miss metrics
Configure cache TTL per endpoint
Add cache warming on startup

#469 [Backend] Implement request throttling per user
Repo Avatar
Lex-Studios/Stellar-Spend
Description:
Add per-user request throttling to prevent abuse.

Tasks:

Enhance rate limiter in src/lib/offramp/utils/rate-limiter.ts
Implement user-based rate limiting
Add IP-based rate limiting
Implement sliding window algorithm
Add rate limit headers to responses
Store rate limit data in Redis
Add rate limit bypass for premium users
Log rate limit violations

#470 [Backend] Add webhook retry mechanism
Repo Avatar
Lex-Studios/Stellar-Spend
Description:
Implement robust retry mechanism for failed webhook deliveries.

Tasks:

Enhance src/lib/webhook/dispatcher.ts
Implement exponential backoff
Add maximum retry attempts configuration
Store failed webhooks in dead letter queue
Add webhook replay functionality
Implement webhook delivery status tracking
Add webhook failure notifications
Create webhook retry dashboard
