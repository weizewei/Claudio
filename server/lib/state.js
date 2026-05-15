/**
 * 状态管理 - 使用内存存储（兼容 VM 环境）
 * 替代 better-sqlite3 避免 disk I/O 问题
 */

class StateDB {
  constructor() {
    this.messages = [];
    this.plays = [];
    this.plans = new Map();
    this.prefs = new Map();
  }

  // 消息相关
  addMessage(role, content) {
    this.messages.push({
      id: this.messages.length + 1,
      role,
      content,
      timestamp: new Date().toISOString()
    });
    // 只保留最近 200 条
    if (this.messages.length > 200) {
      this.messages = this.messages.slice(-200);
    }
  }

  getMessages(limit = 50) {
    return this.messages.slice(-limit);
  }

  clearMessages() {
    this.messages = [];
  }

  // 播放历史相关
  addPlay(song) {
    this.plays.push({
      id: this.plays.length + 1,
      song_id: song.id,
      song_name: song.name,
      artist: song.artist,
      album: song.album,
      cover: song.cover,
      played_at: new Date().toISOString(),
      duration: song.duration,
      completed: song.completed ? 1 : 0
    });
    // 只保留最近 500 条
    if (this.plays.length > 500) {
      this.plays = this.plays.slice(-500);
    }
  }

  getPlays(limit = 100) {
    return this.plays.slice(-limit).reverse();
  }

  getRecentPlays(hours = 24) {
    const cutoff = new Date(Date.now() - hours * 3600 * 1000);
    return this.plays
      .filter(p => new Date(p.played_at) > cutoff)
      .reverse();
  }

  // 计划相关
  setPlan(date, content) {
    this.plans.set(date, content);
  }

  getPlan(date) {
    return this.plans.get(date) || null;
  }

  // 偏好相关
  setPref(key, value) {
    this.prefs.set(key, value);
  }

  getPref(key, defaultValue = null) {
    return this.prefs.has(key) ? this.prefs.get(key) : defaultValue;
  }

  // 统计相关
  getStats() {
    // 统计播放次数
    const songCounts = new Map();
    for (const play of this.plays) {
      const key = `${play.song_name}|${play.artist}`;
      songCounts.set(key, (songCounts.get(key) || 0) + 1);
    }

    // 取 top 10
    const topSongs = [...songCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([key, count]) => {
        const [song_name, artist] = key.split('|');
        return { song_name, artist, play_count: count };
      });

    return {
      totalMessages: this.messages.length,
      totalPlays: this.plays.length,
      topSongs
    };
  }
}

export default new StateDB();
