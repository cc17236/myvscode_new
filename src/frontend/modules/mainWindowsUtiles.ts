/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow, session, ipcMain, type IpcMainEvent, app, Event, screen } from 'electron';
import { FileAccess } from '../../vs/base/common/network.js';
import { setOperNo, setSSOTokenState, getServerIP, getServerPort, setBaseURL } from './globalState.js';
import path from 'path';
import fs from 'fs';
import log from 'electron-log';
import { getUpdateInfo, openClient, closeClient } from '../appUpdate/updateUtils.js';

import { createServer, closeServer } from '../server/http.js';
import { runupdate, execExeFile } from '../appUpdate/appUpdate.js';
import { CodeApplication } from '../../vs/code/electron-main/app.js';

let desktopWindow: BrowserWindow | null = null;
let updateWindow: BrowserWindow | null = null;
let mCodeApp: CodeApplication | null = null;
let isQuitting: boolean = false;
const env_test: boolean = true;

interface IPCChannels {
	'login': (event: IpcMainEvent, data: LoginData) => void;
}
interface LogFile {
	path: string;
}
interface LoginData {
	operNo: string;
	token: string;
}

interface NullData {
}

export const createDesktopWindow = (codeApp: CodeApplication): void => {
	mCodeApp = codeApp;
	createServer();
	if (env_test) {
		setBaseURL('http://158.1.82.97:9203');
	} else {
		setBaseURL('http://158.1.82.97:9203');
	}
	// 获取主显示器的可用区域（排除系统任务栏）
	const primaryDisplay = screen.getPrimaryDisplay();
	const { width, height } = primaryDisplay.workArea; // workArea 是正确的属性
	const { x, y } = primaryDisplay.bounds; // 使用 bounds 替代 workAreaOrigin

	// 创建无边框窗口
	desktopWindow = new BrowserWindow({
		x,
		y,
		width,
		height,
		fullscreen: false,
		webPreferences: {
			// 必要的 web 预加载配置
			preload: FileAccess.asFileUri('frontend/preload/desktopWindow.js').fsPath,
			nodeIntegration: false,
			contextIsolation: true,
			sandbox: true,
			webSecurity: true
		}
	});

	// desktopWindow = new BrowserWindow({
	// 	width: 1200,
	// 	height: 800,
	// 	webPreferences: {
	// 		preload: FileAccess.asFileUri('frontend/preload/desktopWindow.js').fsPath,
	// 		nodeIntegration: false,
	// 		contextIsolation: true,
	// 		sandbox: true,
	// 		webSecurity: true
	// 	},
	// });
	try {
		desktopWindow.webContents.on('before-input-event', (_, input) => {
			if (input.control && input.key.toLowerCase() === 'r') {
				desktopWindow?.webContents.reloadIgnoringCache();
			}

		});
		// 允许所有导航
		desktopWindow.webContents.on('will-navigate', (event, url) => {

			event.preventDefault();
			desktopWindow!.loadURL(url); // 允许加载任意 URL
		});
		setupIPC();
		// desktopWindow?.webContents?.reloadIgnoringCache();
		// desktopWindow.loadURL("http://work.lowcode.hzbtest:8900/aop-h5/#/aop_enddesign/layouthome/list");

		// desktopWindow.loadFile(FileAccess.asFileUri('frontend/windows/updateWindow').fsPath);
		// 获取当前文件的 __dirname
		// const __filename = fileURLToPath(import.meta.url);
		// const __dirname = dirname(__filename);

		// console.log(__dirname); // 现在可以正常使用
		// desktopWindow.loadURL(`file://${path.join(__dirname, '../windows/updateWindows/index.html')}`);

		// desktopWindow.loadFile(path.join(__dirname, '../windows/updateWindows/index.html'));
		desktopWindow.loadURL(FileAccess.asBrowserUri(`frontend/windows/updateWindow/index.html`).toString(true));
		// desktopWindow.maximize();
		// 处理显示变化
		screen.on('display-metrics-changed', () => {
			const newDisplay = screen.getPrimaryDisplay();
			desktopWindow?.setBounds(newDisplay.workArea);
		})
		// desktopWindow.loadURL();
		// 添加窗口关闭处理
		desktopWindow.on('closed', () => {
			desktopWindow = null;
		});
		openClient();
	} catch (error) {
		console.error('窗口初始化失败:', error instanceof Error ? error.message : String(error));
	}
	// desktopWindow.webContents.openDevTools();

	app.on('before-quit', async (event: Event) => {
		if (!isQuitting) {
			closeClient();
			log.info(`before-quit isQuitting ${isQuitting}`);
			event.preventDefault();
			isQuitting = true;
		} else {
			log.info(`before-quit isQuitting ${isQuitting}`);
		}
	});

	app.on('quit', () => {
		log.info(`app quit`);
		execExeFile();
	});
};

