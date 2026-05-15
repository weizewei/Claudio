import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import config from './config.js';

const execAsync = promisify(exec);

// 获取项目根目录
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '../..');
const ncmCliPath = join(projectRoot, 'node_modules/.bin/ncm-cli');

// ncm-cli 子进程引用
let ncmCliProcess = null;

/**
 * 启动 ncm-cli 服务（后台运行在 3000 端口）
 */
export async function startNCMService() {
  const appId = config.ncmOpen?.appId;
  const privateKey = config.ncmOpen?.privateKey;

  console.log('🔧 初始化网易云音乐 CLI...');

  // 步骤1: 配置 appId 和 privateKey
  if (appId && privateKey) {
    console.log('📝 配置 ncm-cli 凭证...');
    try {
      await execAsync(`"${ncmCliPath}" config set appId ${appId}`, { timeout: 10000 });
      await execAsync(`"${ncmCliPath}" config set privateKey ${privateKey}`, { timeout: 10000 });
      console.log('✅ ncm-cli 凭证配置完成');
    } catch (error) {
      console.error('❌ ncm-cli 凭证配置失败:', error.message);
    }
  } else {
    console.log('⚠️  未在 .env 中找到 NCM_OPEN_APP_ID / NCM_OPEN_PRIVATE_KEY');
    console.log('   网易云音乐搜索功能将不可用');
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

  // 步骤3: 启动 ncm-cli 服务（后台进程）
  return startNCMCliDaemon();
}

/**
 * 自动登录（后台轮询模式）
 * 生成二维码链接，用户扫码后自动完成登录
 */
async function autoLogin() {
  try {
    const { stdout } = await execAsync(`"${ncmCliPath}" login --background`, { timeout: 15000 });
    const data = JSON.parse(stdout);

    if (data.success && data.qrCodeUrl) {
      console.log('');
      console.log('📱 请使用网易云音乐 App 扫码登录:');
      console.log(`   🔗 ${data.clickableUrl || data.qrCodeUrl}`);
      console.log('   扫码后 ncm-cli 会自动完成登录，无需重启服务');
      console.log('');
    } else if (data.clickableUrl) {
      console.log('');
      console.log('📱 请点击以下链接登录网易云音乐:');
      console.log(`   🔗 ${data.clickableUrl}`);
      console.log('');
    }
  } catch (error) {
    console.log('⚠️  自动登录失败，请手动运行: npx ncm-cli login');
  }
}

/**
 * 启动 ncm-cli 作为后台守护进程
 * ncm-cli 会启动一个本地服务提供 API
 */
function startNCMCliDaemon() {
  return new Promise((resolve) => {
    // 检查 3000 端口是否已被占用
    execAsync('lsof -i :3000 2>/dev/null || true', { timeout: 3000 })
      .then(({ stdout }) => {
        if (stdout && stdout.includes('LISTEN')) {
          console.log('✅ 端口 3000 已有服务运行，跳过 ncm-cli 启动');
          resolve({ success: true, port: 3000 });
          return;
        }

        // 启动 ncm-cli 服务
        console.log('🚀 启动 ncm-cli 服务 (端口 3000)...');

        ncmCliProcess = spawn('node', [
          join(projectRoot, 'node_modules/@music163/ncm-cli/dist/index.js'),
          'serve',
          '--port', '3000'
        ], {
          cwd: projectRoot,
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: false
        });

        ncmCliProcess.stdout?.on('data', (data) => {
          const msg = data.toString().trim();
          if (msg) console.log(`   [ncm-cli] ${msg}`);
        });

        ncmCliProcess.stderr?.on('data', (data) => {
          const msg = data.toString().trim();
          if (msg && !msg.includes('warn')) {
            console.error(`   [ncm-cli] ${msg}`);
          }
        });

        ncmCliProcess.on('error', (err) => {
          console.error('❌ ncm-cli 启动失败:', err.message);
          resolve({ success: false, error: err.message });
        });

        ncmCliProcess.on('exit', (code) => {
          if (code !== 0 && code !== null) {
            console.log(`⚠️  ncm-cli 进程退出 (code: ${code})`);
          }
        });

        // 给服务一点启动时间
        setTimeout(() => {
          console.log('✅ ncm-cli 服务已启动');
          resolve({ success: true, port: 3000 });
        }, 3000);
      })
      .catch(() => {
        // lsof 不可用，直接尝试启动
        resolve({ success: false, error: '无法检查端口' });
      });
  });
}

/**
 * 停止 ncm-cli 服务
 */
export function stopNCMService() {
  if (ncmCliProcess) {
    ncmCliProcess.kill('SIGTERM');
    ncmCliProcess = null;
    console.log('🛑 ncm-cli 服务已停止');
  }
}
