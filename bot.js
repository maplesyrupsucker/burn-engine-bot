require("dotenv").config();
const Web3 = require("web3");
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const chatIds = process.env.TELEGRAM_CHAT_IDS.split(",");
const flamethrowerGifUrl =
  "https://media.giphy.com/media/B0yHMGZZLbBxS/giphy.gif";
const engineGifUrl =
  "https://i.imgflip.com/8ef4jd.gif";

// 100% FREE public RPC providers - no Infura needed
const RPC_PROVIDERS = [
  "https://eth.llamarpc.com",
  "https://rpc.ankr.com/eth",
  "https://ethereum.publicnode.com",
  "https://1rpc.io/eth",
  "https://eth.drpc.org",
  "https://rpc.builder0x69.io",
];
let currentRpcIndex = 0;
let failedProviders = new Set(); // Track temporarily failed providers

// Get next working RPC provider (round-robin with failover)
const getNextRpcProvider = () => {
  const startIndex = currentRpcIndex;
  do {
    currentRpcIndex = (currentRpcIndex + 1) % RPC_PROVIDERS.length;
    const provider = RPC_PROVIDERS[currentRpcIndex];
    if (!failedProviders.has(provider)) {
      return provider;
    }
  } while (currentRpcIndex !== startIndex);
  
  // All providers failed - reset and try again
  console.log("All RPC providers failed, resetting...");
  failedProviders.clear();
  return RPC_PROVIDERS[0];
};

// Mark provider as failed (will be retried after cooldown)
const markProviderFailed = (provider) => {
  failedProviders.add(provider);
  console.log(`Marked RPC provider as failed: ${provider.substring(0, 30)}...`);
  // Reset failed status after 5 minutes
  setTimeout(() => {
    failedProviders.delete(provider);
    console.log(`RPC provider back in rotation: ${provider.substring(0, 30)}...`);
  }, 5 * 60 * 1000);
};

// Create web3 instance with current provider
const createWeb3 = () => {
  const provider = getNextRpcProvider();
  console.log(`Using RPC provider: ${provider.substring(0, 30)}...`);
  return { web3: new Web3(new Web3.providers.HttpProvider(provider)), provider };
};

// Primary web3 instance (uses free public RPC)
let { web3, provider: currentProvider } = createWeb3();
const bot = new TelegramBot(botToken, { polling: true });

// Create web3 instance with rotated provider for queries
const getRotatedWeb3 = () => {
  return createWeb3().web3;
};

// Execute RPC call with automatic failover
const withFailover = async (fn, maxRetries = 3) => {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      console.error(`RPC call failed (attempt ${i + 1}/${maxRetries}): ${e.message}`);
      markProviderFailed(currentProvider);
      const newInstance = createWeb3();
      web3 = newInstance.web3;
      currentProvider = newInstance.provider;
    }
  }
  throw lastError;
};

const verseTokenAddress = "0x249cA82617eC3DfB2589c4c17ab7EC9765350a18";
const burnEngineAddress = "0x6b2a57dE29e6d73650Cb17b7710F2702b1F73CB8";
const burnEngineStartBlock = 18481385; // Block when burn engine went live
const verseTokenStartBlock = 16129240; // Block when Verse token was created
const verseTokenABI = require("./VerseTokenABI.json");
const burnEngineABI = require("./BurnEngineABI.json");

const verseTokenContract = new web3.eth.Contract(
  verseTokenABI,
  verseTokenAddress
);
const burnEngineContract = new web3.eth.Contract(
  burnEngineABI,
  burnEngineAddress
);

let lastKnownBalanceEth = 0;
let verseUsdRate = 0;
let lastProcessedBlock = 0;
let lastBurnEventBlock = 0; // Track when last burn happened for cache invalidation

