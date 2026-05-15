import state from './state.js';
import deepseek from './deepseek.js';
import context from './context.js';

class Scheduler {
  constructor() {
    this.jobs = [];
    this.isRunning = false;
  }

  /**
   * 启动调度器
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    
    // 每分钟检查一次
    this.interval = setInterval(() => this.tick(), 60000);
    this.tick(); // 立即执行一次
    
    console.log('调度器已启动');
  }

  /**
   * 停止调度器
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.isRunning = false;
      console.log('调度器已停止');
    }
  }

  /**
   * 每分钟执行的检查
   */
  async tick() {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const dayOfWeek = now.getDay();
    const dateStr = now.toISOString().split('T')[0];

    // 07:00 - 早间规划
    if (hour === 7 && minute === 0) {
      await this.morningPlanning(dateStr);
    }

    // 09:00 - 早间问候
    if (hour === 9 && minute === 0) {
      await this.morningGreeting();
    }

    // 12:00 - 午间提醒
    if (hour === 12 && minute === 0) {
      await this.noonReminder();
    }

    // 18:00 - 下班提醒
    if (hour === 18 && minute === 0) {
      await this.eveningReminder();
    }

    // 22:00 - 晚间放松
    if (hour === 22 && minute === 0) {
      await this.nightRelax();
    }

    // 整点情绪检查
    if (minute === 0) {
      await this.hourlyMoodCheck(hour);
    }
  }

  /**
   * 早间规划
   */
  async morningPlanning(dateStr) {
    // 检查今天是否已有计划
    const existingPlan = state.getPlan(dateStr);
    if (existingPlan) return;

    console.log('开始生成今日音乐计划...');
    
    const plan = await deepseek.generateDailyPlan();
    if (plan) {
      state.setPlan(dateStr, plan);
      console.log('今日音乐计划已生成');
    }
  }

  /**
   * 早间问候
   */
  async morningGreeting() {
    const timeContext = context.getTimeContext();
    const weatherContext = await context.getWeatherContext();
    
    return {
      type: 'scheduled',
      event: 'morning_greeting',
      message: `${timeContext.greeting}！新的一天开始了`,
      weather: weatherContext,
      suggestion: '来点轻快的音乐开启美好的一天吧'
    };
  }

  /**
   * 午间提醒
   */
  async noonReminder() {
    return {
      type: 'scheduled',
      event: 'noon_reminder',
      message: '中午了，休息一下吧',
      suggestion: '午餐时间，来点轻松的音乐'
    };
  }

  /**
   * 下班提醒
   */
  async eveningReminder() {
    const timeContext = context.getTimeContext();
    
    return {
      type: 'scheduled',
      event: 'evening_reminder',
      message: timeContext.isWeekend ? '周末愉快！' : '辛苦一天了，放松一下吧',
      suggestion: '下班路上，来点舒缓的音乐'
    };
  }

  /**
   * 晚间放松
   */
  async nightRelax() {
    return {
      type: 'scheduled',
      event: 'night_relax',
      message: '夜深了，准备休息吧',
      suggestion: '睡前时光，来点温柔的音乐'
    };
  }

  /**
   * 整点情绪检查
   */
  async hourlyMoodCheck(hour) {
    // 根据时段返回不同的情绪建议
    const moodSuggestions = {
      0: { mood: 'peaceful', suggestion: '深夜了，适合安静的音乐' },
      1: { mood: 'peaceful', suggestion: '夜深人静' },
      2: { mood: 'peaceful', suggestion: '凌晨时分' },
      3: { mood: 'peaceful', suggestion: '黎明前的宁静' },
      4: { mood: 'peaceful', suggestion: '天快亮了' },
      5: { mood: 'calm', suggestion: '清晨的宁静' },
      6: { mood: 'calm', suggestion: '新的一天即将开始' },
      7: { mood: 'energetic', suggestion: '早安！新的一天' },
      8: { mood: 'energetic', suggestion: '上班路上' },
      9: { mood: 'focused', suggestion: '工作模式' },
      10: { mood: 'focused', suggestion: '专注工作中' },
      11: { mood: 'focused', suggestion: '上午工作' },
      12: { mood: 'calm', suggestion: '午休时间' },
      13: { mood: 'calm', suggestion: '午后小憩' },
      14: { mood: 'focused', suggestion: '下午工作开始' },
      15: { mood: 'focused', suggestion: '下午茶时间' },
      16: { mood: 'focused', suggestion: '下午工作' },
      17: { mood: 'calm', suggestion: '快下班了' },
      18: { mood: 'calm', suggestion: '下班时间' },
      19: { mood: 'calm', suggestion: '晚餐时间' },
      20: { mood: 'calm', suggestion: '晚间放松' },
      21: { mood: 'calm', suggestion: '晚间时光' },
      22: { mood: 'peaceful', suggestion: '睡前准备' },
      23: { mood: 'peaceful', suggestion: '深夜时光' }
    };

    return moodSuggestions[hour] || { mood: 'calm', suggestion: '' };
  }

  /**
   * 获取今日计划
   */
  getTodayPlan() {
    const dateStr = new Date().toISOString().split('T')[0];
    return state.getPlan(dateStr);
  }
}

export default new Scheduler();
