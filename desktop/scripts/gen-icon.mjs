// 生成桌面应用图标:渐变底 + 白色双向箭头(协议互转语义)。
// 用 Electron 离屏窗口渲染 SVG → capturePage(裁剪区域)→ 512x512 PNG。
// 窗口比目标大 32px 且图形居中内收:offscreen 透明窗口的边缘合成伪影
// (右侧/底部 1px 白线)落在裁剪区之外,不再进入成品。
// 用法(在 desktop/ 下):npx electron scripts/gen-icon.mjs
import { app, BrowserWindow } from 'electron';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 512;      // 成品尺寸
const PAD = 16;        // 画布内边距(窗口边缘伪影隔离带)
const WIN = SIZE + PAD * 2;
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'build');
mkdirSync(dir, { recursive: true });

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2dd4bf"/>
      <stop offset="1" stop-color="#0284c7"/>
    </linearGradient>
    <linearGradient id="hl" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.22"/>
      <stop offset="0.55" stop-color="#ffffff" stop-opacity="0.02"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.06"/>
    </linearGradient>
  </defs>
  <rect x="16" y="16" width="480" height="480" rx="112" fill="url(#bg)"/>
  <rect x="16" y="16" width="480" height="480" rx="112" fill="url(#hl)"/>
  <g stroke="#ffffff" stroke-width="42" stroke-linecap="round" fill="#ffffff">
    <line x1="152" y1="205" x2="322" y2="205"/>
    <polygon points="326,158 396,205 326,252" stroke="none"/>
    <line x1="360" y1="307" x2="190" y2="307"/>
    <polygon points="186,260 116,307 186,354" stroke="none"/>
  </g>
</svg>`;

const html = `<!doctype html><html><head><style>
  html,body { margin:0; padding:0; width:${WIN}px; height:${WIN}px; background:transparent; overflow:hidden; }
  svg { display:block; margin:${PAD}px; }
</style></head><body>${SVG}</body></html>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: WIN, height: WIN, useContentSize: true,
    show: false, transparent: true, frame: false, resizable: false,
    webPreferences: { offscreen: true },
  });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  // 等渲染完成再截
  await new Promise(r => setTimeout(r, 300));
  // 只截中间 512×512:窗口边缘的 1px 白线伪影被 PAD 隔离在裁剪区外
  const img = await win.webContents.capturePage({ x: PAD, y: PAD, width: SIZE, height: SIZE });
  const size = img.getSize();
  const png = (size.width === SIZE && size.height === SIZE)
    ? img.toPNG()
    : img.resize({ width: SIZE, height: SIZE }).toPNG();
  const out = join(dir, 'icon.png');
  writeFileSync(out, png);
  console.log(`written ${out} (${png.length} bytes, ${SIZE}x${SIZE}, captured ${size.width}x${size.height})`);
  app.exit(0);
});
