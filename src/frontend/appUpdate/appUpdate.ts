/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { app, utilityProcess, BrowserWindow } from 'electron';
import path from 'node:path';
import crypto from 'crypto';
import fse from 'fs-extra';
import fs from 'fs';
import axios, { CancelTokenSource } from 'axios';
import os from 'os';
import { execFile, exec, spawn, ChildProcess } from 'child_process';
import { Transform, TransformCallback } from 'stream';
import { getOSUpdateType, parseTime } from '../modules/utilities.js';
import { getDesktopWindow, createUpdateWindow } from '../modules/mainWindowsUtiles.js';
import log from 'electron-log';
import { fileURLToPath } from 'url';
// 类型声明
export interface UpdateData {
	versionNo?: string;
	updateFlag?: string;
	subnetFlag?: string;
	forcedFlag?: string;
	fileUrl?: string;
	fileMd5?: string;
	speed?: number;
}

interface UpdateZipState {
	[key: string]: any; // 根据实际情况补充具体类型
}

interface Message {
	type: 'unzip-complete' | 'unzip-error' | 'log';
	data?: any;
}

// 路径常量
const resourcesPath: string = process.resourcesPath;
const updateAppFoldPath: string = path.join(app.getAppPath(), '../updateApp');
const updateExePath: string = path.join(app.getAppPath(), '../update.exe');
const update32ExePath: string = path.join(app.getAppPath(), '../update32.exe');
const appRoot: string = path.join(app.getAppPath(), '../');

// 状态变量
let appUpdateZipPath: string;
export let updateData: UpdateData = {};
let lastDownloadData: UpdateData = {};
let updateZipStateData: UpdateZipState = {};
let restartUpdate: boolean = false;
let isDownloading: boolean = false;
let currentDownloadStream: Transform | null = null;
let currentWriteStream: fs.WriteStream | null = null;
let lastLoggedTime: number = 0;
const logInterval: number = 1500;
let cancelPreviousRequest: (reason?: string) => void;
let readyUpdate: boolean = false;



// 更新信息处理
export async function getUpdateInfoSuccess(data: UpdateData): Promise<void> {
	restartUpdate = false;
	readyUpdate = false;
	updateData = data;
	log.info('更新日志:更新data' + JSON.stringify(updateData));
	appUpdateZipPath = path.join(app.getAppPath(), `../${updateData?.versionNo}.zip`);
	if (updateData?.updateFlag === 'true') {
		await deleteZipFilesAndExecute(appRoot);
	}
}

// 文件操作函数
async function deleteZipFilesAndExecute(folderPath: string): Promise<void> {
	try {
		const files = await fse.readdir(folderPath);
		const zipFiles = files.filter((file: string) => {
			const fullPath = path.resolve(folderPath, file);
			return path.extname(file) === '.zip' && fullPath !== appUpdateZipPath;
		});

		for (const file of zipFiles) {
			const filePath = path.join(folderPath, file);
			await fse.remove(filePath);
			log.info(`已删除文件: ${file}`);
		}
	} catch (err) {
		log.info('删除zip操作失败:' + err);
	} finally {
		handleDownloadAndExtract();
	}
}

// 下载处理函数
function handleDownloadAndExtract(): void {
	if (!fse.existsSync(appUpdateZipPath)) {
		log.info("`zipNotExist`" + appUpdateZipPath);
		downloadFile();
	} else {
		log.info("`zipExist`" + appUpdateZipPath);
		compareAndextractFile();
	}
}

