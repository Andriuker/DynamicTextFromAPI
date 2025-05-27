import { spawn } from 'node:child_process'; // Use 'node:' prefix for clarity
import process from 'node:process';
import streamDeck from "@elgato/streamdeck";
import {
	action,
	KeyDownEvent,
	KeyUpEvent,
	WillAppearEvent,
	WillDisappearEvent,
	DidReceiveSettingsEvent,
	SingletonAction,
	Action,
	SendToPluginEvent // Added for PI communication
} from "@elgato/streamdeck";
import axios, { AxiosRequestConfig, Method } from 'axios';
import { get } from 'lodash'; // lodash.get is used for JSONPath
import { DOMParser } from 'xmldom'; // Ensure xmldom is installed: npm install xmldom
import xpath from 'xpath'; // Ensure xpath is installed: npm install xpath

// --- Types and Constants ---

export type HttpCallerSettings = {
	httpMethod?: Method;
	url?: string;
	headers?: string; // JSON string for headers
	body?: string; // JSON or plain text body
	responsePath?: string; // Dot notation path for response data
	updateInterval?: number; // In seconds, 0 for manual
	marqueeEnabled?: boolean;
	showOkOnPress?: boolean;
};

// State specific to each action instance
type ActionInstanceState = {
	intervalTimerId?: NodeJS.Timeout;
	marqueeTimerId?: NodeJS.Timeout;
	longPressTimerId?: NodeJS.Timeout;
	marqueeIntervalCounter: number;
	fullTitle?: string; // The complete title before marquee/wrapping
	marqueeOffset: number;
};

// Constants
const MARQUEE_UPDATE_INTERVAL_MS = 150; // Update rate for marquee effect
const MARQUEE_SCROLL_FACTOR = 2; // How many intervals before shifting text
const MAX_TITLE_LENGTH = 10; // Approx max chars before marquee/wrapping kicks in
const CHARS_PER_LINE_ESTIMATE = 10; // Estimate for experimental word wrap
const LONG_PRESS_DURATION_MS = 750; // Duration for long press detection

// --- Helper Function: Word Wrap (Experimental) ---

/**
 * Attempts to wrap text by inserting newline characters based on estimated character width.
 * Note: Effectiveness depends heavily on Stream Deck font rendering and may vary.
 * @param text The text to wrap.
 * @param maxCharsPerLine Estimated max characters per line.
 * @returns Text with potential newlines inserted.
 */
function wrapText(text: string, maxCharsPerLine: number): string {
	const words = text.split(' ');
	let currentLine = '';
	const lines: string[] = [];

	words.forEach(word => {
		// If a single word is too long, put it on its own line (or handle smarter if needed)
		if (word.length > maxCharsPerLine) {
			if (currentLine.length > 0) { lines.push(currentLine); }
			lines.push(word);
			currentLine = '';
			return;
		}

		// Check if adding the word exceeds the line limit
		const testLine = currentLine.length > 0 ? `${currentLine} ${word}` : word;
		if (testLine.length <= maxCharsPerLine) {
			currentLine = testLine; // Add word to current line
		} else {
			lines.push(currentLine); // Finalize current line
			currentLine = word;      // Start new line with the current word
		}
	});

	// Add the last line if it has content
	if (currentLine.length > 0) {
		lines.push(currentLine);
	}

	return lines.join('\n');
}

// --- Action Class ---

@action({ UUID: "com.andriuker.dynamictextfromapi.httpcaller" })
export class HttpCallerAction extends SingletonAction<HttpCallerSettings> {

	// Stores the state (like timers and full title) for each instance of this action on the Stream Deck.
	private instancesState = new Map<string, ActionInstanceState>();

	// --- Stream Deck SDK Event Handlers ---

