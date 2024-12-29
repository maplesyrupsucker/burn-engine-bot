require("dotenv").config();
const ONE_DAY_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const Web3 = require("web3");
const axios = require("axios");
const {
  handleTelegramPost,
  notifyError,
  setupTelegramCommands,
} = require("./handlers/telegramHandler");
const { postTweet } = require("./handlers/twitterHandler");
const CONFIG = require('./config/constants');

// Web3 Setup
const web3 = new Web3(new Web3.providers.HttpProvider(CONFIG.INFURA_URL));
const verseTokenABI = require("./VerseTokenABI.json");
const verseTokenContract = new web3.eth.Contract(
  verseTokenABI,
  CONFIG.VERSE_TOKEN_ADDRESS
);

let lastTelegramNotificationTime = 0;
let verseUsdRate = 0;
let lastProcessedBlock = 0;
let lastKnownBalanceEth = 0;
let lastTelegramNotificationTime = 0; // Initialize the variable to track Telegram notification time
let lastReportedTelegramBalance = ""; // Initialize the variable to track the last reported balance on Telegram

// Fetch USD Rate
async function fetchVerseUsdRate() {
  try {
    const response = await axios.get(CONFIG.VERSE_PRICE_API);
    verseUsdRate = response.data.USD.rate;
  } catch (e) {
    console.error(`${CONFIG.ERROR_PREFIX}fetching USD rate: ${e.message}`);
    await notifyError(`Error fetching USD rate: ${e.message}`);
  }
}

// Format Amount
const formatAmount = (verseAmount) => {
  const formattedVerse = parseFloat(verseAmount).toLocaleString("en-US", CONFIG.NUMBER_FORMAT);
  const usdValue = verseAmount * verseUsdRate;
  return `${formattedVerse} VERSE (~$${usdValue.toLocaleString("en-US", CONFIG.NUMBER_FORMAT)} USD)`;
};

// Fetch Circulating Supply
const fetchCirculatingSupply = async () => {
  try {
    const response = await axios.get(CONFIG.CIRCULATING_SUPPLY_API);
    return parseFloat(response.data);
  } catch (e) {
    console.error(`${CONFIG.ERROR_PREFIX}fetching circulating supply: ${e.message}`);
    await notifyError(`Error fetching circulating supply: ${e.message}`);
  }
};

// Monitor transfers to burn engine
async function monitorBurnEngineTransfers(fromBlock, toBlock) {
  try {
    const events = await verseTokenContract.getPastEvents('Transfer', {
      fromBlock,
      toBlock,
      filter: { to: CONFIG.BURN_ENGINE_ADDRESS }
    });

    for (const event of events) {
      await handleTransfer(event);
    }
  } catch (error) {
    console.error(`${CONFIG.ERROR_PREFIX}monitoring burn engine transfers:`, error);
    await notifyError(`Error monitoring burn engine transfers: ${error.message}`);
  }
}

// Function to handle transfers to burn engine
async function handleTransfer(event) {
  try {
    await fetchVerseUsdRate();
    const valueWei = event.returnValues.value;
    const valueEth = Number(web3.utils.fromWei(valueWei, "ether"));

    const burnEngineBalanceWei = await verseTokenContract.methods
      .balanceOf(CONFIG.BURN_ENGINE_ADDRESS)
      .call();
    const currentBalance = burnEngineBalanceWei.toString();
    lastKnownBalanceEth = Number(web3.utils.fromWei(burnEngineBalanceWei, "ether"));

    let message;
    
    if (lastKnownBalanceEth === 0) {
      // If balance is 0, use a random educational/promotional message
      message = getRandomEmptyBalanceMessage() + '\n\n' +
        `${CONFIG.EMOJIS.GLOBE} Learn more about VERSE Burns: https://verse.bitcoin.com/burn/`;
    } else {
      const formattedValueEth = valueEth.toLocaleString("en-US", CONFIG.NUMBER_FORMAT);
      const formattedLastKnownBalanceEth = lastKnownBalanceEth.toLocaleString("en-US", CONFIG.NUMBER_FORMAT);
      const formattedUsdValueEth = (valueEth * verseUsdRate).toLocaleString("en-US", CONFIG.NUMBER_FORMAT);
      const formattedUsdLastKnownBalanceEth = (lastKnownBalanceEth * verseUsdRate).toLocaleString("en-US", CONFIG.NUMBER_FORMAT);

      message =
        `${CONFIG.EMOJIS.ROCKET} $Verse Burn Engine Deposit Detected: ${formattedValueEth} VERSE (~$${formattedUsdValueEth} USD)\n` +
        `${CONFIG.EMOJIS.FIRE} Current Burn Engine Balance: ${formattedLastKnownBalanceEth} VERSE (~$${formattedUsdLastKnownBalanceEth} USD)\n` +
        CONFIG.BURN_ENGINE_PROMPT + '\n\n' +
        `${CONFIG.EMOJIS.GLOBE} Learn more about VERSE Burns: https://verse.bitcoin.com/burn/`;
    }

    // Always post to Twitter in real-time
    await postTweet(message);

    // Check if we should send Telegram notification
    const now = Date.now();
    const shouldNotifyTelegram = 
      (now - lastTelegramNotificationTime >= ONE_DAY_MS) && // More than 24 hours since last notification
      (currentBalance !== lastReportedTelegramBalance); // Balance has changed

    if (shouldNotifyTelegram) {
      await handleTelegramPost(message);
      // Update Telegram tracking variables
      lastTelegramNotificationTime = now;
      lastReportedTelegramBalance = currentBalance;
    }

  } catch (error) {
    console.error(`${CONFIG.ERROR_PREFIX}handling transfer event:`, error);
    await notifyError(`Error handling transfer event: ${error.message}`);
  }
}

