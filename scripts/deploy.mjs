import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const isWindows = process.platform === 'win32';
const git = isWindows ? 'git.exe' : 'git';
const ghPagesCli = fileURLToPath(new URL('../node_modules/gh-pages/bin/gh-pages.js', import.meta.url));

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (options.capture && result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${command} ${args.join(' ')} falhou com codigo ${result.status}.`);
  }
  return options.capture ? (result.stdout || '').trim() : '';
};

const branch = run(git, ['branch', '--show-current'], { capture: true });
if (branch !== 'main') {
  throw new Error(`Deploy cancelado: a branch atual e "${branch || 'desconhecida'}", mas deve ser "main".`);
}

run(git, ['add', '-A']);
run(git, ['diff', '--cached', '--check']);

const forbidden = /(^|\/)(\.env(?:\..*)?|node_modules|dist|dist-debug|dist-map|tmp)(\/|$)/i;
const stagedWrites = run(git, ['diff', '--cached', '--diff-filter=ACMR', '--name-only'], { capture: true })
  .split(/\r?\n/)
  .filter(Boolean);
const unsafeFiles = stagedWrites.filter((file) => forbidden.test(file) && file !== '.env.example');
if (unsafeFiles.length) {
  throw new Error(`Deploy cancelado: arquivo(s) local(is) ou sensivel(is) no commit: ${unsafeFiles.join(', ')}`);
}

const secretPatterns = [
  { category: 'chave privada', pattern: new RegExp(`BEGIN ${'PRIVATE'} KEY`) },
  { category: 'token GitHub', pattern: /gh[pousr]_[A-Za-z0-9_]{20,}/ },
  { category: 'token JWT', pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
];
const secretFindings = [];
const textFilePattern = /(^|\/)(\.gitignore|[^/]+\.(?:js|jsx|mjs|cjs|ts|tsx|json|html|css|md|txt|ya?ml|toml|example))$/i;
for (const file of stagedWrites.filter((entry) => textFilePattern.test(entry))) {
  const content = run(git, ['show', `:${file}`], { capture: true });
  for (const { category, pattern } of secretPatterns) {
    if (pattern.test(content)) secretFindings.push(`${file} (${category})`);
  }
}
if (secretFindings.length) {
  throw new Error(`Deploy cancelado: possivel segredo detectado em ${secretFindings.join(', ')}`);
}

const stagedFiles = run(git, ['diff', '--cached', '--name-only'], { capture: true });
if (stagedFiles) {
  const message = process.env.DEPLOY_MESSAGE || 'chore: atualiza CRM';
  run(git, ['commit', '-m', message]);
} else {
  console.log('Nenhuma alteracao de codigo para criar commit.');
}

run(git, ['push', 'origin', 'main']);
run(process.execPath, [ghPagesCli, '-d', 'dist']);

console.log('Codigo enviado para origin/main e site publicado no GitHub Pages.');
