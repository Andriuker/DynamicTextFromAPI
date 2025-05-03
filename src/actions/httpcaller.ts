import { spawn } from 'node:child_process'; // Usar 'node:' prefix es buena práctica
import process from 'node:process';
// import clipboardy from 'clipboardy'; // Puedes comentarlo o eliminarlo si no lo usas como fallback
import streamDeck from "@elgato/streamdeck"; // Para el logger
// ... el resto de tus importaciones ...

import {
	action,
	KeyDownEvent,
	KeyUpEvent, // <-- Importar KeyUpEvent
	WillAppearEvent,
	WillDisappearEvent,
	DidReceiveSettingsEvent,
	SingletonAction,
	Action,
	ActionContext
} from "@elgato/streamdeck";

import axios, { AxiosRequestConfig, Method } from 'axios';
import { get } from 'lodash';

// --- Tipos y Constantes ---

type HttpCallerSettings = {
	httpMethod?: Method;
	url?: string;
	headers?: string;
	body?: string;
	responsePath?: string;
	updateInterval?: number;
	marqueeEnabled?: boolean;
	showOkOnPress?: boolean;
};

// Estado específico de cada instancia de acción
type ActionInstanceState = {
	intervalTimerId?: NodeJS.Timeout;
	marqueeTimerId?: NodeJS.Timeout;
	longPressTimerId?: NodeJS.Timeout; // <-- NUEVO: Timer para pulsación larga
	marqueeIntervalCounter: number;
	fullTitle?: string;
	marqueeOffset: number;
};

// Constantes
const MARQUEE_UPDATE_INTERVAL_MS = 150;
const MARQUEE_SCROLL_FACTOR = 2;
const MAX_TITLE_LENGTH = 10;
const CHARS_PER_LINE_ESTIMATE = 10;
const LONG_PRESS_DURATION_MS = 750; // <-- NUEVO: Duración para considerar "larga" (ms)

// --- Función Auxiliar para Word Wrap (sin cambios) ---
function wrapText(text: string, maxCharsPerLine: number): string {
	// ... (código de wrapText sin cambios)
	const words = text.split(' ');
	let currentLine = '';
	const lines: string[] = [];
	words.forEach(word => {
		if (word.length > maxCharsPerLine) {
			if (currentLine.length > 0) lines.push(currentLine);
			lines.push(word); currentLine = ''; return;
		}
		const testLine = currentLine.length > 0 ? `${currentLine} ${word}` : word;
		if (testLine.length <= maxCharsPerLine) { currentLine = testLine; }
		else { lines.push(currentLine); currentLine = word; }
	});
	if (currentLine.length > 0) lines.push(currentLine);
	return lines.join('\n');
}


// --- Clase de la Acción ---
@action({ UUID: "com.andriuker.dynamictextfromapi.httpcaller" })
export class HttpCallerAction extends SingletonAction<HttpCallerSettings> {

	private instancesState = new Map<string, ActionInstanceState>();

	// --- Manejadores de Eventos del SDK ---

	override async onWillAppear(ev: WillAppearEvent<HttpCallerSettings>): Promise<void> {
		const instanceId = ev.action.id;
		if (!this.instancesState.has(instanceId)) {
			streamDeck.logger.info(`[${instanceId}] Initializing state on WillAppear`);
			this.instancesState.set(instanceId, {
				marqueeIntervalCounter: 0,
				marqueeOffset: 0,
			});
		} else {
			streamDeck.logger.warn(`[${instanceId}] State already existed on WillAppear. Cleaning up previous timers.`);
			const state = this.instancesState.get(instanceId)!;
			clearTimeout(state.intervalTimerId);
			clearTimeout(state.marqueeTimerId);
			clearTimeout(state.longPressTimerId); // Limpiar también longPress
			state.intervalTimerId = undefined;
			state.marqueeTimerId = undefined;
			state.longPressTimerId = undefined;
		}
		await this.updateDataAndTitle(instanceId, ev.action, ev.payload.settings);
		this.resetIntervalTimer(instanceId, ev.action, ev.payload.settings);
	}

