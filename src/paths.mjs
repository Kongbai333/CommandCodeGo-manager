// 运行基目录:入口脚本(server.mjs / bundle 产物)所在目录。
// 用 argv[1] 而非 import.meta.url:bundle 单文件分发时,后者指向打包器内联前的
// 相对结构,会错位;argv[1] 始终是用户实际运行的脚本路径(npm start = 项目根,
// 单文件分发 = 分发目录,data/ 与 public/ 与脚本同级)。
import { dirname, resolve } from 'node:path';

export const appDir = dirname(resolve(process.argv[1] ?? process.cwd()));
