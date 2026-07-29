'use client';

/**
 * Skip Links Component
 * Provides keyboard navigation shortcuts to jump to main content areas
 */

export function SkipLinks() {
  const handleSkipTo = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.focus();
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="sr-only focus-within:not-sr-only">
      <nav aria-label="Skip links">
        <ul className="flex flex-col gap-2 p-4 bg-blue-600 text-white">
          <li>
            <button
              onClick={() => handleSkipTo('main-content')}
              className="underline hover:no-underline"
            >
              Skip to main content
            </button>
          </li>
          <li>
            <button
              onClick={() => handleSkipTo('form-section')}
              className="underline hover:no-underline"
            >
              Skip to form
            </button>
          </li>
          <li>
            <button
              onClick={() => handleSkipTo('transaction-history')}
              className="underline hover:no-underline"
            >
              Skip to transaction history
            </button>
          </li>
          <li>
            <button onClick={() => handleSkipTo('footer')} className="underline hover:no-underline">
              Skip to footer
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}

/**
 * Utility class for screen reader only content
 * Add to your globals.css:
 *
 * .sr-only {
 *   position: absolute;
 *   width: 1px;
 *   height: 1px;
 *   padding: 0;
 *   margin: -1px;
 *   overflow: hidden;
 *   clip: rect(0, 0, 0, 0);
 *   white-space: nowrap;
 *   border-width: 0;
 * }
 *
 * .focus-within\:not-sr-only:focus-within {
 *   position: static;
 *   width: auto;
 *   height: auto;
 *   padding: inherit;
 *   margin: inherit;
 *   overflow: visible;
 *   clip: auto;
 *   white-space: normal;
 * }
 */
