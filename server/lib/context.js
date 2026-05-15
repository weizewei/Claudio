import fs from 'fs';
import path from 'path';
import config from './config.js';
import state from './state.js';

class Context {
  constructor() {
    this.promptsDir = config.paths.prompts;
    this.userDir = config.paths.user;
  }

  /**
   * 读取文件内容
   */
  readFile(filePath) {
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch {
      return '';
    }
  }

  /**
   * 读取JSON文件
   */
  readJSON(filePath) {
    try {
      const content = this.readFile(filePath);
      return content ? JSON.parse(content) : {};
    } catch {
      return {};
    }
  }

  /**
   * 获取DJ人设提示词
   */
  getDJPersona() {
    return this.readFile(path.join(this.promptsDir, 'dj-persona.md'));
  }

  /**
   * 获取用户品味（从JSON文件）
   */
  getUserTaste() {
    // 优先读取JSON格式的品味数据
    const tasteData = this.readJSON(path.join(this.userDir, 'user-taste.json'));

    if (tasteData && tasteData.musicTaste) {
      const mt = tasteData.musicTaste;

      // 格式化输出给 AI
      let tasteDesc = `【音乐品味总结】${mt.summary.zh}\n\n`;

      // 喜欢的歌手
      if (mt.favoriteArtists) {
        tasteDesc += '【最喜欢的歌手】\n';
        mt.favoriteArtists.topArtists.forEach(a => {
          tasteDesc += `- ${a.name}（${a.songCount}首）：${a.reason}\n`;
        });
        if (mt.favoriteArtists.otherNotable) {
          tasteDesc += `其他喜欢的歌手：${mt.favoriteArtists.otherNotable.join('、')}\n`;
        }
        tasteDesc += '\n';
      }

      // 音乐风格
      if (mt.musicStyles) {
        tasteDesc += '【音乐风格偏好】\n';
        tasteDesc += `- 主要风格：${mt.musicStyles.primary?.join('、')}\n`;
        tasteDesc += `- 次要风格：${mt.musicStyles.secondary?.join('、')}\n`;
        tasteDesc += `- 语言比例：${mt.musicStyles.language?.chinese}中文 / ${mt.musicStyles.language?.english}英文\n`;
        tasteDesc += '\n';
      }

      // 歌曲特点
      if (mt.songCharacteristics) {
        tasteDesc += '【歌曲特点】\n';
        tasteDesc += `- 主题：${mt.songCharacteristics.themes?.join('、')}\n`;
        tasteDesc += `- 氛围：${mt.songCharacteristics.mood?.join('、')}\n`;
        tasteDesc += '- 特点：情感细腻、有故事感、歌词有深度\n';
        tasteDesc += '\n';
      }

      // 推荐歌手
      if (mt.recommendedArtists) {
        tasteDesc += '【可能会喜欢的新歌手】\n';
        mt.recommendedArtists.similarToTopArtists.forEach(a => {
          tasteDesc += `- ${a.name}：${a.reason}\n`;
        });
      }

      return tasteDesc;
    }

    // Fallback: 读取旧格式的 taste.md
    return this.readFile(path.join(this.userDir, 'taste.md'));
  }

  /**
   * 更新用户品味（根据对话自动更新）
   */
  async updateUserTaste(userInput, aiResponse) {
    const tasteFile = path.join(this.userDir, 'user-taste.json');
    let tasteData = this.readJSON(tasteFile);

    // 如果没有品味数据，初始化
    if (!tasteData.musicTaste) {
      tasteData.musicTaste = {
        updatedAt: new Date().toISOString().split('T')[0],
        source: '从对话中学习',
        summary: { zh: '音乐品味持续更新中...' },
        learnedFromConversation: []
      };
    }

    // 检测用户是否提到了喜欢的音乐风格或歌手
    const likePatterns = [
      /喜欢(.+?)的歌|喜欢(.+?)(?:的|唱)/,
      /(?:我|个人)喜欢(.+?)(?:风格|类型|歌手|音乐)/,
      /最近在听(.+)/,
      /推荐点(.+?)(?:风格|类型|的音乐)/,
      /(民谣|摇滚|流行|古风|爵士|电子|古典|嘻哈|说唱).*音乐/,
      /(张宇|许嵩|薛之谦|双笙|谢春花|陈鸿宇|赵雷|黄龄|任然|周传雄|刀郎|陈奕迅|许巍|林俊杰|周杰伦|陈奕迅).*(?:的歌|的歌|的歌)/,
    ];

    const dislikePatterns = [
      /不喜欢(.+?)(?:风格|类型|歌手|音乐)/,
      /讨厌(.+?)(?:风格|类型|歌手|音乐)/,
      /不要(.+?)(?:风格|类型|的音乐)/
    ];

    // 检测喜欢的音乐类型
    let detectedTaste = null;

    for (const pattern of likePatterns) {
      const match = userInput.match(pattern);
      if (match) {
        detectedTaste = {
          type: 'like',
          content: match[0],
          source: '对话推断',
          timestamp: new Date().toISOString()
        };
        break;
      }
    }

    // 检测不喜欢的音乐类型
    if (!detectedTaste) {
      for (const pattern of dislikePatterns) {
        const match = userInput.match(pattern);
        if (match) {
          detectedTaste = {
            type: 'dislike',
            content: match[0],
            source: '对话推断',
            timestamp: new Date().toISOString()
          };
          break;
        }
      }
    }

    // 如果检测到新的品味偏好，保存
    if (detectedTaste) {
      if (!tasteData.musicTaste.learnedFromConversation) {
        tasteData.musicTaste.learnedFromConversation = [];
      }

      // 避免重复添加
      const exists = tasteData.musicTaste.learnedFromConversation.some(
        t => t.content === detectedTaste.content
      );

      if (!exists) {
        tasteData.musicTaste.learnedFromConversation.push(detectedTaste);
        tasteData.musicTaste.updatedAt = new Date().toISOString().split('T')[0];
        tasteData.musicTaste.summary.zh += `\n（根据对话更新：${detectedTaste.content}）`;

        // 保存到文件
        try {
          fs.writeFileSync(tasteFile, JSON.stringify(tasteData, null, 2), 'utf-8');
          console.log('✅ 用户品味已更新:', detectedTaste.content);
        } catch (e) {
          console.error('保存品味失败:', e);
        }
      }
    }
  }

