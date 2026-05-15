import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import config from './config.js';

const execAsync = promisify(exec);

// 获取项目根目录
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '../..');

/**
 * 网易云音乐开放平台适配器
 * 使用官方 @music163/ncm-cli 进行搜索、推荐、播放等操作
 * 
 * ncm-cli 已作为项目依赖安装，无需全局安装
 */
class NCMOpen {
  constructor() {
    this.appId = config.ncmOpen?.appId || '';
    this.privateKey = config.ncmOpen?.privateKey || '';
    this.isConfigured = !!(this.appId && this.privateKey);
    // 本地 ncm-cli 路径
    this.ncmCliPath = join(projectRoot, 'node_modules/.bin/ncm-cli');
  }

  /**
   * 执行CLI命令
   */
  async _exec(args, timeout = 20000) {
    const cmd = `"${this.ncmCliPath}" ${args}`;
    
    try {
      const { stdout, stderr } = await execAsync(cmd, {
        timeout,
        maxBuffer: 1024 * 1024 // 1MB
      });
      
      if (stderr && !stderr.includes('warn')) {
        console.warn(`NCM CLI warning: ${stderr}`);
      }
      
      return stdout.trim();
    } catch (error) {
      console.error(`NCM CLI执行失败 [${cmd}]:`, error.message);
      return null;
    }
  }

  /**
   * 解析JSON输出
   */
  _parseJson(output) {
    if (!output) return null;
    try {
      return JSON.parse(output);
    } catch {
      // 尝试从输出中提取JSON
      const match = output.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  /**
   * 配置凭证
   */
  async configure(appId, privateKey) {
    this.appId = appId;
    this.privateKey = privateKey;
    this.isConfigured = true;

    try {
      await execAsync(`"${this.ncmCliPath}" config set appId ${appId}`, { timeout: 5000 });
      await execAsync(`"${this.ncmCliPath}" config set privateKey ${privateKey}`, { timeout: 5000 });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 检查登录状态
   */
  async checkLogin() {
    const output = await this._exec('login --check', 5000);
    if (!output) return { loggedIn: false };
    
    const data = this._parseJson(output);
    return {
      loggedIn: data?.success === true,
      message: data?.message || ''
    };
  }

  /**
   * 登录（生成二维码URL供用户扫码）
   */
  async login() {
    const output = await this._exec('login', 30000);
    return output;
  }

  /**
   * 搜索歌曲
   */
  async search(keyword, limit = 10) {
    const output = await this._exec(`search song --keyword "${keyword}" --limit ${limit} --output json`, 25000);
    if (!output) return [];

    const data = this._parseJson(output);
    
    // CLI 返回格式: { code: 200, data: { records: [...] } }
    const songs = data?.data?.records || [];
    
    return songs.map(song => ({
      id: song.originalId || song.id,
      encryptedId: song.id,
      originalId: song.originalId,
      name: song.name,
      artist: song.artists?.map(a => a.name).join(', ') || '',
      album: song.album?.name || '',
      cover: song.coverImgUrl || '',
      duration: song.duration || 0,
      playFlag: song.playFlag,
      source: 'ncm-open'
    }));
  }

  /**
   * 获取每日推荐
   */
  async getDailyRecommend(limit = 10) {
    const output = await this._exec(`recommend daily --limit ${limit} --output json`, 15000);
    if (!output) return [];

    const data = this._parseJson(output);
    
    // CLI 返回格式: { code: 200, data: [...] }
    const songs = data?.data || [];
    
    return songs.map(song => ({
      id: song.originalId || song.id,
      encryptedId: song.id,
      originalId: song.originalId,
      name: song.name,
      artist: song.artists?.map(a => a.name).join(', ') || '',
      album: song.album?.name || '',
      cover: song.coverImgUrl || '',
      duration: song.duration || 0,
      playFlag: song.playFlag,
      reason: song.reason || '',
      source: 'ncm-open'
    }));
  }

  /**
   * 获取播放链接
   */
  async getPlayUrl(encryptedId, originalId) {
    if (!encryptedId || !originalId) return null;

    const output = await this._exec(
      `play --song --encrypted-id ${encryptedId} --original-id ${originalId}`,
      15000
    );
    
    if (!output) return null;
    
    const data = this._parseJson(output);
    return data;
  }

  /**
   * 获取播放状态
   */
  async getState() {
    const output = await this._exec('state', 5000);
    if (!output) return null;
    return this._parseJson(output);
  }

  /**
   * 播放控制
   */
  async pause() {
    return this._exec('pause', 5000);
  }

  async resume() {
    return this._exec('resume', 5000);
  }

  async next() {
    return this._exec('next', 5000);
  }

  async prev() {
    return this._exec('prev', 5000);
  }

  async stop() {
    return this._exec('stop', 5000);
  }

  /**
   * 获取播放队列
   */
  async getQueue() {
    const output = await this._exec('queue', 5000);
    if (!output) return [];
    return this._parseJson(output) || [];
  }

  /**
   * 添加到队列
   */
  async addToQueue(encryptedId) {
    return this._exec(`queue add --encrypted-id ${encryptedId}`, 5000);
  }

  /**
   * 获取用户歌单
   */
  async getPlaylists() {
    const output = await this._exec('playlist list', 10000);
    if (!output) return [];
    const data = this._parseJson(output);
    return Array.isArray(data) ? data : [];
  }

  /**
   * 获取用户播放记录
   */
  async getPlayHistory(limit = 20) {
    // CLI可能没有直接的播放记录命令，使用搜索替代
    // 后续可根据CLI更新添加
    return [];
  }

  /**
   * 综合搜索
   */
  async searchAll(keyword) {
    const output = await this._exec(`search all --keyword "${keyword}"`, 15000);
    if (!output) return null;
    return this._parseJson(output);
  }

  /**
   * 检查CLI是否可用
   */
  async isAvailable() {
    try {
      const { stdout } = await execAsync(`"${this.ncmCliPath}" --version`, { timeout: 3000 });
      return !!stdout;
    } catch {
      return false;
    }
  }
}

export default new NCMOpen();
