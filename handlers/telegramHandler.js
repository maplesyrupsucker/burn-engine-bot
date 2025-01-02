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

// Function to set up Telegram commands
function setupTelegramCommands({ 
    fetchLastFiveBurns, 
    fetchEngineBalance, 
    handleTotalVerseBurnedCommand
}) {
    bot.onText(/\/burns/, async (msg) => {
        const chatId = msg.chat.id;
        try {
            const response = await fetchLastFiveBurns();
            await bot.sendMessage(chatId, response, { parse_mode: "Markdown" });
        } catch (error) {
            console.error(`Error in /burns command: ${error.message}`);
            await notifyError(`Error in /burns command: ${error.message}`);
            await bot.sendMessage(chatId, "Sorry, there was an error processing your request.");
        }
    });

    bot.onText(/\/enginebalance/, async (msg) => {
        const chatId = msg.chat.id;
        try {
            const response = await fetchEngineBalance();
            await bot.sendMessage(chatId, response, { parse_mode: "Markdown" });
        } catch (error) {
            console.error(`Error in /enginebalance command: ${error.message}`);
            await notifyError(`Error in /enginebalance command: ${error.message}`);
            await bot.sendMessage(chatId, "Sorry, there was an error processing your request.");
        }
    });

    bot.onText(/\/totalverseburned/, async (msg) => {
        const chatId = msg.chat.id;
        try {
            const response = await handleTotalVerseBurnedCommand(true);
            await bot.sendMessage(chatId, response, { parse_mode: "Markdown" });
        } catch (error) {
            console.error(`Error in /totalverseburned command: ${error.message}`);
            await notifyError(`Error in /totalverseburned command: ${error.message}`);
            await bot.sendMessage(chatId, "Sorry, there was an error processing your request.");
        }
    });
}

module.exports = {
    handleTelegramPost,
    setupTelegramCommands,
    notifyError
};
