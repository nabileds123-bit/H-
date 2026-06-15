module.exports = {
  apps: [
    {
      name: "bubblev2",
      script: "src/index.js",
      args: "--game",
      cwd: "/var/www/bubblev2",
      env: {
        NODE_ENV: "production",
        PORT: 8080,
        APP_BASE_URL: "https://bubblev2.site"
      }
    }
  ]
};
