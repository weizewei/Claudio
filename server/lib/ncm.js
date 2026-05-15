import config from './config.js';

// 动态导入 NeteaseCloudMusicApi (ESM)
let NCM_API = null;

async function getApi() {
  if (!NCM_API) {
    // NeteaseCloudMusicApi 导出的是 default，需要访问 .default
    const module = await import('NeteaseCloudMusicApi');
    NCM_API = module.default;
  }
  return NCM_API;
}

/**
 * 网易云音乐 API 适配器
 * 直接调用 NeteaseCloudMusicApi npm 包
 */
class NCM {
  constructor() {
    this.cookie = config.ncm.cookie || '';
    this.apiAvailable = true;
    
    // 备用歌曲数据（当 API 不可用时使用）
    this.fallbackSongs = [
      { id: 'demo1', name: '晴天', artist: '周杰伦', album: '叶惠美', cover: 'https://p2.music.126.net/vZlfHKQjjdOMW6jvb3wKxQ==/109951166234056141.jpg', duration: 269000 },
      { id: 'demo2', name: '七里香', artist: '周杰伦', album: '七里香', cover: 'https://p1.music.126.net/Di27AyJpW7AvJ_WCZbKjLw==/109951166231818041.jpg', duration: 299000 },
      { id: 'demo3', name: '稻香', artist: '周杰伦', album: '魔杰座', cover: 'https://p2.music.126.net/L8G4i0ngMJmUdFvGT9HUaw==/109951166237663706.jpg', duration: 223000 },
      { id: 'demo4', name: '夜曲', artist: '周杰伦', album: '十一月的萧邦', cover: 'https://p1.music.126.net/sGmL0MOPpqIbSfXv_PpKhg==/109951166234055941.jpg', duration: 226000 },
      { id: 'demo5', name: '青花瓷', artist: '周杰伦', album: '我很忙', cover: 'https://p1.music.126.net/K1emj3WHxTendthvZGVWzA==/109951166234055821.jpg', duration: 240000 }
    ];
  }

  /**
   * 搜索歌曲
   */
  async search(keyword, limit = 10) {
    try {
      const api = await getApi();
      const result = await api.search({ keywords: keyword, limit, type: 1 });
      
      if (result.status !== 200 || !result.body?.result?.songs) {
        console.log('使用备用歌曲数据');
        return this.fallbackSongs.filter(song => 
          song.name.includes(keyword) || song.artist.includes(keyword)
        ).slice(0, limit);
      }

      const songs = result.body.result.songs;
      return songs.map(song => ({
        id: song.id,
        name: song.name,
        artist: song.artists?.map(a => a.name).join(', ') || '未知歌手',
        artistId: song.artists?.[0]?.id,
        album: song.album?.name || '',
        albumId: song.album?.id,
        cover: song.album?.artist?.img1v1Url || song.album?.blurPicUrl || '',
        duration: song.duration
      }));
    } catch (error) {
      console.error('搜索失败:', error.message);
      return this.fallbackSongs.filter(song => 
        song.name.includes(keyword) || song.artist.includes(keyword)
      ).slice(0, limit);
    }
  }

  /**
   * 获取歌曲 URL
   */
  async getSongUrl(id, br = 320000) {
    // 备用歌曲没有真实 URL
    if (typeof id === 'string' && id.startsWith('demo')) {
      return null;
    }

    try {
      const api = await getApi();
      const result = await api.song_url_v1({ id, level: 'exhigh', cookie: this.cookie });
      
      if (result.status !== 200 || !result.body?.data?.length) {
        return null;
      }

      const urlInfo = result.body.data[0];
      return {
        url: urlInfo.url,
        br: urlInfo.br,
        size: urlInfo.size,
        type: urlInfo.type
      };
    } catch (error) {
      console.error('获取歌曲URL失败:', error.message);
      return null;
    }
  }

  /**
   * 获取歌词
   */
  async getLyric(id) {
    try {
      const api = await getApi();
      const result = await api.lyric({ id });
      
      if (result.status !== 200) {
        return null;
      }

      return {
        lyric: result.body.lrc?.lyric || '',
        tlyric: result.body.tlyric?.lyric || ''
      };
    } catch (error) {
      console.error('获取歌词失败:', error.message);
      return null;
    }
  }

