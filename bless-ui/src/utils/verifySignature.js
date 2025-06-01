const { ethers } = require("ethers");

/**
 * Verifies an Ethereum signature
 * @param {string} account - User wallet address
 * @param {string} message - Original message signed
 * @param {string} signature - Signature to verify
 */
export async function verifySignature(account, signature, message) {
  try {
    const recovered = ethers.utils.verifyMessage(message, signature);
    return recovered.toLowerCase() === account.toLowerCase();
  } catch {
    return false;
  }
}

module.exports = verifySignature;
