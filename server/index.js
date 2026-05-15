import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join, resolve, basename } from 'path';
import crypto from 'crypto';

// 加载.env配置文件
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../.env') });

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import config_ from './lib/config.js';
import router from './lib/router.js';
import ncm from './lib/ncm.js';
import deepseek from './lib/deepseek.js';
import state from './lib/state.js';
import scheduler from './lib/scheduler.js';
import tts from './lib/tts.js';
import context from './lib/context.js';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// WebSocket连接管理
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('WebSocket客户端已连接');
  
  ws.on('close', () => {
    clients.delete(ws);
    console.log('WebSocket客户端已断开');
  });
});

// 广播消息给所有客户端
function broadcast(data) {
  const message = JSON.stringify(data);
  clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

// ==================== API路由 ====================

/**
 * POST /api/chat - 主要对话接口
 */
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: '请输入消息' });
    }

    // 生成唯一请求ID用于前端去重
    const reqid = crypto.randomUUID();

    const response = await router.route(message);
    response.reqid = reqid;

    // 如果say字段为空，设置默认回复
    if (!response.say) {
      response.say = '好的，我收到了你的消息。';
    }

    // 如果有播放列表，获取歌曲URL
    if (response.play && response.play.length > 0) {
      const songsWithUrl = await Promise.all(
        response.play.map(async (song) => {
          if (song.id) {
            const urlInfo = await ncm.getSongUrl(song.id);
            return { ...song, url: urlInfo?.url };
          }
          return song;
        })
      );
      response.play = songsWithUrl.filter(s => s.url);

      // 记录播放
      if (response.play.length > 0) {
        state.addPlay(response.play[0]);
      }
    }

    // 自动学习用户品味（对话中提到喜欢的音乐）
    try {
      await context.updateUserTaste(message, response);
    } catch (tasteError) {
      console.error('品味学习失败:', tasteError.message);
    }

    // 只通过 HTTP 响应返回，不再 WebSocket 广播（避免前端重复处理）
    res.json(response);
  } catch (error) {
    console.error('聊天处理失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/now - 获取当前播放状态
 */
app.get('/api/now', async (req, res) => {
  try {
    let recentPlays = [];
    try {
      recentPlays = state.getPlays(1);
    } catch (dbError) {
      console.error('SQLite读取失败，使用默认值:', dbError.message);
    }
    const currentSong = recentPlays.length > 0 ? recentPlays[0] : null;
    
    let timeContext = {};
    let weatherContext = {};
    try {
      timeContext = context.getTimeContext();
      weatherContext = await context.getWeatherContext();
    } catch (ctxError) {
      console.error('上下文获取失败，使用默认值:', ctxError.message);
    }
    
    res.json({
      song: currentSong,
      time: timeContext,
      weather: weatherContext
    });
  } catch (error) {
    console.error('/api/now 错误:', error.message);
    res.json({
      song: null,
      time: {},
      weather: {}
    });
  }
});

/**
 * GET /api/next - 获取下一首推荐
 */
app.get('/api/next', async (req, res) => {
  try {
    // 获取推荐歌曲
    const songs = await ncm.getRecommendSongs(5);
    
    if (songs.length > 0) {
      // 获取歌曲URL
      const songsWithUrl = await Promise.all(
        songs.map(async (song) => {
          const urlInfo = await ncm.getSongUrl(song.id);
          return { ...song, url: urlInfo?.url };
        })
      );
      
      res.json({ songs: songsWithUrl.filter(s => s.url) });
    } else {
      res.json({ songs: [] });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/taste - 获取用户品味
 */
app.get('/api/taste', (req, res) => {
  const taste = context.getUserTaste();
  const routines = context.getUserRoutines();
  const moodRules = context.getMoodRules();
  
  res.json({
    taste,
    routines,
    moodRules
  });
});

/**
 * PUT /api/taste - 更新用户品味
 */
app.put('/api/taste', (req, res) => {
  const { taste, routines, moodRules } = req.body;
  
  // 这里可以写入文件保存
  // 简化处理，返回成功
  res.json({ success: true });
});

/**
 * GET /api/plan/today - 获取今日计划
 */
app.get('/api/plan/today', (req, res) => {
  try {
    const plan = scheduler.getTodayPlan();
    res.json({ plan });
  } catch (error) {
    console.error('/api/plan/today 错误:', error.message);
    res.json({ plan: null });
  }
});

/**
 * GET /api/search - 搜索歌曲
 */
app.get('/api/search', async (req, res) => {
  try {
    const { keyword, limit = 10 } = req.query;
    
    if (!keyword) {
      return res.status(400).json({ error: '请输入搜索关键词' });
    }

    const songs = await ncm.search(keyword, parseInt(limit));
    res.json({ songs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/song/:id - 获取歌曲详情
 */
app.get('/api/song/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [songDetail, urlInfo, lyric] = await Promise.all([
      ncm.getSongDetail(id),
      ncm.getSongUrl(id),
      ncm.getLyric(id)
    ]);

    res.json({
      song: songDetail[0],
      url: urlInfo,
      lyric
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/recommend - 获取推荐歌曲
 * 优先级：网易云推荐 > DeepSeek推荐 > 备用数据
 */
app.get('/api/recommend', async (req, res) => {
  try {
    const { mood, limit = 5 } = req.query;
    
    // 1. 尝试网易云音乐推荐
    try {
      const recommendSongs = await ncm.getRecommendSongs(parseInt(limit));
      if (recommendSongs && recommendSongs.length > 0) {
        const songsWithUrl = await Promise.all(recommendSongs.map(async (song) => {
          try {
            const urlInfo = await ncm.getSongUrl(song.id);
            return { ...song, url: urlInfo?.url || null };
          } catch {
            return { ...song, url: null };
          }
        }));
        return res.json({
          songs: songsWithUrl,
          say: '这是网易云音乐为你准备的每日推荐',
          reason: '网易云音乐每日推荐',
          source: 'ncm'
        });
      }
    } catch (error) {
      console.error('网易云推荐失败:', error.message);
    }
    
    // 2. 使用DeepSeek进行智能推荐
    try {
      const result = await deepseek.recommendMusic({
        mood: mood || undefined,
        count: parseInt(limit)
      });
      
      if (result.songs && result.songs.length > 0) {
        // 用网易云API获取播放地址
        const songsWithUrl = await Promise.all(
          result.songs.map(async (song) => {
            try {
              const searchResults = await ncm.search(`${song.name} ${song.artist}`, 1);
              if (searchResults && searchResults.length > 0) {
                const urlInfo = await ncm.getSongUrl(searchResults[0].id);
                if (urlInfo && urlInfo.url) {
                  return {
                    id: searchResults[0].id,
                    name: song.name,
                    artist: song.artist,
                    album: song.album || searchResults[0].album,
                    cover: searchResults[0].cover,
                    duration: searchResults[0].duration,
                    url: urlInfo.url,
                    reason: song.reason,
                    source: 'deepseek+ncm'
                  };
                }
              }
            } catch { /* skip */ }
            
            return {
              id: `ds_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              name: song.name,
              artist: song.artist,
              album: song.album || '',
              cover: '',
              duration: 0,
              url: null,
              reason: song.reason,
              source: 'deepseek'
            };
          })
        );
        
        return res.json({
          songs: songsWithUrl,
          say: result.say,
          reason: result.reason,
          source: 'deepseek'
        });
      }
    } catch (error) {
      console.error('DeepSeek推荐失败:', error.message);
    }
    
    // 3. 最终备用：网易云第三方API
    const fallbackSongs = await ncm.getRecommendSongs(parseInt(limit));
    // 补充播放地址
    const fallbackWithUrl = await Promise.all(fallbackSongs.map(async (song) => {
      try {
        const urlInfo = await ncm.getSongUrl(song.id);
        return { ...song, url: urlInfo?.url || null };
      } catch {
        return { ...song, url: null };
      }
    }));
    res.json({
      songs: fallbackWithUrl,
      say: '为你推荐一些音乐',
      reason: '今日推荐',
      source: 'ncm-fallback'
    });
  } catch (error) {
    console.error('推荐失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/stats - 获取统计信息
 */
app.get('/api/stats', (req, res) => {
  try {
    const stats = state.getStats();
    res.json(stats);
  } catch (error) {
    console.error('/api/stats 错误:', error.message);
    res.json({ totalPlays: 0, todayPlays: 0, topGenres: [], topArtists: [] });
  }
});

/**
 * POST /api/ncm/login-check - 检测网易云登录状态
 */
app.post('/api/ncm/login-check', async (req, res) => {
  try {
    const cookie = req.body.cookie || config.ncm.cookie;
    if (!cookie) {
      return res.json({ loggedIn: false, message: '未配置 Cookie' });
    }
    
    const api = await import('NeteaseCloudMusicApi');
    const ncmApi = api.default;
    const result = await ncmApi.login_status({ cookie });
    
    const loggedIn = result.status === 200 && result.body?.data?.account;
    return res.json({
      loggedIn,
      nickname: loggedIn ? result.body.data.account.nickname : '',
      userId: loggedIn ? result.body.data.account.id : '',
      vipType: loggedIn ? result.body.data.account.vipType : 0,
      message: loggedIn ? `已登录: ${result.body.data.account.nickname}` : 'Cookie 无效或已过期'
    });
  } catch (error) {
    console.error('检测网易云登录失败:', error.message);
    res.json({ loggedIn: false, message: '检测失败: ' + error.message });
  }
});

/**
 * POST /api/ncm/cookie - 保存网易云 Cookie
 */
app.post('/api/ncm/cookie', async (req, res) => {
  try {
    const { cookie } = req.body;
    if (!cookie) {
      return res.status(400).json({ error: 'Cookie 不能为空' });
    }
    
    // 更新运行时配置
    config.ncm.cookie = cookie;
    if (ncm) ncm.cookie = cookie;
    
    // 保存到 .env 文件
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const envPath = path.join(__dirname, '../.env');
    
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf-8');
    }
    
    // 更新或添加 NCM_COOKIE
    if (envContent.includes('NCM_COOKIE=')) {
      envContent = envContent.replace(/NCM_COOKIE=.*/, `NCM_COOKIE=${cookie}`);
    } else {
      envContent += `\nNCM_COOKIE=${cookie}\n`;
    }
    
    fs.writeFileSync(envPath, envContent, 'utf-8');
    
    res.json({ success: true, message: 'Cookie 已保存' });
  } catch (error) {
    console.error('保存 Cookie 失败:', error.message);
    res.status(500).json({ error: '保存失败: ' + error.message });
  }
});

/**
 * POST /api/tts - 文字转语音
 */
app.post('/api/tts', async (req, res) => {
  try {
    const { text, voiceType, appId, accessToken, apiKey, emotion, resourceId, instruction } = req.body;

    if (!text) {
      return res.status(400).json({ error: '请输入文本' });
    }

    const options = {};
    if (voiceType) options.voiceType = voiceType;
    if (appId) options.appId = appId;
    if (accessToken) options.accessToken = accessToken;
    if (apiKey) options.apiKey = apiKey;
    if (emotion) options.emotion = emotion;
    if (resourceId) options.resourceId = resourceId;
    if (instruction) options.instruction = instruction;

    const audioPath = await tts.synthesize(text, options);

    if (audioPath) {
      res.json({
        success: true,
        audioUrl: `/tts/${basename(audioPath)}`
      });
    } else {
      res.json({ success: false, message: 'TTS服务未配置' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ncm/login-status - 获取网易云登录状态
 */
app.get('/api/ncm/login-status', async (req, res) => {
  try {
    const status = await ncm.getLoginStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ncm/play-record - 获取网易云播放记录
 */
app.get('/api/ncm/play-record', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const records = await ncm.getPlayRecord(parseInt(limit));
    res.json({ records });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ncm/playlists - 获取用户网易云歌单
 */
app.get('/api/ncm/playlists', async (req, res) => {
  try {
    const { limit = 30 } = req.query;
    const playlists = await ncm.getUserPlaylists(parseInt(limit));
    res.json({ playlists });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ncm/account - 获取网易云账号信息
 */
app.get('/api/ncm/account', async (req, res) => {
  try {
    const account = await ncm.getUserAccount();
    res.json({ account });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ncm/cookie - 保存网易云Cookie
 */
app.post('/api/ncm/cookie', async (req, res) => {
  try {
    const { cookie } = req.body;
    if (!cookie) {
      return res.status(400).json({ error: '请提供Cookie' });
    }

    // 更新运行时cookie
    if (ncm) ncm.cookie = cookie;

    // 保存到.env文件
    const fs = await import('fs');
    const envPath = join(__dirname, '../.env');
    let envContent = fs.readFileSync(envPath, 'utf-8');

    if (envContent.includes('NCM_COOKIE=')) {
      envContent = envContent.replace(/NCM_COOKIE=.*/, `NCM_COOKIE=${cookie}`);
    } else {
      envContent += `\nNCM_COOKIE=${cookie}`;
    }

    fs.writeFileSync(envPath, envContent);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// TTS音频文件服务
app.use('/tts', express.static(join(__dirname, '../cache/tts')));

// SPA回退
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'public/index.html'));
});

// 启动服务器
server.listen(config_.port, async () => {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║   🎵 Claudio - 个人AI电台                                     ║
║                                                                ║
║   🌐 服务地址: http://localhost:${config_.port}                         ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
  `);

  // 启动调度器
  scheduler.start();
});

export { app, server, broadcast };
