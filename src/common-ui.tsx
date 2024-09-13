import { Button } from "primereact/button";
import { ProgressBar } from "primereact/progressbar";
import './common-ui.css';

import { PrimeIcons } from 'primereact/api';
import { openPhoneDialer, openWhatsApp } from "./notification-actions";
import { nicePhone } from "./utils";
import Slider from 'react-slider';
import dayjs from "dayjs";

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
                    <Button label="עדכן" icon="pi pi-refresh" disabled={!onClick} onClick={onClick} className="notification-button" style={{ gap: '8px', fontSize: 24 }} />
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

// Helper to calculate weeks from today
const weeksFromToday = (weeks: number) => {
    const today = dayjs();
    return today.add(weeks, 'week').format('DD-MMM');
};
interface WeekSelectorSliderProps {
    selectedWeeks: number[];
    setSelectedWeeks: (newVal: number[]) => void;
}

export function WeekSelectorSlider({ selectedWeeks, setSelectedWeeks }: WeekSelectorSliderProps) {

    const handleWeekChange = (newRange: number[]) => {
        setSelectedWeeks(newRange);
    };
    const min = -4;
    const max = 6;

    return (
        // <div style={{ width: '400px', margin: '50px auto', direction: 'rtl' }}>
        <div className="slider-container">
            <Slider
                value={selectedWeeks}
                onChange={handleWeekChange}
                min={min}
                max={max}
                step={1}

                marks={[6, 5, 4, 3, 2, 1, 0, -1, -2, -3, -4]}
                markClassName="mark"
                renderMark={(props) => {
                    const weekNumber = parseInt(props.key + "");
                    return (
                        <span {...props} key={props.key}  className={`tick-mark ${weekNumber === 0 ? 'today-mark' : ''}`}>
                            {weekNumber === 0 ? 'היום' : weekNumber > 0 ? `+${weekNumber}` : `${weekNumber}`}
                        </span>
                    );
                }}
                withTracks
                invert={true}
                className="react-slider"
            />
            <div className="range-text">{weeksFromToday(selectedWeeks[0])} עד {weeksFromToday(selectedWeeks[1])}</div>
        </div>
        // <div style={{ marginTop: '20px' }}>
        //     <strong>Selected Range:</strong>
        //     <p>From: {weeksFromToday(selectedWeeks[0])}</p>
        //     <p>To: {weeksFromToday(selectedWeeks[1])}</p>
        // </div>
    );
};