	override async onWillDisappear(ev: WillDisappearEvent<HttpCallerSettings>): Promise<void> {
		const instanceId = ev.action.id;
		streamDeck.logger.info(`[${instanceId}] Cleaning up on WillDisappear`);
		const state = this.instancesState.get(instanceId);
		if (state) {
			clearTimeout(state.intervalTimerId);
			clearTimeout(state.marqueeTimerId);
			clearTimeout(state.longPressTimerId); // <-- Limpiar timer de long press
			this.instancesState.delete(instanceId);
			streamDeck.logger.info(`[${instanceId}] State deleted. Map size: ${this.instancesState.size}`);
		} else {
			streamDeck.logger.warn(`[${instanceId}] State not found on WillDisappear.`);
		}
	}

	override async onKeyDown(ev: KeyDownEvent<HttpCallerSettings>): Promise<void> {
		const instanceId = ev.action.id;
		const state = this.instancesState.get(instanceId);

		if (!state) {
			streamDeck.logger.error(`[${instanceId}] State not found on KeyDown!`);
			return;
		}

		// 1. Limpiar cualquier timer de long press anterior (seguridad)
		clearTimeout(state.longPressTimerId);
		state.longPressTimerId = undefined;

		// 2. Ejecutar acción principal (puede ser después del timer si prefieres)
		// await this.updateDataAndTitle(instanceId, ev.action, ev.payload.settings); // Opcional: ejecutar antes o después de copiar

		// 3. Iniciar temporizador para detectar pulsación larga
		state.longPressTimerId = setTimeout(async () => {
			// --- Esto se ejecuta si se mantiene presionado ---
			const currentState = this.instancesState.get(instanceId); // Volver a obtener estado
			if (!currentState || !currentState.fullTitle) {
				streamDeck.logger.warn(`[${instanceId}] Long press detected, but state or title is missing.`);
				// Marcar timer como terminado aunque no hagamos nada
				if (this.instancesState.has(instanceId)) { this.instancesState.get(instanceId)!.longPressTimerId = undefined; }
				return;
			}

			const titleToCopy = currentState.fullTitle;
			streamDeck.logger.info(`[${instanceId}] Long press detected. Attempting to copy: "${titleToCopy}"`);

			try {
				// Usar spawn para ejecutar comandos nativos
				if (process.platform === 'win32') {
					// --- Windows: usar clip.exe ---
					const clip = spawn('clip', []); // Ejecutar 'clip.exe'
					let errorData = '';
					clip.stderr.on('data', (data) => { errorData += data; }); // Capturar errores de stderr

					// Promesa para esperar a que el proceso termine o falle
					await new Promise<void>((resolve, reject) => {
						clip.on('error', (err) => reject(new Error(`Failed to spawn 'clip': ${err.message}`))); // Error al iniciar
						clip.on('close', (code) => { // Proceso terminado
							if (code !== 0) {
								reject(new Error(`'clip' command exited with code ${code}: ${errorData}`));
							} else {
								streamDeck.logger.info(`[${instanceId}] Text copied to clipboard via 'clip.exe'.`);
								resolve();
							}
						});

						// Escribir el texto en la entrada estándar del proceso clip
						clip.stdin.write(titleToCopy);
						clip.stdin.end(); // Cerrar stdin para que clip procese
					});
					// --- Fin Windows ---

				} else if (process.platform === 'darwin') {
					// --- macOS: usar pbcopy ---
					const pbcopy = spawn('pbcopy', []); // Ejecutar 'pbcopy'
					let errorData = '';
					pbcopy.stderr.on('data', (data) => { errorData += data; });

					await new Promise<void>((resolve, reject) => {
						pbcopy.on('error', (err) => reject(new Error(`Failed to spawn 'pbcopy': ${err.message}`)));
						pbcopy.on('close', (code) => {
							if (code !== 0) {
								reject(new Error(`'pbcopy' exited with code ${code}: ${errorData}`));
							} else {
								streamDeck.logger.info(`[${instanceId}] Text copied to clipboard via 'pbcopy'.`);
								resolve();
							}
						});
						pbcopy.stdin.write(titleToCopy);
						pbcopy.stdin.end();
					});
					// --- Fin macOS ---

				} else {
					// --- Otras plataformas (Linux necesitaría xclip/xsel, etc.) ---
					streamDeck.logger.warn(`[${instanceId}] Clipboard copy not implemented natively for platform: ${process.platform}. You might need 'xclip' or 'xsel' on Linux.`);
					// Podrías intentar clipboardy aquí como fallback si lo dejas instalado
					// await clipboardy.write(titleToCopy);
					// streamDeck.logger.info(`[${instanceId}] Text copied via clipboardy (fallback).`);
					throw new Error(`Unsupported platform for native clipboard copy: ${process.platform}`);
				}

			} catch (err: any) { // Capturar errores de spawn o promesas
				streamDeck.logger.error(`[${instanceId}] Failed to copy text to clipboard:`, err.message);
				// Mostrar alerta visual en el botón si es posible y es una tecla
				if(ev.action && ev.action.isKey()) { // Necesitamos actionInstance aquí
					try { await ev.action.showAlert(); } catch (e) {/* ignorar */ }
				}
			} finally {
				// Marcar que el timer ya se ejecutó (o falló)
				if (this.instancesState.has(instanceId)) {
					this.instancesState.get(instanceId)!.longPressTimerId = undefined;
				}
			}
			// --- Fin de la ejecución de pulsación larga ---
		}, LONG_PRESS_DURATION_MS);

		// Guardamos el ID del timer en el estado
		this.instancesState.set(instanceId, state);

		// 4. Ejecutar la acción principal AHORA si no lo hicimos antes
		await this.updateDataAndTitle(instanceId, ev.action, ev.payload.settings);

		// 5. Mostrar OK si está configurado (para pulsación corta)
		// Esta lógica se ejecuta inmediatamente, el timer de long press sigue corriendo en paralelo.
		// Si se suelta la tecla antes de LONG_PRESS_DURATION_MS, onKeyUp limpiará el timer.
		const shouldShowOk = ev.payload.settings.showOkOnPress ?? true;
		if (shouldShowOk && ev.action.isKey()) {
			await ev.action.showOk();
		}
	}

