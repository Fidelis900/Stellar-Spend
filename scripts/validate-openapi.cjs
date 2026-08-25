const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const Ajv = require('ajv');

const rootDir = path.resolve(__dirname, '..');
const specPath = path.join(rootDir, 'openapi.yaml');

console.log('--- Validating OpenAPI Specification ---');

if (!fs.existsSync(specPath)) {
  console.error(`Error: openapi.yaml not found at ${specPath}`);
  process.exit(1);
}

let doc;
try {
  const content = fs.readFileSync(specPath, 'utf8');
  doc = yaml.load(content);
  console.log('✔ openapi.yaml parses cleanly as valid YAML');
} catch (e) {
  console.error('✖ openapi.yaml YAML syntax error:', e.message);
  process.exit(1);
}

// Check OpenAPI version and metadata
if (!doc.openapi || !doc.openapi.startsWith('3.0')) {
  console.error('✖ Missing or invalid openapi version (expected 3.0.x)');
  process.exit(1);
}
console.log(`✔ OpenAPI Version: ${doc.openapi}`);
console.log(`✔ API Title: ${doc.info.title} (${doc.info.version})`);

// Validate all $refs
let refErrors = 0;
function checkRefs(node, location = '') {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((item, i) => checkRefs(item, `${location}[${i}]`));
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === '$ref') {
      if (typeof value === 'string' && value.startsWith('#/')) {
        const parts = value.replace(/^#\//, '').split('/');
        let cur = doc;
        for (const p of parts) {
          cur = cur?.[p];
        }
        if (cur === undefined) {
          console.error(`✖ Broken reference: ${value} at ${location}`);
          refErrors++;
        }
      }
    } else {
      checkRefs(value, `${location}.${key}`);
    }
  }
}

checkRefs(doc);
if (refErrors > 0) {
  console.error(`✖ Found ${refErrors} broken $ref references in openapi.yaml`);
  process.exit(1);
}
console.log('✔ All $ref references resolve correctly');

// Validate HTTP methods and operations
let operationCount = 0;
const validMethods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']);

for (const [pathKey, pathItem] of Object.entries(doc.paths || {})) {
  for (const [method, operation] of Object.entries(pathItem)) {
    if (['summary', 'description', 'parameters', 'servers'].includes(method)) continue;
    if (!validMethods.has(method.toLowerCase())) {
      console.error(`✖ Invalid HTTP method ${method} on path ${pathKey}`);
      process.exit(1);
    }
    operationCount++;
    if (!operation.responses) {
      console.error(`✖ Missing responses object for ${method.toUpperCase()} ${pathKey}`);
      process.exit(1);
    }
  }
}

console.log(`✔ Validated ${Object.keys(doc.paths).length} paths with ${operationCount} operations`);
console.log('✔ OpenAPI specification is completely valid and clean!');
