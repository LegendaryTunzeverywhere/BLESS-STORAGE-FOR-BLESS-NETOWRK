// middleware/auth.js
import { ethers } from "ethers";

export function verifyEvmSignature(expectedMessage) {
  return async (req, res, next) => {
    const address = req.headers["x-evm-address"];
    const signature = req.headers["x-evm-signature"];
    const message = req.headers["x-evm-message"];

    if (!address || !signature || !message) {
      return res.status(401).json({ error: "Missing authentication headers" });
    }

    if (message !== expectedMessage) {
      return res.status(401).json({ error: "Invalid signed message" });
    }

    try {
      const recovered = ethers.verifyMessage(message, signature);
      if (recovered.toLowerCase() !== address.toLowerCase()) {
        return res.status(401).json({ error: "Invalid signature" });
      }
      next();
    } catch (err) {
      return res.status(401).json({ error: "Signature verification failed" });
    }
  };
}
