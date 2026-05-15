import ncm from './ncm.js';
import deepseek from './deepseek.js';

/**
 * 意图路由器 - 电台 DJ 模式
 * 所有对话都经过 AI 理解，智能判断用户意图后推荐或搜索
 */
class Router {
  constructor() {
    // 简单命令模式（这些直接处理，不走 AI）
    this.simpleCommands = {
      '播放': 'play',
      '暂停': 'pause',
      '停止': 'stop',
      '下一首': 'next',
      '上一首': 'prev',
      '切歌': 'next',
      '音量': 'volume',
      '大声': 'volume_up',
      '小声': 'volume_down',
      '列表': 'list',
      '帮助': 'help',
      '状态': 'status'
    };
  }

  /**
   * 分析用户意图
   */
  analyzeIntent(input) {
    const trimmedInput = input.trim();
    
    // 检查是否是简单命令（精确匹配或开头匹配）
    for (const [keyword, command] of Object.entries(this.simpleCommands)) {
      if (trimmedInput === keyword || trimmedInput.startsWith(keyword + ' ')) {
        return {
          type: 'simple_command',
          command,
          params: trimmedInput.replace(keyword, '').trim()
        };
      }
    }

    // 其他所有输入都走 AI 理解
    return {
      type: 'ai_conversation',
      query: trimmedInput
    };
  }

  /**
   * 路由请求到对应的处理器
   */
  async route(input) {
    const intent = this.analyzeIntent(input);

    switch (intent.type) {
      case 'simple_command':
        return this.handleSimpleCommand(intent.command, intent.params);
      
      case 'ai_conversation':
      default:
        // 所有对话都走 AI 理解，由 AI 决定是推荐还是搜索
        return this.handleAIConversation(intent.query);
    }
  }

  /**
   * 处理简单命令
   */
  async handleSimpleCommand(command, params) {
    switch (command) {
      case 'play':
        if (params) {
          // 播放指定歌曲 - 这里仍然使用搜索
          const songs = await ncm.search(params);
          if (songs && songs.length > 0) {
            const songsWithUrl = await this.getSongsWithUrl([songs[0]]);
            if (songsWithUrl.length > 0) {
              return {
                say: `好的，为您播放「${songsWithUrl[0].name}」`,
                play: songsWithUrl,
                command: 'play'
              };
            }
          }
          return { say: `没有找到「${params}」相关的歌曲` };
        }
        return { say: '好的，继续播放', command: 'play' };
      
      case 'pause':
        return { say: '已暂停播放', command: 'pause' };
      
      case 'stop':
        return { say: '已停止播放', command: 'stop' };
      
      case 'next':
        return { say: '好的，下一首', command: 'next' };
      
      case 'prev':
        return { say: '好的，上一首', command: 'prev' };
      
      case 'volume':
        const volume = parseInt(params) || 50;
        return { say: `音量已调整到${volume}%`, command: 'volume', volume };
      
      case 'volume_up':
        return { say: '音量已调大', command: 'volume_up' };
      
      case 'volume_down':
        return { say: '音量已调小', command: 'volume_down' };
      
      case 'list':
        return { say: '正在为您打开播放列表', command: 'list' };
      
      case 'help':
        return {
          say: '我是你的私人电台 DJ Claudio，可以陪你聊天、推荐音乐。试试说"今天心情不太好"或"适合工作的音乐"，我会为你挑选合适的歌曲~',
          command: 'help'
        };
      
      case 'status':
        return { say: 'Claudio 正在运行中，随时为你服务', command: 'status' };
      
      default:
        return { say: '抱歉，我不太理解这个命令' };
    }
  }

  /**
   * 处理 AI 对话 - 核心方法
   * 让 AI 理解用户意图，智能决定是推荐音乐还是搜索歌曲还是普通对话
   */
  async handleAIConversation(query) {
    try {
      // 调用 DeepSeek，让它理解用户意图并决定如何响应
      const aiResponse = await deepseek.chat(query);
      
      // 如果 AI 返回了要播放的歌曲
      if (aiResponse.play && aiResponse.play.length > 0) {
        // 检查是否是搜索请求（AI 返回了 name/artist 但没有 url/id）
        const isSearchRequest = aiResponse.play.some(s => s.name && !s.url && !s.id);
        
        if (isSearchRequest) {
          // 用户明确说了歌名/歌手，去搜索播放链接
          return await this.searchAndPlay(aiResponse);
        }
        
        // AI 已经返回了完整的歌曲信息（带 id/url）
        return aiResponse;
      }
      
      // 如果 AI 只是文字回复，检查是否需要推荐
      const needsMusic = this.detectMusicNeed(query, aiResponse.say);
      
      if (needsMusic) {
        // 用户需要音乐，但 AI 没有返回歌曲，进行智能推荐
        return await this.smartRecommend(query, aiResponse.say);
      }
      
      // 纯对话，不需要音乐
      return aiResponse;
      
    } catch (error) {
      console.error('AI 对话失败:', error);
      // 失败时尝试智能推荐作为 fallback
      return await this.smartRecommend(query, '');
    }
  }

