import { readConfig } from './config.js';
import { openDatabase } from './database.js';
import { createApp } from './app.js';
const config = readConfig();
const db = openDatabase(config.databasePath);
const server = createApp({config,db}).listen(config.port,'127.0.0.1',() => console.log(`IVAN Base Drive: ${config.baseUrl}\nQuản trị: ${config.baseUrl}/admin\nChỉ lắng nghe 127.0.0.1. Nhấn Ctrl+C để tắt.`));
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'Cổng đã bị ứng dụng khác sử dụng.':`Không khởi động được server (${error.code||'UNKNOWN'}).`);db.close();process.exitCode=1;});
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,() => server.close(() => {db.close();process.exit(0);}));
