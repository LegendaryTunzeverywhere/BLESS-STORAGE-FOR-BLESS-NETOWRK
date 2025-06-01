# HTTP Proxy Services

This directory contains various service modules used by the HTTP proxy. These services encapsulate specific business logic or external integrations, such as interacting with IPFS, handling WASM modules, or managing cache.

## Usage

- **Business Logic**: Implements core functionalities of the proxy.
- **External Integrations**: Handles communication with external systems or APIs.

## Properties

- **cacheCleaner.js**: Service for managing and cleaning cached data.
- **rust.wasm**: WebAssembly module, likely compiled from Rust, for high-performance operations.
- **wasm_handler.js**: JavaScript wrapper or handler for interacting with the WebAssembly module.
