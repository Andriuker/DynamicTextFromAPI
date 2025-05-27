// src/actions/__tests__/httpcaller.test.ts
import { HttpCallerAction } from '../httpcaller';
import { streamDeck, WillAppearEvent, Action, DidReceiveSettingsEvent, SendToPluginEvent } from '@elgato/streamdeck'; // Added SendToPluginEvent
import axios from 'axios'; // This will be the mock from __mocks__

jest.mock('axios');
// More robust mock for @elgato/streamdeck
jest.mock('@elgato/streamdeck', () => {
    const original = jest.requireActual('@elgato/streamdeck');
    const mockSDK = require('../../tests/__mocks__/@elgato/streamdeck'); // Your existing mock
    return {
        ...original, // Keep actual enums, classes etc.
        ...mockSDK,  // Override with jest.fn() implementations from your mock file
        action: jest.fn(() => jest.fn()), // Ensure @action decorator mock is robust
        // Provide a base class for Action that can be instantiated with mocked methods
        Action: class extends original.Action {
            constructor(sd: any, uuid: string) {
                super(sd, uuid);
                // Ensure all methods that might be called on an action instance in tests are jest.fn()
                this.getSettings = jest.fn().mockResolvedValue({});
                this.setSettings = jest.fn().mockResolvedValue(undefined);
                this.setTitle = jest.fn().mockResolvedValue(undefined);
                this.showAlert = jest.fn().mockResolvedValue(undefined);
                this.showOk = jest.fn().mockResolvedValue(undefined);
                this.setImage = jest.fn().mockResolvedValue(undefined);
                this.sendToPropertyInspector = jest.fn().mockResolvedValue(undefined);
            }
        } as any, // Cast to 'any' to satisfy the SingletonAction generic constraints if complex
        SingletonAction: class extends original.SingletonAction {} // Use actual for inheritance if needed
    };
});


const mockStreamDeck = streamDeck as jest.Mocked<typeof streamDeck>;
const mockAxios = axios as jest.Mocked<typeof axios>;

// Helper to create a properly typed mock Action for events
const createMockActionForEvent = (instanceId: string): jest.Mocked<Action<any>> => {
    const mockAction = new Action(mockStreamDeck as any, instanceId) as jest.Mocked<Action<any>>;
    // Ensure methods are fresh mocks for each creation, if necessary, or rely on the class mock
    mockAction.getSettings.mockResolvedValue({}); // Default mock
    mockAction.sendToPropertyInspector.mockClear(); // Clear previous calls
    mockAction.setTitle.mockClear();
    mockAction.showAlert.mockClear();
    return mockAction;
};

