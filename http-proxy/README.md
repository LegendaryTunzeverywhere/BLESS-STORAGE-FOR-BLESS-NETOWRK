# Secure Storage Proxy Server

This server acts as a powerful and secure gateway for managing your digital files. It combines robust security features with advanced functionalities like AI-powered analysis and text-to-speech generation, making it an ideal solution for decentralized and intelligent file storage.

## Key Features:

### 🔒 **Secure & Decentralized File Storage**
Your files are securely uploaded and stored on the InterPlanetary File System (IPFS) via Pinata, ensuring decentralization and immutability. Crucially, the direct links (CIDs) to your files on IPFS are encrypted, adding an extra layer of security.

### ✨ **Authenticated Access**
Every interaction with your files – from uploading to accessing or deleting – requires a verified EVM (Ethereum Virtual Machine) signature. This means only you, with your digital wallet, can manage your data, ensuring unparalleled control and security.

### 📂 **Comprehensive File Management**
- **Upload**: Easily upload your files to IPFS.
- **List**: View all your active files.
- **Soft Delete & Restore**: Mark files as "deleted" without permanently removing them, and restore them later if needed.
- **Empty Recycle Bin**: Permanently remove soft-deleted file references from your metadata.

### 🚀 **Secure File Streaming**
Access your stored files with confidence. The server generates temporary, secure access tokens, allowing you to stream your content directly from IPFS gateways while maintaining strict control over who can view your data.

### 🧠 **AI-Powered File Analysis**
Leverage the power of Google Gemini 1.5 Flash! This server can analyze the content of your text-based files (like documents, code, or data files) and provide insightful summaries. Quickly grasp the essence of your files without opening them.

### 🗣️ **Text-to-Speech (TTS) Generation**
Transform text into natural-sounding audio using ElevenLabs integration. Generate audio versions of your documents or notes, making your content more accessible and versatile.

### 🛡️ **Enhanced Security**
The server is built with security in mind, utilizing `helmet` to implement various HTTP security headers and robust CORS configurations to protect against common web vulnerabilities.

## Why Use This Server?

This server is perfect for developers and users who need a secure, intelligent, and decentralized way to manage their digital assets. Whether you're building a dApp that requires secure file handling, or simply want a more private and feature-rich storage solution, this proxy server provides the tools you need with a focus on security and user control.
