#!/bin/bash
# Script to audit Rust contract dependencies for security vulnerabilities
# Usage: ./scripts/audit-contracts.sh

set -e

echo "🔍 Auditing Rust contract dependencies for known vulnerabilities..."
echo

# Check if cargo is installed
if ! command -v cargo &> /dev/null; then
    echo "❌ Error: cargo is not installed. Please install Rust from https://rustup.rs/"
    exit 1
fi

# Change to contracts directory and run audit
cd "$(dirname "$0")/../contracts"

AUDIT_FAILED=0

# Audit each contract crate
for crate_dir in */; do
    crate_name="${crate_dir%/}"
    if [ -f "$crate_dir/Cargo.toml" ]; then
        echo "📦 Auditing $crate_name..."
        if cargo audit --manifest-path "$crate_dir/Cargo.toml" --deny warnings 2>&1 | grep -q "no warnings"; then
            echo "✅ $crate_name: No vulnerabilities found"
        else
            # cargo audit might exit 1 even if it runs successfully in some contexts
            if cargo audit --manifest-path "$crate_dir/Cargo.toml" 2>&1 | grep -q "no known security vulnerabilities detected"; then
                echo "✅ $crate_name: No vulnerabilities found"
            else
                echo "⚠️  $crate_name: Check vulnerabilities above"
                AUDIT_FAILED=1
            fi
        fi
        echo
    fi
done

# Summary
if [ $AUDIT_FAILED -eq 0 ]; then
    echo "✅ All contract dependencies checked!"
    exit 0
else
    echo "⚠️  Please review vulnerabilities above and update dependencies as needed."
    exit 1
fi
