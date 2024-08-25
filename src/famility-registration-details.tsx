import { Button } from "primereact/button";
import { Calendar, CalendarDateTemplateEvent, CalendarMonthChangeEvent, CalendarViewChangeEvent } from "primereact/calendar";
import "./registration.css";


import {  Family, getFamilyAvailability, updateFamilityDemand } from "./api";
import { useEffect, useState } from "react";
import { Nullable } from "primereact/ts-helpers";
import dayjs from "dayjs";
import { InProgress } from "./common-ui";
import { FamilyDemand, ShowToast } from "./types";
import { isNotEmpty } from "./utils";

interface FamilyDetailsProps {
    family: Family | null;
    cityId: string;
    detailsOnly?: boolean;
    showToast: ShowToast;
    onClose: () => void;
}

function isSameDate(d: Nullable<Date>, event: CalendarDateTemplateEvent) {
    return d &&
        d.getDate() === event.day &&
        d.getMonth() === event.month &&
        d.getFullYear() === event.year;
}

export function FamilyDetails({ family, onClose, detailsOnly, showToast, cityId }: FamilyDetailsProps) {
    const [availability, setAvailability] = useState<FamilyDemand[]>([]);
    const [selectedDate, setSelectedDate] = useState<Nullable<Date>>(null);
    const [error, setError] = useState<any>(undefined);
    const [loading, setLoading] = useState<boolean>(false);
    const [reload, setReload] = useState<number>(0);
    const [saving, setSaving] = useState<boolean>(false);

    const [viewVisibleMonth, setViewVisibleMonth] = useState<CalendarMonthChangeEvent | null>(null);

    const handleMonthChange = (e: CalendarMonthChangeEvent) => {
        setViewVisibleMonth(e);
    };

    useEffect(() => {
        if (family?.id && !detailsOnly) {
            setLoading(true);
            getFamilyAvailability(family.id)
                .then(res => setAvailability(res))
                .catch(err => setError(err))
                .finally(() => setLoading(false));
        }
    }, [family, detailsOnly, reload]);

    if (!family) return null;

    const availableDates = availability.map(avail => new Date(avail.date));

    const isDateAvailable = (event: CalendarDateTemplateEvent) => {
        return availableDates.some(availableDate =>
            availableDate.getDate() === event.day &&
            availableDate.getMonth() === event.month &&
            availableDate.getFullYear() === event.year
        );
    };

    const dateTemplate = (event: CalendarDateTemplateEvent) => {
        if (isDateAvailable(event)) {
            return (
                <span className={"available-day " + (isSameDate(selectedDate, event) ? "selected-day" : "")}>
                    {event.day}
                </span>
            );
        }
        return event.day;
    };
    const minDate = dayjs();
    const alergies = family.fields['רגישויות ואלרגיות (from בדיקת ההתאמה)'];

    const isAvailableDatesVisible = availability.some(av => {
        const availableDate = dayjs(av.date);
        return availableDate.year() === viewVisibleMonth?.year && availableDate.month() - 1 == viewVisibleMonth?.month;
    });

    return (
        <div className="surface-card shadow-2 p-3 border-round relative">
            <Button label="סגור" onClick={onClose} className="mt-3" style={{ position: "absolute", left: 20, top: 0 }} />

            <ul className="pl-4 list-disc text-right">
                <div className="pb-3 underline text-lg">{family.fields.Name}</div>
                <li>המשפחה בת <strong> {family.fields['נפשות מבוגרים בבית']}</strong> נפשות</li>
                <li><strong>הרכב בני המשפחה:</strong> {family.fields['הרכב הורים']}</li>
                <li><strong>גילאי בני המשפחה:</strong> {family.fields['גילאים של הרכב המשפחה']},{family.fields['גיל החולה']}</li>
                <li><strong>כשרות:</strong> {family.fields['כשרות מטבח']}</li>
                <li><strong>העדפה לסוג ארוחה:</strong> {family.fields['העדפה לסוג ארוחה']}</li>
                <li><strong>העדפות בשר:</strong> {family.fields['העדפות בשר']}</li>
                <li><strong>העדפות דגים:</strong> {family.fields['העדפות דגים']}</li>
                <li><strong>לא אוכלים:</strong> {isNotEmpty(family.fields['לא אוכלים']) ? family.fields['לא אוכלים'] : "אין העדפה"}</li>
                <li><strong>תוספות:</strong> {family.fields['תוספות']}</li>
                <li>
                    {isNotEmpty(alergies) ? <div className="alergies">נא לשים לב לאלרגיה! {alergies}</div> :
                        <div><strong>אלרגיות:</strong> אין</div>}
                </li>
                <li><strong>שימו לב! ימי הבישול הם:</strong> {family.fields['ימים']?.join(", ") || ""}</li>

            </ul>
            {error && <div>תקלה בקריאת זמינות</div>}
            {!detailsOnly && <>
                <div className="flex flex-column">
                    <h3>לבחירת תאריך:</h3>
                    {loading && <InProgress />}
                    {!loading && availability.length == 0 && <div>אין תאריכים זמינים</div>}
                    <Calendar
                        onMonthChange={handleMonthChange}
                        className={!loading && !isAvailableDatesVisible ? 'watermarked-no-dates' : ''}
                        value={selectedDate}
                        enabledDates={availableDates}
                        onChange={(e) => {
                            console.log("date selected", e.value)
                            setSelectedDate(e.value)
                        }}
                        inline
                        // showButtonBar
                        dateTemplate={dateTemplate}
                        locale="he"
                        //firstDayOfWeek={"Sunday"}
                        monthNavigator
                        minDate={minDate.toDate()}
                    //yearNavigator 
                    //yearRange="2020:2030" 
                    />
{saving && <InProgress />}
                    <Button
                        disabled={!selectedDate || saving}
                        label="שבצו אותי"
                        onClick={() => {
                            const availabilityRecord = availability.find(a => dayjs(a.date).diff(selectedDate, "days") === 0);
                            // to avoid double click
                            setSelectedDate(null);
                            if (availabilityRecord) {
                                setSaving(true);
                                updateFamilityDemand(availabilityRecord.id, family.fields.familyid, cityId, true).then(() => {
                                    showToast("success", "שיבוץ נקלט בהצלחה", "");
                                    setReload(prev => prev + 1);
                                }).catch((err) => showToast("error", "תקלה ברישום (1) - ", err.message))
                                .finally(()=>setSaving(false));
                            }
                        }} className="mt-3" />
                </div>
            </>}
        </div>
    );
}