/**
 * Hero - Server Component
 * Static content rendered on the server, no JavaScript shipped to client
 */

export default function Hero() {
  return (
    <section className="animate-scale-in rounded-[2rem] border border-line/70 bg-panel/80 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur md:p-10">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl space-y-4">
          <p className="font-space-grotesk text-sm font-medium uppercase tracking-[0.35em] text-accent">
            Stellar Off-Ramp
          </p>
          <div className="space-y-3">
            <h1 className="font-space-grotesk text-4xl font-semibold tracking-tight sm:text-5xl">
              Stellar-Spend
            </h1>
            <p className="max-w-xl text-sm leading-7 text-muted sm:text-base">
              Convert your Stellar stablecoins (USDC, USDT) to fiat currencies seamlessly 
              through Allbridge and Paycrest integrations.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-full border border-line bg-bg/60 px-4 py-3 text-sm text-muted">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_18px_rgba(201,169,98,0.85)]" />
          Production Ready
        </div>
      </div>
    </section>
  );
}
