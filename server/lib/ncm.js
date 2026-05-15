import config from './config.js';

/**
 * 网易云音乐API适配器
 * 使用公开的NeteaseCloudMusicApi
 */
class NCM {
  constructor() {
    this.baseUrl = config.ncm.baseUrl;
    this.cookie = config.ncm.cookie;
    this.apiAvailable = true;
    
    // 备用歌曲数据（当API不可用时使用）
    this.fallbackSongs = [
      { id: 'demo1', name: '晴天', artist: '周杰伦', album: '叶惠美', cover: 'https://p2.music.126.net/vZlfHKQjjdOMW6jvb3wKxQ==/109951166234056141.jpg', duration: 269000 },
      { id: 'demo2', name: '七里香', artist: '周杰伦', album: '七里香', cover: 'https://p1.music.126.net/Di27AyJpW7AvJ_WCZbKjLw==/109951166231818041.jpg', duration: 299000 },
      { id: 'demo3', name: '稻香', artist: '周杰伦', album: '魔杰座', cover: 'https://p2.music.126.net/L8G4i0ngMJmUdFvGT9HUaw==/109951166237663706.jpg', duration: 223000 },
      { id: 'demo4', name: '夜曲', artist: '周杰伦', album: '十一月的萧邦', cover: 'https://p1.music.126.net/sGmL0MOPpqIbSfXv_PpKhg==/109951166234055941.jpg', duration: 226000 },
      { id: 'demo5', name: '青花瓷', artist: '周杰伦', album: '我很忙', cover: 'https://p1.music.126.net/K1emj3WHxTendthvZGVWzA==/109951166234055821.jpg', duration: 240000 }
    ];
  }

