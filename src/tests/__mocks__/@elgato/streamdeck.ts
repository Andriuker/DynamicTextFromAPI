// src/tests/__mocks__/@elgato/streamdeck.ts
export const streamDeck = {
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  connectElgatoStreamDeckSocket: jest.fn(),
  on: jest.fn(),
  send: jest.fn(),
  getSettings: jest.fn().mockResolvedValue({}),
  setSettings: jest.fn().mockResolvedValue(undefined),
  setTitle: jest.fn().mockResolvedValue(undefined),
  showAlert: jest.fn().mockResolvedValue(undefined),
  showOk: jest.fn().mockResolvedValue(undefined),
  setImage: jest.fn().mockResolvedValue(undefined),
  sendToPropertyInspector: jest.fn().mockResolvedValue(undefined),
  registerAction: jest.fn(),
};

export const action = jest.fn(() => jest.fn());
export const SingletonAction = class {};
export class Action extends SingletonAction {
  constructor(protected readonly streamDeck: any, protected readonly uuid: string) {
    super();
  }
  onSendToPlugin = jest.fn();
  getSettings = jest.fn().mockResolvedValue({});
  setSettings = jest.fn().mockResolvedValue(undefined);
  setTitle = jest.fn().mockResolvedValue(undefined);
  showAlert = jest.fn().mockResolvedValue(undefined);
  showOk = jest.fn().mockResolvedValue(undefined);
  setImage = jest.fn().mockResolvedValue(undefined);
  sendToPropertyInspector = jest.fn().mockResolvedValue(undefined);
  isKey() { return true; }
  isEncoder() { return false; }
}

// Mock events
export class WillAppearEvent { constructor(public readonly action: any, public readonly payload: any) {} }
export class WillDisappearEvent { constructor(public readonly action: any, public readonly payload: any) {} }
export class KeyDownEvent { constructor(public readonly action: any, public readonly payload: any) {} }
export class KeyUpEvent { constructor(public readonly action: any, public readonly payload: any) {} }
export class DidReceiveSettingsEvent { constructor(public readonly action: any, public readonly payload: any) {} }
export class SendToPluginEvent { constructor(public readonly action: any, public readonly payload: any) {} }
