import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import config from './config.js';

class TTS {
  constructor() {
    this.cacheDir = path.join(config.paths.cache, 'tts');
    this.ensureCacheDir();
  }

  ensureCacheDir() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  getCacheKey(text) {
    return crypto.createHash('md5').update(text).digest('hex');
  }

  getCachePath(key) {
    return path.join(this.cacheDir, `${key}.mp3`);
  }

  hasCache(key) {
    const cachePath = this.getCachePath(key);
    return fs.existsSync(cachePath);
  }

  /**
   * 使用火山引擎 V3 HTTP Chunked 接口合成语音
   * @param {string} text - 要合成的文本
   * @param {Object} options - 可选参数
   * @param {string} options.apiKey - V3 API Key（新版鉴权）
   * @param {string} options.appId - V1 AppID（旧版鉴权，备用）
   * @param {string} options.accessToken - V1 Access Token（旧版鉴权，备用）
   * @param {string} options.voiceType - 音色类型
   * @param {string} options.emotion - 情感风格
   * @param {string} options.resourceId - 资源ID，默认 seed-tts-2.0
   * @param {string} options.instruction - 语音指令（V3 2.0特性）
   */
  async synthesize(text, options = {}) {
    // 缓存key包含音色+情感+指令，用hash生成短文件名
    const rawKey = `${text}_${options.voiceType || 'default'}_${options.emotion || ''}_${options.instruction || ''}`;
    const cacheKey = this.getCacheKey(rawKey);
    if (this.hasCache(cacheKey)) {
      return this.getCachePath(cacheKey);
    }

    // 优先使用 V3 API Key，其次回退到 V1 AppID+Token
    const apiKey = options.apiKey || config.volcanoTTS.apiKey || '';
    const appId = options.appId || config.volcanoTTS.appId || '';
    const accessToken = options.accessToken || config.volcanoTTS.accessToken || '';
    const voiceType = options.voiceType || config.volcanoTTS.voiceName || 'BV700_V2_streaming';
    const emotion = options.emotion || '';
    const instruction = options.instruction || '';
    
    // 根据音色自动选择模型版本
    // 2.0 音色：uranus_bigtts 后缀
    // 1.0 音色：mars_bigtts / moon_bigtts 后缀
    let resourceId;
    if (voiceType.includes('uranus_bigtts')) {
      resourceId = 'seed-tts-2.0';
    } else {
      resourceId = 'seed-tts-1.0';
    }

    console.log('TTS V3合成请求:', {
      mode: apiKey ? 'V3-API-Key' : 'V1-AppID',
      voiceType,
      emotion: emotion || '自动',
      resourceId,
      instruction: instruction ? '已设置' : '无',
      textLength: text?.length
    });

    // V3 接口
    if (apiKey || (appId && accessToken)) {
      return await this.synthesizeV3(text, { apiKey, appId, accessToken, voiceType, emotion, resourceId, instruction, cacheKey });
    }

    // V1 接口（备用）
    if (appId && accessToken) {
      return await this.synthesizeV1(text, { appId, accessToken, voiceType, emotion, cacheKey });
    }

    console.warn('火山引擎TTS未配置');
    return null;
  }

  /**
   * V3 HTTP Chunked 接口
   */
  async synthesizeV3(text, { apiKey, appId, accessToken, voiceType, emotion, resourceId, instruction, cacheKey }) {
    try {
      // 判断使用新版还是旧版鉴权
      // 新版控制台：X-Api-Key
      // 旧版控制台：X-Api-App-Id + X-Api-Access-Key
      const useNewAuth = !!apiKey && !appId;
      
      const headers = {
        'Content-Type': 'application/json'
      };
      
      if (useNewAuth) {
        headers['X-Api-Key'] = apiKey;
        headers['X-Api-Resource-Id'] = resourceId;
      } else if (appId && accessToken) {
        headers['X-Api-App-Id'] = appId;
        headers['X-Api-Access-Key'] = accessToken;
        headers['X-Api-Resource-Id'] = resourceId;
      } else {
        throw new Error('V3鉴权参数不足');
      }

      const audioParams = {
        format: 'mp3',
        sample_rate: 24000
      };

      if (emotion) {
        audioParams.emotion = emotion;
      }

      const reqText = instruction ? `[#${instruction}]${text}` : text;
      
      console.log('V3鉴权模式:', useNewAuth ? '新版API-Key' : '旧版AppID+AccessKey');
      
      return await this._doV3Request(reqText, headers, voiceType, audioParams, cacheKey);
    } catch (error) {
      console.error('TTS V3合成失败:', error);
      return null;
    }
  }

