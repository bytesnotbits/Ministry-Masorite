# Ministry Scribe v. v0.01

### **Core Principles for Simplicity, Elegance, and Intuitive Design**

To ensure the website is user-friendly, especially for older individuals, the design should prioritize clarity and ease of use over complex features.

*   **High Contrast and Legible Fonts:** Use a clean and simple color palette with high contrast between the text and the background (e.g., dark text on a light background). Opt for large, easily readable fonts such as Sans-Serif.
*   **Clear and Consistent Layout:** A consistent and logical layout will help users navigate the application intuitively. Important information and primary actions should be prominently displayed.
*   **Descriptive Labels:** Buttons and form fields should have clear and descriptive labels. Instead of just an icon, use text like "Add a New House" or "Save Notes."
*   **Minimalism:** Avoid cluttering the interface with unnecessary elements. Every item on the screen should serve a purpose. This creates a more focused and less overwhelming experience.

### **Technological Approach: The Progressive Web App (PWA)**

For the core requirement of offline functionality, a Progressive Web App (PWA) is the ideal solution. A PWA is a type of web application that can be "installed" on a device (like a tablet or computer) and can work offline.

*   **Offline Access:** PWAs use a technology called "service workers" to store the application's files and data on your device. This means that once the website is loaded for the first time with an internet connection, it will be available to use even when you are in an area with no cell service.
*   **No App Store Needed:** Unlike traditional mobile apps, a PWA doesn't need to be downloaded from an app store. Users can simply visit the website in their browser and then add it to their home screen for easy access.
*   **Cross-Platform Compatibility:** A PWA will work on most modern browsers and devices, including laptops, tablets, and smartphones.

### **Data Storage and Management**

To store your research data directly on your device for offline use, the application will use a browser-based database technology called **IndexedDB**.

*   **On-Device Storage:** IndexedDB allows for the storage of large amounts of structured data. All the information you collect—addresses, notes, names, etc.—will be safely stored in your browser's local storage.
*   **Data Persistence:** The data will remain on your device even if you close the browser or restart your device.

### **Website Structure and User Flow**

Here’s a potential structure for the website, designed for simplicity:

**1. The "Territories" Screen (Homepage)**

*   This will be the main screen of the application.
*   It will display a list of the streets or territories you have created (e.g., "Maple Street," "Oak Avenue - Territory 5").
*   A large, clear button labeled "**+ Add New Territory**" will be present to add a new street.

**2. The "Territory View" Screen**

*   When you tap on a territory from the homepage, you will be taken to this screen.
*   It will show a list of all the houses you have added for that specific street.
*   Each house in the list will display key information at a glance, such as the address and perhaps a small icon indicating if there's a "No Trespassing" sign.
*   A prominent button labeled "**+ Add New House**" will allow you to add a new address to the list.

**3. The "House Details" Screen**

*   Tapping on a specific house from the "Territory View" will open this screen.
*   This is where you will see and edit all the information for that address:
    *   **Address:** Clearly displayed at the top.
    *   **Mailbox Available?** A simple "Yes/No" toggle or checkbox.
    *   **No Trespassing/Keep Out Notice?** Another "Yes/No" toggle.
    *   **Individuals Met:** A section to list the names of people you've met. You can have a simple "Add Name" button here.
    *   **Visit Notes:** A chronological list of your visits. Each visit entry will show the date and the notes from that visit. A large button like "**+ Add New Visit Note**" will open a simple text area for you to type in your notes for a new visit.

### **Backup and Restore Functionality**

This is a crucial feature for data safety.

*   **Backup (Export):**
    *   In a "Settings" or "Data Management" section of the website, there will be a clear button labeled "**Backup Data**."
    *   When you click this, the application will gather all your data from IndexedDB and package it into a single file.
    *   The browser will then prompt you to save this file. The filename will be automatically generated in your desired format, for example, `New York - Maple Street (Territory 3).json`.
*   **Restore (Import):**
    *   In the same section, there will be a button labeled "**Restore Data**."
    *   Clicking this will open a file picker, allowing you to select a previously saved backup file.
    *   The application will then read the data from the file and load it back into the application. A confirmation message will be shown to prevent accidental data overwrites.

### **How to Get This Built**

To bring this design to life, you would typically need the help of a web developer. You can provide them with this detailed plan. The key technologies they would likely use are:

*   **HTML, CSS, and JavaScript:** The fundamental building blocks of the website.
*   **A JavaScript Framework (Optional but Recommended):** Frameworks like Vue.js or React can help in building a more robust and maintainable application.
*   **Service Workers and Web App Manifest:** These are the core components for enabling PWA functionality.

By following these design principles and the proposed technological approach, you can create a website that is not only powerful and functional for your volunteer ministry but also a pleasure to use for individuals of all technical skill levels.
