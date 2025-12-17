# Module 2 Group Assignment

CSCI 5117, Fall 2025, [assignment description](https://canvas.umn.edu/courses/518559/pages/project-2)

## App Info:

* Team Name: FOUR LOOPS
* App Name: MediMate
* App Link: https://project2-e9097.web.app

### Students

* Alexander Garduno Garcia, gardu022@umn.edu
* Reshma Rao Chandukudlu Hosamane, chand950@umn.edu
* Tejeshwini Ramesh Subasri, rames189@umn.edu
* Shivank Sapra, sapra013@umn.edu

## Key Features

**Describe the most challenging features you implemented
(one sentence per bullet, maximum 4 bullets):**

* Notification - Implemented both in-app toast notifications and system-level browser notifications, ensuring users enable the required browser permissions to securely store and use FCM tokens.
* Geo location - Determines and stores the nearest pharmacy based on the user’s real-time location when a saved pharmacy is not available.
* Prescription OCR - since real prescriptions vary widely in format and quality, requiring robust handling of imperfect text recognition to convert unstructured images into structured medication records


Which (if any) device integration(s) does your app support?

* Camera
* Location
* System Notification
* Filepicker

Which (if any) progressive web app feature(s) does your app support?

N/A



## Mockup images


**[Link to the Mock-ups](https://app.moqups.com/aICrKLYI99WiVK8dsMVhnzmUICb43yvH/view/page/ae61034cc)**

Note: Please zoom in and out each page to view the full flow and there are 2 pages in total (one for mobile view and one for web).


## Testing Notes

**Is there anything special we need to know in order to effectively test your app? (optional):**

* The medication scheduler usually runs every 5 minutes to check for due medications. To save the credits we have changed it to every hour.
* If a medication time is not specified, the user is notified at 9:00 AM on the medication’s due date.
* Ensure medication and stock notifications are enabled in the Preferences section, and browser notification permissions are granted.
* A pharmacy must be saved in the Settings page to appear in notifications.
* If location access is enabled but no pharmacy is saved, the app automatically selects and stores the nearest pharmacy at the beginning.
* It's a hit or a miss on the iphone and we would suggest testing it on Android.


## Screenshots of Site (complete)

**[Add a screenshot of each key page](https://stackoverflow.com/questions/10189356/how-to-add-screenshot-to-readmes-in-github-repository)
along with a very brief caption:**

Splash Page:

<img width="1897" height="910" alt="image" src="https://github.com/user-attachments/assets/faae1e5c-e48a-4794-b235-eb94fb336863" />


Dashboard:


<img width="1906" height="916" alt="image" src="https://github.com/user-attachments/assets/1ad7d0bd-2903-4c8b-aed5-45b393e8fb50" />

 
Logging a Medicine:

 
<img width="1914" height="939" alt="image" src="https://github.com/user-attachments/assets/045785fb-deed-4b1e-8a37-4452508eb23c" />


Add Medication - with OCR:

 
<img width="1898" height="953" alt="image" src="https://github.com/user-attachments/assets/f8012a86-378b-4f6c-b16d-71b55acc69bd" />

<img width="1919" height="908" alt="image" src="https://github.com/user-attachments/assets/78d9b5c8-24e6-4314-90a8-1279042a65d2" />


My Medications:


<img width="1919" height="871" alt="image" src="https://github.com/user-attachments/assets/98d0bb96-b8e0-42f6-b919-2c7922584873" />

 
Edit Medication:


<img width="700" height="850" alt="image" src="https://github.com/user-attachments/assets/8a7472eb-cf46-4d47-a78a-6816bb4c40b4" />

 
View Inventory:

 
<img width="1919" height="835" alt="image" src="https://github.com/user-attachments/assets/b4bc1a7f-8a16-4b88-8204-34b4f5000fe5" />

 
Settings - Notifications and Pharmacy:


<img width="965" height="846" alt="image" src="https://github.com/user-attachments/assets/42b2fff8-a0dd-4ddb-8275-debbe61daee0" />

<img width="1919" height="818" alt="image" src="https://github.com/user-attachments/assets/beae1228-bda1-49d5-b2c5-429a907588f1" />

<img width="1872" height="455" alt="image" src="https://github.com/user-attachments/assets/a817135b-c49b-401e-a803-0f70863c4af8" />

System Notification:


<img width="808" height="347" alt="image" src="https://github.com/user-attachments/assets/000e89a7-485b-4e31-9ad9-8bc0795efc34" />


## External Dependencies

**Document integrations with 3rd Party code or services here.
Please do not document required libraries (e.g., VUE, Firebase, vuefire).**

* 1.⁠ ⁠Tesseract.js 
•⁠  ⁠Used for OCR to extract text from prescription images uploaded by the user or captured via the device camera. 
•⁠  ⁠OCR results are processed client-side to avoid sending sensitive medical images to external servers. 
•⁠  ⁠The extracted text is passed through a custom RegEx-based parsing pipeline to identify medication names, dosages, and scheduling cues.

* 2.⁠ ⁠Browser Media APIs (getUserMedia)
•⁠  ⁠Used to access the device camera for live prescription capture. 
•⁠  ⁠This enables users—especially on mobile devices—to scan prescriptions using the device camera. Camera access is requested explicitly by user interaction and handled entirely in the browser.

* 3.⁠ ⁠Lucide (lucide-vue-next)
•⁠  ⁠Used icons from the Lucide icon pack for Vue

* 4.⁠ Leaflet
•⁠  Implemented geolocation and pharmacy mapping using Leaflet for interactive maps and ArcGIS services for accurate location lookup and proximity-based pharmacy detection.

* 5. Primevue
•⁠ Used for UI components to ensure consistent styling and responsive interaction.


**If there's anything else you would like to disclose about how your project
relied on external code, expertise, or anything else, please disclose that
here:**

* ⁠At times, OCR might fail on camera capture. OCR accuracy depends heavily on image quality, lighting, and handwriting/print clarity. The application includes user feedback stating when OCR results cannot be confidently extracted.
* ⁠No external AI or cloud OCR services were used. All OCR processing occurs locally in the browser for privacy and security reasons.
* Scheduling logic and dose-tracking behavior were custom-implemented to support flexible medication 
  •⁠  ⁠Day-wise schedules  Everyday, Specific Days, Every Few Days, Custom
  •⁠  ⁠Tracking doses to be taken multiple times during the day