async function retryRequest(asyncFunc, maxRetries = CONFIG.MAX_RETRIES, initialDelay = CONFIG.INITIAL_RETRY_DELAY) {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      return await asyncFunc();
    } catch (error) {
      retries++;
      if (retries === maxRetries) {
        throw error;
      }
      const delay = initialDelay * Math.pow(2, retries - 1);
      console.warn(`Request failed. Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// Monitor Events
async function monitorEvents() {
  while (true) {
    try {
      const latestBlock = await retryRequest(() => web3.eth.getBlockNumber());
      const fromBlock = lastProcessedBlock > 0 ? lastProcessedBlock + 1 : CONFIG.START_BLOCK;

      if (fromBlock <= latestBlock) {
        await Promise.all([
          monitorBurnEngineTransfers(fromBlock, latestBlock),
          monitorTokenBurns(fromBlock, latestBlock)
        ]);

        lastProcessedBlock = latestBlock;
      }

      await new Promise(resolve => setTimeout(resolve, CONFIG.POLLING_INTERVAL));
    } catch (error) {
      console.error(`${CONFIG.ERROR_PREFIX}in event monitoring:`, error);
      await notifyError(`Event monitoring error: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, CONFIG.ERROR_RETRY_INTERVAL));
    }
  }
}

// Function to get random empty balance message
function getRandomEmptyBalanceMessage() {
  const randomIndex = Math.floor(Math.random() * CONFIG.EMPTY_BALANCE_MESSAGES.length);
  return CONFIG.EMPTY_BALANCE_MESSAGES[randomIndex];
}

// Update periodicStatusUpdate to handle empty balance
async function periodicStatusUpdate() {
  try {
    await fetchVerseUsdRate();
    const burnEngineBalanceWei = await verseTokenContract.methods
      .balanceOf(CONFIG.BURN_ENGINE_ADDRESS)
      .call();
    const currentBalance = burnEngineBalanceWei.toString();
    const balanceEth = Number(web3.utils.fromWei(burnEngineBalanceWei, "ether"));
    
    let message;
    
    if (balanceEth === 0) {
      // If balance is 0, use a random educational/promotional message
      message = getRandomEmptyBalanceMessage() + '\n\n' +
        `${CONFIG.EMOJIS.GLOBE} Learn more about VERSE Burns: https://verse.bitcoin.com/burn/`;
    } else {
      // Regular status message for non-zero balance
      const formattedBalance = balanceEth.toLocaleString("en-US", CONFIG.NUMBER_FORMAT);
      const formattedUsdBalance = (balanceEth * verseUsdRate).toLocaleString("en-US", CONFIG.NUMBER_FORMAT);

      message = 
        `${CONFIG.EMOJIS.CHART} Burn Engine Status Update:\n` +
        `${CONFIG.EMOJIS.FIRE} Current Balance: ${formattedBalance} VERSE (~$${formattedUsdBalance} USD)\n` +
        CONFIG.BURN_ENGINE_PROMPT + '\n\n' +
        `${CONFIG.EMOJIS.GLOBE} Learn more about VERSE Burns: https://verse.bitcoin.com/burn/`;
    }

    // Always post to Twitter in real-time
    await postTweet(message);

    // Check if we should send Telegram notification
    const now = Date.now();
    const shouldNotifyTelegram = 
      (now - lastTelegramNotificationTime >= ONE_DAY_MS) && // More than 24 hours since last notification
      (currentBalance !== lastReportedTelegramBalance); // Balance has changed

    if (shouldNotifyTelegram) {
      await handleTelegramPost(message);
      // Update Telegram tracking variables
      lastTelegramNotificationTime = now;
      lastReportedTelegramBalance = currentBalance;
    }

  } catch (error) {
    console.error(`${CONFIG.ERROR_PREFIX}in periodic status update:`, error);
    await notifyError(`Periodic status update error: ${error.message}`);
  }
}

