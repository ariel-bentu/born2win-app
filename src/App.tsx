import React, { useEffect, useState, useRef, useCallback } from 'react';
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
import { Cached, ShowToast, UserInfo } from './types';
import { ClientJS } from 'clientjs';
import NotificationsComponent from './notifications-component';
import { countUnreadNotifications } from './notifications';
import RegistrationComponent from './registration';
import header from "./media/header.png";
import Header from './header';
import PWAInstructions from './install-instruction';
import { ExistingRegistrationsComponent } from './existing-registration-component';

import { Stats } from './charts';
import { InProgress, RegisterToNotification } from './common-ui';
import dayjs from 'dayjs';
import { SendMessage } from './send-message';
import { confirmPopup, ConfirmPopup } from 'primereact/confirmpopup';

const VOL_ID_STORAGE_KEY = "born2win_vol_id";
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
const isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);

export const testIsPWA = () => {
    // Check for iOS PWA
    const isStandalone = (window.navigator as any).standalone === true;

    // Check for Android and other platforms
    const isDisplayModeStandalone = window.matchMedia('(display-mode: standalone)').matches;

    return isStandalone || isDisplayModeStandalone;
};

export const isPWA = testIsPWA();
export const isAndroid = /android/i.test(navigator.userAgent);
export const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);


const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
const userPairingRequest = urlParams.get('vid');
const otpPairingRequest = urlParams.get('otp');
const isDev = !!urlParams.get('dev');
const offline = !!urlParams.get('offline');
const client = new ClientJS();
const fingerprint = isIOS ? client.getFingerprint() + "" : "";

const isNotEmpty = (val: string | null | undefined): val is string => {
    return !!val && val.length > 0;
};

let mealRequests = { fetchedTS: dayjs() } as Cached<api.Family[]>;

const getCachedMealRequest = async (): Promise<api.Family[]> => {
    if (mealRequests.inProgress) {
        await mealRequests.inProgress;
    }

    // allow cache of 10 minutes
    if (!mealRequests.data || mealRequests.fetchedTS.diff(dayjs(), "minutes") > 10) {
        mealRequests.inProgress = api.getMealRequests();

        return mealRequests.inProgress
            .then((mr) => {
                mealRequests.data = mr;
                return mr;
            })
            .finally(() => mealRequests.inProgress = undefined);
    }
    return mealRequests.data;
};


