import React, { useEffect, useRef, useState } from 'react';
import { Chart } from 'primereact/chart';
import { MultiSelect } from 'primereact/multiselect';
import dayjs, { Dayjs } from 'dayjs';
import minMax from 'dayjs/plugin/minMax'; // Plugin to find min and max dates

import { AppServices, FamilyCompact, FamilyDemand, FamilyDetails, Status, UserInfo, VolunteerInfo, VolunteerType } from './types';
import {
    getDemands,
    getFamilyDetails,
    getVolunteerInfo,
    handleSearchUsers, impersonateUser,
    updateDemandTransportation,
    updateFamilyDemand
} from './api';
import { generateDetailsForWhatapp } from './family-registration-details';


import { InProgress, PhoneNumber, WeekSelectorSlider, WhatsAppButton } from './common-ui';
import { SelectButton } from 'primereact/selectbutton';
import { dateInRange, simplifyFamilyName, sortByDate, toSunday } from './utils';
import { Button } from 'primereact/button';
import "./charts.css"
import { FamilyDetailsComponent } from './family-registration-details';
import { AutoComplete, AutoCompleteCompleteEvent } from 'primereact/autocomplete';
import { OverlayPanel } from 'primereact/overlaypanel';
import { ProgressSpinner } from 'primereact/progressspinner';
import { confirmPopup } from 'primereact/confirmpopup';
import { Recipient } from './types';
import { Dialog } from "primereact/dialog";
import { openWhatsApp } from "./notification-actions";
import { GiPartyHat } from 'react-icons/gi';

dayjs.extend(minMax);

interface DemandChartProps {
    data: FamilyDemand[];
    mode: number;
    appServices: AppServices;
    userInfo: UserInfo;
    showFilterByVolunteer?: boolean;
    onCancellationPerformed?: () => void;
    onSelectFamily?: (family: GroupedFamily | undefined) => void,
    setLoading: (isLoading: boolean) => void;
    setReload: (reload: number | ((prev: number) => number)) => void;
    startDate: Dayjs;
    endDate: Dayjs;
}

const Modes = {
    Open: 1,
    Fulfilled: 2,
    HolidayTreats: 3,
    Chart: 4,
    array: [
        { name: 'חסרים', value: 1 },
        { name: 'משובצים', value: 2 },
        { name: 'גרף', value: 4 },
    ],
    array2: [
        { name: 'חסרים', value: 1 },
        { name: 'משובצים', value: 2 },
        { name: 'פינוקי חג', value: 3 },
        { name: 'גרף', value: 4 },
    ]
}

interface StatsProps {
    userInfo: UserInfo,
    appServices: AppServices;

}

interface DateInfo {
    date: string;
    expandDays: number[];
    volunteerId: string;
    demandId: string;
    mainBaseFamilyId: string;
    districtBaseFamilyId: string;
    transportingVolunteerId?: string;
    district: string;
    parentFamily: GroupedFamily;
    type: VolunteerType;
}

interface GroupedFamily extends FamilyCompact {
    dates: DateInfo[];
}

interface GroupedData {
    [city: string]: {
        [mainBaseFamilyId: string]: GroupedFamily;
    };
}


const filterOnlyOpen = (f: FamilyDemand) => f.status === Status.Available && f.isFamilyActive === true && f.type == VolunteerType.Meal;
const filterOnlyOpenHolidayTreats = (f: FamilyDemand) => f.status === Status.Available && f.isFamilyActive === true && f.type == VolunteerType.HolidayTreat;
const filterOnlyFulfilled = (f: FamilyDemand) => f.status === Status.Occupied;

const minMaxDates = (dates: string[]): string => {
    const dateObjects = dates.map(d => dayjs(d));

    // Find the minimum (earliest) and maximum (latest) dates
    const minDate = dayjs.min(dateObjects);
    const maxDate = dayjs.max(dateObjects);

    // Format the dates as 'DD-MM'
    const minDateStr = minDate?.format('DD-MM') || "";
    const maxDateStr = maxDate?.format('DD-MM') || "";

    // Combine the formatted dates into the desired string
    return `מ ${minDateStr} עד ${maxDateStr}`;
}

