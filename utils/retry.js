// New file for retry logic
const retryRequest = async (asyncFunc, maxRetries = 3, initialDelay = 1000) => {
  for (let retries = 0; retries < maxRetries; retries++) {
    try {
      return await asyncFunc();
    } catch (error) {
      if (retries === maxRetries - 1) throw error;
      
      const delay = initialDelay * Math.pow(2, retries);
      console.warn(`Request failed. Retrying in ${delay}ms...`, error);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

module.exports = { retryRequest }; 