describe('HttpCallerAction', () => {
  let actionInstance: HttpCallerAction;
  const mockActionUUID = 'test-action-uuid';
  const mockContext = 'test-context'; // Used in some event constructors

  beforeEach(() => {
    jest.clearAllMocks();
    actionInstance = new HttpCallerAction(mockStreamDeck as any, mockActionUUID);
    // Mock any instance-specific properties or spies if needed, e.g., for _executeRequest
    // (actionInstance as any).context = mockContext; // context is usually on event.action
    // (actionInstance as any).settings = {}; // settings are usually on event.payload.settings
  });

  // describe('updateDataAndTitle'...) 
  // The existing tests for updateDataAndTitle implicitly test _executeRequest.
  // We will review them and add specific tests for "No Match" and other error messages
  // from _executeRequest if they are not adequately covered.
  describe('updateDataAndTitle (via _executeRequest)', () => {
    // Test Case 1: Successful GET request with JSON response and JSONPath extraction
    it('should extract data with JSONPath from JSON GET response and set title', async () => {
      const settings = {
        url: 'https://api.example.com/data',
        method: 'GET' as const,
        responsePath: '$.user.name',
        headers: '',
        body: '',
        updateInterval: 0,
      };
      const mockAction = createMockActionForEvent(mockActionUUID);
      mockAxios.get.mockResolvedValue({ data: { user: { name: 'John Doe' } }, status: 200, statusText: 'OK', headers: {'content-type': 'application/json'}, config: {} });

      await actionInstance.updateDataAndTitle(mockActionUUID, mockAction, settings);

      expect(mockAxios.get).toHaveBeenCalledWith(settings.url, expect.objectContaining({ method: 'GET' }));
      expect(mockAction.setTitle).toHaveBeenCalledWith('John Doe');
      expect(mockAction.showAlert).not.toHaveBeenCalled();
    });

    // Test Case 2: Successful GET request with XML response and XPath extraction
    it('should extract data with XPath from XML GET response and set title', async () => {
      const settings = {
        url: 'https://api.example.com/data.xml',
        method: 'GET' as const,
        responsePath: '/root/user/name/text()',
        headers: '',
        body: '',
        updateInterval: 0,
      };
      const mockAction = createMockActionForEvent(mockActionUUID);
      const xmlResponse = '<root><user><name>Jane Doe</name></user></root>';
      mockAxios.get.mockResolvedValue({ data: xmlResponse, status: 200, statusText: 'OK', headers: {'content-type': 'application/xml'}, config: {} });

      await actionInstance.updateDataAndTitle(mockActionUUID, mockAction, settings);

      expect(mockAxios.get).toHaveBeenCalledWith(settings.url, expect.objectContaining({ method: 'GET' }));
      expect(mockAction.setTitle).toHaveBeenCalledWith('Jane Doe');
      expect(mockAction.showAlert).not.toHaveBeenCalled();
    });

    // Test Case 3: Successful GET request with Plain Text response and Regex extraction (first capture group)
    it('should extract data with Regex (capture group) from Plain Text GET response and set title', async () => {
      const settings = {
        url: 'https://api.example.com/data.txt',
        method: 'GET' as const,
        responsePath: '/Name: (\\w+)/', // Regex to capture word after "Name: "
        headers: '',
        body: '',
        updateInterval: 0,
      };
      const mockAction = createMockActionForEvent(mockActionUUID);
      const textResponse = 'Some text with Name: TestName and more text.';
      mockAxios.get.mockResolvedValue({ data: textResponse, status: 200, statusText: 'OK', headers: {'content-type': 'text/plain'}, config: {} });

      await actionInstance.updateDataAndTitle(mockActionUUID, mockAction, settings);
      
      expect(mockAxios.get).toHaveBeenCalledWith(settings.url, expect.objectContaining({ method: 'GET' }));
      expect(mockAction.setTitle).toHaveBeenCalledWith('TestName'); 
      expect(mockAction.showAlert).not.toHaveBeenCalled();
    });
    
    // Test Case 3b: Regex with no capture group (full match if global, or match[0])
    it('should extract data with Regex (full match) from Plain Text GET response and set title', async () => {
        const settings = {
            url: 'https://api.example.com/data.txt',
            method: 'GET' as const,
            responsePath: '/CODE-\\d+/', 
            headers: '', body: '', updateInterval: 0,
        };
        const mockAction = createMockActionForEvent(mockActionUUID);
        const textResponse = 'Product ID: CODE-12345';
        mockAxios.get.mockResolvedValue({ data: textResponse, status: 200, statusText: 'OK', headers: { 'content-type': 'text/plain' }, config: {} });

        await actionInstance.updateDataAndTitle(mockActionUUID, mockAction, settings);
        expect(mockAction.setTitle).toHaveBeenCalledWith('CODE-12345');
    });


    // Test Case 4: Request with invalid JSON in Headers
    it('should show "Header Err" for invalid JSON in headers', async () => {
      const settings = {
        url: 'https://api.example.com/data',
        method: 'GET' as const,
        responsePath: '',
        headers: '{invalid_json', // Invalid JSON
        body: '',
        updateInterval: 0,
      };
      const mockAction = createMockActionForEvent(mockActionUUID);
      await actionInstance.updateDataAndTitle(mockActionUUID, mockAction, settings);

      expect(mockAction.setTitle).toHaveBeenCalledWith('Header Err');
      expect(mockAction.showAlert).toHaveBeenCalled();
      expect(mockAxios.get).not.toHaveBeenCalled(); 
    });

    // Test Case 5: Request with invalid JSON in Body (for POST)
    it('should show "Body Err" for invalid JSON in body for POST request', async () => {
      const settings = {
        url: 'https://api.example.com/submit',
        method: 'POST' as const,
        responsePath: '',
        headers: '{"Content-Type": "application/json"}',
        body: '{invalid_json_body', // Invalid JSON
        updateInterval: 0,
      };
      const mockAction = createMockActionForEvent(mockActionUUID);
      await actionInstance.updateDataAndTitle(mockActionUUID, mockAction, settings);

      expect(mockAction.setTitle).toHaveBeenCalledWith('Body Err');
      expect(mockAction.showAlert).toHaveBeenCalled();
      expect(mockAxios.post).not.toHaveBeenCalled();
    });

    // Test Case 6: HTTP Error (e.g., 404 Not Found)
    it('should show "Err 404" for HTTP 404 error from Axios error object', async () => {
      const settings = { url: 'https://api.example.com/nonexistent', method: 'GET' as const, headers: '', body: '', updateInterval: 0 };
      const mockAction = createMockActionForEvent(mockActionUUID);
      const error = {
        isAxiosError: true,
        response: { status: 404, data: 'Not Found', statusText: 'Not Found', headers: {}, config: {} }, // Axios error structure
        config: {}, message: 'Request failed with status code 404', name: 'AxiosError'
      };
      mockAxios.get.mockRejectedValue(error); 
      
      await actionInstance.updateDataAndTitle(mockActionUUID, mockAction, settings);

      expect(mockAxios.get).toHaveBeenCalledWith(settings.url, expect.objectContaining({ method: 'GET' }));
      expect(mockAction.setTitle).toHaveBeenCalledWith('Err 404');
      expect(mockAction.showAlert).toHaveBeenCalled();
    });
    
    // Test Case 6b: HTTP Error (e.g., 500) from successful Axios request but error status code
    it('should show "Err 500" for HTTP 500 error status in response', async () => {
      const settings = { url: 'https://api.example.com/servererror', method: 'GET' as const, headers: '', body: '', updateInterval: 0 };
      const mockAction = createMockActionForEvent(mockActionUUID);
      // Axios resolves as the request itself didn't fail network-wise, but server sent error
      mockAxios.get.mockResolvedValue({ status: 500, data: 'Server Error', statusText: 'Internal Server Error', headers: {}, config: {} });
      
      await actionInstance.updateDataAndTitle(mockActionUUID, mockAction, settings);

      expect(mockAxios.get).toHaveBeenCalledWith(settings.url, expect.objectContaining({ method: 'GET' }));
      expect(mockAction.setTitle).toHaveBeenCalledWith('Err 500');
      expect(mockAction.showAlert).toHaveBeenCalled();
    });


    // Test Case 7: Network Error (e.g., timeout)
    it('should show "Timeout" for network error (ECONNABORTED)', async () => {
      const settings = { url: 'https://api.example.com/timeout', method: 'GET' as const, headers: '', body: '', updateInterval: 0 };
      const mockAction = createMockActionForEvent(mockActionUUID);
      const error = { isAxiosError: true, code: 'ECONNABORTED', message: 'Timeout exceeded', name: 'AxiosError', config: {} };
      mockAxios.get.mockRejectedValue(error);
      
      await actionInstance.updateDataAndTitle(mockActionUUID, mockAction, settings);

      expect(mockAxios.get).toHaveBeenCalledWith(settings.url, expect.objectContaining({ method: 'GET' }));
      expect(mockAction.setTitle).toHaveBeenCalledWith('Timeout');
      expect(mockAction.showAlert).toHaveBeenCalled();
    });

    // Test Case 8: No responsePath provided (should display full JSON response, stringified)
    it('should display stringified full JSON response when no responsePath is provided', async () => {
      const settings = { url: 'https://api.example.com/fulldata', method: 'GET' as const, responsePath: '', headers: '', body: '', updateInterval: 0 };
      const mockAction = createMockActionForEvent(mockActionUUID);
      const jsonData = { success: true, data: { value: 42, message: "Hello" } };
      mockAxios.get.mockResolvedValue({ data: jsonData, status: 200, statusText: 'OK', headers: {'content-type': 'application/json'}, config: {} });

      await actionInstance.updateDataAndTitle(mockActionUUID, mockAction, settings);
      
      expect(mockAxios.get).toHaveBeenCalledWith(settings.url, expect.objectContaining({ method: 'GET' }));
      // _executeRequest will stringify the object if no responsePath
      expect(mockAction.setTitle).toHaveBeenCalledWith(JSON.stringify(jsonData)); 
      expect(mockAction.showAlert).not.toHaveBeenCalled();
    });
    
    // Test Case 9: "No Match" for JSONPath
    it('should show "No Match" message when JSONPath does not find data', async () => {
        const settings = { url: 'https://api.example.com/data', method: 'GET' as const, responsePath: '$.user.nonexistent', headers: '', body: '', updateInterval: 0 };
        const mockAction = createMockActionForEvent(mockActionUUID);
        mockAxios.get.mockResolvedValue({ data: { user: { name: 'John Doe' } }, status: 200, headers: { 'content-type': 'application/json' }, config: {} });
        
        await actionInstance.updateDataAndTitle(mockActionUUID, mockAction, settings);
        expect(mockAction.setTitle).toHaveBeenCalledWith('No match for JSONPath.'); // Updated to match _executeRequest's message
        // showAlert should NOT be called for "No Match" as it's a valid (empty) result of extraction
        expect(mockAction.showAlert).not.toHaveBeenCalled();
    });

    // Test Case 10: "No Match" for XPath
    it('should show "No Match" message when XPath does not find data', async () => {
        const settings = { url: 'https://api.example.com/data.xml', method: 'GET' as const, responsePath: '/root/user/nonexistent/text()', headers: '', body: '', updateInterval: 0 };
        const mockAction = createMockActionForEvent(mockActionUUID);
        const xmlResponse = '<root><user><name>Jane Doe</name></user></root>';
        mockAxios.get.mockResolvedValue({ data: xmlResponse, status: 200, headers: { 'content-type': 'application/xml' }, config: {} });

        await actionInstance.updateDataAndTitle(mockActionUUID, mockAction, settings);
        expect(mockAction.setTitle).toHaveBeenCalledWith('No match for XPath.');
        expect(mockAction.showAlert).not.toHaveBeenCalled();
    });

    // Test Case 11: "No Match" for Regex
    it('should show "No Match" message when Regex does not find data', async () => {
        const settings = { url: 'https://api.example.com/data.txt', method: 'GET' as const, responsePath: '/NonExistentPattern: (\\d+)/', headers: '', body: '', updateInterval: 0 };
        const mockAction = createMockActionForEvent(mockActionUUID);
        const textResponse = 'Some text with Number: 12345 and more text.';
        mockAxios.get.mockResolvedValue({ data: textResponse, status: 200, headers: { 'content-type': 'text/plain' }, config: {} });
        
        await actionInstance.updateDataAndTitle(mockActionUUID, mockAction, settings);
        expect(mockAction.setTitle).toHaveBeenCalledWith('No match for Regex.');
        expect(mockAction.showAlert).not.toHaveBeenCalled();
    });

    // Test Case 12: Invalid Regex Format
    it('should show "Regex Err" for invalid regex format', async () => {
        const settings = { url: 'https://api.example.com/data.txt', method: 'GET' as const, responsePath: 'InvalidRegexWithoutSlashes', headers: '', body: '', updateInterval: 0 };
        const mockAction = createMockActionForEvent(mockActionUUID);
        const textResponse = 'Some text.';
        mockAxios.get.mockResolvedValue({ data: textResponse, status: 200, headers: { 'content-type': 'text/plain' }, config: {} });
        
        await actionInstance.updateDataAndTitle(mockActionUUID, mockAction, settings);
        expect(mockAction.setTitle).toHaveBeenCalledWith('Regex Err');
        expect(mockAction.showAlert).toHaveBeenCalled();
    });
    
    // Test for WillAppearEvent
    it('onWillAppear should load settings and call updateDataAndTitle', async () => {
        const initialSettings = { url: 'http://init.com', method: 'GET' as const, responsePath: '$.msg' };
        const mockActionForEvent = createMockActionForEvent(mockActionUUID); // Use helper
        (mockActionForEvent.getSettings as jest.Mock).mockResolvedValue(initialSettings);

        const event = new WillAppearEvent(mockActionForEvent, { // Pass mockActionForEvent directly
            context: mockContext,
            payload: { settings: initialSettings, isInMultiAction: false, controller: "Keypad" },
            action: mockActionUUID, // This is the action instance ID for the event
            device: "test-device",
            event: "willAppear"
        } as any);
        
        const executeReqSpy = jest.spyOn(actionInstance as any, '_executeRequest').mockResolvedValue({status: "success", data: "Initial Data"});
        // updateDataAndTitle is called internally, so we don't need to spy on it unless testing its call signature from onWillAppear
        
        await actionInstance.onWillAppear(event);

        expect(mockActionForEvent.getSettings).toHaveBeenCalled(); 
        expect(executeReqSpy).toHaveBeenCalledWith(initialSettings, mockActionUUID);
        expect(mockActionForEvent.setTitle).toHaveBeenCalledWith("Initial Data"); // Check setTitle on the event's action
    });

    // Test for DidReceiveSettingsEvent
    it('onDidReceiveSettings should update settings and call updateDataAndTitle', async () => {
        const newSettings = {
            url: 'https://api.example.com/updated', method: 'POST' as const, responsePath: '$.result.status',
            headers: '{"X-Custom": "true"}', body: '{"id": 123}', updateInterval: 10,
        };
        const mockActionForEvent = createMockActionForEvent(mockActionUUID);
        (mockActionForEvent.getSettings as jest.Mock).mockResolvedValue(newSettings); // For resetIntervalTimer

        const event = new DidReceiveSettingsEvent(mockActionForEvent, { // Pass mockActionForEvent
            context: mockContext,
            payload: { settings: newSettings, isInMultiAction: false, controller: "Keypad", coordinates: { row: 0, column: 0 } },
            action: mockActionUUID, device: "test-device", event: "didReceiveSettings"
        } as any);

        const executeReqSpy = jest.spyOn(actionInstance as any, '_executeRequest').mockResolvedValue({status: "success", data: "Updated Data"});
        const intervalSpy = jest.spyOn(global, 'setInterval');
        const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

        await actionInstance.onDidReceiveSettings(event);
        
        expect(executeReqSpy).toHaveBeenCalledWith(newSettings, mockActionUUID);
        expect(mockActionForEvent.setTitle).toHaveBeenCalledWith("Updated Data");
        expect(clearIntervalSpy).toHaveBeenCalled(); 
        expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), newSettings.updateInterval * 1000);
    });
  });

  describe('onSendToPlugin', () => {
    let mockActionForEvent: jest.Mocked<Action<any>>; // Use the helper
    let _executeRequestSpy: jest.SpyInstance;

    beforeEach(() => {
        mockActionForEvent = createMockActionForEvent(mockActionUUID); // Create a fresh mock action for each test
        // Spy on the private method _executeRequest for the specific actionInstance
        _executeRequestSpy = jest.spyOn(actionInstance as any, '_executeRequest');
    });

    afterEach(() => {
        _executeRequestSpy.mockRestore(); // Restore the original method to avoid interference
    });

    it("should process 'runTestRequest' event and send successful result to PI", async () => {
        const testSettings = { url: 'http://test.com', method: 'GET' as const, responsePath: '$.data' };
        (mockActionForEvent.getSettings as jest.Mock).mockResolvedValue(testSettings);
        _executeRequestSpy.mockResolvedValue({ status: 'success', data: 'Test Data' });

        const event = new SendToPluginEvent(mockActionForEvent, { // Pass mockActionForEvent
            payload: { payload: { event: 'runTestRequest' } } // Corrected nested payload for SendToPluginEvent
        } as any); // Cast as any due to complex type if full event structure isn't mocked
        
        await actionInstance.onSendToPlugin(event);

        expect(mockActionForEvent.getSettings).toHaveBeenCalled();
        expect(_executeRequestSpy).toHaveBeenCalledWith(testSettings, mockActionUUID);
        expect(mockActionForEvent.sendToPropertyInspector).toHaveBeenCalledWith({ testResult: 'Test Data' });
    });

    it("should process 'runTestRequest' event and send error result to PI", async () => {
        const testSettings = { url: 'http://error.com', method: 'POST' as const };
        (mockActionForEvent.getSettings as jest.Mock).mockResolvedValue(testSettings);
        _executeRequestSpy.mockResolvedValue({ status: 'error', message: 'Test Error' });

        const event = new SendToPluginEvent(mockActionForEvent, {
            payload: { payload: { event: 'runTestRequest' } }
        } as any);

        await actionInstance.onSendToPlugin(event);

        expect(mockActionForEvent.getSettings).toHaveBeenCalled();
        expect(_executeRequestSpy).toHaveBeenCalledWith(testSettings, mockActionUUID);
        expect(mockActionForEvent.sendToPropertyInspector).toHaveBeenCalledWith({ testResult: 'Error: Test Error' });
    });
    
    it("should process 'runTestRequest' and send stringified object data to PI if data is object", async () => {
        const testSettings = { url: 'http://object.com', method: 'GET' as const };
        const returnedData = { key: 'value', nested: { num: 1 } };
        (mockActionForEvent.getSettings as jest.Mock).mockResolvedValue(testSettings);
        _executeRequestSpy.mockResolvedValue({ status: 'success', data: returnedData });

        const event = new SendToPluginEvent(mockActionForEvent, { 
            payload: { payload: { event: 'runTestRequest' } } 
        } as any);
        
        await actionInstance.onSendToPlugin(event);
        expect(mockActionForEvent.sendToPropertyInspector).toHaveBeenCalledWith({ testResult: JSON.stringify(returnedData, null, 2) });
    });

    it("should process 'runTestRequest' and send message if data is undefined (e.g. No Match)", async () => {
        const testSettings = { url: 'http://nomatch.com', method: 'GET' as const, responsePath: '$.noDataHere' };
        (mockActionForEvent.getSettings as jest.Mock).mockResolvedValue(testSettings);
        _executeRequestSpy.mockResolvedValue({ status: 'success', message: 'No Match Found', data: undefined });

        const event = new SendToPluginEvent(mockActionForEvent, { 
            payload: { payload: { event: 'runTestRequest' } } 
        } as any);
        
        await actionInstance.onSendToPlugin(event);
        expect(mockActionForEvent.sendToPropertyInspector).toHaveBeenCalledWith({ testResult: 'No Match Found' });
    });


    it("should not process event if it is not 'runTestRequest'", async () => {
        const testSettings = { url: 'http://test.com' };
        (mockActionForEvent.getSettings as jest.Mock).mockResolvedValue(testSettings);

        const event = new SendToPluginEvent(mockActionForEvent, {
            payload: { payload: { event: 'someOtherEventFromPI' } } // Different event
        } as any);

        await actionInstance.onSendToPlugin(event);

        // getSettings is part of the event action but shouldn't be called *by the handler logic* for this event.
        // _executeRequest and sendToPropertyInspector are key indicators.
        expect(_executeRequestSpy).not.toHaveBeenCalled();
        expect(mockActionForEvent.sendToPropertyInspector).not.toHaveBeenCalled();
    });
  });
});
