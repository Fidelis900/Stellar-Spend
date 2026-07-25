export interface CssAnalysis {
  totalClasses: number;
  usedClasses: number;
  unusedClasses: number;
  coveragePercentage: number;
  byCategory: {
    utility: string[];
    component: string[];
    state: string[];
  };
}

export function extractClassesFromCss(css: string): string[] {
  const classRegex = /\.([a-zA-Z0-9_\-\\/:]+)\s*\{/g;
  const classes: string[] = [];
  let match;

  while ((match = classRegex.exec(css)) !== null) {
    const className = match[1];
    // Unescape class names that have been escaped for CSS
    const unescaped = className
      .replace(/\\:/g, ':')
      .replace(/\\//g, '/')
      .replace(/\\-/g, '-');
    classes.push(unescaped);
  }

  return [...new Set(classes)]; // Remove duplicates
}

export function extractUsedClassesFromHtml(html: string): string[] {
  const classRegex = /class=["']([^"']+)["']/g;
  const used: Set<string> = new Set();
  let match;

  while ((match = classRegex.exec(html)) !== null) {
    const classString = match[1];
    const classes = classString.split(/\s+/).filter((c) => c.length > 0);
    classes.forEach((cls) => used.add(cls));
  }

  return Array.from(used);
}

export function detectUnusedCssClasses(html: string, css: string): string[] {
  const allClasses = extractClassesFromCss(css);
  const usedClasses = extractUsedClassesFromHtml(html);
  const usedSet = new Set(usedClasses);

  return allClasses.filter((cls) => !usedSet.has(cls));
}

export function categorizeClass(className: string): 'utility' | 'component' | 'state' {
  if (className.includes(':')) {
    return 'state';
  } else if (className.match(/^[a-z]+-[a-z]+/)) {
    return 'component';
  }
  return 'utility';
}

export function analyzeCssUsage(html: string, css: string): CssAnalysis {
  const allClasses = extractClassesFromCss(css);
  const usedClasses = extractUsedClassesFromHtml(html);
  const unusedClasses = detectUnusedCssClasses(html, css);

  const byCategory = {
    utility: [] as string[],
    component: [] as string[],
    state: [] as string[],
  };

  allClasses.forEach((cls) => {
    const category = categorizeClass(cls);
    byCategory[category].push(cls);
  });

  const totalClasses = allClasses.length;
  const usedCount = usedClasses.length;
  const unusedCount = unusedClasses.length;
  const coveragePercentage = totalClasses > 0 ? (usedCount / totalClasses) * 100 : 0;

  return {
    totalClasses,
    usedClasses: usedCount,
    unusedClasses: unusedCount,
    coveragePercentage: Math.round(coveragePercentage * 100) / 100,
    byCategory,
  };
}

export function generateCoverageReport(html: string, css: string): string {
  const analysis = analyzeCssUsage(html, css);
  const unused = detectUnusedCssClasses(html, css);

  let report = `
CSS Coverage Report
===================

Total Classes: ${analysis.totalClasses}
Used Classes: ${analysis.usedClasses}
Unused Classes: ${analysis.unusedClasses}
Coverage: ${analysis.coveragePercentage.toFixed(2)}%

Classes by Category:
- Utility: ${analysis.byCategory.utility.length}
- Component: ${analysis.byCategory.component.length}
- State: ${analysis.byCategory.state.length}

Unused Classes:
`;

  if (unused.length === 0) {
    report += '  (None - great job!)';
  } else {
    unused.forEach((cls) => {
      report += `\n  - .${cls}`;
    });
  }

  report += `

Recommendations:
1. Remove unused classes to reduce bundle size
2. Document intentionally unused utilities (e.g., sr-only for screen readers)
3. Review CSS across all page templates before removing widely-used classes
4. Consider using CSS coverage tools in your CI pipeline

`;

  return report;
}

export function findUnusedInPages(pageHtmlList: string[], css: string): Map<string, string[]> {
  const allUnused = new Set<string>();
  const usedAcrossAll = new Set<string>();

  pageHtmlList.forEach((html) => {
    const used = new Set(extractUsedClassesFromHtml(html));
    used.forEach((cls) => usedAcrossAll.add(cls));

    const unused = detectUnusedCssClasses(html, css);
    unused.forEach((cls) => allUnused.add(cls));
  });

  // Only report classes unused in ALL pages
  const completelyUnused = Array.from(allUnused).filter((cls) => !usedAcrossAll.has(cls));

  const result = new Map<string, string[]>();
  result.set('completely_unused', completelyUnused);
  result.set('used_in_some_pages', Array.from(usedAcrossAll));

  return result;
}
