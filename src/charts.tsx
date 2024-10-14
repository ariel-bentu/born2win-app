import React, { useEffect, useRef, useState } from 'react';
import { Chart } from 'primereact/chart';
import { MultiSelect } from 'primereact/multiselect';
import dayjs from 'dayjs';
import { AppServices, FamilyCompact, FamilyDemand, UserInfo, VolunteerInfo } from './types';
import { getDemands, getVolunteerInfo, handleSearchUsers, updateFamilityDemand } from './api';

import { InProgress, PhoneNumber, WeekSelectorSlider } from './common-ui';
import { SelectButton } from 'primereact/selectbutton';
import { simplifyFamilyName, sortByDate } from './utils';
import { Button } from 'primereact/button';
import "./charts.css"
import { FamilyDetailsComponent } from './famility-registration-details';
import { AutoComplete, AutoCompleteCompleteEvent } from 'primereact/autocomplete';
import { OverlayPanel } from 'primereact/overlaypanel';
import { ProgressSpinner } from 'primereact/progressspinner';
import { ProgressBar } from 'primereact/progressbar';
import { confirmPopup } from 'primereact/confirmpopup';

interface DemandChartProps {
    data: FamilyDemand[];
    isShowOpen?: boolean;
    appServices: AppServices;
    userInfo: UserInfo;
    showFilterByVolunteer?: boolean;
    onCancellationPerformed?: () => void;
}

const Modes = {
    Open: 1,
    Fulfilled: 2,
    Chart: 3,
    array: [
        { name: 'חסרים', value: 1 },
        { name: 'משובצים', value: 2 },
        { name: 'גרף', value: 3 },
    ]
}

interface StatsProps {
    userInfo: UserInfo,
    appServices: AppServices;

}

interface DateInfo {
    date: string;
    volunteerId: string;
    demandId: string;
    mainBaseFamilyId: string;
    districtBaseFamilyId: string;
    district:string;
}

interface GroupedFamily extends FamilyCompact {
    dates: DateInfo[];
}

interface GroupedData {
    [city: string]: {
        [districtBaseFamilyId: string]: GroupedFamily;
    };
}


const filterOnlyOpen = (f: FamilyDemand) => f.status === "זמין" && f.isFamilyActive === true;
const filterOnlyFulfilled = (f: FamilyDemand) => f.status === "תפוס";


