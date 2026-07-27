module.exports = {
  apps: [
    {
      name: "workbench",
      script: "./node_modules/.bin/next",
      args: "start -p 3000",
      cwd: "/Users/wkk/Desktop/my-AI-workbench",
      env: {
        NODE_ENV: "production",
        ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "change-me",
        JWT_SECRET: process.env.JWT_SECRET || "change-me",
        PORT: "3000",
        DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || "",
        PATH: "/usr/local/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/Users/wkk/.local/bin:/Users/wkk/.workbuddy/binaries/node/versions/22.19.0/bin:/usr/bin:/bin",
      },
    },
  ],
};
