// 派生自 MAXeaglet/commandcode-proxy(MIT,基线 9bdfafc)的单文件 proxy.mjs —— Step 1.2 纯移动拆分,实现与原注释逐字保留。
function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function getDateStr() {
  return new Date().toISOString().slice(0, 10);
}


export { nowUnix, getDateStr };
