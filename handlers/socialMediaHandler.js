const { handleTelegramPost } = require('./telegramHandler');
const { handleSlackPost } = require('./slackHandler');
const { handleFacebookPost } = require('./facebookHandler');
const { handleDiscordPost } = require('./discordHandler');
const { postTweet } = require('./twitterHandler');

async function broadcastMessage(message, platforms = ['all']) {
  const handlers = {
    telegram: handleTelegramPost,
    slack: handleSlackPost,
    facebook: handleFacebookPost,
    discord: handleDiscordPost,
    twitter: postTweet
  };

  const tasks = [];
  for (const [platform, handler] of Object.entries(handlers)) {
    if (platforms.includes('all') || platforms.includes(platform)) {
      tasks.push(
        handler(message).catch(error => {
          console.error(`Error posting to ${platform}:`, error);
          return notifyError(`${platform} posting error: ${error.message}`);
        })
      );
    }
  }

  await Promise.allSettled(tasks);
}

module.exports = { broadcastMessage }; 