  /**
   * 获取用户作息
   */
  getUserRoutines() {
    return this.readFile(path.join(this.userDir, 'routines.md'));
  }

  /**
   * 获取情绪规则
   */
  getMoodRules() {
    return this.readJSON(path.join(this.userDir, 'mood-rules.json'));
  }

  /**
   * 获取用户播放列表
   */
  getUserPlaylists() {
    return this.readJSON(path.join(this.userDir, 'playlists.json'));
  }

  /**
   * 获取当前时间上下文
   */
  getTimeContext() {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    let timeOfDay;
    if (hour >= 5 && hour < 12) timeOfDay = 'morning';
    else if (hour >= 12 && hour < 14) timeOfDay = 'noon';
    else if (hour >= 14 && hour < 18) timeOfDay = 'afternoon';
    else if (hour >= 18 && hour < 22) timeOfDay = 'evening';
    else timeOfDay = 'night';

    const greetings = {
      morning: '早上好',
      noon: '中午好',
      afternoon: '下午好',
      evening: '晚上好',
      night: '夜深了'
    };

    return {
      hour,
      dayOfWeek,
      isWeekend,
      timeOfDay,
      greeting: greetings[timeOfDay],
      date: now.toLocaleDateString('zh-CN', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        weekday: 'long'
      }),
      time: now.toLocaleTimeString('zh-CN', { 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    };
  }

  /**
   * 获取天气信息
   */
  async getWeatherContext() {
    try {
      const response = await fetch(
        `https://wttr.in/${config.weather.city}?format=j1`
      );
      const data = await response.json();
      const current = data.current_condition[0];
      
      return {
        temp: current.temp_C,
        feelsLike: current.FeelsLikeC,
        description: current.weatherDesc[0].value,
        humidity: current.humidity,
        windSpeed: current.windspeedKmph,
        isRainy: current.precipMM > 0,
        isSunny: current.weatherDesc[0].value.toLowerCase().includes('sunny')
      };
    } catch (error) {
      console.error('获取天气失败:', error);
      return null;
    }
  }

  /**
   * 获取播放历史上下文
   */
  getPlayHistory(limit = 10) {
    const plays = state.getPlays(limit);
    if (plays.length === 0) return null;
    
    return plays.map(p => ({
      name: p.song_name,
      artist: p.artist,
      playedAt: p.played_at
    }));
  }

  /**
   * 组装完整的上下文窗口
   */
  async buildContext(userInput = '') {
    // 1. 系统提示词
    const systemPrompt = this.getDJPersona();
    
    // 2. 用户语料
    const userTaste = this.getUserTaste();
    const userRoutines = this.getUserRoutines();
    const moodRules = this.getMoodRules();
    
    // 3. 环境注入
    const timeContext = this.getTimeContext();
    const weatherContext = await this.getWeatherContext();
    
    // 4. 已检索记忆
    const playHistory = this.getPlayHistory();
    const messages = state.getMessages(20);
    
    // 5. 构建环境描述
    let environmentDesc = `当前时间：${timeContext.date} ${timeContext.time}\n`;
    environmentDesc += `时段：${timeContext.greeting}${timeContext.isWeekend ? '（周末）' : '（工作日）'}\n`;
    
    if (weatherContext) {
      environmentDesc += `天气：${weatherContext.description}，温度${weatherContext.temp}°C`;
      if (weatherContext.isRainy) environmentDesc += '，正在下雨';
      environmentDesc += '\n';
    }
    
    // 6. 构建历史对话
    const conversationHistory = messages.map(m => 
      `${m.role === 'user' ? '用户' : 'Claudio'}: ${m.content}`
    ).join('\n');
    
    // 7. 构建播放历史
    let playHistoryDesc = '';
    if (playHistory && playHistory.length > 0) {
      playHistoryDesc = '最近播放：\n' + playHistory.map(p => 
        `- ${p.name} - ${p.artist}`
      ).join('\n');
    }

    // 组装完整提示词
    const fullPrompt = `${systemPrompt}

## 用户信息

### 音乐品味
${userTaste}

### 日常作息
${userRoutines}

### 情绪规则
${JSON.stringify(moodRules, null, 2)}

## 当前环境

${environmentDesc}

## 历史记录

### 对话历史
${conversationHistory || '（暂无对话历史）'}

### 播放历史
${playHistoryDesc || '（暂无播放历史）'}

## 用户输入

${userInput}

---

请根据以上信息，以Claudio的身份回复用户。记住要自然、温暖、有个性。`;

    return {
      systemPrompt,
      userTaste,
      userRoutines,
      moodRules,
      timeContext,
      weatherContext,
      playHistory,
      messages,
      fullPrompt
    };
  }
}

export default new Context();