// Now this setInterval call will work
setInterval(periodicStatusUpdate, CONFIG.STATUS_UPDATE_INTERVAL);

// Set up periodic USD rate updates
setInterval(fetchVerseUsdRate, CONFIG.USD_RATE_UPDATE_INTERVAL);

// Randomly select a burn message
function getRandomBurnMessage() {
  const randomIndex = Math.floor(Math.random() * CONFIG.BURN_MESSAGES.length);
  return CONFIG.BURN_MESSAGES[randomIndex];
}

// Update handleTransferToBurn to use proper message broadcasting
const handleTransferToBurn = async (event) => {
  // Only process if the transfer is to the null address (burn)
  if (event.returnValues.to === CONFIG.NULL_ADDRESS) {
    try {
      await fetchVerseUsdRate();
      const amountWei = event.returnValues.value;
      const amountEth = web3.utils.fromWei(amountWei, "ether");
      const formattedMessage = formatAmount(amountEth);
      const etherscanUrl = `${CONFIG.ETHERSCAN_BASE_URL}${event.transactionHash}`;

      // Get burn engine balance for context
      const burnEngineBalanceWei = await verseTokenContract.methods
        .balanceOf(CONFIG.BURN_ENGINE_ADDRESS)
        .call();
      const burnEngineBalanceEth = Number(web3.utils.fromWei(burnEngineBalanceWei, "ether"));
      const formattedBurnEngineBalance = formatAmount(burnEngineBalanceEth);

      const message = 
        `${CONFIG.EMOJIS.FIRE}${CONFIG.EMOJIS.EXPLOSION} $VERSE Burn Detected: ${formattedMessage}\n` +
        `${CONFIG.EMOJIS.FIRE} Burn Engine Balance: ${formattedBurnEngineBalance}\n\n` +
        `${getRandomBurnMessage()}\n\n` +
        `View on Etherscan: ${etherscanUrl}\n\n` +
        `${CONFIG.EMOJIS.GLOBE} Learn more about VERSE Burns: https://verse.bitcoin.com/burn/`;

      // Post to all social media channels
      await Promise.all([
        handleTelegramPost(message),
        postTweet(message),
        // Add other social media handlers as needed:
        // handleDiscordPost(message),
        // handleSlackPost(message),
        // handleFacebookPost(message)
      ]).catch(error => {
        console.error(`${CONFIG.ERROR_PREFIX}broadcasting burn message:`, error);
        notifyError(`Error broadcasting burn message: ${error.message}`);
      });

    } catch (error) {
      console.error(`${CONFIG.ERROR_PREFIX}handling burn event:`, error);
      await notifyError(`Error handling burn event: ${error.message}`);
    }
  }
};

// Monitor burns (transfers to null address)
async function monitorTokenBurns(fromBlock, toBlock) {
  try {
    // Convert block numbers to hex to prevent quantity errors
    const fromBlockHex = '0x' + fromBlock.toString(16);
    const toBlockHex = '0x' + toBlock.toString(16);

    const events = await verseTokenContract.getPastEvents('Transfer', {
      fromBlock: fromBlockHex,
      toBlock: toBlockHex,
      filter: { to: CONFIG.NULL_ADDRESS }
    });

    for (const event of events) {
      await handleTransferToBurn(event);
    }
  } catch (error) {
    console.error(`${CONFIG.ERROR_PREFIX}monitoring burns:`, error);
    await notifyError(`Error monitoring burns: ${error.message}`);
  }
}

