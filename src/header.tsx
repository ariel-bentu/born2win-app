import React, { useState } from "react";
import { Sidebar } from "primereact/sidebar";
import { Button } from "primereact/button";
import { onClickEvent } from "./types";
import { MenuItem } from "primereact/menuitem";
import { PanelMenu } from "primereact/panelmenu";
import "./header.css";

interface HeaderProps {
    userName: string;
    logoSrc: string;
    settingsComponent: JSX.Element;
    onRefreshTokenClick: onClickEvent;
    onSendTestNotificationClick?: onClickEvent;
}

function Header({ userName, logoSrc, settingsComponent, onRefreshTokenClick, onSendTestNotificationClick }: HeaderProps) {
    const [sidebarVisible, setSidebarVisible] = useState(false);

    const items: MenuItem[] = [
        {
            label: 'רענן טוקן הודעות',
            icon: 'pi pi-refresh',
            command:  onRefreshTokenClick,
            className: "settingMenuItem",
            
        },
        {
            label: 'שלח הודעות בדיקה',
            icon: 'pi pi-envelope',
            disabled: !onSendTestNotificationClick,
            command:  onSendTestNotificationClick,
        }
    ];

    return (
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
                <div className="p-3">
                    {settingsComponent}
                </div>
            </Sidebar>

        </header>
    );
};

export default Header;