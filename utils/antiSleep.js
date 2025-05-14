/**
 * Anti-sleep utility for Render free tier
 * Prevents the service from sleeping after 15 minutes of inactivity
 */

const https = require('https');
const logger = require('./logger');
const config = require('../config');

class AntiSleep {
  constructor() {
    this.enabled = config.isProduction;
    this.interval = 14 * 60 * 1000; // 14 minutes (just under Render's 15-minute limit)
    this.timer = null;
    this.appUrl = process.env.RENDER_EXTERNAL_URL || null;
  }

  start() {
    if (!this.enabled || !this.appUrl) {
      logger.info('Anti-sleep mechanism not started: not in production or no app URL defined');
      return;
    }
    
    logger.info(`Starting anti-sleep mechanism, pinging ${this.appUrl} every ${this.interval/60000} minutes`);
    
    this.timer = setInterval(() => {
      this.pingService();
    }, this.interval);
  }

  pingService() {
    try {
      logger.debug(`Pinging service at ${this.appUrl}/health to prevent sleep`);
      
      https.get(`${this.appUrl}/health`, (res) => {
        if (res.statusCode === 200) {
          logger.debug('Anti-sleep ping successful');
        } else {
          logger.warn(`Anti-sleep ping failed with status: ${res.statusCode}`);
        }
      }).on('error', (err) => {
        logger.error('Anti-sleep ping error:', err);
      });
    } catch (err) {
      logger.error('Error in anti-sleep mechanism:', err);
    }
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('Anti-sleep mechanism stopped');
    }
  }
}

module.exports = new AntiSleep();
