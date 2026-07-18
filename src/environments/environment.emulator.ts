// Emulator-only environment — used by `npm run start:emulator`.
// The "demo-" project id tells the Firebase SDK this app can never reach
// production; both SDKs are pointed at the local emulator suite started
// with `npm run emulators`. Ports must match firebase.json.
export const environment = {
    production: false,
    useEmulators: true,
    apiBaseUrl: "",
    firebaseVapidKey: "",
    firebaseConfig: {
        apiKey: "demo-api-key",
        authDomain: "127.0.0.1",
        databaseURL: "http://127.0.0.1:9000?ns=demo-expense-tracker-default-rtdb",
        projectId: "demo-expense-tracker",
        storageBucket: "demo-expense-tracker.appspot.com",
        messagingSenderId: "demo-sender-id",
        appId: "demo-app-id",
        measurementId: ""
    },
    cloudinary: {
        cloudName: 'da0zqvrps',
        uploadPreset: 'spendwise_vouchers'
    }
};
