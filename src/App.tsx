import { useEffect, useState, useRef, useCallback } from 'react';
import { TabView, TabPanel } from 'primereact/tabview';
import { Badge } from 'primereact/badge';
import { Toast } from 'primereact/toast';
import 'primereact/resources/themes/saga-blue/theme.css';
import 'primereact/resources/primereact.min.css';
import 'primeicons/primeicons.css';
import 'primeflex/primeflex.css';
import './App.css';
import * as api from './api';
import { NextOrObserver, User } from 'firebase/auth';
import { Cached, FamilyDemand, NavigationStep, NotificationActions, NotificationChannels, ShowToast, UserInfo } from './types';
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
import { isNotEmpty } from './utils';
import { DisposeNavigationRequester, initializeNavigationRequester } from './notification-actions';
import { userInfo } from 'os';
import { Button } from 'primereact/button';
import { getDB } from './db';

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
const oldUrlParamID = urlParams.get('id');
const isDev = !!urlParams.get('dev');
const offline = !!urlParams.get('offline');
const client = new ClientJS();
const fingerprint = isIOS ? client.getFingerprint() + "" : "";


function App() {
    const [user, setUser] = useState<User | null>(offline ? { uid: "123" } as any : null);
    const [init, setInit] = useState<boolean>(false);
    const [readyToInstall, setReadyToInstall] = useState<boolean>(false);
    const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
    const [volunteerId, setVolunteerId] = useState<string | null>();
    const [actualUserId, setActualUserId] = useState<string>("");
    const [notificationPermission, setNotificationPermission] = useState<string>((typeof Notification !== 'undefined') && Notification && Notification.permission || "unsupported");
    const [unreadCount, setUnreadCount] = useState(0);
    const [reloadNotifications, setReloadNotifications] = useState(0);
    const [requestWebTokenInprogress, setRequestWebTokenInprogress] = useState<boolean>(false);
    const toast = useRef<Toast>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [error, setError] = useState<string | undefined>();
    const [loggedOut, setLoggedOut] = useState<boolean>(false);
    const onAuth: NextOrObserver<User> = (user: User | null) => {
        console.log("OnAuth - Login callback called", user);
        setUser(user);
    }

    const [openDemands, setOpenDemands] = useState<Cached<FamilyDemand[]> | undefined>(undefined);

    const [navigationRequest, setNavigationRequest] = useState<NavigationStep | undefined>(undefined)


    useEffect(() => {
        initializeNavigationRequester(setNavigationRequest);
        return () => DisposeNavigationRequester();
    }, []);

    useEffect(() => {
        if (navigationRequest) {
            setActiveIndex(navigationRequest.tab);

            // reset it
            setTimeout(() => setNavigationRequest(undefined), 2000);
        }
    }, [navigationRequest]);

    const getOpenDemands = useCallback(async (force?: boolean): Promise<FamilyDemand[]> => {
        if (!force && openDemands && openDemands.userId === actualUserId && openDemands.fetchedTS.diff(dayjs(), "minutes") < 10) {
            return openDemands.data;
        }
        const demands = await api.getOpenDemands();
        setOpenDemands({
            data: demands,
            userId: actualUserId,
            fetchedTS: dayjs(),
        });
        return demands;

    }, [actualUserId, openDemands]);


    const showToast: ShowToast = (severity, summary, detail) => {
        if (toast.current) {
            toast.current.show({ severity, summary, detail });
        }
    };

    // hack until Apple fix the postMessage not recieved when app is openned
    // Poll every 10 seconds the local indexDB
    useEffect(() => {
        if (isIOS && !oldUrlParamID) {
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
        if (oldUrlParamID) {
            api.impersonate("OLD:" + oldUrlParamID, "OLD-AccessPoint id: " + oldUrlParamID);
        }

        if (!offline) {
            console.log("Init firebase... ")

            api.init(onAuth).then(() => {
                setInit(true);
                console.log("Init firebase successful");
            });
        }
    }, []);

    // LOGIN
    useEffect(() => {
        if (!loggedOut && init && !user) {
            if (oldUrlParamID || isPWA || isNotEmpty(userPairingRequest) && isNotEmpty(otpPairingRequest)) {
                // Logs in annonymously and then user is set with user.uid
                console.log("Logging in...")
                api.login()
                    .then(() => console.log("Login successful"))
                    .catch((err: Error) => {
                        console.log("Login failed", err.message)
                        setError("Login failed: " + err.message);
                    });
            } else {
                setError("תקלת אתחול (3) - חסר פרמטרים");
            }
        }
    }, [init, user]);

    useEffect(() => {
        const currentVolId = localStorage.getItem(VOL_ID_STORAGE_KEY);
        if (user && user.uid) {
            console.log("Login passed, initializing...", currentVolId);
            if (!isPWA) {
                // BROWSER flow
                if (oldUrlParamID) {
                    setVolunteerId(oldUrlParamID);
                } else if (isNotEmpty(userPairingRequest) && isNotEmpty(otpPairingRequest)) {
                    if (isNotEmpty(currentVolId) && currentVolId !== userPairingRequest && !isDev) {
                        console.log("vol ID already paired- ignored", currentVolId, "vs. requested: ", userPairingRequest);
                        setError("תקלה באתחול (1) - פנה לעזרה.");
                    } else if (!isNotEmpty(currentVolId) || (isDev && currentVolId !== userPairingRequest)) {
                        if (isDev && isNotEmpty(currentVolId) && currentVolId !== userPairingRequest) {
                            // switch user: 
                            localStorage.removeItem(VOL_ID_STORAGE_KEY)
                            api.logout();
                            return;
                        }

                        console.log("identify on server as ", userPairingRequest)
                        api.updateLoginInfo(userPairingRequest, otpPairingRequest, fingerprint, isDev ? false : isIOS).then(() => {
                            setVolunteerId(userPairingRequest);
                            if (isAndroid) {
                                localStorage.setItem(VOL_ID_STORAGE_KEY, userPairingRequest);
                            } else if (!isDev) {
                                // Logout from Firebase
                                setLoggedOut(true);
                                api.logout();

                            }
                            setReadyToInstall(true && !isDev);
                        })
                            .catch((err: Error) => setError("תקלה באתחול (2). " + err.message));
                        return;
                    } else {
                        setVolunteerId(currentVolId);
                        setReadyToInstall(true && !isDev);
                        return;
                    }
                }
                setError("Missing otp and/or vid parameter");
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
        if (!oldUrlParamID && (!offline && (isPWA || isDev) && user && isNotEmpty(volunteerId))) {
            console.log("Loading UserInfo ");
            api.getUserInfo().then((uInfo) => {
                console.log("UserInfo set to", uInfo.firstName);
                setUserInfo(uInfo);
            });
        }
    }, [user, volunteerId]);

    useEffect(() => {
        if (volunteerId) {
            console.log("Actual user set to", volunteerId);
            setActualUserId(volunteerId);
        }
    }, [volunteerId]);

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
                    await api.logout();
                    localStorage.removeItem(VOL_ID_STORAGE_KEY);
                } catch (error) {
                    console.error('Error logging out', error);
                }
            }
        });
    }

    if (oldUrlParamID) {
        // OLD URL SUPPORT - to remove after app launch
        return <div className="App">
            <ConfirmPopup />
            <Toast ref={toast} />

            {(isNotEmpty(volunteerId) && !error) ?
                <RegistrationComponent
                    standalone={true}
                    openDemands={getOpenDemands()}
                    openDemandsTS={openDemands?.fetchedTS.toISOString() || ""} showToast={showToast} actualUserId={oldUrlParamID}
                    reloadOpenDemands={() => {
                        getOpenDemands(true);
                    }} /> :
                <InProgress />
            }
        </div>
    }


    const settings = <div style={{ display: "flex", flexDirection: "column", textAlign: "left", alignItems: "flex-start" }}>
        <div><strong>Technical Status:</strong></div>
        <div>Environment: {isPWA ? "PWA" : "Browser: " + navigator.userAgent}</div>
        <div>UserAgent: {navigator.userAgent}</div>
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
            <Button onClick={async () => {
                const db = await getDB();
                await db.put('notifications', {
                    id: Date.now() + "",
                    title: "תזכורת",
                    body: `תאריך הבישול: 2024-18-28
עוד: 3 ימים
משפחה: yyy
עיר: xxx
לא לשכוח לתאם עוד היום בשיחה או הודעה את שעת מסירת האוכל.
אם אין באפשרותך לבשל יש לבטל באפליקציה, או ליצור קשר.`,
                    // data: JSON.stringify({
                    //                     buttons: [
                    //                         { label: "צפה בפרטים", action: NotificationActions.RegistrationDetails, params: ["1234"] },
                    //                         { label: "צור קשר עם עמותה", action: NotificationActions.StartConversation },
                    //                     ],
                    //                 }),
                    read: 0,
                    channel: NotificationChannels.Links,
                    timestamp: Date.now(),
                });
                countUnreadNotifications().then(updateUnreadCount);
            }} >Add Test DATA</Button>
        </div>
    </div>
    // allow showing notification even if not ready
    const isNotificationTab = activeIndex === 0;
    let appReady = (isPWA || isDev) && !error && isNotEmpty(volunteerId) && !readyToInstall;
    const showProgress = requestWebTokenInprogress || !appReady && !error && !readyToInstall;
    appReady ||= (isPWA || isDev) && isNotificationTab
    const isAdmin = userInfo?.isAdmin && userInfo?.districts?.length;

    /*
    header = 65
    divider = 32
    notificationMessage = 120 - ?
    tab = 54
    */
    const showRegToMessages = appReady && userInfo && !userInfo?.notificationToken;
    const tabContentsTop = 161 + (showRegToMessages ? 120 : 0);
    console.log("render App")
    return (
        <div className="App">
            <ConfirmPopup />
            <Toast ref={toast} />
            <Header
                userName={userInfo ? userInfo.firstName : ""}
                actualUserId={actualUserId}
                showToast={showToast}
                volunteerId={volunteerId || ""}
                logoSrc={header}
                onLogout={handleLogout}
                settingsComponent={settings}
                onRefreshTokenClick={onAllowNotification}
                onSyncNotifications={() =>
                    api.syncNotifications().then(() => setReloadNotifications(prev => prev + 1))
                }
                onSendTestNotificationClick={userInfo?.notificationToken ? api.sendTestNotification : undefined}
                userInfo={userInfo}
                setActualUserId={setActualUserId}
                showLoading={showProgress && isNotificationTab}
            />
            {readyToInstall && !isDev && <PWAInstructions />}
            {error && <div>{error}</div>}
            {showProgress && !isNotificationTab && <InProgress />}
            {showRegToMessages && <RegisterToNotification onClick={requestWebTokenInprogress ? undefined : onAllowNotification} />}
            {appReady &&
                <TabView dir='rtl' renderActiveOnly={false} activeIndex={activeIndex} onTabChange={(e) => setActiveIndex(e.index)}>
                    <TabPanel headerStyle={{ fontSize: 20 }} header={<><span>הודעות</span>{unreadCount > 0 && <Badge className="msg-badge" value={unreadCount} severity="danger" size="normal" />}</>}>
                        <NotificationsComponent updateUnreadCount={updateUnreadCount} reload={reloadNotifications} topPosition={tabContentsTop} />
                    </TabPanel>
                    <TabPanel headerStyle={{ fontSize: 20 }} header="שיבוצים">
                        {activeIndex == 1 && <RegistrationComponent openDemands={getOpenDemands()} openDemandsTS={openDemands?.fetchedTS.toISOString() || ""} showToast={showToast} actualUserId={actualUserId}
                            reloadOpenDemands={() => {
                                getOpenDemands(true);
                            }} />}
                    </TabPanel>
                    <TabPanel headerStyle={{ fontSize: 20 }} header="פרטי התנדבות">
                        {activeIndex == 2 && <ExistingRegistrationsComponent showToast={showToast} navigationRequest={navigationRequest} actualUserId={actualUserId} />}
                    </TabPanel>
                    {isAdmin &&
                        <TabPanel headerStyle={{ fontSize: 20 }} header="שליחה">
                            {isAdmin && <SendMessage userInfo={userInfo} showToast={showToast} />}
                        </TabPanel>}
                    {isAdmin &&
                        <TabPanel headerStyle={{ fontSize: 20 }} header="ניהול שיבוצים">
                            
                            {isAdmin && <Stats showToast={showToast} userInfo={userInfo} />}
                        </TabPanel>
                    }
                </TabView>}
        </div >
    );

}

export default App;