  async _doV3Request(text, headers, voiceType, audioParams, cacheKey) {
    const body = {
      user: { uid: 'claudio_user' },
      req_params: {
        text,
        speaker: voiceType,
        audio_params: audioParams
      }
    };

    console.log('V3请求:', JSON.stringify(body, null, 2));

    const response = await fetch('https://openspeech.bytedance.com/api/v3/tts/unidirectional', {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`TTS V3 API错误: ${response.status} ${errText}`);
    }

    // V3 返回 chunked 数据
    const chunks = [];
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let rawOutput = ''; // 调试用

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      rawOutput += chunk;
      buffer += chunk;

      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const json = JSON.parse(trimmed);
          console.log('V3响应行:', JSON.stringify(json).substring(0, 200));
          if (json.code === 0 && json.data) {
            chunks.push(Buffer.from(json.data, 'base64'));
          } else if (json.code !== 0) {
            console.error('V3错误响应:', json);
          }
        } catch (e) {
          // 忽略 JSON 解析错误
        }
      }
    }

    console.log('V3原始响应(前500字符):', rawOutput.substring(0, 500));

    if (chunks.length === 0) {
      throw new Error('TTS V3: 未收到音频数据');
    }

    const audioBuffer = Buffer.concat(chunks);
    const cachePath = this.getCachePath(cacheKey);
    fs.writeFileSync(cachePath, audioBuffer);

    console.log(`TTS V3合成成功: ${audioBuffer.length} bytes`);
    return cachePath;
  }

  /**
   * V1 HTTP 接口（备用）
   */
  async synthesizeV1(text, { appId, accessToken, voiceType, emotion, cacheKey }) {
    try {
      const { cluster, baseUrl } = config.volcanoTTS;

      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer; ${accessToken}`
        },
        body: JSON.stringify({
          app: { appid: appId, token: 'access_token', cluster },
          user: { uid: 'cladio_user' },
          audio: {
            voice_type: voiceType,
            encoding: 'mp3',
            speed_ratio: 1.0,
            volume_ratio: 1.0,
            pitch_ratio: 1.0,
            ...(emotion ? { emotion, enable_emotion: true } : {})
          },
          request: {
            reqid: crypto.randomUUID(),
            text,
            text_type: 'plain',
            operation: 'query'
          }
        })
      });

      if (!response.ok) throw new Error(`TTS V1 API错误: ${response.status}`);

      const result = await response.json();
      if (result.code !== 3000) {
        throw new Error(`TTS V1合成失败: ${result.message || result.code}`);
      }

      const audioBuffer = Buffer.from(result.data, 'base64');
      const cachePath = this.getCachePath(cacheKey);
      fs.writeFileSync(cachePath, audioBuffer);

      return cachePath;
    } catch (error) {
      console.error('TTS V1合成失败:', error);
      return null;
    }
  }

  cleanOldCache(daysToKeep = 7) {
    const files = fs.readdirSync(this.cacheDir);
    const now = Date.now();
    const maxAge = daysToKeep * 24 * 60 * 60 * 1000;

    files.forEach(file => {
      const filePath = path.join(this.cacheDir, file);
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > maxAge) {
        fs.unlinkSync(filePath);
      }
    });
  }
}

export default new TTS();