	// --- NUEVO: Manejador onKeyUp ---
	override async onKeyUp(ev: KeyUpEvent<HttpCallerSettings>): Promise<void> {
		const instanceId = ev.action.id;
		const state = this.instancesState.get(instanceId);

		if (state && state.longPressTimerId) {
			// Si hay un timer de long press corriendo, cancelarlo porque la tecla se soltó
			streamDeck.logger.debug(`[${instanceId}] KeyUp detected, clearing long press timer.`);
			clearTimeout(state.longPressTimerId);
			state.longPressTimerId = undefined; // Marcar como cancelado
			// No es necesario volver a guardar el estado en el map aquí si solo limpiamos el timer
		}
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<HttpCallerSettings>): Promise<void> {
		const instanceId = ev.action.id;
		await this.updateDataAndTitle(instanceId, ev.action, ev.payload.settings);
		this.resetIntervalTimer(instanceId, ev.action, ev.payload.settings);
	}

	// --- Lógica Principal (sin cambios) ---
	async updateDataAndTitle(instanceId: string, actionInstance: Action<HttpCallerSettings>, settings: HttpCallerSettings): Promise<void> {
		// ... (código igual a la versión anterior)
		const { httpMethod = 'GET', url, headers: headersJson, body: bodyString, responsePath, marqueeEnabled = true } = settings;
		const state = this.instancesState.get(instanceId);
		if (!state) { streamDeck.logger.error(`[${instanceId}] State not found in updateDataAndTitle!`); return; }
		if (!actionInstance.isKey()) { streamDeck.logger.warn(`[${instanceId}] Action is not a Keypad action.`); return; }
		if (!url) { await actionInstance.setTitle("No URL"); await actionInstance.showAlert(); return; }
		let parsedHeaders: Record<string, string> = {};
		try { if (headersJson) parsedHeaders = JSON.parse(headersJson); }
		catch (e) { streamDeck.logger.error(`[${instanceId}] Error parsing headers JSON:`, e); await actionInstance.setTitle("Header Err"); await actionInstance.showAlert(); return; }
		let requestBody: any = bodyString;
		const contentType = Object.entries(parsedHeaders).find(([key]) => key.toLowerCase() === 'content-type')?.[1];
		if (contentType?.toLowerCase().includes('application/json') && bodyString) {
			try { requestBody = JSON.parse(bodyString); }
			catch (e) { streamDeck.logger.error(`[${instanceId}] Error parsing body JSON:`, e); await actionInstance.setTitle("Body Err"); await actionInstance.showAlert(); return; }
		}
		const config: AxiosRequestConfig = { method: httpMethod, url: url, headers: parsedHeaders, data: (httpMethod !== 'GET' && httpMethod !== 'DELETE') ? requestBody : undefined, timeout: 10000 };
		try {
			streamDeck.logger.info(`[${instanceId}] Making ${config.method} request to ${config.url}`);
			const response = await axios(config);
			streamDeck.logger.info(`[${instanceId}] Response Status:`, response.status);
			let extractedData: any;
			if (responsePath && response.data) extractedData = typeof response.data === 'object' ? get(response.data, responsePath) : response.data;
			else extractedData = response.data;
			let newTitle = "N/A";
			if (extractedData !== undefined && extractedData !== null) newTitle = (typeof extractedData === 'object') ? JSON.stringify(extractedData) : String(extractedData);
			streamDeck.logger.info(`[${instanceId}] Extracted Title:`, newTitle);
			const previousFullTitle = state.fullTitle;
			state.fullTitle = newTitle;
			if (state.marqueeTimerId && previousFullTitle !== state.fullTitle) { this.stopMarquee(instanceId); }
			if (marqueeEnabled && state.fullTitle.length > MAX_TITLE_LENGTH) {
				if (!state.marqueeTimerId) { this.startMarquee(instanceId, actionInstance); }
			} else {
				this.stopMarquee(instanceId);
				let titleToShow = state.fullTitle;
				if (!marqueeEnabled && state.fullTitle.length > CHARS_PER_LINE_ESTIMATE) {
					streamDeck.logger.info(`[${instanceId}] Wrapping title: ${state.fullTitle}`);
					titleToShow = wrapText(state.fullTitle, CHARS_PER_LINE_ESTIMATE);
					streamDeck.logger.info(`[${instanceId}] Wrapped title:\n${titleToShow}`);
				}
				await actionInstance.setTitle(titleToShow);
			}
		} catch (error: any) {
			streamDeck.logger.error(`[${instanceId}] HTTP Request Failed:`, error.message);
			let errorTitle = "Req Error";
			if (axios.isAxiosError(error)) {
				if (error.response) errorTitle = `Err ${error.response.status}`;
				else if (error.code === 'ECONNABORTED') errorTitle = "Timeout";
				else if (error.request) errorTitle = "Net Error";
			}
			state.fullTitle = errorTitle;
			this.stopMarquee(instanceId);
			await actionInstance.setTitle(state.fullTitle);
			await actionInstance.showAlert();
		}
	}

