/**
 * Claudio - Personal AI Radio Frontend App
 * Apple Music Style Interface
 */

class ClaudioApp {
  constructor() {
    this.audio = document.getElementById('audio-player');
    this.currentSong = null;
    this.playlist = [];
    this.currentIndex = 0;
    this.isPlaying = false;

    // TTS
    this.ttsEnabled = false;
    this.isSpeaking = false;
    this.synth = window.speechSynthesis;
    this.ttsProvider = 'browser';
    this.ttsVoice = 'zh_female_vv_uranus_bigtts';
    this.ttsEmotion = '';
    this.volcanoTTSConfig = { apiKey: '', appId: '', accessToken: '' };

    // Waveform
    this.waveformCanvas = document.getElementById('waveform-canvas');
    this.waveformCtx = this.waveformCanvas?.getContext('2d');
    this.waveformPhase = 0;

    this.init();
  }

  init() {
    this.bindEvents();
    this.loadSettings();
    this.initWaveform();
    this.startWaveformAnimation();
    this.updateTime();
    
    // 延迟加载今日推荐，避免自动播放被浏览器阻止
    this.hasUserInteracted = false;
    this.pendingRecommendation = null;
    
    // 监听首次用户交互
    const markInteracted = () => {
      if (!this.hasUserInteracted) {
        this.hasUserInteracted = true;
        document.removeEventListener('click', markInteracted);
        document.removeEventListener('keydown', markInteracted);
        document.removeEventListener('touchstart', markInteracted);
        
        // 用户交互后，如果有待播放的推荐，则播放
        if (this.pendingRecommendation) {
          this.handleResponse(this.pendingRecommendation);
          this.pendingRecommendation = null;
        }
      }
    };
    document.addEventListener('click', markInteracted);
    document.addEventListener('keydown', markInteracted);
    document.addEventListener('touchstart', markInteracted);
    
    // 加载今日推荐（但不自动播放）
    this.loadTodayRecommend();
    
    // 启动时自动检测网易云登录状态
    this.autoCheckNCMLogin();
    
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  bindEvents() {
    // 播放控制
    const btnPlay = document.getElementById('btn-play-pause');
    const btnBottomPlay = document.getElementById('bottom-play-btn');
    
    btnPlay?.addEventListener('click', () => this.togglePlay());
    btnBottomPlay?.addEventListener('click', () => this.togglePlay());

    // 发送消息
    const btnSend = document.getElementById('btn-send');
    const chatInput = document.getElementById('chat-input');
    
    btnSend?.addEventListener('click', () => this.sendMessage());
    chatInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.sendMessage();
    });

    // 设置面板
    const btnSettings = document.getElementById('btn-settings');
    const btnCloseSettings = document.getElementById('close-settings');
    const overlay = document.getElementById('overlay');
    const btnSave = document.getElementById('save-settings');

    btnSettings?.addEventListener('click', () => this.openSettings());
    btnCloseSettings?.addEventListener('click', () => this.closeSettings());
    overlay?.addEventListener('click', () => {
      this.closeSettings();
      this.closePlaylist();
    });
    btnSave?.addEventListener('click', () => this.saveSettings());

    // 网易云登录检测
    const btnCheckNCM = document.getElementById('btn-check-ncm-login');
    btnCheckNCM?.addEventListener('click', () => this.checkNCMLogin());

    // 语音输入
    const btnVoice = document.getElementById('btn-voice');
    btnVoice?.addEventListener('click', () => this.toggleVoiceInput());

    // 播放列表面板
    const btnPlaylist = document.getElementById('btn-playlist');
    const btnClosePlaylist = document.getElementById('close-playlist');

    btnPlaylist?.addEventListener('click', () => this.openPlaylist());
    btnClosePlaylist?.addEventListener('click', () => this.closePlaylist());

    // TTS 提供商切换
    const ttsProvider = document.getElementById('setting-tts-provider');
    ttsProvider?.addEventListener('change', () => this.updateSettingsUI());

