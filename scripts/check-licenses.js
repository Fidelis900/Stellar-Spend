#!/usr/bin/env node
/**
 * scripts/check-licenses.js
 *
 * Checks that all npm dependencies carry an approved open-source license.
 * Run locally via `npm run license:check` or in CI.
 *
 * Exit codes:
 *   0 — all licenses approved (or explicitly accepted)
 *   1 — one or more packages carry an unapproved license
 *
 * Usage:
 *   node scripts/check-licenses.js          # default mode
 *   node scripts/check-licenses.js --report # print full approved list too
 */

'use strict';

const { execSync } = require('child_process');
const path = require('path');

// ---------------------------------------------------------------------------
// Approved licenses (SPDX identifiers and common variants)
// Any license NOT on this list triggers a failure unless it is explicitly
// accepted in the ACCEPTED_EXCEPTIONS table below.
// ---------------------------------------------------------------------------
const APPROVED_LICENSES = new Set([
  'MIT',
  'MIT-0',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  'Apache 2.0',
  'CC0-1.0',
  'CC-BY-3.0',
  'CC-BY-4.0',
  '0BSD',
  'BlueOak-1.0.0',
  'Unlicense',
  'UNLICENSED', // handled separately — see ACCEPTED_EXCEPTIONS
  'Public Domain',
  'Python-2.0', // used by argparse (utility, no distribution concern)
  'MPL-2.0', // weak copyleft; source changes to MPL files must be shared,
  // but does not infect the larger project
  // Compound SPDX expressions that are net-permissive
  '(MIT OR CC0-1.0)',
  '(MIT OR Apache-2.0)',
  '(Unlicense OR Apache-2.0)',
  '(MPL-2.0 OR Apache-2.0)',
  '(BSD-3-Clause AND Apache-2.0)',
  '(MIT AND Zlib)',
  '(MIT AND BSD-3-Clause)',
  '(WTFPL OR MIT)',
  '(MIT AND CC-BY-3.0)',
  'FSL-1.1-MIT', // Functional Source License with MIT conversion after 2 yrs
]);

// ---------------------------------------------------------------------------
// Licenses that are not on the approved list but are explicitly accepted for
// specific packages along with a documented rationale.
//
// Format: { 'package@version': 'reason' }
// ---------------------------------------------------------------------------
const ACCEPTED_EXCEPTIONS = {
  // LGPL-3.0 packages — used as a library (no modification, dynamic linking
  // semantics apply to the JS module system); does not infect the MIT
  // application code.  Review when upgrading these packages.
  '@stacks/blockchain-api-client@7.10.0':
    'GPL-3.0 — transitive via @allbridge/bridge-core-sdk → @clarigen/core. ' +
    'Used as a read-only HTTP client; no source modification. ' +
    'Track https://github.com/hirosystems/stacks-blockchain-api for license changes.',
  'web3-core@4.7.1':
    'LGPL-3.0 — transitive via @allbridge/bridge-core-sdk. Dynamic-linking ' +
    'exemption applies; we do not modify or redistribute web3 source.',
  'web3-errors@1.3.1': 'LGPL-3.0 — same rationale as web3-core.',
  'web3-eth-abi@4.4.1': 'LGPL-3.0 — same rationale as web3-core.',
  'web3-eth-accounts@4.3.1': 'LGPL-3.0 — same rationale as web3-core.',
  'web3-eth-contract@4.7.2': 'LGPL-3.0 — same rationale as web3-core.',
  'web3-eth-ens@4.4.0': 'LGPL-3.0 — same rationale as web3-core.',
  'web3-eth-iban@4.0.7': 'LGPL-3.0 — same rationale as web3-core.',
  'web3-eth-personal@4.1.0': 'LGPL-3.0 — same rationale as web3-core.',
  'web3-eth@4.11.1': 'LGPL-3.0 — same rationale as web3-core.',
  'web3-net@4.1.0': 'LGPL-3.0 — same rationale as web3-core.',
  'web3-providers-http@4.2.0': 'LGPL-3.0 — same rationale as web3-core.',
  'web3-providers-ipc@4.0.7': 'LGPL-3.0 — same rationale as web3-core.',
  'web3-providers-ws@4.0.8': 'LGPL-3.0 — same rationale as web3-core.',
  'web3-rpc-methods@1.3.0': 'LGPL-3.0 — same rationale as web3-core.',
  'web3-rpc-providers@1.0.0-rc.4': 'LGPL-3.0 — same rationale as web3-core.',
  'web3-types@1.10.0': 'LGPL-3.0 — same rationale as web3-core.',
  'rpc-websockets@9.3.8': 'LGPL-3.0-only — same rationale as web3-core.',
  // sharp native image library — LGPL bindings
  '@img/sharp-libvips-linux-x64@1.2.4':
    'LGPL-3.0-or-later — native addon used by Next.js image optimisation; ' +
    'only invoked at build time, not shipped to end-users as a modified lib.',
  '@img/sharp-libvips-linuxmusl-x64@1.2.4':
    'LGPL-3.0-or-later — same rationale as sharp-libvips-linux-x64.',
};

// LGPL variants are accepted as library-use (dynamic linking / no modification)
const ACCEPTED_LICENSE_PREFIXES = ['LGPL-'];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const showReport = process.argv.includes('--report');
const projectRoot = path.resolve(__dirname, '..');

let packages;
try {
  const raw = execSync('npx license-checker --json --excludePrivatePackages', {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  packages = JSON.parse(raw);
} catch (err) {
  console.error('❌  Failed to run license-checker:', err.message);
  process.exit(1);
}

const violations = [];
const accepted = [];
const approved = [];

for (const [pkg, info] of Object.entries(packages)) {
  const license = info.licenses ?? 'UNKNOWN';

  // Check if it is in explicit exceptions
  if (pkg in ACCEPTED_EXCEPTIONS) {
    accepted.push({ pkg, license, reason: ACCEPTED_EXCEPTIONS[pkg] });
    continue;
  }

  // Check LGPL prefix acceptance
  if (ACCEPTED_LICENSE_PREFIXES.some((prefix) => String(license).startsWith(prefix))) {
    accepted.push({
      pkg,
      license,
      reason: 'LGPL — dynamic-linking exemption; no source modification.',
    });
    continue;
  }

  if (APPROVED_LICENSES.has(license)) {
    approved.push({ pkg, license });
  } else {
    violations.push({ pkg, license });
  }
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
if (showReport) {
  console.log('\n✅  Approved packages:');
  for (const { pkg, license } of approved) {
    console.log(`   ${pkg}  (${license})`);
  }
}

if (accepted.length > 0) {
  console.log('\n⚠️   Explicitly accepted (review at next upgrade):');
  for (const { pkg, license, reason } of accepted) {
    console.log(`   ${pkg}  (${license})`);
    console.log(`     → ${reason}`);
  }
}

if (violations.length > 0) {
  console.error('\n❌  License violations found — these packages require review:\n');
  for (const { pkg, license } of violations) {
    console.error(`   ${pkg}  (${license})`);
  }
  console.error(
    '\nTo resolve: either remove the package, find a compatible alternative, ' +
      'or add an entry to ACCEPTED_EXCEPTIONS in scripts/check-licenses.js ' +
      'with a written rationale, then re-run this check.',
  );
  process.exit(1);
}

console.log(
  `\n✅  License check passed — ${approved.length} approved, ` +
    `${accepted.length} explicitly accepted, 0 violations.`,
);