export const createUpdateWindow = (): void => {

	updateWindow = new BrowserWindow({
		width: 400,
		height: 150,
		fullscreen: false,
		frame: false,
		resizable: false,
		movable: false,
		parent: desktopWindow as BrowserWindow,
		webPreferences: {
			preload: FileAccess.asFileUri('frontend/preload/desktopWindow.js').fsPath,
			nodeIntegration: false,
			contextIsolation: true,
			sandbox: true,
			webSecurity: true
		},
	});
	try {
		updateWindow.loadURL(FileAccess.asBrowserUri(`frontend/windows/updateWindow/index.html`).toString(true));
		// 添加窗口关闭处理
		updateWindow.on('closed', () => {
			updateWindow = null;
		});
	} catch (error) {
		console.error('窗口初始化失败:', error instanceof Error ? error.message : String(error));
	}
};




// 配置日志文件
try {
	// 获取类型安全的 transports.file
	const fileTransport = log.transports.file as log.FileTransport;

	// 自定义日志路径生成函数
	fileTransport.resolvePath = (variables) => {
		const date = new Date();
		const dateString = [
			date.getFullYear(),
			(date.getMonth() + 1).toString().padStart(2, '0'),
			date.getDate().toString().padStart(2, '0')
		].join('-');

		// 生成形如：/path/to/logs/MyApp-2023-10-01.log
		return path.join(
			app.getPath('userData'),
			'logs',
			`log-${dateString}.log`
		);
	};

	const logDir = path.dirname(log.transports.file.getFile().path);

	// 确保日志目录存在
	if (!fs.existsSync(logDir)) {
		fs.mkdirSync(logDir, { recursive: true });
	}

	//   删除多余的默认日志文件（例如 main.log）
	const defaultLogFile = path.join(logDir, 'main.log');
	if (fs.existsSync(defaultLogFile)) {
		fs.unlinkSync(defaultLogFile);
	}

	// 设置日志文件大小
	const MAX_LOG_SIZE: number = 10 * 1024 * 1024; // 10MB
	// 保留7天
	const MAX_LOG_DATE: number = 7;
	// old文件只保留4个，一天的日志保留5个
	const MAX_OLD_FILES_NUM: number = 4;
	log.transports.file.maxSize = MAX_LOG_SIZE;


	log.transports.file.archiveLog = (oldLogFile: LogFile) => {
		const currentLogDir = path.dirname(oldLogFile.path);
		const extname = path.extname(oldLogFile.path);
		const basename = path.basename(oldLogFile.path, extname);

		// 删除最旧的日志文件
		const oldestLogPath = path.join(currentLogDir, `${basename}.old.${MAX_OLD_FILES_NUM - 1}${extname}`);
		if (fs.existsSync(oldestLogPath)) {
			fs.unlinkSync(oldestLogPath);
		}

		// 移动现有的 .old 文件
		for (let i = MAX_OLD_FILES_NUM - 2; i >= 0; i--) {
			const oldPath = path.join(currentLogDir, `${basename}.old.${i}${extname}`);
			const newPath = path.join(currentLogDir, `${basename}.old.${i + 1}${extname}`);
			if (fs.existsSync(oldPath)) {
				fs.renameSync(oldPath, newPath);
			}
		}

		// 重命名当前日志文件
		fs.renameSync(oldLogFile.path, path.join(currentLogDir, `${basename}.old.0${extname}`));
	};

	// 清理过期的日志文件
	const cleanUpOldLogs = (keepDay: number): void => {
		const files: string[] = fs.readdirSync(logDir);
		const now: Date = new Date();

		files.forEach(file => {
			const filePath = path.join(logDir, file);
			const fileStats: fs.Stats = fs.statSync(filePath);
			const fileDate: Date = new Date(fileStats.mtime);
			const ageInDays: number = (now.getTime() - fileDate.getTime()) / (1000 * 60 * 60 * 24);

			if (ageInDays > keepDay) {
				fs.unlinkSync(filePath);
			}
		});
	};

	// 应用启动时清理旧日志
	cleanUpOldLogs(MAX_LOG_DATE);
} catch (err) {
	log.error('日志配置报错', err as Error);
}
const setupIPC = (): void => {
	ipcMain.on('login' as keyof IPCChannels, handleLogin as any);
	ipcMain.on('update-now' as keyof IPCChannels, handleUpdate as any);
};


//登录前端返回数据
const handleLogin = async (
	event: IpcMainEvent,
	loginData: LoginData
): Promise<void> => {
	setOperNo(loginData?.operNo);
	setSSOTokenState(loginData?.token);
	log?.info('登录返回：' + loginData.operNo + '///' + loginData.token);
	//请求更新
	getUpdateInfo();
};

//立即重启更新
const handleUpdate = async (
	event: IpcMainEvent,
	nullData: NullData
): Promise<void> => {
	log.info('========立即重启更新');
	// runupdate();
	await mCodeApp?.startup(true);

};

// 添加窗口管理函数
export const getDesktopWindow = (): BrowserWindow | null => desktopWindow;