	// --- Gestión de Timers y Marquee (sin cambios en la lógica interna, solo usan instanceId) ---
	resetIntervalTimer(instanceId: string, actionInstance: Action<HttpCallerSettings>, settings: HttpCallerSettings): void {
		const state = this.instancesState.get(instanceId);
		if (!state) { streamDeck.logger.error(`[${instanceId}] State not found in resetIntervalTimer!`); return; }
		clearTimeout(state.intervalTimerId);
		state.intervalTimerId = undefined;
		const intervalSeconds = settings.updateInterval ?? 0;
		if (intervalSeconds > 0) {
			const intervalMilliseconds = intervalSeconds * 1000;
			state.intervalTimerId = setTimeout(async () => {
				const currentState = this.instancesState.get(instanceId);
				if (!currentState) { streamDeck.logger.info(`[${instanceId}] State disappeared before interval could run.`); return; }
				streamDeck.logger.info(`[${instanceId}] Interval triggered: Updating data...`);
				try {
					const currentSettings = await actionInstance.getSettings();
					if (!this.instancesState.has(instanceId)) { streamDeck.logger.info(`[${instanceId}] State disappeared during getSettings.`); return; }
					await this.updateDataAndTitle(instanceId, actionInstance, currentSettings);
					this.resetIntervalTimer(instanceId, actionInstance, currentSettings);
				} catch (err) {
					streamDeck.logger.error(`[${instanceId}] Error getting settings or updating in interval:`, err);
					if (this.instancesState.has(instanceId)) { this.instancesState.get(instanceId)!.intervalTimerId = undefined; }
				}
			}, intervalMilliseconds);
			streamDeck.logger.info(`[${instanceId}] Interval timer SET for ${intervalSeconds} seconds.`);
		} else {
			streamDeck.logger.info(`[${instanceId}] Interval timer stopped (interval set to 0).`);
		}
	}

