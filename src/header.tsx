import { useState } from "react";
import { Sidebar } from "primereact/sidebar";
import { Button } from "primereact/button";
import { onClickEvent, UserInfo } from "./types";
import { MenuItem } from "primereact/menuitem";
import { PanelMenu } from "primereact/panelmenu";
import "./header.css";
import Impersonate from "./impersonate";
import { impersonate, impersonateUser, resetImpersonation } from "./api";

interface HeaderProps {
    userName: string;
    volunteerId: string;
    userInfo: UserInfo | null,
    logoSrc: string;
    settingsComponent: JSX.Element;
    onRefreshTokenClick: onClickEvent;
    onSendTestNotificationClick?: onClickEvent;
    onLogout: () => void;
    setActualUserId: (newUserId: string) => void;
}

function Header({ userName, logoSrc, settingsComponent, onRefreshTokenClick, onSendTestNotificationClick, 
    onLogout, userInfo, setActualUserId, volunteerId }: HeaderProps) {
    const [sidebarVisible, setSidebarVisible] = useState(false);
    const [showTechInfo, setShowTechInfo] = useState<boolean>(false);
    const toggleText = () => {
        setShowTechInfo(prev => !prev);
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
            label: 'התנתק',
            icon: 'pi pi-sign-out',
            command: onLogout,
        },
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
        <div>
            <header className="flex justify-content-between align-items-center p-3 shadow-2 "
                style={{
                    direction: "rtl",
                    backgroundColor: "#F8F8F8",
                    //borderBottomWidth:1, borderBottomStyle:"solid", borderBottomColor:"lightgray" 
                }}>
                <Button icon="pi pi-bars" className="p-button-rounded p-button-text" onClick={() => setSidebarVisible(true)} />
                <img src={logoSrc} alt="Logo" className="header-logo" style={{ height: "40px" }} />
                <span>{userName}</span>

                <Sidebar
                    visible={sidebarVisible}
                    onHide={() => setSidebarVisible(false)}
                    className="settings-sidebar"
                    position={"right"}
                    style={{ width: "60%" }}
                >
                    <h2 className="settings-title">הגדרות</h2>
                    <PanelMenu model={items} className="settings-menu" />
                    {userInfo?.isAdmin && <div dir="rtl" className="m-2">פעל בשם:</div>}
                    <Impersonate userInfo={userInfo} onChange={(userId, name) => {
                        if (userId && name) {
                            impersonate(userId, name);
                            setActualUserId(userId);
                        } else if (!userId) {
                            resetImpersonation();
                            setActualUserId(volunteerId);
                        }
                    }} />
                </Sidebar>

            </header>
            {impersonateUser && <div>בשם: {impersonateUser.name}</div>}
        </div>
    );
};

export default Header;