export function Stats({ userInfo, appServices }: StatsProps) {
    const [loading, setLoading] = useState<boolean>(false);
    const [data, setData] = useState<FamilyDemand[]>([]);
    const [selectedWeeks, setSelectedWeeks] = useState<[number, number]>([0, 4]);
    const [selectedDistricts, setSelectedDistricts] = useState<string[]>([]);
    //const calendar = useRef<Calendar>(null);
    const [mode, setMode] = useState(Modes.Open);
    const [showFilterByVolunteer, setShowFilterByVolunteer] = useState<boolean>(false);
    const [reload, setReload] = useState<number>(0);
    const [selectedFamily, setSelectedFamily] = useState<GroupedFamily | undefined>();
    const [holidayTreatsExist, setHolidayTreatsExist] = useState<boolean>(false);

    useEffect(() => {
        if (userInfo?.isAdmin && selectedWeeks && selectedDistricts.length > 0) {
            setLoading(true);

            const range = selectedWeeks.map(d => dayjs().add(d, "week").toISOString()) as [string, string];
            getDemands(range, selectedDistricts, VolunteerType.Any).then(demands => {
                demands.sort((a, b) => sortByDate(a.date, b.date));
                setHolidayTreatsExist(demands.some(d => d.type == VolunteerType.HolidayTreat))
                setData(demands);
            }).finally(() => setLoading(false));
        } else {
            setData([]);
        }
    }, [selectedWeeks, selectedDistricts, userInfo, reload]);

    useEffect(() => {
        if (userInfo?.isAdmin && userInfo.districts?.length === 1) {
            setSelectedDistricts([userInfo.districts[0].id]);
        }
    }, [userInfo]);


    const handlePrepareMessageToSend = (familyId: string | undefined, mode: number) => {
        const filteredData = data.filter(mode == Modes.Open ? filterOnlyOpen : filterOnlyOpenHolidayTreats);
        const groupedData = groupByCityAndFamily(familyId ? filteredData.filter(d => d.mainBaseFamilyId == familyId) : filteredData);
        prepareMessageToSend(groupedData, mode);
    }

    // Function to prepare the message using the structured data, including all dates per family
    const prepareMessageToSend = (groupedData: GroupedData, mode: number) => {
        const sortedCities = Object.keys(groupedData).sort();

        const getMessageForDates = (startDate: Dayjs, endDate: Dayjs) => {
            let message = ""
            for (const city of sortedCities) {
                // Sort families alphabetically within each city
                const sortedFamilies = sortFamilies(groupedData[city]);
                let familiesMsg = "";

                sortedFamilies.forEach((family) => {
                    const dates = family.dates.filter(d => dateInRange(d.date, startDate, endDate));
                    if (dates.length > 0) {
                        if (familiesMsg.length > 0) {
                            familiesMsg += ", ";
                        }
                        familiesMsg += `${family.familyLastName}`;
                    }
                });
                if (familiesMsg.length > 0) {
                    message += `* *${city}*: ${familiesMsg}\n`;
                }
            }
            return message;
        }

        const addWeekMessage = (title: string, msg: string) => {
            if (msg.length > 0) {
                return `🍲 *${title}*\n${msg}`;
            }
            return "";
        }


        let message = "היי קהילת נולדת לנצח💜\n";
        message += mode == Modes.Open ?
            "מחפשים מתנדבים לסיוע בבישול 🙏\n\n*שימו 💚 כל הימים פתוחים לכם לשיבוץ*\n\n" :
            "מחפשים מתנדבים לסיוע בפינוקי חג 🙏\n"

        const startDate = toSunday(dayjs());
        const startDayInMonth = startDate.date();

        if (startDayInMonth > 23) {
            message += getMessageForDates(dayjs(), dayjs().endOf("month"));
        } else if (startDayInMonth > 15) {
            message += addWeekMessage("השבוע", getMessageForDates(dayjs(), startDate.add(1, "week")));
            message += addWeekMessage("שאר חודש", getMessageForDates(startDate.add(1, "week"), startDate.endOf("month")));
        } else {
            message += addWeekMessage("השבוע", getMessageForDates(dayjs(), startDate.add(1, "week")));
            message += addWeekMessage("שבוע הבא", getMessageForDates(startDate.add(1, "week"), startDate.add(2, "week")));
            message += addWeekMessage("שאר החודש", getMessageForDates(startDate.add(2, "week"), startDate.endOf("month")));
        }

        message += addWeekMessage(`חודש ${startDate.add(1, "month").format("MMMM")}`,
            getMessageForDates(startDate.add(1, "month").startOf("month"), startDate.add(1, "month").endOf("month")));


        message += `\nהשתבצו באפליקציה 📱
צריכים  עזרה? אנחנו כאן!`;
        navigator.clipboard.writeText(message)
        appServices.showMessage("success", "הודעה הוכנה והועתקה - הדבקו היכן שתרצו", "");
    }

    const handleDistrictChange = (e: any) => {
        setSelectedDistricts(e.value);
    };

    const startDate = dayjs().add(selectedWeeks[0], 'week');
    const endDate = dayjs().add(selectedWeeks[1], 'week');
    return (
        <div>
            <div className='flex flex-row  justify-content-center align-items-start' style={{ height: 75 }}>
                <WeekSelectorSlider min={-4} max={6} setSelectedWeeks={setSelectedWeeks} selectedWeeks={selectedWeeks} />
                <Button label="חודש קדימה" unstyled icon="pi pi-calendar" className="icon-btn icon-btn-withLabel text-xs mr-3"
                    onClick={() => {
                        setSelectedWeeks([0, 4]);
                    }} />
            </div>

            {loading && <InProgress />}
            {userInfo && userInfo.districts && userInfo.districts.length > 1 &&
                <div className='flex flex-row w-full align-items-center'>
                    <MultiSelect
                        value={selectedDistricts}
                        options={userInfo?.districts?.map(d => ({ label: d.name.replace("מחוז ", ""), value: d.id })) || []}
                        onChange={handleDistrictChange}
                        placeholder="בחר מחוזות"
                        display="chip"
                        className="w-9 md:w-20rem m-2 flex justify-content-center"
                    />
                    {(mode === Modes.Open || mode === Modes.HolidayTreats) && <Button disabled={!data.some(filterOnlyOpen)}
                        className="btn-on-the-right" label="הכן הודעה"
                        onClick={() => handlePrepareMessageToSend(selectedFamily?.mainBaseFamilyId, mode)} />}
                    {mode === Modes.Fulfilled && <Button unstyled label="סנן" icon={"pi pi-filter" + (showFilterByVolunteer ? "-slash" : "")} className={"icon-btn icon-btn-withLabel"} onClick={(e) => {
                        setShowFilterByVolunteer(!showFilterByVolunteer)
                    }} />}
                </div>}
            <div className='flex flex-row  justify-content-start align-items-center relative'>
                <SelectButton
                    pt={{ root: { className: "select-button-container" } }}
                    unstyled
                    value={mode} onChange={(e) => setMode(e.value)} optionLabel="name" options={holidayTreatsExist ? Modes.array2 : Modes.array}
                    itemTemplate={(option) => (
                        <div className={`select-button-item ${mode === option.value ? 'p-highlight' : ''}`}>
                            {option.name}
                        </div>
                    )}
                />
            </div>

            {/* {error && <small style={{ color: 'red' }}>{error}</small>} */}

            {mode === Modes.Open || mode === Modes.Fulfilled || mode === Modes.HolidayTreats ?
                <DemandList setReload={setReload} setLoading={setLoading} data={data} mode={mode} appServices={appServices} userInfo={userInfo}
                    onSelectFamily={family => setSelectedFamily(family)}
                    showFilterByVolunteer={showFilterByVolunteer}
                    onCancellationPerformed={() => {
                        appServices.showMessage("success", "בוטל בהצלחה", "")
                        setReload(prev => prev + 1)
                    }

                    }
                    startDate={startDate} endDate={endDate}
                /> :
                <DemandChart
                    setReload={setReload} setLoading={setLoading} data={data} mode={mode} appServices={appServices} userInfo={userInfo}
                    startDate={startDate} endDate={endDate}
                />
            }
        </div>
    );
}

