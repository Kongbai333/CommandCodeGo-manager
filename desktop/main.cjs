// CommandCodeGo Manager 桌面版主进程(Electron)。
// 职责:单实例 → 端口扫描 → 以子进程(ELECTRON_RUN_AS_NODE)
// 启动反代服务(esbuild 单文件 bundle)→ 等 /health → 打开管理界面窗口 + 托盘常驻。
// 服务与界面代码与命令行版完全同一份产物,桌面壳只做进程管理与窗口。
const { app, BrowserWindow, Tray, Menu, dialog, nativeImage, shell } = require('electron');
const { spawn } = require('node:child_process');
const { createHash, randomBytes } = require('node:crypto');
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const isSmoke = process.argv.includes('--smoke');
const PRODUCT = 'CommandCodeGo Manager';

// ── 路径 ────────────────────────────────────────────────────
const dataDir = path.join(app.getPath('userData'), 'data');
const serverBundle = app.isPackaged
  ? path.join(process.resourcesPath, 'commandcodego-manager.mjs')
  : path.join(__dirname, '..', 'dist', 'commandcodego-manager.mjs');
const iconPath = app.isPackaged
  ? path.join(process.resourcesPath, 'icon.png')
  : path.join(__dirname, 'build', 'icon.png');

// ── 单实例 ─────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  console.error('已有实例在运行');
  app.quit();
}

// ── 端口:配置首选,占用则向后扫描 ────────────────────────────
function readPreferredPort() {
  try {
    const cfg = JSON.parse(readFileSync(path.join(dataDir, 'config.json'), 'utf-8'));
    const p = Number(cfg.port);
    if (Number.isInteger(p) && p >= 1 && p <= 65535) return p;
  } catch { /* 首启无配置 */ }
  return 3050;
}

function probePort(port) {
  return new Promise(resolve => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.listen(port, '127.0.0.1', () => srv.close(() => resolve(true)));
  });
}

async function pickPort() {
  const base = readPreferredPort();
  for (let p = base; p < base + 20; p++) {
    if (await probePort(p)) return p;
  }
  throw new Error(`端口 ${base}~${base + 19} 均被占用`);
}

// ── 服务子进程 ─────────────────────────────────────────────
let serverChild = null;
let serverPort = null;

function startServer(port) {
  mkdirSync(dataDir, { recursive: true });
  if (!existsSync(serverBundle)) {
    throw new Error(`未找到服务文件:${serverBundle}(先在项目根执行 npm run bundle 与 npm run build:web)`);
  }
  serverChild = spawn(process.execPath, [serverBundle], {
    env: {
      ...process.env,
      // Electron 二进制以纯 Node 模式运行 bundle(内嵌 Node ≥22.5,node:sqlite 可用)
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(port),
      HOST: '127.0.0.1',
      CCP_DATA_DIR: dataDir,
      NODE_ENV: 'production',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tag = `[server:${serverChild.pid}]`;
  serverChild.stdout.on('data', d => process.stdout.write(`${tag} ${d}`));
  serverChild.stderr.on('data', d => process.stderr.write(`${tag} ${d}`));
  serverChild.on('exit', (code) => {
    console.log(`${tag} exited code=${code}`);
    serverChild = null;
  });
}

function stopServer() {
  if (serverChild) { try { serverChild.kill(); } catch { /* 已退出 */ } serverChild = null; }
}

async function waitHealthy(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (serverChild === null) throw new Error('服务进程意外退出,详见日志');
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`);
      if (r.ok) return true;
    } catch { /* 尚未就绪 */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('服务启动超时(/health 未就绪)');
}

// ── 窗口与托盘 ─────────────────────────────────────────────
let win = null;
let tray = null;
function createWindow(port) {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#f3f5f9',
    title: PRODUCT,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    icon: existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadURL(`http://127.0.0.1:${port}/`);
  // 关窗 = 隐藏到托盘,服务保持运行(托盘「退出」才真正结束)
  win.on('close', e => {
    if (!app.isQuitting) { e.preventDefault(); win.hide(); }
  });
}

function createTray(port) {
  if (!existsSync(iconPath)) return;
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip(PRODUCT);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开管理界面', click: () => (win ? (win.show(), win.focus()) : createWindow(port)) },
    { label: `服务地址 http://127.0.0.1:${port}`, enabled: false },
    { type: 'separator' },
    { label: '退出', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
  tray.on('click', () => (win ? (win.isVisible() ? win.focus() : win.show()) : createWindow(port)));
}

function setupMenu() {
  // 精简菜单:保留编辑快捷键与重载,去掉默认的多余项
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    {
      label: '编辑',
      submenu: [
        { role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' }, { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新载入' },
        { role: 'toggleDevTools', label: '开发者工具' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on('window-all-closed', e => e.preventDefault?.()); // 托盘常驻,不随窗口退出

// before-quit 必须先置 isQuitting:否则窗口 close 的 preventDefault(隐藏到托盘)
// 会取消整个 quit 流程,Cmd-Q / 系统退出 / SIGTERM 全部失效
app.on('before-quit', () => { app.isQuitting = true; stopServer(); });
app.on('quit', () => stopServer());
app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });

// ── 启动流程 ───────────────────────────────────────────────
async function bootstrap() {
  const port = await pickPort();
  serverPort = port;
  startServer(port);
  await waitHealthy(port);

  if (isSmoke) {
    console.log(`SMOKE-OK port=${port} bundle=${serverBundle}`);
    app.exit(0);
    return;
  }

  setupMenu();
  createWindow(port);
  createTray(port);
}

app.whenReady().then(() => {
  bootstrap().catch(err => {
    console.error('启动失败:', err);
    if (isSmoke) { console.error('SMOKE-FAIL', err.message); app.exit(1); return; }
    dialog.showErrorBox('启动失败', String(err.message || err));
    app.exit(1);
  });
});
