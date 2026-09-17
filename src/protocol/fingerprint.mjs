// 派生自 MAXeaglet/commandcode-proxy(MIT,基线 9bdfafc)的单文件 proxy.mjs —— 纯移动拆分,实现与原注释逐字保留。
import crypto from 'crypto';
import { CFG } from '../config.mjs';
// ── 设备指纹（形态与哈希逐字对齐官方 CLI 1.53.1） ──────
// CPU 型号与核心数对应表（仅 Windows x64）
const FINGERPRINT_CPUS = [
  { model: '12th Gen Intel(R) Core(TM) i7-12650H', cores: 10 },   // TEMP-REVERT
  { model: '12th Gen Intel(R) Core(TM) i5-12400F', cores: 6 },
  { model: '12th Gen Intel(R) Core(TM) i9-12900K', cores: 16 },
  { model: '13th Gen Intel(R) Core(TM) i7-13700K', cores: 16 },
  { model: '13th Gen Intel(R) Core(TM) i5-13600K', cores: 14 },
  { model: '13th Gen Intel(R) Core(TM) i9-13900K', cores: 24 },
  { model: 'Intel(R) Core(TM) Ultra 7 155H', cores: 16 },
  { model: 'Intel(R) Core(TM) Ultra 9 285H', cores: 16 },
  { model: 'Intel(R) Core(TM) i9-14900K', cores: 24 },
  { model: 'Intel(R) Core(TM) i7-14700K', cores: 20 },
  { model: 'AMD Ryzen 7 7800X3D', cores: 8 },
  { model: 'AMD Ryzen 9 7950X', cores: 16 },
  { model: 'AMD Ryzen 5 7600', cores: 6 },
  { model: 'AMD Ryzen 9 7900X', cores: 12 },
  { model: 'AMD Ryzen 7 5800X3D', cores: 8 },
];
const FINGERPRINT_MEMS = [8, 16, 24, 32, 48, 64];
const FINGERPRINT_TZS = [
  'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'America/Toronto',
  'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'Europe/Moscow',
  'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Singapore', 'Asia/Seoul', 'Asia/Hong_Kong',
  'Australia/Sydney', 'Pacific/Auckland',
];
const FINGERPRINT_MAC_COUNT_RANGE = [2, 3, 4, 5]; // 随机 2~5 个 MAC

// CLI 的根盐（buildMachineFingerprint 常量 sb）
const FP_SALT = 'command-code:device-fingerprint:v1';
// 设备档案：指纹 / config.environment / config.workingDir / x-project-slug / lifecycle.os 共用同一份，
// 避免出现「指纹说 win32、环境说 linux」这类自相矛盾，也避免把宿主机真实信息（平台、Node 版本、cwd）交给上游。
const DEVICE_PROFILE = {
  platform: 'win32',
  arch: 'x64',
  osRelease: '10.0.22631',
  isContainer: false,
  // 伪造的项目目录：与 x-project-slug 同源（真机里 slug = slugify(workingDir)）
  projectDir: CFG.deviceProjectDir || 'C:\\Users\\dev\\projects\\app',
};
const FP_OS_USERS = ['dev', 'user', 'admin', 'coder', 'engineer', 'work'];
const FP_MAIL_DOMAINS = ['gmail.com', 'outlook.com', 'qq.com', '163.com'];

// 伪造信号的派生源。加 CC_FINGERPRINT_SALT 可成批换身份 —— 真实账号的 key 动不了，这是逃生口。
// 注意：哈希阶段用的是 CLI 的固定盐（FP_SALT），salt 只影响「伪造出哪台机器」。
function fpDigest(apiKey, field) {
  return crypto.createHash('sha256')
    .update(`${CFG.fingerprintSalt || ''}\0${apiKey}\0${field}`)
    .digest();
}
// 从候选池确定性地挑一项：打分取最大。以后往池里加候选只影响「新候选恰好胜出」的那部分 key，
// 不会像取模那样因为池长度变化让所有 key 一起换设备。
function fpPickIndex(apiKey, field, items, labelOf) {
  let bestIdx = 0;
  let bestScore = null;
  for (let i = 0; i < items.length; i++) {
    const score = fpDigest(apiKey, `${field}\0${labelOf(i)}`);
    if (!bestScore || Buffer.compare(score, bestScore) > 0) { bestScore = score; bestIdx = i; }
  }
  return bestIdx;
}
// CLI 的 hashSignal：sha256(FP_SALT + "\0" + value.toLowerCase())，空值返回 undefined（JSON 里被丢掉）
function fingerprintHash(value) {
  const v = String(value ?? '').trim();
  if (!v) return undefined;
  return crypto.createHash('sha256').update(`${FP_SALT}\0${v.toLowerCase()}`).digest('hex');
}

