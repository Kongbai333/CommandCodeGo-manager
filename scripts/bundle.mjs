// npm 分发打包(Step 4.2):esbuild 把 server.mjs + src/ 打成单文件
// dist/commandcodego-manager.mjs。静态资源(public/)不内联,分发时与之同目录放置。
// 运行:node dist/commandcodego-manager.mjs(data/ 与 public/ 自动在脚本同级查找)。
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));

rmSync(join(ROOT, 'dist'), { recursive: true, force: true });
mkdirSync(join(ROOT, 'dist'), { recursive: true });

const result = await build({
  entryPoints: [join(ROOT, 'server.mjs')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outfile: join(ROOT, 'dist/commandcodego-manager.mjs'),
  // 版本号在打包时内联(运行时优先读该 env;见 src/admin/api.mjs)
  define: { 'process.env.CCP_APP_VERSION': JSON.stringify(pkg.version) },
  legalComments: 'inline', // 保留各模块头部的 MIT 派生声明
  logLevel: 'info',
});

if (result.errors.length > 0) process.exit(1);

// 分发包样例:public/ 若已构建,复制到 dist/public(单文件 + public 即完整分发包)
try {
  cpSync(join(ROOT, 'public'), join(ROOT, 'dist/public'), { recursive: true });
  console.log('dist/public/ 已随包复制(如未构建 UI,请先 npm run build:web)');
} catch {
  console.log('(public/ 未构建,跳过复制;分发前先 npm run build:web)');
}
console.log(`完成:dist/commandcodego-manager.mjs(v${pkg.version})`);
