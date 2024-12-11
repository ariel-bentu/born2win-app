import { Button } from "primereact/button";
import { Calendar, CalendarDateTemplateEvent, CalendarMonthChangeEvent } from "primereact/calendar";
import "./registration.css";


import { analyticLog, getFamilyDetails, getVolunteerInfo, impersonateUser, updateFamilyDemand } from "./api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Nullable } from "primereact/ts-helpers";
import dayjs from "dayjs";
import { ChannelHeader, InProgress, PhoneNumber, WhatsAppButton } from "./common-ui";
import { AppServices, FamilyCompact, FamilyDemand, FamilyDetails, VolunteerInfo, VolunteerType } from "./types";
import { isNotEmpty, nicePhone } from "./utils";
import { ProgressSpinner } from "primereact/progressspinner";
import { SelectButton } from "primereact/selectbutton";
import { PrimeIcons } from "primereact/api";
import { openWhatsApp } from "./notification-actions";

interface FamilyDetailsComponentProps {
    demands: FamilyDemand[];
    family: FamilyCompact;
    familyDemandId?: string; // this is required only if not admin, so the server can check the user is indeed volunter of this demand and allow see details
    mainBaseFamilyId: string; // added to avoid refresh when family object is recreated for the same family
    detailsOnly?: boolean;
    appServices: AppServices;
    onClose: () => void;
    reloadOpenDemands: () => void;
    includeContacts: boolean;
    date?: string //used to include it in the message to impersonated users
    analyticComponent: string;
    actualUserId: string;
    showInactiveFamilyLabel?: boolean;
    additionalHeader?: string;
    type: VolunteerType;
}

function isSameDate(d: Nullable<Date>, event: CalendarDateTemplateEvent) {
    return d &&
        d.getDate() === event.day &&
        d.getMonth() === event.month &&
        d.getFullYear() === event.year;
}



