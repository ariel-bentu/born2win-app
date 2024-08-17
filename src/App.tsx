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
import RegistrationComponent from './registration';
import header from "./media/header.png";
import Header from './header';
import PWAInstructions from './install-instruction';
import { ExistingRegistrationsComponent } from './existing-registration-component';

import { Stats } from './charts';
import { InProgress, RegisterToNotification } from './common-ui';

const UID_STORAGE_KEY = "born2win_uid";
const VOL_ID_STORAGE_KEY = "born2win_vol_id";
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

export const testIsPWA = () => {
    // Check for iOS PWA
    const isStandalone = (window.navigator as any).standalone === true;

    // Check for Android and other platforms
    const isDisplayModeStandalone = window.matchMedia('(display-mode: standalone)').matches;

    return isStandalone || isDisplayModeStandalone;
};

export const isPWA = testIsPWA();

const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
const userPairingRequest = urlParams.get('vol_id');
const isDev = !!urlParams.get('dev');
const offline = !!urlParams.get('offline');
const client = new ClientJS();
const fingerprint = client.getFingerprint() + "";

const isNotEmpty = (val: string | null | undefined): val is string => {
    return !!val && val.length > 0;
};

function App() {
    const [user, setUser] = useState<User | null>(offline ? { uid: "123" } as any : null);
    const [init, setInit] = useState<boolean>(false);
    const [readyToInstall, setReadyToInstall] = useState<boolean>(false);
    const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
    const [volunteerId, setVolunteerId] = useState<string | null>(userPairingRequest);
    const [notificationPermission, setNotificationPermission] = useState<string>((typeof Notification !== 'undefined') && Notification && Notification.permission || "unsupported");
    const [unreadCount, setUnreadCount] = useState(0);
    const [reloadNotifications, setReloadNotifications] = useState(0);
    const toast = useRef<Toast>(null);

    const onAuth: NextOrObserver<User> = (user: User | null) => {
        setUser(user);
    }

    useEffect(() => {
        const onPostMessage = (payload: any) => {
            console.log("Recieved Message", payload)
            if (payload.data?.type == "newMessage") {
                console.log("New Notification arrived");
                setTimeout(() => setReloadNotifications(prev => prev + 1), 2000);
            }
        }

        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                console.log('PWA is now in focus');
                setReloadNotifications(prev => prev + 1);
            } else {
                console.log('PWA is now out of focus');
            }
        };

        navigator.serviceWorker?.addEventListener("message", onPostMessage);
        document.addEventListener('visibilitychange', onVisibilityChange);

        return () => {
            navigator.serviceWorker.removeEventListener('message', onPostMessage);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };

    }, []);

    useEffect(() => {
        if (user && user.uid) {
            // const currentUid = localStorage.getItem(UID_STORAGE_KEY);

            const currentVolId = isPWA ? localStorage.getItem(VOL_ID_STORAGE_KEY) : undefined;

            if (!isPWA) {
                if (isNotEmpty(userPairingRequest)) {
                    // this is a non-pwa flow
                    if (userPairingRequest !== currentVolId && !offline) {
                        if (isNotEmpty(currentVolId)) {
                            console.log("Change of vol ID - ignored", currentVolId, "to", userPairingRequest);
                        } else {
                            api.updateLoginInfo(userPairingRequest, fingerprint).then(() => {
                                setReadyToInstall(true);
                                // localStorage.setItem(VOL_ID_STORAGE_KEY, userPairingRequest);
                                // localStorage.setItem(UID_STORAGE_KEY, user.uid);
                            });
                        }
                    }
                    setVolunteerId(userPairingRequest);
                }
            } else {
                if (isNotEmpty(currentVolId)) {
                    setVolunteerId(currentVolId);
                } else {
                    // first time as PWA - load the volunteerId based on finger print
                    api.updateLoginInfo(undefined, fingerprint).then((retVolId: string) => {
                        setVolunteerId(retVolId);
                        localStorage.setItem(VOL_ID_STORAGE_KEY, retVolId);
                    }).catch((err: Error) => {
                        console.log("Failed to fetch volunteerId based on fingerprint", err);
                    });
                }
            }
        }
    }, [user, userPairingRequest]);

    useEffect(() => {
        if (user && isNotEmpty(volunteerId) && !offline) {
            api.getUserInfo().then((uInfo) => {
                setUserInfo(uInfo);
            });
        }
    }, [user, volunteerId]);

    useEffect(() => {
        if (!offline) {
            api.init(onAuth).then(() => setInit(true));
        }
    }, []);

    useEffect(() => {
        countUnreadNotifications().then(updateUnreadCount);
    }, [reloadNotifications])

    useEffect(() => {
        if (init && !user) {
            if (isPWA || isNotEmpty(volunteerId)) {
                !offline && api.login();
            }
        }
    }, [init, volunteerId, user]);

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

    const onAllowNotification = () => {
        api.requestWebPushToken().then(token => {
            if (token) {
                api.updateUserNotification(true, token, isSafari).then(() => {
                    showToast('success', 'נשמר בהצלחה', 'הודעות אושרו בהצלחה');
                    setNotificationPermission("granted");
                    if (user && isNotEmpty(volunteerId)) {
                        api.getUserInfo().then(uInfo => setUserInfo(uInfo));
                    }
                });
            }
        });
    }

    const settings = <div style={{ display: "flex", flexDirection: "column", textAlign: "left", alignItems: "flex-start" }}>
        <div><strong>Technical Status:</strong></div>
        <div>Environment: {isPWA ? "PWA" : "Browser"}</div>
        <div>Finger Print: {fingerprint}</div>
        <div>Login Status: {user ? "uid:" + user.uid : "Not logged in"}</div>
        <div>VolunteerID: {volunteerId ? volunteerId : "Missing"}</div>
        <div>Notification Permission: {notificationPermission}</div>
        <div>Notification Token: {userInfo?.notificationToken ? "Exists: " + userInfo.notificationToken.token.substring(0, 5) + "..." : "Missing"}</div>
        <div style={{ display: "flex", flexDirection: "column", width: 200, padding: 10 }}>

            {/* {isPWA && <Button onClick={() => api.sendTestNotification()} disabled={!userInfo?.notificationToken}>שלח הודעת בדיקה</Button>} */}
            {/* <Button onClick={async () => {
                const db = await getDB();
                await db.put('notifications', {
                    id: Date.now() + "",
                    title: "ממתינים שיבוצים",
                    body: "יש עוד 5 משפחות שטרם שובצו להם מבשלים.ות",
                    read: 0,
                    timestamp: Date.now(),
                });
                countUnreadNotifications().then(updateUnreadCount);
            }} >Add Test DATA</Button> */}
        </div>
    </div>

    const appReady = (isPWA || isDev) && isNotEmpty(volunteerId);
    const rejected = !isPWA && !isNotEmpty(userPairingRequest) && !isDev;
    const showProgress = !appReady && !rejected && !(readyToInstall && !isDev);
    return (
        <div className="App">
            <Toast ref={toast} />
            <Header userName={userInfo ? userInfo.firstName : ""}
                logoSrc={header}
                settingsComponent={settings}
                onRefreshTokenClick={onAllowNotification}
                onSendTestNotificationClick={userInfo?.notificationToken ? api.sendTestNotification : undefined}
            />
            {readyToInstall && !isDev && <PWAInstructions />}
            {rejected && <div>זיהוי נכשל - צור קשר עם העמותה</div>}
            {showProgress && <InProgress />}
            {appReady && !userInfo?.notificationToken && <RegisterToNotification onClick={onAllowNotification} />}
            {appReady && <TabView dir='rtl'>
                <TabPanel headerStyle={{ fontSize: 20 }} header={<><span>הודעות</span>{unreadCount > 0 && <Badge className="msg-badge" value={unreadCount} severity="danger" size="normal" />}</>}>
                    <NotificationsComponent updateUnreadCount={updateUnreadCount} reload={reloadNotifications} />
                </TabPanel>
                <TabPanel headerStyle={{ fontSize: 20 }} header="רישום">
                    <RegistrationComponent />
                </TabPanel>
                <TabPanel headerStyle={{ fontSize: 20 }} header="התחייבויות">
                    <ExistingRegistrationsComponent />
                </TabPanel>
                {userInfo?.isAdmin && userInfo.districts?.length && <TabPanel headerStyle={{ fontSize: 20 }} header="גרפים">
                    <Stats userInfo={userInfo} />
                </TabPanel>}
            </TabView>}
        </div>
    );
}

export default App;