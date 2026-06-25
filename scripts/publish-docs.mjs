import { cpSync, rmSync, mkdirSync } from 'node:fs';

rmSync('docs', { recursive: true, force: true });
mkdirSync('docs', { recursive: true });
cpSync('dist', 'docs', { recursive: true });
console.log('Copied dist/ → docs/ for GitHub Pages');