export function Stats({ userInfo, appServices }: StatsProps) {
    const [loading, setLoading] = useState<boolean>(false);
    const [data, setData] = useState<FamilyDemand[]>([]);
    const [selectedWeeks, setSelectedWeeks] = useState<number[]>([0, 4]);
    const [selectedDistricts, setSelectedDistricts] = useState<string[]>([]);
    //const calendar = useRef<Calendar>(null);
    const [mode, setMode] = useState(Modes.Open);
    const [showFilterByVolunteer, setShowFilterByVolunteer] = useState<boolean>(false);
    const [reload, setReload] = useState<number>(0);

    useEffect(() => {
        if (userInfo?.isAdmin && selectedWeeks && selectedDistricts.length > 0) {
            setLoading(true);

            const range = selectedWeeks.map(d => dayjs().add(d, "week").toISOString()) as [string, string];
            getDemands(range, selectedDistricts).then(demands => {
                demands.sort((a, b) => sortByDate(a.date, b.date));
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


    const handlePrepareMessageToSend = () => {
        const groupedData = groupByCityAndFamily(data.filter(filterOnlyOpen));
        prepareMessageToSend(groupedData);
    }

    // Function to prepare the message using the structured data, including all dates per family
    const prepareMessageToSend = (groupedData: GroupedData) => {
        const sortedCities = Object.keys(groupedData).sort();

        let message = `היי קהילת נולדת לנצח💜
    
מי יכול.ה לסייע בבישול בחודש הקרוב 🙏
    
`;

        sortedCities.forEach((city) => {
            message += `*${city}*\n`;

            // Sort families alphabetically within each city
            const sortedFamilies = sortFamilies(groupedData[city]);
            sortedFamilies.forEach((family) => {
                const dates = family.dates.map(d => dayjs(d.date).format("DD.MM")).join(', ');
                message += `${family.familyLastName} - ${dates}\n`;
            });

            message += '\n'; // Add an extra newline after each city's group
        });

        message += `ניתן להשתבץ בלינק ב🤖
מסתבכים? אני פה כדי לעזור`;
        navigator.clipboard.writeText(message)
        appServices.showMessage("success", "הודעה הוכנה והועתקה - הדבקו היכן שתרצו", "");
    }

    const handleDistrictChange = (e: any) => {
        setSelectedDistricts(e.value);
    };

    return (
        <div>
            <div className='flex flex-row  justify-content-center align-items-start' style={{ height: 75 }}>
                {/* <span className='ml-2'>תחום תאריכים</span>
                <Calendar
                    className="range-calender"
                    ref={calendar}
                    value={selectedWeeks}
                    onChange={handleDateChange}
                    selectionMode="range"
                    placeholder="בחר שבוע או מס׳ שבועות"
                    readOnlyInput

                    locale="he"
                /> */}

                <WeekSelectorSlider setSelectedWeeks={setSelectedWeeks} selectedWeeks={selectedWeeks} />
                <Button label="חודש קדימה" unstyled icon="pi pi-calendar" className="icon-btn icon-btn-withLabel text-xs mr-3"
                    onClick={() => {
                        setSelectedWeeks([0, 4]);
                    }} />
            </div>

            {loading && <InProgress />}
            {userInfo && userInfo.districts && userInfo.districts.length > 1 &&
                <MultiSelect
                    value={selectedDistricts}
                    options={userInfo?.districts?.map(d => ({ label: d.name, value: d.id })) || []}
                    onChange={handleDistrictChange}
                    placeholder="בחר מחוזות"
                    display="chip"
                    className="w-full md:w-20rem mt-3"
                />}
            <div className='flex flex-row  justify-content-start align-items-center relative'>
                <SelectButton
                    pt={{ root: { className: "select-button-container" } }}
                    unstyled
                    value={mode} onChange={(e) => setMode(e.value)} optionLabel="name" options={Modes.array}
                    itemTemplate={(option) => (
                        <div className={`select-button-item ${mode === option.value ? 'p-highlight' : ''}`}>
                            {option.name}
                        </div>
                    )}
                />
                {mode === Modes.Open && <Button disabled={!data.some(filterOnlyOpen)}
                    className="btn-on-the-right" label="הכן הודעה"
                    onClick={handlePrepareMessageToSend} />}
                {mode === Modes.Fulfilled && <Button unstyled label="סנן" icon={"pi pi-filter" + (showFilterByVolunteer ? "-slash" : "")} className={"icon-btn icon-btn-withLabel"} onClick={(e) => {
                    setShowFilterByVolunteer(!showFilterByVolunteer)
                }} />}

            </div>

            {/* {error && <small style={{ color: 'red' }}>{error}</small>} */}

            {mode === Modes.Open || mode === Modes.Fulfilled ?
                <DemandList data={data} isShowOpen={mode === Modes.Open} appServices={appServices} userInfo={userInfo}
                    showFilterByVolunteer={showFilterByVolunteer}
                    onCancellationPerformed={() => {
                        appServices.showMessage("success", "בוטל בהצלחה", "")
                        setReload(prev => prev + 1)
                    }
                    } /> :
                <DemandChart data={data} appServices={appServices} userInfo={userInfo} />
            }
        </div>
    );
}

export const DemandList: React.FC<DemandChartProps> = ({ data, isShowOpen, appServices, userInfo, showFilterByVolunteer, onCancellationPerformed }) => {
    let demands = data.filter(isShowOpen ? filterOnlyOpen : filterOnlyFulfilled);
    const [showFamilyDetails, setShowFamilyDetails] = useState<GroupedFamily | undefined>();
    const [filterByVolunteer, setFilterByVolunteer] = useState<any | undefined>();
    const [filteredUsers, setFilteredUsers] = useState<any | undefined>();
    const [cancelInProgress, setCancelInProgress] = useState<boolean>(false);

    const overlayPanelRef = useRef<any>(null);

    const [selectedDateInfo, setSelectedDateInfo] = useState<DateInfo | undefined>();
    const [volunteerInfo, setVolunteerInfo] = useState<VolunteerInfo | undefined>();

    useEffect(() => {
        if (selectedDateInfo) {
            getVolunteerInfo(selectedDateInfo.volunteerId).then(info => {
                setVolunteerInfo(info);
            });
        }
    }, [selectedDateInfo]);


    if (showFilterByVolunteer && filterByVolunteer?.id) {
        demands = demands.filter(d => d.volunteerId === filterByVolunteer.id);
    }

    const groupedData = groupByCityAndFamily(demands);
    const sortedCities = Object.keys(groupedData).sort();

    if (showFamilyDetails) {
        return <FamilyDetailsComponent 
            analyticComponent="Management"
            appServices={appServices} demands={demands} 
            districtBaseFamilyId={showFamilyDetails.districtBaseFamilyId} 
            family={showFamilyDetails}
            includeContacts={true} onClose={() => {
                appServices.popNavigationStep();
                setShowFamilyDetails(undefined);

                // todo push nav state
            }} reloadOpenDemands={() => { }} detailsOnly={true} />;
    }

    const handleDateClick = (e: any, dateInfo: DateInfo) => {
        setVolunteerInfo(undefined);
        setSelectedDateInfo(dateInfo); // Store the date info to render in the OverlayPanel
        overlayPanelRef.current.toggle(e); // Open the OverlayPanel next to the clicked element
    };

    return (
        <div>
            <div>
                {!isShowOpen && showFilterByVolunteer && <AutoComplete
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
            <strong>{isShowOpen ? 'סה״כ חסרים:' : 'סה״כ משובצים:'}</strong><span className='m-2'>{demands.length}</span>
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
                                            }}> {family.familyLastName}{family.active ? "" : "-לא פעילה"}:</span>
                                        <div className='flex w-12 flex-wrap'>{
                                            isShowOpen ?
                                                family.dates.sort((d1, d2) => sortByDate(d1.date, d2.date)).map(d => dayjs(d.date).format("DD.MM")).join(" | ") :
                                                family.dates.sort((d1, d2) => sortByDate(d1.date, d2.date)).map((d, k) => (
                                                    <span key={k}>
                                                        <span className='clickable-span' onClick={(e) => handleDateClick(e, d)}>{dayjs(d.date).format("DD.MM")}</span>
                                                        <span className='m-1'>|</span>
                                                    </span>
                                                ))
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
                            <div><strong>שם</strong>: {volunteerInfo.firstName + " " + volunteerInfo.lastName}</div>
                            <PhoneNumber phone={volunteerInfo.phone} />
                            <Button label="מחק התנדבות" onClick={() => {
                                confirmPopup({
                                    message: 'האם למחוק התנדבות זו?',
                                    icon: 'pi pi-exclamation-triangle',
                                    accept: async () => {
                                        setCancelInProgress(true);
                                        updateFamilityDemand(selectedDateInfo.demandId, selectedDateInfo.mainBaseFamilyId, "cityId(unknown)", false, `מנהל ${userInfo.firstName} ביטל.ה`, selectedDateInfo.district, selectedDateInfo.volunteerId)
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
            </OverlayPanel>
        </div>
    );
};


export const DemandChart: React.FC<DemandChartProps> = ({ data }) => {
    const labels: string[] = []
    const fulfilledDemands: number[] = []
    const totalDemands: number[] = []
    const today = dayjs().startOf("day");
    data.forEach(demand => {
        const recordDate = dayjs(demand.date).startOf("day");
        const daysDiff = recordDate.diff(today, "days");
        const daysRound2Week = Math.floor(daysDiff / 7);
        const weekLabel = daysDiff >= 0 && daysDiff <= 6 ? "היום" : today.add(daysRound2Week * 7, "days").format("DD-MM");

        let index = labels.findIndex(l => l === weekLabel);
        if (index < 0) {
            labels.push(weekLabel);
            fulfilledDemands.push(0);
            totalDemands.push(0);
            index = labels.length - 1;
        }

        totalDemands[index]++;
        if (demand.status === "תפוס") {
            fulfilledDemands[index]++;
        }
    });
    const chartData = {
        labels: labels,
        datasets: [
            {
                label: 'סה״כ',
                data: totalDemands,
                fill: false,
                borderColor: '#42A5F5',
                tension: 0.1,
            },
            {
                label: 'שובצו',
                data: fulfilledDemands,
                fill: false,
                borderColor: '#66BB6A',
                tension: 0.1,
            },
        ],
    };

    const options = {
        responsive: true,
        plugins: {
            legend: {
                position: 'top',
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                ticks: {
                    stepSize: 1,  // Forces the y-axis to increment by 1
                    callback: function (value: number) {
                        return Number.isInteger(value) ? value : null;
                    }
                }
            }
        }
    };

    return <Chart type="line" data={chartData} options={options} />;
};


// Function to group the data by city and family, with multiple dates for each family
const groupByCityAndFamily = (familyDemands: FamilyDemand[]): GroupedData => {
    const groupedByCityAndFamily: GroupedData = {};

    familyDemands.forEach((family) => {
        const city = family.city.replaceAll("\"", "");
        const familyName = simplifyFamilyName(family.familyLastName);

        // Initialize city if not exists
        if (!groupedByCityAndFamily[city]) {
            groupedByCityAndFamily[city] = {};
        }

        // Initialize family under the city if not exists
        if (!groupedByCityAndFamily[city][family.districtBaseFamilyId]) {
            groupedByCityAndFamily[city][family.districtBaseFamilyId] = {
                dates: [],
                familyLastName: familyName,
                districtBaseFamilyId: family.districtBaseFamilyId,
                city: family.city,
                district: family.district,
                active: family.isFamilyActive,
            };
        }

        // Add the formatted date to the family's array under the city
        groupedByCityAndFamily[city][family.districtBaseFamilyId].dates.push({
            district: family.district,
            demandId: family.id,
            districtBaseFamilyId: family.districtBaseFamilyId,
            mainBaseFamilyId: family.mainBaseFamilyId,
            date: family.date,
            volunteerId: family.volunteerId,
        });
    });

    return groupedByCityAndFamily;
};

function sortFamilies(familiesMap: { [districtBaseFamilyId: string]: GroupedFamily }) {
    return Object.keys(familiesMap)
        .map(districtBaseFamilyId => familiesMap[districtBaseFamilyId])
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