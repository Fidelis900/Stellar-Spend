# Architecture Diagrams

All diagrams on this page are the **single source of truth** for the system architecture.
They are checked in CI via `scripts/check-diagrams.sh` — never let them drift from the real code.

> When you change the architecture (new service, new external dependency, new data flow),
> update the relevant diagram below and run `bash scripts/check-diagrams.sh` locally to verify.

---

## System Overview

Shows every major component and how they connect.

```mermaid
graph TB
    subgraph Browser["User Browser"]
        FE[Next.js Frontend<br/>React 19 / Tailwind]
        FW[Freighter Wallet<br/>Extension]
        LW[Lobstr Wallet<br/>Extension]
    end

    subgraph Server["Stellar-Spend Server (Next.js 15 App Router)"]
        MW[Edge Middleware<br/>CORS · Rate Limit · Versioning]
        AR[API Routes<br/>src/app/api/]
        SVC[Services & Adapters<br/>src/lib/]
        DB[(PostgreSQL<br/>Transactions · API Keys<br/>Idempotency)]
    end

    subgraph Stellar["Stellar Network"]
        HR[Horizon RPC<br/>Account / Trustline]
        SR[Soroban RPC<br/>Smart Contract TX]
        SC[Allbridge<br/>Soroban Contract<br/>USDC Lock]
    end

    subgraph Bridge["Allbridge Protocol"]
        AB[Allbridge SDK<br/>Quote · Build · Status]
    end

    subgraph Base["Base Chain (EVM L2)"]
        BC[Base RPC<br/>viem]
        USDC[USDC ERC-20<br/>Contract]
    end

    subgraph Paycrest["Paycrest Settlement"]
        PC[Paycrest API<br/>Order · Rate · Status]
        WH[Paycrest Webhook<br/>Events]
    end

    subgraph Bank["Beneficiary"]
        BK[Bank Account<br/>NGN · KES · GHS …]
    end

    FE -->|1 Signs XDR| FW
    FE -->|1 Signs XDR| LW
    FW -->|Signed XDR| FE
    LW -->|Signed XDR| FE

    FE -->|REST API| MW
    MW --> AR
    AR --> SVC
    SVC --> DB

    SVC -->|Build TX / Status| AB
    AB -->|Chain Details| SR
    AB --> SC

    SVC -->|Submit TX| SR
    SR --> SC

    SVC -->|Account Lookup| HR

    SVC -->|USDC Transfer| BC
    BC --> USDC

    SVC -->|Create Order / Status| PC
    WH -->|Settled · Refunded events| AR

    PC -->|Fiat Payout| BK
    USDC -->|USDC on Base| PC
```

---

## Off-Ramp Data Flow

End-to-end sequence for a user converting Stellar USDC to fiat.

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant F as Frontend
    participant A as API Server
    participant AB as Allbridge
    participant SR as Soroban RPC
    participant B as Base Chain
    participant PC as Paycrest
    participant BK as Bank

    U->>F: Enter amount + bank details
    F->>A: POST /api/offramp/quote
    A->>PC: getRate()
    PC-->>A: FX rate
    A-->>F: {rate, destinationAmount, expiresIn}

    F->>A: POST /api/offramp/bridge/build-tx
    A->>AB: buildSwapAndBridgeTx()
    AB->>SR: simulate()
    SR-->>AB: XDR
    A-->>F: {xdr}

    F->>U: Request wallet signature
    U->>F: Signed XDR

    F->>A: POST /api/offramp/bridge/submit-soroban
    A->>SR: sendTransaction(signedXdr)
    SR-->>A: {hash}
    A-->>F: {status: PENDING, hash}

    loop Poll Soroban
        F->>A: GET /api/offramp/bridge/tx-status/:hash
        A->>SR: getTransaction(hash)
        SR-->>A: SUCCESS
    end

    A->>PC: createOrder({amount, rate, recipient})
    PC-->>A: {id, receiveAddress}
    A->>B: transferUSDC(receiveAddress)
    B-->>A: confirmed

    loop Poll Paycrest
        F->>A: GET /api/offramp/paycrest/order/:id
        A->>PC: getOrderStatus()
        PC-->>A: settled
    end

    PC->>BK: Fiat bank transfer
    F-->>U: ✅ Transfer complete
