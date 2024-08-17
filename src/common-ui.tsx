import { Button } from "primereact/button";
import { ProgressBar } from "primereact/progressbar";
import './RegisterToNotification.css'; 

import { PrimeIcons } from 'primereact/api';

export function InProgress() {
    return <ProgressBar mode="indeterminate" style={{ height: '6px' }}></ProgressBar>;
}

interface RegisterToNotificationProps {
    onClick: (e: any) => void,
}

export function RegisterToNotification({ onClick }: RegisterToNotificationProps) {
    return (
        <div className="notification-container">
            <div className="notification-content">
                <div className="notification-text">לצורך שימוש יעיל באפליקציה יש לאשר קבלת הודעות</div>
                <div className="button-container">
                    <i className={`arrow-animation ${PrimeIcons.ANGLE_RIGHT}`}></i>
                    <Button label="אישור קבלת הודעות" onClick={onClick} className="notification-button" />
                </div>
            </div>
        </div>
    );
}