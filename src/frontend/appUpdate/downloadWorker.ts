/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// 类型声明扩展

// 使用别名导入 extract-zip 模块
import extractZipModule from 'extract-zip';
import log from 'electron-log';


declare global {
	namespace NodeJS {
		interface Process {
			/** Electron 进程通信扩展 */
			parentPort: Electron.ParentPort;
			/** 禁用 ASAR 解析 */
			noAsar: boolean;
		}
	}
}

// 进程消息类型
interface ProcessMessage {
	data?: {
		type: 'start-unzip';
		zipFilePath: string;
		outputDir: string;
	};
}



// 解压函数
async function extractZip(zipFilePath: string, outputDir: string): Promise<void> {
	return new Promise((resolve, reject) => {
		// 发送日志消息
		process.parentPort.postMessage({
			type: 'unzip-log',
			data: `ZIP文件准备就绪: ${zipFilePath}`
		});

		// 设置禁用 ASAR 状态
		const originalNoAsar = process.noAsar; // 保存原始状态
		process.noAsar = true; // 设置为 true

		extractZipModule(zipFilePath, { dir: outputDir }) // 调用 extractZip 模块方法
			.then(() => {
				process.noAsar = originalNoAsar; // 恢复原始状态
				resolve();
			})
			.catch((error: Error) => {
				process.noAsar = originalNoAsar; // 恢复原始状态
				reject(`解压 ZIP 文件时出错: ${error.message}`);
			});
	});
}

// 监听进程消息
process.parentPort.on('message', async (message: ProcessMessage | unknown) => {
	// 类型保护：确保 message 是 ProcessMessage 类型
	if (
		typeof message === 'object' &&
		message !== null &&
		'data' in message &&
		typeof message.data === 'object' &&
		message.data !== null &&
		'type' in message.data &&
		message.data.type === 'start-unzip'
	) {
		const processMessage = message as ProcessMessage;
		try {
			log.info('==接收到消息=======' + JSON.stringify(processMessage));

			// 检查 data 是否存在，避免解构时出现 undefined
			if (!processMessage.data) {
				throw new Error('Missing data in process message');
			}

			const { zipFilePath, outputDir } = processMessage.data;

			await extractZip(zipFilePath, outputDir)
				.then(() => {
					process.parentPort.postMessage({ type: 'unzip-complete' });
				})
				.catch((error: Error) => {
					process.parentPort.postMessage({
						type: 'unzip-error',
						data: error.message
					});
				});
		} catch (error) {
			log.error('Received error:', error);
			// const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			// console.error('Fatal error:', errorMessage);
			process.exit(1);
		}
	} else {
		log.info('Received invalid message:' + JSON.stringify(message));
	}
});
