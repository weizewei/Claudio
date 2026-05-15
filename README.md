# 🎵 Claudio - 个人AI电台

一个基于 DeepSeek AI 的智能音乐电台，能够像真正的电台 DJ 一样与你对话，理解你的情绪和场景，主动推荐合适的音乐。

![Claudio](server/public/assets/default-cover.svg)

## ✨ 特性

- 🤖 **AI 对话式推荐** - 不只是搜索，而是理解你的心情、场景，主动推荐
- 🎙️ **语音对讲** - 支持语音输入，像和 DJ 聊天一样自然
- 🎵 **智能音乐品味学习** - 自动学习你的音乐偏好，越用越懂你
- 🔊 **TTS 语音播报** - AI 回复可以用语音播放，真正的电台体验
- 📻 **网易云音乐集成** - 支持网易云音乐搜索和播放
- 🎨 **精美界面** - 现代化的电台风格 UI

## 🚀 快速开始

### 环境要求

- Node.js 18+
- npm 或 yarn

### 安装

```bash
# 克隆项目
git clone https://github.com/yourusername/claudio.git
cd claudio

# 安装依赖
cd server && npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入你的 API 密钥

# 启动服务
node index.js
```

访问 http://localhost:8080 即可使用。

### 必需配置

在 `.env` 文件中配置以下 API 密钥：

```env
# DeepSeek API (必需)
DEEPSEEK_API_KEY=your_deepseek_api_key_here

# 其他配置可选
```

获取 DeepSeek API Key: https://platform.deepseek.com

## 📝 使用指南

### 对话示例

| 你说 | Claudio 会 |
|------|------------|
| "今天心情不太好" | 理解情绪，推荐治愈系音乐 |
| "播放周杰伦的晴天" | 搜索并播放指定歌曲 |
| "适合工作时听的歌" | 根据场景推荐专注音乐 |
| "我最近很喜欢林俊杰" | 学习你的品味，后续推荐相关风格 |

### 语音对讲

点击左下角 🎤 麦克风按钮，直接说话即可。支持实时语音识别和自动发送。

### 设置面板

点击右下角 ⚙️ 设置按钮，可以配置：
- DeepSeek API Key
- TTS 语音合成（浏览器原生或火山引擎）
- 所在城市（用于天气感知）

### 用户数据配置

`user/` 目录包含个性化数据，首次运行后会自动创建。可选配置文件：

| 文件 | 说明 |
|------|------|
| `taste.md` | 你的音乐品味偏好 |
| `routines.md` | 日常作息时间表 |
| `mood-rules.json` | 情绪响应规则 |
| `user-taste.json` | JSON 格式的音乐品味分析 |

#### taste.md 示例

```markdown
# 我的音乐品味

## 喜欢的音乐风格
- 流行：华语流行、欧美流行
- 摇滚：轻摇滚、独立摇滚

## 喜欢的歌手/乐队
- 周杰伦
- 陈奕迅
```

#### routines.md 示例

```markdown
# 我的日常作息

## 工作日
- 07:00 - 起床，需要轻快的音乐唤醒
- 09:00-12:00 - 工作，需要专注的背景音乐
- 22:00 - 睡前，舒缓的音乐
```

#### mood-rules.json 示例

```json
{
  "moodRules": [
    {
      "trigger": "加班",
      "response": "播放轻音乐帮助专注",
      "songs": ["Weightless", "Dreaming"]
    },
    {
      "trigger": "难过",
      "response": "播放治愈系音乐",
      "songs": ["Fix You", "夜空中最亮的星"]
    }
  ]
}
```

## 🏗️ 项目结构

```
claudio/
├── server/                 # 后端服务
│   ├── index.js           # 主入口
│   ├── lib/               # 核心模块
│   │   ├── router.js      # 意图路由
│   │   ├── deepseek.js    # AI 对话
│   │   ├── context.js     # 上下文管理
│   │   ├── ncm.js         # 网易云音乐
│   │   └── ...
│   ├── public/            # 前端静态文件
│   │   ├── index.html
│   │   ├── css/
│   │   └── js/
│   ├── user/              # 用户数据（gitignored）
│   └── prompts/           # AI 提示词
├── .env.example           # 环境变量示例
├── .gitignore
└── README.md
```

## 🔧 技术栈

- **后端**: Node.js, Express, SQLite
- **前端**: 原生 HTML/CSS/JS, Web Speech API
- **AI**: DeepSeek API
- **音乐**: 网易云音乐 API
- **TTS**: 浏览器原生 SpeechSynthesis / 火山引擎

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 🙏 致谢

本项目参考 [mmguo.dev/claudio-fm](https://mmguo.dev/claudio-fm/) 实现，感谢原作者的创意和灵感。

- [mmguo.dev/claudio-fm](https://mmguo.dev/claudio-fm/) - 原始项目灵感
- [DeepSeek](https://deepseek.com) - AI 能力支持
- [网易云音乐](https://music.163.com) - 音乐数据源
