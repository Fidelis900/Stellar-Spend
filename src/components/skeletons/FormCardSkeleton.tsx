import { SkeletonBase } from "./SkeletonBase";

/**
 * Full-form skeleton shown while the form is initialising
 * (e.g. wallet connecting, currencies loading on first mount).
 */
export function FormCardSkeleton() {
  return (
    <section
      aria-label="Loading offramp form"
      aria-busy="true"
      className="bg-panel border border-line p-6 flex flex-col gap-6"
    >
      {/* Amount row */}
      <div className="flex flex-col gap-1.5">
        <SkeletonBase width={80} height={10} aria-label="Loading label…" />
        <SkeletonBase width="100%" height={42} aria-label="Loading amount input…" />
      </div>

      {/* Fee method row */}
      <div className="flex flex-col gap-1.5">
        <SkeletonBase width={100} height={10} aria-label="Loading label…" />
        <div className="flex gap-2">
          <SkeletonBase width="50%" height={44} aria-label="Loading fee option…" />
          <SkeletonBase width="50%" height={44} aria-label="Loading fee option…" />
        </div>
      </div>

      {/* Currency + Bank row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <SkeletonBase width={60} height={10} aria-label="Loading label…" />
          <SkeletonBase width="100%" height={42} aria-label="Loading currency select…" />
        </div>
        <div className="flex flex-col gap-1.5">
          <SkeletonBase width={120} height={10} aria-label="Loading label…" />
          <SkeletonBase width="100%" height={42} aria-label="Loading bank select…" />
        </div>
      </div>

      {/* Account number */}
      <div className="flex flex-col gap-1.5">
        <SkeletonBase width={110} height={10} aria-label="Loading label…" />
        <SkeletonBase width="100%" height={42} aria-label="Loading account number input…" />
      </div>

      {/* Account name */}
      <div className="flex flex-col gap-1.5">
        <SkeletonBase width={90} height={10} aria-label="Loading label…" />
        <SkeletonBase width="100%" height={42} aria-label="Loading account name…" />
      </div>

      {/* CTA button */}
      <SkeletonBase width="100%" height={52} aria-label="Loading submit button…" />
    </section>
  );
}
