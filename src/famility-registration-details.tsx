import { Button } from "primereact/button";
import { Calendar, CalendarDateTemplateEvent } from "primereact/calendar";


import { Availability, Family, getFamilyAvailability, updateFamilityDemand } from "./api";
import { useEffect, useState } from "react";
import { Nullable } from "primereact/ts-helpers";
import dayjs from "dayjs";
import { InProgress } from "./common-ui";
import { ShowToast } from "./types";

interface FamilyDetailsProps {
    family: Family | null;
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

export function FamilyDetails({ family, onClose, detailsOnly, showToast }: FamilyDetailsProps) {
    const [availability, setAvailability] = useState<Availability[]>([]);
    const [selectedDate, setSelectedDate] = useState<Nullable<Date>>(null);
    const [error, setError] = useState<any>(undefined);
    const [loading, setLoading] = useState<any>(undefined);

    useEffect(() => {
        if (family?.id && !detailsOnly) {
            setLoading(true);
            getFamilyAvailability(family.id, family.fields.base_id)
                .then(res => setAvailability(res))
                .catch(err => setError(err))
                .finally(() => setLoading(false));
        }
    }, [family, detailsOnly]);

    if (!family) return null;

    const availableDates = availability.map(avail => new Date(avail.fields["תאריך"]));

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

    return (
        <div className="surface-card shadow-2 p-3 border-round relative">
            <Button label="סגור" onClick={onClose} className="mt-3" style={{ position: "absolute", left: 20, top: 0 }} />

            <strong>{family.fields.Name}</strong>
            <ul className="pl-4 list-disc text-right">

                <li>המשפחה בת <strong> {family.fields['נפשות מבוגרים בבית']}</strong> נפשות</li>
                <li><strong>הרכב בני המשפחה:</strong> {family.fields['הרכב הורים']}</li>
                <li><strong>גילאי בני המשפחה:</strong> {family.fields['גילאים של הרכב המשפחה']},{family.fields['גיל החולה']}</li>
                <li><strong>כשרות:</strong> {family.fields['כשרות מטבח']}</li>
                <li><strong>העדפה לסוג ארוחה:</strong> {family.fields['העדפה לסוג ארוחה']}</li>
                <li><strong>העדפות בשר:</strong> {family.fields['העדפות בשר']}</li>
                <li><strong>העדפות דגים:</strong> {family.fields['העדפות דגים']}</li>
                <li><strong>תוספות:</strong> {family.fields['תוספות']}</li>
                <li>
                    {alergies?.length ? <div className="alergies">נא לשים לב לאלרגיה! {family.fields['רגישויות ואלרגיות (from בדיקת ההתאמה)']}</div> :
                        <div><strong>אלרגיות:</strong> אין</div>}
                </li>
            </ul>
            {error && <div>תקלה בקריאת זמינות</div>}
            {!detailsOnly && <>
                <div className="flex flex-column">
                    <h3>לבחירת תאריך:</h3>
                    {loading && <InProgress />}
                    {!loading && availability.length == 0 && <div>אין תאריכים זמינים</div>}
                    <Calendar
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

                    <Button
                        disabled={!selectedDate}
                        label="שבצו אותי"
                        onClick={() => {
                            const availabilityRecord = availability.find(a => dayjs(a.fields["תאריך"]).diff(selectedDate, "days") === 0);
                            if (availabilityRecord) {
                                updateFamilityDemand(availabilityRecord.id, true).then(() => {
                                    showToast("success", "שיבוץ נקלט בהצלחה", "");
                                    console.log("register success");
                                }).catch((err) => showToast("error", "תקלה ברישום (1) - ", err.message));
                            }
                        }} className="mt-3" />
                </div>
            </>}
        </div>
    );
}