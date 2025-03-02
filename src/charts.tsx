import React, { useEffect, useRef, useState } from 'react';
import { Chart } from 'primereact/chart';
import { MultiSelect } from 'primereact/multiselect';
import dayjs, { Dayjs } from 'dayjs';
import minMax from 'dayjs/plugin/minMax'; // Plugin to find min and max dates
import { Chart as ChartJS, registerables } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';

// Register all default Chart.js components plus the data labels plugin.

import { AppServices, FamilyCompact, FamilyDemand, FamilyDetails, IdName, Status, UserInfo, VolunteerInfo, VolunteerType } from './types';
import {
    getDemands,
    getFamilyDetails,
    getVolunteerInfo,
    handleSearchFamilies,
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
import { GiPartyHat } from 'react-icons/gi';
import { RadioButton } from 'primereact/radiobutton';
import { FamilyList } from './families-mgmt';
import { getDemandSupplyChart, getRegistrationChart } from './registrationChart';

ChartJS.register(...registerables, ChartDataLabels);
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
    All: 5,
    array: [
        { name: 'חסרים', value: 1 },
        { name: 'משובצים', value: 2 },
        { name: 'הכל', value: 5 },
        { name: 'גרף', value: 4 },
    ],
    array2: [
        { name: 'חסרים', value: 1 },
        { name: 'משובצים', value: 2 },
        { name: 'הכל', value: 5 },
        { name: 'פינוקי חג', value: 3 },
        { name: 'גרף', value: 4 },
    ]
}
const ChartModes = {
    DemandSupply: 1,
    Registration: 2,
    array: [
        { name: 'היצע/ביקוש', value: 1 },
        { name: 'שיבוץ', value: 2 }
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
const filterAllButHolidayTreats = (f: FamilyDemand) => f.isFamilyActive === true && f.type == VolunteerType.Meal;
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
    const [filterByFamily, setFilterByFamily] = useState<IdName | null>(null);
    const [holidayTreatsExist, setHolidayTreatsExist] = useState<boolean>(false);
    const [familyDetails, setFamilyDetails] = useState<FamilyDetails | undefined>(undefined)
    const [filterBy, setFilterBy] = useState<"משפחה" | "מחוזות">("מחוזות");

    useEffect(() => {
        if (userInfo?.isAdmin && selectedWeeks && (filterBy == "מחוזות" && selectedDistricts.length > 0 || filterBy == "משפחה" && filterByFamily)) {
            setLoading(true);

            const range = selectedWeeks.map(d => dayjs().add(d, "week").toISOString()) as [string, string];
            getDemands(range,
                filterBy == "מחוזות" ? selectedDistricts : undefined,
                filterBy == "משפחה" && filterByFamily ? filterByFamily.id : undefined,
                VolunteerType.Any).then(demands => {
                    demands.sort((a, b) => sortByDate(a.date, b.date));
                    setHolidayTreatsExist(demands.some(d => d.type == VolunteerType.HolidayTreat))
                    setData(demands);
                }).finally(() => setLoading(false));
        } else {
            setData([]);
        }
    }, [selectedWeeks, selectedDistricts, filterByFamily, userInfo, reload, filterBy]);

    useEffect(() => {
        if (userInfo?.isAdmin && userInfo.districts?.length === 1) {
            setSelectedDistricts([userInfo.districts[0].id]);
        }
    }, [userInfo]);

    console.log("data", data.length)

    const handlePrepareMessageToSend = (familyId: string | undefined, mode: number) => {
        const filteredData = data.filter(mode == Modes.Open ? filterOnlyOpen : filterOnlyOpenHolidayTreats);
        const groupedData = groupByCityAndFamily(familyId ? filteredData.filter(d => d.mainBaseFamilyId == familyId) : filteredData);
        prepareMessageToSend(groupedData, mode);
    }

    // Function to prepare the message using the structured data, including all dates per family
    const prepareMessageToSend = (groupedData: GroupedData, mode: number) => {
        const sortedCities = Object.keys(groupedData).sort();
        const getMessageForDates = (startDate: Dayjs, endDate: Dayjs) => {
            let cityMessages: string[] = [];
            let totalMissingVolunteers = 0;

            for (const city of sortedCities) {
                const sortedFamilies = sortFamilies(groupedData[city]);
                let familiesMsg = "";

                sortedFamilies.forEach((family) => {
                    const dates = family.dates.filter(d => dateInRange(d.date, startDate, endDate));
                    if (dates.length > 0) {
                        if (familiesMsg.length > 0) familiesMsg += ", ";
                        if (!selectedFamily) {
                            familiesMsg += `${family.familyLastName}`;
                        }
                        totalMissingVolunteers += dates.length;
                    }
                });
                if (familiesMsg.length > 0 || selectedFamily) {
                    if (!selectedFamily) {
                        cityMessages.push(`* *${city}*: ${familiesMsg}`);
                    } else {
                        cityMessages.push(`${familiesMsg}`);
                    }
                }
            }
            return { cityMessages, totalMissingVolunteers };
        };

        if (selectedFamily) {
            // Check if selectedFamily is different from familyDetails
            if (familyDetails && familyDetails.mainBaseFamilyId === selectedFamily.mainBaseFamilyId) {
                const familyMessage = createSelectedFamilyMsg(
                    selectedFamily,
                    familyDetails,
                    groupedData,
                    sortedCities,
                    getMessageForDates // Pass explicitly
                );
                navigator.clipboard.writeText(familyMessage);
                appServices.showMessage("success", "הודעה הוכנה והועתקה - הדבקו היכן שתרצו", "");
                return;
            } else {
                // Fetch new family details if the selectedFamily has changed
                getFamilyDetails(
                    selectedFamily?.districtBaseFamilyId as string,
                    selectedFamily?.district as string,
                    selectedFamily?.mainBaseFamilyId as string,
                    selectedFamily?.mainBaseFamilyId as string,
                    true
                ).then(res => {
                    setFamilyDetails(res); // Update familyDetails state
                    // Now that familyDetails is updated, generate the message
                    const familyMessage = createSelectedFamilyMsg(
                        selectedFamily,
                        res, // Use the newly fetched family details
                        groupedData,
                        sortedCities,
                        getMessageForDates
                    );
                    navigator.clipboard.writeText(familyMessage);
                    appServices.showMessage("success", "הודעה הוכנה והועתקה - הדבקו היכן שתרצו", "");
                }).catch(() =>
                    appServices.showMessage("error", "אירעה שגיאה בעת שליפת פרטי המשפחה", "")
                ).finally(() => setLoading(false));
                return; // Wait for the family details to be fetched before proceeding
            }
        }
        let message = "היי קהילת נולדת לנצח💜\n\n";

        const startDate = toSunday(dayjs());
        const currentMonth = startDate.format("MMMM");
        const nextMonth = startDate.add(1, "month").format("MMMM");
        const addMonthMessage = (title: string, startDate: Dayjs, endDate: Dayjs, isFirstMonth = false) => {
            const { cityMessages, totalMissingVolunteers } = getMessageForDates(startDate, endDate);
            if (cityMessages.length > 0) {
                let monthMessage = `🍲 *${title}* נותרו עוד ${totalMissingVolunteers} תאריכים פנויים\n\n`;
                if (isFirstMonth) {
                    // Add the special line immediately after the first month's header
                    monthMessage += "*שימו 💚 כל הימים פתוחים לכם לשיבוץ*\n\n";
                }
                monthMessage += `${cityMessages.join("\n")}\n\n`;
                return monthMessage;
            }
            return "";
        };
        message += addMonthMessage(`חודש ${currentMonth}`, startDate, startDate.endOf("month"), true);
        message += addMonthMessage(`חודש ${nextMonth}`, startDate.add(1, "month").startOf("month"), startDate.add(1, "month").endOf("month"));
        message += "השתבצו באפליקציה 📱\n\nצריכים עזרה? אנחנו כאן!";

        navigator.clipboard.writeText(message);
        appServices.showMessage("success", "הודעה הוכנה והועתקה - הדבקו היכן שתרצו", "");
    };
    const createSelectedFamilyMsg = (
        selectedFamily: GroupedFamily,
        familyDetails: FamilyDetails,
        groupedData: GroupedData,
        sortedCities: string[],
        getMessageForDates?: (startDate: Dayjs, endDate: Dayjs) => { cityMessages: string[]; totalMissingVolunteers: number }
    ) => {
        // Validate the existence of getMessageForDates
        if (!getMessageForDates) {
            throw new Error("getMessageForDates function is required.");
        }

        let familyMessage = `*ב${familyDetails.city}*\n`;
        familyMessage += `*משפחת ${selectedFamily.familyLastName}*\n\n`;
        familyMessage += `חולה בגיל ${familyDetails.patientAge}\n`;
        familyMessage += `משפחה בת ${familyDetails.adultsCount} נפשות\n`;

        if (familyDetails.kosherLevel) {
            familyMessage += `${familyDetails.kosherLevel}\n\n`;
        }
        familyMessage += "מי יכול.ה לבשל🍲\n\n";

        const startDate = toSunday(dayjs());
        const currentMonth = startDate.format("MMMM");
        const nextMonth = startDate.add(1, "month").format("MMMM");
        const addMonthMessage = (title: string, startDate: Dayjs, endDate: Dayjs) => {
            const { cityMessages, totalMissingVolunteers } = getMessageForDates(startDate, endDate);
            if (cityMessages.length > 0 && totalMissingVolunteers > 0) {
                return `🍲 *${title}* ${totalMissingVolunteers === 1 ? "נותר תאריך פנוי אחד" : `נותרו ${totalMissingVolunteers} תאריכים פנויים`
                    }\n${cityMessages.join("\n")}\n`;
            }
            return "";
        };

        familyMessage += addMonthMessage(
            `חודש ${currentMonth}`,
            startDate.startOf("month"),
            startDate.endOf("month")
        );
        familyMessage += addMonthMessage(
            `חודש ${nextMonth}`,
            startDate.add(1, "month").startOf("month"),
            startDate.add(1, "month").endOf("month")
        );
        familyMessage += `השתבצו באפליקציה 📱\n\nצריכים עזרה? אנחנו כאן!`;
        return familyMessage;
    };

    const handleDistrictChange = (e: any) => {
        setSelectedDistricts(e.value);
    };

    const startDate = dayjs().add(selectedWeeks[0], 'week');
    const endDate = dayjs().add(selectedWeeks[1], 'week');
    return (
        <div>
            <div className='flex flex-row  justify-content-center align-items-center' style={{ height: 75 }}>
                <WeekSelectorSlider min={-4} max={6} setSelectedWeeks={setSelectedWeeks} selectedWeeks={selectedWeeks} />
                <Button label="חודש קדימה" unstyled icon="pi pi-calendar" className="icon-btn icon-btn-withLabel text-xs mr-3"
                    onClick={() => {
                        setSelectedWeeks([0, 4]);
                    }} />
            </div>
            {/** Filter by */}
            <div className="flex flex-wrap gap-3">
                <div className="flex align-items-center">
                    <RadioButton name="מחוזות" value="מחוזות" onChange={(e) => setFilterBy(e.value)} checked={filterBy === 'מחוזות'} />
                    <label htmlFor="ingredient1" className="ml-2">מחוזות</label>
                </div>
                <div className="flex align-items-center">
                    <RadioButton name="משפחה" value="משפחה" onChange={(e) => setFilterBy(e.value)} checked={filterBy === 'משפחה'} />
                    <label htmlFor="ingredient2" className="ml-2">משפחה</label>
                </div>
            </div>

            {loading && <InProgress />}
            {userInfo && userInfo.districts && userInfo.districts.length > 1 &&
                <div className='flex flex-row w-9 align-items-center justify-content-start'>
                    {filterBy == "מחוזות" && <MultiSelect
                        value={selectedDistricts}
                        options={userInfo?.districts?.map(d => ({ label: d.name.replace("מחוז ", ""), value: d.id })) || []}
                        onChange={handleDistrictChange}
                        placeholder="בחר מחוזות"
                        display="chip"
                        className="w-11 md:w-20rem m-2 flex justify-content-center"
                    />}

                    {filterBy == "משפחה" && <FamilyList
                        userInfo={userInfo}
                        selectedFamily={filterByFamily}
                        onSelectFamily={setFilterByFamily}
                    />}

                    {data.length > 0 && (mode === Modes.Open || mode === Modes.HolidayTreats) && <Button disabled={!data.some(filterOnlyOpen)}
                        className="btn-on-the-right" label="הכן הודעה"
                        onClick={() => handlePrepareMessageToSend(selectedFamily?.mainBaseFamilyId, mode)} />}
                    {mode === Modes.Fulfilled && filterBy != "משפחה" && <Button unstyled label="סנן" icon={"pi pi-filter" + (showFilterByVolunteer ? "-slash" : "")} className={"icon-btn icon-btn-withLabel"} onClick={(e) => {
                        setShowFilterByVolunteer(!showFilterByVolunteer)
                    }} />}
                </div>}
            <div className='flex flex-row justify-content-start align-items-center relative'>
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

            {mode === Modes.Open || mode === Modes.Fulfilled || mode === Modes.HolidayTreats || mode === Modes.All ?
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
        (mode == Modes.All ? filterAllButHolidayTreats :
            ((mode == Modes.Fulfilled ? filterOnlyFulfilled : filterOnlyOpenHolidayTreats))));

    const [showFamilyDetails, setShowFamilyDetails] = useState<GroupedFamily | undefined>();
    const [filterByVolunteer, setFilterByVolunteer] = useState<any | undefined>();
    const [cancelInProgress, setCancelInProgress] = useState<boolean>(false);

    const overlayPanelRef = useRef<any>(null);

    const [selectedMeal, setSelectedMeal] = useState<{ city: string, familyId: string, date: string, type: VolunteerType } | undefined>();
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
            const demand = data.find(d => d.date == selectedMeal.date && d.mainBaseFamilyId == selectedMeal.familyId && d.type == selectedMeal.type)
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
        selectedDateInfo = groupedData[selectedMeal.city] && groupedData[selectedMeal.city][selectedMeal.familyId]?.dates.find(d => d.date == selectedMeal.date && d.type == selectedMeal.type);
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

    const handleDateClick = (e: any, city: string, familyId: string, date: string, type: VolunteerType) => {
        setVolunteerInfo(undefined);
        setSelectedMeal({ city, familyId, date, type }); // Store the date info to render in the OverlayPanel
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
            {mode == Modes.Fulfilled && <strong>{'סה״כ משובצים:'}</strong>}
            {mode == Modes.Open && <strong>{'סה״כ חסרים:'}</strong>}
            {mode == Modes.All && <strong>{'סה״כ:'}</strong>}
            <span className='m-2'>{demands.length}</span>
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
                                            family.dates.sort((d1, d2) => sortByDate(d1.date, d2.date)).map((d, k) => {
                                                if (d.volunteerId) {
                                                    return <span key={k}>
                                                        <span className='clickable-span position-relative'
                                                            onClick={(e) => handleDateClick(e, city, family.mainBaseFamilyId, d.date, d.type)}>
                                                            {dayjs(d.date).format("DD.MM")}
                                                            {d.type == VolunteerType.HolidayTreat && <GiPartyHat className='position-absolute ' style={{ color: "var(--born2win-button-color)", top: -5 }} />}
                                                        </span>
                                                        <span className='m-1'>|</span>
                                                    </span>
                                                } else {
                                                    return <AvailableDate key={d.date} date={d} isHolidayTreat={d.type == VolunteerType.HolidayTreat} />
                                                }
                                            })
                                        }</div>
                                    </div>))

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
    const [chartMode, setChartMode] = useState<number>(ChartModes.DemandSupply);

    const { chartData, options } = chartMode == ChartModes.DemandSupply ?
        getDemandSupplyChart(data, startDate, endDate) :
        getRegistrationChart(data, startDate, endDate);


    return <div>
        <SelectButton
            pt={{ root: { className: "select-button-container" } }}
            unstyled
            value={chartMode} onChange={(e) => setChartMode(e.value)} optionLabel="name" options={ChartModes.array}
            itemTemplate={(option) => (
                <div className={`select-button-item ${chartMode === option.value ? 'p-highlight' : ''}`}>
                    {option.name}
                </div>
            )}
        />
        {chartMode == ChartModes.DemandSupply ?
            <Chart type="bar" data={chartData} options={options} /> :
            <Chart type="bar" data={chartData} options={options} />}

    </div>
};

// Utility function to assign colors to weekdays
export function getColorForDay(day: string): string {
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

function AvailableDate({ date, isHolidayTreat }: { date: DateInfo, isHolidayTreat: boolean }) {
    const d = dayjs(date.date).locale("he");
    return <div className='available-date-host'>
        <div className='available-date'>{d.format("DD-MM")}</div>
        {isHolidayTreat && <GiPartyHat className='position-absolute ' style={{ color: "var(--born2win-button-color)", top: -5 }} />}
        <div className="available-dates-weekdays">{date.expandDays.map(day => DAYS[d.add(day, "day").day()] + " ")}</div>
    </div>
}