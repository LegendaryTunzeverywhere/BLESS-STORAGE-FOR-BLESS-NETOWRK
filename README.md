# Secure Storage Project

This project is a decentralized secure storage and file management system, featuring a web-based user interface, a robust backend, an HTTP proxy for specialized functionalities, and a Rust-based IPFS integration for decentralized storage.

# TAKE A LOOK: [BLESS STORAGE](https://gold-penguin-cristine-6kloqztm.bls.dev/)

## Features

*   **Decentralized File Storage**: Utilizes IPFS for secure and decentralized storage of files.
*   **Web-based User Interface**: A user-friendly interface for managing and interacting with stored files.
*   **File Management**: Capabilities for uploading, viewing, and organizing files.
*   **Text-to-Speech Playback**: Integrated functionality for playing text as speech.
*   **Secure Operations**: Likely includes mechanisms for secure data handling and verification (e.g., `verifySignature.js`).

## Project Structure

The project is composed of several interconnected components, each residing in its own directory:

*   **`bless_storage_node/`**:
    This directory contains the core backend logic and configuration for the secure storage node. It's likely a Node.js/TypeScript application that orchestrates interactions between the UI, proxy, and the Rust backend.
    *   `index.ts`: Main entry point for the Node.js application.
    *   `package.json`: Defines project metadata and dependencies.
    *   `bls.toml`, `bls.assets.json`: Configuration files specific to the `bless` system.

*   **`bless_storage_node/bless-ui/`**:
    This is the frontend application, built with React, providing the user interface for the secure storage system.
    *   `public/`: Contains static assets like `index.html`, `favicon.ico`, `manifest.json`.
    *   `src/`: Source code for the React application.
        *   `App.js`, `index.js`: Main application components and entry points.
        *   `layout/MainLayout.js`: Defines the overall layout of the application.
        *   `pages/`: Contains individual page components such as `Home.js`, `FileExplorer.js`, `FileCard.js`, `TextToSpeechPlayer.js`.
        *   `pages/storageService.js`: Likely handles client-side interactions with the storage backend.
        *   `utils/verifySignature.js`: Utility for cryptographic signature verification.

*   **`bless_storage_node/http-proxy/`**:
    An HTTP proxy server responsible for handling specific requests, potentially including audio streaming, WebAssembly execution, and caching.
    *   `server.js`: The main server file for the proxy.
    *   `routes/audio.js`: Handles audio-related routes.
    *   `middleware/auth.js`: Authentication middleware for proxy requests.
    *   `services/rust.wasm`, `services/wasm_handler.js`: Suggests WebAssembly integration, possibly for performance-critical operations or specific cryptographic tasks.
    *   `services/cacheCleaner.js`: Manages caching mechanisms.

*   **`bless_storage_node/rust-backend/`**:
    A Rust-based backend component, primarily responsible for interacting with IPFS for decentralized storage.
    *   `Cargo.toml`, `Cargo.lock`: Rust project manifest and lock file.
    *   `src/main.rs`, `src/bless.rs`: Main Rust application logic.
    *   `src/storage/`: Contains modules for IPFS interaction.
        *   `ipfs_cli.rs`: IPFS command-line interface integration.
        *   `ipfs_http.rs`: IPFS HTTP API integration.

## Technologies Used

*   **Node.js**: For the core backend and HTTP proxy.
*   **TypeScript**: For type-safe JavaScript development in the main backend.
*   **React**: For building the interactive user interface.
*   **Rust**: For high-performance backend operations, especially IPFS integration.
*   **IPFS (InterPlanetary File System)**: For decentralized and secure file storage.
*   **WebAssembly (WASM)**: Potentially used within the HTTP proxy for performance-critical tasks.

## Setup and Installation

To set up and run this project, you will need Node.js (which includes npm) and Rust installed on your system.

1.  **Clone the repository**:
    ```bash
    git clone [repository_url]
    cd secure-storage
    ```

2.  **Install Node.js dependencies**:
    Navigate into each Node.js project directory and install dependencies.

    ```bash
    cd bless_storage_node
    npm install
    cd ../bless_storage_node/bless-ui
    npm install
    cd ../../bless_storage_node/http-proxy
    npm install
    cd ../../
    ```

3.  **Build Rust backend**:
    Navigate to the Rust backend directory and build the project.

    ```bash
    cd bless_storage_node/rust-backend
    cargo build --release
    cd ../../
    ```
    *Note: You may need to configure IPFS daemon separately if it's not already running or integrated within the Rust application.*

## Usage

To run the different components of the application:

1.  **Start the Rust Backend (if applicable as a standalone service)**:
    ```bash
    cd bless_storage_node/rust-backend
    cargo run --release
    ```
    (This might be integrated into the Node.js backend or proxy, so check specific project documentation if available.)

2.  **Start the HTTP Proxy**:
    ```bash
    cd bless_storage_node/http-proxy
    node server.js
    ```

3.  **Start the Core Node.js Backend**:
    ```bash
    cd bless_storage_node
    npm start # or node index.ts if compiled
    ```

4.  **Start the React Frontend**:
    ```bash
    cd bless_storage_node/bless-ui
    npm start
    ```
    This will typically open the frontend application in your browser at `http://localhost:3000` (or another port as configured).

Ensure all necessary environment variables (e.g., in `.env` files) are configured correctly for each component.