	/**
	 * Called when an instance of this action appears on the Stream Deck canvas
	 * (e.g., profile switch, plugin start, folder navigation).
	 * Initializes state, fetches initial data, and sets up timers.
	 */
	override async onWillAppear(ev: WillAppearEvent<HttpCallerSettings>): Promise<void> {
		const instanceId = ev.action.id;
		// Initialize state if it doesn't exist for this instance
		if (!this.instancesState.has(instanceId)) {
			streamDeck.logger.info(`[${instanceId}] Initializing new state on WillAppear.`);
			this.instancesState.set(instanceId, {
				marqueeIntervalCounter: 0,
				marqueeOffset: 0,
			});
		} else {
			// If state exists (rare, might happen on rapid profile switches?), clean up old timers first.
			streamDeck.logger.warn(`[${instanceId}] State already existed on WillAppear. Cleaning up potentially orphaned timers.`);
			const state = this.instancesState.get(instanceId)!;
			this.clearInstanceTimers(state, instanceId);
		}

		streamDeck.logger.debug(`[${instanceId}] WillAppear event. Current state map size: ${this.instancesState.size}`);
		// Fetch data and update the title for the first time
		await this.updateDataAndTitle(instanceId, ev.action, ev.payload.settings);
		// Set up the automatic update interval timer based on settings
		this.resetIntervalTimer(instanceId, ev.action, ev.payload.settings);
	}

	/**
	 * Called when an instance of this action disappears from the Stream Deck canvas.
	 * Cleans up timers and removes the instance state.
	 */
	override async onWillDisappear(ev: WillDisappearEvent<HttpCallerSettings>): Promise<void> {
		const instanceId = ev.action.id;
		streamDeck.logger.info(`[${instanceId}] Cleaning up timers and state on WillDisappear.`);
		const state = this.instancesState.get(instanceId);
		if (state) {
			this.clearInstanceTimers(state, instanceId);
			this.instancesState.delete(instanceId); // Remove state from map
			streamDeck.logger.info(`[${instanceId}] State deleted. Remaining instances tracked: ${this.instancesState.size}`);
		} else {
			streamDeck.logger.warn(`[${instanceId}] State not found on WillDisappear. Could not clean up timers.`);
		}
	}

	/**
	 * Called when the user presses the key down.
	 * Handles both the primary action (fetching data) and initiating the long-press detection for clipboard copy.
	 */
	override async onKeyDown(ev: KeyDownEvent<HttpCallerSettings>): Promise<void> {
		const instanceId = ev.action.id;
		const state = this.instancesState.get(instanceId);

		if (!state) {
			streamDeck.logger.error(`[${instanceId}] State not found on KeyDown! Cannot process press.`);
			return;
		}

		// Clear any existing long press timer for this instance (safety check)
		clearTimeout(state.longPressTimerId);
		state.longPressTimerId = undefined;

		// Start a timer to detect if this press becomes a long press
		state.longPressTimerId = setTimeout(async () => {
			// This block executes ONLY if the key is held down for LONG_PRESS_DURATION_MS
			const currentState = this.instancesState.get(instanceId); // Re-fetch state in case it changed
			if (!currentState) {
				streamDeck.logger.warn(`[${instanceId}] Long press detected, but state disappeared.`);
				return;
			}
			if (!currentState.fullTitle) {
				streamDeck.logger.warn(`[${instanceId}] Long press detected, but no title available to copy.`);
				currentState.longPressTimerId = undefined; // Mark timer as finished
				return;
			}

			const titleToCopy = currentState.fullTitle;
			streamDeck.logger.info(`[${instanceId}] Long press detected. Attempting to copy to clipboard: "${titleToCopy}"`);
			this.copyToClipboard(titleToCopy, instanceId, ev.action); // Use helper function

			// Mark the long press timer as completed/handled
			currentState.longPressTimerId = undefined;

		}, LONG_PRESS_DURATION_MS);

		// Perform the main action immediately on key down (fetch data)
		await this.updateDataAndTitle(instanceId, ev.action, ev.payload.settings);

		// Show the visual 'OK' feedback if enabled (for short press indication)
		const shouldShowOk = ev.payload.settings.showOkOnPress ?? false; // Default to false if not set
		if (shouldShowOk && ev.action.isKey()) {
			try {
				await ev.action.showOk();
			} catch (e) {
				streamDeck.logger.warn(`[${instanceId}] Error showing OK feedback: ${e}`);
			}
		}
	}