// Cache configuration (in milliseconds)
// Extended TTLs - burns are rare events, historical data changes slowly
const CACHE_TTL = {
  USD_RATE: 10 * 60 * 1000,       // 10 minutes
  TOTAL_BURNED: 4 * 60 * 60 * 1000,   // 4 hours (invalidated on new burn)
  LAST_BURNS: 4 * 60 * 60 * 1000,     // 4 hours (invalidated on new burn)
  CIRCULATING: 2 * 60 * 60 * 1000,    // 2 hours
};

// Polling interval (in milliseconds)
// Burns are rare - checking every 5 minutes is plenty
const POLL_INTERVAL = 5 * 60 * 1000;  // 5 minutes
const ERROR_RETRY_INTERVAL = 10 * 60 * 1000; // 10 minutes on error

// Cache storage
const cache = {
  usdRate: { value: 0, timestamp: 0 },
  totalBurned: { value: null, timestamp: 0 },
  totalVerseBurned: { value: null, timestamp: 0 },
  lastBurns: { value: null, timestamp: 0 },
  circulatingSupply: { value: null, timestamp: 0 },
};

const isCacheValid = (cacheEntry, ttl) => {
  return cacheEntry.timestamp > 0 && (Date.now() - cacheEntry.timestamp) < ttl;
};

// Invalidate burn-related caches when new burn is detected
const invalidateBurnCaches = () => {
  cache.totalBurned.timestamp = 0;
  cache.totalVerseBurned.timestamp = 0;
  cache.lastBurns.timestamp = 0;
  console.log("Burn caches invalidated due to new burn event");
};

const fetchVerseUsdRate = async (forceRefresh = false) => {
  // Return cached value if still valid
  if (!forceRefresh && isCacheValid(cache.usdRate, CACHE_TTL.USD_RATE)) {
    verseUsdRate = cache.usdRate.value;
    return;
  }

  try {
    const response = await axios.get(
      "https://markets.api.bitcoin.com/rates/convertor/?q=USD&c=VERSE"
    );
    verseUsdRate = response.data.USD.rate;
    cache.usdRate = { value: verseUsdRate, timestamp: Date.now() };
  } catch (e) {
    console.error(`Error fetching USD rate: ${e.message}`);
    // Use stale cache if available
    if (cache.usdRate.value > 0) {
      verseUsdRate = cache.usdRate.value;
    }
  }
};

const formatAmount = (verseAmount) => {
  const formattedVerse = parseFloat(verseAmount).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
  const usdValue = verseAmount * verseUsdRate;
  const formattedUsd = usdValue.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
  return `${formattedVerse} VERSE (~$${formattedUsd} USD)`;
};

const initialize = async () => {
  try {
    console.log("🚀 Burn Engine Bot starting (100% free RPCs, no Infura)...");
    console.log(`📊 Polling interval: ${POLL_INTERVAL / 1000}s, Cache TTL: ${CACHE_TTL.TOTAL_BURNED / 3600000}h`);
    
    const balanceWei = await withFailover(() => 
      verseTokenContract.methods.balanceOf(burnEngineAddress).call()
    );
    lastKnownBalanceEth = web3.utils.fromWei(balanceWei, "ether");
    console.log(`Initial Burn Engine Balance: ${lastKnownBalanceEth} VERSE`);
    await fetchVerseUsdRate();

    lastProcessedBlock = await withFailover(() => web3.eth.getBlockNumber());
    console.log(`Starting event monitoring from block: ${lastProcessedBlock}`);
    monitorEvents();
  } catch (e) {
    console.error(`Error during initialization: ${e.message}`);
    console.log(`Retrying initialization in ${ERROR_RETRY_INTERVAL / 1000}s...`);
    setTimeout(initialize, ERROR_RETRY_INTERVAL);
  }
};

const postToTelegram = (message) => {
  chatIds.forEach((chatId) => {
    bot.sendMessage(chatId, message);
  });
};

const postToTelegramWithGIF = (gifUrl) => {
  chatIds.forEach((chatId) => {
    bot.sendDocument(chatId, gifUrl);
  });
};

