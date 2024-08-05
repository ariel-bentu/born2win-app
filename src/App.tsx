import React, { useEffect, useState, useRef } from 'react';
import { TabView, TabPanel } from 'primereact/tabview';
import { Button } from 'primereact/button';
import { Badge } from 'primereact/badge';
import { Toast } from 'primereact/toast';
import 'primereact/resources/themes/saga-blue/theme.css';
import 'primereact/resources/primereact.min.css';
import 'primeicons/primeicons.css';
import 'primeflex/primeflex.css';
import './App.css';
import * as api from './api';
import { NextOrObserver, User } from 'firebase/auth';
import { UserInfo } from './types';
import { ClientJS } from 'clientjs';
import NotificationsComponent from './notifications-component';
import { getDB } from './db';
import { countUnreadNotifications } from './notifications';

const UID_STORAGE_KEY = "born2win_uid";
const VOL_ID_STORAGE_KEY = "born2win_vol_id";
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
export const isPWA = ((window.navigator as any)?.standalone === true);

const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
const param_vol_id = urlParams.get('vol_id');
const client = new ClientJS();
const fingerprint = client.getFingerprint() + "";

function App() {
    const [user, setUser] = useState<User | null>(null);
    const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
    const [volunteerId, setVolunteerId] = useState<string | undefined>();
    const [userPairingRequest, setUserPairingRequest] = useState<string | null>(param_vol_id);
    const [notificationPermission, setNotificationPermission] = useState<string>((typeof Notification !== 'undefined') && Notification && Notification.permission || "unsupported");
    const [swRegistration, setSWRegistration] = useState<ServiceWorkerRegistration | null>(null);
    const [unreadCount, setUnreadCount] = useState(0);
    const toast = useRef<Toast>(null);

    const onAuth: NextOrObserver<User> = (user: User | null) => {
        setUser(user);
    }

    useEffect(() => {
        if (user && user.uid) {
            const currentUid = localStorage.getItem(UID_STORAGE_KEY);
            const currentVolId = localStorage.getItem(VOL_ID_STORAGE_KEY);

            if (userPairingRequest && userPairingRequest.length > 0) {
                if (userPairingRequest !== currentVolId) {
                    if (currentVolId && currentVolId.length > 0) {
                        console.log("Change of vol ID - ignored", currentVolId, "to", userPairingRequest);
                    } else {
                        api.updateLoginInfo(userPairingRequest, fingerprint).then(() => {
                            localStorage.setItem(VOL_ID_STORAGE_KEY, userPairingRequest);
                            localStorage.setItem(UID_STORAGE_KEY, user.uid);
                        });
                    }
                }
                setVolunteerId(userPairingRequest);
            } else {
                if (currentVolId && currentVolId.length > 0) {
                    setVolunteerId(currentVolId);
                    if (currentUid === user.uid) {
                    } else {
                        api.updateLoginInfo(currentVolId, fingerprint).then(() => {
                            localStorage.setItem(UID_STORAGE_KEY, user.uid);
                        });
                    }
                } else {
                    if (isPWA) {
                        api.updateLoginInfo(undefined, fingerprint).then((retVolId: string) => {
                            localStorage.setItem(VOL_ID_STORAGE_KEY, retVolId);
                            setVolunteerId(retVolId);
                            localStorage.setItem(UID_STORAGE_KEY, user.uid);
                        }).catch((err: Error) => {
                            console.log("Failed to fetch volunteerId based on fingerprint", err);
                        });
                    }
                }
            }
        }
    }, [user, userPairingRequest]);

    useEffect(() => {
        if (user && volunteerId && volunteerId.length > 0) {
            api.getUserInfo(user.uid, volunteerId).then((uInfo) => {
                setUserInfo(uInfo);
            });
        }
    }, [user, volunteerId]);

    useEffect(() => {
        api.init(onAuth);
        countUnreadNotifications().then(updateUnreadCount);
    }, []);

    const showToast = (severity: "error" | "success" | "info" | "warn" | "secondary" | "contrast" | undefined, summary: string, detail: string) => {
        if (toast.current) {
            toast.current.show({ severity, summary, detail });
        }
    };

    const updateUnreadCount = (count: number) => {
        setUnreadCount(count);
        if ('setAppBadge' in navigator) {
            (navigator as any).setAppBadge(count);
        }
    };

    return (
        <div className="App">
            <Toast ref={toast} />
            <h2>Born to Win</h2>
            <TabView>
                <TabPanel header="Settings">
                    <div style={{ display: "flex", flexDirection: "column", textAlign: "left", alignItems: "center" }}>
                        <div>{isPWA ? "Run as PWA" : "Run in Browser"}</div>
                        <div>Finger Print: {fingerprint}</div>
                        <div>{user ? "Logged in: " + user.uid : "Not logged in"}</div>
                        <div>{volunteerId ? "VolunteerID: " + volunteerId : "Not registered as a volunteer yet"}</div>
                        <div>Notification Permission: {notificationPermission}</div>
                        <div>Notification Token: {userInfo?.notificationToken ? "Exists: " + userInfo.notificationToken.token.substring(0, 5) + "..." : "Missing"}</div>
                        <div style={{ display: "flex", flexDirection: "column", width: 200 }}>
                            <Button onClick={() => {
                                api.requestWebPushToken().then(token => {
                                    if (token) {
                                        api.updateUserNotification(true, token, isSafari).then(() => {
                                            showToast('success', 'Success', 'Notification permission granted');
                                            setNotificationPermission("granted");
                                            if (user && volunteerId && volunteerId.length > 0) {
                                                api.getUserInfo(user?.uid, volunteerId).then(uInfo => setUserInfo(uInfo));
                                            }
                                        });
                                    }
                                });
                            }}>Allow Notification</Button>

                            <Button onClick={() => api.sendTestNotification()} disabled={!userInfo?.notificationToken}>Send Test Notification</Button>
                            <Button onClick={async () => {
                                const db = await getDB();
                                await db.put('notifications', {
                                    id: Date.now() + "",
                                    title: "Test data" + Date.now(),
                                    body: "",
                                    read: 0,
                                    timestamp: Date.now(),
                                });
                                countUnreadNotifications().then(updateUnreadCount);
                            }} >Add Test DATA</Button>
                        </div>
                    </div>
                </TabPanel>
                <TabPanel header={<><span>Messages</span>{unreadCount > 0 && <Badge className="msg-badge" value={unreadCount} severity="danger" size="normal" />}</>}>
                    <NotificationsComponent updateUnreadCount={updateUnreadCount} />
                </TabPanel>
                <TabPanel header="Registration">
                    <div>Registration content goes here...</div>
                </TabPanel>
            </TabView>
        </div>
    );
}

export default App;