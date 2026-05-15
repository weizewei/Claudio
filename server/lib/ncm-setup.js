import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import config from './config.js';

const execAsync = promisify(exec);

// 获取项目根目录
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '../..');
const ncmCliPath = join(projectRoot, 'node_modules/.bin/ncm-cli');
const neteaseApiPath = join(projectRoot, 'NeteaseCloudMusicApi');

// neteaseApi 子进程引用
let neteaseApiProcess = null;

/**
 * 初始化网易云音乐服务
 * 1. 配置 ncm-cli 凭证（用于登录）
 * 2. 启动 NeteaseCloudMusicApi 服务器（提供 API）
 */
export async function startNCMService() {
  const appId = config.ncmOpen?.appId;
  const privateKey = config.ncmOpen?.privateKey;

  console.log('🔧 初始化网易云音乐服务...');

  // 步骤1: 配置 ncm-cli 凭证
  if (appId && privateKey) {
    console.log('📝 配置 ncm-cli 凭证...');
    try {
      await execAsync(`"${ncmCliPath}" config set appId ${appId}`, { timeout: 10000 });
      await execAsync(`"${ncmCliPath}" config set privateKey ${privateKey}`, { timeout: 10000 });
      console.log('✅ ncm-cli 凭证配置完成');
    } catch (error) {
      console.error('⚠️  ncm-cli 凭证配置失败:', error.message);
    }
  } else {
    console.log('⚠️  未在 .env 中找到 NCM_OPEN_APP_ID / NCM_OPEN_PRIVATE_KEY');
    console.log('   请访问 https://music.163.com/st/developer 注册获取');
  }

  // 步骤2: 检查登录状态
  let loggedIn = false;
  try {
    const { stdout } = await execAsync(`"${ncmCliPath}" login --check`, { timeout: 5000 });
    const data = JSON.parse(stdout);
    loggedIn = data.success === true;
  } catch {
    // 未登录
  }

  if (loggedIn) {
    console.log('✅ 网易云音乐已登录');
  } else {
    console.log('⚠️  网易云音乐未登录，尝试自动登录...');
    await autoLogin();
  }

  // 步骤3: 启动 NeteaseCloudMusicApi 服务器
  return startNeteaseApi();
}

/**
 * 自动登录（后台轮询模式）
 */
async function autoLogin() {
  try {
    const { stdout } = await execAsync(`"${ncmCliPath}" login --background`, { timeout: 15000 });
    const data = JSON.parse(stdout);

    if (data.success && data.qrCodeUrl) {
      console.log('');
      console.log('📱 请使用网易云音乐 App 扫码登录:');
      console.log(`   🔗 ${data.clickableUrl || data.qrCodeUrl}`);
      console.log('   扫码后 ncm-cli 会自动完成登录');
      console.log('');
    }
  } catch (error) {
    console.log('⚠️  自动登录启动失败，请手动运行: npx ncm-cli login');
  }
}

/**
 * 检查端口是否被占用
 */
async function isPortInUse(port) {
  try {
    const { stdout } = await execAsync(`lsof -i :${port} 2>/dev/null || true`, { timeout: 3000 });
    return stdout.includes('LISTEN');
  } catch {
    return false;
  }
}

/**
 * 克隆 NeteaseCloudMusicApi
 */
async function cloneNeteaseApi() {
  console.log('📦 首次运行，克隆 NeteaseCloudMusicApi...');
  try {
    await execAsync(`git clone --depth 1 https://github.com/Binaryify/NeteaseCloudMusicApi.git "${neteaseApiPath}"`, {
      timeout: 60000,
      cwd: projectRoot
    });
    console.log('✅ NeteaseCloudMusicApi 克隆完成');
    return true;
  } catch (error) {
    console.error('❌ 克隆失败:', error.message);
    return false;
  }
}

/**
 * 安装 NeteaseCloudMusicApi 依赖
 */
async function installNeteaseApiDeps() {
  console.log('📦 安装 NeteaseCloudMusicApi 依赖...');
  try {
    await execAsync('npm install', { timeout: 120000, cwd: neteaseApiPath });
    console.log('✅ NeteaseCloudMusicApi 依赖安装完成');
    return true;
  } catch (error) {
    console.error('❌ 依赖安装失败:', error.message);
    return false;
  }
}

/**
 * 启动 NeteaseCloudMusicApi 服务器
 */
async function startNeteaseApi() {
  // 检查端口是否已被占用
  if (await isPortInUse(3000)) {
    console.log('✅ 端口 3000 已有服务运行');
    return { success: true, port: 3000 };
  }

  // 检查是否已克隆
  if (!existsSync(neteaseApiPath)) {
    const cloned = await cloneNeteaseApi();
    if (!cloned) {
      return { success: false, error: '克隆失败' };
    }
  }

  // 检查 node_modules
  if (!existsSync(join(neteaseApiPath, 'node_modules'))) {
    const installed = await installNeteaseApiDeps();
    if (!installed) {
      return { success: false, error: '依赖安装失败' };
    }
  }

  // 启动服务
  console.log('🚀 启动 NeteaseCloudMusicApi 服务 (端口 3000)...');

  neteaseApiProcess = spawn('node', ['app.js'], {
    cwd: neteaseApiPath,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
    env: { ...process.env, PORT: 3000 }
  });

  neteaseApiProcess.stdout?.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.log(`   [NeteaseApi] ${msg}`);
  });

  neteaseApiProcess.stderr?.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg && !msg.includes('warn') && !msg.includes('deprecated')) {
      console.log(`   [NeteaseApi] ${msg}`);
    }
  });

  neteaseApiProcess.on('error', (err) => {
    console.error('❌ NeteaseCloudMusicApi 启动失败:', err.message);
  });

  neteaseApiProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.log(`⚠️  NeteaseCloudMusicApi 进程退出 (code: ${code})`);
    }
  });

  // 等待服务启动
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('✅ NeteaseCloudMusicApi 服务已启动 (端口 3000)');
  return { success: true, port: 3000 };
}

/**
 * 停止 NeteaseCloudMusicApi 服务
 */
export function stopNCMService() {
  if (neteaseApiProcess) {
    neteaseApiProcess.kill('SIGTERM');
    neteaseApiProcess = null;
    console.log('🛑 NeteaseCloudMusicApi 服务已停止');
  }
}
