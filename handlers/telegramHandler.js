const TelegramBot = require("node-telegram-bot-api");

// Initialize Telegram Bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const myTelegramId = process.env.MY_TELEGRAM_ID;

// Function to post a message to Telegram
async function handleTelegramPost(message) {
    try {
        const chatIds = process.env.TELEGRAM_CHAT_IDS.split(",");
        for (const chatId of chatIds) {
            await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
        }
    } catch (error) {
        console.error("Error posting to Telegram:", error);
        await notifyError(`Error in Telegram Post: ${error.message}`);
    }
}

// Function to notify you via Telegram DM in case of errors
async function notifyError(errorMessage) {
    try {
        if (myTelegramId) {
            await bot.sendMessage(myTelegramId, `🚨 Alert: ${errorMessage}`);
        }
    } catch (error) {
        console.error("Error sending notification to Telegram:", error);
    }
}

// Function to set up Telegram commands with rate limiting
function setupTelegramCommands({ 
    fetchLastFiveBurns, 
    fetchEngineBalance, 
    handleTotalVerseBurnedCommand,
    checkTelegramRateLimit
}) {
    bot.onText(/\/burns/, async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        try {
            const response = await fetchLastFiveBurns(userId);
            await bot.sendMessage(chatId, response, { parse_mode: "Markdown" });
        } catch (error) {
            console.error(`Error in /burns command: ${error.message}`);
            
            // Check if it's a rate limiting error
            if (error.message.includes("rate limit") || error.message.includes("wait")) {
                await bot.sendMessage(chatId, `⏱️ ${error.message}`);
            } else {
                await notifyError(`Error in /burns command: ${error.message}`);
                await bot.sendMessage(chatId, "Sorry, there was an error processing your request. Please try again later.");
            }
        }
    });

    bot.onText(/\/enginebalance/, async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        try {
            const response = await fetchEngineBalance(userId);
            await bot.sendMessage(chatId, response, { parse_mode: "Markdown" });
        } catch (error) {
            console.error(`Error in /enginebalance command: ${error.message}`);
            
            // Check if it's a rate limiting error
            if (error.message.includes("rate limit") || error.message.includes("wait")) {
                await bot.sendMessage(chatId, `⏱️ ${error.message}`);
            } else {
                await notifyError(`Error in /enginebalance command: ${error.message}`);
                await bot.sendMessage(chatId, "Sorry, there was an error processing your request. Please try again later.");
            }
        }
    });

    bot.onText(/\/totalverseburned/, async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        try {
            const response = await handleTotalVerseBurnedCommand(true, userId);
            await bot.sendMessage(chatId, response, { parse_mode: "Markdown" });
        } catch (error) {
            console.error(`Error in /totalverseburned command: ${error.message}`);
            
            // Check if it's a rate limiting error
            if (error.message.includes("rate limit") || error.message.includes("wait")) {
                await bot.sendMessage(chatId, `⏱️ ${error.message}`);
            } else {
                await notifyError(`Error in /totalverseburned command: ${error.message}`);
                await bot.sendMessage(chatId, "Sorry, there was an error processing your request. Please try again later.");
            }
        }
    });

    // Add help command to show available commands and rate limits
    bot.onText(/\/help/, async (msg) => {
        const chatId = msg.chat.id;
        const helpMessage = 
            "🤖 *VERSE Bot Commands:*\n\n" +
            "/burns - Show last 5 VERSE burns\n" +
            "/enginebalance - Show current burn engine balance\n" +
            "/totalverseburned - Show total VERSE burned\n" +
            "/help - Show this help message\n\n" +
            "⏱️ *Rate Limits:*\n" +
            "• 3 commands per minute per user\n" +
            "• Heavy commands have 15 minute cooldown\n" +
            "• Global limit: 3 commands per minute\n" +
            "• Rate limited users: 5 minute cooldown\n" +
            "• Auto-posts: Max 2 per day when balance > 0\n\n" +
            "🔥 Learn more: https://verse.bitcoin.com/burn/";
        
        await bot.sendMessage(chatId, helpMessage, { parse_mode: "Markdown" });
    });
}

module.exports = {
    handleTelegramPost,
    setupTelegramCommands,
    notifyError
};