function App() {
    const [user, setUser] = useState<User | null>(offline ? { uid: "123" } as any : null);
    const [init, setInit] = useState<boolean>(false);
    const [readyToInstall, setReadyToInstall] = useState<boolean>(false);
    const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
    const [volunteerId, setVolunteerId] = useState<string | null>();
    const [notificationPermission, setNotificationPermission] = useState<string>((typeof Notification !== 'undefined') && Notification && Notification.permission || "unsupported");
    const [unreadCount, setUnreadCount] = useState(0);
    const [reloadNotifications, setReloadNotifications] = useState(0);
    const [requestWebTokenInprogress, setRequestWebTokenInprogress] = useState<boolean>(false);
    const toast = useRef<Toast>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [error, setError] = useState<string | undefined>();
    const [loggedOut, setLoggedOut] = useState<boolean>(false);
    const onAuth: NextOrObserver<User> = (user: User | null) => {
        setUser(user);
    }

    const showToast: ShowToast = (severity, summary, detail) => {
        if (toast.current) {
            toast.current.show({ severity, summary, detail });
        }
    };

    // hack until Apple fix the postMessage not recieved when app is openned
    useEffect(() => {
        if (isIOS) {
            const interval = setInterval(() => {
                if (document.visibilityState === "visible") {
                    setReloadNotifications(prev => prev + 1);
                }
            }, 10000);
            return () => clearInterval(interval);
        }
    }, [])

    // INIT Firebase
    useEffect(() => {
        if (!offline) {
            api.init(onAuth).then(() => setInit(true));
        }
    }, []);

    // LOGIN
    useEffect(() => {
        if (!loggedOut && init && !user) {
            if (isPWA || isNotEmpty(userPairingRequest) && isNotEmpty(otpPairingRequest)) {
                // Logs in annonymously and then user is set with user.uid
                api.login();
            } else {
                setError("תקלת אתחול (3) - חסר פרמטרים");
            }
        }
    }, [init, user]);

    useEffect(() => {
        const currentVolId = localStorage.getItem(VOL_ID_STORAGE_KEY);
        if (user && user.uid) {
            if (!isPWA) {
                // BROWSER flow
                if (isNotEmpty(userPairingRequest) && isNotEmpty(otpPairingRequest)) {
                    if (isNotEmpty(currentVolId) && currentVolId !== userPairingRequest) {
                        console.log("vol ID already paired- ignored", currentVolId, "vs. requested: ", userPairingRequest);
                        setError("תקלה באתחול (1) - פנה לעזרה.");
                    } else if (!isNotEmpty(currentVolId)) {
                        api.updateLoginInfo(userPairingRequest, otpPairingRequest, fingerprint, isIOS).then(() => {
                            setVolunteerId(userPairingRequest);
                            if (isAndroid) {
                                localStorage.setItem(VOL_ID_STORAGE_KEY, userPairingRequest);
                            } else if (!isDev) {
                                // Logout from Firebase
                                setLoggedOut(true);
                                api.logout();

                            }
                            setReadyToInstall(true);
                        })
                            .catch((err: Error) => setError("תקלה באתחול (2). " + err.message));
                    } else {
                        setVolunteerId(currentVolId);
                        setReadyToInstall(true);
                    }
                }
            } else {
                // PDA flow
                if (!isNotEmpty(currentVolId)) {
                    if (!isIOS) {
                        // NOT EXPECTED!!! Andoid should have already volunteerId stored in localStorage
                        setError("תקלה באתחול (5) - פנה לעזרה");
                        return;
                    }
                    // an unpaired PWA - first time - load the volunteerId based on finger print
                    api.updateLoginInfo(undefined, undefined, fingerprint, true).then((retVolId: string) => {
                        setVolunteerId(retVolId);
                        localStorage.setItem(VOL_ID_STORAGE_KEY, retVolId);
                    }).catch((err: Error) => {
                        console.log("Failed to fetch volunteerId based on fingerprint", err);
                        setError(" .תקלה באתחול (6) - פנה לעזרה" + err.message);
                    });
                } else {
                    setVolunteerId(currentVolId)
                }
            }
        }

    }, [user]);

    useEffect(() => {
        if (!offline && (isPWA || isDev) && user && isNotEmpty(volunteerId)) {
            api.getUserInfo().then((uInfo) => {
                setUserInfo(uInfo);
            });
        }
    }, [user, volunteerId]);

    // NOTIFICATIONS:
    useEffect(() => {
        const onPostMessage = (payload: any) => {
            console.log("Recieved Message", payload)
            showToast("info", "הודעה חדשה התקבלה", "");
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
        countUnreadNotifications().then(updateUnreadCount);
    }, [reloadNotifications])

    const updateUnreadCount = (count: number) => {
        setUnreadCount(count);
        if ('setAppBadge' in navigator) {
            (navigator as any).setAppBadge(count);
        }
    };

    const onAllowNotification = () => {
        setRequestWebTokenInprogress(true);
        api.requestWebPushToken().then(token => {
            if (token) {
                return api.updateUserNotification(true, token, isSafari).then(() => {
                    showToast('success', 'נשמר בהצלחה', 'הודעות אושרו בהצלחה');
                    setNotificationPermission("granted");
                    if (user && isNotEmpty(volunteerId)) {
                        api.getUserInfo().then(uInfo => setUserInfo(uInfo));
                    }
                });
            }
        })
            .catch((err) => showToast('error', 'תקלה ברישום להודעות', err.message))
            .finally(() => setRequestWebTokenInprogress(false));
    }

    const handleLogout = () => {
        confirmPopup({
            message: 'האם להתנתק לגמרי - חיבור חדש יחייב קשר עם העמותה?',
            icon: 'pi pi-exclamation-triangle',
            accept: async () => {
                try {
                    setLoggedOut(true);
                    api.logout();
                    localStorage.removeItem(VOL_ID_STORAGE_KEY);
                } catch (error) {
                    console.error('Error logging out', error);
                }
            }
        });
    }

    const settings = <div style={{ display: "flex", flexDirection: "column", textAlign: "left", alignItems: "flex-start" }}>
        <div><strong>Technical Status:</strong></div>
        <div>Environment: {isPWA ? "PWA" : "Browser: " + navigator.userAgent}</div>
        <div>isAndroid: {isAndroid ? "Yes" : "No: "}</div>
        <div>isIOS: {isIOS ? "Yes" : "No: "}</div>
        <div>isChrome: {isChrome ? "Yes" : "No: "}</div>
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

    const appReady = (isPWA || isDev) && isNotEmpty(volunteerId) && !error;
    //    const rejected = !isPWA && !isNotEmpty(userPairingRequest) && !isDev;
    const showProgress = requestWebTokenInprogress || !appReady && !error && !(readyToInstall);
    const isAdmin = userInfo?.isAdmin && userInfo?.districts?.length;
    return (
        <div className="App">
            <ConfirmPopup />
            <Toast ref={toast} />
            <Header userName={userInfo ? userInfo.firstName : ""}
                logoSrc={header}
                onLogout={handleLogout}
                settingsComponent={settings}
                onRefreshTokenClick={onAllowNotification}
                onSendTestNotificationClick={userInfo?.notificationToken ? api.sendTestNotification : undefined}
            />
            {readyToInstall && !isDev && <PWAInstructions />}
            {error && <div>{error}</div>}
            {showProgress && <InProgress />}
            {appReady && userInfo && !userInfo?.notificationToken && <RegisterToNotification onClick={requestWebTokenInprogress ? undefined : onAllowNotification} />}
            {appReady &&
                <TabView dir='rtl' renderActiveOnly={false} activeIndex={activeIndex} onTabChange={(e) => setActiveIndex(e.index)}>
                    <TabPanel headerStyle={{ fontSize: 20 }} header={<><span>הודעות</span>{unreadCount > 0 && <Badge className="msg-badge" value={unreadCount} severity="danger" size="normal" />}</>}>
                        <NotificationsComponent updateUnreadCount={updateUnreadCount} reload={reloadNotifications} />
                    </TabPanel>
                    <TabPanel headerStyle={{ fontSize: 20 }} header="רישום">
                        {activeIndex == 1 && <RegistrationComponent getCachedMealRequest={getCachedMealRequest} />}
                    </TabPanel>
                    <TabPanel headerStyle={{ fontSize: 20 }} header="התחייבויות">
                        {activeIndex == 2 && <ExistingRegistrationsComponent />}
                    </TabPanel>
                    {isAdmin &&
                        <TabPanel headerStyle={{ fontSize: 20 }} header="שליחה">
                            {isAdmin && <SendMessage userInfo={userInfo} showToast={showToast} />}
                        </TabPanel>}
                    {isAdmin &&
                        <TabPanel headerStyle={{ fontSize: 20 }} header="גרפים">
                            {isAdmin && <Stats userInfo={userInfo} />}
                        </TabPanel>
                    }
                </TabView>}
        </div >
    );

}

export default App;