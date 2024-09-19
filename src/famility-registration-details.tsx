import { Button } from "primereact/button";
import { Calendar, CalendarDateTemplateEvent, CalendarMonthChangeEvent } from "primereact/calendar";
import "./registration.css";


import { getFamilyDetails, updateFamilityDemand } from "./api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Nullable } from "primereact/ts-helpers";
import dayjs from "dayjs";
import { ChannelHeader, InProgress, PhoneNumber } from "./common-ui";
import { AppServices, FamilyCompact, FamilyDemand, FamilyDetails } from "./types";
import { isNotEmpty } from "./utils";
import { ProgressSpinner } from "primereact/progressspinner";
import { SelectButton } from "primereact/selectbutton";
import { PrimeIcons } from "primereact/api";

interface FamilyDetailsComponentProps {
    demands: FamilyDemand[];
    family: FamilyCompact;
    familyDemandId?: string; // this is required only if not admin, so the server can check the user is indeed volunter of this demand and allow see details
    districtBaseFamilyId: string; // added to avoid refresh when family object is recreated for the same family
    detailsOnly?: boolean;
    appServices: AppServices;
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



export function FamilyDetailsComponent({ districtBaseFamilyId, family, familyDemandId, onClose, detailsOnly, appServices, demands, reloadOpenDemands, includeContacts }: FamilyDetailsComponentProps) {
    const [familyDetails, setFamilyDetails] = useState<FamilyDetails | undefined>(undefined)
    const [selectedDate, setSelectedDate] = useState<Nullable<Date>>(null);
    const [error, setError] = useState<any>(undefined);
    const [loading, setLoading] = useState<boolean>(false);
    const [reload, setReload] = useState<number>(0);
    const [saving, setSaving] = useState<boolean>(false);
    const [viewDate, setViewDate] = useState(new Date());

    const months = useMemo(() => {
        const today = dayjs();
        const nextMonth = today.add(1, "month");

        const thisMonthCount = demands.filter(d => dayjs(d.date).month() === today.month()).length;
        const nextMonthCount = demands.filter(d => dayjs(d.date).month() === nextMonth.month()).length;

        return [{
            name: today.format("MMMM"),
            month: today.month(),
            year: today.year(),
            count: thisMonthCount,
        },
        {
            name: nextMonth.format("MMMM"),
            month: nextMonth.month(),
            year: nextMonth.year(),
            count: nextMonthCount,
        }];
    }, [demands])

    const [viewVisibleMonth, setViewVisibleMonth] = useState<CalendarMonthChangeEvent>({ year: dayjs().year(), month: dayjs().month() });
    const divRef = useRef<HTMLUListElement>(null);

    // const handleMonthChange = (e: CalendarMonthChangeEvent) => {
    //     console.log("Month changed", e)
    //     setViewVisibleMonth(e);
    // };

    useEffect(() => {
        if (districtBaseFamilyId) {
            setLoading(true);
            console.log("get family details", districtBaseFamilyId)
            getFamilyDetails(family.districtBaseFamilyId, family.district, familyDemandId, includeContacts)
                .then(res => setFamilyDetails(res))
                .catch(err => setError(err))
                .finally(() => setLoading(false));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [districtBaseFamilyId, detailsOnly, reload]);

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

    const getAddress = (fd: FamilyDetails) => {
        return fd.street + " " + fd.streatNumber +
            (fd.appartment ? ", דירה " + fd.appartment : "") +
            (fd.floor ? ", קומה " + fd.floor : "") +
            ", " + fd.city;
    }

    const dateTemplate = useCallback((event: CalendarDateTemplateEvent) => {
        const inVisibleMonth = event.month === viewVisibleMonth.month && event.year === viewVisibleMonth.year;
        if (!inVisibleMonth) {
            return <span style={{ visibility: 'hidden' }}>{event.day}</span>;
        }
        if (isDateAvailable(event)) {
            return (
                <span className={"available-day " + (isSameDate(selectedDate, event) ? "selected-day" : "")}>
                    {event.day}
                </span>
            );
        }
        return event.day;
    }, [viewVisibleMonth, selectedDate])
    const minDate = dayjs();
    const alergies = familyDetails?.alergies;

    const isAvailableDatesVisible = demands.some(av => {
        const availableDate = dayjs(av.date);
        return availableDate.year() === viewVisibleMonth.year && availableDate.month() === viewVisibleMonth.month;
    });

    return (
        <div className="flex flex-column relative justify-content-center w-full p-3" style={{ maxWidth: 700 }}>
            <ChannelHeader name={family.familyLastName + (family.active ? "" : " - לא פעילה")} onBack={onClose} />
            <div className="flex flex-row w-12 justify-content-end mb-2">
                {!detailsOnly &&
                    <div className="flex flex-row align-items-center">
                        {loading && <ProgressSpinner style={{ height: 20, width: 20 }} />}
                        <span className="clickable-span" onClick={loading ? undefined : handleScrollToDetails}>פרטי משפחה</span>
                    </div>
                }
            </div>

            {!detailsOnly && <>
                <div className='flex flex-row relative justify-content-center align-items-center'>
                    <SelectButton
                        pt={{ root: { className: "select-button-container mb-2" } }}
                        unstyled
                        value={viewDate} onChange={(e) => {
                            setViewVisibleMonth(e.value)
                            const newDate = dayjs(e.value.year + "-" + (e.value.month + 1) + "-01")
                            console.log("selected ", newDate.format("YYYY-MM-DD"));
                            setViewDate(newDate.toDate());
                        }} optionLabel="name" options={months}
                        itemTemplate={(option) => (
                            <div className={`select-button-item relative ${viewVisibleMonth.month === option.month ? 'p-highlight' : ''}`}>
                                {option.name}
                                <div className='select-month-badge'>{option.count}</div>
                            </div>
                        )}
                    />

                </div>
                <Calendar
                    viewDate={viewDate}
                    className={!isAvailableDatesVisible ? 'watermarked-no-dates' : ''}
                    value={selectedDate}
                    enabledDates={availableDates}
                    onChange={(e) => {
                        console.log("date selected", e.value)
                        setSelectedDate(e.value)
                    }}
                    inline

                    dateTemplate={dateTemplate}
                    locale="he"
                    minDate={minDate.toDate()}
                />
                {saving && <InProgress />}
                <div className="button-container mt-3 ">
                    {selectedDate && <i className={`arrow-animation ${PrimeIcons.ANGLE_LEFT}`}></i>}

                    <Button
                        disabled={!selectedDate || !familyDetails || saving}

                        label={"שבצו אותי" + (selectedDate ? (" ב- " + dayjs(selectedDate).format("DD-MMM") + "׳") : "")}
                        onClick={() => {
                            const availabilityRecord = demands.find(a => dayjs(a.date).diff(selectedDate, "days") === 0);
                            // to avoid double click
                            setSelectedDate(null);
                            if (availabilityRecord && familyDetails) {
                                setSaving(true);
                                updateFamilityDemand(availabilityRecord.id, familyDetails.mainBaseFamilyId, familyDetails.cityId, true).then(() => {
                                    appServices.showMessage("success", "שיבוץ נקלט בהצלחה", "");
                                    reloadOpenDemands();
                                    setReload(prev => prev + 1);
                                }).catch((err) => appServices.showMessage("error", "תקלה ברישום (1) - ", err.message))
                                    .finally(() => setSaving(false));
                            }
                        }} className="w-full" />
                </div>

            </>}
            {error && <div>תקלה בקריאת פרטי משפחה</div>}
            {loading && <div className="mt-5"><InProgress /></div>}
            {familyDetails &&
                <ul ref={divRef} className="pl-4 list-disc text-right">
                    {/* <div className="tm-5 pb-1 underline text-lg">שם: {familyDetails.familyLastName}</div> */}
                    <div className="tm-5 pb-1 underline text-lg">פרטים</div>
                    <li><strong>עיר:</strong>{family.city}</li>
                    <li>המשפחה בת <strong> {familyDetails.adultsCount}</strong> נפשות</li>
                    <li><strong>הרכב בני המשפחה:</strong> {familyDetails.familyStructure}</li>
                    <li><strong>גילאי בני המשפחה:</strong> {familyDetails.familyMembersAge}</li>
                    <li><strong>גיל החולה:</strong> {familyDetails.patientAge}</li>
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
                        <li><strong>כתובת:</strong>{getAddress(familyDetails)}</li>
                        {isNotEmpty(familyDetails.contactName) && (
                            <li><strong>איש קשר:</strong> {familyDetails.contactName}</li>
                        )}
                        {isNotEmpty(familyDetails.phone) && (<li>
                            <PhoneNumber phone={familyDetails.phone} />
                        </li>)}
                    </>}

                </ul>}
        </div>
    );
}