export function FamilyDetailsComponent({ mainBaseFamilyId, family, familyDemandId,
    onClose, detailsOnly, appServices, demands, reloadOpenDemands, includeContacts,
    date, analyticComponent, actualUserId, showInactiveFamilyLabel,
    additionalHeader,
    type,
}: FamilyDetailsComponentProps) {
    const [familyDetails, setFamilyDetails] = useState<FamilyDetails | undefined>(undefined)
    const [selectedDate, setSelectedDate] = useState<Nullable<Date>>(null);
    const [error, setError] = useState<any>(undefined);
    const [loading, setLoading] = useState<boolean>(false);
    const [reload, setReload] = useState<number>(0);
    const [transportingVolunteer, setTranspotingVolunteer] = useState<VolunteerInfo | undefined>(undefined);
    const [volunteerInfo, setVolunteerInfo] = useState<VolunteerInfo | undefined>();
    const [saving, setSaving] = useState<boolean>(false);
    const [viewDate, setViewDate] = useState(new Date());

    const months = useMemo(() => {
        const today = dayjs();
        const nextMonth = today.add(1, "month");
        const twoMonthsAhead = today.add(2, "month");

        const thisMonthCount = demands.filter(d => dayjs(d.date).month() === today.month()).length;
        const nextMonthCount = demands.filter(d => dayjs(d.date).month() === nextMonth.month()).length;
        const twoMonthsAheadCount = demands.filter(d => dayjs(d.date).month() === twoMonthsAhead.month()).length;

        const res = [{
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

        if (twoMonthsAheadCount > 0) {
            res.push({
                name: twoMonthsAhead.format("MMMM"),
                month: twoMonthsAhead.month(),
                year: twoMonthsAhead.year(),
                count: twoMonthsAheadCount,
            });
        }

        return res;
    }, [demands])

    const [viewVisibleMonth, setViewVisibleMonth] = useState<CalendarMonthChangeEvent>({ year: dayjs().year(), month: dayjs().month() });
    const divRef = useRef<HTMLUListElement>(null);

    // const handleMonthChange = (e: CalendarMonthChangeEvent) => {
    //     console.log("Month changed", e)
    //     setViewVisibleMonth(e);
    // };

    useEffect(() => {
        if (mainBaseFamilyId) {
            setLoading(true);
            console.log("get family details", mainBaseFamilyId, family.districtBaseFamilyId)
            getFamilyDetails(family.districtBaseFamilyId, family.district, familyDemandId, family.mainBaseFamilyId, includeContacts)
                .then(res => setFamilyDetails(res))
                .catch(err => setError(err))
                .finally(() => setLoading(false));
            const demand = demands.find(d => d.id === familyDemandId);
            if (demand && demand.transpotingVolunteerId) {
                getVolunteerInfo(demand.transpotingVolunteerId).then(v => {
                    setTranspotingVolunteer(v);
                })
            } else {
                setTranspotingVolunteer(undefined);
            }
            if (demand && demand.volunteerId) {
                getVolunteerInfo(demand.volunteerId).then(info => {
                    setVolunteerInfo(info);
                });
            } else {
                setVolunteerInfo(undefined);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mainBaseFamilyId, familyDemandId, detailsOnly, reload]);

    const availableDates = demands.map(demand => new Date(demand.date));

    const handleScrollToDetails = () => {
        if (divRef.current) {
            analyticLog(analyticComponent, "scroll to details");
            divRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    };

    const dateTemplate = useCallback((event: CalendarDateTemplateEvent) => {
        const inVisibleMonth = event.month === viewVisibleMonth.month && event.year === viewVisibleMonth.year;
        if (!inVisibleMonth) {
            return <span style={{ visibility: 'hidden' }}>{event.day}</span>;
        }

        const eventDate = `${event.year}-${event.month + 1}-${event.day}`;
        if (demands.find(d => dayjs(d.date).isSame(eventDate))) {
            return (
                <span className={"available-day " + (isSameDate(selectedDate, event) ? "selected-day" : "")}>
                    {event.day}
                </span>
            );
        }
        return event.day;
    }, [viewVisibleMonth, selectedDate, demands])

    const minDate = dayjs();
    const alergies = familyDetails?.alergies;

    const isAvailableDatesVisible = demands.some(av => {
        const availableDate = dayjs(av.date);
        return availableDate.year() === viewVisibleMonth.year && availableDate.month() === viewVisibleMonth.month;
    });

    return (
        <div className="flex flex-column relative justify-content-center w-full p-3" style={{ maxWidth: 700 }}>
            <ChannelHeader name={family.familyLastName + (family.active || !showInactiveFamilyLabel ? "" : " - לא פעילה")} onBack={onClose} />
            {additionalHeader && <div className="family-additional-header">{additionalHeader}</div>}
            <div className="flex flex-row w-12 justify-content-end mb-2">
                {!detailsOnly &&
                    <div className="flex flex-column justify-content-start align-items-start w-12 pr-3">
                        {loading && <ProgressSpinner style={{ height: 20, width: 20 }} />}
                        {familyDetails && <>
                            <li><strong>עיר:</strong>{family.city}</li>
                            <li>המשפחה בת <strong> {familyDetails.adultsCount}</strong> נפשות</li>
                            <li><strong>הרכב בני המשפחה:</strong> {familyDetails.familyStructure}</li>
                            <li><strong>גילאי בני המשפחה:</strong> {familyDetails.familyMembersAge}</li>
                            <li><strong>גיל החולה:</strong> {familyDetails.patientAge}</li>
                        </>}
                        <span className="clickable-span" onClick={loading ? undefined : handleScrollToDetails}>לפרטי משפחה נוספים...</span>
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
                                analyticLog(analyticComponent, "save new Registration");
                                updateFamilyDemand(availabilityRecord.id, familyDetails.mainBaseFamilyId, familyDetails.cityId, true,
                                    type, "", availabilityRecord.district).then(() => {
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
                    {isNotEmpty(familyDetails.importantNotice) && <li>
                        <div className="alergies"><strong>נא לשים לב:</strong> {familyDetails.importantNotice}</div>
                    </li>}
                    <li><strong>שימו לב! ימי הבישול הם:</strong> {familyDetails.cookingDays?.join(", ") || ""}</li>
                    {includeContacts && <>
                        <li><strong>כתובת:</strong>{getAddress(familyDetails)}</li>
                        {isNotEmpty(familyDetails.contactName) && (
                            <li><strong>איש קשר משפחה:</strong> {familyDetails.contactName}</li>
                        )}
                        {isNotEmpty(familyDetails.phone) && (<li>
                            <PhoneNumber phone={familyDetails.phone} label="טלפון איש קשר משפחה" />
                        </li>)}
                        {volunteerInfo && transportingVolunteer && transportingVolunteer.id == actualUserId && (
                            <>
                                <li><strong>שם מבשל:</strong> {volunteerInfo.firstName + " " + volunteerInfo.lastName}</li>
                                {volunteerInfo?.phone && (
                                    <li>
                                        <PhoneNumber phone={volunteerInfo.phone} label="טלפון מבשל" />
                                    </li>
                                )}
                            </>
                        )}
                        {transportingVolunteer && volunteerInfo && volunteerInfo.id == actualUserId && (
                            <>
                                <li><strong>שם משנע:</strong> {transportingVolunteer.firstName + " " + transportingVolunteer.lastName}</li>
                                {transportingVolunteer?.phone && (
                                    <li>
                                        <PhoneNumber phone={transportingVolunteer.phone} label="טלפון משנע" />
                                    </li>
                                )}
                            </>
                        )}
                        {impersonateUser && impersonateUser.phone && (<li className="flex align-items-center">
                            <strong>שלח פרטים ל{impersonateUser.name}</strong>
                            <WhatsAppButton
                                getPhone={() => impersonateUser!.phone}
                                getText={() => generateDetailsForWhatapp(familyDetails, family.city, date, volunteerInfo, transportingVolunteer, actualUserId)} />
                        </li>)}
                    </>}
                </ul>}
        </div>
    );
}

function getAddress(fd: FamilyDetails) {
    return fd.street + " " + fd.streatNumber +
        (fd.appartment ? ", דירה " + fd.appartment : "") +
        (fd.floor ? ", קומה " + fd.floor : "") +
        ", " + fd.city;
}

export const generateDetailsForWhatapp = (familyDetails: FamilyDetails, city: string, date?: string, volunteerInfo?: VolunteerInfo, transportingVolunteer?: VolunteerInfo, actualUserId?: string) => {
    const alergies = familyDetails?.alergies;

    let msg = `*פרטי בישול*:\n`;
    msg += `*משפחה*: ${familyDetails.familyLastName}\n`;
    msg += `*תאריך*: ${date ? dayjs(date).format("DD-MMM-YYYY") : ""}\n`;
    msg += `*עיר*: ${city}\n`;
    msg += `*המשפחה בת*: ${familyDetails.adultsCount} נפשות\n`;
    msg += `*הרכב בני המשפחה*: ${familyDetails.familyStructure}\n`;
    msg += `*גילאי בני המשפחה*: ${familyDetails.familyMembersAge}\n`;
    msg += `*גיל החולה*: ${familyDetails.patientAge}\n`;
    msg += `*כשרות*: ${familyDetails.kosherLevel}\n`;
    msg += `*העדפה לסוג ארוחה*: ${familyDetails.prefferedMeal}\n`;
    msg += `*העדפות בשר*: ${familyDetails.meatPreferences || ""}\n`;
    msg += `*העדפות דגים*: ${familyDetails.fishPreferences}\n`;
    msg += `*לא אוכלים*: ${isNotEmpty(familyDetails.avoidDishes) ? familyDetails.avoidDishes : "אין העדפה"}\n`;
    msg += `*תוספות*: ${familyDetails.sideDishes}\n`;

    if (isNotEmpty(alergies)) {
        msg += `*נא לשים לב לאלרגיה!* ${alergies}\n`;
    } else {
        msg += `*אלרגיות*: אין\n`;
    }

    msg += `*שימו לב! ימי הבישול הם*: ${familyDetails.cookingDays?.join(", ") || ""}\n`;
    msg += `*כתובת*: ${getAddress(familyDetails)}\n`;

    if (isNotEmpty(familyDetails.contactName)) {
        msg += `*איש קשר משפחה*: ${familyDetails.contactName}\n`;
    }

    if (isNotEmpty(familyDetails.phone)) {
        msg += `*טלפון איש קשר משפחה*: ${nicePhone(familyDetails.phone)}\n`;
    }

    if (volunteerInfo && transportingVolunteer && transportingVolunteer.id == actualUserId) {
        msg += `*שם מבשל*: ${volunteerInfo.firstName} ${volunteerInfo.lastName}\n`;
        if (isNotEmpty(volunteerInfo.phone)) {
            msg += `*טלפון מבשל*: ${nicePhone(volunteerInfo.phone)}\n`;
        }
    }

    if (transportingVolunteer && volunteerInfo && volunteerInfo.id == actualUserId) {
        msg += `*שם משנע*: ${transportingVolunteer.firstName} ${transportingVolunteer.lastName}\n`;
        if (isNotEmpty(transportingVolunteer.phone)) {
            msg += `*טלפון משנע*: ${nicePhone(transportingVolunteer.phone)}\n`;
        }
    }

    return msg;
};