    // 音频事件
    this.audio?.addEventListener('timeupdate', () => this.updateProgress());
    this.audio?.addEventListener('ended', () => this.onSongEnded());
  }

  togglePlay() {
    if (!this.currentSong) return;
    
    if (this.isPlaying) {
      this.audio.pause();
      this.isPlaying = false;
    } else {
      this.audio.play();
      this.isPlaying = true;
    }
    this.updatePlayButton();
  }

  updatePlayButton() {
    const icons = document.querySelectorAll('.icon-pause, .icon-mini');
    icons.forEach(icon => {
      icon.setAttribute('data-lucide', this.isPlaying ? 'pause' : 'play');
    });
    if (window.lucide) window.lucide.createIcons();
  }

  updateProgress() {
    const current = this.audio.currentTime;
    const duration = this.audio.duration || 0;
    const percent = duration ? (current / duration) * 100 : 0;
    
    document.getElementById('current-time').textContent = this.formatTime(current);
    document.getElementById('duration').textContent = this.formatTime(duration);
    document.getElementById('bottom-current').textContent = this.formatTime(current);
    document.getElementById('progress-fill').style.width = percent + '%';
  }

  formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  async sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    this.addLyric('You', text, new Date().toLocaleTimeString());

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      
      const data = await response.json();
      this.handleResponse(data);
    } catch (error) {
      console.error('Chat error:', error);
    }
  }

  handleResponse(data, skipAutoPlay = false) {
    if (data.say) {
      this.addLyric('Claudio', data.say, new Date().toLocaleTimeString());
    }

    if (data.play?.length > 0) {
      this.playlist = data.play;
      this.currentIndex = 0;
      
      // 如果用户还未交互，缓存推荐但不播放
      if (!this.hasUserInteracted && skipAutoPlay) {
        this.pendingRecommendation = data;
        // 只显示歌曲信息，不播放
        this.displaySongInfo(data.play[0]);
        return;
      }
      
      this.playSong(data.play[0]);
      
      if (data.say && this.ttsEnabled) {
        this.speakOverMusic(data.say);
      }
    } else if (data.say && this.ttsEnabled) {
      this.speak(data.say);
    }
  }

  // 仅显示歌曲信息，不播放
  displaySongInfo(song) {
    this.currentSong = song;
    document.getElementById('current-title').textContent = song.name;
    let artistStr = '';
    if (Array.isArray(song.artists)) {
      artistStr = song.artists.map(a => a.name || a).join(', ');
    } else if (song.artist) {
      artistStr = song.artist;
    } else if (typeof song.artists === 'string') {
      artistStr = song.artists;
    }
    document.getElementById('current-artist').textContent = artistStr || '';
    this.renderPlaylist();
    
    // 更新网易云链接
    const ncmLink = document.getElementById('ncm-link');
    if (song.id && !String(song.id).startsWith('demo')) {
      ncmLink.href = `https://music.163.com/#/song?id=${song.id}`;
      document.getElementById('ncm-link-text').textContent = '网易云音乐';
      ncmLink.style.display = 'inline-flex';
    } else {
      ncmLink.href = '#';
      ncmLink.style.display = 'none';
    }
    
    // 显示提示，让用户点击播放
    this.addLyric('Claudio', '💡 点击播放按钮开始播放推荐歌曲', new Date().toLocaleTimeString());
  }

  playSong(song) {
    this.currentSong = song;
    this.audio.src = song.url;
    
    // 检查用户是否已交互，避免自动播放被阻止
    if (this.hasUserInteracted) {
      this.audio.play().catch(err => {
        console.log('Auto-play prevented:', err.message);
        this.isPlaying = false;
        this.updatePlayButton();
      });
      this.isPlaying = true;
    } else {
      this.isPlaying = false;
      console.log('Music ready but waiting for user interaction');
    }
    this.updatePlayButton();

    document.getElementById('current-title').textContent = song.name;
    // artists 可能是数组或字符串
    let artistStr = '';
    if (Array.isArray(song.artists)) {
      artistStr = song.artists.map(a => a.name || a).join(', ');
    } else if (song.artist) {
      artistStr = song.artist;
    } else if (typeof song.artists === 'string') {
      artistStr = song.artists;
    }
    document.getElementById('current-artist').textContent = artistStr || '';
    this.renderPlaylist();

    // 更新网易云链接
    const ncmLink = document.getElementById('ncm-link');
    if (song.id && !String(song.id).startsWith('demo')) {
      ncmLink.href = `https://music.163.com/#/song?id=${song.id}`;
      document.getElementById('ncm-link-text').textContent = '网易云音乐';
      ncmLink.style.display = 'inline-flex';
    } else {
      ncmLink.href = '#';
      ncmLink.style.display = 'none';
    }
  }

  onSongEnded() {
    this.currentIndex++;
    if (this.currentIndex < this.playlist.length) {
      this.playSong(this.playlist[this.currentIndex]);
    } else {
      this.isPlaying = false;
      this.updatePlayButton();
    }
  }

  // ==================== Playlist ====================

  openPlaylist() {
    document.getElementById('playlist-panel').classList.add('open');
    document.getElementById('overlay').classList.add('show');
    this.renderPlaylist();
  }

  closePlaylist() {
    document.getElementById('playlist-panel').classList.remove('open');
    // 只有设置面板也关闭时才移除遮罩
    if (!document.getElementById('settings-panel').classList.contains('open')) {
      document.getElementById('overlay').classList.remove('show');
    }
  }

  renderPlaylist() {
    const list = document.getElementById('playlist-list');
    if (!this.playlist.length) {
      list.innerHTML = '<div class="playlist-empty">暂无播放内容</div>';
      return;
    }

    list.innerHTML = this.playlist.map((song, i) => {
      const isActive = i === this.currentIndex;
      let artist = '';
      if (Array.isArray(song.artists)) {
        artist = song.artists.map(a => a.name || a).join(', ');
      } else if (song.artist) {
        artist = song.artist;
      } else if (typeof song.artists === 'string') {
        artist = song.artists;
      }
      const duration = song.duration ? this.formatTime(song.duration / 1000) : '';
      return `
        <div class="playlist-item ${isActive ? 'active' : ''}" data-index="${i}">
          <span class="playlist-item-index">${isActive ? '▶' : i + 1}</span>
          <div class="playlist-item-info">
            <div class="playlist-item-name">${song.name || 'Unknown'}</div>
            <div class="playlist-item-artist">${artist}</div>
          </div>
          ${duration ? `<span class="playlist-item-duration">${duration}</span>` : ''}
        </div>
      `;
    }).join('');

    // 点击播放列表项
    list.querySelectorAll('.playlist-item').forEach(item => {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.index);
        this.currentIndex = index;
        this.playSong(this.playlist[index]);
      });
    });
  }

  // ==================== Today Recommend ====================

  async loadTodayRecommend() {
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: '今天有什么推荐的音乐吗？' })
      });
      const data = await response.json();
      // 首次加载时跳过自动播放，等待用户交互
      this.handleResponse(data, true);
    } catch (error) {
      console.error('Failed to load today recommend:', error);
    }
  }

  addLyric(speaker, text, time) {
    const list = document.getElementById('lyrics-list');
    const item = document.createElement('div');
    item.className = 'lyric-item';
    item.innerHTML = `
      <span class="lyric-speaker">${speaker} • ${time}</span>
      <span class="lyric-text">${text}</span>
    `;
    list.appendChild(item);
    list.scrollTop = list.scrollHeight;
  }

  // ==================== Voice Input ====================

  toggleVoiceInput() {
    if (this.isRecording) {
      this.stopVoiceInput();
    } else {
      this.startVoiceInput();
    }
  }

  startVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.addLyric('System', '当前浏览器不支持语音识别，请使用 Chrome', new Date().toLocaleTimeString());
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'zh-CN';
    this.recognition.continuous = false;
    this.recognition.interimResults = true;

    let finalTranscript = '';

    this.recognition.onstart = () => {
      this.isRecording = true;
      this.updateVoiceButton();
    };

    this.recognition.onresult = (event) => {
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      // 实时显示在输入框
      document.getElementById('chat-input').value = finalTranscript + interimTranscript;
    };

    this.recognition.onend = () => {
      this.isRecording = false;
      this.updateVoiceButton();
      // 如果有最终结果，自动发送
      if (finalTranscript.trim()) {
        this.sendMessage();
      }
    };

    this.recognition.onerror = (event) => {
      this.isRecording = false;
      this.updateVoiceButton();
      if (event.error === 'not-allowed') {
        this.addLyric('System', '请允许麦克风权限后重试', new Date().toLocaleTimeString());
      } else if (event.error !== 'aborted') {
        console.error('语音识别错误:', event.error);
      }
    };

    this.recognition.start();
  }

  stopVoiceInput() {
    if (this.recognition) {
      this.recognition.stop();
    }
    this.isRecording = false;
    this.updateVoiceButton();
  }

  updateVoiceButton() {
    const btn = document.getElementById('btn-voice');
    if (!btn) return;
    const icon = btn.querySelector('i');
    if (this.isRecording) {
      btn.classList.add('recording');
      btn.title = '停止录音';
      if (icon) icon.setAttribute('data-lucide', 'mic-off');
    } else {
      btn.classList.remove('recording');
      btn.title = '语音输入';
      if (icon) icon.setAttribute('data-lucide', 'mic');
    }
    if (window.lucide) window.lucide.createIcons();
  }

  // ==================== TTS ====================

  async speakOverMusic(text) {
    this.isSpeaking = true;
    this.duckMusicVolume();

    if (this.ttsProvider === 'volcano') {
      await this.speakWithVolcano(text, () => {
        this.isSpeaking = false;
        this.restoreMusicVolume();
      });
    } else {
      this.speakWithBrowser(text, () => {
        this.isSpeaking = false;
        this.restoreMusicVolume();
      });
    }
  }

  speak(text) {
    if (!this.ttsEnabled) return;
    if (this.ttsProvider === 'volcano') {
      this.speakWithVolcano(text);
    } else {
      this.speakWithBrowser(text);
    }
  }

  speakWithBrowser(text, onComplete) {
    if (!this.synth) {
      if (onComplete) onComplete();
      return;
    }
    
    // 检查用户是否已交互，避免自动播放被阻止
    if (!this.hasUserInteracted) {
      console.log('TTS skipped: waiting for user interaction');
      if (onComplete) onComplete();
      return;
    }
    
    this.synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.onend = onComplete;
    utterance.onerror = onComplete;
    this.synth.speak(utterance);
  }

  async speakWithVolcano(text, onComplete) {
    // 检查用户是否已交互，避免自动播放被阻止
    if (!this.hasUserInteracted) {
      console.log('TTS skipped: waiting for user interaction');
      if (onComplete) onComplete();
      return;
    }
    
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voiceType: this.ttsVoice,
          emotion: this.ttsEmotion,
          apiKey: this.volcanoTTSConfig.apiKey,
          appId: this.volcanoTTSConfig.appId,
          accessToken: this.volcanoTTSConfig.accessToken
        })
      });
      
      const data = await response.json();
      if (data.success && data.audioUrl) {
        const ttsAudio = new Audio(data.audioUrl);
        ttsAudio.onended = onComplete;
        ttsAudio.onerror = onComplete;
        ttsAudio.play();
      } else {
        this.speakWithBrowser(text, onComplete);
      }
    } catch (error) {
      console.error('TTS error:', error);
      this.speakWithBrowser(text, onComplete);
    }
  }

  duckMusicVolume() {
    if (!this.audio || this.isDucking) return;
    this.preDuckVolume = this.audio.volume;
    this.isDucking = true;
    this.audio.volume = 0.15;
  }

  restoreMusicVolume() {
    if (!this.audio || !this.isDucking) return;
    this.isDucking = false;
    this.audio.volume = this.preDuckVolume;
  }

  // ==================== Settings ====================

  openSettings() {
    document.getElementById('settings-panel').classList.add('open');
    document.getElementById('overlay').classList.add('show');
  }

  closeSettings() {
    document.getElementById('settings-panel').classList.remove('open');
    document.getElementById('overlay').classList.remove('show');
  }

  loadSettings() {
    const settings = JSON.parse(localStorage.getItem('claudioSettings') || '{}');
    
    if (settings.deepseekKey) {
      document.getElementById('setting-deepseek-key').value = settings.deepseekKey;
    }
    if (settings.volcanoApiKey) {
      document.getElementById('setting-volcano-apikey').value = settings.volcanoApiKey;
      this.volcanoTTSConfig.apiKey = settings.volcanoApiKey;
    }
    if (settings.ttsEnabled !== undefined) {
      this.ttsEnabled = settings.ttsEnabled;
      document.getElementById('setting-tts-enabled').value = settings.ttsEnabled.toString();
    }
    if (settings.ttsProvider) {
      this.ttsProvider = settings.ttsProvider;
      document.getElementById('setting-tts-provider').value = settings.ttsProvider;
    }
    if (settings.ttsVoice) {
      this.ttsVoice = settings.ttsVoice;
      document.getElementById('setting-volcano-voice').value = settings.ttsVoice;
    }
    if (settings.ttsEmotion) {
      this.ttsEmotion = settings.ttsEmotion;
      document.getElementById('setting-volcano-emotion').value = settings.ttsEmotion;
    }
    
    this.updateSettingsUI();
  }

  saveSettings() {
    const settings = {
      deepseekKey: document.getElementById('setting-deepseek-key').value,
      volcanoApiKey: document.getElementById('setting-volcano-apikey').value,
      ttsEnabled: document.getElementById('setting-tts-enabled').value === 'true',
      ttsProvider: document.getElementById('setting-tts-provider').value,
      ttsVoice: document.getElementById('setting-volcano-voice').value,
      ttsEmotion: document.getElementById('setting-volcano-emotion').value,
      city: document.getElementById('setting-city')?.value || ''
    };

    localStorage.setItem('claudioSettings', JSON.stringify(settings));

    this.ttsEnabled = settings.ttsEnabled;
    this.ttsProvider = settings.ttsProvider;
    this.ttsVoice = settings.ttsVoice;
    this.ttsEmotion = settings.ttsEmotion;
    this.volcanoTTSConfig.apiKey = settings.volcanoApiKey;

    // 保存网易云 Cookie 到服务端
    const ncmCookie = document.getElementById('setting-ncm-cookie')?.value?.trim();
    if (ncmCookie) {
      this.saveNCMCookie(ncmCookie);
    }

    this.closeSettings();
  }

  // ==================== 网易云音乐登录 ====================

  async checkNCMLogin() {
    const statusText = document.getElementById('ncm-login-status-text');
    statusText.textContent = '检测中...';
    statusText.style.color = '#888';

    try {
      const cookie = document.getElementById('setting-ncm-cookie')?.value?.trim();
      const response = await fetch('/api/ncm/login-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookie })
      });
      const data = await response.json();

      if (data.loggedIn) {
        statusText.textContent = `✅ ${data.message}`;
        statusText.style.color = '#4ade80';
      } else {
        statusText.textContent = `❌ ${data.message}`;
        statusText.style.color = '#f87171';
      }
    } catch (error) {
      statusText.textContent = '❌ 检测失败';
      statusText.style.color = '#f87171';
    }
  }

  async saveNCMCookie(cookie) {
    try {
      await fetch('/api/ncm/cookie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookie })
      });
      console.log('网易云 Cookie 已保存');
    } catch (error) {
      console.error('保存网易云 Cookie 失败:', error);
    }
  }

  // 启动时自动检测网易云登录状态
  async autoCheckNCMLogin() {
    try {
      const response = await fetch('/api/ncm/login-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await response.json();
      if (data.loggedIn) {
        console.log(`网易云已登录: ${data.nickname}`);
      } else {
        console.log('网易云未登录，歌曲可能只能试听 30 秒');
      }
    } catch (error) {
      console.log('网易云登录检测跳过');
    }
  }

  updateSettingsUI() {
    const provider = document.getElementById('setting-tts-provider').value;
    const voiceSelector = document.getElementById('voice-selector');
    const emotionSelector = document.getElementById('emotion-selector');
    
    voiceSelector.style.display = provider === 'volcano' ? 'block' : 'none';
    emotionSelector.style.display = provider === 'volcano' ? 'block' : 'none';
  }

  // ==================== Waveform ====================

  initWaveform() {
    if (!this.waveformCanvas) return;
    this.resizeWaveform();
    window.addEventListener('resize', () => this.resizeWaveform());
  }

  resizeWaveform() {
    const rect = this.waveformCanvas.parentElement.getBoundingClientRect();
    this.waveformCanvas.width = rect.width;
    this.waveformCanvas.height = rect.height;
  }

  startWaveformAnimation() {
    const animate = () => {
      this.drawWaveform();
      this.waveformPhase += 0.05;
      requestAnimationFrame(animate);
    };
    animate();
  }

  drawWaveform() {
    if (!this.waveformCtx) return;
    
    const ctx = this.waveformCtx;
    const width = this.waveformCanvas.width;
    const height = this.waveformCanvas.height;
    
    ctx.clearRect(0, 0, width, height);
    
    const bars = 60;
    const barWidth = width / bars;
    
    for (let i = 0; i < bars; i++) {
      const x = i * barWidth;
      const normalized = i / bars;
      
      // 生成波形高度
      let barHeight;
      if (this.isPlaying) {
        const baseHeight = Math.sin(this.waveformPhase + normalized * Math.PI * 4) * 0.3 + 0.5;
        const random = Math.random() * 0.3;
        barHeight = (baseHeight + random) * height * 0.8;
      } else {
        barHeight = Math.sin(normalized * Math.PI) * height * 0.2 + 10;
      }
      
      const y = (height - barHeight) / 2;
      
      // 渐变颜色
      const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
      gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0.1)');
      
      ctx.fillStyle = gradient;
      ctx.fillRect(x + 1, y, barWidth - 2, barHeight);
    }
  }

  updateTime() {
    const update = () => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      const el = document.getElementById('nav-time');
      if (el) el.textContent = timeStr;
    };
    update();
    setInterval(update, 60000);
  }
}

// Initialize app
const app = new ClaudioApp();
