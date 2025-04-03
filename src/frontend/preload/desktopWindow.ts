/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const { contextBridge, ipcRenderer } = require('electron');
type IpcRendererEvent = import('electron').IpcRendererEvent;

// 类型定义
type OSPlatform = 'linux' | 'windows' | 'other';
type ListenerEntry = {
	originalCallback: (...args: any[]) => void;
	handler: (event: IpcRendererEvent, ...args: any[]) => void;
};

// 操作系统类型映射表
const OSMap: Record<string, OSPlatform> = {
	'linux': 'linux',
	'win32': 'windows',
} as const;

// 获取操作系统类型
const getOSType = (): OSPlatform => {
	return OSMap[process.platform] || 'other';
};

// 监听器存储
const listeners = new Map<string, ListenerEntry>();

// 暴露给渲染进程的 API 接口
interface ElectronAPI {
	openSubAppWindow: (appItem: unknown) => void;
	sendMessage: <T extends unknown[]>(channel: string, ...args: T) => void;
	invoke: <T extends unknown[], R>(channel: string, ...args: T) => Promise<R>;
	onMessage: <T extends unknown[]>(
		channel: string,
		callback: (event: IpcRendererEvent, ...args: T) => void
	) => () => void;
	removeListener: (channel: string) => void;
	getOSType: () => OSPlatform;
	once: <T extends unknown[]>(
		channel: string,
		callback: (event: IpcRendererEvent, ...args: T) => void
	) => void;
}

// 创建符合 ElectronAPI 接口的对象
const electronAPI: ElectronAPI = {
	openSubAppWindow: (appItem: unknown) =>
		ipcRenderer.send('open-new-sub-app-window', appItem),

	sendMessage: <T extends unknown[]>(channel: string, ...args: T) =>
		ipcRenderer.send(channel, ...args),

	invoke: <T extends unknown[], R>(channel: string, ...args: T) =>
		ipcRenderer.invoke(channel, ...args) as Promise<R>,

	onMessage: <T extends unknown[]>(
		channel: string,
		callback: (event: IpcRendererEvent, ...args: T) => void
	): (() => void) => {
		// 清理已存在的监听器
		if (listeners.has(channel)) {
			const oldListener = listeners.get(channel)!;
			ipcRenderer.removeListener(channel, oldListener.handler);
		}

		// 包装处理器（添加错误处理）
		const wrappedHandler = (event: IpcRendererEvent, ...args: T) => {
			try {
				return callback(event, ...args);
			} catch (error) {
				console.error(`onMessage error for channel "${channel}":`, error);
				console.error(`"${channel}" Args:`, args);
			}
		};

		// 存储监听器信息
		listeners.set(channel, {
			originalCallback: callback,
			handler: wrappedHandler,
		});

		// 注册新监听器
		ipcRenderer.on(channel, wrappedHandler);

		// 返回清理函数
		return () => {
			if (listeners.has(channel)) {
				const listener = listeners.get(channel)!;
				ipcRenderer.removeListener(channel, listener.handler);
				listeners.delete(channel);
			}
		};
	},

	removeListener: (channel: string) => {
		if (listeners.has(channel)) {
			const listener = listeners.get(channel)!;
			ipcRenderer.removeListener(channel, listener.handler);
			listeners.delete(channel);
		}
	},

	getOSType: () => getOSType(),

	once: <T extends unknown[]>(
		channel: string,
		callback: (event: IpcRendererEvent, ...args: T) => void
	) => {
		ipcRenderer.once(channel, (event, ...args) =>
			callback(event, ...(args as T))
		);
	},
};

// 暴露给渲染进程
contextBridge.exposeInMainWorld('electronAPI', electronAPI);
