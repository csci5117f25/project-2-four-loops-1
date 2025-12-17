import { ref } from "vue";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { getFirestore, doc, setDoc, getDoc, updateDoc, deleteField } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { showToast } from "@/services/toastBus";

export const needsNotificationPrompt = ref(false);

export function useNotifications() {
  const permission = ref(Notification.permission);
  const messaging = getMessaging();
  const db = getFirestore();
  const auth = getAuth();

  /**
   * DELETE TOKEN HELPER
   */
  const removeFCMToken = async () => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, { fcmToken: deleteField() });
      console.log("🗑️ FCM Token deleted because notifications were blocked/disabled.");
    } catch (e) {
      console.error("Error deleting FCM token:", e);
    }
  };

  /**
   * 1. CHECK STATUS (Runs on Load)
   */
  const checkTokenStatus = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const browserPerm = Notification.permission;
    permission.value = browserPerm;

    try {
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.exists() ? userSnap.data() : {};
      const hasToken = !!userData.fcmToken;

      if (browserPerm === "denied" && hasToken) {
        console.log("🚫 Detected 'Denied' permission with active token. Deleting...");
        await removeFCMToken();
        needsNotificationPrompt.value = true;
        return;
      }

      const prefRef = doc(db, "users", user.uid, "preferences", "general");
      const prefSnap = await getDoc(prefRef);
      const prefData = prefSnap.exists() ? prefSnap.data() : {};
      
      const isAnyEnabled = (prefData.enableNotifications !== false) || (prefData.enableStockAlerts === true);

      if (!isAnyEnabled) {
        if (hasToken) await removeFCMToken();
        needsNotificationPrompt.value = false;
        return;
      }

      if (browserPerm === "granted") {
        if (!hasToken) {
          console.log("ℹ️ Permission granted but Token missing. Fetching silently...");
          await askPermission();
        }
        needsNotificationPrompt.value = false;
      } else {
        needsNotificationPrompt.value = true;
      }

    } catch (e) {
      console.error("Error checking token status:", e);
    }
  };

  /**
   * 2. LIVE LISTENER
   */
  const initPermissionListener = async () => {
    if (!('permissions' in navigator)) return;

    try {
      const status = await navigator.permissions.query({ name: 'notifications' });
      status.onchange = async () => {
        console.log("🔄 Browser Permission Changed to:", status.state);
        permission.value = status.state;

        if (status.state !== 'granted') {
          console.log("🛑 User revoked permission. Deleting token...");
          await removeFCMToken();
          needsNotificationPrompt.value = true;
        } else {
          checkTokenStatus(); 
        }
      };
    } catch (e) {
      console.error("Permission listener error:", e);
    }
  };

  /**
   * ASK PERMISSION
   */
  const askPermission = async () => {
    console.log("🔔 Asking Permission...");
    try {
      const status = await Notification.requestPermission();
      permission.value = status;

      if (status === "denied") {
        showToast({
          severity: "error",
          summary: "Notifications Blocked",
          detail: "Click the Lock icon 🔒 -> Reset permissions -> Reload page.",
          life: 8000
        });
        await removeFCMToken(); 
        return null;
      }

      if (status !== "granted") return null;

      if (!('serviceWorker' in navigator)) throw new Error("No SW support.");
      const registration = await navigator.serviceWorker.ready;

      const vapidKey = "BFuddni8Ho8BGympjTzzVgDuNs2qYC9f3b8rSATk94sY077I9Kf0pkucBgDr4a9ka9BqGHmrrf0n1CwM_va-MEg";
      const fcmToken = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });

      if (fcmToken) {
        const user = auth.currentUser;
        if (user) {
          await setDoc(doc(db, "users", user.uid), { fcmToken }, { merge: true });
          console.log("💾 Token saved.");
        }
        needsNotificationPrompt.value = false;
        return fcmToken;
      }

    } catch (err) {
      console.error("❌ Token Error:", err);
      return null;
    }
  };

  /**
   * HANDLE INCOMING MESSAGES (Foreground / App Open)
   */
  onMessage(messaging, (payload) => {
    console.log("🔥 Foreground Message Received:", payload);
    const { title, body } = payload.notification || {};
    const data = payload.data || {};

    let detailHtml = body;

    // If stock alert has a map link, create a clickable HTML link
    if (data.mapUrl && data.pharmacyName) {
      detailHtml = `${body} <br/> 
        Refill at: <a href="${data.mapUrl}" target="_blank" style="color: #4ade80; text-decoration: underline; font-weight: bold;">
          ${data.pharmacyName}
        </a>`;
    }

    // 1. Show In-App Toast (Now renders the HTML link via App.vue update)
    showToast({
      severity: "success",
      summary: title || "MediMate Reminder",
      detail: detailHtml, 
      life: 8000, 
    });

    // 2. REMOVED: System Notification generation.
    // This ensures that if the app is open, we ONLY show the Toast, not a system popup.
    // The Service Worker handles system notifications when the app is closed.
  });

  return { 
    permission, 
    askPermission, 
    removeFCMToken, 
    checkTokenStatus,
    initPermissionListener 
  };
}