```

---

## Quote Flow

```mermaid
flowchart LR
    A([User]) -->|amount + currency| B[POST /api/offramp/quote]
    B -->|getRate| C[PaycrestAdapter]
    B -->|getFeeOptions| D[AllbridgeAdapter]
    C --> E[Paycrest API]
    D --> F[Allbridge SDK]
    E -->|FX rate| B
    F -->|bridge fee| B
    B -->|destinationAmount, rate, fees| A
```

---

## Bridge Flow

```mermaid
flowchart TD
    A([User signs XDR]) --> B[POST /api/offramp/bridge/submit-soroban]
    B --> C[Soroban RPC — sendTransaction]
    C --> D{status?}
    D -->|PENDING / SUCCESS| E[Poll tx-status/:hash]
    D -->|ERROR| F[Return error to client]
    E --> G{confirmed?}
    G -->|SUCCESS| H[Allbridge detects deposit]
    G -->|FAILED| I[Return failure to client]
    H --> J[USDC released on Base]
    J --> K[Server sends USDC to Paycrest]
```

---

## Payout Flow

```mermaid
flowchart TD
    A[POST /api/offramp/paycrest/order] --> B{Idempotency check}
    B -->|replayed| C[Return cached response]
    B -->|new| D[Validate request]
    D --> E[PaycrestAdapter.createOrder]
    E --> F[Paycrest API]
    F --> G[{id, receiveAddress}]
    G --> H[BaseClient.transferUSDC to receiveAddress]
    H --> I[Base chain confirmed]
    I --> J[Poll /paycrest/order/:id]
    J --> K{status?}
    K -->|settled| L[✅ Fiat delivered]
    K -->|refunded| M[↩️ USDC returned]
    K -->|expired| N[⏱️ No deposit received]
```

---

## Refund Flow

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant F as Frontend
    participant A as API Server
    participant RS as RefundService
    participant SR as Soroban RPC
    participant DB as Database

    U->>F: Request refund
    F->>A: POST /api/offramp/refund {orderId}
    A->>DB: getTransaction(orderId)
    DB-->>A: transaction record

    A->>RS: isRefundEligible(transaction)
    alt Not eligible (already refunded / settled / outside window)
        RS-->>A: ineligible
        A-->>F: 400 {error: "Not eligible for refund"}
    else Eligible
        RS-->>A: eligible
        A->>RS: processRefund(transaction)
        RS->>SR: submitRefundTransaction()
        SR-->>RS: {hash}
        RS->>DB: updateReversalStatus(REFUNDED)
        RS-->>A: {success, hash}
        A-->>F: 200 {success: true, hash}
        F-->>U: ↩️ Refund initiated
    end

    Note over SR,DB: Paycrest webhook (payment_order.refunded)<br/>also triggers DB update via /api/webhooks/paycrest
```

---

## Webhook Event Flow

```mermaid
flowchart LR
    PC[Paycrest API] -->|POST /api/webhooks/paycrest| WH[Webhook Handler]
    WH --> V{Verify HMAC-SHA256}
    V -->|invalid| R[401 Unauthorized]
    V -->|valid| P[Parse event]
    P --> E{event type?}
    E -->|payment_order.settled| S[Update TX status → COMPLETED]
    E -->|payment_order.refunded| RF[Update TX status → REFUNDED]
    E -->|payment_order.expired| EX[Update TX status → FAILED]
    S & RF & EX --> N[Emit notification event]
    N --> NS[NotificationService → Email / SMS / Push]
```