// Function to fetch last five burns
async function fetchLastFiveBurns() {
  try {
    // Get current block number
    const latestBlock = await web3.eth.getBlockNumber();
    // Look back ~1 month (about 200,000 blocks)
    const lookbackBlocks = 200000;
    const fromBlock = Math.max(CONFIG.START_BLOCK, latestBlock - lookbackBlocks);

    // Convert block numbers to hex
    const fromBlockHex = '0x' + fromBlock.toString(16);
    const latestBlockHex = '0x' + latestBlock.toString(16);

    console.log(`Fetching burns from block ${fromBlock} to ${latestBlock}`); // Debug log

    const events = await verseTokenContract.getPastEvents('Transfer', {
      fromBlock: fromBlockHex,
      toBlock: latestBlockHex,
      filter: { to: CONFIG.NULL_ADDRESS }
    });

    const lastFiveBurns = events.slice(-5).reverse();
    if (lastFiveBurns.length === 0) {
      return "🔥 *No burns found in the last month.*\n\nTry the /totalverseburned command to see all-time burn statistics.";
    }

    await fetchVerseUsdRate(); // Fetch rate once for all burns

    let message = "🔥 *Last 5 VERSE Burns:*\n\n";
    for (const event of lastFiveBurns) {
      const amountWei = event.returnValues.value;
      const amountEth = Number(web3.utils.fromWei(amountWei, "ether"));
      const formattedVerse = amountEth.toLocaleString("en-US", CONFIG.NUMBER_FORMAT);
      const formattedUsd = (amountEth * verseUsdRate).toLocaleString("en-US", CONFIG.NUMBER_FORMAT);
      const txHash = event.transactionHash;
      
      // Add block number and date if available
      const block = await web3.eth.getBlock(event.blockNumber);
      const date = block ? new Date(block.timestamp * 1000).toLocaleString() : 'Unknown date';
      
      message += `${CONFIG.EMOJIS.FIRE} ${formattedVerse} VERSE (~$${formattedUsd} USD)\n`;
      message += `Date: ${date}\n`;
      message += `${CONFIG.ETHERSCAN_BASE_URL}${txHash}\n\n`;
    }
    
    // Add burn page link at the end
    message += `\n${CONFIG.EMOJIS.GLOBE} Learn more about VERSE Burns: https://verse.bitcoin.com/burn/`;
    return message;
  } catch (error) {
    console.error("Error fetching burns:", error);
    throw new Error("Failed to fetch recent burns. Please try again later.");
  }
}

// Function to fetch engine balance
async function fetchEngineBalance() {
  try {
    await fetchVerseUsdRate();
    const burnEngineBalanceWei = await verseTokenContract.methods
      .balanceOf(CONFIG.BURN_ENGINE_ADDRESS)
      .call();
    const balanceEth = Number(web3.utils.fromWei(burnEngineBalanceWei, "ether"));
    
    const formattedBalance = balanceEth.toLocaleString("en-US", CONFIG.NUMBER_FORMAT);
    const formattedUsdBalance = (balanceEth * verseUsdRate).toLocaleString("en-US", CONFIG.NUMBER_FORMAT);

    return `${CONFIG.EMOJIS.FIRE} *Current Burn Engine Balance:*\n${formattedBalance} VERSE (~$${formattedUsdBalance} USD)`;
  } catch (error) {
    console.error("Error fetching engine balance:", error);
    throw new Error("Failed to fetch burn engine balance");
  }
}

// Function to handle total VERSE burned command
async function handleTotalVerseBurnedCommand(includePercentage = true) {
  try {
    // Fetch USD rate first
    await fetchVerseUsdRate();
    
    // Get all Transfer events to the null address (burns)
    const events = await verseTokenContract.getPastEvents('Transfer', {
      fromBlock: CONFIG.START_BLOCK,
      toBlock: 'latest',
      filter: { to: CONFIG.NULL_ADDRESS }
    });
    
    // Sum up all transfers to null address
    const totalBurnedWei = events.reduce((total, event) => {
      return total.add(web3.utils.toBN(event.returnValues.value));
    }, web3.utils.toBN(0));

    const totalBurnedEth = Number(web3.utils.fromWei(totalBurnedWei.toString(), "ether"));
    const formattedVerse = totalBurnedEth.toLocaleString("en-US", CONFIG.NUMBER_FORMAT);
    const formattedUsd = (totalBurnedEth * verseUsdRate).toLocaleString("en-US", CONFIG.NUMBER_FORMAT);
    
    let message = `${CONFIG.EMOJIS.FIRE} *Total VERSE Burned:*\n${formattedVerse} VERSE (~$${formattedUsd} USD)`;
    
    if (includePercentage) {
      const circulatingSupply = await fetchCirculatingSupply();
      if (circulatingSupply) {
        const burnPercentage = (totalBurnedEth / CONFIG.TOTAL_SUPPLY) * 100;
        message += `\n\n${CONFIG.EMOJIS.CHART} *Burn Statistics:*`;
        message += `\nPercentage of Total Supply: ${burnPercentage.toFixed(4)}%`;
      }
    }
    
    message += `\n\n${CONFIG.EMOJIS.GLOBE} Learn more about VERSE Burns: https://verse.bitcoin.com/burn/`;
    
    return message;
  } catch (error) {
    console.error("Error fetching total burned:", error);
    throw new Error("Failed to fetch total burned VERSE");
  }
}

// Initialize Telegram commands
setupTelegramCommands({
  fetchLastFiveBurns,
  fetchEngineBalance,
  handleTotalVerseBurnedCommand,
  notifyError
});