// 下载核心逻辑
async function downloadFile(): Promise<void> {
	const filePath: string = appUpdateZipPath;
	const tempName: string = `app_${updateData?.versionNo}.part`;
	const tempFilePath: string = path.join(appRoot, tempName);

	if (isDownloading) {
		try {
			currentDownloadStream?.destroy();
			currentWriteStream?.destroy();
		} catch (error) {
			log.info('终止旧任务下载出现错误:' + error);
		}
	}

	lastDownloadData = updateData;
	isDownloading = true;

	try {
		const cancelToken = axios.CancelToken.source();
		cancelPreviousRequest = cancelToken.cancel;

		let start: number = 0;
		if (fs.existsSync(tempFilePath)) {
			start = fs.statSync(tempFilePath).size;
			const respHead = await axios.head(updateData.fileUrl!);
			const fileSize = parseInt(respHead.headers['content-length'], 10);

			if (fileSize && start > fileSize) {
				await fse.remove(tempFilePath);
				start = 0;
			}
		}

		const response = await axios({
			method: 'get',
			url: updateData.fileUrl,
			headers: { 'Range': `bytes=${start}-` },
			responseType: 'stream',
			cancelToken: cancelToken.token
		});

		const writer = fs.createWriteStream(tempFilePath, { flags: 'a' });
		currentWriteStream = writer;

		const totalSize: number = parseInt(response.headers['content-length'], 10) + start;
		let downloadedSize: number = start;
		const speed: number = updateData?.speed ? updateData.speed * 1024 : 0.6 * 1024 * 1024;
		const throttleStream: Transform = throttleDownload(speed);

		currentDownloadStream = throttleStream;
		response.data.pipe(throttleStream).pipe(writer);

		throttleStream.on('data', (chunk: Buffer) => {
			downloadedSize += chunk.length;
			const now = Date.now();
			if (now - lastLoggedTime >= logInterval) {
				lastLoggedTime = now;
				// 更新下载进度逻辑
			}
		});

		writer.on('finish', () => {
			isDownloading = false;
			log.info('更新日志：下载升级包app.zip完成');
			fse.renameSync(tempFilePath, filePath);
			deletePartFilesInCurrentDir(appRoot);
			compareAndextractFile();
		});

	} catch (error) {
		isDownloading = false;
		log.info('File download error:' + error);
		await fse.remove(tempFilePath).catch(() => { });
	}
}

// MD5校验逻辑
function compareAndextractFile(): void {
	if (fse.existsSync(appUpdateZipPath)) {
		getFileMD5(appUpdateZipPath)
			.then((md5: string) => {
				if (md5 === updateData.fileMd5) {
					log.info('更新日志：MD5校验成功');
					// updateZipStateData.downloadStatus = DOWNLOAD_SUCCESS
					// updateZipStateData.downloadStatusDesc = "校验成功"
					// updateZipState(updateZipStateData)
					//备份到share文件夹
					// if (isDownloadFull == "false") {
					//   fse.copy(appUpdateZipPath, path.join(app.getAppPath(), `../share/${updateData?.versionNo}-part.zip`))
					// } else {
					fse.copy(appUpdateZipPath, path.join(app.getAppPath(), `../share/${updateData?.versionNo}.zip`));

					//解压app.zip
					if (fse.existsSync(updateAppFoldPath)) {
						fse.removeSync(updateAppFoldPath);
						extractZip();
					} else {
						extractZip();
					}
					// showUpdateWindow();
					//   getAsarFileMD5AndCompare();
				} else {
					// 处理MD5不匹配
				}
			})
			.catch(log.error);
	}
}

// MD5 计算函数
export function getFileMD5(filePath: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const hash = crypto.createHash('md5');
		const stream = fs.createReadStream(filePath);

		// 修复：确保传递给 hash.update 的参数始终是 Buffer 类型
		stream.on('data', (chunk: string | Buffer) => {
			if (typeof chunk === 'string') {
				hash.update(Buffer.from(chunk));
			} else {
				hash.update(chunk);
			}
		});

		stream.on('end', () => resolve(hash.digest('hex')));
		stream.on('error', (err: Error) => reject(err));
	});
}
// ASAR 文件校验
//   function getAsarFileMD5AndCompare(): void {
// 	const osType = getOSUpdateType();
// 	const command = osType === "windows"
// 	  ? `CertUtil -hashfile "${updateAsarPath}" MD5`
// 	  : `md5sum ${updateAsarPath}`;

// 	exec(command, (error, stdout, stderr) => {
// 	  if (error) {
// 		log.error(`执行MD5命令失败: ${error.message}`);
// 		extractZip();
// 		return;
// 	  }

// 	  try {
// 		const md5 = osType === "windows"
// 		  ? stdout.split('\n')[1]?.trim().replace(/\s+/g, '') || ''
// 		  : stdout.split(' ')[0]?.trim() || '';

// 		log.info(`ASAR文件MD5值: ${md5}`);

// 		if (md5 === updateData.asarMd5) {
// 		  handleFileVerification();
// 		} else {
// 		  log.warn('MD5校验失败，开始解压');
// 		  extractZip();
// 		}
// 	  } catch (err) {
// 		log.error('MD5解析失败:', err);
// 		extractZip();
// 	  }
// 	});
//   }
export async function runupdate(): Promise<void> {
	try {
		restartUpdate = true;
		if (os.platform() === 'win32') {
			app.quit();
		} else if (os.platform() === 'linux') {

		}
	} catch (error) {
		log.error(`runUpdate error: ${error}`);
	}

}

