# Accessibility Guide

Stellar-Spend targets **WCAG 2.1 Level AA** compliance. This guide is the engineering-facing playbook: what to do when building a component, how to test it, and where the existing patterns live.

For a higher-level audit of features already implemented, see [`ACCESSIBILITY.md`](../ACCESSIBILITY.md) at the repo root.

## Table of Contents

- [WCAG 2.1 Level AA Compliance](#wcag-21-level-aa-compliance)
- [Keyboard Navigation](#keyboard-navigation)
- [Screen Reader Support](#screen-reader-support)
- [ARIA Labels](#aria-labels)
- [Color Contrast](#color-contrast)
- [Accessible Forms](#accessible-forms)
- [Focus Management](#focus-management)
- [Motion and Animation](#motion-and-animation)
- [Testing](#testing)
- [Component Checklist](#component-checklist)

## WCAG 2.1 Level AA Compliance

WCAG groups requirements into four principles — **Perceivable, Operable, Understandable, Robust** (POUR). The Level AA criteria most often missed in PRs:

| Criterion                    | What it means in practice                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships | Use semantic HTML (`<button>`, `<nav>`, `<main>`) so structure survives without CSS |
| 1.4.3 Contrast (Minimum)     | Text ≥ 4.5:1, large text ≥ 3:1, UI components ≥ 3:1                                 |
| 1.4.10 Reflow                | Layout works at 320 px width with no horizontal scroll                              |
| 1.4.11 Non-text Contrast     | Borders, focus rings, icons all ≥ 3:1 against their background                      |
| 2.1.1 Keyboard               | Every interactive element reachable and operable with keyboard only                 |
| 2.4.3 Focus Order            | Tab order matches visual order                                                      |
| 2.4.7 Focus Visible          | Focused element has a clearly visible indicator                                     |
| 2.5.3 Label in Name          | Visible label is contained in the accessible name                                   |
| 3.3.2 Labels or Instructions | Every form field has a label                                                        |
| 4.1.2 Name, Role, Value      | Custom components expose the same info native ones do                               |
| 4.1.3 Status Messages        | Status changes announce via `aria-live`                                             |

## Keyboard Navigation

### Defaults to preserve

- Use `<button>` for actions, `<a href>` for navigation. Do not put click handlers on `<div>`.
- Do not change `tabindex` values to anything > 0. Use the document order instead.
- Visible focus rings are enforced globally in `src/app/globals.css:65`. Don't override with `outline: none` unless you replace it with a stronger indicator.

### Keyboard shortcuts in use

| Key                 | Action                            | Context                    |
| ------------------- | --------------------------------- | -------------------------- |
| `Tab` / `Shift+Tab` | Move focus                        | Global                     |
| `Enter`             | Submit form / activate link       | Form / link                |
| `Space`             | Activate button / toggle checkbox | Button / checkbox          |
| `Escape`            | Close modal                       | Modal in terminal state    |
| `Arrow` keys        | Move within composite widgets     | Menus, tablists, listboxes |

When you add a new shortcut, document it here and ensure it does not collide with browser defaults (`Ctrl+F`, `Ctrl+L`, etc.).

### Skip links

A "skip to main content" link is the first focusable element in the layout. It is visually hidden until focused (`.sr-only` + `:focus` reveals it — see `globals.css:90`).

## Screen Reader Support

Targets we test against:

- **NVDA** (Windows, Firefox & Chrome)
- **JAWS** (Windows, Chrome)
- **VoiceOver** (macOS Safari, iOS Safari)
- **TalkBack** (Android Chrome)

### Patterns

- **Headings**: one `<h1>` per page, monotonically increasing levels — no skipping `<h2>` → `<h4>`.
- **Landmarks**: `<header>`, `<nav>`, `<main>`, `<footer>`. Use `aria-label` to disambiguate if there are multiples on the page.
- **Lists**: use `<ul>`/`<ol>` for repeated items, even if styled to not look like lists.
- **Live regions**: status messages go in a container with `aria-live="polite"` (most cases) or `aria-live="assertive"` (errors that block progress). The toast system in `src/contexts/ToastContext.tsx` already does this.
- **Hidden content**: use `.sr-only` (defined in `globals.css:90`) to expose context to screen readers only. Never rely on `display:none` for things screen readers should hear.

## ARIA Labels

The first rule of ARIA: **don't use ARIA if a native element does the same job.** A `<button>` always beats a `<div role="button" tabindex="0">`.

When ARIA is required:

- `aria-label` — accessible name for elements with no visible text (icon-only buttons).
- `aria-labelledby` — reference another element as the name. Use when the label is visible elsewhere on the page.
- `aria-describedby` — extra context, read after the name. Good for hint text under form fields.
- `aria-expanded` — required on toggles that show/hide content.
- `aria-controls` — references the element being controlled.
- `aria-current="page"` — current item in navigation.
- `aria-pressed` — toggle state for buttons that behave like switches.
- `aria-invalid="true"` + `aria-describedby` — link a field to its error message.

Common mistakes to avoid:

- Don't put `aria-label` on an element that already has visible text matching the label — it overrides the visible text and breaks 2.5.3.
- Don't use `role="button"` on a `<button>` (redundant).
- Don't add `tabindex="0"` to non-interactive elements just to give them focus.

## Color Contrast

Theme tokens live in `src/app/globals.css:3` and meet AA at the defined defaults:

### Dark theme (default)

| Token      | Value     | Contrast vs `--bg` |
| ---------- | --------- | ------------------ |
| `--text`   | `#ffffff` | 21:1               |
| `--muted`  | `#777777` | 4.6:1              |
| `--accent` | `#c9a962` | 7.8:1              |
| `--line`   | `#333333` | 3.0:1 (UI only)    |

### Light theme

| Token      | Value     | Contrast vs `--bg` |
| ---------- | --------- | ------------------ |
| `--text`   | `#0a0a0a` | 21:1               |
| `--muted`  | `#666666` | 5.7:1              |
| `--accent` | `#b8922e` | 8.1:1              |

### High-contrast theme

Black background, white text (21:1), yellow accent for max visibility under low-vision conditions and respecting `prefers-contrast: more`.

### Rules

- New colors must be checked against both themes. Use the contrast checker built into Chrome DevTools (Inspect → Styles → click colour swatch).
- Never convey state with colour alone. Pair red error borders with an icon or text ("Error: ...").
- Border colours and focus rings count too — 3:1 minimum against neighbouring colours.

## Accessible Forms

### Structure

```tsx
<label htmlFor="amount">Amount</label>
<input
  id="amount"
  name="amount"
  type="number"
  inputMode="decimal"
  required
  aria-describedby={error ? "amount-error amount-hint" : "amount-hint"}
  aria-invalid={Boolean(error)}
/>
<p id="amount-hint" className="text-sm text-muted">USD equivalent shown next to input.</p>
{error && (
  <p id="amount-error" role="alert" className="text-sm text-red-500">
    {error}
  </p>
)}
```

### Rules

- Every `<input>` has a real `<label>` linked by `htmlFor`. Placeholders are not labels.
- Group related radios/checkboxes with `<fieldset>` + `<legend>`.
- Error messages: `role="alert"` for blocking errors, `aria-live="polite"` for non-blocking validation feedback.
- Submit button text describes the action ("Send 100 USDC"), not just "Submit".
- Don't auto-submit on `Enter` if the form has destructive consequences — require an explicit press of the submit button.

## Focus Management

### Modals

- On open, move focus to the first interactive element (or the close button for status modals).
- Trap focus inside the modal while open — Tab cycles through modal contents, Escape closes.
- On close, return focus to the element that opened the modal.

### Dynamic content

- When new content appears in response to user action, decide deliberately whether focus should move there. For "loaded more rows", don't. For "opened a wizard step", do.
- After form submission, move focus to the success/error summary so screen reader users hear the outcome.

### Implementation

Stellar-Spend uses a small focus-trap helper in modals (see `src/components` for examples). When adding new dialogs, reuse it rather than rolling your own — getting the inert/aria-hidden interplay right is fiddly.

## Motion and Animation

Respect `prefers-reduced-motion`. The global CSS already neutralises animations and transitions for users who opt out (`globals.css:184`). When adding new motion:

- Never use animation as the only signal for state change.
- Keep durations short (< 400 ms) and easings gentle.
- Avoid parallax, large translations, and rapid flashes (no more than 3 flashes per second — 2.3.1).
- Test the reduced-motion path by toggling `prefers-reduced-motion` in DevTools → Rendering.

## Testing

### Automated

| Tool                                | Where it runs | What it catches                              |
| ----------------------------------- | ------------- | -------------------------------------------- |
| `axe-core` / `@axe-core/playwright` | E2E suite     | Most static rule violations                  |
| Lighthouse a11y                     | Manual + CI   | Heuristic score, common WCAG issues          |
| `eslint-plugin-jsx-a11y`            | Lint          | Static patterns: missing alt, bad role usage |

Automated tests catch about 30–40% of real issues. **Manual testing is mandatory** for any UI change.

### Manual

1. **Keyboard pass** — unplug your mouse. Can you reach and operate every control? Is focus visible the whole time?
2. **Screen reader pass** — turn on VoiceOver (`Cmd+F5`) or NVDA. Listen to the page top to bottom. Does it make sense?
3. **Zoom** — set browser zoom to 200% and 400%. Does the layout reflow without horizontal scroll?
4. **High-contrast** — switch to the high-contrast theme. Is everything still distinguishable?
5. **Reduced motion** — toggle the OS-level setting. Are animations sensibly disabled?
6. **Color-blindness sim** — Chrome DevTools → Rendering → Emulate vision deficiencies. Cycle through each.

### Browser support

Test in the latest two versions of:

- Chrome / Edge (Chromium)
- Firefox
- Safari (macOS + iOS)
- Chrome on Android

### CI

Add `axe` assertions to new Playwright specs. Example:

```ts
import AxeBuilder from '@axe-core/playwright';

test('dashboard has no a11y violations', async ({ page }) => {
  await page.goto('/dashboard');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
```

## Component Checklist

Before opening a PR that touches UI, run through this list:

- [ ] Native HTML elements used wherever possible
- [ ] All interactive elements reachable by keyboard, in a logical order
- [ ] Visible focus indicator on every focusable element
- [ ] Every form field has an associated `<label>`
- [ ] Errors are announced (`role="alert"` or live region) and linked via `aria-describedby`
- [ ] Color contrast ≥ 4.5:1 (text) and ≥ 3:1 (UI) in **all three themes**
- [ ] No information conveyed by color alone
- [ ] Modals trap focus and restore it on close
- [ ] Decorative images have `alt=""`; meaningful images have descriptive `alt`
- [ ] Icons-only buttons have `aria-label`
- [ ] Animations honour `prefers-reduced-motion`
- [ ] Manually tested with keyboard + at least one screen reader
- [ ] Lighthouse accessibility score ≥ 95 on the affected page

## Further Reading

- [WCAG 2.1 Quick Reference](https://www.w3.org/WAI/WCAG21/quickref/)
- [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [MDN Accessibility docs](https://developer.mozilla.org/en-US/docs/Web/Accessibility)
- [Inclusive Components by Heydon Pickering](https://inclusive-components.design/)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
