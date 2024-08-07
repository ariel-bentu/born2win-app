import React, { useState } from "react";
import { Sidebar } from "primereact/sidebar";
import { Button } from "primereact/button";

interface HeaderProps {
    userName: string; 
    logoSrc: string;
    settingsComponent: JSX.Element;
}

function Header({ userName, logoSrc, settingsComponent }: HeaderProps) {
    const [sidebarVisible, setSidebarVisible] = useState(false);

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
                className="p-sidebar-md"
                position={"right"}
                style={{ width: "60%" }}
            >
                <div className="p-3">
                {settingsComponent}
                </div>
            </Sidebar>

        </header>
    );
};

export default Header;