/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { BrowserWindow } from 'electron';

// 定义全局状态类型
interface GlobalState {
	baseUrl:string;
  serverIP: string;
  serverPort: string;
  ssoToken: string;
  operNo: string;
  desktopWindow: BrowserWindow | null;
}

// 初始化全局状态
const state: GlobalState = {
	baseUrl:'http://158.1.82.97:9203',
  serverIP: '',
  serverPort: '',
  ssoToken: '',
  operNo: '',
  desktopWindow: null
};

// 导出状态访问器
export const getServerIP = (): string => state.serverIP || '';
export const getServerPort = (): string => state.serverPort || '';
export const getBaseUrl = (): string => state.baseUrl || '';
export const getSSOTokenState = (): string => state.ssoToken || '';
export const getOperNo = (): string => state.operNo || '';
export const getDesktopWindow = (): BrowserWindow | null => state.desktopWindow;

// 导出状态更新器
export const setServerIP = (data: string): void => {
  state.serverIP = data;
};

export const setServerPort = (data: string): void => {
  state.serverPort = data;
};
export const setBaseURL = (data: string): void => {
  state.baseUrl = data;
};

export const setSSOTokenState = (token: string): void => {
  state.ssoToken = token;
};

export const setOperNo = (payload: string): void => {
  state.operNo = payload;
};

export const setDesktopWindow = (window: BrowserWindow): void => {
  state.desktopWindow = window;
};
