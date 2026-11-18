import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const next = join(project, 'node_modules', 'next', 'dist', 'bin', 'next');
const basePath = process.env.PAGES_BASE_PATH ?? '';
if (!/^(\/[a-z0-9._-]+)*$/i.test(basePath) || basePath.split('/').some(segment => segment === '.' || segment === '..')) {
  throw new Error('PAGES_BASE_PATH must be empty or a URL path such as /hiredly-ai-demo.');
}

// Build from an isolated copy so the live API routes and dotenv files stay out of the export.
const stage = mkdtempSync(join(project, '.pages-build-'));
try {
  mkdirSync(join(stage, 'app'));
  for (const entry of ['page.tsx', 'layout.tsx', 'globals.css']) {
    cpSync(join(project, 'app', entry), join(stage, 'app', entry));
  }
  for (const entry of ['components', 'lib/application.ts', 'lib/supabase.ts', 'lib/types.ts', 'tsconfig.json', 'package.json', 'package-lock.json']) {
    cpSync(join(project, entry), join(stage, entry), { recursive: true });
  }
  if (existsSync(join(project, 'public'))) {
    cpSync(join(project, 'public'), join(stage, 'public'), { recursive: true });
  }
  symlinkSync(join(project, 'node_modules'), join(stage, 'node_modules'), 'junction');
  writeFileSync(join(stage, 'next.config.mjs'), 'export default ' + JSON.stringify({
    basePath,
    output: 'export',
    outputFileTracingRoot: stage,
    trailingSlash: true,
  }) + ';\n');

  const result = spawnSync(process.execPath, [next, 'build'], {
    cwd: stage,
    stdio: 'inherit',
    env: {
      ...process.env,
      NEXT_PUBLIC_PAGES_DEMO: '1',
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('The static demo build failed.');
  const output = join(project, 'out');
  cpSync(join(stage, 'out'), output, { recursive: true });
  console.log('Static demo ready in ' + output);
} finally {
  const resolvedStage = realpathSync(stage);
  if (dirname(resolvedStage) === project && resolvedStage.startsWith(project + sep + '.pages-build-')) {
    rmSync(resolvedStage, { recursive: true, force: true });
  }
}
