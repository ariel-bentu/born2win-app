import { Button } from "primereact/button";
import { ProgressBar } from "primereact/progressbar";
import './common-ui.css';

import { PrimeIcons } from 'primereact/api';
import { openPhoneDialer, openWhatsApp } from "./notification-actions";
import { nicePhone } from "./utils";
import Slider from 'react-slider';
import dayjs from "dayjs";
import { NotificationChannelsName } from "./types";

export function InProgress() {
    return <ProgressBar mode="indeterminate" style={{ height: '6px', width: "100%" }}></ProgressBar>;
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

export function PhoneNumber({ phone, hideText }: { phone: string, hideText?: boolean }) {
    return <div className="flex flex-row align-items-center">
        {!hideText && <strong className="ml-2">טלפון:</strong>}
        {!hideText ? nicePhone(phone) : ""}
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
    selectedWeeks: [number, number];
    setSelectedWeeks: (newVal: [number, number] | ((prev: [number, number]) => [number, number])) => void;
    min: number;
    max: number;
}

export function WeekSelectorSlider({ selectedWeeks, setSelectedWeeks , min, max}: WeekSelectorSliderProps) {

    const marks = Array.from({ length: max - min + 1 }, (_, i) => max - i);

    const handleWeekChange = (newRange: [number, number]) => {
        setSelectedWeeks(newRange);
    };

    return (
        // <div style={{ width: '400px', margin: '50px auto', direction: 'rtl' }}>
        <div className="slider-container">
            <div className="slider">
                <Button unstyled className="icon-btn ml-2" icon="pi pi-minus" onClick={() => {
                    setSelectedWeeks((prev: [number, number]) => {
                        return [prev[0] - 1, prev[1]];
                    });
                }} />
                <Slider
                    value={selectedWeeks}
                    onChange={handleWeekChange}
                    min={min}
                    max={max}
                    step={1}

                    marks={marks}
                    markClassName="mark"
                    renderMark={(props) => {
                        const weekNumber = parseInt(props.key + "");
                        return (
                            <span {...props} key={props.key} className={`tick-mark ${weekNumber === 0 ? 'today-mark' : ''}`}>
                                {weekNumber === 0 ? 'היום' : weekNumber > 0 ? `+${weekNumber}` : `${weekNumber}`}
                            </span>
                        );
                    }}
                    withTracks
                    invert={true}
                    className="react-slider"
                />
                <Button unstyled className="icon-btn mr-2" icon="pi pi-plus" onClick={() => {
                    setSelectedWeeks((prev: [number, number]) => {
                        return [prev[0], prev[1] + 1];
                    });
                }} />
            </div>
            <div className="range-text">{weeksFromToday(selectedWeeks[0])} עד {weeksFromToday(selectedWeeks[1])}</div>
        </div>
        // <div style={{ marginTop: '20px' }}>
        //     <strong>Selected Range:</strong>
        //     <p>From: {weeksFromToday(selectedWeeks[0])}</p>
        //     <p>To: {weeksFromToday(selectedWeeks[1])}</p>
        // </div>
    );
};




interface ChannelHeaderProps {
    name: string;
    onBack?: () => void;
    icon?: string;
}

export function ChannelHeader({ name, onBack, icon }: ChannelHeaderProps) {
    return <div className="w-12 flex flex-col align-items-center">
        {onBack ? <div className="back-btn" onClick={onBack}>
            <span className="pi pi-angle-right text-4xl" ></span>
        </div> : <div style={{ width: 5 }} />}
        {icon && <div className='channel-icon'>
            <span className={"pi text-4xl " + icon}></span>
        </div>}
        <div className='text-2xl mr-2'>{name}</div>
    </div>
}
