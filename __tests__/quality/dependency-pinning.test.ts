import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('Dependency Pinning', () => {
  const criticalDeps = [
    'next',
    'react',
    'react-dom',
    '@stellar/stellar-sdk',
    '@sentry/nextjs',
    'typescript',
    'tailwindcss',
  ];

  it('should have pinned critical dependencies', () => {
    expect(fs.existsSync('package.json')).toBe(true);
    
    const content = fs.readFileSync('package.json', 'utf-8');
    const pkg = JSON.parse(content);
    
    const looseVersions: string[] = [];
    
    for (const dep of criticalDeps) {
      const version = pkg.dependencies?.[dep] || pkg.devDependencies?.[dep];
      if (version && (version.startsWith('^') || version.startsWith('~'))) {
        looseVersions.push(`${dep}: ${version}`);
      }
    }
    
    if (looseVersions.length > 0) {
      console.log('❌ Loose versions found:', looseVersions);
    }
    
    expect(looseVersions).toHaveLength(0);
  });

  it('should have dependency update policy documented', () => {
    expect(fs.existsSync('CONTRIBUTING.md')).toBe(true);
    
    const content = fs.readFileSync('CONTRIBUTING.md', 'utf-8');
    expect(content).toContain('Dependency');
    expect(content).toContain('Version Pinning');
  });
});