  /**
   * 获取推荐歌曲
   */
  async getRecommendSongs(limit = 10) {
    try {
      const api = await getApi();
      const result = await api.recommend_songs({ cookie: this.cookie });
      
      if (result.status !== 200 || !result.body?.data?.dailySongs) {
        return this.getTopSongs(limit);
      }

      const songs = result.body.data.dailySongs.slice(0, limit);
      return songs.map(song => ({
        id: song.id,
        name: song.name,
        artist: song.ar?.map(a => a.name).join(', ') || '未知歌手',
        album: song.al?.name || '',
        cover: song.al?.picUrl || '',
        duration: song.dt
      }));
    } catch (error) {
      console.error('获取推荐失败:', error.message);
      return this.getTopSongs(limit);
    }
  }

  /**
   * 获取热门歌曲
   */
  async getTopSongs(limit = 10) {
    try {
      const api = await getApi();
      const result = await api.top_song({ type: 0 });
      
      if (result.status !== 200 || !result.body?.data) {
        return this.fallbackSongs.slice(0, limit);
      }

      return result.body.data.slice(0, limit).map(song => ({
        id: song.id,
        name: song.name,
        artist: song.artists?.map(a => a.name).join(', ') || '未知歌手',
        album: song.album?.name || '',
        cover: song.album?.picUrl || '',
        duration: song.duration
      }));
    } catch (error) {
      console.error('获取热门歌曲失败:', error.message);
      return this.fallbackSongs.slice(0, limit);
    }
  }

  /**
   * 获取歌曲详情
   */
  async getSongDetail(ids) {
    try {
      const api = await getApi();
      const idArray = Array.isArray(ids) ? ids : [ids];
      const result = await api.song_detail({ ids: idArray.join(',') });
      
      if (result.status !== 200 || !result.body?.songs) {
        return [];
      }

      return result.body.songs.map(song => ({
        id: song.id,
        name: song.name,
        artist: song.ar?.map(a => a.name).join(', ') || '未知歌手',
        album: song.al?.name || '',
        cover: song.al?.picUrl || '',
        duration: song.dt
      }));
    } catch (error) {
      console.error('获取歌曲详情失败:', error.message);
      return [];
    }
  }

  /**
   * 根据心情获取推荐
   */
  async getByMood(mood, limit = 10) {
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
   * 获取新歌
   */
  async getNewSongs(limit = 10) {
    try {
      const api = await getApi();
      const result = await api.personalized_newsong({ limit });
      
      if (result.status !== 200 || !result.body?.result) {
        return [];
      }

      return result.body.result.map(item => ({
        id: item.id,
        name: item.name,
        artist: item.song?.artists?.map(a => a.name).join(', ') || '未知歌手',
        album: item.song?.album?.name || '',
        cover: item.picUrl,
        duration: item.song?.duration
      }));
    } catch (error) {
      console.error('获取新歌失败:', error.message);
      return [];
    }
  }

  /**
   * 获取歌手热门歌曲
   */
  async getArtistTopSongs(artistId, limit = 10) {
    try {
      const api = await getApi();
      const result = await api.artist_top_song({ id: artistId });
      
      if (result.status !== 200 || !result.body?.songs) {
        return [];
      }

      return result.body.songs.slice(0, limit).map(song => ({
        id: song.id,
        name: song.name,
        artist: song.ar?.map(a => a.name).join(', ') || '未知歌手',
        album: song.al?.name || '',
        cover: song.al?.picUrl || '',
        duration: song.dt
      }));
    } catch (error) {
      console.error('获取歌手热门歌曲失败:', error.message);
      return [];
    }
  }

  /**
   * 获取歌单详情
   */
  async getPlaylistDetail(id) {
    try {
      const api = await getApi();
      const result = await api.playlist_detail({ id });
      
      if (result.status !== 200 || !result.body?.playlist) {
        return null;
      }

      const playlist = result.body.playlist;
      return {
        id: playlist.id,
        name: playlist.name,
        description: playlist.description,
        cover: playlist.coverImgUrl,
        trackCount: playlist.trackCount,
        playCount: playlist.playCount,
        tracks: playlist.trackIds?.slice(0, 100).map(t => t.id) || []
      };
    } catch (error) {
      console.error('获取歌单详情失败:', error.message);
      return null;
    }
  }
}

export default new NCM();
