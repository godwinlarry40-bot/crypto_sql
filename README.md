## Dependencies Overview

This project relies on a set of Node.js packages that provide core functionality such as routing, security, database integration, validation, and real-time communication. The table below briefly describes the primary purpose of each dependency.
 console.log("--- Starting Deposit Process ---");
| Package | Purpose |
|---------|---------|
| @socket.io/redis-adapter | Enables Socket.IO scaling across multiple servers using Redis |
| axios | Performs HTTP requests to external APIs or internal services |
| bcryptjs | Hashes and verifies passwords securely for user authentication |
| compression | Compresses HTTP responses to improve performance |
| cors | Controls cross-origin access to the API |
| crypto-js | Provides cryptographic utilities for encryption and hashing |
| dotenv | Loads environment variables from .env configuration files |
| express | Web framework used to build the server and REST APIs |
| express-rate-limit | Restricts repeated requests to protect against abuse and DDoS |
| helmet | Adds security headers to enhance HTTP protection |
| joi | Validates incoming request data to enforce data integrity |
| jsonwebtoken | Generates and verifies JWT tokens for secure authentication |
| moment | Handles time formatting and date manipulation |
| morgan | Logs HTTP requests for monitoring and troubleshooting |
| multer | Handles file upload operations such as images and documents |
| mysql2 | MySQL database driver used for direct queries or Sequelize |
| node-cache | Provides in-memory caching for frequently used data |
| node-cron | Schedules recurring tasks (e.g., cleanups, emails, jobs) |
| nodemailer | Sends transactional or automated emails from the application |
| qrcode | Generates QR codes (commonly used for 2FA or encoded links) |
| redis | Connects to Redis for caching, session handling, or event streaming |
| sequelize | ORM that manages SQL databases using JavaScript models |
| socket.io | Enables real-time communication between server and clients |
| speakeasy | Generates and verifies one-time passwords for 2FA |
| uuid | Generates unique identifiers for users, transactions, or resources |
| winston | Customizable logging framework to store and manage logs |
| winston-daily-rotate-file | Rotates log files daily when using Winston logging |
