import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import config from './config.js';

const execAsync = promisify(exec);

// 获取项目根目录
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '../..');
const ncmCliPath = join(projectRoot, 'node_modules/.bin/ncm-cli');

/**
 * 自动配置 ncm-cli
 * 从 env 文件读取配置，如果没有则提示用户
 */
export async function setupNCM() {
  const appId = config.ncmOpen?.appId;
  const privateKey = config.ncmOpen?.privateKey;

  console.log('🔧 检查网易云音乐 CLI 配置...');

  // 检查是否已配置
  try {
    const { stdout } = await execAsync(`"${ncmCliPath}" config get appId`, { timeout: 5000 });
    if (stdout && stdout.trim()) {
      console.log('✅ ncm-cli 已配置');
      return { success: true };
    }
  } catch {
    // 未配置，继续
  }

  // 从 env 读取配置
  if (appId && privateKey) {
    console.log('📝 从 .env 文件读取到配置，自动设置中...');
    try {
      await execAsync(`"${ncmCliPath}" config set appId ${appId}`, { timeout: 10000 });
      await execAsync(`"${ncmCliPath}" config set privateKey ${privateKey}`, { timeout: 10000 });
      console.log('✅ ncm-cli 配置完成');
      console.log('💡 请运行: npx ncm-cli login 进行登录');
      return { success: true, autoConfigured: true };
    } catch (error) {
      console.error('❌ 自动配置失败:', error.message);
      return { success: false, error: error.message };
    }
  }

  // 没有配置，提示用户
  console.log('⚠️  未找到网易云音乐 API 配置');
  console.log('');
  console.log('请完成以下步骤:');
  console.log('1. 访问 https://music.163.com/st/developer 注册开发者账号');
  console.log('2. 创建应用获取 AppID 和 PrivateKey');
  console.log('3. 在 .env 文件中添加:');
  console.log('   NCM_OPEN_APP_ID=你的AppID');
  console.log('   NCM_OPEN_PRIVATE_KEY=你的PrivateKey');
  console.log('4. 运行: npx ncm-cli login 登录');
  console.log('');

  return { 
    success: false, 
    needConfig: true,
    message: '请在 .env 文件中配置 NCM_OPEN_APP_ID 和 NCM_OPEN_PRIVATE_KEY'
  };
}

/**
 * 检查登录状态
 */
export async function checkNCMLogin() {
  try {
    const { stdout } = await execAsync(`"${ncmCliPath}" login --check`, { timeout: 5000 });
    const data = JSON.parse(stdout);
    if (data.success) {
      console.log('✅ 网易云音乐已登录');
      return { loggedIn: true };
    }
  } catch {
    // 未登录
  }
  
  console.log('⚠️  网易云音乐未登录');
  console.log('💡 请运行: npx ncm-cli login');
  return { loggedIn: false };
}
