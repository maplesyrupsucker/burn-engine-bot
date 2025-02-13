const TwitterApi = require("twitter-api-v2").default;
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

let lastTwitterPostTime = 0;

const twitterClient = new TwitterApi({
    appKey: process.env.TWITTER_APP_KEY,
    appSecret: process.env.TWITTER_APP_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET
});

async function postTweet(message, forcePost = false) {
    try {
        const now = Date.now();
        // Only post if it's been more than a week since the last post or if forcePost is true
        if (forcePost || now - lastTwitterPostTime >= ONE_WEEK_MS) {
            await twitterClient.v2.tweet(message);
            lastTwitterPostTime = now;
            console.log('Twitter post successful, updated last post time:', new Date(lastTwitterPostTime).toISOString());
        } else {
            console.log('Skipping Twitter post due to rate limit. Last post was:', new Date(lastTwitterPostTime).toISOString());
        }
    } catch (error) {
        console.error("Error posting to Twitter:", error);
    }
}

async function handleTwitterResponse(tweetId, responseMessage) {
    try {
        await twitterClient.v2.reply(responseMessage, tweetId);
    } catch (error) {
        console.error("Error responding on Twitter:", error);
    }
}

module.exports = { postTweet, handleTwitterResponse };