const handleTransfer = async (event) => {
  // USD rate is pre-fetched in monitorEvents, no need to fetch here
  const valueWei = event.returnValues.value;
  const valueEth = web3.utils.fromWei(valueWei, "ether");
  const formattedMessage = formatAmount(valueEth);

  const currentVerseContract = new web3.eth.Contract(verseTokenABI, verseTokenAddress);
  const burnEngineBalanceWei = await withFailover(() =>
    currentVerseContract.methods.balanceOf(burnEngineAddress).call()
  );
  lastKnownBalanceEth = web3.utils.fromWei(burnEngineBalanceWei, "ether");
  const formattedBalance = formatAmount(lastKnownBalanceEth);

  const message =
    `🚀 Verse Token Deposited into Burn Engine: ${formattedMessage}\n` +
    `🔥 Updated Burn Engine Verse Token Balance: ${formattedBalance}`;
  postToTelegram(message);
};

const handleTokensBurned = async (event) => {
  // USD rate is pre-fetched in monitorEvents, no need to fetch here
  const amountWei = event.returnValues.amount;
  const amountEth = web3.utils.fromWei(amountWei, "ether");
  const formattedMessage = formatAmount(amountEth);

  lastKnownBalanceEth = 0;
  lastBurnEventBlock = event.blockNumber;

  // Invalidate burn-related caches since new data is available
  invalidateBurnCaches();

  const message =
    `🔥💥 Tokens Burned: ${formattedMessage}\n` +
    `The burn engine's flames roar!`;
  postToTelegram(message);
  postToTelegramWithGIF(engineGifUrl);
};

