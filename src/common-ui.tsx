import { Button } from "primereact/button";
import { ProgressBar } from "primereact/progressbar";
import './RegisterToNotification.css';

import { PrimeIcons } from 'primereact/api';
import { openPhoneDialer, openWhatsApp } from "./notification-actions";
import { nicePhone } from "./utils";

export function InProgress() {
    return <ProgressBar mode="indeterminate" style={{ height: '6px' }}></ProgressBar>;
}

interface RegisterToNotificationProps {
    onClick?: (e: any) => void,
}

export function RegisterToNotification({ onClick }: RegisterToNotificationProps) {
    return (
        <div className="notification-container">
            <div className="notification-content">
                <div className="notification-text">לצורך שימוש יעיל באפליקציה יש לאשר הודעות</div>
                <div className="button-container">
                    <i className={`arrow-animation ${PrimeIcons.ANGLE_LEFT}`}></i>
                    <Button label="אישור קבלת הודעות" disabled={!onClick} onClick={onClick} className="notification-button" />
                </div>
            </div>
        </div>
    );
}

export function NewAppVersion({ onClick }: RegisterToNotificationProps) {
    return (
        <div className="notification-container">
            <div className="notification-content">
                <div className="notification-text">קיימת גרסא חדשה של האפליקציה</div>
                <div className="button-container">
                    <i className={`arrow-animation ${PrimeIcons.ANGLE_LEFT}`}></i>
                    <Button  label="עדכן" icon="pi pi-refresh" disabled={!onClick} onClick={onClick} className="notification-button" style={{ gap: '8px', fontSize:24}} />
                </div>
            </div>
        </div>
    );
}

export function PhoneNumber({ phone }: { phone: string }) {
    return <div className="flex flex-row align-items-center">
        <strong className="ml-2">טלפון:</strong>{nicePhone(phone)}
        <Button
            icon="pi pi-whatsapp"
            className="p-button-rounded p-button-info m-2"
            onClick={() => openWhatsApp(phone, "")}
            aria-label="WhatsApp"
        />
        <Button
            icon="pi pi-phone"
            className="p-button-rounded p-button-success m-2"
            onClick={() => openPhoneDialer(phone)}
            aria-label="Phone"
        />
    </div>
}