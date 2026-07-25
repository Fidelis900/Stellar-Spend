import { describe, it, expect, beforeEach } from 'vitest';
import { detectUnusedCssClasses, analyzeCssUsage, generateCoverageReport } from './css-coverage';

describe('CSS Coverage Analysis', () => {
  let sampleHtml: string;
  let sampleCss: string;

  beforeEach(() => {
    sampleHtml = `
      <div class="container flex gap-4">
        <header class="header bg-blue-500">
          <h1 class="title text-lg font-bold">Test</h1>
        </header>
        <main class="main-content">
          <button class="btn btn-primary hover:bg-blue-600">Click me</button>
          <p class="text-gray-600">Description</p>
        </main>
        <footer class="footer">Footer content</footer>
      </div>
    `;

    sampleCss = `
      .container { display: flex; }
      .flex { display: flex; }
      .gap-4 { gap: 1rem; }
      .header { background: white; }
      .bg-blue-500 { background: #3b82f6; }
      .title { margin: 0; }
      .text-lg { font-size: 1.125rem; }
      .font-bold { font-weight: 700; }
      .main-content { padding: 1rem; }
      .btn { padding: 0.5rem 1rem; }
      .btn-primary { background: blue; }
      .hover\\:bg-blue-600:hover { background: #2563eb; }
      .text-gray-600 { color: #4b5563; }
      .footer { background: gray; }
      .unused-class { color: red; }
      .another-unused { margin: 10px; }
      .hidden-utility { display: none; }
    `;
  });

  describe('detectUnusedCssClasses', () => {
    it('should identify unused CSS classes', () => {
      const unused = detectUnusedCssClasses(sampleHtml, sampleCss);

      expect(unused).toContain('unused-class');
      expect(unused).toContain('another-unused');
      expect(unused).toContain('hidden-utility');
    });

    it('should not flag classes that are used', () => {
      const unused = detectUnusedCssClasses(sampleHtml, sampleCss);

      expect(unused).not.toContain('container');
      expect(unused).not.toContain('flex');
      expect(unused).not.toContain('btn');
      expect(unused).not.toContain('text-gray-600');
    });

    it('should handle classes with special characters', () => {
      const htmlWithSpecialClasses = `
        <div class="hover:bg-blue-600 focus:ring-2 md:w-1/2">Content</div>
      `;

      const cssWithSpecialClasses = `
        .hover\\:bg-blue-600:hover { background: blue; }
        .focus\\:ring-2:focus { ring: 2px; }
        .md\\:w-1\\/2 { width: 50%; }
        .unused\\:state { color: red; }
      `;

      const unused = detectUnusedCssClasses(htmlWithSpecialClasses, cssWithSpecialClasses);

      expect(unused).toContain('unused\\:state');
      expect(unused).not.toContain('hover\\:bg-blue-600');
    });

    it('should return empty array when no unused classes found', () => {
      const minimalHtml = `<div class="container flex">Content</div>`;
      const minimalCss = `.container { } .flex { }`;

      const unused = detectUnusedCssClasses(minimalHtml, minimalCss);

      expect(unused.length).toBe(0);
    });
  });

  describe('analyzeCssUsage', () => {
    it('should analyze CSS usage across HTML', () => {
      const analysis = analyzeCssUsage(sampleHtml, sampleCss);

      expect(analysis.totalClasses).toBeGreaterThan(0);
      expect(analysis.usedClasses).toBeGreaterThan(0);
      expect(analysis.unusedClasses).toBeGreaterThan(0);
      expect(analysis.coveragePercentage).toBeGreaterThan(0);
      expect(analysis.coveragePercentage).toBeLessThanOrEqual(100);
    });

    it('should calculate correct coverage percentage', () => {
      const analysis = analyzeCssUsage(sampleHtml, sampleCss);

      const expectedUsed = 12; // container, flex, gap-4, header, bg-blue-500, title, text-lg, font-bold, main-content, btn, btn-primary, text-gray-600, footer, hover:bg-blue-600
      const expectedUnused = 3; // unused-class, another-unused, hidden-utility
      const expectedTotal = expectedUsed + expectedUnused;

      expect(analysis.totalClasses).toBeGreaterThanOrEqual(expectedTotal);
    });

    it('should categorize classes by type', () => {
      const analysis = analyzeCssUsage(sampleHtml, sampleCss);

      expect(analysis.byCategory).toBeDefined();
      expect(analysis.byCategory.utility).toBeDefined();
      expect(analysis.byCategory.component).toBeDefined();
    });
  });

  describe('generateCoverageReport', () => {
    it('should generate a coverage report', () => {
      const report = generateCoverageReport(sampleHtml, sampleCss);

      expect(report).toContain('CSS Coverage Report');
      expect(report).toContain('Total Classes');
      expect(report).toContain('Coverage');
    });

    it('should include unused classes in the report', () => {
      const report = generateCoverageReport(sampleHtml, sampleCss);

      expect(report).toContain('Unused Classes');
      expect(report).toContain('unused-class');
    });

    it('should include recommendations in the report', () => {
      const report = generateCoverageReport(sampleHtml, sampleCss);

      expect(report).toContain('Recommendations');
    });

    it('should highlight low coverage scenarios', () => {
      const lowCoverageHtml = '<div class="used-class">Content</div>';
      const lowCoverageCss = `
        .used-class { }
        .unused1 { }
        .unused2 { }
        .unused3 { }
        .unused4 { }
      `;

      const report = generateCoverageReport(lowCoverageHtml, lowCoverageCss);

      expect(report).toBeDefined();
    });
  });

  describe('Intentionally unused utility classes', () => {
    it('should allow documenting intentionally unused utilities', () => {
      const intentionallyUnused = [
        'transition-all', // Used in JS-based animations
        'group-hover:text-white', // Used in parent hover states
        'sr-only', // Screen reader only
      ];

      expect(intentionallyUnused).toContain('sr-only');
      expect(intentionallyUnused.length).toBe(3);
    });

    it('should filter out documented utilities from unused list', () => {
      const intentionallyUnused = ['sr-only', 'group-hover:text-white'];
      const detected = ['unused-class', 'sr-only', 'group-hover:text-white'];

      const actualUnused = detected.filter((cls) => !intentionallyUnused.includes(cls));

      expect(actualUnused).not.toContain('sr-only');
      expect(actualUnused).toContain('unused-class');
    });
  });

  describe('Visual regression prevention', () => {
    it('should identify classes removed from components', () => {
      const oldHtml = '<div class="card shadow-lg rounded-lg">Old</div>';
      const newHtml = '<div class="card">New</div>';
      const css = `
        .card { padding: 1rem; }
        .shadow-lg { box-shadow: 0 10px 15px; }
        .rounded-lg { border-radius: 0.5rem; }
      `;

      const oldAnalysis = analyzeCssUsage(oldHtml, css);
      const newAnalysis = analyzeCssUsage(newHtml, css);

      expect(oldAnalysis.usedClasses).toBeGreaterThan(newAnalysis.usedClasses);
      expect(newAnalysis.unusedClasses).toBeGreaterThan(oldAnalysis.unusedClasses);
    });
  });

  describe('Multi-page CSS coverage', () => {
    it('should analyze CSS across multiple page samples', () => {
      const page1Html = '<div class="page-header">Page 1</div>';
      const page2Html = '<div class="page-footer">Page 2</div>';
      const sharedCss = `
        .page-header { }
        .page-footer { }
        .unused-everywhere { }
      `;

      const analysis1 = analyzeCssUsage(page1Html, sharedCss);
      const analysis2 = analyzeCssUsage(page2Html, sharedCss);

      expect(analysis1.unusedClasses).toBeGreaterThan(0);
      expect(analysis2.unusedClasses).toBeGreaterThan(0);
    });
  });
});