const monitorEvents = async () => {
  while (true) {
    try {
      const latestBlock = await withFailover(() => web3.eth.getBlockNumber());
      const fromBlock =
        lastProcessedBlock > 0 ? lastProcessedBlock + 1 : 18481385;

      if (fromBlock <= latestBlock) {
        // Pre-fetch USD rate once per polling cycle (not per event)
        await fetchVerseUsdRate();

        // Recreate contracts with current web3 instance after potential failover
        const currentVerseContract = new web3.eth.Contract(verseTokenABI, verseTokenAddress);
        const currentBurnContract = new web3.eth.Contract(burnEngineABI, burnEngineAddress);

        const transferEvents = await withFailover(() => 
          currentVerseContract.getPastEvents("Transfer", {
            fromBlock: fromBlock,
            toBlock: "latest",
            filter: { to: burnEngineAddress },
          })
        );

        // Process events sequentially to avoid spamming
        for (const event of transferEvents) {
          await handleTransfer(event);
        }

        const tokensBurnedEvents = await withFailover(() =>
          currentBurnContract.getPastEvents("TokensBurned", {
            fromBlock: fromBlock,
            toBlock: "latest",
          })
        );

        for (const event of tokensBurnedEvents) {
          await handleTokensBurned(event);
        }

        lastProcessedBlock = latestBlock;
        console.log(`✅ Processed up to block ${latestBlock}. Next check in ${POLL_INTERVAL / 60000} min.`);
      } else {
        console.log(`💤 No new blocks. Next check in ${POLL_INTERVAL / 60000} min.`);
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
    } catch (e) {
      console.error(`🚨 Error in event monitoring: ${e.message}`);
      console.log(`Retrying in ${ERROR_RETRY_INTERVAL / 60000} min...`);
      await new Promise((resolve) => setTimeout(resolve, ERROR_RETRY_INTERVAL));
    }
  }
};

const fetchCirculatingSupply = async () => {
  // Return cached value if still valid
  if (isCacheValid(cache.circulatingSupply, CACHE_TTL.CIRCULATING)) {
    return cache.circulatingSupply.value;
  }

  try {
    const response = await axios.get(
      "https://markets.api.bitcoin.com/coin/data/circulating?c=VERSE"
    );
    const circulatingSupply = Number(response.data);
    cache.circulatingSupply = { value: circulatingSupply, timestamp: Date.now() };
    return circulatingSupply;
  } catch (e) {
    console.error(`Error fetching circulating supply: ${e.message}`);
    // Return stale cache if available
    if (cache.circulatingSupply.value !== null) {
      return cache.circulatingSupply.value;
    }
    return null;
  }
};


const fetchLastFiveBurns = async () => {
  try {
    await fetchVerseUsdRate();

    // Return cached response if still valid
    if (isCacheValid(cache.lastBurns, CACHE_TTL.LAST_BURNS)) {
      return cache.lastBurns.value;
    }

    // Use rotated RPC provider for expensive historical query
    const rotatedWeb3 = getRotatedWeb3();
    const rotatedBurnEngine = new rotatedWeb3.eth.Contract(burnEngineABI, burnEngineAddress);

    // Query from burn engine start block
    const events = await rotatedBurnEngine.getPastEvents("TokensBurned", {
      fromBlock: burnEngineStartBlock,
      toBlock: "latest",
    });

    const lastFiveBurns = events.slice(-5).reverse();
    let response = "**🔥 Last 5 Burns**\n\n";
    lastFiveBurns.forEach((event) => {
      const txHash = event.transactionHash;
      const amountWei = event.returnValues.amount;
      const amountEth = web3.utils.fromWei(amountWei, "ether");
      const formattedMessage = formatAmount(amountEth);
      response += `🔥 Amount: ${formattedMessage} - [Etherscan](https://etherscan.io/tx/${txHash})\n\n`;
    });

    cache.lastBurns = { value: response, timestamp: Date.now() };
    return response;
  } catch (e) {
    console.error(`Error fetching last five burns: ${e.message}`);
    // Return stale cache if available
    if (cache.lastBurns.value !== null) {
      return cache.lastBurns.value;
    }
    return "Error fetching last five burns.";
  }
};

const handleTotalBurnedCommand = async () => {
  try {
    await fetchVerseUsdRate();

    // Return cached response if still valid
    if (isCacheValid(cache.totalBurned, CACHE_TTL.TOTAL_BURNED)) {
      // Update USD values in cached data
      const cachedData = cache.totalBurned.value;
      const usdValue = cachedData.totalBurnedEth * verseUsdRate;
      const formattedUsd = usdValue.toLocaleString("en-US", { maximumFractionDigits: 2 });

      let response = "** Total Burned ** \n\n";
      response += `💥 Cumulative Tokens Burned: ${cachedData.formattedTotalBurned} VERSE (~$${formattedUsd} USD)\n\n`;
      response += `🔢 Total Burn Engine Ignitions: ${cachedData.totalBurnEvents}\n\n`;
      response += `📊 % of Total Supply Burned: ${cachedData.totalSupplyBurnedPercent.toFixed(2)}%\n\n`;
      response += `🌐 % of Circulating Supply Burned: ${cachedData.circulatingSupplyBurnedPercent.toFixed(2)}%\n\n`;
      response += `👨‍🚀 Visit [Burn Engine](https://verse.bitcoin.com/burn/) for detailed burn stats`;
      return response;
    }

    const totalSupply = 210e9;
    const circulatingSupply = (await fetchCirculatingSupply()) || totalSupply;

    // Use rotated RPC provider for expensive historical query
    const rotatedWeb3 = getRotatedWeb3();
    const rotatedBurnEngine = new rotatedWeb3.eth.Contract(burnEngineABI, burnEngineAddress);

    const events = await rotatedBurnEngine.getPastEvents("TokensBurned", {
      fromBlock: burnEngineStartBlock,
      toBlock: "latest",
    });

    const totalBurnedWei = events.reduce(
      (sum, event) => sum + BigInt(event.returnValues.amount),
      BigInt(0)
    );
    const totalBurnedEth = parseFloat(web3.utils.fromWei(totalBurnedWei.toString(), "ether"));
    const formattedTotalBurned = totalBurnedEth.toLocaleString("en-US", { maximumFractionDigits: 2 });
    const usdValue = totalBurnedEth * verseUsdRate;
    const formattedUsd = usdValue.toLocaleString("en-US", { maximumFractionDigits: 2 });

    const totalBurnEvents = events.length;
    const totalSupplyBurnedPercent = (totalBurnedEth / totalSupply) * 100;
    const circulatingSupplyBurnedPercent = (totalBurnedEth / circulatingSupply) * 100;

    // Cache the computed values (not the response, so USD can be recalculated)
    cache.totalBurned = {
      value: {
        totalBurnedEth,
        formattedTotalBurned,
        totalBurnEvents,
        totalSupplyBurnedPercent,
        circulatingSupplyBurnedPercent,
      },
      timestamp: Date.now(),
    };

    let response = "** Total Burned ** \n\n";
    response += `💥 Cumulative Tokens Burned: ${formattedTotalBurned} VERSE (~$${formattedUsd} USD)\n\n`;
    response += `🔢 Total Burn Engine Ignitions: ${totalBurnEvents}\n\n`;
    response += `📊 % of Total Supply Burned: ${totalSupplyBurnedPercent.toFixed(2)}%\n\n`;
    response += `🌐 % of Circulating Supply Burned: ${circulatingSupplyBurnedPercent.toFixed(2)}%\n\n`;
    response += `👨‍🚀 Visit [Burn Engine](https://verse.bitcoin.com/burn/) for detailed burn stats`;

    return response;
  } catch (e) {
    console.error(`Error in /totalburned command: ${e.message}`);
    return "Error processing /totalburned command.";
  }
};




const handleTotalVerseBurnedCommand = async () => {
  try {
    await fetchVerseUsdRate();

    // Return cached response if still valid
    if (isCacheValid(cache.totalVerseBurned, CACHE_TTL.TOTAL_BURNED)) {
      const cachedData = cache.totalVerseBurned.value;
      const usdValue = cachedData.totalBurnedEth * verseUsdRate;
      const formattedUsd = usdValue.toLocaleString("en-US", { maximumFractionDigits: 2 });

      let response = "** Total VERSE Burned ** \n\n";
      response += `🔥 Cumulative Verse Tokens Burned: ${cachedData.formattedTotalBurned} VERSE (~$${formattedUsd} USD)\n\n`;
      response += `🔥 Total Burn Events: ${cachedData.totalBurnEvents}\n\n`;
      response += `📊 % of Total Supply Burned: ${cachedData.totalSupplyBurnedPercent.toFixed(4)}%\n\n`;
      response += `🌐 % of Circulating Supply Burned: ${cachedData.circulatingSupplyBurnedPercent.toFixed(4)}% \n\n`;
      response += `👨‍🚀 Visit [Burn Engine](https://verse.bitcoin.com/burn/) for detailed burn stats`;
      return response;
    }

    console.log('Fetching total Verse burned...');

    const nullAddress = "0x0000000000000000000000000000000000000000";
    const totalSupply = 210e9; // 210 billion VERSE
    const circulatingSupply = await fetchCirculatingSupply();

    // Use rotated RPC provider for expensive historical query
    const rotatedWeb3 = getRotatedWeb3();
    const rotatedVerseToken = new rotatedWeb3.eth.Contract(verseTokenABI, verseTokenAddress);

    console.log(`Fetching Transfer events to null address from block ${verseTokenStartBlock}...`);

    const transferEventsToNull = await rotatedVerseToken.getPastEvents("Transfer", {
      fromBlock: verseTokenStartBlock,
      toBlock: "latest",
      filter: { to: nullAddress }
    });

    console.log(`Fetched ${transferEventsToNull.length} Transfer events to null address`);

    const totalBurnedWei = transferEventsToNull.reduce(
      (sum, event) => sum + BigInt(event.returnValues.value),
      BigInt(0)
    );

    const totalBurnedEth = parseFloat(web3.utils.fromWei(totalBurnedWei.toString(), "ether"));
    const formattedTotalBurned = totalBurnedEth.toLocaleString("en-US", { maximumFractionDigits: 2 });
    const usdValue = totalBurnedEth * verseUsdRate;
    const formattedUsd = usdValue.toLocaleString("en-US", { maximumFractionDigits: 2 });

    const totalBurnEvents = transferEventsToNull.length;
    const totalSupplyBurnedPercent = (totalBurnedEth / totalSupply) * 100;
    const circulatingSupplyBurnedPercent = circulatingSupply ? (totalBurnedEth / circulatingSupply) * 100 : 0;

    // Cache the computed values
    cache.totalVerseBurned = {
      value: {
        totalBurnedEth,
        formattedTotalBurned,
        totalBurnEvents,
        totalSupplyBurnedPercent,
        circulatingSupplyBurnedPercent,
      },
      timestamp: Date.now(),
    };

    let response = "** Total VERSE Burned ** \n\n";
    response += `🔥 Cumulative Verse Tokens Burned: ${formattedTotalBurned} VERSE (~$${formattedUsd} USD)\n\n`;
    response += `🔥 Total Burn Events: ${totalBurnEvents}\n\n`;
    response += `📊 % of Total Supply Burned: ${totalSupplyBurnedPercent.toFixed(4)}%\n\n`;
    response += `🌐 % of Circulating Supply Burned: ${circulatingSupplyBurnedPercent.toFixed(4)}% \n\n`;
    response += `👨‍🚀 Visit [Burn Engine](https://verse.bitcoin.com/burn/) for detailed burn stats`;

    return response;
  } catch (e) {
    console.error(`Error in /totalverseburned command: ${e.message}`);
    return "Error processing /totalverseburned command.";
  }
};


bot.onText(/\/totalverseburned/, async (msg) => {
  const chatId = msg.chat.id;
  await postToTelegramWithGIF(chatId, flamethrowerGifUrl); // Post GIF first
  const response = await handleTotalVerseBurnedCommand();
  bot.sendMessage(chatId, response, { parse_mode: "Markdown" });
});


bot.onText(/\/totalburned/, async (msg) => {
  const chatId = msg.chat.id;
  await postToTelegramWithGIF(chatId, flamethrowerGifUrl); // Post GIF first
  const response = await handleTotalBurnedCommand();
  bot.sendMessage(chatId, response, { parse_mode: "Markdown" });
});

bot.onText(/\/burns/, async (msg) => {
  const chatId = msg.chat.id;
  const response = await fetchLastFiveBurns();
  bot.sendMessage(chatId, response, { parse_mode: "Markdown" });
});

bot.onText(/\/enginebalance/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    let response;
    if (lastKnownBalanceEth > 0) {
      await fetchVerseUsdRate();
      const formattedBalance = formatAmount(lastKnownBalanceEth);
      response = `🔥 Current Burn Engine Balance: ${formattedBalance}`;
    } else {
      await fetchVerseUsdRate();
      const currentVerseContract = new web3.eth.Contract(verseTokenABI, verseTokenAddress);
      const balanceWei = await withFailover(() =>
        currentVerseContract.methods.balanceOf(burnEngineAddress).call()
      );
      const balanceEth = web3.utils.fromWei(balanceWei, "ether");
      lastKnownBalanceEth = balanceEth;
      const formattedBalance = formatAmount(balanceEth);
      response = `🔥 Current Burn Engine Balance: ${formattedBalance}`;
    }
    bot.sendMessage(chatId, response);
  } catch (e) {
    console.error(`Error in /enginebalance: ${e.message}`);
    bot.sendMessage(chatId, "Error fetching balance. Please try again.");
  }
});

initialize();
