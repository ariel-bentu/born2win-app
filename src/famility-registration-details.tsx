import { Button } from "primereact/button";
import { Calendar, CalendarDateTemplateEvent, CalendarMonthChangeEvent, CalendarViewChangeEvent } from "primereact/calendar";
import "./registration.css";


import { getFamilyDetails, updateFamilityDemand } from "./api";
import { useEffect, useRef, useState } from "react";
import { Nullable } from "primereact/ts-helpers";
import dayjs from "dayjs";
import { InProgress } from "./common-ui";
import { FamilyCompact, FamilyDemand, FamilyDetails, ShowToast } from "./types";
import { isNotEmpty } from "./utils";
import { openPhoneDialer, openWhatsApp } from "./notification-actions";
import { ScrollPanel } from "primereact/scrollpanel";
import { ProgressSpinner } from "primereact/progressspinner";

interface FamilyDetailsComponentProps {
    demands: FamilyDemand[];
    family: FamilyCompact;
    familyId: string; // added to avoid refresh when family object is recreated for the same family
    detailsOnly?: boolean;
    showToast: ShowToast;
    onClose: () => void;
    reloadOpenDemands: () => void;
    includeContacts: boolean;
}

function isSameDate(d: Nullable<Date>, event: CalendarDateTemplateEvent) {
    return d &&
        d.getDate() === event.day &&
        d.getMonth() === event.month &&
        d.getFullYear() === event.year;
}

