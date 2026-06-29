import { cpSync, rmSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';

rmSync('docs', { recursive: true, force: true });
mkdirSync('docs', { recursive: true });
cpSync('dist', 'docs', { recursive: true });
copyFileSync('public/presentation.html', 'docs/presentation.html');
const pdf = 'public/PRESENTATION.pdf';
if (existsSync(pdf)) {
  copyFileSync(pdf, 'docs/PRESENTATION.pdf');
}
console.log('Copied dist/ → docs/ for GitHub Pages');
