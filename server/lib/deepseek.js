import config from './config.js';
import context from './context.js';
import state from './state.js';
import ncm from './ncm.js';

class DeepSeekAdapter {
  constructor() {
    this.apiKey = config.deepseek.apiKey;
    this.baseUrl = config.deepseek.baseUrl;
    this.model = config.deepseek.model;
  }

  /**
   * 调用DeepSeek API（内部方法）
   */
  async _call(messages, temperature = 0.8) {
    if (!this.apiKey) {
      throw new Error('DeepSeek API Key未配置');
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature,
        max_tokens: 1500,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'DeepSeek API调用失败');
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  /**
   * 调用DeepSeek API - 电台 DJ 模式
   */
  async chat(userInput) {
    // 构建上下文
    const contextData = await context.buildContext(userInput);
    
    // DJ 人设系统提示词
    const djPersona = `你是 Claudio，一个温暖、有品味的私人电台 DJ。

你的风格：
- 像朋友一样自然交谈，不机械、不刻板
- 善于倾听用户的情绪和场景，主动推荐合适的音乐
- 回复简洁温暖，通常1-2句话，不要长篇大论
- 当用户表达情绪或场景时，主动推荐音乐，不要说"你可以听听..."，而是直接说"我为你选了..."

判断逻辑：
- 如果用户提到心情、场景、时间（如"今天心情不好""工作时听什么""深夜了"），你要推荐音乐，play 留空，系统会处理推荐
- 如果用户明确说歌名或歌手（如"播放周杰伦的歌""来首晴天"），你要在 say 中正常回复，并在 play 中填入你判断的歌名和歌手信息，格式：[{"name":"歌曲名","artist":"歌手名"}]，系统会去搜索播放链接
- 如果用户只是闲聊（如"你好""今天天气怎样"），正常聊天，play 留空

回复格式（必须严格按 JSON）：
{
  "say": "对用户说的话，自然温暖",
  "play": [], // 推荐场景留空让系统处理；搜索场景填 [{"name":"歌名","artist":"歌手"}]
  "reason": "推荐原因（一句话）"
}`;
    
    // 构建消息格式
    const messages = [
      {
        role: 'system',
        content: djPersona
      },
      // 添加用户信息作为系统消息
      {
        role: 'system',
        content: `## 用户信息\n\n### 音乐品味\n${contextData.userTaste || '（用户暂未设置品味）'}\n\n### 日常作息\n${contextData.userRoutines || '（用户暂未设置作息）'}`
      },
      // 添加环境信息
      {
        role: 'system',
        content: `## 当前环境\n\n时间：${contextData.timeContext.date} ${contextData.timeContext.time}\n时段：${contextData.timeContext.greeting}${contextData.timeContext.isWeekend ? '（周末）' : ''}\n${contextData.weatherContext ? `天气：${contextData.weatherContext.description}，${contextData.weatherContext.temp}°C` : ''}`
      }
    ];

    // 添加历史对话
    const historyMessages = state.getMessages(10);
    historyMessages.forEach(m => {
      messages.push({
        role: m.role,
        content: m.content
      });
    });

    // 添加当前用户输入
    messages.push({
      role: 'user',
      content: userInput
    });

    try {
      const content = await this._call(messages);
      
      // 解析JSON响应
      let result;
      try {
        result = JSON.parse(content);
      } catch {
        result = {
          say: content,
          play: [],
          reason: '',
          segue: ''
        };
      }

      // 保存对话历史
      state.addMessage('user', userInput);
      state.addMessage('assistant', result.say);

      return result;
    } catch (error) {
      console.error('DeepSeek调用失败:', error);
      throw error;
    }
  }

  /**
   * 使用DeepSeek推荐音乐（对话式推荐）
   * 根据对话上下文、用户品味、环境生成推荐
   */
  async recommendMusic(options = {}) {
    const { mood, count = 3, userRequest, conversationContext } = options;

    // 收集上下文信息
    const timeContext = context.getTimeContext();
    const weatherContext = await context.getWeatherContext();
    const userTaste = context.getUserTaste();
    const playHistory = context.getPlayHistory(10);

    // 尝试获取网易云播放历史
    let ncmHistory = '';
    try {
      const records = await ncm.getPlayRecord(10);
      if (records && records.length > 0) {
        ncmHistory = '\n\n### 用户网易云最近播放\n' + records.map(r =>
          `- ${r.song.name} - ${r.song.artist}`
        ).join('\n');
      }
    } catch {
      // 网易云不可用，跳过
    }

    // 构建推荐提示词 - 对话式 DJ 风格
    const prompt = `你是电台 DJ Claudio，正在和用户对话。用户刚刚说："${userRequest || '给我推荐一些音乐'}"
${conversationContext ? `之前的对话：${conversationContext}` : ''}

## 用户背景
${userTaste ? `音乐品味：${userTaste}` : '（用户暂未设置品味）'}

## 当前情境
- 时间：${timeContext.date} ${timeContext.time}，${timeContext.greeting}${timeContext.isWeekend ? '（周末）' : '（工作日）'}
${weatherContext ? `- 天气：${weatherContext.description}，${weatherContext.temp}°C` : ''}
${mood ? `- 用户心情：${mood}` : ''}

## 最近播放（避免重复推荐）
${playHistory ? playHistory.slice(0, 5).map(p => `- ${p.name} - ${p.artist}`).join('\n') : '（暂无）'}${ncmHistory}

## 你的任务
根据用户的表达和当前情境，推荐${count}首最合适的歌曲。

要求：
1. 先说一句温暖的开场白，像朋友一样自然（不要机械地说"为你推荐"）
2. 推荐的歌曲要贴合用户当下的情绪和场景
3. 每首歌一句话说明为什么适合现在听
4. 整体风格统一，有 DJ 的品味

请严格按以下JSON格式返回：
{
  "say": "开场白，像 DJ 说话一样自然温暖，1-2句话",
  "reason": "整体推荐思路（如"根据你深夜加班的状态，选了这些轻音乐"）",
  "songs": [
    {
      "name": "歌曲名",
      "artist": "艺术家",
      "album": "专辑名（可选）",
      "reason": "推荐理由（如"钢琴声很轻，不会打扰你思考"）"
    }
  ]
}`;

    try {
      const content = await this._call(
        [
          { role: 'system', content: '你是一个专业的音乐推荐DJ，擅长根据用户的品味、心情和场景推荐合适的音乐。你对中国音乐和欧美音乐都有深入了解。请始终用中文回复。' },
          { role: 'user', content: prompt }
        ],
        0.85
      );

      const result = JSON.parse(content);
      
      // 保存对话
      if (result.say) {
        state.addMessage('assistant', result.say);
      }

      return result;
    } catch (error) {
      console.error('DeepSeek推荐失败:', error);
      return {
        say: '让我为你推荐一些音乐...',
        reason: '根据你的品味推荐',
        songs: []
      };
    }
  }

  /**
   * 生成每日计划
   */
  async generateDailyPlan() {
    const timeContext = context.getTimeContext();
    const weatherContext = await context.getWeatherContext();
    const userRoutines = context.getUserRoutines();
    
    const prompt = `请为今天制定一个音乐播放计划。

用户作息：
${userRoutines}

当前环境：
- 时间：${timeContext.date}
- 天气：${weatherContext?.description || '未知'}，${weatherContext?.temp || '?'}°C
- 时段：${timeContext.greeting}

请以JSON格式返回今日的音乐计划，格式如下：
{
  "morning": { "theme": "主题", "suggestion": "建议播放的音乐类型" },
  "afternoon": { "theme": "主题", "suggestion": "建议播放的音乐类型" },
  "evening": { "theme": "主题", "suggestion": "建议播放的音乐类型" }
}`;

    try {
      const content = await this._call(
        [
          { role: 'system', content: '你是一个音乐规划助手，帮助用户规划每日的音乐体验。' },
          { role: 'user', content: prompt }
        ],
        0.7
      );
      return JSON.parse(content);
    } catch (error) {
      console.error('生成每日计划失败:', error);
      return null;
    }
  }
}

export default new DeepSeekAdapter();