export const DemandList: React.FC<DemandChartProps> = ({ data, mode, appServices, userInfo, showFilterByVolunteer,
    onCancellationPerformed, onSelectFamily, setLoading, setReload }) => {

    let demands = data.filter(mode == Modes.Open ? filterOnlyOpen :
        (mode == Modes.Fulfilled ? filterOnlyFulfilled : filterOnlyOpenHolidayTreats));
    const [showFamilyDetails, setShowFamilyDetails] = useState<GroupedFamily | undefined>();
    const [filterByVolunteer, setFilterByVolunteer] = useState<any | undefined>();
    const [cancelInProgress, setCancelInProgress] = useState<boolean>(false);

    const overlayPanelRef = useRef<any>(null);

    const [selectedMeal, setSelectedMeal] = useState<{ city: string, familyId: string, date: string } | undefined>();
    const [volunteerInfo, setVolunteerInfo] = useState<VolunteerInfo | undefined>();
    // Existing state declarations...
    const [showRecipientModal, setShowRecipientModal] = useState(false);
    const [recipient, setRecipient] = useState<Recipient | undefined>();
    const [filteredUsers, setFilteredUsers] = useState<any[]>([]); // Adjust the type as needed
    const [transportingVolunteer, setTransportingVolunteer] = useState<VolunteerInfo | undefined>(undefined);
    const [familyDetails, setFamilyDetails] = useState<FamilyDetails | undefined>(undefined)
    const [error, setError] = useState<any>(undefined);


    const openRecipientModal = () => {
        setShowRecipientModal(true);
    };

    const closeRecipientModal = () => {
        setShowRecipientModal(false);
        setRecipient(undefined); // Clear selection on close if needed
    };

    const handleSetTransportingVolunteer = async (selectedDateInfo: DateInfo | undefined, transportingVolunteer: Recipient | undefined) => {
        if (!selectedDateInfo) return;

        setLoading(true);
        await updateDemandTransportation(selectedDateInfo.demandId, transportingVolunteer?.id)
            .then(response => {
                setReload(prev => prev + 1);
                appServices.showMessage("success", "נשמר בהצלחה", "");
                console.log("Transportation updated successfully:", response);
            })
            .catch(error => {
                appServices.showMessage("error", "שמירה נכשלה", error.message);
                console.error("Error updating transportation:", error);
            })
            .finally(() => setLoading(false));

        closeRecipientModal();
    };

    const handlePrepareTransportMessage = (
        selectedDateInfo: DateInfo | undefined,
        volunteerInfo: VolunteerInfo | undefined
    ) => {
        const message = `דרוש שינוע🚙
        
מי יכול.ה לעזור בשינוע?
        
בתאריך ${selectedDateInfo ? dayjs(selectedDateInfo.date).format("DD.MM.YYYY") : ""}
        
מ${volunteerInfo ? volunteerInfo.city : ""}
ל${selectedDateInfo && selectedDateInfo.parentFamily ? `${selectedDateInfo.parentFamily.city}` : ""}
למשפחת${selectedDateInfo && selectedDateInfo.parentFamily ? ` ${selectedDateInfo.parentFamily.familyLastName}` : ""}`;

        // Handle the message, e.g., displaying it in a modal or copying to clipboard
        console.log(message); // Or whatever logic you need to use the message
        navigator.clipboard.writeText(message);
        appServices.showMessage("success", "הודעה הוכנה והועתקה - הדבקו היכן שתרצו", "");
    };


    useEffect(() => {
        if (data && selectedMeal) {
            setTransportingVolunteer(undefined);
            setVolunteerInfo(undefined);
            // find demand
            const demand = data.find(d => d.date == selectedMeal.date && d.mainBaseFamilyId == selectedMeal.familyId)
            if (demand) {
                getVolunteerInfo(demand.volunteerId).then(info => {
                    setVolunteerInfo(info);
                });
                getFamilyDetails(demand.districtBaseFamilyId, demand.district, demand?.id, demand?.mainBaseFamilyId, true)
                    .then(res => setFamilyDetails(res))
                    .catch(err => setError(err))
                    .finally(() => setLoading(false));


                if (demand.transpotingVolunteerId) {
                    getVolunteerInfo(demand.transpotingVolunteerId).then(v => {
                        setTransportingVolunteer(v);
                    })
                }
            }
        } else {
            setTransportingVolunteer(undefined);
            setVolunteerInfo(undefined);
        }
    }, [selectedMeal, data]);



    if (showFilterByVolunteer && filterByVolunteer?.id) {
        demands = demands.filter(d => d.volunteerId === filterByVolunteer.id);
    }

    const groupedData = groupByCityAndFamily(demands);
    const sortedCities = Object.keys(groupedData).sort();

    let selectedDateInfo: DateInfo | undefined = undefined;
    if (selectedMeal) {
        selectedDateInfo = groupedData[selectedMeal.city] && groupedData[selectedMeal.city][selectedMeal.familyId]?.dates.find(d => d.date == selectedMeal.date);
    }

    if (showFamilyDetails) {
        return <FamilyDetailsComponent
            type={VolunteerType.Any}
            analyticComponent="Management"
            showInactiveFamilyLabel={true}
            appServices={appServices} demands={demands}
            mainBaseFamilyId={showFamilyDetails.mainBaseFamilyId}
            family={showFamilyDetails}
            includeContacts={true} onClose={() => {
                appServices.popNavigationStep();
                setShowFamilyDetails(undefined);
                if (onSelectFamily) onSelectFamily(undefined);

                // todo push nav state
            }} reloadOpenDemands={async () => { }} detailsOnly={true} actualUserId={""} />;
    }

    const handleDateClick = (e: any, city: string, familyId: string, date: string) => {
        setVolunteerInfo(undefined);
        setSelectedMeal({ city, familyId, date }); // Store the date info to render in the OverlayPanel
        overlayPanelRef.current.toggle(e); // Open the OverlayPanel next to the clicked element
    };

    return (
        <div>
            <div>
                {mode == Modes.Fulfilled && showFilterByVolunteer && <AutoComplete
                    inputClassName="w-17rem md:w-20rem flex flex-row flex-wrap"
                    placeholder={!filterByVolunteer || filterByVolunteer.length === 0 ? "חיפוש לפי שם פרטי, משפחה או טלפון" : undefined}
                    delay={500}
                    value={filterByVolunteer}
                    field="name"
                    optionGroupLabel="districtName"
                    optionGroupChildren="users"
                    suggestions={filteredUsers}
                    completeMethod={async (event: AutoCompleteCompleteEvent) => {
                        const newFilter = await handleSearchUsers(userInfo, event.query);
                        setFilteredUsers(newFilter);
                    }}
                    onChange={(e) => setFilterByVolunteer(e.value)} />}
            </div>
            <strong>{mode != Modes.Fulfilled ? 'סה״כ חסרים:' : 'סה״כ משובצים:'}</strong><span className='m-2'>{demands.length}</span>
            {
                sortedCities.map((city, i) => {
                    const sortedFamilies = sortFamilies(groupedData[city]);

                    return (
                        <div className='family-demand-details' key={i}>
                            <div className="city-chip">{city}</div>
                            {
                                sortedFamilies.map((family, j) => (
                                    <div className="family-chip" key={j}>
                                        <span className="family-details-link clickable-span"
                                            onClick={() => {
                                                appServices.pushNavigationStep("family-details-management", () => setShowFamilyDetails(undefined));
                                                setShowFamilyDetails(family)
                                                if (onSelectFamily) onSelectFamily(family);
                                            }}> {family.familyLastName}{family.active ? "" : "-לא פעילה"}:</span>
                                        <div className='flex w-12 flex-wrap'>{
                                            mode == Modes.Open ?
                                                family.dates.sort((d1, d2) => sortByDate(d1.date, d2.date)).map(d => (<AvailableDate key={d.date} date={d} />)) :
                                                (mode == Modes.HolidayTreats ?
                                                    minMaxDates(family.dates.map(d => d.date)) :
                                                    family.dates.sort((d1, d2) => sortByDate(d1.date, d2.date)).map((d, k) => (
                                                        <span key={k}>
                                                            <span className='clickable-span position-relative' onClick={(e) => handleDateClick(e, city, family.mainBaseFamilyId, d.date)}>{dayjs(d.date).format("DD.MM")}
                                                                {d.type == VolunteerType.HolidayTreat && <GiPartyHat className='position-absolute ' style={{ color: "var(--born2win-button-color)", top: -5 }} />}</span>
                                                            <span className='m-1'>|</span>
                                                        </span>
                                                    )))
                                        }</div>
                                    </div>
                                ))
                            }
                        </div>
                    )
                })
            }

            {/* OverlayPanel for displaying additional info */}
            <OverlayPanel ref={overlayPanelRef} showCloseIcon closeOnEscape
                dismissable={true} >
                <div dir="rtl" style={{
                    width: 280, display: "flex",
                    flexDirection: "column",

                }}>
                    {selectedDateInfo && (volunteerInfo ?
                        <>
                            <div><strong>שם מבשל</strong>: {volunteerInfo.firstName + " " + volunteerInfo.lastName}</div>
                            <PhoneNumber phone={volunteerInfo.phone} label="טלפון מבשל" />
                            {volunteerInfo && volunteerInfo.phone && (<li className="flex align-items-center">
                                <strong>שלח פרטים ל{volunteerInfo.firstName + " " + volunteerInfo.lastName}</strong>
                                <WhatsAppButton
                                    getPhone={() => volunteerInfo?.phone}
                                    getText={() => familyDetails ? generateDetailsForWhatapp(familyDetails, selectedDateInfo.parentFamily.city, selectedDateInfo.date, volunteerInfo, transportingVolunteer, volunteerInfo.id) : ""} />
                            </li>)}
                            {transportingVolunteer &&
                                <div><strong>שם משנע</strong>: {transportingVolunteer ? transportingVolunteer.firstName + " " + transportingVolunteer.lastName : undefined}</div>}
                            {transportingVolunteer && <PhoneNumber phone={transportingVolunteer.phone} label="טלפון משנע" />}
                            {transportingVolunteer && transportingVolunteer.phone && (<li className="flex align-items-center">
                                <strong>שלח פרטים ל{transportingVolunteer.firstName + " " + transportingVolunteer.lastName}</strong>
                                <WhatsAppButton
                                    getPhone={() => transportingVolunteer?.phone}
                                    getText={() => familyDetails && selectedDateInfo?.parentFamily ?
                                        generateDetailsForWhatapp(familyDetails, selectedDateInfo.parentFamily.city, selectedDateInfo.date, volunteerInfo, transportingVolunteer, transportingVolunteer.id) : ""} />
                            </li>)}
                            <Button label="מחק התנדבות" onClick={() => {
                                confirmPopup({
                                    message: 'האם למחוק התנדבות זו?',
                                    icon: 'pi pi-exclamation-triangle',
                                    acceptLabel: "כן",
                                    rejectLabel: "לא",
                                    accept: async () => {
                                        setCancelInProgress(true);
                                        updateFamilyDemand(selectedDateInfo.demandId, "", selectedDateInfo.mainBaseFamilyId, "cityId(unknown)", false,
                                            selectedDateInfo.type, `מנהל ${userInfo.firstName} ביטל.ה`, selectedDateInfo.district, selectedDateInfo.volunteerId)
                                            .then(onCancellationPerformed)
                                            .catch(err => appServices.showMessage("error", "ביטול נכשל", err.message))
                                            .finally(() => setCancelInProgress(false));
                                    }
                                })
                            }} />
                            {cancelInProgress && <InProgress />}
                        </> :
                        <div><ProgressSpinner style={{ height: 50 }} /> טוען...</div>
                    )}
                </div>
                <div dir="rtl" style={{
                    width: 280, display: "flex",
                    flexDirection: "column",

                }}>
                    <Button label="הכן הודעה לבקשת שינוע" onClick={() => handlePrepareTransportMessage(selectedDateInfo, volunteerInfo)} />
                    <Button
                        label={transportingVolunteer ? "הסר משנע מהתנדבות" : "הוסף משנע להתנדבות"}
                        onClick={async () => {  // Use async here
                            if (transportingVolunteer) {
                                await handleSetTransportingVolunteer(selectedDateInfo, undefined);
                            } else {
                                openRecipientModal();
                            }
                        }}
                    />

                    {/* Modal for selecting recipients */}
                    <Dialog header={<div style={{ textAlign: 'right', width: '100%' }}>בחר משנע</div>} visible={showRecipientModal}
                        onHide={closeRecipientModal}
                        style={{ width: '300px', position: 'absolute', right: '10%', top: '20%' }}

                    >
                        <div className="flex justify-content-end">
                            <AutoComplete
                                inputClassName="w-17rem md:w-15rem"
                                placeholder={!recipient ? "חיפוש לפי שם פרטי, משפחה או טלפון" : undefined}
                                delay={500}
                                value={recipient}
                                field="name"
                                optionGroupLabel="districtName"
                                optionGroupChildren="users"
                                suggestions={filteredUsers}
                                completeMethod={async (event: AutoCompleteCompleteEvent) => {
                                    const newFilter = await handleSearchUsers(userInfo, event.query);
                                    setFilteredUsers(newFilter);
                                }}
                                onChange={(e) => setRecipient(e.value)}
                                inputStyle={{ textAlign: 'right' }} // Align input text to the right
                                itemTemplate={(item) => (
                                    <div style={{ textAlign: 'right' }}>{item.name}</div> // Align suggestion items to the right
                                )}
                            />
                        </div>
                        <div className="flex justify-content-end mt-2">
                            <Button label="ביטול" onClick={closeRecipientModal} className="p-button-secondary ml-2" />
                            <Button label="אשר" disabled={!recipient} onClick={() => handleSetTransportingVolunteer(selectedDateInfo, recipient)} /> {/* Pass the data as arguments */}
                        </div>
                    </Dialog>
                </div>
            </OverlayPanel>
        </div>
    );
};

