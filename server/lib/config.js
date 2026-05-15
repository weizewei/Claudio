import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// 加载环境变量
config({ path: join(dirname(fileURLToPath(import.meta.url)), '../../.env') });

export default {
  // 服务配置
  port: parseInt(process.env.PORT) || 8080,
  
  // DeepSeek API配置
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
    model: 'deepseek-chat'
  },
  
  // 火山引擎TTS配置
  volcanoTTS: {
    // V3 新版鉴权（推荐）
    apiKey: process.env.VOLCANO_TTS_API_KEY || '',
    resourceId: process.env.VOLCANO_TTS_RESOURCE_ID || 'seed-tts-2.0',
    // V1 旧版鉴权（备用）
    appId: process.env.VOLCANO_TTS_APPID || '',
    accessToken: process.env.VOLCANO_TTS_ACCESS_TOKEN || '',
    cluster: process.env.VOLCANO_TTS_CLUSTER || 'volcano_tts',
    voiceName: process.env.VOLCANO_TTS_VOICE_NAME || 'BV700_V2_streaming',
    baseUrl: 'https://openspeech.bytedance.com/api/v1/tts'
  },
  
  // 网易云音乐配置
  ncm: {
    cookie: process.env.NCM_COOKIE || ''
  },
  
  // 天气配置
  weather: {
    city: process.env.WEATHER_CITY || 'Beijing'
  },
  
  // 调试模式
  debug: process.env.DEBUG === 'true',
  
  // 路径配置
  paths: {
    user: join(dirname(fileURLToPath(import.meta.url)), '../../user'),
    prompts: join(dirname(fileURLToPath(import.meta.url)), '../../prompts'),
    cache: join(dirname(fileURLToPath(import.meta.url)), '../../cache'),
    public: join(dirname(fileURLToPath(import.meta.url)), '../public')
  }
};
