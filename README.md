**Read in other languages:** [Español](README_ES.md)

# DynamicTextFromAPI - Stream Deck Plugin

**Author:** Andriuker  
**Version:** 0.10.0

A plugin for Elgato Stream Deck that allows you to configure and execute HTTP requests (GET, POST, PUT, DELETE, PATCH) and display dynamic data extracted from the JSON response directly on a key's title.

![Screenshot](com.andriuker.dynamictextfromapi.sdPlugin/imgs/example.png)

## Key Features

* **Flexible HTTP Requests:** Make calls to APIs using GET, POST, PUT, DELETE, and PATCH methods.
* **Comprehensive Configuration:** Define the endpoint URL, Headers (in JSON format), and Body (JSON or plain text) for your request.
* **Data Extraction:** Use "dot notation" (e.g., `data.user.name`, `items[0].value`) to easily extract the specific data you need from the JSON response using [JSONPath-Plus syntax](https://goessner.net/articles/JsonPath/).
* **Dynamic Title:** Display the extracted data directly as the Stream Deck key's title.
* **Automatic Update:** Set an interval (in seconds) for the request to automatically repeat and keep the title updated. `0` means manual execution only (on key press).
* **Marquee Effect (Scroll):** If the extracted text is too long, activate the "Marquee" option to display it with a horizontal scrolling animation.
* **Visual Feedback (Optional):** Enable or disable a temporary green checkmark (`✓`) when manually pressing the key.
* **Word Wrap (Experimental):** Attempts to split long titles into multiple lines (by inserting `\n`) when the Marquee effect is disabled. *Note: Effectiveness depends on Stream Deck's rendering capabilities.*
* **Copy to Clipboard:** Long press the key (~750ms) to copy the current title text directly to your clipboard.

## Installation

1.  Download the latest version of the plugin from the [**Releases**](https://github.com/Andriuker/DynamicTextFromAPI/releases) section on GitHub. You will need the file with the `.streamDeckPlugin` extension.
2.  Double-click on the downloaded file (`com.andriuker.dynamictextfromapi.streamDeckPlugin`).
3.  The Stream Deck software will ask if you want to install the plugin. Confirm the installation.

## Usage and Configuration

Once installed, you will find a new action called **"HTTP Caller"** in the list of actions within the Stream Deck software, under the **"Dynamic Text From API"** category.

1.  Drag the "HTTP Caller" action onto an empty key on your Stream Deck.
2.  Select the key to view the Property Inspector panel and configure the request:

    ![Property Inspector Screenshot](com.andriuker.dynamictextfromapi.sdPlugin/imgs/pi_screenshot.png) * **HTTP Method:** Select the HTTP method for your request (GET, POST, PUT, DELETE, PATCH).
    * **URL:** Enter the full URL of the API endpoint you want to call. Ensure it is valid (e.g., `https://api.example.com/data`).
    * **Headers (JSON):** Enter the necessary HTTP headers in valid JSON format. Each key-value pair represents a header. Example:
        ```json
        {
          "Content-Type": "application/json",
          "Authorization": "Bearer YOUR_SECRET_TOKEN",
          "X-Custom-Header": "Value"
        }
        ```
        Leave it empty if no headers are needed. Invalid JSON will display "Header Err" on the key.
    * **Body (JSON/Text):** Enter the request body, required for methods like POST, PUT, PATCH.
        * If the `Content-Type` header is `application/json`, ensure the body is valid JSON. Invalid JSON will display "Body Err".
        * For other `Content-Type` values, the body will be treated as plain text.
        * Leave it empty for GET/DELETE or if no body is required.
    * **Response Path (Dot Notation):** Specify the path to extract the desired data from the response. Use dot notation for JSON, XPath for XML.
        * If the value is an object or array, it will be displayed as a JSON string (e.g., `{"id":1,...}` or `[1,2,3]`).
        * If left empty, the plugin will attempt to display the full response.
    * **Update Interval (seconds):** The number of seconds between each automatic request execution. `0` disables automatic updates; the request will only run when the key is pressed. Minimum interval recommended is usually 5-10 seconds to avoid rate limiting.
    * **Enable Marquee for long text:** Check this box if you want texts exceeding approximately 10 characters to be displayed with a horizontal scrolling (marquee) animation.
    * **Show 'OK' on Press:** Check this box to see a quick visual confirmation (green checkmark `✓`) on the key every time you press it manually.
    * **Test Request Button:** Below the configuration options in the Property Inspector, you'll find a "Test Request" button.
        * Clicking this button will immediately execute the HTTP request using the current settings entered in the fields above (URL, Method, Headers, Body, Response Path).
        * The result of this test request (either the extracted data, a success message, or an error message) will be displayed in a "Test Result" box directly below the button.
        * This allows you to quickly verify your configuration and see what data the plugin will attempt to fetch and display without needing to trigger the action on the Stream Deck key itself or wait for an update interval.
        * This is particularly useful for debugging your response path or ensuring your headers and body are correctly formatted.

## Practical Examples

**1. Display Public IP:**

* **Method:** `GET`
* **URL:** `https://api.ipify.org?format=json`
* **Headers:** (Empty)
* **Body:** (Empty)
* **Response Path:** `ip`
* **Update Interval:** `600` (Updates every 10 minutes)
* **Result:** The key will display your current public IP address.

**2. Parse XML Response (w3schools API):**

* **Method:** `GET`
* **URL:** `https://www.w3schools.com/xml/note.xml`
* **Headers:** (Empty)
* **Body:** (Empty)
* **Response Path:** `//note/to`
* **Update Interval:** `0`
* **Result:** The key will display the value of the `<to>` element in the XML response (e.g., "Tove").

**3. Extract Data from Plain Text:**

* **Method:** `GET`
* **URL:** `https://api.ipify.org/?format=plaintext`
* **Headers:** (Empty)
* **Body:** (Empty)
* **Response Path:** `/\\d+/g`
* **Update Interval:** `0`
* **Result:** The key will display all numbers found in the response (e.g., "190217222135").

**4. Send a Simple POST (httpbin.org):**

* **Method:** `POST`
* **URL:** `https://httpbin.org/post`
* **Headers:** `{"Content-Type": "application/json"}`
* **Body:** `{"myData": 123, "active": true}`
* **Response Path:** `json.myData` (httpbin returns the sent JSON within a `json` key)
* **Update Interval:** `0`
* **Result:** The key should display `123` after pressing.

### Copy Title to Clipboard

If you need to quickly copy the value displayed on the key (e.g., an IP, an ID, a name, etc.), simply **long-press the key** on your Stream Deck for approximately 3/4 of a second (750ms). The current title text will be automatically copied to your clipboard.

## Notes and Limitations

* **Error Handling:** The plugin displays basic errors in the title (`Req Error`, `Timeout`, `Net Error`, `Err [Code]`, `Header Err`, `Body Err`). For specific details, check the plugin logs (enable debug mode in Stream Deck if needed: `streamdeck dev` via CLI).
* **JSON Validation:** Ensure the JSON entered in Headers and Body (when applicable) is strictly valid. You can use online validators to check.
* **Plain Text Regex:** For plain text responses, you can use a regex pattern in the `Response Path` field to extract specific data.
* **Security:** Avoid entering highly sensitive API tokens directly in the Headers field if the Stream Deck profile might be shared. Consider security implications when dealing with APIs. This plugin makes external network requests as configured by the user.

## Support

If you encounter any issues, have suggestions, or want to contribute, please open an [**Issue**](https://github.com/Andriuker/DynamicTextFromAPI/issues) on the GitHub repository.

## License

[MIT License](LICENSE.txt)

**Disclaimer:** This plugin is not affiliated with or endorsed by Elgato. Stream Deck is a trademark of Elgato.

---

## TO DO / Future Ideas

Here's a list of planned features and improvements:

### Data Handling & Formatting
- [x] Add support for more response formats (XML via XPath, Plain Text via Regex/delimiters).  
  *Support for XML responses using XPath and plain text parsing via Regex has been implemented.*

- [ ] Implement data formatting options (numbers, dates, prefix/suffix, length limit).
- [ ] Improve display of object/array types (show `{...}` or `[...]` instead of `[Object]`).
- [ ] Allow defining multiple response paths (e.g., for multi-line display or title/image separation).

### UI Improvements (Property Inspector)
- [ ] Create a user-friendly key-value editor for headers (replace JSON textarea).
- [ ] Add dedicated fields for common authorization tokens (Bearer, API Key).
- [ ] Implement real-time input validation (URL format, JSON validity for headers/body).
- [x] Add a "Test Request" button in the Property Inspector for immediate feedback.
- [ ] Implement profiles/presets to save and load common request configurations.

### Visual & Feedback Enhancements
- [ ] Implement dynamic key images using `setImage` based on a response value (image URL or status).
- [ ] Add status icons (e.g., green/red) based on response code or a specific value comparison.
- [ ] Allow customization of feedback actions (OK, Alert, none, custom icon).
- [ ] Adapt UI and functionality for Stream Deck + (dials, touch screen).

### Advanced Request Logic
- [ ] Implement variable/template support in URL, Headers, Body (from global settings, other action states, user input).
- [ ] Allow users to configure the request timeout duration.
- [ ] Add an option for automatic retries on request failure.
- [ ] Add configuration for handling HTTP redirects (3xx).

### Quality of Life & Others
- [ ] Investigate and implement improved text word wrapping for key display.
- [ ] Add functionality to import/export action configurations.
- [ ] Localize the Property Inspector interface into multiple languages.