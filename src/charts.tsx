import React, { useEffect, useRef, useState } from 'react';
import { Chart } from 'primereact/chart';
import { Calendar } from 'primereact/calendar';
import { MultiSelect } from 'primereact/multiselect';
import dayjs from 'dayjs';
import { ShowToast, StatsData, UserInfo } from './types';
import { getDemandStats } from './api';

import { InProgress } from './common-ui';
import { SelectButton } from 'primereact/selectbutton';
import OneLine from './one-line';
import { getNiceDate, getNiceDateTime } from './utils';
import { Button } from 'primereact/button';
import { setSelectionRange } from '@testing-library/user-event/dist/utils';

interface DemandChartProps {
    data: StatsData;
}

const Modes = {
    Details: 1,
    Chart: 2,
    array: [
        { name: 'חסרים', value: 1 },
        { name: 'גרפים', value: 2 },
    ]
}

interface StatsProps {
    userInfo: UserInfo,
    showToast: ShowToast;

}
const empty = {
    totalDemands: [],
    fulfilledDemands: [],
    labels: [],
    openDemands: [],
}

function simplifyFamilyName(name: string): string {
    const match = name.match(/משפחת\s(.+?)\s-/);
    if (match) {
        return match[1]; // Extracted family name
    }
    return name;
}

export function Stats({ userInfo, showToast }: StatsProps) {
    const [loading, setLoading] = useState<boolean>(false);
    const [data, setData] = useState<StatsData>(empty);
    const [dateRange, setDateRange] = useState<[Date, Date | null] | null>(null);
    const [selectedDistricts, setSelectedDistricts] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const calendar = useRef<Calendar>(null);
    const [mode, setMode] = useState(Modes.Details);

    useEffect(() => {
        if (userInfo?.isAdmin && dateRange && selectedDistricts.length > 0) {
            setLoading(true);
            getDemandStats(dateRange, selectedDistricts).then(setData).finally(() => setLoading(false));
        } else {
            setData(empty);
        }
    }, [dateRange, selectedDistricts, userInfo]);

    useEffect(() => {
        if (userInfo?.isAdmin && userInfo.districts?.length == 1) {
            setSelectedDistricts([userInfo.districts[0].id]);
        }
    }, [userInfo]);

    const handleDateChange = (e: any) => {
        if (!e.value || e.value.length !== 2) return;

        const [start, end] = e.value;

        const startOfWeek = dayjs(start).startOf('week').toDate();
        const endOfWeek = end ? dayjs(end).endOf('week').toDate() : null;
        setDateRange([startOfWeek, endOfWeek]);
        if (endOfWeek) {
            calendar.current?.hide();
        }
    };

    const handlePrepareMessageToSend = () => {
        // Initialize an object to group families by city and family name
        const groupedByCityAndFamily: any = {};

        // Group families by city and family name
        data.openDemands.forEach((family) => {
            const city = family.city;
            const familyName = simplifyFamilyName(family.familyLastName);

            const dateFormatted = dayjs(family.date).format("DD.MM");

            // If the city doesn't exist in the object, initialize it
            if (!groupedByCityAndFamily[city]) {
                groupedByCityAndFamily[city] = {};
            }

            // If the family doesn't exist under the city, initialize it
            if (!groupedByCityAndFamily[city][familyName]) {
                groupedByCityAndFamily[city][familyName] = [];
            }

            // Add the formatted date to the family's array under the city
            groupedByCityAndFamily[city][familyName].push(dateFormatted);
        });

        // Sort cities alphabetically
        const sortedCities = Object.keys(groupedByCityAndFamily).sort();


        let message = `היי קהילת נולדת לנצח💜

מי יכול.ה לסייע בבישול בחודש הקרוב 🙏


`;
        sortedCities.forEach((city) => {
            message += `*${city}*\n`;

            // Sort families alphabetically within each city
            const sortedFamilies = Object.keys(groupedByCityAndFamily[city]).sort();

            sortedFamilies.forEach((familyName) => {
                const dates = groupedByCityAndFamily[city][familyName].join(', ');
                message += `${familyName} - ${dates}\n`;
            });

            message += '\n'; // Add an extra newline after each city's group
        });


        message += `ניתן להשתבץ בלינק ב🤖
מסתבכים? אני פה כדי לעזור`;
        navigator.clipboard.writeText(message)
        showToast("success", "הודעה הוכנה והועתקה - הדבקו היכן שתרצו", "");
    }

    const handleDistrictChange = (e: any) => {
        setSelectedDistricts(e.value);
    };

    return (
        <div>
            <div className='flex flex-row  justify-content-center align-items-center'>
                <span className='ml-2'>תחום תאריכים</span>
                <Calendar
                    className="range-calender"
                    ref={calendar}
                    value={dateRange}
                    onChange={handleDateChange}
                    selectionMode="range"
                    placeholder="בחר שבוע או מס׳ שבועות"
                    readOnlyInput

                    locale="he"
                />
                <Button label="חודש קדימה" unstyled icon="pi pi-calendar" className="icon-btn icon-btn-withLabel text-xs"
                    onClick={() => {
                        const start = dayjs()
                        const end = start.add(1, "month")
                        setDateRange([start.toDate(), end.toDate()]);
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
                {mode == Modes.Details && <Button disabled={data.openDemands.length == 0} className="btn-on-the-right" label="הכן הודעה" onClick={handlePrepareMessageToSend} />}
            </div>

            {error && <small style={{ color: 'red' }}>{error}</small>}

            {mode == Modes.Details ?
                <DemandList data={data} /> :
                <DemandChart data={data} />
            }
        </div>
    );
}

export const DemandList: React.FC<DemandChartProps> = ({ data }) => {
    return <div>
        {data.openDemands.map((family, i) => (<OneLine
            key={i}
            title={family.familyLastName}
            body={`עיר: ${family.city}`}
            unread={false}
            onRead={() => { }}
            footer={getNiceDate(family.date)}
            //     console.log("family click", family.familyLastName)
            //     setSelectedFamily(family)
            // }}
            hideIcon={true}
        />))
        }
    </div>
}


export const DemandChart: React.FC<DemandChartProps> = ({ data }) => {
    const chartData = {
        labels: data.labels,
        datasets: [
            {
                label: 'סה״כ ביקוש',
                data: data.totalDemands,
                fill: false,
                borderColor: '#42A5F5',
                tension: 0.1,
            },
            {
                label: 'ביקוש שקיבל מענה',
                data: data.fulfilledDemands,
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

