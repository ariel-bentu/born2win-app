import { useState } from "react";
import { Sidebar } from "primereact/sidebar";
import { Button } from "primereact/button";
import { AppServices, onClickEvent, UserInfo } from "./types";
import { MenuItem } from "primereact/menuitem";
import { PanelMenu } from "primereact/panelmenu";
import "./header.css";
import Impersonate from "./impersonate";
import { impersonate, impersonateUser, resetImpersonation } from "./api";
import { Divider } from "primereact/divider";
import { ProgressSpinner } from "primereact/progressspinner";
import { WhatsAppPhoneNumber } from "./notification-actions";
import { WhatsAppButton } from "./common-ui";

interface HeaderProps {
    version: string | undefined;
    userName: string;
    volunteerId: string;
    userInfo: UserInfo | null,
    logoSrc: string;
    settingsComponent: JSX.Element;
    onRefreshTokenClick: onClickEvent;
    onSyncNotifications: () => void;
    onSendTestNotificationClick?: onClickEvent;
    onLogout: () => void;
    actualUserId: string;
    setActualUserId: (newUserId: string) => void;
    appServices: AppServices;
    showLoading: boolean;
    hideMenu: boolean;
}

function Header({ userName, logoSrc, settingsComponent, onRefreshTokenClick, onSendTestNotificationClick, onSyncNotifications,
    onLogout, userInfo, setActualUserId, volunteerId, appServices, showLoading, actualUserId, version, hideMenu }: HeaderProps) {
    const [sidebarVisible, setSidebarVisible] = useState(false);
    const [showTechInfo, setShowTechInfo] = useState<boolean>(false);
    const toggleText = () => {
        setShowTechInfo(prev => !prev);
    };

    const openLink = (url: string) => {
        window.open(url, '_blank');
    };

    const items: MenuItem[] = [
        {
            label: 'רענן טוקן הודעות',
            icon: 'pi pi-refresh',
            command: onRefreshTokenClick,
            className: "settingMenuItem",

        },
        {
            label: 'שלח הודעת בדיקה',
            icon: 'pi pi-envelope',
            disabled: !onSendTestNotificationClick,
            command: onSendTestNotificationClick,
        },
        {
            label: 'סנכרן הודעות',
            icon: 'pi pi-history',
            command: onSyncNotifications,
        },
        // {
        //     label: 'התנתק',
        //     icon: 'pi pi-sign-out',
        //     command: onLogout,
        // },
        {
            label: 'פרטים טכנים',
            icon: 'pi pi-microchip',
            command: toggleText,
            template: (item, options) => (
                <div>
                    <a className={options.className} onClick={options.onClick}>
                        <span className={options.iconClassName}></span>
                        <span className={options.labelClassName}>{item.label}</span>
                    </a>
                    {showTechInfo && (
                        <div dir="ltr" className="text-align-left pl-3 mt-2">
                            {settingsComponent}
                        </div>
                    )}
                </div>
            )
        }
    ];

    return (
        <div className="relative">
            <header className="flex justify-content-between align-items-center p-3" style={{ height: 65 }}>
                {!hideMenu && <Button icon="pi pi-bars" className="p-button-rounded settings-btn" onClick={() => setSidebarVisible(true)} />}
                <img src={logoSrc} className="header-logo" alt="Logo" />
                <span>{userName}</span>
                {showLoading &&
                    <ProgressSpinner className="header-loading" />
                }

                <Sidebar
                    visible={sidebarVisible}
                    onHide={() => setSidebarVisible(false)}
                    className="settings-sidebar"
                    position={"right"}
                    style={{ width: 350 }}
                >
                    <div className="p-mt-3 w-full flex flex-row justify-content-evenly align-items-center">
                        <Button
                            icon="pi pi-facebook"
                            className="p-button-rounded p-button-primary p-mr-2 round-button"
                            onClick={() => openLink('https://www.facebook.com/BornToWinCancer?mibextid=ZbWKwL')}
                            aria-label="Facebook"
                        />
                        <Button
                            icon="pi pi-linkedin"
                            className="p-button-rounded p-button-help round-button"
                            onClick={() => openLink('https://www.linkedin.com/company/born-to-win-n-g-o/?viewAsMember=true')}
                            aria-label="LinkedIn"
                        />
                        <Button
                            icon="pi pi-instagram"
                            className="p-button-rounded p-button-danger p-mr-2 round-button"
                            onClick={() => openLink('https://www.instagram.com/borntowinas/')}
                            aria-label="Instagram"
                        />
                        <WhatsAppButton getPhone={()=>WhatsAppPhoneNumber} getText={()=>""}/>
                        <Button
                            icon="pi pi-globe"
                            className="p-button-rounded p-button-info round-button"
                            onClick={() => openLink('https://www.born2win.org.il')}
                            aria-label="Website"
                        />
                    </div>

                    <h2 className="settings-title">הגדרות</h2>
                    <PanelMenu model={items} className="settings-menu" />
                    {userInfo?.isAdmin && <Button className="w-12" label="לינק  כללי להתקנה" onClick={() => {
                        navigator.clipboard.writeText("https://app.born2win.org.il");
                        appServices.showMessage("success", "לינק כללי להתקנה הועתק - הדבקו היכן שתרצו", "");
                    }} />}

                    {userInfo?.isAdmin && <div dir="rtl" className="m-2 text-lg font-semibold">פעל בשם:</div>}
                    <Impersonate isImpersonated={actualUserId != userInfo?.id} appServices={appServices} userInfo={userInfo} onChange={(userId, name, phone) => {
                        if (userId && name) {
                            impersonate(userId, name, phone);
                            setActualUserId(userId);
                        } else if (!userId) {
                            resetImpersonation();
                            setActualUserId(volunteerId);
                        }
                    }} />
                    <div className="w-12 text-right mt-2" >גרסא:{version || ""}</div>
                </Sidebar>

            </header>
            <Divider />
            {impersonateUser && <div className="impersonate-name">בשם: {impersonateUser.name}</div>}
        </div>
    );
};

export default Header;