// 与 CLI 的唯一区别是「信号值」：CLI 读真实机器（注册表 / ioreg / machine-id、网卡 MAC、
// os.userInfo、git config），这里按 apiKey 确定性地伪造一组逼真值。
// 为什么必须由 apiKey 派生而不是随机：指纹代表「这个账号对应的那台设备」，重启、内存回收、
// 多实例、月额度用尽停用数周后恢复，上游都应看到同一台设备；换指纹本身就是可疑信号。
function generateFingerprint(apiKey) {
  const cpuEntry = FINGERPRINT_CPUS[fpPickIndex(apiKey, 'cpu', FINGERPRINT_CPUS, i => `${FINGERPRINT_CPUS[i].model}|${FINGERPRINT_CPUS[i].cores}`)];
  const memGiB = FINGERPRINT_MEMS[fpPickIndex(apiKey, 'mem', FINGERPRINT_MEMS, i => String(FINGERPRINT_MEMS[i]))];
  const tz = FINGERPRINT_TZS[fpPickIndex(apiKey, 'timezone', FINGERPRINT_TZS, i => FINGERPRINT_TZS[i])];
  const macCount = FINGERPRINT_MAC_COUNT_RANGE[fpPickIndex(apiKey, 'macCount', FINGERPRINT_MAC_COUNT_RANGE, i => String(FINGERPRINT_MAC_COUNT_RANGE[i]))];
  const osUser = FP_OS_USERS[fpPickIndex(apiKey, 'osUser', FP_OS_USERS, i => FP_OS_USERS[i])];
  const mailDomain = FP_MAIL_DOMAINS[fpPickIndex(apiKey, 'mailDomain', FP_MAIL_DOMAINS, i => FP_MAIL_DOMAINS[i])];
  const hex = (field, bytes) => fpDigest(apiKey, field).subarray(0, bytes).toString('hex');
  // Windows MachineGuid 形状：8-4-4-4-12
  const mid = hex('machineId', 16);
  const machineId = `${mid.slice(0, 8)}-${mid.slice(8, 12)}-${mid.slice(12, 16)}-${mid.slice(16, 20)}-${mid.slice(20, 32)}`;
  const macs = [];
  for (let i = 0; i < macCount; i++) {
    const b = fpDigest(apiKey, `mac${i}`).subarray(0, 6);
    macs.push([...b].map(x => x.toString(16).padStart(2, '0')).join(':'));
  }
  macs.sort(); // CLI 对 MAC 去重后排序
  const hostname = `DESKTOP-${hex('hostname', 4).toUpperCase()}`;
  const gitEmail = `${osUser}.${hex('gitEmail', 3)}@${mailDomain}`;

  const machineIdHash = fingerprintHash(machineId);
  const macHashes = macs.map(fingerprintHash).filter(Boolean);
  const osUserHash = fingerprintHash(osUser);
  const hostnameHash = fingerprintHash(hostname);
  const gitEmailHash = fingerprintHash(gitEmail);

  // CLI 的 thumbmark：主盐 + "\0machine\0" + join([machineId, macs.join(",")])
  // （machineId 非空时不再拼 hostname/cpuModel）
  const thumbSeed = [machineId.trim(), macs.join(','), machineId.trim() ? '' : hostname, machineId.trim() ? '' : cpuEntry.model].filter(Boolean);
  const thumbmark = crypto.createHash('sha256').update(`${FP_SALT}\0machine\0${thumbSeed.join('|') || 'unknown'}`).digest('hex');

  return {
    thumbmark,
    components: {
      machineIdHash,
      macHashes,
      osUserHash,
      hostnameHash,
      gitEmailHash,
      platform: DEVICE_PROFILE.platform,
      arch: DEVICE_PROFILE.arch,
      osRelease: DEVICE_PROFILE.osRelease,
      cpuModel: cpuEntry.model,
      cpuCount: cpuEntry.cores,
      memGiB,
      isContainer: DEVICE_PROFILE.isContainer,
      timezone: tz,
      runtime: 'cli',
      collectorVersion: 1,
    },
  };
}
// CLI 的 slug 规则：对**完整工作目录**做 slugify（@sindresorhus/slugify），空则 "root"，无随机后缀；
// 同一个 slug 也是 CLI 本地会话目录名。所以 slug 与 config.workingDir 同源：slug = slugify(workingDir)。
function slugifyProjectPath(p) {
  const s = String(p || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'root';
}

export { generateFingerprint, slugifyProjectPath, DEVICE_PROFILE };
