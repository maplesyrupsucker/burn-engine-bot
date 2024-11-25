require("dotenv").config();
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

let verseUsdRate = 0;
let lastProcessedBlock = 0;
let lastKnownBalanceEth = 0;

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
  return `${formattedVerse} $VERSE (~$${usdValue.toFixed(CONFIG.NUMBER_FORMAT.maximumFractionDigits)} USD)`;
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

async function handleTransfer(event) {
  try {
    await fetchVerseUsdRate();
    const valueWei = event.returnValues.value;
    const valueEth = Number(web3.utils.fromWei(valueWei, "ether"));

    const burnEngineBalanceWei = await verseTokenContract.methods
      .balanceOf(CONFIG.BURN_ENGINE_ADDRESS)
      .call();
    lastKnownBalanceEth = Number(
      web3.utils.fromWei(burnEngineBalanceWei, "ether")
    );

    const formattedValueEth = valueEth.toLocaleString("en-US", CONFIG.NUMBER_FORMAT);
    const formattedLastKnownBalanceEth = lastKnownBalanceEth.toLocaleString("en-US", CONFIG.NUMBER_FORMAT);
    const formattedUsdValueEth = (valueEth * verseUsdRate).toLocaleString("en-US", CONFIG.NUMBER_FORMAT);
    const formattedUsdLastKnownBalanceEth = (lastKnownBalanceEth * verseUsdRate).toLocaleString("en-US", CONFIG.NUMBER_FORMAT);

    const depositMessage =
      `${CONFIG.EMOJIS.ROCKET} $Verse Burn Engine Deposit Detected: ${formattedValueEth} VERSE (~$${formattedUsdValueEth} USD)\n` +
      `${CONFIG.EMOJIS.FIRE} Current Burn Engine Balance: ${formattedLastKnownBalanceEth} VERSE (~$${formattedUsdLastKnownBalanceEth} USD)\n` +
      CONFIG.BURN_ENGINE_PROMPT;

    await postTweet(depositMessage);
    await postUpdate(depositMessage);
  } catch (error) {
    console.error(`${CONFIG.ERROR_PREFIX}handling transfer event: ${error}`);
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

// Add this function before the setInterval call
async function periodicStatusUpdate() {
  try {
    await fetchVerseUsdRate();
    const burnEngineBalanceWei = await verseTokenContract.methods
      .balanceOf(CONFIG.BURN_ENGINE_ADDRESS)
      .call();
    const balanceEth = Number(web3.utils.fromWei(burnEngineBalanceWei, "ether"));
    
    const formattedBalance = balanceEth.toLocaleString("en-US", CONFIG.NUMBER_FORMAT);
    const formattedUsdBalance = (balanceEth * verseUsdRate).toLocaleString("en-US", CONFIG.NUMBER_FORMAT);

    const statusMessage = 
      `${CONFIG.EMOJIS.CHART} Burn Engine Status Update:\n` +
      `${CONFIG.EMOJIS.FIRE} Current Balance: ${formattedBalance} VERSE (~$${formattedUsdBalance} USD)\n` +
      CONFIG.BURN_ENGINE_PROMPT;

    await postTweet(statusMessage);
    await handleTelegramPost(statusMessage);
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

// Update handleTokensBurned to use the burn messages
const handleTokensBurned = async (event) => {
  await fetchVerseUsdRate();
  const amountWei = event.returnValues.amount;
  const amountEth = web3.utils.fromWei(amountWei, "ether");
  const formattedMessage = formatAmount(amountEth);
  const etherscanUrl = `${CONFIG.ETHERSCAN_BASE_URL}${event.transactionHash}`;

  const message = `${CONFIG.EMOJIS.FIRE}${CONFIG.EMOJIS.EXPLOSION} $VERSE Burn Detected: ${formattedMessage}\n\n${getRandomBurnMessage()}\n\nView on Etherscan: ${etherscanUrl}`;
  await postUpdate(message);
  await postUpdate(await getTotalBurnedResponse());
};
