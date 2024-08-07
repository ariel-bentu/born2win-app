import { Button } from "primereact/button";
import { Calendar, CalendarDateTemplateEvent } from "primereact/calendar";


import { Availability, Family, getFamilyAvailability } from "./api";
import { useEffect, useState } from "react";
import { Nullable } from "primereact/ts-helpers";

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
    const isDateAvailable2 = (date: Nullable<Date>) => {
        return availableDates.some(availableDate =>
            date &&
            availableDate.getDate() === date.getDate() &&
            availableDate.getMonth() === date.getMonth() &&
            availableDate.getFullYear() === date.getFullYear()
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

    return (
        <div className="surface-card shadow-2 p-3 border-round">
            <Button label="סגור" onClick={onClose} className="mt-3" style={{ position: "absolute", left: 20 }} />
            <h2>{family.fields.Name}</h2>
            <p><strong>כשרות מטבח:</strong> {family.fields['כשרות מטבח']}</p>
            <p><strong>אוהבים לאכול:</strong> {family.fields['אוהבים לאכול']}</p>
            <p><strong>רגישויות ואלרגיות:</strong> {family.fields['רגישויות ואלרגיות (from בדיקת ההתאמה)']}</p>
            <p><strong>נפשות מבוגרים בבית:</strong> {family.fields['נפשות מבוגרים בבית']}</p>
            <p><strong>גילאים של הרכב המשפחה:</strong> {family.fields['גילאים של הרכב המשפחה']}</p>
            <p><strong>מחוז:</strong> {family.fields['מחוז']}</p>
            <p><strong>קומה:</strong> {family.fields['קומה']}</p>

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