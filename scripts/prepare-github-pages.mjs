import { readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const outputDirectory = 'out';
const repositoryName = process.env.GITHUB_REPOSITORY?.split('/').at(-1) || 'md-resume';
const basePath = `/${repositoryName}`;
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.txt']);

async function rewritePublicPaths(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await rewritePublicPaths(path);
      continue;
    }
    if (!textExtensions.has(extname(entry.name))) continue;

    const source = await readFile(path, 'utf8');
    const rewritten = source
      .replaceAll('/fonts/', `${basePath}/fonts/`)
      .replaceAll('/favicon.svg', `${basePath}/favicon.svg`);
    if (rewritten !== source) await writeFile(path, rewritten);
  }
}

await rewritePublicPaths(outputDirectory);
await writeFile(join(outputDirectory, '.nojekyll'), '');
