**Read in other languages:** [Español](README_ES.md)

# DynamicTextFromAPI - Stream Deck Plugin

**Author:** Andriuker
**Version:** 0.9.0

A plugin for Elgato Stream Deck that allows you to configure and execute HTTP requests (GET, POST, PUT, DELETE, PATCH) and display dynamic data extracted from the JSON response directly in a button's title.

![Screenshot](com.andriuker.dynamictextfromapi.sdPlugin/imgs/example.png)

## Key Features

* **Flexible HTTP Requests:** Make calls to APIs using GET, POST, PUT, DELETE, and PATCH methods.
* **Comprehensive Configuration:** Define the endpoint URL, Headers (in JSON format), and Body (JSON or plain text) for your request.
* **Data Extraction:** Use "dot notation" (e.g., `data.user.name`, `items[0].value`) to easily extract the specific data you need from the JSON response.
* **Dynamic Title:** Display the extracted data directly as the Stream Deck button's title.
* **Automatic Update:** Set an interval (in seconds) for the request to automatically repeat and keep the title updated. `0` means manual execution only.
* **Marquee Effect (Scroll):** If the extracted text is too long, activate the "Marquee" option to display it with a horizontal scrolling animation.
* **Visual Feedback (Optional):** Enable or disable a temporary green checkmark (`✓`) when manually pressing the button.
* **Word Wrap (Experimental):** Attempts to split long titles into multiple lines (by inserting `\n`) when the Marquee effect is disabled. *Note: Effectiveness depends on Stream Deck's rendering.*
* **Copy to Clipboard:** Long press the button (~750ms) to copy the current title text directly to your clipboard.

## Installation

1.  Download the latest version of the plugin from the [**Releases**](https://github.com/Andriuker/DynamicTextFromAPI/releases) section. You will need the file with the `.streamDeckPlugin` extension.
2.  Double-click on the downloaded file (`com.andriuker.dynamictextfromapi.streamDeckPlugin`).
3.  The Stream Deck software will ask if you want to install the plugin. Confirm the installation.

## Usage and Configuration

Once installed, you will find a new action called **"HTTP Caller"** in the list of actions within the Stream Deck software, under the **"Dynamic Text From API"** category.

1.  Drag the "HTTP Caller" action onto an empty button on your Stream Deck.
2.  Select the button to view the Property Inspector panel and configure the request:

    ![Property Inspector Screenshot](com.andriuker.dynamictextfromapi.sdPlugin/imgs/pi_screenshot_placeholder.png)

    * **HTTP Method:** Select the HTTP method for your request (GET, POST, PUT, DELETE, PATCH).
    * **URL:** Enter the full URL of the API endpoint you want to call. Ensure it is valid.
    * **Headers (JSON):** Enter the necessary HTTP headers in valid JSON format. Each key-value pair represents a header. Example:
        ```json
        {
          "Content-Type": "application/json",
          "Authorization": "Bearer YOUR_SECRET_TOKEN",
          "X-Custom-Header": "Value"
        }
        ```
        Leave it empty if no headers are needed. Invalid JSON will display "Header Err" on the button.
    * **Body (JSON/Text):** Enter the request body, required for methods like POST, PUT, PATCH.
        * If the `Content-Type` header is `application/json`, ensure the body is valid JSON. Invalid JSON will display "Body Err".
        * For other `Content-Type`, the body will be treated as plain text.
        * Leave it empty for GET/DELETE or if no body is required.
    * **Response Path (Dot Notation):** Specify the path to extract the desired data from the JSON response. Use dot notation for nested objects and square brackets for arrays. Examples:
        * `data.value`
        * `results[0].name.first`
        * `ip`
        * `user` (If the value is an object, it will be displayed as a JSON string: `{"id":1,...}`)
        If left empty, the plugin will attempt to display the full response (which may result in `[Object]`, long text, or the direct value if it's not an object).
    * **Update Interval (seconds):** The number of seconds between each automatic request execution. `0` disables automatic updates; the request will only run when the button is pressed.
    * **Enable Marquee for long text:** Check this box if you want texts exceeding approximately 15 characters to be displayed with a horizontal scrolling (marquee) animation.
    * **Show 'OK' on Press:** Check this box to see a quick visual confirmation (green checkmark `✓`) on the button every time you press it manually.

## Practical Examples

**1. Display Public IP:**

* **Method:** `GET`
* **URL:** `https://api.ipify.org?format=json`
* **Headers:** (Empty)
* **Body:** (Empty)
* **Response Path:** `ip`
* **Update Interval:** `600` (Updates every 10 minutes)
* **Result:** The button will display your current public IP address.

**2. Get Post Title (JSONPlaceholder):**

* **Method:** `GET`
* **URL:** `https://jsonplaceholder.typicode.com/posts/1`
* **Headers:** (Empty)
* **Body:** (Empty)
* **Response Path:** `title`
* **Update Interval:** `0` (Manual only)
* **Result:** The button will display the post title. Press it to refresh (though the data will be the same).

**3. Send a Simple POST (httpbin.org):**

* **Method:** `POST`
* **URL:** `https://httpbin.org/post`
* **Headers:** `{"Content-Type": "application/json"}`
* **Body:** `{"myData": 123, "active": true}`
* **Response Path:** `json.myData` (httpbin returns what was sent inside a `json` key)
* **Update Interval:** `0`
* **Result:** The button should display `123` after pressing.

### Copy Title to Clipboard

If you need to quickly copy the value displayed on the button (e.g., an IP, an ID, a name, etc.), simply **long-press the button** on your Stream Deck for approximately 3/4 of a second (750ms). The current title text will be automatically copied to your clipboard.

## Notes and Limitations

* **Error Handling:** The plugin displays basic errors in the title (`Req Error`, `Timeout`, `Net Error`, `Err [Code]`, `Header Err`, `Body Err`). For specific details, check the plugin logs (enable debug mode in Stream Deck if needed).
* **JSON Validation:** Ensure the JSON entered in Headers and Body (when applicable) is strictly valid. You can use online validators.
* **Word Wrap (`\n`):** The line wrapping function for long texts without marquee is experimental. It inserts `\n` based on a character estimate (`CHARS_PER_LINE_ESTIMATE` in the code). Its final appearance depends on how Stream Deck renders these characters and may vary or not work as expected.

* **Security:** Avoid entering highly sensitive API tokens directly in the Headers field if the Stream Deck profile might be shared. Consider security implications when dealing with APIs.

## Support

If you encounter any issues, have suggestions, or want to contribute, please open an [**Issue**](https://github.com/Andriuker/DynamicTextFromAPI/issues) on the GitHub repository.

## License

[MIT License](LICENSE.txt)

---