import { Button } from "primereact/button";
import { Calendar, CalendarDateTemplateEvent } from "primereact/calendar";


import { Availability, Family, getFamilyAvailability } from "./api";
import { useEffect, useState } from "react";
import { Nullable } from "primereact/ts-helpers";
import dayjs from "dayjs";

interface FamilyDetailsProps {
    family: Family | null;
    onClose: () => void;
}

function isSameDate(d: Nullable<Date>, event: CalendarDateTemplateEvent) {
    return d &&
        d.getDate() === event.day &&
        d.getMonth() === event.month &&
        d.getFullYear() === event.year;
}

export function FamilyDetails({ family, onClose }: FamilyDetailsProps) {
    const [availability, setAvailability] = useState<Availability[]>([]);
    const [selectedDate, setSelectedDate] = useState<Nullable<Date>>(null);

    useEffect(() => {
        if (family?.id) {
            getFamilyAvailability(family.id, family.fields.base_id).then(res => setAvailability(res));
        }
    }, [family]);

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
            <h3>לבחירת תאריך:</h3>
            <Calendar
                value={selectedDate}
                enabledDates={availableDates}
                onChange={(e) => {
                    console.log("date selected", e.value)
                    setSelectedDate(e.value)
                }}
                inline
                showButtonBar
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
                    alert("not implemented yet")
                }} className="mt-3" />

        </div>
    );
}