	/**
	 * Called when the user releases the key.
	 * Used primarily to cancel the long-press timer if the key is released before the duration.
	 */
	override async onKeyUp(ev: KeyUpEvent<HttpCallerSettings>): Promise<void> {
		const instanceId = ev.action.id;
		const state = this.instancesState.get(instanceId);

		if (state && state.longPressTimerId) {
			// If a long press timer is still running, it means it was a short press. Cancel the timer.
			streamDeck.logger.debug(`[${instanceId}] KeyUp detected before long press duration. Clearing timer.`);
			clearTimeout(state.longPressTimerId);
			state.longPressTimerId = undefined; // Mark as cancelled/finished
		} else if (state) {
			// If no timer was running (either it fired or was already cleared), do nothing special on key up.
			streamDeck.logger.debug(`[${instanceId}] KeyUp detected, no active long press timer found.`);
		} else {
			streamDeck.logger.warn(`[${instanceId}] KeyUp detected, but state not found.`);
		}
	}

	/**
	 * Called when the settings for an action instance are changed in the Property Inspector.
	 * Re-fetches data and resets the interval timer with the new settings.
	 */
	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<HttpCallerSettings>): Promise<void> {
		const instanceId = ev.action.id;
		streamDeck.logger.info(`[${instanceId}] Settings received. Updating data and resetting timer.`);
		// Fetch data immediately with new settings
		await this.updateDataAndTitle(instanceId, ev.action, ev.payload.settings);
		// Reset the interval timer based on the new settings
		this.resetIntervalTimer(instanceId, ev.action, ev.payload.settings);
	}

	// --- Core Logic ---

	/**
	 * Fetches data from the configured URL, extracts the relevant part,
	 * updates the key's title, and manages the marquee effect if necessary.
	 * @param instanceId The unique ID of the action instance.
	 * @param actionInstance The Action instance from the SDK event.
	 * @param settings The current settings for this action instance.
	 */
	// --- Property Inspector Communication ---

	/**
	 * Handles messages sent from the Property Inspector.
	 * Specifically listens for 'runTestRequest' to test current settings.
	 */
	public override async onSendToPlugin(ev: SendToPluginEvent<HttpCallerSettings, { event?: string }>): Promise<void> {
		if (ev.payload?.event === 'runTestRequest') {
			const instanceId = ev.action.id;
			streamDeck.logger.info(`[${instanceId}] Received 'runTestRequest' from PI.`);

			// Get current settings for this action instance.
			// Note: PI usually sends current settings, but for a test, we might want the *saved* settings.
			// However, getSettings() should reflect what's saved for the instance.
			// Explicitly cast ev.action to Action<HttpCallerSettings> to resolve type inference issues.
			const typedAction = ev.action as Action<HttpCallerSettings>;
			const currentSettings = await typedAction.getSettings();

			// Execute the request using the new private method
			const result = await this._executeRequest(currentSettings, instanceId);

			// Prepare payload for PI
			let piResultPayload: { testResult: string };
			if (result.status === "success") {
				// If data is an object, PI script will stringify. If string, use directly.
				// If data is undefined (e.g. "No Match" where data is the message), use message.
				const displayData = result.data !== undefined ? result.data : result.message;
				piResultPayload = { testResult: typeof displayData === 'object' ? JSON.stringify(displayData, null, 2) : String(displayData) };
			} else { // "error" or other statuses
				piResultPayload = { testResult: `Error: ${result.message}` };
			}
			
			streamDeck.logger.info(`[${instanceId}] Sending test result to PI: ${JSON.stringify(piResultPayload)}`);
			await typedAction.sendToPropertyInspector(piResultPayload);
		}
	}

	// --- Core Logic ---

	/**
	 * Private method to execute the HTTP request based on provided settings.
	 * This centralizes the request logic for use by both updates and PI tests.
	 * @param settings The settings for the HTTP request.
	 * @param instanceId The instance ID for logging.
	 * @returns A promise resolving to an object with status, message, and optional data.
	 */
	private async _executeRequest(
		settings: HttpCallerSettings,
		instanceId: string
	): Promise<{ status: "success" | "error"; message: string; data?: any }> {
		const { httpMethod = 'GET', url, headers: headersJson, body: bodyString, responsePath } = settings;

		if (!url) {
			streamDeck.logger.warn(`[${instanceId}] URL is not configured.`);
			return { status: "error", message: "No URL" };
		}

		// Parse headers safely
		let parsedHeaders: Record<string, string> = {};
		if (headersJson) {
			try {
				parsedHeaders = JSON.parse(headersJson);
				if (typeof parsedHeaders !== 'object' || parsedHeaders === null || Array.isArray(parsedHeaders)) {
					throw new Error("Headers must be a JSON object.");
				}
			} catch (e: any) {
				streamDeck.logger.error(`[${instanceId}] Error parsing headers JSON: ${e.message}`);
				return { status: "error", message: "Header Err" };
			}
		}

		// Parse Body safely if Content-Type is JSON
		let requestBody: any = bodyString;
		const contentTypeHeader = Object.entries(parsedHeaders).find(([key]) => key.toLowerCase() === 'content-type')?.[1];
		if (contentTypeHeader?.toLowerCase().includes('application/json') && bodyString) {
			try {
				requestBody = JSON.parse(bodyString);
			} catch (e: any) {
				streamDeck.logger.error(`[${instanceId}] Error parsing body JSON: ${e.message}`);
				return { status: "error", message: "Body Err" };
			}
		}

		// Prepare Axios request configuration
		const config: AxiosRequestConfig = {
			method: httpMethod,
			url: url,
			headers: parsedHeaders,
			data: (httpMethod !== 'GET' && httpMethod !== 'DELETE' && requestBody) ? requestBody : undefined,
			timeout: 10000, // 10 second timeout
			validateStatus: function (status) {
				return status >= 100 && status < 600; // Accept almost any status code
			}
		};

		try {
			streamDeck.logger.info(`[${instanceId}] Making ${config.method} request to ${config.url}`);
			const response = await axios(config);
			streamDeck.logger.info(`[${instanceId}] Response Status: ${response.status}`);

			if (response.status >= 400) { // Check for HTTP errors explicitly
				streamDeck.logger.warn(`[${instanceId}] HTTP Error: ${response.status} ${response.statusText}`);
				return { status: "error", message: `Err ${response.status}` };
			}
			
			let extractedData: any;
			let extractionMessage = "Data extracted successfully.";

			// Determine response type (JSON, XML, Text) for extraction
			const responseContentType = response.headers['content-type'] || '';

			if (responsePath) { // Only attempt extraction if responsePath is provided
				if (typeof response.data === 'object' && response.data !== null) { // JSON response
					extractedData = get(response.data, responsePath);
					if (extractedData === undefined) {
						extractedData = "No Match";
						extractionMessage = "No match for JSONPath.";
					}
				} else if (typeof response.data === 'string' && (response.data.trim().startsWith('<') || responseContentType.includes('xml'))) { // XML response
					try {
						const doc = new DOMParser().parseFromString(response.data, 'text/xml');
						const nodes = xpath.select(responsePath, doc) as Node[];
						if (nodes.length > 0) {
							extractedData = nodes.map(n => n.textContent).join(', '); // Join if multiple nodes match
						} else {
							extractedData = "No Match";
							extractionMessage = "No match for XPath.";
						}
						streamDeck.logger.debug(`[${instanceId}] XPath nodes found: ${nodes.length}`);
					} catch (error: any) {
						streamDeck.logger.error(`[${instanceId}] Error processing XPath: ${error.message}`);
						return { status: "error", message: "XML Parse Err" };
					}
				} else if (typeof response.data === 'string') { // Plain Text response (for Regex)
					try {
						const regexParts = responsePath.match(/^\/(.+)\/([gimsuy]*)$/);
						if (regexParts) {
							const [, pattern, flags] = regexParts;
							const regex = new RegExp(pattern, flags);
							const matches = response.data.match(regex);
							if (matches) {
								// If global flag, join matches. Otherwise, take first group or full match.
								extractedData = regex.global ? matches.join('') : (matches[1] || matches[0]);
							} else {
								extractedData = "No Match";
								extractionMessage = "No match for Regex.";
							}
						} else {
							streamDeck.logger.error(`[${instanceId}] Invalid regex format: "${responsePath}". Must be /pattern/flags.`);
							return { status: "error", message: "Regex Err" };
						}
					} catch (error: any) {
						streamDeck.logger.error(`[${instanceId}] Error processing regex: ${error.message}`);
						return { status: "error", message: "Regex Err" };
					}
				} else {
					// Cannot determine data type for extraction or data is not string/object
					streamDeck.logger.warn(`[${instanceId}] Cannot extract: Unknown response data type or responsePath provided for non-extractable type.`);
					extractedData = response.data; // return raw data
					extractionMessage = "Raw data (type mismatch for path)";
				}
			} else { // No responsePath, return full response
				extractedData = response.data;
				extractionMessage = "Full response data.";
			}
			
			streamDeck.logger.info(`[${instanceId}] Final extracted data for PI/Title: "${typeof extractedData === 'object' ? JSON.stringify(extractedData) : extractedData}"`);
			return { status: "success", message: extractionMessage, data: extractedData };

		} catch (error: any) {
			streamDeck.logger.error(`[${instanceId}] HTTP Request Failed: ${error.message}`);
			if (axios.isAxiosError(error)) {
				if (error.code === 'ECONNABORTED') {
					return { status: "error", message: "Timeout" };
				} else if (error.response) {
					return { status: "error", message: `Err ${error.response.status}` };
				} else if (error.request) {
					return { status: "error", message: "Net Error" };
				}
			}
			return { status: "error", message: "Req Error" };
		}
	}

	/**
	 * Fetches data from the configured URL, extracts the relevant part,
	 * updates the key's title, and manages the marquee effect if necessary.
	 * @param instanceId The unique ID of the action instance.
	 * @param actionInstance The Action instance from the SDK event.
	 * @param settings The current settings for this action instance.
	 */
	async updateDataAndTitle(instanceId: string, actionInstance: Action<HttpCallerSettings>, settings: HttpCallerSettings): Promise<void> {
		const state = this.instancesState.get(instanceId);
		if (!state) {
			streamDeck.logger.error(`[${instanceId}] State not found in updateDataAndTitle! Cannot update.`);
			return;
		}
		if (!actionInstance.isKey()) {
			streamDeck.logger.warn(`[${instanceId}] Action is not a key. Skipping update.`);
			return;
		}

		const result = await this._executeRequest(settings, instanceId);
		const { marqueeEnabled = true } = settings;

		if (result.status === "success") {
			let titleData = result.data;
			// If data is an object, stringify it for display. If it's null/undefined, use the message (e.g. "No Match")
			if (typeof titleData === 'object' && titleData !== null) {
				titleData = JSON.stringify(titleData);
			} else if (titleData === undefined || titleData === null) {
				titleData = result.message; // e.g., "No Match" or "Full response data."
			} else {
				titleData = String(titleData); // Ensure it's a string
			}
			streamDeck.logger.info(`[${instanceId}] Setting title from successful request: "${titleData}"`);
			await this.setTitleAndManageMarquee(instanceId, actionInstance, titleData, marqueeEnabled);
		} else { // "error"
			streamDeck.logger.warn(`[${instanceId}] Setting error title: "${result.message}"`);
			await this.setTitleAndStopMarquee(instanceId, actionInstance, result.message);
			await actionInstance.showAlert();
		}
	}

	// --- Timer and Marquee Management Helpers ---

	/**
	 * Clears and resets the automatic update interval timer for a specific instance.
	 * @param instanceId The ID of the action instance.
	 * @param actionInstance The Action instance.
	 * @param settings The current settings containing the update interval.
	 */
	resetIntervalTimer(instanceId: string, actionInstance: Action<HttpCallerSettings>, settings: HttpCallerSettings): void {
		const state = this.instancesState.get(instanceId);
		if (!state) {
			streamDeck.logger.error(`[${instanceId}] State not found in resetIntervalTimer!`);
			return;
		}

		// Clear existing timer if any
		clearTimeout(state.intervalTimerId);
		state.intervalTimerId = undefined;

		const intervalSeconds = settings.updateInterval ?? 0;

		// Set a new timer only if interval is positive
		if (intervalSeconds > 0) {
			const intervalMilliseconds = intervalSeconds * 1000;
			state.intervalTimerId = setTimeout(async () => {
				// Check if the instance still exists when the timer fires
				const currentState = this.instancesState.get(instanceId);
				if (!currentState) {
					streamDeck.logger.info(`[${instanceId}] Interval fired, but instance state no longer exists. Stopping timer.`);
					return;
				}

				streamDeck.logger.info(`[${instanceId}] Interval triggered: Updating data...`);
				try {
					// Re-fetch settings in case they changed while timer was pending
					const currentSettings = await actionInstance.getSettings();
					// Check again if state exists after await
					if (!this.instancesState.has(instanceId)) {
						streamDeck.logger.info(`[${instanceId}] State disappeared during interval's getSettings. Stopping timer.`);
						return;
					}
					// Perform the update and reset the timer for the next interval
					await this.updateDataAndTitle(instanceId, actionInstance, currentSettings);
					this.resetIntervalTimer(instanceId, actionInstance, currentSettings);
				} catch (err: any) {
					streamDeck.logger.error(`[${instanceId}] Error getting settings or updating in interval: ${err.message}. Stopping timer.`);
					// Ensure timer doesn't run again if update failed
					if (this.instancesState.has(instanceId)) {
						this.instancesState.get(instanceId)!.intervalTimerId = undefined;
					}
				}
			}, intervalMilliseconds);

			streamDeck.logger.info(`[${instanceId}] Interval timer SET for ${intervalSeconds} seconds.`);
		} else {
			streamDeck.logger.info(`[${instanceId}] Interval timer disabled (interval is 0).`);
		}
	}

	/**
	 * Starts the marquee effect for a specific action instance's title.
	 * @param instanceId The ID of the action instance.
	 * @param actionInstance The Action instance.
	 */
	startMarquee(instanceId: string, actionInstance: Action<HttpCallerSettings>): void {
		const state = this.instancesState.get(instanceId);
		if (!state) {
			streamDeck.logger.error(`[${instanceId}] State not found in startMarquee!`);
			return;
		}

		// Ensure conditions for marquee are met
		if (!actionInstance.isKey() || !state.fullTitle || state.fullTitle.length <= MAX_TITLE_LENGTH) {
			streamDeck.logger.debug(`[${instanceId}] Marquee not needed or action is not a key. Stopping any existing marquee.`);
			this.stopMarquee(instanceId); // Stop if running
			// Set the static title if available
			if (state.fullTitle && actionInstance.isKey()) {
				actionInstance.setTitle(state.fullTitle);
			}
			return;
		}

		streamDeck.logger.info(`[${instanceId}] Starting marquee for title: "${state.fullTitle}"`);
		state.marqueeOffset = 0;
		state.marqueeIntervalCounter = 0;

		// Function to perform a single step of the marquee animation
		const stepMarquee = async () => {
			const currentState = this.instancesState.get(instanceId); // Get fresh state

			// Check if marquee should stop (state gone, timer changed, title too short)
			if (!currentState || !currentState.marqueeTimerId || !currentState.fullTitle || currentState.fullTitle.length <= MAX_TITLE_LENGTH) {
				streamDeck.logger.info(`[${instanceId}] Marquee stopping (state missing, timer cleared, or title shortened).`);
				if (currentState) currentState.marqueeTimerId = undefined; // Mark as stopped
				// Restore full title if possible
				if (currentState?.fullTitle && actionInstance.isKey()) {
					try { await actionInstance.setTitle(currentState.fullTitle); } catch (e) { /* Ignore error setting title on stop */ }
				}
				return; // Stop recursion
			}

			// Increment counter and offset based on scroll factor
			currentState.marqueeIntervalCounter++;
			if (currentState.marqueeIntervalCounter % MARQUEE_SCROLL_FACTOR === 0) {
				currentState.marqueeOffset++;
			}

			// Prepare title for wrapping/scrolling
			const paddedTitle = currentState.fullTitle + "  |  "; // Add padding for visual separation
			const wrappedOffset = currentState.marqueeOffset % paddedTitle.length;

			// Extract the portion of the text to display
			const displayTitle = (paddedTitle + paddedTitle).substring(wrappedOffset, wrappedOffset + MAX_TITLE_LENGTH);

			try {
				if (actionInstance.isKey()) {
					await actionInstance.setTitle(displayTitle.trim()); // Update the key title
				}

				// Check if the timer ID is still the same before scheduling the next step
				// This prevents race conditions if stopMarquee was called concurrently
				if (this.instancesState.get(instanceId)?.marqueeTimerId === state.marqueeTimerId) {
					currentState.marqueeTimerId = setTimeout(stepMarquee, MARQUEE_UPDATE_INTERVAL_MS); // Schedule next step
				} else {
					streamDeck.logger.info(`[${instanceId}] Marquee timer ID changed during step, stopping.`);
				}
			} catch (err: any) {
				streamDeck.logger.error(`[${instanceId}] Error setting title during marquee step: ${err.message}. Stopping marquee.`);
				this.stopMarquee(instanceId); // Stop marquee on error
			}
		};

		// Clear any existing marquee timer and start the new one
		clearTimeout(state.marqueeTimerId);
		state.marqueeTimerId = setTimeout(stepMarquee, MARQUEE_UPDATE_INTERVAL_MS);
	}

	/**
	 * Stops the marquee effect for a specific action instance.
	 * @param instanceId The ID of the action instance.
	 */
	stopMarquee(instanceId: string): void {
		const state = this.instancesState.get(instanceId);
		if (state && state.marqueeTimerId) {
			clearTimeout(state.marqueeTimerId);
			state.marqueeTimerId = undefined; // Mark as stopped
			streamDeck.logger.info(`[${instanceId}] Marquee timer stopped.`);
		}
	}

	/**
	 * Helper to set the title and ensure any running marquee is stopped first.
	 * @param instanceId Action instance ID.
	 * @param actionInstance Action instance.
	 * @param title The title to set.
	 */
	private async setTitleAndStopMarquee(instanceId: string, actionInstance: Action<HttpCallerSettings>, title: string): Promise<void> {
		const state = this.instancesState.get(instanceId);
		if (!state) return;

		this.stopMarquee(instanceId); // Stop marquee first
		state.fullTitle = title; // Update the stored full title
		if (actionInstance.isKey()) {
			await actionInstance.setTitle(title); // Set the static title
		}
	}

	/**
	 * Helper to set the title and manage starting/stopping the marquee based on length and settings.
	 * @param instanceId Action instance ID.
	 * @param actionInstance Action instance.
	 * @param newTitle The new full title.
	 * @param marqueeEnabled Whether marquee is enabled in settings.
	 */
	private async setTitleAndManageMarquee(instanceId: string, actionInstance: Action<HttpCallerSettings>, newTitle: string, marqueeEnabled: boolean): Promise<void> {
		const state = this.instancesState.get(instanceId);
		if (!state || !actionInstance.isKey()) return;

		const previousFullTitle = state.fullTitle;
		state.fullTitle = newTitle; // Update full title

		// Stop existing marquee if title changed
		if (state.marqueeTimerId && previousFullTitle !== newTitle) {
			this.stopMarquee(instanceId);
		}

		// Decide whether to start marquee or set static/wrapped title
		if (marqueeEnabled && state.fullTitle.length > MAX_TITLE_LENGTH) {
			if (!state.marqueeTimerId) { // Start only if not already running
				this.startMarquee(instanceId, actionInstance);
			}
		} else {
			// Title is short or marquee disabled, ensure marquee is stopped
			this.stopMarquee(instanceId);
			let titleToShow = state.fullTitle;
			// Apply experimental wrapping if marquee is disabled and text is long
			if (!marqueeEnabled && state.fullTitle.length > CHARS_PER_LINE_ESTIMATE) {
				streamDeck.logger.info(`[${instanceId}] Wrapping title (experimental): ${state.fullTitle}`);
				titleToShow = wrapText(state.fullTitle, CHARS_PER_LINE_ESTIMATE);
				streamDeck.logger.info(`[${instanceId}] Wrapped title output:\n${titleToShow}`);
			}
			// Set the static (potentially wrapped) title
			await actionInstance.setTitle(titleToShow);
		}
	}


	/**
	 * Clears all timers associated with a specific action instance state.
	 * @param state The state object for the instance.
	 * @param instanceId The ID for logging purposes.
	 */
	private clearInstanceTimers(state: ActionInstanceState, instanceId: string): void {
		streamDeck.logger.debug(`[${instanceId}] Clearing timers for instance.`);
		clearTimeout(state.intervalTimerId);
		clearTimeout(state.marqueeTimerId);
		clearTimeout(state.longPressTimerId);
		state.intervalTimerId = undefined;
		state.marqueeTimerId = undefined;
		state.longPressTimerId = undefined;
	}

	/**
	 * Attempts to copy the given text to the system clipboard using native commands.
	 * @param textToCopy The text to copy.
	 * @param instanceId The action instance ID for logging.
	 * @param actionInstance The action instance for potential feedback.
	 */
	private async copyToClipboard(textToCopy: string, instanceId: string, actionInstance: Action<HttpCallerSettings>): Promise<void> {
		let command: string;
		let args: string[] = [];
		let processName: string = '';

		switch (process.platform) {
			case 'win32':
				command = 'clip'; // clip.exe should be in PATH
				processName = 'clip.exe';
				break;
			case 'darwin':
				command = 'pbcopy';
				processName = 'pbcopy';
				break;
			// Add linux support if needed (requires checking for xclip/xsel)
			// case 'linux':
			//     command = 'xclip';
			//     args = ['-selection', 'clipboard']; // Example args for xclip
			//     processName = 'xclip';
			// break;
			default:
				streamDeck.logger.warn(`[${instanceId}] Clipboard copy not implemented for platform: ${process.platform}.`);
				if (actionInstance.isKey()) await actionInstance.showAlert();
				return;
		}

		try {
			const child = spawn(command, args);
			let errorOutput = '';
			let processExited = false; // Flag to prevent multiple rejections

			child.stderr.on('data', (data) => { errorOutput += data; });

			await new Promise<void>((resolve, reject) => {
				child.on('error', (err) => {
					if (!processExited) {
						processExited = true;
						reject(new Error(`Failed to spawn '${processName}': ${err.message}`));
					}
				});

				child.on('close', (code) => {
					if (!processExited) {
						processExited = true;
						if (code !== 0) {
							reject(new Error(`'${processName}' exited with code ${code}: ${errorOutput}`));
						} else {
							streamDeck.logger.info(`[${instanceId}] Text copied to clipboard via '${processName}'.`);
							resolve();
						}
					}
				});

				// Write the text to the process's standard input
				child.stdin.write(textToCopy);
				child.stdin.end(); // Close stdin to signal end of input
			});

			// Optional: Show OK feedback on successful copy
			if (actionInstance.isKey()) await actionInstance.showOk();

		} catch (err: any) {
			streamDeck.logger.error(`[${instanceId}] Failed to copy text to clipboard: ${err.message}`);
			if (actionInstance.isKey()) await actionInstance.showAlert();
		}
	}


} // End of HttpCallerAction class