export const DemandChart: React.FC<DemandChartProps> = ({ data, startDate, endDate }) => {
    const labels: string[] = [];
    const fulfilledDemands: number[] = [];
    const totalDemands: number[] = [];
    const weekdayCounts: { [key: string]: number[] } = {
        ראשון: [],
        שני: [],
        שלישי: [],
        רביעי: [],
        חמישי: [],
        שישי: [],
    };

    const today = dayjs().startOf("day");

    data.forEach(demand => {
        if (!dateInRange(demand.date, startDate, endDate)) return;

        const recordDate = dayjs(demand.date).startOf("day");
        const daysDiff = recordDate.diff(today, "days");
        const daysRound2Week = Math.floor(daysDiff / 7);
        const weekLabel =
            daysDiff >= 0 && daysDiff <= 6
                ? "היום"
                : today.add(daysRound2Week * 7, "days").format("DD-MM");

        let index = labels.findIndex(l => l === weekLabel);
        if (index < 0) {
            labels.push(weekLabel);
            fulfilledDemands.push(0);
            totalDemands.push(0);
            index = labels.length - 1;

            // Initialize weekday counts for this week
            Object.keys(weekdayCounts).forEach(day => {
                weekdayCounts[day].push(0);
            });
        }

        totalDemands[index]++;
        if (demand.status === "תפוס") {
            fulfilledDemands[index]++;
        }

        // Increment weekday count
        const weekday = recordDate.format("dddd"); // Get the weekday name
        weekdayCounts[weekday][index]++;
    });

    const chartData = {
        labels: labels,
        datasets: [
            {
                type: "line",
                label: "סה״כ",
                data: totalDemands,
                fill: false,
                borderColor: "#42A5F5",
                tension: 0.1,
            },
            {
                type: "line",
                label: "שובצו",
                data: fulfilledDemands,
                fill: false,
                borderColor: "#66BB6A",
                tension: 0.1,
            },
            // Add datasets for weekdays
            ...Object.keys(weekdayCounts).map(day => ({
                type: "bar",
                label: day,
                data: weekdayCounts[day],
                backgroundColor: getColorForDay(day), // Assign a unique color to each weekday
            })),
        ],
    };

    const options = {
        responsive: true,
        plugins: {
            legend: {
                position: "top",
            },
            tooltip: {
                mode: "index",
                intersect: false,
            },
        },
        scales: {
            x: {
                stacked: false, // Disable stacking to display bars side by side
            },
            y: {
                stacked: false, // Ensure side-by-side behavior for y-axis as well
                beginAtZero: true,
                ticks: {
                    stepSize: 1,
                    callback: function (value: number) {
                        return Number.isInteger(value) ? value : null;
                    },
                },
            },
        },
    };

    return <Chart type="bar" data={chartData} options={options} />;
};

