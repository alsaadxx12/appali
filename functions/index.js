const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

// Auto-send push notification when a new chat message is created
exports.notifyOnNewMessage = functions.firestore
    .document("conversations/{chatId}/messages/{msgId}")
    .onCreate(async (snap, context) => {
        const msg = snap.data();
        if (!msg) return null;

        const toUid = msg.toUid;
        const senderName = msg.senderName || "موظف";
        const text = msg.text || "رسالة جديدة";

        if (!toUid) return null;

        // Get recipient's FCM tokens
        const userDoc = await admin.firestore().doc(`users/${toUid}`).get();
        if (!userDoc.exists) return null;

        const data = userDoc.data() || {};
        const tokens = data.fcmTokens || (data.fcmToken ? [data.fcmToken] : []);
        if (!tokens.length) return null;

        const payload = {
            notification: {
                title: `رسالة من ${senderName}`,
                body: text,
            },
            data: {
                chatId: context.params.chatId,
                senderId: msg.senderId || "",
                type: "chat_message",
            },
        };

        // Send to all tokens
        const res = await admin.messaging().sendEachForMulticast({
            tokens,
            ...payload,
        });

        // Clean up invalid tokens
        const invalid = [];
        res.responses.forEach((r, i) => {
            if (!r.success) invalid.push(tokens[i]);
        });

        if (invalid.length) {
            const cleaned = tokens.filter((t) => !invalid.includes(t));
            await admin.firestore().doc(`users/${toUid}`).update({ fcmTokens: cleaned });
        }

        return null;
    });

// Send push notification when a new call is created
exports.notifyOnIncomingCall = functions.firestore
    .document("calls/{callId}")
    .onCreate(async (snap, context) => {
        const call = snap.data();
        if (!call) return null;

        const receiverId = call.receiverId;
        const callerName = call.callerName || "مكالمة واردة";

        if (!receiverId) return null;

        // Get receiver's FCM tokens
        const userDoc = await admin.firestore().doc(`users/${receiverId}`).get();
        if (!userDoc.exists) return null;

        const data = userDoc.data() || {};
        const tokens = data.fcmTokens || (data.fcmToken ? [data.fcmToken] : []);
        if (!tokens.length) return null;

        const payload = {
            notification: {
                title: `📞 ${callerName}`,
                body: "مكالمة واردة...",
            },
            data: {
                callId: context.params.callId,
                callerId: call.callerId || "",
                callerName: callerName,
                type: "incoming_call",
            },
            android: {
                priority: "high",
                notification: {
                    channelId: "calls",
                    priority: "max",
                    sound: "default",
                    vibrateTimingsMillis: [0, 500, 200, 500],
                },
            },
            apns: {
                payload: {
                    aps: {
                        sound: "default",
                        badge: 1,
                        contentAvailable: true,
                    },
                },
            },
            webpush: {
                headers: {
                    Urgency: "high",
                    TTL: "30",
                },
                notification: {
                    requireInteraction: true,
                    tag: "incoming-call",
                    renotify: true,
                    vibrate: [500, 200, 500, 200, 500],
                },
            },
        };

        const res = await admin.messaging().sendEachForMulticast({
            tokens,
            ...payload,
        });

        // Clean up invalid tokens
        const invalid = [];
        res.responses.forEach((r, i) => {
            if (!r.success) invalid.push(tokens[i]);
        });

        if (invalid.length) {
            const cleaned = tokens.filter((t) => !invalid.includes(t));
            await admin.firestore().doc(`users/${receiverId}`).update({ fcmTokens: cleaned });
        }

        return null;
    });
