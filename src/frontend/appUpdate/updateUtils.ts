/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// updateUtils.ts
import { app } from 'electron';
import log from 'electron-log';
import axios, { type AxiosResponse } from 'axios';
import { getOSUpdateType } from '../modules/utilities.js';
import { getUpdateInfoSuccess, UpdateData } from './appUpdate.js';
import { getOperNo, getServerIP, getServerPort, getBaseUrl } from '../modules/globalState.js';

interface ReqHead {
}

interface BodyBusi {
	versionNo: string;
	osType: string;
	userId?: string;
	ipAddress?: string;
	port?: string;
	ip?: string;
}

interface RequestParams {
	header: ReqHead;
	body: BodyBusi;
}

interface SysRspHead {
	errorCode: string;
	errorMsg?: string;
}

interface ApiResponse<T> {
	header: SysRspHead;
	body?: T;
}

// 请求更新信息
export async function getUpdateInfo(): Promise<void> {
	try {
		const reqParams: RequestParams = {
			header: {},
			body: {
				versionNo: app.getVersion(),
				osType: getOSUpdateType(),
				userId: getOperNo(),
				ipAddress: getServerIP()
			},
		};

		log.info('请求更新信息参数', JSON.stringify(reqParams));

		const response: AxiosResponse<ApiResponse<any>> = await axios.post(
			`${getBaseUrl()}/aop-web/integration/getNewVersion`,
			reqParams
		);

		log.info('请求更新信息返回', JSON.stringify(response?.data));

		if (response.data?.header?.errorCode === '0') {
			log.info('请求更新信息请求成功');
			getUpdateInfoSuccess(response.data?.body as UpdateData);
		}
	} catch (error) {
		log.error('请求更新信息Error', (error as Error).message);
	}
}

// 打开客户端
export async function openClient(): Promise<void> {
	try {
		log.info('客户端打开:');
		const reqParams: RequestParams = {
			header: {},
			body: {
				versionNo: app.getVersion(),
				osType: getOSUpdateType(),
				ipAddress: getServerIP(),
				port: getServerPort(),
			},
		};
		log.info('客户端打开接口请求参数', JSON.stringify(reqParams));

		const response: AxiosResponse<ApiResponse<any>> = await axios.post(
			`${getBaseUrl()}/aop-web/integration/openClient`,
			reqParams
		);

		log.info('客户端打开接口请求返回', JSON.stringify(response?.data));

		if (response.data?.header?.errorCode === '0') {
			log.info('客户端打开接口请求成功');
		}
	} catch (error) {
		log.error('客户端打开接口Error', (error as Error).message);
	}
}

// 关闭客户端
export async function closeClient(): Promise<void> {
	try {
		log.info('客户端关闭:');
		const reqParams: RequestParams = {
			header: {},
			body: {
				ipAddress: getServerIP(),
				versionNo: app.getVersion(),
				osType: getOSUpdateType(),
				port: getServerPort(),
			},
		};

		log.info('客户端关闭接口请求参数', JSON.stringify(reqParams));

		const response = await axios.post<ApiResponse<any>>(
			`${getBaseUrl()}/aop-web/integration/closeClient`,
			reqParams
		);

		log.info('客户端关闭接口请求返回', JSON.stringify(response?.data));

		if (response.data?.header?.errorCode === '0') {
			log.info('客户端关闭接口请求成功');
		}
	} catch (error) {
		log.error('客户端关闭接口Error', (error as Error).message);
	} finally {
		app.quit();
	}
}