// Utility function to assign colors to weekdays
function getColorForDay(day: string): string {
    const colors: { [key: string]: string } = {
        ראשון: "#FF6384",
        שני: "#36A2EB",
        שלישי: "#FFCE56",
        רביעי: "#4BC0C0",
        חמישי: "#9966FF",
        שישי: "#FF9F40",
    };
    return colors[day] || "#CCCCCC"; // Default color if day not recognized
}

// Function to group the data by city and family, with multiple dates for each family
const groupByCityAndFamily = (familyDemands: FamilyDemand[]): GroupedData => {
    const groupedByCityAndFamily: GroupedData = {};

    familyDemands.forEach((family) => {
        const city = family.familyCityName.replaceAll("\"", "");
        const familyName = simplifyFamilyName(family.familyLastName);

        // Initialize city if not exists
        if (!groupedByCityAndFamily[city]) {
            groupedByCityAndFamily[city] = {};
        }

        // Initialize family under the city if not exists
        if (!groupedByCityAndFamily[city][family.mainBaseFamilyId]) {
            groupedByCityAndFamily[city][family.mainBaseFamilyId] = {
                dates: [],
                familyLastName: familyName,
                districtBaseFamilyId: family.districtBaseFamilyId,
                mainBaseFamilyId: family.mainBaseFamilyId,
                city,
                district: family.district,
                active: family.isFamilyActive
            };
        }

        // Add the formatted date to the family's array under the city
        groupedByCityAndFamily[city][family.mainBaseFamilyId].dates.push({
            district: family.district,
            demandId: family.id,
            districtBaseFamilyId: family.districtBaseFamilyId,
            mainBaseFamilyId: family.mainBaseFamilyId,
            date: family.date,
            expandDays: family.expandDays,
            volunteerId: family.volunteerId,
            parentFamily: groupedByCityAndFamily[city][family.mainBaseFamilyId],
            transportingVolunteerId: family.transpotingVolunteerId,
            type: family.type,
        });
    });

    return groupedByCityAndFamily;
};

function sortFamilies(familiesMap: { [mainBaseFamilyId: string]: GroupedFamily }) {
    return Object.keys(familiesMap)
        .map(mainBaseFamilyId => familiesMap[mainBaseFamilyId])
        .sort((a, b) => {
            if (a.familyLastName < b.familyLastName) {
                return -1;
            }
            if (a.familyLastName > b.familyLastName) {
                return 1;
            }
            return 0;
        });
}
const DAYS = {
    0: "א",
    1: "ב",
    2: "ג",
    3: "ד",
    4: "ה",
    5: "ו",
    6: "ש",
}

function AvailableDate({ date }: { date: DateInfo }) {
    const d = dayjs(date.date).locale("he");
    return <div className='available-date-host'>
        <div className='available-date'>{d.format("DD-MM")}</div>
        <div className="available-dates-weekdays">{date.expandDays.map(day => DAYS[d.add(day, "day").day()] + " ")}</div>
    </div>
}