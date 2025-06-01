# Rust Backend Storage Modules

This directory contains Rust modules responsible for interacting with various storage mechanisms, particularly IPFS (InterPlanetary File System). These modules abstract the details of storage operations, providing a clean interface for the rest of the backend.

## Usage

- **IPFS Interaction**: Handles direct communication with IPFS for file storage and retrieval.
- **Storage Abstraction**: Provides a consistent API for different storage backends.

## Properties

- **ipfs_cli.rs**: Module for interacting with IPFS via command-line interface.
- **ipfs_http.rs**: Module for interacting with IPFS via HTTP API.
- **mod.rs**: Rust module declaration file.
