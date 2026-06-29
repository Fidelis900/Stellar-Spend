/**
 * Features - Server Component
 * Static feature descriptions rendered on server
 */

export default function Features() {
  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(20rem,0.7fr)]">
      <div className="racing-border-wrapper rounded-[1.75rem]">
        <div className="racing-border-content flex h-full flex-col justify-between rounded-[calc(1.75rem-2px)] border border-line/70 p-6 sm:p-8">
          <div className="space-y-4">
            <p className="font-space-grotesk text-xs font-medium uppercase tracking-[0.3em] text-accent">
              Key Features
            </p>
            <h2 className="font-space-grotesk text-2xl font-semibold text-text">
              Seamless Cross-Chain Off-Ramp
            </h2>
            <p className="max-w-2xl text-sm leading-7 text-muted">
              Connect your Stellar wallet, enter payout details, and receive fiat directly to 
              your bank account. Powered by Allbridge for cross-chain transfers and Paycrest 
              for fiat settlement.
            </p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-line/80 bg-bg/70 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted">Security</p>
              <p className="mt-3 font-space-grotesk text-base text-text">Non-custodial</p>
            </div>
            <div className="rounded-2xl border border-line/80 bg-bg/70 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted">Coverage</p>
              <p className="mt-3 font-space-grotesk text-base text-text">Global</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div className="rounded-[1.75rem] border border-line/70 bg-panel/90 p-6">
          <div className="flex items-center justify-between">
            <p className="font-space-grotesk text-lg font-medium text-text">
              Real-time Tracking
            </p>
            <div className="animate-spin-slow rounded-full border border-accent/40 p-2">
              <div className="h-4 w-4 rounded-full bg-accent" />
            </div>
          </div>
          <p className="mt-4 text-sm leading-7 text-muted">
            Monitor your transaction status in real-time, from Stellar bridge to final 
            bank settlement.
          </p>
        </div>

        <div className="rounded-[1.75rem] border border-line/70 bg-bg/70 p-6">
          <p className="font-space-grotesk text-lg font-medium text-text">Multi-Currency</p>
          <p className="mt-3 text-sm leading-7 text-muted">
            Support for USDC and USDT on Stellar, with conversion to multiple fiat currencies.
          </p>
        </div>
      </div>
    </section>
  );
}
