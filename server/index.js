import { readConfig } from './config.js';
import { openDatabase } from './database.js';
import { createApp } from './app.js';
const config = readConfig();
const db = openDatabase(config.databasePath);
const server = createApp({config,db}).listen(config.port,'localhost',() => console.log(`IVAN Base Drive: ${config.baseUrl}\nQuản trị: ${config.baseUrl}/admin`));
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,() => server.close(() => {db.close();process.exit(0);}));