export function execExeFile() {
	try {
		if (readyUpdate && updateData?.updateFlag === 'true' && os.platform() === 'win32') {
			//console.log(`execExeFile restartUpdate ${restartUpdate}`)
			log.info(`更新日志:execExeFile restartUpdate ${restartUpdate}`);
			windowAddUpdate(restartUpdate);
		}
	} catch (error) {
		log.error(`更新日志:execExeFile error ${error}`);
		//console.log(`error: ${error}`);
	}
}

// 文件验证后处理
function handleFileVerification(): void {
	// if (process.platform === 'win32') {
	//   if (fse.existsSync(updateExePath) && fse.existsSync(update32ExePath)) {
	// 	handleAfterExtract();
	//   } else {
	// 	extractZip();
	//   }
	// } else {
	//   handleAfterExtract();
	// }
}

// 解压处理
function extractZip(): void {
	// 获取当前文件的 __dirname
	const __dirname = path.dirname(fileURLToPath(import.meta.url));
	const upPath = path.join(__dirname, 'downloadWorker.js');
	const childProcess = utilityProcess.fork(upPath);

	childProcess.on('spawn', () => {
		log.info(`开始解压 ${appUpdateZipPath} 到 ${path.dirname(appUpdateZipPath)}`);
		childProcess.postMessage({
			type: 'start-unzip',
			zipFilePath: appUpdateZipPath,
			outputDir: path.dirname(appUpdateZipPath)
		});
	});

	childProcess.on('message', (message: Message) => {
		switch (message.type) {
			case 'unzip-complete':
				log.info('解压成功');
				showUpdateWindow();
				break;
			case 'unzip-error':
				log.error(`解压失败: ${message.data}`);
				break;
			default:
				log.info(`进程日志: ${message.data}`);
		}
	});

	childProcess.on('exit', (code: number) => {
		log.info(`子进程退出，代码: ${code}`);
	});
}

// 显示更新窗口
function showUpdateWindow(): void {
	readyUpdate = true;
	log.info('更新日志：创建更新弹框');
	createUpdateWindow();
}

// 限速流处理
function throttleDownload(speedLimit: number): Transform {
	let bytesPassed = 0;
	const startTime = Date.now();

	return new Transform({
		transform(chunk: Buffer, encoding: string, callback: TransformCallback) {
			bytesPassed += chunk.length;
			const elapsed = (Date.now() - startTime) / 1000;
			const expectedTime = bytesPassed / speedLimit;

			if (expectedTime > elapsed) {
				setTimeout(() => callback(null, chunk), (expectedTime - elapsed) * 1000);
			} else {
				callback(null, chunk);
			}
		}
	});
}

export function windowAddUpdate(restartUpdate: boolean): void {
	const logDir: string = path.dirname(log.transports.file.getFile().path);
	const now: Date = new Date();
	const dateString: string = parseTime(now, '{y}-{m}-{d}');
	const logPath: string = path.join(logDir, `log-${dateString}.log`);
	try {
		const arch: string = os.arch();
		log.info('更新日志: 开始执行 updateExe =====');

		const spawnUpdate = (exePath: string, args: string[]): void => {
			if (fse.existsSync(exePath) && fse.existsSync(updateAppFoldPath)) {
				const child: ChildProcess = spawn(exePath, args, {
					detached: true,
					stdio: 'ignore'
				});
				child.unref();
			}
		};

		if (arch === 'x64') {
			if (!restartUpdate) {
				log.info('更新日志: 开始执行 updateExeNotstart =====');
				spawnUpdate(updateExePath, ['', logPath]);
			} else {
				spawnUpdate(updateExePath, ['start', logPath]);
			}
		} else if (arch === 'ia32') {
			if (!restartUpdate) {
				log.info('更新日志: 开始执行 updateExeNotstart =====');
				spawnUpdate(update32ExePath, ['', logPath]);
			} else {
				spawnUpdate(update32ExePath, ['start', logPath]);
			}
		}
	} catch (error) {
		log.error(`windowAddUpdate 错误: ${error instanceof Error ? error.message : String(error)}`);
	}
}
export async function deletePartFilesInCurrentDir(dir: string): Promise<void> {
	try {
		const files = await fs.promises.readdir(dir);

		await Promise.all(
			files.map(async (file) => {
				const filePath = path.join(dir, file);
				try {
					const stats = await fs.promises.lstat(filePath);

					if (stats.isFile() && file.endsWith('.part')) {
						await fs.promises.unlink(filePath);
						log.info(`已删除 .part 文件: ${filePath}`);
					}
				} catch (err) {
					log.error(`处理文件 ${filePath} 时出错:`, err);
				}
			})
		);
	} catch (err) {
		log.error(`无法读取目录 ${dir}:`, err);
	}
}