	startMarquee(instanceId: string, actionInstance: Action<HttpCallerSettings>): void {
		const state = this.instancesState.get(instanceId);
		if (!state) { streamDeck.logger.error(`[${instanceId}] State not found in startMarquee!`); return; }
		if (!actionInstance.isKey() || !state.fullTitle || state.fullTitle.length <= MAX_TITLE_LENGTH) {
			this.stopMarquee(instanceId);
			if (state.fullTitle && actionInstance.isKey()) actionInstance.setTitle(state.fullTitle);
			return;
		}
		streamDeck.logger.info(`[${instanceId}] Starting marquee for:`, state.fullTitle);
		state.marqueeOffset = 0;
		state.marqueeIntervalCounter = 0;
		const stepMarquee = async () => {
			const currentState = this.instancesState.get(instanceId);
			if (!currentState || !currentState.marqueeTimerId || !currentState.fullTitle || currentState.fullTitle.length <= MAX_TITLE_LENGTH) {
				streamDeck.logger.info(`[${instanceId}] Marquee stopping (state gone or title changed).`);
				if (currentState) currentState.marqueeTimerId = undefined;
				if (currentState?.fullTitle && actionInstance.isKey()) { try { await actionInstance.setTitle(currentState.fullTitle); } catch (e) { } }
				return;
			}
			currentState.marqueeIntervalCounter++;
			if (currentState.marqueeIntervalCounter % MARQUEE_SCROLL_FACTOR === 0) { currentState.marqueeOffset++; }
			const paddedTitle = currentState.fullTitle + "  |  ";
			const wrappedOffset = currentState.marqueeOffset % paddedTitle.length;
			const displayTitle = (paddedTitle + paddedTitle).substring(wrappedOffset, wrappedOffset + MAX_TITLE_LENGTH);
			try {
				if (actionInstance.isKey()) { await actionInstance.setTitle(displayTitle.trim()); }
				if (this.instancesState.get(instanceId)?.marqueeTimerId === state.marqueeTimerId) {
					currentState.marqueeTimerId = setTimeout(stepMarquee, MARQUEE_UPDATE_INTERVAL_MS);
				} else { streamDeck.logger.info(`[${instanceId}] Marquee timer ID changed or state deleted, stopping.`); }
			} catch (err) {
				streamDeck.logger.error(`[${instanceId}] Error setting title during marquee, stopping:`, err);
				this.stopMarquee(instanceId);
			}
		};
		clearTimeout(state.marqueeTimerId);
		state.marqueeTimerId = setTimeout(stepMarquee, MARQUEE_UPDATE_INTERVAL_MS);
	}

	stopMarquee(instanceId: string): void {
		const state = this.instancesState.get(instanceId);
		if (state && state.marqueeTimerId) {
			clearTimeout(state.marqueeTimerId);
			state.marqueeTimerId = undefined;
			streamDeck.logger.info(`[${instanceId}] Marquee timer stopped.`);
		}
	}

	clearAllRunningTimers(): void {
		streamDeck.logger.info("Clearing all known instance timers...");
		this.instancesState.forEach((state, instanceId) => {
			streamDeck.logger.info(`[${instanceId}] Clearing timers via clearAllRunningTimers`);
			clearTimeout(state.intervalTimerId);
			clearTimeout(state.marqueeTimerId);
			clearTimeout(state.longPressTimerId); // Limpiar también longPress
			state.intervalTimerId = undefined;
			state.marqueeTimerId = undefined;
			state.longPressTimerId = undefined;
		});
		streamDeck.logger.info("Finished clearing all known timers.");
	}

} // Fin de la clase HttpCallerAction