  /**
   * 搜索并播放 - 将 AI 识别的歌名/歌手转为可播放歌曲
   */
  async searchAndPlay(aiResponse) {
    const searchResults = [];
    
    for (const item of aiResponse.play) {
      if (!item.name && !item.artist) continue;
      
      try {
        // 构建搜索关键词
        const keyword = [item.name, item.artist].filter(Boolean).join(' ');
        const songs = await ncm.search(keyword);
        
        if (songs && songs.length > 0) {
          // 取第一个匹配结果
          const song = songs[0];
          const urlInfo = await ncm.getSongUrl(song.id);
          if (urlInfo?.url) {
            searchResults.push({ ...song, url: urlInfo.url });
          }
        }
      } catch (e) {
        console.error(`搜索失败: ${item.name} - ${item.artist}`, e.message);
      }
    }
    
    if (searchResults.length > 0) {
      return {
        say: aiResponse.say,
        play: searchResults,
        reason: aiResponse.reason || '搜索播放'
      };
    }
    
    // 搜索无结果，返回纯文字回复
    return {
      say: aiResponse.say || '抱歉，没有找到相关歌曲，换个关键词试试？'
    };
  }

  /**
   * 检测用户是否需要音乐
   * 仅在 AI 明确建议播放音乐时才触发，避免误判
   */
  detectMusicNeed(query, aiReply) {
    const replyLower = (aiReply || '').toLowerCase();
    
    // 只检查 AI 回复是否明确建议播放音乐
    const aiSuggestsMusic = replyLower.includes('为你播放') || 
                            replyLower.includes('为你选了') ||
                            replyLower.includes('为你推荐') ||
                            replyLower.includes('来听听') ||
                            replyLower.includes('放一首');
    
    return aiSuggestsMusic;
  }

  /**
   * 智能推荐 - 根据对话上下文推荐音乐
   */
  async smartRecommend(userRequest, conversationContext) {
    try {
      // 使用 DeepSeek 的推荐能力，传入对话上下文
      const recommendResult = await deepseek.recommendMusic({ 
        userRequest,
        conversationContext,
        count: 3 
      });
      
      if (recommendResult.songs && recommendResult.songs.length > 0) {
        // 获取歌曲播放链接
        const songsWithUrl = await Promise.all(
          recommendResult.songs.map(async (recSong) => {
            try {
              const searchResults = await ncm.search(`${recSong.name} ${recSong.artist}`);
              if (searchResults && searchResults.length > 0) {
                const song = searchResults[0];
                const urlInfo = await ncm.getSongUrl(song.id);
                if (urlInfo?.url) {
                  return { 
                    ...song, 
                    url: urlInfo.url,
                    reason: recSong.reason 
                  };
                }
              }
            } catch (e) {
              console.error('获取歌曲失败:', e);
            }
            return null;
          })
        );
        
        const playableSongs = songsWithUrl.filter(s => s);
        
        if (playableSongs.length > 0) {
          const songIntro = playableSongs.map((s, i) => 
            `${i + 1}.「${s.name}」- ${s.artist}：${s.reason || ''}`
          ).join('\n');
          
          return {
            say: `${recommendResult.say}\n\n${songIntro}`,
            play: playableSongs,
            reason: recommendResult.reason || '根据你的需求推荐'
          };
        }
      }
      
      // 推荐失败，返回 AI 的纯文字回复
      return {
        say: recommendResult.say || '抱歉，暂时无法为你推荐歌曲，但我们还可以继续聊天~'
      };
      
    } catch (error) {
      console.error('智能推荐失败:', error);
      return {
        say: '音乐推荐暂时不可用，但我们可以继续聊天。你想聊点什么？'
      };
    }
  }

  /**
   * 为歌曲获取播放 URL
   */
  async getSongsWithUrl(songs) {
    return await Promise.all(
      songs.map(async (song) => {
        try {
          const urlInfo = await ncm.getSongUrl(song.id);
          return urlInfo?.url ? { ...song, url: urlInfo.url } : null;
        } catch {
          return null;
        }
      })
    ).then(results => results.filter(s => s));
  }

  /**
   * 获取备用歌曲
   */
  async getFallbackSongs() {
    try {
      const songs = await ncm.getRecommendSongs(3);
      return await this.getSongsWithUrl(songs);
    } catch {
      return [];
    }
  }
}

export default new Router();
