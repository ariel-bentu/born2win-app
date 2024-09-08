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
import { AppServices, Cached, FamilyDemand, NavigationState, NavigationStep, NotificationActions, NotificationChannels, OpenFamilyDemands, ShowToast, UserInfo } from './types';
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
import PhoneRegistration from './phone-registration';

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
let currentVolId: string | null = localStorage.getItem(VOL_ID_STORAGE_KEY);
let exiting = false;
/*
Tests:
Browser:
https://app.born2win.org.il -> show install instructions (check on android and iPhone verify the instructions match the platform)
            after install - phone flow

https://app.born2win.org.il?id=<rec-id> -> open the dynamic registration compatible to old form
https://app.born2win.org.il?vid=<rec-id>&otp=<someotp> -> 
            in android: sets the LocalStorage: born2win_vol_id=<red-id>, sets loginInfo in users collection - then install instructions,
              after install, open app and ready
            in iOS: set fingerprint in users' collection, show instructions, after install set loginInfo and ready (restart app and it works)

https://app.born2win.org.il?vid=<rec-id>&otp=<someotp>&dev=true -> 
                sets the LocalStorage: born2win_vol_id=<red-id>, 
                sets loginInfo in users collection - then ready


https://app.born2win.org.il?dev=true -> show phone flow - for developers only test the phone flow,
                 after flow, sets the LocalStorage: born2win_vol_id=<red-id>, then ready

*/

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
    const [loading, setLoading] = useState<boolean>(true);
    const toast = useRef<Toast>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [error, setError] = useState<string | undefined>();
    const [loggedOut, setLoggedOut] = useState<boolean>(false);
    const [phoneFlow, setPhoneFlow] = useState<boolean>(false);
    const [navState, setNavState] = useState<NavigationState[]>([]);
    const [latestVersion, setLatestVersion] = useState<string | undefined>();

    const onAuth: NextOrObserver<User> = (user: User | null) => {
        console.log("OnAuth - Login callback called", user);
        setLoading(false);
        setUser(user);
    }

    const [openDemands, setOpenDemands] = useState<Cached<OpenFamilyDemands> | undefined>(undefined);

    const [navigationRequest, setNavigationRequest] = useState<NavigationStep | undefined>(undefined)


    const appServices: AppServices = {
        showMessage: (severity, summary, detail) => {
            if (toast.current) {
                toast.current.show({ severity, summary, detail });
            }
        },
        pushNavigationStep: (label, backCallback) => {
            console.log("pushNavigationStep", label)
            setNavState(prev => ([{ label, backCallback }, ...prev]))
            //window.history.pushState({ label }, "");
        },
        popNavigationStep: () => {
            setNavState(prev => {
                if (prev.length) {
                    console.log("popNavigationStep", prev[0].label);
                    return prev.slice(1);
                }
                console.log("One too many popNavigationStep")
                return prev;
            });
        },
    }


    useEffect(() => {
        const checkForUpdate = async () => {
            try {
                const response = await fetch('/version.json', {
                    headers: {
                        'Cache-Control': 'no-cache', // Ensure fresh copy is fetched
                    }
                });
                const data = await response.json();
                if (!latestVersion) {
                    console.log("version Loaded:", data.version);
                    setLatestVersion(data.version);
                } else if (data.version && data.version !== latestVersion) {
                    // New version detected
                    confirmPopup({
                        message: "קיימת גרסא חדשה לאפליקציה, האם לטעון כעת?",
                        icon: 'pi pi-exclamation-triangle',
                        accept: () => {
                            window.location.reload();
                        },
                        acceptLabel:"לטעון עכשיו",
                        rejectLabel:"לא עכשיו"

                    });
                }
            } catch (error) {
                console.error('Error fetching version.json:', error);
            }
        };

        // Check every 30 minutes
        const intervalId = setInterval(() => {
            checkForUpdate();
        },  30 * 60 * 1000); // 30 minutes

        // Initial check when the app loads
        checkForUpdate();

        return () => clearInterval(intervalId); // Clean up on unmount
    }, [latestVersion]);

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

    // const getCachedOpenDemands = useCallback(async (force?: boolean): Promise<OpenFamilyDemands> => {
    //     if (!force && openDemands && openDemands.userId === actualUserId && openDemands.fetchedTS.diff(dayjs(), "minutes") < 10) {
    //         return openDemands.data;
    //     }
    //     const openDemandsResponse = await api.getOpenDemands();
    //     setOpenDemands({
    //         data: openDemandsResponse,
    //         userId: actualUserId,
    //         fetchedTS: dayjs(),
    //     });
    //     return openDemandsResponse;

    // }, [actualUserId, openDemands]);

    const isFetchingOpenDemands = useRef<Promise<OpenFamilyDemands> | null>(null);

    const getCachedOpenDemands = useCallback(async (force?: boolean): Promise<OpenFamilyDemands> => {
        // If there is an ongoing request, return the ongoing promise
        if (isFetchingOpenDemands.current) {
            return isFetchingOpenDemands.current;
        }

        // If conditions are met and no force flag, return cached data
        if (!force && openDemands && openDemands.userId === actualUserId && openDemands.fetchedTS.diff(dayjs(), "minutes") < 10) {
            return openDemands.data;
        }

        // Store the promise and make the API call
        const fetchPromise = api.getOpenDemands()
            .then((openDemandsResponse) => {
                setOpenDemands({
                    data: openDemandsResponse,
                    userId: actualUserId,
                    fetchedTS: dayjs(),
                });
                return openDemandsResponse;
            })
            .finally(() => {
                isFetchingOpenDemands.current = null; // Reset after request completes
            });

        isFetchingOpenDemands.current = fetchPromise;

        return fetchPromise;
    }, [actualUserId, openDemands]);


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
            if (oldUrlParamID || isPWA || isDev || isNotEmpty(userPairingRequest) && isNotEmpty(otpPairingRequest)) {
                // Logs in annonymously and then user is set with user.uid
                console.log("Logging in...")
                setLoading(true);
                api.login()
                    .then(() => console.log("Login successful"))
                    .catch((err: Error) => {
                        console.log("Login failed", err.message)
                        setError("Login failed: " + err.message);
                    }).finally(() => setLoading(false));
            } else {
                setReadyToInstall(true);
            }
        }
    }, [init, user]);

    useEffect(() => {
        if (user && user.uid) {

            if (oldUrlParamID) {
                console.log("Compatibility to old UI, vid=", oldUrlParamID);
                setVolunteerId(oldUrlParamID);
                return;
            }
            console.log("Login passed, initializing...", currentVolId);

            if (isPWA && isNotEmpty(currentVolId)) {
                // all set, user is known
                setVolunteerId(currentVolId);
                return;
            }

            if (!isPWA) {
                // BROWSER flow
                if (isNotEmpty(userPairingRequest) && isNotEmpty(otpPairingRequest)) {
                    // old value in dev mode only
                    if (isDev && isNotEmpty(currentVolId) && currentVolId !== userPairingRequest) {
                        // Developer had localStorage for user1 and params for user2 - flow will restart
                        localStorage.removeItem(VOL_ID_STORAGE_KEY)
                        currentVolId = null;
                        api.logout();
                        return;
                    }

                    if (isDev && isNotEmpty(currentVolId)) {
                        setVolunteerId(currentVolId);
                        return;
                    }

                    // prod-mode: initialize by link with rec-id and otp
                    setLoading(true);
                    api.updateLoginInfo(userPairingRequest, otpPairingRequest, fingerprint, undefined, isIOS)
                        .then(() => {
                            setVolunteerId(userPairingRequest);
                            if (isAndroid) {
                                localStorage.setItem(VOL_ID_STORAGE_KEY, userPairingRequest);
                            } else if (!isDev) {
                                // Logout from Firebase - to cleanup
                                setLoggedOut(true);
                                api.logout();
                            }
                            setReadyToInstall(!isDev);
                        })
                        .catch((err: Error) => setError("תקלה באתחול (2). " + err.message))
                        .finally(() => setLoading(false));

                    return;
                }

                // No Parameters, 
                if (isDev) {
                    if (isNotEmpty(currentVolId)) {
                        setVolunteerId(currentVolId);
                        return;
                    }


                    setPhoneFlow(true);
                    return;
                }

                setReadyToInstall(true);
            } else {
                // PDA flow
                if (isIOS) {
                    // an unpaired PWA - first time - try to load the volunteerId based on finger print
                    setLoading(true);
                    api.updateLoginInfo(undefined, undefined, fingerprint, undefined, true)
                        .then((retVolId: string) => {
                            setVolunteerId(retVolId);
                            localStorage.setItem(VOL_ID_STORAGE_KEY, retVolId);
                        })
                        .catch((err: Error) => {
                            setPhoneFlow(true);
                            console.log("Failed to fetch volunteerId based on fingerprint", err);
                        })
                        .finally(() => setLoading(false));

                } else {
                    setPhoneFlow(true);
                }
            }
        }
    }, [user]);

    useEffect(() => {
        if (!offline && (isPWA || isDev || oldUrlParamID) && user && isNotEmpty(volunteerId)) {
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
            appServices.showMessage("info", "הודעה חדשה התקבלה", "");
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

        const onPopState = (e: PopStateEvent) => {
            console.log("pop state", e.state);
            e.preventDefault();


            setNavState(existing => {
                if (existing.length) {
                    existing[0].backCallback(existing[0].label);
                    window.history.pushState({ root: (e.state?.root || 0) + 1 }, "");
                    return existing.slice(1);
                } else {
                    if (!exiting) {
                        confirmPopup({
                            message: "האם לצאת מהאפליקציה?",
                            icon: 'pi pi-exclamation-triangle',
                            accept: () => {
                                exiting = true;
                                window.history.back();
                                window.history.back();
                            }
                        });
                    }
                }
                return [];
            })
        }

        navigator.serviceWorker?.addEventListener("message", onPostMessage);
        document.addEventListener('visibilitychange', onVisibilityChange);

        window.history.pushState({ root: 1 }, "");
        window.addEventListener('popstate', onPopState);


        return () => {
            navigator.serviceWorker.removeEventListener('message', onPostMessage);
            document.removeEventListener('visibilitychange', onVisibilityChange);
            window.removeEventListener('popstate', onPopState);
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
        setLoading(true);
        api.requestWebPushToken().then(token => {
            if (token) {
                return api.updateUserNotification(true, token, isSafari).then(() => {
                    appServices.showMessage('success', 'נשמר בהצלחה', 'הודעות אושרו בהצלחה');
                    setNotificationPermission("granted");
                    if (user && isNotEmpty(volunteerId)) {
                        api.getUserInfo().then(uInfo => setUserInfo(uInfo));
                    }
                });
            }
        })
            .catch((err) => appServices.showMessage('error', 'תקלה ברישום להודעות', err.message))
            .finally(() => setLoading(false));
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
    // allow showing notification even if not ready
    const isNotificationTab = activeIndex === 0;
    let appReady =
        (isPWA || isDev) &&
        !error &&
        (
            isNotEmpty(volunteerId) || //loged in and set
            (isNotEmpty(currentVolId) && isNotificationTab) // inprocess of login, allow showing notification tab
        ) &&
        !readyToInstall &&
        !phoneFlow;


    const isAdmin = userInfo?.isAdmin && userInfo?.districts?.length;

    /*
    header = 65
    divider = 32
    notificationMessage = 120 - ?
    tab = 54
    */
    const showRegToMessages = appReady && userInfo && !userInfo?.notificationToken;
    const tabContentsTop = 161 + (showRegToMessages ? 120 : 0);

    if (oldUrlParamID) {
        // OLD URL SUPPORT - to remove after app launch
        return <div className="App">
            <ConfirmPopup />
            <Toast ref={toast} />

            {(isNotEmpty(volunteerId) && !error) ?
                <RegistrationComponent
                    userInfo={userInfo}
                    topPosition={tabContentsTop}
                    standalone={true}
                    openDemands={getCachedOpenDemands()}
                    openDemandsTS={openDemands?.fetchedTS.toISOString() || ""} appServices={appServices} actualUserId={oldUrlParamID}
                    reloadOpenDemands={() => {
                        getCachedOpenDemands(true);
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
        </div>
    </div>


    return (
        <div className="App">
            <ConfirmPopup />
            <Toast ref={toast} />
            <Header
                userName={userInfo ? userInfo.firstName : ""}
                actualUserId={actualUserId}
                appServices={appServices}
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
                showLoading={loading && isNotificationTab}
            />
            {readyToInstall && !isDev && <PWAInstructions />}
            {phoneFlow && <PhoneRegistration
                appServices={appServices}
                onPhoneRegistrationComplete={(vid: string) => {
                    setVolunteerId(vid);
                    localStorage.setItem(VOL_ID_STORAGE_KEY, vid);
                    setPhoneFlow(false);
                }}
            />}

            {error && <div>{error}</div>}
            {loading && !isNotificationTab && <InProgress />}
            {showRegToMessages && <RegisterToNotification onClick={loading ? undefined : onAllowNotification} />}
            {appReady &&
                <TabView dir='rtl' renderActiveOnly={false} activeIndex={activeIndex} onTabChange={(e) => setActiveIndex(e.index)}>
                    <TabPanel headerStyle={{ fontSize: 20 }} header={<><span>הודעות</span>{unreadCount > 0 && <Badge className="msg-badge" value={unreadCount} severity="danger" size="normal" />}</>}>
                        <NotificationsComponent updateUnreadCount={updateUnreadCount} reload={reloadNotifications} topPosition={tabContentsTop} appServices={appServices} />
                    </TabPanel>
                    <TabPanel headerStyle={{ fontSize: 20 }} header="שיבוצים">
                        {activeIndex == 1 && <RegistrationComponent
                            userInfo={userInfo}
                            openDemands={getCachedOpenDemands()} openDemandsTS={openDemands?.fetchedTS.toISOString() || ""}
                            appServices={appServices} actualUserId={actualUserId}
                            topPosition={tabContentsTop}
                            reloadOpenDemands={() => {
                                getCachedOpenDemands(true);
                            }} />}
                    </TabPanel>
                    <TabPanel headerStyle={{ fontSize: 20 }} header="פרטי התנדבות">
                        {activeIndex == 2 && <ExistingRegistrationsComponent appServices={appServices} navigationRequest={navigationRequest} actualUserId={actualUserId} />}
                    </TabPanel>
                    {isAdmin &&
                        <TabPanel headerStyle={{ fontSize: 20 }} header="שליחה">
                            {isAdmin && <SendMessage userInfo={userInfo} appServices={appServices} />}
                        </TabPanel>}
                    {isAdmin &&
                        <TabPanel headerStyle={{ fontSize: 20 }} header="ניהול שיבוצים">

                            {isAdmin && <Stats appServices={appServices} userInfo={userInfo} />}
                        </TabPanel>
                    }
                </TabView>}
        </div >
    );

}

export default App;


/*
 {isPWA && <Button onClick={() => api.sendTestNotification()} disabled={!userInfo?.notificationToken}>שלח הודעת בדיקה</Button>
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
*/