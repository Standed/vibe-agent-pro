#!/usr/bin/env node

const fs = require('fs');
const { execFileSync } = require('child_process');

const PLACEHOLDER_RE = /(<[^>]+>|\$[A-Z0-9_]+|your[_-]?|YOUR[_-]?|xxx|xxxx|placeholder|example|process\.env|这里|密钥|TOKEN|KEY)/i;

const PATTERNS = [
  {
    name: 'sk-style provider key',
    regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    name: 'Google API key',
    regex: /\bAIza[0-9A-Za-z_-]{30,}\b/g,
  },
  {
    name: 'literal API key assignment',
    regex: /\b(?:api[_-]?key|apikey|secret|token)\b\s*[:=]\s*["']?([A-Za-z0-9][A-Za-z0-9_.-]{23,})["']?/gi,
  },
  {
    name: 'literal bearer token',
    regex: /\bAuthorization\s*:\s*Bearer\s+([A-Za-z0-9._-]{20,})\b/gi,
  },
];

const SKIP_EXTENSIONS = new Set([
  '.gif',
  '.jpeg',
  '.jpg',
  '.lock',
  '.mp4',
  '.png',
  '.webp',
]);

const getFiles = () => {
  const args = process.argv.includes('--staged')
    ? ['diff', '--cached', '--name-only', '--diff-filter=ACMRT', '-z']
    : ['ls-files', '-z'];

  return execFileSync('git', args, { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .filter((file) => fs.existsSync(file));
};

const shouldSkip = (file) => {
  const lower = file.toLowerCase();
  for (const ext of SKIP_EXTENSIONS) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
};

const mask = (value) => {
  if (!value || value.length <= 10) return '<redacted>';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
};

const findings = [];

for (const file of getFiles()) {
  if (shouldSkip(file)) continue;

  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const pattern of PATTERNS) {
      pattern.regex.lastIndex = 0;
      let match;
      while ((match = pattern.regex.exec(line)) !== null) {
        const secret = match[1] || match[0];
        if (PLACEHOLDER_RE.test(secret)) continue;

        findings.push({
          file,
          line: index + 1,
          type: pattern.name,
          value: mask(secret),
        });
      }
    }
  });
}

if (findings.length > 0) {
  console.error('Secret scan failed. Remove real credentials before committing:');
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.type} ${finding.value}`);
  }
  process.exit(1);
}

console.log('Secret scan passed.');