export function FamilyDetailsComponent({ familyId, family, onClose, detailsOnly, showToast, demands, reloadOpenDemands, includeContacts }: FamilyDetailsComponentProps) {
    const [familyDetails, setFamilyDetails] = useState<FamilyDetails | undefined>(undefined)
    const [selectedDate, setSelectedDate] = useState<Nullable<Date>>(null);
    const [error, setError] = useState<any>(undefined);
    const [loading, setLoading] = useState<boolean>(false);
    const [reload, setReload] = useState<number>(0);
    const [saving, setSaving] = useState<boolean>(false);

    const [viewVisibleMonth, setViewVisibleMonth] = useState<CalendarMonthChangeEvent>({ year: dayjs().year(), month: dayjs().month() });
    const divRef = useRef<HTMLUListElement>(null);

    const handleMonthChange = (e: CalendarMonthChangeEvent) => {
        console.log("Month changed", e)
        setViewVisibleMonth(e);
    };

    useEffect(() => {
        if (familyId) {
            setLoading(true);
            getFamilyDetails(family.familyId, includeContacts)
                .then(res => setFamilyDetails(res))
                .catch(err => setError(err))
                .finally(() => setLoading(false));
        }
    }, [familyId, detailsOnly, reload]);

    const availableDates = demands.map(demand => new Date(demand.date));
    const isDateAvailable = (event: CalendarDateTemplateEvent) => {
        return availableDates.some(availableDate =>
            availableDate.getDate() === event.day &&
            availableDate.getMonth() === event.month &&
            availableDate.getFullYear() === event.year
        );
    };


    const handleScrollToDetails = () => {
        if (divRef.current) {
            divRef.current.scrollIntoView({ behavior: 'smooth' });
        }
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
    const alergies = familyDetails?.alergies;

    const isAvailableDatesVisible = demands.some(av => {
        const availableDate = dayjs(av.date);
        return availableDate.year() === viewVisibleMonth.year && availableDate.month() == viewVisibleMonth.month;
    });

    return (
        <div  className="flex flex-column relative justify-content-center shadow-2 p-3" style={{ maxWidth: 700 }}>
            <Button unstyled icon="pi pi-times" onClick={onClose} className="icon-btn-l" style={{ position: "absolute", right: 0, top: 0 }} />
            {!detailsOnly && <>
                <div className="flex flex-column justify-content-center align-items-center " >
                    <div className="tm-5 pb-1 underline text-lg" style={{ maxWidth: "80%" }}>{family.familyLastName}</div>
                    <div className="flex flex-row w-full justify-content-between rm-2">
                        <div><span className="m-2">עיר:</span><span>{family.city}</span></div>
                        <div className="flex flex-row align-items-center">
                            {loading && <ProgressSpinner style={{ height: 20, width: 20 }} />}
                            <a href="#" onClick={loading?undefined:handleScrollToDetails}>פרטי משפחה</a>
                        </div>
                    </div>

                    <h3>לבחירת תאריך:</h3>
                    {demands.length == 0 && <div>אין תאריכים זמינים</div>}
                    <Calendar
                        //style={{ width: '400px' }}
                        onMonthChange={handleMonthChange}
                        className={!isAvailableDatesVisible ? 'watermarked-no-dates' : ''}
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
                        disabled={!selectedDate || !familyDetails || saving}

                        label="שבצו אותי"
                        onClick={() => {
                            const availabilityRecord = demands.find(a => dayjs(a.date).diff(selectedDate, "days") === 0);
                            // to avoid double click
                            setSelectedDate(null);
                            if (availabilityRecord && familyDetails) {
                                setSaving(true);
                                updateFamilityDemand(availabilityRecord.id, familyDetails.familyId, familyDetails.cityId, true).then(() => {
                                    showToast("success", "שיבוץ נקלט בהצלחה", "");
                                    reloadOpenDemands();
                                    setReload(prev => prev + 1);
                                }).catch((err) => showToast("error", "תקלה ברישום (1) - ", err.message))
                                    .finally(() => setSaving(false));
                            }
                        }} className="mt-3 w-full" />
                </div>
            </>}
            {error && <div>תקלה בקריאת פרטי משפחה</div>}
            {loading && <div className="mt-5"><InProgress /></div>}
            {familyDetails &&
                <ul ref={divRef} className="pl-4 list-disc text-right w-full">
                    <div className="tm-5 pb-1 underline text-lg">שם: {familyDetails.familyLastName}</div>
                    <li>המשפחה בת <strong> {familyDetails.adultsCount}</strong> נפשות</li>
                    <li><strong>הרכב בני המשפחה:</strong> {familyDetails.familyStructure}</li>
                    <li><strong>גילאי בני המשפחה:</strong> {familyDetails.familyMembersAge},{familyDetails.patientAge}</li>
                    <li><strong>כשרות:</strong> {familyDetails.kosherLevel}</li>
                    <li><strong>העדפה לסוג ארוחה:</strong> {familyDetails.prefferedMeal}</li>
                    <li><strong>העדפות בשר:</strong> {familyDetails.meatPreferences}</li>
                    <li><strong>העדפות דגים:</strong> {familyDetails.fishPreferences}</li>
                    <li><strong>לא אוכלים:</strong> {isNotEmpty(familyDetails.avoidDishes) ? familyDetails.avoidDishes : "אין העדפה"}</li>
                    <li><strong>תוספות:</strong> {familyDetails.sideDishes}</li>
                    <li>
                        {isNotEmpty(alergies) ? <div className="alergies">נא לשים לב לאלרגיה! {alergies}</div> :
                            <div><strong>אלרגיות:</strong> אין</div>}
                    </li>
                    <li><strong>שימו לב! ימי הבישול הם:</strong> {familyDetails.cookingDays?.join(", ") || ""}</li>
                    {includeContacts && <>
                        <li><strong>איש קשר:</strong> {familyDetails.contactName}</li>
                        {isNotEmpty(familyDetails.relationToPatient) && (
                            <li><strong>סוג הקשר לחולה:</strong> {familyDetails.relationToPatient}</li>
                        )}
                        <li className="flex flex-row align-items-center">
                            <strong className="ml-2">מספר טלפון:</strong>{familyDetails.phone}
                            <Button
                                icon="pi pi-whatsapp"
                                className="p-button-rounded p-button-info m-2"
                                onClick={() => openWhatsApp(familyDetails.phone, "")}
                                aria-label="WhatsApp"
                            />
                            <Button
                                icon="pi pi-phone"
                                className="p-button-rounded p-button-success m-2"
                                onClick={() => openPhoneDialer(familyDetails.phone)}
                                aria-label="Phone"
                            />
                        </li>
                    </>}
                </ul>}
        </div>
    );
}