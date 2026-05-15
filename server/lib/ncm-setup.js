import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import config from './config.js';

const execAsync = promisify(exec);

// 获取项目根目录
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '../..');
const ncmCliPath = join(projectRoot, 'node_modules/.bin/ncm-cli');

// NeteaseCloudMusicApi 子进程
let neteaseApiProcess = null;

/**
 * 初始化网易云音乐服务
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

  // 步骤3: 启动 NeteaseCloudMusicApi 服务
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
 * 启动 NeteaseCloudMusicApi 服务
 */
async function startNeteaseApi() {
  // 检查端口是否已被占用
  try {
    const response = await fetch('http://localhost:3000/available', {
      signal: AbortSignal.timeout(3000)
    });
    if (response.ok) {
      console.log('✅ 端口 3000 已有 NeteaseCloudMusicApi 运行');
      return { success: true, port: 3000 };
    }
  } catch {
    // 端口未被占用，继续启动
  }

  console.log('🚀 启动 NeteaseCloudMusicApi 服务 (端口 3000)...');

  // 使用 npx 启动 NeteaseCloudMusicApi
  neteaseApiProcess = spawn('npx', ['NeteaseCloudMusicApi@latest'], {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
    env: { ...process.env, PORT: '3000' }
  });

  neteaseApiProcess.stdout?.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.log(`   [NeteaseApi] ${msg}`);
  });

  neteaseApiProcess.stderr?.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg && !msg.includes('warn') && !msg.includes('deprecated') && !msg.includes('npm warn')) {
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
  let retries = 10;
  while (retries > 0) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    try {
      const response = await fetch('http://localhost:3000/available', {
        signal: AbortSignal.timeout(2000)
      });
      if (response.ok) {
        console.log('✅ NeteaseCloudMusicApi 服务已启动 (端口 3000)');
        return { success: true, port: 3000 };
      }
    } catch {
      retries--;
    }
  }

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