  /**
   * 发送API请求
   */
  async request(endpoint, params = {}) {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    
    Object.keys(params).forEach(key => {
      if (params[key] !== undefined) {
        url.searchParams.append(key, params[key]);
      }
    });

    const headers = {
      'Content-Type': 'application/json'
    };

    if (this.cookie) {
      headers['Cookie'] = this.cookie;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`API请求失败: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.code !== 200) {
        throw new Error(data.message || 'API返回错误');
      }

      this.apiAvailable = true;
      return data;
    } catch (error) {
      console.error('NCM API请求失败:', error.message);
      // 不再永久禁用API，允许后续请求重试
      return null;
    }
  }

  /**
   * 搜索歌曲
   */
  async search(keyword, limit = 10) {
    const data = await this.request('/search', {
      keywords: keyword,
      limit,
      type: 1 // 1: 单曲
    });

    if (!data || !data.result || !data.result.songs) {
      // API不可用，使用备用数据搜索
      console.log('使用备用歌曲数据');
      return this.fallbackSongs.filter(song => 
        song.name.includes(keyword) || 
        song.artist.includes(keyword) ||
        song.album.includes(keyword)
      ).slice(0, limit);
    }

    return data.result.songs.map(song => ({
      id: song.id,
      name: song.name,
      artist: song.artists?.map(a => a.name).join(', ') || '未知歌手',
      artistId: song.artists?.[0]?.id,
      album: song.album?.name || '',
      albumId: song.album?.id,
      cover: song.album?.artist?.img1v1Url || song.album?.blurPicUrl || '',
      duration: song.duration
    }));
  }

  /**
   * 获取歌曲详情
   */
  async getSongDetail(ids) {
    const data = await this.request('/song/detail', {
      ids: Array.isArray(ids) ? ids.join(',') : ids
    });

    if (!data || !data.songs) {
      return [];
    }

    return data.songs.map(song => ({
      id: song.id,
      name: song.name,
      artist: song.ar?.map(a => a.name).join(', ') || '未知歌手',
      artistId: song.ar?.[0]?.id,
      album: song.al?.name || '',
      albumId: song.al?.id,
      cover: song.al?.picUrl || '',
      duration: song.dt
    }));
  }

  /**
   * 获取歌曲URL
   */
  async getSongUrl(id, br = 320000) {
    // 检查是否是备用歌曲
    if (typeof id === 'string' && id.startsWith('demo')) {
      // 备用歌曲没有真实URL，返回null
      return null;
    }
    
    const data = await this.request('/song/url', {
      id,
      br
    });

    if (!data || !data.data || data.data.length === 0) {
      return null;
    }

    const urlInfo = data.data[0];
    return {
      url: urlInfo.url,
      br: urlInfo.br,
      size: urlInfo.size,
      type: urlInfo.type
    };
  }

  /**
   * 获取歌词
   */
  async getLyric(id) {
    const data = await this.request('/lyric', { id });

    if (!data) {
      return null;
    }

    return {
      lyric: data.lrc?.lyric || '',
      tlyric: data.tlyric?.lyric || ''
    };
  }

  /**
   * 获取推荐歌曲
   */
  async getRecommendSongs(limit = 10) {
    const data = await this.request('/recommend/songs');

    if (!data || !data.data || !data.data.dailySongs) {
      // 如果需要登录或API不可用，返回热门歌曲或备用数据
      const topSongs = await this.getTopSongs(limit);
      if (topSongs.length > 0) {
        return topSongs;
      }
      // 返回备用数据
      return this.fallbackSongs.slice(0, limit);
    }

    return data.data.dailySongs.slice(0, limit).map(song => ({
      id: song.id,
      name: song.name,
      artist: song.ar?.map(a => a.name).join(', ') || '未知歌手',
      album: song.al?.name || '',
      cover: song.al?.picUrl || '',
      duration: song.dt
    }));
  }

  /**
   * 获取热门歌曲
   */
  async getTopSongs(limit = 10) {
    const data = await this.request('/top/song', {
      type: 0 // 0: 全部
    });

    if (!data || !data.data) {
      // API不可用，返回备用数据
      return this.fallbackSongs.slice(0, limit);
    }

    return data.data.slice(0, limit).map(song => ({
      id: song.id,
      name: song.name,
      artist: song.artists?.map(a => a.name).join(', ') || '未知歌手',
      album: song.album?.name || '',
      cover: song.album?.picUrl || '',
      duration: song.duration
    }));
  }

  /**
   * 获取歌单详情
   */
  async getPlaylistDetail(id) {
    const data = await this.request('/playlist/detail', { id });

    if (!data || !data.playlist) {
      return null;
    }

    const playlist = data.playlist;
    return {
      id: playlist.id,
      name: playlist.name,
      description: playlist.description,
      cover: playlist.coverImgUrl,
      trackCount: playlist.trackCount,
      playCount: playlist.playCount,
      tracks: playlist.trackIds?.slice(0, 100).map(t => t.id) || []
    };
  }

  /**
   * 获取歌手热门歌曲
   */
  async getArtistTopSongs(artistId, limit = 10) {
    const data = await this.request('/artist/top/song', {
      id: artistId
    });

    if (!data || !data.songs) {
      return [];
    }

    return data.songs.slice(0, limit).map(song => ({
      id: song.id,
      name: song.name,
      artist: song.ar?.map(a => a.name).join(', ') || '未知歌手',
      album: song.al?.name || '',
      cover: song.al?.picUrl || '',
      duration: song.dt
    }));
  }

  /**
   * 获取新歌速递
   */
  async getNewSongs(limit = 10) {
    const data = await this.request('/personalized/newsong', {
      limit
    });

    if (!data || !data.result) {
      return [];
    }

    return data.result.map(item => ({
      id: item.id,
      name: item.name,
      artist: item.song?.artists?.map(a => a.name).join(', ') || '未知歌手',
      album: item.song?.album?.name || '',
      cover: item.picUrl,
      duration: item.song?.duration
    }));
  }

  /**
   * 根据心情获取推荐
   */
  async getByMood(mood, limit = 10) {
    // 心情对应的歌单关键词
    const moodKeywords = {
      happy: '快乐 欢快',
      sad: '伤感 治愈',
      calm: '轻音乐 放松',
      energetic: '励志 活力',
      peaceful: '安静 睡眠',
      focused: '学习 工作'
    };

    const keyword = moodKeywords[mood] || mood;
    return this.search(keyword, limit);
  }

  /**
   * 获取用户播放记录
   * 需要登录Cookie
   */
  async getPlayRecord(limit = 50) {
    const data = await this.request('/user/record', {
      uid: 0, // 0表示当前登录用户
      type: 1, // 1: 所有播放记录
      limit
    });

    if (!data || !data.allData) return [];

    return data.allData.map(item => ({
      song: {
        id: item.song?.id,
        name: item.song?.name,
        artist: item.song?.ar?.map(a => a.name).join(', '),
        album: item.song?.al?.name,
        cover: item.song?.al?.picUrl,
        duration: item.song?.dt
      },
      playTime: item.playTime,
      playCount: item.playCount
    }));
  }

  /**
   * 获取用户歌单列表
   * 需要登录Cookie
   */
  async getUserPlaylists(limit = 30) {
    const data = await this.request('/user/playlist', {
      uid: 0, // 0表示当前登录用户
      limit
    });

    if (!data || !data.playlist) return [];

    return data.playlist.map(pl => ({
      id: pl.id,
      name: pl.name,
      cover: pl.coverImgUrl,
      trackCount: pl.trackCount,
      playCount: pl.playCount,
      description: pl.description
    }));
  }

  /**
   * 获取用户账号信息
   * 需要登录Cookie
   */
  async getUserAccount() {
    const data = await this.request('/user/account');

    if (!data || !data.account) return null;

    return {
      id: data.account.id,
      username: data.account.userName,
      avatar: data.profile?.avatarUrl,
      nickname: data.profile?.nickname,
      vipType: data.account.vipType
    };
  }

  /**
   * 获取登录状态
   */
  async getLoginStatus() {
    const data = await this.request('/login/status');

    if (!data || data.data?.account === null) {
      return { loggedIn: false };
    }

    return {
      loggedIn: true,
      account: {
        id: data.data.account.id,
        username: data.data.account.userName,
        avatar: data.data.profile?.avatarUrl,
        nickname: data.data.profile?.nickname
      }
    };
  }
}

export default new NCM();
