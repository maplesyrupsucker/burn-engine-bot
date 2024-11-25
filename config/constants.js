require('dotenv').config();

const CONFIG = {
  // Addresses
  VERSE_TOKEN_ADDRESS: "0x249cA82617eC3DfB2589c4c17ab7EC9765350a18",
  BURN_ENGINE_ADDRESS: "0x6b2a57dE29e6d73650Cb17b7710F2702b1F73CB8",
  NULL_ADDRESS: "0x0000000000000000000000000000000000000000",

  // Blockchain Settings
  START_BLOCK: 16129240, // Block when Verse token was created
  TOTAL_SUPPLY: 210e9, // 210 billion VERSE

  // Network & API Settings
  INFURA_URL: process.env.INFURA_URL,
  VERSE_PRICE_API: "https://markets.api.bitcoin.com/rates/convertor/?q=USD&c=VERSE",
  CIRCULATING_SUPPLY_API: "https://markets.api.bitcoin.com/coin/data/circulating?c=VERSE",
  ETHERSCAN_BASE_URL: "https://etherscan.io/tx/",

  // Time Intervals (in milliseconds)
  POLLING_INTERVAL: 30000, // 30 seconds
  ERROR_RETRY_INTERVAL: 60000, // 1 minute
  USD_RATE_UPDATE_INTERVAL: 3600000, // 1 hour
  STATUS_UPDATE_INTERVAL: 43200000, // 12 hours

  // Retry Settings
  MAX_RETRIES: 3,
  INITIAL_RETRY_DELAY: 1000, // 1 second

  // Number Formatting
  NUMBER_FORMAT: {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  },

  // URLs
  BURN_PAGE_URL: "https://verse.bitcoin.com/burn",

  // Social Media Settings
  TELEGRAM_CHANNELS: ["general", "verse-burns"],
  DISCORD_CHANNELS: ["general", "verse"],
  SLACK_CHANNELS: ["#verse-burns"],

  // Message Templates
  BURN_ENGINE_PROMPT: "🚀 Ignite the $Verse Burn Engine with 10,000 $VERSE at https://verse.bitcoin.com/burn and set all $VERSE ablaze!",
  ERROR_PREFIX: "🚨 Error: ",
  
  // Emojis
  EMOJIS: {
    FIRE: "🔥",
    ROCKET: "🚀",
    EXPLOSION: "💥",
    CHART: "📊",
    GLOBE: "🌐",
    ASTRONAUT: "👨‍🚀",
    ERROR: "🚨"
  },

  // Burn Messages Array
  BURN_MESSAGES: [
    "🔥 $VERSE is ablaze with another burn!",
    "💥 The burn engine roars with $VERSE energy!",
    "🚀 $VERSE just got hotter with this burn!",
    "🔥 Feel the heat? That's another $VERSE burn!",
    "💥 Boom! Another batch of $VERSE bites the dust!",
    "🚀 Blazing through $VERSE with another fiery burn!",
    "🔥 The $VERSE furnace is burning bright!",
    "💥 A scorching $VERSE burn just took place!",
    "🚀 Rockets ignited! $VERSE is burning up!",
    "🔥 $VERSE just fueled the flames of the burn engine!",
    "💥 $VERSE inferno! Another burn executed!",
    "🚀 Blast off! $VERSE burn is a go!",
    "🔥 $VERSE incineration in progress!",
    "💥 Sizzling hot! $VERSE burn achieved!",
    "🚀 Up in flames! Another $VERSE burn completed!",
    "🔥 The $VERSE pyre blazes once more!",
    "💥 Feel the burn! $VERSE is at it again!",
    "🚀 $VERSE burn-off: Spectacular and fiery!",
    "🔥 Turning up the heat with $VERSE!",
    "💥 Flare-up detected in the $VERSE burn engine!",
    "🚀 Another $VERSE combustion, brilliantly done!",
    "🔥 $VERSE is sizzling away in the burn chamber!",
    "💥 Sparking a $VERSE blaze with this burn!",
    "🚀 The $VERSE flame dances with another burn!",
    "🔥 $VERSE burn: a fiery spectacle!"
  ],
};

module.exports = CONFIG; 