/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import http from 'http';
import os from 'os';
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import log from 'electron-log';
// import fse from 'fs-extra';
import fs from 'fs';
import url from 'url';
import { Transform, type TransformCallback } from 'stream';

import {
	setServerPort,
	setServerIP
} from '../modules/globalState.js';


type ServerInfo = {
	server: http.Server | null;
	activeDownloads: number;
	maxConnectNumber: number;
	FILE_DIRECTORY: string;
}

let server: http.Server | null = null;

interface StartServerParams {
	port: number;
	attempts: number;
}

interface ThrottleStream extends Transform {
	_transform: (chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback) => void;
}

export const createServer = () => {
	const getLocalIpAddress = (): string => {
		const interfaces = os.networkInterfaces();
		for (const interfaceName in interfaces) {
			const addresses = interfaces[interfaceName];
			if (addresses) {
				for (const iface of addresses) {
					if (iface.family === 'IPv4' && !iface.internal) {
						return iface.address;
					}
				}
			}
		}
		return '127.0.0.1';
	};

	const startServer = (port: number, attempts: number): void => {
		server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
			const parsedUrl = url.parse(req.url!, true);
			const urlPath = decodeURIComponent(parsedUrl.pathname!);

			if (req.method === 'POST' && req.url === '/paypulse/mpss/notifyTodo') {

			} else if (req.method === 'POST' && req.url === '/paypulse/notifyVersionUpdate') {
				// ... (类似处理)
			} else if (urlPath.startsWith('/download/')) {
				// ... (类似处理，添加类型断言)
			} else if (req.method === 'POST' && req.url === '/paypulse/executeTask') {
				// ... (类似处理)
			} else {
				res.writeHead(404, { 'Content-Type': 'text/plain' });
				res.end('Not Found');
			}
		});

		server.listen(port, () => {
			const IPAddr = getLocalIpAddress();
			log.info(`服务成功启动，监听端口 http://${IPAddr}:${port}`);
			setServerIP(IPAddr);
			setServerPort(port.toString());
		});

		server.on('error', (err: NodeJS.ErrnoException) => {
			if (err.code === 'EADDRINUSE' && attempts > 0) {
				startServer(port + 1, attempts - 1);
			} else {
				log.error(`服务启动失败：${err}`);
				// webosLoginForMcmc(null, {}, 'fail');
			}
		});
	};

	startServer(9020, 200);
};

export const closeServer = (): void => {
	if (server) {
		server.close(() => {
			log.info('paypulse退出关闭服务');
		});
	}
};

const createThrottleStream = (speed: number): Transform => {
	let totalSent = 0;
	return new Transform({
		transform(chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback) {
			totalSent += chunk.length;
			const delay = totalSent / speed;
			setTimeout(() => {
				this.push(chunk);
				callback();
			}, delay);
		}
	});
};
