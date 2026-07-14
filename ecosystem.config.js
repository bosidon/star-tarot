module.exports = {
  apps: [{
    name: 'tarot',
    script: './backend/server.js',
    cwd: '/var/www/tarot',
    env: {
      NODE_ENV: 'production',
      PORT: 3004,
      DEEPSEEK_API_KEY: 'YOUR_DEEPSEEK_API_KEY',
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    merge_logs: true,
    max_restarts: 10,
    restart_delay: 3000,
  }]
};
