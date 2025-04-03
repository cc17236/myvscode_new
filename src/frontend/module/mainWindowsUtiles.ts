/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow, session, ipcMain, type IpcMainEvent } from 'electron';
import { FileAccess } from '../../vs/base/common/network.js';
import { ILogService } from '../../vs/platform/log/common/log.js';
import { CodeApplication } from '../../vs/code/electron-main/app.js';

// 明确定义窗口变量类型
let desktopWindow: BrowserWindow | null = null;

/**
 * 创建桌面窗口的函数
 */
let logService: ILogService | null = null;
export const createDesktopWindow = (): void => {

	logService = CodeApplication.getLogService();
	logService.info('aaa' + FileAccess.asFileUri('frontend/preload/desktopWindow.js').fsPath);
	// 显示错误对话框（类型安全调用）
	// console.log("sssss" + FileAccess.asFileUri('frontend/preload/desktopWindow.js').fsPath);

	// 创建浏览器窗口（添加详细类型注解）
	desktopWindow = new BrowserWindow({
		width: 1200,
		height: 800,
		fullscreen: false,
		webPreferences: {
			preload: FileAccess.asFileUri('frontend/preload/desktopWindow.js').fsPath,
			// 安全配置推荐（需配合预加载脚本修改）
			nodeIntegration: false,        // 禁用Node集成
			contextIsolation: true,        // 必须开启上下文隔离
			sandbox: true,                 // 启用沙盒保护
			webSecurity: true              // 保持Web安全策略
		},
	});
	// 类型安全地处理窗口操作
	try {
		desktopWindow.webContents.on('before-input-event', (_, input) => {
			if (input.control && input.key.toLowerCase() === 'r') {
				desktopWindow?.webContents.reloadIgnoringCache();
			}

		});
		// 允许所有导航
		desktopWindow.webContents.on('will-navigate', (event, url) => {
			logService?.info(url);
			event.preventDefault();
			desktopWindow!.loadURL(url); // 允许加载任意 URL
		});
		logService.info('ddd');
		setupIPC();
		// desktopWindow?.webContents?.reloadIgnoringCache();
		desktopWindow.loadURL("http://work.lowcode.hzbtest:81/aop-h5/#/aop_enddesign/layouthome/list");


		// 添加窗口关闭处理
		desktopWindow.on('closed', () => {
			desktopWindow = null;
		});
	} catch (error) {
		console.error('窗口初始化失败:', error instanceof Error ? error.message : String(error));
	}
	desktopWindow.webContents.openDevTools();
};


// 定义登录数据的类型接口
interface LoginData {
	operNo: string;
	token: string;
}

// 定义 IPC 通信的类型安全接口
interface IPCChannels {
	'login': (event: IpcMainEvent, data: LoginData) => void;
}

const setupIPC = (): void => {
	// 使用类型断言确保事件通道匹配
	ipcMain.on('login' as keyof IPCChannels, handleLogin as any);
};


//登录前端返回数据
const handleLogin = async (
	event: IpcMainEvent,
	loginData: LoginData
): Promise<void> => {
	logService?.info('aaa' + loginData.operNo + "///" + loginData.token);
};

// 添加窗口管理函数
export const getDesktopWindow = (): BrowserWindow | null => desktopWindow;

// 添加类型安全的窗口配置接口
interface WindowConfig {
	width: number;
	height: number;
	fullscreen: boolean;
	webPreferences: {
		preload: string;
		nodeIntegration: boolean;
		contextIsolation: boolean;
	};
}
